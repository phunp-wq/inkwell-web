import { useApp } from '../store/AppContext'
import ArticleCard from '../components/ArticleCard'
import ArticleList from '../components/ArticleList'

export default function Library() {
  const { articles, loading, viewMode, setViewMode, searchQuery, setSearchQuery, filterView } = useApp()

  const title = (() => {
    if (filterView === 'favorites') return 'Favorites'
    if (typeof filterView === 'object' && filterView.type === 'category') return filterView.value
    if (typeof filterView === 'object' && filterView.type === 'tag') return `#${filterView.value}`
    return 'All articles'
  })()

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '28px 36px 0', animation: 'fadeIn .15s ease' }}>
        <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-0.02em', color: 'var(--text-1)' }}>{title}</h1>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
          {articles.length} {articles.length === 1 ? 'article' : 'articles'}
        </p>
      </div>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '16px 36px 12px' }}>
        {/* Search */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r-md)',
          background: 'var(--bg-surface)', transition: 'border-color 100ms',
        }}
          onFocus={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-focus)'}
          onBlur={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ color: 'var(--text-3)', flexShrink: 0 }}>
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.3"/>
            <path d="M10 10l2.5 2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search articles…"
            style={{ flex: 1, fontSize: 13, color: 'var(--text-1)' }}
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} style={{ fontSize: 11, color: 'var(--text-3)' }}>✕</button>
          )}
        </div>

        {/* View toggle */}
        <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 'var(--r-md)', overflow: 'hidden' }}>
          <ViewBtn active={viewMode === 'grid'} onClick={() => setViewMode('grid')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="8.5" y="1.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="1.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
              <rect x="8.5" y="8.5" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.3"/>
            </svg>
          </ViewBtn>
          <ViewBtn active={viewMode === 'list'} onClick={() => setViewMode('list')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3.5h8M3 7h8M3 10.5h8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
            </svg>
          </ViewBtn>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 36px 36px' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 200, color: 'var(--text-3)', fontSize: 14 }}>
            Loading…
          </div>
        ) : articles.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 340, gap: 8 }}>
            <span style={{ fontSize: 14, color: 'var(--text-3)' }}>
              {searchQuery ? 'No articles match your search' : 'No articles yet'}
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-3)', opacity: 0.6 }}>
              {!searchQuery && 'Press ⌘K to add your first article'}
            </span>
          </div>
        ) : viewMode === 'grid' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(275px, 1fr))',
            gap: 14,
          }}>
            {articles.map(a => <ArticleCard key={a.id} article={a} />)}
          </div>
        ) : (
          <ArticleList articles={articles} />
        )}
      </div>
    </div>
  )
}

function ViewBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 9px',
        background: active ? 'var(--bg-active)' : 'transparent',
        color: active ? 'var(--text-1)' : 'var(--text-3)',
        borderRight: '1px solid var(--border)',
        transition: 'all 100ms',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-2)' }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.color = 'var(--text-3)' }}
    >
      {children}
    </button>
  )
}
