import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { TypingBubble } from '@/components/chat2/TypingBubble'

describe('TypingBubble', () => {
  it('is a status named "<Name> is typing", with three decorative dots', () => {
    const { container } = render(<TypingBubble names={['Bea']} />)
    expect(screen.getByRole('status', { name: 'Bea is typing' })).toBeInTheDocument()
    expect(container.querySelectorAll('.typing-dot[aria-hidden="true"]')).toHaveLength(3)
  })

  it('names everyone typing', () => {
    render(<TypingBubble names={['Bea', 'Cleo']} />)
    expect(screen.getByRole('status', { name: 'Bea and Cleo are typing' })).toBeInTheDocument()
  })

  it('says when they are recording a voice message', () => {
    render(<TypingBubble names={['Bea']} recording />)
    expect(screen.getByRole('status', { name: 'Bea is recording a voice message' })).toBeInTheDocument()
    expect(screen.getByText('Recording a voice message…')).toBeInTheDocument()
  })
})
