import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockSingle, mockUpdateEq } = vi.hoisted(() => ({
  mockSingle: vi.fn(),
  mockUpdateEq: vi.fn(),
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ single: mockSingle }) }),
      update: () => ({ eq: mockUpdateEq }),
    }),
  },
}))

import { useUiStore } from '@/stores/uiStore'

const initialState = useUiStore.getState()

beforeEach(() => {
  useUiStore.setState(initialState, true)
  mockSingle.mockReset()
  mockUpdateEq.mockReset().mockResolvedValue({ error: null })
})

describe('uiStore eep mode', () => {
  it('entering eep mode persists to sessionStorage and disguises the title', () => {
    useUiStore.getState().setEepMode(true)
    expect(useUiStore.getState().eepMode).toBe(true)
    expect(sessionStorage.getItem('eepMode')).toBe('true')
    expect(document.title).toBe('FF14 Random Content Picker')
  })

  it('leaving eep mode restores the app title', () => {
    useUiStore.getState().setEepMode(true)
    useUiStore.getState().setEepMode(false)
    expect(useUiStore.getState().eepMode).toBe(false)
    expect(sessionStorage.getItem('eepMode')).toBe('false')
    expect(document.title).toBe('XIV Tools')
  })

  it('lockApp enters eep mode and sets pinLocked; unlockPin clears it', () => {
    useUiStore.getState().lockApp()
    expect(useUiStore.getState()).toMatchObject({ eepMode: true, pinLocked: true })
    useUiStore.getState().unlockPin()
    expect(useUiStore.getState().pinLocked).toBe(false)
  })
})

describe('uiStore PIN', () => {
  it('loadPin stores the PIN and its length', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin: '567890' }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(useUiStore.getState()).toMatchObject({ pinCode: '567890', pinLength: 6 })
  })

  it('loadPin with no PIN leaves pinLength null', async () => {
    mockSingle.mockResolvedValue({ data: { lock_pin: null }, error: null })
    await useUiStore.getState().loadPin('user-1')
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null })
  })

  it('loadPin with no row clears any previous PIN', async () => {
    useUiStore.setState({ pinCode: '1234', pinLength: 4 })
    mockSingle.mockResolvedValue({ data: null, error: { message: 'not found' } })
    await useUiStore.getState().loadPin('user-2')
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null })
  })

  it('setPinCode writes the PIN for that user and updates pinLength', async () => {
    await useUiStore.getState().setPinCode('user-1', '12345')
    expect(mockUpdateEq).toHaveBeenCalledWith('id', 'user-1')
    expect(useUiStore.getState()).toMatchObject({ pinCode: '12345', pinLength: 5 })
  })

  it('setPinCode(null) clears the PIN', async () => {
    await useUiStore.getState().setPinCode('user-1', '1234')
    await useUiStore.getState().setPinCode('user-1', null)
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null })
  })

  it('setPinCode rejects and keeps the old PIN when the write fails', async () => {
    useUiStore.setState({ pinCode: '1234', pinLength: 4 })
    mockUpdateEq.mockResolvedValue({ error: { message: 'permission denied' } })
    await expect(useUiStore.getState().setPinCode('user-1', '999999')).rejects.toThrow('permission denied')
    expect(useUiStore.getState()).toMatchObject({ pinCode: '1234', pinLength: 4 })
  })

  it('clearPin forgets the PIN and any lock (used on logout)', () => {
    useUiStore.setState({ pinCode: '1234', pinLength: 4, pinLocked: true })
    useUiStore.getState().clearPin()
    expect(useUiStore.getState()).toMatchObject({ pinCode: null, pinLength: null, pinLocked: false })
  })
})
