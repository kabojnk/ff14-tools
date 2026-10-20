import { randomUUID } from 'node:crypto'
import { afterDevicesClose, expect, test } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS } from './users'

// Messages this file created: deleted (with anything sent under these texts) after each test.
const createdIds: string[] = []
const sentTexts: string[] = []

afterDevicesClose(async () => {
  const svc = serviceClient()
  if (createdIds.length) {
    const { error } = await svc.from('messages').delete().in('id', createdIds.splice(0))
    if (error) throw new Error(error.message)
  }
  if (sentTexts.length) {
    const { error } = await svc.from('messages').delete().eq('conversation_id', IDS.conversation).in('content', sentTexts.splice(0))
    if (error) throw new Error(error.message)
  }
  await restore()
})

const unique = (label: string) => {
  const text = `${label} ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`
  sentTexts.push(text)
  return text
}

/** Bea's position in a space, straight from the database. */
async function beaReadAt(space: 'main' | 'schist'): Promise<number> {
  const { data, error } = await serviceClient()
    .from('read_positions')
    .select('last_read_at')
    .eq('conversation_id', IDS.conversation)
    .eq('user_id', IDS.users.bea)
    .eq('space', space)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data ? Date.parse((data as { last_read_at: string }).last_read_at) : 0
}

test.describe('Cozy message list', () => {
  test('my message shows ✓ once sent, then ✓✓ after Bea opens the space', async ({ alice, bea }) => {
    await bea.openChat('Schist')
    await alice.openChat('Main')

    const text = unique('tick me')
    await alice.send(text)
    const tick = alice.messageRow(text).locator('[data-tick]')
    await expect(tick).toHaveAttribute('data-tick', 'sent')
    await expect(tick.getByRole('img', { name: 'Sent' })).toBeVisible()

    await bea.openSpace('Main')
    await expect(bea.message(text)).toBeVisible()
    await expect(tick).toHaveAttribute('data-tick', 'read', { timeout: 5_000 })
    await expect(tick.getByRole('img', { name: 'Read' })).toBeVisible()
  })

  test("with Bea's read receipts off, my message stays at ✓ after she reads it", async ({ alice, bea }) => {
    const { error } = await serviceClient().from('profiles').update({ read_receipts: false }).eq('id', IDS.users.bea)
    if (error) throw new Error(error.message)

    await bea.openChat('Schist')
    await alice.openChat('Main')
    const text = unique('no receipts')
    await alice.send(text)
    const tick = alice.messageRow(text).locator('[data-tick]')
    await expect(tick).toHaveAttribute('data-tick', 'sent')

    const sentAt = Date.now() - 5_000
    await bea.openSpace('Main')
    await expect(bea.message(text)).toBeVisible()
    // Bea's read really landed on the server…
    await expect.poll(() => beaReadAt('main'), { timeout: 5_000 }).toBeGreaterThan(sentAt)
    // …and Alice still sees a single tick.
    await alice.page.waitForTimeout(1_000)
    await expect(tick).toHaveAttribute('data-tick', 'sent')
  })

  test('opening a space with unread messages shows the new-messages divider above them', async ({ alice, bea }) => {
    await bea.openChat('Main')
    await alice.openChat('Schist')
    const text = unique('unread for bea')
    await alice.send(text)
    await expect(alice.message(text)).toBeVisible()
    await expect(bea.spaceButton('Schist')).toHaveAttribute('data-unread', 'true', { timeout: 5_000 })

    await bea.openSpace('Schist')
    const divider = bea.page.locator('[data-new-divider]').filter({ visible: true })
    await expect(divider).toBeVisible()
    await expect(divider).toHaveAccessibleName('New messages')
    const dividerBox = await divider.boundingBox()
    const messageBox = await bea.message(text).boundingBox()
    expect(dividerBox!.y).toBeLessThan(messageBox!.y)
  })

  test('jump to latest appears when scrolled up and counts new arrivals', async ({ alice, bea }) => {
    // Enough of Bea's own history in Main to scroll (hers, so none of it is unread for her).
    const base = Date.now() - 20 * 60_000
    const rows = Array.from({ length: 24 }, (_, i) => {
      const id = randomUUID()
      createdIds.push(id)
      return {
        id,
        conversation_id: IDS.conversation,
        space: 'main',
        session_id: IDS.sessions.current,
        author_id: IDS.users.bea,
        content: `history ${i}\nline two\nline three`,
        attachments: [],
        type: 'text',
        created_at: new Date(base + i * 1_000).toISOString(),
      }
    })
    const { error } = await serviceClient().from('messages').insert(rows)
    if (error) throw new Error(error.message)

    await alice.openChat('Main')
    await bea.openChat('Main')
    const jump = bea.page.locator('[data-jump-to-latest]')
    await expect(jump).toHaveCount(0)

    await bea.messageList.evaluate((el) => {
      el.scrollTop = 0
    })
    await expect(jump).toBeVisible()
    await expect(jump).toHaveAccessibleName('Jump to latest')

    const first = unique('arrival one')
    const second = unique('arrival two')
    await alice.send(first)
    await expect(alice.message(first)).toBeVisible()
    await alice.send(second)
    await expect(jump).toHaveAccessibleName('Jump to latest, 2 new messages', { timeout: 5_000 })
    await expect(jump.locator('[data-count]')).toHaveText('2')

    await jump.click()
    await expect(bea.message(second)).toBeInViewport()
    await expect(jump).toHaveCount(0)
  })

  test('a code block renders highlighted, with a Copy button', async ({ alice, bea }) => {
    await bea.openChat('Main')
    await alice.openChat('Main')
    const marker = `marker${Date.now()}`
    const content = `\`\`\`js\nconst ${marker} = 1\n\`\`\``
    sentTexts.push(content)
    await alice.composer.fill(content)
    await alice.submit()

    for (const user of [alice, bea]) {
      const block = user.messageList.locator('figure.md-code').filter({ hasText: marker })
      await expect(block).toBeVisible({ timeout: 5_000 })
      await expect(block.locator('.hljs-keyword').first()).toHaveText('const')
      await expect(block.getByRole('button', { name: 'Copy code' })).toHaveCount(1)
    }
  })
})
