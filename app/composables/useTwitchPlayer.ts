// Types pour le SDK Twitch
declare global {
  interface Window {
    Twitch?: {
      Player: TwitchPlayerConstructor
    }
  }
}

interface TwitchPlayerConstructor {
  new (elementId: string, options: TwitchPlayerOptions): TwitchPlayer
  READY: string
  PLAYING: string
  PLAYBACK_BLOCKED: string
}

interface TwitchPlayerOptions {
  channel: string
  parent: string[]
  width?: string | number
  height?: string | number
  muted?: boolean
  autoplay?: boolean
}

interface TwitchPlayer {
  getQualities: () => TwitchQuality[]
  getQuality: () => string
  setQuality: (quality: string) => void
  getMuted: () => boolean
  setMuted: (muted: boolean) => void
  getVolume: () => number
  setVolume: (volume: number) => void
  isPaused: () => boolean
  pause: () => void
  play: () => void
  destroy: () => void
  addEventListener: (event: string, callback: () => void) => void
}

interface TwitchQuality {
  group: string
  name: string
}

// État global
const sdkLoaded = ref(false)
const sdkLoading = ref(false)
const players = ref<Map<string, TwitchPlayer>>(new Map())
const qualities = ref<Map<string, TwitchQuality[]>>(new Map())
const currentQuality = ref<Map<string, string>>(new Map())
const globalMuted = ref(true)
const globalPaused = ref(false)
const globalLowQuality = ref(false)

// Charger le SDK Twitch
async function loadTwitchSDK(): Promise<void> {
  if (sdkLoaded.value || !import.meta.client) return

  if (sdkLoading.value) {
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (sdkLoaded.value) {
          clearInterval(check)
          resolve()
        }
      }, 100)
    })
    return
  }

  sdkLoading.value = true

  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://player.twitch.tv/js/embed/v1.js'
    script.async = true
    script.onload = () => {
      sdkLoaded.value = true
      sdkLoading.value = false
      resolve()
    }
    script.onerror = () => {
      sdkLoading.value = false
      reject(new Error('Failed to load Twitch SDK'))
    }
    document.head.appendChild(script)
  })
}

// Créer un player
async function createPlayer(elementId: string, channel: string): Promise<TwitchPlayer | null> {
  if (!import.meta.client) return null

  await loadTwitchSDK()

  if (!window.Twitch?.Player) return null

  const element = document.getElementById(elementId)
  if (!element) return null

  // Attendre le rendu
  await new Promise(resolve => setTimeout(resolve, 100))

  destroyPlayer(channel)

  const player = new window.Twitch.Player(elementId, {
    channel,
    parent: [window.location.hostname],
    width: '100%',
    height: '100%',
    muted: globalMuted.value,
    autoplay: true,
  })

  players.value.set(channel, player)

  const TwitchPlayer = window.Twitch.Player

  player.addEventListener(TwitchPlayer.READY, () => {
    updateQualities(channel)
    player.setMuted(globalMuted.value)
    player.play()
  })

  player.addEventListener(TwitchPlayer.PLAYBACK_BLOCKED, () => {
    player.setMuted(true)
    globalMuted.value = true
    player.play()
  })

  return player
}

// Mettre à jour les qualités
function updateQualities(channel: string) {
  const player = players.value.get(channel)
  if (!player) return

  try {
    qualities.value.set(channel, player.getQualities())
    currentQuality.value.set(channel, player.getQuality())
  } catch {
    // Qualités pas encore disponibles
  }
}

// Changer la qualité
function setQuality(channel: string, quality: string) {
  const player = players.value.get(channel)
  if (!player) return
  player.setQuality(quality)
  currentQuality.value.set(channel, quality)
}

// Détruire un player
function destroyPlayer(channel: string) {
  const player = players.value.get(channel)
  if (player) {
    try { player.destroy() } catch { /* ignore */ }
    players.value.delete(channel)
    qualities.value.delete(channel)
    currentQuality.value.delete(channel)
  }
}

// Détruire tous les players
function destroyAllPlayers() {
  for (const channel of players.value.keys()) {
    destroyPlayer(channel)
  }
}

// Muter/démuter tous les players
function toggleMuteAll() {
  globalMuted.value = !globalMuted.value
  for (const player of players.value.values()) {
    try { player.setMuted(globalMuted.value) } catch { /* ignore */ }
  }
}

// Mettre le volume à 1% sur tous les players
function setLowVolumeAll() {
  globalMuted.value = false
  for (const player of players.value.values()) {
    try {
      player.setMuted(false)
      player.setVolume(0.01)
    } catch { /* ignore */ }
  }
}

// Pause/Play tous les players
function togglePlayPauseAll() {
  globalPaused.value = !globalPaused.value
  for (const player of players.value.values()) {
    try {
      if (globalPaused.value) {
        player.pause()
      } else {
        player.play()
      }
    } catch { /* ignore */ }
  }
}

// Basculer entre qualité basse et auto pour tous les players
function toggleQualityAll() {
  globalLowQuality.value = !globalLowQuality.value

  for (const [channel, player] of players.value.entries()) {
    try {
      const availableQualities = player.getQualities()
      if (globalLowQuality.value) {
        // Trouver la qualité la plus basse (dernière dans la liste, avant 'auto')
        const lowQuality = availableQualities
          .filter(q => q.group !== 'auto')
          .pop()
        if (lowQuality) {
          player.setQuality(lowQuality.group)
          currentQuality.value.set(channel, lowQuality.group)
        }
      } else {
        // Remettre en auto
        player.setQuality('auto')
        currentQuality.value.set(channel, 'auto')
      }
    } catch { /* ignore */ }
  }
}

export function useTwitchPlayer() {
  return {
    players: computed(() => players.value),
    qualities: computed(() => qualities.value),
    currentQuality: computed(() => currentQuality.value),
    globalMuted: computed(() => globalMuted.value),
    globalPaused: computed(() => globalPaused.value),
    globalLowQuality: computed(() => globalLowQuality.value),
    createPlayer,
    destroyPlayer,
    destroyAllPlayers,
    setQuality,
    updateQualities,
    toggleMuteAll,
    setLowVolumeAll,
    togglePlayPauseAll,
    toggleQualityAll,
  }
}
