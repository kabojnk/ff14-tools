import { afterDevicesClose, expect, test } from './fixtures'
import { restore, serviceClient, userClient } from './supabase'
import { IDS } from './users'

// A cached old app is channel-based: it knows channel IDs and sessions, not conversations or spaces.

const created: string[] = []

afterDevicesClose(async () => {
  if (created.length) {
    const { error } = await serviceClient().from('messages').delete().in('id', created.splice(0))
    if (error) throw new Error(error.message)
  }
  await restore()
})

test.describe('Old-app compatibility', () => {
  test('a message sent the old way (channel only) arrives live in Main', async ({ alice }) => {
    await alice.openChat('Main')

    const old = await userClient('bea')
    // The old MessageInput: the newest visible session of the channel, then an insert with channel_id only.
    const { data: session, error: sessionError } = await old
      .from('sessions')
      .select('id')
      .eq('channel_id', IDS.channels.general)
      .eq('visible', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .single()
    if (sessionError) throw new Error(sessionError.message)

    const text = `from the old app ${Date.now()}`
    const { data, error } = await old
      .from('messages')
      .insert({
        channel_id: IDS.channels.general,
        session_id: (session as { id: string }).id,
        author_id: IDS.users.bea,
        content: text,
      })
      .select('id')
      .single()
    if (error) throw new Error(error.message)
    created.push((data as { id: string }).id)
    await old.auth.signOut({ scope: 'local' })

    await expect(alice.message(text)).toBeVisible({ timeout: 5_000 })
  })

  test("the old app's change_sheets clears both spaces", async ({ alice, secondDevice }) => {
    const aliceSchist = await secondDevice('alice')
    await alice.openChat('Main')
    await aliceSchist.openChat('Schist')
    await expect(alice.message('Seed: hi Bea')).toBeVisible()
    await expect(aliceSchist.message('Seed: schist hello')).toBeVisible()

    const old = await userClient('bea')
    const { error } = await old.rpc('change_sheets', { p_channel_id: IDS.channels.general })
    if (error) throw new Error(error.message)
    await old.auth.signOut({ scope: 'local' })

    await expect(alice.message('Seed: hi Bea')).toHaveCount(0, { timeout: 5_000 })
    await expect(aliceSchist.message('Seed: schist hello')).toHaveCount(0, { timeout: 5_000 })
  })
})
