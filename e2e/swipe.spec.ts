import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'

// Phone swipes (src/hooks/useSwipeBack.ts): from the left edge of the chat back to the list, from the left
// edge of a pushed Settings section back to Settings, and pulling the profile editor down to cancel it.
// Playwright's touchscreen only taps, and WebKit won't construct a Touch, so the finger is a run of touch
// events (plain events carrying the touch lists the hook reads) dispatched on whatever is under the start
// point, the way iOS delivers them: the whole touch goes to the element it started on.

type Point = [x: number, y: number]

/** A one-finger drag through `points`, `stepMs` apart. Returns whether the browser was told not to scroll. */
async function swipe(page: Page, points: Point[], stepMs = 16) {
  return page.evaluate(async ([pts, step]) => {
    const [x0, y0] = pts[0]
    const target = document.elementFromPoint(x0, y0)
    if (!target) throw new Error(`nothing at ${x0},${y0}`)
    const touch = ([x, y]: number[]) => ({ identifier: 1, target, clientX: x, clientY: y, pageX: x, pageY: y })
    const fire = (type: string, t: ReturnType<typeof touch>, down: boolean) => {
      const e = new Event(type, { bubbles: true, cancelable: true, composed: true })
      Object.defineProperties(e, {
        touches: { value: down ? [t] : [] },
        targetTouches: { value: down ? [t] : [] },
        changedTouches: { value: [t] },
      })
      return target.dispatchEvent(e)
    }
    const frame = () => new Promise((r) => setTimeout(r, step))
    fire('touchstart', touch(pts[0]), true)
    let prevented = false
    for (const p of pts.slice(1)) {
      await frame()
      if (!fire('touchmove', touch(p), true)) prevented = true
    }
    fire('touchend', touch(pts[pts.length - 1]), false)
    return prevented
  }, [points, stepMs] as const)
}

/** A steady drag from `from` to `to` in `steps` moves. */
const line = (from: Point, to: Point, steps = 12): Point[] =>
  Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((to[0] - from[0]) * i) / steps, from[1] + ((to[1] - from[1]) * i) / steps])

const width = (page: Page) => page.viewportSize()!.width
const height = (page: Page) => page.viewportSize()!.height

test.describe('Swipe navigation on a phone', () => {
  test.skip(({ isMobile }) => !isMobile, 'touch gestures are phone-only')

  test('a swipe right from the left edge of the chat goes back to the conversation list', async ({ bea }) => {
    await bea.openChat()
    const y = height(bea.page) / 2
    expect(await swipe(bea.page, line([6, y], [width(bea.page) * 0.8, y + 8]))).toBe(true)
    await expect(bea.meRow).toBeVisible()
    await expect(bea.composer).toBeHidden()
  })

  test('the same swipe from the middle of the chat, or a short one from the edge, stays in the chat', async ({ bea }) => {
    await bea.openChat()
    const y = height(bea.page) / 2
    expect(await swipe(bea.page, line([120, y], [width(bea.page) - 10, y]))).toBe(false)
    // Short and slow (well under a flick): it springs back.
    await swipe(bea.page, line([6, y], [60, y], 6), 120)
    await bea.page.waitForTimeout(400)
    await expect(bea.composer).toBeVisible()
    await expect(bea.page.locator('main')).toHaveCSS('transform', 'none')
  })

  test('not while a menu is open over the chat', async ({ bea }) => {
    await bea.openChat()
    await bea.header.getByRole('button', { name: 'More', exact: true }).click()
    await expect(bea.page.getByRole('menu')).toBeVisible()
    const y = height(bea.page) / 2
    await swipe(bea.page, line([6, y], [width(bea.page) * 0.8, y]))
    await bea.page.waitForTimeout(400)
    await expect(bea.composer).toBeVisible()
  })

  test('in Settings, a swipe right from the edge of a section goes back to Settings', async ({ bea }) => {
    await bea.openChat()
    await bea.openSettings()
    await bea.settings.getByRole('button', { name: 'About', exact: true }).click()
    // The pushed section names the sheet.
    await expect(bea.page.getByRole('dialog', { name: 'About' }).getByRole('heading', { name: 'About' })).toBeVisible()
    const y = height(bea.page) / 2
    expect(await swipe(bea.page, line([6, y], [width(bea.page) * 0.8, y]))).toBe(true)
    await expect(bea.settings.getByRole('heading', { name: 'Settings' })).toBeVisible()
    await expect(bea.settings.getByRole('button', { name: 'Edit profile' })).toBeVisible()
  })

  test('pulling the profile editor down cancels it, or asks first when something changed', async ({ bea }) => {
    await bea.openChat()
    await bea.openProfileEditor()
    /** From the middle of `target` down to three quarters of the screen, once the sheet has slid up. */
    const pull = async (target = bea.profileEditor.getByRole('heading', { name: 'Profile' })) => {
      await bea.page.waitForTimeout(300)
      const box = (await target.boundingBox())!
      const x = box.x + box.width / 2
      return swipe(bea.page, line([x, box.y + box.height / 2], [x, height(bea.page) * 0.75]))
    }

    await bea.profileEditor.getByLabel('Status message').fill('swiping')
    await bea.profileEditor.getByLabel('Status message').blur()
    // Not from a text field: that's left to the field (and the page's scrolling).
    expect(await pull(bea.profileEditor.getByLabel('Status message'))).toBe(false)
    await expect(bea.profileEditor.getByText('Discard your changes?')).toBeHidden()

    expect(await pull()).toBe(true)
    await expect(bea.profileEditor.getByText('Discard your changes?')).toBeVisible()
    await expect(bea.profileEditor).toHaveCSS('transform', 'none')
    await bea.profileEditor.getByRole('button', { name: 'Discard' }).click()
    await expect(bea.profileEditor).toBeHidden()

    await bea.openProfileEditor()
    await pull()
    await expect(bea.profileEditor).toBeHidden()
    await expect(bea.meRow).toBeVisible()
  })
})

test('desktop: no swipe gestures', async ({ bea, isMobile }) => {
  test.skip(isMobile, 'desktop only')
  await bea.openChat()
  await swipe(bea.page, line([300, 400], [1100, 400]))
  await bea.page.waitForTimeout(400)
  await expect(bea.composer).toBeVisible()
  await expect(bea.page.locator('main')).toHaveCSS('transform', 'none')
})
