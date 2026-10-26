import { readFileSync } from 'node:fs'
import type { BrowserContext } from '@playwright/test'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}

/**
 * Keeps e2e runs off third-party services: GIF search, uploads and CDN media are
 * answered from fixtures. Exercised by GIF/upload tests in sub-project 3.
 */
export async function stubExternalServices(context: BrowserContext) {
  await context.route('**/functions/v1/gif-search**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({ path: 'e2e/fixtures/gifs.json', contentType: 'application/json', headers: CORS }),
  )
  await context.route('**/functions/v1/upload-media**', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: CORS })
      : route.fulfill({
          json: { url: 'http://cdn.test.local/messages/test-image.png', filename: 'test-image.png', type: 'image/png', size: 68 },
          headers: CORS,
        }),
  )
  await context.route('http://cdn.test.local/**', (route) =>
    route.fulfill({ path: 'e2e/fixtures/media/test-image.png', contentType: 'image/png' }),
  )
  // Voice memos: the 4 s fixture (.webm or .m4a by the URL), with range requests (Safari won't play
  // media without them).
  const fixtures = { m4a: readFileSync('e2e/fixtures/media/voice.m4a'), webm: readFileSync('e2e/fixtures/media/voice.webm') }
  await context.route('http://cdn.test.local/voice/**', (route) => {
    const webm = route.request().url().endsWith('.webm')
    const voice = webm ? fixtures.webm : fixtures.m4a
    const range = /bytes=(\d+)-(\d*)/.exec(route.request().headers()['range'] ?? '')
    const headers = { 'Content-Type': webm ? 'audio/webm' : 'audio/mp4', 'Accept-Ranges': 'bytes' }
    if (!range) return route.fulfill({ status: 200, body: voice, headers })
    const start = Number(range[1])
    const end = range[2] ? Math.min(Number(range[2]), voice.length - 1) : voice.length - 1
    return route.fulfill({
      status: 206,
      body: voice.subarray(start, end + 1),
      headers: { ...headers, 'Content-Range': `bytes ${start}-${end}/${voice.length}` },
    })
  })
}
