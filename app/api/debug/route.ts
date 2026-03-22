import { NextResponse } from 'next/server'
import { docStore } from '@/lib/docStore'

export async function GET() {
  return NextResponse.json({
    filename: docStore.filename,
    totalChunks: docStore.chunks.length,
    fullTextLength: docStore.fullText.length,
    fullTextPreview: docStore.fullText.slice(0, 1000),
    chunks: docStore.chunks.slice(0, 10).map(c => ({
      page: c.page,
      index: c.index,
      length: c.text.length,
      preview: c.text.slice(0, 200)
    })),
    pageDescriptions: docStore.pageDescriptions.slice(0, 5).map(p => ({
      page: p.page,
      length: p.text.length,
      preview: p.text.slice(0, 300)
    }))
  })
}
