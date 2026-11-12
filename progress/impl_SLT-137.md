# impl SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» — tanda backend (T0, T1, T2.1)

backend_dev, 2026-11-12. Base desechable propia `slt137_cola` (base nueva + `prisma migrate deploy` +
`db:seed`; 322 migraciones, 7 roles). Grafo MCP: no consultado (el worktree no está indexado según
`design.md`); todo con Grep/Read.

## T0 — comprobaciones

- **T0.1** `origin/dev` = `868627c3` (= merge-base; la rama no tiene nada que traer). SLT-106 «Bodega
  satélite: A consolidar con la cola única» **no** está en `origin/dev` (`git log origin/dev | grep
  SLT-106` vacío): T2.2+ siguen esperando.
- **T0.2** Censo repetido con `grep -rl` en `tests/` y `e2e/`:
  - `ColasPaginacion.test.tsx`: su única mención de `ListaComprobantes` es un comentario (l. 690) y el
    archivo no monta `CierreDiaModule` ni nombra `/cierre-dia` → **sale de `## Archivos esperados`**.
  - Archivos que el censo encuentra y `## Archivos esperados` no lista (para que el leader decida en
    T2.4; todos de pantalla, ninguno de esta tanda):
    - con `getByRole("region", { name: "Cierres solicitados" })` + «Ver del cierre»:
      `tests/components/CierreDiaDetalleUnico.test.tsx`, `tests/components/CierreEvidenciasVarias486.test.tsx`;
    - con «Ver del cierre»: `tests/components/CierreDiaComprobanteMarcasDeOrigen.test.tsx`;
    - con `region: "Cierres solicitados"`: `tests/components/descarga/CierresDescargaColumnas.test.tsx`;
    - con `PAGINACION_PASADOS_LABEL`: `tests/components/paginacion/paginacion-transversal.test.tsx`.
    El design conserva la región «Cierres solicitados» (ahora la da `ColaCierres`) y el nombre «Ver del
    cierre del <día>», así que pueden seguir verdes sin tocarlos; hay que correrlos en T2.4.
    - Solo comentarios o el título del dataset (no cambian): `CierreDiaModuleIncidente.test.tsx`,
      `CierreDiaPage.test.tsx`, `tests/unit/actions/cierre-dia-descarga-action.test.ts`,
      `tests/unit/config/paginacion-dominios.test.ts`, `contadores-cabecera.guardia.test.ts`,
      `criterio-unico.guardia.test.ts`, `historicos-paginados-where.test.ts`,
      `cierre-dia-pasados-paginado.test.ts`. `CierreFacturaResumenPropio` lo prueban
      `CierreBodegaTarjetaCascada`, `CierreFacturaFechaCR` y `CierreMotivoRechazoSoloRechazado`
      montando el componente directamente: no se borra (SLT-115), siguen igual.
- **T0.3** `pnpm run test:guardias` en limpio: 341/344 archivos verdes. Los 3 rojos:
  `dependencias-declaradas-presentes` (en `tests/baseline-rojos.json`, heredado) y dos timeouts por
  carga (`catalogo-postgres-acota-esquema`, `otp-debug-solo-en-pruebas`), que corridos solos dan
  2/2 archivos y 18/18 tests verdes.

## Archivos

Producción:
- `lib/interfaces/services/ICierreDiaService.ts` — `CierrePasadoDTO.pendientePagoMensajero?` y
  `LecturasPendienteCierre`.
- `lib/services/CierreDiaService.ts` — parámetro opcional `pendientes` al final del constructor y
  `conPendientePago` desde `listarCierresPasadosPaginado`.
- `lib/actions/cierre-dia.ts` — `buildService()` inyecta los dos repositorios reales.
- `components/private/cierres/cola/cola-propia-vista.ts` (T2.1) — textos, columnas, `destinoPropio`,
  `pagoPropioDe`, `textoPagoPropio`.

Tests:
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts` (nuevo, 7 casos).
- `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` (nuevo, 1 caso).
- `tests/integration/db/cierre-dia-pendiente-pago.test.ts` (nuevo, 5 aserciones, Postgres real).
- `tests/unit/utils/cola-propia-vista.test.ts` (nuevo, 14 casos).
- `tests/unit/guards/liquidacion-money-safe.test.ts` — censa `cola-propia-vista.ts` (su auto-captura
  lo exige al crear el archivo; T2.5 añadirá `TablaColaPropia.tsx`). Aviso: SLT-106 toca este archivo;
  la línea va al final de la lista.

Decisión anotada: en `columnasColaPropia` Recaudado y Ganancia van alineadas a la derecha, como los
importes de la cola de la central; el design no lo fija.

## R → test

| R | Test |
|---|---|
| R164 | `tests/integration/db/cierre-dia-pendiente-pago.test.ts` casos 2 y 4; `tests/unit/services/cierre-dia-pendiente-pago.test.ts` «solo los aprobados…», «suma el premio vivo…» |
| R165 | `tests/unit/services/cierre-dia-pendiente-pago.test.ts` «UNA vez por pagina…», «lista vacia», «sin las lecturas…»; `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`; integración caso 5 |
| R159 (servidor: el archivo no cambia) | unit «el archivo de «Descargar»… no lee pagos ni premios» |
| R72 | sin migraciones, sin escrituras: integración caso 4 (snapshots iguales antes y después) |
| R157 | `tests/unit/utils/cola-propia-vista.test.ts` «pagoPropioDe / textoPagoPropio» |
| R155, R160, R180 | `cola-propia-vista.test.ts` «textos de la cola propia» |
| R60, R156 (columnas y destino) | `cola-propia-vista.test.ts` «columnas y destino» |
| R71 | `liquidacion-money-safe.test.ts` censa `cola-propia-vista.ts` |

R60/R155-R160/R163/R166/R181 en pantalla: T2.2-T3 (frontend), pendientes.

## Mutaciones (T1.2 y T1.3)

Aplicadas de una en una con `perl`, test corrido, archivo restaurado desde copia y comprobado con
`cmp`. `git status` final sin cambios en los archivos mutados.

| # | Mutación | Resultado | Aserción que cae |
|---|---|---|---|
| cableado | quitar el objeto `{ liquidaciones, premios }` de `buildService()` | MATADA | `expected [ … ] to have a length of 9 but got 8` |
| 1 | `sumarVigentesPorCierre` sin `...VIGENTE` | MATADA | caso 2: `expected '2000.00' to be '2500.00'` |
| 2 | `pagadoVigente: "0.00"` fijo | MATADA | caso 2: `expected '3500.00' to be '2500.00'` |
| 3 | sin filtro de aprobados (ids = todos y pendiente en toda fila) | MATADA | caso 2: `expected '800.00' to be null` |
| 4 | `cierresDeMensajeroWhere` devuelve `{}` | MATADA | caso 1: `length of 4 but got 5`; caso 3: incluye el cierre de M2 |
| 5 | `premiosVivos: "0.00"` fijo | MATADA | caso 2: `expected '1000.00' to be '1250.00'` |

Nota: la mutación 3 solo sobre los `ids` (manteniendo el ternario por estado) no cambia nada visible en
la integración; la mata el unit test («`toHaveBeenCalledWith(["c-apr"])`»).

## Salidas

Todo con `DATABASE_URL` exportada a `slt137_cola`.

- Typecheck (`NODE_OPTIONS=--max-old-space-size=8192`): `✓ typecheck paso` (0 errores).
- Lint: `✓ lint paso` (0 errores; los 243 warnings son del árbol, ninguno de los archivos tocados).
- Tests de la tanda:
  ```
  pnpm exec vitest run tests/unit/services/cierre-dia-pendiente-pago.test.ts \
    tests/integration/actions/cierre-dia-pendiente-cableado.test.ts \
    tests/integration/db/cierre-dia-pendiente-pago.test.ts \
    tests/unit/utils/cola-propia-vista.test.ts tests/unit/services/cierre-dia-pasados-paginado.test.ts
   Test Files  5 passed (5)
        Tests  34 passed (34)        (0 skipped: la integración corrió contra Postgres)
  ```
- `vitest related --run` de `CierreDiaService.ts`, `cierre-dia.ts`, `ICierreDiaService.ts`: 383 archivos,
  272 verdes, 111 rojos, 22 tests rojos. Los rojos son del entorno, no del cambio:
  - 76 + 30 + 3 suites caen en `beforeAll` con «tabla `orden` vacía» / «faltan la zona central… una
    orden»: la base desechable solo tiene catálogos (`db:seed`), y esas suites toman FKs de órdenes
    existentes; 18 más son el `afterAll` de esas mismas (`reading 'prisma'`).
  - `ConfiguracionDescarga.test.tsx`: verde corrido solo (carga).
  - `wallet-page.test.tsx` (2 rojos): **igual de rojo con los tres archivos de producción devueltos a
    `HEAD`** (comprobado y restaurado).
  - `estado-cuenta-saldo-corrido`, `premio-ranking-idempotencia`, `wallet-458-migration`: en
    `tests/baseline-rojos.json`.
- Guardias (`./init.sh`, 2.ª corrida, tras los arreglos de abajo): 299/300 archivos verdes. El rojo
  es `jobs-handler-por-tipo.guardia.test.ts`: `JobTipo` del cliente de Prisma trae
  `factura_plataforma_cerrar`, que no existe en este árbol (ni en `db/` ni en `lib/`) ni en la base
  `slt137_cola`: el cliente generado del `node_modules` compartido lo regeneró otro worktree entre la
  1.ª y la 2.ª corrida (en la 1.ª esa guardia pasó). No se corrió `prisma generate` (prohibido).
- Dos rojos que sí eran míos, ya corregidos (1.ª corrida del gate):
  - `pagos-captura.guardia`: `LecturasPendienteCierre` con `Pick<IRepo, …>` metía las interfaces de
    los repositorios (y `@prisma/client`) en el grafo del navegador, porque `ICierreDiaService.ts` lo
    importa la pantalla. Ahora la interfaz se declara por la forma de los dos métodos.
  - `superficie-de-uso.guardia`: `cola-propia-vista.ts` aún no lo monta nadie (T2.2). Lleva
    `@sin-superficie` con el motivo; la propia guardia obliga a quitarlo cuando T2.2 lo monte.

## Tamaño (T1.4)

`node scripts/tamano-pr.mjs` / `./init.sh`: **9/40 archivos, 835/1000 líneas** (aviso), con T1 y T2.1.

Lo que falta según `tasks.md > Tamaño`: `ColaCierres.tsx` ~20, `TablaColaPropia.tsx` ~40-80 (el bloque de
~150 ya gastó 110 en `cola-propia-vista.ts`), `CierreDiaModule.tsx` ~95, `CierreDiaColaPropia.test.tsx`
~120 (del bloque de ~190 ya van 136 en `cola-propia-vista.test.ts`), tests y guardias adaptados ~90,
E2E ~50 → **~415-455 más; proyección ~1 250-1 290 > 1 000. Disparo: PARA.** Decide Carlos entre el
corte en tres de `requirements.md > PA1` o `tamano-pr-aceptado`.

Dónde se fue el tamaño: los tests de T1 (171 + 68 + 280 = 519) frente a ~275 estimados; la integración
sola son 280 (corpus C1-C4 + M2 sembrado a mano, sin catálogos de órdenes).

## Veredicto

T0, T1.1-T1.3 y T2.1 hechos y verdes, cinco mutaciones + cableado matadas; T1.4 medido y en PARA por
tamaño (proyección > 1 000), con el gate local rojo solo por el cliente de Prisma compartido.

---

# Tanda pantalla (F2.3, T2.2-T2.6, T3) — frontend_dev, 2026-11-12

Primer plano, sin subagentes. `DATABASE_URL` exportada a `slt137_cola` antes de cada vitest (URL nunca
impresa). Grafo MCP no consultado: todo con Grep/Read.

## F2.3 — merge de `origin/dev` (SLT-106 dentro)

`git merge origin/dev` → un conflicto, el previsto: `tests/unit/guards/liquidacion-money-safe.test.ts`,
las dos ramas añadían una línea al final de la lista. Quedan las dos (`cola-propia-vista.ts` de SLT-137 y
`ConsolidacionBodegaModule.tsx` de SLT-106). Sin migraciones nuevas. Merge `eca18e2d`.

## Archivos

Producción:
- `components/private/cierres/cola/ColaCierres.tsx` — tipo `propios` (`ColaCierresPropiosProps`), el
  `aria-label` del `TabsList` y una rama más en el cuerpo. 34 líneas de diff (diseño: ~20): la unión de
  cuatro tipos y el `TabsList` los parte el formateo en varias líneas; la lógica de satélite y de
  mensajeros/central no se toca.
- `components/private/cierres/cola/TablaColaPropia.tsx` (nuevo) — `AccionesColaPropia` y
  `columnasTablaPropia(acciones)`: las ocho columnas con sus celdas. **Decisión:** exporta COLUMNAS y no
  un `<DataTable>` propio; la tabla la pinta `TablaCola` dentro de `ColaCierres.tsx`. Así la cola sigue
  siendo UNA instancia de `<DataTable>` en el censo (`cobertura-tablas.guardia` cuenta instancias por
  archivo) y no nace una tabla nueva que declarar.
- `components/private/cierres/cola/cola-propia-vista.ts` — fuera el `@sin-superficie`; `VER_PROPIA`
  («Ver»). **Desvío del design:** `VER_DETALLE_LABEL` no se queda en `CierreDiaModule.tsx`: su único uso
  era el botón, que ahora vive en la cola, y dejarlo sería una constante muerta (lint). No la importaba
  ningún test (no estaba exportada).
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` — monta `ColaCierres tipo="propios"`; fuera
  `ListaComprobantes`, `CierreFacturaResumenPropio`, `fechaCalendarioCR` (sin uso) y el `aria-label` de
  la `<section>` externa.

Tests:
- `tests/components/CierreDiaColaPropia.test.tsx` (nuevo, 9 casos).
- `tests/components/CierreDiaModule.test.tsx` — los dos casos del histórico leen la fila de la cola; caso
  nuevo de R160 (tras solicitar, la cola relee y enseña el cierre nuevo).
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx` — el listado del mensajero vuelve a `table`.
- `tests/components/descarga/CierresDescargaColumnas.test.tsx` (**fuera de `## Archivos esperados`**, lo
  señaló T0.2): «Descargar» ya no está DENTRO de la región «Cierres solicitados» (que ahora es la tabla
  de la cola) sino en la barra de la misma sección; el registro gana `seccion` (la `<section>` del `h2`).
- Guardias: `censo-tablas.ts` (cuarto montaje de la cola), `cobertura-tablas.guardia.test.ts` (3 → 4
  montajes), `cascada-central-en-las-dos-pantallas.guardia.test.ts` (fuera el comprobante propio;
  ahora afirma que NO se monta), `cierres-fecha-cr.guardia.test.ts` (barre también
  `components/private/cierres/cola`, donde vive el «Ver del cierre del <día>»),
  `liquidacion-money-safe.test.ts` (censa `TablaColaPropia.tsx`).
- `CierreDiaDetalleUnico.test.tsx`, `CierreEvidenciasVarias486.test.tsx`,
  `CierreDiaComprobanteMarcasDeOrigen.test.tsx`, `CierresDescarga.test.tsx`, `paginacion-transversal`,
  `ColasPaginacion`: verdes SIN cambios (la región «Cierres solicitados» y «Ver del cierre del <día>» se
  conservan).
- `ColaCierres.test.tsx`, `ColaCierresBodega.test.tsx`, `ColaCierresConsolidar.test.tsx`: verdes sin
  cambios (R163).

E2E: `e2e/cierre-dia.spec.ts` (T3.2), `e2e/cierres-rediseno.spec.ts` (T3.1, caso nuevo «mensajero A: su
cola…»; literales derivados a mano en su cabecera: P 3.000 ≤ E 70.000 → pendiente 0 → «Liquidado»; la
satélite rechazada → «Motivo: «Faltan paquetes»»).

## R → test (pantalla)

| R | Test |
|---|---|
| R60 | `CierreDiaColaPropia.test.tsx` «R60/R156…»; `e2e/cierres-rediseno.spec.ts` «mensajero A: su cola…» |
| R71 | `liquidacion-money-safe.test.ts` (censa `TablaColaPropia.tsx` y `cola-propia-vista.ts`) |
| R155 | `CierreDiaColaPropia.test.tsx` «R155…» |
| R156 | `CierreDiaColaPropia.test.tsx` «R60/R156…»; `CierreDiaModule.test.tsx` «R18: el histórico…» |
| R157 | `CierreDiaColaPropia.test.tsx` «R157…»; E2E «mensajero A: su cola…» (Liquidado y Motivo) |
| R158 | `CierreDiaColaPropia.test.tsx` «R158…» |
| R159 | `CierresDescarga.test.tsx` y `CierresDescargaColumnas.test.tsx` (mismo título, columnas, ámbito) |
| R160 | `CierreDiaColaPropia.test.tsx` (vacío, error, paginación); `CierreDiaModule.test.tsx` «SLT-137 R160…»; `BajoRiesgoPaginacion.test.tsx` |
| R163 | `ColaCierres.test.tsx`, `ColaCierresBodega.test.tsx` sin cambios y verdes |
| R166 | `CierreDiaColaPropia.test.tsx` «R166…» (marcadores ausentes); `cascada-central…guardia` (sin `CierreFacturaResumenPropio`); `censo-tablas.ts` |
| R181 | `CierreDiaColaPropia.test.tsx` «R181…»; E2E «mensajero A: su cola…» («Ver» abre el detalle) |

## Mutaciones (a mano, restauradas con `cmp`/`git diff --quiet`)

| Mutación | Resultado | Aserción que cae |
|---|---|---|
| `refrescarListas()` sin el `mutate` de `cierre-dia:pasados` | MATADA | R160: «Unable to find role="button" and name "Ver del cierre del 2026-07-19"». La 1.ª versión del caso SOBREVIVÍA (la revalidación del montaje traía el cierre nuevo); se arregló esperando esa revalidación antes de cambiar la respuesta. |
| `Number(pendiente)` en `cola-propia-vista.ts` | MATADA | `liquidacion-money-safe`: «ningún archivo de la feature convierte un monto a número» |

## Salidas

- typecheck: `pnpm run typecheck` → exit 0, 0 errores.
- lint: `pnpm run lint` → 0 errores (243 warnings del árbol, ninguno de los archivos tocados).
- Tests tocados: `vitest related --run` de los 4 archivos de producción → **44 archivos, 759/759 verdes**.
  `CierreDiaColaPropia` 9/9; `CierreDiaModule` 77/77; `BajoRiesgoPaginacion` + `CierresDescargaColumnas`
  13/13.
- Guardias: `pnpm run test:guardias` → 343/344 archivos; el rojo es `dependencias-declaradas-presentes`
  (4 tests, en `tests/baseline-rojos.json`).
- `./init.sh` (T2.6): `== init OK ==` (typecheck, lint, test:rapido, down.sql, `.env`).
- Tamaño (`node scripts/tamano-pr.mjs`): **22/40 archivos, 1 465/1 000 líneas** (aceptado por Carlos;
  pasa de ~1 400: lo de más es el test de integración, 280, y el de pantalla, 207).
- E2E (T3.3), con el candado, puerto 3000, base desechable nueva `slt137_e2e_*` (`migrate deploy` +
  `db:seed`), `next build` con `NEXT_PUBLIC_APP_URL=http://localhost:3000` y `next start`, `--retries=0`:
  - `pnpm exec playwright test --project=dinero` (incluye `cierre-dia`, `cierres-rediseno` con el caso
    nuevo, `cierre-vencido-modelo`, `reglas-bloqueos-cierre`, `tarifas-valor-propio-mensajero`,
    `tope-intentos-por-empresa`, `cierre-modelo-nuevo-plan-porcentual`): **101 passed**, 0 flaky.
  - `e2e/mis-asignaciones.spec.ts` (el único de `grep -rl "cierre-dia" e2e/` fuera de `dinero`):
    **4 passed**.

## Veredicto (tanda pantalla)

T2.2-T2.6 y T3 hechos y verdes (unit/componentes 759/759, guardias solo con el rojo del baseline,
`./init.sh` OK, E2E 105/105); tamaño 22/40 archivos y 1 465 líneas, por encima de ~1 400.

## Cierre del leader (2026-11-12)
- Review vuelta 1 OK (b6b36de0). Menores a deuda: `ERROR_PROPIA` sin uso en pantalla; regex de voseo con `` no ve tildes finales; R164 dice «min(P,E)» y el código usa P − min(P,E) (corregir redacción en SLT-138).
- Tamaño real 1 465 líneas (427 producción, 1 038 tests).
