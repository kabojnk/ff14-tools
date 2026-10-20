import { afterDevicesClose, expect, test, type ChatUser } from './fixtures'
import { restoreStatuses, serviceClient } from './supabase'
import { IDS } from './users'

afterDevicesClose(async () => {
  await restoreStatuses()
})

// Two of the palette's swatches (src/lib/swatches.ts).
const PINK = 'rgb(236, 72, 153)' // #ec4899
const GREEN = 'rgb(34, 197, 94)' // #22c55e

/** Creates "Raiding" directly in the database and gives it to Bea, with a status message. */
async function beaIsRaiding(message: string | null = null) {
  const svc = serviceClient()
  const { data, error } = await svc
    .from('status_definitions')
    .insert({ label: 'Raiding', color: '#ec4899', position: 10 })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  const id = (data as { id: string }).id
  const res = await svc.from('profiles').update({ status_id: id, custom_status_text: message }).eq('id', IDS.users.bea)
  if (res.error) throw new Error(res.error.message)
  return id
}

/** A status's radio row in the open profile editor's "Custom status" list. */
function statusRow(user: ChatUser, label: string) {
  return user.profileEditor.getByRole('radiogroup', { name: 'Custom status' }).getByRole('radio', { name: label, exact: true })
}

/** The status's pill dot in that row (its colour). */
function statusDot(user: ChatUser, label: string) {
  return statusRow(user, label).locator('[data-pill-dot]')
}

/** Picks a swatch in the open inline status edit. */
async function pickSwatch(user: ChatUser, hex: string) {
  await user.profileEditor.getByRole('radiogroup', { name: 'Colour' }).getByRole('radio', { name: hex, exact: true }).click()
}

test.describe('Shared statuses', () => {
  test('Bea creates a status and picks it; Alice sees it next to her name', async ({ alice, bea }) => {
    await alice.openChat()
    await expect(alice.header).toContainText('Bea')
    await expect(alice.headerPill).toHaveCount(0)

    await bea.openChat()
    await bea.openProfileEditor()
    await bea.profileEditor.getByRole('button', { name: 'New status', exact: true }).click()
    await bea.profileEditor.getByLabel('Status label').fill('Raiding')
    await pickSwatch(bea, '#ec4899')
    await bea.profileEditor.getByRole('button', { name: 'Save status' }).click()
    // A new status is selected straight away.
    await expect(statusRow(bea, 'Raiding')).toHaveAttribute('aria-checked', 'true')
    await bea.profileEditor.getByLabel('Status message').fill('back at 9')
    await bea.profileEditor.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(bea.profileEditor).toHaveCount(0)

    // Pill A in her own row: the label, its dot in the status colour, then the message.
    await expect(bea.meRow.locator('[data-status-label]')).toHaveText('Raiding')
    await expect(bea.meRow.locator('[data-pill-dot]')).toHaveCSS('background-color', PINK)
    await expect(bea.meRow).toContainText('back at 9')

    // It reaches Alice live: the header pill, the conversation row's pill, and the message on Bea's card.
    await expect(alice.headerPill.locator('[data-status-label]')).toHaveText('Raiding', { timeout: 5_000 })
    await expect(alice.headerPill.locator('[data-pill-dot]')).toHaveCSS('background-color', PINK)
    await alice.showList()
    await expect(alice.conversationRow.locator('[data-status-label]')).toHaveText('Raiding')
    await expect(alice.conversationRow.locator('[data-pill-dot]')).toHaveCSS('background-color', PINK)
    const card = await alice.partnerCard()
    await expect(card.locator('[data-status-label]')).toHaveText('Raiding')
    await expect(card).toContainText('back at 9')

    const { data } = await serviceClient().from('profiles').select('custom_status_text').eq('id', IDS.users.bea).single()
    expect(data).toEqual({ custom_status_text: 'back at 9' })
  })

  test('Alice edits the colour and Bea’s open editor updates live', async ({ alice, bea }) => {
    await beaIsRaiding()
    await bea.openChat()
    await bea.openProfileEditor()
    await expect(statusDot(bea, 'Raiding')).toHaveCSS('background-color', PINK)

    await alice.openChat()
    await alice.openProfileEditor()
    await alice.profileEditor.getByTitle('Edit Raiding').click()
    await pickSwatch(alice, '#22c55e')
    await alice.profileEditor.getByRole('button', { name: 'Save status' }).click()
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
    await alice.openProfileEditor()
    await alice.profileEditor.getByTitle('Edit Raiding').click()
    await alice.profileEditor.getByTitle('Delete Raiding').click()
    // Asked inside the row, not with a browser dialog.
    await expect(alice.profileEditor.getByText('Delete for everyone?')).toBeVisible()
    await alice.profileEditor.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(statusRow(alice, 'Raiding')).toHaveCount(0)

    await expect(bea.meRow.locator('[data-status-label]')).toHaveCount(0, { timeout: 5_000 })
    await expect(bea.meRow).toContainText('back at 9')

    const { data } = await serviceClient().from('profiles').select('status_id, custom_status_text').eq('id', IDS.users.bea).single()
    expect(data).toEqual({ status_id: null, custom_status_text: 'back at 9' })
  })
})
