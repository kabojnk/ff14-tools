import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const KLIPY_API_KEY = Deno.env.get('KLIPY_API_KEY')!

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

  try {
    const url = new URL(req.url)
    const query = url.searchParams.get('q')
    const limit = url.searchParams.get('limit') || '20'

    if (!query) {
      return new Response(JSON.stringify({ error: 'Missing query parameter' }), { status: 400 })
    }

    // Search Klipy
    const klipyUrl = new URL(`https://api.klipy.com/api/v1/${KLIPY_API_KEY}/gifs/search`)
    klipyUrl.searchParams.set('q', query)
    klipyUrl.searchParams.set('per_page', limit)

    const klipyResponse = await fetch(klipyUrl.toString())
    const klipyData = await klipyResponse.json()

    // Format results
    // Klipy file structure: file.{hd|md|sm|xs}.{gif|webp|jpg|mp4|webm}.{url, width, height, size}
    type KlipyFormat = { url: string; width: number; height: number; size: number }
    type KlipySize = { gif?: KlipyFormat; webp?: KlipyFormat; jpg?: KlipyFormat }
    type KlipyFile = { hd?: KlipySize; md?: KlipySize; sm?: KlipySize; xs?: KlipySize }

    const results = (klipyData.data?.data || []).map((result: Record<string, unknown>) => {
      const file = result.file as KlipyFile | undefined
      const full = file?.md?.gif ?? file?.md?.webp ?? file?.hd?.gif ?? file?.hd?.webp
      const thumb = file?.sm?.webp ?? file?.sm?.gif ?? file?.xs?.webp ?? file?.xs?.gif
      return {
        id: result.slug,
        title: result.title,
        url: full?.url ?? '',
        preview: thumb?.url ?? full?.url ?? '',
        width: full?.width ?? null,
        height: full?.height ?? null,
      }
    })

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
