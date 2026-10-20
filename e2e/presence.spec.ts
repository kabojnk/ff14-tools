import { afterDevicesClose, expect, test } from './fixtures'
import { restoreStatuses } from './supabase'

// Going to the background touches Bea's last_seen_at; put her profile back (only if it changed).
afterDevicesClose(async () => {
  await restoreStatuses()
})

test.describe('Presence', () => {
  test('Bea stays online while any of her devices is in the foreground; with both away, Alice sees "last seen"', async ({
    alice,
    bea,
    secondDevice,
  }) => {
    const beaPhone = await secondDevice('bea')
    await bea.openChat()
    await beaPhone.openChat()
    await alice.openChat()
    await alice.showChat()
    const line = alice.header.getByTestId('presence-line')
    await expect(line).toHaveText('online', { timeout: 5_000 })

    // One device goes to the background: the other still counts.
    await bea.background()
    // Give the hidden device's presence change time to arrive, then check it didn't flip Bea offline.
    await alice.page.waitForTimeout(1_500)
    await expect(line).toHaveText('online')

    // Both away: Alice sees when Bea was last here.
    await beaPhone.background()
    await expect(line).toHaveText(/^last seen /, { timeout: 5_000 })

    // Back on one device: online again.
    await beaPhone.foreground()
    await expect(line).toHaveText('online', { timeout: 5_000 })
  })
})
