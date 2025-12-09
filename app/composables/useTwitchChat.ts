interface ChatMessage {
  channel: string
  user: string
  message: string
  timestamp: number
}

interface DetectedCommand {
  command: string
  count: number
  percentage: number
}

const BUFFER_SIZE = 20

interface ChatCallbacks {
  onMessage?: (channel: string, user: string, message: string) => void
  onGiveawayDetected?: (channel: string, command: string, percentage: number) => void
}

interface ChatOptions {
  commandThreshold?: number // Seuil pour afficher le badge (défaut: 25%)
  alertThreshold?: number   // Seuil pour déclencher l'alerte (défaut: 35%)
}

export function useTwitchChat(callbacks?: ChatCallbacks, options?: ChatOptions) {
  const commandThreshold = ref(options?.commandThreshold ?? 0.25)
  const alertThreshold = ref(options?.alertThreshold ?? 0.35)
  const ws = ref<WebSocket | null>(null)
  const isConnected = ref(false)
  const connectedChannels = ref<Set<string>>(new Set())

  // Buffer des derniers messages par channel
  const messageBuffers = ref<Map<string, ChatMessage[]>>(new Map())

  // Commandes détectées par channel
  const detectedCommands = ref<Map<string, DetectedCommand | null>>(new Map())

  // Channels déjà alertés (pour éviter les alertes répétées)
  const alertedChannels = ref<Set<string>>(new Set())

  // Parser un message IRC Twitch
  function parseIRCMessage(raw: string): { channel: string, user: string, message: string } | null {
    // Format avec tags: @tags :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    // Format sans tags: :user!user@user.tmi.twitch.tv PRIVMSG #channel :message
    const match = raw.match(/:(\w+)!\S+ PRIVMSG #(\w+) :(.+)$/i)
    if (!match || !match[1] || !match[2] || !match[3]) return null

    return {
      user: match[1],
      channel: match[2].toLowerCase(),
      message: match[3].trim()
    }
  }

  // Analyser le buffer pour détecter les commandes fréquentes
  function analyzeBuffer(channel: string) {
    const buffer = messageBuffers.value.get(channel) || []
    if (buffer.length < 5) {
      detectedCommands.value.set(channel, null)
      return
    }

    // Compter les messages qui commencent par ! (commandes)
    const commandCounts = new Map<string, number>()

    for (const msg of buffer) {
      // Vérifier si le message commence par une commande !
      const match = msg.message.match(/^(!\w+)/)
      if (match && match[1]) {
        const cmd = match[1].toLowerCase()
        commandCounts.set(cmd, (commandCounts.get(cmd) || 0) + 1)
      }
    }

    // Trouver la commande la plus fréquente
    let topCommand: string | null = null
    let topCount = 0

    for (const [cmd, count] of commandCounts) {
      if (count > topCount) {
        topCount = count
        topCommand = cmd
      }
    }

    const percentage = Math.round((topCount / buffer.length) * 100)

    // Vérifier si elle dépasse le seuil d'affichage
    if (topCommand && topCount >= buffer.length * commandThreshold.value) {
      detectedCommands.value.set(channel, {
        command: topCommand,
        count: topCount,
        percentage
      })

      // Vérifier si on doit déclencher une alerte (seuil plus élevé)
      if (topCount >= buffer.length * alertThreshold.value && !alertedChannels.value.has(channel)) {
        alertedChannels.value.add(channel)
        console.log('[TwitchChat] Giveaway detected!', channel, topCommand, percentage + '%')
        callbacks?.onGiveawayDetected?.(channel, topCommand, percentage)
      }
    } else {
      detectedCommands.value.set(channel, null)
      // Reset l'alerte si la commande n'est plus détectée
      alertedChannels.value.delete(channel)
    }
  }

  // Ajouter un message au buffer
  function addMessage(channel: string, user: string, message: string) {
    const buffer = messageBuffers.value.get(channel) || []

    buffer.push({
      channel,
      user,
      message,
      timestamp: Date.now()
    })

    // Garder seulement les BUFFER_SIZE derniers messages
    while (buffer.length > BUFFER_SIZE) {
      buffer.shift()
    }

    messageBuffers.value.set(channel, buffer)

    // Analyser le buffer
    analyzeBuffer(channel)

    // Callback optionnel
    callbacks?.onMessage?.(channel, user, message)
  }

  // Se connecter au WebSocket IRC
  function connect() {
    if (ws.value?.readyState === WebSocket.OPEN) return

    ws.value = new WebSocket('wss://irc-ws.chat.twitch.tv:443')

    ws.value.onopen = () => {
      isConnected.value = true
      console.log('[TwitchChat] WebSocket connected')

      // Connexion anonyme (justinfan + nombre aléatoire)
      const nick = `justinfan${Math.floor(Math.random() * 100000)}`
      ws.value?.send('CAP REQ :twitch.tv/tags twitch.tv/commands')
      ws.value?.send(`NICK ${nick}`)
      console.log('[TwitchChat] Sent NICK:', nick)

      // Rejoindre les channels déjà demandés
      for (const channel of connectedChannels.value) {
        ws.value?.send(`JOIN #${channel.toLowerCase()}`)
        console.log('[TwitchChat] Joining channel:', channel)
      }
    }

    ws.value.onmessage = (event) => {
      const lines = event.data.split('\r\n')

      for (const line of lines) {
        if (!line) continue

        console.log('[TwitchChat] Raw:', line.substring(0, 100))

        // Répondre aux PING pour garder la connexion
        if (line.startsWith('PING')) {
          ws.value?.send('PONG :tmi.twitch.tv')
          console.log('[TwitchChat] PONG sent')
          continue
        }

        // Parser les messages PRIVMSG
        const parsed = parseIRCMessage(line)
        if (parsed) {
          console.log('[TwitchChat] Parsed message:', parsed)
          addMessage(parsed.channel, parsed.user, parsed.message)
        }
      }
    }

    ws.value.onclose = () => {
      isConnected.value = false
      console.log('[TwitchChat] WebSocket closed')
      // Reconnecter après 5 secondes
      setTimeout(() => {
        if (connectedChannels.value.size > 0) {
          console.log('[TwitchChat] Reconnecting...')
          connect()
        }
      }, 5000)
    }

    ws.value.onerror = (error) => {
      console.error('[TwitchChat] WebSocket error:', error)
      ws.value?.close()
    }
  }

  // Rejoindre un channel
  function joinChannel(channel: string) {
    const normalizedChannel = channel.toLowerCase()
    console.log('[TwitchChat] joinChannel called:', normalizedChannel)

    if (connectedChannels.value.has(normalizedChannel)) {
      console.log('[TwitchChat] Already in channel:', normalizedChannel)
      return
    }

    connectedChannels.value.add(normalizedChannel)
    messageBuffers.value.set(normalizedChannel, [])
    detectedCommands.value.set(normalizedChannel, null)

    if (!ws.value || ws.value.readyState !== WebSocket.OPEN) {
      console.log('[TwitchChat] WebSocket not open, connecting...')
      connect()
    } else {
      console.log('[TwitchChat] Sending JOIN for:', normalizedChannel)
      ws.value.send(`JOIN #${normalizedChannel}`)
    }
  }

  // Quitter un channel
  function leaveChannel(channel: string) {
    const normalizedChannel = channel.toLowerCase()

    connectedChannels.value.delete(normalizedChannel)
    messageBuffers.value.delete(normalizedChannel)
    detectedCommands.value.delete(normalizedChannel)

    if (ws.value?.readyState === WebSocket.OPEN) {
      ws.value.send(`PART #${normalizedChannel}`)
    }

    // Fermer la connexion si plus aucun channel
    if (connectedChannels.value.size === 0) {
      ws.value?.close()
      ws.value = null
    }
  }

  // Obtenir la commande détectée pour un channel
  function getDetectedCommand(channel: string): DetectedCommand | null {
    return detectedCommands.value.get(channel.toLowerCase()) || null
  }

  // Reset l'alerte pour un channel (permet de re-alerter)
  function resetAlert(channel: string) {
    alertedChannels.value.delete(channel.toLowerCase())
  }

  // Cleanup
  onUnmounted(() => {
    ws.value?.close()
    ws.value = null
  })

  // Mettre à jour les seuils
  function setCommandThreshold(value: number) {
    commandThreshold.value = Math.max(0.05, Math.min(1, value))
  }

  function setAlertThreshold(value: number) {
    alertThreshold.value = Math.max(0.05, Math.min(1, value))
  }

  return {
    isConnected,
    connectedChannels,
    detectedCommands,
    commandThreshold: readonly(commandThreshold),
    alertThreshold: readonly(alertThreshold),
    joinChannel,
    leaveChannel,
    getDetectedCommand,
    resetAlert,
    setCommandThreshold,
    setAlertThreshold
  }
}
