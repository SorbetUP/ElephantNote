export const throttle = (func, wait = 50) => {
  let context
  let args
  let result
  let timeout = null
  let previous = 0

  const later = () => {
    previous = Date.now()
    timeout = null
    result = func.apply(context, args)
    if (!timeout) context = args = null
  }

  return function() {
    const now = Date.now()
    const remaining = wait - (now - previous)
    context = this
    args = arguments

    if (remaining <= 0 || remaining > wait) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      previous = now
      result = func.apply(context, args)
      if (!timeout) context = args = null
    } else if (!timeout) {
      timeout = setTimeout(later, remaining)
    }
    return result
  }
}

export const debounce = (func, wait = 50) => {
  let timer = null
  return function(...args) {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      func(...args)
    }, wait)
  }
}
