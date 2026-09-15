import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    build: {
      // React in its own chunk: it changes only when we upgrade it, so a game
      // update does not make every phone re-download the framework.
      rollupOptions: {
        output: {
          manualChunks(id: string) {
            // Matched by path so react-dom/client and scheduler land here too.
            if (/node_modules[\\/](react|react-dom|scheduler)[\\/]/.test(id)) return 'react';
            return undefined;
          },
        },
      },
      // scripts/budget.mjs is the real limit; this only quiets the generic warning.
      chunkSizeWarningLimit: 600,
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    preview: {
      // `vite preview` only. A private preview reached through a proxy (for
      // example a tailnet-only HTTPS name) sends that name as the Host, which
      // Vite refuses unless listed. Comma-separated; unset = localhost only.
      allowedHosts: process.env.WWR_PREVIEW_HOSTS ? process.env.WWR_PREVIEW_HOSTS.split(',').map((h) => h.trim()) : [],
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
