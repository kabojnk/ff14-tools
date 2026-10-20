import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS } from './users'

// Messages this file sent, by their full content (their reactions go with them, by cascade).
const sentContents: string[] = []

afterDevicesClose(async () => {
  if (sentContents.length) {
    const { error } = await serviceClient()
      .from('messages')
      .delete()
      .eq('conversation_id', IDS.conversation)
      .in('content', sentContents.splice(0))
    if (error) throw new Error(error.message)
  }
  await restore()
})

const unique = (label: string) => `${label} ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`

/** A message row in the open space whose text includes `text` (custom emoji render as images inside it). */
const rowWith = (user: ChatUser, text: string) =>
  user.page.locator('[data-realtime] [data-message-id]').filter({ hasText: text })

/** Opens the full emoji picker from a message's quick-react bar (hover toolbar on desktop, long-press on phones). */
async function openReactionPicker(user: ChatUser, text: string) {
  const bubble = user.messageRow(text).locator('[data-bubble]')
  if (await user.isPhone()) {
    await user.longPress(bubble)
  } else {
    await bubble.hover()
    await user.messageRow(text).getByRole('toolbar', { name: 'Message actions' }).getByRole('button', { name: 'React' }).click()
  }
  await user.page.getByRole('toolbar', { name: 'Quick reactions' }).getByRole('button', { name: 'More emoji' }).click()
  const picker = user.page.getByRole('dialog', { name: 'Emoji picker' })
  await expect(picker).toBeVisible()
  return picker
}

test.describe('emoji picker', () => {
  test('Alice reacts with a custom emoji and Bea sees its picture on the chip', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const text = unique('custom react')
    sentContents.push(text)
    await alice.send(text)
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })

    const picker = await openReactionPicker(alice, text)
    await picker.getByRole('button', { name: ':moogle:', exact: true }).click()
    await expect(picker).toBeHidden()

    await expect(alice.messageRow(text).getByRole('button', { name: ':moogle: 1', exact: true })).toHaveAttribute('aria-pressed', 'true')
    const beaChip = bea.messageRow(text).getByRole('button', { name: ':moogle: 1', exact: true })
    await expect(beaChip).toBeVisible({ timeout: 5_000 })
    await expect(beaChip.locator('img')).toHaveAttribute('src', /moogle\.png$/)
  })

  test('Alice inserts a custom emoji into a message and Bea sees the picture', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const label = unique('custom in text')
    sentContents.push(`${label} :moogle:`)

    await alice.composer.fill(`${label} `)
    await alice.page.getByRole('button', { name: 'Pick an emoji' }).click()
    const picker = alice.page.getByRole('dialog', { name: 'Emoji picker' })
    await picker.getByRole('button', { name: ':moogle:', exact: true }).click()
    await expect(alice.composer).toHaveValue(`${label} :moogle:`)
    // The picker stays open for more picks; phones send with the button, desktop with Enter.
    await expect(picker).toBeVisible()
    await alice.submit()

    await expect(rowWith(bea, label).locator('img[alt=":moogle:"]')).toBeVisible({ timeout: 5_000 })
    await expect(rowWith(bea, label).locator('img[alt=":moogle:"]')).toHaveAttribute('src', /moogle\.png$/)
  })
})
