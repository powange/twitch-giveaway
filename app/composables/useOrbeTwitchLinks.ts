export interface DetectedStream {
  channel: string
  detectedAt: number
  expiresAt: number
}

const STREAM_DURATION = 60 * 60 * 1000 // 1 heure en ms
const MAIN_CHANNEL = 'seaofthieves'
const STORAGE_KEY = 'orbe-streams'

interface OrbeTwitchLinksCallbacks {
  onStreamDetected?: (stream: DetectedStream) => void
  onStreamExpired?: (channel: string) => void
  onRaidDetected?: (fromChannel: string) => void
}

export function useOrbeTwitchLinks(callbacks?: OrbeTwitchLinksCallbacks) {
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const temporaryStreams = ref<DetectedStream[]>([])

  // Charger depuis localStorage
  function loadFromStorage() {
    if (import.meta.server) return

    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as DetectedStream[]
        const now = Date.now()
        // Filtrer les streams expirés
        temporaryStreams.value = parsed.filter(s => s.expiresAt > now)
        saveToStorage()
      } catch {
        temporaryStreams.value = []
      }
    }
  }

  // Sauvegarder en localStorage
  function saveToStorage() {
    if (import.meta.server) return
    localStorage.setItem(STORAGE_KEY, JSON.stringify(temporaryStreams.value))
  }

  // Parser un message IRC Twitch
  function parseIRCMessage(raw: string): { user: string, message: string } | null {
    const match = raw.match(/:(\w+)!\S+ PRIVMSG #\w+ :(.+)$/i)
    if (!match || !match[1] || !match[2]) return null

    return {
      user: match[1],
      message: match[2].trim()
    }
  }

  // Chemins Twitch qui ne sont pas des streams
  const IGNORED_PATHS = [
    'collections', 'videos', 'clips', 'directory', 'settings',
    'subscriptions', 'inventory', 'wallet', 'drops', 'search',
    'team', 'p', 'jobs', 'turbo', 'store', 'downloads', 'broadcast'
  ]

  // Détecter les liens Twitch dans un message
  function detectTwitchLinks(message: string): string[] {
    const regex = /(?:https?:\/\/)?(?:www\.)?twitch\.tv\/(\w+)/gi
    const matches: string[] = []
    let match

    while ((match = regex.exec(message)) !== null) {
      const channel = match[1].toLowerCase()
      // Ignorer le stream principal et les chemins non-stream
      if (channel !== MAIN_CHANNEL && !IGNORED_PATHS.includes(channel)) {
        matches.push(channel)
      }
    }

    return matches
  }

  // Ajouter ou prolonger un stream
  function addOrExtendStream(channel: string) {
    const now = Date.now()
    const expiresAt = now + STREAM_DURATION

    const existing = temporaryStreams.value.find(s => s.channel === channel)

    if (existing) {
      // Prolonger le timer
      existing.expiresAt = expiresAt
      console.log('[OrbeTwitchLinks] Extended stream:', channel)
    } else {
      // Nouveau stream
      const stream: DetectedStream = {
        channel,
        detectedAt: now,
        expiresAt
      }
      temporaryStreams.value.push(stream)
      console.log('[OrbeTwitchLinks] New stream detected:', channel)
      callbacks?.onStreamDetected?.(stream)
    }

    saveToStorage()
  }

  // Supprimer un stream manuellement
  function removeStream(channel: string) {
    const index = temporaryStreams.value.findIndex(s => s.channel === channel)
    if (index !== -1) {
      temporaryStreams.value.splice(index, 1)
      saveToStorage()
      callbacks?.onStreamExpired?.(channel)
    }
  }

  // Vérifier les expirations
  function checkExpirations() {
    const now = Date.now()
    const expired = temporaryStreams.value.filter(s => s.expiresAt <= now)

    for (const stream of expired) {
      console.log('[OrbeTwitchLinks] Stream expired:', stream.channel)
      callbacks?.onStreamExpired?.(stream.channel)
    }

    if (expired.length > 0) {
      temporaryStreams.value = temporaryStreams.value.filter(s => s.expiresAt > now)
      saveToStorage()
    }
  }

  // Connecter au WebSocket IRC
  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN) return

    ws.value = new WebSocket('wss://irc-ws.chat.twitch.tv:443')

    ws.value.onopen = () => {
      isConnected.value = true
      console.log('[OrbeTwitchLinks] WebSocket connected')

      const nick = `justinfan${Math.floor(Math.random() * 100000)}`
      ws.value?.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.value?.send(`NICK ${nick}`)
      ws.value?.send(`JOIN #${MAIN_CHANNEL}`)
      console.log('[OrbeTwitchLinks] Joined #' + MAIN_CHANNEL)
    }

    ws.value.onmessage = (event) => {
      const lines = event.data.split('\r\n')

      for (const line of lines) {
        if (!line) continue

        // Répondre aux PING
        if (line.startsWith('PING')) {
          ws.value?.send('PONG :tmi.twitch.tv')
          continue
        }

        // Détecter les raids (USERNOTICE avec msg-id=raid)
        if (line.includes('USERNOTICE') && line.includes('msg-id=raid')) {
          const raidMatch = line.match(/msg-param-login=(\w+)/)
          const fromChannel = raidMatch ? raidMatch[1] : 'unknown'
          console.log('[OrbeTwitchLinks] Raid detected from:', fromChannel)
          callbacks?.onRaidDetected?.(fromChannel)
          continue
        }

        // Parser les messages normaux
        const parsed = parseIRCMessage(line)
        if (parsed) {
          const links = detectTwitchLinks(parsed.message)
          for (const channel of links) {
            addOrExtendStream(channel)
          }
        }
      }
    }

    ws.value.onclose = () => {
      isConnected.value = false
      console.log('[OrbeTwitchLinks] WebSocket closed')
      // Reconnecter après 5 secondes
      setTimeout(() => {
        console.log('[OrbeTwitchLinks] Reconnecting...')
        connect()
      }, 5000)
    }

    ws.value.onerror = (error) => {
      console.error('[OrbeTwitchLinks] WebSocket error:', error)
      ws.value?.close()
    }
  }

  // Démarrer la surveillance
  function start() {
    loadFromStorage()
    connect()
  }

  // Arrêter la surveillance
  function stop() {
    ws.value?.close()
    ws.value = null
  }

  // Timer pour vérifier les expirations
  let expirationInterval: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    start()
    expirationInterval = setInterval(checkExpirations, 1000)
  })

  onUnmounted(() => {
    stop()
    if (expirationInterval) {
      clearInterval(expirationInterval)
    }
  })

  return {
    isConnected,
    temporaryStreams: readonly(temporaryStreams),
    mainChannel: MAIN_CHANNEL,
    removeStream,
    addOrExtendStream // Pour tests manuels
  }
}
