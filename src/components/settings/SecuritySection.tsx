import { useEffect, useRef, useState } from 'react'
import { LogOut } from 'lucide-react'
import { useAuthStore } from '@/stores/authStore'
import { useUiStore } from '@/stores/uiStore'
import { PinPad } from '@/components/pin/PinPad'
import { Icon } from '@/components/ui/Icon'
import { Portal } from '@/components/ui/Portal'
import { Group, buttonRowClass, rowClass, valueClass } from '@/components/settings/Group'
import { LakeRows } from '@/components/settings/LakeRows'
import { ReadReceiptsRow } from '@/components/settings/ReadReceiptsRow'

type PinStep = 'idle' | 'set' | 'change-verify' | 'change-set' | 'remove-verify'

interface SecuritySectionProps {
  /** Shows the red "Log out" row (phones; desktop has it at the bottom of the nav). */
  onLogOut?: () => void
}

/**
 * Settings → Security & privacy: the app lock PIN, read receipts, the lake and (on phones) Log out.
 *
 * The PIN wizard moved here unchanged from UserSettings. It lives in this section, so the section
 * must stay mounted while it runs; unmounting it (closing Settings) closes the PinPad and saves
 * nothing.
 */
export function SecuritySection({ onLogOut }: SecuritySectionProps) {
  const profile = useAuthStore((s) => s.profile)
  const { pinLength, setPin, clearPinRemote, verifyPin } = useUiStore()

  const [pinStep, setPinStep] = useState<PinStep>('idle')
  const [pinSuccess, setPinSuccess] = useState<string | null>(null)
  const pinSuccessTimerRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => () => clearTimeout(pinSuccessTimerRef.current), [])

  const resetPinWizard = () => {
    clearTimeout(pinSuccessTimerRef.current)
    setPinStep('idle')
    setPinSuccess(null)
  }

  const finishPinWizard = (message: string) => {
    clearTimeout(pinSuccessTimerRef.current)
    setPinStep('idle')
    setPinSuccess(message)
    pinSuccessTimerRef.current = setTimeout(() => setPinSuccess(null), 2500)
  }

  // Errors propagate to PinPad, which stays open and shows "Couldn't save. Try again."
  const handlePinSuccess = async (pin: string) => {
    if (!profile) throw new Error('Not signed in')
    switch (pinStep) {
      case 'set':
        await setPin(pin)
        finishPinWizard('PIN set successfully')
        break
      case 'change-verify':
        setPinStep('change-set')
        break
      case 'change-set':
        await setPin(pin)
        finishPinWizard('PIN changed successfully')
        break
      case 'remove-verify':
        await clearPinRemote()
        finishPinWizard('PIN removed')
        break
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      <Group label="App Lock PIN">
        <div className={rowClass}>
          Lock PIN
          <span className={valueClass}>{pinLength !== null ? `${pinLength} digits` : 'Off'}</span>
        </div>
        {pinLength === null ? (
          <button type="button" onClick={() => setPinStep('set')} className={`${buttonRowClass} text-[color:var(--accent)]`}>
            Set PIN
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setPinStep('change-verify')}
              className={`${buttonRowClass} text-[color:var(--accent)]`}
            >
              Change PIN
            </button>
            <button
              type="button"
              onClick={() => setPinStep('remove-verify')}
              className={`${buttonRowClass} text-[color:var(--danger)]`}
            >
              Remove PIN
            </button>
          </>
        )}
      </Group>
      {pinSuccess ? (
        <p role="status" className="-mt-1.5 px-1.5 text-[12.5px] font-medium text-[color:var(--accent)]">
          {pinSuccess}
        </p>
      ) : (
        <p className="-mt-1.5 px-1.5 text-[11px] leading-[1.45] text-[color:var(--muted)]">
          {pinLength !== null
            ? 'A 4–6 digit PIN is required to unlock the app after it goes to the background.'
            : 'Set a 4–6 digit PIN to lock the app when it loses focus.'}
        </p>
      )}

      <Group label="Privacy">
        <ReadReceiptsRow />
      </Group>

      <Group label="The lake">
        <LakeRows />
      </Group>

      {onLogOut && (
        <Group>
          <button
            type="button"
            onClick={onLogOut}
            className={`${buttonRowClass} justify-center font-semibold text-[color:var(--danger)]`}
          >
            <Icon icon={LogOut} size={16} />
            Log out
          </button>
        </Group>
      )}

      {/* PIN entry: PinPad is full-screen (z-70) above the sheet, portalled out of its panel. */}
      {pinStep !== 'idle' && (
        <Portal>
          {(pinStep === 'set' || pinStep === 'change-set') && (
            <PinPad key={pinStep} mode="set" onSuccess={handlePinSuccess} onCancel={resetPinWizard} />
          )}
          {(pinStep === 'change-verify' || pinStep === 'remove-verify') && pinLength !== null && (
            <PinPad
              key={pinStep}
              mode="unlock"
              length={pinLength}
              title="Enter Current Passcode"
              verify={verifyPin}
              onSuccess={handlePinSuccess}
              onCancel={resetPinWizard}
            />
          )}
        </Portal>
      )}
    </div>
  )
}
