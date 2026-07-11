<template>
  <component :is="iconComponent" aria-hidden="true" />
</template>

<script setup>
import { computed } from 'vue'
import {
  Bot,
  CalendarDays,
  Cloud,
  Database,
  Download,
  Globe2,
  Layers3,
  MessageSquareText,
  Package,
  Sparkles
} from '@lucide/vue'

const props = defineProps({ name: { type: String, default: 'package' } })

const ICONS = Object.freeze({
  bot: Bot,
  calendar: CalendarDays,
  'calendar-days': CalendarDays,
  cloud: Cloud,
  database: Database,
  download: Download,
  globe: Globe2,
  'globe-2': Globe2,
  layers: Layers3,
  'layers-3': Layers3,
  message: MessageSquareText,
  package: Package,
  sparkles: Sparkles
})

const iconComponent = computed(() => ICONS[String(props.name || '').toLowerCase()] || Package)
</script>
