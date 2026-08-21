# AGENTS.md

Pravidla a konvence pro práci v tomto repozitáři.

# ⛔ NEJDŮLEŽITĚJŠÍ PRAVIDLO — TESTY V PROHLÍŽEČI NIKDY NEOTEVÍRAJÍ OKNA

Uživatel si opakovaně (již mnohokrát) stěžuje na otevírající se okna/záložky prohlížeče
při testování. **TOTO JE ABSOLUTNÍ, NEPORUŠITELNÉ PRAVIDLO.** Žádný prohlížeč se nesmí
otevřít viditelně. Při každém spuštění jakéhokoliv testu, který používá Chromium/Edge,
dodržuj tyto tvrdé požadavky:

- **VŽDY** `headless: true` **A** `args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']`.
  Obě zároveň. Nikdy jedno bez druhého, nikdy headed režim.
- **ZAKÁZÁNO** psát ad-hoc `chromium.launch(...)` inline (např. `node -e "..."` nebo
  jednorázový debug skript) bez headless argumentů. Každý debug/ověřovací skript MUSÍ
  být uložen do `/tmp/opencode/playwright/<test>.mjs` a spuštěn na pozadí s logem do souboru
  (viz šablona níže). Kopíruj z existujících testů v `/tmp/opencode/playwright/` — ty už
  headless argumenty mají; nikdy je nepřepisuj na headed.
- **VŽDY** spouštěj test na pozadí přes `nohup ... &`, výstup piš do logu a vyčti z něj.
  Nikdy nespouštěj test synchronně na popředí.

Povinná šablona (kopíruj odtud, NEVYMYŠLEJ vlastní):
```
cd /tmp/opencode/playwright
(LD_LIBRARY_PATH=/tmp/opencode/apt/root/usr/lib/x86_64-linux-gnu nohup node <test>.mjs > <test>.log 2>&1 &)
sleep 20 && cat <test>.log
```
A uvnitř testu:
```js
const browser = await chromium.launch({ headless: true, args: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'] });
```
- Vite preview server (jako subprocess) je v pořádku — nezobrazuje okna.
  **ALE:** `vite.config.ts` má `server.open: true`; Vite 6 ho zdědí i pro `preview`
  (`open: preview?.open ?? server.open`). Proto je v configu explicitně
  `preview.open: false` — **nikdy to neměň**. Při spouštění preview vždy ověř,
  že se neotevřel prohlížeč.
- **PO** každém testu vždy ověř, že nezůstal žádný proces prohlížeče:
  `ps -eo pid,cmd | grep -i chrom | grep -v grep` (výstup musí být prázdný).
- Pokud si nejsi jistý, že skript je bezpečně headless, raději ho NESPOUŠTĚJ a zeptej se.

## Ověřování změn (vždy)
1. `npx tsc --noEmit`
2. `npx vitest run`
3. `npm run build`
4. Headless ověření (viz pravidlo výše), pokud se změna týká rendereru / rigu / builderu.

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