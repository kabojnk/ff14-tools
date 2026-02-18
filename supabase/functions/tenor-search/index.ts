import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const TENOR_API_KEY = Deno.env.get('TENOR_API_KEY')!

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  // Verify JWT
  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  )

  const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
  if (authError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
  }

  try {
    const url = new URL(req.url)
    const query = url.searchParams.get('q')
    const limit = url.searchParams.get('limit') || '20'

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query parameter' }), { status: 400 })
    }

    // Search Tenor
    const tenorUrl = new URL('https://tenor.googleapis.com/v2/search')
    tenorUrl.searchParams.set('key', TENOR_API_KEY)
    tenorUrl.searchParams.set('q', query)
    tenorUrl.searchParams.set('limit', limit)
    tenorUrl.searchParams.set('media_filter', 'gif,tinygif')

    const tenorResponse = await fetch(tenorUrl.toString())
    const tenorData = await tenorResponse.json()

    // Format results
    const results = (tenorData.results || []).map((result: Record<string, unknown>) => ({
      id: result.id,
      title: result.title,
      url: (result.media_formats as Record<string, { url: string }>)?.gif?.url,
      preview: (result.media_formats as Record<string, { url: string }>)?.tinygif?.url,
      width: (result.media_formats as Record<string, { dims: number[] }>)?.gif?.dims?.[0],
      height: (result.media_formats as Record<string, { dims: number[] }>)?.gif?.dims?.[1],
    }))

    return new Response(
      JSON.stringify({ results }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500 }
    )
  }
})
