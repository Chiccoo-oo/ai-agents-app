import { NextRequest, NextResponse } from 'next/server'
import Groq from 'groq-sdk'
import { evaluate } from 'mathjs'

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY })

// Tool definitions following LangChain agent pattern
const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'calculator',
      description: 'Evaluate mathematical expressions, equations, and arithmetic. Input must be a valid math expression string. Supports: basic arithmetic (+,-,*,/), powers (^), sqrt(), sin(), cos(), log(), abs(), factorial(), and more. For word problems, extract the numeric expression first.',
      parameters: {
        type: 'object',
        properties: {
          expression: {
            type: 'string',
            description: "A valid mathematical expression to evaluate, e.g., '45 * 23', 'sqrt(144)', '345 + 678', '(12^2) / 4'"
          }
        },
        required: ['expression']
      }
    }
  }
]

const SYSTEM_PROMPT = `You are a math-focused AI agent with access to a calculator tool. 

Your workflow:
1. Understand the user's query (word problem, equation, or direct math)
2. Extract the mathematical operation needed
3. Use the calculator tool to compute — NEVER guess numeric answers
4. Explain your reasoning step-by-step
5. Present the final answer clearly

For word problems: identify the quantities, write the expression, then calculate.
For equations: solve step-by-step, use the calculator for each arithmetic step.
Always show your work. Format responses with clear steps.`

function runCalculator(expression: string): { result: string; error?: string } {
  try {
    const cleaned = expression
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/\^/g, '^')
      .trim()
    const result = evaluate(cleaned)
    return { result: String(result) }
  } catch (e) {
    return { result: 'Error', error: String(e) }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { messages } = await req.json()

    const agentSteps: Array<{ type: string; content: string }> = []

    // Build conversation for Groq
    const groqMessages: Groq.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...messages.map((m: { role: string; content: string }) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))
    ]

    // Agentic loop (max 5 iterations)
    let finalAnswer = ''
    for (let i = 0; i < 5; i++) {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        messages: groqMessages,
        tools: TOOLS,
        tool_choice: 'auto',
        max_tokens: 1024
      })

      const choice = response.choices[0]
      const msg = choice.message

      if (msg.tool_calls && msg.tool_calls.length > 0) {
        // Agent decided to use calculator
        const toolCall = msg.tool_calls[0]
        const args = JSON.parse(toolCall.function.arguments)
        const expression = args.expression

        agentSteps.push({ type: 'thought', content: `Using calculator: ${expression}` })

        const calcResult = runCalculator(expression)
        agentSteps.push({ type: 'observation', content: `Result: ${calcResult.result}${calcResult.error ? ` (Error: ${calcResult.error})` : ''}` })

        // Add tool call + result to conversation
        groqMessages.push({
          role: 'assistant',
          content: msg.content || '',
          tool_calls: msg.tool_calls
        })
        groqMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(calcResult)
        })

      } else {
        // Final answer from agent
        finalAnswer = msg.content || ''
        agentSteps.push({ type: 'answer', content: finalAnswer })
        break
      }
    }

    return NextResponse.json({ answer: finalAnswer, steps: agentSteps })

  } catch (error: unknown) {
    console.error('Calculator API error:', error)
    const msg = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({ error: `Agent error: ${msg}` }, { status: 500 })
  }
}
