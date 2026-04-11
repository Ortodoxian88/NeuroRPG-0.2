// src/components/room/ChatArea.tsx

import React, {
  useEffect,
  useRef,
  useMemo,
  memo,
  useCallback,
} from 'react'
import { Loader2 } from 'lucide-react'
import Markdown from 'react-markdown'
import { cn } from '@/src/lib/utils'
import type { Message, ChatSettings, AppSettings, Player } from '@/src/types'

// ─── Типы ─────────────────────────────────────────────────────────────────────

interface CurrentUser {
  id: string
  email?: string
  display_name?: string | null
}

export interface ChatAreaProps {
  messages: Message[]
  currentUser: CurrentUser
  isGenerating: boolean
  typingIndicator: string
  generationError: string | null
  isHost: boolean
  onRetryGeneration: () => void
  onForceTurn: () => void
  playersCount: number
  readyPlayersCount: number
  players?: Player[]
  typedMessageIds: Set<string>
  onMessageTyped: (id: string) => void
  chatSettings?: ChatSettings
  appSettings?: AppSettings
}

// ─── Утилиты ──────────────────────────────────────────────────────────────────

/**
* Форматирование времени сообщения
*/
function formatTime(timestamp: Date | string | number | null | undefined): string {
  if (!timestamp) return ''

  try {
      // Поддержка Firestore Timestamp
      const date =
          timestamp instanceof Date
              ? timestamp
              : typeof timestamp === 'object' && 'toDate' in (timestamp as object)
                  ? (timestamp as { toDate(): Date }).toDate()
                  : new Date(timestamp as string | number)

      if (isNaN(date.getTime())) return ''

      return date.toLocaleTimeString('ru-RU', {
          hour: '2-digit',
          minute: '2-digit',
      })
  } catch {
      return ''
  }
}

/**
* Детерминированный цвет игрока на основе его uid
* Одинаковый uid всегда даёт одинаковый цвет
*/
function getPlayerColor(uid: string, playerColorsEnabled: boolean): string {
  if (!playerColorsEnabled) return 'text-neutral-500'

  const colors = [
      'text-blue-500',
      'text-green-500',
      'text-yellow-600',
      'text-purple-500',
      'text-pink-500',
      'text-indigo-500',
      'text-teal-500',
  ]

  let hash = 0
  for (let i = 0; i < uid.length; i++) {
      hash = uid.charCodeAt(i) + ((hash << 5) - hash)
  }

  return colors[Math.abs(hash) % colors.length]
}

/**
* Санитизация текста перед вставкой в HTML
* Предотвращает XSS
*/
function escapeHtml(unsafe: string): string {
  return unsafe
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
}

/**
* Подсветка ключевых слов в БЕЗОПАСНОМ HTML
* Сначала экранируем, потом добавляем разметку
*/
function highlightKeywords(content: string, enabled: boolean): string {
  if (!enabled) return escapeHtml(content)

  const escaped = escapeHtml(content)

  const keywords = [
      'золото', 'меч', 'зелье', 'пещера',
      'замок', 'ключ', 'алтарь', 'сундук',
      'магия', 'дракон', 'артефакт', 'руна',
  ]

  let result = escaped

  keywords.forEach((kw) => {
      // Только отдельные слова (word boundary через lookbehind/lookahead)
      const regex = new RegExp(`(?<=[\\s,.:;!?]|^)(${kw})(?=[\\s,.:;!?]|$)`, 'gi')
      result = result.replace(
          regex,
          '<span class="text-orange-500 font-bold">$1</span>'
      )
  })

  return result
}

// ─── Хук настроек чата ────────────────────────────────────────────────────────

function useChatStyles(chatSettings?: ChatSettings, appSettings?: AppSettings) {
  const isLight = appSettings?.theme === 'light'

  return useMemo(() => {
      const fontClass = (() => {
          switch (chatSettings?.fontFamily) {
              case 'serif': return 'font-serif'
              case 'mono': return 'font-mono'
              case 'dyslexic': return 'font-opendyslexic'
              default: return 'font-sans'
          }
      })()

      const sizeClass = (() => {
          switch (chatSettings?.fontSize) {
              case 'sm': return 'text-sm'
              case 'lg': return 'text-lg'
              default: return 'text-base'
          }
      })()

      const alignClass = chatSettings?.textAlign === 'justify'
          ? 'text-justify'
          : 'text-left'

      const lineHeightClass = (() => {
          switch (chatSettings?.lineHeight) {
              case 'tight': return 'leading-snug'
              case 'loose': return 'leading-loose'
              default: return 'leading-relaxed'
          }
      })()

      const trackingClass = (() => {
          switch (chatSettings?.tracking) {
              case 'tight': return 'tracking-tighter'
              case 'wide': return 'tracking-wide'
              default: return 'tracking-normal'
          }
      })()

      const aiTextColorClass = (() => {
          switch (chatSettings?.aiTextColor) {
              case 'gold': return 'text-yellow-600 dark:text-yellow-200'
              case 'purple': return 'text-purple-600 dark:text-purple-200'
              case 'green': return 'text-green-600 dark:text-green-200'
              default: return isLight ? 'text-neutral-900' : 'text-neutral-100'
          }
      })()

      const borderStyleClass = (() => {
          switch (chatSettings?.borderStyle) {
              case 'sharp': return 'rounded-none'
              case 'fantasy': return 'rounded-tl-3xl rounded-br-3xl rounded-tr-md rounded-bl-md'
              default: return 'rounded-2xl'
          }
      })()

      const shadowClass = (() => {
          switch (chatSettings?.shadowIntensity) {
              case 'none': return 'shadow-none'
              case 'sm': return 'shadow-sm'
              case 'lg': return 'shadow-xl'
              default: return isLight ? 'shadow-sm' : 'shadow-lg'
          }
      })()

      const avatarSizeClass = (() => {
          switch (chatSettings?.avatarSize) {
              case 'sm': return 'w-6 h-6 text-[10px]'
              case 'lg': return 'w-10 h-10 text-base'
              default: return 'w-8 h-8 text-xs'
          }
      })()

      return {
          fontClass,
          sizeClass,
          alignClass,
          lineHeightClass,
          trackingClass,
          aiTextColorClass,
          borderStyleClass,
          shadowClass,
          avatarSizeClass,
          isLight,
          showAvatar: chatSettings?.avatarSize !== 'hidden',
          showTimestamps: chatSettings?.showTimestamps ?? false,
          isCompact: chatSettings?.compactMode ?? false,
          isPlain: chatSettings?.messageStyle === 'plain',
          boldNames: chatSettings?.boldNames !== false,
          italicActions: chatSettings?.italicActions ?? false,
          autoCapitalize: chatSettings?.autoCapitalize ?? false,
          enableMarkdown: chatSettings?.enableMarkdown !== false,
          highlightKeywords: chatSettings?.highlightKeywords ?? false,
          hideSystemMessages: chatSettings?.hideSystemMessages ?? false,
          focusMode: chatSettings?.focusMode ?? false,
          typewriterSpeed: chatSettings?.typewriterSpeed ?? 0,
          playerColors: chatSettings?.playerColors !== false,
      }
  }, [chatSettings, appSettings, isLight])
}

// ─── TypewriterContent ────────────────────────────────────────────────────────

interface TypewriterContentProps {
  content: string
  speed: number
  onComplete?: () => void
}

const TypewriterContent = memo<TypewriterContentProps>(({
  content,
  speed,
  onComplete,
}) => {
  const [displayedContent, setDisplayedContent] = React.useState('')
  const indexRef = useRef(0)
  const onCompleteRef = useRef(onComplete)

  // Обновляем ref без ре-запуска эффекта
  useEffect(() => {
      onCompleteRef.current = onComplete
  }, [onComplete])

  useEffect(() => {
      // Сбрасываем при смене контента
      indexRef.current = 0
      setDisplayedContent('')

      if (speed === 0 || !content) {
          setDisplayedContent(content)
          onCompleteRef.current?.()
          return
      }

      const timer = setInterval(() => {
          indexRef.current += 1
          setDisplayedContent(content.slice(0, indexRef.current))

          if (indexRef.current >= content.length) {
              clearInterval(timer)
              onCompleteRef.current?.()
          }
      }, speed)

      return () => clearInterval(timer)
  }, [content, speed])

  return (
      <div className="whitespace-pre-wrap">
          <Markdown>{displayedContent}</Markdown>
      </div>
  )
})

TypewriterContent.displayName = 'TypewriterContent'

// ─── Сообщения ────────────────────────────────────────────────────────────────

interface SystemMessageProps {
  content: string
  isLight: boolean
}

const SystemMessage = memo<SystemMessageProps>(({ content, isLight }) => (
  <div className="flex justify-center my-2">
      <div
          role="status"
          aria-live="polite"
          className={cn(
              'border rounded-full px-4 py-2 text-xs font-medium',
              'flex items-center gap-2 tracking-wide uppercase',
              isLight
                  ? 'bg-orange-50 border-orange-100 text-orange-600'
                  : 'bg-orange-500/10 border border-orange-500/20 text-orange-200/70'
          )}
      >
          <span
              className="w-1.5 h-1.5 rounded-full bg-orange-500 animate-pulse"
              aria-hidden="true"
          />
          {content}
      </div>
  </div>
))

SystemMessage.displayName = 'SystemMessage'

interface PlayerMessageProps {
  msg: Message
  isMine: boolean
  isLast: boolean
  isHost: boolean
  styles: ReturnType<typeof useChatStyles>
  currentUserId: string
  onMessageTyped: (id: string) => void
  typedMessageIds: Set<string>
}

const PlayerMessage = memo<PlayerMessageProps>(({
  msg,
  isMine,
  isLast,
  isHost,
  styles,
  onMessageTyped,
  typedMessageIds,
}) => {
  const {
      isLight, isCompact, isPlain, showTimestamps,
      showAvatar, boldNames, italicActions, autoCapitalize,
      enableMarkdown, highlightKeywords: hlKeywords,
      borderStyleClass, shadowClass, avatarSizeClass,
      playerColors, focusMode,
  } = styles

  const isFocused = !focusMode || isLast
  const playerColor = getPlayerColor(msg.playerUid || '', playerColors)

  // Скрытое действие видно только автору и хосту
  if (msg.isHidden && !isMine && !isHost) {
      return (
          <div
              className={cn(
                  'p-3 text-sm italic flex items-center gap-2',
                  'transition-opacity duration-500',
                  isLight ? 'text-neutral-400' : 'text-neutral-500',
                  !isPlain && (
                      isLight
                          ? 'bg-white border border-neutral-200 rounded-xl shadow-sm'
                          : 'bg-neutral-900/30 border border-neutral-800/30 rounded-xl'
                  ),
                  !isFocused && 'opacity-30 grayscale'
              )}
              aria-label="Скрытое действие игрока"
          >
              <span aria-hidden="true">🔒</span>
              <span>{msg.playerName} сделал тайное действие</span>
          </div>
      )
  }

  const messageContent = enableMarkdown ? (
      <Markdown>{msg.content}</Markdown>
  ) : (
      <div
          className="whitespace-pre-wrap"
          // Безопасно: контент экранируется в highlightKeywords
          dangerouslySetInnerHTML={{
              __html: highlightKeywords(msg.content, hlKeywords),
          }}
      />
  )

  return (
      <article
          className={cn(
              isCompact ? 'p-2' : 'p-4',
              !isPlain && borderStyleClass,
              !isPlain && shadowClass,
              !isPlain && (
                  isMine
                      ? isLight
                          ? 'bg-orange-50 border border-orange-100 text-neutral-900'
                          : 'bg-orange-900/20 border border-orange-900/30 text-orange-100'
                      : isLight
                          ? 'bg-white border border-neutral-200 text-neutral-900'
                          : 'bg-neutral-800/50 border border-neutral-700/50 text-neutral-200'
              ),
              !isPlain && msg.isHidden && 'border-red-500/30 bg-red-900/20',
              isPlain && (
                  isLight
                      ? 'border-b border-neutral-200 pb-4'
                      : 'border-b border-neutral-800/50 pb-4'
              ),
              'transition-opacity duration-500',
              !isFocused && 'opacity-30 grayscale'
          )}
          aria-label={`Действие игрока ${msg.playerName}`}
      >
          {/* Заголовок сообщения */}
          <header
              className={cn(
                  'text-xs uppercase tracking-wider mb-2',
                  'flex items-center gap-2',
                  isLight ? 'text-neutral-500' : 'text-neutral-400'
              )}
          >
              {showAvatar && (
                  <div
                      className={cn(
                          'rounded-full flex items-center justify-center',
                          'font-bold shrink-0 border',
                          avatarSizeClass,
                          playerColor,
                          isLight
                              ? 'bg-neutral-50 border-neutral-200'
                              : 'bg-neutral-800 border-neutral-700'
                      )}
                      aria-hidden="true"
                  >
                      {msg.playerName?.charAt(0).toUpperCase() || '?'}
                  </div>
              )}

              <span className={cn(boldNames && 'font-bold', playerColor)}>
                  {msg.playerName}
              </span>

              {msg.isHidden && (
                  <span
                      className="text-red-500 font-bold bg-red-500/10 px-2 py-0.5 rounded flex items-center gap-1"
                      aria-label="Тайное действие"
                  >
                      🔒 ТАЙНОЕ
                  </span>
              )}

              <span className="text-neutral-700" aria-hidden="true">•</span>
              <span>Ход {msg.turn}</span>

              {showTimestamps && (
                  <>
                      <span className="text-neutral-700" aria-hidden="true">•</span>
                      <time dateTime={new Date(msg.createdAt as string).toISOString()}>
                          {formatTime(msg.createdAt)}
                      </time>
                  </>
              )}
          </header>

          {/* Контент */}
          <div
              className={cn(
                  'markdown-body',
                  italicActions && 'italic',
                  isLight ? 'text-neutral-600' : 'text-neutral-300',
                  autoCapitalize && 'first-letter:uppercase'
              )}
          >
              {messageContent}
          </div>
      </article>
  )
})

PlayerMessage.displayName = 'PlayerMessage'

interface AiMessageProps {
  msg: Message
  isLast: boolean
  isHost: boolean
  styles: ReturnType<typeof useChatStyles>
  typedMessageIds: Set<string>
  onMessageTyped: (id: string) => void
}

const AiMessage = memo<AiMessageProps>(({
  msg,
  isLast,
  isHost,
  styles,
  typedMessageIds,
  onMessageTyped,
}) => {
  const {
      isLight, isCompact, isPlain, showTimestamps,
      showAvatar, autoCapitalize, enableMarkdown,
      highlightKeywords: hlKeywords, borderStyleClass,
      shadowClass, avatarSizeClass, aiTextColorClass,
      typewriterSpeed, focusMode,
  } = styles

  const isFocused = !focusMode || isLast
  const isAiRole = msg.role === 'ai'

  const shouldUseTypewriter =
      isLast &&
      isAiRole &&
      typewriterSpeed > 0 &&
      !typedMessageIds.has(msg.id)

  const handleTyped = useCallback(() => {
      onMessageTyped(msg.id)
  }, [msg.id, onMessageTyped])

  const messageContent = (() => {
      if (shouldUseTypewriter) {
          return (
              <TypewriterContent
                  content={msg.content}
                  speed={typewriterSpeed}
                  onComplete={handleTyped}
              />
          )
      }

      if (!enableMarkdown) {
          return (
              <div
                  className="whitespace-pre-wrap"
                  dangerouslySetInnerHTML={{
                      __html: highlightKeywords(msg.content, hlKeywords),
                  }}
              />
          )
      }

      return <Markdown>{msg.content}</Markdown>
  })()

  return (
      <article
          className={cn(
              isCompact ? 'p-3' : 'p-5',
              !isPlain && borderStyleClass,
              !isPlain && shadowClass,
              !isPlain && (
                  isAiRole
                      ? isLight
                          ? 'bg-white border border-neutral-200'
                          : 'bg-neutral-900 border border-neutral-800'
                      : isLight
                          ? 'bg-neutral-100/50 border border-neutral-200'
                          : 'bg-neutral-900/50 border border-neutral-800/50'
              ),
              isPlain && (
                  isLight
                      ? 'border-b border-neutral-200 pb-4'
                      : 'border-b border-neutral-800/50 pb-4'
              ),
              isAiRole
                  ? aiTextColorClass
                  : isLight ? 'text-neutral-700' : 'text-neutral-300',
              'transition-opacity duration-500',
              !isFocused && 'opacity-30 grayscale'
          )}
          aria-label={isAiRole ? 'Ответ Гейм-мастера' : 'Действия игроков'}
      >
          {/* Заголовок */}
          <header
              className={cn(
                  'text-xs font-bold uppercase tracking-[0.2em]',
                  'mb-3 flex items-center gap-2 border-b pb-2',
                  isLight
                      ? 'text-neutral-400 border-neutral-100'
                      : 'text-neutral-500 border-neutral-800'
              )}
          >
              {showAvatar && isAiRole && (
                  <div
                      className={cn(
                          'rounded-full flex items-center justify-center',
                          'font-bold shrink-0 border',
                          avatarSizeClass,
                          isLight
                              ? 'bg-orange-50 border-orange-200 text-orange-600'
                              : 'bg-orange-900/30 border-orange-500/30 text-orange-500'
                      )}
                      aria-hidden="true"
                  >
                      GM
                  </div>
              )}

              <span>{isAiRole ? 'Гейм-мастер' : 'Действия игроков'}</span>
              <span className="text-neutral-700" aria-hidden="true">•</span>
              <span>Ход {msg.turn}</span>

              {showTimestamps && (
                  <>
                      <span className="text-neutral-700" aria-hidden="true">•</span>
                      <time dateTime={new Date(msg.createdAt as string).toISOString()}>
                          {formatTime(msg.createdAt)}
                      </time>
                  </>
              )}
          </header>

          {/* Скрытые рассуждения для хоста */}
          {isHost && msg.reasoning && (
              <div
                  className={cn(
                      'mb-4 p-3 border rounded-lg text-xs font-mono',
                      isLight
                          ? 'bg-neutral-50 border-neutral-200 text-neutral-500'
                          : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                  )}
                  aria-label="Скрытые рассуждения ГМ"
              >
                  <div className="font-bold text-neutral-500 mb-1">
                      Скрытые рассуждения (только для Хоста):
                  </div>
                  <Markdown>{msg.reasoning}</Markdown>
              </div>
          )}

          {/* Контент сообщения */}
          <div
              className={cn(
                  'markdown-body prose prose-orange max-w-none',
                  isLight ? 'prose-neutral' : 'prose-invert',
                  autoCapitalize && 'first-letter:uppercase'
              )}
          >
              {messageContent}
          </div>
      </article>
  )
})

AiMessage.displayName = 'AiMessage'

// ─── Вспомогательные UI компоненты ───────────────────────────────────────────

interface GeneratingIndicatorProps {
  typingIndicator: string
  isLight: boolean
}

const GeneratingIndicator = memo<GeneratingIndicatorProps>(({
  typingIndicator,
  isLight,
}) => (
  <div
      role="status"
      aria-live="polite"
      aria-label="Гейм-мастер думает"
      className={cn(
          'rounded-xl p-4 border flex items-center gap-3 text-sm',
          isLight
              ? 'bg-white border-neutral-200 text-neutral-900 shadow-sm'
              : 'bg-neutral-900 border border-neutral-800 text-neutral-100'
      )}
  >
      <Loader2 size={16} className="animate-spin text-orange-500 shrink-0" aria-hidden="true" />
      <span className="text-neutral-400 animate-pulse">
          {typingIndicator || 'Гейм-мастер думает...'}
      </span>
  </div>
))

GeneratingIndicator.displayName = 'GeneratingIndicator'

interface GenerationErrorProps {
  error: string
  onRetry: () => void
}

const GenerationError = memo<GenerationErrorProps>(({ error, onRetry }) => (
  <div
      role="alert"
      className="rounded-xl p-4 bg-red-900/20 border border-red-900/50 text-red-200 flex flex-col gap-3 text-sm"
  >
      <span className="font-medium">{error}</span>
      <button
          onClick={onRetry}
          className={cn(
              'bg-red-600 hover:bg-red-500 text-white',
              'px-4 py-2 rounded-lg w-fit',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2'
          )}
      >
          Повторить попытку
      </button>
  </div>
))

GenerationError.displayName = 'GenerationError'

interface ReadyStatusBarProps {
  players: Player[]
  readyPlayersCount: number
  playersCount: number
  isLight: boolean
  onForceTurn: () => void
}

const ReadyStatusBar = memo<ReadyStatusBarProps>(({
  players,
  readyPlayersCount,
  playersCount,
  isLight,
  onForceTurn,
}) => (
  <div
      className="flex flex-col items-center gap-2 py-2"
      role="status"
      aria-label={`${readyPlayersCount} из ${playersCount} игроков готовы`}
  >
      {/* Статус готовности игроков */}
      <div className="flex flex-wrap justify-center gap-2 mb-2">
          {players.map((p) => (
              <div
                  key={p.uid}
                  className={cn(
                      'px-2 py-1 rounded-md text-[10px]',
                      'font-bold uppercase tracking-wider border transition-all',
                      p.isReady
                          ? 'bg-green-500/20 border-green-500/30 text-green-400'
                          : 'bg-neutral-500/10 border-neutral-500/20 text-neutral-500'
                  )}
                  title={p.isReady ? 'Готов' : 'Не готов'}
              >
                  {p.name} {p.isReady ? '✓' : '…'}
              </div>
          ))}
      </div>

      {/* Кнопка форсирования хода */}
      <button
          onClick={onForceTurn}
          className={cn(
              'text-xs text-neutral-500 hover:text-orange-400',
              'transition-colors flex items-center gap-1',
              'px-3 py-1.5 rounded-full border',
              isLight
                  ? 'bg-white border-neutral-200 hover:border-orange-300'
                  : 'bg-neutral-900/50 border-neutral-800',
              'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2'
          )}
          aria-label={`Форсировать ход. Готовы ${readyPlayersCount} из ${playersCount} игроков`}
      >
          <span aria-hidden="true">▶️</span>
          Форсировать ход ({readyPlayersCount}/{playersCount} готовы)
      </button>
  </div>
))

ReadyStatusBar.displayName = 'ReadyStatusBar'

// ─── Основной компонент ───────────────────────────────────────────────────────

export default function ChatArea({
  messages,
  currentUser,
  isGenerating,
  typingIndicator,
  generationError,
  isHost,
  onRetryGeneration,
  onForceTurn,
  playersCount,
  readyPlayersCount,
  players = [],
  typedMessageIds,
  onMessageTyped,
  chatSettings,
  appSettings,
}: ChatAreaProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastMessageCountRef = useRef(messages.length)

  const styles = useChatStyles(chatSettings, appSettings)
  const { isLight, hideSystemMessages } = styles

  // Автоскролл при появлении новых сообщений
  useEffect(() => {
      if (messages.length <= lastMessageCountRef.current) {
          lastMessageCountRef.current = messages.length
          return
      }

      lastMessageCountRef.current = messages.length

      if (chatSettings?.autoScroll === false) return

      scrollRef.current?.scrollTo({
          top: scrollRef.current.scrollHeight,
          behavior: chatSettings?.smoothScroll === false ? 'auto' : 'smooth',
      })
  }, [
      messages.length,
      chatSettings?.autoScroll,
      chatSettings?.smoothScroll,
  ])

  const lastMessageId = messages[messages.length - 1]?.id

  return (
      <div
          ref={scrollRef}
          role="log"
          aria-live="polite"
          aria-label="История чата комнаты"
          className={cn(
              'flex-1 overflow-y-auto p-4 space-y-6 pb-4',
              chatSettings?.smoothScroll !== false && 'scroll-smooth',
              styles.fontClass,
              styles.sizeClass,
              styles.alignClass,
              styles.lineHeightClass,
              styles.trackingClass,
              isLight ? 'bg-neutral-50' : 'bg-black'
          )}
      >
          {messages.map((msg) => {
              // Системные сообщения
              if (msg.role === 'system') {
                  if (hideSystemMessages) return null

                  return (
                      <SystemMessage
                          key={msg.id}
                          content={msg.content}
                          isLight={isLight}
                      />
                  )
              }

              const isLast = msg.id === lastMessageId

              // Сообщения игроков
              if (msg.role === 'player') {
                  const isMine = msg.playerUid === currentUser?.id

                  return (
                      <PlayerMessage
                          key={msg.id}
                          msg={msg}
                          isMine={isMine}
                          isLast={isLast}
                          isHost={isHost}
                          styles={styles}
                          currentUserId={currentUser.id}
                          typedMessageIds={typedMessageIds}
                          onMessageTyped={onMessageTyped}
                      />
                  )
              }

              // AI и остальные сообщения
              return (
                  <AiMessage
                      key={msg.id}
                      msg={msg}
                      isLast={isLast}
                      isHost={isHost}
                      styles={styles}
                      typedMessageIds={typedMessageIds}
                      onMessageTyped={onMessageTyped}
                  />
              )
          })}

          {/* Индикатор генерации */}
          {isGenerating && (
              <GeneratingIndicator
                  typingIndicator={typingIndicator}
                  isLight={isLight}
              />
          )}

          {/* Ошибка генерации (только для хоста) */}
          {generationError && isHost && (
              <GenerationError
                  error={generationError}
                  onRetry={onRetryGeneration}
              />
          )}

          {/* Статус готовности (только для хоста) */}
          {isHost && !isGenerating && readyPlayersCount > 0 && readyPlayersCount < playersCount && (
              <ReadyStatusBar
                  players={players}
                  readyPlayersCount={readyPlayersCount}
                  playersCount={playersCount}
                  isLight={isLight}
                  onForceTurn={onForceTurn}
              />
          )}
      </div>
  )
}