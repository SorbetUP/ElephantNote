import EventEmitter from "events";

export const eventBus = new EventEmitter();

// Increase max listeners to prevent warnings when many components subscribe
eventBus.setMaxListeners(50);