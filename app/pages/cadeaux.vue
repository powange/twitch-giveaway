<script setup lang="ts">
interface Gift {
  id: string
  title: string
  image: string
}

const toast = useToast()

const { data: gifts, refresh } = await useFetch<Gift[]>('/api/gifts')

const isModalOpen = ref(false)
const isLoading = ref(false)
const editingId = ref<string | null>(null)

// Confirmation de suppression
const confirmModalOpen = ref(false)
const giftToDelete = ref<Gift | null>(null)

function askDeleteConfirmation(gift: Gift) {
  giftToDelete.value = gift
  confirmModalOpen.value = true
}

const form = reactive({
  title: '',
  image: '',
})

function resetForm() {
  form.title = ''
  form.image = ''
  editingId.value = null
}

function editGift(gift: Gift) {
  editingId.value = gift.id
  form.title = gift.title
  form.image = gift.image
  isModalOpen.value = true
}

async function saveGift() {
  if (!form.title || !form.image) {
    toast.add({
      title: 'Erreur',
      description: 'Le titre et l\'image sont requis',
      color: 'error',
    })
    return
  }

  isLoading.value = true
  try {
    if (editingId.value) {
      await $fetch(`/api/gifts/${editingId.value}`, {
        method: 'PUT',
        body: form,
      })
      toast.add({
        title: 'Succes',
        description: 'Cadeau modifie avec succes',
        color: 'success',
      })
    }
    else {
      await $fetch('/api/gifts', {
        method: 'POST',
        body: form,
      })
      toast.add({
        title: 'Succes',
        description: 'Cadeau ajoute avec succes',
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
      description: editingId.value ? 'Impossible de modifier le cadeau' : 'Impossible d\'ajouter le cadeau',
      color: 'error',
    })
  }
  finally {
    isLoading.value = false
  }
}

async function confirmDelete() {
  if (!giftToDelete.value) return

  try {
    await $fetch(`/api/gifts/${giftToDelete.value.id}`, {
      method: 'DELETE',
    })
    toast.add({
      title: 'Succes',
      description: 'Cadeau supprime',
      color: 'success',
    })
    await refresh()
  }
  catch (error: unknown) {
    const message = error instanceof Error && 'data' in error
      ? (error as { data?: { message?: string } }).data?.message || 'Impossible de supprimer le cadeau'
      : 'Impossible de supprimer le cadeau'
    toast.add({
      title: 'Erreur',
      description: message,
      color: 'error',
    })
  }
  finally {
    confirmModalOpen.value = false
    giftToDelete.value = null
  }
}
</script>

<template>
  <UContainer class="py-8">
    <div class="flex justify-between items-center mb-8">
      <div>
        <h1 class="text-3xl font-bold">Cadeaux</h1>
        <p class="text-muted mt-1">Gerez la liste des cadeaux pour vos giveaways</p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="Ajouter un cadeau"
        @click="isModalOpen = true"
      />
    </div>

    <div v-if="!gifts?.length" class="text-center py-16">
      <UIcon name="i-lucide-package" class="w-16 h-16 text-muted mx-auto mb-4" />
      <h2 class="text-xl font-semibold mb-2">Aucun cadeau</h2>
      <p class="text-muted mb-4">Commencez par ajouter votre premier cadeau</p>
      <UButton
        icon="i-lucide-plus"
        label="Ajouter un cadeau"
        @click="isModalOpen = true"
      />
    </div>

    <div v-else class="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <UCard v-for="gift in gifts" :key="gift.id">
        <div class="flex flex-col items-center text-center">
          <img
            :src="gift.image"
            :alt="gift.title"
            class="w-24 h-24 object-contain mb-3"
          >
          <h3 class="font-semibold">{{ gift.title }}</h3>
        </div>

        <template #footer>
          <div class="flex justify-center gap-2">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              label="Modifier"
              @click="editGift(gift)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              label="Supprimer"
              @click="askDeleteConfirmation(gift)"
            />
          </div>
        </template>
      </UCard>
    </div>

    <UModal v-model:open="isModalOpen" @close="resetForm">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">{{ editingId ? 'Modifier le Cadeau' : 'Nouveau Cadeau' }}</h2>
          </template>

          <form class="space-y-4" @submit.prevent="saveGift">
            <UFormField label="Titre" required>
              <UInput
                v-model="form.title"
                placeholder="Ex: Abonnement Twitch, Jeu Steam..."
                class="w-full"
              />
            </UFormField>

            <UFormField label="URL de l'image" required>
              <UInput
                v-model="form.image"
                placeholder="https://example.com/image.png"
                class="w-full"
              />
            </UFormField>

            <div v-if="form.image" class="flex justify-center p-4 bg-muted rounded-lg">
              <img
                :src="form.image"
                alt="Apercu"
                class="max-h-32 object-contain"
              >
            </div>

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

    <!-- Modal de confirmation de suppression -->
    <UModal v-model:open="confirmModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">Supprimer le cadeau</h2>
          </template>

          <p>
            Etes-vous sur de vouloir supprimer le cadeau
            <strong>{{ giftToDelete?.title }}</strong> ?
            Cette action est irreversible.
          </p>

          <div class="flex justify-end gap-2 mt-4">
            <UButton
              label="Annuler"
              color="neutral"
              variant="outline"
              @click="confirmModalOpen = false"
            />
            <UButton
              label="Supprimer"
              color="error"
              @click="confirmDelete"
            />
          </div>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
