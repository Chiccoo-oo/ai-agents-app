'use client'

import { useState } from 'react'
import CalculatorTab from '@/components/CalculatorTab'
import DocQATab from '@/components/DocQATab'

export default function Home() {
  const [tab, setTab] = useState<'calc' | 'doc'>('calc')

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <header style={{ 
        borderBottom: '1px solid var(--border)', 
        padding: '0 24px',
        background: 'var(--surface)',
        position: 'sticky',
        top: 0,
        zIndex: 100,
        backdropFilter: 'blur(10px)'
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Logo */}
          <div style={{ padding: '16px 0', display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ 
              width: 32, height: 32, borderRadius: 8,
              background: 'linear-gradient(135deg, var(--accent-calc), var(--accent-doc))',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16
            }}>⚡</div>
            <div>
              <div style={{ fontFamily: "'Space Mono', monospace", fontWeight: 700, fontSize: '0.85rem', color: '#fff', letterSpacing: '0.05em' }}>
                AI AGENTS
              </div>
              <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.08em' }}>
                LANGCHAIN · GROQ · LLAMA-3
              </div>
            </div>
          </div>

          {/* Tabs */}
          <nav style={{ display: 'flex', gap: 0 }}>
            <button
              onClick={() => setTab('calc')}
              className={`tab-calc${tab === 'calc' ? ' active' : ''}`}
              style={{
                padding: '20px 28px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === 'calc' ? '2px solid var(--accent-calc)' : '2px solid transparent',
                color: tab === 'calc' ? 'var(--accent-calc)' : 'var(--text-muted)',
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>⟨∑⟩</span> CALCULATOR AGENT
            </button>
            <button
              onClick={() => setTab('doc')}
              className={`tab-doc${tab === 'doc' ? ' active' : ''}`}
              style={{
                padding: '20px 28px',
                background: 'transparent',
                border: 'none',
                borderBottom: tab === 'doc' ? '2px solid var(--accent-doc)' : '2px solid transparent',
                color: tab === 'doc' ? 'var(--accent-doc)' : 'var(--text-muted)',
                fontFamily: "'Space Mono', monospace",
                fontSize: '0.78rem',
                fontWeight: 700,
                cursor: 'pointer',
                letterSpacing: '0.06em',
                transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', gap: 8
              }}
            >
              <span>◈</span> DOCUMENT QA BOT
            </button>
          </nav>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.7rem', fontFamily: "'JetBrains Mono', monospace", color: 'var(--text-muted)' }}>
            <span className="pulse-green" style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent-calc)', display: 'inline-block' }}></span>
            GROQ API CONNECTED
          </div>
        </div>
      </header>

      {/* Content */}
      <main style={{ flex: 1, maxWidth: 1100, margin: '0 auto', width: '100%', padding: '0 24px' }}>
        {tab === 'calc' ? <CalculatorTab /> : <DocQATab />}
      </main>
    </div>
  )
}
