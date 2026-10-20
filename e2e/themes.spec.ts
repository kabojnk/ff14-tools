import { randomUUID } from 'node:crypto'
import { THEME_IDS } from '../src/lib/themes'
import { expect, test } from './fixtures'
import { readEverything, serviceClient } from './supabase'
import { IDS } from './users'

// Visual baselines of the chat in every theme. Only the screenshots-desktop and screenshots-phone
// projects run this file (see playwright.config.ts), and only on Linux: fonts render differently on
// macOS, so baselines come from CI (ubuntu-24.04). See SETUP.md, "Screenshot baselines".
test.skip(process.platform !== 'linux', 'screenshot baselines are Linux-only (CI)')

const CODE_ID = randomUUID()
const CODE = '```ts\nconst theme = pick(themes)\nif (!theme) return\n```'

test.beforeAll(async () => {
  // A highlighted code block from Bea, the newest message in Main…
  const { error } = await serviceClient().from('messages').insert({
    id: CODE_ID,
    conversation_id: IDS.conversation,
    space: 'main',
    session_id: IDS.sessions.current,
    author_id: IDS.users.bea,
    content: CODE,
    attachments: [],
    type: 'text',
  })
  if (error) throw new Error(error.message)
  // …and everything read by both, so there is no divider or badge, and Alice's ticks are all ✓✓.
  for (const key of ['alice', 'bea'] as const) for (const space of ['main', 'schist'] as const) await readEverything(key, space)
})

test.afterAll(async () => {
  const { error } = await serviceClient().from('messages').delete().eq('id', CODE_ID)
  if (error) throw new Error(error.message)
})

for (const theme of THEME_IDS) {
  test(`chat in the ${theme} theme`, async ({ alice }) => {
    await alice.page.addInitScript((id) => {
      try {
        localStorage.setItem('theme', id)
      } catch {
        // The theme falls back to the OS default; the screenshot would show it.
      }
    }, theme)
    await alice.openChat('Main')
    await expect(alice.page.locator('html')).toHaveAttribute('data-theme', theme)

    // Code highlighting, images and fonts are in before the shot.
    await expect(alice.messageList.locator('figure.md-code .hljs-keyword').first()).toBeVisible()
    await alice.page.evaluate(async () => {
      await document.fonts.ready
      await Promise.all(
        [...document.images].map((img) => (img.complete ? null : new Promise((done) => img.addEventListener('load', done, { once: true })))),
      )
    })

    const page = alice.page
    await expect(page).toHaveScreenshot(`${theme}.png`, {
      mask: [
        page.locator('time'), // message times
        page.locator('[data-media-time]'),
        page.locator('[data-conversation] small'), // the conversation list's time
        page.locator('[data-date-chip]'),
        page.locator('[data-presence]'),
        page.getByTestId('presence-line'),
        page.locator('[data-typing-bubble]'),
        page.getByRole('list', { name: 'Attachments' }), // the composer tray (its upload spinner)
      ],
      maxDiffPixelRatio: 0.002,
    })
  })
}
