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
