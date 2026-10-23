import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

/*
 * The playable demo: a static build with no server, for GitHub Pages or any
 * static host. It shares this folder with the app (so Tailwind sees the same
 * sources) but starts from demo.html, which the build writes out as index.html.
 * Paths are relative, so it works from any address, such as a project's Pages URL.
 *
 *   npm run build:demo     builds web/dist-demo
 *   npm run preview:demo   serves it on port 4174
 */

const demoAsIndex: Plugin = {
  name: 'ludora-demo-index',
  enforce: 'post',
  generateBundle(_options, bundle) {
    const page = bundle['demo.html'];
    if (page) page.fileName = 'index.html';
  },
};

export default defineConfig({
  // The API client refuses to make requests in this mode: the demo has no server to ask.
  mode: 'demo',
  base: './',
  plugins: [react(), tailwindcss(), demoAsIndex],
  build: {
    target: 'es2022',
    outDir: 'dist-demo',
    emptyOutDir: true,
    chunkSizeWarningLimit: 900,
    // Sound files stay files, fetched by the sound engine when needed.
    assetsInlineLimit: (file) => (file.endsWith('.mp3') ? false : undefined),
    rollupOptions: { input: 'demo.html' },
  },
  preview: { port: 4174, strictPort: true },
});
