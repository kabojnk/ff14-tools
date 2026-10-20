import { act, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Portal } from './Portal'
import { useUiStore } from '@/stores/uiStore'

describe('Portal', () => {
  afterEach(() => act(() => useUiStore.setState({ eepMode: false })))

  it('renders its children into the body', () => {
    render(<Portal><p>over the chat</p></Portal>)
    expect(screen.getByText('over the chat')).toBeVisible()
  })

  it('hides (without unmounting) while the FF14 disguise is up, and shows again after', () => {
    render(<Portal><input aria-label="draft" defaultValue="half typed" /></Portal>)
    const input = screen.getByLabelText('draft')
    act(() => useUiStore.setState({ eepMode: true }))
    expect(input).not.toBeVisible()
    expect(input.closest('[inert]')).not.toBeNull()
    act(() => useUiStore.setState({ eepMode: false }))
    expect(screen.getByLabelText('draft')).toBe(input)
    expect(input).toBeVisible()
    expect(input.closest('[inert]')).toBeNull()
  })
})
