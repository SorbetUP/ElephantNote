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
