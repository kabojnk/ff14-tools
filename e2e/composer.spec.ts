import { afterDevicesClose, expect, test } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS } from './users'

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

/** A 1×1 PNG: the upload itself is stubbed (e2e/stubs.ts) and answers with the fixture image. */
const PNG = {
  name: 'snap.png',
  mimeType: 'image/png',
  buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64'),
}

test.describe('composer', () => {
  test('a photo attached as a spoiler arrives blurred', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')

    await alice.page.getByLabel('Files to attach').setInputFiles(PNG)
    const tray = alice.page.getByRole('list', { name: 'Attachments' })
    await expect(tray.getByRole('listitem')).toHaveAttribute('data-status', 'done')
    const toggle = tray.getByRole('button', { name: 'Spoiler snap.png' })
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')

    const caption = unique('spoiler photo')
    await alice.send(caption)
    await expect(tray).toHaveCount(0)

    const photo = bea.messageRow(caption).locator('[data-media-index="0"]')
    await expect(photo).toHaveAttribute('data-spoiler', 'hidden', { timeout: 5_000 })
    await expect(alice.messageRow(caption).locator('[data-media-index="0"]')).toHaveAttribute('data-spoiler', 'hidden')
  })

  test('phones: Return adds a newline and does not send; the Send button sends', async ({ alice, bea }, testInfo) => {
    test.skip(testInfo.project.name !== 'webkit-iphone', 'the phone Return rule')
    await alice.openChat('Main')
    await bea.openChat('Main')
    const first = unique('line one')
    const second = 'line two'
    sentTexts.push(`${first}\n${second}`)

    await alice.composer.fill(first)
    await alice.composer.press('Enter')
    await alice.composer.pressSequentially(second)
    await expect(alice.composer).toHaveValue(`${first}\n${second}`)
    await expect(alice.messageRow(first)).toHaveCount(0)

    await alice.sendButton.click()
    await expect(alice.composer).toHaveValue('')
    await expect(bea.messageList.getByText(first)).toBeVisible({ timeout: 5_000 })
    await expect(bea.messageList.getByText(second)).toBeVisible()
  })

  test('desktop: Enter sends, Shift+Enter adds a newline', async ({ alice, bea }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium-desktop', 'the desktop Enter rule')
    await alice.openChat('Main')
    await bea.openChat('Main')
    const first = unique('desk one')
    sentTexts.push(`${first}\ndesk two`)

    await alice.composer.fill(first)
    await alice.composer.press('Shift+Enter')
    await alice.composer.pressSequentially('desk two')
    await expect(alice.composer).toHaveValue(`${first}\ndesk two`)
    await alice.composer.press('Enter')
    await expect(alice.composer).toHaveValue('')
    await expect(bea.messageList.getByText(first)).toBeVisible({ timeout: 5_000 })
  })

  test(':emoji: autocomplete: type a colon and a name, pick, and the emoji is sent', async ({ alice, bea }, testInfo) => {
    await alice.openChat()
    await bea.openChat()
    const base = `autocomplete ${Date.now()}`
    await alice.composer.click()
    await alice.composer.pressSequentially(`${base} :jo`)
    const options = alice.page.getByRole('listbox', { name: 'Emoji suggestions' }).getByRole('option')
    await expect(options.first()).toContainText(':joy:')
    await alice.page.screenshot({ path: testInfo.outputPath('autocomplete.png') })
    await options.first().click()
    await expect(alice.composer).toHaveValue(new RegExp(`^${base} 😂 $`))
    // A finished :name: converts as it's typed.
    await alice.composer.pressSequentially(':thumbsup:')
    await expect(alice.composer).toHaveValue(new RegExp(`^${base} 😂 👍`))

    const text = (await alice.composer.inputValue()).trim()
    sentTexts.push(text)
    await alice.page.getByRole('button', { name: 'Send', exact: true }).click()
    await expect(bea.message(text)).toBeVisible({ timeout: 5_000 })
  })

  test('a reply reaches the other person with the quoted original', async ({ alice, bea }) => {
    await alice.openChat('Main')
    await bea.openChat('Main')
    const item = await bea.openMessageActions(bea.messageRow('Seed: hi Bea').locator('[data-bubble]'))
    await item('Reply').click()
    await expect(bea.page.getByText('Replying to').filter({ visible: true })).toBeVisible()

    const answer = unique('answering you')
    await bea.send(answer)
    await expect(bea.page.getByText('Replying to').filter({ visible: true })).toHaveCount(0)

    const strip = alice.messageRow(answer).locator('[data-reply-strip]')
    await expect(strip).toBeVisible({ timeout: 5_000 })
    await expect(strip).toContainText('Alice')
    await expect(strip).toContainText('Seed: hi Bea')
  })

  test('Edit opens in the composer under "Editing message"; Esc cancels and keeps the draft', async ({ alice }) => {
    await alice.openChat('Main')
    const draft = 'half a thought'
    await alice.composer.fill(draft)
    const item = await alice.openMessageActions(alice.messageRow('Seed: hi Bea').locator('[data-bubble]'))
    await item('Edit').click()
    await expect(alice.page.getByText('Editing message')).toBeVisible()
    const editor = alice.page.getByRole('textbox', { name: 'Edit message' })
    await expect(editor).toHaveValue('Seed: hi Bea')
    await editor.press('Escape')
    await expect(alice.page.getByText('Editing message')).toHaveCount(0)
    await expect(alice.composer).toHaveValue(draft)
  })
})
