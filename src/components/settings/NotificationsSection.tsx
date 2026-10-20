import { Group, rowClass } from '@/components/settings/Group'

/** Settings → Notifications: a placeholder until the iPhone app (build 4) adds them. */
export function NotificationsSection() {
  return (
    <Group>
      <p className={`${rowClass} text-[color:var(--muted)]`}>Notifications come with the iPhone app.</p>
    </Group>
  )
}
