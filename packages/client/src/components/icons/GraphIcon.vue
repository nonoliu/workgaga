<template>
  <svg :width="size" :height="size" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="6" cy="7" r="3" />
    <circle cx="17" cy="6" r="2.5" />
    <circle cx="16" cy="17" r="3" />
    <path d="M8.8 6.7L14.5 6.2" />
    <path d="M7.8 9.5L13.8 14.8" />
    <path d="M17 8.5L16.4 14" />
  </svg>
</template>

<script setup lang="ts">
interface Props {
  size?: number;
}

withDefaults(defineProps<Props>(), {
  size: 16,
});
</script>
