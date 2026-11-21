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

**Fix T1 (regresión de 9545b5d):** `CierresAdminRepository.ts` comparaba `resueltoPorUsuario === null` y los dobles
sin ese campo (undefined) rompían con `TypeError`; ahora guarda por falsy. Tests sin cambios. Base `slt100_t1`:
3 archivos (`cierres-admin-repository`, `cierre-pagos-lectura`, `cierre-resuelto-por-sql-real`) `Tests 74 passed (74)`; `tsc --noEmit` exit 0.

## T2–T4 · frontend_dev · 2026-11-09

Base desechable propia `slt100_fe_vitest` (mismo servidor local que la del `.env`, `DROP`/`CREATE`,
`prisma migrate deploy`, `db:seed`; la URL nunca se imprimió). Sin dependencias nuevas, sin `prisma
generate`, sin dev server. **T5 (E2E) NO se hizo: paro por tamaño** (ver «Aviso de tamaño» al final).

### Archivos (31 en esta tanda; 42 en la rama contra `origin/dev`)

Pantalla:
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` — el `<Modal title="Detalle del cierre">`
  pasa a `<DetalleCierre tipo="mensajero" marco="modal">` con `modoAdminDe`, pestañas (`GestionesPorResultado`
  + `SeccionSinGestion` + «Descargar»; `RechazosDeTiendaCierre`; `PagoMensajeroSeccion` si
  `ofrecerPagoEnDetalle`) y acciones del pie (`esResoluble` → rechazar/aprobar; `vencido` → destrabar). Los
  tres diálogos de corrección/ajuste salen a hermanos. `confirmarDestrabar` relee el detalle si está abierto
  sobre ese cierre (R83). `DetalleAbierto` gana `resueltoPorNombre`. Ya no importa `CierreFacturaDetalle` ni
  `CascadasCierreMensajero`; se quitan `money`/`hayGestionEnModeloNuevo`/`destinoCierre` sin uso.
- `app/(app)/cierres-admin/_components/cierre-factura.tsx` — **solo `export`** en 10 declaraciones
  (`SeccionSinGestion`, `separarParaDevolucion`, `efectoAlAprobar`, `RECHAZOS_NOTA`, `RECHAZOS_LISTA_LABEL`,
  `RECHAZOS_FECHA_COL`, `FILA_GUIA_COL`, `FILA_DESTINATARIO_COL`, `FILA_TIENDA_LABEL`, `FILA_MOTIVO_LABEL`).
- `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx` — **archivo extra**: solo la anotación
  `@sin-superficie` (lo exige `superficie-de-uso`: el design suponía que `/cierre-dia` lo montaba, y no lo
  monta). Motivo: «SLT-100 sustituyó el modal del admin por el detalle único; lo retira SLT-115».
- `components/private/cierres/detalle/detalle-cierre-vista.ts` — `modoAdminDe` (R79);
  `DetalleMensajeroVista.desgloseIngresoBodega`; `vistaMensajeroDesdeAdmin` acepta el resultado sin `status`,
  pasa `resueltoPorNombre` (R80) y el desglose (null en modelo nuevo o sin `sla`/`manual`, R81);
  `notaOrigenIngresoBodega` + `cuentaQueda` con notas bajo «− pago a la bodega».
- `components/private/cierres/detalle/detalle-cierre-labels.ts` — `RECHAZOS_VACIO` (D27),
  `tituloDescargaGestiones`, `COBRO_A_LA_TIENDA_COL`, `PAGO_AL_MENSAJERO_COL = PESTANA_PAGO`.
- `components/private/cierres/detalle/RechazosDeTiendaCierre.tsx` (nuevo, R17).
- `components/private/cierres/detalle/detalle-cierre-descarga-columnas.ts` (nuevo, R82).
- `DetalleCierre.tsx`, `CifrasCierre.tsx`, `DineroCierre.tsx`, `Cuenta.tsx` — solo se quita `@sin-superficie`.

Tests nuevos: `tests/components/CierresAdminDetalleUnico.test.tsx`,
`tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts`, `tests/fixtures/detalle-cierre-admin-anterior.tsx`
(**extra**, ver T4.1). Ampliado: `tests/unit/utils/detalle-cierre-vista.test.ts`.

Tests adaptados: los 10 de `tests/components/` de la lista, más `CierresAdminPage.test.tsx` y
`CierreFacturaPapel.test.tsx` (avisados en T0.1). Guardias: `cierre-detalle-superficies`, `impresion-flujo`,
`liquidacion-money-safe` (censo) y **`estado-con-info`** (extra: una entrada en `USOS_PERMITIDOS`).

### Decisiones tomadas (del leader o mías, anotadas)

- **Nota de R81** con la constante: «Automático (por plazo vencido) ₡x · Manual (mensajero) ₡y» (leader).
- **«Descargar»**: encabezado «Pago al mensajero» = `PESTANA_PAGO` (leader); «Cobro a la tienda» nueva.
  `PAGO_MENSAJERO_COL` («Pago mensajero») no se toca. Las filas salen de `Object.values(grupos).flat()`.
- **R81 en la vista** y no en el componente: `notaOrigenIngresoBodega` vive en `detalle-cierre-vista.ts`
  (que ya importaba de `cierre-detalle-shared.tsx`) para que `detalle-cierre-labels.ts` siga puro.
- **«Pago al mensajero» solo con audiencia central**: S1 (`pestanasDe`) lo exige; el modal de antes lo
  pintaba con `puedeRegistrarPago` aunque la audiencia fuera satélite. En producción la satélite no tiene ese
  permiso ([P3]/R6), así que no cambia nada visible; en los tests que montaban el módulo sin `audiencia` (por
  defecto `satelite`) con el permiso, se añade `audiencia="admin"`.
- **Nombre del diálogo**: el de S1 es «Detalle del cierre · Cierre de <nombre>». En Testing Library un nombre
  string es coincidencia EXACTA (el design suponía subcadena, que es lo que hace Playwright): los tests pasan a
  `/^Detalle del cierre · /`.
- `factura-contraste`: verde sin tocarla. Sus anclas `CierresAdminModule.tsx:749/770/781` (botones de
  `AccionesCola`, que no cambian) ya estaban desfasadas antes de esta ficha; no las muevo para no sumar archivo.

### T4.1 — antes leía X, ahora lee Y

| Archivo | Antes | Ahora |
|---|---|---|
| `CierresAdminModule.test.tsx` | `dialog` «Detalle del cierre» exacto; regiones «Totales del cierre», «Liquidación», «Pago a tienda», «Ingreso de la empresa», «Ingreso de bodega … del cierre»; filas directas; «Debe» en rojo | `/^Detalle del cierre · /`; `group` «Cifras del cierre»; cuenta «De lo facturado, le queda…» (Total facturado ₡3.672,50); cifra «Se le paga hoy a la tienda» (₡21.327,50); cuenta «Lo que se le factura a la tienda» (mismos 4 importes); línea «− Ingreso de bodega…» con ₡9.200 y la nota «Automático (por plazo vencido) ₡6.000 · Manual (mensajero) ₡3.200»; clic en «Gestiones (n)» antes de las filas. «Debe» se **invierte** (D3) y el rojo se afirma sobre «Le queda a la empresa» −₡1.500 (fixture `netoEmpresa` "-1500.00", el que deriva el servidor) |
| `CierresAdminPagoMensajero.test.tsx` | región «Pago al mensajero» en el modal; «Aprobar» | `audiencia="admin"`; `irAPago` pulsa la pestaña si existe; pie con `/^(Aprobar|Revisar paquetes y aprobar)$/` |
| `CierresAdminIndemnizacion.test.tsx`, `CierresAdminConfirmacionFisica.test.tsx` | «Aprobar» de la sección «Decisión del cierre» | el botón del pie, `APROBAR_PIE` (el rótulo lo decide S1 por paquetes que vuelven, R12) |
| `CierresAdminDeepLink.test.tsx` | «Cerrar» del `Modal` | `getAllByRole("button",{name:"Cerrar"})[0]` = el del pie (el 2.º es la X) |
| `CierreMensajeroDetalleCascadas.test.tsx`, `CierreMensajeroDesglosePorTienda.test.tsx` | las cascadas 395/396 dentro del modal del módulo | **se montan directamente** con `tests/fixtures/detalle-cierre-admin-anterior.tsx` (las mismas props que pasaba el módulo). Ver nota abajo |
| `CierrePremioPendiente.test.tsx` | región «Pago al mensajero» | `audiencia="admin"` + clic en la pestaña «Pago al mensajero» |
| `cierre-detalle-ajuste-badge.test.tsx`, `CorregirResultadoCierre.test.tsx` | filas del modal | clic en «Gestiones (n)» antes de la fila |
| `CierresAdminPage.test.tsx` (extra) | `dialog` «Detalle del cierre» exacto | `/^Detalle del cierre · /`; «Aprobar» del pie sin cambios (no hay paquetes) |
| `CierreFacturaPapel.test.tsx` (extra) | «las DOS rutas montan `CierreFacturaDetalle`» + `max-h-[70vh]` del admin | la del mensajero la monta y la del admin **no** (D12); el escenario sintético del modal se conserva como peor caso de la regla genérica de impresión, con el comentario corregido |

**Nota para el reviewer (las dos de cascadas, 54 casos):** el design pedía «mismos literales sobre «Dinero»»,
pero «Gana la tienda», «Liquidación», «Debe» y las notas del tiempo verbal no existen en el «Dinero» aprobado
(D3, D20, D25). No borro ninguna aserción: los dos tests pasan a vigilar los componentes que siguen en el
árbol con `@sin-superficie` hasta SLT-115 «Retirar los componentes de cierre sustituidos». Lo que el admin ve
ahora lo vigilan `DineroIdentidadesEnPantalla`, `CierresAdminDetalleUnico` y el E2E pendiente.

### T4.2 / T4.3 — guardias

- `cierre-detalle-superficies`: el censo de `<CierreFacturaDetalle>` queda en `CierreDiaModule` (≥1); nuevo
  `describe` que censa las superficies del detalle único de mensajero (`<DetalleCierre tipo="mensajero">`) y
  exige `<SeccionSinGestion ordenes= registrado=>` y `<RechazosDeTiendaCierre rechazos=>` con expresión del
  servidor; autocomprobación: la lista es exactamente `CierresAdminModule.tsx`.
- `impresion-flujo`: se retira el caso `max-h-[70vh]` y entra «el módulo del admin no monta
  `CierreFacturaDetalle` ni `HojaFactura`, y sí `DetalleCierre`». Contraprueba = mutación M4.
- `liquidacion-money-safe`: **sí hubo que tocarla** (contra lo que preveía T4.3): su censo exige listar los
  archivos nuevos de `components/private/cierres/` (dos líneas). `DineroIdentidadesEnPantalla` no se toca y
  sigue verde.
- `columnas-asercion-de-orden` descubrió el módulo nuevo por su sufijo (rojo hasta que el test de T2.2 lo
  nombró): es la contraprueba de descubrimiento de T2.2.
- `superficie-de-uso` verde sin ninguna `@sin-superficie` en `components/private/cierres/detalle/`
  (`grep -r "@sin-superficie S1 de SLT-95" components/` vacío; `vistaBodegaDesdeAdmin` no la necesita: la
  guardia mira alcanzabilidad por módulo).

### Mutaciones (script con copia y restauración; `grep` posterior confirma el árbol limpio)

| Mutación | Test | Resultado |
|---|---|---|
| M1 `modoAdminDe("vencido")` → «solo lectura» | DetalleUnico + vista | MUERTA (4 rojos) |
| M2 estado vacío sin texto | DetalleUnico | MUERTA (1) |
| M3 «Pago al mensajero» también a la satélite | DetalleUnico | MUERTA (1) |
| M4 `CierreFacturaDetalle` montada de nuevo en «Gestiones» | DetalleUnico | MUERTA (1) |
| M5 nota de R81 retirada | DetalleUnico + vista | MUERTA (2) |
| M6 destrabe sin segunda lectura | DetalleUnico | MUERTA (1) |
| M7 importe ausente → `"0"` | columnas | MUERTA (2) |
| M8 `resueltoPorNombre` no llega a la vista | DetalleUnico + vista | MUERTA (2) |
| M9 sin `SeccionSinGestion` | DetalleUnico | MUERTA (2) |
| M10 encabezado «Pago mensajero» | columnas | MUERTA (1) |

### Mapa R → test (T2–T4)

| R | Test |
|---|---|
| R17 | `CierresAdminDetalleUnico` «Rechazados por la tienda» (0 → texto D27; 2 → filas guía/destinatario/motivo/tienda/fecha y la nota) |
| R18 | `CierresAdminDetalleUnico` R18 (central con permiso / satélite / sin permiso); `CierresAdminPagoMensajero`; `CierrePremioPendiente` |
| R19 | `CierresAdminDetalleUnico` («Pasaron a Novedad interna» con conteo; no registrado) |
| R21 | `CierresAdminDetalleUnico` («Descargar …», sin `.hoja-imprimible` ni «Imprimir»); `impresion-flujo`; `CierreFacturaPapel` |
| R38 | `CierresAdminDetalleUnico` R38 (admin y satélite); `CierresAdminDeepLink`; `cierre-detalle-superficies` |
| R39 | `CierresAdminDetalleUnico` R39; `CierresAdminConfirmacionFisica`; `CierresAdminIndemnizacion`; `CierresAdminModule` (R10/R11) |
| R71 | `liquidacion-money-safe` (censo con los dos archivos nuevos); `detalle-cierre-descarga-columnas` (sin `"0"`) |
| R79 | `detalle-cierre-vista` «modoAdminDe»; `CierresAdminDetalleUnico` R79 (pie por estado) |
| R80 | `detalle-cierre-vista` (llega / null); `CierresAdminDetalleUnico` R80 (con y sin «por») |
| R81 | `detalle-cierre-vista` (viejo / nuevo / sin desglose); `CierresAdminDetalleUnico` R81; `CierresAdminModule` 102/R8 |
| R82 | `tests/unit/descarga/detalle-cierre-descarga-columnas.test.ts` |
| R83 | `CierresAdminDetalleUnico` R83 (ok → forzar + 2.ª lectura en decidir; conflict → error de hoy, 1 lectura, sigue vencido) |
| R77 | **pendiente** (T5) |

### Comandos (salida real)

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `TSC_EXIT=0`.
- `pnpm exec eslint <31 archivos>` → `0 errors, 1 warning` (`CierreEstado` sin uso en
  `CierreMensajeroDetalleCascadas.test.tsx`, ya estaba en `HEAD`).
- Conjunto afectado (`vitest run` de los 17 archivos de componentes y guardias de la ficha + `tests/unit/descarga`):
  `Test Files 67 passed (67) · Tests 1038 passed (1038)`.
- `tests/components/CierresAdminDetalleUnico.test.tsx`: `Tests 22 passed (22)`.
- `pnpm run test:guardias`: `Test Files 2 failed | 340 passed (342)`, `Tests 5 failed | 4807 passed | 1 skipped`.
  4 rojos son `dependencias-declaradas-presentes` (heredados, ya avisados por backend_dev en T1); el 5.º era
  `estado-con-info` (el módulo de columnas nuevo usa `RESULTADO_FILA_LABEL`): se añadió su excepción clase D y
  re-ejecutado da `Tests 17 passed (17)`.
- `pnpm run test:rapido` (con presupuesto): `423 relacionados -> FUERA (presupuesto 150)`; guardias y disparados
  `341 archivos`: 100+100+100+41 passed, `RAPIDO_EXIT=0`.
- `TEST_RAPIDO_SIN_PRESUPUESTO=1 pnpm run test:rapido` (los 632, completo): **`RAPIDO_EXIT=1`**. Seis tandas
  verdes y una con `Test Files 2 failed | 98 passed`, `Tests 20 failed | 1361 passed | 1 skipped`:
  `tests/unit/repositories/cierres-admin-repository.test.ts` (18) y `tests/unit/repositories/cierre-pagos-lectura.test.ts`
  (2), todos con `TypeError: Cannot read properties of undefined (reading 'nombre')` en
  `nombreCompletoUsuario` ← `CierresAdminRepository.findCierreByIdEnAlcance` (`lib/repositories/CierresAdminRepository.ts:1483`).
  **Es de T1 (backend_dev), no de esta tanda:** los dobles de Prisma de esos tests no traen `resueltoPorUsuario`
  (`undefined`) y el código solo compara `=== null`. No los toco: `lib/` y sus tests unitarios son de backend_dev.
  Arreglo mínimo sugerido: `cierre.resueltoPorUsuario ? nombreCompletoUsuario(...) : null` (o `== null`).

### Aviso de tamaño — T5 no se hizo

La rama tiene **42 archivos contra `origin/dev`** (el tamaño aceptado, D22). T5 añade `e2e/cierres-rediseno.spec.ts`
y adapta los 9 E2E de T5.2 → **52 archivos**, por encima del límite de ~50 que fija `tasks.md`. Paro y aviso al
leader antes de seguir. Lo que T5 tendrá que hacer, ya visto:
- en los 9 specs, `getByRole("dialog", { name: "Detalle del cierre" })` sigue casando (Playwright compara por
  subcadena), pero «Totales del cierre», «Órdenes del cierre», «Liquidación», los KPI «Total de la empresa» y la
  región «Ingreso de bodega por devoluciones a origen del cierre» ya no existen: pasan a `group` «Cifras del
  cierre», la pestaña «Gestiones (n)», las cuentas y la nota de R81;
- el pie aprueba con «Revisar paquetes y aprobar» cuando hay paquetes que vuelven (`cierres-admin` (a));
- escenario B sin validar todavía contra `e2e/_tarifas-activacion-fixture.ts`; base E2E nueva aún no creada.

**Veredicto T2–T4:** detalle único montado en `/cierres-admin`, 22 tests nuevos + 10 mutaciones muertas,
afectados y guardias verdes salvo los 4 heredados; T5 parada por tamaño y 20 rojos de T1 en tests de
repositorio para backend_dev.

## T5 · frontend_dev · 2026-11-09 (E2E)

Carlos aceptó ~52 archivos; la rama queda en **53** contra `origin/dev`. Base E2E nueva `slt100_fe_e2e` (mismo
servidor local que la del `.env`, `DROP`/`CREATE`, `migrate deploy`, `db:seed`; URL nunca impresa), `next build`
con `NEXT_PUBLIC_APP_URL=http://localhost:3044`, `E2E_PUERTO=3044`. Sin dev server.

### Archivos
- `e2e/cierres-rediseno.spec.ts` (nuevo) y `playwright.config.ts` (lo suma al grupo `dinero`).
- Adaptados: `cierres-admin`, `ajuste-pago-mensajero-cierre`, `wallet-iva-aparte-sl39`, `reglas-bloqueos-cierre`,
  `cierres-admin-rechazos-sla`, `tope-intentos-por-empresa`, `cierre-modelo-nuevo-plan-porcentual`,
  `tarifas-activacion`, `tarifas-valor-propio-mensajero`.

### Escenario B validado (antes de escribirlo)
Se tomó la tarifa que `tarifas-activacion.spec.ts` ya prueba por la pantalla (flete por entregado 3.100 + 13 %,
devolución 1.400 + 13 %, mensajero 2.200), digitada en la zona **central** para que la vea la central, con una
entrega de 10.000 en efectivo. La propuesta de T0.3 (comisión 2 %, 3.500/2.500) se descartó: la comisión no
estaba probada por ningún E2E de la fixture. Derivación a mano: sale de lo recaudado 3.100 + 403 = **3.503** (el
«Total cobrado» que `tarifas-activacion` ya afirma); se le paga hoy 10.000 − 3.503 = **6.497**; pago **2.200**;
le queda 3.503 − 403 − 2.200 − 0 = **900**; sin nota R81. Salió verde a la primera con esos literales.

### Casos de `cierres-rediseno.spec.ts`
- Central A (solicitado): 4 cifras al céntimo, métodos sin Transferencia, sin «Debe»/«Ganancia»; las 10 líneas
  de las dos cuentas; nota «Automático (por plazo vencido) ₡0 · Manual (mensajero) ₡500»; pie tras desplazar
  («Rechazar», «Revisar paquetes y aprobar»); «Rechazados por la tienda (0)» con el texto D27; «Descargar» → xlsx
  leído con `exceljs`: las 7 cabeceras de R82 y 3 filas; sin `.hoja-imprimible`; aprobar con la guía → `aprobado`
  en la base; reabierto: pie «Cerrar», «Aprobado <fecha> por <maestro>» (R80), pestaña «Pago al mensajero».
- Satélite A: mismas cifras y cuentas; sin pestaña de pago; sin «Fulfillment» en la fila; rechaza con motivo →
  `rechazado` con el motivo en la base.
- Central B: las 4 cifras del modelo nuevo; sin nota R81.
- Vencido (corte diario real): pie «Cerrar», «Destrabar cierre vencido» → diálogo de hoy → `solicitado` en la base
  y el mismo detalle releído con «Rechazar», «Aprobar» (R83).

### T5.2 — antes leía X, ahora lee Y
| Spec | Antes | Ahora |
|---|---|---|
| `cierres-admin` | región «Totales del cierre» (Efectivo, Total general); «Órdenes del cierre» directo; «Aprobar» | métodos de «Recaudado» y `[data-cifra=recaudado]`, mismos importes; clic en «Gestiones (n)»; «Revisar paquetes y aprobar» (hay un rechazo) |
| `reglas-bloqueos-cierre` | «Totales del cierre» visible | `group` «Cifras del cierre» visible |
| `cierres-admin-rechazos-sla` | tarjeta «Ingreso de bodega … del cierre» 2.700 con sublíneas 900/1.800 | línea «− Ingreso de bodega por devoluciones a origen» 2.700 con la nota «… ₡900 · Manual (mensajero) ₡1.800»; clic en «Gestiones» |
| `tope-intentos-por-empresa` | la misma tarjeta; «Aprobar» | la misma línea; «Revisar paquetes y aprobar» |
| `ajuste-pago-mensajero-cierre` | cascada «Lo que le queda a la empresa · cierre de X» («Pago al mensajero», «Neto de la empresa»); «Aprobar» | cuenta «De lo facturado, le queda…» («− Pago al mensajero», «Le queda a la empresa»), mismos 1.500 → 2.200 y −700 del neto; alterna «Dinero»/«Gestiones» (al volver, re-elige la sección «Devolución a origen…»); «Revisar paquetes y aprobar» |
| `wallet-iva-aparte-sl39` | cascada: «Lo que la empresa facturó» 3.616, «IVA facturado» −416, neto 1.700; «Debe» −100 con nota | cuenta: «Total facturado» 3.616, «− IVA (no es de la empresa)» 416, «Le queda a la empresa» 1.700; B: «Le queda» −100 y **sin «Debe»** (D3, aserción invertida) |
| `cierre-modelo-nuevo-plan-porcentual`, `tarifas-activacion`, `tarifas-valor-propio-mensajero` | KPI «Pago al mensajero» y «Total de la empresa» del comprobante; filas directas; «Aprobar»; textos «Ingreso de bodega…» sueltos | `[data-cifra=pago]` y «Total facturado» de «Lo que se le factura a la tienda» (mismos importes); clic en «Gestiones»; «Revisar paquetes y aprobar»; en `tarifas-activacion` la línea «− Ingreso de bodega…» por modelo (300 / 570) y la nota con «Manual (mensajero)» solo en el viejo |

### Mutaciones del E2E (cada una con `next build`; restaurado y reconstruido limpio al final)
| Mutación | Resultado |
|---|---|
| M-E1 «Le queda a la empresa» deja de leer `netoEmpresa` (la vista no lleva `ganancia`: cae a otra cifra del servidor) | MUERTA: 2 failed (central A y satélite A, `toHaveText`) |
| M-E2 nota de R81 retirada | MUERTA: 1 failed (`toContainText` de la nota) |

### Salida real
- Primera corrida de `--project=dinero`: `1 failed | 87 passed` — `ajuste-pago-mensajero-cierre` central: al volver
  a «Gestiones» la lista se monta de nuevo en su primera sección; corregido (re-elige la sección) y verde
  (`2 passed`).
- Base recreada, y dos corridas seguidas de `--project=dinero` (incluye `cierres-rediseno`, `cierre-vencido-modelo`
  y `cierre-bodega-satelite`): `88 passed (6.5m)` y `88 passed (6.7m)`, 0 failed / 0 flaky / 0 skipped.
- `wallet-iva-aparte-sl39` (`--project=aislamiento`): `14 passed`.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `TSC_EXIT=0`; eslint de lo tocado sin avisos.
- `TEST_RAPIDO_SIN_PRESUPUESTO=1 pnpm run test:rapido` (53 cambiados, 423 relacionados, todo): siete tandas verdes
  (`100/100/100/100/100/100/32 passed`), `RAPIDO_EXIT=0`.

### Mapa R → test (completa la tabla de T2–T4)
| R | Test |
|---|---|
| R77 | `e2e/cierres-rediseno.spec.ts`: central A, satélite A y central B, literales de T0.3 y de esta sección |
| R80 | + E2E central A reabierto («Aprobado … por <maestro>») |
| R81 | + E2E central A (presente) y B (ausente); `cierres-admin-rechazos-sla` (900/1.800) |
| R82 | + E2E (cabeceras y filas del xlsx) |
| R83 | + E2E vencido |
| R17, R18, R21, R38, R39 | + E2E central y satélite A |

**Veredicto T5:** E2E nuevo y 9 adaptados en verde dos veces seguidas en base nueva, dos mutaciones muertas y
`test:rapido` completo verde.
