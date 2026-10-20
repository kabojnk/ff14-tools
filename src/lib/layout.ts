export type PhoneView = 'chat' | 'list'

/** Phones open straight into the chat when there is one conversation (or none yet), else on the list. */
export function defaultPhoneView(conversationCount: number): PhoneView {
  return conversationCount > 1 ? 'list' : 'chat'
}
