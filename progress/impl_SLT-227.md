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
