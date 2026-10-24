import { EventEmitter } from 'node:events';

export const liveEventEmitter = new EventEmitter();
// Allow any number of simultaneous client listeners
liveEventEmitter.setMaxListeners(100);

export function broadcastLiveEvent(event: { type: string; [key: string]: any }) {
  try {
    liveEventEmitter.emit('event', event);
  } catch (err) {
    console.warn('[LiveEvents] Error broadcasting event:', err);
  }
}
