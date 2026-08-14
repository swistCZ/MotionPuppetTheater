import { defineConfig } from 'vite';
import { charactersIndexPlugin } from './plugins/characters-index';

export default defineConfig({
  base: './',
  plugins: [charactersIndexPlugin()],
  server: {
    port: 3000,
    open: true,
    watch: {
      // /mnt/c (WSL drvfs) doesn't emit inotify events reliably — poll instead.
      usePolling: true,
      interval: 300
    }
  }
});
