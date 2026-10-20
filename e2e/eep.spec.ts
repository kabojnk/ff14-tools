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
