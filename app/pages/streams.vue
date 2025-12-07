<script setup lang="ts">
const toast = useToast()

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
    playBeep(now)
    playBeep(now + 0.2)
    playBeep(now + 0.4)
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
watch([selectedChannels, showChat], () => {
  localStorage.setItem('selectedStreams', JSON.stringify({
    channels: selectedChannels.value,
    showChat: showChat.value
  }))
}, { deep: true })

// Créer les players quand les channels changent
watch(selectedChannels, async (newChannels, oldChannels) => {
  // Détruire les players supprimés
  const removedChannels = (oldChannels || []).filter(c => !newChannels.includes(c))
  for (const channel of removedChannels) {
    destroyPlayer(channel)
  }

  // Créer les nouveaux players
  const addedChannels = newChannels.filter(c => !(oldChannels || []).includes(c))
  if (addedChannels.length > 0) {
    await nextTick()

    for (const channel of addedChannels) {
      await createPlayer(`player-${channel}`, channel)
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

// Calculer la grille en fonction du nombre de streams
const gridClass = computed(() => {
  const count = selectedChannels.value.length
  if (count === 1) return 'grid-cols-1'
  if (count === 2) return 'grid-cols-1 lg:grid-cols-2'
  return 'grid-cols-1 lg:grid-cols-2 xl:grid-cols-3'
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
  return giftIds.map(id => gifts.value?.find(g => g.id === id)).filter(Boolean)
}

// Obtenir la commande pour une chaîne (prend la première trouvée)
function getChannelCommand(channel: string) {
  const channelGiveaways = getChannelGiveaways(channel)
  const giveawayWithCommand = channelGiveaways.find(g => g.type === 'command' && g.command)
  return giveawayWithCommand?.command
}

// Obtenir l'URL StreamElements pour une chaîne
function getChannelStreamElementsUrl(channel: string) {
  const channelGiveaways = getChannelGiveaways(channel)
  const giveawayWithSE = channelGiveaways.find(g => g.type === 'streamelements' && g.streamElementsUrl)
  return giveawayWithSE?.streamElementsUrl
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
      class="flex justify-end gap-2 mb-4"
    >
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

    <div
      v-else
      :class="['grid gap-4', gridClass]"
    >
      <!-- Backdrop quand un stream est focus -->
      <div
        v-if="focusedChannel"
        class="fixed inset-0 z-40 bg-black/80"
        @click="focusedChannel = null"
      />

      <div
        v-for="channel in selectedChannels"
        :key="channel"
        :class="[
          'transition-all duration-300',
          focusedChannel === channel
            ? 'fixed inset-4 z-50 flex flex-col'
            : focusedChannel
              ? 'opacity-0 pointer-events-none'
              : ''
        ]"
      >
        <div
          :class="[
            'rounded-lg border-2 bg-white dark:bg-gray-900 overflow-hidden transition-all',
            alertedChannel === channel
              ? 'border-orange-500 ring-4 ring-orange-500/50 animate-pulse'
              : 'border-gray-200 dark:border-gray-800',
            focusedChannel === channel ? 'h-full flex flex-col' : ''
          ]"
        >
          <!-- Header -->
          <div class="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div class="flex items-center gap-3 flex-wrap">
              <div class="flex items-center gap-2">
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
                <div class="flex flex-col">
                  <span class="font-semibold">{{ channel }}</span>
                  <UBadge
                    v-if="getChannelGiveaways(channel)[0]"
                    :color="getChannelGiveaways(channel)[0].type === 'command' ? 'primary' : getChannelGiveaways(channel)[0].type === 'ticket' ? 'info' : 'warning'"
                    size="xs"
                    class="w-fit"
                  >
                    {{ getChannelGiveaways(channel)[0].type === 'command' ? 'Commande' : getChannelGiveaways(channel)[0].type === 'ticket' ? 'Ticket' : 'StreamElements' }}
                  </UBadge>
                </div>
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
  </UContainer>
</template>
