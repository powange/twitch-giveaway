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

const form = reactive({
  title: '',
  image: '',
})

function resetForm() {
  form.title = ''
  form.image = ''
}

async function addGift() {
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
    await $fetch('/api/gifts', {
      method: 'POST',
      body: form,
    })
    toast.add({
      title: 'Succes',
      description: 'Cadeau ajoute avec succes',
      color: 'success',
    })
    resetForm()
    isModalOpen.value = false
    await refresh()
  }
  catch {
    toast.add({
      title: 'Erreur',
      description: 'Impossible d\'ajouter le cadeau',
      color: 'error',
    })
  }
  finally {
    isLoading.value = false
  }
}

async function deleteGift(id: string) {
  try {
    await $fetch(`/api/gifts/${id}`, {
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
          <div class="flex justify-center">
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              label="Supprimer"
              @click="deleteGift(gift.id)"
            />
          </div>
        </template>
      </UCard>
    </div>

    <UModal v-model:open="isModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <h2 class="text-xl font-semibold">Nouveau Cadeau</h2>
          </template>

          <form class="space-y-4" @submit.prevent="addGift">
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
                label="Ajouter"
                :loading="isLoading"
              />
            </div>
          </form>
        </UCard>
      </template>
    </UModal>
  </UContainer>
</template>
