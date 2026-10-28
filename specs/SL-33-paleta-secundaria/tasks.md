# SL-33 — paleta-secundaria · tasks.md

> Requisitos en `requirements.md` (R1–R16). Decisiones técnicas en `design.md` (D1–D11). Todo es
> zona frontend: lo implementa `frontend_dev`.
>
> El gate lo corre CI. En local, al cerrar cada tarea, se corren estos tres:
> - `pnpm exec vitest related --run <archivos tocados>`;
> - `pnpm run test:guardias`;
> - `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`.
>
> No se pide `./init.sh`.
>
> **No se empieza T2 sin respuesta a P1** (`requirements.md > Preguntas abiertas`). P2 no bloquea.

## Tareas

- [ ] **T0 — Traer `dev` (SL-9).** Merge de `origin/dev` en la rama. Comprobar que llegan
  `scripts/capturas-pwa.mjs`, la guardia de capturas de SL-9 y `specs/SL-9-marca-pwa-capturas-iconos/`.
  Anotar en `progress/impl_SL-33.md` dos cosas: el nombre real de la guardia y su umbral actual. Si
  el nombre no es el de «Archivos esperados», corregir la lista aquí.
  **Hecho:** merge sin conflictos, o con conflictos resueltos, y los tres artefactos presentes en el
  árbol.

- [ ] **T1 — Guardia nueva, en rojo** (R1–R13, R16; D9). Depende de T0. Crear
  `tests/unit/guards/paleta-secundaria.guardia.test.ts` con los literales de D2, D4 y D5:
  - la tabla aprobada;
  - los pares grises con su «antes»;
  - la familia por contador.

  Cada bloque lleva su caso sintético. Usa solo el fixture `tests/fixtures/contraste.ts`.
  **Hecho:** los sintéticos en verde y los casos reales en rojo, por el valor y no por un error de
  lectura. Se pega la salida en `progress/impl_SL-33.md`.

- [ ] **T2 — Los 20 `--chart-N`** (R1, R2, R3; D1, D2). Depende de T1. En `app/globals.css`, la
  columna «Claro» va a tres bloques:
  - `:root, .tema-claro`;
  - `.papel-al-imprimir`;
  - el bloque de impresión de la 224.

  La columna «Oscuro» va a `.dark` y a `.tema-sistema`.
  **Hecho:** los casos R1–R3 de la guardia nueva en verde, y `tema-encendido.guardia`,
  `impresion-tokens.guardia` y `analytics-paleta.test.ts` en verde.

- [ ] **T3 — Pares del monitoreo** (R4, R5, R6; D3, D4). Depende de T2.
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

- [ ] **T4 — Grises a `stone`** (R7, R8, R9, R10, R11; D5, D7). Depende de T1 y de P1.
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

- [ ] **T6 [P] — `docs/marca.md`** (R13, R16; D10). Depende de T2, T3 y T4. Tablas de D2 y D5, con
  las cifras del fixture. Se quita la línea «No cambian con la marca: … los `--chart-*` …».
  **Hecho:** el caso R13 de la guardia nueva en verde.

- [ ] **T7 — Verificación en el navegador.** Depende de T2 a T6.
  - Montaje: `pnpm dev -p 3044` con solo la `DATABASE_URL` local, en claro y en oscuro.
  - Pantallas: `/analitica`, `/monitoreo`, `/ranking` y `/`.
  - Comprobar cuatro cosas:
    - las series de analítica se distinguen;
    - la barra y las tarjetas del monitoreo concuerdan por color;
    - el podio se lee;
    - los títulos de la landing ya no salen navy.
  - Anotar el punto 1 de D5: si el botón `secondary` sobre el fondo se pierde.

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

## Archivos esperados

- `app/globals.css`
- `components/ui/badge.tsx`
- `app/(app)/monitoreo/_components/contadores.ts`
- `docs/marca.md`
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
