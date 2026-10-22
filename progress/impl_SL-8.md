# SL-8 — Bitácora de implementación

Worktree `.worktrees/SL-8-marca-logo-paleta-fuente`, rama `feature/SL-8-marca-logo-paleta-fuente`.
T-sync: `git merge dev` limpio, sin conflictos (2026-10-21).

## T0 — Término de `EMPRESA` (rama tomada: FIJADO)

Spec de SL-15, `design.md` §3, en la rama de SL-15 (`.worktrees/SL-15-*`), commit `1d8c7dd`
(«docs(SL-15): alcance de migraciones, guardia y roles»). Aprobado por el humano (vía leader, 2026-10-21):

```ts
export const EMPRESA = {
  enFrase: "la empresa",
  alInicio: "La empresa",
  membrete: null as string | null,
} as const;
```

T2 copia `EMPRESA` literal; T11 usa sus formas en la postulación.

## T1 — Línea base

Logs: `_trabajo/SL-8-antes-guardias.log`, `_trabajo/SL-8-antes-related.log`.

- `pnpm run test:guardias`: 2 archivos rojos de 286 (4 tests de 3826). Los dos están en
  `tests/baseline-rojos.json`:
  - `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (en baseline);
  - `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts` (en baseline; falta
    `progress/reclasificacion_459/lista_aprobada.csv`).
- `vitest related --run app/globals.css components/shared/Logo.tsx app/layout.tsx`: 13 archivos,
  138 tests, todo verde.

## T2 — `lib/config/marca.ts` (`74aeae0`)

`tests/unit/config/marca.test.ts`, 3 tests verdes. Mutación `enFrase: MARCA.nombre`: 2 rojos de 3.
Typecheck verde.

## T3, T4, T10, T11 (`f6c3405`, `02e3661`, `11c1984`, `1f8c6ad`, `3f991e3`)

- T3: `Logo` con `archivoDeLogo()` y `ANCHO_MINIMO_HORIZONTAL`. Mutación del umbral a `> 140`: 3 rojos
  de 17 (los dos casos de 140 px y la proporción del horizontal a 140).
- T4: 9 llamadas con `fondo` y `ancho`; isotipo colapsado `isotipo-mono-blanco.svg`; 4 degradados a
  `rgba(255,208,0,0.16)`. Mutaciones extra: cabecera móvil del login con `fondo="oscuro"` y isotipo
  de Sidebar con `ancho={140}`, rojas las dos.
- T10: Archivo como `--font-sans`. Se añadió `tests/unit/validacion/zod-es.test.tsx` a «Archivos
  esperados» (su doble de `next/font/google` exportaba la fuente anterior).
- T11: `LandingPostular.tsx` usa `EMPRESA.enFrase`, nunca `MARCA`. Mutación «Sumate a Servi
  Logistic»: rojo el caso de `#trabaja-con-nosotros`.
- `3f991e3`: las aserciones negativas arman el nombre anterior con `["orden", "ex"].join("")` para
  que los tests no lo contengan literal (R26).
- `vitest related` de los archivos tocados: 14 archivos, 172 tests verdes; componentes 67/67.
  Typecheck y lint verdes.
- `LandingNav`: isotipo (`ancho={32}`, `md:hidden`) y horizontal (`ancho={160}`, `hidden md:block`),
  por R8. Se confirma en T13.

## T5, T6, T12 (`47d540b`, `32301ea`, `1301424`)

Tokens según D3 y D4. Espejos verdes: «sistema toma EXACTAMENTE los mismos tokens que oscuro»,
`.papel-al-imprimir` igual a `.tema-claro` y los de `impresion-tokens`. `docs/marca.md > Tema oscuro`:
25 filas, comparadas por script con `.dark` y `.tema-sistema`, 50 de 50 iguales. Resolutor
`utilidad(tema, nombre)` añadido a `tests/fixtures/contraste.ts` (lo ejercita T8).

Rojos que deja la paleta nueva, de T9 (contratos con el hex o la cifra de antes):
- `tema-encendido`: `--background` `#f7f8fc` → `#F7F7F5`; tinta `#12233f` → `#111111`.
- `impresion-tokens`: ancla `--foreground: #e6ecf8` → `#F7F7F5`; T1 `--foreground` antes 1.19→1.07,
  después 15.70→18.88; `--primary` 3.18 → 18.88 (deja de ser límite); censo de lo que baja pasa a 3
  (`border`, `input`, `primary-foreground`); P1 18.33→18.88; P2 sale del censo; P3 12.30→13.79;
  P4 10.29→12.10; P5 y P6 salen.
- `contraste-tokens`: `danger/20` cae ahora solo en `claro/secondary`; los dos casos de la 226 caducan
  (`ring = primary = #111111` en claro; `paleta("brand")` ya no es hex). `SUELO*` verdes.
- `enlace-contraste-458`: `--color-primary-strong` = `var(--primary)`, 17.60 claro / 12.84 oscuro.
- `factura-contraste`: P24 claro 7.24 → 7.18 (bajada de R18 por el fondo); deuda bajo AA
  `['P20','P21']` → `['P20']`. L. 649 cita un identificador del glosario de SL-15 dentro de un texto.
- `impresion-sin-dark`: no carga (`paleta("brand")` l. 264). F1 y F2 pasan a 1.47 → 18.88; F4 18.88 →
  11.39; P23 17.78 → 17.60.

## T7 — Tinta sobre la marca y landing (`c5db9c0`, `adf72f6`)

Cifras con `contraste()` del fixture, claro / oscuro.

| archivo:línea | superficie | antes → después | contraste |
|---|---|---|---|
| PosNavBlock.tsx:37, PosOrderCardDetalle.tsx:93, OrdenesCargaPreview.tsx:218, OrdenesCargaMasivaButton.tsx:83 | `bg-brand` | `text-white` → `text-brand-foreground` | 18.88 / 12.84 (antes 18.88 / 1.47) |
| RankingPodio.tsx:183, :192 | `bg-accent` | `text-brand-dark` → `+ dark:text-brand-light` | 17.70 / 9.22 (antes oscuro 1.39) |
| jerarquia.ts:60 | `bg-card` | ídem | 18.88 / 11.60 (antes oscuro 1.11) |
| sidebar.tsx:478, :482, :682 | `--sidebar` | `bg-brand/8`, `/18` → `bg-sidebar-accent` | 1.25 contra la barra (antes 1.01); tinta 13.61 |
| login:41, recuperar-contrasena:49, postulacion:70 | `bg-navy` | barra `bg-brand` → `bg-brand-light` | 11.60 (antes 1.11) |
| LandingNav.tsx:78 | `bg-navy-deep/95` | `bg-brand text-white` → `bg-brand-light text-brand-dark`, hover `/90` | 12.84; hover 10.50 |
| LandingHero.tsx:31, :88, :94 | `navy-deep` | `text-brand`/`bg-brand`/`Enfasis` → `-brand-light`/`EnfasisOscuro` | 12.84 (peor caso 9.89 con `/90` sobre foto) |
| LandingBanda.tsx:87 | `navy-deep/92` | `Enfasis` → `EnfasisOscuro` | 10.55 peor caso |
| LandingPoliticas.tsx:58, :76 | `asfalto-9` | `Enfasis` → `EnfasisOscuro`; viñeta `bg-brand-light` | 10.55 |
| LandingPostular.tsx:108 | foto con velo `navy-deep/70` | `bg-brand text-white` → `bg-brand-light text-brand-dark` | 12.84 |
| primitivas.tsx:17, :47, :63, :100 | — | `Barra` con color; `RotuloSeccionOscuro`; `EnfasisOscuro` nuevo | según uso |
| button.tsx:7-35, :45, :93 | — | comentarios con cifras de la marca | `ring-ring` 16.70 / 10.68 |

Sin tocar, válidos en claro fijo (18.88): `bg-brand text-white` de LandingComoFunciona:48-49,
LandingPostular:122, PostularRecursoModal:88, :91, RastreoDialog:69.

Censo para T8 — `text-brand-light` sin `dark:` sobre oscuro fijo: LandingBanda:83 (`navy-deep`, 12.84),
LandingFooter:6 hover (12.84), LandingHero:31, :85 (12.84), LandingPoliticas:64 (`asfalto-9`, 10.55),
primitivas:63 (10.55), primitivas:100 (12.84 / 10.55). Ningún `text-sidebar-primary` sin `dark:`.

Censo para T8 — `text-brand-dark` sin `dark:` sobre claro fijo: OrdenesCargaMasivaButton:84
(`bg-brand-soft`, 17.70), OrdenesCargaPreview:219 hover (17.70), LandingServicios:48, :69 (17.70),
primitivas:47 (`kraft-canvas`, 17.60), LandingNav:78 y LandingPostular:108 (`bg-brand-light`, 12.84).

## T9 — Guardias de contraste como contrato (`f2f7c3e`)

Re-medido el 2026-10-22. Única bajada, por R18: factura P24 claro 7.25 → 7.18 (fondo `#f7f8fc` →
`#F7F7F5`, tinta sin cambio). Las demás suben por los tokens oscuros nuevos; los suelos se subieron a
lo medido, con la cifra de antes en el comentario.

- `contraste-tokens`: `SUELO` oscuro success 6.60→6.97, warning 7.59→7.70, danger 5.20→5.27, info
  6.97→7.39, chart-6 6.91→7.24, chart-11 7.02→7.21, chart-12 8.45→8.92, chart-13 6.48→6.89;
  `SUELO_BOTON` oscuro 4.65→4.85, hover 5.89→6.17; `SUELO_ANILLO` oscuro 5.24→5.68 (claro 3.33 igual);
  `SUELO_456` icono oscuro 6.40→7.41, anillo claro 3.68→16.70, oscuro 5.57→10.68, landing 3.78→17.15.
  Casos de la 226 (ring ≠ naranja, «dos motivos») → un `it.each` R19 «`--ring` ≥ 3:1 en las seis
  superficies y no baja de su suelo» (16.70 / 10.68 a mano). Muerde con `--ring` `#9a9a9a` (umbral) y
  `#555555` (suelo). `danger/20`: cae solo en `claro/secondary` (oscuro mide 4.54).
- `impresion-sin-dark`: F1 `paleta("brand")` → `tokenAlImprimir("primary")` (mide el papel; `token()`
  no lo ve, y hoy dan el mismo hex); F1/F2 1.47 → 18.88; F4 antes 18.88, después 11.39; P23
  17.78 → 17.60. FAMILIA 1 redefinida: la rama `dark:` es de paleta fija.
- `impresion-tokens`: ancla `TINTA_OSCURA = "#f7f7f5"` literal de `docs/marca.md`; tinta `#111111`
  literal; T1 1.07 → 18.88; T6 antes 2.12; `--primary` sale del LÍMITE (≥ 4.5), `--destructive`
  3.76 sigue; lo que baja en papel pasa de 6 filas a 3; P1 18.88, P3 13.79, P4 12.10.
- `enlace-contraste-458`: alias `var(--primary)`, 17.60 / 18.88 claro, 12.84 / 11.60 oscuro; el
  control de axe queda con el literal histórico `contraste("#f26419", "#f7f8fc")` ≈ 2.99.
- `factura-contraste`: suelos re-medidos (P1 15.70·13.74 → 18.88·15.91 … P25 13.86·12.22 →
  16.70·14.65); deuda bajo AA `["P20","P21"]` → `["P20"]`; R4 «antes» al literal `#0b2545`; fuera
  las 3 menciones del wordmark con nombre y el identificador de la l. 649.
- `tema-encendido`: `#f7f7f5` y `#111111` como literales de la marca.
- Mutación `--primary` claro a `#f26419`: 4 rojos (458 claro, LÍMITE, P21, lista de deuda).

Salidas: las seis guardias 184/184 verdes. `pnpm run test:guardias`: 282 verdes, 2 saltados, 2 rojos
(los dos del baseline). Typecheck verde; lint 0 errores, 234 avisos (sin cambio).
`tema-encendido.guardia.test.ts:456` arma el nombre de la cookie de SL-15 partido, sin cambiar la
aserción.

## Arreglos de T7 tras el recorrido (`d08f1f6`, `b9efb24`)

- `PosNavBlock.tsx`, botón «Ir» sobre `bg-navy` (`#1C1C1A`, fijo): `bg-brand` medía 1.11 contra la
  tarjeta en claro. Pasa a `bg-brand-light text-brand-dark hover:bg-brand-light/90`: 11.60 contra la
  tarjeta, tinta 12.84, en los dos temas; hover 9.59 / 10.61.
- Landing clara fija, `hover:bg-brand-dark` (igual a `brand` = `#111111`, hover muerto) →
  `hover:bg-brand/90` en LandingPostular:122, PostularRecursoModal:88, :91, RastreoDialog:69: blanco
  encima 14.74.
- `pos-estado.ts:61` (`CLASE_MARCA_TARJETA.activa`), hallado por la parte 3 de la guardia:
  `bg-brand text-white` (1.47 en oscuro) → `text-brand-foreground`, 18.88 / 12.84. Añadido a
  «Archivos esperados».

## T8 — Guardia de marca (`64363e9`)

`tests/unit/guards/marca-texto-amarillo.guardia.test.ts`, 35 tests verdes. Partes 1-2 (R15), 3 (R16),
4 (R17), 5 (R13, R14), 6 (R29), 7 (R11), fuente (R20), nombre en las rutas fijas de D11 (R26). Cada
parte con sintético rojo y verde. Las listas de clases salen del AST de `typescript` sobre el código
sin comentarios.

`CENSO_AMARILLO` (`text-brand-light`): LandingBanda (`navy-deep`, 12.84, 1), LandingFooter (12.84, 1),
LandingHero (12.84, 2), LandingPoliticas (`asfalto-9`, 10.55, 1), primitivas (`asfalto-9`, peor caso
10.55, 2). `CENSO_NEGRO_FIJO`: RankingPodio `text-navy-deep` (`warning`, 8.79, 2), PosNavBlock
`text-brand-dark` (`brand-light`, 12.84, 1), OrdenesCargaMasivaButton (`brand-soft`, 17.70, 1),
OrdenesCargaPreview hover (`brand-soft`, 17.70, 1).

Mutaciones sobre el árbol, todas rojas y revertidas: `text-brand-light` en `Sidebar.tsx` (parte 2);
`--card` `#1C1C1B` en la tabla de `docs/marca.md` (parte 7); `--color-brand-light` a naranja (5 rojos);
`bg-brand text-white` en `pos-estado` (parte 3); `theme_color` `#0b2545` (parte 6); Poppins en el
layout (fuente); el nombre anterior en un comentario de `Logo.tsx` (nombre); sin `dark:` en
`jerarquia.ts` (parte 4); sin el hover amarillo del pie (fila del censo que ya no aparece).

`pnpm run test:guardias`: 283 verdes, 2 saltados, 2 rojos (los del baseline). Typecheck verde; lint 0
errores, 234 avisos.

Hallazgo sin tocar: el comentario de `RankingPodio.tsx:38-39` cita 7.3 y 12.7 (marca anterior); hoy
miden 8.79 y 12.84.

## T13 — Verificación en el navegador (`5d409a3`)

Base `servi_logistic_sl8` en el Postgres local del `.env` principal (localhost), con
`prisma migrate deploy` y `db:seed`. Para que aplicara `20260918120200_zona_sinpe_no_nulo` se marcó
`rolled-back`, se corrió `scripts/seed-sinpe-inicial.ts` con un SINPE inventado (`60000000`,
«Prueba SL8») y se volvió a desplegar: es el bloqueo que documenta SL-11.

`e2e/marca.spec.ts`: el `beforeAll` crea un `admin` activo `sl8-<timestamp>@example.com` con contraseña
aleatoria (hash bcrypt) y una fila `trusted_device` con el sha256 del user agent de la prueba, para que
el login no pida OTP (riesgo 70 → 30). Entra de verdad por `/login`. El `afterAll` borra
`trusted_device`, `login_attempt`, `email_otp_challenge`, `Session` y el usuario: 0 usuarios `sl8-`
al terminar. Aborta antes de escribir si la URL apunta a un proyecto prohibido. Nada en seeds
versionados; ni `maestro` ni superadmin. El aviso de revisión SINPE no bloqueó.

Un solo dev server: antes, nada en el 3000 ni ningún `next` vivo; `rm -rf .next`; `pnpm dev` del
worktree; al final se mató el árbol (4 procesos), el 3000 quedó libre y se borró `.next`.

```
Running 6 tests using 1 worker
  ok 1 › landing a 1280 px: barra y héroe, y pie (claro) (1.8s)
  ok 2 › login a 1280 px (claro) (897ms)
  ok 3 › landing a 360 px: barra y héroe, y pie (claro) (1.5s)
  ok 4 › login a 360 px (claro) (840ms)
  ok 5 › dashboard a 1280 px, barra expandida y colapsada (claro) (2.6s)
  ok 6 › dashboard a 1280 px, barra expandida y colapsada (oscuro) (2.5s)
  6 passed (13.0s)
PW_EXIT=0
```

Sin casos saltados. Mutaciones en «login a 360», cada una roja y revertida: texto amarillo sobre
blanco, `body` en serif, el nombre anterior en el texto, un div de 500 px (R8) y el logo esperado
cambiado.

Capturas en `_trabajo/capturas-SL-8/` (ruta que fijó el leader; D9 decía `_trabajo/capturas/SL-8/`),
fuera de git; cifras en `_trabajo/capturas-SL-8/cifras.json`. En las 10: 0 textos amarillos sobre
fondo claro; primera familia Archivo en `body` y `h1`/`h2`, `loaded` en `document.fonts`; el nombre
anterior no está en `innerText`.

| Captura | Ancho | Tema | Nodos | Logo visible | scrollWidth |
|---|---|---|---|---|---|
| `landing-barra-heroe-1280-claro.png` | 1280 | claro | 121 | horizontal-fondo-oscuro | 1280 |
| `landing-pie-1280-claro.png` | 1280 | claro | 121 | horizontal-fondo-oscuro | 1280 |
| `landing-barra-heroe-360-claro.png` | 360 | claro | 116 | isotipo-mono-blanco | 360 |
| `landing-pie-360-claro.png` | 360 | claro | 116 | horizontal-fondo-oscuro | 360 |
| `login-1280-claro.png` | 1280 | claro | 8 | horizontal-fondo-oscuro | 1280 |
| `login-360-claro.png` | 360 | claro | 7 | horizontal-fondo-claro | 360 |
| `dashboard-expandida-1280-claro.png` | 1280 | claro | 28 | horizontal-fondo-oscuro | 1280 |
| `dashboard-colapsada-1280-claro.png` | 1280 | claro | 26 | isotipo-mono-blanco | 1280 |
| `dashboard-expandida-1280-oscuro.png` | 1280 | oscuro | 28 | horizontal-fondo-oscuro | 1280 |
| `dashboard-colapsada-1280-oscuro.png` | 1280 | oscuro | 26 | isotipo-mono-blanco | 1280 |

Lo que se vio (revisado por el subagente y, en dos capturas, por el implementer):
- Landing 1280: barra `#1C1C1A` con logo horizontal; «Ingresar» amarillo con tinta negra; amarillo
  solo sobre el héroe oscuro. Sin naranja.
- Landing 360: isotipo, lupa e «Ingresar», sin desbordar (R8).
- Pie: oscuro, logo horizontal, «© 2026 · Servi Logistic».
- Login 1280: panel oscuro con degradado amarillo tenue, logo sobre oscuro, raya amarilla; formulario
  sobre `#F7F7F5`, botón negro. Login 360: logo de fondo claro en la cabecera móvil (R2).
- Dashboard claro y oscuro: barra `#1C1C1A` con logo horizontal; colapsada, el isotipo blanco (R7);
  activo en `#2E2E2C`; en oscuro fondo `#111111` y botón de colapsar amarillo.

Hallazgos fuera de alcance (no tocados):
- Landing: títulos de sección («Todo lo que necesitas…», tarjetas de postulación) y el fondo
  `kraft-inset` siguen en navy/azulado frío (`asfalto-9` `#0d2444`, `asfalto-7`, `kraft-inset`
  `#f1f4fb`). «Lo que NO entra» deja `asfalto-*` fuera; visualmente es el navy de la marca anterior y
  necesita ficha.
- El título del dashboard dice «Panel maestro» con un usuario `admin`: contenido de otra feature.
- El botón «Ir» de `PosNavBlock` (rol mensajero con orden asignada) no entra en las pantallas de D9;
  lo cubren la guardia y su contraste medido arriba.

## T14 — Cierre

El grep de R26 sobre `git diff --name-only dev...HEAD` (comando literal en `tasks.md > T14`):

```
specs/SL-8-marca-logo-paleta-fuente/design.md
specs/SL-8-marca-logo-paleta-fuente/requirements.md
specs/SL-8-marca-logo-paleta-fuente/tasks.md
```

Son el propio spec, que nombra lo que se quita, y no están en «Archivos esperados» (alcance de R26).
Sin `specs/`, la salida es vacía (`R26_EXIT=123`, grep sin coincidencias). Los tests, la guardia y el
E2E arman el nombre partido (`["orden","ex"].join("")`) para no contenerlo literal.

`./init.sh` (rápido), log `_trabajo/SL-8-gate.log`: typecheck pasó, lint pasó,
`Test Files 283 passed (283)`, `Tests 3824 passed (3824)`, «4 rojo(s) heredado(s) del baseline no
cuentan en esta seleccion», todas las migraciones con `down.sql`, `== init OK ==`, `INIT_EXIT=0`.

## Mapa R → test

| R | Test |
|---|---|
| R1–R5 | `tests/components/Logo.test.tsx` |
| R6 | `tests/components/Sidebar.test.tsx`, `tests/components/LoginPage.test.tsx`, `tests/components/LandingPage.test.tsx` |
| R7 | `tests/components/Sidebar.test.tsx`; `e2e/marca.spec.ts` (dashboard colapsado) |
| R8 | `e2e/marca.spec.ts` (landing y login a 360) |
| R9, R10, R12 | `tests/unit/guards/tema-encendido.guardia.test.ts`, `tests/unit/guards/impresion-tokens.guardia.test.ts`, `tests/unit/guards/marca-texto-amarillo.guardia.test.ts` (parte 5) |
| R11 | `marca-texto-amarillo.guardia.test.ts` (parte 7) |
| R13, R14 | `marca-texto-amarillo.guardia.test.ts` (parte 5) |
| R15 | `marca-texto-amarillo.guardia.test.ts` (partes 1 y 2) |
| R16 | `marca-texto-amarillo.guardia.test.ts` (parte 3) |
| R17 | `marca-texto-amarillo.guardia.test.ts` (parte 4) |
| R18, R19 | `tests/unit/guards/contraste-tokens.guardia.test.ts`, `impresion-sin-dark.guardia.test.ts`, `enlace-contraste-458.guardia.test.ts`, `factura-contraste.guardia.test.ts`, `impresion-tokens.guardia.test.ts` |
| R20 | `marca-texto-amarillo.guardia.test.ts` (caso de `app/layout.tsx`) |
| R21 | `e2e/marca.spec.ts` (familia y `document.fonts`) |
| R22 | `tests/unit/config/marca.test.ts` |
| R23 | `tests/unit/config/marca-layout.test.ts` (`title`, `description` y `apple-mobile-web-app-title` del layout); `tests/components/LandingPage.test.tsx` |
| R24 | `tests/components/LoginPage.test.tsx`, `tests/components/Sidebar.test.tsx` |
| R25 | `tests/components/LandingPage.test.tsx` (incluye `#trabaja-con-nosotros` sin «Servi Logistic») |
| R26 | `marca-texto-amarillo.guardia.test.ts` (rutas fijas) y la salida de T14 |
| R27, R28 | `e2e/marca.spec.ts` |
| R29 | `marca-texto-amarillo.guardia.test.ts` (parte 6) |

## Commits (dev..HEAD, sin merges)

`74aeae0` T2 · `3964215` T0/T1 · `f6c3405` T3 · `02e3661` T4 · `11c1984` T10 · `1f8c6ad` T11 ·
`3f991e3` nombre partido en tests · `cd7d4fc` marcas · `47d540b` T5 · `32301ea` T6 · `1301424` T12 ·
`f886f68` marcas · `c5db9c0`, `adf72f6` T7 · `f2f7c3e` T9 · `ee37f47` marcas · `d08f1f6`, `b9efb24`
arreglos T7 · `64363e9` T8 · `d8074f6` marcas · `5d409a3` T13 · y el de esta bitácora.

## Vuelta 2 — correcciones de la revisión (`progress/review_SL-8.md`, `0a07f0c`)

- **Merge de `dev`** (`55f18ac`, trae SL-10 a SL-14): `ac9208a`, sin conflictos. Las migraciones que
  trae: `prisma migrate deploy` sobre `servi_logistic_sl8` dice «No pending migrations to apply».
- **B1 (R23)** `88d90ee`: `tests/unit/config/marca-layout.test.ts`, 3 casos: `metadata.title` igual al
  literal «Servi Logistic» y a `MARCA.nombre`; `metadata.description` contiene el nombre;
  `apple-mobile-web-app-title` es un `<meta>` del `<head>` y se lee de `renderToStaticMarkup(RootLayout)`.
  Mutaciones `title: "Otra Marca"` y `content="Otra"` en el meta de Apple: 1 rojo cada una; revertidas,
  3/3 verdes y `git diff app/layout.tsx` vacío.
- **B2** `72eb95a`: las 7 líneas del spec (`design.md:14`, `:452`; `requirements.md:16`, `:23`, `:57`,
  `:147`; `tasks.md:69`) nombran el dominio en palabras, sin el literal. `5cb0c45`: fuera de
  `EXCEPCIONES_DOMINIO` las 4 entradas `ficha: "SL-8"`; la guardia de dominio y la de marca, 44/44
  verdes.
  - Choque con R26: la guardia de dominio entra en «Archivos esperados» y lleva el nombre anterior en
    su nombre de archivo y su contenido, que son de SL-14. SL-8 solo borró 4 líneas. Queda anotado en
    `tasks.md` como excepción; el grep de R26 sin `specs/` la va a listar por eso.
- **m2** `5cb0c45`: `Logo` gana la prop opcional `oculto` (`aria-hidden="true"`); el `alt` sigue siendo
  `MARCA.nombre` (R1). En `Sidebar.tsx` el logo que está oculto por opacidad va con `oculto`.
  `Sidebar.test.tsx` afirma un solo `img` accesible «Servi Logistic» en cada estado; mutación (quitar
  `oculto` del isotipo) roja y revertida.
- **m3** `5cb0c45`: comentario de `RankingPodio.tsx` a 8.79:1 y 12.84:1.
- Anotados sin tocar: **m1** (R6 sin test que fije el `fondo` de `recuperar-contrasena`, `postulacion` y
  `paquete/[numGuia]`), **m4** (el `beforeAll` del E2E también condiciona los casos sin sesión; el E2E
  del CI es informativo) y **m5** (navy de la landing → SL-33).
- Tests: `Sidebar` + `Logo` 43/43; `vitest related` sobre lo tocado 15 archivos, 169/169; typecheck
  verde; lint 0 errores.
- Gate: `touch -r node_modules pnpm-lock.yaml` y `TEST_RAPIDO_BASE=dev ./init.sh`, log
  `_trabajo/SL-8-gate-v2.log`. Relacionados: `Test Files 488 passed | 31 skipped (519)`,
  `Tests 7050 passed | 217 skipped (7267)`. Guardias: `Test Files 287 passed | 2 skipped (289)`,
  `Tests 3875 passed | 19 skipped (3894)`. «1 rojo(s) heredado(s) del baseline no cuentan en esta
  seleccion». `== init OK ==`, `INIT_EXIT=0`. Sin dev server.
