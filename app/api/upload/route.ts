import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

import { docStore } from '@/lib/docStore'

// ── helpers ──────────────────────────────────────────────────────────────────

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // strip non-printable / garbled unicode (keeps latin, greek, math block)
    .replace(/[^\x20-\x7E\n\t\u00C0-\u024F\u0370-\u03FF\u2200-\u22FF]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function makeChunks(
  text: string,
  chunkSize = 450,
  overlap = 80
): string[] {
  if (!text || text.trim().length < 10) return []
  const paras = text.split(/\n\n+/)
  const chunks: string[] = []
  let cur = ''

  for (const para of paras) {
    const t = para.trim()
    if (!t) continue
    if (cur.length + t.length + 2 > chunkSize && cur.length > 0) {
      chunks.push(cur.trim())
      cur = cur.slice(-overlap) + '\n\n' + t
    } else {
      cur = cur ? cur + '\n\n' + t : t
    }
  }
  if (cur.trim().length > 10) chunks.push(cur.trim())

  // fallback: fixed-size if too few chunks
  if (chunks.length < 3 && text.length > 50) {
    const fb: string[] = []
    let s = 0
    while (s < text.length) {
      const piece = text.slice(s, s + chunkSize).trim()
      if (piece.length > 10) fb.push(piece)
      s += chunkSize - overlap
    }
    return fb
  }
  return chunks.filter(c => c.length > 10)
}

// Convert one PDF page buffer → base64 PNG using pdfjs-dist + canvas
async function pdfPageToBase64(
  pdfData: Uint8Array,
  pageNum: number
): Promise<string | null> {
  try {
    // Dynamic imports to avoid SSR issues
    const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.js')
    const { createCanvas } = await import('canvas')

    // disable worker in Node
    // @ts-expect-error — pdfjs types vary
    pdfjsLib.GlobalWorkerOptions.workerSrc = ''

    const doc = await pdfjsLib.getDocument({ data: pdfData, disableWorker: true }).promise
    const page = await doc.getPage(pageNum)

    const scale = 1.5
    const viewport = page.getViewport({ scale })
    const canvas = createCanvas(viewport.width, viewport.height)
    const context = canvas.getContext('2d')

    await page.render({
      // @ts-expect-error — canvas context is compatible
      canvasContext: context,
      viewport
    }).promise

    return canvas.toBuffer('image/png').toString('base64')
  } catch (e) {
    console.warn(`Page ${pageNum} render failed:`, e)
    return null
  }
}

// Use Groq vision to transcribe one slide/page image
async function transcribePageWithVision(
  base64Png: string,
  pageNum: number,
  filename: string
): Promise<string> {
  try {
    const resp = await groq.chat.completions.create({
      model: 'meta-llama/llama-4-scout-17b-16e-instruct',
      max_tokens: 600,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: `data:image/png;base64,${base64Png}`
              }
            },
            {
              type: 'text',
              text: `This is page ${pageNum} from "${filename}". 
Extract ALL text visible on this slide/page exactly as written.
Also describe any diagrams, figures, charts, tables, or images present — explain what they show, labels, axes, arrows, relationships.
Format: First the verbatim text, then a section "VISUALS:" describing any diagrams/figures.
Be thorough — capture every word and every visual element.`
            }
          ]
        }
      ]
    })
    return resp.choices[0].message.content || ''
  } catch (e) {
    console.warn(`Vision transcription failed for page ${pageNum}:`, e)
    return ''
  }
}

// ── route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const filename = file.name
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // ── Plain text files ──────────────────────────────────────────────────
    if (filename.endsWith('.txt') || filename.endsWith('.md')) {
      const text = cleanText(buffer.toString('utf-8'))
      const raw = makeChunks(text, 450, 80)
      docStore.chunks = raw.map((t, i) => ({ text: t, page: 1, index: i }))
      docStore.filename = filename
      docStore.hasImages = false
      docStore.fullText = text
      docStore.pageDescriptions = [{ page: 1, text }]

      return NextResponse.json({
        success: true, filename,
        chunks: docStore.chunks.length,
        pages: 1, hasImages: false,
        preview: text.slice(0, 300) + '...',
        wordCount: text.split(/\s+/).filter(Boolean).length,
        method: 'text'
      })
    }

    if (!filename.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, TXT, or MD.' }, { status: 400 })
    }

    // ── PDF: step 1 — try text extraction first ───────────────────────────
    let pdfText = ''
    let pageCount = 0

    try {
      const pdfParse = (await import('pdf-parse')).default
      const parsed = await pdfParse(buffer)
      pdfText = cleanText(parsed.text)
      pageCount = parsed.numpages
    } catch (e) {
      console.warn('pdf-parse failed:', e)
    }

    const hasUsableText = pdfText.trim().length > pageCount * 40 // at least 40 chars per page avg

    // ── PDF: step 2 — vision transcription if text is sparse ─────────────
    const pageDescriptions: Array<{ page: number; text: string }> = []
    let usedVision = false

    if (!hasUsableText && pageCount > 0) {
      console.log(`Sparse PDF (${pdfText.length} chars / ${pageCount} pages). Using vision...`)
      usedVision = true

      const pdfUint8 = new Uint8Array(buffer)

      // Process up to 20 pages (Vercel timeout safety)
      const maxPages = Math.min(pageCount, 20)

      for (let p = 1; p <= maxPages; p++) {
        const b64 = await pdfPageToBase64(pdfUint8, p)
        if (!b64) continue
        const desc = await transcribePageWithVision(b64, p, filename)
        if (desc.trim()) {
          pageDescriptions.push({ page: p, text: desc.trim() })
        }
      }
    } else if (hasUsableText) {
      // Text is fine — split by approximate page
      const linesPerPage = Math.ceil(pdfText.split('\n').length / Math.max(pageCount, 1))
      const lines = pdfText.split('\n')
      for (let p = 0; p < Math.max(pageCount, 1); p++) {
        const start = p * linesPerPage
        const pageText = lines.slice(start, start + linesPerPage).join('\n').trim()
        if (pageText.length > 10) {
          pageDescriptions.push({ page: p + 1, text: pageText })
        }
      }
    }

    // ── Build chunks from page descriptions ───────────────────────────────
    const storedChunks: Array<{ text: string; page: number; index: number }> = []
    let idx = 0
    const allText: string[] = []

    for (const pd of pageDescriptions) {
      allText.push(`[Page ${pd.page}]\n${pd.text}`)
      const pageChunks = makeChunks(pd.text, 450, 60)

      for (const chunk of pageChunks) {
        storedChunks.push({ text: chunk, page: pd.page, index: idx++ })
      }

      // If a page produced no chunks but has text, add it as-is
      if (pageChunks.length === 0 && pd.text.trim().length > 10) {
        storedChunks.push({ text: pd.text.trim(), page: pd.page, index: idx++ })
      }
    }

    const fullText = allText.join('\n\n')

    // Fallback: if still nothing, just dump raw pdfText into one chunk
    if (storedChunks.length === 0 && pdfText.trim().length > 0) {
      const raw = makeChunks(pdfText, 450, 80)
      raw.forEach((t, i) => storedChunks.push({ text: t, page: 1, index: i }))
    }

    const hasImages = usedVision ||
      /figure|fig\.|diagram|chart|table|graph|illustration/i.test(fullText)

    docStore.chunks = storedChunks
    docStore.filename = filename
    docStore.hasImages = hasImages
    docStore.fullText = fullText || pdfText
    docStore.pageDescriptions = pageDescriptions

    return NextResponse.json({
      success: true,
      filename,
      chunks: storedChunks.length,
      pages: pageCount,
      hasImages,
      preview: (fullText || pdfText).slice(0, 300) + '...',
      wordCount: (fullText || pdfText).split(/\s+/).filter(Boolean).length,
      method: usedVision ? 'vision' : 'text',
      message: usedVision
        ? `Used vision AI to read ${pageDescriptions.length} pages (slide deck detected)`
        : `Extracted text from ${pageDescriptions.length} pages`
    })

  } catch (error: unknown) {
    console.error('Upload error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 })
  }
}
