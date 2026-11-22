# impl SLT-227 «Cobro automático: interfaz de proveedores y adaptador de Rebill»

Base de la feature: `servi_logistic_slt227` (URL en `scratchpad/dburl_SLT227`, fuera del repo), migrada hasta dev,
con seed, y ahora hasta `20261127120000_cobro_proveedor_credencial`.

## T0 — Comprobaciones (2026-11-21)

### T0.1 — el prefijo de la migración
Lo comprobó el leader: la migración más alta de `origin/dev` y de `origin/feature/SLT-121-planes-mora-congelamiento`
(PR #264) es `20261126120100_mora_congelamiento`, y ninguna rama remota tiene una mayor. **Prefijo fijado:
`20261127120000_cobro_proveedor_credencial`** (sin «125»). En este worktree, `ls db/migrations | tail` acaba en
`20261126120000_mora_enums`, `20261126120100_mora_congelamiento`.

### T0.2 — `"plataforma"` como `organizacionId` de la bóveda
- `exigirContexto` (`lib/crypto/boveda-integraciones.ts:57-62`) solo pide tres textos no vacíos: `"plataforma"`
  pasa sin tocar la bóveda.
- **Matiz que corrige design §8.1:** la base **no** fija `organizacion.id` como `uuid`. La migración lo crea como
  texto: `db/migrations/20261022130000_organizacion_y_rol_app/migration.sql:19` → `"id" TEXT NOT NULL,`. El `uuid`
  sale de Prisma: `db/schema.prisma:5914` → `id String @id @default(uuid())`, y el alta de empresa
  (`lib/repositories/OrganizacionRepository.ts:78`) no pasa `id`, así que siempre es un `uuid`. Ningún código de
  `lib/`, `db/` ni `scripts/` crea una empresa con un id escrito a mano que valga `"plataforma"` (grep).
- Aun si una empresa se llamara `"plataforma"`, no habría colisión: el contexto es el trío
  `(organizacionId, integracionId, campo)` y `integracionId` sería el id de una fila de `integracion` (texto, generado
  por el servicio) que tendría que coincidir con el `uuid` de una fila de `cobro_proveedor_credencial`.
- **Conclusión:** se sigue con `ORGANIZACION_PLATAFORMA_EN_BOVEDA = "plataforma"` sin cambios. No cambia T1/T2.

### T0.3 — tres guardias ante una tabla de plataforma con un único sin `organizacion_id`
- `unicos-por-empresa` (`tests/unit/guards/unicos-por-empresa.guardia.test.ts`): (a) y (c) miran solo
  `MODELOS_DE_NEGOCIO` (`unicosDeNegocio` filtra por esas tablas). Una tabla de `MODELOS_DE_PLATAFORMA` no entra.
  **Pero** `unicosFinales` recorre TODAS las migraciones y lanza si cuenta un `UNIQUE` que no sigue: solo reconoce
  `CREATE UNIQUE INDEX` y `ALTER TABLE … ADD CONSTRAINT … UNIQUE`; un `CONSTRAINT … UNIQUE (…)` dentro del
  `CREATE TABLE` (como lo escribe design §1) lo haría lanzar. **Por eso el único va como
  `CREATE UNIQUE INDEX "cobro_proveedor_credencial_trio_key"`**, como `cobro_webhook_evento_proveedor_log_key`.
  Para `ON CONFLICT (proveedor, pais_id, entorno)` (design §8.2) es equivalente.
- `rls-por-empresa`: comprueba solo las tablas de `MODELOS_DE_NEGOCIO` (y las de empresa opcional). Nada que hacer.
- `scripts/verificar-rls-despliegue.ts` (punto 6): cuenta políticas `*_por_empresa` y triggers `sme_*` /
  `*_sin_cambio_de_empresa` contra `MODELOS_DE_NEGOCIO`. La tabla nueva no tiene políticas, y su única FK es a
  `pais` (de plataforma), así que no lleva trigger de misma empresa: `TRIGGERS_MISMA_EMPRESA = 186` no se mueve.
- **Decisión:** **no entran** `tests/unit/guards/_unicos-sin-empresa.ts` ni `scripts/verificar-rls-despliegue.ts`.
  Tampoco hace falta nombrar el único en `docs/architecture.md` como global (T5.2): (c) solo mira los globales de
  negocio.

### T0.4 — `RecifradoIntegracionesService.empresa` con el repositorio como parámetro
- Cambio de firma hecho: `empresa(organizacionId, activa, soloContar, repositorio = this.deps.repositorio)`, y el
  `listarSecretos` / `reemplazarSecretos` usan ese `repositorio`. El resumen de las empresas no cambia (la llamada
  de `ejecutar` no pasa el cuarto argumento).
- `pnpm exec vitest run tests/integration/db/recifrado-integraciones.test.ts` con la base de la feature:
  `Test Files 1 passed (1) · Tests 3 passed (3)`.

## T1 — El modelo (2026-11-21)

- **T1.1** `db/migrations/20261127120000_cobro_proveedor_credencial/{migration.sql,down.sql}` (design §1, §1.1): la
  tabla, los CHECK de proveedor, entorno y forma cifrada (la expresión de `integracion_secretos_cifrados` literal, más
  `secretos <> '{}'`), el único del trío como `CREATE UNIQUE INDEX` (ver T0.3), la FK a `pais` `RESTRICT/RESTRICT`
  (como `organizacion_pais_id_fkey`), RLS sin políticas y `REVOKE ALL … FROM servi_app`. El `down` aborta con filas
  (`RAISE EXCEPTION 'rollback SLT-227: …'`) y si no, `DROP TABLE`.
  - `pnpm exec prisma migrate deploy` en la base de la feature: «All migrations have been successfully applied».
  - La ida y vuelta (down sin filas → up) corre en el test, dentro de una transacción revertida: el catálogo de la
    tabla (columnas, restricciones, índices, RLS, políticas y privilegios) queda idéntico.
- **T1.2** `db/schema.prisma`: `model CobroProveedorCredencial` (sin default en `id`; `createdAt` con
  `dbgenerated("(now() AT TIME ZONE 'UTC'::text)")`), y `credencialesCobro` en `Pais`. `MODELOS_DE_PLATAFORMA` gana
  `{ modelo: "CobroProveedorCredencial", tabla: "cobro_proveedor_credencial" }`.
  - `pnpm exec prisma generate` ok. `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma`:
    «This is an empty migration» (el esquema y la base coinciden).
  - `pnpm run typecheck`: sin errores. Guardias `organizacion-en-modelos`, `unicos-por-empresa`, `rls-por-empresa`,
    `plataforma-solo-en-lista`, `sql-a-mano-por-empresa`: `Test Files 5 passed (5) · Tests 75 passed (75)`.
- **T1.3** `tests/integration/db/cobro-proveedor-credencial.test.ts`: `Test Files 1 passed (1) · Tests 7 passed (7)`.
  - **Mutación (sin el CHECK):** `ALTER TABLE … DROP CONSTRAINT cobro_proveedor_credencial_secretos_cifrados` en la
    base de la feature → `Tests 2 failed | 5 passed (7)`: cae «R5: el dueño no puede escribir un secreto en claro…»
    (`enClaro: null` en vez de `23514`) y la ida y vuelta (el catálogo ya no coincide). Restaurado el CHECK con la
    expresión del archivo → `7 passed (7)`.

## T2.1 — Tipos y puerto (2026-11-21)

- `lib/types/cobro.ts`: `ENTORNOS_COBRO`, `EntornoCobro`, `OperacionProveedor`, `CodigoErrorProveedor`,
  `OpcionesProveedorCobroError` y `ProveedorCobroError` (mensaje `"<proveedor> <operacion>: <codigo>"` + `(HTTP n)`;
  sin `cause` ni cuerpo; con `operacion: null`, `"<proveedor>: <codigo>"`).
- `lib/interfaces/external/IProveedorCobro.ts`: `IConsultaPagoProveedor` (la firma de SLT-226 sin cambios),
  `IProveedorCobro extends IConsultaPagoProveedor`, `CrearEnlaceEntrada`, `EnlaceDelProveedor`, `AvisoFirmado`,
  `DevolverEntrada`, `EstadoDevolucion`, `DevolucionDelProveedor`, `TrioCredencialCobro` y `LeerCredencialesCobro`.
- `lib/services/CobroIntentoService.ts` (3 líneas) y `tests/unit/services/cobro-intento-service.test.ts` (4 líneas,
  solo tipos): `IProveedorCobro` → `IConsultaPagoProveedor`. Ninguna afirmación cambia (R27).
- `pnpm run typecheck`: sin errores. `eslint` de los archivos tocados: sin salida. `cobro-intento-service.test.ts`:
  `Test Files 1 passed (1) · Tests 45 passed (45)`.
- **BLOQUEO (no cerrada):** la guardia `tests/unit/guards/censo-order-status-rename.test.ts` (455/R40) cae con
  `lib/interfaces/external/IProveedorCobro.ts:61 rechazada`: `"rechazada"` es un código anterior de `order_status`
  (`CODIGO_VIGENTE_DE_ANTERIOR`) y la guardia lo prohíbe como literal en todo `lib/`, `tests/`, `e2e/`. El literal sale
  tal cual de design §3 (`EstadoDevolucion = "pendiente" | "aprobada" | "rechazada"`) y §6.4 (`cancelled` ⇒
  `rechazada`). Pide decisión: (a) renombrar el valor en el spec (p. ej. `"denegada"`), o (b) una entrada en
  `EXCEPCIONES_455` para `IProveedorCobro.ts` y, en T4.2, `rebill-proveedor.ts` y su test, con el número exacto.
  No lo resolví por mi cuenta.

## Guardias corridas (las que leen migraciones, más `pais-sin-*`, `credenciales*`, `cobro*`)
28 archivos: `Tests 1 failed | 496 passed (497)`. El único rojo es el bloqueo de T2.1, arriba.

## Mapa `R<n>` → test (lo de esta tanda)
| R | Test |
|---|---|
| R5 (CHECK, único) | CB «R5: el dueño no puede escribir un secreto en claro, un valor que no es texto ni un objeto vacío (23514)» y «R5: un trío, una fila — … 23505 …» |
| R6 | CB «R6: como servi_app, leer y escribir cobro_proveedor_credencial da 42501 (SELECT, INSERT, UPDATE y DELETE)» |
| migración | CB «ida y vuelta: …» y «el down aborta con filas y no borra nada» |
| R27 | CI, sin cambios de afirmaciones (45 passed) |

Veredicto: T0 y T1 cerradas en verde; T2.1 hecha y en verde en typecheck y en su test, pero no cerrada por el choque
de `"rechazada"` con la guardia 455/R40, que pide decisión.

## T2.2–T2.6 — Las credenciales (2026-11-21)

**Archivos:**
- nuevos: `lib/interfaces/repositories/ICobroCredencialRepository.ts`, `lib/repositories/CobroCredencialRepository.ts`,
  `lib/interfaces/services/ICobroCredencialService.ts`, `lib/services/CobroCredencialService.ts`,
  `scripts/cobro-credencial-guardar.ts`, `tests/unit/services/cobro-credencial-service.test.ts`;
- modificados: `lib/db/excepciones-aislamiento.ts` (entrada `SL-36` del repositorio), `package.json`
  (`"cobro:credencial"`, un script, no una dependencia), `lib/services/RecifradoIntegracionesService.ts`,
  `scripts/recifrar-integraciones.ts`, `tests/integration/db/cobro-proveedor-credencial.test.ts` (bloque T2.4),
  `tests/integration/db/recifrado-integraciones.test.ts` (los casos SL-36 pasan un repositorio de plataforma vacío;
  sus afirmaciones no cambian).

**Decisiones de implementación (dentro del spec):**
- `guardar` del repositorio: `INSERT … ON CONFLICT (proveedor, pais_id, entorno) DO UPDATE … WHERE id = EXCLUDED.id
  RETURNING id`; 0 filas ⇒ `conflicto`. La `23503` ⇒ `pais_no_existe`. `estado` lee solo
  `jsonb_object_keys(secretos)` y la fecha como texto ISO UTC (`to_char`), para no depender de cómo el driver lee un
  `timestamp` sin zona.
- `validation_error` lleva `campos: string[]` (design §8.3: «no repite el valor, solo el nombre del campo»). Una clave
  de más se nombra en genérico (`campo_no_reconocido`), porque la escribió quien llama.
- El lector traduce solo `CredencialIlegibleError` a `ProveedorCobroError("credencial_ilegible")` (con
  `operacion: null`: el lector no sabe qué operación lo pidió); `ConfiguracionBovedaError` y el resto salen tal cual
  (design §4).
- `ORGANIZACION_PLATAFORMA_EN_BOVEDA` vive en `CobroCredencialService.ts` y lo importa el recifrado.
- El comando acepta `--x v` y `--x=v`; una bandera repetida, que falte o cualquier otro argumento ⇒ 1 con «Argumento
  no reconocido o incompleto», sin repetirlo. Una línea de stdin sin `campo=valor` o un campo repetido ⇒ 1.
- `RecifradoDeps.plataforma` es obligatorio; la pasada corre después de `recorrerEmpresas` con el mismo `catch` que
  cuenta en `empresasConError`.

**Salidas (base de la feature, `NODE_OPTIONS=--max-old-space-size=8192`):**
- `pnpm run typecheck`: sin errores (tras cada task).
- `eslint` de cada archivo tocado: sin errores ni avisos.
- T2.2: guardias `plataforma-solo-en-lista` y `sql-a-mano-por-empresa`: `Test Files 2 passed (2) · Tests 26 passed (26)`.
- T2.3 + T2.5: `tests/unit/services/cobro-credencial-service.test.ts`: `Tests 15 passed (15)`.
- T2.4: `tests/integration/db/cobro-proveedor-credencial.test.ts`: `Tests 12 passed (12)` (7 de T1.3 + 5 nuevos).
- T2.6: `tests/integration/db/recifrado-integraciones.test.ts`: `Tests 5 passed (5)` (3 de SL-36 + 2 de R13).
- `tests/guards/guard-dependencias-aprobadas.test.ts`: `2 passed`.
- Pasada final, 10 archivos (los 4 de arriba, `cobro-intento-service`, y las guardias `plataforma-solo-en-lista`,
  `sql-a-mano-por-empresa`, `organizacion-en-modelos`, `credenciales-sin-consola-cruda`,
  `sin-credenciales-de-entorno`, `quitador-comentarios`): `Test Files 10 passed (10) · Tests 179 passed (179)`.

**Mutaciones (una a la vez, revertidas):**
- **5** (contexto de la bóveda sin el id de la fila: `integracionId: "cobro"`): `Tests 1 failed | 11 passed (12)`;
  cae «R7: un secreto copiado a otro trío o a otro campo da credencial_ilegible» («copia entre tríos: expected
  { apiKey: 'sk_test_PRIMERA_227', … } to be an instance of ProveedorCobroError»). Revertida ⇒ `12 passed`.
- **8** (sin la pasada de plataforma): `Tests 2 failed | 3 passed (5)`; caen los dos casos R13 («expected 'Recifrados
  a v2: 3.' to contain 'Recifrados a v2: 5.'» y «expected +0 to be 1» en `empresasConError`). Revertida ⇒ `5 passed`.
- **6** (estado con secretos) la mata el caso unitario «R9: con fila, … y nada más de lo que traiga el repositorio»
  (el servicio copia campo a campo); no se corrió como mutación aparte.

**Mapa `R<n>` → test (lo de esta tanda):**
| R | Test |
|---|---|
| R5 | CB «R5: guardar cifra los dos campos; el lector los devuelve en claro y ninguna columna lleva un valor» |
| R7 | CB «R7: un secreto copiado a otro trío o a otro campo da credencial_ilegible»; CS «crearLectorCredencialesCobro …» |
| R8 | CB «R8: guardar dos veces reemplaza sin otra fila y registra quién y cuándo» y «R8: un país inexistente da pais_no_existe y no escribe nada»; CS «R8: falta un campo, sobra uno o va vacío ⇒ validation_error sin cifrar; wompi ⇒ proveedor_no_disponible» y «R8: una apiKey pk_ o un secretoWebhook sin la forma whsec_ + 64 hex ⇒ validation_error» |
| R9 | CB «R9: estado devuelve los campos y el último cambio, y ningún valor; un trío sin fila, configurada: false»; CS «R9: un trío sin fila ⇒ configurada: false» |
| R10 | CS «R10: maestro, admin, mensajero y tienda reciben forbidden al guardar y al consultar, sin llamadas» |
| R12 | CS «R12: el comando lee los secretos de la entrada estándar, guarda como el superadmin y no imprime ningún valor» y «R12: un argumento desconocido sale con 1 sin repetirlo; sin superadmin, sale con 1» |
| R13 | RC «R13: el recifrado lleva a v2 las credenciales de cobro en v1 y las suma al resumen» |

Veredicto T2.2–T2.6: cerradas en verde; mutaciones 5 y 8 caen como pide el spec.

## T3 — Transporte, entorno y registro (2026-11-21)

**Archivos:**
- `lib/config/cobro.ts` (nuevo): `entornoDeCobro(env = process.env)` por `VERCEL_ENV`, `TIEMPO_MAXIMO_COBRO_MS = 10_000`,
  `ESPERAS_REINTENTO_CONSULTA_MS = [250, 1_000]` y `URL_BASE_REBILL`, una sola URL para los dos entornos.
- `lib/clients/cobro/http-proveedor.ts` (nuevo): `TransporteDeps`, `RespuestaCruda`, `FallaProveedor`,
  `traducirFalla(proveedor, operacion, falla)` (la tabla de R24, pura), `pedirUnaVez`, `pedirIdempotente` (lanza un
  error de programación si el método no es `GET`) y `esperarConTemporizador`.
  - Cada intento lleva su `AbortSignal.timeout`, que corta también la lectura del cuerpo.
  - El cuerpo de una respuesta no `2xx` se cancela sin leerlo (R25).
  - Un `2xx` que no es JSON da `respuesta_invalida`.
  - Nunca se lee el mensaje de la excepción de `fetch`.
- `lib/clients/cobro/registro-proveedores.ts` (nuevo): `RegistroProveedoresCobro.obtener(proveedor, paisId)` y
  `construirRegistroProveedoresCobro()`, con el entorno de R3, `crearLectorCredencialesCobro` de T2.3 con
  `CobroCredencialRepository` y `BovedaIntegraciones`, y `fetch` real.
- `lib/clients/cobro/rebill-proveedor.ts` (nuevo, **esqueleto**): `RebillProveedorCobro` con el constructor de design §6
  y los getters `paisId` y `entorno`. Las cuatro operaciones lanzan `rebill <op>: sin implementar (SLT-227 T4.2)`.
  T4.2 las rellena y les pone los parámetros.
- `tests/unit/clients/cobro-http-registro.test.ts` (nuevo): 39 tests con `fetch` y `esperar` dobles. Usa el host
  inventado `rebill-doble.invalid`, no el de Rebill (R26). Solo el caso de R20 espera de verdad: los 20 ms del
  `AbortSignal.timeout`, que dispara el corte.

**Salidas reales:**
- `pnpm run typecheck`: sin errores en mis archivos. En el último pase salió un único error en
  `tests/unit/services/cobro-credencial-service.test.ts(83,41)` (TS2493), que es el archivo en curso de T2.3/T2.5 y no
  es mío. Con `tsc --noEmit` filtrado sin ese archivo: sin salida.
- `pnpm exec eslint lib/config/cobro.ts lib/clients/cobro/ tests/unit/clients/cobro-http-registro.test.ts`: `No issues found`.
- `pnpm exec vitest run tests/unit/clients/cobro-http-registro.test.ts`: `Test Files 1 passed (1) · Tests 39 passed (39)`.
- Guardias `credenciales-sin-consola-cruda`, `pais-sin-literales`, `censo-order-status-rename`, `censo-simpe`,
  `sin-credenciales-de-entorno`, `plataforma-solo-en-lista`, `organizacion-en-modelos`,
  `etiquetas-geograficas-sin-literal` y `quitador-comentarios`: `Tests 1 failed | 152 passed (153)`. El único rojo es
  el `IProveedorCobro.ts:61 rechazada` de T2.1 (455/R40), que ya estaba y no es de T3.

**Mutaciones (design §12), una a la vez, revertidas y con el test otra vez en verde:**
- **Mutación 1 (sin reintentos en lo que tiene efecto):** `devolver` no existe hasta T4.2, así que la apliqué al
  transporte. `pedirUnaVez` delega en `pedirIdempotente` y reintenta → `Tests 4 failed | 35 passed (39)`. Caen las
  cuatro filas de «R22: … 1 petición … e incierto» (`devolver` y `crearEnlace`, con 503 y con fallo de red). T4.2
  repite la mutación en el adaptador contra el doble.
- **Mutación 2 (reintentar ante un 401):** en `pedirIdempotente`, `(!reintentable && estadoHttp !== 401)` →
  `Tests 1 failed | 38 passed (39)`. Cae «R23: consultarPago con 401 ⇒ 1 petición y credencial_rechazada».

**Mapa `R<n>` → test (HR = `tests/unit/clients/cobro-http-registro.test.ts`):**
| R | Test |
|---|---|
| R2 | HR «R2: el registro da el adaptador de rebill para CR; wompi y global66 dan proveedor_no_disponible sin leer credenciales» (proveedor, país, entorno; `operacion: null`; 0 lecturas y 0 peticiones) |
| R3 | HR «R3: el entorno es produccion solo con VERCEL_ENV=production» (`production`, `preview`, ausente, `NODE_ENV=production` sin `VERCEL_ENV`, `development`) |
| R20 | HR «R20: una petición que pasa del tiempo máximo se corta con tiempo_agotado» (un `fetch` doble que respeta la `signal`) |
| R21 | HR «R21: consultarPago con 503, 503 y 200 hace 3 peticiones y espera [250, 1000]; con tres 503, proveedor_caido» (más 429 y fallo de red) |
| R22 (transporte) | HR «R22: crearEnlace y devolver hacen una sola petición, y la falla con efecto posible es incierta» |
| R23 | HR «R23: un 401, un 404 o un 422 no se reintentan» (más 403 y un 200 que no es JSON) |
| R24 | HR «R24: la tabla de traducción da el código, reintentable e incierto de cada falla» (12 filas × 4 operaciones, el mensaje y que no lleva ni el cuerpo ni la URL) |

Veredicto: T3.1, T3.2 y T3.3 cerradas. Mis tests y el lint están en verde, y las mutaciones 1 y 2 caen.

## T4 — El adaptador de Rebill y su doble (2026-11-21)

**Archivos:**
- `e2e/_rebill-falso/servidor.mjs` (nuevo, T4.1): `arrancarRebillFalso({ puerto, apiKey, secretoWebhook })` →
  `{ url, puerto, firmarAviso, cerrar }` y `firmar(cuerpo, secreto)`. Node puro, en memoria, con el molde del doble de
  Storage. Rutas `POST /v3/payment-links` (valida `title`, uno de `prices`/`product`/`plan`, el largo y la moneda de
  `prices` y `paymentMethods`), `GET /v3/payments/:id` (sembrado o `404`) y `POST /v3/refunds/:paymentId` (`400` si no
  es `card`, no está `approved`/`partially_refunded` o pasa de lo que queda; `201 { status }`). El `401` repite la key
  recibida a propósito. Control: `/__control/{pagos,fallos,peticiones,reiniciar}`. Cada ruta cita su página de
  `docs.rebill.com`; ningún host de la API de Rebill aparece en el doble ni en el test (R26).
  - **Extensiones al control de design §11** (para cubrir los caminos sin trucos): un fallo admite además `cuerpo`
    (para servir un `2xx` con otra forma o un `status` concreto de devolución) y `cortar` (cierra el socket: el fallo de
    red, sin depender de un puerto cerrado, que en Windows tarda ~2 s). Sin `cuerpo`, la respuesta del fallo repite la
    key recibida, también en un `2xx` (el camino `respuesta_invalida` de R25). `peticiones` anota también el
    `content-type`.
- `lib/clients/cobro/rebill-proveedor.ts` (relleno, T4.2): las cuatro operaciones, `MontoJson`, `cuerpoJsonConMontos`,
  `rebillEnlaceSchema`, `rebillPagoSchema`, `rebillDevolucionSchema`, `ESTADO_REBILL_A_PROVEEDOR` y
  `ESTADO_DEVOLUCION_REBILL`. Decisiones menores dentro del design:
  - los mapas se leen con `Object.hasOwn` (un `status: "constructor"` no da una función del prototipo);
  - `consultarPago` exige además que el `id` de la respuesta sea el pedido (si no, `respuesta_invalida`);
  - una fila sin el campo que hace falta (`apiKey` o `secretoWebhook`) es `sin_configuracion`;
  - `credencial_ilegible` se reconoce venga como `CredencialIlegibleError` de la bóveda o como el
    `ProveedorCobroError` del lector, y sale con la operación;
  - un id de pago vacío o una descripción vacía son `solicitud_invalida` sin leer credenciales.
- `tests/integration/cobro/rebill-proveedor.test.ts` (nuevo, T4.2–T4.4): 69 tests, el doble en el puerto 0, sin base.

**T4.5 — PENDIENTE HUMANO (deuda para SLT-230 «Cobro automático: enlace de pago por factura»):** no se hizo el contraste
manual en el sandbox de Rebill (no hay credenciales de sandbox). Queda por confirmar: que se acepta `language: "es"`,
que el `GET /v3/payments/:id` trae `metadata.paymentLinkId` y la forma de `amount`. Si algo difiere, el doble y el
adaptador se corrigen juntos.

**El literal `"rechazada"` en lo mío** (`\brechazada\b`, comentarios incluidos): 2 apariciones, una por archivo.
- `lib/clients/cobro/rebill-proveedor.ts:76`: `cancelled: "rechazada",` en `ESTADO_DEVOLUCION_REBILL` (la única del
  adaptador; ningún comentario lo nombra).
- `tests/integration/cobro/rebill-proveedor.test.ts:476`: `["cancelled", "rechazada"],` (la afirmación del mapa).
- `e2e/_rebill-falso/servidor.mjs`: 0.
- Con la de T2.1 (`lib/interfaces/external/IProveedorCobro.ts:61`), la guardia
  `tests/unit/guards/censo-order-status-rename.test.ts` lista hoy 3 líneas. `solicitud_rechazada` y
  `credencial_rechazada` no casan (el `_` quita la frontera).

**Salidas reales:**
- `pnpm run typecheck`: sin errores.
- `pnpm exec eslint e2e/_rebill-falso/servidor.mjs lib/clients/cobro/rebill-proveedor.ts tests/integration/cobro/rebill-proveedor.test.ts`:
  `ESLint: No issues found`.
- `pnpm exec vitest run tests/integration/cobro/rebill-proveedor.test.ts`: `Test Files 1 passed (1) · Tests 69 passed (69)`.
- Guardias `credenciales-sin-consola-cruda`, `pais-sin-literales`, `censo-order-status-rename`, `censo-simpe`,
  `sin-credenciales-de-entorno`, `quitador-comentarios`, `etiquetas-geograficas-sin-literal`,
  `pagos-aritmetica-decimal`, `api-key-dependencias-usuario`, `guard-dependencias-aprobadas`, más
  `tests/unit/clients/cobro-http-registro.test.ts`: `Test Files 2 failed | 9 passed (11) · Tests 10 failed | 191 passed`.
  - `censo-order-status-rename`: las 3 líneas de `"rechazada"` de arriba (pendiente de decisión del leader).
  - `api-key-dependencias-usuario` (9 rojos): el extractor lee 0 relaciones de `db/schema.prisma` (`expected 0 to be
    greater than 40`). Solo lee el esquema, que no toqué; el archivo está con CRLF en este worktree, que parece la
    causa. No es mío; lo anoto para el leader.

**Mutaciones (design §12), una a la vez, revertidas desde copia y con el test otra vez en 69/69:**
- **M9** (`prices[0].amount = Number(entrada.monto)`): `3 failed | 66 passed`. Caen R16 «₡20 000,00 … cuerpo crudo»,
  «los bordes del monto … 0.10 y 9999999999.99» y «una descripción que imita la ficha».
- **M10a** (la clave del HMAC sin `whsec_`): `2 failed | 67 passed`. Caen las dos de R18.
- **M10b** (digest en base64 comparado con `===`): `1 failed | 68 passed`. Cae «el cuerpo firmado por el doble … ⇒ true».
- **M3a** (el cuerpo de la respuesta de error en el mensaje, en `intentar` del transporte): `18 failed | 51 passed`.
  Caen los caminos HTTP de «R25» en las tres operaciones y «el 401 real de otra cuenta».
- **M3b** (el mismo cuerpo en `cause`, no enumerable): `18 failed | 51 passed`. Lo caza `inspect(error, { showHidden })`.
- **M3c** (el cuerpo `2xx` inválido en `cause`, en el adaptador): `3 failed | 66 passed`. Caen los tres «respuesta
  inválida (2xx con la key en el cuerpo)».
- **M1** (repetida contra el doble), en dos formas:
  - literal, `pedirIdempotente` en `devolver`: cae en masa (R15, R19, R22, R25 de `devolver`), porque
    `pedirIdempotente` lanza su error de programación ante un `POST` y no sale ninguna petición;
  - con efecto real, `devolver` envuelto en 3 intentos de `pedirUnaVez`: `5 failed | 64 passed`. Caen las tres de
    «R22: devolver con 503 / tiempo agotado / fallo de red ⇒ 1 petición, incierto», la de R19 con `400` (3 peticiones)
    y «el 401 real de otra cuenta» (5 peticiones en vez de 3).

**Mapa `R<n>` → test (RP = `tests/integration/cobro/rebill-proveedor.test.ts`):**
| R | Test |
|---|---|
| R1 | RP «R1: el adaptador ofrece las cuatro operaciones, consultar recibe solo el id y devuelve null si no lo conoce» |
| R4 | RP «R4: … en sandbox, con credenciales de CR solo en produccion ⇒ sin_configuracion y 0 peticiones» y su control «en produccion, el mismo lector da la key y sale la petición con ella» |
| R14 | RP «R14: … con la fila ausente (null), las cuatro operaciones fallan y el doble recibe 0 peticiones», «… sin el campo …» y «una credencial ilegible da credencial_ilegible …» |
| R15 | RP «R15: la petición va por la API v3 con la API key del trío en x-api-key y cuerpo JSON» |
| R16 | RP «R16: crear un enlace» (6 tests: el cuerpo crudo con `"amount":20000.00`, `"methods":["card"]` y la `metadata`; `0.10` y `9999999999.99`; la ficha imitada; `cuerpoJsonConMontos`; `venceAt` y forma inválida; `metodo_no_soportado` y `solicitud_invalida` sin leer ni llamar) |
| R17 | RP «R17: consultar un pago» (los 7 estados con `it.each`; bordes `0.1`, `20000`, `9999999999.99` y `0.005`; estado fuera de la tabla y formas inválidas; `404` ⇒ `null`) |
| R18 | RP «R18: verificar la firma de un aviso» (firmado por el doble ⇒ true, también en mayúsculas; byte cambiado, ausente, mal formada, base64, otro secreto y sin `whsec_` ⇒ false; 0 peticiones) |
| R19 | RP «R19: devolver un pago» (parcial y resto ⇒ `aprobada`, cuerpo crudo `{"amount":5000.00}`; transferencia, no aprobado y de más ⇒ `solicitud_rechazada` con 1 petición; el mapa de `status`; `solicitud_invalida` sin llamar) |
| R22 | RP «R22: crearEnlace y devolver …» (503, tiempo agotado y fallo de red, cada una ⇒ 1 petición, `incierto`, sin esperas) y el contraste de la consulta (3 peticiones, nunca incierta) |
| R24 (HTTP) | RP «R25 …» (`401`, `403`, `404`, `422`, `429`, `503`, tiempo, red y respuesta inválida, con su código en cada operación) |
| R25 | RP «SLT-227 · R25: el secreto no sale» (27 caminos de red, el `401` real de otra cuenta, `credencial_ilegible`/`sin_configuracion` y la firma mala; `message`, `stack`, `String`, `JSON.stringify`, `inspect` con `showHidden` y `cause`, y las 5 funciones de `console` espiadas), con su control de no vacuidad (el doble recibió el centinela y lo repite en su cuerpo) |
| R26 | El doble en el puerto 0 en todo RP; la guardia de R26 es T5.1 |

Veredicto: T4.1–T4.4 cerradas en verde (69/69, typecheck y lint limpios; M1, M3, M9 y M10 caen). T4.5 queda como
pendiente humano. Los únicos rojos de guardia son el `"rechazada"` (pendiente de decisión) y `api-key-dependencias-usuario`; ninguno de los dos es mío.
