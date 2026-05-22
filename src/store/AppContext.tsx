import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'
import { Article, ViewMode, FilterView } from './types'

const API = import.meta.env.VITE_API_BASE ?? 'http://localhost:3777'

interface AppState {
  articles: Article[]
  loading: boolean
  viewMode: ViewMode
  filterView: FilterView
  searchQuery: string
  selectedArticle: Article | null
  paletteOpen: boolean
  setViewMode: (v: ViewMode) => void
  setFilterView: (v: FilterView) => void
  setSearchQuery: (q: string) => void
  openArticle: (a: Article) => void
  closeArticle: () => void
  setPaletteOpen: (open: boolean) => void
  toggleFavorite: (id: string) => Promise<void>
  deleteArticle: (id: string) => Promise<void>
  addArticle: (article: Article) => void
  refresh: () => Promise<void>
}

const AppContext = createContext<AppState | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [filterView, setFilterView] = useState<FilterView>('all')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedArticle, setSelectedArticle] = useState<Article | null>(null)
  const [paletteOpen, setPaletteOpen] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (searchQuery.trim()) params.set('q', searchQuery.trim())
      if (typeof filterView === 'object' && filterView.type === 'category') params.set('category', filterView.value)
      if (typeof filterView === 'object' && filterView.type === 'tag') params.set('tag', filterView.value)

      const res = await fetch(`${API}/api/articles?${params}`)
      const data: Article[] = await res.json()

      let filtered = data
      if (filterView === 'favorites') filtered = data.filter(a => a.favorite)

      setArticles(filtered)
    } catch (e) {
      console.error('Failed to fetch articles', e)
    } finally {
      setLoading(false)
    }
  }, [searchQuery, filterView])

  useEffect(() => { refresh() }, [refresh])

  // ⌘K shortcut
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setPaletteOpen(o => !o)
      }
      if (e.key === 'Escape') setPaletteOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const toggleFavorite = async (id: string) => {
    const res = await fetch(`${API}/api/articles/${id}/favorite`, { method: 'POST' })
    const data = await res.json()
    setArticles(prev => prev.map(a => a.id === id ? { ...a, favorite: data.favorite } : a))
    if (selectedArticle?.id === id) setSelectedArticle(prev => prev ? { ...prev, favorite: data.favorite } : null)
    if (filterView === 'favorites') await refresh()
  }

  const deleteArticle = async (id: string) => {
    await fetch(`${API}/api/articles/${id}`, { method: 'DELETE' })
    setArticles(prev => prev.filter(a => a.id !== id))
    if (selectedArticle?.id === id) setSelectedArticle(null)
  }

  const addArticle = (article: Article) => {
    setArticles(prev => [article, ...prev])
  }

  return (
    <AppContext.Provider value={{
      articles, loading, viewMode, filterView, searchQuery, selectedArticle, paletteOpen,
      setViewMode, setFilterView, setSearchQuery,
      openArticle: async (a: Article) => {
        setSelectedArticle(a)
        try {
          const res = await fetch(`${API}/api/articles/${a.id}`)
          const full = await res.json()
          setSelectedArticle(full)
        } catch {}
      },
      closeArticle: () => setSelectedArticle(null),
      setPaletteOpen, toggleFavorite, deleteArticle, addArticle, refresh
    }}>
      {children}
    </AppContext.Provider>
  )
}

export const useApp = () => {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

export { API }
