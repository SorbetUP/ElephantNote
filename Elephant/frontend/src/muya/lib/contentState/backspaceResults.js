export const handled = value => ({ handled: true, value })
export const next = context => ({ handled: false, context })
