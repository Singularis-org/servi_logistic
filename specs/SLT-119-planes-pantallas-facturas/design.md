# SLT-119 — planes-pantallas-facturas · design.md

> Requisitos: `requirements.md` (R1–R19; P1–P5 abiertas, escritas con la recomendada). Escrito por `spec_author` el
> 2026-11-12. Sin migración, sin cambio de esquema y sin dependencias nuevas: Prisma, zod, React y los componentes de
> `components/ui/` ya aprobados (`docs/dependencias.md`). Solo lectura sobre lo que dejó SLT-118 «Planes: factura por
> empresa y período con la cuota y las órdenes» y SLT-85 «Traza de facturación de los cobros por orden».

## Lo que ya existe

Buscado el 2026-11-12 con `factura_plataforma`, `FacturaPlataforma`, `facturas de la plataforma`, `estado de cuenta`,
`cobro_plataforma_traza`, `num_guia` y `mi-plan`, en los tres sitios. El grafo `codebase-memory-mcp` no tiene
proyecto para este worktree (`index_status`: «project not found»): busqué con Grep y Read en `app/`, `components/`,
`lib/`, `e2e/` y `tests/`.

- **El board** (`feature_list.json`): esta ficha; SLT-118 (hecha), que deja los datos y difiere aquí pantallas y E2E;
  SLT-136 «Planes: aviso, correo y descarga de la factura», que depende de esta y se lleva aviso, correo y descarga;
  SLT-121 «Planes: plazo de pago de la factura y operación congelada por mora» y SLT-120 «Planes: facturar el período
  en curso (1–15) tras asignar los primeros planes», que no pintan facturas. Ninguna otra ficha pinta facturas de la
  plataforma.
- **`specs/`**: «factura» sale en 150+ specs, pero es la factura impresa de la orden (223, 217) o el estado de cuenta
  de la wallet (SLT-73, SLT-95…). Las facturas de la plataforma solo están en SLT-118, que dice «Las facturas no
  tienen action, servicio ni pantalla (SLT-119)» (design §3).
- **El código**: ninguna pantalla, action ni servicio de facturas. Sí hay lectura:

| Qué apareció | Dónde | Qué se hace |
|---|---|---|
| `FacturaPlataformaDTO`, `CuotaDeLaFactura`, `EstadoFactura`, `PERIODICIDADES_FACTURA` | `lib/types/factura-plataforma.ts` | **Se reutilizan.** Se suman los tipos de la línea y de los resultados (§3) |
| `FacturaPlataformaRepository.deLaEmpresa()` (una sentencia: cerradas + `factura_plataforma_en_curso`) y `deEmpresaParaPlataforma(organizacionId)` (la misma con `conEmpresa`) | `lib/repositories/FacturaPlataformaRepository.ts`, `IFacturaPlataformaRepository.ts` | **Se reutilizan tal cual** para la lista (R1, R2, R12). Se suman dos métodos de líneas (§2) |
| La traza por movimiento, con `num_guia`, `tipo_movimiento`, `valor_cobrado` (reverso ≤ 0) y `cobrado_at = ocurrido_at`; RLS por empresa, `servi_app` la lee; índice `(organizacion_id, cobrado_at)` | `cobro_plataforma_traza`, `20261109120000`; `CobroPlataformaTraza` en `db/schema.prisma` | **Es el detalle por orden** (SLT-118 R7). Se lee, no se copia ni se toca |
| «Mi plan»: página, `MiPlanModule`, `verMiPlan` y `ROLES_MI_PLAN` | `app/(app)/mi-plan/`, `lib/actions/_shared/mi-plan.ts`, `lib/services/MiPlanService.ts`, `lib/auth/menu-visibility.ts` | Se suma la sección; la autorización del maestro lee la misma constante |
| La guardia «Mi plan solo del maestro» (SLT-91 R10: nadie nombra la ruta salvo menú, reparto y página) | `tests/unit/guards/mi-plan-solo-maestro.guardia.test.ts` | **Se respeta:** sin ruta nueva ni enlaces (P4) |
| El detalle de empresa del superadmin con lecturas aisladas (`leerPlan`) | `app/(app)/plataforma/empresas/[organizacionId]/page.tsx` | Mismo molde para la sección (R12, R17) |
| `money()`, `fechaCortaEnZona`, `ZONA_CR` | `lib/config/moneda.ts`, `lib/utils/fecha-corta.ts`, `lib/utils/fecha-cr.ts` | El formato de importes y fechas (R3, R5, R7) |
| `Sheet`, `Table`, `Dialog` | `components/ui/` | El panel del detalle y las tablas |
| `crearPlanPublicoConCosto` (costo base 1 000 mensual), `PlanesRepository.asignar`, `crearEmpresaE2E`, `clienteDueno`, `asegurarSuperadmin` | `e2e/_planes-fixture.ts`, `e2e/_dos-empresas-fixture.ts`, `e2e/_superadmin-fixture.ts`, `tests/fabricas/e2e` | La siembra del E2E (R19) |
| Guardia de escritura solo por la base | `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` | Ya barre `lib/` y `app/`: cubre R16 sin cambios |

Desajuste encontrado: `docs/architecture.md > Facturas de la plataforma > Lectura` dice que `deEmpresaParaPlataforma`
«aún no existe»; existe desde SLT-118 T8.1. Se corrige al documentar esta ficha (T7.1).

## 1. Modelo de datos

**Sin cambios.** Ni tabla, ni columna, ni migración, ni `down.sql`. Lo que se lee:

| Tabla | Clase | Acceso de `servi_app` | Cómo se lee aquí |
|---|---|---|---|
| `factura_plataforma` | negocio, RLS `factura_plataforma_por_empresa` por `organizacion_id` | `SELECT`; `REVOKE INSERT, UPDATE, DELETE`; `EXECUTE` solo de `factura_plataforma_en_curso` | Por `deLaEmpresa()`, sin cambios |
| `cobro_plataforma_traza` | negocio, RLS `cobro_plataforma_traza_por_empresa` | `SELECT`; `REVOKE INSERT, UPDATE, DELETE`; inmutable (`SL085`) | `findMany` + `count` por `cobrado_at` en `[desde, hasta)` con la empresa en el contexto |

Únicos por empresa: los de SLT-118 y SLT-85, sin cambios. Módulo: ninguno; «Mi plan» y Plataforma > Empresas son
núcleo (`lib/modulos/reparto.ts`), sin puerta de módulo.

## 2. Repositorio: las líneas de una factura

`IFacturaPlataformaRepository` gana dos métodos; ninguno escribe (R16).

```ts
/** R7, R8, R10, R11, R14: la factura `facturaId` de la empresa del contexto y una página de sus líneas; `null` si
 *  no es de esa empresa (la RLS no la deja ver) o no existe. */
detalleDeLaEmpresa(facturaId: string, pagina: number): Promise<DetalleDeFactura | null>;
/** R12, R14: lo mismo para el superadmin, con `conEmpresa(organizacionId)`, como `deEmpresaParaPlataforma`. */
detalleParaPlataforma(organizacionId: string, facturaId: string, pagina: number): Promise<DetalleDeFactura | null>;
```

`detalleDeLaEmpresa`:
1. `const facturas = await this.deLaEmpresa()` y busca `facturaId`. Así la cabecera (cuotas, previstas, total
   parcial, `hasta` previsto) sale exactamente de la misma lectura que la lista (R5) y la no cerrada de
   `factura_plataforma_en_curso`. Si no está: `null` (R14). Con otra empresa en el contexto la RLS y el `WHERE` de
   `CERRADAS_JSON` ya la dejan fuera.
2. Con `[desde, hasta)` de esa factura (en la no cerrada, `hasta` es su fin previsto; no hay movimientos futuros, así
   que salen las líneas hasta el momento de la lectura, R11):
   `cobroPlataformaTraza.findMany({ where: { cobradoAt: { gte: desde, lt: hasta } }, orderBy: [{ cobradoAt: "asc" },
   { id: "asc" }], skip: (pagina − 1) × 100, take: 100, select: { id, cobradoAt, numGuia, tipoMovimiento,
   valorCobrado } })` y `count` con el mismo `where`, en un `$transaction` de solo lectura para que página y total sean
   de la misma foto. La empresa la pone la extensión del cliente (`MODELOS_DE_NEGOCIO`) y la RLS; usa el índice
   `(organizacion_id, cobrado_at)`.
3. Devuelve `{ factura, lineas: { lineas, pagina, porPagina: 100, total } }`. Una página posterior a la última da
   `lineas: []` (R10).

En una cerrada, la Σ de `valor_cobrado` de todas sus líneas es su `total_ordenes` y su número es `movimientos`
(SLT-118 R7): R8 lo prueba con la base, no lo recalcula la app.

`detalleParaPlataforma(org, id, p)` = `conEmpresa(org, () => this.detalleDeLaEmpresa(id, p))`: el camino de
`deEmpresaParaPlataforma`, sin `comoPlataforma` y sin entrada nueva en `EXCEPCIONES_DE_PLATAFORMA` (la lectura corre
como `servi_app` con la empresa fijada). El tipo del cliente pasa de `Pick<PrismaClient, "$queryRaw" |
"organizacion">` a sumar `"cobroPlataformaTraza" | "$transaction"`.

**Dos sentencias, no una.** Entre la cabecera y las líneas puede cerrarse la factura: el intervalo `[desde, hasta)` no
cambia al cerrar (SLT-118 R1, R13), así que las líneas siguen siendo las suyas. Se acepta.

## 3. Tipos (`lib/types/factura-plataforma.ts`)

```ts
export const TIPOS_LINEA_FACTURA = ["cargo", "reverso"] as const;
export interface LineaDeFactura { id: string; instante: Date; numGuia: number | null; tipo: TipoLineaFactura; valor: string } // valor con signo, 2 decimales
export interface PaginaDeLineas { lineas: LineaDeFactura[]; pagina: number; porPagina: number; total: number }
export interface DetalleDeFactura { factura: FacturaPlataformaDTO; lineas: PaginaDeLineas }
export const LINEAS_POR_PAGINA = 100; // P3

export type FacturasResult = { estado: "ok"; facturas: FacturaPlataformaDTO[] } | { estado: "forbidden" };
export type DetalleFacturaResult =
  | { estado: "ok"; detalle: DetalleDeFactura }
  | { estado: "forbidden" } | { estado: "not_found" }
  | { estado: "validation_error"; errores: Record<string, string> };

export const detalleFacturaSchema = z.object({ facturaId: z.uuid(), pagina: z.int().min(1).default(1) });            // maestro
export const detalleFacturaEmpresaSchema = detalleFacturaSchema.extend({ organizacionId: z.uuid() });               // superadmin
export const facturasDeEmpresaSchema = z.object({ organizacionId: z.uuid() });
```

`valor` es `valorCobrado.toFixed(2)` (un reverso ya es ≤ 0 por el CHECK de la traza). Los formatos de `errores`
siguen los de `PlanesService` (campo → mensaje).

## 4. Servicio (`lib/services/FacturaPlataformaService.ts`)

La autorización vive en el servicio, antes de tocar la base (R13), como `MiPlanService`:

| Método | Quién | Entrada | Repositorio |
|---|---|---|---|
| `deMiEmpresa(actor)` | maestro: `ROLES_MI_PLAN.includes(actor.rol)` (importado de `lib/auth/menu-visibility`; la guardia de SLT-91 R5 solo prohíbe **definirla** en otro sitio) | — | `deLaEmpresa()` |
| `detalleDeMiEmpresa(actor, input)` | maestro | `detalleFacturaSchema` | `detalleDeLaEmpresa` |
| `deEmpresa(actor, input)` | superadmin: `esPlataforma(actor.rol)` (`lib/auth/plataforma`) | `facturasDeEmpresaSchema` | `deEmpresaParaPlataforma` |
| `detalleDeEmpresa(actor, input)` | superadmin | `detalleFacturaEmpresaSchema` | `detalleParaPlataforma` |

Orden: actor → `forbidden`; esquema → `validation_error`; repositorio → `null` = `not_found` (R14, R15). La lista se
devuelve **de la más reciente a la más antigua** (R1): el repositorio las da por `desde` ascendente con las no
cerradas al final; el servicio invierte. Errores de la base se propagan (los aísla la página, R17). Contrato en
`lib/interfaces/services/IFacturaPlataformaService.ts`.

El superadmin **no** entra por los métodos del maestro: `MiPlanService` ya le niega «Mi plan» y aquí tampoco
pasa `ROLES_MI_PLAN`.

## 5. Bordes: composition root y Server Actions

- `lib/actions/_shared/facturas-plataforma.ts` (sin `"use server"`, patrón de `_shared/mi-plan.ts`):
  `construirFacturaPlataformaService(prisma = getPrismaClient())`, `verFacturasDeMiPlan(actor)` y
  `verFacturasDeEmpresa(actor, { organizacionId })`. Las llaman las páginas, que ya resolvieron el actor: la lista no
  necesita endpoint.
- `lib/actions/facturas-plataforma.ts` (`"use server"`, patrón de `lib/actions/mi-plan.ts`, con `deps` para los
  tests): `verDetalleFacturaMiPlanAction(input)` y `verDetalleFacturaEmpresaAction(organizacionId, input)`. El actor
  sale de la sesión; la empresa del maestro, del actor, nunca del cliente. La del superadmin llega ligada en el
  servidor (`verDetalleFacturaEmpresaAction.bind(null, organizacionId)` en la página) y el servicio la valida igual.
- `lib/modulos/reparto.ts`: `"facturas-plataforma": "nucleo"` en `MODULO_POR_ACTION` (la guardia `modulos-reparto`
  exige toda action repartida). Sin ruta nueva en `MODULO_POR_RUTA` (P4).

## 6. Pantallas

### 6.1 Componentes compartidos (`components/shared/facturas/`)

No importan de `lib/actions`, `lib/services`, `lib/repositories` ni `lib/db`: reciben datos y la función del detalle
por props, para servir a las dos pantallas.

- **`facturas-vista.ts`** (puro, sin React): `numeroVisible(f)` («N.º 7» o `null`, R4, P2);
  `periodoVisible(desde, hasta)` (primer y último día en `ZONA_CR` con `fechaCortaEnZona`, el último = `hasta` − 1
  ms, R3); `estadoVisible(f)` («Emitida» para `cerrada`; «En curso» para `en_curso` y `por_cerrar`, R2);
  `sumaDeCuotas(f)` (decimal exacto de `cuota` + `primeraCuota`, o `null`; solo suma importes de la base, R5);
  `instanteVisible(d)` (fecha y hora, P5); y `FACTURAS_TEXTOS` (todos los literales en un sitio).
- **`FacturasDeLaEmpresa.tsx`** (`"use client"`). Props: `facturas: FacturaPlataformaDTO[] | null` (`null` = falló,
  R17), `cargarDetalle: (input: { facturaId: string; pagina: number }) => Promise<DetalleFacturaResult>`. Una
  `Table` con número, período, plan de las órdenes, órdenes, cuotas, total y estado (R1); vacía → «Aún no hay
  facturas» (R18). Cada fila es un botón «Ver detalle» que abre el `Sheet`.
- **`DetalleDeFactura.tsx`** (`"use client"`). En un `Sheet` lateral: llama `cargarDetalle` al abrir y al paginar; un
  `ok` pinta cabecera, cuotas (con «prevista» en una no cerrada y «X de Y días» si `diasCobrados ≠ diasPeriodo`),
  resumen de órdenes, total y la tabla de líneas (fecha y hora, guía o «—», «Cargo»/«Reverso», valor con signo; R6,
  R7, R9). Abajo, «Anterior» / «Siguiente» y «N líneas» (R10). Un throw o un estado distinto de `ok` → «No se pudo
  cargar la factura» sin cerrar la lista (R17). Sin otros botones (R16).

Importes con `money()`; nunca `Number(...)` sobre un importe (R5).

### 6.2 «Mi plan» (maestro)

`app/(app)/mi-plan/page.tsx` suma `leerFacturas(actor)` al `Promise.all`, aislada como `leerPlan` del detalle de
empresa: un throw o un estado distinto de `ok` → `null` y la sección dice «No se pudieron cargar las facturas» (R17);
el `forbidden` de la página sigue saliendo de `verMiPlan`. `MiPlanModule` gana `facturas` y `cargarDetalleFactura`
(la action `verDetalleFacturaMiPlanAction`) y pinta `FacturasDeLaEmpresa` al final, después de `CambioDePlan`. Ningún
archivo nuevo nombra la ruta (guardia de SLT-91 R10).

### 6.3 Detalle de empresa (superadmin)

`app/(app)/plataforma/empresas/[organizacionId]/page.tsx` suma `leerFacturas(actor, organizacionId)` aislada igual y
pinta `FacturasDeLaEmpresa` entre `PlanEmpresa` y «Núcleo», con
`cargarDetalle={verDetalleFacturaEmpresaAction.bind(null, empresa.organizacionId)}` (R12, P1).

## 7. Datos que dependen del país

- **Moneda:** la de la app (`money()`); sin conversión (SL-21).
- **Hora:** la de la plataforma, `ZONA_CR` (−06:00), para períodos y líneas, hasta SLT-90. Ningún literal de zona
  nuevo: se usa la constante.
- **Impuestos y métodos de pago:** ninguno (estado de cuenta interno; SL-21, SLT-121).

## 8. Tests

| Archivo | Cubre | Cómo |
|---|---|---|
| `tests/integration/db/factura-plataforma-detalle.test.ts` (**nuevo**) | R7, R8, R10, R11, R12, R14 | Base real; cierres con `factura_plataforma_cerrar(org, p_ahora)` como en `factura-plataforma-cierre.test.ts`. Orden de líneas a igual instante; Σ = `total_ordenes` y número = `movimientos`; cargo el 14 y reverso el 17 en dos facturas; 230 líneas en páginas 100/100/30 y la 4 vacía; la en curso con las líneas hasta ahora; dos empresas: el id de la otra → `null`; `detalleParaPlataforma` = `detalleDeLaEmpresa` |
| `tests/unit/services/factura-plataforma-service.test.ts` (**nuevo**) | R13, R14, R15, R1 (orden) | Repositorio doble: `forbidden` sin llamadas (admin, sin sesión, superadmin por la vía del maestro, maestro por la del superadmin); `validation_error` sin llamadas; `null` → `not_found`; la lista invertida |
| `tests/unit/actions/facturas-plataforma.test.ts` (**nuevo**) | R13 | Las actions pasan el actor de la sesión y la empresa ligada, no la del cliente |
| `tests/unit/planes/facturas-vista.test.ts` (**nuevo**) | R3, R4, R2 (etiquetas) | Los ejemplos de R3 (con un `hasta` a las 06:00 UTC = 00:00 CR); «N.º 7»; `por_cerrar` → «En curso» |
| `tests/components/FacturasDeLaEmpresa.test.tsx` (**nuevo**) | R1, R2, R5, R16, R17, R18 | Columnas, orden, importes de la base («1234.56» no se redondea), «prevista», «Aún no hay facturas», `null` → «No se pudieron cargar las facturas», sin botones de escritura |
| `tests/components/DetalleDeFactura.test.tsx` (**nuevo**) | R2, R6, R7, R9, R10, R16, R17 | Dos cuotas (una prorrateada), sin cuota, prevista; línea sin guía; reverso negativo; paginación; un throw de `cargarDetalle` |
| `tests/components/MiPlanModule.test.tsx` (se ajusta) | R1 | Las props nuevas; la sección aparece |
| `tests/integration/mi-plan-page.test.tsx` (se amplía) | R1, R17 | La lectura aislada: falla y el plan se pinta |
| `tests/integration/plataforma-empresa-detalle-page.test.tsx` (se amplía) | R12, R17 | La sección con la empresa de la URL; falla y los módulos se pintan |
| `tests/unit/guards/cobro-plataforma-solo-por-trigger.guardia.test.ts` (existente, sin cambios) | R16 | Barre los archivos nuevos |
| `e2e/facturas-plataforma.spec.ts` (**nuevo**, proyecto `dinero`) | R19 | §9 |

## 9. El E2E diferido de SLT-118 (R19)

`e2e/facturas-plataforma.spec.ts`, serial, en el proyecto `dinero` de `playwright.config.ts` (la guardia
`e2e-sin-saltos` exige cada spec en un proyecto):
1. **Datos (dueño).** `crearEmpresaE2E` con `maestro` y `admin`; un plan público con `crearPlanPublicoConCosto`
   (costo base 1 000 mensual y costo por orden 300.00) asignado desde hoy con `PlanesRepository.asignar` (como
   `mi-plan-cambiar-plan.spec.ts`). Dos órdenes con `crearOrdenesDirectas` y una eliminada con el dueño y la empresa
   fijada (los triggers escriben cargo y reverso, como `cobro-plataforma-sl40.spec.ts`).
2. **En curso.** El maestro abre «Mi plan»: la fila «En curso» con órdenes «₡300» (300 + 300 − 300) y, en el detalle,
   tres líneas con las guías de las dos órdenes, dos «Cargo» de «₡300» y un «Reverso» de «−₡300».
3. **Cierre.** El dueño llama `factura_plataforma_cerrar(org, fin_natural_at + 6 min)` con el `fin_natural_at` de la
   en curso: la cierra con número 1 y abre la siguiente. **Artificio aceptado:** el reloj se adelanta solo para esta
   empresa desechable; nadie crea órdenes para ella después (caerían en un intervalo ya cerrado).
4. **Cerrada.** El maestro recarga: «N.º 1», «Emitida», el total y la cuota iguales a los de la fila de la base (la
   cuota depende del día del mes, así que no se escribe a mano; los importes de las órdenes sí). La nueva en curso
   aparece encima.
5. **Superadmin.** En el detalle de la empresa, la misma fila «N.º 1» y las mismas tres líneas.
6. **Admin.** `/mi-plan` → 404 «no encontrado» (SLT-91), sin sección de facturas.

Al final archiva el plan público que creó (el catálogo es global), como `mi-plan-cambiar-plan.spec.ts`.

## 10. Alternativas descartadas

- **Copiar las líneas en la factura al cerrar** (una tabla `factura_plataforma_linea`): duplica la traza que SLT-118
  R7 manda leer «sin copiarlas», pide migración, RLS e inmutabilidad nuevas, y no serviría a la factura en curso.
  Descartada: la traza ya es inmutable e indexada por `(organizacion_id, cobrado_at)`.
- **Una función SQL `factura_plataforma_detalle(p_org, p_id, p_pagina)`** con el `jsonb` de cabecera y líneas en una
  sola sentencia: una sola foto, pero una migración nueva con `GRANT`, `down.sql` y el control de contexto, para
  ganar solo la consistencia entre dos sentencias que §2 ya justifica innecesaria (el intervalo no cambia al cerrar).
- **Una ruta `/mi-plan/facturas/[facturaId]`** (P4 (b)): enlazable, pero rompe la guardia de SLT-91 R10 y obliga a
  ampliarla, a sumar la ruta al reparto y a repetir la autorización en una página más.
- **Pantalla global del superadmin** (P1 (b)): ver P1; más archivos y una lectura entre empresas que hoy no existe.
- **Todas las líneas de una vez** (P3 (b)): la sembrada histórica de una empresa con meses de órdenes llevaría todas
  sus filas en una respuesta de Server Action.
- **Recalcular totales en la pantalla sumando las líneas**: dos fuentes para el mismo número; con paginación,
  además, imposible. Se pintan los de la base (R5).
