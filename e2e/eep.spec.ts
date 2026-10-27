import { EEP_PASSPHRASE } from './users'
import { expect, test } from './fixtures'

test('/eep disguises the app and the passphrase brings the chat back', async ({ alice }) => {
  await alice.openChat()
  await alice.send('/eep')
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.composer).toBeHidden()

  await alice.enterPassphrase(EEP_PASSPHRASE)
  await expect(alice.composer).toBeVisible()
  await expect(alice.eepHeading).toBeHidden()
})

test('a wrong passphrase keeps the FF14 tool showing', async ({ alice }) => {
  await alice.openChat()
  await alice.send('/eep')
  await alice.enterPassphrase('The Binding Coil Turn 5')
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.composer).toBeHidden()
})

test('the Eep! button shows the disguise immediately', async ({ alice }) => {
  await alice.openChat()
  await alice.header.getByRole('button', { name: 'Eep!' }).click()
  // No confirmation step: the disguise is up straight away.
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.composer).toBeHidden()
  await expect(alice.page.locator('[data-chat-header]')).toBeHidden()

  await alice.enterPassphrase(EEP_PASSPHRASE)
  await expect(alice.composer).toBeVisible()
})

test('the disguise covers an open sheet, which comes back as it was', async ({ alice }) => {
  await alice.openChat()
  await alice.openProfileEditor()
  const nickname = alice.profileEditor.locator('#profile-nickname')
  await nickname.fill('Half typed')
  // Double-Esc: the first asks "Discard your changes?", the second puts the disguise up.
  await alice.page.keyboard.press('Escape')
  await alice.page.keyboard.press('Escape')
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.profileEditor).toBeHidden()
  await expect(alice.page.getByText('Half typed')).toHaveCount(0)

  await alice.enterPassphrase(EEP_PASSPHRASE)
  await expect(alice.profileEditor).toBeVisible()
  await expect(nickname).toHaveValue('Half typed')
})

test('a phone puts the disguise up as soon as it loses focus, but not for its own photo picker', async ({ alice }, testInfo) => {
  test.skip(testInfo.project.name !== 'webkit-iphone', 'phones only: a desktop keeps the chat when the window loses focus')
  await alice.openChat()

  // Opening the attach picker takes the focus too; that leaves the chat up.
  await alice.page.locator('[data-composer] input[type="file"]').evaluate((input) => {
    input.addEventListener('click', (e) => e.preventDefault(), { once: true })
    ;(input as HTMLInputElement).click()
    window.dispatchEvent(new FocusEvent('blur'))
  })
  await expect(alice.composer).toBeVisible()
  await alice.page.evaluate(() => window.dispatchEvent(new FocusEvent('focus')))

  // Leaving the app: the window loses focus before (or without) the page being hidden.
  await alice.page.evaluate(() => window.dispatchEvent(new FocusEvent('blur')))
  await expect(alice.eepHeading).toBeVisible()
  await expect(alice.composer).toBeHidden()
})
