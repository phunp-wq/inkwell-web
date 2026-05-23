import { useState, useRef, useEffect } from 'react'
import { useApp, API } from '../store/AppContext'
import { Article, CATEGORY_COLORS } from '../store/types'

type Stage = 'idle' | 'connecting' | 'reading' | 'summarizing' | 'done' | 'error'

interface ExtractResult {
  id: string; url: string; title: string; siteName: string
  wordCount: number; lang: string; ai: { summary: string; tags: string[]; category: string }
}

export default function CommandPalette() {
  const { articles, setPaletteOpen, addArticle } = useApp()
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [result, setResult] = useState<ExtractResult | null>(null)
  const [error, setError] = useState('')
  const [selectedIdx, setSelectedIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const isUrl = /^(https?:\/\/|www\.)/i.test(query.trim())

  const filteredArticles = query.trim() && !isUrl
    ? articles.filter(a =>
        a.title.toLowerCase().includes(query.toLowerCase()) ||
        a.tags.some(t => t.toLowerCase().includes(query.toLowerCase())) ||
        a.category.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 8)
    : []

  const allTags = [...new Set(articles.flatMap(a => a.tags))]
    .filter(t => query.trim() && t.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 4)

  const totalItems = filteredArticles.length + allTags.length + (isUrl ? 1 : 0)

  useEffect(() => { setSelectedIdx(0) }, [query])

  const handleExtract = async () => {
    if (!query.trim() || !isUrl) return
    setStage('connecting')
    setError('')
    setResult(null)

    try {
      setStage('reading')
      await new Promise(r => setTimeout(r, 400))
      setStage('summarizing')

      const res = await fetch(`${API}/api/pipeline`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: query.trim() }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save article')

      setResult(data)
      setStage('done')
      addArticle({
        ...data,
        summary: data.ai?.summary || '',
        tags: data.ai?.tags || [],
        category: data.ai?.category || 'Other',
        saved_at: Date.now(),
        ai_processed: 1,
        favorite: false,
        byline: '',
      } as Article)
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Unknown error')
      setStage('error')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (stage !== 'idle') { setStage('idle'); setQuery(''); setResult(null) }
      else setPaletteOpen(false)
      return
    }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx(i => Math.min(i + 1, totalItems - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter') {
      if (isUrl) { handleExtract(); return }
      if (filteredArticles[selectedIdx]) {
        // article click handled by Library
      }
    }
  }

  const stageLabel: Record<Stage, string> = {
    idle: '', connecting: 'Connecting…', reading: 'Reading article…',
    summarizing: 'AI summarizing…', done: 'Saved!', error: 'Error',
  }

  return (
    <div
      onClick={() => setPaletteOpen(false)}
      style={{
        position: 'absolute', inset: 0,
        background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: 140, zIndex: 100,
        animation: 'paletteFade .1s ease',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 540, background: 'var(--bg-elevated)',
          border: '1px solid var(--border-hover)', borderRadius: 'var(--r-xl)',
          boxShadow: '0 20px 60px rgba(0,0,0,.55)',
          animation: 'paletteSlide .14s cubic-bezier(.3,.7,.4,1)',
          overflow: 'hidden',
        }}
      >
        {/* Input */}
        <div style={{ display: 'flex', gap: 10, padding: '13px 16px', borderBottom: '1px solid var(--border)' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-3)', flexShrink: 0, marginTop: 1 }}>
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M11 11l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => { setQuery(e.target.value); if (stage !== 'idle') { setStage('idle'); setResult(null) } }}
            onKeyDown={handleKeyDown}
            placeholder="Paste URL or search articles…"
            style={{ flex: 1, fontSize: 15, color: 'var(--text-1)' }}
          />
          {query && (
            <button
              onClick={() => { setQuery(''); setStage('idle'); setResult(null) }}
              style={{ fontSize: 11, color: 'var(--text-3)', background: 'rgba(255,255,255,.06)', padding: '3px 7px', borderRadius: 4 }}
            >
              esc
            </button>
          )}
          {!query && (
            <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'rgba(255,255,255,.06)', padding: '3px 7px', borderRadius: 4 }}>esc</span>
          )}
        </div>

        {/* Body */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 8px 8px' }}>

          {/* URL action */}
          {isUrl && stage === 'idle' && (
            <button
              onClick={handleExtract}
              style={{
                width: '100%', display: 'flex', gap: 12, alignItems: 'center',
                padding: '12px 14px', margin: 4, borderRadius: 'var(--r-md)',
                background: 'color-mix(in oklch, var(--primary), transparent 92%)',
                border: '1px solid color-mix(in oklch, var(--primary), transparent 82%)',
                textAlign: 'left', transition: 'background 80ms',
              }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in oklch, var(--primary), transparent 86%)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'color-mix(in oklch, var(--primary), transparent 92%)'}
            >
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M7 2v10M2 7h10" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)', marginBottom: 2 }}>Save article</div>
                <div style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{query}</div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--text-3)', background: 'rgba(255,255,255,.06)', padding: '3px 8px', borderRadius: 4 }}>↵</span>
            </button>
          )}

          {/* Extracting / done */}
          {isUrl && stage !== 'idle' && (
            <div style={{ padding: '16px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                {stage === 'done'
                  ? <span style={{ fontSize: 15, color: '#22C55E', fontWeight: 700 }}>✓</span>
                  : stage === 'error'
                  ? <span style={{ fontSize: 15, color: '#EF4444' }}>✕</span>
                  : <span style={{ width: 8, height: 8, borderRadius: '50%', background: stage === 'summarizing' ? 'var(--primary)' : 'var(--text-3)', animation: 'pulse 1.4s infinite', display: 'inline-block' }} />
                }
                <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>
                  {stage === 'error' ? error : stageLabel[stage]}
                </span>
              </div>

              {(stage === 'connecting' || stage === 'reading' || stage === 'summarizing') && (
                <div style={{
                  height: 2, borderRadius: 1, marginBottom: 14,
                  background: 'rgba(255,255,255,.05)', overflow: 'hidden',
                }}>
                  <div style={{
                    width: '25%', height: '100%',
                    background: 'var(--primary)', borderRadius: 1,
                    animation: 'progressSlide 1.2s cubic-bezier(.4,0,.6,1) infinite',
                  }} />
                </div>
              )}

              {result && (
                <div style={{ animation: 'fadeIn .2s ease' }}>
                  <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--text-1)', letterSpacing: '-0.01em', marginBottom: 8 }}>
                    {result.title}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65, marginBottom: 12 }}>
                    {result.ai?.summary}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 6 }}>
                    {result.ai?.tags?.map(tag => (
                      <span key={tag} style={{
                        fontSize: 11, fontWeight: 500, color: 'var(--text-2)',
                        background: 'rgba(255,255,255,.06)', padding: '3px 8px', borderRadius: 'var(--r-sm)',
                        animation: 'tagPop .2s cubic-bezier(.3,.7,.4,1)',
                      }}>
                        {tag}
                      </span>
                    ))}
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      color: CATEGORY_COLORS[result.ai?.category] || 'var(--text-3)',
                    }}>
                      {result.ai?.category}
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Article search results */}
          {filteredArticles.length > 0 && (
            <>
              <div style={{ padding: '8px 10px 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)' }}>
                Articles
              </div>
              {filteredArticles.map((a, i) => (
                <div
                  key={a.id}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center',
                    padding: '8px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    background: selectedIdx === i ? 'var(--bg-hover)' : 'transparent',
                    transition: 'background 60ms',
                  }}
                  onMouseEnter={() => setSelectedIdx(i)}
                >
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: CATEGORY_COLORS[a.category] || CATEGORY_COLORS.Other, flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {a.title}
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{a.byline || a.site_name}</span>
                </div>
              ))}
            </>
          )}

          {/* Tag results */}
          {allTags.length > 0 && (
            <>
              <div style={{ padding: '8px 10px 4px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--text-3)' }}>
                Tags
              </div>
              {allTags.map((tag, i) => (
                <div
                  key={tag}
                  style={{
                    display: 'flex', gap: 10, alignItems: 'center',
                    padding: '8px 10px', borderRadius: 'var(--r-md)', cursor: 'pointer',
                    background: selectedIdx === filteredArticles.length + i ? 'var(--bg-hover)' : 'transparent',
                    transition: 'background 60ms',
                  }}
                  onMouseEnter={() => setSelectedIdx(filteredArticles.length + i)}
                >
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-3)', width: 16, textAlign: 'center' }}>#</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)' }}>{tag}</span>
                </div>
              ))}
            </>
          )}

          {/* Empty */}
          {!query.trim() && (
            <div style={{ padding: '20px 14px', fontSize: 13, color: 'var(--text-3)', textAlign: 'center' }}>
              Paste a URL to save an article, or search your library
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
