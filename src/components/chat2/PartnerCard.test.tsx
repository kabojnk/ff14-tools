import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PartnerCard } from '@/components/chat2/PartnerCard'
import type { Profile } from '@/types'

const bea = {
  id: 'bea',
  nickname: 'Bea',
  avatar_url: null,
  banner_url: 'https://cdn.example/banner.jpg',
  custom_status_text: 'back at 9',
} as Profile
const raiding = { id: 'r', label: 'Raiding', color: '#ff66aa', position: 1, legacy_key: null, created_by: null, created_at: '', updated_at: '' }

function setup(over: Partial<Parameters<typeof PartnerCard>[0]> = {}) {
  const onClose = vi.fn()
  const { container } = render(
    <PartnerCard name="Bea" profile={bea} presence="online" status={raiding as never} variant="popover" onClose={onClose} {...over} />,
  )
  return { onClose, container }
}

describe('PartnerCard', () => {
  it('shows the banner, avatar with presence, name, pill and status message', () => {
    const { container } = setup()
    const card = screen.getByRole('dialog', { name: 'Bea' })
    expect(card).toHaveAttribute('data-partner-card')
    expect(container.querySelector('img[src="https://cdn.example/banner.jpg"]')).not.toBeNull()
    expect(container.querySelector('[data-presence="online"]')).not.toBeNull()
    expect(screen.getByText('Bea')).toBeInTheDocument()
    expect(screen.getByText('Raiding')).toBeInTheDocument()
    expect(screen.getByText('back at 9')).toBeInTheDocument()
  })

  it('leaves out the pill and message when there are none', () => {
    setup({ status: null, profile: { ...bea, custom_status_text: null } })
    expect(document.querySelector('[data-status-pill]')).toBeNull()
    expect(screen.queryByText('back at 9')).toBeNull()
  })

  it('closes on Escape, on the close button and on a click outside', () => {
    const { onClose } = setup()
    fireEvent.keyDown(window, { key: 'Escape' })
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    fireEvent.pointerDown(document.body)
    expect(onClose).toHaveBeenCalledTimes(3)
  })

  it('does not close on a click inside', () => {
    const { onClose } = setup()
    fireEvent.pointerDown(screen.getByText('back at 9'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('is a bottom sheet on phones', () => {
    const { container } = setup({ variant: 'sheet' })
    expect((container.firstChild as HTMLElement).className).toMatch(/fixed/)
  })
})
