# SLT-56 — ajuste-pago-mensajero-cierre · design.md

> Requisitos: `requirements.md` (R1–R21, Q1–Q2 abiertas). Patrón de referencia: la corrección de
> resultado de la ficha 398 (`CierresAdminService.corregirResultadoGestion` →
> `CierresAdminRepository.corregirResultadoGestionEnCierre`) y el rastro propio de la ficha 371
> (`gestion_fecha_reprogramacion_cambio`).

## Lo que ya existe

Buscado en el board (`feature_list.json`: «ajuste», «pago mensajero», «cierre»), en `specs/`
(`ajust* pago`, `ajustad*`) y en el código (el grafo del worktree no estaba indexado: `list_projects`
no lo lista; se buscó con Grep/Read sobre el worktree).

- **Board:** nada que lo duplique. SLT-55 (valor propio del mensajero) y SLT-52 (tarifas) ya están
  fuera del alcance.
- **Specs:** nada. Lo más cercano: 398 (corrección de resultado, pone el pago en 0 al pasar a
  rechazo) y la corrección del desglose de pagos (pedido humano 2026-08-19). Ninguna cambia el pago
  a un valor libre.
- **Código que se reutiliza (no se re-crea):**
  - `CierresAdminService.resolveAlcance` (`lib/services/CierresAdminService.ts:465`): maestro/admin →
    destino `bodega_central`; `adminSatelite` → `bodega_satelite` de su zona; sin zona → `sinZona`;
    otro rol → `forbidden`. Da exactamente R1–R4.
  - `CierresAdminRepository.findGestionEditableEnCierre` (alcance en el WHERE) y `alcanceWhere`.
  - `ESTADOS_ABIERTOS` / `ESTADOS_CIERRE_ABIERTO` (`solicitado`, `vencido`), el mismo par que exigen
    398 y la corrección de pagos.
  - `sumarSnapshotsCongelados` (`lib/utils/cierre-totales.ts:71`): suma pagos congelados sin
    re-derivar con la tarifa (R10/R12).
  - `appendAccion` + `resolverActorCongelado` (`lib/repositories/registrar-accion.ts`) y
    `etiquetaDeEntidad("gestion_orden", …)` para el historial de acciones (R18).
  - `WalletMensajeroFeedService.construirMovimientosDePago`: al aprobar lee
    `cierre_dia.total_pago_mensajero` y emite `pago_devengado`, `pago_efectivo = min(P,E)` y el
    egreso de caja. **No hay que tocarlo**: si el ajuste deja bien ese total, R13 sale solo.
  - `CierreBodegaService` (consolidación) suma `cierre_dia.total_pago_mensajero` de cierres
    `aprobado` (`sumPagoMensajero`). R14 sale solo por la misma razón.
  - Re-solicitud de un `rechazado` (ficha 477, `recalcularTotalesDelCierre` en
    `CierreDiaRepository.ts:144`): suma los snapshots congelados y no re-deriva, así que R15 sale
    solo; se fija con un test.
  - `GESTION_ADMIN_SELECT` + su mapper (`CierresAdminRepository.ts:263`/`~440`): los reusan los dos
    detalles de admin (cierre del día y cierre de bodega). Lo que se añada ahí llega a los dos (R19/R20).
  - `CorregirResultadoDialog.tsx` / `CorregirPagosDialog.tsx`: patrón del diálogo (Modal, cinco
    desenlaces). `renderPagoMensajero` (`cierre-detalle-shared.tsx:836`) pinta el pago por gestión.

## 1. Modelo de datos

### 1.1 Tabla nueva `gestion_pago_mensajero_ajuste` (modelo `GestionPagoMensajeroAjuste`)

Rastro append-only de cada ajuste. Patrón de la ficha 371 (`gestion_fecha_reprogramacion_cambio`).

| Columna | Tipo | Notas |
|---|---|---|
| `id` | text uuid PK | |
| `organizacion_id` | text NOT NULL, default `NULLIF(current_setting('app.organizacion_id', true), '')` | FK `organizacion` RESTRICT, índice |
| `gestion_id` | text NOT NULL | FK `gestion_orden` RESTRICT |
| `cierre_id` | text NOT NULL | FK `cierre_dia` RESTRICT. El cierre **en el que** se ajustó; se guarda porque una gestión puede salir de un cierre rechazado (477) |
| `pago_anterior` | Decimal(12,2) NOT NULL | |
| `pago_nuevo` | Decimal(12,2) NOT NULL | |
| `actor_usuario_id` | text NOT NULL | FK `usuario` RESTRICT. Siempre hay persona |
| `actor_rol` | `rol_value` (enum `RolValue`) NOT NULL | Congelado (precedente `historial_accion.actor_rol`): un admin que mañana cambia de rol no re-etiqueta el pasado |
| `motivo` | text NOT NULL | Obligatorio (R7) |
| `created_at` | timestamptz default now() | «Cuándo» |

- **CHECK** `gestion_pago_mensajero_ajuste_pago_nuevo_no_negativo` (`pago_nuevo >= 0`),
  `..._pago_distinto` (`pago_nuevo <> pago_anterior`) y `..._motivo_no_vacio`
  (`length(btrim(motivo)) > 0`). Viven solo en la migración (Prisma no expresa CHECK); se anota en
  el `schema.prisma` como en la 371.
- **Índices:** `(gestion_id, created_at)` (lectura del detalle), `(cierre_id)`, `(organizacion_id)`.
- **Sin únicos** (varios ajustes por gestión son válidos). Por eso no toca la guardia
  `unicos-por-empresa`.
- **Multi-empresa:** RLS habilitada con política `gestion_pago_mensajero_ajuste_por_empresa`
  `FOR ALL TO servi_app USING/WITH CHECK (organizacion_id = NULLIF(current_setting('app.organizacion_id', true), ''))`.
  Triggers de misma empresa para sus FK de negocio, generados con
  `pnpm exec tsx scripts/generar-misma-empresa.ts --faltantes` dentro de la misma migración
  (`fk-misma-empresa.guardia`). Se clasifica como modelo de negocio en `lib/db/modelos-de-negocio.ts`
  (`organizacion-en-modelos.guardia`).
- **Inmutable (R17):** `REVOKE UPDATE, DELETE ON gestion_pago_mensajero_ajuste FROM servi_app`
  (la tabla nace con CRUD por el `ALTER DEFAULT PRIVILEGES` de `20261022130000`; precedente
  `20261026120000_organizacion_modulo`). Sin `updated_at` ni `deleted_at`.
- **Relaciones Prisma:** `GestionOrden.ajustesPagoMensajero`, `CierreDia.ajustesPagoMensajero`,
  `Usuario` (relación con nombre propio), `Organizacion`.

**Marca «Ajustado» (R19/R20):** se deriva de que existan filas para la gestión. No hay columna
booleana en `gestion_orden`: una sola verdad.

### 1.2 Historial de acciones: tipo nuevo `cierre_dia_pago_mensajero_ajustado`

- `ALTER TYPE "historial_accion_tipo" ADD VALUE IF NOT EXISTS 'cierre_dia_pago_mensajero_ajustado'`,
  en **su propia migración** (55P04; precedente `20260908120000_historial_accion_zona_pago_mensajero`).
- Categoría **«mueve dinero»** en `HISTORIAL_ACCION_TIPOS` (`lib/types/historial-accion.ts`), con
  etiqueta propia. Entidad `gestion_orden` (ya existe en `historial_accion_entidad`).
- `monto` = `pago_nuevo`. `valor_anterior`/`valor_nuevo` = NULL y **sin motivo**: esa tabla solo
  admite vocabulario cerrado y prohíbe texto libre (362/R5). El antes/después y el motivo viven en
  la tabla de 1.1.
- Tipo propio y no `cierre_dia_pagos_editados`: aquel es el reparto por métodos de cobro y su
  productor censado es otro método (la guardia del censo mide por método).

### 1.3 Migraciones (nuevas; ninguna existente se edita)

| Carpeta | Qué hace | `down.sql` |
|---|---|---|
| `db/migrations/20261029120000_gestion_pago_mensajero_ajuste/` | Tabla, CHECK, índices, FK, RLS + política, REVOKE, triggers misma-empresa | `DROP TRIGGER …`, `DROP TABLE` |
| `db/migrations/20261029120100_historial_accion_pago_mensajero_ajustado/` | Solo el `ADD VALUE` | Borra las filas de ese tipo y recrea el enum sin el valor (plantilla: el `down.sql` de `20261026120100_historial_accion_modulos`) |

Si al implementar ya existe en `dev` una migración posterior a esos timestamps, se usan unos
posteriores. Sin backfill: no hay ajustes anteriores.

### 1.4 Lo que NO cambia

`gestion_orden` (ninguna columna nueva), `cierre_dia`, `cierre_bodega`, `pago_mensajero_movimiento`,
`tarifa_zona_mensajero`. El ajuste escribe `gestion_orden.pago_mensajero` y
`cierre_dia.total_pago_mensajero`, que ya existen.

## 2. Autorización y módulo

- **Dónde:** en `CierresAdminService.ajustarPagoMensajeroGestion`, vía `resolveAlcance`, y otra vez
  en el WHERE del repositorio (alcance + estado). La página ya filtra roles
  (`app/(app)/cierres-admin/page.tsx:43`) pero no es la guardia.
- **A diferencia de 398 y de la corrección de pagos, no hay guardia `esAccesoTotal`:** el
  `adminSatelite` sí ajusta (decisión cerrada). Su límite es el alcance (su zona satélite).
  Maestro/admin quedan en `bodega_central` porque es su alcance de siempre en `cierres-admin`; los
  cierres con destino satélite los revisa la satélite.
- **Módulo:** `cierres-admin` es núcleo (`lib/modulos/reparto.ts:31,144`): no hay puerta de módulo.
  La action nueva se registra en el reparto como núcleo si la guardia `modulos-reparto` lo pide por
  action.

## 3. Datos por país

Solo importes en la moneda de la empresa, que ya resuelve la pantalla con su helper `money()`. No
hay IVA, geografía ni métodos de pago nuevos. Nada que salga de `pais`.

## 4. Contratos

### 4.1 Borde (zod, `lib/types/cierres-admin.ts`)

```ts
ajustarPagoMensajeroGestionSchema = z.object({
  gestionId: z.string().uuid(),
  pagoAnterior: montoNoNegativoSchema, // el que la pantalla mostraba (R9)
  pagoNuevo: montoNoNegativoSchema,    // R8
  motivo: motivoSchema,                // lib/types/gestion-orden.ts, el mismo de 398 (R7)
}).strict();
```

`montoNoNegativoSchema`: string, regex `^\d{1,10}(\.\d{1,2})?$` (cabe en Decimal(12,2)). Antes de
crearlo se busca uno equivalente en `lib/types/` (hay `montoCobroSchema` en
`cobro-plataforma.ts` con la misma forma); si sirve, se reutiliza en vez de duplicarlo.

### 4.2 Server Action (`lib/actions/cierres-admin.ts`)

`ajustarPagoMensajeroGestion(input: unknown, deps?)`, igual que `corregirResultadoGestion`: actor
antes de parsear (`unauthenticated`), `schema.parse` (`validation_error`), service, y
`toCierresAdminActionError`.

Resultado:

```ts
| { status: "ok"; gestionId: string; pagoMensajero: string; totalPagoMensajero: string;
    ajuste: AjustePagoGestionDTO }
| { status: "validation_error"; fieldErrors: { pagoNuevo?: string[]; motivo?: string[] } }
| { status: "forbidden" } | { status: "no_encontrada" } | { status: "conflict" }
| { status: "unauthenticated" }
```

`AjustePagoGestionDTO = { creadoAt: string (ISO); actorNombre: string; actorRol: RolValue;
pagoAnterior: string; pagoNuevo: string; motivo: string }`. Importes siempre STRING escala 2.

### 4.3 Service (`CierresAdminService.ajustarPagoMensajeroGestion(input, actor)`)

Guardias, en orden y todas antes de escribir:

1. `resolveAlcance`: `forbidden` → `forbidden` (R4); `sinZona` → `no_encontrada` (R3).
2. `findGestionEditableEnCierre(gestionId, alcance)` (se amplía para devolver `pagoMensajero` como
   STRING): `null` → `no_encontrada` (R3).
3. Cierre no abierto → `conflict` (R5).
4. `motivo.trim()` vacío → `validation_error.motivo` (R7).
5. `validarAjustePago(pagoVigente, pagoAnterior, pagoNuevo)` del módulo puro
   `lib/utils/ajuste-pago-mensajero.ts` (Decimal, R16):
   - `pagoNuevo` igual al vigente → `validation_error.pagoNuevo` (R8);
   - `pagoAnterior` distinto del vigente (o vigente NULL) → `conflict` (R9).
6. `repo.ajustarPagoMensajeroEnCierre(...)`: `updated` → `ok`; `conflict` → `conflict`;
   `fuera_de_alcance` → `no_encontrada`.

No hay restricción por resultado (R6).

### 4.4 Repository (`CierresAdminRepository.ajustarPagoMensajeroEnCierre`)

Método nuevo (no rama de otro: la guardia del censo del historial mide por método). Una
`$transaction`:

0. **Lectura previa** con solo el alcance (`cierreId`, guía y remisión de la orden). No decide.
1. **Sello** (la guardia que decide, anti-TOCTOU): `gestionOrden.updateMany` con
   `id`, `anuladaAt: null`, `pagoMensajero: Decimal(pagoAnterior)` y
   `cierre: { is: { estado: { in: ESTADOS_ABIERTOS }, ...alcanceWhere(alcance) } }`;
   `data: { pagoMensajero: Decimal(pagoNuevo) }`. `count !== 1` → `conflict` si la gestión existe,
   `fuera_de_alcance` si no (R3/R5/R9).
2. **Rastro**: `gestionPagoMensajeroAjuste.create` con actor y rol congelados
   (`resolverActorCongelado`) (R17).
3. **Total**: `total_pago_mensajero = sumarSnapshotsCongelados(pagoMensajero de las gestiones con
   ese cierreId y anuladaAt null)`, con `cierreDia.updateMany` guardado por estado abierto + alcance;
   `count !== 1` → `throw` (revierte todo). Solo esa columna: recaudo e ingreso de bodega no cambian
   (R10/R12).
4. **Historial de acciones**: `appendAccion` con el tipo nuevo, `entidadTipo: "gestion_orden"`,
   etiqueta por guía, `monto = pagoNuevo` (R18).

Devuelve `{ status: "updated", pagoMensajero, totalPagoMensajero, ajuste }`.

### 4.5 Lectura (R19/R20)

- `GESTION_ADMIN_SELECT` suma `ajustesPagoMensajero: { select: { createdAt, pagoAnterior,
  pagoNuevo, motivo, actorRol, actor: { select: NOMBRE_USUARIO_SELECT } }, orderBy: { createdAt: "asc" } }`.
  Prisma lo resuelve con una consulta por nivel, no por gestión.
- El mapper de admin añade `ajustesPago: AjustePagoGestionDTO[]` al DTO de la gestión. Como
  `CierreDetalleGestion` (`lib/interfaces/services/ICierreDiaService.ts:22`) lo comparte la vista del
  mensajero, el campo es **opcional** y solo lo rellena el mapper de admin (Q2: el mensajero no ve
  marca ni motivo).
- Cierre de bodega: `DETALLE_CIERRE_SELECT` (`CierresBodegaAdminRepository.ts:75`) suma
  `_count: { select: { ajustesPagoMensajero: true } }` → `gestionesAjustadas: number` por cierre del
  día (R20, marca a nivel de cierre). Las gestiones ya llegan por `GESTION_ADMIN_SELECT`.

## 5. Pantalla

- **Diálogo nuevo** `app/(app)/cierres-admin/_components/AjustarPagoMensajeroDialog.tsx`, hermano de
  `CorregirResultadoDialog` (mismo `Modal`, mismos desenlaces y mensajes por estado). Muestra el
  pago vigente, campo del valor nuevo y motivo (textarea, obligatorio). Envía `pagoAnterior` = el
  vigente que pintó.
- **Montaje** en `CierresAdminModule.tsx`: prop nueva `puedeAjustarPagoMensajero` (no se reusa
  `puedeCorregirPagos`, que es solo maestro/admin). La calcula `page.tsx` como
  `esAccesoTotal(rol) || rol === "adminSatelite"`. Se ofrece con
  `estado ∈ {solicitado, vencido}` (R21). Al volver `ok`, actualiza la fila de la gestión y el total
  de pago del cierre en el estado local, con lo que «para la central» se recalcula (R11).
- **Marca**: `renderPagoMensajero` (`cierre-detalle-shared.tsx:836`) pinta un `Badge` «Ajustado»
  cuando `ajustesPago?.length > 0`, que abre la lista de ajustes (quién, rol, cuándo, anterior →
  nuevo, motivo). Como el detalle de bodega usa el mismo render, R20 sale de la misma pieza; si al
  implementar no fuera así, se monta allí también. En la lista de cierres del detalle de bodega,
  `Badge` «Con ajustes» cuando `gestionesAjustadas > 0`.
- Textos de UI en las constantes de etiquetas del módulo, como `PAGO_SIN_TARIFA_LABEL`.
- No es una pantalla nueva (es un diálogo en una existente): no pasa por `/design`.

## 6. Interacción con otras correcciones

- **Corrección del desglose de pagos** (2026-08-19): toca el recaudo, no el pago. Independientes.
- **Corrección de resultado (398):** sigue reescribiendo el pago por la regla del rechazo
  (`pagoPorResultado`). Un ajuste previo queda en el rastro y la marca sigue. Pendiente de **Q1**;
  este spec no modifica la 398.
- **Ajustes sucesivos** sobre la misma gestión: cada uno es una fila; el sello por `pagoAnterior`
  ordena las carreras.

## 7. Alternativas descartadas

1. **Solo `historial_accion`, con el antes/después en `valor_anterior`/`valor_nuevo`.** Descartada:
   esa tabla prohíbe el motivo (texto libre, 362/R5) y su `valor_*` es vocabulario cerrado de
   catálogo. El motivo es obligatorio por decisión cerrada; necesita una tabla propia.
2. **Columnas `pago_mensajero_ajustado_at/_por` en `gestion_orden`** (patrón `pagos_editados_*`).
   Descartada: guarda solo el último ajuste, pierde el anterior/nuevo/motivo de los sucesivos y
   crea una segunda verdad junto al rastro.
3. **Ajustar con un movimiento `ajuste_devengo` en `pago_mensajero_movimiento` al aprobar.**
   Descartada: el cierre y el cierre de bodega no reflejarían el ajuste y «para la central» quedaría
   mal; la decisión heredada dice que el ajuste cambia la copia congelada.
4. **Recalcular los seis totales del cierre** (como 398). Descartada por innecesaria: el ajuste solo
   cambia `pago_mensajero`; reescribir los otros cinco sería tocar dinero que no cambió.

## 8. Dependencias

Ninguna librería nueva.

## 9. Riesgos

- **Down del enum**: recrear `historial_accion_tipo` exige listar todos los valores vigentes. Se
  copia del último `down.sql` que lo hace y se prueba con la integración de migración.
- **E2E**: los datos se siembran por los helpers que ya usan `e2e/cierres-admin.spec.ts` y
  `e2e/cierre-bodega-satelite.spec.ts`; ninguno toca recursos fuera de la base de test.
