# SLT-81 — Datos del país: pantalla del superadmin y formularios · design

> Alcance, «Lo que NO entra» y decisiones cerradas: `requirements.md`. Aquí solo el cómo.
> Las referencias `R<n>` son las de `requirements.md`; «SLT-42 R<n>» son las de su spec.

## Lo que ya existe

Buscado el 2026-11-06 con `prefijo`, `tipos de documento`, `zona horaria`, `datos del país`,
`tipo_identificacion` y `supportedValuesOf`, en `feature_list.json` (todos los estados), en
`specs/` y en el código. **El grafo (`codebase-memory-mcp`) no tiene indexado este worktree**
(`list_projects` no lo lista): la búsqueda de código se hizo con Grep/Read.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| SLT-42 «Teléfono, documento y hora por país» (mergeada en `dev`) | `specs/SLT-42-*`, `progress/impl_SLT-42.md` | Es el backend de lectura y validación. Se **reutiliza** entero: columnas `pais.prefijo_telefonico`, `telefono_digitos_nacionales`, `zona_horaria`; catálogo `tipo_identificacion` por país con `clave`, `caracteres`, `largo_min/max`, `orden`, `activo`; `PaisDTO`, `TipoDocumentoDTO`, `IReglasPaisEmpresa` (sin caché entre peticiones), `validarDocumento`, `validarTelefonoDelPais`, `UsuarioService.listarTiposIdentificacion` (ya filtra por país y activos, ya trae `nombre`). SLT-81 no cambia ninguna de sus reglas de validación. |
| Siembra de Costa Rica | `db/migrations/20261107120000_slt42_pais_telefono_y_zona`, `20261107120100_slt42_tipo_documento_por_pais` | La decisión cerrada ya cita estos nombres (corregidos el 2026-11-07: antes `20261106120000` y `120100`, renombradas por SLT-42 al integrar `dev`, `impl_SLT-42.md > Integración de dev`; mismo contenido). SLT-81 no siembra nada (R4). |
| SL-20 «Geografía configurable por país» (`done`) | `app/(app)/plataforma/geografia/`, `lib/actions/geografia-plataforma.ts`, `PaisService`, `PaisRepository`, `historial_plataforma` | Se **amplía**: la sección nueva vive en `GeografiaPlataformaModule`, las actions nuevas van en `geografia-plataforma.ts` (ya en `EXCEPCIONES_DE_PLATAFORMA`, misma puerta `exigirSuperadmin` → zod → servicio en `comoPlataforma`), y el rastro va a `historial_plataforma` con `appendAccionPlataforma`. |
| SLT-46 «Geografía jerárquica: administración de países» (`pending`) | `feature_list.json` | Decisión cerrada: no se espera; SLT-46 se adapta después. SLT-81 no toca la estructura de la pantalla más allá de añadir la sección. |
| SL-35 «Landing pública por empresa con postulación» (`pending`) | `feature_list.json`, `lib/actions/postulacion-mensajero.ts:115-123` | Es quien dará empresa a la postulación pública. Ver §7.3 (decisión del 2026-11-07, R19, R27). |
| `EtiquetasGeograficasProvider` y la cuarta lectura del layout | `app/(app)/layout.tsx:91-112`, `providers/EtiquetasGeograficasProvider.tsx` | El layout ya lee el `PaisDTO` de la empresa (`etiquetasDeEmpresa` → `deLaEmpresa`), que trae el prefijo. Se **reutiliza** esa misma lectura para el prefijo (§7.1): cero consultas nuevas. |
| Guardia `pais-sin-literales` | `tests/unit/guards/_pais-sin-literales-excepciones.ts` | Cuatro excepciones llevan la ficha `SLT-81`. Ninguna es de los cinco formularios. Pasan a SLT-92 (decisión del 2026-11-07, R28, §10). |
| `Combobox` con filtro | `components/ui/combobox.tsx` (ya lo usa «Nuevo país») | Selector de zona con buscador (R8). No hace falta componente nuevo. |
| Libreria de zonas | — | No hay ninguna en el repo y no se añade: `Intl` basta (§5, alternativa 3). |

No apareció ninguna ficha ni código que ya resuelva esto.

## 1. Resumen

1. **Backend de escritura** (§4): `PaisService` gana el alta de país con sus datos, la edición de
   prefijo, dígitos y zona con confirmación por número de empresas, y el alta, edición y
   activación de tipos de documento. Todo con `GESTION_ROLES` (R1). `PaisRepository` escribe en
   `comoPlataforma` y deja rastro en `historial_plataforma` en la misma transacción (R6, R17).
2. **Una migración** (§2): solo valores nuevos de los enums del historial de plataforma. Ninguna
   tabla ni columna nueva.
3. **Pantalla** (§6): sección «Datos del país» en `/plataforma/geografia`, debajo del selector de
   país; «Nuevo país» pide los datos nuevos.
4. **Formularios** (§7): el prefijo baja por un proveedor nuevo desde la lectura que el layout ya
   hace; los tipos salen de las lecturas que ya filtran por país.

## 2. Modelo de datos

**No hay tabla ni columna nueva.** `pais` y `tipo_identificacion` ya tienen todo (SLT-42 §2). Son
tablas de plataforma (sin `organizacion_id`, en `MODELOS_DE_PLATAFORMA`). Su seguridad no cambia:
`pais_lectura`, `tipo_identificacion_lectura` + `tipo_identificacion_del_pais` (restrictiva) y
`REVOKE INSERT, UPDATE, DELETE … FROM servi_app`. Una empresa recibe `42501` si intenta escribirlas
(SLT-42 R4); el superadmin escribe como dueño dentro de `comoPlataforma`.

Las columnas de `pais` siguen `NULL`-ables a propósito: los países dados de alta antes de SLT-81
pueden estar incompletos (R3) y la pantalla es la que los completa. La obligatoriedad del alta
nueva (R5) vive en el servicio.

### 2.1 Migración `20261108120000_slt81_historial_datos_pais`

```sql
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'pais_datos_cambiados';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_creado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_editado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_activado';
ALTER TYPE "historial_plataforma_accion" ADD VALUE IF NOT EXISTS 'tipo_documento_desactivado';
ALTER TYPE "historial_plataforma_entidad" ADD VALUE IF NOT EXISTS 'tipo_documento';
```

- Nada en la migración usa los valores (Postgres lo prohíbe en la misma transacción, `55P04`;
  mismo criterio que `20261026130500_pais_disponible`).
- **`down.sql`**: patrón de `20261026130500_pais_disponible/down.sql`. Si alguna fila de
  `historial_plataforma` usa uno de los seis valores, `RAISE EXCEPTION` y no cambia nada (es el
  rastro del superadmin). Si no, recrea cada enum desde `pg_enum` menos esos valores.
- `db/schema.prisma`: los seis valores en `HistorialPlataformaAccion` y `HistorialPlataformaEntidad`,
  y el comentario de `detalle` deja de decir «solo `division_cargada`».
- Antes de crear la migración, el implementer mira la mayor de `dev`: si hay una posterior a
  `20261107120200`, va detrás de ella.

### 2.2 `detalle` del historial (sin PII)

| Acción | `entidad_tipo` / `entidad_id` | `detalle` |
|---|---|---|
| `pais_creado` (ya existe) | `pais` / id | sin cambio; los tipos del alta dejan además una fila `tipo_documento_creado` cada uno |
| `pais_datos_cambiados` | `pais` / id | `{ antes: { prefijo, digitos, zona }, despues: { … }, empresas: N }` |
| `tipo_documento_creado` | `tipo_documento` / id del tipo | `{ clave, caracteres, largoMin, largoMax }` |
| `tipo_documento_editado` | `tipo_documento` / id | `{ antes: { nombre, caracteres, largoMin, largoMax }, despues: { … } }` |
| `tipo_documento_activado` / `_desactivado` | `tipo_documento` / id | sin detalle |

`entidad_etiqueta` = nombre del país o del tipo; `pais_id` = el país. Un guardado sin cambios no
escribe fila (R17), igual que `cambiarDisponible` de SL-20.

### 2.3 Datos que dependen del país y de dónde salen

| Dato | Fuente | Quién lo lee en SLT-81 |
|---|---|---|
| Prefijo, dígitos nacionales | `pais.prefijo_telefonico`, `pais.telefono_digitos_nacionales` | layout → `PaisDeLaEmpresaProvider` (§7.1); `/plataforma/empresas` (§7.4); postulación (§7.3) |
| Tipos de documento | `tipo_identificacion` (por `pais_id`, `activo`, `orden`) | `UsuarioService.listarTiposIdentificacion` (ya existe), `PaisRepository.listarDisponiblesParaAlta` y `listarTiposDocumento` (nuevos) |
| Zona horaria | `pais.zona_horaria` | Solo la pantalla del superadmin la escribe; la leen los servicios de SLT-42 sin cambios |
| Lista de zonas válidas | `Intl.supportedValuesOf("timeZone")` en el servidor + `pg_timezone_names` (§5, decidido el 2026-11-07) | la página de Geografía (props) y `PaisService` (validación) |
| Moneda, impuestos, métodos de pago | — | Fuera (SL-21, SL-22) |

## 3. Autorización y módulos

- **Dónde se valida (R1).** Dos puertas, como el resto de SL-20:
  1. la action: `puerta()` de `lib/actions/geografia-plataforma.ts` (`resolveActorFromSession` →
     `unauthenticated`; `exigirSuperadmin` → `forbidden`), antes de validar nada;
  2. el servicio: cada método nuevo de `PaisService` empieza con
     `if (!GESTION_ROLES.has(actor.rol)) return { status: "forbidden" }` (`GESTION_ROLES =
     ROLES_PLATAFORMA`, por import, por la guardia `superadmin-fuera-de-empresa`).
  Los tests de R1 prueban las dos: servicio con un actor `maestro` (sin llamar al repositorio) y
  action sin sesión y con rol de empresa.
- **La base** es la tercera red: `REVOKE` a `servi_app` (SLT-42 R4).
- **Lecturas de los formularios**: las de siempre. `listarTiposIdentificacion` sigue siendo del
  `maestro`; `/plataforma/empresas` sigue con `notFound()` para roles de empresa.
- **Módulos**: todo es núcleo. Sin puerta de módulo ni entrada nueva en `lib/modulos/reparto.ts`
  (las rutas ya están repartidas).

## 4. Backend

### 4.1 Tipos y schemas (`lib/types/pais.ts`)

```ts
export const PREFIJO_TELEFONICO = /^[1-9]\d{0,2}$/;          // = CHECK pais_prefijo_telefonico_formato
export const DIGITOS_NACIONALES_MIN = 4, DIGITOS_NACIONALES_MAX = 14;   // = CHECK pais_telefono_digitos_rango
export const DOCUMENTO_LARGO_MAX = 30;                       // = CHECK tipo_identificacion_largos
export const TIPOS_EN_ALTA_MAX = 10;                         // tope de entrada del alta (anti-abuso, no regla de negocio)

const tipoDocumentoNuevoSchema = z.object({
  nombre: nombrePaisSchema,                                  // mismo recorte y cotas que los niveles (2..40)
  caracteres: z.enum(["digitos", "alfanumerico"]),
  largoMin: z.number().int().min(1).max(DOCUMENTO_LARGO_MAX),
  largoMax: z.number().int().min(1).max(DOCUMENTO_LARGO_MAX),
}).strict().refine((t) => t.largoMin <= t.largoMax, { path: ["largoMax"], message: "…" });   // R9

const datosTelefonoYZona = {
  prefijoTelefonico: z.string().trim().regex(PREFIJO_TELEFONICO, "…"),                       // R7 (el oficial lo mira el servicio, R26)
  telefonoDigitosNacionales: z.number().int().min(DIGITOS_NACIONALES_MIN).max(DIGITOS_NACIONALES_MAX), // R7
  zonaHoraria: z.string().trim().min(1),             // la lista válida la mira el servicio (R8, §5)
};

export const crearPaisSchema = z.object({
  id: …, nivel1Singular: …, /* … los seis de SL-20 … */
  ...datosTelefonoYZona,
  tiposDocumento: z.array(tipoDocumentoNuevoSchema).min(1).max(TIPOS_EN_ALTA_MAX),          // R5
}).strict();

export const actualizarDatosPaisSchema = z.object({
  id: z.string().regex(CODIGO_PAIS),
  ...datosTelefonoYZona,
  /** R10: el número de empresas que el superadmin vio y confirmó. Ausente = aún no confirmó. */
  empresasConfirmadas: z.number().int().min(0).optional(),
}).strict();

export const crearTipoDocumentoSchema = tipoDocumentoNuevoSchema.and(z.object({ paisId: z.string().regex(CODIGO_PAIS) }));
export const editarTipoDocumentoSchema = tipoDocumentoNuevoSchema.and(z.object({ id: z.string().uuid() }));
export const cambiarActivoTipoDocumentoSchema = z.object({ id: z.string().uuid(), activo: z.boolean() }).strict();

/** Lo que el alta de empresa necesita de cada país disponible (R20). */
export interface PaisParaAltaDTO {
  id: string; nombre: string;
  prefijoTelefonico: string | null;
  tiposDocumento: { id: string; value: string; nombre: string }[];   // solo activos, por `orden`
}
```

Los mensajes de error son textos en español en el schema, como los de SL-20. El nombre del tipo se
compara con `normalizeName` (R9), como el del país.

### 4.2 `PaisService` (contratos)

| Método | Entrada | Resultado |
|---|---|---|
| `crear(input, actor)` (se amplía) | `crearPaisSchema` | `ok {pais}` · `validation_error` (también `zonaHoraria` fuera de la lista, R8; `prefijoTelefonico` distinto del oficial, R26; dos tipos con el mismo nombre normalizado → `tiposDocumento.<i>.nombre`) · `conflict {campo: "id" \| "nombre"}` · `forbidden` |
| `actualizarDatos(input, actor)` | `actualizarDatosPaisSchema` | `ok {pais, cambiado: boolean}` · `requiere_confirmacion {empresas: N}` (R10) · `validation_error` (R7, R8, R26) · `not_found` · `forbidden` |
| `listarTiposDocumento(paisId, actor)` | código ISO | `ok {tipos: TipoDocumentoDTO[]}` (todos, activos e inactivos, por `orden`; R2) · `forbidden` |
| `crearTipoDocumento(input, actor)` | `crearTipoDocumentoSchema` | `ok {tipo}` · `validation_error` · `conflict {campo: "nombre"}` · `not_found` (país) · `forbidden` |
| `editarTipoDocumento(input, actor)` | `editarTipoDocumentoSchema` | `ok {tipo, cambiado}` · `validation_error` · `conflict {campo: "nombre"}` · `not_found` · `forbidden` |
| `cambiarActivoTipoDocumento(input, actor)` | `cambiarActivoTipoDocumentoSchema` | `ok {tipo}` · `validation_error {activo: ["…único tipo activo…"]}` (R15) · `not_found` · `forbidden` |
| `listarDisponiblesParaAlta(actor)` | — | `ok {paises: PaisParaAltaDTO[]}` · `forbidden` |

Reglas del servicio:
- **R26 — prefijo oficial.** `crear` y `actualizarDatos`, después de zod y antes de tocar el
  repositorio, exigen `isSupportedCountry(id)` y `prefijoTelefonico === getCountryCallingCode(id)`
  (libphonenumber-js, ya aprobada; helper puro `prefijoOficial(paisId): string | null` en
  `lib/utils/prefijo-oficial.ts`). Si no, `validation_error` en `prefijoTelefonico` con el texto
  «El prefijo de <país> es +<oficial>» (o «No hay prefijo oficial conocido para este país»). Se
  comprueba siempre, también si el prefijo no cambia: así un prefijo mal guardado antes de SLT-81
  se corrige en la primera edición.
- **R10/R11 — confirmación.** `actualizarDatos` lee el país; si ninguno de los tres valores cambia,
  `ok` sin escribir. Si cambia alguno, cuenta las empresas del país (`repo.contarEmpresas`). Con
  `N > 0` y `empresasConfirmadas !== N`, devuelve `requiere_confirmacion {empresas: N}` sin
  escribir. Usar el número como prueba de confirmación hace que, si entre la pregunta y el «sí»
  nace una empresa, se vuelva a preguntar con el número nuevo. La carrera que queda (una empresa
  que nace entre el conteo y el `UPDATE`) es aceptable: rige desde el cambio igual para ella.
- **Clave y `value` de un tipo nuevo.** `clave` = el nombre con `normalizeName`, todo lo que no sea
  `[a-z0-9]` pasado a `_` y sin `_` en los extremos (`"Cédula de residencia"` →
  `cedula_de_residencia`). `value` = `<paisId>_<clave>` (convención de SLT-42 §2.2 para países
  nuevos). `orden` = el mayor del país + 1. La clave y el `value` **no cambian al renombrar**: son
  la identidad del tipo. Los cinco de CR conservan su `value` histórico (`cedula`, `ruc`, …).
- **R15.** Desactivar pide al repositorio que lo haga solo si queda otro activo (§4.3).
- **R12/R14 — nada se recalcula.** Ningún método toca `usuario`, `orden`, `postulacion` ni ninguna
  tabla de negocio. La validación de documentos y teléfonos sigue en SLT-42 sin cambios: lee el
  catálogo en cada petición (`IReglasPaisEmpresa` no cachea entre peticiones, SLT-42 R30), así que
  la regla nueva rige desde la siguiente petición.

### 4.3 `IPaisRepository` / `PaisRepository` (métodos nuevos o ampliados)

| Método | Qué hace |
|---|---|
| `crear(datos, actor)` | En **una** `$transaction`: `pais.create` con los tres datos, `tipoIdentificacion.createMany` de los tipos, `pais_creado` + un `tipo_documento_creado` por tipo. Un `P2002` del país → `duplicado` como hoy; uno de `tipo_identificacion_pais_clave_key` o de `value` → `duplicado {campo: "tiposDocumento"}` (R6). |
| `actualizarDatos(id, datos, actor)` | Transacción: lee la fila (`antes`), `updateMany` con `WHERE` de «alguno distinto» y, solo si cambió, `pais_datos_cambiados` con `antes`, `despues` y `empresas`. Devuelve `no_existe` \| `sin_cambio` \| `cambiado`. |
| `contarEmpresas(paisId)` | `organizacion.count({ where: { paisId } })`. Corre en `comoPlataforma` (la pone la action): la RLS de `organizacion` en contexto de empresa solo dejaría ver la propia. |
| `listarTiposDocumento(paisId)` | Todos los del país, por `orden`, como `TipoDocumentoDTO`. |
| `crearTipoDocumento(datos, actor)` | `create` + `tipo_documento_creado`, en transacción. `P2002` → `duplicado`. |
| `editarTipoDocumento(id, datos, actor)` | Igual que `actualizarDatos`, con `tipo_documento_editado`. Solo `nombre`, `caracteres`, `largoMin`, `largoMax`. |
| `cambiarActivoTipoDocumento(id, activo, actor)` | Transacción que **bloquea la fila del país** (`SELECT … FROM pais WHERE id = $1 FOR UPDATE`, con `$queryRaw` parametrizado) antes de contar los activos: así dos desactivaciones a la vez no dejan el país sin tipos (R15). Devuelve `no_existe` \| `sin_cambio` \| `ultimo_activo` \| `cambiado`. |
| `listarDisponiblesParaAlta()` | `pais.findMany({ where: { disponible: true }, include tipos activos por orden })` → `PaisParaAltaDTO[]`. |
| `zonaConocidaPorLaBase(zona)` | §5 (decidido el 2026-11-07): `SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1)`. |

Las dos sentencias a mano (`FOR UPDATE` y `pg_timezone_names`) no tocan tablas de negocio; el
implementer corre `sql-a-mano-por-empresa.guardia` y, si las marca, decide con el leader antes de
añadir una excepción.

`listTiposIdentificacion()` sin argumento de `UserRepository` deja de usarse en
`/plataforma/empresas` (§7.4). Se queda (lo usan tests), sin cambio.

### 4.4 Actions (`lib/actions/geografia-plataforma.ts`)

Mismo orden que las de SL-20: `puerta` → zod (o el servicio, si el schema vive allí) → servicio
dentro de `enPlataforma` → `registrarFallo` ante un error de base (`{ status: "error" }`).

`actualizarDatosPaisAction`, `listarTiposDocumentoAction({ paisId })`,
`crearTipoDocumentoAction`, `editarTipoDocumentoAction`, `cambiarActivoTipoDocumentoAction`.
`crearPaisAction` no cambia de firma: la entrada nueva la valida el servicio.

`lib/actions/_shared/paises-plataforma.ts` gana `listarPaisesParaAlta(actor)` (misma forma que
`listarPaisesDisponibles`), que llama a `PaisService.listarDisponiblesParaAlta`.

## 5. Zona horaria y prefijo (decididos el 2026-11-07)

**Zonas (R8).** Lista del runtime, no fija versionada:

- `lib/utils/zonas-iana.ts` (puro): `zonasIana(): readonly string[]` =
  `Intl.supportedValuesOf("timeZone")` ordenada, memorizada por proceso; `esZonaIana(z)`. Sin
  dependencia nueva (`tsconfig` ya tiene `lib: esnext`; Node la trae con ICU completo, la misma que
  usa `calendario-zona.ts`).
- La lista se calcula **en el servidor** y baja por props a la pantalla (`page.tsx` →
  `GeografiaPlataformaModule`). Así lo que ofrece el selector y lo que acepta el servidor salen del
  mismo runtime, aunque el navegador tenga otra versión de tzdata.
- Al guardar, `PaisService` exige `esZonaIana(z)` **y** `repo.zonaConocidaPorLaBase(z)`. La segunda
  cubre el riesgo que dejó SLT-42: la base no tiene `CHECK` porque Postgres y Node traen tzdata
  distinta, y los repositorios que agrupan por día usan `AT TIME ZONE $zona`
  (`impl_SLT-42.md > Errores nuevos`, «Zona IANA mal escrita»). Con las dos, una zona guardada
  sirve en los dos sitios. Si falla cualquiera, `validation_error` en `zonaHoraria` (R8).
- La alternativa (lista fija versionada) está en §9.

**Prefijo (R26).** El servidor de la página de Geografía calcula con `prefijoOficial(paisId)`
(§4.2; `getCountryCallingCode` de libphonenumber-js, ya aprobada, solo en el servidor) un mapa
`código ISO → prefijo oficial | null` para los países del catálogo ISO y lo pasa por props.
«Nuevo país» y el modal de edición cargan el prefijo oficial del país elegido (en edición, aunque
el guardado sea otro: el aviso «El prefijo guardado (+X) no es el oficial (+Y)» explica el
cambio). El campo se puede tocar, pero **el servidor rechaza** todo prefijo distinto del oficial
(R26). Si libphonenumber no conoce el país (mapa en `null`), «Nuevo país» no lo ofrece y el
servidor lo rechaza (decisión del 2026-11-07, `requirements.md > Decisiones cerradas`).

## 6. Pantalla «Datos del país» (`/plataforma/geografia`)

- **`page.tsx`**: además de lo de hoy, lee `listarTiposDocumentoAction({ paisId })` para el país
  elegido (en el mismo punto que el árbol) y calcula `zonasIana()` y el mapa de prefijos oficiales.
  Un fallo de lectura de tipos baja como bandera (`tiposError`), igual que `divisionError`.
- **`GeografiaPlataformaModule`**: entre la sección «País» y la carga CSV, una sección nueva
  `DatosDelPais` (componente propio en `_components/DatosDelPais.tsx`):
  - **Lectura (R2, R3):** prefijo (`+506`), dígitos, zona y una tabla de tipos (nombre,
    «Solo dígitos»/«Letras y dígitos», largo «9» o «11 a 12», estado). Si el país no está completo,
    un `Alert` «Datos incompletos: falta …» que enumera lo que falta (R3).
  - **Editar teléfono y hora:** un `Modal` con prefijo (cargado con el oficial, R26), dígitos y el `Combobox` de zonas. Al
    guardar, si la action responde `requiere_confirmacion`, un segundo paso del mismo modal dice
    «Este cambio afecta a N empresas de <país>. Rige desde ahora; lo ya guardado no cambia.» y
    reenvía con `empresasConfirmadas: N` (R10).
  - **Tipos:** «Nuevo tipo» y «Editar» abren el mismo `Modal` (nombre, caracteres, largo mínimo y
    máximo). La fila tiene un `Switch` «Activo» (R13, R15: si el servidor rechaza, el switch vuelve
    a su estado y se muestra el mensaje). No hay botón de borrar (R13).
- **«Nuevo país» (`NuevoPaisDialog`, R5, R26):** gana prefijo (cargado con el oficial al elegir el país, §5), dígitos, zona
  (`Combobox`) y una lista editable de tipos con al menos una fila. Los errores por campo vienen del
  servidor con las claves de zod (`tiposDocumento.0.nombre`).
- Textos de nivel geográfico: los de siempre (`etiquetasDePais`). Esta sección no pinta niveles.

## 7. Formularios

### 7.1 El prefijo de la empresa en el portal

`app/(app)/layout.tsx` ya resuelve, para un actor con empresa, `construirPaisService()
.etiquetasDeEmpresa(organizacionId)`, que lee el `PaisDTO` entero. Se cambia por
`paisDeLaEmpresaParaUi(organizacionId)` → `{ etiquetas, telefono: { prefijo, digitosNacionales } | null }`
(una sola lectura, la misma de hoy). `telefono` es `null` si falta prefijo o dígitos. Con el
superadmin o sin empresa: `ETIQUETAS_NEUTRAS` y `telefono: null`, sin consulta, como hoy.

- Proveedor nuevo `providers/PaisDeLaEmpresaProvider.tsx` y hook `hooks/use-telefono-del-pais.ts`
  (`useTelefonoDelPais(): { prefijo, digitosNacionales } | null`), montado junto a
  `EtiquetasGeograficasProvider`. Ese proveedor no cambia: lo vigila
  `etiquetas-geograficas-sin-literal.guardia`.
- Componente compartido `components/shared/PrefijoTelefonico.tsx`: el adorno `+<prefijo>` delante
  del `Input` del teléfono, o, con `null`, el aviso de R23 («El país de la empresa no tiene prefijo
  telefónico cargado»). Lo usan cuatro de los cinco formularios (regla de `components/shared/`:
  dos o más features).

### 7.2 Usuario (alta y edición, `UsuarioForm.tsx`) — R16, R18

- Prefijo: `useTelefonoDelPais()` + `PrefijoTelefonico`.
- Tipos: `listarTiposIdentificacion` ya devuelve solo los activos del país, por `orden`, con
  `nombre`. La etiqueta pasa de `t.value` a `t.nombre`.
- R16: en edición, si `usuario.tipoIdentificacionId` no está en la lista, se añade una opción
  deshabilitada con su nombre (mismo patrón que el rol `apiKey` en ese archivo). Para tener su
  nombre, `UsuarioPublico` (o el DTO de edición) gana `tipoIdentificacionNombre`; el implementer
  confirma de dónde lo saca el repositorio.

### 7.3 Postulación pública — R19, R27 (decisión del 2026-11-07, «Preparar + aviso»)

**Hallazgo.** El código no resuelve la empresa: la página no tiene empresa en el contexto, lista
`prisma.tipoIdentificacion.findMany()` (los tipos de **todos** los países, con etiquetas fijas
`cedula`/`ruc`/`pasaporte`), y la action rechaza con `error` toda postulación sin empresa en el
contexto, a la espera de SL-35.

**Diseño:**
1. **Con empresa en el contexto (R19)** (`contextoActual()?.tipo === "empresa"`, como la action):
   la página lee el país con `PaisRepository.deLaEmpresa` y los tipos con
   `UserRepository.listTiposIdentificacion(paisId)` (activos, por `orden`), y pasa `prefijo` y
   `tipos` (por `nombre`) a `PostulacionForm`. Es lo que usará SL-35 sin más cambios.
2. **Sin empresa (R27, hoy siempre):** la página no consulta tipos ni país y, en lugar de
   `PostulacionForm`, pinta un aviso con el texto «La postulación se abre desde la página de una
   empresa». La action no cambia (sigue rechazando sin empresa: segunda red).

R24 obliga a quitar `TIPO_IDENTIFICACION_LABELS` y el `findMany()` sin filtro.

### 7.4 Alta de empresa (`/plataforma/empresas`) — R20

- `page.tsx` cambia `listarPaisesDisponibles(actor)` + `listTiposIdentificacion()` por
  `listarPaisesParaAlta(actor)` (§4.4). `EmpresasModule` recibe `paises: PaisParaAltaDTO[]` y deja
  de recibir `tiposDocumento`.
- Al elegir país: el adorno del teléfono del maestro muestra `+<prefijo>` (o el aviso de R23) y el
  `Select` de tipo ofrece solo `pais.tiposDocumento`; al cambiar de país, `tipoDocumento` vuelve a
  `""`. Sin país elegido, el `Select` de tipo está deshabilitado.
- La opción sigue enviando `value` (lo acepta `tipoDocumentoDelPais` por `id` o por `value`).
- El servidor no cambia: ya valida con el país elegido (SLT-42 R6, R10, R11, R14).

### 7.5 Corregir datos del cliente (`CorregirDatosClienteModal.tsx`) — R21

Solo el adorno del prefijo con `useTelefonoDelPais()`. Sin validación nueva en el cliente ni en el
servidor (SLT-42 R14, P8). Los textos y la guardia `corregir-datos-sin-rastro` no cambian.

### 7.6 Destinatarios de WhatsApp (`DestinatariosField.tsx`) — R22

El aviso «N personas no lo van a recibir: su teléfono no sirve para WhatsApp» añade la regla:
«En <país> el número es +<prefijo> seguido de <n> dígitos.» con `useTelefonoDelPais()`. Con `null`,
el aviso de R23. El enmascarado (`•••• 7777`) no cambia.

### 7.7 Guardia de R24

`tests/unit/guards/formularios-pais-sin-literales.guardia.test.ts`: lee los cinco formularios,
`app/postulacion/page.tsx` y `components/shared/PrefijoTelefonico.tsx`, sin comentarios, y falla
si encuentra `506`, `TIPO_IDENTIFICACION_LABELS` o un literal `"cedula"`, `"ruc"` o `"pasaporte"`.

## 8. Efectos de un cambio (R12)

- **Prefijo o dígitos:** la normalización de WhatsApp (SLT-42 R18–R20) usa el valor nuevo desde la
  siguiente petición. Las claves de hilos ya guardadas no se recalculan. La validación de teléfonos
  de personas **no** depende del prefijo guardado: usa `pais.id` como región de libphonenumber.
- **Zona:** todo cálculo de «hoy» usa la nueva desde la siguiente petición. Los jobs diarios
  (`serie-diaria-por-zona.ts`) toman la zona nueva en su siguiente agendado: la corrida ya
  pendiente con la zona vieja no procesa a esas empresas, y si la zona nueva ya pasó su hora
  objetivo ese día, ese día la empresa no corre los jobs diarios. Es un efecto de «rige desde el
  cambio» y va en el texto de la confirmación de §6 solo como «rige desde ahora»; si el humano lo
  quiere cubrir, es una ficha aparte. Los crons de Vercel no cambian (deuda D57 de SLT-42).
- **Formato de un tipo:** rige en la siguiente alta o cambio de tipo (R14); `UsuarioService.editar`
  ya no revalida si el tipo no cambia (SLT-42 R9).

## 9. Alternativas descartadas

1. **Lista fija versionada de zonas IANA** (un `lib/constants/zonas-iana.ts` como el catálogo ISO).
   Es estable y se puede revisar en un PR, pero envejece con cada versión de tzdata y aun así no
   garantiza que Postgres la conozca. La del runtime más la comprobación en la base (§5) cubre los
   dos lados sin mantener una lista.
2. **Confirmación solo en el cliente** (el modal cuenta las empresas y el servidor guarda sin
   preguntar). Más simple, pero un cliente viejo o una llamada directa a la action cambiarían la
   zona de N empresas sin confirmación. Con `empresasConfirmadas` el servidor la exige (R10) y el
   test es de servicio.
3. **`date-fns-tz`, `luxon` o `@vvo/tzdb` para la lista de zonas.** Dependencia nueva para lo que
   `Intl.supportedValuesOf` ya da. Descartada (regla 7).
4. **Una action por formulario para leer el prefijo** (SWR, como `listarTiposIdentificacion`).
   Tres viajes más por pantalla para un dato que el layout ya leyó. El proveedor (§7.1) no añade
   consultas.
5. **Ampliar `EtiquetasGeograficasProvider` con el prefijo.** Un solo proveedor, pero mezcla dos
   datos con guardias y consumidores distintos y obliga a tocar sus 29 consumidores. Proveedor
   aparte.
6. **Pantalla propia `/plataforma/paises`.** Descartada por decisión cerrada («dentro de
   Plataforma › Geografía»); además la reordenación de países es de SLT-46.
7. **Clave del tipo tecleada por el superadmin.** Un campo técnico más y una fuente de errores;
   derivarla del nombre basta, y el único `(pais_id, clave)` frena la carrera.
8. **Sugerir el prefijo oficial sin rechazar otro** (la propuesta inicial de §5). Deja pasar un
   prefijo mal escrito que solo se nota al fallar la normalización de WhatsApp. Descartada por
   decisión del 2026-11-07 (R26).
9. **Dejar el formulario de postulación como hoy hasta SL-35.** El visitante rellena todo y recibe
   «no se pudo enviar»; además lista tipos de todos los países. Descartada por decisión del
   2026-11-07 (R27).

## 10. Fuera de SLT-81: las excepciones pasan a SLT-92 (decisión del 2026-11-07, R28)

Las cuatro excepciones de `pais-sin-literales` con ficha `SLT-81` (`fecha-cr.ts`, `hora-cr.ts`,
`separador-dia-cr.ts`, `telefono-cr.ts`) no son de los cinco formularios: son fechas en pantalla
(~50 archivos de UI) y los botones de contacto y el chat. No entran en SLT-81: las retira SLT-92
«Pantallas: fechas y teléfonos en la zona y el prefijo del país de la empresa».

SLT-81 solo cambia la ficha (T0.1):
- `tests/unit/guards/_pais-sin-literales-excepciones.ts`: `FichaQueLoRetira` cambia `"SLT-81"` por
  `"SLT-92"` (el resto de keys, las que traiga `dev` al rebasar, no se tocan) y las cuatro entradas
  pasan a `ficha: "SLT-92"`; archivo, motivo y orden iguales. El tope de la lista no cambia.
- `tests/unit/guards/pais-sin-literales.guardia.test.ts`: la lista de fichas aceptadas del caso «cada
  excepcion trae ficha …» y su comentario de cabecera cambian `SLT-81` por `SLT-92`. Con eso una
  excepción nueva a nombre de SLT-81 no compila ni pasa (R28).

## 11. Mapa R → test

| R | Test |
|---|---|
| R1 | `tests/unit/services/pais-service-datos.test.ts` («R1: un maestro recibe forbidden en cada método nuevo y el repositorio no se llama»); `tests/unit/actions/geografia-plataforma-action.test.ts` (casos nuevos: sin sesión → `unauthenticated`, rol de empresa → `forbidden`, sin construir el servicio) |
| R2, R3 | `tests/components/GeografiaDatosDelPais.test.tsx` (muestra los cuatro datos e inactivos; país sin zona y sin tipos activos → «Datos incompletos: falta zona horaria, tipo de documento activo») |
| R4 | `tests/integration/db/pais-datos-plataforma.test.ts` («R4: CR llega completo: 506, 8, America/Costa_Rica y cinco tipos activos», sobre la base migrada, por `listarTiposDocumento` y `porId`) |
| R5 | `pais-service-datos.test.ts` («R5: falta prefijo / dígitos / zona / tipos → validation_error en ese campo, sin llamar a crear»); `tests/components/GeografiaPlataformaAltaPais.test.tsx` (los campos nuevos y sus errores) |
| R6 | `pais-datos-plataforma.test.ts` («R6: un tipo con clave repetida tumba el alta: ni país ni tipos») |
| R7 | `pais-service-datos.test.ts` (tabla: prefijo `0506`, `+506`, `5066`, `''`; dígitos 3, 15, 8.5) |
| R8 | `tests/unit/utils/zonas-iana.test.ts` (la lista contiene `America/Costa_Rica`, no contiene `Mars/Olympus`, ordenada); `pais-service-datos.test.ts` («R8: zona fuera de la lista → validation_error»; «zona que la base no conoce → validation_error»); `pais-datos-plataforma.test.ts` (`zonaConocidaPorLaBase`); `GeografiaDatosDelPais.test.tsx` (el `Combobox` filtra por texto y solo ofrece las de la lista) |
| R9 | `pais-service-datos.test.ts` (sin nombre, caracteres desconocidos, mínimo > máximo, máximo 31 → validation_error; «Cédula  Física» contra «cedula fisica» → conflict nombre) |
| R10 | `pais-service-datos.test.ts` («R10: con 3 empresas y sin confirmar → requiere_confirmacion {empresas: 3} y no escribe»; «confirmando 2 cuando son 3 → vuelve a pedir»; «confirmando 3 → guarda»); `GeografiaDatosDelPais.test.tsx` (el segundo paso dice «afecta a 3 empresas» y reenvía con 3) |
| R11 | `pais-service-datos.test.ts` («R11: país sin empresas guarda sin confirmación») |
| R12 | `pais-datos-plataforma.test.ts` («R12: tras cambiar la zona de `PA` (sembrado por el test con prefijo `507`, porque R26 rechaza los `XA`–`XZ`), `ReglasPaisEmpresaService` en una empresa de `PA` devuelve la nueva; la foto de `usuario`, `orden` y `chat_conversacion` de esa empresa es idéntica antes y después») |
| R13 | `pais-service-datos.test.ts` (alta de tipo en país existente con `value` `XA_<clave>`, edición, activar/desactivar); `GeografiaDatosDelPais.test.tsx` («no hay acción de borrar»); `tests/unit/guards/tipos-documento-sin-borrado.guardia.test.ts` (nada en `lib/` llama a `tipoIdentificacion.delete`/`deleteMany`) |
| R14 | `tests/integration/db/pais-datos-plataforma.test.ts` («R14: tras cambiar el largo del tipo, un usuario guardado con el formato viejo sigue igual y se edita sin revalidar; un alta nueva exige el nuevo», por `UsuarioService` con reglas reales) |
| R15 | `pais-service-datos.test.ts` («R15: desactivar el único activo → validation_error»); `pais-datos-plataforma.test.ts` («R15: dos desactivaciones a la vez de los dos últimos activos dejan uno activo») |
| R16 | `pais-datos-plataforma.test.ts` («R16: desactivar no cambia `usuario.tipo_identificacion_id`»); `tests/unit/components/usuario-form.test.tsx` («R16: el tipo inactivo del usuario se muestra deshabilitado como valor actual») |
| R17 | `pais-datos-plataforma.test.ts` (una fila por acción con actor y `detalle`; guardado sin cambios → 0 filas; si el historial falla, el cambio no queda) |
| R18 | `tests/unit/components/usuario-form.test.tsx` («R18: muestra +<prefijo> del proveedor y los tipos por nombre en el orden recibido») |
| R19 | `tests/integration/postulacion-page.test.tsx` («R19: dentro de `conEmpresa` de una empresa de XA, el formulario recibe el prefijo de XA y solo sus tipos activos»); `tests/components/PostulacionForm.test.tsx` (pinta el prefijo) |
| R20 | `tests/components/empresas-module.test.tsx` («R20: al elegir XA muestra +<prefijo de XA> y solo sus tipos; al pasar a CR el tipo elegido se vacía») |
| R21 | `tests/components/CorregirDatosCliente.ordenes.test.tsx` («R21: el teléfono lleva el prefijo del país») |
| R22 | `tests/components/DestinatariosField.test.tsx` (nuevo: «R22: el aviso dice +<prefijo> y <n> dígitos») |
| R23 | `tests/components/PrefijoTelefonico.test.tsx` («R23: sin prefijo, aviso y ningún prefijo»); un caso en `usuario-form.test.tsx` con el proveedor en `null` |
| R24 | `tests/unit/guards/formularios-pais-sin-literales.guardia.test.ts` |
| R25 | `e2e/datos-pais-superadmin.spec.ts` (proyecto `aislamiento`) |
| R26 | `tests/unit/utils/prefijo-oficial.test.ts` (`CR` → `506`, `PA` → `507`, `XA` → `null`); `pais-service-datos.test.ts` («R26: alta de `PA` con `506` → validation_error en prefijoTelefonico y no llama a crear»; «editar `PA` con `5070` o `508` → validation_error»; «`XA` → validation_error, sin prefijo oficial»; «`PA` con `507` → ok»); `GeografiaPlataformaAltaPais.test.tsx` y `GeografiaDatosDelPais.test.tsx` («R26: al elegir el país el prefijo aparece cargado con el oficial») |
| R27 | `tests/integration/postulacion-page.test.tsx` («R27: sin empresa en el contexto la página dice "La postulación se abre desde la página de una empresa", no pinta el formulario ni lista tipos») |
| R28 | `tests/unit/guards/pais-sin-literales.guardia.test.ts` (el caso de fichas aceptadas ya no admite `SLT-81`; ninguna entrada de `_pais-sin-literales-excepciones.ts` la lleva y las cuatro de `fecha-cr`, `hora-cr`, `separador-dia-cr`, `telefono-cr` llevan `SLT-92`) |

Fábricas: `tests/fabricas/paises.ts` (países `XA`–`XZ` de SL-20/SLT-42) y
`tests/fabricas/reglas-pais.ts`. Los países de prueba `XA`–`XZ` no los conoce libphonenumber:
sirven para todo menos para un teléfono válido (SLT-42 R16) y, desde R26, para pasar por
`PaisService.crear` o `actualizarDatos` (no tienen prefijo oficial). Los tests que alta o editan
datos del país por el servicio (R5, R7–R11, R12, R17) usan códigos reales que no estén sembrados
(`PA`, `GT`, `HN`…) con su prefijo oficial; las fábricas que insertan `XA`–`XZ` directo en la base
siguen igual.

### 11.1 El E2E (R25)

- Proyecto `aislamiento` de `playwright.config.ts` (usa el superadmin de `_superadmin-fixture.ts`,
  como `planes-superadmin`).
- **País:** el primero, de una lista corta de códigos que libphonenumber conoce (p. ej. `PA`, `GT`,
  `HN`, `SV`, `NI`, `DO`…), que aún no esté dado de alta en la base. Así dos corridas seguidas sobre
  la misma base pasan sin borrar nada (`docs/verification.md > El E2E`). Si la lista se agota, el
  spec falla con un mensaje que lo dice.
- **Datos:** prefijo `getCountryCallingCode(pais)`; dígitos y teléfono del maestro de
  `getExampleNumber(pais, examples)` de libphonenumber-js (sin dependencia nueva); zona, una
  cualquiera de la lista del selector; un tipo «Documento E2E <sufijo>» solo dígitos 8–10.
- **Recorrido:** `/plataforma/geografia` → «Nuevo país» con sus datos y el tipo → la sección muestra
  el país completo → `/plataforma/empresas` → alta con ese país: el teléfono del maestro muestra
  `+<prefijo>` y el `Select` de tipo ofrece exactamente el tipo creado → se envía y el alta sale
  bien.
- El implementer confirma antes que el alta de empresa no exige geografía cargada en el país; si la
  exige, el spec carga una división mínima por CSV con la pantalla de SL-20.
