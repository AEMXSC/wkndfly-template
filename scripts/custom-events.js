const LAUNCH_QUEUE_STORAGE_KEY = 'project_launch_event_queue';
const LAUNCH_QUEUE_TTL_MS = 30 * 60 * 1000;
const LAUNCH_QUEUE_MAX_EVENTS = 100;
const AT_VIEW_START_DELAY_MS = 1000;

function isLaunchReady() {
  return Boolean(
    (typeof window._satellite !== 'undefined' && window._satellite)
    || window._launchReady === true,
  );
}

function getDataLayerSnapshot() {
  try {
    return typeof window.dataLayer !== 'undefined'
      ? JSON.parse(JSON.stringify(window.dataLayer))
      : null;
  } catch (error) {
    console.warn('[Launch custom event] Failed to clone dataLayer snapshot:', error);
    return null;
  }
}

function emitEvent(name, dataLayerSnapshot, meta = {}) {
  console.debug('[Launch custom event] Firing:', name, '| meta:', meta, '| dataLayer:', dataLayerSnapshot);
  document.dispatchEvent(
    new CustomEvent(name, {
      bubbles: true,
      detail: {
        dataLayer: dataLayerSnapshot,
        ...meta,
      },
    }),
  );
}

function readLaunchQueue() {
  try {
    const raw = sessionStorage.getItem(LAUNCH_QUEUE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed
      .filter((item) => item && typeof item.name === 'string' && item.timestamp)
      .filter((item) => now - Number(item.timestamp) <= LAUNCH_QUEUE_TTL_MS);
  } catch (error) {
    console.warn('[Launch queue] Failed to read queue:', error);
    return [];
  }
}

function writeLaunchQueue(queue) {
  try {
    sessionStorage.setItem(LAUNCH_QUEUE_STORAGE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('[Launch queue] Failed to write queue:', error);
  }
}

function enqueueLaunchEvent(name, dataLayerSnapshot) {
  const queue = readLaunchQueue();
  queue.push({
    name,
    dataLayer: dataLayerSnapshot,
    timestamp: Date.now(),
    path: `${window.location.pathname}${window.location.search}`,
  });
  const trimmedQueue = queue.slice(-LAUNCH_QUEUE_MAX_EVENTS);
  writeLaunchQueue(trimmedQueue);
  console.debug('[Launch queue] Queued event:', name, '| queue size:', trimmedQueue.length);
}

export function flushQueuedLaunchEvents() {
  if (!isLaunchReady()) return 0;
  const queue = readLaunchQueue();
  if (!queue.length) return 0;
  writeLaunchQueue([]);
  queue.forEach((item) => {
    emitEvent(item.name, item.dataLayer ?? null, {
      replayed: true,
      originalTimestamp: item.timestamp,
      originalPath: item.path || '',
    });
  });
  console.debug('[Launch queue] Flushed events:', queue.length);
  return queue.length;
}

export function dispatchCustomEvent(eventName, options = {}) {
  const name = eventName && String(eventName).trim();
  if (!name) return false;

  if (name === 'at-view-start' && options.skipAtViewStartDelay !== true) {
    setTimeout(() => {
      dispatchCustomEvent(name, { ...options, skipAtViewStartDelay: true });
    }, AT_VIEW_START_DELAY_MS);
    return false;
  }

  const dataLayerSnapshot = Object.prototype.hasOwnProperty.call(options, 'dataLayerSnapshot')
    ? options.dataLayerSnapshot
    : getDataLayerSnapshot();

  if (!isLaunchReady()) {
    if (options.allowQueue !== false) enqueueLaunchEvent(name, dataLayerSnapshot);
    return false;
  }

  flushQueuedLaunchEvents();
  emitEvent(name, dataLayerSnapshot, { replayed: false });
  return true;
}