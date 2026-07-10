<template>
  <section class="en-chatgpt-card">
    <header class="en-chatgpt-header">
      <div class="en-chatgpt-identity">
        <span
          class="en-chatgpt-logo"
          aria-hidden="true"
        >
          <svg
            viewBox="0 0 24 24"
            role="img"
          >
            <g
              fill="none"
              stroke="currentColor"
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.65"
            >
              <path d="M12 3.1a4.25 4.25 0 0 1 4.12 3.25 4.25 4.25 0 0 1 2.82 6.94 4.25 4.25 0 0 1-1.2 5.63 4.25 4.25 0 0 1-6.05.78 4.25 4.25 0 0 1-5.88-1.84 4.25 4.25 0 0 1-1.32-6.43 4.25 4.25 0 0 1 2.42-6.22A4.25 4.25 0 0 1 12 3.1Z" />
              <path d="m8.18 7.36 7.64 4.41v4.72L12 18.7l-3.82-2.21v-4.41L12 9.87l3.82 2.21" />
              <path d="M12 3.1v6.77M18.94 13.29l-5.86 3.39M5.81 17.86l5.87-3.39M4.49 11.43l5.87 3.39M6.91 5.21l5.86 3.39M17.74 18.92l-5.86-3.39" />
            </g>
          </svg>
        </span>
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
          @click="usageOpen = !usageOpen"
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
        <button
          v-for="credit in resetCredits"
          :key="credit.id"
          class="en-chatgpt-reset-option"
          :class="{ selected: selectedResetId === credit.id }"
          type="button"
          @click="selectedResetId = credit.id"
        >
          <span>
            <strong>{{ credit.title || 'Full reset (Weekly + 5 hr)' }}</strong>
            <small>{{ creditExpiryLabel(credit.expiresAt) }}</small>
          </span>
          <span
            class="en-chatgpt-radio"
            aria-hidden="true"
          ><i /></span>
        </button>
        <div class="en-chatgpt-reset-actions">
          <button
            class="secondary compact"
            type="button"
            :disabled="resetBusy"
            @click="closeResetPicker"
          >
            Cancel
          </button>
          <button
            class="primary compact"
            type="button"
            :disabled="resetBusy || !selectedResetId"
            @click="confirmReset"
          >
            {{ resetBusy ? 'Applying…' : 'Use selected reset' }}
          </button>
        </div>
      </div>
    </section>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { ChevronDown } from '@lucide/vue'

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
const selectedResetId = ref('')

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
const creditExpiryLabel = (timestamp) => {
  const value = formatTimestamp(timestamp, { dateStyle: 'medium' })
  return value ? `Expires ${value}` : 'No expiration date'
}
const closeResetPicker = () => {
  resetPickerOpen.value = false
  selectedResetId.value = ''
}
const toggleResetPicker = () => {
  if (resetPickerOpen.value) closeResetPicker()
  else resetPickerOpen.value = true
}
const confirmReset = () => {
  if (!selectedResetId.value || props.resetBusy) return
  emit('consume-reset', selectedResetId.value)
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
.en-chatgpt-identity, .en-chatgpt-header-actions, .en-chatgpt-title-line, .en-chatgpt-reset-bar, .en-chatgpt-reset-actions { display: flex; align-items: center; }
.en-chatgpt-identity { min-width: 0; gap: 12px; }
.en-chatgpt-logo { display: grid; place-items: center; flex: 0 0 auto; width: 38px; height: 38px; color: var(--en-text); }
.en-chatgpt-logo svg { width: 30px; height: 30px; }
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
.en-chatgpt-limit-copy small, .en-chatgpt-empty, .en-chatgpt-reset-bar > span, .en-chatgpt-reset-option small { color: var(--en-muted); font-size: 11px; }
.en-chatgpt-limit progress { width: 100%; height: 7px; accent-color: var(--en-text); }
.en-chatgpt-remaining { min-width: 102px; text-align: right; font-size: 12px; font-weight: 500; }
.en-chatgpt-empty { margin: 6px 0 12px; }
.en-chatgpt-reset-bar { justify-content: space-between; gap: 12px; padding-top: 12px; border-top: 1px solid var(--en-border); }
.en-chatgpt-reset-picker { overflow: hidden; margin-top: 10px; border: 1px solid var(--en-border); border-radius: 10px; background: var(--en-surface); }
.en-chatgpt-reset-option { width: 100%; min-height: 58px; justify-content: space-between; border: 0; border-top: 1px solid var(--en-border); border-radius: 0; background: transparent; text-align: left; }
.en-chatgpt-reset-option:first-child { border-top: 0; }
.en-chatgpt-reset-option > span:first-child { display: grid; gap: 3px; }
.en-chatgpt-reset-option.selected { background: var(--en-soft); }
.en-chatgpt-radio { display: grid; place-items: center; width: 17px; height: 17px; border: 1px solid var(--en-muted); border-radius: 50%; }
.en-chatgpt-reset-option.selected .en-chatgpt-radio { border-color: var(--en-primary); }
.en-chatgpt-reset-option.selected .en-chatgpt-radio i { width: 9px; height: 9px; border-radius: 50%; background: var(--en-primary); }
.en-chatgpt-reset-actions { justify-content: flex-end; gap: 8px; padding: 10px; border-top: 1px solid var(--en-border); }
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
