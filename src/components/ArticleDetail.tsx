import ReactMarkdown from 'react-markdown'
import { useApp } from '../store/AppContext'
import { CATEGORY_COLORS } from '../store/types'

function formatDate(ts: number | string) {
  return new Date(Number(ts)).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function readTime(wordCount: number) {
  return `${Math.max(1, Math.round(wordCount / 200))} min read`
}

export default function ArticleDetail() {
  const { selectedArticle: a, closeArticle, toggleFavorite, deleteArticle } = useApp()
  if (!a) return null

  const color = CATEGORY_COLORS[a.category] || CATEGORY_COLORS.Other

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 36px', animation: 'fadeIn .15s ease' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>

        {/* Top bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button
            onClick={closeArticle}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 13, fontWeight: 500, color: 'var(--text-2)',
              padding: '5px 8px', borderRadius: 'var(--r-md)',
              transition: 'all 100ms',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7l5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Back
          </button>

          <div style={{ display: 'flex', gap: 8 }}>
            <ActionBtn
              onClick={() => window.open(a.url, '_blank')}
              label="Open source"
              icon={
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M5 2H2a1 1 0 00-1 1v8a1 1 0 001 1h8a1 1 0 001-1V8M8 1h4m0 0v4m0-4L5.5 7.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
            />
            <ActionBtn
              onClick={() => toggleFavorite(a.id)}
              label={a.favorite ? 'Unfavorite' : 'Favorite'}
              active={a.favorite}
              activeColor="#EAB308"
              icon={
                <svg width="13" height="13" viewBox="0 0 14 14" fill={a.favorite ? '#EAB308' : 'none'}>
                  <path d="M7 1.5L8.545 5.13H12.5L9.477 7.37L10.618 11.5L7 9.13L3.382 11.5L4.523 7.37L1.5 5.13H5.455L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
                </svg>
              }
            />
            <ActionBtn
              onClick={async () => { await deleteArticle(a.id) }}
              label="Delete"
              icon={
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <path d="M2 3.5h9M4.5 3.5V2.5a1 1 0 011-1h2a1 1 0 011 1v1M5.5 6v4M7.5 6v4M3 3.5l.5 7a1 1 0 001 1h4a1 1 0 001-1l.5-7" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              }
            />
          </div>
        </div>

        {/* Meta */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 12, fontSize: 13 }}>
          <span style={{ fontWeight: 600, color }}>{a.category}</span>
          <span style={{ color: 'var(--text-3)' }}>·</span>
          <span style={{ color: 'var(--text-2)' }}>{a.site_name}</span>
          <span style={{ color: 'var(--text-3)' }}>·</span>
          <span style={{ color: 'var(--text-2)' }}>{formatDate(a.saved_at)}</span>
          <span style={{ color: 'var(--text-3)' }}>·</span>
          <span style={{ color: 'var(--text-2)' }}>{readTime(a.word_count)}</span>
        </div>

        {/* Title */}
        <h1 style={{
          fontSize: 26, fontWeight: 700, color: 'var(--text-1)',
          lineHeight: 1.3, letterSpacing: '-0.025em', marginBottom: 28,
        }}>
          {a.title}
        </h1>

        {/* Summary card */}
        <div style={{
          background: 'rgba(255,255,255,.02)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--r-lg)',
          padding: '18px 20px', marginBottom: 28,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 4h10M2 7h7M2 10h9" stroke="var(--primary)" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.03em', color: 'var(--primary)' }}>
              AI Summary
            </span>
          </div>
          <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.7, margin: 0 }}>
            {a.summary || 'Processing…'}
          </p>
        </div>

        {/* Tags */}
        {a.tags.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 8 }}>
              Tags
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {a.tags.map(tag => (
                <span key={tag} style={{
                  fontSize: 12, fontWeight: 500, color: 'var(--text-2)',
                  background: 'rgba(255,255,255,.05)', padding: '4px 10px',
                  borderRadius: 'var(--r-md)',
                }}>
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Category */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--text-3)', marginBottom: 8 }}>
            Category
          </div>
          <span style={{
            display: 'inline-block', fontSize: 12, fontWeight: 600,
            padding: '5px 12px', borderRadius: 'var(--r-md)',
            color, border: `1px solid ${color}25`, background: `${color}12`,
          }}>
            {a.category}
          </span>
        </div>

        {/* Full content */}
        {a.content && (
          <>
            <div style={{ height: 1, background: 'var(--border)', marginBottom: 28 }} />
            <div style={{ fontSize: 15, color: 'var(--text-2)', lineHeight: 1.85, wordBreak: 'break-word' }}
                 className="article-body">
              <ReactMarkdown>{a.content}</ReactMarkdown>
            </div>
          </>
        )}

      </div>
    </div>
  )
}

function ActionBtn({ onClick, label, icon, active, activeColor }: {
  onClick: () => void; label: string; icon: React.ReactNode; active?: boolean; activeColor?: string
}) {
  return (
    <button
      onClick={onClick}
      title={label}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '6px 12px', fontSize: 12, fontWeight: 500,
        border: `1px solid ${active ? `${activeColor}25` : 'var(--border)'}`,
        borderRadius: 'var(--r-md)',
        background: active ? `${activeColor}05` : 'transparent',
        color: active ? activeColor : 'var(--text-2)',
        transition: 'all 100ms',
      }}
      onMouseEnter={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--text-1)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          (e.currentTarget as HTMLElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'
          ;(e.currentTarget as HTMLElement).style.color = 'var(--text-2)'
        }
      }}
    >
      {icon}
      {label}
    </button>
  )
}
