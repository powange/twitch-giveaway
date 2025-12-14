<script setup lang="ts">
import type { DetectedStream } from '~/composables/useOrbeTwitchLinks'

const { createPlayer, destroyPlayer, toggleMuteAll, globalMuted } = useTwitchPlayer()

const showChat = ref(true)
const parentDomain = ref('')

// Streams temporaires détectés
const { isConnected, temporaryStreams, mainChannel, removeStream } = useOrbeTwitchLinks({
  onStreamDetected: (stream) => {
    // Créer le player pour le nouveau stream
    nextTick(() => {
      createPlayer(`player-${stream.channel}`, stream.channel)
    })
  },
  onStreamExpired: (channel) => {
    destroyPlayer(channel)
  }
})

// Calculer le temps restant pour chaque stream
const now = ref(Date.now())
let timerInterval: ReturnType<typeof setInterval> | null = null

const streamsWithTimeLeft = computed(() => {
  return temporaryStreams.value.map(stream => ({
    ...stream,
    timeLeft: Math.max(0, stream.expiresAt - now.value)
  }))
})

// Formater le temps restant
function formatTimeLeft(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, '0')}`
}

// Fermer manuellement un stream
function closeStream(channel: string) {
  destroyPlayer(channel)
  removeStream(channel)
}

onMounted(() => {
  parentDomain.value = window.location.hostname

  // Créer le player principal
  nextTick(() => {
    createPlayer('player-main', mainChannel)
  })

  // Créer les players pour les streams existants (depuis localStorage)
  nextTick(() => {
    for (const stream of temporaryStreams.value) {
      createPlayer(`player-${stream.channel}`, stream.channel)
    }
  })

  // Timer pour mettre à jour le temps restant
  timerInterval = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  destroyPlayer(mainChannel)
  for (const stream of temporaryStreams.value) {
    destroyPlayer(stream.channel)
  }
  if (timerInterval) {
    clearInterval(timerInterval)
  }
})
</script>

<template>
  <UContainer class="py-6">
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold flex items-center gap-2">
          <UIcon name="i-lucide-radio" class="w-6 h-6" />
          L'Orbe
        </h1>
        <p class="text-muted text-sm mt-1">
          Détection automatique des streams partenaires Sea of Thieves
        </p>
        <a
          href="https://seaofthieves.wiki.gg/wiki/The_Orb_Returns"
          target="_blank"
          class="text-sm text-primary hover:underline flex items-center gap-1 mt-1"
        >
          <UIcon name="i-lucide-book-open" class="w-3 h-3" />
          Wiki - The Orb Returns
          <UIcon name="i-lucide-external-link" class="w-3 h-3" />
        </a>
      </div>

      <!-- Contrôles -->
      <div class="flex items-center gap-2">
        <UBadge
          :color="isConnected ? 'success' : 'error'"
          variant="soft"
        >
          {{ isConnected ? 'Connecté au chat' : 'Déconnecté' }}
        </UBadge>

        <UButton
          :icon="globalMuted ? 'i-lucide-volume-x' : 'i-lucide-volume-2'"
          :color="globalMuted ? 'neutral' : 'primary'"
          variant="soft"
          @click="toggleMuteAll"
          title="Mute/Unmute tous les streams"
        />

        <UButton
          :icon="showChat ? 'i-lucide-message-square' : 'i-lucide-message-square-off'"
          :color="showChat ? 'primary' : 'neutral'"
          variant="soft"
          @click="showChat = !showChat"
          title="Afficher/Masquer le chat"
        />
      </div>
    </div>

    <!-- Stream principal Sea of Thieves -->
    <div class="mb-6 flex flex-col lg:flex-row gap-3">
      <!-- Player principal -->
      <div class="rounded-lg border-2 border-primary bg-white dark:bg-gray-900 overflow-hidden lg:w-1/2 xl:w-2/5">
        <!-- Header compact -->
        <div class="flex justify-between items-center px-3 py-2 border-b border-gray-200 dark:border-gray-800">
          <div class="flex items-center gap-2">
            <UIcon name="i-simple-icons-twitch" class="w-4 h-4 text-purple-500" />
            <span class="font-medium text-sm">Sea of Thieves</span>
            <UBadge color="primary" variant="soft" size="xs">Principal</UBadge>
          </div>
          <a
            href="https://www.twitch.tv/seaofthieves"
            target="_blank"
            class="text-xs text-muted hover:text-foreground"
          >
            <UIcon name="i-lucide-external-link" class="w-3 h-3" />
          </a>
        </div>

        <!-- Player -->
        <div class="aspect-video bg-black">
          <div id="player-main" class="w-full h-full min-h-[200px]" />
        </div>
      </div>

      <!-- Chat -->
      <div
        v-if="showChat && parentDomain"
        class="rounded-lg border-2 border-gray-200 dark:border-gray-800 overflow-hidden lg:w-1/2 xl:w-2/5 h-[350px] lg:h-auto"
      >
        <iframe
          :src="`https://www.twitch.tv/embed/${mainChannel}/chat?parent=${parentDomain}&darkpopout`"
          class="w-full h-full"
          frameborder="0"
        />
      </div>
    </div>

    <!-- Streams temporaires -->
    <div v-if="streamsWithTimeLeft.length > 0">
      <div class="flex items-center gap-2 mb-4">
        <h2 class="text-lg font-semibold">Streams partenaires</h2>
        <UBadge color="info" variant="soft">
          {{ streamsWithTimeLeft.length }} actif{{ streamsWithTimeLeft.length > 1 ? 's' : '' }}
        </UBadge>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-3">
        <div
          v-for="stream in streamsWithTimeLeft"
          :key="stream.channel"
          class="rounded-lg border-2 border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 overflow-hidden"
        >
          <!-- Header compact -->
          <div class="flex justify-between items-center px-3 py-2 border-b border-gray-200 dark:border-gray-800">
            <div class="flex items-center gap-2">
              <UIcon name="i-simple-icons-twitch" class="w-4 h-4 text-purple-500" />
              <span class="font-medium text-sm">{{ stream.channel }}</span>
            </div>
            <div class="flex items-center gap-1">
              <UBadge color="warning" variant="soft" size="xs">
                <UIcon name="i-lucide-clock" class="w-3 h-3 mr-1" />
                {{ formatTimeLeft(stream.timeLeft) }}
              </UBadge>
              <UButton
                icon="i-lucide-x"
                color="error"
                variant="ghost"
                size="xs"
                @click="closeStream(stream.channel)"
                title="Fermer ce stream"
              />
            </div>
          </div>

          <!-- Player -->
          <div class="aspect-video bg-black">
            <div :id="`player-${stream.channel}`" class="w-full h-full min-h-[150px]" />
          </div>
        </div>
      </div>
    </div>

    <!-- Message si aucun stream temporaire -->
    <div
      v-else
      class="text-center py-12 text-muted"
    >
      <UIcon name="i-lucide-radio" class="w-12 h-12 mx-auto mb-4 opacity-50" />
      <p>En attente de liens Twitch dans le chat de Sea of Thieves...</p>
      <p class="text-sm mt-2">Les streams partenaires apparaîtront automatiquement ici pendant 1h.</p>
    </div>
  </UContainer>
</template>
