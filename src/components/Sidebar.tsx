import { useState } from 'react'
import { useApp } from '../store/AppContext'
import { FilterView, CATEGORY_COLORS } from '../store/types'

export default function Sidebar() {
  const { articles, filterView, setFilterView, setPaletteOpen } = useApp()
  const [catOpen, setCatOpen] = useState(true)
  const [tagOpen, setTagOpen] = useState(true)

  const allCount = articles.length
  const favCount = articles.filter(a => a.favorite).length

  const categoryCounts: Record<string, number> = {}
  articles.forEach(a => { if (a.category) categoryCounts[a.category] = (categoryCounts[a.category] || 0) + 1 })
  const CATEGORIES = Object.keys(categoryCounts).sort()

  const allTags = [...new Set(articles.flatMap(a => a.tags))].slice(0, 20)

  const isActive = (v: FilterView) => {
    if (typeof v === 'string' && typeof filterView === 'string') return v === filterView
    if (typeof v === 'object' && typeof filterView === 'object') return v.type === filterView.type && v.value === filterView.value
    return false
  }

  return (
    <aside style={{
      width: 240,
      minWidth: 240,
      height: '100%',
      background: 'var(--bg-surface)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      userSelect: 'none',
    }}>
      {/* Brand */}
      <div style={{ padding: '20px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="17" height="17" viewBox="0 0 12 12" fill="none">
              <path d="M2 3h8M2 6h5M2 9h7" stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--text-1)' }}>Inkwell</span>
        </div>
      </div>

      {/* Add URL button */}
      <div style={{ padding: '0 12px 12px' }}>
        <button
          onClick={() => setPaletteOpen(true)}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '7px 11px', fontSize: 13, fontWeight: 500,
            border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
            background: 'var(--bg-hover)', color: 'var(--text-2)',
            transition: 'all 120ms',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-1)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-hover)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 2v10M2 7h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
            Add article
          </span>
          <span style={{ fontSize: 11, background: 'rgba(255,255,255,.05)', padding: '2px 5px', borderRadius: 4, color: 'var(--text-3)' }}>⌘K</span>
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '0 8px', overflowY: 'auto' }}>
        <NavItem label="All articles" count={allCount} active={isActive('all')} onClick={() => setFilterView('all')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <rect x="1.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="8.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="1.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            <rect x="8.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
        </NavItem>

        <NavItem label="Favorites" count={favCount} active={isActive('favorites')} onClick={() => setFilterView('favorites')}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M7 1.5L8.545 5.13H12.5L9.477 7.37L10.618 11.5L7 9.13L3.382 11.5L4.523 7.37L1.5 5.13H5.455L7 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
          </svg>
        </NavItem>

        {/* Categories */}
        {CATEGORIES.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <button
            onClick={() => setCatOpen(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
              letterSpacing: '0.05em', color: 'var(--text-3)', borderRadius: 'var(--r-md)',
            }}
          >
            Categories
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: catOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms ease' }}>
              <path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>

          <div style={{
            maxHeight: catOpen ? 400 : 0, overflow: 'hidden',
            transition: 'max-height 200ms ease, opacity 150ms ease',
            opacity: catOpen ? 1 : 0,
          }}>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setFilterView({ type: 'category', value: cat })}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '5px 10px 5px 26px', fontSize: 12, fontWeight: 500,
                  borderRadius: 'var(--r-md)', color: isActive({ type: 'category', value: cat }) ? 'var(--text-1)' : 'var(--text-2)',
                  background: isActive({ type: 'category', value: cat }) ? 'rgba(255,255,255,.06)' : 'transparent',
                  transition: 'all 100ms',
                }}
                onMouseEnter={e => { if (!isActive({ type: 'category', value: cat })) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
                onMouseLeave={e => { if (!isActive({ type: 'category', value: cat })) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: CATEGORY_COLORS[cat] ?? CATEGORY_COLORS.Other, flexShrink: 0 }} />
                {cat}
                {categoryCounts[cat] && (
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{categoryCounts[cat]}</span>
                )}
              </button>
            ))}
          </div>
        </div>
        )}

        {/* Tags */}
        {allTags.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setTagOpen(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '4px 10px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
                letterSpacing: '0.05em', color: 'var(--text-3)', borderRadius: 'var(--r-md)',
              }}
            >
              Tags
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: tagOpen ? 'rotate(90deg)' : 'rotate(0)', transition: 'transform 150ms ease' }}>
                <path d="M4 3l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <div style={{
              maxHeight: tagOpen ? 400 : 0, overflow: 'hidden',
              transition: 'max-height 200ms ease, opacity 150ms ease',
              opacity: tagOpen ? 1 : 0,
            }}>
              <div style={{ padding: '4px 8px', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {allTags.map(tag => (
                  <button
                    key={tag}
                    onClick={() => setFilterView({ type: 'tag', value: tag })}
                    style={{
                      fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 'var(--r-sm)',
                      background: isActive({ type: 'tag', value: tag }) ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.05)',
                      color: isActive({ type: 'tag', value: tag }) ? 'var(--text-1)' : 'var(--text-2)',
                      transition: 'all 100ms',
                    }}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </nav>

      {/* Footer */}
      <div style={{ borderTop: '1px solid var(--border)', padding: 8 }}>
        <NavItem label="Settings" active={false} onClick={() => {}}>
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="2" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M7 1v1.5M7 11.5V13M1 7h1.5M11.5 7H13M2.93 2.93l1.06 1.06M10.01 10.01l1.06 1.06M2.93 11.07l1.06-1.06M10.01 3.99l1.06-1.06" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
        </NavItem>
      </div>
    </aside>
  )
}

function NavItem({ label, count, active, onClick, children }: {
  label: string; count?: number; active: boolean; onClick: () => void; children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px', fontSize: 13, fontWeight: 500,
        borderRadius: 'var(--r-md)', transition: 'all 100ms',
        background: active ? 'rgba(255,255,255,.06)' : hovered ? 'var(--bg-hover)' : 'transparent',
        color: active ? 'var(--text-1)' : hovered ? 'var(--text-1)' : 'var(--text-2)',
      }}
    >
      <span style={{ color: active ? 'var(--primary)' : 'currentColor', display: 'flex' }}>{children}</span>
      {label}
      {count !== undefined && (
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-3)' }}>{count}</span>
      )}
    </button>
  )
}
