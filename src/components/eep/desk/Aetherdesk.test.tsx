import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Aetherdesk } from '@/components/eep/desk/Aetherdesk'

function renderDesk(overrides: Partial<Parameters<typeof Aetherdesk>[0]> = {}) {
  const props = {
    signedIn: true,
    canUnlock: true,
    onUnlock: vi.fn(),
    onSubmitSearch: vi.fn(() => false),
    onLogin: vi.fn(),
    onLogout: vi.fn(),
    ...overrides,
  }
  return { props, ...render(<Aetherdesk {...props} />) }
}

const search = () => screen.getByRole('searchbox', { name: 'Search recipes, items and raids' })
function submitSearch(text: string) {
  fireEvent.change(search(), { target: { value: text } })
  fireEvent.submit(search().closest('form')!)
}
const sidebar = () => screen.getByRole('complementary', { name: 'Sections' })

beforeEach(() => localStorage.clear())

describe('Aetherdesk', () => {
  it('opens on Home with the site heading, the resets and the roulette picker', () => {
    renderDesk()
    expect(screen.getByRole('heading', { level: 1, name: 'Aetherdesk' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Today in Eorzea' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Resets' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Roll random content' })).toBeInTheDocument()
  })

  it('moves between sections from the sidebar and the tab bar, and remembers the last one', () => {
    const { unmount } = renderDesk()
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Crafting' }))
    expect(screen.getByRole('heading', { name: 'Crafting', level: 2 })).toBeInTheDocument()
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Sections (tabs)' })).getByRole('button', { name: 'Collect' }))
    expect(screen.getByRole('heading', { name: 'Collections', level: 2 })).toBeInTheDocument()
    unmount()
    renderDesk()
    expect(screen.getByRole('heading', { name: 'Collections', level: 2 })).toBeInTheDocument()
  })

  it('the Unlock dot shows signed in with a PIN; signed out there is Login instead, and no Logout', () => {
    const { props, unmount } = renderDesk()
    fireEvent.click(screen.getByRole('button', { name: 'Unlock' }))
    expect(props.onUnlock).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Logout' }))
    expect(props.onLogout).toHaveBeenCalled()
    unmount()

    renderDesk({ canUnlock: false })
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
    screen.getByRole('button', { name: 'Logout' })
    // Fresh render below.
  })

  it('signed out: Login, no Unlock and no Logout', () => {
    const { props } = renderDesk({ signedIn: false })
    expect(screen.queryByRole('button', { name: 'Unlock' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Logout' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Login' }))
    expect(props.onLogin).toHaveBeenCalled()
  })

  it('text the page takes (the passphrase) is not searched for, and the field clears', () => {
    renderDesk({ onSubmitSearch: vi.fn(() => true) })
    submitSearch('open sesame')
    expect(search()).toHaveValue('')
    expect(screen.queryByRole('heading', { name: 'Search' })).toBeNull()
    expect(screen.queryByText(/open sesame/)).toBeNull()
  })

  it('anything else searches recipes, collectables and duties', () => {
    const { props } = renderDesk()
    submitSearch('  ingot ')
    expect(props.onSubmitSearch).toHaveBeenCalledWith('ingot')
    expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument()
    expect(within(screen.getByRole('region', { name: 'Recipes' })).getAllByText(/Ra'Kaznar Ingot/).length).toBeGreaterThan(0)

    submitSearch('qwertyuiop')
    expect(screen.getByText(/No recipes, items or duties match/)).toBeInTheDocument()
    // A section leaves the results.
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Home' }))
    expect(screen.getByRole('heading', { name: 'Today in Eorzea' })).toBeInTheDocument()
  })

  it('collections: Triple Triad cards, and marking an item collected is kept on this device', () => {
    const { unmount } = renderDesk()
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Collections' }))
    fireEvent.click(screen.getByRole('button', { name: 'Triple Triad' }))
    const card = screen.getByRole('button', { name: /No\. 88 Bahamut/ })
    expect(card).toHaveAttribute('aria-pressed', 'false')
    fireEvent.click(card)
    expect(card).toHaveAttribute('aria-pressed', 'true')
    unmount()
    renderDesk()
    expect(screen.getByRole('button', { name: /No\. 88 Bahamut/ })).toHaveAttribute('aria-pressed', 'true')
  })

  it('crafting: filters by job, ticks materials and adds the recipe to the Home crafting list', () => {
    renderDesk()
    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Crafting' }))
    fireEvent.click(screen.getByRole('button', { name: 'CUL' }))
    expect(screen.getAllByRole('option').every((o) => o.textContent?.match(/^CUL/))).toBe(true)
    fireEvent.click(screen.getByRole('option', { name: /Ceviche/ }))
    const fish = screen.getByRole('checkbox', { name: /Alexandrian Bluegill/ })
    fireEvent.click(fish)
    expect(fish).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Add to crafting list' }))
    expect(screen.getByRole('button', { name: 'Remove from crafting list' })).toBeInTheDocument()

    fireEvent.click(within(sidebar()).getByRole('button', { name: 'Home' }))
    expect(within(screen.getByRole('region', { name: 'Crafting list' })).getByText('Ceviche')).toBeInTheDocument()
  })
})
