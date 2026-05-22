import { AppProvider, useApp } from './store/AppContext'
import Sidebar from './components/Sidebar'
import Library from './pages/Library'
import ArticleDetail from './components/ArticleDetail'
import CommandPalette from './components/CommandPalette'

function AppShell() {
  const { selectedArticle, paletteOpen } = useApp()

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex',
      position: 'relative', overflow: 'hidden',
    }}>
      <Sidebar />
      {selectedArticle ? <ArticleDetail /> : <Library />}
      {paletteOpen && <CommandPalette />}
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}
