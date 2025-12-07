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

const props = defineProps<{
  giveaway?: Giveaway | null
  gifts: Gift[]
}>()

const emit = defineEmits<{
  saved: []
}>()

const isOpen = defineModel<boolean>('open', { default: false })

const toast = useToast()
const isLoading = ref(false)

const form = reactive({
  twitchChannel: '',
  date: '',
  giftIds: [] as string[],
  type: 'command' as 'command' | 'ticket' | 'streamelements',
  command: '',
  streamElementsUrl: '',
  drawTime: '',
  requireFollow: false
})

const giveawayTypes = [
  { label: 'Commande', value: 'command' },
  { label: 'Ticket', value: 'ticket' },
  { label: 'StreamElements', value: 'streamelements' }
]

function getTodayDate() {
  return new Date().toISOString().split('T')[0]
}

function resetForm() {
  form.twitchChannel = ''
  form.date = getTodayDate()
  form.giftIds = []
  form.type = 'command'
  form.command = ''
  form.streamElementsUrl = ''
  form.drawTime = ''
  form.requireFollow = false
}

function loadGiveaway(giveaway: Giveaway) {
  form.twitchChannel = giveaway.twitchChannel
  form.date = giveaway.date
  form.giftIds = [...giveaway.giftIds]
  form.type = giveaway.type
  form.command = giveaway.command || ''
  form.streamElementsUrl = giveaway.streamElementsUrl || ''
  form.drawTime = giveaway.drawTime || ''
  form.requireFollow = giveaway.requireFollow
}

// Charger le giveaway quand la modal s'ouvre
watch(isOpen, (open) => {
  if (open) {
    if (props.giveaway) {
      loadGiveaway(props.giveaway)
    } else {
      resetForm()
    }
  }
})

function toggleFormGift(giftId: string) {
  const index = form.giftIds.indexOf(giftId)
  if (index === -1) {
    form.giftIds.push(giftId)
  } else {
    form.giftIds.splice(index, 1)
  }
}

async function saveGiveaway() {
  if (!form.twitchChannel || !form.date) {
    toast.add({
      title: 'Erreur',
      description: 'La chaine Twitch et la date sont requis',
      color: 'error'
    })
    return
  }

  isLoading.value = true
  try {
    if (props.giveaway) {
      // Mode édition
      await $fetch(`/api/giveaways/${props.giveaway.id}`, {
        method: 'PUT',
        body: {
          ...form,
          closed: props.giveaway.closed,
          drawTime: form.drawTime || undefined
        }
      })
      toast.add({
        title: 'Succes',
        description: 'Giveaway modifie avec succes',
        color: 'success'
      })
    } else {
      // Mode création
      await $fetch('/api/giveaways', {
        method: 'POST',
        body: {
          ...form,
          drawTime: form.drawTime || undefined
        }
      })
      toast.add({
        title: 'Succes',
        description: 'Giveaway ajoute avec succes',
        color: 'success'
      })
    }
    isOpen.value = false
    emit('saved')
  } catch {
    toast.add({
      title: 'Erreur',
      description: props.giveaway ? 'Impossible de modifier le giveaway' : 'Impossible d\'ajouter le giveaway',
      color: 'error'
    })
  } finally {
    isLoading.value = false
  }
}

function close() {
  isOpen.value = false
}
</script>

<template>
  <UModal
    v-model:open="isOpen"
    @close="resetForm"
  >
    <template #content>
      <UCard>
        <template #header>
          <h2 class="text-xl font-semibold">
            {{ giveaway ? 'Modifier le Giveaway' : 'Nouveau Giveaway' }}
          </h2>
        </template>

        <form
          class="space-y-4"
          @submit.prevent="saveGiveaway"
        >
          <UFormField
            label="URL de la chaine Twitch"
            required
          >
            <UInput
              v-model="form.twitchChannel"
              placeholder="https://twitch.tv/nom_de_la_chaine"
              class="w-full"
            />
          </UFormField>

          <UFormField
            label="Date du giveaway"
            required
          >
            <UInput
              v-model="form.date"
              type="date"
              class="w-full"
            />
          </UFormField>

          <UFormField label="Cadeaux">
            <div class="flex flex-wrap gap-2">
              <UButton
                v-for="gift in gifts"
                :key="gift.id"
                :color="form.giftIds.includes(gift.id) ? 'primary' : 'neutral'"
                :variant="form.giftIds.includes(gift.id) ? 'solid' : 'outline'"
                size="sm"
                @click="toggleFormGift(gift.id)"
              >
                <img
                  :src="gift.image"
                  :alt="gift.title"
                  class="w-4 h-4 object-contain mr-1"
                >
                {{ gift.title }}
              </UButton>
            </div>
          </UFormField>

          <UFormField
            label="Type de giveaway"
            required
          >
            <URadioGroup
              v-model="form.type"
              :items="giveawayTypes"
            />
          </UFormField>

          <UFormField
            v-if="form.type === 'command'"
            label="Commande chat"
          >
            <UInput
              v-model="form.command"
              placeholder="!giveaway"
              class="w-full"
            />
          </UFormField>

          <UFormField
            v-if="form.type === 'streamelements'"
            label="URL StreamElements"
            required
          >
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
              @click="close"
            />
            <UButton
              type="submit"
              :label="giveaway ? 'Modifier' : 'Ajouter'"
              :loading="isLoading"
            />
          </div>
        </form>
      </UCard>
    </template>
  </UModal>
</template>
