export interface Article {
  id: string
  url: string
  title: string
  summary: string
  content?: string
  tags: string[]
  category: string
  site_name: string
  word_count: number
  saved_at: number
  ai_processed: number
  favorite: boolean
}

export type ViewMode = 'grid' | 'list'

export type FilterView = 'all' | 'favorites' | { type: 'category'; value: string } | { type: 'tag'; value: string }

export const CATEGORY_COLORS: Record<string, string> = {
  Design:      '#A855F7',
  Development: '#3B82F6',
  'AI-ML':     '#22C55E',
  Product:     '#F97316',
  Business:    '#06B6D4',
  Research:    '#EAB308',
  Science:     '#EC4899',
  Other:       '#6B7280',
}
