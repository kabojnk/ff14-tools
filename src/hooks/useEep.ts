import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useUiStore } from '@/stores/uiStore'

export function useEep() {
  const { eepMode, setEepMode } = useUiStore()
  const [passphrase, setPassphrase] = useState<string | null>(null)

  useEffect(() => {
    // Load passphrase from settings
    supabase
      .from('settings')
      .select('value')
      .eq('key', 'eep_passphrase')
      .single()
      .then(({ data }) => {
        if (data) setPassphrase(data.value)
      })
  }, [])

  const activateEep = () => setEepMode(true)
  const deactivateEep = (input: string): boolean => {
    if (passphrase && input === passphrase) {
      setEepMode(false)
      return true
    }
    return false
  }

  return { eepMode, activateEep, deactivateEep, passphrase }
}
