# SLT-112 «Cifras del servidor: ganancia pendiente y pagada del mensajero» — design

> Rebanada S14 de SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)». Requisitos R350-R360
> (`requirements.md`). Sin tablas, columnas, índices ni migraciones (R72).
> El índice del grafo de código no existía para este worktree al escribir el spec: lo de abajo se leyó
> con Grep/Read sobre el árbol del worktree (rama al día con `dev` en `0df9f7b0`).

## Lo que ya existe

Búsqueda hecha antes de escribir (`docs/specs.md > Antes de especificar`): `feature_list.json`,
`specs/` y el código. **Las tarjetas no existen**: ni en `lib/` ni en `components/` hay
`gananciaPendiente`, `gananciaPagada` ni los rótulos «Ganancia pendiente de pago» / «Ganancia pagada
este mes». El único sitio del código que los nombra es
`tests/components/CierreDiaColaPropia.test.tsx` («R158: sin tarjetas de cifras de la ganancia»), que
afirma su **ausencia**. Lo que sí existe y se reutiliza:

| Pieza | Dónde | Qué aporta |
|---|---|---|
| Regla de lo pendiente de un cierre | `lib/utils/pendiente-cierre.ts > derivarPendienteCierre` | `P` (nuevo) o `P − min(P, E)` (viejo) + premios vivos − pagos vigentes; nunca negativo; string escala 2. SLT-123 la hizo depender de `pagoIndependienteEfectivo`. |
| Pendiente por fila de la cola | `CierreDiaService.conPendientePago` (SLT-137, SLT-123 R320) | Dos lecturas en lote (`sumarVigentesPorCierre`, `sumarPremiosVivosPorCierre`) y el mapa por cierre. Es la celda «Pago». |
| Lecturas en lote | `ILiquidacionPagoRepository.sumarVigentesPorCierre`, `IPagoMensajeroMovimientoRepository.sumarPremiosVivosPorCierre` | Un `groupBy` cada una; entrada `"0.00"` por cada id pedido; «vigente» = sin fila en `liquidacion_anulacion` (`VIGENTE`). |
| Inyección de las lecturas | `lib/actions/cierre-dia.ts > buildService()` (bundle `pendientes`) | Composition root; `tests/integration/actions/cierre-dia-pendiente-cableado.test.ts` lo vigila. |
| Mes de la empresa | `lib/utils/calendario-zona.ts > periodoMensual`, `inicioDelMesEnUtc`, `sumarDiasCalendario`; `zonaDeLaEmpresa(this.reglasPais, …)` en el servicio | El mes en curso en la zona del país, sin literal de país. |
| Tarjetas | `components/private/cierres/detalle/CifrasCierre.tsx`, `Cifra`/`CifraId` en `detalle-cierre-vista.ts`; precedente `tarjetasSolicitados()` de SLT-107 | La caja de tarjetas y su forma de dato. |
| Cola del mensajero | `ColaCierres.tsx` (`ColaCierresPropiosProps`, SLT-137), `cola-propia-vista.ts`, `CierreDiaModule.tsx`, `app/(app)/cierre-dia/page.tsx` | Dónde se pintan. Hoy la variante «propios» no tiene hueco de tarjetas (SLT-137 design: «no se añade ninguno», por R158). |
| Pagos | `liquidacion_pago.fecha_pago` (`@db.Date`, la fecha real del pago, R9 de la 172), `mensajero_id`, `monto`; índice `(mensajero_id, fecha_pago)` | La suma del mes con un índice que ya existe. |

**Lo que no existe todavía:** el movimiento «pagado por la satélite» (`pago_satelite`). Lo crea
SLT-139 «Pago al mensajero independiente del efectivo: satélite», que se especifica en paralelo y
cuyo spec aún no estaba escrito al cerrar este. Ver `## SLT-139`.

## Zona y capas

Fullstack. `backend_dev`: interfaces, repositorios, servicio, acción y sus tests. `frontend_dev`:
`page.tsx`, `CierreDiaModule.tsx`, `ColaCierres.tsx`, `cola-propia-vista.ts`, `detalle-cierre-vista.ts`
y sus tests, y el E2E.

## 1. Contrato

```ts
// lib/interfaces/services/ICierreDiaService.ts
export interface CifraGanancia { monto: string; conteo: number }   // monto: escala 2

/** SLT-112 (R350-R353): las dos tarjetas de «Cierres solicitados». */
export interface ResumenGananciaMensajero {
  /** R350: Σ pendiente de los aprobados; conteo = aprobados con pendiente > 0. */
  pendiente: CifraGanancia;
  /** R352/R353: Σ pagos vigentes con `fecha_pago` en el mes (+ satélite, según PA1); conteo = pagos. */
  pagadaEsteMes: CifraGanancia;
}

export type ResumenGananciaServiceResult =
  | { status: "ok"; resumen: ResumenGananciaMensajero }
  | { status: "sin_dato" }        // R357: el servicio no tiene las lecturas
  | { status: "forbidden" };      // R359

/** SLT-112 (R353): la lectura que SLT-139 implementa e inyecta (según PA1). */
export interface LecturaPagadoPorSatelite {
  /** Σ y nº de movimientos «pagado por la satélite» del mensajero con `fecha_movimiento` en [desde, hasta). */
  sumarPagadoPorSateliteEnRango(mensajeroId: string, desde: Date, hasta: Date): Promise<CifraGanancia>;
}

/** SLT-112: lo que el servicio necesita además de `pendientes` (SLT-137). */
export interface LecturasGananciaMensajero {
  pagos: Pick<ILiquidacionPagoRepository, "sumarVigentesDelMensajeroEnRango">;
  pagadoPorSatelite?: LecturaPagadoPorSatelite;   // R353: ausente = solo R352
  ahora?: () => Date;                              // para fijar «hoy» en los tests
}

// ICierreDiaService gana:
resumenGanancia(actor: Actor): Promise<ResumenGananciaServiceResult>;
```

Repositorios (métodos nuevos):

```ts
// ICierreDiaRepository
/** SLT-112 (R350): los cierres `aprobado` del mensajero, solo lo que pide la regla del pendiente. */
findAprobadosParaPendiente(mensajeroId: string): Promise<Array<{
  cierreId: string; totalPagoMensajero: string; totalEfectivo: string; pagoIndependienteEfectivo: boolean;
}>>;

// ILiquidacionPagoRepository
/** SLT-112 (R352): Σ y nº de pagos VIGENTES del mensajero con `fecha_pago` en [desde, hasta). */
sumarVigentesDelMensajeroEnRango(mensajeroId: string, desde: Date, hasta: Date): Promise<CifraGanancia>;
```

- `findAprobadosParaPendiente`: `findMany` con `where: { mensajeroId, estado: "aprobado" }` y `select`
  de las cuatro columnas; Decimales a `toFixed(2)`. La empresa la pone la extensión del cliente, como
  en el resto del repositorio.
- `sumarVigentesDelMensajeroEnRango`: `aggregate` con `where: { mensajeroId, fechaPago: { gte: desde,
  lt: hasta }, ...VIGENTE }`, `_sum.monto` y `_count._all`. Sin filas: `{ monto: "0.00", conteo: 0 }`.
  Usa el índice `(mensajero_id, fecha_pago)` que ya existe.

## 2. Cálculo en `CierreDiaService.resumenGanancia`

Constructor: un parámetro opcional **al final**, después de `pendientes`:
`private readonly ganancia?: LecturasGananciaMensajero`. Opcional y al final por la misma razón que
SLT-137: las 30+ construcciones de hoy siguen compilando sin tocarlas.

1. `actor.rol !== "mensajero"` → `forbidden`, sin leer nada (R359).
2. Sin `this.pendientes` o sin `this.ganancia` → `sin_dato` (R357).
3. `aprobados = await this.repo.findAprobadosParaPendiente(actor.usuarioId)`.
4. `porCierre = await this.pendientesPorCierre(aprobados)` — **helper privado nuevo, compartido con
   `conPendientePago`** (ver abajo). Dos lecturas en lote, también con la lista vacía.
5. `pendiente.monto` = Σ `Prisma.Decimal` de `porCierre`; `pendiente.conteo` = nº con `gt(0)`.
6. Mes: `zona = await this.zona("resumenGanancia")`; `periodo = periodoMensual(ahora, zona)`;
   `desde = new Date(\`${periodo}-01T00:00:00.000Z\`)`, `hasta` = día 1 del mes siguiente, mismo formato
   (fechas calendario a medianoche UTC: la convención de `@db.Date` del repo, la misma de `fecha_pago`).
7. `pagos = await this.ganancia.pagos.sumarVigentesDelMensajeroEnRango(actor.usuarioId, desde, hasta)`.
8. Si `this.ganancia.pagadoPorSatelite` está (R353): `sat = await …sumarPagadoPorSateliteEnRango(
   actor.usuarioId, inicioDelMesEnUtc(ahora, zona), inicioDelMesEnUtc(primerDiaDelSiguiente, zona))` —
   aquí son **instantes**, porque `fecha_movimiento` es `timestamp`— y se suma monto y conteo.
9. Todo en `Prisma.Decimal`, salida `toFixed(2)` (R355). Una excepción de cualquier lectura sube al
   borde, que la convierte en error; la página la trata como R357.

### El helper compartido (R351)

```ts
/** Lo pendiente de cada cierre aprobado: la celda «Pago» y la tarjeta usan ESTE, no otro. */
private async pendientesPorCierre(
  cierres: ReadonlyArray<{ cierreId: string; totalPagoMensajero: string; efectivo: string; pagoIndependienteEfectivo: boolean }>,
): Promise<Record<string, string>>;
```

`conPendientePago` pasa a llamarlo con sus aprobados (`efectivo: c.totales.efectivo`) y deja de tener
el mapa propio. Su resultado no cambia (R72): `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
y `tests/integration/db/cierre-dia-pendiente-pago.test.ts` siguen verdes sin tocar aserciones.

**Por qué un helper y no dos copias:** SLT-139 R338 añade a lo pendiente de un cierre nuevo el término
«pagado por la satélite» (con su lectura inyectada, R335). Si la tarjeta tuviera su propia copia del
mapa, SLT-139 tendría que acordarse de cambiar dos sitios; con un helper, la tarjeta hereda el cambio y
R351 lo prueba (tarjeta = Σ celdas).

### Consultas (R356)

Siempre las mismas: aprobados (1) + pagos vigentes por cierre (1) + premios vivos por cierre (1) + zona
horaria (la de `reglasPais`, 1) + pagos del mes (1) [+ satélite (1), según R353]. Ninguna depende del
número de cierres ni de pagos. El test de integración lo mide con el espía de sentencias de
`_postgres-real` (patrón SLT-111 T0.3): mismas sentencias con 6 aprobados (M) y con 1 (M3).

**Coste conocido:** los aprobados de un mensajero son uno por día trabajado, así que el `IN` de las dos
lecturas en lote crece con su antigüedad (cientos de ids al año). Es el mismo orden que
`listarCierresPasadosCompleto` ya trae entero (excepción declarada de la 184). Si un día pesa, la
mejora es acotar a los aprobados aún no liquidados con una marca persistida, que es otra ficha.

## 3. Borde y página

- `lib/actions/cierre-dia.ts`: acción nueva `resumenGananciaMensajero(deps)`, mismo patrón que
  `listarCierreDia` (actor de la sesión; sin input de negocio: el `mensajero_id` sale del actor).
  `buildService()` añade como último argumento
  `{ pagos: new LiquidacionPagoRepository(prisma) }` (sin `pagadoPorSatelite` hasta SLT-139).
- `app/(app)/cierre-dia/page.tsx`: la añade al `Promise.all` que ya hay. Solo `status: "ok"` se pasa al
  módulo (`resumenGanancia={…}`); cualquier otro resultado pasa `undefined` y **no** llama a
  `notFound()` (R357: la página carga igual). Las cifras se leen en cada render del Server Component;
  `router.refresh()` las relee por el mismo camino (R360).
- `CierreDiaModule.tsx`: prop opcional `resumenGanancia?: ResumenGananciaMensajero`; la convierte con
  `tarjetasGanancia()` y la pasa a `ColaCierres`. No llega por SWR: no depende de la página ni de los
  filtros (R354), así que paginar o filtrar no la toca.

### Autorización y multi-empresa

- `/cierre-dia` ya es solo del rol mensajero (`page.tsx` hace `notFound()` con otro rol; R1 de la 37).
  El servicio lo vuelve a exigir (R359) antes de leer.
- El `mensajero_id` de las tres consultas es `actor.usuarioId`; las dos lecturas en lote reciben solo
  ids que salieron de ese `WHERE`.
- `cierre_dia`, `liquidacion_pago`, `liquidacion_anulacion` y `pago_mensajero_movimiento` ya tienen
  `organizacion_id` y RLS por empresa (SL-17); la empresa sale de la sesión por la extensión del
  cliente. El test de integración siembra una segunda empresa (R354).
- Ningún módulo que deba estar encendido.

### Modelo de datos, RLS y migraciones

Ninguno (R72). Sin `down.sql`.

### Datos que dependen del país

- Mes en curso: la zona horaria de la empresa (`reglasPais.zonaHoraria()`), nunca un literal.
- Moneda: `money()` de `lib/config/moneda` en la tarjeta (lo de hoy en `CifrasCierre`).
- Impuestos, geografía, métodos de pago: no aplica.

## 4. Pantalla

### `cola-propia-vista.ts`

```ts
export const TARJETA_GANANCIA_PENDIENTE = "Ganancia pendiente de pago";
export const TARJETA_GANANCIA_PAGADA = "Ganancia pagada este mes";
export const CIFRAS_GANANCIA_LABEL = "Tu ganancia";          // nombre del grupo de tarjetas
export function notaCierresSinLiquidar(n: number): string;   // «Ningún cierre aprobado sin liquidar» | «1 cierre aprobado sin liquidar» | «<n> cierres aprobados sin liquidar»
export function notaPagosDelMes(n: number): string;          // «Ningún pago este mes» | «1 pago» | «<n> pagos»
export function tarjetasGanancia(r: ResumenGananciaMensajero): Cifra[];  // [pendiente (destacada), pagada]
```

`CifraId` (`detalle-cierre-vista.ts`) gana `"gananciaPendiente"` y `"gananciaPagada"`. El `valor` es el
string del servidor, sin tocar (R71). Las notas en cero son decisión de este spec (el canvas no las
dibuja); van en trato tú.

### `ColaCierres.tsx`

`ColaCierresPropiosProps` gana `tarjetas?: readonly Cifra[]`. Con `tarjetas` y longitud > 0, la rama
«propios» pinta `<CifrasCierre cifras={tarjetas} ariaLabel={CIFRAS_GANANCIA_LABEL} />` entre la barra y
la `<section>` de la tabla (canvas `ColaCierres.dc.html`, kpis entre barra y tabla). Sin `tarjetas`, nada
(R357/R158). Es el mismo patrón que `PanelSolicitados` de SLT-107.

## 5. SLT-139 (antes y después)

| Momento | «Ganancia pendiente» | «Ganancia pagada este mes» |
|---|---|---|
| **Antes de SLT-139** (hoy) | Helper compartido con la regla de SLT-123. Los cierres de satélite son todos viejos. | Solo pagos de liquidación (R352). `pagadoPorSatelite` no se inyecta: no hay movimientos `pago_satelite` que contar, así que la cifra es exacta. Nada en este código nombra el valor de categoría, que aún no existe. |
| **Después de SLT-139**, PA1 = sí | SLT-139 R338/R335 meten «pagado por la satélite» en `pendientesPorCierre`; la tarjeta lo hereda (R351). | SLT-139 implementa `LecturaPagadoPorSatelite` en `PagoMensajeroMovimientoRepository` (`categoria = 'pago_satelite'`, `tipo = 'pago'`, `fecha_movimiento` en rango) y la inyecta en `buildService()`. R353 se activa sin tocar el servicio. |
| **Después de SLT-139**, PA1 = no | Igual. | Se quita `pagadoPorSatelite` del contrato antes de implementar esta ficha (`tasks.md > T0.3`). |

**Lo que SLT-139 hereda** (se anota en `progress/features/SLT-112.md` para su spec, `tasks.md > T7`):
añadir el término en `pendientesPorCierre`, no en `conPendientePago`; implementar e inyectar la lectura
de R353 con un test de cableado (memoria «el composition root que no inyecta»); y un caso de
integración con un cierre nuevo de satélite conciliado en el mes.

**Orden de merge.** Las dos tocan `CierreDiaService.ts` y `lib/actions/cierre-dia.ts`. Si SLT-139 entra
antes, esta rama trae `origin/dev` antes de T2 y su `pendientesPorCierre` arranca con el término de
R338. El candado de archivos (`docs/equipo.md`) decide si van a la vez.

## 6. Verificación

### Integración contra Postgres real (`tests/integration/db/cierre-dia-ganancia-sql-real.test.ts`)

Base desechable, transacción que siempre se revierte (patrón `cierre-dia-pendiente-pago.test.ts`),
`describeSiHayBase`; con base y sin el corpus sembrado, **falla** (nada de `if (!x) return`). Servicio
real sobre repositorios reales, `ahora = 2026-11-20T15:00:00Z` y la zona de la empresa de prueba
(`reglasPaisFijas`). Corpus de la empresa A, mensajero M (P = `total_pago_mensajero`, E =
`total_efectivo`):

| Cierre | Estado / marca | P / E | Pagos y premios | Pendiente |
|---|---|---|---|---|
| C1 | aprobado, viejo | 50 000,55 / 5 000,00 | — | 45 000,55 |
| C2 | aprobado, nuevo | 4 000,00 / 10 000,00 | pago vigente 1 500,00 (fecha 2026-11-03); pago 700,00 (2026-11-04) **anulado** | 2 500,00 |
| C3 | aprobado, nuevo | 3 000,00 / 0,00 | pago vigente 3 000,00 (2026-10-31) | 0,00 |
| C4 | aprobado, nuevo | 2 000,00 / 0,00 | pago vigente 2 000,00 (2026-11-01) | 0,00 |
| C5 | aprobado, nuevo | 500,00 / 0,00 | pago vigente 500,00 (2026-12-01) | 0,00 |
| C6 | aprobado, viejo | 1 000,00 / 1 000,00 | — (dado por pagado con el efectivo) | 0,00 |
| C7 | solicitado | 9 999,00 / 0,00 | — | no cuenta |
| C8 | rechazado | 7 777,00 / 0,00 | — | no cuenta |

Más: mensajero M2 de la empresa A con un cierre aprobado nuevo P 10 000,00 y un pago vigente 1 000,00
(2026-11-05); y la empresa B con su mensajero, un cierre aprobado nuevo P 8 000,00 y un pago vigente
600,00 (2026-11-05).

Esperado para M (escrito a mano):
- **Ganancia pendiente:** 45 000,55 + 2 500,00 = **`"47500.55"`, conteo 2** (R350, R69; S14 del madre).
- **Ganancia pagada este mes:** 1 500,00 (C2, 3 nov) + 2 000,00 (C4, 1 nov) = **`"3500.00"`, conteo 2**
  (R352). No entran: el anulado 700,00, el de octubre 3 000,00, el del 1 de diciembre 500,00, ni nada de
  M2 o de la empresa B (R354).
- **R351:** la página 1 de `listarCierresPasadosPaginado` de M (todos sus cierres caben) da por cierre
  los pendientes de la tabla, y su suma es `"47500.55"`.
- **R354 (filtros):** con un filtro que deja fuera C1, la cola cambia y `resumenGanancia` no.
- **R356:** mismas sentencias SQL con M (seis aprobados) y con un mensajero M3 de un solo aprobado.
- **R72:** recuento de filas de `cierre_dia`, `liquidacion_pago`, `liquidacion_anulacion` y
  `pago_mensajero_movimiento` igual antes y después.

### Mutaciones (cada una debe poner rojo un test; `tasks.md > T4`)

1. Quitar `mensajeroId` del `WHERE` de `sumarVigentesDelMensajeroEnRango` → suma 1 000,00 de M2.
2. Quitar `VIGENTE` → suma el anulado 700,00.
3. `lte: hasta` en vez de `lt` → suma el 1 de diciembre.
4. `gt: desde` en vez de `gte` → pierde el 1 de noviembre.
5. Quitar `estado: "aprobado"` de `findAprobadosParaPendiente` → suman C7 y C8.
6. Quitar `mensajeroId` de `findAprobadosParaPendiente` → suma el de M2.
7. En el servicio, `pagoIndependienteEfectivo: false` fijo → C2 da 0,00 (E ≥ P) y la cifra baja.
8. Contar todos los aprobados en vez de los de pendiente > 0 → conteo 6.
9. Mes calculado en UTC en vez de la zona de la empresa, con `ahora = 2026-12-01T03:00:00Z` (aún 30 de
   noviembre en la zona de prueba) → el mes salta a diciembre.

### Servicio con dobles (`tests/unit/services/cierre-dia-ganancia.test.ts`)

`forbidden` con otro rol sin llamar a ninguna lectura (R359); `sin_dato` sin `ganancia` o sin
`pendientes` (R357); con la lectura de satélite (doble que devuelve `{ "1200.00", 1 }`) la pagada sube
y el conteo también, y sin ella es exactamente la de R352 (R353); importes con tres decimales en la
entrada salen redondeados a escala 2 con `Prisma.Decimal` (R355).

### Pantalla

- `tests/unit/utils/cola-propia-vista.test.ts`: `tarjetasGanancia` con literales (orden, destacada,
  valor intacto, notas en 0, 1 y n).
- `tests/components/CierreDiaColaPropia.test.tsx`: el caso de R158 pasa a «sin `resumenGanancia` → sin
  tarjetas»; nuevo «con `resumenGanancia` → las dos tarjetas con `₡47.500,55`… y sus notas, también en
  0»; cambiar de página o filtrar no las cambia.
- `tests/components/CierreDiaPage.test.tsx`: la acción falla → la página se pinta sin tarjetas y sin
  `notFound` (R357).

### E2E (`e2e/cierres-rediseno.spec.ts`, suite serial «SLT-102 — la fila de la cola única»)

En el test de la central que aprueba y registra el pago del cierre del mensajero central (P 3 500), el
mensajero abre `/cierre-dia` antes del pago (pendiente «₡3.500», «1 cierre aprobado sin liquidar»;
pagada en cero, «Ningún pago este mes») y después (pendiente en cero, «Ningún cierre aprobado sin
liquidar»; pagada «₡3.500», «1 pago») (R358, R360). Los literales de moneda, los que pinta `money()`
como en el resto del archivo. Corre en local (`--project=dinero`) antes del PR (`docs/perfil-agentes.md`).

## Alternativas descartadas

- **Calcular lo pendiente total en SQL** (`SUM(GREATEST(P − LEAST(P, E) …))`): una consulta menos, pero
  duplica la regla de SLT-123 en un segundo lenguaje; la próxima vez que cambie (SLT-139 R338 ya la
  cambia) se desincronizan en silencio. Se queda la función única (R351).
- **Meter el resumen en `listarCierresPasadosPaginado`**: viajaría con cada cambio de página o filtro y
  tentaría a calcularlo sobre la página. Las cifras son del conjunto (R354); van en su propia lectura
  por render.
- **Sumar en el cliente los pendientes de la página**: viola R71 y solo vería una página.
- **Leer lo «pagado por la satélite» desde ya, con `categoria::text = 'pago_satelite'` en SQL crudo**:
  funcionaría antes (0 filas) y después, pero ata esta ficha a un nombre que SLT-139 aún no ha fijado y
  daría 0 en silencio si lo nombra distinto. El puerto opcional (R353) deja la consulta a quien crea el
  valor.
- **Contar en «pagada» el `pago_efectivo` de los cierres viejos**: ver PA2.

## Dependencias de terceros

Ninguna nueva.

## Riesgos

- SLT-139 en paralelo sobre los mismos archivos (`## 5 > Orden de merge`).
- Un mensajero con años de cierres: `IN` largo en las dos lecturas en lote (`## 2 > Coste conocido`).
- El E2E corre un día 1 a las 00:0x de la zona: el pago del test se fecha «hoy» y cae en el mes, así
  que no depende del día; se anota por si el diálogo cambia la fecha por defecto.
