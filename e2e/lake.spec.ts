import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restore, serviceClient } from './supabase'
import { IDS, LAKE_PASSWORD } from './users'

afterDevicesClose(async () => {
  await restore()
})

function field(user: ChatUser, label: string) {
  return user.page.getByLabel(label, { exact: true }).filter({ visible: true })
}

function notice(user: ChatUser, text: string) {
  return user.page.getByText(text, { exact: true }).filter({ visible: true })
}

async function hiddenSeedSessionVisible() {
  const { data, error } = await serviceClient().from('sessions').select('visible').eq('id', IDS.sessions.hidden).single()
  if (error) throw new Error(error.message)
  return (data as { visible: boolean }).visible
}

test.describe('Lake', () => {
  test('dragging clears both spaces live on every device; drafts survive', async ({ alice, bea, secondDevice }) => {
    const beaSchist = await secondDevice('bea')
    await alice.openChat()
    await bea.openChat('Main')
    await beaSchist.openChat('Schist')
    await expect(bea.message('Seed: hi Bea')).toBeVisible()
    await expect(beaSchist.message('Seed: schist hello')).toBeVisible()

    const draft = `after the drag ${Date.now()}`
    await bea.composer.fill(draft)

    await alice.dragTheLake()
    await expect(alice.message('Seed: hi Bea')).toHaveCount(0)
    await expect(bea.message('Seed: hi Bea')).toHaveCount(0, { timeout: 5_000 })
    await expect(beaSchist.message('Seed: schist hello')).toHaveCount(0, { timeout: 5_000 })
    await expect(bea.composer).toHaveValue(draft)

    // The draft goes into the new session and both people see it.
    await bea.submit()
    await expect(bea.message(draft)).toBeVisible()
    await expect(alice.message(draft)).toBeVisible({ timeout: 5_000 })
  })

  test('filling with the wrong password says so and brings nothing back', async ({ alice, bea }) => {
    await bea.openChat()
    await expect(bea.message('Seed: hi Bea')).toBeVisible()
    await expect(bea.message('Seed: from the lake')).toHaveCount(0)

    await alice.openChat()
    await alice.openSecurity()
    await alice.fillTheLake('wrong')
    await expect(notice(alice, 'Wrong password.')).toBeVisible()
    await expect(field(alice, 'Lake password')).toHaveValue('wrong')

    expect(await hiddenSeedSessionVisible()).toBe(false)
    await expect(bea.message('Seed: from the lake')).toHaveCount(0)
  })

  test('filling with the lake password brings the history back for everyone', async ({ alice, bea }) => {
    await bea.openChat()
    await expect(bea.message('Seed: hi Bea')).toBeVisible()
    await expect(bea.message('Seed: from the lake')).toHaveCount(0)

    await alice.openChat()
    await alice.openSecurity()
    await alice.fillTheLake(LAKE_PASSWORD)
    await expect(notice(alice, 'Lake filled.')).toBeVisible()
    await expect(field(alice, 'Lake password')).toHaveValue('')

    await expect(bea.message('Seed: from the lake')).toBeVisible({ timeout: 5_000 })
  })

  test('changing the lake password retires the old one', async ({ alice }) => {
    const next = `new-lake-${Date.now()}`
    await alice.openChat()
    await alice.openSecurity()
    const change = await alice.lakeRow('Change lake password')

    await field(alice, 'Current lake password').fill('not-it')
    await field(alice, 'New lake password').fill(next)
    await change.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(notice(alice, 'Current password is wrong.')).toBeVisible()

    await field(alice, 'Current lake password').fill(LAKE_PASSWORD)
    await change.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(notice(alice, 'Lake password changed.')).toBeVisible()

    await alice.fillTheLake(LAKE_PASSWORD)
    await expect(notice(alice, 'Wrong password.')).toBeVisible()
    await alice.fillTheLake(next)
    await expect(notice(alice, 'Lake filled.')).toBeVisible()
  })
})
