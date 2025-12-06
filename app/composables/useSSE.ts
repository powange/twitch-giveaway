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

interface DrawAlert {
  channel: string
  timestamp: number
}

const sseData = ref<SSEData>({ giveaways: [], gifts: [] })
const currentAlert = ref<DrawAlert | null>(null)
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

  eventSource.addEventListener('draw-alert', (event) => {
    const data = JSON.parse(event.data) as { channel: string }
    currentAlert.value = {
      channel: data.channel,
      timestamp: Date.now()
    }
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
  const drawAlert = computed(() => currentAlert.value)

  function clearAlert() {
    currentAlert.value = null
  }

  onMounted(() => {
    connect()
  })

  return {
    giveaways,
    gifts,
    drawAlert,
    clearAlert,
    isConnected,
    isInitialized,
    refresh: connect,
  }
}
