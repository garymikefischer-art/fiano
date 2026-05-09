import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

// Phase 9.4.1: shared package liegt in packages/shared/. Beide Aliases bleiben
// erhalten — `@shared/*` (legacy) UND `@fiano/shared/*` (neu für Monorepo).
const SHARED_DIR = resolve(__dirname, 'packages/shared/src');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': SHARED_DIR,
        '@fiano/shared': SHARED_DIR,
        '@core': resolve(__dirname, 'src/main/core'),
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@shared': SHARED_DIR,
        '@fiano/shared': SHARED_DIR,
      },
    },
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer/src'),
        '@shared': SHARED_DIR,
        '@fiano/shared': SHARED_DIR,
      },
    },
    optimizeDeps: {
      // ONNX Runtime Web macht dynamic imports auf .mjs/.wasm aus seinem dist/.
      // Vite's dep-optimizer würde diese Imports rewriten und nach
      // node_modules/.vite/deps/onnx/ schicken (existiert nicht).
      exclude: ['onnxruntime-web'],
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html'),
      },
    },
  },
});
