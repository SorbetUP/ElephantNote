export const createProgrammaticChangeGuard = () => {
  let pending = 0

  return {
    run (render) {
      if (typeof render !== 'function') throw new TypeError('A programmatic Muya render callback is required.')
      pending += 1
      try {
        return render()
      } catch (error) {
        pending = Math.max(0, pending - 1)
        throw error
      }
    },

    consume () {
      if (pending <= 0) return false
      pending -= 1
      return true
    },

    get pending () {
      return pending
    }
  }
}
