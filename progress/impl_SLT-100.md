# SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» — bitácora de implementación

## T0–T1 · backend_dev · 2026-11-09

Base desechable propia `slt100_t1` (local, distinta de la del `.env`): `CREATE DATABASE`, `prisma migrate
deploy`, `pnpm run db:seed`. No se corrió `prisma generate`. No hay migraciones, dependencias nuevas ni
cambios de dinero.

### T0.1 — Censo de lo que lee el interior del modal del admin

`grep -l` en `tests/components/` y `e2e/` con las regiones de la tarea. Coinciden con `## Archivos esperados`
los 10 de `tests/components/` y los 9 de E2E de la lista. Lo que sale de más, clasificado a mano:

| Archivo | Qué hace | ¿Entra en el diff? |
|---|---|---|
| `tests/components/CierresAdminPage.test.tsx:468-483` | **Abre el modal del admin**: `findByRole("dialog", { name: "Detalle del cierre" })` y pulsa `within(detalle).getByRole("button", { name: "Aprobar" })` | **Sí, posible archivo extra (aviso al leader).** Sigue verde sin tocarlo solo si el diálogo nuevo conserva el nombre «Detalle del cierre» y un botón «Aprobar» accesible en el pie para el cierre `solicitado`. Si el pie lo llama distinto, hay que adaptarlo. |
| `tests/components/CierreFacturaPapel.test.tsx:370-395` | Monta `CierreFacturaDetalle` a mano en un `<Modal title="Detalle del cierre">` con `max-h-[70vh]` y «Decisión del cierre», «los MISMOS contenedores que monta `CierresAdminModule`» | No monta el módulo: no se rompe. Pero su premisa (la ruta del admin) deja de ser cierta con D12; revisarlo junto a `impresion-flujo` en T4.2. |
| `cierre-bodega-satelite.spec.ts`, `cierre-vencido-modelo.spec.ts` | Ya previstos por el design como «no cambian, se re-ejecutan» (T5.3) | No |
| `CierresAdminFiltros`, `descarga/CierresAdminDescargaDetallada`, `descarga/CierresDescarga*` (3), `paginacion/BajoRiesgoPaginacion`, `paginacion/ColasPaginacion` | Montan `<CierresAdminModule` con `verCierreDetalle: vi.fn()` pero no abren el detalle | No |
| `paginacion/paginacion-transversal` | Importa `GestionesPorResultado` de `cierre-factura` | No (T3.1 solo añade `export`) |
| `CierreBodegaDetalleGestiones`, `CierreDiaComprobanteMarcasDeOrigen`, `CierreDiaModule`, `CierreEvidenciasVarias486`, `CierreFacturaFechaCR`, `CierreFacturaFilaIncidente`, `CierreFacturaSinGestionar`, `CierreMotivoRechazoSoloRechazado`, `CierreRechazosDeTienda`, `CierresAdminRetieneReprogramadas`, `DetalleCierre` | Prueban `CierreFacturaDetalle`/comprobantes de mensajero o bodega, o el `DetalleCierre` de S1, sin el módulo del admin | No |

### T0.2 — Lugares (archivo:línea)

- `DescargaFilasResult`: `components/shared/DataTable.tsx:108`. Rama `ok`: `{ status: "ok"; filas: DescargaFila[];
  filasDetalle?: DescargaFila[]; filasDestacadas?: readonly number[]; filasDestacadasDetalle?: readonly number[] }`;
  la otra, `{ status: "error"; mensaje: string }`.
- `separarParaDevolucion`: `app/(app)/cierres-admin/_components/cierre-factura.tsx:2197` (**no exportada**).
- `efectoAlAprobar`: `app/(app)/cierres-admin/_components/cierre-factura.tsx:2212` (**no exportada**).
- `motivoGestionLegible`: `app/(app)/cierres-admin/_components/cierre-labels.ts:667` (exportada).
- `INGRESO_BODEGA_RECHAZOS_SLA_LABEL = "Automático (por plazo vencido)"`: `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx:347`.
- `INGRESO_BODEGA_RECHAZOS_MANUAL_LABEL = "Manual (mensajero)"`: `cierre-detalle-shared.tsx:348`.
  **Ojo:** T2.1 escribe la nota como «… · Manual ₡0», pero el rótulo vigente es «Manual (mensajero)». Con
  la constante, la nota sale «Automático (por plazo vencido) ₡… · Manual (mensajero) ₡…». frontend_dev decide
  el literal con la constante (design: «los rótulos son … los de hoy») y lo anota.
- Encabezados de R82 que ya existen:
  - «Nº Guía», «Destinatario», «Tienda» y «Recibido» van como literales en
    `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts:273,275,279,285`;
  - `RESULTADO_COL = "Resultado"` en `cierres-gestiones-fundida-descarga-columnas.ts:216`;
  - `PAGO_MENSAJERO_COL = "Pago mensajero"` en `app/(app)/cierres-admin/_components/cierre-labels.ts:138`.
    **Ojo:** R82 pide «Pago al mensajero», y la constante dice «Pago mensajero»;
  - «Cobro a la tienda» no tiene constante.
- `cierreAbierto`: `app/(app)/cierres-admin/_components/CierresAdminModule.tsx:1050`, `= detalle?.cierre ?? null`
  con `detalle: DetalleAbierto | null` (`:472`, interfaz en `:354`, `cierre: CierreAdminResumen`). El estado
  del destrabe es `useState<CierreAdminResumen | null>` (`:493`). `setDestrabar(cierreAbierto)` tipa **sin
  adaptador**.

### T0.3 — Escenarios E2E (escritos antes del test)

**Escenario A (modelo viejo).** Se reproduce exacto. Lo derivé leyendo:
- `lib/utils/ingreso-empresa.ts`: central → `valorFleteGam`/`valorFleteDevueltoGam`; la devolución lleva el
  IVA de `ivaFlete` y no lleva comisión;
- `lib/utils/cierre-totales.ts` (`derivarPagos`): solo `entregado` paga `cobroEntregado`;
- `lib/utils/ingreso-bodega.ts`: solo el rechazo da a la bodega `cobroRechazado`.

Entradas:
`crearEscenarioReparto(..., { tarifa: { valorFlete: 2000, valorFleteGam: 2000, valorFleteDevuelto: 2000,
valorFleteDevueltoGam: 2000, comisionCod: 1, ivaFlete: 13, ivaComisionCod: 13 }, tarifaMensajero:
{ cobroEntregado: 1500, cobroRechazado: 500 } })`. Los cuatro fletes son iguales para que la satélite dé las
mismas cifras. Un mensajero de la zona y tres órdenes:

| Orden | montoCobrar | Gestión |
|---|---|---|
| 1 | 70 000 | `entregado`, `[{ metodo: "efectivo", monto: 70000 }]` |
| 2 | 30 000 | `entregado`, `[{ metodo: "SINPE", monto: 30000 }]` |
| 3 | 15 000 (no cuenta) | `devolucion_a_origen_por_rechazo` (manual) |

| Literal | Derivación a mano |
|---|---|
| Recaudado ₡100.000,00 | 70 000 + 30 000; sin Transferencia |
| Flete con IVA 4 520,00 | 2 × (2 000 + 13 % = 260) |
| Comisión con IVA 1 130,00 | 1 % de 70 000 = 700, más 1 % de 30 000 = 300 → 1 000, + 13 % = 130 |
| Sale de lo recaudado 5 650,00 | 4 520 + 1 130 |
| Se le paga hoy a la tienda 94 350,00 | 100 000 − 5 650 |
| Flete de no entrega con IVA 2 260,00 | 2 000 + 260 |
| Total facturado 7 910,00 · IVA 910,00 | 4 520 + 1 130 + 2 260 · 520 + 130 + 260 |
| Pago al mensajero 3 000,00 | 2 entregas × 1 500 (el rechazo no paga al mensajero) |
| − pago a la bodega 500,00 | 1 rechazo × 500 |
| Le queda a la empresa 3 500,00 | 7 910 − 910 − 3 000 − 500 |
| Ganan en total 92 090,00 | 100 000 − 7 910 |
| Nota R81 | Automático 0 · Manual 500. Con los rótulos de hoy: «Automático (por plazo vencido) ₡0,00 · Manual (mensajero) ₡500,00», en la forma de `money()` |

**Escenario B (modelo nuevo): PROPUESTA, sin validar contra la fixture.** Las cifras son las de S12 del
madre (`specs/SLT-95-detalle-cierre-rediseno/design.md`, «gestión del modelo nuevo»). Hay que confirmarlas
con `e2e/_tarifas-activacion-fixture.ts`, que siembra las tarifas por la pantalla, y con
`cierre-modelo-nuevo-plan-porcentual.spec.ts` antes de escribir el test. Si no cuadran, se corrigen aquí antes
del test.

Entradas propuestas:
- una entrega central de 25 000 en efectivo;
- cobro a la tienda: flete Monto 3 500 con IVA 13 %, y comisión 2 % con IVA 13 %;
- pago al mensajero: Monto 2 500;
- sin concepto de bodega.

| Literal | Derivación |
|---|---|
| Recaudado ₡25.000,00 | 1 entrega |
| Sale de lo recaudado 4 520,00 | flete 3 500 + 455 = 3 955; comisión 2 % de 25 000 = 500 + 65 = 565 |
| Se le paga hoy a la tienda 20 480,00 | 25 000 − 4 520 |
| Pago al mensajero 2 500,00 | Monto fijo |
| Le queda a la empresa 1 500,00 | 4 520 − 520 (IVA) − 2 500 − 0 |
| Nota R81 | ausente |

### T1 — Servidor: quién resolvió (R80)

Archivos:
- `tests/integration/db/cierre-resuelto-por-sql-real.test.ts` (nuevo). Va dentro de `enTransaccionRevertida`,
  con empresa propia, dos zonas, el mensajero «Mario Mensajero», la resolutora «Carla Resolutora» y tres
  cierres:
  - aprobado en la zona A;
  - `solicitado` en la zona A, sin resolutor;
  - aprobado en la zona B.

  No depende de datos previos: corre en la base recién migrada del CI.
- `lib/repositories/CierresAdminRepository.ts`: `findCierreByIdEnAlcance` añade
  `resueltoPorUsuario: { select: NOMBRE_USUARIO_SELECT }` **solo** al `select` del detalle, en el mismo
  `findFirst` acotado por el alcance, y devuelve `resueltoPorNombre` (`nombreCompletoUsuario` o `null`).
- `lib/interfaces/repositories/ICierresAdminRepository.ts`: `resueltoPorNombre?: string | null`.
- `lib/services/CierresAdminService.ts`: `verCierreDetalle` emite `resueltoPorNombre` solo con `aprobado` o
  `rechazado`; en otro estado, `null`.
- `lib/interfaces/services/ICierresAdminService.ts`: `resueltoPorNombre?: string | null` en la rama `ok` de
  `CierreDetalleAdminServiceResult`. **Es el contrato que usa frontend_dev en T2.1.**
- `tests/unit/services/cierres-admin-service.test.ts`: cuatro casos (aprobado y rechazado → «Carla
  Resolutora»; solicitado y vencido con resolutor en el doble → `null`).

R72: el diff no toca nada en `db/`, ni migraciones, ni escrituras, ni importes.

**T1.1 en rojo antes de T1.2** (salida real): `Tests 3 failed | 1 passed (4)`, con
`expected undefined to be 'Carla Resolutora'` y `expected undefined to be null`. Pasa solo la
autocomprobación.

**Verde:**
- integración: `4 passed (4)`, 0 saltados: autocomprobación, aprobado → «Carla Resolutora», solicitado →
  `null`, otra zona → `null` con control positivo;
- con la unitaria: `Test Files 2 passed (2) · Tests 110 passed (110)`.

**Mutaciones** (script con respaldo y restauración; `git status` limpio de mutaciones después):

| Mutación | Resultado |
|---|---|
| M1: sin `resueltoPorUsuario` en el `select` | MUERTA: 3 rojos (aprobado, solicitado, otra zona) |
| M2: `nombreCompletoUsuario(cierre.mensajero)` en su lugar | MUERTA: 3 rojos («Mario Mensajero» ≠ «Carla Resolutora»; el solicitado deja de ser `null`) |
| M3: `WHERE` sin `alcanceWhere(alcance)` | MUERTA: 1 rojo (otra zona con alcance de A) |
| M4: servicio sin la regla del estado | MUERTA: 2 rojos (solicitado y vencido → `null`) |

**Comandos:**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → TSC_EXIT=0. Sin la opción, tsc se queda sin
  memoria (exit 134).
- `pnpm exec eslint` sobre los 6 archivos tocados → «No issues found», exit 0.

### Mapa R → test (T1)

| R | Test |
|---|---|
| R80 (lectura real, alcance) | `tests/integration/db/cierre-resuelto-por-sql-real.test.ts` |
| R80 (solo aprobado/rechazado) | `tests/unit/services/cierres-admin-service.test.ts` › «SLT-100/R80 — verCierreDetalle emite `resueltoPorNombre` solo si el cierre está resuelto» |
| R72 | revisión del diff: solo los 4 archivos de `lib/` de R80 |

**Veredicto T0–T1:** servidor de R80 hecho, verde y con 4 mutaciones muertas. Avisos para el leader: un
posible archivo extra, `CierresAdminPage.test.tsx`, y dos rótulos que no cuadran con el spec («Manual
(mensajero)» y «Pago mensajero»).

**Guardias** (`pnpm run test:guardias`, base `slt100_t1`): `Test Files 1 failed | 341 passed (342)`,
`Tests 4 failed | 4807 passed | 1 skipped`. Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts`:
«init.sh invoca scripts/verificar-dependencias.mjs», y `init.sh` no lo invoca. Vienen de antes y no son de este
diff: `init.sh` y `scripts/verificar-dependencias.mjs` son iguales a `origin/dev`. Aviso al leader.
