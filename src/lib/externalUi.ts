/**
 * Things the app opens that iOS draws over the page (the photo picker, the microphone prompt) take the
 * window's focus. A phone puts the disguise up as soon as the window loses focus, so these say so first.
 * The flag clears when focus comes back, or after a minute at most.
 */
const MAX_MS = 60_000
let until = 0

export function expectExternalUi(): void {
  until = Date.now() + MAX_MS
}

export function externalUiExpected(): boolean {
  return Date.now() < until
}

export function clearExternalUi(): void {
  until = 0
}

/** Every file picker opens through a click on a file input (often a programmatic `.click()`). */
export function watchFilePickers(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.target instanceof HTMLInputElement && e.target.type === 'file') expectExternalUi()
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}
