const TIMEOUT = 1500

export const checkImageContentType = (url) => {
  const request = new XMLHttpRequest()
  let settle
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  const handler = () => {
    if (request.readyState !== XMLHttpRequest.DONE) return
    if (request.status === 200) {
      const contentType = request.getResponseHeader('Content-Type')
      settle(/^image\/(?:jpeg|png|gif|svg\+xml|webp)$/.test(contentType))
    } else if (request.status === 405) {
      settle(true)
    } else {
      settle(false)
    }
  }
  request.open('HEAD', url)
  request.onreadystatechange = handler
  request.onerror = () => settle(false)
  request.send()
  return promise
}

export const loadImage = async(url, detectContentType = false) => {
  if (detectContentType) {
    const isImage = await checkImageContentType(url)
    if (!isImage) throw new Error('not an image')
  }
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      resolve({ url, width: image.width, height: image.height })
    }
    image.onerror = (error) => reject(error)
    image.src = url
  })
}

export const isOnline = () => navigator.onLine === true

export const getPageTitle = (url) => {
  if (!url.startsWith('http') || !isOnline()) return ''

  const request = new XMLHttpRequest()
  let settle
  const promise = new Promise((resolve) => {
    settle = resolve
  })
  const handler = () => {
    if (request.readyState !== XMLHttpRequest.DONE) return
    if (request.status !== 200) return settle('')
    const contentType = request.getResponseHeader('Content-Type')
    if (!/text\/html/.test(contentType)) return settle('')
    const { response } = request
    if (typeof response !== 'string') return settle('')
    const match = response.match(/<title>(.*)<\/title>/)
    return match && match[1] ? settle(match[1]) : settle('')
  }
  request.open('GET', url)
  request.onreadystatechange = handler
  request.onerror = () => settle('')
  request.send()

  const timer = new Promise((resolve) => {
    setTimeout(() => resolve(''), TIMEOUT)
  })
  return Promise.race([promise, timer])
}
