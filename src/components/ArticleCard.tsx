import { useState } from 'react'
import { Article, CATEGORY_COLORS } from '../store/types'
import { useApp } from '../store/AppContext'

function formatDate(ts: number | string) {
  return new Date(Number(ts)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function siteLetter(siteName: string) {
  return (siteName || '?')[0].toUpperCase()
}

export default function ArticleCard({ article }: { article: Article }) {
  const { openArticle, toggleFavorite } = useApp()
  const [hovered, setHovered] = useState(false)
  const color = CATEGORY_COLORS[article.category] || CATEGORY_COLORS.Other

  return (
    <div
      onClick={() => openArticle(article)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-surface)',
        border: `1px solid ${hovered ? 'var(--border-hover)' : 'var(--border)'}`,
        borderRadius: 'var(--r-lg)',
        cursor: 'pointer',
        transform: hovered ? 'translateY(-2px)' : 'translateY(0)',
        boxShadow: hovered ? '0 8px 24px rgba(0,0,0,.25)' : 'none',
        transition: 'all 120ms',
        display: 'flex',
        flexDirection: 'column',
        animation: 'fadeIn .15s ease',
        overflow: 'hidden',
      }}
    >
      {/* Thumbnail */}
      <div style={{
        height: 100,
        background: `linear-gradient(145deg, ${color}18 0%, ${color}06 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: 'var(--bg-card-alt)',
          border: `1px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 15, fontWeight: 600, color,
        }}>
          {siteLetter(article.site_name)}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '12px 16px 16px', flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
          <span style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', color }}>{article.category}</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>·</span>
          <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{formatDate(article.saved_at)}</span>
        </div>

        <div style={{
          fontSize: 14, fontWeight: 600, color: 'var(--text-1)',
          lineHeight: 1.4, letterSpacing: '-0.01em', marginBottom: 5,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
        }}>
          {article.title}
        </div>

        <div style={{
          fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55,
          display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
          marginBottom: 12, flex: 1,
        }}>
          {article.summary || 'Processing…'}
        </div>

        {/* Footer */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1, minWidth: 0 }}>
            {article.tags.slice(0, 3).map(tag => (
              <span key={tag} style={{
                fontSize: 11, fontWeight: 500, color: 'var(--text-2)',
                background: 'var(--bg-tag)', padding: '3px 8px',
                borderRadius: 'var(--r-sm)', animation: 'tagPop .2s cubic-bezier(.3,.7,.4,1)',
              }}>
                {tag}
              </span>
            ))}
          </div>

          <button
            onClick={e => { e.stopPropagation(); toggleFavorite(article.id) }}
            style={{
              padding: 3, color: article.favorite ? '#EAB308' : 'var(--text-3)',
              transition: 'color 100ms', flexShrink: 0,
            }}
            onMouseEnter={e => { if (!article.favorite) (e.currentTarget as HTMLElement).style.color = '#EAB308' }}
            onMouseLeave={e => { if (!article.favorite) (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill={article.favorite ? '#EAB308' : 'none'}>
              <path d="M7 1.5L8.545 5.13H12.5L9.477 7.37L10.618 11.5L7 9.13L3.382 11.5L4.523 7.37L1.5 5.13H5.455L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  )
}
