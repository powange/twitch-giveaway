<script setup lang="ts">
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

interface TwitchGiveawayStream {
  url: string
  title: string
  viewerCount: number
  streamerName: string
  startedAt: string
  thumbnail: string
}

const props = defineProps<{
  giveaways: Giveaway[]
  gifts: Gift[]
}>()

const emit = defineEmits<{
  create: [stream: TwitchGiveawayStream]
}>()

const toast = useToast()

const modalOpen = ref(false)
const loading = ref(false)
const scannedStreams = ref<TwitchGiveawayStream[]>([])

// Utilitaire pour extraire le nom du streamer
function getStreamerName(channel: string) {
  const match = channel.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?]+)/i)
  return match ? match[1] : channel
}

// Vérifier si un giveaway est clos (manuellement ou par date)
function isGiveawayClosed(giveaway: Giveaway): boolean {
  if (giveaway.closed) return true
  const giveawayDate = new Date(giveaway.date)
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  twoDaysAgo.setHours(0, 0, 0, 0)
  return giveawayDate < twoDaysAgo
}

// Séparer les streams scannés : avec/sans giveaway actif
const streamsWithActiveGiveaway = computed(() => {
  return scannedStreams.value.filter((stream) => {
    const streamName = stream.streamerName.toLowerCase()
    return props.giveaways.some((g) => {
      if (isGiveawayClosed(g)) return false
      const giveawayStreamer = getStreamerName(g.twitchChannel).toLowerCase()
      return giveawayStreamer === streamName
    })
  })
})

const streamsWithoutActiveGiveaway = computed(() => {
  return scannedStreams.value.filter((stream) => {
    const streamName = stream.streamerName.toLowerCase()
    return !props.giveaways.some((g) => {
      if (isGiveawayClosed(g)) return false
      const giveawayStreamer = getStreamerName(g.twitchChannel).toLowerCase()
      return giveawayStreamer === streamName
    })
  })
})

async function scan() {
  loading.value = true
  scannedStreams.value = []
  modalOpen.value = true

  try {
    const streams = await $fetch<TwitchGiveawayStream[]>('/api/twitch/streams')
    scannedStreams.value = streams
    if (streams.length === 0) {
      toast.add({
        title: 'Scan termine',
        description: 'Aucun stream avec "giveaway" dans le titre',
        color: 'info'
      })
    }
  } catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible de scanner les streams Twitch',
      color: 'error'
    })
    modalOpen.value = false
  } finally {
    loading.value = false
  }
}

function createGiveaway(stream: TwitchGiveawayStream) {
  modalOpen.value = false
  emit('create', stream)
}
</script>

<template>
  <div>
    <UButton
      icon="i-lucide-radar"
      label="Scanner"
      color="purple"
      variant="outline"
      :loading="loading"
      @click="scan"
    />

    <UModal
      v-model:open="modalOpen"
      :ui="{ width: 'sm:max-w-2xl' }"
    >
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon
                name="i-lucide-radar"
                class="w-5 h-5 text-purple-500"
              />
              <h2 class="text-xl font-semibold">
                Streams Sea of Thieves avec giveaway
              </h2>
            </div>
          </template>

          <div
            v-if="loading"
            class="flex flex-col items-center py-8"
          >
            <UIcon
              name="i-lucide-loader-2"
              class="w-8 h-8 animate-spin text-purple-500 mb-4"
            />
            <p class="text-muted">
              Scan des streams en cours...
            </p>
          </div>

          <div
            v-else-if="scannedStreams.length === 0"
            class="text-center py-8"
          >
            <UIcon
              name="i-lucide-search-x"
              class="w-12 h-12 text-muted mx-auto mb-4"
            />
            <p class="text-muted">
              Aucun stream avec "giveaway" dans le titre
            </p>
          </div>

          <div
            v-else
            class="space-y-4 max-h-[32rem] overflow-y-auto"
          >
            <!-- Nouveaux streams (sans giveaway actif) -->
            <div v-if="streamsWithoutActiveGiveaway.length > 0">
              <h3 class="text-sm font-semibold text-success mb-2 flex items-center gap-2">
                <UIcon
                  name="i-lucide-sparkles"
                  class="w-4 h-4"
                />
                Nouveaux ({{ streamsWithoutActiveGiveaway.length }})
              </h3>
              <div class="space-y-2">
                <div
                  v-for="stream in streamsWithoutActiveGiveaway"
                  :key="stream.url"
                  class="flex gap-3 p-3 rounded-lg bg-success-50 dark:bg-success-950/20 border border-success-200 dark:border-success-800"
                >
                  <img
                    :src="stream.thumbnail"
                    :alt="stream.streamerName"
                    class="w-32 h-18 object-cover rounded"
                  >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <UIcon
                        name="i-simple-icons-twitch"
                        class="w-4 h-4 text-purple-500 flex-shrink-0"
                      />
                      <a
                        :href="stream.url"
                        target="_blank"
                        class="font-semibold text-primary hover:underline truncate"
                      >
                        {{ stream.streamerName }}
                      </a>
                      <UBadge
                        color="error"
                        size="xs"
                      >
                        {{ stream.viewerCount }} viewers
                      </UBadge>
                    </div>
                    <p class="text-sm text-muted line-clamp-2">
                      {{ stream.title }}
                    </p>
                  </div>
                  <UButton
                    icon="i-lucide-plus"
                    size="sm"
                    color="success"
                    variant="soft"
                    title="Creer un giveaway"
                    :disabled="!gifts?.length"
                    @click="createGiveaway(stream)"
                  />
                </div>
              </div>
            </div>

            <!-- Streams avec giveaway deja actif -->
            <div v-if="streamsWithActiveGiveaway.length > 0">
              <h3 class="text-sm font-semibold text-muted mb-2 flex items-center gap-2">
                <UIcon
                  name="i-lucide-check-circle"
                  class="w-4 h-4"
                />
                Deja enregistres ({{ streamsWithActiveGiveaway.length }})
              </h3>
              <div class="space-y-2">
                <div
                  v-for="stream in streamsWithActiveGiveaway"
                  :key="stream.url"
                  class="flex gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50 opacity-60"
                >
                  <img
                    :src="stream.thumbnail"
                    :alt="stream.streamerName"
                    class="w-32 h-18 object-cover rounded"
                  >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <UIcon
                        name="i-simple-icons-twitch"
                        class="w-4 h-4 text-purple-500 flex-shrink-0"
                      />
                      <a
                        :href="stream.url"
                        target="_blank"
                        class="font-semibold text-primary hover:underline truncate"
                      >
                        {{ stream.streamerName }}
                      </a>
                      <UBadge
                        color="neutral"
                        size="xs"
                      >
                        {{ stream.viewerCount }} viewers
                      </UBadge>
                      <UBadge
                        color="success"
                        size="xs"
                        variant="soft"
                      >
                        Giveaway actif
                      </UBadge>
                    </div>
                    <p class="text-sm text-muted line-clamp-2">
                      {{ stream.title }}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-between items-center">
              <p class="text-sm text-muted">
                {{ scannedStreams.length }} stream(s) trouve(s)
                <span
                  v-if="streamsWithoutActiveGiveaway.length > 0"
                  class="text-success"
                >
                  ({{ streamsWithoutActiveGiveaway.length }} nouveau(x))
                </span>
              </p>
              <UButton
                label="Fermer"
                color="neutral"
                variant="outline"
                @click="modalOpen = false"
              />
            </div>
          </template>
        </UCard>
      </template>
    </UModal>
  </div>
</template>
