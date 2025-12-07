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

const toast = useToast()

// SSE pour les mises à jour en temps réel
const { giveaways: sseGiveaways, gifts: sseGifts, isInitialized } = useSSE()

// Données initiales via useAsyncData (un seul appel payload), puis mises à jour via SSE
const { data: initialData } = await useAsyncData('home-data', async () => {
  const [giveaways, gifts] = await Promise.all([
    $fetch<Giveaway[]>('/api/giveaways'),
    $fetch<Gift[]>('/api/gifts')
  ])
  return { giveaways, gifts }
}, { default: () => ({ giveaways: [] as Giveaway[], gifts: [] as Gift[] }) })

// Utiliser les données SSE si disponibles, sinon les données initiales
const giveaways = computed(() => {
  if (isInitialized.value) {
    return sseGiveaways.value
  }
  return initialData.value.giveaways
})
const gifts = computed(() => {
  if (isInitialized.value) {
    return sseGifts.value
  }
  return initialData.value.gifts
})

// Map des cadeaux pour lookup O(1) au lieu de O(n)
const giftMap = computed(() => new Map(gifts.value.map(g => [g.id, g])))

// Pré-calcul du statut fermé pour éviter les calculs répétés
function computeIsClosed(giveaway: Giveaway): boolean {
  if (giveaway.closed) return true
  const giveawayDate = new Date(giveaway.date)
  const twoDaysAgo = new Date()
  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2)
  twoDaysAgo.setHours(0, 0, 0, 0)
  return giveawayDate < twoDaysAgo
}

// Giveaways avec statut pré-calculé
const giveawaysWithStatus = computed(() =>
  giveaways.value.map(g => ({ ...g, isClosed: computeIsClosed(g) }))
)

// Filtres
const selectedGifts = ref<string[]>([])
const selectedStatuses = ref<('open' | 'closed')[]>(['open']) // Par défaut : en cours uniquement

// Charger les filtres depuis localStorage
onMounted(() => {
  const saved = localStorage.getItem('giveawayFilters')
  if (saved) {
    try {
      const parsed = JSON.parse(saved)
      if (Array.isArray(parsed)) {
        // Ancien format (juste les cadeaux)
        selectedGifts.value = parsed
      } else {
        // Nouveau format
        selectedGifts.value = parsed.gifts || []
        selectedStatuses.value = parsed.statuses || ['open']
      }
    } catch { /* ignore invalid JSON */ }
  }
})

// Sauvegarder les filtres à chaque modification
watch([selectedGifts, selectedStatuses], () => {
  localStorage.setItem('giveawayFilters', JSON.stringify({
    gifts: selectedGifts.value,
    statuses: selectedStatuses.value
  }))
}, { deep: true })

function toggleStatusFilter(status: 'open' | 'closed') {
  const index = selectedStatuses.value.indexOf(status)
  if (index === -1) {
    selectedStatuses.value.push(status)
  } else if (selectedStatuses.value.length > 1) {
    // Ne pas permettre de tout désélectionner
    selectedStatuses.value.splice(index, 1)
  }
}

const availableGifts = computed(() => {
  return gifts.value || []
})

const filteredGiveaways = computed(() => {
  if (!giveawaysWithStatus.value.length) return []

  let result = giveawaysWithStatus.value

  // Filtrer par statut (utilise isClosed pré-calculé)
  result = result.filter((g) => {
    if (g.isClosed && selectedStatuses.value.includes('closed')) return true
    if (!g.isClosed && selectedStatuses.value.includes('open')) return true
    return false
  })

  // Filtrer par cadeaux sélectionnés
  if (selectedGifts.value.length > 0) {
    result = result.filter(g => g.giftIds.some(id => selectedGifts.value.includes(id)))
  }

  // Trier : en cours d'abord (par date décroissante), puis clos (par date décroissante)
  return [...result].sort((a, b) => {
    // En cours avant clos (utilise isClosed pré-calculé)
    if (a.isClosed !== b.isClosed) {
      return a.isClosed ? 1 : -1
    }

    // Par date décroissante (plus récent d'abord)
    return new Date(b.date).getTime() - new Date(a.date).getTime()
  })
})

function toggleGiftFilter(giftId: string) {
  const index = selectedGifts.value.indexOf(giftId)
  if (index === -1) {
    selectedGifts.value.push(giftId)
  } else {
    selectedGifts.value.splice(index, 1)
  }
}

const isModalOpen = ref(false)
const editingGiveaway = ref<Giveaway | null>(null)

// Confirmation modals
const confirmModalOpen = ref(false)
const confirmAction = ref<'delete' | 'close' | null>(null)
const confirmGiveaway = ref<Giveaway | null>(null)

function askConfirmation(action: 'delete' | 'close', giveaway: Giveaway) {
  confirmAction.value = action
  confirmGiveaway.value = giveaway
  confirmModalOpen.value = true
}

async function executeConfirmedAction() {
  if (!confirmGiveaway.value || !confirmAction.value) return

  if (confirmAction.value === 'delete') {
    await doDeleteGiveaway(confirmGiveaway.value.id)
  } else if (confirmAction.value === 'close') {
    await doToggleGiveawayClosed(confirmGiveaway.value)
  }

  confirmModalOpen.value = false
  confirmAction.value = null
  confirmGiveaway.value = null
}

function openNewGiveaway() {
  editingGiveaway.value = null
  isModalOpen.value = true
}

function editGiveaway(giveaway: Giveaway) {
  editingGiveaway.value = giveaway
  isModalOpen.value = true
}

// Lookup O(1) via Map pré-calculée
function getGift(giftId: string): Gift | undefined {
  return giftMap.value.get(giftId)
}

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

function toggleGiveawayClosed(giveaway: Giveaway) {
  askConfirmation('close', giveaway)
}

async function doToggleGiveawayClosed(giveaway: Giveaway) {
  try {
    await $fetch(`/api/giveaways/${giveaway.id}`, {
      method: 'PUT',
      body: {
        ...giveaway,
        closed: !giveaway.closed
      }
    })
    toast.add({
      title: 'Succes',
      description: giveaway.closed ? 'Giveaway rouvert' : 'Giveaway clos',
      color: 'success'
    })
  } catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible de modifier le statut',
      color: 'error'
    })
  }
}

function deleteGiveaway(giveaway: Giveaway) {
  askConfirmation('delete', giveaway)
}

async function doDeleteGiveaway(id: string) {
  try {
    await $fetch(`/api/giveaways/${id}`, {
      method: 'DELETE'
    })
    toast.add({
      title: 'Succes',
      description: 'Giveaway supprime',
      color: 'success'
    })
    // SSE met à jour automatiquement les données
  } catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible de supprimer le giveaway',
      color: 'error'
    })
  }
}

function formatDate(dateString: string) {
  if (!dateString) return '-'
  return new Date(dateString).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
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
        <h1 class="text-3xl font-bold">
          Giveaways Twitch
        </h1>
        <p class="text-muted mt-1">
          Gerez vos giveaways en un seul endroit
        </p>
        <a
          href="https://www.twitch.tv/directory/category/sea-of-thieves"
          target="_blank"
          class="inline-flex items-center gap-1 text-sm text-purple-500 hover:text-purple-400 mt-2"
        >
          <UIcon
            name="i-simple-icons-twitch"
            class="w-4 h-4"
          />
          Sea of Thieves sur Twitch
        </a>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Ajouter un giveaway"
        :disabled="!gifts?.length"
        @click="openNewGiveaway"
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

    <div
      v-if="!giveaways?.length"
      class="text-center py-16"
    >
      <UIcon
        name="i-lucide-gift"
        class="w-16 h-16 text-muted mx-auto mb-4"
      />
      <h2 class="text-xl font-semibold mb-2">
        Aucun giveaway
      </h2>
      <p class="text-muted mb-4">
        Commencez par ajouter votre premier giveaway
      </p>
      <UButton
        icon="i-lucide-plus"
        label="Ajouter un giveaway"
        :disabled="!gifts?.length"
        @click="openNewGiveaway"
      />
    </div>

    <template v-else>
      <!-- Filtres -->
      <UCard class="mb-6">
        <div class="space-y-3">
          <!-- Filtre par statut -->
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-sm font-medium text-muted">Statut :</span>
            <UButton
              :color="selectedStatuses.includes('open') ? 'success' : 'neutral'"
              :variant="selectedStatuses.includes('open') ? 'solid' : 'outline'"
              size="xs"
              @click="toggleStatusFilter('open')"
            >
              En cours
            </UButton>
            <UButton
              :color="selectedStatuses.includes('closed') ? 'error' : 'neutral'"
              :variant="selectedStatuses.includes('closed') ? 'solid' : 'outline'"
              size="xs"
              @click="toggleStatusFilter('closed')"
            >
              Clos
            </UButton>
          </div>

          <!-- Filtre par cadeau -->
          <div
            v-if="availableGifts.length > 0"
            class="flex items-center gap-3 flex-wrap"
          >
            <span class="text-sm font-medium text-muted">Cadeau :</span>
            <UButton
              v-for="gift in availableGifts"
              :key="gift.id"
              :color="selectedGifts.includes(gift.id) ? 'primary' : 'neutral'"
              :variant="selectedGifts.includes(gift.id) ? 'solid' : 'outline'"
              size="xs"
              @click="toggleGiftFilter(gift.id)"
            >
              <img
                :src="gift.image"
                :alt="gift.title"
                class="w-4 h-4 object-contain mr-1"
              >
              {{ gift.title }}
            </UButton>
            <UButton
              v-if="selectedGifts.length > 0"
              color="neutral"
              variant="ghost"
              size="xs"
              label="Effacer"
              @click="selectedGifts = []"
            />
          </div>
        </div>
      </UCard>

      <div class="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <UCard
          v-for="giveaway in filteredGiveaways"
          :key="giveaway.id"
          :class="{ 'opacity-60': giveaway.isClosed }"
        >
          <template #header>
            <div class="flex justify-between items-start">
              <div>
                <div class="flex items-center gap-2">
                  <UIcon
                    name="i-simple-icons-twitch"
                    class="w-5 h-5 text-purple-500"
                  />
                  <a
                    :href="getTwitchUrl(giveaway.twitchChannel)"
                    target="_blank"
                    class="font-semibold text-primary hover:underline"
                  >
                    {{ getStreamerName(giveaway.twitchChannel) }}
                  </a>
                </div>
                <div class="text-sm text-muted mt-1">
                  {{ formatDate(giveaway.date) }}
                </div>
              </div>
              <UBadge
                :color="giveaway.isClosed ? 'error' : 'success'"
                size="xs"
              >
                {{ giveaway.isClosed ? 'Clos' : 'En cours' }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-3">
            <!-- Cadeaux -->
            <div
              v-if="giveaway.giftIds.length > 0"
              class="flex flex-wrap gap-4"
            >
              <div
                v-for="giftId in giveaway.giftIds"
                :key="giftId"
                class="flex items-center gap-2"
              >
                <img
                  :src="getGift(giftId)?.image"
                  :alt="getGift(giftId)?.title"
                  class="w-12 h-12 object-contain"
                >
                <span class="font-medium">{{ getGift(giftId)?.title || 'Inconnu' }}</span>
              </div>
            </div>
            <div
              v-else
              class="text-sm text-muted italic"
            >
              Aucun cadeau defini
            </div>

            <!-- Badges -->
            <div class="flex gap-1 flex-wrap">
              <UBadge
                :color="giveaway.type === 'command' ? 'primary' : giveaway.type === 'ticket' ? 'info' : 'warning'"
                size="xs"
              >
                {{ giveaway.type === 'command' ? 'Commande' : giveaway.type === 'ticket' ? 'Ticket' : 'StreamElements' }}
              </UBadge>
              <UBadge
                v-if="giveaway.requireFollow"
                color="neutral"
                size="xs"
              >
                Follow requis
              </UBadge>
            </div>

            <!-- Infos supplementaires -->
            <div
              v-if="giveaway.drawTime || giveaway.command || giveaway.streamElementsUrl"
              class="space-y-1 text-sm text-muted"
            >
              <div
                v-if="giveaway.drawTime"
                class="flex items-center gap-2"
              >
                <UIcon
                  name="i-lucide-clock"
                  class="w-4 h-4"
                />
                <span>Tirage a {{ giveaway.drawTime }}</span>
              </div>

              <div
                v-if="giveaway.command"
                class="flex items-center gap-2"
              >
                <UIcon
                  name="i-lucide-terminal"
                  class="w-4 h-4"
                />
                <code class="bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded text-xs">{{ giveaway.command }}</code>
                <UButton
                  icon="i-lucide-copy"
                  size="xs"
                  color="neutral"
                  variant="ghost"
                  title="Copier la commande"
                  @click="copyCommand(giveaway.command)"
                />
              </div>

              <div
                v-if="giveaway.streamElementsUrl"
                class="flex items-center gap-2"
              >
                <UIcon
                  name="i-lucide-external-link"
                  class="w-4 h-4"
                />
                <a
                  :href="giveaway.streamElementsUrl"
                  target="_blank"
                  class="text-primary hover:underline truncate"
                >
                  StreamElements
                </a>
              </div>
            </div>
          </div>

          <template #footer>
            <div class="flex justify-end gap-1">
              <UButton
                :icon="giveaway.closed ? 'i-lucide-play' : 'i-lucide-check'"
                :color="giveaway.closed ? 'success' : 'warning'"
                variant="ghost"
                size="xs"
                :label="giveaway.closed ? 'Rouvrir' : 'Clore'"
                @click="toggleGiveawayClosed(giveaway)"
              />
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                label="Modifier"
                @click="editGiveaway(giveaway)"
              />
              <UButton
                icon="i-lucide-trash-2"
                color="error"
                variant="ghost"
                size="xs"
                label="Supprimer"
                @click="deleteGiveaway(giveaway)"
              />
            </div>
          </template>
        </UCard>
      </div>
    </template>

    <GiveawayModal
      v-model:open="isModalOpen"
      :giveaway="editingGiveaway"
      :gifts="gifts"
    />

    <!-- Modal de confirmation -->
    <UModal v-model:open="confirmModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">
              {{ confirmAction === 'delete' ? 'Supprimer le giveaway' : (confirmGiveaway?.closed ? 'Rouvrir le giveaway' : 'Clore le giveaway') }}
            </h2>
          </template>

          <p v-if="confirmAction === 'delete'">
            Etes-vous sur de vouloir supprimer ce giveaway pour
            <strong>{{ confirmGiveaway ? getStreamerName(confirmGiveaway.twitchChannel) : '' }}</strong> ?
            Cette action est irreversible.
          </p>
          <p v-else-if="confirmGiveaway?.closed">
            Etes-vous sur de vouloir rouvrir ce giveaway pour
            <strong>{{ confirmGiveaway ? getStreamerName(confirmGiveaway.twitchChannel) : '' }}</strong> ?
          </p>
          <p v-else>
            Etes-vous sur de vouloir clore ce giveaway pour
            <strong>{{ confirmGiveaway ? getStreamerName(confirmGiveaway.twitchChannel) : '' }}</strong> ?
          </p>

          <div class="flex justify-end gap-2 mt-4">
            <UButton
              label="Annuler"
              color="neutral"
              variant="outline"
              @click="confirmModalOpen = false"
            />
            <UButton
              :label="confirmAction === 'delete' ? 'Supprimer' : (confirmGiveaway?.closed ? 'Rouvrir' : 'Clore')"
              :color="confirmAction === 'delete' ? 'error' : 'primary'"
              @click="executeConfirmedAction"
            />
          </div>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
