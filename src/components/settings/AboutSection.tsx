import { Group, rowClass, valueClass } from '@/components/settings/Group'

/** Settings → About: the version and build date baked in by vite.config.ts. */
export function AboutSection() {
  return (
    <Group>
      <p className={rowClass}>
        <span>Version</span><span className={valueClass}>{__APP_VERSION__}</span>
      </p>
      <p className={rowClass}>
        <span>Built</span><span className={valueClass}>{__BUILD_DATE__}</span>
      </p>
    </Group>
  )
}
