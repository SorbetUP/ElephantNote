<template>
  <main class="en-empty">
    <section class="en-empty-card">
      <div class="en-empty-logo">
        <img
          class="en-logo-image"
          :src="logoUrl"
          alt="ElephantNote"
          @error="$event.target.classList.add('is-missing')"
        >
        <span class="en-logo-fallback">EN</span>
      </div>
      <div class="en-empty-heading">
        <h1>Choose where your vault lives</h1>
        <p>
          Your notes, folders, drawings and images stay together in one vault.
          ElephantNote never needs access to all files on your phone.
        </p>
      </div>

      <div class="en-storage-mode-grid">
        <button
          class="en-storage-mode en-storage-mode-simple"
          type="button"
          @click="$emit('create-local')"
        >
          <span class="en-storage-mode-label">Simple mode</span>
          <strong>Let ElephantNote manage it</strong>
          <small>
            Uses a private app folder. No setup and no storage permission prompt.
          </small>
        </button>

        <button
          class="en-storage-mode en-storage-mode-advanced"
          type="button"
          @click="$emit('choose')"
        >
          <span class="en-storage-mode-label">Advanced mode</span>
          <strong>Choose a vault folder</strong>
          <small>
            Android opens its system picker and grants access only to the folder you select.
          </small>
        </button>
      </div>

      <small class="en-storage-footnote">
        Simple mode is safer and works immediately. Advanced mode is intended for a visible,
        filesystem-backed folder that you also want to open from a file manager or another app.
      </small>
    </section>
  </main>
</template>

<script setup>
import logoUrl from '../../assets/ElephantLogo.png'

defineEmits(['choose', 'create-local'])
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
  font-size: 28px;
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
