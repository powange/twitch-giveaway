interface Gift {
  id: string
  title: string
  image: string
}

interface Giveaway {
  id: string
  twitchChannel: string
  date: string
  giftIds: string[]
  type: 'command' | 'ticket' | 'streamelements'
  command?: string
  streamElementsUrl?: string
  drawTime?: string
  requireFollow: boolean
  closed: boolean
  createdAt: string
}

interface SSEData {
  giveaways: Giveaway[]
  gifts: Gift[]
}

const sseData = ref<SSEData>({ giveaways: [], gifts: [] })
const isConnected = ref(false)
const isInitialized = ref(false)
let eventSource: EventSource | null = null
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null

function connect() {
  if (eventSource || !import.meta.client) return

  eventSource = new EventSource('/api/sse')

  eventSource.onopen = () => {
    isConnected.value = true
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
  }

  eventSource.addEventListener('init', (event) => {
    const data = JSON.parse(event.data) as SSEData
    sseData.value = data
    isInitialized.value = true
  })

  eventSource.addEventListener('update', (event) => {
    const data = JSON.parse(event.data) as SSEData
    sseData.value = data
  })

  eventSource.onerror = () => {
    isConnected.value = false
    eventSource?.close()
    eventSource = null

    // Reconnexion après 5 secondes
    if (!reconnectTimeout) {
      reconnectTimeout = setTimeout(() => {
        reconnectTimeout = null
        connect()
      }, 5000)
    }
  }
}

function disconnect() {
  if (eventSource) {
    eventSource.close()
    eventSource = null
  }
  if (reconnectTimeout) {
    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }
  isConnected.value = false
}

export function useSSE() {
  const giveaways = computed(() => sseData.value.giveaways)
  const gifts = computed(() => sseData.value.gifts)

  onMounted(() => {
    connect()
  })

  return {
    giveaways,
    gifts,
    isConnected,
    isInitialized,
    refresh: connect,
  }
}
