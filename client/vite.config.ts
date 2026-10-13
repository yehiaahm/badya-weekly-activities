import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const clientDir = fileURLToPath(new URL('.', import.meta.url));
const apiTarget = process.env.API_URL ?? `http://127.0.0.1:${process.env.API_PORT ?? 4000}`;

export default defineConfig({
  root: clientDir,
  plugins: [react()],
  resolve: {
    alias: { '@shared': fileURLToPath(new URL('../shared', import.meta.url)) },
  },
  server: {
    port: 5173,
    proxy: { '/api': { target: apiTarget } },
  },
  preview: {
    port: 4173,
    proxy: { '/api': { target: apiTarget } },
  },
  build: {
    outDir: fileURLToPath(new URL('../dist/client', import.meta.url)),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        // Framework code changes rarely: separate chunks stay cached across app releases.
        codeSplitting: {
          groups: [
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler|react-router|cookie|set-cookie-parser)[\\/]/, priority: 2 },
            { name: 'libs', test: /node_modules[\\/](@tanstack|zod)[\\/]/, priority: 1 },
          ],
        },
      },
    },
  },
});
