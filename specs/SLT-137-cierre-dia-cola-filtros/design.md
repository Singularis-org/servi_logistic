# SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros» — design (S10b, sin filtros)

> Hereda el diseño del madre (`specs/SLT-95-detalle-cierre-rediseno/design.md > 2. Cola de cierres —
> ColaCierres`) y el de SLT-108 «/cierre-dia: detalle y cola únicos para el mensajero» (detalle
> único). Aquí solo va lo que añade esta ficha: la cola con rol mensajero y el pendiente de pago en
> el servidor. El buscador y los filtros son de SLT-138 «/cierre-dia: buscador y filtros de la cola
> del mensajero» (`requirements.md > ## Fuera de alcance > → SLT-138`).

## Lo que ya existe

**Términos buscados:** «Cierres solicitados», `ColaCierres`, `CierrePasadoDTO`,
`listarCierresPasadosPaginado`, `pendientePagoMensajero`, `derivarPendienteCierre`,
`sumarVigentesPorCierre`, `sumarPremiosVivosPorCierre`, `DESTINO_TIPO_LABEL`.

**Dónde:** `specs/` (SLT-95, SLT-108, SLT-106) y el código con Grep/Read. El índice del grafo no
tiene este worktree («project not found»); no se usó el de otro.

| Qué | Dónde | Uso aquí |
|---|---|---|
| `ColaCierres`, unión discriminada por `tipo` (`mensajero` = cola del admin, `bodega`) | `components/private/cierres/cola/ColaCierres.tsx:95-164` | Se le añade un tercer `tipo`, `propios`, con `rol: "mensajero"`. Esqueleto, pestañas, barra, «Descargar», tabla y pie se reutilizan. |
| `folioDe`, `fechaHora` | `components/private/cierres/detalle/detalle-cierre-vista.ts:157,162` | Folio y «Solicitado» con el mismo formato que la cola de la central (R156). |
| `EstadoCierreBadge` | `app/(app)/cierres-admin/_components/cierre-detalle-shared` | La pastilla de estado de hoy (R156). |
| `DESTINO_TIPO_LABEL` | `app/(app)/cierres-admin/_components/cierre-labels.ts:116` | «Bodega central» / «Bodega satélite», sin la zona (R156). |
| `hayPendienteDeLiquidar` | `app/(app)/cierres-admin/_components/PendienteLiquidarBadge.tsx:34` | Compara el pendiente como TEXTO, sin convertir a número (R71, R157). |
| `money` | `lib/config/moneda` | Formateador compartido de Recaudado y Ganancia (R156). |
| `derivarPendienteCierre` | `lib/utils/pendiente-cierre.ts:59` | La regla del pendiente, sin copia (R164). |
| `sumarVigentesPorCierre` / `sumarPremiosVivosPorCierre` | `ILiquidacionPagoRepository.ts:369`, `IPagoMensajeroMovimientoRepository.ts:206` | Una lectura de cada uno por página (R165). |
| `CierresAdminService.conPendiente` | `lib/services/CierresAdminService.ts:1287-1365` | El patrón: ids de aprobados → dos lecturas en lote → `derivarPendienteCierre` por fila. |
| `listarCierresPasadosPaginado` | `lib/services/CierreDiaService.ts:534` | Se le añade el pendiente al final; el `WHERE` (alcance del actor) no cambia. |
| «Cierres solicitados» de hoy | `app/(app)/cierre-dia/_components/CierreDiaModule.tsx:929-989` | `ListaComprobantes` + `CierreFacturaResumenPropio` se sustituyen por `ColaCierres`. SWR, paginación, «Descargar» y `abrirDetalle` se conservan. |
| Prueba de integración del pendiente | `specs/SLT-108-cierre-dia-cola-unica/requirements.md > Pendiente de pago por cierre (servidor)` | Se copia abajo y se amplía (premio y alcance). |
| Patrón de cableado | `tests/integration/actions/gestion-desde-ayuda-cableado.test.ts` | Test de que `buildService()` PASA las dos lecturas. |
| Helpers de Postgres real | `tests/integration/db/_postgres-real` | `HAY_BASE_DE_DATOS`, `crearPrismaDeTest`, `enTransaccionRevertida`. |

No hay ficha ni código que ya haga la cola del mensajero ni su pendiente: se reutiliza lo de arriba.

## Zona y capas

**Fullstack.** `backend_dev` hace T1 (`lib/` y sus tests); `frontend_dev` hace T2 (`components/`,
`app/(app)/cierre-dia/` y sus tests). T2 depende de T1 solo por el tipo `CierrePasadoDTO`.

Sin cambios en `db/`, sin migraciones, sin Server Actions de escritura, sin permisos nuevos (R72).

## 1. Servidor: `pendientePagoMensajero` en el listado paginado (R164, R165)

### Contrato

```ts
// lib/interfaces/services/ICierreDiaService.ts — campo ADITIVO
export interface CierrePasadoDTO {
  // …lo de hoy…
  /**
   * SLT-137 (R164): solo lo emite `listarCierresPasadosPaginado` con las lecturas inyectadas.
   * `aprobado` → string de escala 2, nunca negativo. Otro estado → `null`.
   * Ausente (`undefined`) = el servicio no lo calculó: la celda dice «Sin dato» (R157).
   */
  pendientePagoMensajero?: string | null;
}

/** SLT-137 (R165): las dos lecturas en lote del pendiente. */
export interface LecturasPendienteCierre {
  liquidaciones: Pick<ILiquidacionPagoRepository, "sumarVigentesPorCierre">;
  premios: Pick<IPagoMensajeroMovimientoRepository, "sumarPremiosVivosPorCierre">;
}
```

`CierreDiaService` gana un parámetro opcional **al final** del constructor, después de `reglasPais`:

```ts
private readonly pendientes?: LecturasPendienteCierre,
```

Opcional y al final para que las 30+ construcciones de hoy (tests e integración) sigan compilando
sin tocarlas. Sin él, el listado devuelve lo de hoy, sin el campo (R165: nada inventado).

### Cálculo (en `listarCierresPasadosPaginado`, después del `findCierresByMensajeroPaginado`)

1. Si `this.pendientes` no está, devolver `items` tal cual.
2. `ids` = los `cierreId` de los `items` con `estado === "aprobado"`.
3. **Una** llamada a `sumarVigentesPorCierre(ids)` y **una** a `sumarPremiosVivosPorCierre(ids)`,
   también con la lista vacía (mismo número de consultas sea cual sea la página, como
   `conPendiente`).
4. Por fila: `aprobado` → `derivarPendienteCierre({ pagoDebido: totalPagoMensajero, efectivo:
   totales.efectivo, premiosVivos: premios[id] ?? "0.00", pagadoVigente: pagados[id] ?? "0.00" })`;
   otro estado → `null`.

Va en un helper privado `conPendientePago(items)` dentro del servicio. No se extrae un helper común
con `CierresAdminService.conPendiente`: el del admin además lee señales, retenidas y bloqueo, y
compartir solo las tres líneas del mapa no ahorra nada (ver alternativas).

`listarCierresPasadosCompleto` (el archivo de «Descargar») **no** cambia: sus columnas no llevan el
pendiente (R159).

### Cableado (R165)

`lib/actions/cierre-dia.ts > buildService()` añade, como último argumento:

```ts
{
  liquidaciones: new LiquidacionPagoRepository(prisma),
  premios: new PagoMensajeroMovimientoRepository(prisma),
},
```

`app/(app)/cierre-dia/page.tsx` ya llama a la acción `listarCierresPasadosPaginado({})`, que usa
`buildService()`: la página 1 del Server Component trae el campo sin tocar `page.tsx`.

### Autorización y multi-empresa

- La autorización no cambia: `actor.rol === "mensajero"` y `mensajero_id = actor.usuarioId` en el
  `WHERE` de `findCierresByMensajeroPaginado`, antes de leer nada (R1/R2 de la feature 37).
- Las dos lecturas nuevas reciben **solo** ids que ya salieron de ese `WHERE`: no amplían el
  alcance. Las tablas (`liquidacion_pago`, `pago_mensajero_movimiento`) ya tienen
  `organizacion_id` y RLS `<t>_por_empresa` (SL-17); la empresa sale de la sesión.
- Ningún módulo nuevo que deba estar encendido: `/cierre-dia` ya es solo del rol mensajero.

### Modelo de datos, RLS y migraciones

Ninguno. Sin tablas, columnas, índices ni migraciones (R72), así que no hay `down.sql`.

### Datos que dependen del país

- Moneda: `money()` de `lib/config/moneda` (lo de hoy). Ningún símbolo escrito a mano.
- Fecha y hora de «Solicitado»: `fechaHora` y `fechaCalendarioCR`, los mismos que la cola de la
  central y el «Ver» de hoy (R156). No se cambia la zona aquí.
- Impuestos, geografía, métodos de pago: no aplica.

## 2. Pantalla: `ColaCierres` con rol mensajero (R60, R155-R160, R163, R166, R180, R181)

### Props nuevas en `ColaCierres.tsx` (cambio mínimo)

```ts
/** SLT-137: «Cierres solicitados» del propio mensajero en /cierre-dia. */
export interface AccionesColaPropia {
  abrir: (c: CierrePasadoDTO) => void;
  /** El `cierreId` cuyo detalle se está leyendo (R181), o `null`. */
  leyendo: string | null;
}

export interface ColaCierresPropiosProps extends Omit<ColaComun, "rol"> {
  tipo: "propios";
  rol: "mensajero";
  filas: readonly CierrePasadoDTO[];
  acciones: AccionesColaPropia;
}
```

En `ColaCierres` solo cambian tres cosas:
1. la firma acepta `ColaCierresProps | ColaCierresBodegaProps | ColaCierresPropiosProps`;
2. el `aria-label` del `TabsList`: `props.tipo === "propios" ? TABLIST_PROPIA : tablistCola(props.tipo)`;
3. una rama más en el cuerpo de la pestaña: `tipo === "propios"` → `<TablaColaPropia …/>`.

La tabla vive en un **archivo nuevo**, `components/private/cierres/cola/TablaColaPropia.tsx`, y su
lógica pura y textos en `components/private/cierres/cola/cola-propia-vista.ts`. Usa el `DataTable`
compartido con `ariaLabel={region}`, igual que `TablaCola`, para que siga habiendo una sola tabla de
datos en la cola.

**Por qué así (SLT-106 en vuelo):** SLT-106 «Bodega satélite: A consolidar con la cola única» toca
`ColaCierres.tsx`, `cola-cierres-vista.ts` y `cola-cierres-labels.ts` para la variante bodega ·
satélite. Esta ficha **no toca** `cola-cierres-vista.ts` ni `cola-cierres-labels.ts`: no añade
valores a `TipoCola`, `RolCola`, `PestanaCola` ni `ColumnaColaId`. En `ColaCierres.tsx` el cambio es
de ~20 líneas en tres puntos. **Orden:** SLT-106 mergea antes; esta rama trae `origin/dev` con
SLT-106 dentro antes de tocar `ColaCierres.tsx` (`tasks.md > T0.1`, `T2.2`).

### La única pestaña (R155)

`ColaCierres` exige pestañas de tipo `PestanaCola` (`"pendientes" | "resueltos"`). La cola propia
pasa **una** pestaña con `id: "pendientes"`, `label: "Cierres solicitados"` y `conteo: total`; el
`value` de la pestaña no se ve ni se anuncia (el nombre accesible es el `label` + conteo).
`onPestana` es una función vacía. Así no se toca `PestanaCola` (alternativa descartada abajo).

### Textos (todos en `cola-propia-vista.ts`, trato tú, R180)

| Constante | Texto |
|---|---|
| `DESCRIPCION_PROPIA` | «Tus cierres enviados a aprobación y cómo terminaron.» |
| `PESTANA_PROPIA` | «Cierres solicitados» |
| `TABLIST_PROPIA` | «Tus cierres» |
| `REGION_PROPIA` | «Cierres solicitados» |
| `VACIO_PROPIA` | «Aún no has solicitado ningún cierre.» (el de hoy, R160) |
| `ERROR_PROPIA` | «No se pudieron cargar tus cierres solicitados.» (el de hoy, R160) |
| `PAGO_PENDIENTE` / `PAGO_LIQUIDADO` / `PAGO_SIN_DATO` | «Pendiente de pago» / «Liquidado» / «Sin dato» |
| `MOTIVO_SIN_TEXTO` | «La bodega no indicó un motivo.» |
| Columnas | Folio, Solicitado, Destino, Estado, Recaudado, Ganancia, Pago, y la de acciones (solo lector, «Acciones») |

`PAGINACION_PASADOS_LABEL` («Paginación de los cierres solicitados») y `VER_DETALLE_LABEL` («Ver»)
siguen en `CierreDiaModule.tsx`, donde ya están y los importan los tests.

### Lógica pura (`cola-propia-vista.ts`)

```ts
export type PagoPropio =
  | { tipo: "motivo"; texto: string }      // rechazado
  | { tipo: "pendiente" } | { tipo: "liquidado" } | { tipo: "sinDato" } // aprobado
  | { tipo: "nulo" };                      // cualquier otro estado → «—»

export function pagoPropioDe(
  c: Pick<CierrePasadoDTO, "estado" | "motivoRechazo" | "pendientePagoMensajero">,
): PagoPropio;
export function textoPagoPropio(p: PagoPropio): string;
export function columnasColaPropia(): ColumnaPropia[];
export function destinoPropio(c: Pick<CierrePasadoDTO, "destinoTipo">): string; // DESTINO_TIPO_LABEL
```

Regla de `pagoPropioDe` (R157):
- `rechazado` → `motivo`, con «Motivo: «<motivo>»» si hay motivo no vacío, o `MOTIVO_SIN_TEXTO`;
- `aprobado` y `typeof pendientePagoMensajero === "string"` → `pendiente` si
  `hayPendienteDeLiquidar(p)`, si no `liquidado`;
- `aprobado` sin string (ausente o `null`) → `sinDato`;
- otro estado → `nulo`.

Ningún importe se convierte a número ni se opera (R71): el único que toca un string de dinero en el
`.tsx` es `money()`.

### Celdas de `TablaColaPropia` (R156, R181)

| Columna | Celda |
|---|---|
| Folio | `#${folioDe(c.cierreId)}` en `font-mono` |
| Solicitado | `fechaHora(c.solicitadoAt)` |
| Destino | `destinoPropio(c)` |
| Estado | `<EstadoCierreBadge estado={c.estado} />` |
| Recaudado | `money(c.totales.general)` |
| Ganancia | `money(c.totalPagoMensajero)` |
| Pago | `textoPagoPropio(pagoPropioDe(c))` |
| acciones | `<Button variant="outline">Ver</Button>` con `aria-label` «Ver del cierre del <fechaCalendarioCR(solicitadoAt)>», `disabled` y `aria-busy` cuando `acciones.leyendo === c.cierreId` |

### Montaje en `CierreDiaModule.tsx` (R60, R158-R160, R166)

Sustituye el bloque de las líneas 929-989 (sección, `h2`, «Descargar», `ListaComprobantes` y
`Pagination`) por:

```tsx
<section className="flex flex-col gap-3">            {/* sin nombre: no es región */}
  <h2 className="text-lg font-semibold">Cierres solicitados</h2>
  <ColaCierres
    tipo="propios"
    rol="mensajero"
    descripcion={DESCRIPCION_PROPIA}
    pestanas={[{ id: "pendientes", label: PESTANA_PROPIA, conteo: pasadosData?.total ?? 0 }]}
    pestanaActiva="pendientes"
    onPestana={() => {}}
    barra={null}                                   // SLT-138 pone aquí BuscadorFiltros
    descargar={<DescargarDatasetButton {...DESCARGA_CIERRES_PASADOS} />}
    cargando={pasadosCargando}
    error={pasadosError ? ERROR_PASADOS : null}
    vacio={VACIO_PROPIA}
    region={REGION_PROPIA}
    paginacion={<Pagination …mismas props de hoy… />}
    filas={pasadosData?.items ?? []}
    acciones={{ abrir: abrirDetalle, leyendo: cargandoDetalle }}
  />
</section>
```

- Se quita el `aria-label="Cierres solicitados"` de la `<section>` externa: la región con ese nombre
  la da `ColaCierres` (R155), y dos regiones con el mismo nombre confundirían al lector de pantalla y
  a los `getByRole` de los tests.
- Se quitan los imports de `ListaComprobantes` y `CierreFacturaResumenPropio` (R166). Los
  componentes no se borran (SLT-115).
- SWR, `fallbackData`, `refrescarListas()` (relee todas las páginas tras solicitar, R160),
  `abrirDetalle` y sus toasts (SLT-108) no cambian.
- Sin tarjetas de cifras (R158): `ColaCierres` no tiene hueco de tarjetas y no se añade ninguno.

## Prueba de integración contra Postgres real (R164, R165)

`tests/integration/db/cierre-dia-pendiente-pago.test.ts`, base desechable, con
`describeSiHayBase` y datos que crea el propio test; si el catálogo no está sembrado, **falla**
(nunca `if (!fks) return;`). Usa el `CierreDiaService` real con `CierreDiaRepository`,
`LiquidacionPagoRepository` y `PagoMensajeroMovimientoRepository` reales sobre la transacción.

Para un mensajero M (tabla de SLT-108, tal cual, más C4):

| Cierre | Estado | `P` | `E` | Pagos y premios | Pendiente esperado |
|---|---|---|---|---|---|
| C1 | aprobado | 4 500,00 | 1 000,00 | un pago vigente de 1 000,00 y uno anulado de 500,00 | `min(P,E)` = 1 000 → generado 3 500,00 − 1 000,00 vigente = **`"2500.00"`** (el anulado no resta) |
| C2 | aprobado | 2 000,00 | 5 000,00 | sin pagos | **`"0.00"`** |
| C3 | solicitado | — | — | — | **`null`** |
| C4 (nuevo) | aprobado | 1 000,00 | 0,00 | un premio vivo de 250,00, sin pagos | generado 1 000,00 + 250,00 = **`"1250.00"`** |

Además, otro mensajero M2 con un cierre aprobado y un pago vigente, que no debe aparecer en la
página de M.

Aserciones, en este orden:
1. `expect(items).toHaveLength(4)` y `total === 4` antes de mirar valores.
2. Los cuatro pendientes de la tabla, por `cierreId`.
3. Ningún `cierreId` de M2 en `items`.
4. `cierre_dia.total_pago_mensajero` y `total_efectivo` de C1-C4, leídos antes y después del
   listado, son iguales (R164: leer no cambia lo que se le paga).
5. Un servicio construido **sin** `pendientes` devuelve los mismos `items` sin la propiedad
   `pendientePagoMensajero` (R165).

C4 se añade porque la tabla de SLT-108 no tiene premio y la mutación 5 sobreviviría sin él.

**Mutaciones que deben ponerla en rojo** (se aplican a mano una a una, se ve el rojo, se revierten; se
anota cuál aserción cae en `progress/impl_SLT-137.md`):
1. Contar el pago anulado (quitar el filtro de vigentes en el `WHERE` de `sumarVigentesPorCierre`) →
   C1 da `"2000.00"`.
2. Pasar `pagadoVigente: "0.00"` fijo → C1 da `"3500.00"`.
3. Quitar el filtro de aprobados (`ids` = todos) → C3 deja de ser `null`.
4. Quitar `mensajero_id` del `WHERE` de `findCierresByMensajeroPaginado` → sale el cierre de M2 y
   `toHaveLength(4)` cae.
5. Pasar `premiosVivos: "0.00"` fijo → C4 da `"1000.00"`.

## Tests y guardias que cambian

Censo hecho con Grep sobre `tests/` y `e2e/` («Cierres solicitados», `ListaComprobantes`,
`CierreFacturaResumenPropio`, «Ver del cierre»). T0.2 lo repite.

| Archivo | Por qué |
|---|---|
| `tests/components/CierreDiaModule.test.tsx` | La tira pasa a ser la cola: los `getByRole` de la región y del «Ver». |
| `tests/components/descarga/CierresDescarga.test.tsx` | «Descargar» se monta en el hueco `descargar` de la cola (R159: mismo título, columnas y ámbito). |
| `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx` | La paginación va en el pie de la cola. |
| `tests/unit/descarga/censo-tablas.ts` | `ColaCierres.tsx` gana el montaje `CierreDiaModule.tsx`; `/cierre-dia` deja de montar `ListaComprobantes`. |
| `tests/unit/guards/cascada-central-en-las-dos-pantallas.guardia.test.ts` | Nombra `ListaComprobantes` / `CierreFacturaResumenPropio` en `/cierre-dia`. |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | Su auto-captura exige censar todo archivo nuevo de `components/private/cierres/` (R71). |
| `tests/unit/guards/cierres-fecha-cr.guardia.test.ts` | Nombra la tira de `/cierre-dia`; se apunta a `TablaColaPropia.tsx`, que usa `fechaCalendarioCR`. |
| `tests/components/paginacion/ColasPaginacion.test.tsx` | Nombra `ListaComprobantes`; T0.2 confirma si es de `/cierre-dia` o de otra pantalla. |
| `e2e/cierre-dia.spec.ts`, `e2e/cierres-rediseno.spec.ts` | Localizan «Cierres solicitados» y el «Ver» de la tira. |

Tests nuevos: `tests/unit/services/cierre-dia-pendiente-pago.test.ts`,
`tests/integration/db/cierre-dia-pendiente-pago.test.ts`,
`tests/integration/actions/cierre-dia-pendiente-cableado.test.ts`,
`tests/unit/utils/cola-propia-vista.test.ts`, `tests/components/CierreDiaColaPropia.test.tsx`.

`tests/components/ColaCierres.test.tsx` y `ColaCierresBodega.test.tsx` **no se tocan**: siguen verdes
y son la prueba de R163.

## Verificación de lo que ve el usuario

En Preview, con el mensajero del escenario A de `e2e/cierres-rediseno.spec.ts`:
- «Cierres solicitados» enseña la descripción, una pestaña «Cierres solicitados <n>» con `n` igual al
  número de filas de la página 1 (si caben), y las ocho columnas;
- un cierre aprobado con pago parcial dice «Pendiente de pago»; uno saldado, «Liquidado»; uno
  rechazado, su motivo; uno solicitado, «—»;
- «Ver» abre el detalle único de SLT-108; «Descargar» baja el mismo archivo que hoy.

Los literales esperados se anotan a mano en la cabecera del E2E (T3.1), derivados de los datos del
escenario, nunca de la función que los pinta.

## Alternativas descartadas

1. **Reusar `tipo: "mensajero"` (la cola del admin) con un `rol: "mensajero"` nuevo en `RolCola`.**
   Las filas son `CierreAdminResumen` (con `mensajeroNombre`, señales, bloqueo, acciones de decidir);
   las del mensajero son `CierrePasadoDTO`. Meterlas en el mismo `tipo` obliga a ramas por rol en
   `columnasCola`, `accionesFilaDe`, `fechaCola` y la celda «Pago» de `cola-cierres-vista.ts`, el
   archivo que SLT-106 está cambiando. Un `tipo` propio con su tabla en archivo nuevo deja la cola del
   admin intacta (R163) y el choque con SLT-106 en ~20 líneas.
2. **Añadir `"solicitados"` a `PestanaCola`.** Más limpio en el `value` de la pestaña, pero toca
   `cola-cierres-vista.ts` (SLT-106) y fuerza a revisar cada `switch`/ternario sobre `PestanaCola`
   (`fechaCola`, `columnasCola`). El `value` no se ve ni se anuncia: se reutiliza `"pendientes"`.
3. **Calcular el pendiente en el cliente** con `totalPagoMensajero` y `totales.efectivo`. Prohibido por
   R71 y por S10-PA1: el pendiente depende de pagos y premios que el cliente no tiene.
4. **Extraer un helper común con `CierresAdminService.conPendiente`.** Solo comparten la llamada a las
   dos lecturas y el mapa con `derivarPendienteCierre`; el del admin trae además retenidas, señales y
   bloqueo. Extraerlo tocaría `CierresAdminService.ts` (más tamaño y riesgo en dinero del admin) para
   ahorrar ~10 líneas. La regla ya es única: `derivarPendienteCierre`.
5. **Una lectura por fila** (`obtenerPendiente(cierreId)`). N+1 por página; R165 lo prohíbe.

## Dependencias de terceros

Ninguna nueva.

## Riesgos

- **Tamaño al ~90 % del tope de líneas** (`tasks.md > Tamaño`). T1.5 mide tras el backend; si la
  proyección pasa de 1 000, el leader para y pregunta a Carlos (corte en tres de PA1 o
  `tamano-pr-aceptado`).
- **Conflicto con SLT-106 en `ColaCierres.tsx`, `censo-tablas.ts`, `BajoRiesgoPaginacion.test.tsx`,
  `CierresDescarga.test.tsx` y `liquidacion-money-safe.test.ts`.** Mitigación: SLT-106 mergea antes y
  T2.2 parte de `origin/dev` con SLT-106 dentro.
- **Tests de pantalla que hoy leen el comprobante dentro de la tira.** T0.2 los censa antes de tocar
  nada; si aparece un archivo fuera de `## Archivos esperados`, el leader lo decide.
