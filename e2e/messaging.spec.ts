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
