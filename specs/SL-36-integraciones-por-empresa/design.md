# SL-36 — integraciones-por-empresa · design.md

> Referencia adaptada, no copiada: `extracciones/integraciones-boveda-whatsapp-qc/` (`prompt.md`,
> `decisiones.md`). Este documento cita la referencia como «QC §n» y los requisitos como `R<n>` de
> `requirements.md`.

## Lo que ya existe

**Términos buscados:**
- en el board (`feature_list.json`, todas las fichas): `integracion`, `credencial`, `cifr`,
  `WhatsApp`, `Maps`, `asistente`, `clave`;
- en `specs/`: `SL-36`, `credenciales por empresa`, `integraciones por empresa`;
- en el código (grafo y Grep): `createCipheriv`, `aes-256-gcm`, `loadWhatsappConfig`,
  `loadGeocodeConfig`, `loadRouteOptimizationConfig`, `loadAsistenteConfig`, `comoPlataforma`,
  `historialAccion`, `rateLimit`.

| Qué apareció | Dónde | Qué se hace con ello |
|---|---|---|
| Ninguna otra ficha cubre credenciales por empresa. SL-17 cita SL-36 como dueña de la excepción del webhook (D14) | `feature_list.json`; `specs/SL-17-organizacion-y-aislamiento/` | Nada que acotar. SL-36 cierra la deuda D10 |
| Cifrado AES-256-GCM `v1:` del secreto de los webhooks salientes, sin datos asociados ni anillo de claves | `lib/crypto/webhook-secret-cipher.ts` (feature 99) | **No se reutiliza ni se toca.** Le faltan el contexto (QC inv. 1) y el anillo (D10). Migrarlo a la bóveda queda fuera de alcance: es otra clave y otra feature |
| Historial de acciones append-only con punto único `appendAccion(tx, …)` | `lib/repositories/registrar-accion.ts`, `historial_accion` | **Se reutiliza para D5** (§13), con valores nuevos en sus enums |
| Contador por día con incremento ANTES de llamar al proveedor | `asistente_uso_diario`, `AsistenteUsoRepository` | **Se reutiliza el patrón** para el límite de pruebas (§6) |
| Limitador en memoria por instancia | `lib/utils/reset-rate-limit.ts` | No se usa: en Vercel cada instancia tiene su memoria (§16, alternativa B) |
| Recorrer empresas en su contexto | `lib/db/para-cada-empresa.ts` | Lo usan el recifrado (§12) y el cron de plantillas |
| Resolver una entrada sin sesión a su empresa, en una excepción acotada | `lib/api/api-key-request.ts` (SL-17) | Es el patrón del enrutado del webhook (§10) |
| Lectura cruzada de empresas del superadmin, ya en la lista de excepciones | `lib/repositories/EmpresasPlataformaRepository.ts` (SL-32) | Hospeda la lectura de estado para SL-26 (§11): no añade ninguna excepción |
| Comando de consola del superadmin | `scripts/arranque-superadmin.ts` | Es el molde del comando de recifrado (§12) |
| Páginas de ayuda en `docs/ayuda/**.md`, con frontmatter `fuentes`, renderizadas por `app/(app)/ayuda/[...slug]` | `lib/ayuda/catalogo.ts`, `docs/ayuda/README.md` | Las guías son documentos nuevos en `docs/ayuda/oficina/` (§14) |

Conclusión: no existe nada que resuelva SL-36. Se reutilizan cinco piezas y no se re-crea ninguna.

## 1. Capas

```
app/(app)/configuracion/integraciones/page.tsx      página (Server Component), solo maestro
  → lib/actions/integraciones.ts                    Server Actions: actor de la sesión → service
    → lib/services/IntegracionesService.ts          R6 en la PRIMERA línea; valida, prueba, cifra, persiste, audita
      → IIntegracionRepository                      Prisma, filtro por empresa en el where
      → IProbadorIntegracion (uno por servicio)     clientes HTTP con timeout de 10 s
      → ICifradorSecretos / IResumenSecreto / IFuenteAleatoria
      → IIntegracionPruebaMinutoRepository          límite de pruebas (§6)

Consumidores (jobs, actions, webhook, asistente)
  → lib/services/CredencialesIntegracionService.ts  lectura PARA USO, sin actor, en el contexto de empresa en curso

app/api/webhooks/whatsapp/route.ts                  Controller: solo HTTP
  → lib/services/WebhookWhatsappService.ts          enruta por número, verifica la firma por empresa
    → IIntegracionEnrutadoRepository                única lectura en plataforma (§10)

scripts/recifrar-integraciones.ts → lib/services/RecifradoIntegracionesService.ts
```

Interfaces, una por archivo:
- `lib/interfaces/repositories/`: `IIntegracionRepository.ts`, `IIntegracionEnrutadoRepository.ts`,
  `IIntegracionPruebaMinutoRepository.ts`.
- `lib/interfaces/services/`: `IIntegracionesService.ts`, `ICredencialesIntegracion.ts`,
  `IRecifradoIntegracionesService.ts`.
- `lib/interfaces/external/`: `ICifradorSecretos.ts`, `IResumenSecreto.ts`, `IFuenteAleatoria.ts`,
  `IProbadorIntegracion.ts`.

**Autorización (R6).** La valida `IntegracionesService`, que recibe el `Actor` de la sesión.
- La primera línea de cada operación es `if (actor.rol !== "maestro" || !actor.organizacionId) return { status: "forbidden" }`.
  Va antes de tocar un repositorio o un probador.
- La Server Action no decide nada: resuelve el actor y traduce el resultado.
- La página repite la comprobación solo para no pintar el formulario. Sigue el patrón de
  `/configuracion/api`: muestra «No tienes permiso para acceder a esta sección».
- No hay módulo que encender: la pantalla existe para todo maestro.

**Datos que dependen del país.** Ninguno. La dirección fija que usa la prueba de Maps (§5) no
depende del país de la empresa.

## 2. Modelo de datos

### 2.1 D6 — forma: UNA tabla `integracion` para los cuatro servicios

```prisma
enum ServicioIntegracion { whatsapp  google_maps  optimizacion_rutas  asistente   @@map("servicio_integracion") }
enum EstadoIntegracion   { conectada  error                                       @@map("estado_integracion") }

model Integracion {
  id                         String              @id               // SIN default: se genera antes de cifrar (QC inv. 3)
  organizacionId             String              @map("organizacion_id")
  servicio                   ServicioIntegracion
  estado                     EstadoIntegracion
  datosPublicos              Json                @default("{}") @map("datos_publicos")   // zod por servicio (§8)
  secretos                   Json                                                     // { campo: "v<n>:..." }
  whatsappNumeroId           String?             @unique @map("whatsapp_numero_id")    // R11: único ENTRE empresas
  whatsappResumenVerificacion String?            @unique @map("whatsapp_resumen_verificacion") @db.Char(64)
  ultimoErrorCodigo          String?             @map("ultimo_error_codigo")          // código del catálogo, nunca texto del proveedor
  ultimaPruebaAt             DateTime?           @map("ultima_prueba_at")
  ultimoWebhookAt            DateTime?           @map("ultimo_webhook_at")
  createdAt                  DateTime            @default(now()) @map("created_at")
  updatedAt                  DateTime            @default(now()) @updatedAt @map("updated_at")
  organizacion Organizacion @relation(fields: [organizacionId], references: [id], onDelete: Restrict)
  @@unique([organizacionId, servicio])           // R10: una por empresa y servicio, también en concurrencia
  @@index([organizacionId])
  @@map("integracion")
}
```

Restricciones que solo puede escribir la migración:
- `CHECK ((servicio = 'whatsapp') = (whatsapp_numero_id IS NOT NULL))` y lo mismo para
  `whatsapp_resumen_verificacion`. Las columnas de WhatsApp solo existen en su servicio.
- `CHECK (jsonb_typeof(secretos) = 'object' AND NOT jsonb_path_exists(secretos, '$.* ? (!(@ like_regex "^v[1-9][0-9]*:"))'))`.
  Es la red de R5 en la base: a la columna no llega un valor sin la forma `v<n>:`.
- `CHECK (whatsapp_resumen_verificacion ~ '^[0-9a-f]{64}$')`.

**Por qué una tabla.**
- SL-26 lee el estado de las cuatro integraciones de todas las empresas con una sola consulta (§11).
- Un único repositorio, una sola política RLS, un único recifrado y un único rastro.
- Los campos propios de cada servicio van en `datos_publicos`, con un esquema zod por servicio que el
  repositorio aplica al leer y al escribir (§8). Así no hay «JSON sin esquema», que era la objeción
  de QC (decisiones D6).
- Los dos datos que necesitan únicos o búsquedas (el número de WhatsApp y el resumen del token) son
  columnas reales, no claves del JSON.

**Alternativa descartada: una tabla por proveedor** (lo que hace QC).
- Son cuatro tablas, cuatro políticas, cuatro repositorios y cuatro recorridos del recifrado.
- La lectura de estado de SL-26 sería un `UNION` de cuatro consultas.
- Maps, rutas y asistente tienen la misma forma: un secreto y nada más. Tres de las cuatro tablas
  serían copias con otro nombre.
- Lo único que gana es columnas tipadas para WhatsApp. Aquí se obtiene igual: el número y el resumen
  son columnas reales y el resto se valida con zod.

### 2.2 D7 — borrado: FÍSICO

Desconectar ejecuta `DELETE` sobre la fila (R32).
- La credencial deja de existir en la base, también la cifrada.
- Los únicos son totales, no parciales sobre filas vivas. QC tuvo que escribir a mano los parciales,
  y son lo primero que se pierde al portar.
- El número de WhatsApp se libera solo, porque la fila ya no existe.
- El rastro no se pierde: vive en `historial_accion`, cuyo `entidad_id` es opaco y sin FK a
  propósito, así que la fila de auditoría sobrevive a su sujeto (R33).

**Alternativa descartada: borrado lógico (`deleted_at`).**
- Conserva el valor cifrado de una credencial que el cliente pidió quitar. Un respaldo de la base lo
  sigue llevando, y cualquier clave maestra que aún lo lea podría descifrarlo.
- Obliga a escribir únicos parciales `WHERE deleted_at IS NULL` para el número y para
  `(organizacion_id, servicio)`.
- Obliga a filtrar «fila viva» en cada consulta (QC inv. 8). Es una condición más que olvidar.
- El historial de quién desconectó ya lo da D5.

### 2.3 Tabla del límite de pruebas

```prisma
model IntegracionPruebaMinuto {
  id             String   @id @default(uuid())
  organizacionId String   @map("organizacion_id")
  minuto         DateTime @db.Timestamptz(0)   // date_trunc('minute', now())
  intentos       Int      @default(0)
  @@unique([organizacionId, minuto])
  @@map("integracion_prueba_minuto")
}
```

Sigue el patrón de `asistente_uso_diario` (§6).

### 2.4 Clasificación, RLS y triggers

- Los dos modelos entran en `MODELOS_DE_NEGOCIO` (`lib/db/modelos-de-negocio.ts`). Sin eso, la
  guardia `organizacion-en-modelos` deja el gate en rojo.
- `organizacion_id` lleva `DEFAULT NULLIF(current_setting('app.organizacion_id', true), '')`, la
  FK `RESTRICT` y el índice. Es el patrón de `20261023120000_distrito_zona_especial_por_empresa`.
- RLS: `ENABLE ROW LEVEL SECURITY` y la política `integracion_por_empresa` /
  `integracion_prueba_minuto_por_empresa`, `FOR ALL TO servi_app`, con `USING` y `WITH CHECK` sobre
  `organizacion_id = NULLIF(current_setting('app.organizacion_id', true), '')`.
- `GRANT SELECT, INSERT, UPDATE, DELETE … TO servi_app`.
- Trigger `…_sin_cambio_de_empresa BEFORE UPDATE OF organizacion_id … EXECUTE FUNCTION impedir_cambio_de_empresa()`.
- No hay FK hacia otra tabla de negocio: `verificar_misma_empresa` no aplica. La guardia
  `fk-misma-empresa` lo confirma.
- No hay columna `creado_por`. El autor de cada cambio lo da el historial (§13), y no tener FK a
  `usuario` evita un trigger de misma empresa.

### 2.5 Migraciones (cada una con `down.sql`)

| Carpeta | UP | DOWN |
|---|---|---|
| `db/migrations/20261025120000_integracion/` | dos enums, dos tablas, checks, índices, RLS, grants y triggers (§2.1–2.4) | `DROP TABLE` de las dos tablas y `DROP TYPE` de los dos enums |
| `db/migrations/20261025120100_historial_accion_integraciones/` | `ALTER TYPE historial_accion_tipo ADD VALUE` × 5 y `ALTER TYPE historial_accion_entidad ADD VALUE 'integracion'` (§13) | Recrea los dos tipos sin esos valores, con el patrón de `20260904120000_historial_accion_api_key_eliminada/down.sql` |

Ninguna se edita después de aplicarse. Si algo falta, va en una migración nueva.

## 3. Bóveda

Contrato de QC §2, adaptado:

```ts
type ContextoSecreto = { readonly organizacionId: string; readonly integracionId: string; readonly campo: string };
// AAD = JSON.stringify(["integraciones.secreto", version, organizacionId, integracionId, campo])
interface ICifradorSecretos {                       // asíncrono: la firma no cambia si un día hay KMS
  cifrar(texto: string, ctx: ContextoSecreto): Promise<string>;     // 'v<n>:<iv>:<tag>:<ct>', versión ACTIVA
  descifrar(guardado: string, ctx: ContextoSecreto): Promise<string>;
  versionDe(guardado: string): string | null;       // para el conteo del recifrado, sin descifrar
}
interface IResumenSecreto { resumen(s: string): string; coincide(s: string, resumen: string): boolean } // SHA-256 hex, tiempo constante
interface IFuenteAleatoria { nuevoId(): string; nuevoTokenVerificacion(): string }                      // UUID; 32 bytes base64url
```

- Implementación en `lib/crypto/boveda-integraciones.ts`, con `node:crypto`.
  - AES-256-GCM, IV de 12 bytes y tag de 16, con `authTagLength` explícito al cifrar y al descifrar.
  - El base64 se valida con regex estricta.
  - El error es `CredencialIlegibleError`: uno solo, sin `cause`. Su diagnóstico interno distingue
    «forma inválida» de «versión ausente», sin valores.
- Anillo de claves, en `lib/config/integraciones.ts`. Se lee en cada llamada y nunca lanza al
  importar (R4):
  - `INTEGRACIONES_CLAVES_CIFRADO = "v1:<base64 32 bytes>,v2:<base64 32 bytes>"`;
  - `INTEGRACIONES_CLAVE_ACTIVA = "v2"`;
  - una versión repetida, una clave que no mide 32 bytes o una activa que no está en el anillo dan un
    error que nombra la variable y la posición (`entrada 2`), nunca la etiqueta ni el valor.
- La etiqueta del AAD (`"integraciones.secreto"`) es parte del contrato. Cambiarla deja ilegible todo
  lo cifrado.

## 4. Operaciones del service y contratos

`IIntegracionesService`. Cada método recibe `actor` y devuelve un resultado; nunca lanza por un caso
de negocio.

| Operación | Entrada (zod en la action) | Salida |
|---|---|---|
| `listar(actor)` | — | `ok{ servicios: VistaIntegracion[4] }` · `forbidden` |
| `alta(actor, servicio, campos)` | campos del servicio (§8) | `creada{ vista, verificacion?: { token, urlWebhook } }` · `prueba_fallida{ codigo }` · `ya_existe` · `numero_ocupado` · `limite{ reintentarEnS }` · `invalid_input{ fieldErrors }` · `forbidden` |
| `editar(actor, id, campos)` | igual; secreto vacío = conservar | `guardada{ vista }` · `prueba_fallida{ codigo }` · `no_encontrada` · `numero_ocupado` · `limite` · `invalid_input` · `forbidden` |
| `probar(actor, id)` | — | `probada{ ok: true }` · `probada{ ok: false, codigo }` · `no_encontrada` · `limite` · `forbidden` |
| `regenerarToken(actor, id)` | solo WhatsApp | `regenerado{ token, urlWebhook }` · `no_encontrada` · `forbidden` |
| `desconectar(actor, id)` | confirmación en la UI (R31) | `desconectada` · `no_encontrada` · `forbidden` |

- **`VistaIntegracion`** se arma campo a campo, sin spread (QC inv. 6):
  - `servicio`, `marca` (requerido / recomendado), `estado` (conectada / error / sin_configurar),
    `datosPublicos`;
  - `ultimoErrorTexto`, solo si el estado es `error`; sale del catálogo, nunca del proveedor;
  - `ultimaPruebaAt` y `ultimoWebhookAt`, en ISO;
  - `id`, que es `null` si no está configurada.
- **Orden del alta** (QC inv. 3, 10):
  1. valida la entrada;
  2. mira el límite (§6);
  3. si ya hay una de ese servicio, responde `ya_existe` sin llamar al proveedor;
  4. prueba;
  5. genera el id;
  6. cifra cada secreto con `{organizacionId, integracionId, campo}`;
  7. hace `create` y `appendAccion` en la misma transacción.

  Un `P2002` sobre `(organizacion_id, servicio)` se traduce a `ya_existe` y uno sobre
  `whatsapp_numero_id` a `numero_ocupado` (R10, R11). Cualquier otra violación de unicidad se
  propaga.
- **Edición** (R14):
  - prueba si cambia un secreto o un dato que la prueba verifica: en WhatsApp el número y la WABA; en
    rutas, la clave entera;
  - con prueba fallida no escribe nada, tampoco el estado. Es la asimetría a propósito de QC §5
    frente a «Probar», que sí escribe.
- **Probar** (R15):
  - si sale bien, deja `conectada` y limpia el error;
  - si sale mal, deja `error` y guarda el código y la hora;
  - escribe el estado en los dos casos, así que la action revalida también cuando falla.
- **Límites de entrada:** cada secreto mide de 1 a 4096 caracteres (la clave de una cuenta de
  servicio de Google es un JSON de ~2,3 KB). Un id sin forma de UUID se trata como `no_encontrada`
  (R9).
- **Errores del catálogo** (`lib/types/integraciones.ts`): `forbidden`, `invalid_input`,
  `no_encontrada`, `ya_existe`, `numero_ocupado`, `limite`, `prueba_fallida.<servicio>.<motivo>`,
  `credencial_ilegible` y `unexpected` con referencia. Cada código tiene su texto propio en español
  (D3).

**Lectura para uso** (`ICredencialesIntegracion`, sin actor). Corre en el contexto de empresa que
ya abrió el consumidor:

```ts
leer(servicio): Promise<
  | { estado: "sin_configurar" }
  | { estado: "ilegible" }                      // ya dejó la fila en `error` (R29)
  | { estado: "lista"; integracionId: string; credencial: CredencialDe<servicio>; datosPublicos }>
marcarRechazo(servicio, codigo): Promise<void>  // R30: deja `error` con el código
```

- No lanza en los casos de negocio. Cada consumidor traduce el resultado a su desenlace de siempre
  (§9).
- Sin contexto de empresa, la extensión del cliente falla con `EmpresaNoResuelta` (SL-17). Es lo que
  impide que un consumidor la llame en plataforma por error.

## 5. Probadores y señales de rechazo

`IProbadorIntegracion<S>.probar(credencial, datosPublicos)` devuelve
`{ ok: true, datosPublicos }` o `{ ok: false, motivo }`. Un fallo de red o de proveedor es un
resultado, nunca una excepción. Cada llamada tiene un timeout de 10 s (QC inv. 18).

| Servicio | Prueba (solo lectura) | Rechazo de credencial durante el USO (R30) |
|---|---|---|
| WhatsApp | `GET /{numero_id}?fields=display_phone_number,verified_name` y `GET /{waba_id}?fields=id`, con `Authorization: Bearer`. La WABA se prueba, a diferencia de QC (deuda «WABA nunca se verifica»). El App Secret no tiene endpoint de prueba: se comprueba con la primera firma del webhook | HTTP 401 o `error.code` 190 de Graph |
| Google Maps | Geocoding de una dirección fija con la clave (`?key=`, la API no acepta cabecera). Un `REQUEST_DENIED` da prueba fallida. La URL nunca se registra en el log | `REQUEST_DENIED` (`GeocodeConfigInvalidaError`, feature 400) |
| Optimización de rutas | Intercambio JWT-bearer de la clave de la cuenta de servicio por un token (`oauth2.googleapis.com/token`) | `RutaTokenError` con HTTP 400/401 en el intercambio |
| Asistente | `GET https://api.anthropic.com/v1/models` con `x-api-key` | HTTP 401 |

Lo que la prueba de rutas **no** verifica: que el proyecto tenga habilitada la API de Route
Optimization y que la cuenta tenga el rol. Si falta, la primera optimización real falla con 403:
- `RutasPorEmpresa.fetchOptimizacion` marca la integración en `error` con el código
  `optimizacion_rutas.permiso` (R30);
- el cliente de Google devuelve `config_invalida` y `FallbackRouteOptimizationClient` lo propaga,
  sin caer a Haversine (su fallback es solo para credencial ausente o `sin_solucion`);
- `OptimizacionRutaService` conserva el orden previo de las paradas, marca la ruta
  `desactualizada` y lanza `RutaIntentoFallidoError`: la cola reintenta con backoff y, si el 403
  persiste, el job termina en dead-letter.

Por qué se deja así: R26 (sin credencial usable no se llama a Google con otra) y R30 (el rechazo
se ve en la tarjeta) se cumplen, y la ruta no pierde orden. Caer a Haversine ante `permiso` sería
un cambio de conducta del compuesto de la feature 92, fuera del alcance de SL-36. La guía (§14) lo
advierte.

## 6. Límite de pruebas (D4)

- Valor por defecto: **5 pruebas por minuto y por empresa**, sumando los cuatro servicios. Se cambia
  con `INTEGRACIONES_PRUEBAS_POR_MINUTO`.
  - Es un valor propuesto, sin medición detrás: no hay datos de uso de una pantalla que todavía no
    existe.
  - Cinco cubren corregir un token mal pegado dos o tres veces. Ninguna cuota de los cuatro
    proveedores se acerca a cinco por minuto.
- Mecánica: `INSERT … ON CONFLICT (organizacion_id, minuto) DO UPDATE SET intentos = intentos + 1
  RETURNING intentos`.
  - Va **antes** de llamar al proveedor, como `asistente_uso_diario`. Al revés, una ráfaga se cuela
    entera antes de contar.
  - El SQL filtra por `organizacion_id`, que es lo que exige la guardia `sql-a-mano-por-empresa`.
  - Si `intentos` supera el límite, el service devuelve `limite{ reintentarEnS }` sin probar (R16).
- Las filas viejas no se purgan: son una por empresa y por minuto con pruebas, una cantidad
  despreciable.

## 7. Preguntas que se cerraron leyendo el código

### 7.1 Sin Maps, ¿las asignaciones se bloquean o se degradan? → SE DEGRADAN

Evidencia:
- `GeocodificacionService.ejecutar` (`lib/services/GeocodificacionService.ts`, 165-172):
  - sin credencial, lanza `GeocodeNoConfiguradoError`;
  - su mensaje lleva el marcador de fallo de configuración (`marcarFalloConfigGeocode`, feature 400).
- `AsignabilidadCoordenadasService.evaluar` (`lib/services/AsignabilidadCoordenadasService.ts`,
  164-177):
  - un job en `failed`, `pending` o `processing` cuyo `last_error` trae ese marcador clasifica la
    orden como `asignable_sin_ubicacion`, que **pasa** el gate;
  - lo cuentan aparte `GuiaAsignacionService` (230-235) y `AsignacionSateliteService` (288-291).
- `e2e/_escenarios/crons.ts` (16-21): el E2E ya corre sin clave y asigna así.
- Matiz, también en el código: antes del primer intento del job, la orden está en
  `geocodificacion_en_curso`, que **sí** bloquea. Se desbloquea cuando el drenador corre ese job una
  vez (el cron corre cada minuto).
- La caché de plataforma (`geocode_cache`) se consulta **antes** que la credencial (152-163): una
  dirección ya buscada por cualquier empresa obtiene ubicación aunque esta no tenga clave. Queda como
  pregunta abierta 2 de `requirements.md`, y mientras tanto no se cambia.
- La salud de la geocodificación (ficha 401) sigue avisando al maestro de una caída por
  configuración. Con SL-36, ese aviso es justo «configura Google Maps».
- Esa salud va **por empresa** (R42, R43): la política de `jobs` está abierta hasta SL-19, así que
  `contarFallosConfigDesde` y `revivirFallosConfig` (`lib/repositories/GeocodeSaludRepository.ts`)
  filtran por la `organizacion_id` del job en curso, sacada del propio job (`empresaDelJob`). Un job
  sin empresa no se revive, no se cuenta y no avisa (`notificacion.organizacion_id` es NOT NULL).
  Sin índice nuevo: las dos consultas van por `jobs_geocodificacion_estado_updated_idx`.

Texto de «qué deja de funcionar» (catálogo, R31): «Las órdenes nuevas se quedan sin ubicación. Se
pueden asignar igual, pero no aparecen en el mapa y la ruta del mensajero no las ordena por
cercanía. Las direcciones que la app ya conocía siguen ubicándose.»

### 7.2 ¿Qué datos pide la optimización de rutas por empresa? → LA CLAVE JSON DE UNA CUENTA DE SERVICIO

Evidencia:
- `lib/auth/google-sa-token.ts` (312-365): el selector tiene tres modos.
  - **ADC** solo sirve en local, con la identidad de quien desarrolla.
  - **WIF** federa la identidad OIDC del despliegue de Vercel **de la plataforma** con un pool de
    GCP. Para que fuese de cada empresa, el cliente tendría que crear en su proyecto un pool que
    confíe en el emisor de nuestro equipo de Vercel. Es inviable sin ayuda y ata al cliente a nuestra
    infraestructura.
  - **JWT-bearer** pide `project_id`, `client_email` y `private_key`: los tres vienen en el archivo
    JSON de clave que Google Cloud deja descargar de una cuenta de servicio.
- `lib/config/route-optimization.ts` (10-14): Route Optimization no acepta API key. La clave de Maps
  no sirve.
- `lib/clients/google-routes.ts` (187-188): el trazado usa el mismo `getToken`. Una sola credencial
  cubre la optimización y el trazado.
- `lib/clients/fallback-route-optimization.ts`, con `optimizacion-ruta-handler.ts` (111-118): sin
  credencial (`RutaNoConfiguradoError`) la ruta cae al orden local Haversine. **Se degrada, no se
  bloquea.**

Decisión técnica:
- El formulario pide **un solo campo**: el contenido del JSON de la clave.
- El service lo valida con zod (`type: "service_account"`, `project_id`, `client_email`,
  `private_key`) y lo cifra **entero** como un secreto.
- `project_id` y `client_email` se copian además a `datos_publicos` para mostrarlos.
- En producción el modo es siempre JWT-bearer. ADC y WIF se retiran (§9.2).

Riesgo **no verificado**: hay organizaciones de Google Cloud que, por política, no dejan crear
claves de cuenta de servicio (`iam.disableServiceAccountKeyCreation`). Un cliente así no puede
obtener la credencial. Su ruta se ordena con el cálculo aproximado, igual que sin integración. La
guía lo dice. No exige otra pregunta al humano, porque el comportamiento ya está definido y es el de
«recomendado».

Texto de «qué deja de funcionar»: «La ruta de cada mensajero se ordena con un cálculo aproximado en
línea recta, sin calles ni tráfico, y el mapa no dibuja el trazado.»

### 7.3 Lo que deja de funcionar en los otros dos (evidencia para el catálogo)

- **WhatsApp.**
  - Lanzan `WhatsappNoConfiguradoError` todos los consumidores de `loadWhatsappConfig`: envíos
    automáticos (ficha 474), chat (109), bienvenida, plantillas y su sincronización, y la descarga de
    adjuntos del chat (§9.1).
  - Texto: «No salen los avisos automáticos a los clientes, no hay chat con ellos, no se envía el
    mensaje de bienvenida y no se pueden crear ni sincronizar plantillas.»
- **Asistente.**
  - `AnthropicAsistenteClient` devuelve `sin_credencial` antes de llamar
    (`lib/clients/anthropic-asistente.ts`, 231).
  - Texto: «El panel del asistente dice que no está configurado. La ayuda escrita de cada pantalla
    sigue disponible.»

La marca «requerido» o «recomendado» de cada servicio la decide el humano: es la pregunta abierta 1.
Mientras tanto, el catálogo lleva la propuesta.

## 8. Catálogo de servicios (`lib/types/integraciones.ts`)

| Servicio | Campos del formulario | Secretos | `datos_publicos` (zod) | Guía |
|---|---|---|---|---|
| `whatsapp` | nombre visible, Phone Number ID, WABA ID, token de acceso, App Secret | `token_acceso`, `app_secret` | `nombreVisible`, `wabaId`, `telefonoVisible`, `nombreVerificado` (+ `whatsapp_numero_id` en su columna) | `/ayuda/oficina/integracion-whatsapp` |
| `google_maps` | clave de API | `clave_api` | — | `/ayuda/oficina/integracion-google-maps` |
| `optimizacion_rutas` | JSON de la clave de la cuenta de servicio | `clave_cuenta_servicio` | `proyectoId`, `cuentaServicio` | `/ayuda/oficina/integracion-optimizacion-rutas` |
| `asistente` | clave de API | `clave_api` | — | `/ayuda/oficina/integracion-asistente` |

Cada entrada lleva además `marca`, `queDejaDeFuncionar` (§7) y los textos de cada motivo de prueba
fallida. Es la **única** fuente de esos textos: la pantalla, el aviso de desconexión y los tests leen
el catálogo, y el test de R31 afirma los literales del catálogo contra el texto del design (no contra
su propia fuente).

## 9. Consumidores: de leer el entorno a leer la empresa (R23)

### 9.1 Mapa completo

Inventario hecho con Grep sobre `app/`, `lib/` y `e2e/` de los cargadores (`loadWhatsappConfig`,
`loadWhatsappWebhookConfig`, `loadGeocodeConfig`, `loadRouteOptimizationConfig`,
`loadAsistenteConfig`, `construirTokenProvider`) y de las variables. Cada fila es un archivo que
**cambia**.

| Servicio | Consumidor | Hoy | Con SL-36 |
|---|---|---|---|
| WhatsApp | `lib/config/whatsapp.ts` | lee 5 variables de credencial | `whatsappConfigDe(credencial, datosPublicos)`, puro. Se quedan en el entorno solo `WHATSAPP_API_VERSION`, `…_TEMPLATE_CATEGORY` y `…_TEMPLATE_LANG`, que no son claves. Desaparece `loadWhatsappWebhookConfig` |
| WhatsApp | `lib/clients/whatsapp-app-id.ts` | `CACHE_PROCESO` único por proceso y anulación `WHATSAPP_APP_ID` | caché indexada por `organizacionId` (R28); sin anulación por entorno |
| WhatsApp | `lib/services/jobs/whatsapp-envio-deps.ts` | `loadWhatsappConfig()` | `credenciales.leer("whatsapp")`. `sin_configurar` o `ilegible` dan `WhatsappNoConfiguradoError` (recuperable, R24) |
| WhatsApp | `lib/services/jobs/whatsapp-chat-envio-handler.ts`, `whatsapp-bienvenida-handler.ts`, `whatsapp-template-sync-handler.ts` | `loadWhatsappConfig()` perezoso | igual que la fila anterior, dentro del job (que ya corre en `conEmpresa`) |
| WhatsApp | `lib/services/jobs/whatsapp-envio-{programado,evento,ejecucion,reintento,mantenimiento}-handler.ts` | vía `buildEnviosWhatsappDeps` | sin cambio de código si `buildEnviosWhatsappDeps` pasa a ser asíncrono. Se revisan sus llamadas |
| WhatsApp | `lib/actions/chat-whatsapp.ts` | `loadWhatsappConfig()` (líneas 65 y 248) | credencial de la empresa de la sesión; `sin_configurar` da el mensaje de R24 |
| WhatsApp | `lib/actions/plantillas.ts`, `lib/actions/plantillas-sync.ts`, `lib/actions/envios-whatsapp.ts` | `loadWhatsappConfig()` / `buildEnviosWhatsappDeps` | igual |
| WhatsApp | `lib/services/whatsapp/construir-template-port.ts`, `lib/services/PlantillaMensajeService.ts`, `lib/services/whatsapp/documento-ejemplo-plantilla.ts` | reciben `config` y el resolutor de app id | reciben la config de la empresa; el mensaje `sin_credencial` deja de nombrar variables |
| WhatsApp | `app/api/cron/sync-plantillas-whatsapp/route.ts` | una config global para todas las empresas | dentro de `paraCadaEmpresa`, cada empresa con su credencial. `sin_configurar` salta esa empresa (R24) |
| WhatsApp | `app/api/chat/media/[mensajeId]/route.ts` | `loadWhatsappConfig()` | credencial de la empresa de la sesión |
| WhatsApp | `app/api/webhooks/whatsapp/route.ts`, `lib/types/whatsapp-webhook.ts` | config global y `comoPlataforma("SL-36")` | §10 |
| Maps | `lib/config/geocode.ts` | `GOOGLE_MAPS_API_KEY` | solo `GEOCODE_TIMEOUT_MS` |
| Maps | `lib/services/GeocodificacionService.ts` | `config.GOOGLE_MAPS_API_KEY === null` | recibe `ICredencialesIntegracion` y una fábrica del cliente. `sin_configurar` lanza el mismo `GeocodeNoConfiguradoError` marcado (R25), con texto «Google Maps no está configurado en la empresa». `REQUEST_DENIED` además llama a `marcarRechazo` (R30) |
| Maps | `lib/services/jobs/geocodificacion-handler.ts` | arma un cliente con la clave global al registrar el handler | arma el cliente por job, con la credencial de la empresa del job |
| Rutas | `lib/config/route-optimization.ts` | lee las piezas de SA, WIF y ADC | solo los parámetros `RUTA_*`, `ROUTE_OPT_TIMEOUT_MS` y `ROUTES_ROUTING_PREFERENCE`. `GestionOrdenRepository` y `OrdenRepository` leen solo `RUTA_DEBOUNCE_S` y **no cambian** |
| Rutas | `lib/auth/google-sa-token.ts` | selector ADC / WIF / JWT | solo JWT-bearer, construido desde la credencial de la empresa |
| Rutas | `lib/auth/google-wif-token.ts`, `lib/auth/google-adc-token.ts` | modos de plataforma | **se borran**, con sus tests |
| Rutas | `lib/auth/google-token-shared.ts` | errores compartidos | `RutaNoConfiguradoError` deja de nombrar variables |
| Rutas | `lib/services/jobs/optimizacion-ruta-handler.ts` | `tokenProvider ??=` **compartido por todos los jobs del proceso** | el proveedor de token se resuelve por job y se cachea por `organizacionId` (R28). Hoy, con credenciales por empresa, ese `??=` le prestaría el token de A a B |
| Asistente | `lib/config/asistente.ts` | `ANTHROPIC_API_KEY` | sale la clave; `ASISTENTE_MODELO`, el tope y el timeout se quedan (son de producto, no credenciales) |
| Asistente | `app/api/asistente/route.ts` | `loadAsistenteConfig()` | clave de la empresa de la sesión. Sin empresa (superadmin) o `sin_configurar` da `sin_credencial`, con el texto nuevo de R27, **antes** de incrementar el uso |
| Todos | `app/api/cron/procesar-jobs/route.ts` | construye los services de geocodificación y rutas con la config global | los mismos builders, pero con `CredencialesIntegracionService`; la credencial se lee dentro de `conSuEmpresa` |
| Todos | `e2e/_escenarios/crons.ts` | el mensaje cita `GOOGLE_MAPS_API_KEY` | el mensaje cita la integración. El E2E sigue sin Maps |
| Todos | `.env.example`, `README.md` | declaran las variables | se retiran; se añaden `INTEGRACIONES_CLAVES_CIFRADO`, `INTEGRACIONES_CLAVE_ACTIVA` y `INTEGRACIONES_PRUEBAS_POR_MINUTO` |

### 9.2 Lo que se retira

- **Modos ADC y WIF.** Son identidades de la plataforma: dejarlos es prestar credencial, y la
  decisión dice que no.
  - Consecuencia en desarrollo local: quien desarrolla configura la integración de su empresa de
    prueba como cualquier cliente.
- **`WHATSAPP_APP_ID`.** Era la anulación de plataforma del id de la app de Meta. El id sale del token
  de cada empresa (`GET /app`), como ya hacía el resolutor.

### 9.3 Variables retiradas (R41)

`WHATSAPP_CLOUD_TOKEN`, `WHATSAPP_NUMERO_ID`, `WHATSAPP_WABA_ID`, `WHATSAPP_WEBHOOK_VERIFY_TOKEN`,
`WHATSAPP_APP_SECRET`, `WHATSAPP_APP_ID`, `GOOGLE_MAPS_API_KEY`, `GOOGLE_ROUTE_OPT_PROJECT_ID`,
`GOOGLE_CLOUD_PROJECT_ID`, `GOOGLE_ROUTE_OPT_SA_EMAIL`, `GOOGLE_ROUTE_OPT_SA_PRIVATE_KEY`,
`GOOGLE_ROUTE_OPT_USE_ADC`, `GOOGLE_WIF_PROJECT_NUMBER`, `GOOGLE_CLOUD_PROJECT_NUMBER`,
`GOOGLE_WIF_POOL_ID`, `GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_ID`, `GOOGLE_WIF_PROVIDER_ID`,
`GOOGLE_CLOUD_WORKLOAD_IDENTITY_POOL_PROVIDER_ID` y `ANTHROPIC_API_KEY`.

La guardia nueva `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`:
- recorre `app/`, `lib/` y `scripts/` y falla si una de esas cadenas aparece leída de `process.env`;
- falla también si `.env.example` las declara;
- trae su autocomprobación con una fuente inventada, para que no quede ciega.

**Fuera de alcance.** La clave `WEBHOOK_SECRET` de feature 99 (`lib/crypto/webhook-secret-cipher.ts`)
cifra el secreto de los webhooks **salientes** de la empresa. No es una credencial de los cuatro
servicios y se queda como está.

## 10. Webhook de WhatsApp: una URL, enrutado por número

URL única: `/api/webhooks/whatsapp`. Es la que ya existe y la que Meta tiene configurada.

**GET (R19).**
1. Calcula `resumen(hub.verify_token)`.
2. `IIntegracionEnrutadoRepository.porResumenVerificacion(resumen)` devuelve `{organizacionId, integracionId} | null`.
3. Con resultado, devuelve el `challenge` y, en `conEmpresa`, anota `ultimo_webhook_at`.
4. Sin resultado, responde 403.

Comparar por resumen es seguro sin sal, porque el token es aleatorio de 32 bytes (QC inv. 16).

**POST (R20, R21).**
1. Lee el cuerpo crudo.
2. Lo parsea con zod **solo** para extraer `entry[].changes[].value.metadata.phone_number_id`. Hoy
   el parser descarta `metadata`, así que `lib/types/whatsapp-webhook.ts` lo conserva.
   - Mientras la firma no se verifica, nada de ese parseo produce efectos.
3. `porNumero(numerosIds)` traduce cada número a `{organizacionId, integracionId}`.
4. Por cada empresa, en `conEmpresa`:
   - lee su `app_secret` con `ICredencialesIntegracion`;
   - verifica la firma `X-Hub-Signature-256` del cuerpo crudo en tiempo constante;
   - si es válida, ingiere solo las `entry` de sus números (`ChatWhatsappService` y
     `EntregaEstadoService`, igual que hoy) y anota `ultimo_webhook_at`.
5. Con al menos una empresa válida responde 200, con conteos. Si no, responde 401.
6. Una firma inválida no cambia el estado de la integración: no se distingue un atacante de un
   secreto mal pegado. Al log va solo un conteo.

**Lo que desaparece:**
- `repartirPorEmpresa`, que leía órdenes, hilos, mensajes y entregas de **todas** las empresas para
  adivinar el dueño de cada evento;
- la entrada `app/api/webhooks/whatsapp/route.ts` (ficha SL-36) de `EXCEPCIONES_DE_PLATAFORMA`.

Con el número, la empresa es un hecho, no una inferencia. Los «mensajes sin empresa» de la
heurística dejan de existir.

**La única lectura en plataforma (R22)** vive en `lib/repositories/IntegracionEnrutadoRepository.ts`.
- Entra en `EXCEPCIONES_DE_PLATAFORMA` con la ficha SL-36 y el motivo «webhook de WhatsApp: traducir
  un número o un resumen de token a su empresa, sin sesión».
- Selecciona solo `id` y `organizacion_id`. Un test afirma el `select`.
- Es el mismo patrón que `lib/api/api-key-request.ts`.
- La guardia `plataforma-solo-en-lista` sigue haciendo cumplir que el archivo de la ruta ya no llame
  a `comoPlataforma`.

**Alternativa descartada: una función SQL `SECURITY DEFINER`** que devuelva la empresa de un número.
- No evita la excepción: llamarla es SQL a mano sin empresa, y la extensión lo corta con
  `EmpresaNoResuelta` antes de ejecutarlo.
- Saca la regla de TypeScript a SQL, donde las guardias del repo no la ven.

**Alternativa descartada: URL por integración** (QC: `/webhook/<id>`). La decisión cerrada exige una
sola URL.

## 11. Estado para el superadmin (R37, lo consume SL-26)

- `EmpresasPlataformaRepository.estadoIntegraciones()`. El archivo ya está en las excepciones de
  SL-32, así que no se añade ninguna.
- Selecciona `organizacion_id`, `servicio` y `estado`, y nada más. Completa con «sin_configurar» los
  servicios sin fila.
- El service `EmpresasPlataformaService.estadoIntegraciones(actor)` exige `exigirSuperadmin(actor)`
  y devuelve `{ organizacionId, servicio, estado }[]`.
- Sin UI: la pinta SL-26.
- El superadmin no tiene ninguna operación de cambio: R6 lo rechaza en `IntegracionesService`.

## 12. Rotación: `pnpm integraciones:recifrar [--solo-contar]` (D10)

`scripts/recifrar-integraciones.ts` hace de cableado, como `scripts/arranque-superadmin.ts`. La regla
vive en `RecifradoIntegracionesService`:

1. `paraCadaEmpresa(async (org) => …)`: cada empresa en su contexto, sin excepción nueva.
2. Por cada fila y cada secreto, calcula `versionDe(valor)`.
   - Si no es la activa (y no es `--solo-contar`), descifra con su versión y recifra con la activa,
     en una transacción por fila.
   - Si descifrar falla, cuenta el valor como ilegible y no lo toca.
3. Imprime `versión → cuántos valores quedan` e `ilegibles: n`. Nunca imprime valores, ids de
   integración ni nombres de empresa. El código de salida es 0, o 1 si hubo errores de base.
4. La versión vieja se retira del entorno cuando su conteo llega a 0. Es un paso manual documentado
   en la cabecera del script.

Lo corre el superadmin, o quien opera la plataforma con acceso a la base, igual que el arranque.

**Alternativa descartada: recifrar «en caliente» al leer cada credencial.** Una integración que
nadie usa nunca se recifra, así que la versión vieja no se podría retirar jamás. Era la deuda de QC
(decisiones D10).

## 13. Rastro (D5)

- Valores nuevos de `HistorialAccionTipo`: `integracion_conectada`, `integracion_actualizada`,
  `integracion_probada`, `integracion_token_regenerado` e `integracion_desconectada`.
- Valor nuevo de `HistorialAccionEntidad`: `integracion`.
- Categoría nueva `cambia_integraciones` en `lib/types/historial-accion.ts`, con su etiqueta, y el
  total del catálogo actualizado.
- Cada mutación llama a `appendAccion(tx, …)` dentro de su transacción. Esa transacción la abre el
  repositorio de integraciones; es el único sitio donde se llama.
  - `entidadEtiqueta` es el nombre del servicio.
  - En `integracion_probada`, `valorNuevo` es `"ok"` o el código del motivo.
- Un alta con prueba fallida no deja fila de historial: no existe la integración (R13). Sí cuenta
  para el límite (§6).
- La guardia `historial-accion-punto-unico` sigue vigente.

**Alternativa descartada: columnas `creado_por` y `actualizado_por` en `integracion`.** Solo guardan
al último autor, no dicen quién probó ni quién desconectó, y desaparecerían con el borrado físico.

## 14. Pantalla y guías

- Ruta `app/(app)/configuracion/integraciones/page.tsx`. Solo maestro (§1).
  - Una tarjeta por servicio, con lo de R34.
  - Formulario manual por servicio; los secretos son `type="password"`, sin valor inicial (R36).
  - Enlace a la guía (R35).
  - Diálogo de confirmación de desconexión con la marca y «qué deja de funcionar» (R31).
  - El token de verificación y la URL del webhook se muestran una sola vez (R18).
- Se añade al menú en `lib/auth/menu-visibility.ts`, junto a `/configuracion/api`.
- **Es una pantalla nueva: pasa por `/design` antes de implementarse, con aprobación humana**
  (tasks T7.0). Este design no fija píxeles ni componentes.
- Guías, en `docs/ayuda/oficina/`, con el frontmatter de `docs/ayuda/README.md`:
  - `configuracion-integraciones.md`: la pantalla, los estados, desconectar y el límite de pruebas;
  - `integracion-whatsapp.md`, `integracion-google-maps.md`, `integracion-optimizacion-rutas.md` e
    `integracion-asistente.md`: dónde entrar, qué crear, qué copiar y en qué campo pegarlo, y terminan
    en «Lo que esta pantalla NO hace».
- **Las guías describen consolas de terceros** (Meta, Google Cloud, Anthropic), que no están en el
  código. Por la regla del README («solo se afirma lo verificado»), cada paso externo cita en
  `fuentes` la URL de la documentación oficial del proveedor. El humano los revisa antes de publicar
  (T8.2). La de rutas advierte la política que impide crear claves y la API que hay que habilitar
  (§7.2).

## 15. Doble del proveedor para el E2E

- `lib/clients/probadores/probador-doble.ts` acepta los secretos que empiezan por `valido-` y rechaza
  el resto.
- El composition root (`lib/actions/integraciones.ts`) lo elige solo si
  `INTEGRACIONES_PROBADOR_DOBLE=1` **y** `VERCEL_ENV !== "production"`. Hay un test para cada mitad.
- `playwright.config.ts` fija la variable en `webServer.env`.

**Alternativa descartada: E2E contra los proveedores reales.** Exige credenciales reales en CI y red
hacia Meta, Google y Anthropic: es frágil y filtra secretos al runner.

**Alternativa descartada: sembrar la integración por fixture y no probar el alta.** Deja sin E2E el
camino «alta buena», que es justo el flujo crítico.

## 16. Resumen de alternativas descartadas

| # | Alternativa | Por qué no |
|---|---|---|
| A | Una tabla por proveedor (D6) | §2.1 |
| B | Limitador de pruebas en memoria (`reset-rate-limit.ts`) | En Vercel cada instancia tiene su memoria: N instancias multiplican el límite por N. Pasa a la base (§6) |
| C | Borrado lógico (D7) | §2.2 |
| D | Función `SECURITY DEFINER` / URL por integración para el webhook | §10 |
| E | Conservar WIF/ADC como «respaldo de plataforma» para rutas | Es prestar credencial de plataforma, contra la decisión cerrada (§9.2) |
| F | Recifrar al leer | §12 |
| G | Reutilizar `webhook-secret-cipher.ts` | Sin datos asociados ni anillo de claves (Lo que ya existe) |

## 17. Dependencias

Ninguna nueva. Se usa `node:crypto` (AES-256-GCM, SHA-256, `randomBytes`, `timingSafeEqual` y
`createSign` para el JWT, como ya hace el repo), zod y Prisma. No hace falta fila en
`docs/dependencias.md`.

## 18. Riesgos y lo no verificado

- **No verificado:**
  - si Graph responde a `GET /{waba_id}?fields=id` con un token de sistema sin el permiso
    `whatsapp_business_management`. Si no responde, la prueba de WABA pasa a `GET /{waba_id}/phone_numbers`;
  - el endpoint exacto de Anthropic `GET /v1/models`, que se confirma en T4.4 con context7;
  - la política de organización de Google sobre claves de cuenta de servicio (§7.2).
- **Despliegue.** Al mergear, las empresas que hoy funcionan con las claves de plataforma se quedan
  sin los cuatro servicios hasta que su maestro los configure. Es la consecuencia directa de «la
  plataforma no presta claves».
  - El leader debe avisarlo antes del PR a `prod`.
  - Hoy no hay empresas cliente en producción («app vacía»), así que el impacto esperado es nulo, pero
    se confirma antes.
- **Orden del despliegue.** Primero `INTEGRACIONES_CLAVES_CIFRADO` e `INTEGRACIONES_CLAVE_ACTIVA` en
  Vercel; luego las migraciones; luego el código. Sin las variables, la pantalla responde
  `unexpected` al guardar (R4), pero la app arranca.
