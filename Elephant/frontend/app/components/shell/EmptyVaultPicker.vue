<template>
  <main class="en-empty">
    <section class="en-empty-card">
      <div class="en-empty-logo">
        <img
          class="en-logo-image"
          :src="logoUrl"
          alt="Elephant"
          @error="$event.target.classList.add('is-missing')"
        >
        <span class="en-logo-fallback">E</span>
      </div>
      <div class="en-empty-heading">
        <h1>Choose where your vault lives</h1>
        <p>
          Your notes, folders, drawings and images stay together in one vault.
          Elephant only accesses the location you choose.
        </p>
      </div>

      <div class="en-storage-mode-grid">
        <button
          class="en-storage-mode en-storage-mode-simple"
          type="button"
          :disabled="store.loading"
          @click="emit('create-local')"
        >
          <span class="en-storage-mode-label">Simple mode</span>
          <strong>Let Elephant manage it</strong>
          <small>
            Uses the private app folder. It works immediately and remains isolated from other apps.
          </small>
        </button>

        <button
          class="en-storage-mode en-storage-mode-advanced"
          type="button"
          :disabled="store.loading"
          @click="emit('choose')"
        >
          <span class="en-storage-mode-label">Advanced mode</span>
          <strong>Choose a vault folder</strong>
          <small>
            Opens Android's folder picker and grants Elephant access only to the selected folder.
          </small>
        </button>
      </div>

      <p
        v-if="store.loading"
        class="en-storage-status"
        role="status"
      >
        Opening Android storage…
      </p>
      <p
        v-else-if="store.error"
        class="en-storage-error"
        role="alert"
      >
        {{ store.error }}
      </p>

      <small class="en-storage-footnote">
        Android does not require access to every file. Advanced mode uses the system folder grant,
        while Simple mode keeps the vault inside Elephant's private storage.
      </small>
    </section>
  </main>
</template>

<script setup>
import { useVaultStore } from '../../stores/vaultStore'
import logoUrl from '../../../../assets/static/icon.png'

const emit = defineEmits(['choose', 'create-local'])
const store = useVaultStore()
</script>

<style scoped>
.en-empty {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: max(28px, env(safe-area-inset-top, 0px) + 22px) 18px max(28px, env(safe-area-inset-bottom, 0px) + 22px);
  overflow-y: auto;
  background: var(--en-bg, #0f141d);
  color: var(--en-text, #eef3fb);
}

.en-empty-card {
  width: min(520px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 20px;
  text-align: center;
}

.en-empty-logo {
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
}

.en-logo-image {
  width: 88px;
  height: 88px;
  object-fit: contain;
  display: block;
}

.en-logo-image.is-missing {
  display: none;
}

.en-logo-fallback {
  display: none;
  font-size: 38px;
  font-weight: 800;
}

.en-logo-image.is-missing + .en-logo-fallback {
  display: block;
}

.en-empty-heading {
  display: grid;
  gap: 9px;
}

.en-empty-card h1,
.en-empty-card p,
.en-empty-card small {
  margin: 0;
}

.en-empty-card h1 {
  font-size: 28px;
  line-height: 1.15;
  letter-spacing: -0.03em;
}

.en-empty-card p {
  color: var(--en-muted, #98a3b6);
  font-size: 15px;
  line-height: 1.5;
}

.en-storage-mode-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.en-storage-mode {
  min-width: 0;
  min-height: 168px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--en-border, #2b3546);
  border-radius: 20px;
  color: var(--en-text, #eef3fb);
  background: color-mix(in srgb, var(--en-surface, #182233) 78%, transparent);
  font: inherit;
  text-align: left;
  transition: transform 120ms ease, border-color 120ms ease, background 120ms ease;
}

.en-storage-mode:active:not(:disabled) {
  transform: scale(0.985);
}

.en-storage-mode:disabled {
  opacity: 0.58;
}

.en-storage-mode-simple {
  border-color: color-mix(in srgb, var(--en-primary, #5ea1ff) 58%, var(--en-border, #2b3546));
  background: color-mix(in srgb, var(--en-primary, #5ea1ff) 11%, var(--en-surface, #182233));
}

.en-storage-mode-label {
  display: inline-flex;
  min-height: 25px;
  align-items: center;
  padding: 0 9px;
  border-radius: 999px;
  color: var(--en-primary, #5ea1ff);
  background: color-mix(in srgb, var(--en-primary, #5ea1ff) 13%, transparent);
  font-size: 11px;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.en-storage-mode strong {
  font-size: 17px;
  line-height: 1.25;
}

.en-storage-mode small,
.en-storage-footnote {
  color: var(--en-muted, #98a3b6);
  font-size: 12px;
  line-height: 1.45;
}

.en-storage-status,
.en-storage-error {
  width: 100%;
  padding: 12px 14px;
  border-radius: 14px;
  font-size: 13px !important;
  text-align: left;
}

.en-storage-status {
  background: color-mix(in srgb, var(--en-primary, #5ea1ff) 12%, var(--en-surface, #182233));
}

.en-storage-error {
  color: #fecaca !important;
  background: rgba(127, 29, 29, 0.58);
}

.en-storage-footnote {
  max-width: 440px;
}

@media (max-width: 560px), (pointer: coarse) {
  .en-empty {
    align-items: start;
  }

  .en-empty-card {
    gap: 18px;
  }

  .en-empty-logo,
  .en-logo-image {
    width: 76px;
    height: 76px;
  }

  .en-empty-card h1 {
    font-size: 25px;
  }

  .en-storage-mode-grid {
    grid-template-columns: 1fr;
  }

  .en-storage-mode {
    min-height: 0;
    padding: 17px;
  }
}
</style>
