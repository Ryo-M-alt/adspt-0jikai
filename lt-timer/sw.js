// LT会タイマーを、通信なしでも開けるようにする仕組み（Service Worker：ページを端末に保存しておく仕組み）
// - ページ：通信できるときは最新を取り、取れない・遅いときは保存しておいたものを出す（名前やタイトルの直しが届くように）
// - 字体（Google Fonts）：一度取ったものを保存して使う。取れなくても、端末の字体で表示されるだけで動く

const CACHE = 'lt-timer-v1';
const PAGE = './';
const FONT_CSS = 'https://fonts.googleapis.com/css2?family=Zen+Kaku+Gothic+New:wght@500;700&display=swap';
const NETWORK_TIMEOUT_MS = 3000;  // 会場の通信が遅いときは、3秒待って保存しておいたページを出す

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(PAGE);
    try {
      await cache.add(FONT_CSS);
    } catch (e) { /* 字体の指定が取れなくても、ページは保存できているので続ける */ }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 古い版の保存分は消す
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k.startsWith('lt-timer-') && k !== CACHE).map((k) => caches.delete(k)));
    // 最初に開いたページから、すぐにこの仕組みを使う
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (req.mode === 'navigate') {
    // ?t=16:19 のような練習モードの指定があっても、同じページとして保存する
    event.respondWith(networkFirst(req, PAGE));
  } else if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(req, req));
  } else if (url.origin === 'https://fonts.gstatic.com') {
    event.respondWith(cacheFirst(req));
  } else if (url.origin === 'https://fonts.googleapis.com') {
    event.respondWith(staleWhileRevalidate(req));
  }
});

async function networkFirst(req, key) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(key, res.clone());
    return res;
  });
  try {
    return await Promise.race([
      network,
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), NETWORK_TIMEOUT_MS)),
    ]);
  } catch (e) {
    const cached = await cache.match(key, { ignoreSearch: true });
    if (cached) {
      network.catch(() => {});  // 遅れて届いた最新は、次に開いたときに使う
      return cached;
    }
    return network;
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  if (cached) return cached;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(req) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match(req);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  if (cached) {
    network.catch(() => {});
    return cached;
  }
  return network;
}
