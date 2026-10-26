import { useCallback, useState } from 'react'
import { ChevronLeft, Image } from 'lucide-react'
import { lastSeen, presenceLine } from '@/lib/presence'
import { usePartner } from '@/hooks/usePartner'
import { useConversationStore } from '@/stores/conversationStore'
import { useTypingStore } from '@/stores/typingStore'
import { Avatar } from '@/components/ui/Avatar'
import { Icon } from '@/components/ui/Icon'
import { ChatMenu } from '@/components/chat2/ChatMenu'
import { EepButton } from '@/components/chat2/EepButton'
import { PartnerCard } from '@/components/chat2/PartnerCard'
import { SpaceTabs } from '@/components/chat2/SpaceTabs'
import { StatusPill } from '@/components/chat2/StatusPill'
import type { InfoTab } from '@/components/chat/ChannelInfoPanel'

interface ChatHeaderProps {
  isDesktop: boolean
  /** Phones: the back chevron to the conversation list. */
  onBack?: () => void
  /** Opens media, pins or search (desktop: the right slide-over; phones: full screen). */
  onOpenPanel: (tab: InfoTab) => void
}

const iconButton =
  'flex-none rounded-full p-1.5 text-[color:var(--muted)] transition-colors hover:bg-[color:var(--seg)] hover:text-[color:var(--fg)]'

/**
 * The chat header: the partner (avatar with presence, name, `online`/`last seen`/`typing…` and the status
 * pill), the Eep! button, the media button (desktop) and the ⋮ menu, with the Main|Schist tabs inline on
 * desktop and underneath on phones. Tapping the avatar or name opens the partner's card.
 */
export function ChatHeader({ isDesktop, onBack, onOpenPanel }: ChatHeaderProps) {
  const conversation = useConversationStore((s) => s.conversation)
  const activeSpace = useConversationStore((s) => s.activeSpace)
  const dragTheLake = useConversationStore((s) => s.dragTheLake)
  const partner = usePartner()
  const partnerTyping = useTypingStore((s) => (partner.id ? s.typing[activeSpace].find((t) => t.user_id === partner.id) : undefined))
  const [showCard, setShowCard] = useState(false)
  const closeCard = useCallback(() => setShowCard(false), [])

  const name = partner.profile?.nickname ?? conversation?.title ?? 'Conversation'
  const line = partnerTyping
    ? partnerTyping.activity === 'recording'
      ? 'recording a voice message…'
      : 'typing…'
    : presenceLine(partner.presence, lastSeen(partner.profile), new Date())

  return (
    <header
      data-chat-header
      className="relative z-20 flex-shrink-0 border-b border-[color:var(--line)] bg-[color:var(--bar)] text-[color:var(--fg)]"
    >
      {!isDesktop && <div className="pt-safe" />}
      <div
        className="flex items-center gap-2.5 py-2"
        style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
      >
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back to chats" className="-ml-1 flex-none rounded-full p-1 text-[color:var(--accent)]">
            <Icon icon={ChevronLeft} size={24} />
          </button>
        )}

        <button type="button" onClick={() => setShowCard(true)} aria-label={`View ${name}'s profile`} className="flex-none rounded-full">
          <Avatar name={name} url={partner.profile?.avatar_url} size={isDesktop ? 36 : 34} presence={partner.id ? partner.presence : undefined} />
        </button>

        <div className={`min-w-0 ${isDesktop ? 'flex-initial' : 'flex-1'}`}>
          <button
            type="button"
            onClick={() => setShowCard(true)}
            className="block max-w-full truncate text-left text-[14.5px] font-semibold leading-tight"
          >
            {name}
          </button>
          <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] leading-tight text-[color:var(--muted)]">
            <span data-testid="presence-line" className={`flex-none ${partnerTyping ? 'text-[color:var(--accent)]' : ''}`}>
              {line}
            </span>
            {partner.status && <StatusPill label={partner.status.label} color={partner.status.color} className="min-w-0" />}
          </div>
        </div>

        {isDesktop && <SpaceTabs className="ml-4 w-[160px] flex-none xl:w-[220px]" />}

        <div className="ml-auto flex flex-none items-center gap-1.5">
          {isDesktop && (
            <button type="button" onClick={() => onOpenPanel('media')} aria-label="Media, files & links" title="Media, files & links" className={iconButton}>
              <Icon icon={Image} />
            </button>
          )}
          <EepButton wide={isDesktop} />
          <ChatMenu
            onSearch={() => onOpenPanel('search')}
            onMedia={() => onOpenPanel('media')}
            onPins={() => onOpenPanel('pins')}
            onDragTheLake={() => void dragTheLake()}
          />
        </div>
      </div>

      {!isDesktop && (
        <div className="pb-2" style={{ paddingLeft: 'max(0.75rem, env(safe-area-inset-left))', paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}>
          <SpaceTabs />
        </div>
      )}

      {showCard && (
        <PartnerCard
          name={name}
          profile={partner.profile}
          presence={partner.presence}
          status={partner.status}
          variant={isDesktop ? 'popover' : 'sheet'}
          onClose={closeCard}
        />
      )}
    </header>
  )
}
