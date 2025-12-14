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

const navItems = [
  { label: 'Giveaways', to: '/', icon: 'i-lucide-gift' },
  { label: 'Cadeaux', to: '/cadeaux', icon: 'i-lucide-package' },
  { label: 'Streams', to: '/streams', icon: 'i-lucide-tv' },
  { label: "L'Orbe", to: '/orbe', icon: 'i-lucide-radio' }
]
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

      <!-- Navigation desktop -->
      <nav class="hidden md:flex items-center gap-4">
        <ULink
          v-for="item in navItems"
          :key="item.to"
          :to="item.to"
          active-class="text-primary"
          inactive-class="text-muted hover:text-foreground"
          class="flex items-center gap-1.5 text-sm font-medium transition-colors"
        >
          <UIcon :name="item.icon" class="w-4 h-4" />
          {{ item.label }}
        </ULink>
      </nav>

      <!-- Navigation mobile (dans le menu déroulant) -->
      <template #body>
        <nav class="flex flex-col gap-2 p-4">
          <ULink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            active-class="text-primary"
            inactive-class="text-muted hover:text-foreground"
            class="flex items-center gap-2 py-2 text-sm font-medium transition-colors"
          >
            <UIcon :name="item.icon" class="w-5 h-5" />
            {{ item.label }}
          </ULink>
        </nav>
      </template>

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
