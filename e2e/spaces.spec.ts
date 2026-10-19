import { afterDevicesClose, expect, test } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS } from './users'

const sent: string[] = []

afterDevicesClose(async () => {
  if (sent.length) {
    const { error } = await serviceClient()
      .from('messages')
      .delete()
      .eq('conversation_id', IDS.conversation)
      .in('content', sent.splice(0))
    if (error) throw new Error(error.message)
  }
  await restore()
})

test.describe('Spaces', () => {
  test('a message in Schist is unread for Bea on every device until she reads it', async ({ alice, bea, secondDevice }) => {
    const beaPhone = await secondDevice('bea')

    // Start from "read": Bea looks at Schist, then sits in Main. Her other device shows the space list.
    await bea.openChat('Schist')
    await bea.openSpace('Main')
    await beaPhone.openChat('Main')
    await beaPhone.showSpaces()
    await expect(beaPhone.spaceButton('Schist')).toHaveAttribute('data-unread', 'false')

    await alice.openChat('Schist')
    const text = `schist only ${Date.now()}`
    sent.push(text)
    await alice.send(text)
    await expect(alice.message(text)).toBeVisible()

    await expect(beaPhone.spaceButton('Schist')).toHaveAttribute('data-unread', 'true', { timeout: 5_000 })
    // Delivered by now, and it stays in Schist.
    await expect(bea.message(text)).toHaveCount(0)
    await bea.showSpaces()
    await expect(bea.spaceButton('Schist')).toHaveAttribute('data-unread', 'true')

    // Bea reads it on one device; the other device catches up live, without reloading.
    await bea.openSpace('Schist')
    await expect(bea.message(text)).toBeVisible()
    await expect(beaPhone.spaceButton('Schist')).toHaveAttribute('data-unread', 'false', { timeout: 5_000 })
    await bea.showSpaces()
    await expect(bea.spaceButton('Schist')).toHaveAttribute('data-unread', 'false')
  })

  test('typing shows only in the space it happens in', async ({ alice, bea, secondDevice }) => {
    const beaInMain = await secondDevice('bea')
    await bea.openChat('Schist')
    await beaInMain.openChat('Main')
    await alice.openChat('Schist')

    await alice.composer.pressSequentially('typing in schist')

    // All three checks fall inside one 5 s typing window: the indicator is still up after the negative check.
    await expect(bea.typing('Alice')).toBeVisible({ timeout: 5_000 })
    await expect(beaInMain.typing('Alice')).toHaveCount(0)
    await expect(bea.typing('Alice')).toBeVisible()
  })
})
