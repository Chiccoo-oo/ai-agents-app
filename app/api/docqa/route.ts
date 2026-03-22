import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { docStore } from '../upload/route'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
  'of', 'with', 'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been',
  'has', 'have', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'shall', 'can', 'what', 'how', 'when', 'where',
  'who', 'which', 'that', 'this', 'these', 'those', 'it', 'its', 'not'
])

function retrieveRelevantChunks(
  query: string,
  chunks: typeof docStore.chunks,
  topK = 6
): Array<{ text: string; page: number; score: number }> {
  if (chunks.length === 0) return []

  const queryWords = query
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w))

  const scored = chunks.map(chunk => {
    const text = chunk.text.toLowerCase()
    let score = 0

    for (const word of queryWords) {
      // Exact word match
      const regex = new RegExp(`\\b${word}\\b`, 'g')
      const matches = text.match(regex)
      if (matches) score += matches.length * (1 + word.length / 10)

      // Substring match (catches partial / garbled text)
      if (text.includes(word)) score += 0.5
    }

    // Exact phrase bonus
    if (text.includes(query.toLowerCase())) score += 8

    // Boost diagram/figure sections when asked about visuals
    if (/figure|diagram|chart|table|image|graph|visual/i.test(query) &&
        /figure|diagram|chart|table|image|graph|visual/i.test(text)) {
      score += 3
    }

    return { text: chunk.text, page: chunk.page, score }
  })

  const sorted = scored.sort((a, b) => b.score - a.score)

  // ALWAYS return top-K — even if all scores are 0 (sparse/slide PDFs)
  return sorted.slice(0, topK)
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    if (docStore.chunks.length === 0) {
      return NextResponse.json({
        answer: 'No document loaded. Please upload a PDF or text file first.',
        context: [],
        steps: []
      })
    }

    const latestQuery = messages[messages.length - 1]?.content || ''
    const agentSteps: Array<{ type: string; content: string }> = []

    agentSteps.push({
      type: 'thought',
      content: `Searching "${docStore.filename}" (${docStore.chunks.length} chunks) for: "${latestQuery}"`
    })

    // Retrieve top chunks — always returns results now
    const relevantChunks = retrieveRelevantChunks(latestQuery, docStore.chunks, 6)

    agentSteps.push({
      type: 'observation',
      content: `Retrieved ${relevantChunks.length} sections from pages: ${[...new Set(relevantChunks.map(c => c.page))].join(', ')}`
    })

    // Build context — if all scores are 0 (very sparse PDF), include more of the document
    const allZero = relevantChunks.every(c => c.score === 0)
    let contextString: string

    if (allZero && docStore.fullText) {
      // Use the whole document text (up to ~3000 chars) as fallback context
      agentSteps.push({
        type: 'thought',
        content: 'Keyword match failed (slide-deck PDF). Using full document text as context.'
      })
      contextString = `[Full Document: ${docStore.filename}]\n${docStore.fullText.slice(0, 4000)}`
    } else {
      contextString = relevantChunks
        .map((c, i) => `[Section ${i + 1} | Page ${c.page}]\n${c.text}`)
        .join('\n\n---\n\n')
    }

    // Build conversation with the augmented last message
    const conversationHistory = messages.slice(-8).map((m: { role: string; content: string }) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))

    conversationHistory[conversationHistory.length - 1] = {
      role: 'user',
      content: `Question: ${latestQuery}

--- RETRIEVED DOCUMENT CONTEXT ---
${contextString}
--- END CONTEXT ---

Based ONLY on the document context above, answer the question.
- If the context is from lecture slides / presentation notes, interpret bullet points and short phrases as slide content.
- If figures, diagrams, or tables are referenced, describe what they represent based on surrounding text.
- Cite page numbers where relevant.
- If you genuinely cannot find the answer in the context, say so clearly.`
    }

    agentSteps.push({ type: 'thought', content: 'Generating answer with Groq LLaMA-3...' })

    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        {
          role: 'system',
          content: `You are a precise document Q&A assistant for academic/lecture documents. 

Key behaviours:
- Answer strictly from the provided context. Do not use outside knowledge.
- Lecture slides often have terse bullet points — expand them into full explanations.
- When context mentions figures/diagrams/tables, describe their likely content based on surrounding text.
- Format answers with clear structure: definitions, bullet points, numbered steps as appropriate.
- Cite page numbers in your answer.
- If the document is sparse (few words per page), do your best with what's there and acknowledge any gaps.`
        },
        ...conversationHistory
      ],
      max_tokens: 1200,
      temperature: 0.2
    })

    const answer = response.choices[0].message.content || 'No answer generated.'
    agentSteps.push({ type: 'answer', content: answer })

    return NextResponse.json({
      answer,
      context: relevantChunks.map(c => ({
        text: c.text.slice(0, 250) + (c.text.length > 250 ? '...' : ''),
        page: c.page,
        score: c.score
      })),
      steps: agentSteps
    })

  } catch (error: unknown) {
    console.error('DocQA error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `QA error: ${msg}` }, { status: 500 })
  }
}
