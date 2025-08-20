/* eslint-disable no-restricted-globals */
// Simple Web Worker for batching/serializing debug events off the main thread

let buffer = [];
let timer = null;
let flushMs = 150; // default, can be configured

function scheduleFlush() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (buffer.length === 0) return;
    const batch = buffer;
    buffer = [];
    // Post a compact batch back to main thread
    postMessage({ type: 'batch', entries: batch });
  }, flushMs);
}

self.onmessage = (e) => {
  const msg = e.data || {};
  const { type } = msg;
  if (type === 'config') {
    if (typeof msg.flushMs === 'number' && msg.flushMs >= 16) {
      flushMs = msg.flushMs;
    }
    return;
  }
  if (type === 'event') {
    try {
      const payloadText = JSON.stringify(msg.payload);
      buffer.push({ ts: msg.ts, event: msg.event, payload: msg.payload, payloadText });
      scheduleFlush();
    } catch {
      // Fallback if payload not serializable
      buffer.push({ ts: msg.ts, event: msg.event, payload: null, payloadText: '' });
      scheduleFlush();
    }
    return;
  }
  if (type === 'flush') {
    if (timer) { clearTimeout(timer); timer = null; }
    if (buffer.length) {
      const batch = buffer; buffer = [];
      postMessage({ type: 'batch', entries: batch });
    }
  }
};


