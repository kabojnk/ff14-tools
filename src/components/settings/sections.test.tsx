import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AboutSection } from '@/components/settings/AboutSection'
import { AppearanceSection } from '@/components/settings/AppearanceSection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'

describe('Settings sections', () => {
  it('Appearance shows the theme grid', () => {
    render(<AppearanceSection />)
    expect(screen.getByRole('radiogroup', { name: 'Theme' })).toBeInTheDocument()
  })

  it('Notifications says they come with the iPhone app', () => {
    render(<NotificationsSection />)
    expect(screen.getByText('Notifications come with the iPhone app.')).toBeInTheDocument()
  })

  it('About shows the version and the build date', () => {
    render(<AboutSection />)
    expect(screen.getByText('Version').parentElement).toHaveTextContent(`Version${__APP_VERSION__}`)
    expect(screen.getByText('Built').parentElement).toHaveTextContent(/^Built\d{4}-\d{2}-\d{2}$/)
  })
})
