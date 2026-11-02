# SLT-52 — tarifas-flexibles-modelo · design.md

> Requisitos: `requirements.md` (R1-R45; P1-P4 cerradas por Carlos el 2026-11-02). Zona backend. Sin pantalla (SLT-54),
> sin migración de datos (SLT-53), sin retirar el modelo viejo (SLT-57).
> El MCP `codebase-memory` no respondió (2026-11-02): todo lo de abajo sale de Grep/Read.

## Lo que ya existe

Buscado `grupo de distritos`, `tarifa_valor`, `concepto de tarifa`, `valor propio`, `zona especial`,
`cascada` en `feature_list.json`, `specs/` y el código.

| Apareció | Qué es | Qué se hace con ello |
|---|---|---|
| SLT-53, SLT-54, SLT-55, SLT-57 (board) | Fichas hermanas de la épica EP-8 | Ya están fuera de alcance en «Lo que NO entra». Nada que absorber. |
| SLT-46 (board) | Geografía de N niveles | Se adapta después a los grupos (plan de la épica, punto 8). Este modelo cuelga los grupos de `zona` + `zona_distrito`, no de `nodo_geografico`. |
| `lib/utils/cascada-tarifa.ts` (274) | Cascada pura `whereCascada` + `elegirPorCascada` | Se **reutiliza el patrón** (WHERE plano + elección en memoria, una consulta por lote) para la precedencia nueva. El módulo sigue vivo para el modelo viejo hasta SLT-57. |
| `TarifaVigenteRepository`, `TarifaZonaMensajeroRepository` + `resolvePagoTarifaCon` (398) | Los dos resolvers de hoy | **Se quedan como fachadas** con el mismo constructor: delegan en el resolver único nuevo. Ninguna de las 11 raíces de composición cambia. |
| `zona_distrito` (único `(zona_id, distrito_id)` y, desde SLT-75, `(organizacion_id, distrito_id)`) | Pertenencia distrito→zona | Los grupos apuntan a `zona_distrito` con FK compuesta: un distrito solo entra en un grupo de SU zona y sale solo cuando sale de la zona (R11, R12). |
| `distrito_zona_especial` (SL-38) | Marca de zona especial | No se toca. En el modelo nuevo la zona especial es un grupo más; SLT-53 lo convierte. |
| `TarifaService` (D4) | Matriz de roles maestro escribe / admin lee | Se copia la matriz y la regla «la tienda es `adminTienda` o `apiKey`». |
| `historial_accion` (`tarifa_creada`…) | Historial de cambios de dinero | Se añaden tipos nuevos con su categoría (R14). |
| `cierre_detail` + `tarifaDe` (`lib/utils/cierre-detalle.ts`) | Snapshot y su única reconstrucción | Se amplía (columna `tarifa_modelo` + tabla hija) y `tarifaDe` sigue siendo el único sitio que reconstruye. |
| `gestion_pago_mensajero_ajuste` (SLT-56) | Ajuste manual del pago | Convive: el ajuste reescribe `gestion_orden.pago_mensajero`; lo congelado de la tarifa no se toca. |

No apareció ninguna ficha ni spec que ya resuelva conceptos configurables o grupos de distritos.

## 1. Forma de la solución

```
lib/tarifas/catalogo.ts      ← lista fija de conceptos (R1, R2). Puro.
lib/tarifas/precedencia.ts   ← WHERE plano + elección por nivel (R16-R22). Puro.
lib/tarifas/calculo.ts       ← importe de un valor resuelto, e IVA solo en cobros (R26-R28). Puro, Decimal.
lib/repositories/_shared/resolver-tarifas.ts
                             ← EL resolver único: decide modelo (R36/R37), trae candidatas con
                               un número fijo de consultas (R39) y elige con precedencia.ts.
TarifaVigenteRepository / TarifaZonaMensajeroRepository
                             ← fachadas: mismo constructor, delegan en el resolver único.
ingreso-empresa.ts · pago-mensajero.ts · ingreso-bodega.ts
                             ← mismas funciones públicas; su entrada pasa a una unión
                               { modelo: "viejo" } | { modelo: "nuevo" }. La rama vieja es el
                               código de hoy, intacto (R36).
```

El cálculo vive en un solo sitio por concepto y la elección de la fila en otro: igual que en la
274, listado, cierre, API y cotización no pueden divergir porque no hay dos implementaciones (R38).

## 2. Modelo de datos

### 2.1 Enums nuevos (Postgres + Prisma)

| Enum | Valores |
|---|---|
| `tarifa_actor` | `tienda`, `mensajero`, `satelite` |
| `tarifa_concepto` | `tienda_flete_entregado`, `tienda_flete_reprogramado`, `tienda_flete_novedad`, `tienda_flete_rechazo`, `tienda_flete_incidente`, `tienda_fulfillment`, `tienda_comision_cod`, `mensajero_entregado`, `mensajero_reprogramado`, `mensajero_novedad`, `mensajero_rechazo`, `mensajero_incidente`, `satelite_entregado`, `satelite_reprogramado`, `satelite_novedad`, `satelite_rechazo`, `satelite_incidente` |
| `tarifa_modo` | `monto`, `porcentaje` |
| `tarifa_nivel` | `tienda_grupo`, `tienda_zona`, `tienda_general`, `grupo`, `zona`, `mensajero`, `grupo_vehiculo`, `zona_vehiculo` |
| `tarifa_modelo` | `viejo`, `nuevo` |

`*_rechazo` corresponde a `devolucion_a_origen_por_rechazo`. El catálogo TS
(`lib/tarifas/catalogo.ts`) declara por concepto: `actor`, `resultado` (`GestionResultado | null`;
`null` solo para fulfillment y comisión) y `base` del porcentaje (`"pedido"` para la tienda,
`"flete"` para mensajero y satélite, R27/R28). Una guardia compara el catálogo con el enum de la
base y con `GestionResultado` (R1, R2).

### 2.2 `grupo_distritos` (modelo `GrupoDistritos`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `organizacion_id` | uuid NOT NULL, FK `organizacion` | default `dbgenerated()` como el resto |
| `zona_id` | uuid NOT NULL, FK `zona` ON DELETE CASCADE | |
| `nombre` | varchar(60) NOT NULL | CHECK `nombre ~ '[^[:space:]]'` (patrón de `zona_sinpe_nombre_check`) |
| `created_at`, `updated_at` | timestamp | |

- UNIQUE `(organizacion_id, zona_id, nombre)` (R10).
- UNIQUE `(id, zona_id)`: destino de la FK compuesta de abajo. Es un único **anclado** (lleva el PK):
  se añade a `UNICOS_SIN_EMPRESA` (`tests/unit/guards/_unicos-sin-empresa.ts`).
- Índice `(organizacion_id)`, `(zona_id)`.

### 2.3 `grupo_distritos_distrito` (modelo `GrupoDistritosDistrito`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `organizacion_id` | uuid NOT NULL | |
| `grupo_id`, `zona_id` | uuid NOT NULL | FK `(grupo_id, zona_id)` → `grupo_distritos(id, zona_id)` ON DELETE CASCADE |
| `distrito_id` | uuid NOT NULL | FK `(zona_id, distrito_id)` → `zona_distrito(zona_id, distrito_id)` ON DELETE CASCADE |

- UNIQUE `(organizacion_id, zona_id, distrito_id)`: un distrito, a lo sumo un grupo por zona (R11;
  misma forma que SLT-75).
- La FK a `zona_distrito` hace imposible meter un distrito ajeno a la zona (R11) y lo saca del
  grupo cuando sale de la zona (R12). La geografía del país ya la garantiza `zona_distrito`
  (trigger `geografia_del_pais_de_la_empresa`): no hace falta otro.
- Índices `(grupo_id)`, `(organizacion_id)`.

### 2.4 `tarifa_valor` (modelo `TarifaValor`)

| Columna | Tipo | Nota |
|---|---|---|
| `id` | uuid PK | |
| `organizacion_id` | uuid NOT NULL | |
| `concepto` | `tarifa_concepto` NOT NULL | |
| `modo` | `tarifa_modo` NOT NULL | R3 |
| `valor` | numeric(12,2) NOT NULL | monto o porcentaje según `modo` |
| `iva_pct` | numeric(5,2) NULL | 0..100. NOT NULL en los cobros a la tienda y NULL en los pagos (R4, R45; decisión P4) |
| `zona_id` | uuid NULL, FK `zona` CASCADE | NULL solo en «tienda en todas sus zonas» y «valor propio del mensajero» |
| `grupo_id` | uuid NULL | FK `(grupo_id, zona_id)` → `grupo_distritos(id, zona_id)` CASCADE |
| `tienda_id` | uuid NULL, FK `usuario` CASCADE | |
| `mensajero_id` | uuid NULL, FK `usuario` CASCADE | lo escribe SLT-55 |
| `vehiculo_id` | uuid NULL, FK `vehiculos` RESTRICT | |
| `actualizado_por` | uuid NULL, FK `usuario` SET NULL | |
| `created_at`, `updated_at` | timestamp | |

CHECKs (R4, R7, R45):
- `tarifa_valor_no_negativo`: `valor >= 0`.
- `tarifa_valor_porcentaje_tope`: `modo <> 'porcentaje' OR valor <= 100`.
- `tarifa_valor_iva_solo_tienda`: `(concepto::text LIKE 'tienda\_%' AND iva_pct IS NOT NULL AND
  iva_pct BETWEEN 0 AND 100) OR (concepto::text NOT LIKE 'tienda\_%' AND iva_pct IS NULL)`.
  Un pago con IVA (también con `0`) no se puede guardar: se **impide**, no se ignora, para que
  nadie lea un IVA de pago que la app nunca aplicaría.
- `tarifa_valor_grupo_con_zona`: `grupo_id IS NULL OR zona_id IS NOT NULL` (con `MATCH SIMPLE`, una
  FK compuesta con `zona_id` NULL no se comprobaría).
- `tarifa_valor_niveles_tienda`: concepto `tienda_%` ⇒ `mensajero_id IS NULL AND vehiculo_id IS NULL
  AND (zona_id IS NOT NULL OR tienda_id IS NOT NULL)`.
- `tarifa_valor_niveles_mensajero`: concepto `mensajero_%` ⇒ `tienda_id IS NULL AND ((mensajero_id IS
  NOT NULL AND zona_id IS NULL AND grupo_id IS NULL AND vehiculo_id IS NULL) OR (mensajero_id IS NULL
  AND zona_id IS NOT NULL))`.
- `tarifa_valor_niveles_satelite`: concepto `satelite_%` ⇒ `tienda_id IS NULL AND mensajero_id IS NULL
  AND zona_id IS NOT NULL`.

Únicos e índices:
- `tarifa_valor_nivel_key` UNIQUE **NULLS NOT DISTINCT** `(organizacion_id, concepto, zona_id,
  grupo_id, tienda_id, mensajero_id, vehiculo_id)` (R8). Prisma no expresa NULLS NOT DISTINCT: se
  declara el `@@unique` con su `map` y se crea a mano en el SQL, como `tarifas_zona_id_tienda_id_key`.
- Índices `(organizacion_id, zona_id)`, `(organizacion_id, tienda_id)`,
  `(organizacion_id, mensajero_id)` para las tres ramas del WHERE (§4).

Borrado físico (R9), como `tarifas`: lo congelado copia los importes (§6), así que la auditoría no
depende de que la fila siga viva.

### 2.5 Snapshot ampliado

**`cierre_detail.tarifa_modelo`** `tarifa_modelo NOT NULL DEFAULT 'viejo'`. Todas las filas
existentes quedan en `viejo` y se leen como hoy (R42). Con `nuevo`, las 9 columnas `tarifa_*`
viejas y `tarifa_id` van NULL.

**`cierre_detail_concepto`** (modelo `CierreDetailConcepto`) — el cobro a la tienda congelado por
orden (R40):

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `organizacion_id` | uuid NOT NULL |
| `cierre_detail_id` | uuid NOT NULL, FK `cierre_detail` RESTRICT |
| `concepto` | `tarifa_concepto` NOT NULL, CHECK `concepto::text LIKE 'tienda\_%'` |
| `modo`, `valor`, `iva_pct` (NOT NULL), `nivel` | copia del valor resuelto |
| `tarifa_valor_id` | uuid NULL, FK `tarifa_valor` ON DELETE SET NULL (precedente 337: traza deseable, nunca un bloqueo para borrar) |
| `created_at` | timestamp |

UNIQUE `(cierre_detail_id, concepto)` (anclado, a la lista). Un concepto sin tarifa no tiene fila.
`REVOKE UPDATE, DELETE ON cierre_detail_concepto FROM servi_app` (R43; precedente SLT-56).

**`gestion_pago_congelado`** (modelo `GestionPagoCongelado`) — el pago de la gestión congelado
(R40, R34):

| Columna | Tipo |
|---|---|
| `id` | uuid PK |
| `organizacion_id` | uuid NOT NULL |
| `gestion_orden_id` | uuid NOT NULL, FK `gestion_orden` RESTRICT |
| `actor` | `tarifa_actor` NOT NULL, CHECK `actor <> 'tienda'` |
| `concepto`, `modo`, `valor`, `nivel`, `tarifa_valor_id` (SET NULL) | copia del valor resuelto |
| `base` | numeric(12,2) NULL (solo en porcentaje) |
| `importe` | numeric(12,2) NOT NULL |
| `created_at` | timestamp |

Sin ninguna columna de IVA (R34, decisión P4): el pago no lleva IVA y la tabla no puede
representarlo. CHECK `concepto::text NOT LIKE 'tienda\_%'`.

UNIQUE `(gestion_orden_id, actor)` (anclado). Solo lo escribe el modelo nuevo; el viejo sigue
escribiendo únicamente `gestion_orden.pago_mensajero` e `ingreso_bodega_rechazo` (R36).
`importe` es exactamente lo que se escribe en `pago_mensajero` / `ingreso_bodega_rechazo`. **No** se revoca UPDATE/DELETE: la corrección de un resultado (398) y la
re-solicitud de un rechazado (477) re-congelan el pago de UNA gestión dentro de su transacción,
igual que hoy reescriben `pago_mensajero`. El ajuste manual de SLT-56 no toca esta tabla.

`ingreso_bodega_rechazo` conserva su nombre aunque ahora lleve el pago a la satélite por cualquier
resultado: renombrarla obligaría a tocar todos sus lectores (consolidación, wallet, totales del
cierre) sin cambiar un centavo. El renombre va a SLT-57.

### 2.6 Multi-empresa (las cinco tablas nuevas)

- `organizacion_id NOT NULL` con FK, índice y política RLS `<tabla>_por_empresa` contra
  `current_setting('app.organizacion_id')`, con los GRANT a `servi_app` del precedente
  `20261029120000_gestion_pago_mensajero_ajuste`.
- Clasificadas como modelos de negocio en `lib/db/modelos-de-negocio.ts` (la guardia
  `organizacion-en-modelos` falla si no).
- Triggers de misma empresa para cada FK nueva entre tablas de negocio, generados con
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` en su propia migración.
- Ninguna tabla de plataforma nueva: `vehiculos` sigue siendo catálogo de solo lectura.

### 2.7 Qué depende del país

- **Impuestos:** el % de IVA es un valor por concepto de cobro a la tienda que pone la empresa
  (R3); los pagos no llevan IVA (R34, R45); la tasa por país
  sigue en SL-21 y aquí no se lee. Ningún literal de IVA en el código.
- **Moneda:** los importes no llevan moneda; se pintan con la de la empresa, como hoy.
- **Geografía:** los grupos cuelgan de `zona_distrito`, que ya impone el país de la empresa.

## 3. Migraciones (solo esquema; R44)

Timestamps orientativos: el implementer usa el real al crearlas y actualiza `## Archivos
esperados` si cambian. Ninguna edita una migración aplicada.

| Migración | UP | DOWN |
|---|---|---|
| `20261103120000_tarifas_flexibles_enums` | `CREATE TYPE` de los 5 enums | `DROP TYPE` |
| `20261103120100_tarifas_flexibles_tablas` | 5 tablas, CHECKs, únicos (NULLS NOT DISTINCT a mano), índices, FKs, RLS + políticas, GRANT/REVOKE, `ALTER TABLE cierre_detail ADD COLUMN tarifa_modelo … DEFAULT 'viejo'` | `ALTER TABLE cierre_detail DROP COLUMN tarifa_modelo`, `DROP TABLE` en orden inverso |
| `20261103120200_tarifas_flexibles_misma_empresa` | triggers generados | `DROP TRIGGER` |
| `20261103120300_historial_tarifas_flexibles` | `ALTER TYPE historial_accion_tipo ADD VALUE` ×5 y `historial_accion_entidad ADD VALUE` ×2, sola (55P04) | recrea los enums sin esos valores (plantilla: `20261026120100_historial_accion_modulos/down.sql`) |

Ninguna toca `tarifas`, `tarifa_zona_mensajero`, `distrito_zona_especial` ni una fila de
`cierre_detail` más allá del `DEFAULT` de la columna nueva.

Tipos de historial: `tarifa_valor_fijado` y `tarifa_valor_quitado` (`mueve_dinero`),
`grupo_distritos_creado` y `grupo_distritos_cambiado` (`mueve_dinero`: mover un distrito cambia
lo que se cobra), `grupo_distritos_borrado` (`hace_desaparecer`, como `tarifa_borrada`).
Entidades: `tarifa_valor`, `grupo_distritos`. Con su etiqueta en `lib/types/historial-accion.ts`.

## 4. Precedencia (puro, `lib/tarifas/precedencia.ts`)

Mismo patrón que `cascada-tarifa.ts`: un WHERE plano que trae las candidatas de N contextos en una
consulta, y una elección en memoria por rango.

```ts
interface ContextoCobro { tiendaId: string; zonaId: string; grupoId: string | null }
interface ContextoPago  { mensajeroId: string; zonaId: string; grupoId: string | null; vehiculoId: string | null }

rangoCobro(fila, ctx): 1..5 | null   // 1 tienda_grupo · 2 tienda_zona · 3 tienda_general · 4 grupo · 5 zona
rangoPago(fila, ctx, actor): 1..5 | null
  // mensajero: 1 mensajero · 2 grupo_vehiculo · 3 grupo · 4 zona_vehiculo · 5 zona
  // satelite:  sin el 1 (CHECK ya lo impide)
elegir(filas, contextos, conceptos): Map<clave, Map<concepto, ValorResuelto | null>>
whereValores({ zonas, tiendas, mensajeros, conceptos }): { concepto: { in }, OR: [ {zonaId: {in}}, {tiendaId: {in}, zonaId: null}, {mensajeroId: {in}} ] }
```

- La elección es **por concepto** (R16): una tienda puede pactar solo el flete por entregado y el
  resto cae a la zona.
- `grupoId === null` hace que los rangos de grupo devuelvan `null` (R18, R21); `vehiculoId === null`
  hace lo mismo con los de vehículo (R22). Una fila de OTRO grupo, otra zona, otra tienda u otro
  vehículo devuelve `null`: es lo que la contraprueba en Postgres mata (§9).
- Sin `orderBy` ni desempate por fecha: el único NULLS NOT DISTINCT garantiza una fila por rango.
- El orden 2-5 del pago (gana el grupo sobre el vehículo) es la decisión P2.

## 5. El resolver único (`lib/repositories/_shared/resolver-tarifas.ts`)

Funciones sobre un cliente con los delegados `tarifaValor`, `grupoDistritosDistrito`, `tarifa` y
`tarifaZonaMensajero` (o el de la transacción), igual que `resolvePagoTarifaCon` (398):

```ts
usaModeloNuevo(db): Promise<boolean>                     // EXISTS en tarifa_valor de la empresa del contexto
resolverCobrosCon(db, pares: ParTarifa[]): Promise<Map<clavePar, TarifaTienda | null>>
resolverPagosCon(db, ctxs: ContextoPagoGestion[]): Promise<Map<gestionId, TarifaPago | null>>
```

- **Decide el modelo una vez por llamada** (R36/R37): `usaModeloNuevo` → si `false`, delega en el
  código de hoy (`whereCascada`/`elegirPorCascada` y `resolvePagoTarifaCon`) y envuelve el
  resultado en `{ modelo: "viejo", … }`. Si `true`, no consulta `tarifas` ni
  `tarifa_zona_mensajero`. El filtro por empresa lo pone la extensión del cliente, y la RLS lo
  respalda (R15).
- **Número fijo de consultas por lote** (R39): modelo (1) + grupos de los pares `(zona, distrito)`
  pedidos (1) + valores con `whereValores` (1). En el pago, el cobro de la tienda para la base del %
  se resuelve en la misma llamada con las mismas consultas (el WHERE junta zonas de orden y de
  mensajero).
- `ParTarifa` (`cascada-tarifa.ts`) gana `distritoId: string | null` **obligatorio**, y `clavePar`
  lo incluye: un llamador que olvide el distrito no compila, en vez de saltarse los grupos en
  silencio.
- `ContextoPagoGestion = { gestionId, resultado, mensajeroId, zonaId /* la que hoy usa cada camino:
  zona del mensajero al solicitar y en el corte, zona destino en la re-solicitud 477 */, vehiculoId,
  distritoId, tiendaId, zonaOrdenId, montoCobrar, cobraComision }`.

Tipos de salida (en `lib/types/tarifa-flexible.ts`):

```ts
interface ValorPago  { concepto; modo: "monto" | "porcentaje"; valor: string; nivel; tarifaValorId: string }   // sin IVA (P4)
interface ValorCobro extends ValorPago { ivaPct: string }                                                      // solo la tienda
type ValoresTienda = Partial<Record<ConceptoTienda, ValorCobro>>      // ausente = sin tarifa (R23)
type TarifaTienda =
  | { modelo: "viejo"; tarifa: TarifaVigenteResuelta }                  // lo de hoy, intacto
  | { modelo: "nuevo"; valores: ValoresTienda }
type TarifaPago =
  | { modelo: "viejo"; tarifa: PagoTarifa }
  | { modelo: "nuevo"; mensajero: ValorPago | null; satelite: ValorPago | null; baseFlete: string }
```

Los dos tipos separados hacen que un IVA de pago no se pueda ni escribir en el código: el
compilador lo impide igual que la base (R45).

`baseFlete` (R28, decisión P1) = flete sin IVA que `derivarIngresoOrden` le cobra a la tienda por
ESA gestión según su resultado; lo calcula `fleteSinIvaDeGestion` (pura, en `ingreso-empresa.ts`),
así que la base del pago y el cobro a la tienda no pueden divergir. Si ese resultado no tiene flete
para la tienda, `baseFlete = "0.00"` y el % da 0. Se resuelve al congelar el cierre de la gestión y
queda en `gestion_pago_congelado.base`.

**Fachadas** (mismo constructor; las 11 raíces de composición no cambian):
- `TarifaVigenteRepository.resolveTarifas(pares, tx?)` → `Map<clave, TarifaTienda | null>`;
  `resolveTarifa(tiendaId, zonaId, distritoId)` igual con un par. El tipo `Pick<PrismaClient, …>`
  del constructor se amplía a los delegados nuevos.
- `TarifaZonaMensajeroRepository.resolvePagos(ctxs, tx?)` (nuevo) → `Map<gestionId, TarifaPago | null>`.
  `resolvePagoTarifa` deja de tener llamadores fuera del resolver.
- `CierresAdminRepository.corregirResultadoGestionEnCierre` llama a `resolverPagosCon(tx, …)`, como
  hoy llama a `resolvePagoTarifaCon`.

«Sin tarifa» por superficie (R23-R25): `null` solo existe en el viejo (ninguna fila de la cascada).
En el nuevo, cada concepto ausente es «sin tarifa». El 409 de la API se decide con
`fleteEntregadoSinTarifa(t: TarifaTienda | null)` (pura): viejo → `t === null`; nuevo →
`valores.tienda_flete_entregado` ausente.

## 6. Cálculo: mismas funciones públicas

`lib/tarifas/calculo.ts`: `importeDe(valor: ValorPago, base: Decimal) → Decimal` e
`ivaDe(valor: ValorCobro, importe: Decimal) → Decimal`, con `round2` HALF_UP (R26). `ivaDe` solo
acepta un `ValorCobro`: los pagos no tienen IVA que calcular (R34). Es la única aritmética del
modelo nuevo.

| Función pública | Cambio de firma | Rama `viejo` | Rama `nuevo` |
|---|---|---|---|
| `derivarIngresoOrden(input, tarifa: TarifaTienda \| null)` | 2.º parámetro | el cuerpo de hoy, sin tocar | flete del concepto `tienda_flete_<resultado>` con base = pedido; entregado → `ingreso_flete` / `ingreso_iva_flete`; cualquier otro resultado → `ingreso_flete_devolucion` / `ingreso_iva_flete_devolucion` (R29); comisión solo en entregado y `cobraComision` (R30) |
| `resolverFlete` | solo viejo | sin cambio | — (en el nuevo no hay GAM ni especial: R35) |
| `costosListadoOrden`, `costoEnvioDeTarifa`, `desgloseCargaApi`, `montoFulfillmentDeTarifa`, `tieneFulfillment`, `agregarIngresosPorConcepto` | tarifa → `TarifaTienda \| null` | sin cambio | fulfillment = importe de `tienda_fulfillment` (R31); `fleteOrigen` = `"normal"` (el «especial sin pacto» no existe en el nuevo) |
| `pagoPorResultado(resultado, tarifa: TarifaPago \| null)` | 2.º parámetro | sin cambio | importe de `mensajero` si su concepto es `mensajero_<resultado>`; si no, `"0.00"` |
| `ingresoBodegaPorResultado(resultado, tarifa: TarifaPago \| null)` | 2.º parámetro | sin cambio | importe de `satelite` (cualquier resultado, R32) |
| `derivarPagos`, `derivarIngresoBodega` (`cierre-totales.ts`) | reciben `Map<gestionId, TarifaPago \| null>` | | |

Por qué el flete no entregado va a la categoría de «devolución»: las identidades de 393/395/396
(`pagoTiendaEmpresa`, `ganaLaTienda`, `partesPorTienda`) descuentan de lo recaudado solo el flete de
las entregas. Un flete por reprogramado no sale de lo recaudado, igual que el de un rechazo. Así no
se añade ninguna categoría de wallet y las cuatro identidades siguen siendo ciertas.

`esCentral` y `esZonaEspecial` siguen en `OrdenIngresoInput` y en `cierre_detail` (los usa la rama
vieja); la nueva no los lee (R35).

## 7. Congelado y su lectura

**Escritura** (en la transacción de `CierreDiaRepository.crearCierre`, R40):
1. `resolveTarifas(pares con distritoId, tx)` como hoy.
2. `cierre_detail.createMany` con `tarifa_modelo` y, en viejo, las columnas de hoy
   (`tarifaColumnas`); en nuevo, columnas viejas NULL.
3. En nuevo: `cierre_detail_concepto.createMany` con un registro por concepto resuelto (necesita
   los ids de detalle: `createManyAndReturn` o relectura por `cierreId`).
4. Pago: `CierreDiaService` y `CorteDiarioService` resuelven con `resolvePagos` por gestión antes de
   la transacción (como hoy resuelven la tarifa única) y pasan el mapa; el repositorio escribe
   `pago_mensajero` / `ingreso_bodega_rechazo` agrupados (igual que hoy) y, en nuevo,
   `gestion_pago_congelado.createMany`.

Mismo patrón en `resolicitarCierreRechazado` (477) y `corregirResultadoGestionEnCierre` (398), que
re-congelan solo sus gestiones (borran y escriben su fila de `gestion_pago_congelado`).

**Lectura** (R41, R42): `tarifaDe(d, conceptos)` en `cierre-detalle.ts` sigue siendo la única
reconstrucción. Recibe además las filas de `cierre_detail_concepto` del detalle y devuelve
`TarifaTienda | null`: `viejo` → lo de hoy envuelto; `nuevo` → `valores` desde las filas. Sus
cinco llamadores (`CierresAdminRepository`, `CierreAporteRepository`, `WalletFeedService`,
`WalletTiendaFeedService`, `DineroProductosRepository`) añaden la relación al `select` (o, en el
SQL a mano de `DineroProductosRepository`, un `json_agg` de las filas hijas con su filtro por
empresa). Ninguno recalcula con valores vivos.

## 8. Services de escritura (los usará SLT-54)

Capas: service → repositorio → Prisma, con interfaces en `lib/interfaces/`. Sin actions ni rutas:
las crea SLT-54. Tarifas es núcleo: no hay puerta de módulo.

**`TarifaValorService`** (`ITarifaValorRepository`, `IHistorialAccionRepository`):
- `fijarValor(input, actor)` → `ok { id } | validation_error | forbidden | not_found`. `input` =
  `{ concepto, modo, valor, ivaPct, zonaId, grupoId, tiendaId, vehiculoId }` como texto decimal,
  validado con zod (`lib/types/tarifa-flexible.ts`; unión discriminada por actor: `ivaPct`
  obligatorio en los conceptos `tienda_*` y prohibido —ni siquiera `0`— en los de pago, R4/R45).
  Comprueba: rangos (R4), nivel compatible con
  el actor del concepto (R7), que el grupo sea de esa zona, que la tienda tenga rol `adminTienda` o
  `apiKey` (regla de `TarifaService`), que zona, grupo, tienda y vehículo existan en la empresa.
  `mensajeroId` no se acepta aquí (SLT-55). Upsert por la clave natural (R8) y fila de historial
  con antes/después (R14), en una transacción.
- `quitarValor(id, actor)` → borra (R9) + historial.
- `listarValores({ zonaId? }, actor)` → lectura para `maestro` y `admin` (R13).

**`GrupoDistritosService`** (`IGrupoDistritosRepository`, historial):
- `crearGrupo({ zonaId, nombre, distritoIds })`, `renombrarGrupo(id, nombre)`,
  `fijarDistritos(id, distritoIds)` (reemplaza el conjunto), `borrarGrupo(id)`, `listarGrupos(zonaId)`.
- Un distrito ya en otro grupo de la zona, o fuera de la zona, → `validation_error` en `distritoIds`
  nombrando el distrito (R11). La base respalda con el único y la FK; un `P2002`/`P2003` que llegue
  se traduce al mismo error.
- Borrar un grupo borra sus valores por cascada (R12): el service lo dice en el historial con
  cuántos valores se fueron.

**Autorización** (R13): `maestro` escribe; `maestro` y `admin` leen; el resto `forbidden`. Se valida
en el service con el `Actor` que la action le pasará; la empresa sale del contexto, nunca del input.

**Fábrica** `lib/tarifas/servicios.ts`: `serviciosDeTarifas(prisma)` construye los dos services con
sus repositorios reales y el historial. SLT-54 la llamará desde sus actions; un test comprueba que
cada dependencia que pasa es la instancia real y no `undefined` (§9).

## 9. Verificación

- **Puro (unit):** catálogo vs enum y vs `GestionResultado` (R1, R2); tabla de casos de
  `rangoCobro`/`rangoPago` con todas las combinaciones (R16-R22); `importeDe`/`ivaDe` con los casos
  de redondeo medidos en la 204 (R26); las funciones públicas en rama nueva (R27-R32, R34, R35),
  incluido que un pago congelado es exactamente su importe, sin IVA.
- **Respaldo idéntico (R36):** antes de tocar nada (T0) se fija una tabla de casos con **importes
  literales** de las funciones públicas en el modelo viejo. Tras el cambio, los mismos casos
  envueltos en `{ modelo: "viejo" }` dan el mismo texto. Los literales son el contrato: no se
  comparan contra la función que los produce.
- **Postgres real (`tests/integration/db/`):** el WHERE y la precedencia del resolver con dos
  empresas, dos zonas, dos grupos, dos tiendas y dos vehículos, con valores distintos en cada nivel
  y señuelos en otra zona, otro grupo y otra empresa. Cada caso afirma primero que sembró
  (`expect(filas).toBeGreaterThan(0)`) y nunca hace `return` temprano. **Contraprueba:** el
  implementer aplica a mano tres mutaciones (invertir dos rangos en `precedencia.ts`; quitar
  `zonaId` del WHERE; quitar el filtro de grupo por zona), corre el archivo, pega la salida en rojo
  en `progress/impl_SLT-52.md` y revierte.
- **Convergencia (R38):** `tests/unit/repositories/convergencia-tarifa-listado-cierre.test.ts` gana
  el escenario del modelo nuevo: el mismo doble que devuelve `tarifa_valor` entero a los caminos de
  listado, cierre y costo de la API, que deben elegir el mismo `tarifaValorId` por concepto y el
  mismo importe.
- **Composición:** la fábrica pasa repositorios reales; y una guardia lista los `new
  CierreDiaRepository(` / `new CierreDiaService(` / `new CorteDiarioService(` de `app/` y `lib/` y
  falla si alguno deja sin pasar el repositorio de tarifas.
- **E2E:** sin E2E nuevo (no hay pantalla). Corren `e2e/cierre-*`, `e2e/cierres-admin*`,
  `e2e/cierre-bodega-satelite*`, `e2e/wallet-*`, `e2e/mi-wallet*` y `e2e/dos-empresas-humo.spec.ts`
  con empresas en el modelo viejo (R36).

## 10. Alternativas descartadas

1. **Una tabla por actor** (`tarifa_tienda_valor`, `tarifa_mensajero_valor`,
   `tarifa_satelite_valor`). Se lee más simple, pero son tres WHERE, tres elecciones por nivel y
   tres snapshots que pueden divergir, justo lo que la 274 vino a matar. Con una tabla y CHECKs por
   actor la base sigue impidiendo combinaciones inválidas y la regla vive una vez.
2. **Ampliar `tarifas` y `tarifa_zona_mensajero` con columnas por concepto** (17 conceptos × modo,
   valor e IVA). Mete 51 columnas en dos tablas que SLT-57 tiene que podar, no admite el nivel de
   grupo sin otra dimensión y obliga a migrar datos en esta ficha, que es solo esquema.
3. **Valores en JSON por zona.** Sin FK a tienda, grupo ni vehículo, sin único por nivel y sin un
   WHERE indexable: la precedencia acabaría en código que lee todo el JSON de la empresa.
4. **Snapshot en columnas de `cierre_detail`** (7 conceptos × modo, valor, IVA y nivel = 28
   columnas). Una tabla hija con único `(detalle, concepto)` dice lo mismo, no crece si el catálogo
   crece y deja «sin tarifa» como ausencia de fila, sin un NULL ambiguo.
5. **Respaldo por concepto** (usar el viejo solo para los conceptos que el nuevo no tiene). Mezcla
   dos modelos en la misma orden, y el viejo tiene GAM y zona especial que el nuevo no: la misma
   orden podría cobrar con una regla y pagar con otra. La decisión dice «si la empresa no tiene
   valores»: el interruptor es por empresa.
6. **Interfaces nuevas inyectadas en lugar de fachadas.** Obligaría a tocar las 11 raíces de
   composición, y una sola que no pase el resolver nuevo dejaría una superficie calculando con el
   viejo con la suite en verde. Con fachadas sobre el mismo constructor eso no puede ocurrir.

## 11. Riesgos y consecuencias que el humano debe conocer

- **El primer valor nuevo apaga el modelo viejo de la empresa entera** (R37). Si el maestro guarda
  un solo valor en la pantalla de SLT-54 antes de que SLT-53 migre su empresa, todo lo que no haya
  puesto queda «sin tarifa» (0 en el cierre, 409 en la API). SLT-53 debe ir antes de abrir la
  pantalla, o SLT-54 debe avisarlo.
- **Pago por gestión con distrito:** hoy el pago del cierre se resuelve una vez por cierre; ahora
  una vez por gestión (con un número fijo de consultas). El total del cierre puede cambiar de una
  gestión a otra dentro del mismo cierre en el modelo nuevo; es lo que piden los grupos.
- **Etiqueta «flete devolución»:** en el modelo nuevo esa columna del detalle del cierre suma
  también el flete de reprogramado, novedad e incidente. El texto de pantalla lo ajusta SLT-54.
- **Resolución del pago fuera de la transacción:** como hoy, el pago se resuelve en el service antes
  de abrir la transacción del cierre y el cobro dentro. Un cambio de tarifa en ese intervalo de
  milisegundos podría congelar un cobro y un pago de instantes distintos; es el mismo margen que ya
  existe.
- **Sin dependencias nuevas.** Todo con Prisma, zod y `Prisma.Decimal`, que ya están.
