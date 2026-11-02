/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // A relative base lets the built app run from any folder or static host.
  base: './',
  // In development the Worker runs under wrangler dev on 8789. Forwarding its routes keeps the tab and the MCP on one origin.
  server: {
    port: 5174,
    proxy: { '/mcp': 'http://127.0.0.1:8789', '/session': { target: 'http://127.0.0.1:8789', ws: true } },
  },
  test: { environment: 'node' },
});
