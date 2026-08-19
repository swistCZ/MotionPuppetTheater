# AGENTS.md

Pravidla a konvence pro práci v tomto repozitáři.

## Ověřování změn (vždy)
1. `npx tsc --noEmit`
2. `npx vitest run`
3. `npm run build`
4. Headless ověření (viz níže), pokud se změna týká rendereru / rigu / builderu.

## KRITICKÉ: testování v prohlížeči — ŽÁDNÁ OKNA
Uživatel si opakovaně stěžuje na otevírající se okna prohlížeče. PŘÍSNĚ dodržuj:

- **Nikdy** nespouštěj Chromium/Edge v headed režimu. Vždy `headless: true` a navíc
  `args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']`.
- Playwright testy spouštěj **na pozadí** s logem do souboru a výsledek vyčti z logu:
  ```
  cd /tmp/opencode/playwright
  (LD_LIBRARY_PATH=/tmp/opencode/apt/root/usr/lib/x86_64-linux-gnu nohup node <test>.mjs > <test>.log 2>&1 &)
  sleep 20 && cat <test>.log
  ```
- Vite preview server (jako subprocess) je v pořádku — nezobrazuje okna.
- Po testu zkontroluj, že nezůstal žádný proces: `ps -eo pid,cmd | grep -i chrom | grep -v grep`.

### Headless harness
- Sada testů: `/tmp/opencode/playwright/` (mimo repo).
- `splitik.mjs` — dvoukostní IK (rig:demo): geometrie, phi=π/2, ohyb lokte/kolena, snapshots.
- `builder2.mjs` — builder: módy Loket/Předloktí/Koleno/Holeň, auto-defaulty, click-to-place, validace exportu.
- Debug hook `window.__mptDebug` (renderer) je definován v `src/main.ts` v `init()` — slouží headless testům.
- Port pro preview vybírej náhodně z `4700–4799` — pevné porty jako 4190 jsou na tomto WSL
  stroji v konfliktu s Windows port-forwardingem (fetch selhává i když server běží).

### Pitfalls shellu
- Nepoužívej `pkill -f` s vzorem, který se shoduje s vlastním příkazovým řádkem shellu
  (např. `pkill -f chromium`) — zabije to vlastní shell a příkaz „visí". Raději
  `ps -eo pid,cmd | grep ...` a `kill <pid>`.

## Stack
- Vite + TypeScript, Pixi.js v8, MediaPipe (Hands), jest/vitest (`npx vitest run`).
- Builder: `public/builder.html` + `src/builder.ts` (používá stejné `src/rig*.ts`).
- Když měníš demo character, aktualizuj i `public/characters/demo/config.json`.

## Commit konvence
- Commit/push jen na výslovný pokyn uživatele.
- Zprávy: `feat(scope): …` / `fix(scope): …` / `docs: …` (viz `git log` pro styl).