import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/*
 * The secret chaos menu, built on its own into dist-private/. That folder is
 * never served as static files: the game server reads chaos-menu.js and sends
 * it only to accounts that have lit the lantern (GET /api/lantern/book.js).
 * The public app never imports anything from chaos-menu/.
 */
export default defineConfig({
  plugins: [react()],
  define: { 'process.env.NODE_ENV': JSON.stringify('production') },
  // No public/ files: this folder only ever holds the menu.
  publicDir: false,
  build: {
    target: 'es2022',
    outDir: 'dist-private',
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: { entry: 'chaos-menu/entry.tsx', formats: ['es'], fileName: () => 'chaos-menu.js' },
    rollupOptions: { output: { inlineDynamicImports: true } },
  },
});
