# Návod k obsluze — Motion Puppet Theater

Webová aplikace, která přes webkameru sleduje ruce a ovládá jimi 2D loutky. Tento návod popisuje ovládání, hlavní režim, stop-motion režim (včetně více loutek a záběrového rámečku), export a tvorbu vlastních loutek.

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
- **Tažení myší** — klikni a táhni pohyblivé části loutky (tělo = přesun figurky, hlava, paže, nohy = jejich natočení/pozice). Funguje pro **všechny** loutky (liška, robot i rig z builderu) přímo v stop-motion režimu — není potřeba kamera ani gesta. Snímek pak vidíš přesně tak, jak bude uložen.
- **Onion (duch)** — vybraný snímek se průsvitně promítá přes živou scénu, takže přesně vidíš, jak na sebe nová póza navazuje.
- **Mezerník** — uloží aktuální scénu jako snímek (ekvivalent tlačítka Snímek).

### Více loutek na scéně (Správa loutek)

L1 a L2 jsou loutky ovládané rukama (MediaPipe sleduje max. 2 ruce). K nim můžeš přidat **libovolný počet statických loutek** — hodí se pro scény s více postavami a rekvizitami.

1. Vypni **Ruka** — vpravo nahoře se objeví plovoucí okno **Správa loutek**.
2. **Přidat loutku** — v paletě klikni na postavu (přidá se do středu) nebo ji **přetáhni na scénu** na přesné místo. Paleta obsahuje Lišku, Robota, postavy z builderu i uložené v prohlížeči.
3. **Loutky na scéně** — seznam vrstev: nahoře = vepředu. Klik = výběr (loutka se zvýrazní **zlatým kroužkem** kolem středu), přetažení = změna pořadí vrstev.
4. Vybranou loutku **Smazat** nebo **Duplikovat** (tlačítka pod seznamem; při sbaleném okně v liště s počtem loutek).
5. Okno je **pohyblivé** (tahej za hlavičku), lze ho **sbalit** na tenký proužek a přichytit k okraji. Kliknutí na loutku na scéně ji vždy vybere.
6. Přidané loutky se pózují myší stejně jako L1/L2 (tělo = přesun, končetiny = natočení) a **ukládají se do snímků** i do projektu.

### Časová osa

- **Snímek** — uloží aktuální scénu (obrázek i přesnou pózu loutek a pozadí).
- **Načíst pózu** (nebo dvojklik na snímek) — aktivuje vybraný snímek a načte jeho pózu i pozadí zpět na scénu k dalším úpravám.
- **Přepsat** — přefotí vybraný snímek aktuální scénou (aktualizuje náhled i uloženou pózu).
- **Smazat / Duplikovat** — smaže / zkopíruje vybraný snímek.
- **Přetahování myší (Drag & Drop)** — chytni náhled snímku myší a přetáhni ho kamkoliv v časové ose.
- **← →** — přeřadí vybraný snímek doleva/doprava o jednu pozici.
- **Zpět / Vpřed** — vrací a obnovuje úpravy časové osy (až 50 kroků).
- **Smazat vše** — smaže celou časovou osu (s potvrzením; lze vrátit Zpět).
- **Uložit projekt** — stáhne soubor `.mpt` (JSON) se všemi snímky, pózami a pozadím.
- **Otevřít projekt** — načte dříve uložený `.mpt` projekt a můžeš pokračovat v rozpracované animaci.
- **Přehrát** — přehraje snímky; **Smyčka** zapne/vypne opakování; **Pozpátku** hraje od posledního snímku k prvnímu.
- **FPS** — rychlost přehrávání (12 nebo 24).
- **Onion** — průsvitný duch vybraného snímku pod živou scénou (pomáhá navazovat pózy).
- **Duchů** — počet onion duchů (1–3); nejnovější duch je nejvýraznější.
- **Mřížka** — registrační mřížka (čáry každých 96 px + středový kříž) pro zarovnání snímků na sebe.
- **A/B** — přepíná mezi živou scénou a vybraným snímkem (kontrola malých pohybů mezi snímky).

### Pozadí a rekvizity

- **Zelená** — vyplní scénu klíčovací zelenou (`#00B140`) pro chroma key kompozici do jiné scény/videa.
- **Barva** — výběr vlastní barvy pozadí.
- **Pruh** — nahraje velké pozadí (TilingSprite). Okno posouváš posuvníky **X** a **Y** (i svisle u 3×3 scény), nebo auto-posunem **Krok X/Y** po každém snímku.
- **Kolečko myši** nad zeleným kroužkem končetiny = jemné otočení; nad hlavou = jemný posun nahoru/dolů.
- Časová osa ukazuje **všechny** náhledy (větší, ~160×112 px; proužek se posouvá šipkami ‹ › nebo tažením). Počítadlo `n/total`.
- **Pruh 2** — nahraje **blízký** pás, který se posouvá rychleji — vzniká iluze hloubky (paralaxa).
- **Paralaxa** — poměr rychlosti blízkého pásu vůči vzdálenému (default 1,6×; rozsah 1–5).
- **Výchozí** — vrátí základní pozadí.
- **Listí** — zapne řetěz listí (prop) sledující ruku (verlet fyzika — setrvačnost + gravitace, listy se třepotají).

### Záběr (výřez exportu)

- **Záběr** — zapne/vypne záběrový rámeček na scéně. Vymezuje výřez, který se **ukládá při exportu** (WebM, GIF i PNG ZIP) — export má přesně rozměry a poměr rámečku.
- **Poměr** — předvolby stran: **Volný, 1:1, 4:3, 3:2, 16:9, 21:9, 9:16**. Se zvoleným poměrem drží rámeček aspekt při změně velikosti; **Volný** umožní vlastní poměr tažením.
- **Ovládání rámečku:** tažením za **hranu** rámeček posuneš, tažením za **roh** (nebo úchyt uprostřed hrany) ho zvětšíš/zmenšíš. Uvnitř rámečku se loutky pózují normálně (rámeček je průhledný pro klikání).
- Kolem rámečku se scéna ztlumí a uvnitř jsou vidět vodítka pravidla třetin + štítek s poměrem a rozměry.

## 5. Export animace

- **WebM** — video z časové osy (MediaRecorder). Když je zapnutý **Theremin**, mixuje se do videa jako zvuk.
- **GIF** — animovaný obrázek (256 barev, šířka max 1280 px, zpoždění podle FPS).
- **PNG (ZIP)** — stáhne všechny snímky v původním rozlišení v ZIP archivu.
- Je-li zapnutý **Záběr** (viz výše), všechny exporty jsou **oříznuté na rámeček**.

Export probíhá v prohlížeči (žádný server) — data neodcházejí z počítače.

## 6. Vlastní loutky (Builder)

Na stránce `builder.html` (odkaz **Builder** v hlavní liště):

1. Nahraj až 10 částí: **tělo** (povinné), **hlavu**, **levou/pravou paži** (+ volitelné **předloktí**), **levou/pravou nohu** (+ volitelné **holeň**). Předloktí/holeň umožňují ohyb v lokti/koleni (dvoukostní IK).
2. Automaticky se odhadnou klouby (ramena, krk, kyčle, lokty/kolena) — klikáním je ručně uprav na náhledech.
3. Pro každou končetinu nastav **Pohyblivá / Statická** (statické části se při ovládání nehýbou). Předloktí/holeň se ohýbají automaticky podle horní části.
4. Zkontroluj rozsah pohybu a klidovou polohu.
5. Ulož:
   - **Uložit do prohlížeče** — loutka se objeví v seznamu L1/L2 i v paletě „Správa loutek" (jen v tomto prohlížeči, localStorage), nebo
   - **Stáhnout config.json** — soubor s obrázky vloženými jako data URL; dá se sdílet nebo vložit do `public/characters/<id>/` pro sdílený seznam na webu.

### Formát rig loutky

Config JSON popisuje části (`body`, `head`, `leftArm`, `rightArm`, `leftLeg`, `rightLeg` + volitelně `leftForearm`, `rightForearm`, `leftShin`, `rightShin`), pozice kloubů (`shoulderL/R`, `neck`, `hipL/R`), body `attach` (loket/koleno) a pivoty spodních částí, klidové úhly (`restAngle`, `restHandAngle`), rozsah pohybu a flag `movable`. Ověřuje ho `validateRigConfig` (unit testy v `src/rig.test.ts`).

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
- **Architektura:** `tracker.ts` (kamera + MediaPipe), `gestures.ts` (matematika, gesta — čisté funkce, unit testy), `renderer.ts` (Pixi.js scéna, vč. multi-puppet a výběrového kroužku), `rig.ts` + `rigAssets.ts` (vystřihovánkové loutky, dvoukostní IK), `snapshot.ts` (migrace póz projektu), `simulator.ts` (simulace bez kamery), `theremin.ts` (zvuk), `recorder.ts` (nahrávání), `stopMotion.ts` (časová osa, „Správa loutek", „Záběr" + export), `chainProp.ts` (řetěz listí), `builder.ts` (tvorba loutek).
- **Roadmapa a stav:** `PROJECT_STATE.md`.