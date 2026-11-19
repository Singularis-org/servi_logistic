# SLT-110 «Cifras del servidor en la fila: tarifas, IVA, pago y fulfillment» — design

## Lo que ya existe

**Buscado** (2026-11-12, en el worktree de la rama, que sale de `dev` en `868627c3`): en el board
(`feature_list.json`) «cifras», «fulfillment», «tarifa congelada», «fila de bodega»; en `specs/`
`R64`, `SLT-110`, `fulfillmentCargadoAt`, `tarifaFaltante`; en el código `toPendienteRowDesdeSnapshot`,
`fulfillmentCargadoAt`, `tarifaFaltante`, `conceptosTarifa`, `pagoPorTarifa`,
`ordenFulfillmentMovimiento`, `GestionesCierre`. El grafo no tiene indexado este worktree: la
búsqueda de código se hizo con Grep/Read. No se pudo mirar `origin/dev` (sin acceso a git desde
este agente): el leader lo confirma antes de aprobar.

**Qué apareció:**

| Dónde | Qué | Qué se hace |
|---|---|---|
| SLT-101 «Fila de gestión única y lista con filtros» (`done`) | R64-R66 y R92-R96 en la fila de mensajeros. Su `design.md > Qué le queda a SLT-110` ya dice que el detalle de bodega recibe las cifras por el mismo mapper. | Se copia su patrón (consulta, regla y test de integración); no se reabre nada. |
| `lib/repositories/CierresAdminRepository.ts` · `toPendienteRowDesdeSnapshot` / `toIngresoEmpresa` | Mapper **compartido** con el detalle de bodega. Emite ya, sin lectura extra: `conceptosTarifa` (R64), `ivaIncluido`, `fulfillmentConIva`, `ivaPctFulfillment` (R65) y `pagoPorTarifa` con su ajuste (R66). | Se reutiliza tal cual. |
| El mismo mapper, parámetro `detalleMensajero?: LecturaDetalleMensajero` | Solo el detalle de mensajeros lo pasa. Sin él, `fulfillmentCargadoAt` sale `null` y `tarifaFaltante` no se emite. | **Es el hueco de esta ficha:** el detalle de bodega lo pasa. |
| `CierresAdminRepository.findCierreByIdEnAlcance` | La consulta del último movimiento de fulfillment por orden (`distinct ordenId`, `secuencia desc`, acotada por `cierre_detail`). | Se extrae a un helper y la usan los dos repositorios. |
| `CierresBodegaAdminRepository.findCierreBodegaConDetalle` | Llama al mapper sin el parámetro (línea ~519). | Se cambia aquí. |
| `CierresBodegaAdminService.verCierreBodegaDetalle` → `toDetalleDTO` | Passthrough: `ingresoEmpresa` entero y `tarifaFaltante ?? g.tarifaFaltante ?? false`. Acceso total o `forbidden`. | Sin cambios. |
| `CierresBodegaAdminModule.tsx` (SLT-104) | Monta `GestionesCierre` en «solo lectura» con `quienMiraEsCentral`. | Sin cambios. |
| `fila-gestion-vista.ts` (SLT-101) | `tarjetaFulfillment` pinta la nota con `fulfillmentCargadoAt`; `senalesDe` pinta «Sin tarifa de pago» en «solo lectura». `filaDescargaDetalleBodega` usa `textoSenales`. | Sin cambios. |
| `tests/integration/db/cierre-detalle-cifras-fila-sql-real.test.ts` (SLT-101) | Corpus y patrón de integración de las cifras (`HAY_BASE_DE_DATOS`, transacción revertida, espía de SQL, sin `return` temprano). | Se copia el patrón para bodega. |
| `e2e/cierres-rediseno.spec.ts` · escenario B6 (SLT-104) | Cierre de bodega del modelo nuevo visto por la central. | Se añade la lectura de la fila. |

No hay otra ficha en el board que haga esto: SLT-107 «Bodega satélite: Solicitados y su cierre de
bodega en lectura» abre el detalle a la satélite (otro permiso) y S15 «Excel del modelo nuevo de
cierres» lleva estas cifras al Excel.

## Decisión técnica

### Servidor

1. **Helper de la consulta** en `CierresAdminRepository.ts`, junto al mapper que la consume:

   ```ts
   /** SLT-101 (R94) / SLT-110 (R210): instante del cargo vigente de fulfillment por orden. */
   export async function cargosFulfillmentVigentes(
     prisma: Pick<PrismaClient, "ordenFulfillmentMovimiento">,
     cierreIds: readonly string[],
   ): Promise<Map<string, Date | null>>
   ```

   Es la consulta de hoy de `findCierreByIdEnAlcance`, con el `where` sobre un conjunto de cierres:
   `orden: { cierreDetalles: { some: { cierreId: { in: cierreIds } } } }`, `orderBy [ordenId asc,
   secuencia desc]`, `distinct ["ordenId"]`, `select { ordenId, tipo, ocurridoAt }`; y el mapa
   `ordenId → tipo === "cargo" ? ocurridoAt : null`. Con `cierreIds` vacío devuelve el mapa vacío sin
   ir a la base. `findCierreByIdEnAlcance` pasa a llamarlo con `[cierreId]` dentro de su mismo
   `Promise.all`: misma semántica, el test de integración de SLT-101 lo vigila.

2. **`LecturaDetalleMensajero` pasa a llamarse `LecturaDetalleFila`** y su comentario dice que la
   pasan los dos detalles de admin (mensajero y bodega); la descarga sigue sin pasarla. El tipo solo
   se usa en ese archivo y en el de bodega. Sin cambio de forma: `{ cargoFulfillmentAt: Date | null }`.

3. **`findCierreBodegaConDetalle`**: tras leer `cierresDiaRows`, una sola llamada
   `cargosFulfillmentVigentes(this.prisma, cierresDiaRows.map((cd) => cd.id))` (R216), en paralelo
   con el bucle de gestiones y detalle por cierre del día; cada gestión se mapea con
   `toPendienteRowDesdeSnapshot(g, d, zona, { cargoFulfillmentAt: cargos.get(g.ordenId) ?? null })`.
   Con eso salen `fulfillmentCargadoAt` (R210) y `tarifaFaltante` (R211) por la misma función que
   el detalle de mensajeros (R212). `CierresBodegaAdminPrismaClient` añade
   `"ordenFulfillmentMovimiento"` a su `Pick`.

   Que la fecha sea la del último movimiento **de la orden** y no «del cierre» es la regla de
   SLT-101 R94; una orden que aparece en dos cierres del día de la misma bodega tiene un único
   cargo vigente y se emite el mismo en las dos gestiones.

4. **Servicio y pantalla:** sin cambios. `toDetalleDTO` ya deja pasar los dos campos y la fila ya
   los pinta (R214).

### Contrato I/O

Sin campos nuevos. Cambian **valores** de dos campos que el contrato ya declara opcionales:

| Campo (`CierreDetalleGestion`) | Hoy en bodega | Con esta ficha |
|---|---|---|
| `ingresoEmpresa.fulfillmentCargadoAt` | siempre `null` | ISO del cargo vigente, o `null` (R210) |
| `tarifaFaltante` | siempre `false` (la clave no viene del repo) | valor real de R96 (R211) |

Strings de escala 2 y ISO como el resto del módulo; nada de `number` (R71 del madre).

## Modelo de datos

Sin tablas, columnas, índices ni migraciones (R213). Se leen tablas existentes:
`orden_fulfillment_movimiento` (por `orden_id`, `secuencia`), `cierre_detail`,
`cierre_detail_concepto`, `gestion_pago_congelado`, `ajuste_pago_mensajero`. Todas con
`organizacion_id` y RLS por empresa (`docs/architecture.md > Multi-empresa`); la lectura va por el
cliente Prisma con el contexto de empresa de hoy, como en SLT-101. Sin `down.sql`: no hay migración.

## Autorización y módulo

- El detalle de bodega sigue siendo de **acceso total** (`CierresBodegaAdminService.verCierreBodegaDetalle`,
  R2 de la ficha original): cualquier otro rol recibe `forbidden` antes de tocar el repositorio
  (R215). Por eso el fulfillment y su fecha solo llegan a la central (ficha 481) sin filtro extra.
- Módulo: cierres sigue en `nucleo`; nada que encender.

### Lo que hereda SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura»

Cuando SLT-107 abra este detalle a la satélite, la fecha del cargo pasa a ser un campo más de la
central que **hay que anular** para ella, con los otros tres del fulfillment (como
`ocultarFulfillmentSiNoCentral` en `CierresAdminService`). Se anota en `progress/features/SLT-110.md`
para que el leader lo pase al spec de SLT-107.

## Datos que dependen del país

- Moneda y montos: strings congelados, formateados en la pantalla con `money()` (sin cambios).
- % de IVA: el string congelado del concepto; nunca «13 %» escrito en código.
- Fecha del cargo: viaja en ISO; la fila la formatea con su `fechaCorta` de hoy (SLT-101).

## Alternativas descartadas

1. **Una consulta de movimientos por cierre del día** (copiar la de `findCierreByIdEnAlcance` dentro
   del bucle). Descartada: una ida a la base por cierre del día cuando una sola con `in` da el mismo
   mapa (R216), y dos copias de la misma regla que divergirían.
2. **Leer la fecha del cargo en el servicio de bodega**, después del repositorio. Descartada: el
   mapper ya recibe la fecha como parámetro y emite `tarifaFaltante` con ella; hacerlo en el
   servicio duplicaría `tarifaFaltanteDe` y rompería «una cifra, un nombre» (R212).
3. **Copiar la consulta en `CierresBodegaAdminRepository` sin tocar `findCierreByIdEnAlcance`**
   (menos riesgo para la fila de mensajeros). Descartada: dejaría dos versiones de la regla de R94;
   el test de integración de SLT-101 protege el cambio del lado de mensajeros.
4. **Re-especificar las cinco cifras que ya llegan** como si faltaran. Descartada: re-crearía código
   que ya existe (`docs/specs.md > Antes de especificar`); se prueban, no se reescriben.

## Dependencias de terceros

Ninguna nueva.

## Verificación

- **Integración contra Postgres real** (`tests/integration/db/cierre-bodega-cifras-fila-sql-real.test.ts`),
  con el patrón de SLT-101: empresa propia en transacción revertida, `describe.skip` visible sin base,
  fallo ruidoso sin catálogos, sin `return` temprano. Corpus:
  - cierre de bodega X de una zona satélite con **dos** cierres del día (mensajeros M1 y M2);
  - gestión A (M1, modelo nuevo, entrega, pedido 25 000,00 con comisión): flete por entregado
    3 500,00 monto + IVA 13 % (nivel grupo), comisión COD 2 % (nivel zona) + IVA 13 %, fulfillment
    600,00 + IVA 13 %; pago congelado del mensajero 2 500,00 y de la satélite 900,00 (señuelo);
    ajuste 2 500,00 → 1 800,00; un cargo de fulfillment el 2026-11-06;
  - gestión B (M2, modelo nuevo, entrega, pedido 10 000,00 sin comisión): flete 3 000,00 + IVA 13 %;
    solo la fila congelada de la satélite; cargo el 2026-11-05 y reverso el 2026-11-07;
  - gestión C (M2, modelo viejo, entrega, pedido 10 000,00 con comisión): tarifa 2 000,00 + IVA 13 %,
    comisión 3 % + IVA 13 %;
  - señuelo: orden D en un cierre del día de **otro** cierre de bodega, con un cargo posterior
    (2026-11-08).

  Literales a mano (se verifican en T0 contra la fórmula; si alguno no casa, se para y se reporta,
  no se ajusta el literal a la salida):
  - A: `conceptosTarifa` = flete (monto 3500.00, IVA 13.00, nivel grupo con su grupo y zona) y
    comisión (porcentaje 2.00 sobre 25000.00, IVA 13.00, nivel zona); `ivaIncluido` 520.00
    (455.00 + 65.00); `fulfillmentConIva` 678.00; `ivaPctFulfillment` 13.00; `fulfillmentCargadoAt`
    = el instante del 2026-11-06; `pagoPorTarifa.importe` 2500.00 con `ajuste` `{ resta, 700.00 }`;
    `tarifaFaltante` false.
  - B: `fulfillmentCargadoAt` null (el último es reverso); `pagoPorTarifa` null; `tarifaFaltante` true.
  - C: `conceptosTarifa` []; `ivaIncluido` 299.00 (260.00 + 39.00); `pagoPorTarifa` null;
    `tarifaFaltante` false.
  - R212: para el cierre del día de M1, los campos de R64-R66 de A leídos por bodega son
    `toEqual` a los de `CierresAdminRepository.findCierreByIdEnAlcance` con alcance total.
  - R216: el espía cuenta exactamente una consulta a `orden_fulfillment_movimiento`; re-ejecutada,
    sus filas son solo de las órdenes de X (nunca D).
  - R213: el espía no registra ningún `INSERT`/`UPDATE`/`DELETE` durante la lectura.
- **Mutaciones que deben poner rojo el test** (se anotan en `progress/impl_SLT-110.md` con su
  resultado): quitar el `in: cierreIds` del `where`; `secuencia: "desc"` → `"asc"`;
  `tipo === "cargo"` → `true`; no pasar la lectura al mapper en bodega; filtrar `pagosCongelados`
  sin `actor = mensajero`.
- **Componente** (`tests/components/CierresBodegaAdminCifrasFila.test.tsx`): monta
  `CierresBodegaAdminModule` con un detalle de dobles (la gestión con fecha de cargo y
  `tarifaFaltante`), audiencia admin; afirma con literales escritos a mano la nota de la tarjeta
  Fulfillment, «Sin tarifa de pago» en la celda, el conteo de «Con señales» y la columna «Señales»
  de «Descargar». Contraprueba: con fecha nula, la nota es solo «No depende de esta gestión ni de
  este cierre.».
- **E2E** (`e2e/cierres-rediseno.spec.ts`, escenario B6): la central abre el cierre de bodega,
  «Gestiones (1)», despliega la entrega y lee con literales: en «Ver cómo se calculó», la tarjeta
  del flete con «+ IVA 13 %» (su título, el rótulo vigente de la fila), «de eso, IVA» ₡403, «Por tarifa» ₡2.200 y «Se le paga» ₡2.200, sin línea de ajuste.
  Antes del PR se corren en local el E2E entero de `cierres-rediseno` y el grupo `dinero`
  (`docs/perfil-agentes.md > E2E en local antes del PR`).
