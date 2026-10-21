type CapacitorGlobal = { isNativePlatform?: () => boolean }

/**
 * True only inside the iOS app: a `--mode native` build running in Capacitor's web view. The mode
 * check is a build-time constant, so website builds drop every branch behind it. The Capacitor global
 * is read directly so the website never bundles @capacitor/core.
 */
export function isNativeApp(): boolean {
  if (import.meta.env.MODE !== 'native') return false
  const cap = (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor
  return cap?.isNativePlatform?.() === true
}
