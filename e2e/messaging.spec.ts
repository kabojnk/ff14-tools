import { expect, test } from './fixtures'

test('messages arrive live for the other person, both ways', async ({ alice, bea }) => {
  await alice.openChat()
  await bea.openChat()

  const hello = `hello from alice ${Date.now()}`
  await alice.send(hello)
  await expect(alice.message(hello)).toBeVisible()
  await expect(alice.composer).toHaveValue('')
  await expect(bea.message(hello)).toBeVisible({ timeout: 5_000 })

  const reply = `reply from bea ${Date.now()}`
  await bea.send(reply)
  await expect(alice.message(reply)).toBeVisible({ timeout: 5_000 })
})

test('an unsent draft survives crossing the desktop breakpoint (e.g. rotating an iPhone)', async ({ alice }) => {
  await alice.openChat()
  const draft = `half-typed thought ${Date.now()}`
  await alice.composer.fill(draft)

  // Flip across the 768px breakpoint: phone ↔ desktop. Only one layout is mounted, so the composer remounts.
  const width = alice.page.viewportSize()!.width
  await alice.page.setViewportSize(width < 768 ? { width: 1280, height: 800 } : { width: 393, height: 852 })

  // The mobile layout opens on the Spaces screen; reopen the space if needed.
  if (!(await alice.composer.isVisible())) await alice.openSpace('Main')
  await expect(alice.composer).toHaveValue(draft)
})

test('the typing indicator clears as soon as the message is sent, and returns on the next keystroke', async ({ alice, bea }) => {
  await alice.openChat()
  await bea.openChat()
  const typing = alice.page.getByText('Bea is typing')

  const text = `on my way ${Date.now()}`
  await bea.composer.pressSequentially(text)
  await expect(typing).toBeVisible({ timeout: 5_000 })
  await bea.composer.press('Enter')
  await expect(alice.message(text)).toBeVisible({ timeout: 5_000 })
  // Well inside the 5 s expiry, so it was the send that cleared it, not the timeout.
  await expect(typing).toBeHidden({ timeout: 1_000 })

  // Still inside the 3 s typing throttle: the next keystroke must announce again straight away.
  await bea.composer.pressSequentially('and')
  await expect(typing).toBeVisible({ timeout: 2_000 })

  // Clearing the box counts as stopping.
  await bea.composer.fill('')
  await expect(typing).toBeHidden({ timeout: 1_000 })
})

test('a slash command does not leave a typing indicator behind', async ({ alice, bea }) => {
  await alice.openChat()
  await bea.openChat()
  const typing = alice.page.getByText('Bea is typing')

  await bea.composer.pressSequentially('/eep')
  await expect(typing).toBeVisible({ timeout: 5_000 })
  await bea.composer.press('Enter')
  await expect(bea.eepHeading).toBeVisible()
  await expect(typing).toBeHidden({ timeout: 1_000 })
})
