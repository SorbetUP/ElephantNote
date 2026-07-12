export const installPrototypeMethods = (Target, methods) => {
  const descriptors = {}
  for (const [name, method] of Object.entries(methods)) {
    descriptors[name] = {
      configurable: true,
      enumerable: false,
      writable: true,
      value: method
    }
  }
  Object.defineProperties(Target.prototype, descriptors)
}

export const installAsClassMembers = (Target, installer) => {
  const before = Object.getOwnPropertyDescriptors(Target.prototype)
  installer(Target)

  for (const name of Object.getOwnPropertyNames(Target.prototype)) {
    const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, name)
    const previous = before[name]
    const changed = !previous ||
      descriptor.value !== previous.value ||
      descriptor.get !== previous.get ||
      descriptor.set !== previous.set

    if (changed && descriptor.enumerable) {
      Object.defineProperty(Target.prototype, name, {
        ...descriptor,
        enumerable: false
      })
    }
  }
}
