import { useState } from 'react'
import { Article, CATEGORY_COLORS } from '../store/types'
import { useApp } from '../store/AppContext'

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ArticleList({ articles }: { articles: Article[] }) {
  return (
    <div>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '0 14px 8px', borderBottom: '1px solid var(--border)',
        fontSize: 11, fontWeight: 500, textTransform: 'uppercase',
        letterSpacing: '0.04em', color: 'var(--text-3)',
      }}>
        <span style={{ width: 8 }} />
        <span style={{ flex: 1 }}>Title</span>
        <span style={{ width: 150 }}>Tags</span>
        <span style={{ width: 120 }}>Source</span>
        <span style={{ width: 56, textAlign: 'right' }}>Date</span>
        <span style={{ width: 24 }} />
      </div>

      {articles.map(article => <ArticleRow key={article.id} article={article} />)}
    </div>
  )
}

function ArticleRow({ article }: { article: Article }) {
  const { openArticle, toggleFavorite } = useApp()
  const [hovered, setHovered] = useState(false)
  const color = CATEGORY_COLORS[article.category] || CATEGORY_COLORS.Other

  return (
    <div
      onClick={() => openArticle(article)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '9px 14px', borderBottom: '1px solid var(--border)',
        cursor: 'pointer', transition: 'background 60ms',
        background: hovered ? 'var(--bg-hover)' : 'transparent',
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />

      <span style={{
        flex: 1, fontSize: 13, fontWeight: 500, color: 'var(--text-1)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {article.title}
      </span>

      <div style={{ width: 150, display: 'flex', gap: 4, overflow: 'hidden' }}>
        {article.tags.slice(0, 2).map(tag => (
          <span key={tag} style={{
            fontSize: 10, color: 'var(--text-3)',
            background: 'rgba(255,255,255,.04)', padding: '2px 6px', borderRadius: 3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {tag}
          </span>
        ))}
      </div>

      <span style={{
        width: 120, fontSize: 12, color: 'var(--text-3)',
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {article.site_name}
      </span>

      <span style={{ width: 56, fontSize: 12, color: 'var(--text-3)', textAlign: 'right' }}>
        {formatDate(article.saved_at)}
      </span>

      <button
        onClick={e => { e.stopPropagation(); toggleFavorite(article.id) }}
        style={{
          width: 24, padding: 2,
          color: article.favorite ? '#EAB308' : 'var(--text-3)',
          transition: 'color 100ms',
        }}
        onMouseEnter={e => { if (!article.favorite) (e.currentTarget as HTMLElement).style.color = '#EAB308' }}
        onMouseLeave={e => { if (!article.favorite) (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
      >
        <svg width="12" height="12" viewBox="0 0 14 14" fill={article.favorite ? '#EAB308' : 'none'}>
          <path d="M7 1.5L8.545 5.13H12.5L9.477 7.37L10.618 11.5L7 9.13L3.382 11.5L4.523 7.37L1.5 5.13H5.455L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
        </svg>
      </button>
    </div>
  )
}
