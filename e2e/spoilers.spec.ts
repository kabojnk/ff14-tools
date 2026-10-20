import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS } from './users'

/** Alice's seeded photo in Main (test-image.png). */
const SEED_IMAGE = 'cccccccc-0000-4000-8000-000000000011'

const sentTexts: string[] = []

afterDevicesClose(async () => {
  const svc = serviceClient()
  if (sentTexts.length) {
    const { error } = await svc.from('messages').delete().eq('conversation_id', IDS.conversation).in('content', sentTexts.splice(0))
    if (error) throw new Error(error.message)
  }
  // restore() also puts the seed photo back unmarked if a test left it marked.
  await restore()
})

const unique = (label: string) => {
  const text = `${label} ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`
  sentTexts.push(text)
  return text
}

/** The seed photo's cell in a user's list. */
const seedPhoto = (user: ChatUser) => user.messageList.locator(`[data-message-id="${SEED_IMAGE}"] [data-media-index="0"]`)

test.describe('message actions and spoilers', () => {
  test('either person can mark a photo as a spoiler after posting; it blurs live for both', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    await expect(seedPhoto(alice)).not.toHaveAttribute('data-spoiler')

    // Bea marks Alice's photo (not her own message: either member may).
    const item = await bea.openMessageActions(seedPhoto(bea))
    await item('Mark as spoiler').click()
    await expect(seedPhoto(bea)).toHaveAttribute('data-spoiler', 'hidden')
    await expect(seedPhoto(alice)).toHaveAttribute('data-spoiler', 'hidden', { timeout: 5_000 })

    // Alice reveals it for herself only.
    await seedPhoto(alice).getByRole('button', { name: 'Show spoiler' }).click()
    await expect(seedPhoto(alice)).toHaveAttribute('data-spoiler', 'revealed')
    await expect(seedPhoto(bea)).toHaveAttribute('data-spoiler', 'hidden')

    // Bea takes it off again: clear for both.
    const again = await bea.openMessageActions(seedPhoto(bea))
    await again('Remove spoiler').click()
    await expect(seedPhoto(bea)).not.toHaveAttribute('data-spoiler')
    await expect(seedPhoto(alice)).not.toHaveAttribute('data-spoiler', { timeout: 5_000 })
  })

  test('the actions offer Reply, Copy and Pin; Reply sets the reply, and only my messages offer Edit and Delete', async ({ alice }) => {
    await alice.openChat('Main')
    const theirs = alice.messageRow('Seed: hey Alice').locator('[data-bubble]')
    const item = await alice.openMessageActions(theirs)
    for (const name of ['Reply', 'Copy text', 'Pin']) await expect(item(name)).toBeVisible()
    await expect(item('Edit')).toHaveCount(0)
    await expect(item('Delete')).toHaveCount(0)
    await item('Reply').click()
    await expect(alice.page.getByText('Replying to').filter({ visible: true })).toBeVisible()

    const mine = alice.messageRow('Seed: hi Bea').locator('[data-bubble]')
    const own = await alice.openMessageActions(mine)
    await expect(own('Edit')).toBeVisible()
    await expect(own('Delete')).toBeVisible()
  })

  test('Edit opens the editor; the change reaches the other person', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const text = unique('edit me')
    await alice.send(text)
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })

    const item = await alice.openMessageActions(alice.messageRow(text).locator('[data-bubble]'))
    await item('Edit').click()
    const edited = unique('edited')
    const editor = alice.page.getByRole('textbox', { name: 'Edit message' })
    await expect(alice.page.getByText('Editing message')).toBeVisible()
    await editor.fill(edited)
    await alice.submit()
    await expect(bea.message(edited)).toBeVisible({ timeout: 5_000 })
  })

  test('Delete asks first, then removes the message for both', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const text = unique('delete me')
    await alice.send(text)
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })

    const item = await alice.openMessageActions(alice.messageRow(text).locator('[data-bubble]'))
    await item('Delete').click()
    await expect(alice.page.getByText('Delete this message?')).toBeVisible()
    await item('Delete').click()
    await expect(alice.message(text)).toHaveCount(0)
    await expect(bea.message(text)).toHaveCount(0, { timeout: 5_000 })
  })

  test('desktop keyboard: R on a focused message replies, E edits mine', async ({ alice }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'keyboard shortcuts are a desktop feature')
    await alice.openChat('Main')
    const theirs = alice.messageRow('Seed: hey Alice').getByRole('group', { name: 'Message' })
    await theirs.focus()
    await alice.page.keyboard.press('r')
    await expect(alice.page.getByText('Replying to').filter({ visible: true })).toBeVisible()

    const mine = alice.messageRow('Seed: hi Bea').getByRole('group', { name: 'Message' })
    await mine.focus()
    await alice.page.keyboard.press('e')
    const editor = alice.page.getByRole('textbox', { name: 'Edit message' })
    await expect(editor).toHaveValue('Seed: hi Bea')
    await editor.press('Escape')
    await expect(editor).toHaveCount(0)
  })

  test('phones: a short tap does not open the sheet', async ({ alice }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-iphone', 'long-press is the phone gesture')
    await alice.openChat('Main')
    const bubble = alice.messageRow('Seed: hey Alice').locator('[data-bubble]')
    await bubble.dispatchEvent('pointerdown', { pointerType: 'touch', isPrimary: true })
    await alice.page.waitForTimeout(150)
    await bubble.dispatchEvent('pointerup', { pointerType: 'touch', isPrimary: true })
    await alice.page.waitForTimeout(500)
    await expect(alice.page.getByRole('dialog', { name: 'Message actions' })).toHaveCount(0)
  })
})
