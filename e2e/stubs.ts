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
}
