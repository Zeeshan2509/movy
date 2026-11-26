import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    clearScreen: false,
    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || '.', '.'),
      },
    },
    server: {
      port: 3000,
      strictPort: true,
      host: host || '0.0.0.0',
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true'
        ? host
          ? {protocol: 'ws', host, port: 1421}
          : true
        : false,
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
