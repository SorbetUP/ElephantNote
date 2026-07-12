export const mixins = (constructor, ...objects) => {
  return Object.assign(constructor.prototype, ...objects)
}
