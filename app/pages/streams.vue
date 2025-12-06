<script setup lang="ts">
// SSE pour les mises à jour en temps réel
const { giveaways: sseGiveaways, isInitialized } = useSSE()

// Données initiales via useFetch
const { data: initialGiveaways } = await useFetch('/api/giveaways')

// Utiliser les données SSE si initialisé, sinon les données initiales
const giveaways = computed(() => isInitialized.value ? sseGiveaways.value : initialGiveaways.value)

const selectedChannels = ref<string[]>([])
const showChat = ref<Record<string, boolean>>({})
const focusedChannel = ref<string | null>(null)

// Confirmation suppression
const confirmDeleteOpen = ref(false)
const channelToDelete = ref<string | null>(null)

onMounted(() => {
  // Charger depuis localStorage
  const saved = localStorage.getItem('selectedStreams')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      selectedChannels.value = parsed.channels || []
      showChat.value = parsed.showChat || {}
    } catch { /* ignore invalid JSON */ }
  }
})

// Sauvegarder dans localStorage à chaque modification
watch([selectedChannels, showChat], () => {
  localStorage.setItem('selectedStreams', JSON.stringify({
    channels: selectedChannels.value,
    showChat: showChat.value
  }))
}, { deep: true })

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
    selectedChannels.value.push(channel)
    showChat.value[channel] = false
  } else {
    selectedChannels.value.splice(index, 1)
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
  return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
})

// Parent domain pour l'embed Twitch
const parentDomain = computed(() => {
  if (import.meta.client) {
    return window.location.hostname
  }
  return 'localhost'
})
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
            'rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden',
            focusedChannel === channel ? 'h-full flex flex-col' : ''
          ]"
        >
          <!-- Header -->
          <div class="flex justify-between items-center px-4 py-3 border-b border-gray-200 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <UIcon
                name="i-simple-icons-twitch"
                class="w-4 h-4 text-purple-500"
              />
              <span class="font-semibold">{{ channel }}</span>
            </div>
            <div class="flex gap-1">
              <UButton
                :icon="focusedChannel === channel ? 'i-lucide-minimize-2' : 'i-lucide-maximize-2'"
                size="xs"
                color="neutral"
                variant="ghost"
                :title="focusedChannel === channel ? 'Reduire' : 'Agrandir'"
                @click="toggleFocus(channel)"
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
                : (showChat[channel] ? 'flex-col xl:flex-row' : '')
            ]"
          >
            <!-- Player -->
            <div
              :class="[
                focusedChannel === channel
                  ? 'flex-1 min-h-0'
                  : 'relative w-full pb-[56.25%]'
              ]"
            >
              <iframe
                :src="`https://player.twitch.tv/?channel=${channel}&parent=${parentDomain}`"
                :class="[
                  focusedChannel === channel
                    ? 'w-full h-full'
                    : 'absolute inset-0 w-full h-full'
                ]"
                allowfullscreen
              />
            </div>

            <!-- Chat -->
            <div
              v-if="showChat[channel]"
              :class="[
                focusedChannel === channel
                  ? 'h-64 lg:h-auto lg:w-96 shrink-0'
                  : 'xl:w-80 h-80 xl:h-auto'
              ]"
            >
              <iframe
                :src="`https://www.twitch.tv/embed/${channel}/chat?parent=${parentDomain}&darkpopout`"
                class="w-full h-full min-h-64"
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
  </UContainer>
</template>
