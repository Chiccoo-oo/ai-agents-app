import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { docStore } from '@/lib/docStore'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

function cleanText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[^\x20-\x7E\n\t]/g, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function makeChunks(text: string, chunkSize = 450, overlap = 80): string[] {
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

    // ── Plain text / markdown ─────────────────────────────────────────────
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
        chunks: docStore.chunks.length, pages: 1,
        hasImages: false, method: 'text',
        preview: text.slice(0, 300) + '...',
        wordCount: text.split(/\s+/).filter(Boolean).length
      })
    }

    if (!filename.endsWith('.pdf')) {
      return NextResponse.json({ error: 'Unsupported file. Use PDF, TXT, or MD.' }, { status: 400 })
    }

    // ── PDF: extract text with pdf-parse ─────────────────────────────────
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

    const avgCharsPerPage = pageCount > 0 ? pdfText.length / pageCount : 0
    const hasUsableText = pdfText.trim().length > 100 && avgCharsPerPage > 30

    // ── If text is sparse: send PDF as base64 to Groq vision ─────────────
    let usedVision = false
    const pageDescriptions: Array<{ page: number; text: string }> = []

    if (!hasUsableText) {
      usedVision = true
      // Convert PDF buffer to base64 and send whole file to vision model
      // Groq vision accepts image/png and image/jpeg — send first few pages as base64
      // We'll use a simpler approach: send the raw PDF bytes as base64 document
      try {
        const base64Pdf = buffer.toString('base64')
        const resp = await groq.chat.completions.create({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          max_tokens: 4000,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `This is a PDF document called "${filename}". 
Please extract and transcribe ALL content from every page:
1. All text exactly as written (headings, bullets, paragraphs, labels)
2. For every diagram, figure, chart, or table: describe it in detail — what it shows, labels, axes, relationships, values
3. Format as: [Page N] followed by the content of that page
Be exhaustive — capture everything visible.`
                },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:application/pdf;base64,${base64Pdf}`
                  }
                }
              ]
            }
          ]
        })
        const visionText = resp.choices[0].message.content || ''
        if (visionText.trim().length > 50) {
          // Parse page sections from vision output
          const pageMatches = visionText.split(/\[Page\s+(\d+)\]/i)
          if (pageMatches.length > 1) {
            for (let i = 1; i < pageMatches.length; i += 2) {
              const pageNum = parseInt(pageMatches[i])
              const pageContent = pageMatches[i + 1]?.trim() || ''
              if (pageContent) pageDescriptions.push({ page: pageNum, text: pageContent })
            }
          } else {
            pageDescriptions.push({ page: 1, text: visionText })
          }
        }
      } catch (visionErr) {
        console.warn('Vision failed:', visionErr)
        // Fall back to whatever text we have
        usedVision = false
      }
    }

    // ── Build chunks ──────────────────────────────────────────────────────
    let storedChunks: Array<{ text: string; page: number; index: number }> = []
    let idx = 0
    const allTextParts: string[] = []

    if (pageDescriptions.length > 0) {
      for (const pd of pageDescriptions) {
        allTextParts.push(`[Page ${pd.page}]\n${pd.text}`)
        const pageChunks = makeChunks(pd.text, 450, 60)
        if (pageChunks.length === 0 && pd.text.trim().length > 10) {
          storedChunks.push({ text: pd.text.trim(), page: pd.page, index: idx++ })
        } else {
          for (const chunk of pageChunks) {
            storedChunks.push({ text: chunk, page: pd.page, index: idx++ })
          }
        }
      }
    } else {
      // Use extracted text, split by page estimate
      const linesAll = pdfText.split('\n')
      const linesPerPage = Math.ceil(linesAll.length / Math.max(pageCount, 1))
      for (let p = 0; p < Math.max(pageCount, 1); p++) {
        const pageText = linesAll.slice(p * linesPerPage, (p + 1) * linesPerPage).join('\n').trim()
        if (pageText.length > 10) {
          allTextParts.push(`[Page ${p + 1}]\n${pageText}`)
          const pageChunks = makeChunks(pageText, 450, 60)
          for (const chunk of pageChunks) {
            storedChunks.push({ text: chunk, page: p + 1, index: idx++ })
          }
        }
      }
    }

    // Last resort fallback
    if (storedChunks.length === 0 && pdfText.trim().length > 0) {
      makeChunks(pdfText, 450, 80).forEach((t, i) =>
        storedChunks.push({ text: t, page: 1, index: i })
      )
    }

    const fullText = allTextParts.join('\n\n') || pdfText
    const hasImages = usedVision || /figure|fig\.|diagram|chart|table|graph/i.test(fullText)

    docStore.chunks = storedChunks
    docStore.filename = filename
    docStore.hasImages = hasImages
    docStore.fullText = fullText
    docStore.pageDescriptions = pageDescriptions

    return NextResponse.json({
      success: true, filename,
      chunks: storedChunks.length,
      pages: pageCount,
      hasImages,
      method: usedVision ? 'vision' : 'text',
      message: usedVision
        ? `Vision AI read ${pageDescriptions.length} pages`
        : `Text extracted from ${pageCount} pages`,
      preview: fullText.slice(0, 300) + '...',
      wordCount: fullText.split(/\s+/).filter(Boolean).length
    })

  } catch (error: unknown) {
    console.error('Upload error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 })
  }
}
