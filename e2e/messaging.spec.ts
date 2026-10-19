import { expect, openUser, test } from './fixtures'

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

test('an unsent draft survives crossing the desktop breakpoint (resizing a desktop window)', async ({ alice }, testInfo) => {
  // A coarse pointer never crosses the breakpoint, so only the desktop project can.
  test.skip(testInfo.project.name !== 'chromium-desktop', 'needs a fine pointer')
  await alice.openChat()
  const draft = `half-typed thought ${Date.now()}`
  await alice.composer.fill(draft)

  // Flip across the 900px breakpoint: desktop → phone → desktop. Only one layout is mounted, so the composer remounts.
  await alice.page.setViewportSize({ width: 393, height: 852 })
  await expect(alice.page.locator('[data-layout="phone"]')).toBeVisible()
  await expect(alice.composer).toHaveValue(draft)

  await alice.page.setViewportSize({ width: 1280, height: 800 })
  await expect(alice.page.locator('[data-layout="desktop"]')).toBeVisible()
  await expect(alice.composer).toHaveValue(draft)
})

test('a landscape phone (wider than 900px, touch) keeps the phone layout', async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'Chromium emulates the touch landscape phone')
  const { context, user } = await openUser(browser, testInfo, 'alice', {
    viewport: { width: 932, height: 430 },
    hasTouch: true,
    isMobile: true,
  })
  try {
    await user.openChat()
    await expect(user.page.locator('[data-layout="phone"]')).toBeVisible()
    await expect(user.page.getByRole('button', { name: 'Back to chats' })).toBeVisible()
    await expect(user.page.locator('[data-layout="desktop"]')).toHaveCount(0)
  } finally {
    await context.close()
  }
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
