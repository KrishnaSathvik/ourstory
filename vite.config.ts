/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Content-Security-Policy for production builds.
 *
 * `connect-src 'none'` is the core privacy guarantee: once loaded, the page
 * cannot make fetch/XHR/WebSocket/beacon requests at all, so imported chats
 * physically cannot be uploaded, even by a compromised dependency.
 * The dev server is exempt because HMR needs a websocket.
 */
export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ')

function csp(): Plugin {
  return {
    name: 'duet-csp',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        const tag = ctx.server ? '' : `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        return html.replace('<!--%CSP%-->', tag)
      },
    },
  }
}

export default defineConfig({
  plugins: [react(), csp()],
  worker: { format: 'es' },
  test: { include: ['tests/**/*.test.{ts,tsx}'] },
  build: {
    target: 'es2022',
    // Inline nothing as data: URLs except tiny assets; fonts stay as files.
    assetsInlineLimit: 2048,
    sourcemap: false,
  },
})
