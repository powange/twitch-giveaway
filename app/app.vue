<script setup>
useHead({
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ],
  htmlAttrs: {
    lang: 'fr'
  }
})

const title = 'Twitch Giveaway Manager'
const description = 'Gérez vos giveaways Twitch facilement - Listez, ajoutez et supprimez vos giveaways.'

useSeoMeta({
  title,
  description,
  ogTitle: title,
  ogDescription: description
})
</script>

<template>
  <UApp>
    <UHeader>
      <template #left>
        <NuxtLink to="/" class="flex items-center gap-2">
          <UIcon name="i-lucide-gift" class="w-6 h-6 text-primary" />
          <span class="font-bold text-lg">Twitch Giveaway</span>
        </NuxtLink>
      </template>

      <UNavigationMenu
        :items="[
          { label: 'Giveaways', to: '/', icon: 'i-lucide-gift' },
          { label: 'Cadeaux', to: '/cadeaux', icon: 'i-lucide-package' },
        ]"
      />

      <template #right>
        <UColorModeButton />
      </template>
    </UHeader>

    <UMain>
      <NuxtPage />
    </UMain>

    <UFooter>
      <template #left>
        <p class="text-sm text-muted">
          Twitch Giveaway Manager
        </p>
      </template>
    </UFooter>
  </UApp>
</template>
