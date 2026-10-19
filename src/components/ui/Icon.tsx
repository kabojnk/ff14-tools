import type { LucideIcon, LucideProps } from 'lucide-react'

interface IconProps extends LucideProps {
  icon: LucideIcon
}

/** Flat line icon with the app's defaults (20 px, 1.9 stroke). Decorative unless given an aria-label. */
export function Icon({ icon: Glyph, size = 20, strokeWidth = 1.9, ...rest }: IconProps) {
  const labelled = 'aria-label' in rest
  return <Glyph size={size} strokeWidth={strokeWidth} aria-hidden={labelled ? undefined : true} focusable={false} {...rest} />
}
