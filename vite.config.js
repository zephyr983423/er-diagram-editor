import { defineConfig } from 'vite';

const base = process.env.ER_DIAGRAM_BASE_PATH || '/er-diagram-editor/';

export default defineConfig({
  base,
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
  },
});
