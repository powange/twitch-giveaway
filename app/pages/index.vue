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
  giftId: string
  type: 'command' | 'ticket' | 'streamelements'
  streamElementsUrl?: string
  drawTime?: string
  requireFollow: boolean
  createdAt: string
}

const toast = useToast()

const { data: giveaways, refresh } = await useFetch<Giveaway[]>('/api/giveaways')
const { data: gifts, refresh: refreshGifts } = await useFetch<Gift[]>('/api/gifts')

// Rafraîchir les données à chaque visite de la page
onMounted(() => {
  refresh()
  refreshGifts()
})

// Filtres par chaîne Twitch
const selectedChannels = ref<string[]>([])

const availableChannels = computed(() => {
  if (!giveaways.value) return []
  const channels = giveaways.value.map(g => getStreamerName(g.twitchChannel))
  return [...new Set(channels)]
})

const filteredGiveaways = computed(() => {
  if (!giveaways.value) return []
  if (selectedChannels.value.length === 0) return giveaways.value
  return giveaways.value.filter(g =>
    selectedChannels.value.includes(getStreamerName(g.twitchChannel))
  )
})

function toggleChannelFilter(channel: string) {
  const index = selectedChannels.value.indexOf(channel)
  if (index === -1) {
    selectedChannels.value.push(channel)
  }
  else {
    selectedChannels.value.splice(index, 1)
  }
}

const isModalOpen = ref(false)
const isLoading = ref(false)
const editingId = ref<string | null>(null)

const form = reactive({
  twitchChannel: '',
  date: '',
  giftId: '',
  type: 'command' as 'command' | 'ticket' | 'streamelements',
  streamElementsUrl: '',
  drawTime: '',
  requireFollow: false,
})

const giveawayTypes = [
  { label: 'Commande', value: 'command' },
  { label: 'Ticket', value: 'ticket' },
  { label: 'StreamElements', value: 'streamelements' },
]

function resetForm() {
  form.twitchChannel = ''
  form.date = ''
  form.giftId = ''
  form.type = 'command'
  form.streamElementsUrl = ''
  form.drawTime = ''
  form.requireFollow = false
  editingId.value = null
}

function editGiveaway(giveaway: Giveaway) {
  editingId.value = giveaway.id
  form.twitchChannel = giveaway.twitchChannel
  form.date = giveaway.date
  form.giftId = giveaway.giftId
  form.type = giveaway.type
  form.streamElementsUrl = giveaway.streamElementsUrl || ''
  form.drawTime = giveaway.drawTime || ''
  form.requireFollow = giveaway.requireFollow
  isModalOpen.value = true
}

function getGift(giftId: string): Gift | undefined {
  return gifts.value?.find(g => g.id === giftId)
}

async function saveGiveaway() {
  if (!form.twitchChannel || !form.giftId || !form.date) {
    toast.add({
      title: 'Erreur',
      description: 'La chaine Twitch, le cadeau et la date sont requis',
      color: 'error',
    })
    return
  }

  isLoading.value = true
  try {
    if (editingId.value) {
      // Mode édition
      await $fetch(`/api/giveaways/${editingId.value}`, {
        method: 'PUT',
        body: {
          ...form,
          drawTime: form.drawTime || undefined,
        },
      })
      toast.add({
        title: 'Succes',
        description: 'Giveaway modifie avec succes',
        color: 'success',
      })
    }
    else {
      // Mode création
      await $fetch('/api/giveaways', {
        method: 'POST',
        body: {
          ...form,
          drawTime: form.drawTime || undefined,
        },
      })
      toast.add({
        title: 'Succes',
        description: 'Giveaway ajoute avec succes',
        color: 'success',
      })
    }
    resetForm()
    isModalOpen.value = false
    await refresh()
  }
  catch {
    toast.add({
      title: 'Erreur',
      description: editingId.value ? 'Impossible de modifier le giveaway' : 'Impossible d\'ajouter le giveaway',
      color: 'error',
    })
  }
  finally {
    isLoading.value = false
  }
}

async function deleteGiveaway(id: string) {
  try {
    await $fetch(`/api/giveaways/${id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Succes',
      description: 'Giveaway supprime',
      color: 'success',
    })
    await refresh()
  }
  catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible de supprimer le giveaway',
      color: 'error',
    })
  }
}

function formatDate(dateString: string) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

function getStreamerName(channel: string) {
  // Extraire le nom du streamer si c'est une URL
  const match = channel.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/([^/?]+)/i)
  return match ? match[1] : channel
}

function getTwitchUrl(channel: string) {
  const name = getStreamerName(channel)
  return `https://twitch.tv/${name}`
}
</script>

<template>
  <UContainer class="py-8">
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold">Giveaways Twitch</h1>
        <p class="text-muted mt-1">Gerez vos giveaways en un seul endroit</p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Ajouter un giveaway"
        :disabled="!gifts?.length"
        @click="isModalOpen = true"
      />
    </div>

    <UAlert
      v-if="!gifts?.length"
      icon="i-lucide-info"
      color="warning"
      title="Aucun cadeau disponible"
      description="Vous devez d'abord ajouter des cadeaux avant de creer un giveaway."
      class="mb-6"
    >
      <template #actions>
        <UButton
          label="Ajouter un cadeau"
          color="warning"
          variant="outline"
          to="/cadeaux"
        />
      </template>
    </UAlert>

    <div v-if="!giveaways?.length" class="text-center py-16">
      <UIcon name="i-lucide-gift" class="w-16 h-16 text-muted mx-auto mb-4" />
      <h2 class="text-xl font-semibold mb-2">Aucun giveaway</h2>
      <p class="text-muted mb-4">Commencez par ajouter votre premier giveaway</p>
      <UButton
        icon="i-lucide-plus"
        label="Ajouter un giveaway"
        :disabled="!gifts?.length"
        @click="isModalOpen = true"
      />
    </div>

    <template v-else>
      <!-- Filtres par chaîne -->
      <UCard v-if="availableChannels.length > 1" class="mb-6">
        <div class="flex items-center gap-3 flex-wrap">
          <span class="text-sm font-medium text-muted">Filtrer par streamer :</span>
          <UButton
            v-for="channel in availableChannels"
            :key="channel"
            :color="selectedChannels.includes(channel) ? 'primary' : 'neutral'"
            :variant="selectedChannels.includes(channel) ? 'solid' : 'outline'"
            size="xs"
            @click="toggleChannelFilter(channel)"
          >
            <UIcon name="i-simple-icons-twitch" class="w-3 h-3 mr-1" />
            {{ channel }}
          </UButton>
          <UButton
            v-if="selectedChannels.length > 0"
            color="neutral"
            variant="ghost"
            size="xs"
            label="Effacer"
            @click="selectedChannels = []"
          />
        </div>
      </UCard>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UCard v-for="giveaway in filteredGiveaways" :key="giveaway.id">
        <template #header>
          <div class="flex justify-between items-start">
            <div class="flex items-center gap-3">
              <img
                v-if="getGift(giveaway.giftId)"
                :src="getGift(giveaway.giftId)!.image"
                :alt="getGift(giveaway.giftId)!.title"
                class="w-24 h-24 object-contain"
              >
              <div>
                <h3 class="font-semibold">{{ getGift(giveaway.giftId)?.title || 'Cadeau inconnu' }}</h3>
                <UBadge :color="giveaway.type === 'command' ? 'primary' : giveaway.type === 'ticket' ? 'info' : 'warning'" size="xs">
                  {{ giveaway.type === 'command' ? 'Commande' : giveaway.type === 'ticket' ? 'Ticket' : 'StreamElements' }}
                </UBadge>
              </div>
            </div>
            <div class="flex gap-1">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="editGiveaway(giveaway)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                @click="deleteGiveaway(giveaway.id)"
              />
            </div>
          </div>
        </template>

        <div class="space-y-2 text-sm">
          <div class="flex items-center gap-2">
            <UIcon name="i-simple-icons-twitch" class="w-4 h-4 text-purple-500" />
            <a
              :href="getTwitchUrl(giveaway.twitchChannel)"
              target="_blank"
              class="text-primary hover:underline"
            >
              {{ getStreamerName(giveaway.twitchChannel) }}
            </a>
          </div>

          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-calendar" class="w-4 h-4" />
            <span>{{ formatDate(giveaway.date) }}</span>
          </div>

          <div v-if="giveaway.drawTime" class="flex items-center gap-2">
            <UIcon name="i-lucide-clock" class="w-4 h-4" />
            <span>Tirage a {{ giveaway.drawTime }}</span>
          </div>

          <div v-if="giveaway.streamElementsUrl" class="flex items-center gap-2">
            <UIcon name="i-lucide-external-link" class="w-4 h-4" />
            <a
              :href="giveaway.streamElementsUrl"
              target="_blank"
              class="text-primary hover:underline truncate"
            >
              StreamElements
            </a>
          </div>

          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-user-check" class="w-4 h-4" />
            <span>{{ giveaway.requireFollow ? 'Follow requis' : 'Follow non requis' }}</span>
          </div>
        </div>

        <template #footer>
          <p class="text-xs text-muted">
            Ajoute le {{ formatDate(giveaway.createdAt) }}
          </p>
        </template>
      </UCard>
      </div>
    </template>

    <UModal v-model:open="isModalOpen" @close="resetForm">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">{{ editingId ? 'Modifier le Giveaway' : 'Nouveau Giveaway' }}</h2>
          </template>

          <form class="space-y-4" @submit.prevent="saveGiveaway">
            <UFormField label="Chaine Twitch" required>
              <UInput
                v-model="form.twitchChannel"
                placeholder="nom_de_la_chaine"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Date du giveaway" required>
              <UInput
                v-model="form.date"
                type="date"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Cadeau" required>
              <USelect
                v-model="form.giftId"
                :items="gifts?.map(g => ({ label: g.title, value: g.id })) || []"
                placeholder="Selectionnez un cadeau"
                class="w-full"
              />
            </UFormField>

            <UFormField label="Type de giveaway" required>
              <URadioGroup
                v-model="form.type"
                :items="giveawayTypes"
              />
            </UFormField>

            <UFormField v-if="form.type === 'streamelements'" label="URL StreamElements" required>
              <UInput
                v-model="form.streamElementsUrl"
                placeholder="https://streamelements.com/..."
                class="w-full"
              />
            </UFormField>

            <UFormField label="Heure du tirage">
              <UInput
                v-model="form.drawTime"
                type="time"
                placeholder="Optionnel"
                class="w-full"
              />
            </UFormField>

            <UFormField>
              <UCheckbox
                v-model="form.requireFollow"
                label="Follow requis pour participer"
              />
            </UFormField>

            <div class="flex justify-end gap-2 pt-4">
              <UButton
                label="Annuler"
                color="neutral"
                variant="outline"
                @click="isModalOpen = false"
              />
              <UButton
                type="submit"
                :label="editingId ? 'Modifier' : 'Ajouter'"
                :loading="isLoading"
              />
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
