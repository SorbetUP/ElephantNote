<template>
  <component :is="iconComponent" aria-hidden="true" />
</template>

<script setup>
import { computed } from 'vue'
import {
  Bot,
  CalendarClock,
  CalendarDays,
  Cloud,
  Database,
  Download,
  Globe2,
  Layers3,
  MessageCircle,
  Package,
  PenTool,
  Sparkles,
  Terminal
} from '@lucide/vue'
import OpenAiMark from './OpenAiMark.vue'

const props = defineProps({ name: { type: String, default: 'package' } })

const ICONS = Object.freeze({
  bot: Bot,
  'calendar-clock': CalendarClock,
  calendar: CalendarDays,
  'calendar-days': CalendarDays,
  cloud: Cloud,
  database: Database,
  download: Download,
  globe: Globe2,
  'globe-2': Globe2,
  layers: Layers3,
  'layers-3': Layers3,
  'message-circle': MessageCircle,
  openai: OpenAiMark,
  package: Package,
  'pen-tool': PenTool,
  sparkles: Sparkles,
  terminal: Terminal
})

const iconComponent = computed(() => ICONS[String(props.name || '').toLowerCase()] || Package)
</script>
