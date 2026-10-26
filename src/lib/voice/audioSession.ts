export type AudioSessionType = 'auto' | 'playback' | 'play-and-record'

/**
 * Safari's and WKWebView's Audio Session API (iOS 17+). 'playback' lets a voice memo play with the
 * silent switch on; 'play-and-record' is for recording; 'auto' hands control back. A no-op elsewhere.
 */
export function setAudioSession(type: AudioSessionType): void {
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession
  if (!session) return
  try {
    session.type = type
  } catch {
    // A value this browser doesn't know: keep the one it has.
  }
}
