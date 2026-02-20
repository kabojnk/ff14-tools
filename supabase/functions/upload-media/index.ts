import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const BUNNY_API_KEY = Deno.env.get('BUNNY_API_KEY')!
const BUNNY_STORAGE_ZONE = Deno.env.get('BUNNY_STORAGE_ZONE')!
const BUNNY_STORAGE_HOST = Deno.env.get('BUNNY_STORAGE_HOST') || 'storage.bunnycdn.com'
const BUNNY_CDN_URL = Deno.env.get('BUNNY_CDN_URL')!

const ALLOWED_TYPES = [
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'video/mp4', 'video/webm',
  'application/pdf',
  'text/plain',
]

const MAX_FILE_SIZE = 25 * 1024 * 1024 // 25MB

serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    })
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const pathPrefix = (formData.get('path') as string) || 'uploads'

    if (!file) {
      return new Response(JSON.stringify({ error: 'No file provided' }), { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type)) {
      return new Response(JSON.stringify({ error: 'File type not allowed' }), { status: 400 })
    }

    if (file.size > MAX_FILE_SIZE) {
      return new Response(JSON.stringify({ error: 'File too large (max 25MB)' }), { status: 400 })
    }

    // Generate unique filename
    const ext = file.name.split('.').pop() || 'bin'
    const filename = `${crypto.randomUUID()}.${ext}`
    const storagePath = `${pathPrefix}/${filename}`

    // Upload to bunny.net Storage Zone
    const arrayBuffer = await file.arrayBuffer()

    const bunnyUrl = `https://${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${storagePath}`
    console.log(`Uploading to Bunny: ${bunnyUrl}`)

    const abort = new AbortController()
    const timeout = setTimeout(() => abort.abort(), 30_000)

    let uploadResponse: Response
    try {
      uploadResponse = await fetch(bunnyUrl, {
        method: 'PUT',
        headers: {
          'AccessKey': BUNNY_API_KEY,
          'Content-Type': 'application/octet-stream',
        },
        body: arrayBuffer,
        signal: abort.signal,
      })
    } finally {
      clearTimeout(timeout)
    }

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text()
      console.error(`Bunny upload failed ${uploadResponse.status}: ${errorText}`)
      return new Response(
        JSON.stringify({ error: `Upload failed: ${errorText}` }),
        { status: 500 }
      )
    }

    // Return CDN URL
    const url = `${BUNNY_CDN_URL}/${storagePath}`

    return new Response(
      JSON.stringify({
        url,
        filename: file.name,
        size: file.size,
        type: file.type,
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      }
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    console.error('upload-media error:', message)
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500 }
    )
  }
})
