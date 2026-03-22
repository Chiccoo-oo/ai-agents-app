'use client'

import { useState, useRef, useEffect, useCallback } from 'react'

interface Message {
  role: 'user' | 'assistant'
  content: string
  steps?: Array<{ type: string; content: string }>
  context?: Array<{ text: string; page: number; score: number }>
}

interface DocInfo {
  filename: string
  chunks: number
  pages: number
  hasImages: boolean
  preview: string
  wordCount: number
}

const EXAMPLE_QUERIES = [
  'What is the main topic of this document?',
  'Summarize the key points',
  'Explain the figures and diagrams mentioned',
  'What are the conclusions?',
  'List all technical terms defined',
  'What methodology is described?',
]

function TypingIndicator() {
  return (
    <div style={{ display: 'flex', gap: 4, padding: '12px 16px', alignItems: 'center' }}>
      <span style={{ fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)', marginRight: 8 }}>
        retrieving context
      </span>
      {[0, 1, 2].map(i => (
        <span key={i} className="dot" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-doc)', display: 'inline-block', opacity: 0.2 }} />
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
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', fontSize: '0.68rem',
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0, letterSpacing: '0.05em'
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
        RETRIEVAL TRACE ({toolSteps.length} steps)
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
          {toolSteps.map((step, i) => (
            <div key={i} className="step-trace step-trace-doc" style={{ display: 'flex', gap: 8 }}>
              <span style={{ color: step.type === 'thought' ? 'var(--accent-doc)' : '#f59e0b', minWidth: 80 }}>
                {step.type === 'thought' ? '🔍 SEARCH' : '📄 FOUND'}
              </span>
              <span>{step.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function ContextViewer({ context }: { context: Array<{ text: string; page: number; score: number }> }) {
  const [open, setOpen] = useState(false)
  if (!context || context.length === 0) return null

  return (
    <div style={{ marginTop: 8 }}>
      <button
        onClick={() => setOpen(!open)}
        style={{
          background: 'transparent', border: 'none',
          color: 'var(--accent-doc)', fontSize: '0.68rem',
          fontFamily: "'JetBrains Mono', monospace",
          cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, padding: 0
        }}
      >
        <span style={{ transform: open ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s', display: 'inline-block' }}>▶</span>
        VIEW RETRIEVED CONTEXT ({context.length} sections)
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {context.map((c, i) => (
            <div key={i} style={{ 
              background: 'rgba(124,106,247,0.04)',
              border: '1px solid rgba(124,106,247,0.15)',
              borderRadius: 6,
              padding: '8px 12px'
            }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                <span className="source-chip">Page {c.page}</span>
                <span className="source-chip">Score: {c.score.toFixed(1)}</span>
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", lineHeight: 1.5 }}>
                {c.text}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function formatResponse(text: string) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\n/g, '<br/>')
}

export default function DocQATab() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [docInfo, setDocInfo] = useState<DocInfo | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const uploadFile = useCallback(async (file: File) => {
    if (!file) return
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File too large. Max 10MB.')
      return
    }

    setUploading(true)
    setUploadError('')
    
    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })
      const data = await res.json()

      if (data.error) {
        setUploadError(data.error)
      } else {
        setDocInfo(data)
        setMessages([])
      }
    } catch {
      setUploadError('Upload failed. Please try again.')
    } finally {
      setUploading(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files[0]
    if (file) uploadFile(file)
  }, [uploadFile])

  const send = async (query?: string) => {
    const q = query || input.trim()
    if (!q || loading) return

    const userMsg: Message = { role: 'user', content: q }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    try {
      const res = await fetch('/api/docqa', {
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
          steps: data.steps,
          context: data.context
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
      <div style={{ width: 280, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* Upload zone */}
        <div
          className={`upload-zone${dragOver ? ' dragging' : ''}`}
          onDragOver={e => { e.preventDefault(); setDragOver(true) }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            borderRadius: 12,
            padding: 20,
            textAlign: 'center',
            cursor: 'pointer',
            background: 'var(--surface)',
            transition: 'all 0.2s'
          }}
        >
          <input 
            ref={fileInputRef}
            type="file" 
            accept=".pdf,.txt,.md" 
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile(f) }}
          />
          {uploading ? (
            <div>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>⏳</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontFamily: "'Space Mono', monospace" }}>
                PROCESSING...
              </div>
            </div>
          ) : docInfo ? (
            <div>
              <div style={{ fontSize: '1.5rem', marginBottom: 8 }}>✅</div>
              <div style={{ fontSize: '0.78rem', color: 'var(--accent-doc)', fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 4 }}>
                {docInfo.filename.length > 22 ? docInfo.filename.slice(0, 22) + '...' : docInfo.filename}
              </div>
              <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace" }}>
                {docInfo.pages} pages · {docInfo.chunks} chunks · {docInfo.wordCount.toLocaleString()} words
              </div>
              {docInfo.hasImages && (
                <div style={{ marginTop: 6, fontSize: '0.65rem', color: '#f59e0b', fontFamily: "'JetBrains Mono', monospace" }}>
                  📊 Contains figures/diagrams
                </div>
              )}
              <div style={{ marginTop: 8, fontSize: '0.65rem', color: 'var(--text-muted)' }}>Click to replace</div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '2rem', marginBottom: 10, opacity: 0.5 }}>◈</div>
              <div style={{ fontSize: '0.8rem', color: 'var(--accent-doc)', fontFamily: "'Space Mono', monospace", fontWeight: 700, marginBottom: 6 }}>
                UPLOAD DOCUMENT
              </div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                Drop a PDF or text file here<br/>
                <span style={{ fontSize: '0.65rem' }}>Max 10MB · PDF, TXT, MD</span>
              </div>
            </div>
          )}
        </div>

        {uploadError && (
          <div style={{ 
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: 8,
            padding: '10px 14px',
            fontSize: '0.75rem',
            color: '#ef4444'
          }}>
            ⚠ {uploadError}
          </div>
        )}

        {/* Document preview */}
        {docInfo && (
          <div style={{ 
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 14
          }}>
            <div style={{ 
              color: 'var(--text-muted)',
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              marginBottom: 8
            }}>
              DOCUMENT PREVIEW
            </div>
            <div style={{ 
              fontSize: '0.72rem', 
              color: 'var(--text-muted)', 
              fontFamily: "'JetBrains Mono', monospace",
              lineHeight: 1.5,
              maxHeight: 120,
              overflow: 'hidden',
              maskImage: 'linear-gradient(to bottom, black 60%, transparent)'
            }}>
              {docInfo.preview}
            </div>
          </div>
        )}

        {/* Example queries */}
        {docInfo && (
          <div style={{ 
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 14,
            flex: 1,
            overflow: 'auto'
          }}>
            <div style={{ 
              color: 'var(--text-muted)',
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.62rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              marginBottom: 10
            }}>
              SUGGESTED QUERIES
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
                    padding: '7px 10px',
                    color: 'var(--text-muted)',
                    fontSize: '0.72rem',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'all 0.15s',
                    fontFamily: "'Syne', sans-serif"
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = 'rgba(124,106,247,0.4)'
                    e.currentTarget.style.color = '#fff'
                    e.currentTarget.style.background = 'rgba(124,106,247,0.04)'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = 'var(--border)'
                    e.currentTarget.style.color = 'var(--text-muted)'
                    e.currentTarget.style.background = 'transparent'
                  }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Info card when no doc */}
        {!docInfo && (
          <div style={{ 
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 12,
            padding: 16,
            flex: 1
          }}>
            <div style={{ 
              color: 'var(--accent-doc)', 
              fontFamily: "'Space Mono', monospace",
              fontSize: '0.7rem',
              fontWeight: 700,
              letterSpacing: '0.1em',
              marginBottom: 12
            }}>
              ◈ DOCUMENT QA BOT
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
              Upload any PDF or text document and ask questions about it. The bot retrieves relevant sections and generates context-aware answers.
            </div>
            <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {['PDF & text documents', 'Figures & diagram context', 'Multi-turn Q&A', 'Source page citations', 'Context retrieval trace'].map(cap => (
                <div key={cap} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                  <span style={{ color: 'var(--accent-doc)' }}>✓</span> {cap}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Chat area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Messages */}
        <div style={{ 
          flex: 1, overflow: 'auto',
          display: 'flex', flexDirection: 'column',
          gap: 16, padding: '4px 0 16px 0'
        }}>
          {!docInfo && (
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', flexDirection: 'column', gap: 16, color: 'var(--text-muted)'
            }}>
              <div style={{ fontSize: '3rem', opacity: 0.3 }}>◈</div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '0.8rem', letterSpacing: '0.1em' }}>
                UPLOAD A DOCUMENT FIRST
              </div>
              <div style={{ fontSize: '0.75rem', maxWidth: 320, textAlign: 'center', lineHeight: 1.6 }}>
                Upload a PDF (lecture notes, research paper, textbook chapter) and the bot will answer questions from it, including about figures and diagrams.
              </div>
            </div>
          )}

          {docInfo && messages.length === 0 && (
            <div style={{ 
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              height: '100%', flexDirection: 'column', gap: 12, color: 'var(--text-muted)'
            }}>
              <div style={{ 
                background: 'rgba(124,106,247,0.08)',
                border: '1px solid rgba(124,106,247,0.2)',
                borderRadius: 12, padding: 20, maxWidth: 400, textAlign: 'center'
              }}>
                <div style={{ color: 'var(--accent-doc)', fontFamily: "'Space Mono', monospace", fontSize: '0.75rem', fontWeight: 700, marginBottom: 8 }}>
                  DOCUMENT LOADED ✓
                </div>
                <div style={{ fontSize: '0.8rem', lineHeight: 1.6, marginBottom: 8 }}>
                  <strong style={{ color: '#fff' }}>{docInfo.filename}</strong>
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {docInfo.pages} pages · {docInfo.wordCount.toLocaleString()} words · {docInfo.chunks} searchable chunks
                  {docInfo.hasImages && <><br/><span style={{ color: '#f59e0b' }}>📊 Document contains figures/diagrams</span></>}
                </div>
              </div>
              <div style={{ fontSize: '0.75rem' }}>Ask a question about this document →</div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} style={{ 
              display: 'flex', 
              justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
              gap: 10, alignItems: 'flex-start'
            }}>
              {msg.role === 'assistant' && (
                <div style={{ 
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'rgba(124,106,247,0.15)',
                  border: '1px solid rgba(124,106,247,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.75rem', flexShrink: 0, marginTop: 4
                }}>◈</div>
              )}
              <div style={{ maxWidth: '76%' }}>
                {msg.role === 'assistant' && msg.steps && <StepTrace steps={msg.steps} />}
                <div 
                  className={msg.role === 'user' ? 'msg-user' : 'msg-doc'}
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
                {msg.role === 'assistant' && msg.context && (
                  <ContextViewer context={msg.context} />
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', justifyContent: 'flex-start', gap: 10, alignItems: 'flex-start' }}>
              <div style={{ 
                width: 28, height: 28, borderRadius: '50%',
                background: 'rgba(124,106,247,0.15)',
                border: '1px solid rgba(124,106,247,0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.75rem', flexShrink: 0
              }}>◈</div>
              <div className="msg-doc"><TypingIndicator /></div>
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div style={{ 
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 12, padding: 12,
          display: 'flex', gap: 10, alignItems: 'flex-end'
        }}>
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={docInfo ? "Ask a question about your document... (Enter to send)" : "Upload a document first..."}
            disabled={!docInfo || loading}
            className="input-doc"
            style={{
              flex: 1, background: 'transparent',
              border: '1px solid var(--border)',
              borderRadius: 8, padding: '10px 14px',
              color: 'var(--text)', fontSize: '0.85rem',
              fontFamily: "'Syne', sans-serif",
              resize: 'none', minHeight: 44, maxHeight: 120, lineHeight: 1.5,
              opacity: !docInfo ? 0.4 : 1
            }}
            rows={1}
          />
          <button
            onClick={() => send()}
            disabled={loading || !input.trim() || !docInfo}
            className="btn-doc"
            style={{
              padding: '10px 20px', borderRadius: 8, border: 'none',
              cursor: 'pointer', fontSize: '0.78rem',
              letterSpacing: '0.06em', height: 44, whiteSpace: 'nowrap'
            }}
          >
            {loading ? '...' : 'ASK →'}
          </button>
        </div>
      </div>
    </div>
  )
}
