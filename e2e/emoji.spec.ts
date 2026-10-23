import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import type { Locator } from '@playwright/test'
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

  test('Alice adds a custom emoji from the picker; Bea sees it live and deletes it; Alice sees it go', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const alicePicker = await openComposerPicker(alice)
    const beaPicker = await openComposerPicker(bea)

    // The tile opens the photo picker straight away.
    const [chooser] = await Promise.all([
      alice.page.waitForEvent('filechooser'),
      alicePicker.getByRole('button', { name: 'Add emoji', exact: true }).click(),
    ])
    await chooser.setFiles('e2e/fixtures/media/test-image.png')

    const crop = alice.page.getByRole('dialog', { name: 'Crop' })
    await expect(crop.getByRole('button', { name: 'Next' })).toBeEnabled()
    await crop.getByRole('button', { name: 'Next' }).click()

    const naming = alice.page.getByRole('dialog', { name: 'Name it' })
    const field = naming.getByRole('textbox', { name: 'Emoji name' })
    const add = naming.getByRole('button', { name: 'Add emoji', exact: true })
    // A taken name says so and can't be added.
    await field.fill('moogle')
    await expect(naming.getByText(':moogle: is already taken.')).toBeVisible()
    await expect(add).toBeDisabled()
    await field.fill('Test Wave')
    await expect(field).toHaveValue('test_wave')
    await expect(naming.getByText(':test_wave: is free')).toBeVisible()
    await add.click()

    // The sheet closes onto the picker, which shows the new emoji highlighted.
    await expect(naming).toBeHidden()
    await expect(alicePicker).toBeVisible()
    const aliceCell = alicePicker.getByRole('button', { name: ':test_wave:', exact: true })
    await expect(aliceCell).toBeVisible()
    await expect(aliceCell.locator('img')).toHaveAttribute('src', /test-image\.png$/)

    // Bea's open picker gets it without a reload, and she deletes it.
    const beaCell = beaPicker.getByRole('button', { name: ':test_wave:', exact: true })
    await expect(beaCell).toBeVisible({ timeout: 5_000 })
    await deleteCustomEmoji(bea, beaPicker, beaCell, 'test_wave')
    await expect(beaCell).toHaveCount(0)

    // Alice's picker drops it.
    await expect(aliceCell).toHaveCount(0, { timeout: 5_000 })
  })
})

/** Opens the composer's emoji picker (a panel under the composer on phones, a popover on desktop). */
async function openComposerPicker(user: ChatUser) {
  await user.page.getByRole('button', { name: 'Pick an emoji' }).click()
  const picker = user.page.getByRole('dialog', { name: 'Emoji picker' })
  await expect(picker).toBeVisible()
  return picker
}

/** Deletes a custom emoji from the picker: its hover card's trash on desktop, long-press → Delete on phones; then confirms. */
async function deleteCustomEmoji(user: ChatUser, picker: Locator, cell: Locator, name: string) {
  if (await user.isPhone()) {
    await user.longPress(cell)
    await picker.getByRole('menu', { name: `:${name}:` }).getByRole('menuitem', { name: 'Delete' }).click()
  } else {
    await cell.hover()
    await picker.getByRole('button', { name: `Delete :${name}:`, exact: true }).click()
  }
  const confirm = picker.getByRole('alertdialog', { name: `Delete :${name}:` })
  await expect(confirm).toContainText(`Delete :${name}: for both of you?`)
  await confirm.getByRole('button', { name: 'Delete', exact: true }).click()
}
