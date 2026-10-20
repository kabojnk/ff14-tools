import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({ supabase: {} }))

import { ReconnectBar, RECONNECT_DELAY_MS } from '@/components/chat2/ReconnectBar'
import { useConversationStore } from '@/stores/conversationStore'

beforeEach(() => {
  vi.useFakeTimers()
  useConversationStore.setState({ realtimeStatus: 'SUBSCRIBED' })
})
afterEach(() => {
  vi.useRealTimers()
})

const bar = () => screen.queryByText('Reconnecting…')
const setStatus = (s: 'SUBSCRIBED' | 'JOINING' | 'CHANNEL_ERROR' | 'CLOSED') =>
  act(() => useConversationStore.setState({ realtimeStatus: s }))

describe('ReconnectBar', () => {
  it('waits 2 s, so a quick rejoin never shows it', () => {
    expect(RECONNECT_DELAY_MS).toBe(2000)
    render(<ReconnectBar />)
    setStatus('CHANNEL_ERROR')
    act(() => vi.advanceTimersByTime(1900))
    expect(bar()).toBeNull()
    setStatus('SUBSCRIBED')
    act(() => vi.advanceTimersByTime(1000))
    expect(bar()).toBeNull()
  })

  it('shows "Reconnecting…" after 2 s off the channel, and hides on rejoin', () => {
    render(<ReconnectBar />)
    setStatus('JOINING')
    setStatus('CHANNEL_ERROR')
    act(() => vi.advanceTimersByTime(2000))
    expect(bar()).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting…')
    setStatus('SUBSCRIBED')
    expect(bar()).toBeNull()
  })

  it('counts from when the channel was lost, not from the latest status change', () => {
    render(<ReconnectBar />)
    setStatus('CHANNEL_ERROR')
    act(() => vi.advanceTimersByTime(1500))
    setStatus('JOINING')
    act(() => vi.advanceTimersByTime(600))
    expect(bar()).toBeInTheDocument()
  })
})
