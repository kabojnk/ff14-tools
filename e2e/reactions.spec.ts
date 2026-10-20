import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS } from './users'

// Messages this file sent (their reactions go with them, by cascade).
const sentTexts: string[] = []

afterDevicesClose(async () => {
  if (sentTexts.length) {
    const { error } = await serviceClient()
      .from('messages')
      .delete()
      .eq('conversation_id', IDS.conversation)
      .in('content', sentTexts.splice(0))
    if (error) throw new Error(error.message)
  }
  await restore()
})

const unique = (label: string) => {
  const text = `${label} ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`
  sentTexts.push(text)
  return text
}

/** A reaction chip under a message: "❤️ 2". */
const chip = (user: ChatUser, text: string, emoji: string, count: number) =>
  user.messageRow(text).getByRole('button', { name: `${emoji} ${count}`, exact: true })

/**
 * The first reaction on a message, from its action toolbar (interim: the legacy toolbar until Task 10's
 * hover toolbar and long-press sheet replace it).
 */
async function reactFromToolbar(user: ChatUser, text: string, emoji: string) {
  const row = user.messageRow(text)
  await row.locator('.group').first().hover()
  await row.getByTitle('Add Reaction').click()
  await row.getByRole('button', { name: emoji, exact: true }).click()
}

test.describe('reactions', () => {
  test('a reaction arrives live; the other person adds to it, then takes theirs back', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const text = unique('react to me')
    await alice.send(text)
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })

    await reactFromToolbar(alice, text, '❤️')
    await expect(chip(alice, text, '❤️', 1)).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(bea, text, '❤️', 1)).toHaveAttribute('aria-pressed', 'false', { timeout: 5_000 })

    await chip(bea, text, '❤️', 1).click()
    await expect(chip(bea, text, '❤️', 2)).toHaveAttribute('aria-pressed', 'true')
    await expect(chip(alice, text, '❤️', 2)).toBeVisible({ timeout: 5_000 })

    await chip(bea, text, '❤️', 2).click()
    await expect(chip(bea, text, '❤️', 1)).toHaveAttribute('aria-pressed', 'false')
    // The DELETE event carries only the id: Alice's store finds the message through its index.
    await expect(chip(alice, text, '❤️', 1)).toHaveAttribute('aria-pressed', 'true', { timeout: 5_000 })
  })

  test('two different emoji make two chips, in order, and they survive a reload', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const text = unique('two reactions')
    await alice.send(text)
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })

    await reactFromToolbar(alice, text, '❤️')
    await expect(chip(alice, text, '❤️', 1)).toBeVisible()
    // The add chip (on desktop it shows on hover) opens the quick bar.
    await alice.messageRow(text).hover()
    await alice.messageRow(text).getByRole('button', { name: 'Add reaction', exact: true }).click()
    await alice.page.getByRole('toolbar', { name: 'Quick reactions' }).getByRole('button', { name: 'React with 😂' }).click()
    await expect(chip(alice, text, '😂', 1)).toHaveAttribute('aria-pressed', 'true')

    const chips = bea.messageRow(text).locator('[data-reactions] [data-emoji]')
    await expect(chips).toHaveCount(2, { timeout: 5_000 })
    await expect(chips.nth(0)).toHaveAccessibleName('❤️ 1')
    await expect(chips.nth(1)).toHaveAccessibleName('😂 1')

    await bea.page.reload()
    await bea.unlockIfLocked()
    await bea.openSpace('Main')
    await expect(bea.messageRow(text).locator('[data-reactions] [data-emoji]')).toHaveCount(2)
  })

  test('realtime channels stay few however many messages are loaded (no channel per message)', async ({ alice }) => {
    // Plenty of messages, so one channel per message would show.
    const label = unique('channel count')
    const base = Date.now() - 60_000
    const rows = Array.from({ length: 20 }, (_, i) => ({
      conversation_id: IDS.conversation,
      space: 'main',
      session_id: IDS.sessions.current,
      author_id: IDS.users.bea,
      content: label,
      attachments: [],
      type: 'text',
      created_at: new Date(base + i * 1_000).toISOString(),
    }))
    const { error } = await serviceClient().from('messages').insert(rows)
    if (error) throw new Error(error.message)

    await alice.openChat('Main')
    await expect(alice.messageList.getByText(label, { exact: true })).toHaveCount(20)
    const count = await alice.page.evaluate(
      () => (window as Window & { __realtimeChannelCount?: () => number }).__realtimeChannelCount?.() ?? -1,
    )
    expect(count).toBeGreaterThan(0)
    expect(count).toBeLessThanOrEqual(6)
  })
})
