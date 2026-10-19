import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restoreStatuses, serviceClient } from './supabase'
import { IDS } from './users'

afterDevicesClose(async () => {
  await restoreStatuses()
})

const PINK = 'rgb(255, 102, 170)' // #ff66aa
const GREEN = 'rgb(34, 204, 136)' // #22cc88

/** Creates "Raiding" directly in the database and gives it to Bea, with a status message. */
async function beaIsRaiding(message: string | null = null) {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('status_definitions')
    .insert({ label: 'Raiding', color: '#ff66aa', position: 10 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const id = (data as { id: string }).id
  const res = await svc.from('profiles').update({ status_id: id, custom_status_text: message }).eq('id', IDS.users.bea)
  if (res.error) throw new Error(res.error.message)
  return id
}

function statusRow(user: ChatUser, label: string) {
  return user.page.getByRole('button', { name: label, exact: true }).filter({ visible: true })
}

function statusDot(user: ChatUser, label: string) {
  return statusRow(user, label).locator('[data-status-dot]')
}

test.describe('Shared statuses', () => {
  // The member list is gone (Task 6). Alice seeing it next to Bea's name comes back with the partner card (Task 7).
  test('Bea creates a status and picks it; it shows on her row and in Alice’s open picker', async ({ alice, bea }) => {
    await alice.openChat()
    await alice.openStatusPicker()
    await expect(statusRow(alice, 'Raiding')).toHaveCount(0)

    await bea.openChat()
    await bea.openStatusPicker()
    await bea.page.getByRole('button', { name: '+ New status' }).click()
    await bea.page.getByLabel('Status label').fill('Raiding')
    await bea.page.getByLabel('Status colour').fill('#ff66aa')
    await bea.page.getByRole('button', { name: 'Save status' }).click()
    // A new status is selected straight away.
    await expect(statusRow(bea, 'Raiding')).toHaveAttribute('aria-pressed', 'true')
    await bea.page.getByLabel('Status message').fill('back at 9')
    await bea.page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(bea.page.getByRole('heading', { name: 'Set Status' })).toHaveCount(0)

    const label = bea.meRow.locator('[data-status-label]')
    await expect(label).toHaveText('Raiding')
    await expect(label).toHaveCSS('color', PINK)
    await expect(bea.meRow).toContainText('back at 9')

    // The shared status reaches Alice's open picker live.
    await expect(statusDot(alice, 'Raiding')).toHaveCSS('background-color', PINK, { timeout: 5_000 })

    const { data } = await serviceClient().from('profiles').select('custom_status_text').eq('id', IDS.users.bea).single()
    expect(data).toEqual({ custom_status_text: 'back at 9' })
  })

  test('Alice edits the colour and Bea’s open picker updates live', async ({ alice, bea }) => {
    await beaIsRaiding()
    await bea.openChat()
    await bea.openStatusPicker()
    await expect(statusDot(bea, 'Raiding')).toHaveCSS('background-color', PINK)

    await alice.openChat()
    await alice.openStatusPicker()
    await alice.page.getByTitle('Edit Raiding').click()
    await alice.page.getByLabel('Status colour').fill('#22cc88')
    await alice.page.getByRole('button', { name: 'Save status' }).click()
    await expect(statusDot(alice, 'Raiding')).toHaveCSS('background-color', GREEN)

    await expect(statusDot(bea, 'Raiding')).toHaveCSS('background-color', GREEN, { timeout: 5_000 })
  })

  test('Alice deletes it: Bea’s custom status clears and her message stays', async ({ alice, bea }) => {
    await beaIsRaiding('back at 9')
    await bea.openChat()
    await bea.showList()
    await expect(bea.meRow.locator('[data-status-label]')).toHaveText('Raiding')
    await expect(bea.meRow).toContainText('back at 9')

    await alice.openChat()
    await alice.openStatusPicker()
    alice.page.once('dialog', (d) => void d.accept())
    await alice.page.getByTitle('Delete Raiding').click()
    await expect(statusRow(alice, 'Raiding')).toHaveCount(0)

    await expect(bea.meRow.locator('[data-status-label]')).toHaveCount(0, { timeout: 5_000 })
    await expect(bea.meRow).toContainText('back at 9')

    const { data } = await serviceClient().from('profiles').select('status_id, custom_status_text').eq('id', IDS.users.bea).single()
    expect(data).toEqual({ status_id: null, custom_status_text: 'back at 9' })
  })
})
