# SL-33 — paleta-secundaria · tasks.md

> Requisitos en `requirements.md` (R1–R20). Decisiones técnicas en `design.md` (D1–D15). Todo es
> zona frontend: lo implementa `frontend_dev`.
>
> El gate lo corre CI. En local, al cerrar cada tarea, se corren estos tres:
> - `pnpm exec vitest related --run <archivos tocados>`;
> - `pnpm run test:guardias`;
> - `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`.
>
> No se pide `./init.sh`.
>
> P1 y P2 los cerró el humano el 2026-10-28 (`requirements.md > Decisiones cerradas`).

## Tareas

- [x] **T0 — Traer `dev` (SL-9).** Merge de `origin/dev` en la rama. Comprobar que llegan
  `scripts/capturas-pwa.mjs`, la guardia de capturas de SL-9 y `specs/SL-9-marca-pwa-capturas-iconos/`.
  Anotar en `progress/impl_SL-33.md` dos cosas: el nombre real de la guardia y su umbral actual. Si
  el nombre no es el de «Archivos esperados», corregir la lista aquí.
  **Hecho:** merge sin conflictos, o con conflictos resueltos, y los tres artefactos presentes en el
  árbol.

- [x] **T1 — Guardia nueva, en rojo** (R1–R13, R16–R20; D9). Depende de T0. Crear
  `tests/unit/guards/paleta-secundaria.guardia.test.ts` con los literales de D2, D4, D5 y D13–D15:
  - la tabla aprobada;
  - los pares grises con su «antes», y la excepción de `asfalto-2` a cifra exacta;
  - la familia por contador;
  - los pares de `offline.html`, `global-error` y los mapas;
  - la lista de HEX de SL-8 D5 para el barrido de R20.

  Cada bloque lleva su caso sintético. Usa solo el fixture `tests/fixtures/contraste.ts`.
  **Hecho:** los sintéticos en verde y los casos reales en rojo, por el valor y no por un error de
  lectura. Se pega la salida en `progress/impl_SL-33.md`.

- [x] **T2 — Los 20 `--chart-N`** (R1, R2, R3; D1, D2). Depende de T1. En `app/globals.css`, la
  columna «Claro» va a tres bloques:
  - `:root, .tema-claro`;
  - `.papel-al-imprimir`;
  - el bloque de impresión de la 224.

  La columna «Oscuro» va a `.dark` y a `.tema-sistema`.
  **Hecho:** los casos R1–R3 de la guardia nueva en verde, y `tema-encendido.guardia`,
  `impresion-tokens.guardia` y `analytics-paleta.test.ts` en verde.

- [x] **T3 — Pares del monitoreo** (R4, R5, R6; D3, D4). Depende de T2.
  - `app/globals.css`:
    - `--color-chart-{6,11,12,13}-soft` pasan a `--color-chart-{5,7,11,12}-soft`, con los HEX de D4;
    - los `--color-chart-N-strong` de `@theme` cambian de índice igual;
    - `--chart-N-strong` cambia en los cinco bloques: claro, los dos de impresión, `.dark` y
      `.tema-sistema`.
  - `components/ui/badge.tsx`: las variantes `chart5`, `chart7`, `chart11` y `chart12`.
  - `app/(app)/monitoreo/_components/contadores.ts`: `COLOR_SEGMENTO`, `VARIANTE_CONTADOR` y los
    comentarios que nombran índices o cifras (`chart-13` 9.41/8.03, «morado, marrón y gris»).
  - Actualizar `color-contador.guardia.test.tsx` y `TableroDiaComposicion.test.tsx`.

  **Hecho:** los casos R4–R6 de la guardia nueva en verde, y también las dos guardias de arriba y
  `contraste-tokens.guardia`, con `PARES_CHART` y sus ocho cifras pasadas a D4.

- [x] **T4 — Grises a `stone`** (R7, R8, R9, R10, R11; D5, D7). Depende de T1. `asfalto-2` pasa a
  `stone-200` (P1).
  - En `app/globals.css`:
    - `--secondary`, `--muted`, `--muted-foreground`, `--border` e `--input`, en los tres bloques
      claros;
    - `--color-asfalto-{0,1,2,4,5,7,9}` y `--color-kraft-inset` en `@theme`.
  - Sin tocar componentes. Los nombres no cambian.

  **Hecho:** los casos R7–R11 de la guardia nueva en verde.

- [ ] **T5 — Cifras en guardias y comentarios** (R12, R14; D6, D8). Depende de T2, T3 y T4.
  - Actualizar cada cifra de la tabla de D8 y los comentarios de D6 a la medida del fixture.
  - Si algún test relacionado sale rojo por una cifra que D8 no lista, se trata igual y se añade a
    D8 y a «Archivos esperados».
  - Ningún umbral más laxo.

  **Hecho:** guardias en verde, R12 en verde y un diff de tests que solo cambia literales medidos y
  nombres de índice: ningún `toBeGreaterThanOrEqual` con un número menor y ningún `it` borrado.

- [x] **T6 [P] — `docs/marca.md`** (R13, R16; D10). Depende de T2, T3 y T4. Tablas de D2 y D5, con
  las cifras del fixture. Se quita la línea «No cambian con la marca: … los `--chart-*` …».
  **Hecho:** el caso R13 de la guardia nueva en verde.

- [x] **T6a [P] — `offline.html` y `global-error`** (R17, R18; D13, D14). Depende de T1.
  - Sustituir los HEX de las tablas D13 y D14.
  - Reescribir el comentario de `global-error.tsx` l. 22-26 con los valores nuevos.

  **Hecho:** los casos R17 y R18 de la guardia nueva en verde, y también `RedDeErrores.test.tsx`,
  `html-lang.guardia`, `marca-estaticos.guardia` y `pwa-servida-sin-sesion.guardia`.

- [x] **T6b [P] — Pin y tramo del mapa** (R19; D15). Depende de T1. `#111111` en
  `UbicacionMapaInner.tsx` y `RutaMapaInner.tsx`, y los comentarios «naranja» reescritos.
  **Hecho:** el caso R19 en verde, y también `RutaMapaInner.test.tsx`, `UbicacionMapa.test.tsx`,
  `primitivas.guardia` y `sin-integrador-de-ordenex.guardia`.

- [x] **T6c [P] — Comentarios, `DESIGN.md` y maquetas** (R20; D12). Depende de T1.
  - Reescribir sin HEX los cuatro comentarios de D12: `tabs.tsx`, `EstatusBadge.tsx`,
    `ProductosTabla.tsx` y `KpisMensajero.tsx`.
  - Corregir `DESIGN.md:14`.
  - Sustituir los HEX de las 15 maquetas `design-*/*.dc.html` con la tabla de D12. Solo los HEX:
    ningún texto.

  **Hecho:** el caso R20 de la guardia nueva en verde, sin ninguna exclusión añadida a mano, y
  `docs-marca-heredada.guardia`, `notifications-bell-tokens.guardia` y `sin-nombre-heredado.guardia`
  en verde.

- [ ] **T7 — Verificación en el navegador.** Depende de T2 a T6c.
  - Montaje: `pnpm dev -p 3044` con solo la `DATABASE_URL` local, en claro y en oscuro.
  - Pantallas: `/analitica`, `/monitoreo`, `/ranking`, `/`, los dos mapas de `/mis-asignaciones`,
    `/offline.html` y `global-error` (forzado en local, D14).
  - Comprobar seis cosas:
    - las series de analítica se distinguen;
    - la barra y las tarjetas del monitoreo concuerdan por color;
    - el podio se lee;
    - los títulos de la landing ya no salen navy;
    - el pin y el tramo se ven sobre el mapa;
    - el color real de la tierra de OSM. Si no es `#f2efe9`, se corrige `TIERRA_OSM` y D15.
  - Anotar el punto 1 de D5: si el botón `secondary` sobre el fondo se pierde.
  - Abrir una maqueta de cada carpeta para ver que la sustitución de D12 no deja texto ilegible.

  **Hecho:** capturas y notas en `progress/impl_SL-33.md`. Si algo se ve mal, se para y se avisa al
  leader antes de seguir.

- [ ] **T8 — Capturas de la PWA** (R15; D11). Depende de T7, con la paleta cerrada.
  - `node scripts/capturas-pwa.mjs` con el montaje de T7.
  - Medir y bajar el umbral de «marca anterior» de la guardia de SL-9 al valor medido, redondeado
    hacia arriba a la décima.
  - Actualizar las huellas.

  **Hecho:** `public/screenshots/*.png` regeneradas, la guardia de SL-9 en verde con el umbral nuevo
  y la medida pegada en `progress/impl_SL-33.md`.

- [ ] **T9 — Cierre.** Depende de todas.
  - Grep de «Ordenex» en los archivos de «Archivos esperados»: salida vacía.
  - Typecheck, `test:guardias` y `vitest related` sobre todo el diff.
  - El mapa `R<n> → test` en `progress/impl_SL-33.md`.

  **Hecho:** salidas pegadas y mapa completo.

## Trazabilidad prevista

| R | Test |
|---|---|
| R1, R2, R3 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, `tests/unit/components/analytics-paleta.test.ts` |
| R4 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, `tests/unit/guards/contraste-tokens.guardia.test.ts` |
| R5 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, `tests/unit/tablero-dia/color-contador.guardia.test.tsx` |
| R6 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, `tests/components/TableroDiaComposicion.test.tsx` |
| R7, R8, R9, R10, R11 | `tests/unit/guards/paleta-secundaria.guardia.test.ts` |
| R12 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, `tests/unit/guards/tema-encendido.guardia.test.ts` |
| R13 | `tests/unit/guards/paleta-secundaria.guardia.test.ts` |
| R14 | Las guardias de D8 en verde con literales nuevos; el reviewer compara el diff de umbrales |
| R15 | La guardia de capturas de SL-9 (nombre confirmado en T0) |
| R16 | `tests/unit/guards/paleta-secundaria.guardia.test.ts` |
| R17 | `tests/unit/guards/paleta-secundaria.guardia.test.ts` (y `marca-estaticos.guardia`, que sigue en verde) |
| R18 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, `tests/components/RedDeErrores.test.tsx` |
| R19 | `tests/unit/guards/paleta-secundaria.guardia.test.ts`, más la captura del mapa de T7 |
| R20 | `tests/unit/guards/paleta-secundaria.guardia.test.ts` |

## Archivos esperados

- `app/globals.css`
- `components/ui/badge.tsx`
- `app/(app)/monitoreo/_components/contadores.ts`
- `docs/marca.md`
- `public/offline.html`
- `app/global-error.tsx`
- `app/(app)/mis-asignaciones/_components/UbicacionMapaInner.tsx`
- `app/(app)/mis-asignaciones/_components/RutaMapaInner.tsx`
- `app/(app)/mis-asignaciones/_components/KpisMensajero.tsx`
- `app/(app)/ordenes/_components/EstatusBadge.tsx`
- `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`
- `components/ui/tabs.tsx`
- `DESIGN.md`
- `design-whatsapp/Formulario.dc.html`
- `design-whatsapp/FormularioMovil.dc.html`
- `design-whatsapp/Historial.dc.html`
- `design-whatsapp/ListaMovil.dc.html`
- `design-whatsapp/Main.dc.html`
- `design-whatsapp/ParamsPicking.dc.html`
- `design-whatsapp/ParamsTransito.dc.html`
- `design-whatsapp/PdfPicking.dc.html`
- `design-whatsapp/PdfTransito1.dc.html`
- `design-whatsapp/PdfTransito2.dc.html`
- `design-whatsapp/Vacio.dc.html`
- `design-notificaciones/Campana.dc.html`
- `design-notificaciones/Main.dc.html`
- `design-notificaciones/PorRol.dc.html`
- `design-notificaciones/Push.dc.html`
- `public/screenshots/ingreso-narrow.png`
- `public/screenshots/inicio-narrow.png`
- `public/screenshots/inicio-wide.png`
- `tests/unit/guards/paleta-secundaria.guardia.test.ts`
- `tests/unit/guards/contraste-tokens.guardia.test.ts`
- `tests/unit/guards/impresion-tokens.guardia.test.ts`
- `tests/unit/guards/impresion-sin-dark.guardia.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`
- `tests/unit/guards/marca-texto-amarillo.guardia.test.ts`
- `tests/unit/tablero-dia/color-contador.guardia.test.tsx`
- `tests/components/TableroDiaComposicion.test.tsx`
- `tests/unit/guards/marca-pwa-capturas-iconos.guardia.test.ts` (nombre del leader; se confirma en T0)
- `specs/SL-33-paleta-secundaria/requirements.md`
- `specs/SL-33-paleta-secundaria/design.md`
- `specs/SL-33-paleta-secundaria/tasks.md`
- `progress/impl_SL-33.md`
- `progress/features/SL-33.md`

T0 trae archivos de `dev` por merge; no cuentan como tocados por esta feature. Si T0 trae capturas
con otros nombres, se corrige esta lista en el mismo commit.
