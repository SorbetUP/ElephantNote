<template>
  <section class="en-chatgpt-card">
    <header class="en-chatgpt-header">
      <div class="en-chatgpt-identity">
        <svg
          class="en-chatgpt-logo"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <use :href="chatgptLogoHref" />
        </svg>
        <div class="en-chatgpt-title-line">
          <h4>ChatGPT subscription</h4>
          <span
            v-if="accountName"
            class="en-chatgpt-account"
          >{{ accountName }}</span>
        </div>
      </div>

      <div class="en-chatgpt-header-actions">
        <button
          v-if="status.connected"
          class="danger compact"
          type="button"
          :disabled="busy"
          @click="$emit('disconnect')"
        >
          Disconnect
        </button>
        <button
          v-else
          class="primary compact"
          type="button"
          :disabled="busy || !status.installed"
          @click="$emit('connect')"
        >
          Connect with ChatGPT
        </button>
        <button
          v-if="status.connected"
          class="en-chatgpt-expand"
          type="button"
          :aria-expanded="usageOpen"
          aria-label="Toggle ChatGPT usage"
          @click="toggleUsage"
        >
          <ChevronDown
            :class="{ open: usageOpen }"
            aria-hidden="true"
          />
        </button>
      </div>
    </header>

    <p
      v-if="message"
      class="en-chatgpt-message"
      :class="{ error: Boolean(status.error) }"
    >
      {{ message }}
    </p>

    <div
      v-if="loginChallenge.userCode"
      class="en-chatgpt-login"
    >
      <strong>Device code: {{ loginChallenge.userCode }}</strong>
      <button
        class="secondary compact"
        type="button"
        @click="$emit('open-auth', loginChallenge.verificationUrl)"
      >
        Open authentication page
      </button>
    </div>

    <section
      v-if="status.connected && usageOpen"
      class="en-chatgpt-usage"
    >
      <h5>Usage</h5>
      <div
        v-if="rateLimitRows.length"
        class="en-chatgpt-limit-list"
      >
        <article
          v-for="limit in rateLimitRows"
          :key="limit.id"
          class="en-chatgpt-limit"
        >
          <div class="en-chatgpt-limit-copy">
            <strong>{{ limit.label }}</strong>
            <small>{{ resetLabel(limit.resetsAt) }}</small>
          </div>
          <progress
            max="100"
            :value="limit.remainingPercent"
          />
          <strong class="en-chatgpt-remaining">{{ limit.remainingPercent }}% remaining</strong>
        </article>
      </div>
      <p
        v-else
        class="en-chatgpt-empty"
      >
        Usage information is not available.
      </p>

      <div class="en-chatgpt-reset-bar">
        <span v-if="availableResetCount > 0">{{ availableResetCount }} reset{{ availableResetCount === 1 ? '' : 's' }} available</span>
        <span v-else>No resets available</span>
        <button
          class="secondary compact"
          type="button"
          :disabled="resetBusy || !resetCredits.length"
          :aria-expanded="resetPickerOpen"
          @click="toggleResetPicker"
        >
          Use a reset
          <ChevronDown
            :class="{ open: resetPickerOpen }"
            aria-hidden="true"
          />
        </button>
      </div>

      <div
        v-if="resetPickerOpen"
        class="en-chatgpt-reset-picker"
      >
        <div
          v-for="credit in resetCredits"
          :key="credit.id"
          class="en-chatgpt-reset-option"
        >
          <strong>Full reset ({{ resetDateLabel(credit.expiresAt) }})</strong>
          <button
            class="primary compact"
            type="button"
            :disabled="resetBusy"
            @click="useReset(credit.id)"
          >
            {{ resetBusy && activeResetId === credit.id ? 'Applying…' : 'Use' }}
          </button>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'
import chatgptLogoUrl from './chatgpt-logo.svg'

const props = defineProps({
  status: { type: Object, required: true },
  rateLimitRows: { type: Array, default: () => [] },
  resetCredits: { type: Array, default: () => [] },
  availableResetCount: { type: Number, default: 0 },
  busy: { type: Boolean, default: false },
  resetBusy: { type: Boolean, default: false },
  message: { type: String, default: '' },
  loginChallenge: { type: Object, default: () => ({}) }
})

const emit = defineEmits(['connect', 'disconnect', 'open-auth', 'consume-reset'])
const usageOpen = ref(false)
const resetPickerOpen = ref(false)
const activeResetId = ref('')

const chatgptLogoHref = `${chatgptLogoUrl}#chatgpt-mark`
const accountName = computed(() => props.status?.account?.displayName || props.status?.account?.email || '')
const formatTimestamp = (timestamp, options) => {
  const numeric = Number(timestamp)
  if (!Number.isFinite(numeric) || numeric <= 0) return ''
  return new Date(numeric * 1000).toLocaleString(undefined, options)
}
const resetLabel = (timestamp) => {
  const value = formatTimestamp(timestamp, { dateStyle: 'medium', timeStyle: 'short' })
  return value ? `Resets ${value}` : 'Reset time unavailable'
}
const resetDateLabel = (timestamp) => {
  const numeric = Number(timestamp)
  if (!Number.isFinite(numeric) || numeric <= 0) return 'date unavailable'
  const date = new Date(numeric * 1000)
  const day = String(date.getDate()).padStart(2, '0')
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${day}/${month}/${date.getFullYear()}`
}
const closeResetPicker = () => {
  resetPickerOpen.value = false
  activeResetId.value = ''
}
const toggleResetPicker = () => {
  if (resetPickerOpen.value) closeResetPicker()
  else resetPickerOpen.value = true
}
const toggleUsage = () => {
  usageOpen.value = !usageOpen.value
  if (!usageOpen.value) closeResetPicker()
}
const useReset = (creditId) => {
  if (!creditId || props.resetBusy) return
  activeResetId.value = creditId
  emit('consume-reset', creditId)
}

watch(() => props.status.connected, (connected) => {
  if (!connected) {
    usageOpen.value = false
    closeResetPicker()
  }
})
watch(() => props.resetBusy, (busy, previous) => {
  if (previous && !busy) closeResetPicker()
})
</script>

<style scoped>
.en-chatgpt-card { overflow: hidden; border: 1px solid var(--en-border); border-radius: 14px; background: var(--en-surface); }
.en-chatgpt-header { min-height: 72px; display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 12px 16px; }
.en-chatgpt-identity, .en-chatgpt-header-actions, .en-chatgpt-title-line, .en-chatgpt-reset-bar { display: flex; align-items: center; }
.en-chatgpt-identity { min-width: 0; gap: 12px; }
.en-chatgpt-logo { flex: 0 0 auto; width: 30px; height: 30px; color: var(--en-text); }
.en-chatgpt-title-line { min-width: 0; flex-wrap: wrap; gap: 7px 12px; }
.en-chatgpt-title-line h4 { margin: 0; font-size: 14px; }
.en-chatgpt-account { overflow: hidden; max-width: 320px; color: var(--en-muted); font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
.en-chatgpt-header-actions { flex: 0 0 auto; gap: 8px; }
.en-chatgpt-expand { width: 34px; min-height: 34px; padding: 0; border-color: transparent; background: transparent; }
.en-chatgpt-expand svg, .en-chatgpt-reset-bar button svg { width: 15px; height: 15px; transition: transform .16s ease; }
.en-chatgpt-expand svg.open, .en-chatgpt-reset-bar button svg.open { transform: rotate(180deg); }
.en-chatgpt-message { margin: 0 16px 12px; color: var(--en-muted); font-size: 12px; }
.en-chatgpt-message.error { color: #b42318; }
.en-chatgpt-login { margin: 0 16px 14px; padding: 9px 10px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-soft); display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.en-chatgpt-usage { margin: 0 16px 16px; padding: 14px; border: 1px solid var(--en-border); border-radius: 12px; background: color-mix(in srgb, var(--en-soft) 72%, transparent); }
.en-chatgpt-usage h5 { margin: 0 0 8px; color: var(--en-muted); font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; }
.en-chatgpt-limit-list { display: grid; }
.en-chatgpt-limit { display: grid; grid-template-columns: minmax(150px, .8fr) minmax(180px, 1.4fr) auto; align-items: center; gap: 14px; min-height: 62px; border-top: 1px solid var(--en-border); }
.en-chatgpt-limit:first-child { border-top: 0; }
.en-chatgpt-limit-copy { min-width: 0; display: grid; gap: 3px; }
.en-chatgpt-limit-copy small, .en-chatgpt-empty, .en-chatgpt-reset-bar > span { color: var(--en-muted); font-size: 11px; }
.en-chatgpt-limit progress { width: 100%; height: 7px; accent-color: var(--en-text); }
.en-chatgpt-remaining { min-width: 102px; text-align: right; font-size: 12px; font-weight: 500; }
.en-chatgpt-empty { margin: 6px 0 12px; }
.en-chatgpt-reset-bar { justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--en-border); }
.en-chatgpt-reset-picker { overflow: hidden; margin-top: 10px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-surface); }
.en-chatgpt-reset-option { min-height: 48px; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 8px 10px; border-top: 1px solid var(--en-border); }
.en-chatgpt-reset-option:first-child { border-top: 0; }
.en-chatgpt-reset-option > strong { min-width: 0; overflow: hidden; font-size: 12px; font-weight: 600; text-overflow: ellipsis; white-space: nowrap; }
button { min-height: 34px; display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 0 11px; border: 1px solid var(--en-border); border-radius: 9px; background: var(--en-surface); color: var(--en-text); cursor: pointer; }
button:disabled { cursor: not-allowed; opacity: .5; }
.primary { border-color: var(--en-primary); background: var(--en-primary); color: white; }
.danger { color: #b42318; }
.compact { min-height: 30px; font-size: 12px; }
@media (max-width: 760px) {
  .en-chatgpt-header { align-items: flex-start; }
  .en-chatgpt-title-line { display: grid; }
  .en-chatgpt-account { max-width: 220px; }
  .en-chatgpt-limit { grid-template-columns: 1fr; gap: 7px; padding: 12px 0; }
  .en-chatgpt-remaining { text-align: left; }
  .en-chatgpt-reset-bar { align-items: stretch; flex-direction: column; }
  .en-chatgpt-reset-bar button { width: 100%; }
}
</style>
