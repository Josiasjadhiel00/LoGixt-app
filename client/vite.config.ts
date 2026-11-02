import { createHash } from 'node:crypto';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

function offlineShellPlugin(): Plugin {
  return {
    name: 'logixt-offline-shell',
    apply: 'build',
    generateBundle(_, bundle) {
      const emittedAssets = Object.keys(bundle).filter((fileName) => {
        const output = bundle[fileName];
        return output.type === 'chunk' ||
          fileName === 'index.html' ||
          (output.type === 'asset' && /\.(css|svg|png|jpe?g|webp|woff2?)$/i.test(fileName));
      });
      const precacheUrls = [
        '/',
        '/index.html',
        '/manifest.webmanifest',
        '/logo.jpg',
        '/warehouse_bg.jpg',
        '/favicon.svg',
        ...emittedAssets.map((fileName) => `/${fileName}`)
      ];
      const bundleContents = Object.keys(bundle).sort().map((fileName) => {
        const output = bundle[fileName];
        const content = output.type === 'chunk'
          ? output.code
          : typeof output.source === 'string'
            ? output.source
            : Buffer.from(output.source).toString('base64');
        return `${fileName}:${content}`;
      });
      const version = createHash('sha256')
        .update([...precacheUrls, ...bundleContents].join('\n'))
        .digest('hex')
        .slice(0, 12);
      const source = `
const CACHE_NAME = 'logixt-shell-${version}';
const PRECACHE_URLS = ${JSON.stringify([...new Set(precacheUrls)])};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((key) => key.startsWith('logixt-shell-') && key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/')) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match('/index.html'))
    );
    return;
  }

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(url.pathname);
    if (cached) return cached;

    const response = await fetch(request);
    if (response.ok && url.pathname.startsWith('/assets/')) {
      await cache.put(request, response.clone());
    }
    return response;
  })());
});
`;
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    }
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), offlineShellPlugin()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:5000',
        changeOrigin: true,
        secure: false,
      }
    }
  }
});
