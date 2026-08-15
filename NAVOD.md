# Návod k obsluze — Motion Puppet Theater

Webová aplikace, která přes webkameru sleduje ruce a ovládá jimi 2D loutky. Tento návod popisuje ovládání, hlavní režim, stop-motion režim, export a tvorbu vlastních loutek.

## 1. Začínáme

1. Otevři aplikaci `index.html` (dev: `npm run dev`, produkce: `npm run build` → `dist/`).
2. Klikni na **Kamera** a povol přístup k webkameře.
3. Zvedni ruku před kameru — dlaň pohybuje loutkou, prsty ovládají jednotlivé části.

Pro dobrou detekci:

- dostatek světla (kamera míří na obličej/ruce, ne proti oknu),
- ruka přiměřeně daleko od kamery (celá dlaň viditelná),
- klidné pozadí.

Nemáš kameru? Klikni na **Simulace** — loutka sleduje myš a paže se hýbou samy (načti přes `?sim=1`).

## 2. Ovládání loutky rukou

| Část ruky | Co ovládá |
| --- | --- |
| Dlaň (střed dlaně) | Pohyb celé loutky |
| Ukazováček | Hlava (nahoru/dolů) a otevírání/zavírání pusy |
| Palec | Levá paže |
| Prostředníček | Pravá paže |
| Prsteník | Levá noha |
| Malíček | Pravá noha |
| Roztažené prsty | Větší rozsah končetin + rozkročení (A-frame) |
| Sevřená pěst | Končetiny přitažené k tělu |
| Náklon dlaně (zápěstí → dlaň) | Jemné naklonění loutky |
| Palec + ukazováček (pinch) | Zavření pusy (u PNG loutek) |

Vzdálenost ruky od kamery se automaticky kompenzuje šířkou dlaně — gesta jsou konzistentní, ať jsi blízko nebo daleko.

## 3. Hlavní lišta

- **Kamera** — spustí / zastaví webkameru.
- **Nahrávat** — nahrává video plátna (60 FPS) včetně theremin zvuku a stáhne soubor (MP4/WebM podle prohlížeče).
- **Debug** — ukáže detekční kostru rukou (skeleton).
- **Pohyb** — zamkne / odemkne loutky (zmrazení pózy).
- **Theremin** — zapne digitální theremin: **levá ruka** řídí výšku tónu, **pravá ruka** hlasitost.
- **Simulace** — test bez kamery (tělo = myš, paže = animace).
- **Builder** — samostatná stránka pro sestavení vlastní vystřihovánkové loutky.
- **Stop-motion** — přepne do stop-motion režimu (viz níže).
- **Nápověda** — otevře manuál přímo v aplikaci.
- **L1 / L2** — výběr loutky pro levou a pravou ruku (Liška, Robot, Prázdné, vlastní rig). **PNG** nahraje vlastní obrázek loutky.
- **Scéna** — barva pozadí; **Pozadí** nahraje vlastní obrázek na pozadí.

### Theremin podrobně

- Levá ruka: svislý pohyb = výška tónu (nahoře vysoko, dole nízko).
- Pravá ruka: svislý pohyb = hlasitost.
- Při nahrávání videa se zvuk thereminu zapíše do stopy.

## 4. Stop-motion režim

Zapni **Stop-motion** — dole se objeví časová osa. Figurky se okamžitě zobrazí na výchozích pozicích (i bez kamery), takže víš, co pózuješ. Dokud neuložíš první snímek, na scéně je nápověda s postupem. Pozadí se v tomto režimu ovládá **jen spodním panelem** (horní skupina „Scéna" se skryje, aby se ovládání nezdvojovalo). Princip: napózuj, ulož snímek, pohnu, ulož další, pak přehraj a exportuj.

> Pozor: vybrané pozadí se promítne až do **nově** uložených snímků — starší snímky si zachovají pozadí, se kterým vznikly.

### Gesta a manipulace

- **Ruka (ZAP)** — tlačítko v panelu. Dokud svítí, ruce loutky ovládají (dlaň = pohyb, prsty = končetiny). **Vypni ho** pro přesné ruční umístění: loutky přestanou sledovat ruce a zůstanou, kam je táhneš myší — vidíš přesně, co se dostane do snímku, a můžeš to před uložením doladit.
- **Pěst** — zamkne aktuální pózu (ruku můžeš odtáhnout, loutka zůstane stát). Uvolnění pěsti pózu odemkne.
- **Prostředníček vztyčený** — přiblíží scénu (zoom až 1,6×, plynulý), pro detailní pózování. Ostatní prsty musí být schoulené.
- **Tažení myší** — klikni a táhni pohyblivé části loutky (paže, nohy, hlava, tělo) pro jemné doladění pózy. Respektuje nastavení „pohyblivá/statická" část z configu loutky.
- **Onion (duch)** — vybraný snímek se průsvitně promítá přes živou scénu, takže přesně vidíš, jak na sebe nová póza navazuje.
- **Mezerník** — uloží aktuální scénu jako snímek (ekvivalent tlačítka Snímek).

### Časová osa

- **Snímek** — uloží aktuální scénu jako PNG.
- **Smazat / Duplikovat** — smaže / zkopíruje vybraný snímek.
- **← →** — přeřadí vybraný snímek doleva/doprava.
- **Zpět / Znovu** — vrací a opakuje úpravy časové osy (až 50 kroků).
- **Vše** — smaže celou časovou osu.
- **Přehrát** — přehraje snímky; **Opakovat** zapne/vypne smyčku; **Zpětně** přehrává od konce do začátku.
- **FPS** — rychlost přehrávání (12 nebo 24).
- **Onion** — průsvitný duch vybraného snímku pod živou scénou (pomáhá navazovat pózy).
- **Duchů** — počet onion duchů (1–3); nejnovější duch je nejvýraznější.
- **Mřížka** — registrační mřížka (čáry každých 96 px + středový kříž) pro zarovnání snímků na sebe.
- **A/B** — přepíná mezi živou scénou a vybraným snímkem (kontrola malých pohybů mezi snímky).

### Pozadí a rekvizity

- **Zelená** — vyplní scénu klíčovací zelenou (`#00B140`) pro chroma key kompozici do jiné scény/videa.
- **Barva** — výběr vlastní barvy pozadí.
- **Pruh** — nahraje **vzdálený** pás pozadí (TilingSprite). Okno pásu posouvá **posuvník**, nebo se auto-posouvá o **Krok** px po každém uloženém snímku.
- **Pruh 2** — nahraje **blízký** pás, který se posouvá rychleji — vzniká iluze hloubky (paralaxa).
- **Paralaxa** — poměr rychlosti blízkého pásu vůči vzdálenému (default 1,6×; rozsah 1–5).
- **Výchozí** — vrátí základní pozadí.
- **Listí** — zapne řetěz listí (prop) sledující ruku (verlet fyzika — setrvačnost + gravitace, listy se třepotají).

## 5. Export animace

- **WebM** — video z časové osy (MediaRecorder). Když je zapnutý **Theremin**, mixuje se do videa jako zvuk.
- **GIF** — animovaný obrázek (256 barev, šířka max 1280 px, zpoždění podle FPS).
- **PNG (ZIP)** — stáhne všechny snímky v původním rozlišení v ZIP archivu.

Export probíhá v prohlížeči (žádný server) — data neodcházejí z počítače.

## 6. Vlastní loutky (Builder)

Na stránce `builder.html` (odkaz **Builder** v hlavní liště):

1. Nahraj až 6 částí: **tělo** (povinné), **hlavu**, **levou/pravou paži**, **levou/pravou nohu**.
2. Automaticky se odhadnou klouby (ramena, krk, kyčle) — klikáním je ručně uprav na náhledech.
3. Pro každou část nastav **Pohyblivá / Statická** (statické části se při ovládání nehýbou).
4. Zkontroluj rozsah pohybu a klidovou polohu.
5. Ulož:
   - **Uložit do prohlížeče** — loutka se objeví v seznamu L1/L2 (jen v tomto prohlížeči, localStorage), nebo
   - **Stáhnout config.json** — soubor s obrázky vloženými jako data URL; dá se sdílet nebo vložit do `public/characters/<id>/` pro sdílený seznam na webu.

### Formát rig loutky

Config JSON popisuje 6 částí (`body`, `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg`), pozice kloubů (`shoulderL/R`, `neck`, `hipL/R`), klidové úhly (`restAngle`, `restHandAngle`), rozsah pohybu a flag `movable`. Ověřuje ho `validateRigConfig` (unit testy v `src/rig.test.ts`).

## 7. Klávesové zkratky

| Klávesa | Funkce |
| --- | --- |
| `Mezerník` | Uložit snímek (stop-motion režim) |
| `Esc` | Zavřít nápovědu |

## 8. Řešení problémů

- **Kamera se nespustí** — povol oprávnění v prohlížeči; aplikace sama zkouší více zdrojů MediaPipe (lokálně zabalený WASM). Nefunguje-li, použij **Simulaci**.
- **Loutka „poskakuje" / hází rukama** — doporučená vzdálenost ruky, více světla, klidné pozadí.
- **Pruh pozadí se neposouvá** — posuvník je aktivní až po nahrání pruhu; auto-posuv vyžaduje **Krok > 0**.
- **GIF je velký** — používá 256 barev; pro menší soubor sniž počet snímků nebo FPS.
- **WebM export nedostupný** — prohlížeč nepodporuje `captureStream()`/MediaRecorder (zkus Chrome/Edge).

## 9. Vývojáři

- **Build:** `npm run build` (tsc + Vite), testy: `npm test` (Vitest), dev server: `npm run dev` (port 3000).
- **Architektura:** `tracker.ts` (kamera + MediaPipe), `gestures.ts` (matematika, gesta — čisté funkce, unit testy), `renderer.ts` (Pixi.js scéna), `rig.ts` + `rigAssets.ts` (vystřihovánkové loutky), `simulator.ts` (simulace bez kamery), `theremin.ts` (zvuk), `recorder.ts` (nahrávání), `stopMotion.ts` (časová osa + export), `chainProp.ts` (řetěz listí), `builder.ts` (tvorba loutek).
- **Roadmapa a stav:** `PROJECT_STATE.md`.