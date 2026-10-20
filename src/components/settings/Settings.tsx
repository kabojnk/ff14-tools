import { useEffect, useId, useRef, useState } from 'react'
import { Bell, ChevronRight, Info, Lock, LogOut, Palette, User, X, type LucideIcon } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useStatusStore } from '@/stores/statusStore'
import { useUiStore } from '@/stores/uiStore'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { logOut } from '@/lib/logout'
import { THEMES } from '@/lib/themes'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { Sheet } from '@/components/ui/Sheet'
import { StatusPill } from '@/components/chat2/StatusPill'
import { Group, buttonRowClass, valueClass } from '@/components/settings/Group'
import { AppearanceSection } from '@/components/settings/AppearanceSection'
import { SecuritySection } from '@/components/settings/SecuritySection'
import { NotificationsSection } from '@/components/settings/NotificationsSection'
import { AboutSection } from '@/components/settings/AboutSection'

export type SettingsSection = 'appearance' | 'security' | 'notifications' | 'about'

const SECTIONS: { id: SettingsSection; label: string; icon: LucideIcon }[] = [
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'security', label: 'Security & privacy', icon: Lock },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'about', label: 'About', icon: Info },
]

const labelOf = (id: SettingsSection) => SECTIONS.find((s) => s.id === id)?.label ?? ''

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]'

interface SettingsProps {
  onClose: () => void
  /** "Edit profile" (phones) or "Profile" (desktop nav). The caller closes Settings and opens the profile editor. */
  onEditProfile: () => void
}

/**
 * Settings (design §11).
 *
 * - **Phones:** a sheet titled "Settings" with a profile card and one grouped list. Each row pushes
 *   its section inside the same sheet (title = section, leading Back). Esc in a section goes Back;
 *   Esc at the top closes.
 * - **Desktop:** a 760×520 dialog with a left nav (Profile, the sections, Log out at the bottom) and
 *   the section on the right with a "Close settings" button. It opens on Appearance.
 *
 * One tree across the breakpoint: `section` is the phone stack's top and the desktop selection at
 * once (desktop shows Appearance while it's empty), so a rotation or a resize keeps the section,
 * and a running PIN wizard, mounted.
 */
export function Settings({ onClose, onEditProfile }: SettingsProps) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [section, setSection] = useState<SettingsSection | null>(null)
  const [confirmingLogOut, setConfirmingLogOut] = useState(false)
  const shown = isDesktop ? (section ?? 'appearance') : section
  const pushed = !isDesktop && section !== null

  const back = () => setSection(null)

  // Phones: a pushed section takes focus (its first control, else the section itself), and Back
  // gives it to the row that pushed it. A breakpoint flip keeps the section and moves nothing.
  const contentRef = useRef<HTMLDivElement>(null)
  const prevSection = useRef(section)
  useEffect(() => {
    const prev = prevSection.current
    prevSection.current = section
    if (isDesktop || prev === section) return
    const content = contentRef.current
    if (!content) return
    if (section !== null) {
      const first = Array.from(content.querySelectorAll<HTMLElement>(FOCUSABLE)).find((el) => el.tabIndex >= 0)
      ;(first ?? content).focus()
    } else if (prev !== null) {
      content.querySelector<HTMLElement>(`[data-section-row="${prev}"]`)?.focus()
    }
  }, [section, isDesktop])

  const askLogOut = () => setConfirmingLogOut(true)

  return (
    <Sheet
      title={pushed && section ? labelOf(section) : 'Settings'}
      onClose={onClose}
      leading={pushed ? 'back' : 'none'}
      onLeading={back}
      onEscape={confirmingLogOut ? () => setConfirmingLogOut(false) : pushed ? back : onClose}
      action={isDesktop || pushed ? undefined : { label: 'Done', onClick: onClose }}
      width={760}
      hideHeaderOnDesktop
    >
      <div
        className={
          isDesktop ? 'grid h-[min(520px,calc(90vh-2px))] grid-cols-[190px_minmax(0,1fr)]' : 'flex flex-col'
        }
      >
        {isDesktop && (
          <DesktopNav
            selected={shown ?? 'appearance'}
            onSelect={setSection}
            onEditProfile={onEditProfile}
            onLogOut={askLogOut}
          />
        )}
        <div className={isDesktop ? 'flex min-h-0 min-w-0 flex-col' : 'flex flex-col'}>
          {isDesktop && shown && (
            <div className="flex flex-none items-center justify-between px-5 pb-2.5 pt-3.5">
              <h3 className="text-[17px] font-semibold">{labelOf(shown)}</h3>
              <button
                type="button"
                aria-label="Close settings"
                onClick={onClose}
                className="rounded-md p-1 text-[color:var(--muted)] outline-none hover:text-[color:var(--fg)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
              >
                <Icon icon={X} size={18} />
              </button>
            </div>
          )}
          <div
            ref={contentRef}
            data-testid={shown ? 'settings-section' : undefined}
            tabIndex={pushed ? -1 : undefined}
            className={`outline-none ${isDesktop ? 'min-h-0 flex-1 overflow-y-auto px-5 pb-5' : 'px-3 pb-3.5 pt-3'}`}
          >
            {shown === null && <PhoneHome onOpen={setSection} onEditProfile={onEditProfile} />}
            {shown === 'appearance' && <AppearanceSection />}
            {shown === 'security' && <SecuritySection onLogOut={isDesktop ? undefined : askLogOut} />}
            {shown === 'notifications' && <NotificationsSection />}
            {shown === 'about' && <AboutSection />}
          </div>
        </div>
      </div>
      {confirmingLogOut && <LogOutConfirm onCancel={() => setConfirmingLogOut(false)} />}
    </Sheet>
  )
}

function useMe() {
  const profile = useAuthStore((s) => s.profile)
  const statusId = profile?.status_id ?? null
  const status = useStatusStore((s) => (statusId ? s.definitions.find((d) => d.id === statusId) : undefined))
  return { name: profile?.nickname ?? 'You', avatarUrl: profile?.avatar_url ?? null, status }
}

const tileClass =
  'grid h-[26px] w-[26px] flex-none place-items-center rounded-[7px] bg-[color:color-mix(in_srgb,var(--accent)_16%,transparent)] text-[color:var(--accent)]'

/** The phone's top screen: the profile card, then one row per section. */
function PhoneHome({
  onOpen,
  onEditProfile,
}: {
  onOpen: (section: SettingsSection) => void
  onEditProfile: () => void
}) {
  const { name, avatarUrl, status } = useMe()
  const theme = useUiStore((s) => s.theme)
  const pinOn = useUiStore((s) => s.pinLength !== null)
  const values: Record<SettingsSection, string> = {
    appearance: THEMES.find((t) => t.id === theme)?.name ?? '',
    security: pinOn ? 'PIN on' : 'PIN off',
    notifications: 'iPhone app',
    about: __APP_VERSION__,
  }

  return (
    <div className="flex flex-col gap-3.5">
      <button
        type="button"
        aria-label="Edit profile"
        onClick={onEditProfile}
        className="flex items-center gap-[11px] rounded-xl border border-[color:var(--line)] bg-[color:var(--them)] px-3 py-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
      >
        <Avatar name={name} url={avatarUrl} size={44} />
        <span className="flex min-w-0 flex-col items-start gap-0.5">
          <b className="max-w-full truncate text-[14.5px]">{name}</b>
          {status && <StatusPill label={status.label} color={status.color} />}
        </span>
        <Icon icon={ChevronRight} size={16} className="ml-auto flex-none text-[color:var(--muted)]" />
      </button>
      <Group>
        {SECTIONS.map((s) => (
          <SectionRow key={s.id} id={s.id} icon={s.icon} label={s.label} value={values[s.id]} onClick={() => onOpen(s.id)} />
        ))}
      </Group>
    </div>
  )
}

/** Named exactly by its label (e2e finds "Security & privacy"); the value is its description. */
function SectionRow({
  id,
  icon,
  label,
  value,
  onClick,
}: {
  id: SettingsSection
  icon: LucideIcon
  label: string
  value: string
  onClick: () => void
}) {
  const labelId = useId()
  const valueId = useId()
  return (
    <button type="button" data-section-row={id} aria-labelledby={labelId} aria-describedby={valueId} onClick={onClick} className={buttonRowClass}>
      <span className={tileClass}>
        <Icon icon={icon} size={15} />
      </span>
      <span id={labelId}>{label}</span>
      <span className={valueClass}>
        <span id={valueId}>{value}</span>
        <Icon icon={ChevronRight} size={15} />
      </span>
    </button>
  )
}

const navItemClass =
  'flex w-full items-center gap-[9px] rounded-lg px-[9px] py-[7px] text-left text-[13px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]'

function DesktopNav({
  selected,
  onSelect,
  onEditProfile,
  onLogOut,
}: {
  selected: SettingsSection
  onSelect: (section: SettingsSection) => void
  onEditProfile: () => void
  onLogOut: () => void
}) {
  const { name, avatarUrl } = useMe()
  return (
    <nav
      aria-label="Settings sections"
      className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-[color:var(--line)] bg-[color:var(--bar)] px-2.5 py-3.5"
    >
      <div className="mb-1.5 flex items-center gap-2 border-b border-[color:var(--line)] px-1.5 pb-3 pt-1">
        <Avatar name={name} url={avatarUrl} size={30} />
        <b className="min-w-0 truncate text-[13px]">{name}</b>
      </div>
      <button
        type="button"
        onClick={onEditProfile}
        className={`${navItemClass} text-[color:var(--muted)] hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)]`}
      >
        <Icon icon={User} size={16} />
        Profile
      </button>
      {SECTIONS.map((s) => {
        const on = s.id === selected
        return (
          <button
            key={s.id}
            type="button"
            aria-current={on ? 'page' : undefined}
            onClick={() => onSelect(s.id)}
            className={`${navItemClass} ${
              on
                ? 'bg-[color:var(--seg-on)] font-semibold text-[color:var(--fg)]'
                : 'text-[color:var(--muted)] hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)]'
            }`}
          >
            <Icon icon={s.icon} size={16} />
            {s.label}
          </button>
        )
      })}
      <button
        type="button"
        onClick={onLogOut}
        className={`${navItemClass} mt-auto text-[color:var(--danger)] hover:bg-[color:var(--seg)]`}
      >
        <Icon icon={LogOut} size={16} />
        Log out
      </button>
    </nav>
  )
}

/** "Log out of this device?" over the sheet. Esc (through the sheet) cancels it. */
function LogOutConfirm({ onCancel }: { onCancel: () => void }) {
  const titleId = useId()
  const [working, setWorking] = useState(false)
  const confirm = async () => {
    setWorking(true)
    // Signing out unmounts the chat, and this sheet with it. If it fails, let them try again.
    try {
      await logOut()
    } catch {
      setWorking(false)
    }
  }
  return (
    <div className="absolute inset-0 z-10 grid place-items-center bg-black/45 p-6">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[300px] rounded-2xl border border-[color:var(--line)] bg-[color:var(--bar)] p-4 shadow-[0_20px_50px_var(--shadow)]"
      >
        <p id={titleId} className="mb-4 text-center text-[15px] font-semibold">
          Log out of this device?
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            autoFocus
            onClick={onCancel}
            className="h-9 flex-1 rounded-lg bg-[color:var(--seg)] text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void confirm()}
            className="h-9 flex-1 rounded-lg bg-[color:var(--danger)] text-sm font-semibold text-[color:var(--on-danger)] outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)] disabled:opacity-60"
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  )
}
