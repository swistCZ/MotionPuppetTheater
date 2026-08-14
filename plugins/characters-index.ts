import { Plugin } from 'vite';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Auto-generates `characters/index.json` by scanning `public/characters/`
 * for folders that contain a valid `config.json` with an `id`.
 *
 * Dev: intercepts `/characters/index.json` with a live scan, so dropping a
 * new character folder + refreshing the page is enough — no manual registry.
 * Build: emits `characters/index.json` into the dist output.
 */
export function charactersIndexPlugin(): Plugin {
  const charactersDir = path.resolve(process.cwd(), 'public', 'characters');

  function scanCharacterIds(): string[] {
    if (!fs.existsSync(charactersDir)) return [];
    return fs
      .readdirSync(charactersDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => entry.name)
      .filter((name) => {
        try {
          const config = JSON.parse(fs.readFileSync(path.join(charactersDir, name, 'config.json'), 'utf8'));
          return typeof config?.id === 'string' && config.id.length > 0;
        } catch {
          return false;
        }
      })
      .sort();
  }

  return {
    name: 'characters-index',
    configureServer(server) {
      server.middlewares.use('/characters/index.json', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(scanCharacterIds()));
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'characters/index.json',
        source: JSON.stringify(scanCharacterIds()),
      });
    },
  };
}