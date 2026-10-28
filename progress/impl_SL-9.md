# impl SL-9 — Capturas e iconos de la PWA con la marca nueva

## T1 — Línea base

Medido el 2026-10-28 en el worktree `.worktrees/SL-9-marca-pwa-capturas-iconos`, rama
`feature/SL-9-marca-pwa-capturas-iconos` (HEAD `d730065`), sin tocar código, tests ni `public/`.

Archivos creados: `progress/impl_SL-9.md` (este). Fuera de git (`_trabajo/` está en
`.gitignore`): `_trabajo/SL-9-antes-guardias.log`, `_trabajo/SL-9-antes-kpis.log`,
`_trabajo/medir-marca-SL-9.mjs`.

### Rojos de partida

`pnpm run test:guardias` → `_trabajo/SL-9-antes-guardias.log`, `EXIT=1`:

```
 Test Files  1 failed | 313 passed | 2 skipped (316)
      Tests  4 failed | 4384 passed | 20 skipped (4408)
```

| Archivo rojo | Casos rojos | ¿En `tests/baseline-rojos.json`? |
|---|---|---|
| `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` | 4 (R2, R6, R2/R6, R4 de la guardia 420) | Sí (desde 2026-10-21, la retira SL-29) |

No hay rojos de partida fuera de la baseline.

`pnpm exec vitest related --run "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx"` →
`_trabajo/SL-9-antes-kpis.log`, `EXIT=0`:

```
 Test Files  2 passed (2)
      Tests  31 passed (31)
```

### Huellas de la marca anterior (SHA-256, tal como están en `dev`)

`git diff dev -- public/screenshots` vacío (`git diff dev --quiet` sale con 0).

| Archivo | SHA-256 |
|---|---|
| `public/screenshots/inicio-narrow.png` | `aa0f6826301706c9059611da3f80358ee0d100f7c858a5b4994a20c40c81f2bb` |
| `public/screenshots/ingreso-narrow.png` | `79cba346f3ac7fd8f93846af85d5460c76e66957f3910e4e8bc6719419d0a0e9` |
| `public/screenshots/inicio-wide.png` | `4ca3d4adfd3ac62d51b76a79a6ea7dd6b1ca2cb6a89be7e74acbfd7c3b7cfc0a` |

### Fracciones de píxeles (D2: distancia euclídea RGB <= 24, `sharp` `.removeAlpha().raw()`)

| Captura | Tamaño | Marca anterior (naranja + navy) | Marca nueva (negro + amarillo) | naranja `#f26419` | navy `#0b2545` | negro `#111111` | amarillo `#FFD000` |
|---|---|---|---|---|---|---|---|
| `inicio-narrow.png` | 540x1170 | 78.323 % | 0.000 % | 0.159 % | 78.164 % | 0.000 % | 0.000 % |
| `ingreso-narrow.png` | 540x1170 | 2.283 % | 0.000 % | 2.116 % | 0.167 % | 0.000 % | 0.000 % |
| `inicio-wide.png` | 1280x720 | 81.199 % | 0.000 % | 0.144 % | 81.055 % | 0.000 % | 0.000 % |

Lectura: con los umbrales de partida de D2 (anterior < 0.5 %, nueva >= 1 %) las tres capturas
viejas dan rojo por los dos lados, así que la guardia muerde. La captura con menos marca anterior es
`ingreso-narrow.png` (2.283 %); el umbral de "anterior" se fija entre esa cifra y la que mida T4.

### Comando de medición (reutilizable en T4)

```
node _trabajo/medir-marca-SL-9.mjs public/screenshots/inicio-narrow.png public/screenshots/ingreso-narrow.png public/screenshots/inicio-wide.png
```

Acepta una o más rutas de PNG como argumentos e imprime, por captura, la suma de cada marca y las
cuatro fracciones por color.

Veredicto T1: línea base tomada; único rojo de partida ya en la baseline, huellas y fracciones
anotadas.

## T2 — Script de capturas

Archivos: `scripts/capturas-pwa.mjs` (nuevo), `tests/unit/pwa/capturas-pwa.test.ts` (nuevo).

- `pnpm exec vitest related --run scripts/capturas-pwa.mjs tests/unit/pwa/capturas-pwa.test.ts`: 1 archivo, 21/21 verdes.
- Muerde: copia en `_trabajo/muerde-T2/` con la entrada `inicio-wide.png` borrada de `PANTALLA_POR_CAPTURA` → 7 rojos, entre ellos los dos casos de R6. El original vuelve a dar 21/21.
- R8 a mano (`:3000` ocupado por otro proceso, se usó `:3099` libre):

```
$ CAPTURAS_URL=http://localhost:3099 node scripts/capturas-pwa.mjs; echo EXIT=$?
La app no responde en http://localhost:3099: arráncala con pnpm build && pnpm start
  (ECONNREFUSED)
EXIT=1
```

- R7 a mano: `CAPTURAS_URL=https://example.com` → mensaje de host no local y `EXIT=1`. `public/screenshots` sin cambios tras ambas corridas.
- Añadidos sobre D1: `planDeCapturas` lanza también con `sizes` mal formado o `form_factor` distinto de `narrow`/`wide`; `urlBaseLocal` lanza con URL inválida o no http(s); R8 imprime la causa debajo.
- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192`) 0; eslint sobre los dos archivos 0 avisos. LF; `grep -il ordenex` vacío.

## T3 — `KpisMensajero`

Archivos: `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx` (modificado), `tests/components/KpisMensajero.test.tsx` (nuevo).

- `pnpm exec vitest related --run "app/(app)/mis-asignaciones/_components/KpisMensajero.tsx" tests/components/KpisMensajero.test.tsx`: 3 archivos, 36/36 verdes (`KpisMensajero.test.tsx` 5/5, `textos-estado-455.test.tsx` 15/15 sin tocarlo, `MisAsignacionesPage.test.tsx` 16/16).
- Muerde: con `before:from-purple-200` repuesto en el componente → R14 rojo (`expected 'group/card …' not to contain 'purple-'`), 4 verdes. Restaurado y verificado por sha1.
- Typecheck 0; `pnpm run lint` 0 errores (231 avisos ajenos, 0 en estos archivos). LF; `grep -il ordenex` vacío.

## T4 — BLOQUEADA (2026-10-28)

- `pnpm build` sin `.env` (con `.next` borrado) falla en `prisma generate`:
  `PrismaConfigEnvError: Cannot resolve environment variable: DATABASE_URL.` (log fuera de git:
  `_trabajo/SL-9-T4-build.log`).
- `../../.env` no se copió. Su `DATABASE_URL` apunta a un Postgres local, pero
  `SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_URL` apuntan a un proyecto (`scfnwxqbsgkzwsdntdvd`) que no
  sale en el repo. Sin la memoria del leader no se puede confirmar que no sea de la app de origen
  (`docs/perfil-agentes.md > Todos los agentes`).
- Correr `pnpm build` solo con la `DATABASE_URL` local: el clasificador de permisos lo denegó
  («Production Deploy»; el script `build` encadena `migrate-deploy.ts` y `demo-qa.ts --build`). No
  se intentó esquivar.
- Sin cambios: `tests/unit/pwa/manifest.test.ts` y `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
  → 2 archivos, 32/32 verdes.
- Para seguir hace falta una de estas dos cosas:
  (a) que el humano permita `pnpm build` con `DATABASE_URL` local, o
  (b) que el leader confirme que el proyecto Supabase del `.env` es de servi_logistic.
  Otra vía que D1 admite, pendiente de decisión: `pnpm dev`.
- T5 (umbrales y huellas), T6 y T7 dependen de T4 y no se empezaron.

### T4 — Desbloqueo (decisión del humano, 2026-10-28, vía leader)

La app se levanta con `pnpm dev` en el puerto 3044, NO con `pnpm build`. Al proceso solo se le pasa
la `DATABASE_URL` del Postgres local como variable de entorno. `../../.env` no se copia y su
Supabase no se usa. Si `pnpm dev` exige otra variable para `/` y `/login` sin sesión, se para. El
indicador de desarrollo de Next se oculta con el selector del script (`nextjs-portal`, D1 paso 4),
sin tocar la config del proyecto. Al acabar se apaga el `pnpm dev`.

### T4 — Arreglo del script (bug de T2)

La primera corrida con `pnpm dev` se colgó: el script esperaba `loadend` en los `<img>` (evento que
un `<img>` no emite) y dos imágenes `loading="lazy"` fuera de pantalla (`/landing/logistica.jpg`,
`/landing/mensajera.jpg`) nunca cargaban. Se arregló en `scripts/capturas-pwa.mjs`, fiel a D1
(«todas las `img` `complete`»):
- todas las `img` pasan a `loading="eager"`;
- se espera `load` o `error`;
- se añade un tope con la función pura `conTope(promesa, ms, motivo)` y `TOPE_ESPERA_MS = 30000`. Si
  vence, la pantalla falla con su motivo, el script sale con código 1 y no escribe ninguna captura
  (todo o nada).

`tests/unit/pwa/capturas-pwa.test.ts` suma 3 casos de `conTope` y queda en 24/24 verdes; eslint de
los dos archivos da 0.

### T4 — Corrida (`pnpm dev -p 3044`, solo `DATABASE_URL` local)

`pnpm dev` no pidió ninguna otra variable. `/` y `/login` dieron 200.

```
$ timeout 300 env CAPTURAS_URL=http://localhost:3044 node scripts/capturas-pwa.mjs; echo EXIT=$?
Generada /screenshots/inicio-narrow.png desde / (540x1170)
Generada /screenshots/ingreso-narrow.png desde /login (540x1170)
Generada /screenshots/inicio-wide.png desde / (1280x720)
EXIT=0
```

Lo que se vio:
- **inicio-narrow:** monograma «S/» blanco sobre la barra negra, «Ingresar» amarillo, Archivo
  cargada, héroe con «rápidos» en amarillo. Sin naranja. El título «Todo lo que necesitas para
  enviar…» sale en **navy**. Sin indicador de Next, sin aviso de cookies, sin error.
- **ingreso-narrow:** «SERVI // LOGISTIC» negro y amarillo, Archivo, tarjeta «Iniciar sesión» con
  botón negro. Sin naranja ni navy. Sin indicador, sin aviso, sin error.
- **inicio-wide:** «SERVI // LOGISTIC» amarillo sobre negro, Archivo. El mismo título de servicios
  en **navy**. Sin naranja. Sin indicador, sin aviso, sin error.

SHA-256 nuevos:
- inicio-narrow `2452d0280ed0e74157e37432c0fcffd36f23d65e7bf0b5abaa2a767a623f42cb`
- ingreso-narrow `e357545c3fa624e10e558f80e0375abb3369fe9f8a5bfe24bd7b02b6fa3c0dad`
- inicio-wide `01c048093a2a554f07e1bd419af86c6797d9fe637e8cc6dd6cf50dc6bda1e3cf`

| Captura | Anterior T1 | Anterior T4 | Naranja | Navy | Nueva T1 | Nueva T4 | Negro | Amarillo |
|---|---|---|---|---|---|---|---|---|
| inicio-narrow | 78.323 % | **1.289 %** | 0.000 % | 1.289 % | 0 % | 18.509 % | 16.825 % | 1.684 % |
| ingreso-narrow | 2.283 % | 0.015 % | 0.000 % | 0.015 % | 0 % | 4.197 % | 4.063 % | 0.134 % |
| inicio-wide | 81.199 % | **0.836 %** | 0.000 % | 0.836 % | 0 % | 23.020 % | 21.877 % | 1.143 % |

`manifest.test.ts` y `pwa-manifiesto-atajos.guardia.test.ts` siguen en 32/32 verdes. El
`pnpm dev` quedó apagado (árbol entero, el 3044 libre); el proceso del 3000 no se tocó.

### T4 — PARADA por D2 (2026-10-28)

- **Marca nueva:** el umbral ≥ 1 % tiene hueco de sobra (0 % antes; 4.2–23 % ahora).
- **Marca anterior:** el umbral propuesto < 0.5 % NO se cumple en `inicio-narrow` (1.289 %) ni en
  `inicio-wide` (0.836 %).
- **Hueco:** el mínimo de las viejas es 2.283 % (`ingreso-narrow`) y el máximo de las nuevas, 1.289 %.
  Un umbral entre los dos tendría muy poco margen.
- **Causa:** el `<h2>` de servicios de la landing, `TituloSeccion` (`app/_landing/primitivas.tsx:80`),
  usa `text-asfalto-9`. En `app/globals.css:188`, `--color-asfalto-9` vale `#0d2444`, a distancia
  RGB ≤ 24 del navy anterior `#0b2545`. Es un color de la marca anterior que sigue vivo en la landing.
- **Por qué no se sigue:** `asfalto-*` es alcance de SL-33, no de SL-9 (`design.md > Lo que ya existe`).
  D2 manda parar en vez de aflojar el umbral.
- **Opciones para el leader o el humano:**
  - (a) Corregir el título o el token dentro de SL-9 (amplía el alcance) y regenerar.
  - (b) Fijar el umbral de la marca anterior entre 1.289 % y 2.283 % (p. ej. < 1.8 %), con poco
    margen y la causa anotada, y dejar el navy para SL-33.
  - (c) Esperar a SL-33.
- **Estado:** T5, T6 y T7 no se empezaron. Las capturas nuevas quedan commiteadas porque son la
  salida real del script; si se elige (a) o (c), se regeneran.

Typecheck tras el arreglo (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `tsc --noEmit` sin errores, exit 0.

### T4 — Decisión del humano sobre D2 (2026-10-28, vía leader): opción (b)

- El umbral de la marca anterior pasa a **< 1.8 %**. El de la marca nueva sigue en ≥ 1 %.
- El navy de `TituloSeccion` (`asfalto-9` = `#0d2444`) se queda para SL-33.
- Las capturas se regeneran cuando SL-33 cierre.
- Queda anotado en `design.md > D2 > Umbral fijado` y en «Decisiones cerradas» de `requirements.md`.
- T4 queda hecha con las capturas del commit `920b8e7`.

## T5 — Guardia

- Nuevo: `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`. Tiene 12 casos:
  - R3, 3 casos: las huellas de T1;
  - R4, 6 casos: marca anterior < 1.8 % y marca nueva ≥ 1 %;
  - R13, 3 casos: los PNG no existen, el recorrido no encuentra los nombres, y la anti-vacuidad
    (> 100 archivos, incluye `KpisMensajero.tsx`).
- Borrados con `git rm`: `public/icons/icono_{envios,entregadas,wallet,transacciones}.png`.
- `pnpm exec vitest run tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`: 12/12 verdes.
- Comprobado que muerde:
  - con las capturas de `dev` repuestas: 9 rojos (R3 ×3; R4 anterior ×3, con 78.323 %, 2.283 % y
    81.199 %; R4 nueva ×3, con 0 %);
  - con `// icono_wallet` en `app/layout.tsx`: R13 rojo (`app\layout.tsx: icono_wallet`).
  - Restaurado y verificado por sha.
- eslint 0, typecheck 0, LF, `grep -il ordenex` vacío.

## T6 — `docs/marca.md`

- «Pendiente (SL-9…)» pasa a «Hecho en SL-9», con cuatro puntos:
  - script de capturas y cuándo regenerar;
  - iconos lucide sobre `--accent` y PNG borrados;
  - brillo `brand-soft`;
  - `TituloSeccion`/`asfalto-9` queda para SL-33: tras SL-33 hay que volver a correr el script, y
    mientras tanto la guardia admite < 1.8 %.
- `grep -i ordenex docs/marca.md`: vacío.
- `marca-texto-amarillo.guardia.test.ts`: 35/35 verdes.

## T7 — Cierre

Por decisión del humano (vía leader) no se corre `./init.sh`: el gate lo lleva CI (`gate-completo`).
Se corren solo los tests tocados y la guardia nueva.

**D5 (R17)**, tras el commit `17a634b`:

```
$ git diff --name-only --diff-filter=d dev...HEAD -- . ':!*.png' ':!specs/' ':!progress/'
app/(app)/mis-asignaciones/_components/KpisMensajero.tsx
docs/marca.md
scripts/capturas-pwa.mjs
tests/components/KpisMensajero.test.tsx
tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts
tests/unit/pwa/capturas-pwa.test.ts
$ git diff --name-only --diff-filter=d dev...HEAD -- . ':!*.png' ':!specs/' ':!progress/' | xargs grep -il ordenex
(salida vacía; GREP_EXIT=123 = ningún archivo con coincidencia)
```

**Tests tocados y guardia nueva** (log fuera de git: `_trabajo/SL-9-T7-tests.log`):

```
$ pnpm exec vitest run tests/unit/pwa/capturas-pwa.test.ts tests/components/KpisMensajero.test.tsx \
    tests/components/textos-estado-455.test.tsx tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts \
    tests/unit/pwa/manifest.test.ts tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts \
    tests/unit/guards/marca-texto-amarillo.guardia.test.ts
 Test Files  7 passed (7)
      Tests  123 passed (123)
TESTS_EXIT=0
```

Reparto: capturas-pwa 24, KpisMensajero 5, textos-estado-455 15, guardia nueva 12,
manifest + pwa-manifiesto-atajos 32, marca-texto-amarillo 35.

- **eslint** sobre los 5 archivos de código y tests tocados: `LINT_EXIT=0`.
- **Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): exit 0 en T4. T5 y
  T6 lo repitieron con exit 0.

## Archivos creados, modificados y borrados

- Nuevos:
  - `scripts/capturas-pwa.mjs`
  - `tests/unit/pwa/capturas-pwa.test.ts`
  - `tests/components/KpisMensajero.test.tsx`
  - `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts`
  - `progress/impl_SL-9.md`
- Modificados:
  - `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`
  - `public/screenshots/{inicio-narrow,ingreso-narrow,inicio-wide}.png`
  - `docs/marca.md`
  - `specs/SL-9-marca-pwa-capturas-iconos/{requirements,design,tasks}.md` (decisión del umbral y
    tareas marcadas)
- Borrados:
  - `public/icons/icono_{envios,entregadas,wallet,transacciones}.png`

## Mapa R<n> → test

| R | Test |
|---|---|
| R1 | `tests/unit/pwa/manifest.test.ts`, `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` (sin tocar, verdes con las nuevas) |
| R2 | `tests/unit/pwa/capturas-pwa.test.ts` (`PANTALLA_POR_CAPTURA` y plan real) + salida de T4 |
| R3 | `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` (huellas) |
| R4 | `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` (fracciones; umbral < 1.8 % por decisión humana) |
| R5 | `tests/unit/pwa/capturas-pwa.test.ts` (plan real y manifiesto sintético) |
| R6 | `tests/unit/pwa/capturas-pwa.test.ts` (una de más, una de menos, tabla = manifiesto) |
| R7 | `tests/unit/pwa/capturas-pwa.test.ts` (`urlBaseLocal`, y el script lanzado con `CAPTURAS_URL=https://example.com`: código ≠ 0 y capturas intactas) |
| R8 | `tests/unit/pwa/capturas-pwa.test.ts` (script lanzado con `spawnSync` contra un puerto local cerrado: código ≠ 0, «La app no responde en http://127.0.0.1:<puerto>» y SHA de las capturas sin cambios) |
| R9 | `tests/unit/pwa/capturas-pwa.test.ts` (`fallosDePantalla`, 4 motivos) + T4 sin fallos; el logo cuenta solo si `naturalWidth > 0` |
| R10 | `tests/unit/pwa/capturas-pwa.test.ts` (`fallosDeTamano`: tamaño correcto → `null`; otro tamaño y no-PNG → error con el `src`) |
| R11 | `tests/components/KpisMensajero.test.tsx` (R11) |
| R12 | `tests/components/KpisMensajero.test.tsx` (R12) |
| R13 | `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` (R13 ×3; recorrido por `git ls-files --cached --others --exclude-standard`) |
| R14 | `tests/components/KpisMensajero.test.tsx` (R14) |
| R15 | `tests/components/KpisMensajero.test.tsx` (R15) |
| R16 | `tests/components/KpisMensajero.test.tsx` (R16), `tests/components/textos-estado-455.test.tsx` |
| R17 | `tests/unit/guards/sin-nombre-heredado.guardia.test.ts` (permanente: código y tests sobre `git ls-files`) + salida vacía de D5 en T7 (cubre también `docs/marca.md`) |

## Pendiente fuera de SL-9

Cuando cierre SL-33 (`asfalto-9`), hay que regenerar las capturas con `node scripts/capturas-pwa.mjs`.
Se puede volver a bajar el umbral de la marca anterior en la guardia.

## Vuelta 1 de review (rechazada) — arreglos

`progress/review_SL-9.md`, commit `f03556c`.

- **M1 (R8).** `tests/unit/pwa/capturas-pwa.test.ts` lanza `node scripts/capturas-pwa.mjs` con
  `spawnSync`:
  - contra `http://127.0.0.1:<puerto>`, un puerto cerrado de verdad (`net.Server` en el 0, se lee el
    puerto y se cierra): código ≠ 0, stderr con «La app no responde en http://127.0.0.1:<puerto>» y
    SHA-256 de las tres capturas sin cambios;
  - el mismo caso con `https://example.com` (R7): código ≠ 0, mensaje de host no local y capturas
    intactas.

  Muerde: sin `await comprobarQueResponde(base)` en `main()`, el caso R8 sale rojo.
- **M2 (R10).** El script exporta dos funciones puras:
  - `dimensionesPng(png) → { ancho, alto } | null`;
  - `fallosDeTamano(png, paso) → string | null`, que `main()` usa.

  Tres casos, con PNG de `sharp({ create })`: 540×1170 → `null`; 360×780 → error con el `src` y las
  dos medidas; un buffer que no es PNG → error con el `src`. Muerde: con `return null` forzado, los
  dos casos de error salen rojos.
- **m1.** El mapa de R17 cita ahora `sin-nombre-heredado.guardia.test.ts`.
- **m2.** `design.md > D1`, pasos 4, 5 y 7, recoge la carga `eager`, `load`/`error`, `conTope`
  (`TOPE_ESPERA_MS = 30000`) como robustez del todo o nada, `naturalWidth > 0` y `fallosDeTamano`.
- **m3 (R9).** Un logo de `/brand/` solo cuenta si `img.complete && img.naturalWidth > 0`. Va dentro
  del navegador y no tiene test unitario.
- **m5 (R13).** El recorrido pasa a ser `git ls-files -z --cached --others --exclude-standard --
  app components lib public`, en un `beforeAll` dentro del describe de R13. La anti-vacuidad se
  mantiene. Muerde con `// icono_wallet` en `app/layout.tsx` y también con un archivo sin versionar
  en `app/`.
- **m4 y m6:** sin cambios. El humano aceptó m4, y el E2E de m6 lo corre CI.

Tests tocados (log fuera de git: `_trabajo/SL-9-R1-tests.log`):

```
$ pnpm exec vitest run tests/unit/pwa/capturas-pwa.test.ts \
    tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts tests/unit/guards/sin-nombre-heredado.guardia.test.ts
 Test Files  3 passed (3)
      Tests  55 passed (55)
TESTS_EXIT=0
```

Reparto: capturas-pwa 29, guardia nueva 12, sin-nombre-heredado 14.

- eslint sobre los tres archivos de código y tests: 0.
- typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): 0.
- LF en todos; `grep -il ordenex` vacío.
- `public/screenshots` intacto.

La primera corrida falló porque los workers de vitest no arrancaron (la máquina estuvo suspendida).
Se repitió.
