import { LRUCache } from 'lru-cache'

export class memoryCache {
  cache: LRUCache<string, { value: any, expiration: number }>

  constructor(options = {}) {
    this.cache = new LRUCache({
      maxSize: 30 * 1024 * 1024,
      max: 10000,
      sizeCalculation: (value, key) => {
        try {
          return JSON.stringify(value).length
        } catch (error) {
          // Handle circular references or non-serializable objects
          if (error.message.includes('circular') || error.message.includes('cyclic')) {
            // For objects with circular references, use a rough size estimation
            if (typeof value === 'object' && value !== null) {
              return Object.keys(value).length * 50; // Rough estimation
            }
            return 100; // Default size for complex objects
          }
          // For other serialization errors, return a default size
          return 100;
        }
      },
      ...options
    })
  }

  get(key: string) {
    return this.cache.get(key)
  }

  set(key: string, value: any) {
    this.cache.set(key, value)
  }

  clear() {
    this.cache.clear()
  }

  async wrap<T extends (...args: any[]) => Promise<any>, U = ReturnType<T>>(key: string, fn: T, args: { ttl: number, alowStale?: boolean }): Promise<Awaited<U>> {
    const data = this.get(key)
    if (data?.expiration && new Date(data.expiration) <= new Date()) {
      if (args?.alowStale) {
        fn().then((value) => {
          this.set(key, {
            value,
            expiration: new Date().setTime(new Date().getTime() + args.ttl || 60 * 1000)
          })
        }).catch(err => {
          console.error(err)
        })
      } else {
        this.set(key, {
          value: null,
        })
      }
    }
    if (!data || !data.value) {
      const value = await fn();
      this.set(key, {
        value,
        expiration: new Date().setTime(new Date().getTime() + args.ttl || 60 * 1000)
      })
      return value;
    }
    return data.value
  }
}

export const cache = new memoryCache()