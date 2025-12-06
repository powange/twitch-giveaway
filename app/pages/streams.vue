<script setup lang="ts">
interface Giveaway {
  id: string
  twitchChannel: string
  date: string
  giftId: string
  type: 'command' | 'ticket'
  drawTime?: string
  requireFollow: boolean
  createdAt: string
}

const { data: giveaways } = await useFetch<Giveaway[]>('/api/giveaways')

const selectedChannels = ref<string[]>([])
const showChat = ref<Record<string, boolean>>({})

// Filtrer les giveaways du jour ou de la veille
const recentGiveaways = computed(() => {
  if (!giveaways.value) return []

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const yesterday = new Date(today)
  yesterday.setDate(yesterday.getDate() - 1)

  return giveaways.value.filter((g) => {
    const giveawayDate = new Date(g.date)
    giveawayDate.setHours(0, 0, 0, 0)
    return giveawayDate.getTime() >= yesterday.getTime() && giveawayDate.getTime() <= today.getTime()
  })
})

// Extraire les chaînes uniques des giveaways récents
const availableChannels = computed(() => {
  const channels = recentGiveaways.value.map(g => getStreamerName(g.twitchChannel))
  return [...new Set(channels)]
})

function getStreamerName(channel: string) {
  const match = channel.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?]+)/i)
  return match ? match[1] : channel
}

function toggleChannel(channel: string) {
  const index = selectedChannels.value.indexOf(channel)
  if (index === -1) {
    selectedChannels.value.push(channel)
    showChat.value[channel] = false
  }
  else {
    selectedChannels.value.splice(index, 1)
    delete showChat.value[channel]
  }
}

function toggleChat(channel: string) {
  showChat.value[channel] = !showChat.value[channel]
}

function removeStream(channel: string) {
  const index = selectedChannels.value.indexOf(channel)
  if (index !== -1) {
    selectedChannels.value.splice(index, 1)
    delete showChat.value[channel]
  }
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
        <h1 class="text-3xl font-bold">Multi-Stream</h1>
        <p class="text-muted mt-1">Regardez plusieurs streams en simultane</p>
      </div>
    </div>

    <!-- Selection des chaines -->
    <UCard class="mb-6">
      <template #header>
        <h2 class="font-semibold">Selectionner les chaines</h2>
      </template>

      <div v-if="!availableChannels.length" class="text-center py-4 text-muted">
        Aucune chaine disponible. Ajoutez d'abord des giveaways.
      </div>

      <div v-else class="flex flex-wrap gap-2">
        <UButton
          v-for="channel in availableChannels"
          :key="channel"
          :color="selectedChannels.includes(channel) ? 'primary' : 'neutral'"
          :variant="selectedChannels.includes(channel) ? 'solid' : 'outline'"
          size="sm"
          @click="toggleChannel(channel)"
        >
          <UIcon name="i-simple-icons-twitch" class="w-4 h-4 mr-1" />
          {{ channel }}
        </UButton>
      </div>
    </UCard>

    <!-- Streams -->
    <div v-if="!selectedChannels.length" class="text-center py-16">
      <UIcon name="i-lucide-tv" class="w-16 h-16 text-muted mx-auto mb-4" />
      <h2 class="text-xl font-semibold mb-2">Aucun stream selectionne</h2>
      <p class="text-muted">Selectionnez des chaines ci-dessus pour les regarder</p>
    </div>

    <div v-else :class="['grid gap-4', gridClass]">
      <UCard v-for="channel in selectedChannels" :key="channel" class="overflow-hidden">
        <template #header>
          <div class="flex justify-between items-center">
            <div class="flex items-center gap-2">
              <UIcon name="i-simple-icons-twitch" class="w-4 h-4 text-purple-500" />
              <span class="font-semibold">{{ channel }}</span>
            </div>
            <div class="flex gap-1">
              <UButton
                :icon="showChat[channel] ? 'i-lucide-message-square-off' : 'i-lucide-message-square'"
                size="xs"
                :color="showChat[channel] ? 'primary' : 'neutral'"
                variant="ghost"
                :title="showChat[channel] ? 'Masquer le chat' : 'Afficher le chat'"
                @click="toggleChat(channel)"
              />
              <UButton
                icon="i-lucide-x"
                size="xs"
                color="error"
                variant="ghost"
                title="Fermer"
                @click="removeStream(channel)"
              />
            </div>
          </div>
        </template>

        <div class="flex gap-2" :class="showChat[channel] ? 'flex-col xl:flex-row' : ''">
          <!-- Player -->
          <div class="flex-1">
            <div class="relative w-full" style="padding-top: 56.25%;">
              <iframe
                :src="`https://player.twitch.tv/?channel=${channel}&parent=${parentDomain}`"
                class="absolute inset-0 w-full h-full"
                allowfullscreen
              />
            </div>
          </div>

          <!-- Chat -->
          <div v-if="showChat[channel]" class="xl:w-80 h-80 xl:h-auto">
            <iframe
              :src="`https://www.twitch.tv/embed/${channel}/chat?parent=${parentDomain}&darkpopout`"
              class="w-full h-full min-h-80"
            />
          </div>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
