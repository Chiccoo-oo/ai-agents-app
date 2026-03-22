import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory vector store (resets on server restart)
export const docStore: {
  chunks: Array<{ text: string; page: number; index: number }>
  filename: string
  hasImages: boolean
  fullText: string
  imageData: Array<{ page: number; description: string }>
} = {
  chunks: [],
  filename: '',
  hasImages: false,
  fullText: '',
  imageData: []
}

function cleanPdfText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    // Remove garbage/non-printable unicode that pdf-parse emits for math symbols/arrows
    .replace(/[^\x20-\x7E\n\t\u00C0-\u024F\u0370-\u03FF\u2200-\u22FF]/g, ' ')
    // Collapse multiple spaces on same line
    .replace(/[ \t]{2,}/g, ' ')
    // Collapse 3+ blank lines to 2
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function splitIntoChunks(text: string, chunkSize = 500, overlap = 80): string[] {
  // Try paragraph-aware splitting first
  const paragraphs = text.split(/\n\n+/)
  const chunks: string[] = []
  let current = ''

  for (const para of paragraphs) {
    const trimmed = para.trim()
    if (!trimmed || trimmed.length < 5) continue

    if (current.length + trimmed.length + 2 > chunkSize && current.length > 0) {
      chunks.push(current.trim())
      // Overlap: carry last ~overlap chars into next chunk
      current = current.slice(-overlap) + '\n\n' + trimmed
    } else {
      current = current ? current + '\n\n' + trimmed : trimmed
    }
  }
  if (current.trim().length > 20) chunks.push(current.trim())

  // If too few chunks (slide deck / sparse PDF), fall back to fixed-size
  if (chunks.length < 4 && text.length > 100) {
    const fallback: string[] = []
    let start = 0
    while (start < text.length) {
      const end = Math.min(start + chunkSize, text.length)
      const chunk = text.slice(start, end).trim()
      if (chunk.length > 20) fallback.push(chunk)
      start += chunkSize - overlap
    }
    return fallback
  }

  return chunks.filter(c => c.length > 20)
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

    let fullText = ''
    let pageCount = 0
    let hasImages = false
    const pageTexts: Array<{ text: string; page: number }> = []

    if (filename.endsWith('.pdf')) {
      const pdfParse = (await import('pdf-parse')).default

      try {
        let currentPage = 0

        const pdfData = await pdfParse(buffer, {
          pagerender: async function (pageData: {
            getTextContent: () => Promise<{
              items: Array<{ str: string; hasEOL?: boolean }>
            }>
          }) {
            currentPage++
            const page = currentPage
            try {
              const textContent = await pageData.getTextContent()
              let pageText = ''
              for (const item of textContent.items) {
                pageText += item.str
                if ((item as { hasEOL?: boolean }).hasEOL) pageText += '\n'
                else pageText += ' '
              }
              const cleaned = cleanPdfText(pageText)
              if (cleaned.length > 10) {
                pageTexts.push({ text: cleaned, page })
              }
              return pageText
            } catch {
              return ''
            }
          }
        })

        fullText = pdfData.text
        pageCount = pdfData.numpages
        hasImages = /figure|fig\.|diagram|chart|table|graph|illustration/i.test(fullText)

      } catch (pdfErr) {
        console.error('PDF parse error:', pdfErr)
        return NextResponse.json({
          error: 'Failed to parse PDF. Make sure it is a text-based PDF (not scanned).'
        }, { status: 400 })
      }

    } else if (filename.endsWith('.txt') || filename.endsWith('.md')) {
      fullText = buffer.toString('utf-8')
      pageCount = 1
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, TXT, or MD.' }, { status: 400 })
    }

    const cleanedFull = cleanPdfText(fullText)

    if (!cleanedFull || cleanedFull.length < 30) {
      return NextResponse.json({
        error: 'Could not extract enough text. The PDF may be image-only/scanned. Convert it first at ilovepdf.com/ocr-pdf'
      }, { status: 400 })
    }

    // Build chunks with page-level awareness
    let storedChunks: Array<{ text: string; page: number; index: number }> = []

    if (pageTexts.length > 0) {
      // Chunk per page (great for slide decks)
      let idx = 0
      for (const { text, page } of pageTexts) {
        if (text.length < 15) continue
        // If a single page has lots of text, split it further
        const pageChunks = splitIntoChunks(text, 450, 60)
        for (const chunk of pageChunks) {
          storedChunks.push({ text: chunk, page, index: idx++ })
        }
      }
    }

    // Fallback: chunk the entire concatenated text
    if (storedChunks.length < 3) {
      const raw = splitIntoChunks(cleanedFull, 400, 80)
      storedChunks = raw.map((text, index) => ({
        text,
        page: Math.max(1, Math.floor((index / raw.length) * pageCount) + 1),
        index
      }))
    }

    docStore.chunks = storedChunks
    docStore.filename = filename
    docStore.hasImages = hasImages
    docStore.fullText = cleanedFull
    docStore.imageData = []

    return NextResponse.json({
      success: true,
      filename,
      chunks: storedChunks.length,
      pages: pageCount,
      hasImages,
      preview: cleanedFull.slice(0, 300) + '...',
      wordCount: cleanedFull.split(/\s+/).filter(Boolean).length
    })

  } catch (error: unknown) {
    console.error('Upload error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Upload failed: ${msg}` }, { status: 500 })
  }
}
