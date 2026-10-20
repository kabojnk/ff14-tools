import { randomUUID } from 'node:crypto'
import { THEME_IDS } from '../src/lib/themes'
import { expect, test } from './fixtures'
import { readEverything, restoreSeedMessages, serviceClient } from './supabase'
import { IDS } from './users'

// Visual baselines of the chat in every theme. Only the screenshots-desktop and screenshots-phone
// projects run this file (see playwright.config.ts), and only on Linux: fonts render differently on
// macOS, so baselines come from CI (ubuntu-24.04). See SETUP.md, "Screenshot baselines".
test.skip(process.platform !== 'linux', 'screenshot baselines are Linux-only (CI)')

const CODE_ID = randomUUID()
let beaLastSeen: string | null = null
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

  // Fixed clock times (yesterday, 9:00 onwards, in order): a masked time's width still sets its bubble's
  // width, and seed times follow the reset's clock.
  const svc = serviceClient()
  const { data: rows, error: listError } = await svc
    .from('messages')
    .select('id')
    .eq('session_id', IDS.sessions.current)
    .order('created_at')
    .order('id')
  if (listError) throw new Error(listError.message)
  const base = new Date()
  base.setDate(base.getDate() - 1)
  base.setHours(9, 0, 0, 0)
  for (const [i, row] of (rows ?? []).entries()) {
    const at = new Date(base.getTime() + i * 60_000).toISOString()
    const { error: timeError } = await svc.from('messages').update({ created_at: at }).eq('id', row.id)
    if (timeError) throw new Error(timeError.message)
  }

  // Bea's header line reads "offline", not "last seen <time>": its width moves the desktop tabs.
  const { data: bea, error: beaError } = await svc.from('profiles').select('last_seen_at').eq('id', IDS.users.bea).single()
  if (beaError) throw new Error(beaError.message)
  beaLastSeen = (bea as { last_seen_at: string | null }).last_seen_at
  const { error: clearError } = await svc.from('profiles').update({ last_seen_at: null }).eq('id', IDS.users.bea)
  if (clearError) throw new Error(clearError.message)

  // …and everything read by both, so there is no divider or badge, and Alice's ticks are all ✓✓.
  for (const key of ['alice', 'bea'] as const) for (const space of ['main', 'schist'] as const) await readEverything(key, space)
})

test.afterAll(async () => {
  const svc = serviceClient()
  const { error } = await svc.from('messages').delete().eq('id', CODE_ID)
  if (error) throw new Error(error.message)
  await restoreSeedMessages() // the seeded times
  const { error: beaError } = await svc.from('profiles').update({ last_seen_at: beaLastSeen }).eq('id', IDS.users.bea)
  if (beaError) throw new Error(beaError.message)
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

    // The list has settled at the bottom (it re-pins as images and highlighting grow it).
    await expect
      .poll(() => alice.messageList.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight))
      .toBeLessThan(2)
    await expect(alice.header.getByTestId('presence-line')).toHaveText('offline')

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
