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
      <h1>Select your vault folder</h1>
      <p>
        Choose the folder on this phone that ElephantNote should read, edit and synchronize.
        That folder is your vault; its notes, folders and assets stay together.
      </p>
      <button
        class="en-primary-button"
        type="button"
        @click="$emit('choose')"
      >
        Choose vault folder
      </button>
      <button
        class="en-secondary-button"
        type="button"
        @click="$emit('create-local')"
      >
        Use private app folder instead
      </button>
      <small>
        The Android system picker grants access only to the folder you select. The private app folder is isolated from file-manager apps and should be used only when you do not need a visible phone folder.
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
  padding: max(32px, env(safe-area-inset-top, 0px) + 24px) 24px max(32px, env(safe-area-inset-bottom, 0px) + 24px);
  background: var(--en-bg, #0f141d);
  color: var(--en-text, #eef3fb);
}

.en-empty-card {
  width: min(420px, 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  text-align: center;
}

.en-empty-logo {
  width: 96px;
  height: 96px;
  display: grid;
  place-items: center;
}

.en-logo-image {
  width: 96px;
  height: 96px;
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

.en-empty-card h1,
.en-empty-card p,
.en-empty-card small {
  margin: 0;
}

.en-empty-card h1 {
  font-size: 28px;
  line-height: 1.2;
}

.en-empty-card p {
  color: var(--en-muted, #98a3b6);
  font-size: 16px;
  line-height: 1.45;
}

.en-empty-card small {
  max-width: 360px;
  color: var(--en-muted, #98a3b6);
  font-size: 12px;
  line-height: 1.45;
}

.en-primary-button {
  min-height: 48px;
  border: 0;
  border-radius: 14px;
  padding: 0 20px;
  color: #fff;
  background: var(--en-primary, #5ea1ff);
  font: inherit;
  font-weight: 700;
}

.en-secondary-button {
  min-height: 46px;
  border: 1px solid var(--en-border, #2b3546);
  border-radius: 14px;
  padding: 0 18px;
  color: var(--en-text, #eef3fb);
  background: color-mix(in srgb, var(--en-surface, #182233) 74%, transparent);
  font: inherit;
  font-weight: 650;
}

.en-primary-button,
.en-secondary-button {
  width: min(300px, 100%);
}

@media (max-width: 760px), (pointer: coarse) {
  .en-empty-card {
    gap: 18px;
  }

  .en-empty-logo,
  .en-logo-image {
    width: 82px;
    height: 82px;
  }

  .en-empty-card h1 {
    font-size: 24px;
  }
}
</style>
