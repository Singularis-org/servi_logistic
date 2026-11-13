# SLT-149 «Fábrica de dobles de ICierresAdminRepository» — requirements (ruta ligera)

Requisitos con numeración global: **R430-R439** (SLT-147 usa R410-R419; SLT-148, R420-R429).

## Alcance

Deuda D69: cada método nuevo de `ICierresAdminRepository` obliga a tocar a mano 12-13 archivos de
test que construyen su propio doble (lo pagaron SLT-113, SLT-140 —«12 dobles de una línea», 33
archivos en su PR— y SLT-141). Esta feature crea **una fábrica única** del doble en `tests/` y migra a
ella todos los dobles hechos a mano de ese interfaz. Una guardia impide que vuelvan.

**Solo tests.** Cero cambios en `lib/` o `app/`. Todos los tipos que la fábrica necesita ya se
exportan desde `lib/interfaces/repositories/ICierresAdminRepository.ts`; si al implementar falta
alguno, se para y se pregunta (no se exporta por cuenta propia).

### Lo que ya existe

Buscado `fábrica de dobles`, `doble compartido`, `fakeRepo`, `ICierresAdminRepository` en
`feature_list.json`, `specs/` y `tests/`:
- No hay ninguna ficha ni spec previo con este objetivo.
- Precedente de forma que se reutiliza: `tests/fixtures/retenidas-doble.ts` (`sinRetenidas()` /
  `conRetenidas()`): un doble compartido hecho con `vi.fn`, con valor neutro por defecto.
- `tests/fabricas/` existe, pero guarda fábricas de datos y escenarios con base real
  (`tests/fabricas/escenarios/cierres.ts` usa el repositorio real): no es sitio para dobles.
- Nota para el leader: **D69 no está escrita en `progress/deudas.md`** (ni en el worktree ni en la
  raíz; la última es D66). Su origen está en `progress/features/SLT-140.md` (líneas 17 y 32).

### Inventario de dobles de `ICierresAdminRepository` (origin/dev, 2026-11-13)

Interfaz: `lib/interfaces/repositories/ICierresAdminRepository.ts:431`, con 20 métodos obligatorios (corregido en la implementación: la tabla D2/D3 trae 20) y
1 opcional (`contarSenalesPorCierre?`, línea 518).

**A. Dobles completos** (literal tipado con el interfaz entero; son los que rompen al añadir un
método obligatorio — los 12 que tocó SLT-140):

| # | Archivo | Línea |
|---|---|---|
| A1 | `tests/unit/services/cierres-admin-service.test.ts` | 100 (`fakeRepo`; `repoCon` en 603 lo envuelve) |
| A2 | `tests/unit/services/cierres-admin-aviso-rechazo.test.ts` | 87 (`fakeRepo(traza, …)`) |
| A3 | `tests/unit/services/cierres-admin-ajustar-pago.test.ts` | 64 |
| A4 | `tests/unit/services/cierres-admin-corregir-resultado.test.ts` | 53 |
| A5 | `tests/unit/services/cierres-admin-corregir-pagos.test.ts` | 47 |
| A6 | `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts` | 53 |
| A7 | `tests/unit/services/cierres-admin-indemnizacion.test.ts` | 38 |
| A8 | `tests/unit/services/cierres-admin-pendiente.test.ts` | 54 (`repoConDetalle` en 429 lo envuelve) |
| A9 | `tests/unit/services/cierres-admin-tope-sin-gestion.test.ts` | 43 |
| A10 | `tests/unit/services/CierresAdminService.aprobar.devolucion.test.ts` | 38 |
| A11 | `tests/unit/services/indemnizacion-tope-negocio-cierre.test.ts` | 40 (`fakeRepo(delCierre)`) |
| A12 | `tests/unit/services/liberacion-al-aprobar-cierre.test.ts` | 74 (`fakeRepo(traza, resolver)`) |

**B. Dobles parciales con cast** (`as unknown as ICierresAdminRepository`; no rompen al compilar,
pero son dobles a mano y esconden un método no doblado hasta que alguien lo llama):

| # | Archivo | Línea del cast |
|---|---|---|
| B1 | `tests/unit/services/cierres-admin-completo.test.ts` | 238 |
| B2 | `tests/unit/services/cierres-admin-filtro-estado.test.ts` | 80 |
| B3 | `tests/unit/services/cierres-admin-historico-paginado.test.ts` | 164 |
| B4 | `tests/unit/services/cierres-admin-pendientes-paginado.test.ts` | 171 |
| B5 | `tests/unit/services/cierres-admin-detalle-lectura.test.ts` | 72 (`fakeRepo`), cast en 108 |
| B6 | `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts` | 197 |
| B7 | `tests/unit/services/cierres-admin-retenidas.test.ts` | 54 (`fakeRepo`), cast en 74 |
| B8 | `tests/unit/services/cierres-admin-senales-cola.test.ts` | 52 (`fakeRepo`), cast en 59 |
| B9 | `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts` | 166 |
| B10 | `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts` | 120 (`& {…}`) |
| B11 | `tests/unit/services/CierresAdminService.gestiones-completo.test.ts` | 137 (`& {…}`) |
| B12 | `tests/unit/services/cierre-desglose-tres-superficies.test.ts` | 249 |

**Fuera del inventario (comprobado):** los 21 archivos de `tests/integration/db/` y los 10 de
`tests/unit/repositories/` que nombran el interfaz usan el repositorio real o solo importan tipos
(ninguno contiene cast, `satisfies` ni función que devuelva el interfaz); `tests/fixtures/anclaje-devolucion.ts`
y `tests/unit/services/liquidacion-service.test.ts` solo importan tipos.

### Lo que NO entra

- **Repositorios vecinos.** `ICierreDiaRepository` (~12 archivos con doble propio) e
  `ICierreBodegaRepository` (~4) tienen la misma forma, pero no hay churn medido que lo pida y
  meterlos rompe el tope del PR (27 + ~16 > 40). Recomendación: ficha aparte solo si un método
  nuevo de esos interfaces vuelve a obligar a tocar más de 5 archivos.
- Cambios en `lib/` o `app/` (incluido exportar tipos nuevos o volver obligatorio
  `contarSenalesPorCierre`).
- Cambiar qué afirma cualquier test: solo cambia cómo se construye el doble.

## Decisiones del spec (técnicas; las propone el spec_author)

| # | Decisión | Motivo |
|---|---|---|
| D1 | La fábrica vive en `tests/fixtures/dobles/cierres-admin-repository.ts` y exporta `dobleCierresAdmin(sobrescrituras?)`. | Junto al precedente `tests/fixtures/retenidas-doble.ts`; `tests/fabricas/` es de datos con base real. |
| D2 | Los valores por defecto son los que ya comparten los 12 dobles completos (tabla abajo). | Así la mayoría de las migraciones no pasa ninguna sobrescritura y el comportamiento del doble no cambia. |
| D3 | `findGestionesDeCierresEnAlcance` devuelve un `Map` vacío, no el `throw` que copió SLT-140. | El `throw` era un marcador mecánico, no una aserción: si alguna suite lo llamara, hoy estaría en rojo. Un `Map` vacío es el «no hay» documentado en el interfaz (línea 568). Quien quiera afirmar que no se llama usa `expect(…).not.toHaveBeenCalled()`. |
| D4 | Los métodos opcionales (hoy solo `contarSenalesPorCierre`) NO vienen por defecto. | Es lo que hacen hoy todos los dobles; añadirlo cambiaría el camino del servicio (pinta señales) en suites que no lo miden. |
| D5 | Un `fakeRepo` local puede quedarse como envoltorio de una línea sobre la fábrica (p. ej. el de A2/A12, que recibe `traza`). | Minimiza el diff en las aserciones y en los nombres que usan los `it`. |
| D6 | Dos defensas: la fábrica tipada (el typecheck rompe en un solo sitio) **y** una guardia textual de las formas a mano. | La guardia sola es frágil frente a formas nuevas; el tipo solo no impide un cast nuevo. |

Valores por defecto (D2/D3):

| Método | Por defecto |
|---|---|
| `leerTopeIntentos` | `3` |
| `findCierresByAlcance`, `findHistoricoCompleto`, `findColaCompleta`, `findGestionesIncidenteDelCierre`, `findGestionesRetornablesDelCierre`, `findBarridasDelCierre`, `findGestionesPorAlcanceCompleto`, `findRechazosTiendaModeloNuevoCompleto` | `[]` |
| `findHistoricoPaginado`, `findColaPaginada` | `{ items: [], total: 0 }` |
| `findCatalogoFiltros` | `{ zonas: [], mensajeros: [], mensajerosFiltro: [] }` |
| `findCierreByIdEnAlcance`, `findGestionEditableEnCierre` | `null` |
| `findGestionesDeCierresEnAlcance` | `new Map()` |
| `resolverCierre`, `forzarSolicitudVencido` | `"updated"` |
| `actualizarPagosGestion`, `corregirResultadoGestionEnCierre`, `ajustarPagoMensajeroEnCierre` | `{ status: "conflict" }` |

Si al migrar un archivo su doble no coincide con esta tabla en algún método, ese método pasa como
sobrescritura en ese archivo (R436). La tabla no se cambia para acomodar un archivo.

## Requisitos (EARS)

- **R430** — La suite DEBE ofrecer una única fábrica, `dobleCierresAdmin`, que devuelva un objeto que
  cumple `ICierresAdminRepository` con cada método obligatorio como `vi.fn` con el valor por defecto
  de la tabla de D2/D3.
- **R431** — CUANDO un test pasa sobrescrituras a la fábrica, la fábrica DEBE devolver el doble con
  esos métodos reemplazados por los dados y el resto con su valor por defecto, y cada método del
  doble DEBE poder inspeccionarse como mock (`.mock.calls`) sin cast en el test.
- **R432** — DONDE el interfaz declare un método opcional, el doble de la fábrica NO DEBE incluirlo
  salvo que el test lo pase como sobrescritura.
- **R433** — SI falta en la fábrica un método obligatorio del interfaz, ENTONCES `pnpm run typecheck`
  DEBE fallar en el archivo de la fábrica, y el test de completitud DEBE fallar nombrando ese método.
- **R434** — CUANDO se añade un método obligatorio a `ICierresAdminRepository`, el typecheck de
  `tests/` DEBE fallar solo en la fábrica (ningún otro archivo de test necesita cambiar para volver
  a compilar).
- **R435** — Los 24 archivos del inventario (A1-A12, B1-B12) DEBEN construir su doble de
  `ICierresAdminRepository` con la fábrica, directamente o a través de un envoltorio local que la
  llama.
- **R436** — CUANDO un archivo se migra, cada método cuyo comportamiento en el doble anterior difiera
  del valor por defecto de la fábrica DEBE pasarse como sobrescritura con el mismo comportamiento,
  con la única excepción de D3.
- **R437** — CUANDO un archivo se migra, sus aserciones NO DEBEN cambiar: mismo número de `expect(`
  por archivo, mismos títulos de `describe`/`it`, y el mismo número de tests en verde que antes de
  migrarlo.
- **R438** — SI un archivo de `tests/` distinto de la fábrica construye a mano un doble de
  `ICierresAdminRepository` —un cast `as ICierresAdminRepository` o `as unknown as
  ICierresAdminRepository` (también con `& {…}`), un `satisfies ICierresAdminRepository`, o una
  función con ese tipo de retorno (o un alias local de él) que devuelve un literal de objeto—,
  ENTONCES `pnpm run test:guardias` DEBE fallar nombrando `archivo:línea`.
- **R439** — La guardia de R438 DEBE probar que muerde: con un texto de ejemplo de cada forma
  prohibida DEBE detectarlo, y con un doble hecho con la fábrica (también con un envoltorio local)
  NO DEBE detectarlo.

## Tasks

- [x] **T1 — Fábrica** (R430, R431, R432). Crear `tests/fixtures/dobles/cierres-admin-repository.ts`
  con `dobleCierresAdmin(sobrescrituras?: Partial<ICierresAdminRepository>)`. Los defaults se
  declaran en un objeto con tipo que exige TODOS los métodos obligatorios (sin cast, sin `Partial`),
  para que un método que falta sea un error de tipo en ese archivo. El tipo de retorno expone cada
  método como mock tipado. Comentarios: el porqué de D3 y D4.
  *Hecho:* typecheck verde; el archivo no importa nada de `lib/` salvo tipos.
- [x] **T2 — Test de completitud** (R430-R433). `tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts`:
  lee el texto de `lib/interfaces/repositories/ICierresAdminRepository.ts`, extrae los miembros del
  bloque `interface ICierresAdminRepository`, y afirma: (a) cada obligatorio existe en
  `dobleCierresAdmin()` y es un mock que devuelve el default de la tabla; (b) cada opcional NO existe
  por defecto y sí al sobrescribirlo; (c) una sobrescritura reemplaza solo ese método. Mensaje de
  fallo con el nombre del método. Que la extracción no esté vacía (afirmar ≥ 20 obligatorios), para
  que no pase en verde sin comprobar nada.
  *Hecho:* verde con `pnpm exec vitest run tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts`.
- [x] **T3 — Medida antes de migrar** (R437). Antes de tocar ningún archivo del inventario, anotar en
  `progress/impl_SLT-149.md` por archivo: nº de `expect(`, nº de tests que pasan
  (`pnpm exec vitest run <archivo>`). Base desechable exportada antes de cualquier vitest.
  *Hecho:* tabla de 24 filas en el `impl`.
- [x] **T4 [P] — Migrar A1-A12** (R434-R437). Depende de T1 y T3. Sustituir el literal por la
  fábrica; lo que difiera de la tabla, como sobrescritura (anotar cuáles por archivo en el `impl`).
  Los envoltorios `repoCon` (A1) y `repoConDetalle` (A8) siguen igual sobre el `fakeRepo` migrado.
  *Hecho:* los 12 en verde con el mismo número de tests y de `expect(` que en T3.
- [x] **T5 [P] — Migrar B1-B12** (R435-R437). Depende de T1 y T3. Igual que T4; el cast desaparece. En
  B10/B11 el `& {…}` deja de hacer falta porque la fábrica ya da mocks tipados (R431).
  *Hecho:* como T4.
- [x] **T6 — Guardia de dobles a mano** (R438, R439). Depende de T4 y T5. En el mismo archivo de
  guardia de T2 o en `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts`: recorre
  `tests/**/*.{ts,tsx}` salvo la fábrica, detecta las formas de R438 (el alias local cuenta si el
  archivo declara `type X = ICierresAdminRepository`) y falla con `archivo:línea`. Incluye los
  ejemplos de R439 en memoria.
  *Hecho:* verde sobre el árbol migrado; `pnpm run test:guardias` la ejecuta.
- [x] **T7 — Mutaciones** (R433, R434, R438). Sin commitear ninguna; resultado en el `impl`:
  1. Quitar `findBarridasDelCierre` de los defaults de la fábrica → typecheck rojo en la fábrica y
     test de completitud rojo nombrando el método.
  2. Añadir a mano un método obligatorio ficticio al interfaz → typecheck rojo **solo** en la fábrica
     (listar los archivos con error: debe ser uno). Revertir.
  3. Volver a poner un cast `as unknown as ICierresAdminRepository` en uno de B1-B12 → guardia roja
     con ese `archivo:línea`.
  4. Cambiar el default de `findCierreByIdEnAlcance` a `undefined` → al menos una suite migrada roja
     (prueba de que las suites dependen de la fábrica y no de un literal superviviente).
  *Hecho:* las cuatro anotadas con su salida resumida y el árbol limpio (`git status`).
- [x] **T8 — Cierre.** `./init.sh` verde; R437 comprobado contra la tabla de T3; mapa `R<n> -> test`
  en `progress/impl_SLT-149.md`.

Mapa previsto `R<n> -> test`:
R430-R433 → `tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts` (+ mutación T7.1);
R434 → mutación T7.2; R435 → guardia de T6 sobre el árbol; R436-R437 → las 24 suites migradas en verde
con la tabla de T3; R438-R439 → guardia de T6 (+ mutación T7.3).

## Tamaño

- **Producción:** 0 archivos, 0 líneas.
- **Tests:** 26-27 archivos (24 migrados + fábrica + 1-2 guardias; `## Archivos esperados` lista las
  dos guardias por si T6 va aparte). Estimación ~1 100-1 400 líneas
  añadidas+borradas (sobre todo borradas: ~35-45 por doble completo, ~10-30 por parcial; fábrica
  ~110, guardias ~180). Por debajo de 3 000.
- **Total archivos:** 26-27 de 40 (≤ 80 % = 32). No hace falta partir.

## Archivos esperados

- `tests/fixtures/dobles/cierres-admin-repository.ts`
- `tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts`
- `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-admin-aviso-rechazo.test.ts`
- `tests/unit/services/cierres-admin-ajustar-pago.test.ts`
- `tests/unit/services/cierres-admin-corregir-resultado.test.ts`
- `tests/unit/services/cierres-admin-corregir-pagos.test.ts`
- `tests/unit/services/cierres-admin-confirmacion-fisica.test.ts`
- `tests/unit/services/cierres-admin-indemnizacion.test.ts`
- `tests/unit/services/cierres-admin-pendiente.test.ts`
- `tests/unit/services/cierres-admin-tope-sin-gestion.test.ts`
- `tests/unit/services/CierresAdminService.aprobar.devolucion.test.ts`
- `tests/unit/services/indemnizacion-tope-negocio-cierre.test.ts`
- `tests/unit/services/liberacion-al-aprobar-cierre.test.ts`
- `tests/unit/services/cierres-admin-completo.test.ts`
- `tests/unit/services/cierres-admin-filtro-estado.test.ts`
- `tests/unit/services/cierres-admin-historico-paginado.test.ts`
- `tests/unit/services/cierres-admin-pendientes-paginado.test.ts`
- `tests/unit/services/cierres-admin-detalle-lectura.test.ts`
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/services/cierres-admin-retenidas.test.ts`
- `tests/unit/services/cierres-admin-senales-cola.test.ts`
- `tests/unit/services/cierres-resumen-modelo-nuevo-descarga-service.test.ts`
- `tests/unit/services/cierres-gestiones-modelo-nuevo-descarga-service.test.ts`
- `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`
- `tests/unit/services/cierre-desglose-tres-superficies.test.ts`

## Preguntas abiertas

Ninguna para el humano. Para el leader:
- D69 no está escrita en `progress/deudas.md`: o se añade con su origen (SLT-140) antes del PR, o el
  PR la cita desde `progress/features/SLT-140.md`.
- SLT-147 y SLT-148 van en paralelo y pueden tocar estos mismos archivos de test (sobre todo
  `cierres-admin-service.test.ts` y `cierres-admin-detalle-lectura.test.ts`). Si una de ellas añade
  un método al interfaz antes de que esta se mergee, el método entra en la tabla de D2 y en la fábrica
  de esta rama al rebasar, no en los dobles a mano.
