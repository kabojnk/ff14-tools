import { useState } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Sheet } from './Sheet'
import { useUiStore } from '@/stores/uiStore'

/** A controllable matchMedia: `setDesktop(true)` flips DESKTOP_QUERY and notifies listeners. */
function stubMatchMedia(initialDesktop: boolean) {
  let desktop = initialDesktop
  const listeners = new Set<() => void>()
  vi.stubGlobal('matchMedia', (query: string) => ({
    get matches() {
      return query.includes('min-width: 900px') ? desktop : false
    },
    media: query,
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }))
  return {
    setDesktop(next: boolean) {
      desktop = next
      act(() => listeners.forEach((cb) => cb()))
    },
  }
}

const esc = () => fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })

describe('Sheet', () => {
  beforeEach(() => {
    stubMatchMedia(false)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    document.querySelectorAll('[data-pin-pad]').forEach((el) => el.remove())
    act(() => useUiStore.setState({ eepMode: false }))
  })

  it('ignores Escape and Tab while the FF14 disguise is up', () => {
    const onClose = vi.fn()
    render(<Sheet title="Profile" onClose={onClose}><button>inside</button></Sheet>)
    act(() => useUiStore.setState({ eepMode: true }))
    esc()
    expect(onClose).not.toHaveBeenCalled()
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })
    document.body.dispatchEvent(tab)
    expect(tab.defaultPrevented).toBe(false)
  })

  it('renders the title as a heading that names the dialog', () => {
    render(<Sheet title="Profile" onClose={() => {}}>body</Sheet>)
    expect(screen.getByRole('heading', { name: 'Profile' })).toBeInTheDocument()
    const dialog = screen.getByRole('dialog', { name: 'Profile' })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(dialog).toHaveTextContent('body')
  })

  it('closes on Escape', () => {
    const onClose = vi.fn()
    render(<Sheet title="Profile" onClose={onClose}>body</Sheet>)
    esc()
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls onEscape instead of onClose when given', () => {
    const onClose = vi.fn()
    const onEscape = vi.fn()
    render(<Sheet title="Profile" onClose={onClose} onEscape={onEscape}>body</Sheet>)
    esc()
    expect(onEscape).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores an Escape a child already handled', () => {
    const onClose = vi.fn()
    render(
      <Sheet title="Profile" onClose={onClose}>
        <input aria-label="Inline" onKeyDown={(e) => e.key === 'Escape' && e.preventDefault()} />
      </Sheet>,
    )
    fireEvent.keyDown(screen.getByLabelText('Inline'), { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('ignores Escape while the PinPad is open', () => {
    const onClose = vi.fn()
    render(<Sheet title="Profile" onClose={onClose}>body</Sheet>)
    const pad = document.createElement('div')
    pad.setAttribute('data-pin-pad', '')
    document.body.appendChild(pad)
    esc()
    expect(onClose).not.toHaveBeenCalled()
  })

  it('lets Escape reach a window listener (the double-Esc shortcut)', () => {
    const onWindow = vi.fn()
    window.addEventListener('keydown', onWindow)
    render(<Sheet title="Profile" onClose={() => {}}>body</Sheet>)
    esc()
    window.removeEventListener('keydown', onWindow)
    expect(onWindow).toHaveBeenCalledTimes(1)
  })

  it('closes only the topmost of two nested sheets on Escape', () => {
    const onOuter = vi.fn()
    const onInner = vi.fn()
    render(
      <Sheet title="Outer" onClose={onOuter}>
        <Sheet title="Inner" onClose={onInner}>inner</Sheet>
      </Sheet>,
    )
    esc()
    expect(onInner).toHaveBeenCalledTimes(1)
    expect(onOuter).not.toHaveBeenCalled()
  })

  it('closes the outer sheet once the inner one is gone', () => {
    const onOuter = vi.fn()
    function Nested() {
      const [inner, setInner] = useState(true)
      return (
        <Sheet title="Outer" onClose={onOuter}>
          {inner && <Sheet title="Inner" onClose={() => setInner(false)}>inner</Sheet>}
        </Sheet>
      )
    }
    render(<Nested />)
    esc()
    expect(screen.queryByRole('dialog', { name: 'Inner' })).not.toBeInTheDocument()
    expect(onOuter).not.toHaveBeenCalled()
    esc()
    expect(onOuter).toHaveBeenCalledTimes(1)
  })

  it('renders a disabled action button', () => {
    const onSave = vi.fn()
    render(
      <Sheet title="Profile" onClose={() => {}} action={{ label: 'Save', onClick: onSave, disabled: true }}>
        body
      </Sheet>,
    )
    const save = screen.getByRole('button', { name: 'Save' })
    expect(save).toBeDisabled()
    fireEvent.click(save)
    expect(onSave).not.toHaveBeenCalled()
  })

  it('runs the action when enabled', async () => {
    const onSave = vi.fn()
    render(
      <Sheet title="Profile" onClose={() => {}} action={{ label: 'Save', onClick: onSave }}>
        body
      </Sheet>,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Save' }))
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('shows Cancel by default, which closes', async () => {
    const onClose = vi.fn()
    render(<Sheet title="Profile" onClose={onClose}>body</Sheet>)
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it("renders a Back button for leading 'back', which calls onLeading", async () => {
    const onClose = vi.fn()
    const onLeading = vi.fn()
    render(
      <Sheet title="Theme" leading="back" onLeading={onLeading} onClose={onClose}>
        body
      </Sheet>,
    )
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Back' }))
    expect(onLeading).toHaveBeenCalledTimes(1)
    expect(onClose).not.toHaveBeenCalled()
  })

  it("renders no leading button for 'none'", () => {
    render(<Sheet title="Profile" leading="none" onClose={() => {}}>body</Sheet>)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  it('moves focus in on open and back to the opener on close', async () => {
    function Opener() {
      const [open, setOpen] = useState(false)
      return (
        <>
          <button onClick={() => setOpen(true)}>Open</button>
          {open && (
            <Sheet title="Profile" onClose={() => setOpen(false)}>
              <input aria-label="Name" />
            </Sheet>
          )}
        </>
      )
    }
    render(<Opener />)
    const opener = screen.getByRole('button', { name: 'Open' })
    await userEvent.click(opener)
    const dialog = screen.getByRole('dialog', { name: 'Profile' })
    expect(dialog.contains(document.activeElement)).toBe(true)
    esc()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })

  it('when the opener sits under a sheet that is still open, focus goes to that sheet instead', async () => {
    // AddEmoji's crop step: opened from the picker's tile (under the AddEmoji sheet), closed back onto AddEmoji.
    function Flow() {
      const [crop, setCrop] = useState(false)
      return (
        <>
          <button onClick={() => setCrop(true)}>Tile underneath</button>
          <Sheet title="Add emoji" onClose={() => {}}>
            <input aria-label="Emoji name" />
          </Sheet>
          {crop && (
            <Sheet title="Crop" onClose={() => setCrop(false)}>
              <span>frame</span>
            </Sheet>
          )}
        </>
      )
    }
    render(<Flow />)
    const tile = screen.getByRole('button', { name: 'Tile underneath', hidden: true })
    act(() => tile.focus())
    fireEvent.click(tile)
    expect(screen.getByRole('dialog', { name: 'Crop' })).toBeInTheDocument()
    esc()
    expect(screen.queryByRole('dialog', { name: 'Crop' })).not.toBeInTheDocument()
    expect(screen.getByRole('dialog', { name: 'Add emoji' }).contains(document.activeElement)).toBe(true)
  })

  it('traps Tab inside the sheet', async () => {
    render(
      <>
        <button>Outside</button>
        <Sheet title="Profile" onClose={() => {}} action={{ label: 'Save', onClick: () => {} }}>
          <input aria-label="Name" />
        </Sheet>
      </>,
    )
    const cancel = screen.getByRole('button', { name: 'Cancel' })
    const save = screen.getByRole('button', { name: 'Save' })
    const name = screen.getByLabelText('Name')
    cancel.focus()
    await userEvent.tab()
    expect(save).toHaveFocus()
    await userEvent.tab()
    expect(name).toHaveFocus()
    await userEvent.tab()
    expect(cancel).toHaveFocus()
    await userEvent.tab({ shift: true })
    expect(name).toHaveFocus()
  })

  it('closes on a backdrop click on desktop only', async () => {
    const mm = stubMatchMedia(true)
    const onClose = vi.fn()
    render(<Sheet title="Profile" onClose={onClose}>body</Sheet>)
    await userEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
    mm.setDesktop(false)
    await userEvent.click(screen.getByTestId('sheet-backdrop'))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('keeps its children mounted across a breakpoint flip', async () => {
    const mm = stubMatchMedia(false)
    let mounts = 0
    function Staged() {
      const [value, setValue] = useState('')
      useState(() => {
        mounts += 1
      })
      return <input aria-label="Nickname" value={value} onChange={(e) => setValue(e.target.value)} />
    }
    render(
      <Sheet title="Profile" onClose={() => {}}>
        <Staged />
      </Sheet>,
    )
    await userEvent.type(screen.getByLabelText('Nickname'), 'Bea')
    mm.setDesktop(true)
    expect(screen.getByLabelText('Nickname')).toHaveValue('Bea')
    mm.setDesktop(false)
    expect(screen.getByLabelText('Nickname')).toHaveValue('Bea')
    expect(mounts).toBe(1)
  })

  it('uses the given desktop width', () => {
    stubMatchMedia(true)
    render(<Sheet title="Profile" width={560} onClose={() => {}}>body</Sheet>)
    expect(screen.getByRole('dialog')).toHaveStyle({ width: '560px' })
  })

  it('hides its header on desktop only with hideHeaderOnDesktop, keeping the dialog named', () => {
    const media = stubMatchMedia(true)
    render(
      <Sheet title="Settings" hideHeaderOnDesktop onClose={() => {}} action={{ label: 'Done', onClick: () => {} }}>
        body
      </Sheet>,
    )
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Settings' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Done' })).toBeNull()

    media.setDesktop(false)
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible()
  })
})
