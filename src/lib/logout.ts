import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'

/**
 * Log out of this device: the FF14 screen's Logout and Settings both come through here.
 * Signs out (which also forgets the chat and the "has PIN" flag), clears the local PIN state,
 * and resets eep mode so the next login opens straight to the chat, not the disguise.
 */
export async function logOut(): Promise<void> {
  await useAuthStore.getState().signOut()
  const ui = useUiStore.getState()
  ui.clearPin()
  ui.setEepMode(false)
}
