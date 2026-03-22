'use client'

import { useState, useRef, useEffect } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  steps?: Array<{ type: string; content: string }>
}

const EXAMPLE_QUERIES = [
  'What is 45 × 23?',
  'What is the square root of 144?',
  'A train travels at 80 km/h for 2.5 hours. How far does it go?',
  'Solve: 2x² + 5x - 12 = 0',
  'What is 15% of 340?',
  'Find the area of a circle with radius 7',
  'If I invest $5000 at 8% compound interest for 3 years, what do I get?',
  'What is log₂(256)?',
]

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 16px', alignItems: 'center' }}>
      <span style={{ fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', marginRight: 8 }}>
        agent computing
      </span>
      {[0, 1, 2].map(i => (
        <span key={i} className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-calc)', display: 'inline-block', opacity: 0.2 }} />
      ))}
    </div>
  )
}

function StepTrace({ steps }: { steps: Array<{ type: string; content: string }> }) {
  const [open, setOpen] = useState(false)
  const toolSteps = steps.filter(s => s.type !== 'answer')
  if (toolSteps.length === 0) return null

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent',
          border: 'none',
          color: 'var(--text-muted)',
          fontSize: '0.68rem',
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          padding: 0,
          letterSpacing: '0.05em'
        }}
      >
        <span style={{ 
          transform: open ? 'rotate(90deg)' : 'rotate(0deg)', 
          transition: 'transform 0.2s',
          display: 'inline-block' 
        }}>▶</span>
        AGENT TRACE ({toolSteps.length} steps)
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {toolSteps.map((step, i) => (
            <div key={i} className="step-trace" style={{ display: 'flex', gap: 8 }}>
              <span style={{ 
                color: step.type === 'thought' ? 'var(--accent-calc)' : '#f59e0b',
                minWidth: 80
              }}>
                {step.type === 'thought' ? '🤔 THINK' : '👁 OBSERVE'}
              </span>
              <span>{step.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatResponse(text: string) {
  // Simple markdown-ish formatting
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br/>')
}

export default function CalculatorTab() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const send = async (query?: string) => {
    const q = query || input.trim()
    if (!q || loading) return

    const userMsg: Message = { role: 'user', content: q }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages })
      })
      const data = await res.json()

      if (data.error) {
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${data.error}` }])
      } else {
        setMessages(prev => [...prev, { 
          role: 'assistant', 
          content: data.answer,
          steps: data.steps
        }])
      }
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Network error. Please check your connection.' }])
    } finally {
      setLoading(false)
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      send()
    }
  }

  return (
    <div style={{ display: 'flex', gap: 24, height: 'calc(100vh - 73px)', padding: '24px 0' }}>
      {/* Sidebar */}
      <div style={{ 
        width: 260, 
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 16
      }}>
        {/* Info card */}
        <div style={{ 
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16
        }}>
          <div style={{ 
            color: 'var(--accent-calc)', 
            fontFamily: "'Space Mono', monospace",
            fontSize: '0.7rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            marginBottom: 12
          }}>
            ⟨∑⟩ CALCULATOR AGENT
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            AI agent with access to a math engine. Solves word problems, equations, and arithmetic using tool-use reasoning.
          </div>
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
            {['Basic arithmetic', 'Algebra & equations', 'Geometry problems', 'Word problems', 'Logarithms & trig'].map(cap => (
              <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                <span style={{ color: 'var(--accent-calc)' }}>✓</span> {cap}
              </div>
            ))}
          </div>
        </div>

        {/* Example queries */}
        <div style={{ 
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 16,
          flex: 1,
          overflow: 'auto'
        }}>
          <div style={{ 
            color: 'var(--text-muted)',
            fontFamily: "'Space Mono', monospace",
            fontSize: '0.65rem',
            fontWeight: 700,
            letterSpacing: '0.1em',
            marginBottom: 10
          }}>
            EXAMPLE QUERIES
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {EXAMPLE_QUERIES.map((q, i) => (
              <button
                key={i}
                onClick={() => send(q)}
                disabled={loading}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '8px 10px',
                  color: 'var(--text-muted)',
                  fontSize: '0.72rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.15s',
                  fontFamily: "'Syne', sans-serif"
                }}
                onMouseEnter={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'rgba(0,255,135,0.4)'
                  el.style.color = '#fff'
                  el.style.background = 'rgba(0,255,135,0.04)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget
                  el.style.borderColor = 'var(--border)'
                  el.style.color = 'var(--text-muted)'
                  el.style.background = 'transparent'
                }}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 0 }}>
        {/* Messages */}
        <div style={{ 
          flex: 1, 
          overflow: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          padding: '4px 0 16px 0'
        }}>
          {messages.length === 0 && (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: 16,
              color: 'var(--text-muted)'
            }}>
              <div style={{ fontSize: '3rem', opacity: 0.3 }}>⟨∑⟩</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.8rem', letterSpacing: '0.1em' }}>
                ASK A MATH QUESTION
              </div>
              <div style={{ fontSize: '0.75rem', maxWidth: 300, textAlign: 'center', lineHeight: 1.6 }}>
                Try a word problem, equation, or arithmetic expression. The agent will decide when to use the calculator tool.
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 10,
              alignItems: 'flex-start'
            }}>
              {msg.role === 'assistant' && (
                <div style={{ 
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(0,255,135,0.15)',
                  border: '1px solid rgba(0,255,135,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', flexShrink: 0, marginTop: 4
                }}>⟨∑⟩</div>
              )}
              <div style={{ maxWidth: '72%' }}>
                {msg.role === 'assistant' && msg.steps && (
                  <StepTrace steps={msg.steps} />
                )}
                <div 
                  className={msg.role === 'user' ? 'msg-user' : 'msg-calc'}
                  style={{ padding: '12px 16px' }}
                >
                  {msg.role === 'assistant' ? (
                    <div 
                      className="prose-response"
                      style={{ fontSize: '0.85rem', lineHeight: 1.7 }}
                      dangerouslySetInnerHTML={{ __html: formatResponse(msg.content) }}
                    />
                  ) : (
                    <div style={{ fontSize: '0.85rem', lineHeight: 1.5 }}>{msg.content}</div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ 
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(0,255,135,0.15)',
                border: '1px solid rgba(0,255,135,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', flexShrink: 0
              }}>⟨∑⟩</div>
              <div className="msg-calc">
                <TypingIndicator />
              </div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ 
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 12,
          display: 'flex',
          gap: 10,
          alignItems: 'flex-end'
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask a math question or describe a word problem... (Enter to send)"
            className="input-calc"
            style={{
              flex: 1,
              background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8,
              padding: '10px 14px',
              color: 'var(--text)',
              fontSize: '0.85rem',
              fontFamily: "'Syne', sans-serif",
              resize: 'none',
              minHeight: 44,
              maxHeight: 120,
              lineHeight: 1.5
            }}
            rows={1}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim()}
            className="btn-calc"
            style={{
              padding: '10px 20px',
              borderRadius: 8,
              border: 'none',
              cursor: 'pointer',
              fontSize: '0.78rem',
              letterSpacing: '0.06em',
              height: 44,
              whiteSpace: 'nowrap'
            }}
          >
            {loading ? '...' : 'SOLVE →'}
          </button>
        </div>
      </div>
    </div>
  )
}
