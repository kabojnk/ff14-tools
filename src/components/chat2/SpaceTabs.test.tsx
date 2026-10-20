import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { User } from '@supabase/supabase-js'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { SpaceTabs } from '@/components/chat2/SpaceTabs'
import { useAuthStore } from '@/stores/authStore'
import { useConversationStore } from '@/stores/conversationStore'

const CONV = { id: 'conv-1', title: null, archived: false, created_by: null, created_at: '2026-01-01T00:00:00Z' }

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'alice' } as User })
  useConversationStore.setState({
    conversation: CONV,
    activeSpace: 'main',
    latest: {
      main: { at: '2026-10-19T09:00:00Z', authorId: 'bea', preview: 'hi' },
      schist: { at: '2026-10-19T10:00:00Z', authorId: 'bea', preview: 'psst' },
    },
    readAt: { main: '2026-10-19T09:30:00Z', schist: '2026-10-19T09:30:00Z' },
  })
})

const tab = (name: string) => screen.getByRole('tab', { name: new RegExp(`^${name}`) })

describe('SpaceTabs', () => {
  it('is a tablist of Main and Schist with the active one selected', () => {
    render(<SpaceTabs />)
    expect(screen.getByRole('tablist')).toBeInTheDocument()
    expect(screen.getAllByRole('tab').map((t) => t.getAttribute('data-space'))).toEqual(['main', 'schist'])
    expect(tab('Main')).toHaveAttribute('aria-selected', 'true')
    expect(tab('Schist')).toHaveAttribute('aria-selected', 'false')
    expect(tab('Main')).toHaveAttribute('data-space', 'main')
    expect(tab('Schist')).toHaveAttribute('data-space', 'schist')
  })

  it('marks the unread space and shows a dot on it while it is inactive', () => {
    render(<SpaceTabs />)
    expect(tab('Schist')).toHaveAttribute('data-unread', 'true')
    expect(tab('Main')).toHaveAttribute('data-unread', 'false')
    expect(tab('Schist').querySelector('[data-unread-dot]')).not.toBeNull()
    expect(tab('Main').querySelector('[data-unread-dot]')).toBeNull()
    // Screen readers hear it too.
    expect(screen.getByRole('tab', { name: /^Schist\W*unread$/ })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Main' })).toBeInTheDocument()
  })

  it('shows no dot for my own newest message', () => {
    useConversationStore.setState({
      latest: { main: null, schist: { at: '2026-10-19T10:00:00Z', authorId: 'alice', preview: 'me' } },
    })
    render(<SpaceTabs />)
    expect(tab('Schist')).toHaveAttribute('data-unread', 'false')
  })

  it('switches space on click', () => {
    render(<SpaceTabs />)
    fireEvent.click(tab('Schist'))
    expect(useConversationStore.getState().activeSpace).toBe('schist')
    expect(tab('Schist')).toHaveAttribute('aria-selected', 'true')
  })

  it('moves with the arrow keys (roving focus)', () => {
    render(<SpaceTabs />)
    expect(tab('Main')).toHaveAttribute('tabindex', '0')
    expect(tab('Schist')).toHaveAttribute('tabindex', '-1')
    fireEvent.keyDown(tab('Main'), { key: 'ArrowRight' })
    expect(useConversationStore.getState().activeSpace).toBe('schist')
    expect(tab('Schist')).toHaveFocus()
    fireEvent.keyDown(tab('Schist'), { key: 'ArrowRight' })
    expect(useConversationStore.getState().activeSpace).toBe('main')
    fireEvent.keyDown(tab('Main'), { key: 'ArrowLeft' })
    expect(useConversationStore.getState().activeSpace).toBe('schist')
  })

  it('slides the highlight to the active tab', () => {
    const { container } = render(<SpaceTabs />)
    const highlight = container.querySelector('[data-tab-highlight]') as HTMLElement
    expect(highlight.style.transform).toBe('translateX(0%)')
    fireEvent.click(tab('Schist'))
    expect(highlight.style.transform).toBe('translateX(100%)')
    expect(highlight.className).toMatch(/motion-reduce:transition-none/)
  })
})
