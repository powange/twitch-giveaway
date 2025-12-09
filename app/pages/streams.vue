<script setup lang="ts">
const toast = useToast()

// Chat IRC Twitch pour détecter les commandes
const autoAlertModalOpen = ref(false)
const autoAlertChannel = ref<string | null>(null)
const autoAlertCommand = ref('')
const autoAlertPercentage = ref(0)

const {
  joinChannel,
  leaveChannel,
  getDetectedCommand,
  resetAlert,
  commandThreshold,
  alertThreshold,
  setCommandThreshold,
  setAlertThreshold
} = useTwitchChat({
  onGiveawayDetected: (channel, command, percentage) => {
    // Focus le stream
    focusedChannel.value = channel
    // Ouvrir la modal d'alerte automatique
    autoAlertChannel.value = channel
    autoAlertCommand.value = command
    autoAlertPercentage.value = percentage
    autoAlertModalOpen.value = true
    // Jouer le son d'alerte
    playAlertSound()
  }
})

// Confirmer l'alerte automatique : mettre à jour le giveaway et copier la commande
async function confirmAutoAlert() {
  if (!autoAlertChannel.value) return

  // Trouver le giveaway associé au channel
  const channelGiveaways = getChannelGiveaways(autoAlertChannel.value)
  const giveaway = channelGiveaways.find(g => g.type === 'command' || g.type === 'ticket')

  if (giveaway && autoAlertCommand.value) {
    try {
      await $fetch(`/api/giveaways/${giveaway.id}/command`, {
        method: 'PATCH',
        body: { command: autoAlertCommand.value }
      })
      toast.add({
        title: 'Commande mise a jour',
        description: `La commande ${autoAlertCommand.value} a ete enregistree`,
        color: 'success'
      })
    } catch {
      toast.add({
        title: 'Erreur',
        description: 'Impossible de mettre a jour la commande',
        color: 'error'
      })
    }
  }

  // Copier la commande
  await copyCommand(autoAlertCommand.value)

  // Fermer la modal
  autoAlertModalOpen.value = false
}

// SSE pour les mises à jour en temps réel
const { giveaways: sseGiveaways, gifts: sseGifts, drawAlert, clearAlert, isInitialized } = useSSE()

// Twitch Player SDK
const {
  createPlayer,
  destroyPlayer,
  qualities,
  currentQuality,
  setQuality,
  updateQualities,
  globalMuted,
  toggleMuteAll,
  setLowVolumeAll,
  globalPaused,
  togglePlayPauseAll,
  globalLowQuality,
  toggleQualityAll
} = useTwitchPlayer()

// Gestion des alertes de tirage
const alertedChannel = ref<string | null>(null)
let alertTimeout: ReturnType<typeof setTimeout> | null = null

// Son d'alerte avec Web Audio API
function playAlertSound() {
  if (!import.meta.client) return

  try {
    const audioContext = new AudioContext()

    // Jouer 3 bips courts
    const playBeep = (time: number) => {
      const oscillator = audioContext.createOscillator()
      const gainNode = audioContext.createGain()

      oscillator.connect(gainNode)
      gainNode.connect(audioContext.destination)

      oscillator.frequency.value = 800
      oscillator.type = 'sine'

      gainNode.gain.setValueAtTime(0.3, time)
      gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.15)

      oscillator.start(time)
      oscillator.stop(time + 0.15)
    }

    const now = audioContext.currentTime
    // 8 bips espacés de 0.2 secondes
    for (let i = 0; i < 8; i++) {
      playBeep(now + i * 0.2)
    }
  } catch {
    // Ignorer les erreurs si l'audio ne peut pas être joué
  }
}

// Modal d'alerte de tirage
const alertModalOpen = ref(false)
const alertModalChannel = ref<string | null>(null)
const alertModalCommand = ref('')
const alertModalGiveawayId = ref<string | null>(null)

function openAlertModal(channel: string) {
  alertModalChannel.value = channel
  // Chercher le giveaway de type commande pour ce channel
  const channelGiveaways = getChannelGiveaways(channel)
  const commandGiveaway = channelGiveaways.find(g => g.type === 'command')
  if (commandGiveaway) {
    alertModalCommand.value = commandGiveaway.command || ''
    alertModalGiveawayId.value = commandGiveaway.id
  } else {
    alertModalCommand.value = ''
    alertModalGiveawayId.value = null
  }
  alertModalOpen.value = true
}

async function confirmAndSendAlert() {
  if (!alertModalChannel.value) return

  // Si on a une commande, mettre à jour le giveaway
  if (alertModalGiveawayId.value && alertModalCommand.value) {
    try {
      await $fetch(`/api/giveaways/${alertModalGiveawayId.value}/command`, {
        method: 'PATCH',
        body: { command: alertModalCommand.value }
      })
    } catch {
      toast.add({
        title: 'Erreur',
        description: 'Impossible de mettre à jour la commande',
        color: 'error'
      })
      return
    }
  }

  // Envoyer l'alerte
  try {
    await $fetch(`/api/alert/${encodeURIComponent(alertModalChannel.value)}`, {
      method: 'POST'
    })
    alertModalOpen.value = false
  } catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible d\'envoyer l\'alerte',
      color: 'error'
    })
  }
}

// Observer les alertes entrantes
watch(drawAlert, (alert) => {
  if (!alert) return

  // Vérifier si on a ce stream ouvert
  if (selectedChannels.value.includes(alert.channel)) {
    alertedChannel.value = alert.channel
    playAlertSound()

    // Focus automatique sur le stream alerté
    if (focusedChannel.value !== alert.channel) {
      focusedChannel.value = alert.channel
    }

    // Effacer l'alerte visuelle après 10 secondes
    if (alertTimeout) clearTimeout(alertTimeout)
    alertTimeout = setTimeout(() => {
      alertedChannel.value = null
    }, 10000)
  }

  clearAlert()
})

// Données initiales via useFetch (en parallèle)
const [{ data: initialGiveaways }, { data: initialGifts }] = await Promise.all([
  useFetch('/api/giveaways'),
  useFetch('/api/gifts')
])

// Utiliser les données SSE une fois initialisé, sinon les données initiales
const giveaways = computed(() => isInitialized.value ? sseGiveaways.value : (initialGiveaways.value || []))
const gifts = computed(() => isInitialized.value ? sseGifts.value : (initialGifts.value || []))

const selectedChannels = ref<string[]>([])
const showChat = ref<Record<string, boolean>>({})
const focusedChannel = ref<string | null>(null)
const gridDensity = ref<'compact' | 'normal' | 'comfortable'>('normal')

// Ordre visuel des streams (séparé de selectedChannels pour éviter de recharger les players)
const channelOrder = ref<Record<string, number>>({})

// Initialiser l'ordre quand les channels changent
watch(selectedChannels, (channels) => {
  let maxOrder = Math.max(0, ...Object.values(channelOrder.value))

  channels.forEach((c) => {
    if (!(c in channelOrder.value)) {
      channelOrder.value[c] = ++maxOrder
    }
  })

  // Nettoyer les channels supprimés - recréer l'objet sans les channels supprimés
  const newOrder: Record<string, number> = {}
  Object.entries(channelOrder.value).forEach(([c, order]) => {
    if (channels.includes(c)) {
      newOrder[c] = order
    }
  })
  channelOrder.value = newOrder
}, { immediate: true, deep: true })

function getChannelOrder(channel: string): number {
  return channelOrder.value[channel] ?? 0
}

// Drag & drop state
const draggedChannel = ref<string | null>(null)
const dragOverChannel = ref<string | null>(null)
const dropPosition = ref<'left' | 'right' | null>(null)
const justSwappedChannels = ref<Set<string>>(new Set())

function onDragStart(channel: string, e: DragEvent) {
  draggedChannel.value = channel
  justSwappedChannels.value.clear()
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', channel)
  }
}

function onDragOver(channel: string, e: DragEvent) {
  e.preventDefault()
  if (draggedChannel.value && channel !== draggedChannel.value) {
    dragOverChannel.value = channel

    // Détecter si la souris est à gauche ou à droite de la cible
    const target = e.currentTarget as HTMLElement
    const rect = target.getBoundingClientRect()
    const midpoint = rect.left + rect.width / 2
    dropPosition.value = e.clientX < midpoint ? 'left' : 'right'
  }
}

function onDragLeave() {
  dragOverChannel.value = null
  dropPosition.value = null
}

// Normaliser les ordres pour qu'ils soient des entiers consécutifs
function normalizeOrders() {
  const entries = Object.entries(channelOrder.value)
    .sort((a, b) => a[1] - b[1])

  const newOrder: Record<string, number> = {}
  entries.forEach(([channel], index) => {
    newOrder[channel] = index + 1
  })
  channelOrder.value = newOrder
}

function onDrop(channel: string, e: DragEvent) {
  e.preventDefault()
  if (draggedChannel.value && draggedChannel.value !== channel) {
    const targetOrder = channelOrder.value[channel] ?? 0

    // Insérer avant ou après la cible selon la position
    if (dropPosition.value === 'left') {
      channelOrder.value[draggedChannel.value] = targetOrder - 0.5
    } else {
      channelOrder.value[draggedChannel.value] = targetOrder + 0.5
    }

    // Normaliser pour avoir des entiers
    normalizeOrders()

    // Marquer le channel pour l'animation
    justSwappedChannels.value = new Set([draggedChannel.value])
    setTimeout(() => justSwappedChannels.value.clear(), 400)
  }
  draggedChannel.value = null
  dragOverChannel.value = null
  dropPosition.value = null
}

function onDragEnd() {
  draggedChannel.value = null
  dragOverChannel.value = null
  dropPosition.value = null
}

// Confirmation suppression
const confirmDeleteOpen = ref(false)
const channelToDelete = ref<string | null>(null)

// Edition giveaway
const editModalOpen = ref(false)
const editingGiveaway = ref<typeof activeGiveaways.value[0] | null>(null)

function openEditGiveaway(channel: string) {
  const channelGiveaways = getChannelGiveaways(channel)
  const first = channelGiveaways[0]
  if (first) {
    editingGiveaway.value = first
    editModalOpen.value = true
  }
}

// Charger depuis localStorage au montage
onMounted(() => {
  const saved = localStorage.getItem('selectedStreams')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      selectedChannels.value = parsed.channels || []
      showChat.value = parsed.showChat || {}
      if (parsed.gridDensity && ['compact', 'normal', 'comfortable'].includes(parsed.gridDensity)) {
        gridDensity.value = parsed.gridDensity
      }
      if (parsed.channelOrder) {
        channelOrder.value = parsed.channelOrder
      }
      // Charger les seuils de détection
      if (typeof parsed.commandThreshold === 'number') {
        setCommandThreshold(parsed.commandThreshold)
      }
      if (typeof parsed.alertThreshold === 'number') {
        setAlertThreshold(parsed.alertThreshold)
      }
    } catch { /* ignore */ }
  }

  // Confirmation avant de quitter/rafraîchir la page
  window.addEventListener('beforeunload', handleBeforeUnload)
})

onUnmounted(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
})

function handleBeforeUnload(e: BeforeUnloadEvent) {
  if (selectedChannels.value.length > 0) {
    e.preventDefault()
    e.returnValue = ''
  }
}

// Confirmation pour la navigation interne (vers autre page)
onBeforeRouteLeave(() => {
  if (selectedChannels.value.length > 0) {
    const answer = window.confirm('Vous avez des streams ouverts. Voulez-vous vraiment quitter cette page ?')
    if (!answer) return false
  }
})

// Sauvegarder dans localStorage à chaque modification
watch([selectedChannels, showChat, gridDensity, channelOrder, commandThreshold, alertThreshold], () => {
  localStorage.setItem('selectedStreams', JSON.stringify({
    channels: selectedChannels.value,
    showChat: showChat.value,
    gridDensity: gridDensity.value,
    channelOrder: channelOrder.value,
    commandThreshold: commandThreshold.value,
    alertThreshold: alertThreshold.value
  }))
}, { deep: true })

// Créer les players quand les channels changent
watch(selectedChannels, async (newChannels, oldChannels) => {
  // Détruire les players supprimés
  const removedChannels = (oldChannels || []).filter(c => !newChannels.includes(c))
  for (const channel of removedChannels) {
    destroyPlayer(channel)
    leaveChannel(channel) // Quitter le chat IRC
  }

  // Créer les nouveaux players
  const addedChannels = newChannels.filter(c => !(oldChannels || []).includes(c))
  if (addedChannels.length > 0) {
    await nextTick()

    for (const channel of addedChannels) {
      await createPlayer(`player-${channel}`, channel)
      joinChannel(channel) // Rejoindre le chat IRC
    }
  }
}, { immediate: true, deep: true })

// Recréer le player quand on focus/unfocus (le conteneur change de taille)
watch(focusedChannel, async () => {
  await nextTick()
  // Rafraîchir les qualités après le changement de layout
  for (const channel of selectedChannels.value) {
    updateQualities(channel)
  }
})

// Vérifier si un giveaway est clos (manuellement ou > 2 jours)
function isGiveawayClosed(giveaway: { closed: boolean, date: string }): boolean {
  if (giveaway.closed) return true
  const giveawayDate = new Date(giveaway.date)
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  twoDaysAgo.setHours(0, 0, 0, 0)
  return giveawayDate < twoDaysAgo
}

// Filtrer les giveaways en cours uniquement
const activeGiveaways = computed(() => {
  if (!giveaways.value) return []
  return giveaways.value.filter(g => !isGiveawayClosed(g))
})

// Extraire les chaînes uniques des giveaways en cours
const availableChannels = computed(() => {
  const channels = activeGiveaways.value.map(g => getStreamerName(g.twitchChannel))
  return [...new Set(channels)]
})

function getStreamerName(channel: string): string {
  const match = channel.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?]+)/i)
  return match?.[1] ?? channel
}

function removeChatState(channel: string) {
  const { [channel]: _, ...rest } = showChat.value
  showChat.value = rest
}

function toggleChannel(channel: string) {
  const index = selectedChannels.value.indexOf(channel)
  if (index === -1) {
    selectedChannels.value = [...selectedChannels.value, channel]
    showChat.value[channel] = false
  } else {
    selectedChannels.value = selectedChannels.value.filter(c => c !== channel)
    removeChatState(channel)
  }
}

function toggleChat(channel: string) {
  showChat.value[channel] = !showChat.value[channel]
}

function askRemoveStream(channel: string) {
  channelToDelete.value = channel
  confirmDeleteOpen.value = true
}

function confirmRemoveStream() {
  if (!channelToDelete.value) return

  const index = selectedChannels.value.indexOf(channelToDelete.value)
  if (index !== -1) {
    selectedChannels.value.splice(index, 1)
    removeChatState(channelToDelete.value)
    if (focusedChannel.value === channelToDelete.value) {
      focusedChannel.value = null
    }
  }

  confirmDeleteOpen.value = false
  channelToDelete.value = null
}

function toggleFocus(channel: string) {
  focusedChannel.value = focusedChannel.value === channel ? null : channel
}

// Calculer la grille en fonction de la densité choisie
const gridClass = computed(() => {
  switch (gridDensity.value) {
    case 'compact':
      // Max 5 colonnes : 1 -> 2 -> 3 -> 4 -> 5
      return 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5'
    case 'comfortable':
      // Max 2 colonnes : 1 -> 2
      return 'grid-cols-1 lg:grid-cols-2'
    case 'normal':
    default:
      // Max 3 colonnes : 1 -> 2 -> 3
      return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
  }
})

// Parent domain pour l'embed Twitch (chat uniquement)
const parentDomain = computed(() => {
  if (import.meta.client) {
    return window.location.hostname
  }
  return 'localhost'
})

// Obtenir les giveaways actifs pour une chaîne
function getChannelGiveaways(channel: string) {
  return activeGiveaways.value.filter(g => getStreamerName(g.twitchChannel) === channel)
}

// Obtenir tous les cadeaux uniques pour une chaîne
function getChannelGifts(channel: string) {
  const channelGiveaways = getChannelGiveaways(channel)
  const giftIds = [...new Set(channelGiveaways.flatMap(g => g.giftIds))]
  return giftIds
    .map(id => gifts.value?.find(g => g.id === id))
    .filter((g): g is NonNullable<typeof g> => !!g)
}

// Obtenir la commande pour une chaîne (prend la première trouvée, type command ou ticket)
function getChannelCommand(channel: string) {
  const channelGiveaways = getChannelGiveaways(channel)
  const giveawayWithCommand = channelGiveaways.find(g => (g.type === 'command' || g.type === 'ticket') && g.command)
  return giveawayWithCommand?.command
}

// Obtenir l'URL StreamElements pour une chaîne
function getChannelStreamElementsUrl(channel: string) {
  const channelGiveaways = getChannelGiveaways(channel)
  const giveawayWithSE = channelGiveaways.find(g => g.type === 'streamelements' && g.streamElementsUrl)
  return giveawayWithSE?.streamElementsUrl
}

// Obtenir le type du premier giveaway pour une chaîne
function getChannelGiveawayType(channel: string) {
  return getChannelGiveaways(channel)[0]?.type
}

// Vérifier si un canal a un giveaway clos
function hasClosedGiveaway(channel: string) {
  const channelGiveaways = giveaways.value?.filter(g => getStreamerName(g.twitchChannel) === channel) || []
  return channelGiveaways.length > 0 && channelGiveaways.every(g => isGiveawayClosed(g))
}

// Copier la commande dans le presse-papier
async function copyCommand(command: string) {
  try {
    await navigator.clipboard.writeText(command)
    toast.add({
      title: 'Copie',
      description: 'Commande copiee dans le presse-papier',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible de copier la commande',
      color: 'error'
    })
  }
}

// Obtenir les qualités formatées pour un channel
function getQualityOptions(channel: string) {
  const channelQualities = qualities.value.get(channel) || []
  return channelQualities.map(q => ({
    label: q.name,
    value: q.group
  }))
}

// Changer la qualité d'un stream
function handleQualityChange(channel: string, quality: string) {
  setQuality(channel, quality)
}
</script>

<template>
  <UContainer class="py-8">
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold">
          Multi-Stream
        </h1>
        <p class="text-muted mt-1">
          Regardez plusieurs streams en simultane
        </p>
      </div>
    </div>

    <!-- Selection des chaines -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="font-semibold">
          Selectionner les chaines
        </h2>
      </template>

      <div
        v-if="!availableChannels.length"
        class="text-center py-4 text-muted"
      >
        Aucune chaine disponible. Il n'y a pas de giveaway en cours.
      </div>

      <div
        v-else
        class="flex flex-wrap gap-2"
      >
        <UButton
          v-for="channel in availableChannels"
          :key="channel"
          :color="selectedChannels.includes(channel) ? 'primary' : 'neutral'"
          :variant="selectedChannels.includes(channel) ? 'solid' : 'outline'"
          size="sm"
          @click="toggleChannel(channel)"
        >
          <UIcon
            name="i-simple-icons-twitch"
            class="w-4 h-4 mr-1"
          />
          {{ channel }}
        </UButton>
      </div>
    </UCard>

    <!-- Controles globaux -->
    <div
      v-if="selectedChannels.length"
      class="flex flex-wrap justify-between items-center gap-2 mb-4"
    >
      <!-- Densité de la grille -->
      <UFieldGroup size="xs">
        <UButton
          icon="i-lucide-rectangle-horizontal"
          title="Confortable (max 2)"
          :color="gridDensity === 'comfortable' ? 'primary' : 'neutral'"
          :variant="gridDensity === 'comfortable' ? 'solid' : 'outline'"
          @click="gridDensity = 'comfortable'"
        />
        <UButton
          icon="i-lucide-layout-grid"
          title="Normal (max 3)"
          :color="gridDensity === 'normal' ? 'primary' : 'neutral'"
          :variant="gridDensity === 'normal' ? 'solid' : 'outline'"
          @click="gridDensity = 'normal'"
        />
        <UButton
          icon="i-lucide-grid-3x3"
          title="Compact (max 5)"
          :color="gridDensity === 'compact' ? 'primary' : 'neutral'"
          :variant="gridDensity === 'compact' ? 'solid' : 'outline'"
          @click="gridDensity = 'compact'"
        />
      </UFieldGroup>

      <!-- Controles lecture/son/qualité -->
      <div class="flex gap-2">
        <UButton
          :icon="globalPaused ? 'i-lucide-play' : 'i-lucide-pause'"
          :label="globalPaused ? 'Tout lire' : 'Tout mettre en pause'"
          :color="globalPaused ? 'success' : 'neutral'"
          variant="outline"
          size="sm"
          @click="togglePlayPauseAll"
        />
        <UButton
          :icon="globalMuted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          :label="globalMuted ? 'Activer le son' : 'Couper le son'"
          :color="globalMuted ? 'warning' : 'neutral'"
          variant="outline"
          size="sm"
          @click="toggleMuteAll"
        />
        <UButton
          icon="i-lucide-volume-1"
          label="Son 1%"
          color="neutral"
          variant="outline"
          size="sm"
          @click="setLowVolumeAll"
        />
        <UButton
          :icon="globalLowQuality ? 'i-lucide-signal' : 'i-lucide-signal-low'"
          :label="globalLowQuality ? 'Qualite auto' : 'Qualite basse'"
          :color="globalLowQuality ? 'info' : 'neutral'"
          variant="outline"
          size="sm"
          @click="toggleQualityAll"
        />

        <!-- Seuils de détection giveaway -->
        <UPopover>
          <UButton
            icon="i-lucide-sliders-horizontal"
            label="Detection"
            color="neutral"
            variant="outline"
            size="sm"
          />
          <template #content>
            <div class="p-4 space-y-4 w-64">
              <p class="text-xs text-muted border-b pb-2 mb-2">
                Analyse sur les 20 derniers messages du chat
              </p>
              <div>
                <label class="text-sm font-medium mb-2 block">
                  Seuil badge: {{ Math.round(commandThreshold * 100) }}% ({{ Math.round(20 * commandThreshold) }}+ msg)
                </label>
                <input
                  type="range"
                  min="5"
                  max="50"
                  :value="commandThreshold * 100"
                  class="w-full"
                  @input="setCommandThreshold(Number(($event.target as HTMLInputElement).value) / 100)"
                >
                <p class="text-xs text-muted mt-1">
                  Affiche le badge quand X% du chat utilise une commande
                </p>
              </div>
              <div>
                <label class="text-sm font-medium mb-2 block">
                  Seuil alerte: {{ Math.round(alertThreshold * 100) }}% ({{ Math.round(20 * alertThreshold) }}+ msg)
                </label>
                <input
                  type="range"
                  min="10"
                  max="80"
                  :value="alertThreshold * 100"
                  class="w-full"
                  @input="setAlertThreshold(Number(($event.target as HTMLInputElement).value) / 100)"
                >
                <p class="text-xs text-muted mt-1">
                  Declenche l'alerte sonore quand X% du chat utilise une commande
                </p>
              </div>
            </div>
          </template>
        </UPopover>
      </div>
    </div>

    <!-- Streams -->
    <div
      v-if="!selectedChannels.length"
      class="text-center py-16"
    >
      <UIcon
        name="i-lucide-tv"
        class="w-16 h-16 text-muted mx-auto mb-4"
      />
      <h2 class="text-xl font-semibold mb-2">
        Aucun stream selectionne
      </h2>
      <p class="text-muted">
        Selectionnez des chaines ci-dessus pour les regarder
      </p>
    </div>

    <div v-else>
      <!-- Backdrop quand un stream est focus -->
      <div
        v-if="focusedChannel"
        class="fixed inset-0 z-40 bg-black/80"
        @click="focusedChannel = null"
      />

      <div :class="['grid gap-4 overflow-visible', gridClass]">
        <div
          v-for="channel in selectedChannels"
          :key="channel"
          :style="{ order: getChannelOrder(channel) }"
          :class="[
            'stream-card',
            focusedChannel === channel
              ? 'fixed inset-4 z-50 flex flex-col'
              : focusedChannel
                ? 'opacity-0 pointer-events-none'
                : '',
            draggedChannel === channel ? 'dragging' : '',
            justSwappedChannels.has(channel) ? 'just-swapped' : ''
          ]"
          :draggable="!focusedChannel"
          @dragstart="onDragStart(channel, $event)"
          @dragover="onDragOver(channel, $event)"
          @dragleave="onDragLeave"
          @drop="onDrop(channel, $event)"
          @dragend="onDragEnd"
        >
          <div
            :class="[
              'card-inner rounded-lg border-2 bg-white dark:bg-gray-900 overflow-hidden transition-all',
              alertedChannel === channel
                ? 'border-orange-500 ring-4 ring-orange-500/50 animate-pulse'
                : getDetectedCommand(channel)
                  ? 'border-red-500 ring-2 ring-red-500/30 animate-pulse'
                  : hasClosedGiveaway(channel)
                    ? 'border-red-500'
                    : 'border-gray-200 dark:border-gray-800',
              focusedChannel === channel ? 'h-full flex flex-col' : ''
            ]"
          >
            <!-- Indicateur de drop -->
            <div
              v-if="dragOverChannel === channel && dropPosition === 'left'"
              class="drop-indicator drop-indicator-left"
            />
            <div
              v-if="dragOverChannel === channel && dropPosition === 'right'"
              class="drop-indicator drop-indicator-right"
            />
            <!-- Header -->
            <div class="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800">
              <div class="flex items-center gap-3 flex-wrap">
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-lucide-grip-vertical"
                    class="drag-handle w-4 h-4 text-muted cursor-grab active:cursor-grabbing"
                    title="Glisser pour réorganiser"
                  />
                  <UButton
                    icon="i-lucide-pencil"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    title="Modifier le giveaway"
                    @click="openEditGiveaway(channel)"
                  />
                  <UIcon
                    name="i-simple-icons-twitch"
                    class="w-4 h-4 text-purple-500"
                  />
                  <span class="font-semibold">{{ channel }}</span>
                </div>

                <!-- Cadeaux -->
                <div
                  v-if="getChannelGifts(channel).length"
                  class="flex items-center gap-1"
                >
                  <img
                    v-for="gift in getChannelGifts(channel)"
                    :key="gift.id"
                    :src="gift.image"
                    :alt="gift.title"
                    :title="gift.title"
                    class="w-6 h-6 object-contain"
                  >
                </div>

                <!-- Type de giveaway -->
                <UBadge
                  v-if="getChannelGiveawayType(channel)"
                  :color="getChannelGiveawayType(channel) === 'command' ? 'primary' : getChannelGiveawayType(channel) === 'ticket' ? 'info' : 'warning'"
                  size="xs"
                >
                  {{ getChannelGiveawayType(channel) === 'command' ? 'Commande' : getChannelGiveawayType(channel) === 'ticket' ? 'Ticket' : 'StreamElements' }}
                </UBadge>

                <!-- Commande détectée dans le chat -->
                <UBadge
                  v-if="getDetectedCommand(channel)"
                  color="error"
                  size="xs"
                  variant="soft"
                  class="animate-pulse"
                >
                  <UIcon
                    name="i-lucide-message-circle"
                    class="w-3 h-3 mr-1"
                  />
                  {{ getDetectedCommand(channel)?.command }} ({{ getDetectedCommand(channel)?.percentage }}%)
                </UBadge>

                <!-- Commande -->
                <div
                  v-if="getChannelCommand(channel)"
                  class="flex items-center gap-1"
                >
                  <code class="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">{{ getChannelCommand(channel) }}</code>
                  <UButton
                    icon="i-lucide-copy"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    title="Copier la commande"
                    @click="copyCommand(getChannelCommand(channel)!)"
                  />
                </div>

                <!-- StreamElements -->
                <a
                  v-if="getChannelStreamElementsUrl(channel)"
                  :href="getChannelStreamElementsUrl(channel)"
                  target="_blank"
                  class="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <UIcon
                    name="i-lucide-ticket"
                    class="w-3 h-3"
                  />
                  StreamElements
                  <UIcon
                    name="i-lucide-external-link"
                    class="w-3 h-3"
                  />
                </a>

                <!-- Selecteur de qualité -->
                <div
                  v-if="getQualityOptions(channel).length > 0"
                  class="flex items-center gap-1"
                >
                  <UIcon
                    name="i-lucide-settings-2"
                    class="w-3 h-3 text-muted"
                  />
                  <select
                    :value="currentQuality.get(channel) || 'auto'"
                    class="text-xs bg-gray-100 dark:bg-gray-800 border-0 rounded px-2 py-1 cursor-pointer"
                    @change="handleQualityChange(channel, ($event.target as HTMLSelectElement).value)"
                  >
                    <option
                      v-for="option in getQualityOptions(channel)"
                      :key="option.value"
                      :value="option.value"
                    >
                      {{ option.label }}
                    </option>
                  </select>
                </div>
              </div>
              <div class="flex gap-1">
                <UButton
                  icon="i-lucide-bell-ring"
                  size="xs"
                  color="warning"
                  variant="ghost"
                  title="Alerter: C'est le moment du tirage !"
                  @click="openAlertModal(channel)"
                />
                <UButton
                  :icon="showChat[channel] ? 'i-lucide-message-square-off' : 'i-lucide-message-square'"
                  size="xs"
                  :color="showChat[channel] ? 'primary' : 'neutral'"
                  variant="ghost"
                  :title="showChat[channel] ? 'Masquer le chat' : 'Afficher le chat'"
                  @click="toggleChat(channel)"
                />
                <UButton
                  :icon="focusedChannel === channel ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  :title="focusedChannel === channel ? 'Reduire' : 'Agrandir'"
                  @click="toggleFocus(channel)"
                />
                <UButton
                  v-if="focusedChannel !== channel"
                  icon="i-lucide-x"
                  size="xs"
                  color="error"
                  variant="ghost"
                  title="Fermer"
                  @click="askRemoveStream(channel)"
                />
              </div>
            </div>

            <!-- Content -->
            <div
              :class="[
                'flex gap-2',
                focusedChannel === channel
                  ? 'flex-1 min-h-0 ' + (showChat[channel] ? 'flex-col lg:flex-row' : '')
                  : 'aspect-video'
              ]"
            >
              <!-- Player (SDK Twitch) -->
              <div
                :class="[
                  focusedChannel === channel
                    ? 'flex-1 min-h-0'
                    : 'h-full ' + (showChat[channel] ? 'flex-7' : 'w-full')
                ]"
              >
                <div
                  :id="`player-${channel}`"
                  class="w-full h-full min-h-[200px] [&>iframe]:w-full [&>iframe]:h-full"
                />
              </div>

              <!-- Chat -->
              <div
                v-if="showChat[channel]"
                :class="[
                  focusedChannel === channel
                    ? 'h-64 lg:h-auto lg:w-96 shrink-0'
                    : 'flex-3 h-full min-w-[250px] max-w-[350px]'
                ]"
              >
                <iframe
                  :src="`https://www.twitch.tv/embed/${channel}/chat?parent=${parentDomain}&darkpopout`"
                  class="w-full h-full"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal de confirmation suppression -->
    <UModal v-model:open="confirmDeleteOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">
              Supprimer le stream
            </h2>
          </template>

          <p>
            Etes-vous sur de vouloir supprimer le stream
            <strong>{{ channelToDelete }}</strong> ?
          </p>

          <div class="flex justify-end gap-2 mt-4">
            <UButton
              label="Annuler"
              color="neutral"
              variant="outline"
              @click="confirmDeleteOpen = false"
            />
            <UButton
              label="Supprimer"
              color="error"
              @click="confirmRemoveStream"
            />
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Modal d'alerte de tirage -->
    <UModal v-model:open="alertModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">
              Alerte de tirage
            </h2>
          </template>

          <div class="space-y-4">
            <p>
              Envoyer une alerte pour le stream
              <strong>{{ alertModalChannel }}</strong> ?
            </p>

            <UFormField
              v-if="alertModalGiveawayId"
              label="Commande du giveaway"
            >
              <UInput
                v-model="alertModalCommand"
                placeholder="!giveaway"
              />
            </UFormField>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <UButton
              label="Annuler"
              color="neutral"
              variant="outline"
              @click="alertModalOpen = false"
            />
            <UButton
              label="Envoyer l'alerte"
              color="warning"
              icon="i-lucide-bell-ring"
              @click="confirmAndSendAlert"
            />
          </div>
        </UCard>
      </template>
    </UModal>

    <!-- Modal edition giveaway -->
    <GiveawayModal
      v-model:open="editModalOpen"
      :giveaway="editingGiveaway"
      :gifts="gifts"
    />

    <!-- Modal alerte automatique (giveaway détecté dans le chat) -->
    <UModal v-model:open="autoAlertModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-sparkles"
                class="w-6 h-6 text-warning animate-pulse"
              />
              <h2 class="text-xl font-semibold">
                Giveaway detecte !
              </h2>
            </div>
          </template>

          <div class="space-y-4">
            <p>
              Une activite de giveaway a ete detectee sur
              <strong class="text-primary">{{ autoAlertChannel }}</strong>
            </p>

            <div class="flex items-center gap-3 p-4 rounded-lg bg-warning-50 dark:bg-warning-950/20 border border-warning-200 dark:border-warning-800">
              <UIcon
                name="i-lucide-terminal"
                class="w-8 h-8 text-warning"
              />
              <div>
                <div class="text-sm text-muted">
                  Commande detectee
                </div>
                <code class="text-xl font-bold">{{ autoAlertCommand }}</code>
              </div>
              <UBadge
                color="warning"
                size="lg"
                class="ml-auto"
              >
                {{ autoAlertPercentage }}% du chat
              </UBadge>
            </div>

            <p class="text-sm text-muted">
              Cette commande apparait dans {{ autoAlertPercentage }}% des 20 derniers messages du chat.
            </p>
          </div>

          <div class="flex justify-end gap-2 mt-4">
            <UButton
              label="Ignorer"
              color="neutral"
              variant="outline"
              @click="autoAlertModalOpen = false; resetAlert(autoAlertChannel!)"
            />
            <UButton
              label="Confirmer et copier"
              color="warning"
              icon="i-lucide-check"
              @click="confirmAutoAlert"
            />
          </div>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>

<style scoped>
/* Card de stream */
.stream-card {
  transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
              opacity 0.3s ease,
              box-shadow 0.3s ease;
}

.card-inner {
  position: relative;
}

/* Drag handle styling */
.drag-handle {
  cursor: grab;
  touch-action: none;
  transition: transform 0.2s ease;
}

.drag-handle:hover {
  transform: scale(1.2);
}

.drag-handle:active {
  cursor: grabbing;
  transform: scale(0.9);
}

/* Élément en cours de drag */
.dragging {
  opacity: 0.6;
  transform: scale(0.95) rotate(2deg);
  box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.4);
  z-index: 10;
}

/* Indicateur de drop */
.drop-indicator {
  position: absolute;
  top: 0;
  height: 100%;
  width: 5px;
  background: #3b82f6;
  border-radius: 3px;
  z-index: 9999;
  pointer-events: none;
  animation: pulse-glow 0.6s ease-in-out infinite;
  box-shadow: 0 0 10px 3px #3b82f6,
              0 0 20px 6px rgba(59, 130, 246, 0.4);
}

.drop-indicator-left {
  left: 0;
}

.drop-indicator-right {
  right: 0;
}

@keyframes pulse-glow {
  0%, 100% {
    opacity: 1;
    box-shadow: 0 0 10px 3px #3b82f6,
                0 0 20px 6px rgba(59, 130, 246, 0.4);
  }
  50% {
    opacity: 0.85;
    box-shadow: 0 0 15px 5px #3b82f6,
                0 0 30px 10px rgba(59, 130, 246, 0.5);
  }
}

/* Animation de "settle" après le drop */
@keyframes settle {
  0% {
    transform: scale(1.08);
    box-shadow: 0 0 0 4px rgb(var(--color-primary-500) / 0.5);
  }
  50% {
    transform: scale(0.97);
  }
  100% {
    transform: scale(1);
    box-shadow: none;
  }
}

.just-swapped {
  animation: settle 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
}
</style>
