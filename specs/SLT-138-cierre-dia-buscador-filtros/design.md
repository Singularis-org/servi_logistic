# SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» — design

> Hereda el diseño de SLT-137 «/cierre-dia: cola de cierres del mensajero con filtros»
> (`specs/SLT-137-cierre-dia-cola-filtros/design.md`): la cola `ColaCierres` con `tipo: "propios"`,
> su tabla y su pendiente de pago. Aquí solo va lo que añade esta ficha: el bloque `filtros` en el
> servidor y la barra en el hueco `barra`.

## Lo que ya existe

**Términos buscados:** «por folio», «Busca por folio», `folio`, `filtrosCierresSchema`,
`FiltrosCierresBarra`, `BuscadorFiltros`, `filtrosWhere`, `filtrosConLimites`,
`listarCierresPasadosSchema`, `findCierresByMensajeroPaginado`, `barra={null}`.

**Dónde:** `feature_list.json` (por `key` y descripción), `specs/` y el código con Grep/Read. El
índice del grafo no tiene este worktree («project not found or not indexed»); no se usó el de otro.

**Resultado:** ninguna ficha ni código hace ya el buscador por folio ni los filtros de la cola del
mensajero. `listarCierresPasadosSchema` (`lib/types/cierre.ts:96`) es `.strict()` con solo `page`
y `pageSize`: hoy un `filtros` muere con `validation_error`. El servidor de los filtros del admin sí
existe y se reutiliza:

| Qué | Dónde | Uso aquí |
|---|---|---|
| Primitivas del bloque de filtros: `fechaCalendario`, `rangoCoherente`, `MENSAJE_RANGO`, `ESTADOS_FILTRO_CIERRES`, `listaDeEstados` | `lib/types/filtros-cierres.ts:36-120` | El bloque nuevo se declara en ese mismo archivo y desde esas primitivas, sin copiarlas (R168-R170). |
| `filtrosConLimites`, `tieneRangoDeFechas` | `lib/types/filtros-cierres.ts:311-333` | `desde`/`hasta` → instantes en la zona del país de la empresa, límite superior exclusivo (R169). |
| `filtrosWhere` (exportada) | `lib/repositories/CierresAdminRepository.ts:907` | Las condiciones de fecha (`gte`/`lt`) y de estado (`in`) del `WHERE`, sin una tercera declaración (R169, R170). Se le pasa solo `{solicitadoDesde, solicitadoHasta, estados}`. |
| `cierresDeMensajeroWhere` | `lib/repositories/CierreDiaRepository.ts:790` | El alcance `{ mensajeroId }`, compartido por la página y el archivo. Gana un segundo parámetro opcional (R172, R173). |
| `findCierresByMensajeroPaginado`, `findCierresByMensajero` | `lib/repositories/CierreDiaRepository.ts:1816, 1717` | Ganan `filtros` opcional al final. Sin él, la consulta es la de hoy (R173). |
| `listarCierresPasadosPaginado`, `listarCierresPasadosCompleto` | `lib/services/CierreDiaService.ts:543, 626`; `lib/actions/cierre-dia.ts:165, 193` | Reciben y aplican `filtros` (R168-R174). |
| `zonaDeLaEmpresa` vía `this.zona(...)` | `lib/services/CierreDiaService.ts:226` | La zona para `filtrosConLimites` (R169). |
| `FiltrosCierresBarra` | `app/(app)/cierres-admin/_components/FiltrosCierresBarra.tsx` | **El patrón que se copia**: `BuscadorFiltros` + `FilterComponent`, `activos`, `seleccion`, `reset` por `key`, `aFiltros`, «Limpiar todo». **No se toca** (R179). |
| `ATAJOS_CREACION`, `ultimosNDiasCalendarioCR` | `app/(app)/ordenes/_components/ordenes-filtros-def.ts:53`, `lib/utils/fecha-cr` | Los mismos atajos de rango que `/cierres-admin` (R177). |
| `ESTADO_LABEL` | `app/(app)/cierres-admin/_components/cierre-labels.ts:85` | Etiqueta legible de cada estado (R177). |
| Patrón de pantalla con filtros | `CierresAdminModule.tsx:574-646` | `filtros` en la clave de `useSWR`, `fallbackData` solo sin filtros, `aplicarFiltros` vuelve a la página 1 (R175). |
| `ColaCierres` con `tipo: "propios"` y su `barra` | `components/private/cierres/cola/ColaCierres.tsx:104`, `CierreDiaModule.tsx:936-967` | Hoy `barra={null}`; aquí recibe la barra. `ColaCierres` no cambia. |
| Aviso de descarga vacía | `components/shared/DescargarDatasetButton.tsx:89` | Con un filtro que no deja nada, el botón ya avisa en tú. No cambia. |
| Helpers de Postgres real | `tests/integration/db/_postgres-real` | `HAY_BASE_DE_DATOS`, `crearPrismaDeTest`, `enTransaccionRevertida`; patrón de `tests/integration/db/cierre-dia-pendiente-pago.test.ts`. |

## Zona y capas

**Fullstack.** `backend_dev` hace T1 (`lib/` y sus tests); `frontend_dev` hace T2 (`components/`,
`app/(app)/cierre-dia/` y sus tests). T2 depende de T1 solo por el tipo `FiltrosColaPropia` y la
firma de la acción.

Sin cambios en `db/`, sin migraciones, sin Server Actions de escritura, sin permisos nuevos, sin
dinero (D5; R71/R72 de SLT-137). No hay `down.sql` porque no hay migración.

## 1. Servidor

### Contrato del bloque (`lib/types/filtros-cierres.ts`)

```ts
/** Tope del texto del folio ANTES de normalizar (R171). */
export const MAX_FOLIO_FILTRO = 20;

/**
 * SLT-138 (R168-R171): los filtros de «Cierres solicitados» del propio mensajero. Sin mensajero ni
 * bodega: el alcance es el actor y no se recorta por nadie más. `.strict()` también aquí dentro.
 */
export const filtrosColaPropiaSchema = z
  .object({
    desde: fechaCalendario.optional(),
    hasta: fechaCalendario.optional(),
    estados: listaDeEstados,                      // la misma de FICHA 386: no vacía, z.enum
    folio: z.string().max(MAX_FOLIO_FILTRO).optional(),
  })
  .strict()
  .refine(rangoCoherente, MENSAJE_RANGO);

export type FiltrosColaPropia = z.infer<typeof filtrosColaPropiaSchema>;
export type FiltrosColaPropiaRepo = FiltrosEnRepositorio<Omit<FiltrosColaPropia, "folio">> & {
  /** Ya normalizado y solo `0-9A-F` (lo garantiza el servicio). */
  folio?: string;
};
export function sinFiltrosPropios(f: FiltrosColaPropia | undefined): boolean;
```

Va en ese archivo porque ahí están las primitivas: el día que las fechas cambien de criterio,
cambian para todos los listados de cierres a la vez (es la regla escrita en su cabecera). El módulo
es del borde y ya lo importa el cliente: no entra nada que arrastre `process.env`.

### Entrada de la acción (`lib/types/cierre.ts`)

```ts
export const listarCierresPasadosSchema = z
  .object({ page: …, pageSize: …, filtros: filtrosColaPropiaSchema.optional() })
  .strict();
```

`listarCierresPasadosCompletoSchema` sigue derivándose con `.omit({ page, pageSize }).strict()`, así
que el archivo acepta **el mismo** bloque por construcción (R168) y sigue rechazando `page`,
`mensajeroId` y cualquier otra clave. Se actualizan los comentarios que decían «lista blanca de
cero claves».

### Normalización del folio (`lib/utils/folio-cierre.ts`, nuevo, puro)

```ts
export type FolioFiltro =
  | { tipo: "ignorar" }              // vacío tras normalizar (R171)
  | { tipo: "imposible" }            // un carácter fuera de 0-9A-F, o más de 8 caracteres (R171)
  | { tipo: "buscar"; texto: string } // 1-8 caracteres 0-9A-F, en mayúsculas

export function normalizarFolio(entrada: string): FolioFiltro;
```

Regla: `trim()` → quita **un** «#» inicial → `toUpperCase()`. Vacío → `ignorar`. Con un carácter
fuera de `[0-9A-F]` → `imposible`. Más de 8 caracteres → `imposible` (no cabe en un folio de 8;
R171 no lo distingue de «no hay coincidencias»). El tope de 20 lo aplica el borde **antes** (zod).

### Servicio (`lib/services/CierreDiaService.ts`)

Firmas (parámetro opcional, al final; las construcciones y llamadas de hoy siguen compilando):

```ts
listarCierresPasadosPaginado(
  input: { page: number; pageSize: number; filtros?: FiltrosColaPropia },
  actor: Actor,
): Promise<ListarCierresPasadosServiceResult>;

listarCierresPasadosCompleto(
  actor: Actor,
  filtros?: FiltrosColaPropia,
): Promise<ListarCierresPasadosCompletoServiceResult>;
```

Un helper privado, `filtrosParaRepo(filtros, operacion)`, compartido por los dos:

1. Sin filtros o `sinFiltrosPropios(filtros)` → `undefined` (R173: el repositorio recibe lo de hoy).
2. `folio`: `normalizarFolio`. `imposible` → el método devuelve **sin llamar al repositorio**
   `{ items: [], total: 0 }` (página) o `{ status: "ok", items: [], total: 0 }` (archivo) (R171).
   `ignorar` → la clave no viaja. `buscar` → viaja `folio: texto`.
3. Rango: si `tieneRangoDeFechas`, `filtrosConLimites(resto, await this.zona(operacion))` (R169).
   Sin rango no se lee la zona.
4. `estados` viaja tal cual.

El rol se comprueba **antes** que todo (`forbidden`, como hoy). `conPendientePago` (SLT-137) se
aplica igual a la página filtrada.

`listarCierreDia` (la pantalla entera) sigue llamando a `findCierresByMensajero(actor.usuarioId)`
sin filtros: no cambia.

### Repositorio (`lib/repositories/CierreDiaRepository.ts`)

```ts
function cierresDeMensajeroWhere(
  mensajeroId: string,
  filtros?: FiltrosColaPropiaRepo,
  idsPorFolio?: string[],
): Prisma.CierreDiaWhereInput
```

- Sin filtros → `{ mensajeroId }`, **el mismo objeto de hoy** (R173; lo fija ya
  `tests/unit/repositories/historicos-paginados-where.test.ts:172-177`).
- Con filtros → `{ AND: [{ mensajeroId }, ...filtrosWhere({ solicitadoDesde, solicitadoHasta,
  estados }), ...(idsPorFolio ? [{ id: { in: idsPorFolio } }] : [])] }`. El alcance va **dentro**
  del `AND` junto a los recortes, como en el admin: ningún recorte puede sustituirlo (R172).

`findCierresByMensajeroPaginado(mensajeroId, rango, filtros?)` y
`findCierresByMensajero(mensajeroId, filtros?)`: si `filtros?.folio` existe, primero
`idsDeCierresPorFolio`, después el `findMany` + `count` de hoy con el mismo `where` (el total cuenta
el conjunto filtrado, R172). Mismo `orderBy` (`ORDEN_CIERRES_MENSAJERO`) y mismo mapper.

**El folio en SQL.** Prisma no tiene un filtro «contiene, solo en los últimos 8 caracteres»: `contains`
sobre el `id` entero da falsos positivos (un «3F2A» del primer bloque del uuid saldría). Va una
lectura a mano, **exportada como función del módulo** (no método de la interfaz, para no romper los
dobles de `ICierreDiaRepository` de 30+ tests) y probada contra Postgres real:

```ts
export async function idsDeCierresPorFolio(
  prisma: Pick<PrismaClient, "$queryRaw">,
  mensajeroId: string,
  texto: string,               // ya normalizado: 1-8 caracteres 0-9A-F
): Promise<string[]> {
  const filas = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "cierre_dia"
    WHERE "mensajero_id" = ${mensajeroId}
      AND strpos(upper(right("id", 8)), ${texto}) > 0`;
  return filas.map((f) => f.id);
}
```

- `strpos` y no `LIKE`: el texto no se interpreta como patrón, así que no hay comodines que escapar.
- `mensajero_id` en esta lectura acota el tamaño de la lista de ids a los cierres del mensajero (uno
  por día trabajado) y es una segunda barrera: el `WHERE` principal la vuelve a exigir.
- **Empresa:** `CierreDiaRepository.ts` ya está en `EXCEPCIONES_SQL_A_MANO` como `porRls`
  (`lib/db/excepciones-aislamiento.ts:35`): su SQL a mano lo acota la RLS de `cierre_dia`
  (`cierre_dia_por_empresa`) con la empresa que fija la extensión. La lectura nueva **no** debe
  escribir `organizacion_id`: la guardia `sql-a-mano-por-empresa` es por archivo y pediría sacar el
  archivo de la lista mientras el resto de su SQL sigue sin filtrarlo.

### Acción (`lib/actions/cierre-dia.ts`)

- `listarCierresPasadosPaginado`: sin cambios de forma; `data` ya trae `filtros` y va entero al
  servicio.
- `listarCierresPasadosCompleto`: guarda el resultado del `parse` y llama
  `service.listarCierresPasadosCompleto(actor, data.filtros)` **solo si** `data.filtros` existe; si
  no, `(actor)` como hoy (R173; `tests/unit/actions/cierre-dia-descarga-action.test.ts:71` afirma
  la llamada con solo el actor).
- El `validation_error` de una clave colada sale del `parse`, antes de `buildService()` (R168).

### Autorización y multi-empresa

- La autorización no cambia: `actor.rol === "mensajero"` y `mensajero_id = actor.usuarioId` en el
  `WHERE`, escrito por el servicio desde la sesión. El bloque `filtros` no tiene ninguna clave de
  alcance y `.strict()` la rechaza (R168, R172).
- La empresa sale de la sesión (extensión del cliente + RLS). Ningún módulo nuevo que deba estar
  encendido: `/cierre-dia` ya es solo del rol mensajero.

### Modelo de datos, RLS y migraciones

Ninguno. Sin tablas, columnas, índices ni migraciones. `cierre_dia` ya tiene `organizacion_id` y
RLS (SL-17). No se añade índice para el folio: el conjunto de un mensajero es pequeño (uno por día
trabajado) y la lectura va por `mensajero_id`.

### Datos que dependen del país

- **Fechas:** `desde`/`hasta` son días del calendario del país de la empresa; se convierten con la
  zona de `IReglasPaisEmpresa` (`this.zona`), como los filtros del admin (SLT-42). Los atajos de
  rango salen de `ultimosNDiasCalendarioCR`, la misma función de `/cierres-admin` (R177 pide los
  mismos atajos).
- Moneda, impuestos, geografía, métodos de pago: no aplica (no se toca ningún importe).

## 2. Pantalla

### La barra: `app/(app)/cierre-dia/_components/FiltrosColaPropiaBarra.tsx` (nuevo)

Copia el patrón de `FiltrosCierresBarra`, **sin tocarla** (R179): un `<section aria-label>` con
`BuscadorFiltros` y, dentro, un `FilterComponent` con los filtros pedidos.

```ts
export interface FiltrosColaPropiaBarraProps {
  /** Emite el objeto ENTERO; `{}` = sin filtros. */
  onChange: (filtros: FiltrosColaPropia) => void;
}
```

- **Estado:** `activos` (claves pedidas), `seleccion` (`FilterSelection`), `termino` (lo que emitió
  el buscador) y `reset` (la `key` del `FilterComponent` para «Limpiar todo»).
- **Buscador:** `label="Buscar"`, `placeholder={BUSCA_POR_FOLIO}` («Busca por folio»),
  `onChange={(t) => emitir(seleccion, t)}`. El debounce es el de `BuscadorFiltros`.
- **Filtros declarados**, en este orden: «Fecha de solicitud» (`kind: "dateRange"`, atajos de
  `ATAJOS_CREACION` con `ultimosNDiasCalendarioCR`, placeholder «Cualquier fecha») y «Estado»
  (`kind: "multi"`, `opcionesEstadoPropias()`, placeholder «Todos», «Filtrar estados…», «Ningún
  estado coincide»). Ni «Bodega» ni «Mensajero». Sin `group` en las opciones (R177).
- **Sin aviso** «Filtro activo…» (R177).
- **«Limpiar todo»** (`onLimpiarTodo`): `seleccion = {}`, `activos = []`, `reset + 1`,
  `termino = ""` y `onChange({})`. `BuscadorFiltros` vacía su campo solo (R178).
- `hayFiltrosAplicados = !sinFiltrosPropios(filtros) || activos.length > 0`.
- **Sin `disabled` mientras carga.** La barra del admin se deshabilita mientras lee, pero allí no
  hay nada que teclear; aquí deshabilitar el campo en cada lectura le quitaría el foco al mensajero
  a mitad del folio. SWR ya descarta la respuesta de una clave vieja.

### Lógica pura y textos (`components/private/cierres/cola/cola-propia-vista.ts`)

Se añaden, con trato tú (R180):

| Constante / función | Valor |
|---|---|
| `BUSCA_POR_FOLIO` | «Busca por folio» |
| `VACIO_FILTRADO_PROPIA` | «Ningún cierre coincide con los filtros.» |
| `BARRA_PROPIA` | «Filtros de tus cierres» (nombre de la `section`) |
| `FILTRO_FECHA_PROPIA` / `FILTRO_ESTADO_PROPIA` | «Fecha de solicitud» / «Estado» |
| `opcionesEstadoPropias()` | `ESTADOS_FILTRO_CIERRES.map(e => ({ value: e, label: ESTADO_LABEL[e] }))`, sin `group` |
| `aFiltrosPropios(seleccion, termino)` | `FilterSelection` + término → `FiltrosColaPropia`. Fecha: la terna `[atajo, desde, hasta]` con `""` → ausente, como `aFiltros` del admin. Estado: lista vacía → ausente. Folio: `termino` recortado; vacío → ausente. Las claves ausentes **no viajan** (ni como `undefined`). |

`ESTADO_LABEL` se importa de `app/(app)/cierres-admin/_components/cierre-labels.ts`, como ya hace
`TablaColaPropia` con `DESTINO_TIPO_LABEL` (SLT-137).

### Montaje en `CierreDiaModule.tsx`

Copia de `CierresAdminModule.tsx:574-646`:

```tsx
const [filtrosPropios, setFiltrosPropios] = useState<FiltrosColaPropia>({});
function aplicarFiltrosPropios(next: FiltrosColaPropia) {
  setFiltrosPropios(next);
  setPasadosPage(1);                                        // R175
}
const { data: pasadosData, error: pasadosError } = useSWR(
  ["cierre-dia:pasados", pasadosPage, pasadosPageSize, filtrosPropios],
  () => leerCierresPasados(pasadosPage, pasadosPageSize, filtrosPropios),
  { fallbackData: pasadosPage === 1 && pasadosPageSize === cierresPasados.pageSize
      && sinFiltrosPropios(filtrosPropios) ? cierresPasados : undefined },
);
```

- `leerCierresPasados(page, pageSize, filtros)` manda `filtros` **solo si** no está vacío; sin
  filtros la petición es la de hoy, `{ page, pageSize }` (R173).
- `<ColaCierres … barra={<FiltrosColaPropiaBarra onChange={aplicarFiltrosPropios} />}
  vacio={sinFiltrosPropios(filtrosPropios) ? VACIO_PROPIA : VACIO_FILTRADO_PROPIA} …/>` (R176).
  El conteo de la pestaña ya es `pasadosData?.total` (R175).
- **Descargar (R174):** `DESCARGA_CIERRES_PASADOS` pasa a ser la función
  `descargaCierresPasados(filtros)`, que devuelve el mismo objeto (mismo `titulo`, `columnas` y
  `ambitoColumnas:` como **propiedad**, que es lo que mira la guardia de ámbitos) con
  `descargarDatos("listarCierresPasadosCompleto", sinFiltrosPropios(filtros) ? undefined : { filtros })`.
- `refrescarListas()` ya relee toda clave que empiece por `"cierre-dia:pasados"`: sigue valiendo con
  la clave de cuatro elementos (R160 de SLT-137).

## Pruebas

### Integración contra Postgres real (`tests/integration/db/cierre-dia-filtros-propios.test.ts`)

Base desechable, `describeSiHayBase`, datos que crea el propio test dentro de una transacción
revertida, con una empresa propia (patrón de `cierre-dia-pendiente-pago.test.ts`). Si el catálogo no
está sembrado, **falla** (nunca `if (!fks) return;`). `CierreDiaService` real con
`CierreDiaRepository` real y `reglasPaisFijas()` (Costa Rica, UTC−6).

Los ids se fijan a mano para que el folio se conozca: `<8 hex al azar por corrida>-0000-4000-8000-0000<folio
en minúsculas>`, para no chocar con otra corrida en la misma base. K5 es la excepción: su primer
bloque empieza por `3f2a` (`3f2a<4 hex al azar>-0000-4000-8000-000000000005`).

| Cierre | Mensajero | Estado | `solicitado_at` (UTC) | Hora en CR | Folio |
|---|---|---|---|---|---|
| K1 | M | aprobado | 2026-11-03 06:00 | 03-nov 00:00 | `3F2A0001` |
| K2 | M | rechazado | 2026-11-05 05:59 | 04-nov 23:59 | `A13F2A02` |
| K3 | M | solicitado | 2026-11-05 06:00 | 05-nov 00:00 | `0000BEEF` |
| K4 | M | vencido | 2026-11-03 05:59 | 02-nov 23:59 | `3F2B0004` |
| K5 | M | aprobado | 2026-11-04 12:00 | 04-nov 06:00 | `00000005` («3F2A» en el id, pero fuera del folio) |
| K6 | M2 | aprobado | 2026-11-04 12:00 | 04-nov 06:00 | `3F2A0006` |

Casos, cada uno con `expect(items).toHaveLength(n)` y `total` **antes** de mirar ids:

| # | Filtros | Esperado (ids, en orden) | `total` | R |
|---|---|---|---|---|
| 1 | ninguno (y también sin el parámetro) | K3, K2, K5, K1, K4 | 5 | R173 |
| 2 | `folio: " #3f2a "` | K2, K1 | 2 | R171 (contiene, en cualquier posición, normaliza; K5 y K6 no) |
| 3 | `desde = hasta = 2026-11-04` | K2, K5 | 2 | R169 (23:59 entra; 00:00 del 5 no) |
| 4 | `desde = 2026-11-03` | K3, K2, K5, K1 | 4 | R169 (00:00 del 3 entra; 23:59 del 2 no) |
| 5 | `estados: ["aprobado"]` | K5, K1 | 2 | R170, R172 (K6 no) |
| 6 | `folio: "3F2A"`, `estados: ["rechazado"]`, `desde = hasta = 2026-11-04` | K2 | 1 | R172 (combinados) |
| 7 | `folio: "ZZ"` | — | 0 | R171 (imposible, sin leer) |
| 8 | `estados: ["aprobado"]`, `pageSize: 1` | K5 | 2 | R172 (el total es del conjunto filtrado) |
| 9 | archivo con `estados: ["aprobado"]` | K5, K1 | 2 | R174 |
| 10 | archivo sin filtros | K3, K2, K5, K1, K4 | 5 | R173 |
| 11 | `idsDeCierresPorFolio(M, "3F2A")` | {K1, K2} (no K6) | — | R172 (la lectura a mano también va por mensajero) |

**Mutaciones que deben ponerla en rojo** (a mano, una a una, se ve el rojo, se revierte; se anota
qué caso cae en `progress/impl_SLT-138.md`):

1. Quitar `{ mensajeroId }` del `AND` de `cierresDeMensajeroWhere` → K6 sale en el caso 5.
2. No añadir la condición `id in idsPorFolio` → el caso 2 devuelve 5.
3. Buscar en el `id` entero (`strpos(upper("id"), …)`) → K5 sale en el caso 2.
4. Cambiar `lt` por `lte` en el límite superior → K3 sale en el caso 3. (`filtrosWhere` es del admin:
   la mutación se aplica y se revierte allí; no se commitea nada en ese archivo.)
5. Quitar la condición de `estados` → el caso 5 devuelve 5.
6. Quitar `"mensajero_id" = ${mensajeroId}` de `idsDeCierresPorFolio` → K6 sale en el caso 11.
7. No pasar a mayúsculas en `normalizarFolio` → el caso 2 devuelve 0.
8. Pasar `filtros` a `findCierresByMensajero` sin aplicarlos (`where` de hoy) → el caso 9 devuelve 5.

### Tests unitarios y de componente

| Archivo | Qué prueba |
|---|---|
| `tests/unit/utils/folio-cierre.test.ts` (nuevo) | `normalizarFolio`: recorte, un «#» inicial (no dos), mayúsculas, vacío → ignorar, `G`/`-`/espacio interior → imposible, 9 caracteres → imposible (R171). |
| `tests/unit/actions/cierre-dia-filtros-borde.test.ts` (nuevo) | Las dos acciones con un servicio doble: claves coladas (`mensajeroId` fuera, `mensajeroIds`/`destinoZonaIds`/`otra` dentro), `desde > hasta`, `estados: []`, `estados: ["consolidado"]`, folio de 21 → `validation_error` **sin** llamar al servicio; folio de 20 → pasa. El mismo bloque válido entra en las dos (R168, R170, R171). |
| `tests/unit/services/cierre-dia-pasados-filtros.test.ts` (nuevo) | Con repo doble: sin filtros la llamada al repo es la de hoy (R173); folio imposible → `{items: [], total: 0}` sin llamar al repo (R171); con rango lee la zona y pasa `solicitadoDesde`/`solicitadoHasta`; sin rango no la lee (R169); el folio viaja normalizado; un actor no mensajero → `forbidden` antes de todo. |
| `tests/unit/repositories/historicos-paginados-where.test.ts` | Caso nuevo: con filtros el `where` es `{ AND: [{ mensajeroId }, …] }` en la página y en el archivo, el mismo objeto en `findMany` y `count` (R172). El caso de hoy sin filtros sigue igual (R173). |
| `tests/unit/utils/cola-propia-vista.test.ts` | `aFiltrosPropios` (claves ausentes no viajan; terna con `""`), `opcionesEstadoPropias` (cuatro, con etiqueta, sin `group`), textos nuevos (R176, R177) y el arreglo del test de voseo (abajo) (R180). |
| `tests/components/CierreDiaColaFiltros.test.tsx` (nuevo) | Con la acción simulada: la barra ofrece «Busca por folio», solo «Fecha de solicitud» y «Estado», sin «Bodega», «Mensajero» ni aviso (R167, R177); desde la página 2, cambiar el estado pide la página 1 con `filtros` y la pestaña dice el `total` de la respuesta (R175); escribir un folio pide con `folio` y el campo sigue con el foco y el texto; cero filas con filtro → «Ningún cierre coincide con los filtros.» (R176); «Limpiar todo» vacía campo y filtros y pide `{ page: 1, pageSize }` sin `filtros` (R178); «Descargar» con filtro manda `{ filtros }` (R174). |
| `e2e/cierres-rediseno.spec.ts` | En el escenario A, mensajero A: lee el folio de su fila, escribe 4 caracteres de él → 1 fila; escribe «ZZ» → «Ningún cierre coincide con los filtros.» y «Cierres solicitados 0»; «Limpiar todo» → vuelve la fila (R175, R176, R178). |

**R179** no lleva test nuevo: lo prueban `tests/components/FiltrosCierresBarraEstado.test.tsx`,
`tests/components/CierresAdminFiltros.test.tsx` y `tests/components/CierresAdminPage.test.tsx`, que
**no se tocan** y siguen verdes, y que `FiltrosCierresBarra.tsx` no aparezca en el diff
(`git diff --stat origin/dev`).

### El test de voseo (deuda de la review de SLT-137)

`tests/unit/utils/cola-propia-vista.test.ts:109` usa
`/\b(vos|tenés|podés|querés|hacé|buscá|mirá)\b/i`. En JavaScript, sin la bandera `u`, `\b` no ve la
«á» final como letra: «Buscá por folio» **no** casa y el test sale verde. Esta ficha añade «Busca
por folio», así que lo necesita. Se cambia por límites de letra Unicode:

```ts
const VOSEO = /(?<!\p{L})(vos|tenés|podés|querés|hacé|buscá|mirá|usá)(?!\p{L})/iu;
```

con un control positivo en el mismo test: `expect("Buscá por folio").toMatch(VOSEO)` y
`expect("Usá los filtros").toMatch(VOSEO)`, y uno negativo: `expect("Busca por folio").not.toMatch(VOSEO)`.

## Tests y guardias que pueden cambiar

Censo con Grep (T0.2 lo repite antes de tocar nada):

| Archivo | Por qué |
|---|---|
| `tests/unit/actions/cierre-dia-descarga-action.test.ts` | Su cabecera dice que el archivo «no tiene filtros». Sus asserts siguen valiendo (las claves coladas siguen muriendo; sin entrada, la llamada es solo con el actor). Solo el comentario. |
| `tests/components/descarga/CierresDescarga.test.tsx` | Monta «Descargar» de `/cierre-dia`; `DESCARGA_CIERRES_PASADOS` pasa a ser función. |
| `tests/unit/descarga/censo-tablas.ts`, guardia de ámbitos de columnas | Leen el objeto de descarga por su propiedad `ambitoColumnas:`; se comprueba que la sigan encontrando. |
| `tests/unit/repositories/criterio-unico.guardia.test.ts` | Mira que página y archivo compartan `cierresDeMensajeroWhere`; sigue siendo así, con un parámetro más. |
| `tests/unit/guards/liquidacion-money-safe.test.ts` | Censa los archivos de `components/private/cierres/`; `cola-propia-vista.ts` ya está censado y la barra nueva vive en `app/(app)/cierre-dia/_components/`. Se confirma en T0.2. |

## Verificación de lo que ve el usuario

En Preview, con el mensajero del escenario A de `e2e/cierres-rediseno.spec.ts` (o uno con varios
cierres):
- la barra enseña el campo «Busca por folio» y el botón «Filtros», que ofrece solo «Fecha de
  solicitud» y «Estado»;
- escribir 4 caracteres de un folio deja solo las filas cuyo folio los contiene, y la pestaña dice
  cuántas;
- «Estado» lista Solicitado, Vencido, Aprobado, Rechazado, sin grupos;
- con un filtro que no deja nada sale «Ningún cierre coincide con los filtros.»;
- «Descargar» con un filtro baja solo esas filas;
- `/cierres-admin` sigue con su barra de hoy («Usá los filtros para acotar los cierres» y el aviso).

## Alternativas descartadas

1. **Reusar `FiltrosCierresBarra` con props nuevas** (`conFolio`, `sinAviso`, `sinGrupos`, catálogo
   opcional). La barra del admin la montan tres pantallas y R179 exige que no cambien. La variante
   del mensajero difiere en cinco puntos (buscador activo, sin catálogo, sin bodega ni mensajero,
   estados sin agrupar, sin aviso): cinco ramas más en un archivo de 436 líneas cuyo contrato
   (`FiltrosCierres`, con `mensajeroIds` y `destinoZonaIds`) además no es el de este listado. Una
   barra nueva que compone `BuscadorFiltros` + `FilterComponent` es lo que hacen las demás
   pantallas (`NovedadesFiltrosBarra`, `HistorialAccionesFiltrosBar`) y es lo que pide D4: reutilizar
   el componente común, no escribir un buscador propio.
2. **Folio con `contains` de Prisma sobre el `id`.** Una sola consulta y sin SQL a mano, pero busca en
   los 36 caracteres del uuid: «3F2A» en el primer bloque de K5 lo sacaría y R171 dice «los 8
   caracteres de R156». La mutación 3 existe para que esto no vuelva.
3. **Folio con `endsWith` y comodines `_`** (una condición por posición). Depende de que Prisma no
   escape `_`, que no está documentado como contrato; si un día lo escapa, el filtro devuelve cero en
   silencio.
4. **Columna generada `folio` con índice.** Una sola consulta y nativa de Prisma, pero es una
   migración, y esta ficha no toca el esquema (R72 de SLT-137). Con un conjunto de un mensajero no
   hace falta el índice.
5. **Filtrar en el cliente la página ya leída.** Lo prohíbe R167 (filtrado en el servidor) y daría un
   conteo y un archivo que no casan con lo que se ve.
6. **Usar `filtrosCierresSchema` del admin con `mensajeroIds` ignorado.** Aceptaría claves de alcance
   que R168 obliga a rechazar.

## Dependencias de terceros

Ninguna nueva.
