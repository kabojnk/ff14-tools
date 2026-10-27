import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import RaidPlansView from './RaidPlansView'

// jsdom has no PointerEvent; without one, fireEvent drops clientX/clientY.
beforeAll(() => {
  if (!('PointerEvent' in window)) {
    class PointerEventPolyfill extends MouseEvent {
      pointerId: number
      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init)
        this.pointerId = init.pointerId ?? 1
      }
    }
    Object.defineProperty(window, 'PointerEvent', { value: PointerEventPolyfill, configurable: true })
  }
})

function setup() {
  const view = render(<RaidPlansView />)
  const arena = screen.getByRole('img')
  arena.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400, x: 0, y: 0, toJSON: () => ({}) })
  return { ...view, arena }
}

const shapes = (arena: Element) => arena.querySelectorAll('[data-shape]')
const tool = (name: string) => fireEvent.click(screen.getByRole('button', { name }))
const fightChip = (name: RegExp) => within(screen.getByRole('navigation', { name: 'Fights' })).queryByRole('button', { name })
const stored = () => JSON.parse(localStorage.getItem('aetherdesk:raid:plans') ?? '{}') as Record<string, unknown>

describe('RaidPlansView', () => {
  it('opens on M9S with its first step', () => {
    const { arena } = setup()
    expect(screen.getByRole('heading', { name: /M9S · Vamp Fatale/ })).toBeInTheDocument()
    expect(screen.getByText(/Raidwide into tankbuster/)).toBeInTheDocument()
    expect(arena).toHaveAccessibleName('M9S · Vamp Fatale arena, step 1: Opener')
    expect(screen.getByRole('button', { name: '1 Opener' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByRole('button', { name: 'Move' })).toHaveAttribute('aria-pressed', 'true')
    expect(arena.querySelectorAll('[data-token]')).toHaveLength(8)
  })

  it('filters the fight list by expansion and type', () => {
    setup()
    expect(fightChip(/M9S/)).not.toBeNull()
    expect(fightChip(/^Titania$/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Endwalker' }))
    expect(fightChip(/M9S/)).toBeNull()
    expect(fightChip(/P1S · Erichthonios/)).not.toBeNull()
    expect(fightChip(/^Zodiark$/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Extreme' }))
    expect(fightChip(/P1S/)).toBeNull()
    expect(fightChip(/^Zodiark$/)).not.toBeNull()
    expect(screen.getByRole('button', { name: 'Extreme' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Extreme' }))
    expect(fightChip(/P1S/)).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'All' }))
    expect(within(screen.getByRole('navigation', { name: 'Fights' })).getAllByRole('button')).toHaveLength(58)
  })

  it('switches fight and step', () => {
    const { arena } = setup()
    fireEvent.click(fightChip(/E8S · Shiva/)!)
    expect(screen.getByRole('heading', { name: /E8S · Shiva/ })).toBeInTheDocument()
    expect(screen.getByText("Eden's Verse (Savage)")).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '2 Axe Kick' }))
    expect(screen.getByText(/Step 2: Axe Kick\./)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '2 Axe Kick' })).toHaveAttribute('aria-current', 'step')
    expect(arena).toHaveAccessibleName('E8S · Shiva arena, step 2: Axe Kick')
  })

  it('places a shape with a tool and erases it', () => {
    const { arena } = setup()
    expect(shapes(arena)).toHaveLength(0)
    tool('AoE circle')
    expect(screen.getByRole('button', { name: 'AoE circle' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.pointerDown(arena, { clientX: 100, clientY: 120 })
    expect(shapes(arena)).toHaveLength(1)
    const circle = arena.querySelector('[data-shape] circle')!
    expect(circle).toHaveAttribute('cx', '100')
    expect(circle).toHaveAttribute('cy', '120')
    tool('Tower')
    fireEvent.pointerDown(arena, { clientX: 300, clientY: 300 })
    expect(shapes(arena)).toHaveLength(2)
    tool('Erase')
    fireEvent.pointerDown(arena.querySelector('[data-shape="0"] circle')!)
    expect(shapes(arena)).toHaveLength(1)
    expect(arena.querySelector('.s-tower')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Clear step' }))
    expect(shapes(arena)).toHaveLength(0)
  })

  it('drags a token and keeps edits across a remount', () => {
    const first = setup()
    const mt = first.arena.querySelector('[data-token="MT"]')!
    fireEvent.pointerDown(mt, { clientX: 200, clientY: 150 })
    fireEvent.pointerMove(first.arena, { clientX: 90, clientY: 330 })
    fireEvent.pointerUp(first.arena)
    expect(mt).toHaveAttribute('transform', 'translate(90 330)')
    tool('Cone')
    fireEvent.pointerDown(first.arena, { clientX: 200, clientY: 380 })
    expect(screen.getByText('Edited')).toBeInTheDocument()
    expect(stored()).toHaveProperty('m9s')
    first.unmount()

    const second = setup()
    expect(second.arena.querySelector('[data-token="MT"]')).toHaveAttribute('transform', 'translate(90 330)')
    expect(second.arena.querySelector('.s-cone')).not.toBeNull()
  })

  it('remembers the chosen fight', () => {
    const first = setup()
    fireEvent.click(fightChip(/^Valigarmanda$/)!)
    first.unmount()
    setup()
    expect(screen.getByRole('heading', { name: /Valigarmanda/ })).toBeInTheDocument()
    expect(screen.getByText('Worqor Lar Dor (Extreme)')).toBeInTheDocument()
  })

  it('adds a step copied from the current one', () => {
    const { arena } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Blood towers/ }))
    fireEvent.click(screen.getByRole('button', { name: '+ Add step' }))
    expect(screen.getByRole('button', { name: '5 Step 5' })).toHaveAttribute('aria-current', 'step')
    expect(shapes(arena)).toHaveLength(4)
    expect(screen.getByText(/Copy of step 3\./)).toBeInTheDocument()
  })

  it('resets a step and the whole plan to the guide', () => {
    const { arena } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Bat swarm/ }))
    expect(shapes(arena)).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Clear step' }))
    expect(shapes(arena)).toHaveLength(0)
    fireEvent.click(screen.getByRole('button', { name: 'Reset step' }))
    expect(shapes(arena)).toHaveLength(2)

    fireEvent.click(screen.getByRole('button', { name: '+ Add step' }))
    expect(screen.getAllByRole('button', { name: /^\d/ })).toHaveLength(5)
    const reset = screen.getByRole('button', { name: 'Reset plan' })
    expect(reset).toBeEnabled()
    fireEvent.click(reset)
    expect(screen.getAllByRole('button', { name: /^\d/ })).toHaveLength(4)
    expect(screen.getByRole('button', { name: '4 Enrage check' })).toHaveAttribute('aria-current', 'step')
    expect(screen.getByText('Guide')).toBeInTheDocument()
    expect(stored()).not.toHaveProperty('m9s')
    expect(screen.getByRole('button', { name: 'Reset plan' })).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent('Plan reset')
  })

  it('copies a share link and says so', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    setup()
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
    })
    expect(writeText).toHaveBeenCalledWith('https://aetherdesk.app/plan/m9s')
    expect(screen.getByRole('status')).toHaveTextContent('Link copied')

    writeText.mockRejectedValueOnce(new Error('denied'))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Copy share link' }))
    })
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't copy. Link: https://aetherdesk.app/plan/m9s")
  })
})
