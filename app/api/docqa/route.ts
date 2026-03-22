import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { docStore } from '@/lib/docStore'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by',
  'from','is','are','was','were','be','been','has','have','had','do','does',
  'did','will','would','could','should','may','might','shall','can','what',
  'how','when','where','who','which','that','this','these','those','it','its','not'
])

function score(query: string, chunks: typeof docStore.chunks, topK = 6) {
  const words = query.toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))

  return chunks
    .map(chunk => {
      const t = chunk.text.toLowerCase()
      let s = 0
      for (const w of words) {
        const m = t.match(new RegExp(`\\b${w}\\b`, 'g'))
        if (m) s += m.length * (1 + w.length / 10)
        if (t.includes(w)) s += 0.4
      }
      if (t.includes(query.toLowerCase())) s += 10
      if (/figure|diagram|chart|table|image|graph|visual/i.test(query) &&
          /figure|diagram|chart|table|image|graph|visual|visuals/i.test(t)) s += 3
      return { text: chunk.text, page: chunk.page, score: s }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)   // ALWAYS return topK — never filter by score
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (docStore.chunks.length === 0 && !docStore.fullText) {
      return NextResponse.json({
        answer: 'No document loaded. Please upload a PDF or text file first.',
        context: [], steps: []
      })
    }

    const query = messages[messages.length - 1]?.content || ''
    const steps: Array<{ type: string; content: string }> = []

    steps.push({ type: 'thought', content: `Searching "${docStore.filename}" (${docStore.chunks.length} chunks)` })

    // Retrieve top chunks
    const hits = score(query, docStore.chunks, 6)
    const allZero = hits.every(h => h.score === 0)

    steps.push({
      type: 'observation',
      content: allZero
        ? 'Keyword scores all zero — using full document as context (sparse/slide PDF)'
        : `Retrieved ${hits.length} sections from pages: ${[...new Set(hits.map(h => h.page))].join(', ')}`
    })

    // Build context string
    let context: string
    if (allZero || docStore.chunks.length < 5) {
      // Use entire fullText (capped at ~5000 chars so we stay within context)
      const cap = docStore.fullText.slice(0, 5000)
      context = `[Full document: ${docStore.filename}]\n\n${cap}${docStore.fullText.length > 5000 ? '\n\n[... document continues ...]' : ''}`
    } else {
      context = hits
        .map((h, i) => `[Section ${i + 1} | Page ${h.page}]\n${h.text}`)
        .join('\n\n---\n\n')
    }

    steps.push({ type: 'thought', content: 'Generating answer with LLaMA-3...' })

    // Build messages — replace last user msg with RAG-augmented version
    const history = messages.slice(-8).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    history[history.length - 1] = {
      role: 'user',
      content: `Question: ${query}

=== DOCUMENT CONTEXT (${docStore.filename}) ===
${context}
=== END CONTEXT ===

Answer the question using ONLY the context above.
- This document appears to be lecture slides / a presentation. Bullet points represent slide content — expand them into full explanations.
- If figures, diagrams, charts, or tables are described (e.g. under "VISUALS:"), explain what they show.
- Cite page numbers.
- If you cannot find the answer in the context, say exactly that.`
    }

    const resp = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a precise academic document Q&A assistant.
Rules:
• Answer strictly from the provided context — no outside knowledge.
• Lecture slides have terse bullets — expand them into full explanations.
• When "VISUALS:" sections describe diagrams/figures, explain what they illustrate.
• Use clear formatting: definitions, bullet lists, numbered steps where helpful.
• Always cite which page the information came from.
• If context is insufficient, say so explicitly.`
        },
        ...history
      ],
      max_tokens: 1400,
      temperature: 0.15
    })

    const answer = resp.choices[0].message.content || 'No answer generated.'
    steps.push({ type: 'answer', content: answer })

    return NextResponse.json({
      answer,
      context: hits.map(h => ({
        text: h.text.slice(0, 250) + (h.text.length > 250 ? '...' : ''),
        page: h.page,
        score: h.score
      })),
      steps
    })

  } catch (err: unknown) {
    console.error('DocQA error:', err)
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: `QA error: ${msg}` }, { status: 500 })
  }
}
