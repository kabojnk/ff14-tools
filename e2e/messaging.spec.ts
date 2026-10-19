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
