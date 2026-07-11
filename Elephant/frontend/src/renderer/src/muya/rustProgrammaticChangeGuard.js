const DEFAULT_BURST = 256
const DEFAULT_TTL_MS = 750

export const createProgrammaticChangeGuard = ({
  now = () => Date.now(),
  burst = DEFAULT_BURST,
  ttlMs = DEFAULT_TTL_MS
} = {}) => {
  let pending = 0
  let deadline = 0

  const currentTime = () => Number(now()) || 0
  const ttl = () => Number(ttlMs) || DEFAULT_TTL_MS
  const clearIfExpired = () => {
    if (pending <= 0 && deadline > 0 && currentTime() > deadline) deadline = 0
  }
  const arm = () => {
    pending = Math.max(pending, Number(burst) || DEFAULT_BURST)
    deadline = currentTime() + ttl()
  }

  return {
    run (render) {
      if (typeof render !== 'function') throw new TypeError('A programmatic Muya render callback is required.')
      arm()
      try {
        return render()
      } catch (error) {
        pending = 0
        deadline = 0
        throw error
      }
    },

    consume () {
      clearIfExpired()
      if (pending <= 0 && deadline <= 0) return false
      pending = Math.max(0, pending - 1)
      deadline = currentTime() + ttl()
      return true
    },

    clear () {
      pending = 0
      deadline = 0
    },

    get pending () {
      clearIfExpired()
      return pending > 0 || deadline > 0
    }
  }
}
