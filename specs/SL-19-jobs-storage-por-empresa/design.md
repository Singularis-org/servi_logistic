# SL-19 «Cola de jobs y storage por empresa» — design

## Lo que ya existe

Busqué con Grep y Read. El MCP del grafo responde, pero no tiene indexado este worktree
(`list_projects` solo trae el de SL-36), así que no lo usé.
Términos: `jobs_abierta`, `organizacion_id` en `jobs`, `dedupe_key`, `ON CONFLICT`, `empresaDelJob`,
`conSuEmpresa`, `storage.from`, `createSignedUrl`, `upload(`, `BUCKET`, `storage_path`,
`comprobante_path`, `pdf_ruta`, `carpeta de empresa`, `bucket por empresa`.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board (`feature_list.json`) | SL-19 es la única ficha con «storage» o «jobs» en el nombre. La de módulos por empresa (catálogo de módulos activos) cita «los jobs» como sitio donde comprobar el módulo: es otra cosa. | No hay duplicado. |
| `specs/SL-17-organizacion-y-aislamiento` | Deja a SL-19 «`dedupe_key` por empresa, storage, revisión de cada handler y las purgas de storage» (design §10). Clasifica `Job` como **diferido** (SL-19). | Se cumple lo de storage y las purgas. `dedupe_key` se razona en §2.4 y queda como pregunta abierta 1. Los handlers ya corren con su empresa: no se tocan. |
| `specs/SL-36-integraciones-por-empresa` (rama `feature/SL-36-…`, PR #14) | R42/R43 filtran por empresa en el SQL de `GeocodeSaludRepository`, porque `jobs_abierta` no separaba. | Se mantiene ese filtro como segunda barrera. SL-19 no toca ese archivo (§9). |
| `db/migrations/20261022130000_organizacion_y_rol_app` | `CREATE POLICY "jobs_abierta" ON "jobs" FOR ALL TO servi_app USING (true) WITH CHECK (true)`. | Se sustituye en una migración nueva (§2.1). |
| `db/migrations/20261022130200_jobs_organizacion_id` (SL-17 M4) | `jobs.organizacion_id` nulable, con `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`, FK y el índice `("organizacion_id","estado","run_after")`. | **Se reutiliza tal cual.** La política se apoya en esa columna y en ese índice. |
| `app/api/cron/procesar-jobs/route.ts`, `scripts/drenar-jobs.ts` | El reclamo y el cierre corren en `comoPlataforma`; cada handler, en `conSuEmpresa` (empresa del job, plataforma, o una vez por empresa si es recurrente). | **Se reutiliza.** El drenador no cambia (§2.2). |
| `lib/repositories/JobRepository.ts` | Todo SQL a mano. `enqueue` no nombra `organizacion_id` (lo llena el `DEFAULT`) y usa `ON CONFLICT ("dedupe_key") … DO NOTHING RETURNING *`. | No cambia. R4 y R7 prueban que sigue funcionando bajo la política nueva. |
| `lib/db/modelos-de-negocio.ts`, guardias `organizacion-en-modelos` y `rls-por-empresa` | `MODELOS_DIFERIDOS = [Job]`. La guardia RLS solo mira las tablas de negocio y no ve una política abierta que conviva con la de empresa. | Se reclasifica `Job` y se amplían las guardias (§5). |
| `lib/storage/` | Cuatro adaptadores (`SupabaseFileStorage`, `SupabaseSignedUrlProvider`, `SupabaseAlmacenDescargas`, `SupabaseAlmacenEnviosWhatsapp`) y `getFile.ts`, que nadie usa. Son los **únicos** archivos de `lib/` y `app/` que tocan `.storage` del cliente de Supabase. | El cambio de Storage va **solo** dentro de esos cuatro (§3.2). Las ~25 composition roots no cambian. |
| `lib/services/integraciones/credencial-de-la-empresa.ts` (SL-36) | `empresaEnCurso`: contexto de empresa → su id; plataforma → `EmpresaNoResuelta`; sin contexto → la sesión. | Se copia la misma regla para el almacén (§3.3). No se generaliza esa función porque su firma está atada a `ServicioIntegracion`. |
| `e2e/_storage-falso/servidor.mjs` (SL-44) | Doble HTTP de Storage que habla con el SDK real: upload, download, firma, firma en lote, list y remove. No implementa `move`. | Se usa para los tests de dos empresas (§6). El comando de migración copia y borra en vez de mover, para no extender el doble (§4). |
| `tests/fabricas/organizaciones.ts`, `tests/integration/db/_postgres-real.ts` | `crearOrganizacion`, `fijarEmpresa`, `comoApp`, `enTransaccionRevertida`. | Se reutilizan en los tests de `jobs`. |

## 1. Visión de conjunto

Dos cambios independientes, con la misma idea: la separación vive en el sitio donde están los
datos, no en la memoria de quien escribe la consulta.

- **`jobs`:** la política abierta pasa a ser por empresa. El drenador no lo nota, porque reclama
  como dueño de las tablas (plataforma), que no pasa por la RLS.
- **Storage:** cada adaptador de `lib/storage/` trata las rutas como **relativas a la carpeta de la
  empresa en curso** (`<organizacion_id>/<ruta de siempre>`). La base sigue guardando la ruta de
  siempre. Desde la empresa B no hay forma de escribir una ruta que llegue a la carpeta de A.

## 2. La cola `jobs`

### 2.1 Migración `20261025150000_jobs_por_empresa`

El timestamp tiene que ser posterior a la última migración de `dev` cuando se mergee. Si SL-36 u otra
ficha entra antes con uno mayor, se renombra **antes** de aplicarla en ninguna base compartida.

```sql
BEGIN;
-- Las políticas permisivas se suman con OR: con `jobs_abierta` viva, la de empresa no serviría (R9).
DROP POLICY "jobs_abierta" ON "jobs";
CREATE POLICY "jobs_por_empresa" ON "jobs" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
COMMIT;
```

`down.sql`:

```sql
BEGIN;
DROP POLICY "jobs_por_empresa" ON "jobs";
CREATE POLICY "jobs_abierta" ON "jobs" FOR ALL TO servi_app USING (true) WITH CHECK (true);
COMMIT;
```

- La RLS de `jobs` ya está activa desde `20260717120000_jobs_cola`. No hace falta `FORCE`: el dueño
  es la plataforma y tiene que seguir viéndolo todo (§2.2).
- `db/schema.prisma` no cambia: Prisma no modela políticas.
- Es el mismo predicado que las 77 políticas `<t>_por_empresa` de negocio, así que la guardia R24 de
  SL-17 lo reconoce sin cambios en su expresión regular.

**Qué hace con cada fila:**

| Fila | Rol de la app, empresa A | Rol de la app, sin empresa | Plataforma (dueño) |
|---|---|---|---|
| job de A | lee, cambia, borra | nada | todo |
| job de B | nada (R1, R2) | nada | todo |
| job sin empresa | nada (R1, R2) | nada | todo |
| insertar con A (o sin nombrar la columna) | sí (R4) | — | sí |
| insertar con B o con NULL explícito | rechazado (R3) | rechazado (R5) | sí |

`NULL = x` es NULL, y la RLS lo trata como falso: un job sin empresa nunca pasa la política. Así
cubre también R5 sin una cláusula aparte.

### 2.2 El drenador y los jobs sin empresa

No cambia nada en el código del drenador:

- **Reclamo, cierre, backoff, dead-letter y re-agendado de recurrentes:** van en
  `comoPlataforma("SL-17", "drenador: …")`. En plataforma la extensión no baja de rol
  (SL-17 design §6.1), así que el SQL corre como dueño y ve todas las empresas y los jobs sin empresa
  (R6).
- **Cada handler:** en `conSuEmpresa`, es decir, en la empresa del job (rol de la app con esa
  empresa), en plataforma si es un job sin empresa por evento, o una vez por empresa si es
  recurrente.
- **Lo que un handler encola** dentro de su empresa hereda la empresa por el `DEFAULT` y pasa el
  `WITH CHECK` (R4).
- **Los jobs recurrentes** (`liberar_reprogramadas`, `analitica_rollup_diario`,
  `whatsapp_envio_mantenimiento`) nacen sin empresa: los siembran scripts en plataforma y los
  re-agenda el drenador en plataforma. Con la política nueva ninguna empresa los ve, que es lo
  correcto: su `payload` y su `last_error` son de la plataforma.

**Consultas que hoy leen `jobs` desde una empresa** (todas por SQL a mano, todas cubiertas por la
política tras el cambio):

| Archivo | Consulta | Contexto | Antes | Después |
|---|---|---|---|---|
| `lib/repositories/GeocodeSaludRepository.ts` | `contarFallosConfigDesde`, `revivirFallosConfig` | handler de geocodificación, en la empresa del job | veía todas (por eso el hallazgo) | solo su empresa (R8), más el filtro de SL-36 |
| `lib/repositories/JobRepository.ts` | `findByDedupeKeys` | `AsignabilidadCoordenadasService`, en la sesión | veía todas | solo su empresa (R10) |
| `lib/repositories/WhatsappEnvioRepository.ts` | `NOT EXISTS (… FROM "jobs" …)` y `jobsProgramadosPendientes` | mantenimiento recurrente (una vez por empresa) y pantallas de envíos | veía todas | solo su empresa; los `envioId` ya eran suyos |
| `lib/repositories/JobRepository.ts` | `enqueue` | toda transacción de empresa (outbox) | inserta | inserta con su empresa (R4); la dedupe sigue (R7) |

**Jobs sin empresa por evento.** Solo existen en bases anteriores a M4 de SL-17 (dev local): QA y
producción nacieron con M4 aplicada. El drenador los sigue corriendo en plataforma, como dice R42 de
SL-17. Ninguna empresa los ve. No se migran.

### 2.3 Alternativas descartadas para la política

- **A. Una política aparte para el drenador**, por ejemplo `OR current_setting('app.plataforma') = '1'`,
  o un rol `servi_plataforma`. **Descartada.** `set_config` lo puede llamar cualquier SQL que corra
  como `servi_app`, así que una marca de ese estilo permitiría saltarse la RLS con una sola línea. Un
  rol nuevo exigiría otra URL o más `SET ROLE` por el pooler, que SL-17 tuvo que verificar a mano
  en las dos bases (T4.1). Además, no hace falta: la plataforma ya opera como dueño, sin RLS, y la
  guardia `plataforma-solo-en-lista` acota quién entra ahí.
- **B. Que todas las empresas vean los jobs sin empresa** (`USING (organizacion_id IS NULL OR
  organizacion_id = …)`). **Descartada.** Los recurrentes guardan el `payload` y el `last_error` de
  la plataforma. Cualquier empresa podría además modificarlos: `revivirFallosConfig` reviviría un job
  sin empresa por el éxito de una empresa, que es justo lo que R42 de SL-36 prohíbe.
- **C. Dejar `jobs_abierta` y filtrar en el SQL de cada consulta**, como hizo SL-36. **Descartada**
  como solución: es lo que falló. Cada consulta nueva sobre `jobs` tiene que acordarse, y ninguna
  guardia lo exige, porque `jobs` no está en la lista de tablas de negocio del detector de SQL a mano.
  El filtro de SL-36 se queda, como segunda barrera.
- **D. Hacer `Job` modelo de negocio** (en `MODELOS_DE_NEGOCIO`). **Descartada.** Su
  `organizacion_id` es nulable a propósito, y la única tabla de negocio nulable es `usuario`, con una
  regla propia en la extensión (`MODELO_NEGOCIO_NULABLE` → `UsuarioSinEmpresa`). Meterla ahí obligaría
  a partir esa regla, y el detector de SQL a mano pediría filtrar en el texto el reclamo del
  drenador, que es de plataforma a propósito. Se crea una clase propia (§5.1).

### 2.4 `dedupe_key`: se queda global (pregunta abierta 1)

El índice único `jobs_dedupe_key_key ("dedupe_key") WHERE "dedupe_key" IS NOT NULL` no cambia.

- **Por qué basta hoy.** Todas las claves que se encolan desde una empresa llevan el id de una fila
  de esa empresa, y los ids no se repiten entre empresas:
  - geocodificación: `orden.id`;
  - optimización: `mensajeroId`;
  - webhooks: `ordenId` y `ordenEventoId`;
  - WhatsApp: `envio.id`, `ejecucion.id`, `entregaId`, `mensajeChatId` y `ordenId`;
  - push: `notificacionId`.

  Las claves con fecha son de recurrentes de plataforma, sin empresa. La de invalidación de analítica
  (`<rango>:<epoch>`) hoy no la encola ningún código de producción.
- **Lo que pasaría con una colisión.** `INSERT … ON CONFLICT DO NOTHING` no consulta las políticas
  de la fila existente. Si B encolara una clave que ya usa A, el insert se omitiría y `enqueue`
  devolvería `null`, sin ver la fila de A ni alterarla. T1.1 mide este comportamiento contra Postgres
  real y lo deja anotado; no se convierte en requisito, porque no es un contrato deseado.
- **Alternativa descartada: índice `UNIQUE ("organizacion_id","dedupe_key") NULLS NOT DISTINCT`.**
  Postgres 17, que es el de CI y el de Supabase, lo admite. La descarto por cuatro motivos:
  1. hay que cambiar el destino del `ON CONFLICT` en `JobRepository.enqueue` y en
     `scripts/siembra-jobs-recurrentes.ts`;
  2. la migración aplicada `20261005120200_seed_whatsapp_envio_mantenimiento` usa
     `ON CONFLICT ("dedupe_key") WHERE …`, y `tests/integration/db/siembra-whatsapp-envio-mantenimiento-idempotente.test.ts`
     la re-ejecuta contra el esquema actual. Sin el índice antiguo, Postgres responde «no unique or
     exclusion constraint matching the ON CONFLICT specification», y esa migración no se puede editar;
  3. en una base anterior a M4, un job programado de WhatsApp sin empresa ya no chocaría con su
     gemelo de empresa, y saldría un envío duplicado;
  4. no arregla nada que se haya visto.

  Si el humano la quiere igual, cabe en una migración aparte, sin tocar el resto de este diseño.

## 3. Storage por empresa

### 3.1 Inventario

Todo acceso pasa por los cuatro adaptadores de `lib/storage/`, con el service role. Ningún otro
archivo de `app/`, `lib/` ni `scripts/` toca `.storage`. Ninguna ruta llega del cliente: todas las
construye un servicio o salen de una columna leída con RLS.

| Bucket (env, defecto) | Cómo nace | Quién escribe y con qué ruta | Dónde se guarda la ruta | Quién lee o borra |
|---|---|---|---|---|
| `POSTULACION_BUCKET`, `mensajero-docs` | a mano | `PostulacionMensajeroService`: `<usuarioId>/<tipo>.<ext>` | `mensajero_documento.storage_path` | `AprobacionPostulacionService` (firma) |
| `GESTION_EVIDENCIA_BUCKET`, `gestion-evidencias` | a mano | `evidencias-compensadas.ts` (gestión del mensajero y desde ayuda): `<ordenId>/<prefijo><ts>-<i>.<ext>`; `IncidenteAdminService`: `<ordenId>/incidente-<ts>-<i>.<ext>`; `DevolucionTiendaService`: `rutaComprobanteDevolucionTienda(uuid, mime)` | `gestion_orden.evidencia_storage_path`, `gestion_orden_evidencia.storage_path`, `orden_incidente_evidencia.storage_path`, `devolucion_tienda_evidencia.storage_path` | cierres (día, bodega, admin), mis asignaciones, incidentes, devoluciones y API de lectura de órdenes (firman) |
| `ETIQUETAS_BUCKET`, `etiquetas-guia` | a mano | `EtiquetasLotePdfService`: `<usuarioId>/<uuid>.pdf` | `orden.download_storage_path`, `carga.download_storage_path` (rutas por API key) | `ApiPdfEtiquetaService` (firma); cron `purga-pdf-cargas` (borra, ya una vez por empresa) |
| `WALLET_COMPROBANTE_BUCKET`, `wallet-comprobantes` | a mano | `WalletComprobanteService`, `AbonoTiendaService`, `AporteCapitalService`, `PagoPorCuentaTiendaService`: `rutaDeComprobante(carpeta, mime)` | `wallet_comprobante.storage_path`, `abono_tienda.comprobante_path`, `aporte_capital.comprobante_path`, `pago_por_cuenta_tienda.comprobante_path` | los mismos servicios (firman) |
| `DESCARGAS_BUCKET`, `descargas` | sola, en el primer uso | `SupabaseAlmacenDescargas.guardar`: `tmp/<uuid>.json.gz` | ninguna (se firma al momento) | cron `purga-descargas` (lista `tmp/` y borra), **hoy sin empresa** |
| `WHATSAPP_ENVIOS_BUCKET`, `whatsapp-envios` | sola, en el primer uso | `SupabaseAlmacenEnviosWhatsapp.guardar`: `<envioId>/<ejecucionId>.pdf` | `whatsapp_envio_ejecucion.pdf_ruta` | handlers de envío (leen y firman) y mantenimiento (borra), en la empresa del job |

El encargo habla de 4 buckets privados en producción: son los cuatro «a mano». Los otros dos solo
existen cuando alguien los usó por primera vez (pregunta abierta 3).

### 3.2 La carpeta de la empresa, dentro de los adaptadores

Cada operación de los cuatro adaptadores hace dos cosas:

1. Resuelve la empresa en curso (§3.3). Sin empresa, falla antes de llamar a Storage (R18).
2. Traduce la ruta que recibe a `<organizacion_id>/<ruta>`, después de validarla (R17).

La ruta que **devuelve** es siempre la relativa, la de siempre. Así la base sigue guardando lo mismo,
los servicios no cambian y no hay que migrar ninguna columna. Las interfaces (`IFileStorage`,
`ISignedUrlProvider`, `IAlmacenDescargas`, `IAlmacenEnviosWhatsapp`) y los constructores no cambian,
así que las ~25 composition roots tampoco.

| Adaptador · método | Cambio |
|---|---|
| `SupabaseFileStorage.upload` | sube a `rutaEnCarpeta(org, input.path)`; devuelve `rutaRelativa(org, data.path)` (R15) |
| `SupabaseFileStorage.remove` | borra `paths.map(rutaEnCarpeta)` (R16, R22) |
| `SupabaseSignedUrlProvider.createSignedUrl` | firma `rutaEnCarpeta(org, path)` (R16) |
| `SupabaseSignedUrlProvider.createSignedUrls` | firma las rutas completas. **Re-indexa el resultado por la ruta relativa pedida**, porque Supabase devuelve `entry.path` completo y los consumidores buscan `urlByPath[path]` (R19). Una entrada fuera de la carpeta se descarta |
| `SupabaseAlmacenDescargas.guardar` / `firmar` | `tmp/<uuid>.json.gz` dentro de la carpeta; devuelve la relativa |
| `SupabaseAlmacenDescargas.purgarAnterioresA` | lista y borra en `<org>/tmp`, en la empresa en curso (R21) |
| `SupabaseAlmacenEnviosWhatsapp.guardar` / `leer` / `firmar` / `borrar` | igual; `rutaPdfEjecucion` sigue devolviendo `<envioId>/<ejecucionId>.pdf` (R15, R16, R22) |

`lib/storage/getFile.ts` no tiene usos: se borra, para que no quede un camino de lectura sin
carpeta.

### 3.3 `lib/storage/carpeta-de-empresa.ts`

```ts
/** R17: ruta vacía, absoluta, con `\`, o con un segmento vacío, `.` o `..`. No se llamó a Storage. */
export class RutaDeAlmacenInvalida extends Error { constructor(readonly motivo: string) }

/**
 * R18: la misma regla que `empresaEnCurso` de SL-36. Si el contexto es de empresa, su id; si es de
 * plataforma, `EmpresaNoResuelta("Storage", "<bucket>:<operacion>")`; si no hay contexto, la
 * sesión, y si la sesión no da empresa, `EmpresaNoResuelta`. El resolutor de la sesión se importa de
 * forma perezosa, como en `prisma-client.ts`, para que `lib/storage` no cargue `next/headers` al
 * importarse.
 */
export async function empresaDelAlmacen(
  bucket: string,
  operacion: string,
  empresaDeLaSesion?: () => Promise<string | null>,
): Promise<string>;

/** `<organizacionId>/<ruta>`, después de validar la ruta (R15–R17). */
export function rutaEnCarpeta(organizacionId: string, ruta: string): string;

/** La ruta sin la carpeta, o `null` si no está dentro de ella. Para respuestas y listados. */
export function rutaRelativa(organizacionId: string, completa: string): string | null;
```

**Por qué R16 se cumple por construcción.** La empresa nunca sale de la ruta, sino del contexto. Desde
B, la ruta `x` es `B/x`, y `../A/x` no pasa la validación. No hay ninguna cadena que, desde B, llegue
a un objeto de A.

### 3.4 Purga de descargas por empresa

`app/api/cron/purga-descargas/route.ts` pasa al patrón de los demás crons:

- envuelve `service.ejecutar(now)` en `paraCadaEmpresa`, con `deps.empresas` inyectable, igual que
  `purga-pdf-cargas`;
- suma `objetosBorrados` y combina `quedaPendiente` con un OR;
- un fallo en una empresa se registra con su id y no frena a las demás (R21).

El presupuesto de 5.000 objetos pasa a ser **por empresa**. Con N empresas la corrida puede tardar N
veces más, pero `maxDuration = 60` s ya sobra para un listado y un borrado por lote. Si un día no
basta, se baja el máximo por empresa.

### 3.5 Postulación pública

`PostulacionMensajeroService` sube documentos antes de tener empresa en la ruta pública. Desde SL-17
esa ruta falla cerrado (R41 de SL-17), y ahora el almacén también: sin empresa no sube nada (R18).
Cuando SL-35 dé a la postulación su empresa por `slug`, los documentos caerán en su carpeta sin tocar
este diseño.

### 3.6 Alternativas descartadas para Storage

- **A. Un bucket por empresa.** **Descartada.**
  - Cuatro de los seis buckets se crean a mano en cada entorno. Habría que crear 4 × N en el alta de
    cada empresa (SL-25), con el service role y con su política de privacidad.
  - Las variables `*_BUCKET` dejarían de nombrar un bucket y pasarían a nombrar un patrón.
  - Las purgas tendrían que descubrir buckets.
  - No aísla más que la carpeta: el service role ve todos los buckets igual que todas las carpetas.
- **B. Guardar la ruta completa (`<org>/…`) en la base y comprobar en cada lectura que empieza por la
  empresa en curso.** **Descartada.**
  - Hay que migrar 12 columnas de 12 tablas.
  - Hay que tocar cada servicio que construye o guarda rutas. `EtiquetasLotePdfService`, por
    ejemplo, firma la ruta que él mismo calculó, no la que devuelve el adaptador.
  - La comprobación es un `if` que un adaptador nuevo puede olvidar.

  Con la carpeta implícita no hay nada que comprobar: la ruta de otra empresa no se puede expresar.
- **C. Compatibilidad de lectura: si el objeto no está en la carpeta, buscarlo en la raíz.**
  **Descartada.** Reabre exactamente el agujero. Desde B, una ruta `x` que no exista en `B/x` caería
  en el `x` de la raíz, que puede ser un archivo antiguo de A. Por eso lo guardado se mueve (§4), y
  durante la ventana entre el despliegue y el comando un archivo antiguo da «no encontrado» en vez
  de servirse a quien no debe.
- **D. Políticas de Supabase sobre `storage.objects`** (RLS por la primera carpeta del nombre).
  **Descartada.** La app firma y sube con el service role, que se salta esas políticas. Usarlas
  exigiría un JWT de Supabase por usuario, que es otro modelo de autenticación. Los buckets siguen
  privados y sin políticas para `anon`/`authenticated`, como hoy.

## 4. Lo ya guardado: `scripts/migrar-storage-a-carpetas.ts`

`pnpm exec tsx scripts/migrar-storage-a-carpetas.ts [--aplicar | --revertir] [--bucket <nombre>]`

- **Contexto.** `comoPlataforma("SL-19", "mover los archivos ya guardados a la carpeta de su
  empresa")`: lee filas de todas las empresas. Entra en `EXCEPCIONES_DE_PLATAFORMA`.
- **Lectura de la base.** Usa la API de modelos de Prisma (`findMany` con `select: { organizacionId,
  <ruta> }`), no SQL a mano, así que no entra en el detector de `sql-a-mano-por-empresa`.
- **Acceso a Storage.** Usa directamente el cliente de Storage (`createServerClient().storage`), porque
  es el único camino que opera fuera de una empresa. Entra en la lista de excepciones de la guardia
  de R20 (§5.3).
- **Mapa de lo que mueve.** Una constante `RUTAS_GUARDADAS: { bucket, modelo, campo }[]`, con las 12
  columnas de §3.1. Las variables de bucket se leen con los mismos `load*Config` que la app.
  `gestion_orden.evidencia_storage_path` repite rutas de `gestion_orden_evidencia`: se deduplica por
  `(bucket, ruta)`.
- **Mover** (`--aplicar`, R24) es `download` + `upload` a `<org>/<ruta>` con `upsert: false` y el mismo
  `contentType`, y después `remove` del original. No usa `move` porque el doble de Storage del E2E no
  lo implementa, y así se puede probar sin red.
- **Idempotencia** (R25):
  - si el destino existe y el origen no, el objeto cuenta como «ya movido»;
  - si existen los dos, solo se borra el origen después de comparar que los bytes son iguales; si
    difieren, se informa y no se toca nada.
- **Descargas temporales** (R26): con `--aplicar`, borra todo lo que hay bajo `tmp/` en la raíz del
  bucket `descargas`.
- **Huérfanos** (R27): objetos en la raíz que ninguna fila nombra, y que no son temporales de
  descargas. Se listan con su bucket y su ruta, y no se tocan. Para saber cuáles son, se lista cada
  bucket por niveles: la raíz y luego cada carpeta. Una carpeta de primer nivel que coincide con el
  id de una organización se salta.
- **Revertir** (R28): `--revertir` es la operación inversa, `<org>/<ruta>` → `<ruta>`, sobre las
  mismas filas. Es el `down` del almacén: se usa si hay que volver a una versión de la app anterior a
  SL-19.
- **Sin `--aplicar`** (R23): solo cuenta e informa. Sale con 0 si no hay discrepancias de bytes, y con
  1 si las hay.
- **Salida:** solo conteos por bucket y la lista de huérfanos (bucket y ruta). Nunca contenido ni URLs
  firmadas.

**Orden de despliegue en cada entorno:**

1. merge y despliegue: migración y código nuevo;
2. el comando, sin `--aplicar`, para ver los conteos;
3. con `--aplicar`;
4. otra vez sin `--aplicar`: todo en 0 salvo los huérfanos.

Entre el paso 1 y el 3, los archivos antiguos dan «no encontrado» (alternativa C). En producción
debería salir todo en 0 en el paso 2; si no, se para y se avisa. **Correr el comando contra QA o
producción es una puerta humana** (tasks T10.4): el agente no lo hace sin un OK explícito.

## 5. Guardias

### 5.1 Clasificación (`lib/db/modelos-de-negocio.ts`)

- Nueva lista `MODELOS_CON_EMPRESA_OPCIONAL: readonly ModeloConEmpresaOpcional[] = [{ modelo: "Job",
  tabla: "jobs", ficha: "SL-19", motivo: "outbox: nace con la empresa que encola; sin empresa solo
  la ve la plataforma (recurrentes)" }]`. Se lee como «`organizacion_id` nulable, política por
  empresa, sin filtro de la extensión ni trigger de misma empresa».
- `MODELOS_DIFERIDOS` queda vacía. Se conserva el tipo, para la próxima ficha que lo necesite.
- `organizacion-en-modelos.guardia.test.ts`:
  - la suma de las listas sigue cuadrando con los modelos del esquema;
  - cada modelo de la lista nueva tiene `organizacion_id` **nulable** y un índice que empieza por esa
    columna (R13, R14).

### 5.2 `rls-por-empresa.guardia.test.ts` (R12, R13)

- Las tablas que se comprueban pasan a ser las de negocio **más** las de empresa opcional (`jobs`).
- **Comprobación nueva: políticas abiertas.** El mismo recorrido de migraciones guarda, por tabla,
  **todas** las políticas vivas para `servi_app`, no solo las que comparan con la empresa. La guardia
  falla si alguna de las tablas comprobadas tiene una política viva para `servi_app` cuyo cuerpo no
  contiene `current_setting('app.organizacion_id'`, y nombra la tabla y la política.
  Autocomprobaciones:
  - una `USING (true)` junto a la de empresa falla;
  - un `DROP` posterior de la abierta la deja en verde;
  - quitar el `DROP POLICY "jobs_abierta"` de la migración real la pone en rojo.
- Si al activarla aparece una tabla de negocio con una política abierta heredada, **no** se añade
  una excepción: se para y se informa al leader, porque sería un agujero de SL-17.

### 5.3 Guardia nueva `storage-solo-por-adaptador.guardia.test.ts` (R20)

- Falla si un `.ts`/`.tsx` de `app/`, `lib/` o `scripts/` fuera de `lib/storage/` contiene `.storage`
  sobre un cliente de Supabase (`createServerClient().storage`, `.storage.from(`,
  `.storage.createBucket(`). La excepción es `EXCEPCIONES_DE_STORAGE` en
  `lib/db/excepciones-aislamiento.ts`, con ficha y motivo, que hoy solo contiene el comando de §4.
- Una excepción sin ficha, o que apunta a un archivo que no existe, también falla, igual que R26 de
  SL-17.
- Autocomprobación: un archivo inventado de `lib/services/` con `.storage.from(` sale rojo.

### 5.4 Las que no se tocan

- **`sql-a-mano-por-empresa`:** no se extiende a `jobs`. Todo el SQL sobre `jobs` corre en plataforma
  a propósito (reclamo y cierre) o con la política por empresa (el resto). Pedir el filtro en el
  texto solo sumaría excepciones `porRls` sin protección nueva.
- **`plataforma-solo-en-lista`:** pasa con la entrada nueva del comando.
- **`fk-misma-empresa`:** `jobs` solo tiene la FK a `organizacion`, que es de plataforma.

## 6. Verificación: dos empresas y una mutación por test

Cada test se mata a mano una vez con su mutación, y el resultado («rojo con la mutación, verde sin
ella») se anota en `progress/impl_SL-19.md`. Es la regla de la memoria del repo: un test que nunca
estuvo rojo no prueba nada.

| Test | Contra qué | R | Mutación que lo pone rojo |
|---|---|---|---|
| `tests/integration/db/jobs-por-empresa.test.ts` | Postgres real; dos `crearOrganizacion`; `comoApp(tx, A)`; filas de A, de B y sin empresa sembradas en plataforma | R1, R2, R3, R4, R5, R7, R10 | (a) quitar `DROP POLICY "jobs_abierta"` de la migración (las dos conviven); (b) cambiar la política a `… OR organizacion_id IS NULL`; (c) en R4, quitar el `DEFAULT` de M4 dentro de la transacción del test |
| `tests/integration/db/jobs-drenador-dos-empresas.test.ts` | Postgres real; `JobRepository.claimBatch`, `complete` y `fail` en plataforma | R6 | ejecutar el reclamo con `comoApp(tx, A)` en vez de como dueño: deja de ver B y los sin empresa |
| `tests/integration/db/geocode-salud-dos-empresas.test.ts` | Postgres real; `GeocodeSaludRepository` con la empresa A y jobs `geocodificacion` muertos de A y de B | R8 | Antes del merge de SL-36: restaurar `jobs_abierta`. Después: restaurar `jobs_abierta` **y** quitar el filtro de SL-36; con una sola de las dos mutaciones tiene que seguir verde, y eso también se anota |
| `tests/integration/db/jobs-por-empresa-migracion.test.ts` | Postgres real: up, down, up dentro de una transacción revertida | R11 | quitar el `CREATE POLICY "jobs_abierta"` del `down.sql` |
| `tests/unit/guards/rls-por-empresa.guardia.test.ts` (ampliada) | migraciones reales y casos inventados | R9, R12, R13 | ver §5.2 |
| `tests/unit/guards/organizacion-en-modelos.guardia.test.ts` (ampliada) | esquema real | R13, R14 | volver a poner `Job` en diferidos, o quitarle la nulabilidad en un esquema inventado |
| `tests/unit/storage/carpeta-de-empresa.test.ts` | unidad | R17, R18 | aceptar `..`; resolver la empresa en plataforma |
| `tests/integration/storage/storage-dos-empresas.test.ts` | doble HTTP `e2e/_storage-falso/servidor.mjs` con el SDK real y los **cuatro adaptadores reales**, en `conEmpresa(A)` y `conEmpresa(B)` | R15, R16, R19, R22 | `rutaEnCarpeta` devuelve la ruta sin carpeta: B firma y descarga el `x` de A |
| `tests/unit/storage/*.test.ts` (los cuatro existentes) | dobles del cliente | R15, R16, R19 | se ajustan para correr dentro de `conEmpresa` y afirman la ruta completa que llega al cliente |
| `tests/unit/api/cron-purga-descargas.test.ts` (ampliado) y `tests/unit/cron/crons-sin-empresas.test.ts` (añade `purga-descargas`) | `handlePurgaDescargas` con `deps.empresas` doble: dos empresas, una que falla, ninguna | R21 | quitar `paraCadaEmpresa`: falla con `EmpresaNoResuelta` |
| `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts` | código real y casos inventados | R20 | ver §5.3 |
| `tests/integration/storage/migrar-storage-a-carpetas.test.ts` | Postgres real (dos empresas con una evidencia y un comprobante cada una) más el doble de Storage | R23, R24, R25, R26, R27, R28 | (a) mover a la raíz en vez de a la carpeta: R24 rojo (B la firma); (b) no comprobar el destino: la segunda corrida falla (R25) |

Los tests de integración de Storage van en `tests/integration/storage/` y arrancan el doble en un
puerto libre, como `tests/unit/e2e/storage-falso.test.ts`. No necesitan red ni Supabase.

**E2E.** `e2e/_escenarios/reparto.ts` y `cierres.ts` construyen adaptadores reales contra el doble.
Si alguno opera fuera de `conEmpresa`, ahora falla con `EmpresaNoResuelta`: se envuelve en la empresa
del escenario. Si siembra objetos en el doble por ruta, los siembra dentro de la carpeta. Se corren
los specs E2E que usan evidencias (T11).

## 7. Contratos

- **Interfaces de `lib/interfaces/external/`:** sin cambios de firma. Cambia la semántica documentada:
  la ruta es relativa a la carpeta de la empresa en curso. Se añade una línea al comentario de cada
  interfaz.
- **Errores nuevos:** `RutaDeAlmacenInvalida` (R17). La falta de empresa reutiliza `EmpresaNoResuelta`
  (R18), así que `traducirErrorDeEmpresa` y las acciones que ya la manejan no cambian.
- **Rutas HTTP:** ninguna nueva. `purga-descargas` mantiene su respuesta
  `{ objetosBorrados, quedaPendiente }`.
- **Base:** una migración (§2.1). Sin columnas nuevas.

## 8. Autorización, módulos, país y dependencias

- **Autorización:** no cambia quién puede qué. El almacén obedece a la empresa del contexto, que ya
  resuelven la sesión, la API key o el drenador.
- **Módulos:** ninguno se enciende ni se apaga aquí.
- **Datos que dependen del país:** ninguno.
- **Dependencias:** ninguna nueva (D5). Se usan `@supabase/supabase-js` (ya aprobada), Prisma y
  `node:crypto`, este último solo para comparar bytes en el comando.

## 9. Choques con otras ramas

- **SL-36 (PR #14, sin mergear):** toca `lib/repositories/GeocodeSaludRepository.ts` y
  `GeocodeSaludService`. SL-19 **no** toca esos archivos. Su test R8 está escrito para funcionar con o
  sin el filtro de SL-36, y la mutación de §6 lo tiene en cuenta. Quien mergee segundo, rebasa.
- **Timestamp de la migración:** ver §2.1.
- **SL-35** (postulación por empresa) y **SL-25** (alta de empresas): no necesitan nada de Storage.
  La carpeta nace sola con el primer archivo.
