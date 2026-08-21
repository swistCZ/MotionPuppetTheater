import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { charactersIndexPlugin } from './plugins/characters-index';

export default defineConfig({
  base: './',
  plugins: [charactersIndexPlugin()],
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        builder: resolve(__dirname, 'builder.html')
      }
    }
  },
  server: {
    port: 3000,
    open: true,
    watch: {
      // /mnt/c (WSL drvfs) doesn't emit inotify events reliably — poll instead.
      usePolling: true,
      interval: 300
    }
  },
  // NEVER auto-open a browser for the preview server: headless tests and any
  // `vite preview` call must not spawn tabs/windows (WSL would open them in the
  // Windows browser). Vite 6 would otherwise inherit `server.open`.
  preview: {
    open: false
  }
});
