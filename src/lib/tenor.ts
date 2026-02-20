import { supabase } from '@/lib/supabase'

export interface TenorGif {
  id: string
  title: string
  url: string
  preview: string
  width: number
  height: number
}

export async function searchGifs(query: string, limit: number = 20): Promise<TenorGif[]> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not authenticated')

  const params = new URLSearchParams({ q: query, limit: String(limit) })

  const response = await fetch(
    `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gif-search?${params}`,
    {
      headers: {
        Authorization: `Bearer ${session.access_token}`,
      },
    }
  )

  if (!response.ok) throw new Error('GIF search failed')

  const data = await response.json()
  return data.results as TenorGif[]
}
