# SL-17 «Tabla organizacion y aislamiento por empresa» — design

## Lo que ya existe

Busqué con Grep y Read: el MCP del grafo (`codebase-memory-mcp`) no estaba entre las herramientas de esta sesión.
Términos: `organizacion`, `tenant`, `empresa_id`, `multi-empresa`, `ROW LEVEL SECURITY`,
`CREATE POLICY`, `set_config`, `current_setting`, `BYPASSRLS`, `AsyncLocalStorage`, `$extends`,
`getPrismaClient`, `resolveActorFromSession`, `SESSION_COOKIE_NAME`, `unstable_cache`.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board (`feature_list.json`) | SL-17 es la única ficha que crea `organizacion`. SL-18 (únicos/secuencias), SL-19 (jobs/storage), SL-25 (alta), SL-26 (panel) y SL-32 (superadmin) dependen de ella o se tocan con ella. | No hay duplicado. Las vecinas se citan en Alcance y en §10. |
| `specs/` | 34 specs mencionan «organización» o «tenant». Todos son herencia, con notas «pendiente de la fase 2» del tipo de `docs/architecture.md > Multi-empresa`. Ninguno define tabla ni filtro. | Nada que reutilizar. |
| `specs/SL-32-rol-superadmin/design.md` (otra rama) | Espera `usuario.organizacion_id` nulable y propone un `CHECK` NULL ⇔ superadmin en su segunda migración. | Contrato en §10. |
| `specs/SL-31-tests-datos-propios-ci/design.md` (otra rama) | Define `tests/fabricas/{cliente,catalogos,unicos,usuarios,zonas,ordenes,e2e}.ts`. Dice que, cuando llegue SL-17, las fábricas son el único sitio que aprende a crear la empresa. | SL-17 solo añade `tests/fabricas/organizaciones.ts` (§9). |
| Código: `lib/db/prisma-client.ts` | Singleton perezoso `getPrismaClient()`, `PrismaPg` con `DATABASE_URL` (pooler **transaccional** `:6543` en Vercel), `omit: PRISMA_OMIT` y el log de consultas. Lo usan 169 archivos, con un tipo ancho `PrismaClient` deliberado. | **Se reutiliza**: se envuelve el cliente que devuelve, y la firma no cambia. |
| Código: `lib/auth/resolve-actor.ts`, `lib/auth/session-guard.ts` | La sesión se resuelve en un solo punto: cookie `SESSION_COOKIE_NAME` → `SessionRepository.findValidById` → `usuario`. Hay 213 archivos que llaman a `resolveActorFromSession`. | **Se reutiliza**: la empresa sale de la misma fila de `usuario` (§5). |
| Código: `lib/api/api-key-request.ts` | `buildAutenticar()` resuelve la API key en un solo punto. | Se le añade la empresa de la key (§7). |
| Migraciones: RLS | Hay **87** `ENABLE ROW LEVEL SECURITY` en 59 migraciones, **0** `CREATE POLICY`, **0** `FORCE`, **0** `CREATE ROLE`/`GRANT`. El comentario de `20260708212416_login_usuario_rba` dice «Prisma con service role. Sin policies… RLS bloquea todo salvo el service role». También lo dice `lib/actions/conteos-publicos.ts`: «no hay una sola policy RLS». | Hallazgo bloqueante, en §4. |
| CI (`.github/workflows/gate.yml`) | `DATABASE_URL=postgresql://postgres:postgres@…`: la app y los tests se conectan como **superusuario**. | §4. |
| `tests/integration/db/_postgres-real.ts` | `crearPrismaDeTest`, `enTransaccionRevertida`, `serializarEscriturasReales`, `clienteConSavepoint`. | **Se reutilizan**. `enTransaccionRevertida` aprende a fijar una empresa (§9). |
| `tests/integration/db/_fixtures/orden-minima.ts` (SL-11) | `crearUsuarioDePrueba`, `crearFksDeOrden`. | Se reutilizan. Ver §9. |
| `lib/cache/next-{analitica,conteos-publicos,tablero-dia}-cache.ts` | `unstable_cache` con claves por consulta y alcance, **sin empresa**. | §7.6 (R34). El de conteos se retira (§7.8). |
| `specs/SL-32-rol-superadmin` > `arranque:superadmin` y `lib/auth/plataforma.ts` | Servicio + repositorio + zod, idempotente, en una transacción con cerrojo. SL-32 define `esPlataforma(rol)` y la pantalla «Empresas». | Se copia el patrón de servicio y repositorio en `OrganizacionService` (§7.7). La comprobación de rol se **enchufa** a `lib/auth/plataforma.ts` cuando exista (§7.7, punto de enganche). |
| `lib/services/PasswordResetService.ts` | «Recuperar contraseña» por OTP de correo. Busca por email y no mira el `estado`. | **Se reutiliza** como el modo en que el primer maestro fija su contraseña (R44). |
| `lib/auth/menu-visibility.ts` | El menú por rol, con las rutas e hijos del maestro. | **Se reutiliza** como fuente de rutas del humo de dos empresas (§9.3). |
| `e2e/marca.spec.ts` (SL-8) | Login E2E sin OTP con `trusted_device` sembrado; aborta con una base remota. | Se reutiliza la técnica en el humo (§9.3). |
| Board: SL-35, SL-36 | Fichas nuevas creadas el 2026-10-22 a partir de este spec: SL-35 «Landing pública por empresa con postulación», SL-36 «Módulo de integraciones por empresa». | Se citan como dueñas de lo que SL-17 deja en excepción. |

## 1. Visión de conjunto

Hay tres capas, más una garantía estructural. Cada capa basta para frenar el fallo de la
anterior:

1. **Contexto de datos** (`AsyncLocalStorage`, de Node, sin dependencias nuevas). En cada momento
   hay `empresa(id)`, `plataforma(ficha, motivo)` o nada. Si no se declara uno explícito, se
   resuelve solo desde la cookie de sesión.
2. **Extensión del cliente Prisma** sobre el `getPrismaClient()` de siempre:
   - inyecta `organizacion_id` en los modelos de negocio;
   - falla cerrado si no hay contexto;
   - envuelve cada operación en una transacción que fija la empresa para la RLS.
3. **RLS en Postgres** con un rol sin bypass (`servi_app`). La política compara `organizacion_id`
   con `current_setting('app.organizacion_id', true)`. Cubre el SQL a mano y los `include`
   anidados, que la extensión no ve.
4. **Triggers de misma empresa** (§3, M3). Impiden que una fila de negocio apunte a otra empresa y
   que una fila cambie de empresa. Actúan con cualquier rol, incluido el contexto de plataforma, y
   Prisma no los ve: no hay drift entre el esquema y las migraciones.

Todas se apoyan en **una sola lista**, `lib/db/modelos-de-negocio.ts`. La leen la extensión, las
guardias y la migración, que se genera a partir de ella.

## 2. Clasificación de los 88 modelos de `db/schema.prisma`

Criterio: es **negocio** si sus filas las crea o las consume una empresa (operación, dinero,
personas, configuración propia, rastro). Es **plataforma** si es un catálogo del sistema, la
geografía o infraestructura de autenticación anterior a conocer la empresa. **Diferida** es lo
que tiene ficha propia.

### 2.1 Negocio — 73 (llevan `organizacion_id`)

`usuario` es nulable (R3). Las otras 72 son `NOT NULL`.

| Área | Modelo → tabla |
|---|---|
| Personas | Usuario → `usuario` (**nulable**), MensajeroDocumento → `mensajero_documento`, UsuarioPreferencia → `usuario_preferencia`, PushSuscripcion → `push_suscripcion`, PushEnvioDia → `push_envio_dia`, AsistenteUsoDiario → `asistente_uso_diario`, VistaFiltro → `vista_filtro`, ApiKey → `api_key`, WebhookSuscripcion → `webhook_suscripcion`, PostulacionRecurso → `postulacion_recurso` |
| Zonas y tarifas | Zona → `zona`, ZonaDistrito → `zona_distrito`, Tarifa → `tarifas`, TarifaZonaMensajero → `tarifa_zona_mensajero`, PremioRanking → `premio_ranking`, GastoFijoPlantilla → `gasto_fijo_plantilla` |
| Órdenes | Orden → `orden`, Carga → `carga`, OrdenMensajeroMeta → `orden_mensajero_meta`, OrdenNota → `orden_nota`, OrdenHabilitacionApi → `orden_habilitacion_api`, OrdenHistorialEstado → `orden_historial_estado`, OrdenDiaRepartoCambio → `orden_dia_reparto_cambio`, OrdenTraspasoMensajero → `orden_traspaso_mensajero`, OrdenEvento → `orden_evento`, OrdenIncidente → `orden_incidente`, OrdenIncidenteEvidencia → `orden_incidente_evidencia` |
| Gestión | GestionOrden → `gestion_orden`, GestionOrdenEvidencia → `gestion_orden_evidencia`, GestionOrdenPago → `gestion_orden_pago`, GestionFechaReprogramacionCambio → `gestion_fecha_reprogramacion_cambio`, RutaOptimizada → `ruta_optimizada`, RutaOptimizadaParada → `ruta_optimizada_parada` |
| Cierres | CierreDia → `cierre_dia`, CierreBodega → `cierre_bodega`, CierreDetail → `cierre_detail`, CierreSinGestion → `cierre_sin_gestion`, CierreRechazoTienda → `cierre_rechazo_tienda` |
| Dinero | WalletMovimiento → `wallet_movimiento`, WalletTiendaMovimiento → `wallet_tienda_movimiento`, PagoMensajeroMovimiento → `pago_mensajero_movimiento`, LiquidacionPago → `liquidacion_pago`, LiquidacionAnulacion → `liquidacion_anulacion`, LiquidacionReparto → `liquidacion_reparto`, PagoPorCuentaTienda → `pago_por_cuenta_tienda`, PagoPorCuentaTiendaAnulacion → `pago_por_cuenta_tienda_anulacion`, CobroTiendaAnulacion → `cobro_tienda_anulacion`, AjusteCajaAnulacion → `ajuste_caja_anulacion`, WalletAnotacion → `wallet_anotacion`, RechazoTiendaCobro → `rechazo_tienda_cobro`, RechazoTiendaCobroAnulacion → `rechazo_tienda_cobro_anulacion`, WalletComprobante → `wallet_comprobante`, AbonoTienda → `abono_tienda`, AbonoTiendaAnulacion → `abono_tienda_anulacion`, AporteCapital → `aporte_capital`, AporteCapitalAnulacion → `aporte_capital_anulacion`, GastoFijoCobro → `gasto_fijo_cobro` |
| Devoluciones | DevolucionTiendaComprobante → `devolucion_tienda_comprobante`, DevolucionTiendaEvidencia → `devolucion_tienda_evidencia`, DevolucionTiendaOrden → `devolucion_tienda_orden` |
| Comunicación | PlantillaMensaje → `plantilla_mensaje`, ChatConversacion → `chat_conversacion`, ChatMensaje → `chat_mensaje`, Notificacion → `notificacion`, NotificacionLectura → `notificacion_lectura`, WhatsappEnvio → `whatsapp_envio`, WhatsappEnvioDestinatario → `whatsapp_envio_destinatario`, WhatsappEnvioEjecucion → `whatsapp_envio_ejecucion`, WhatsappEnvioEntrega → `whatsapp_envio_entrega` |
| Rastro y analítica | HistorialAccion → `historial_accion`, AnalyticsDaily → `analytics_daily`, RankingSnapshotDia → `ranking_snapshot_dia`, RankingSnapshotFila → `ranking_snapshot_fila` |

### 2.2 Plataforma — 14 (sin `organizacion_id`)

| Modelo → tabla | Por qué | Acceso del rol `servi_app` (§4) |
|---|---|---|
| TipoIdentificacion → `tipo_identificacion`, Rol → `rol`, Permiso → `permiso`, RolPermiso → `rol_permiso`, OrderStatus → `order_status` | Catálogos del sistema (`seed-catalogos.ts`, migraciones) | Solo `SELECT`, con `USING (true)`. `INSERT`, `UPDATE` y `DELETE` se revocan (R40) |
| Provincia → `provincia`, Canton → `canton`, Distrito → `distrito` | Geografía del país (D2). SL-20 la hace configurable | Solo `SELECT`, con `USING (true)`. Lo demás se revoca (R40) |
| Vehiculo → `vehiculos` | Catálogo sembrado (`seed-catalogos.ts`). **D12:** es de plataforma, y lo edita el superadmin (SL-26) | Solo `SELECT`, con `USING (true)`. Lo demás se revoca: escribir desde una empresa da `permission denied` (R40). La pantalla `configuracion/vehiculos` del maestro falla cerrado al escribir, y no cambia de aspecto mañana. **Cambia frente a SL-32**, donde Vehículos seguía con el maestro (§10) |
| Session → `"Session"`, TrustedDevice → `trusted_device`, EmailOtpChallenge → `email_otp_challenge`, LoginAttempt → `login_attempt` | Autenticación: se usa **antes** de conocer la empresa. El superadmin también las usa | Todo, con política «el dueño es usuario visible»: `EXISTS (SELECT 1 FROM usuario u WHERE u.id = <col>)`. Como `usuario` ya está filtrado por empresa, solo se ven sesiones y dispositivos de la propia (R22). `login_attempt` con `usuario_id` NULL queda invisible |
| GeocodeCache → `geocode_cache` | Caché técnica por huella de dirección, sin dato de empresa (el comentario del modelo lo dice) | Todo, con `USING (true)` |

### 2.3 Diferida — 1

| Modelo → tabla | Ficha | Mientras tanto |
|---|---|---|
| Job → `jobs` | SL-19 (el resto) | Todo para `servi_app`, con `USING (true)`, porque el outbox encola dentro de transacciones de empresa. **D16:** M4 añade `organizacion_id` **nulable**, que el `DEFAULT` llena con la empresa de la transacción que encola. El drenador corre cada job con su empresa (R42, T2.3b). No lleva trigger de misma empresa, porque `jobs` no es de negocio. |

Total: 73 + 14 + 1 = **88**. La guardia (R23) comprueba que la suma cuadra con `schema.prisma`.

## 3. Modelo de datos y migraciones

Hay cuatro migraciones nuevas encima de la última (`20261021120000_devolucion_tienda_comprobante_419`):
M1 (organización y rol), M2 (columna y RLS), M3 (triggers de misma empresa) y M4 (`jobs`).
Cada una trae su `down.sql` (R6). No se edita ninguna anterior. La base local se rehace con
`pnpm run db:reset`.

### M1 — `20261022130000_organizacion_y_rol_app`

```sql
CREATE TABLE "organizacion" (
  "id"         TEXT PRIMARY KEY,                -- uuid como texto, igual que el resto del esquema
  "nombre"     TEXT NOT NULL,
  "slug"       TEXT NOT NULL,                   -- D13: la ruta pública de la empresa (SL-35)
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "organizacion_slug_key" ON "organizacion" ("slug");
ALTER TABLE "organizacion" ENABLE ROW LEVEL SECURITY;
-- servi_app solo ve la propia (SELECT, id = empresa fijada): la usa el contexto de empresa para leer
-- su nombre. Sin INSERT/UPDATE/DELETE: el alta es de plataforma (OrganizacionService, §7.7).
-- ROL: NOLOGIN y NOBYPASSRLS. Se crea solo si no existe, porque los roles son del clúster y
-- `migrate reset` no los borra.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'servi_app') THEN
    CREATE ROLE servi_app NOLOGIN NOBYPASSRLS;
  END IF;
END $$;
GRANT servi_app TO CURRENT_USER;              -- para poder hacer SET ROLE sin ser superusuario
GRANT USAGE ON SCHEMA public TO servi_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO servi_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO servi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO servi_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO servi_app;
-- Catálogos y geografía de §2.2 (incluido vehiculos): solo lectura (R40).
REVOKE INSERT, UPDATE, DELETE ON "tipo_identificacion", "rol", "permiso", "rol_permiso", "order_status",
  "provincia", "canton", "distrito", "vehiculos", "organizacion" FROM servi_app;
-- + las políticas de plataforma de §2.2/§2.3 (lectura de catálogos, dueño visible, true en caché y jobs).
-- Las tablas de plataforma sin RLS activa se activan aquí, para que la política mande.
```

- No inserta ninguna fila en `organizacion` (R32).
- **`slug`** (D13): obligatorio y único. Formato `^[a-z0-9]+(-[a-z0-9]+)*$`, de 3 a 63
  caracteres, validado con zod en `OrganizacionService.altaEmpresa` (§7.7). La base solo exige unicidad y `NOT NULL`.
- **Consecuencia de R40 en la geografía:** `configuracion/geografia` también queda de solo
  lectura para el maestro, igual que `configuracion/vehiculos`. Es la misma regla de D2: la
  geografía es de plataforma. La zona y su `zona_distrito` sí son de la empresa y se editan
  igual que hoy.
- **down.sql:** borra las políticas de plataforma, desactiva la RLS en las tablas que M1 activó
  (las que no la tenían, según la lista que calcula T1.2), hace `REVOKE` de los grants y de los
  privilegios por defecto y `DROP TABLE "organizacion"`. El `DROP ROLE servi_app` va en un
  bloque que ignora `dependent_objects_still_exist`, porque el rol es del clúster y otra base de
  la misma instancia puede usarlo.

### M2 — `20261022130100_organizacion_id_en_negocio`

Va por cada una de las 73 tablas de §2.1:

```sql
ALTER TABLE "<t>" ADD COLUMN "organizacion_id" TEXT NOT NULL      -- en `usuario`, sin NOT NULL
  DEFAULT NULLIF(current_setting('app.organizacion_id', true), '');
ALTER TABLE "<t>" ADD CONSTRAINT "<t>_organizacion_id_fkey"
  FOREIGN KEY ("organizacion_id") REFERENCES "organizacion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "<t>_organizacion_id_idx" ON "<t>" ("organizacion_id");
ALTER TABLE "<t>" ENABLE ROW LEVEL SECURITY;                       -- no hace nada si ya estaba
CREATE POLICY "<t>_por_empresa" ON "<t>" FOR ALL TO servi_app
  USING      ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''))
  WITH CHECK ("organizacion_id" = NULLIF(current_setting('app.organizacion_id', true), ''));
```

- **Por qué el `DEFAULT` sale del ajuste de la transacción.** Las creaciones anidadas de Prisma
  (`create` dentro de `data.relacion`) y los `INSERT` a mano no pasan por la inyección de la
  extensión. Con el `DEFAULT` toman la empresa de la transacción.
  Sin empresa fijada, el valor es NULL y salta el `NOT NULL`. Si el ajuste quedó en `''` de una
  transacción anterior, `NULLIF` lo convierte en NULL. En los dos casos falla cerrado (R19, R21).
- **`NULLIF(..., '')`:** una vez que una sesión de Postgres fijó un ajuste propio, al acabar la
  transacción no vuelve a NULL sino a `''`. Sin el `NULLIF`, la política compararía con `''`.
  Fallaría igualmente cerrado, pero el error de `INSERT` sería de FK en vez de `NOT NULL`. T1.1
  lo mide.
- **`ADD COLUMN … NOT NULL` sin backfill:** la app está vacía (D9, D10). Una base local con filas
  de otra época se rehace con `migrate reset`.
- **El índice simple sobre `organizacion_id`** cumple D2. Los índices compuestos de las rutas
  calientes (`(organizacion_id, created_at)`, etc.) los decide SL-18 junto con los únicos.
- **`schema.prisma`:**
  - `model Organizacion` con las relaciones inversas.
  - En cada modelo de §2.1: `organizacionId String @default(dbgenerated("NULLIF(current_setting('app.organizacion_id', true), '')")) @map("organizacion_id")`,
    la relación `organizacion Organizacion @relation(...)` y `@@index([organizacionId])`.
  - En `Usuario`: `String?`.
- **down.sql:** por tabla, en orden inverso, `DROP POLICY`, `DROP INDEX`, `DROP CONSTRAINT` y
  `DROP COLUMN`. No desactiva la RLS de tablas que ya la tenían antes de M2. M2 no activa
  ninguna nueva: si T1.3 encuentra alguna sin RLS, la registra y el `down.sql` la desactiva.
- **Generación:** M2 son unas 600 líneas repetitivas. Se generan desde `MODELOS_DE_NEGOCIO`
  con un script de un solo uso que **no se commitea**. Se commitea el SQL resultante, que el
  reviewer lee.
- **Únicos (R36):** `usuario.email` y `usuario.cedula` siguen `@unique` **globales**, y los
  demás únicos tampoco cambian. Hacerlos por empresa es SL-18.

### M3 — `20261022130300_misma_empresa_en_fk` (D15, R37–R39)

Es una garantía **estructural**: no depende de que el servicio lea antes, ni de la extensión, ni del
rol. La FK de Postgres comprueba que la fila exista, pero no de qué empresa es, y la RLS no
interviene en esa comprobación. Este es el hueco que cierra M3.

```sql
CREATE FUNCTION verificar_misma_empresa() RETURNS trigger
  LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tabla_ref text := TG_ARGV[0];  col_fk text := TG_ARGV[1];  col_ref text := TG_ARGV[2];
  v_fk text;  v_org_ref text;  v_encontrada boolean;
BEGIN
  EXECUTE format('SELECT ($1).%I::text', col_fk) INTO v_fk USING NEW;
  IF v_fk IS NULL THEN RETURN NEW; END IF;                        -- FK opcional sin valor
  EXECUTE format('SELECT organizacion_id, true FROM %I WHERE %I::text = $1', tabla_ref, col_ref)
    INTO v_org_ref, v_encontrada USING v_fk;
  IF v_encontrada IS NULL THEN RETURN NEW; END IF;                -- inexistente: lo rechaza la FK
  IF v_org_ref IS NULL THEN RETURN NEW; END IF;                   -- usuario superadmin (D15)
  IF NEW.organizacion_id IS DISTINCT FROM v_org_ref THEN
    RAISE EXCEPTION 'referencia a otra empresa: %.% -> %', TG_TABLE_NAME, col_fk, tabla_ref
      USING ERRCODE = 'SL017';
  END IF;
  RETURN NEW;
END $$;

CREATE FUNCTION impedir_cambio_de_empresa() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organizacion_id IS DISTINCT FROM OLD.organizacion_id THEN
    RAISE EXCEPTION 'una fila no cambia de empresa: %', TG_TABLE_NAME USING ERRCODE = 'SL017';
  END IF;
  RETURN NEW;
END $$;

-- Por cada FK de negocio→negocio (generado desde el DMMF):
CREATE TRIGGER "<nombre_determinista>" BEFORE INSERT OR UPDATE OF "<col_fk>", "organizacion_id"
  ON "<tabla>" FOR EACH ROW EXECUTE FUNCTION verificar_misma_empresa('<tabla_ref>', '<col_fk>', '<col_ref>');
-- Por cada una de las 73 tablas de negocio:
CREATE TRIGGER "<tabla>_sin_cambio_de_empresa" BEFORE UPDATE OF "organizacion_id"
  ON "<tabla>" FOR EACH ROW EXECUTE FUNCTION impedir_cambio_de_empresa();
```

- **`SECURITY DEFINER`.** La búsqueda de la fila referenciada tiene que ver filas de otras
  empresas: precisamente esas son las que hay que rechazar. Con la RLS activa como `servi_app` no
  las vería, y daría la referencia por inexistente. `search_path` va fijado, y los identificadores
  van con `%I`, sin interpolar texto.
- **Qué se excluye:**
  - las FK hacia tablas de plataforma (§2.2), `organizacion` y `jobs`;
  - un `usuario` referenciado con `organizacion_id` NULL (superadmin). En cambio, una fila sin
    empresa (el propio superadmin) que apunta a una fila de empresa **sí** se rechaza;
  - una FK compuesta: si aparece una, el generador **falla** en vez de omitirla, y la guardia
    también.
- **SQLSTATE `SL017`**, propio (clase `SL`, fuera de las estándar). `lib/db/contexto-empresa.ts`
  lo traduce a `EmpresaCruzada`, y una acción lo muestra como «no encontrado». No dice que la fila
  existe en otra empresa.
- **Nombre determinista del trigger:** `sme_` + los primeros 40 caracteres de `<tabla>_<col>` +
  `_` + 8 caracteres del md5 de `<tabla>.<col>`. Así cabe en los 63 caracteres de Postgres, y el
  generador y la guardia lo calculan igual (`lib/db/fk-de-negocio.ts`).
- **Generación mecánica:** `scripts/generar-misma-empresa.ts` **sí se commitea**, porque una FK
  nueva necesita su trigger en una migración futura. Lee `Prisma.dmmf.datamodel`; por cada campo
  con `relationFromFields` cuyo modelo y destino estén en `MODELOS_DE_NEGOCIO`, emite
  `(tabla, columna, tabla_ref, columna_ref)` con los `@map` y `@@map` resueltos. Imprime el
  `migration.sql` y el `down.sql`.
  - Prisma no ve funciones ni triggers: el esquema no cambia y no hay drift.
  - Las ~170 relaciones del esquema no se tocan.
  - T2.7 apunta el número real de FK de negocio a negocio.
- **down.sql:** primero `DROP TRIGGER` de todos los triggers, y después `DROP FUNCTION` de las dos.
- **Coste:** cada `INSERT`, o cada `UPDATE` que toque la FK, hace una búsqueda por clave primaria
  en cada tabla referenciada. T2.7 mide el `INSERT` de una `orden` (unas 8 FK de negocio), con 1000
  repeticiones, con trigger y sin él. Lo anota en `progress/impl_SL-17.md`.
- **Se mantiene la lectura previa en los servicios** (D15). El trigger es la red: sin la lectura,
  el usuario recibiría un error de base en vez de «no encontrado» con el texto de siempre.

### M4 — `20261022130200_jobs_organizacion_id` (D16, R42)

`ALTER TABLE "jobs" ADD COLUMN "organizacion_id" TEXT NULL DEFAULT NULLIF(current_setting('app.organizacion_id', true), '') REFERENCES "organizacion"("id") ON DELETE CASCADE`,
con un índice `("organizacion_id", "estado", "run_after")`.

- En `schema.prisma`: `Job.organizacionId String? @default(dbgenerated(...))`.
- `jobs` sigue siendo «diferida», no de negocio: no lleva el filtro de la extensión ni el trigger.
- El `DEFAULT` captura la empresa del outbox sin tocar a los ~20 sitios que encolan.
- **down.sql:** `DROP INDEX` y `DROP COLUMN`.
- M4 tiene un timestamp anterior a M3, pero las dos son independientes: tocan tablas distintas.

## 4. El rol de base de datos (hallazgo que bloquea si no se resuelve)

**Hoy la RLS no protege nada.** La app se conecta con el dueño de las tablas: `postgres` en CI
(superusuario) y el usuario de Supabase en el pooler. El dueño se salta la RLS salvo con `FORCE`,
y un superusuario se la salta siempre. Las 87 RLS actuales sin políticas solo cierran la puerta a
`anon`/`authenticated` de la API REST de Supabase. Si M2 solo creara políticas, **ninguna
aplicaría a la app**, y los tests de R17–R21 pasarían en verde sin probar nada.

**Propuesta:** un rol `servi_app` sin login y sin bypass (M1). La app sigue conectándose con la
URL de siempre, así que no hay secretos nuevos. En cada transacción de empresa baja de privilegio
así:

```sql
SELECT set_config('app.organizacion_id', $1, true), set_config('role', 'servi_app', true);
```

Las dos cosas son locales a la transacción, así que conviven con el pooler transaccional (R21):
al hacer `COMMIT` o `ROLLBACK`, la conexión vuelve al pool como dueño y sin empresa.

- **Plataforma** (login, superadmin, drenador): no baja de rol. Opera como dueño, sin RLS, y por
  eso está acotada por la guardia R27.
- **Supabase real (D21).** Mañana corre en Vercel y en Supabase, en cuentas propias de Carlos.
  Hay **dos bases nuevas y vacías**: **producción**, que usa el entorno Production de Vercel, y
  **QA**, que usa Preview. Que `CREATE ROLE`, `GRANT … TO CURRENT_USER` y `SET ROLE` funcionen con
  el usuario `postgres` de Supabase y a través del pooler transaccional (`:6543`) **no está
  verificado en local**. Lo verifica la task **T4.1** en **las dos bases**, antes de dar de alta
  ninguna empresa en ellas, con `scripts/verificar-rls-despliegue.ts`. Es un script de solo
  lectura, salvo una transacción revertida. Se ejecuta con la `DATABASE_URL` del pooler y la
  `DIRECT_URL` de cada base, y comprueba seis cosas:
  1. `servi_app` existe en `pg_roles`, con `rolbypassrls = false` y `rolcanlogin = false`, y el
     usuario de la URL es miembro (`pg_has_role(current_user, 'servi_app', 'MEMBER')`);
  2. en una transacción por el **pooler**, `set_config('role','servi_app', true)` cambia
     `current_user` a `servi_app`;
  3. en esa transacción, con dos organizaciones de prueba y una fila de cada una en una tabla de
     negocio con pocas FK (por ejemplo `zona`), todo revertido al final, un `SELECT` sin `WHERE` solo
     ve la empresa fijada, y sin empresa ve 0 filas;
  4. en la transacción **siguiente** por la misma URL, `current_user` vuelve a ser el dueño y
     `current_setting('app.organizacion_id', true)` está vacío (R21 en el pooler real);
  5. **el dueño no se salta la RLS cuando opera como app.** Un `SELECT` como dueño **sin** bajar
     de rol ve las dos empresas: es lo esperado en plataforma, y prueba que la defensa es la
     bajada de rol. Con la bajada de rol, el mismo `SELECT` ve solo una;
  6. `pg_policies` tiene las 73 políticas `*_por_empresa` y `pg_trigger` los triggers de M3.

  Sale con 0 si todo cuadra y nombra el punto que falla. Su salida va a `progress/impl_SL-17.md`.
- **Plan B, si falla el punto 1 o el 2** (Supabase no deja crear el rol, ni concederlo, ni hacer
  `SET ROLE` desde el pooler). Es la alternativa C de §11:
  1. Crear `servi_app` **con login** y una contraseña propia desde el panel SQL de Supabase,
     con los mismos grants y políticas de M1.
  2. Una URL nueva, `DATABASE_URL_APP` (pooler transaccional, usuario `servi_app.<ref>`), para el
     cliente de empresa. `DATABASE_URL` (dueño) queda solo para el contexto de plataforma.
  3. `lib/db/prisma-client.ts` construye **dos** clientes base. La extensión usa el de
     `servi_app` en contexto de empresa, ya sin `set_config('role', …)` (solo con la empresa), y
     el del dueño en plataforma.
  4. La variable se da de alta en Vercel **por entorno**: en Production, la URL de la base de
     producción; en Preview, la de QA. Nunca una variable marcada en los dos entornos: el aviso de
     `.env.example` de que acaba apuntando al proyecto equivocado aplica aquí. El rol con login se
     crea en las dos bases, con contraseñas distintas.
  5. Se repite T4.1 contra la URL nueva de cada base.
  6. Si una base pasa con `SET ROLE` y la otra no, las **dos** van con plan B, para que Preview
     pruebe lo mismo que Production.

  Cuesta unas 2 h, más una variable de entorno y un pool más por instancia (`DB_POOL_MAX`
  aplica a cada uno). Las demás piezas del spec no cambian: contexto, filtro, triggers, guardias
  y tests.
- **Plan B, si falla el punto 3, 4 o 5** (la RLS no se aplica): **no se dan de alta empresas.**
  Se para y se avisa a Carlos con la salida del script. El filtro de la extensión y los triggers
  siguen protegiendo, pero la defensa en profundidad prometida (D4) no está. Desplegar así es
  decisión suya, no del agente.
- **`FORCE ROW LEVEL SECURITY`** queda descartado: ver §11 B.

## 5. Contexto de datos (`lib/db/contexto-empresa.ts`)

```ts
export type ContextoDatos =
  | { tipo: "empresa"; organizacionId: string; enTransaccion?: boolean }
  | { tipo: "plataforma"; ficha: `SL-${number}`; motivo: string };

export function conEmpresa<T>(organizacionId: string, fn: () => Promise<T>): Promise<T>;
export function comoPlataforma<T>(ficha: `SL-${number}`, motivo: string, fn: () => Promise<T>): Promise<T>;
export function contextoActual(): ContextoDatos | undefined;

export class EmpresaNoResuelta extends Error { constructor(readonly modelo: string, readonly operacion: string) }   // R11, R14
export class EmpresaCruzada   extends Error { constructor(readonly modelo: string) }                             // R10
export class UsuarioSinEmpresa extends Error {}                                                                   // R35
```

**Resolución desde la sesión** (`lib/auth/empresa-de-la-peticion.ts`, R12). Cuando la extensión
necesita empresa y no hay contexto explícito, llama a `empresaDeLaPeticion()`:

1. `cookies()` de `next/headers`. Si lanza (fuera de una petición: cron, job, script, test),
   devuelve `null`.
2. Si no hay cookie de sesión, devuelve `null`.
3. Dentro de `comoPlataforma("SL-17", "resolver la empresa de la sesión")`, lee la sesión con
   `SessionRepository.findValidById` y después `usuario.organizacion_id`. La lectura es la misma
   que ya hace `resolveActorFromSession`.
4. Guarda en memoria `sessionId → organizacionId` durante **60 s**, por proceso. Es seguro
   porque la empresa de un usuario no cambia (D8). Que la sesión siga valiendo lo decide la
   autorización de siempre, no este memo.

`null` significa que no hay empresa, y la operación de negocio falla (R11). El superadmin
devuelve `null` porque su `organizacion_id` es NULL (R14).

- **Precedencia:** el contexto explícito (`conEmpresa`/`comoPlataforma`) gana sobre la cookie.
- **Por qué hace falta la resolución perezosa:** con ella no hay que tocar las ~200 páginas y
  acciones que ya resuelven la sesión por su cuenta. Su empresa sale sola.
- `Actor` (`lib/interfaces/services/IOrdenService.ts`) gana `organizacionId: string | null`.
  Así los servicios que lo necesiten (claves de caché) no vuelven a la base.

## 6. Extensión del cliente (`lib/db/extension-empresa.ts`)

```ts
export function conAislamientoPorEmpresa(
  base: PrismaClient,
  resolver: () => Promise<string | null>,
): PrismaClient;   // mismo tipo ancho que hoy (ver el comentario de prisma-client.ts)
```

`getPrismaClient()` devuelve `conAislamientoPorEmpresa(clienteBase, empresaDeLaPeticion)`, con la
misma firma. El cliente base se sigue construyendo como hoy, y las guardias
`prisma-client-sin-adaptador` y `PRISMA_OMIT` siguen valiendo. Para que `lib/db` no dependa de
`next/headers` al importarse, el resolutor se importa de forma perezosa dentro de
`getPrismaClient`, sin ciclo.

### 6.1 Qué hace con cada operación

| Contexto | Modelo de negocio | Modelo de plataforma | SQL a mano (`$queryRaw*`, `$executeRaw*`) |
|---|---|---|---|
| empresa, fuera de transacción | filtro (6.2) + envoltura (6.3) | sin filtro; con envoltura si va dentro de una transacción de empresa, si no, tal cual | envoltura (la RLS filtra) |
| empresa, dentro de `$transaction` | filtro, sin envoltura (ya la puso 6.4) | tal cual | tal cual (la RLS filtra) |
| plataforma | tal cual (dueño, sin RLS) | tal cual | tal cual |
| ninguno (el resolutor da `null`) | **`EmpresaNoResuelta`, sin ejecutar** | tal cual | **`EmpresaNoResuelta`, sin ejecutar** |

El SQL a mano sin contexto falla porque la extensión no sabe qué tablas toca. Si se dejara
pasar, correría como dueño, sin RLS, y vería todas las empresas.

### 6.2 Filtro (R7–R10, R35)

- **Lecturas y escrituras con `where`:** `args.where = { AND: [args.where ?? {}, { organizacionId }] }`.
  En `findUnique`, `update`, `delete` y `upsert` se añade el campo al `where` único. Prisma admite
  filtros extra no únicos en `WhereUniqueInput` desde la 5.0. T1.1 lo verifica en la 7.
  Si la fila es de otra empresa, la lectura da `null`, `*OrThrow` da P2025 y `update`/`delete`
  dan P2025: lo mismo que una fila inexistente (R8).
- **`create`, `createMany` y `upsert.create`:** pone `organizacionId` desde el contexto. Si los
  datos traen otro valor, lanza `EmpresaCruzada` (R10).
- **`update` y `updateMany` con `data.organizacionId`:** si el valor es distinto, lanza
  `EmpresaCruzada`. Una fila no se cambia de empresa.
- **`usuario` (R35):**
  - En contexto de empresa, `create` siempre pone la empresa.
  - En contexto de plataforma, `create` sin la clave `organizacionId` lanza `UsuarioSinEmpresa`.
    Solo pasa con `organizacionId: null` **explícito**, que es lo que hace el comando de arranque
    de SL-32.
  - Así ningún camino deja un usuario sin empresa por olvido. Lo hace por decisión de quien
    escribe el `null`.
- **Lo que no ve:** las escrituras anidadas y los `include`/`select` de relaciones. Ahí actúan el
  `DEFAULT` (§3) y la RLS (§4).

### 6.3 Envoltura transaccional (R18, R21)

```ts
const [, resultado] = await base.$transaction([
  base.$executeRaw`SELECT set_config('app.organizacion_id', ${id}, true), set_config('role', 'servi_app', true)`,
  query(argsFiltrados),
]);
```

Es el patrón del ejemplo oficial de Prisma, «row-level-security» de `prisma-client-extensions`.
**Coste:** cada operación suelta pasa a ser `BEGIN` + 2 sentencias + `COMMIT`. T1.1 lo mide y lo
anota en `progress/`. Reducirlo con una transacción por petición queda fuera de mañana.

### 6.4 `$transaction` interactiva y en lote

Un `Proxy` sobre el cliente extendido intercepta `$transaction` (son 103 llamadas en 50 archivos).
Con empresa en contexto:

- **Interactiva:** `extendido.$transaction(async (tx) => { await tx.$executeRaw\`…set_config…\`; return contexto.run({ …, enTransaccion: true }, () => fn(tx)); }, opciones)`.
- **En lote:** antepone la sentencia `set_config` al arreglo y ejecuta con `enTransaccion: true`.
  Devuelve el resultado sin el primer elemento.

Las operaciones de `tx` siguen filtrándose (6.2), pero no se vuelven a envolver.
`clienteConTransaccionAnidada` y `clienteConSavepoint` de los tests siguen funcionando, porque
envuelven al `tx`.

### 6.5 Lo que T1.1 tiene que medir antes de construir encima

No son supuestos: si alguno falla, el diseño de §6 se corrige antes de la tanda 2.

1. Que la parte `query` de `$allOperations` a nivel de cliente intercepte `$queryRaw`,
   `$executeRaw`, `$queryRawUnsafe` y `$executeRawUnsafe` en Prisma 7 con `@prisma/adapter-pg`.
2. Que `findUnique`/`update`/`delete` acepten `organizacionId` extra en el `where` único.
3. Que `set_config('role', 'servi_app', true)` aplique la RLS a un superusuario y que se revierta
   al acabar la transacción.
4. Que el lote `[set_config, query(args)]` vaya en una sola conexión (con `PrismaPg`), y que el
   `Proxy` de `$transaction` no rompa el tipo ni el `this`.
5. Que el valor de `current_setting` tras una transacción anterior sea `''` (justifica el
   `NULLIF`).

## 7. Puntos de entrada

| Entrada | Cómo obtiene la empresa | Archivos |
|---|---|---|
| Páginas, Server Actions y route handlers con sesión | Perezosa, desde la cookie (§5). Sin cambios en esos ~200 archivos | `lib/auth/empresa-de-la-peticion.ts` |
| Validación de sesión (middleware) y `resolveActorFromSession` | `comoPlataforma("SL-17", "validar sesión")`. Leen `Session` y `usuario` antes de tener empresa | `lib/auth/session-guard.ts`, `lib/auth/resolve-actor.ts` |
| Login, OTP, recuperar contraseña | `comoPlataforma("SL-17", "login")`: buscan el usuario por email, que es único global (R36) | `lib/actions/auth.ts`, `lib/actions/password-reset.ts`, `app/login/page.tsx`, `app/recuperar-contrasena/page.tsx` |
| API key (9 rutas, incluida `analitica` y `[numGuia]/cancelar`) | `buildAutenticar` lee la key en plataforma y devuelve `organizacionId`. Cada ruta ejecuta su cuerpo dentro de `conEmpresa(auth.organizacionId, …)` (R13). Si la key no tiene empresa, responde 401 | `lib/api/api-key-request.ts`, `lib/api/analitica-integrador.ts`, `app/api/ordenes/api-key/**/route.ts` (lista en `tasks.md`) |
| Crons (11 rutas de `app/api/cron/`; la 12.ª, `procesar-jobs`, va en la fila siguiente; `purga-descargas` y `purga-pdf-cargas` solo tocan storage y quedan con SL-19 si no leen tablas de negocio) | `paraCadaEmpresa(fn)`: lista las organizaciones en plataforma y ejecuta `fn` dentro de `conEmpresa(id)`. Un fallo en una empresa no frena las demás: se registra con el id y el cron devuelve el resumen. Sin empresas no hace nada (R16) | `lib/db/para-cada-empresa.ts`, `app/api/cron/*/route.ts` |
| Drenador de jobs (D16) | Por cada job reclamado: si tiene `organizacionId`, `conEmpresa(job.organizacionId, handler)`; si no, `comoPlataforma("SL-17", "job sin empresa")`. Los jobs recurrentes sin empresa que tocan negocio iteran con `paraCadaEmpresa` (R16). El reclamo y el cierre (`FOR UPDATE SKIP LOCKED`, complete, backoff) siguen en plataforma, porque `jobs` no es de negocio (R42) | `app/api/cron/procesar-jobs/route.ts`, `scripts/drenar-jobs.ts`, `lib/repositories/JobRepository.ts` |
| Rastreo público | En plataforma, una sola lectura de `orden.organizacion_id` por `num_guia` (único global hasta SL-18). El resto va en `conEmpresa`. SL-18 tiene que conservar un camino de rastreo cuando `num_guia` deje de ser global: queda anotado para esa ficha | `lib/actions/rastreo-publico.ts`, `app/paquete/[numGuia]/page.tsx` |
| Postulación pública de mensajero y de recurso (D13) | No hay empresa, así que falla cerrado con `EmpresaNoResuelta` (R41). La acción traduce el error a un mensaje neutro («la postulación no está disponible»), sin 500. La ruta por empresa con `slug` es SL-35 «Landing pública por empresa con postulación» | `lib/actions/postulacion-mensajero.ts`, `lib/actions/postulacion-recurso.ts` |
| Alta de empresa por el superadmin (§7.7) | La action comprueba el rol superadmin (R48) y llama al servicio dentro de `comoPlataforma("SL-17", "alta de empresa por el superadmin")` | `lib/actions/organizaciones.ts` |
| Webhook WhatsApp entrante y sincronización de plantillas (D14) | `comoPlataforma("SL-36", …)` (SL-36 «Módulo de integraciones por empresa»). El webhook deriva la empresa de la conversación o de la orden y escribe dentro de `conEmpresa`. La sincronización de plantillas escribe en `plantilla_mensaje`, que es de negocio, así que itera las empresas con `paraCadaEmpresa`. Las credenciales siguen siendo las variables globales hasta esa ficha | `app/api/webhooks/whatsapp/route.ts`, `app/api/cron/sync-plantillas-whatsapp/route.ts` |
| Landing y conteos públicos (D13, D17) | La landing pasa a ser de la plataforma, y los conteos públicos se **retiran** (R43): se borran la acción, el repositorio, la caché y el componente, y la landing deja de mostrar cifras. No queda ninguna excepción de plataforma para ellos | §7.8 |

### 7.6 Cachés (R34)

En los dos adaptadores que quedan (`lib/cache/next-analitica-cache.ts` y
`next-tablero-dia-cache.ts`; el de conteos públicos se retira en §7.8), la clave pasa a ser
`["org:" + organizacionId, …clave]`, y la etiqueta de invalidación también lleva la empresa.

- La empresa se resuelve **antes** de entrar en `unstable_cache`, porque dentro no se puede
  llamar a `cookies()`.
- La función que produce el valor se ejecuta dentro de `conEmpresa(organizacionId, producir)`.
- Si no hay empresa, no se cachea y la producción falla con `EmpresaNoResuelta`.
- El job `analitica-invalidacion-cache` invalida la etiqueta de la empresa del job (R42).

### 7.7 Alta de empresa: pieza de dominio para el superadmin (D18 revisada, R44–R46, R48)

Las empresas las crea el **superadmin**, no un comando. SL-17 deja servicio, repositorio y una
Server Action protegida. La pantalla «Empresas» que la llama es de SL-32. No abre el alcance de
SL-25 ni de SL-26.

| Pieza | Qué hace |
|---|---|
| `lib/types/organizacion.ts` | Schema zod `AltaEmpresaInput`. Lleva `nombre` (no vacío), `slug` (formato de §3) y `maestro: { nombre, email }`. Mientras no se responda la pregunta abierta 1, `maestro` lleva además `telefono`, `documento` y `tipoDocumento` (del catálogo). También define el tipo `AltaEmpresaResultado` |
| `lib/interfaces/services/IOrganizacionService.ts`, `lib/interfaces/repositories/IOrganizacionRepository.ts` | Contratos |
| `lib/services/OrganizacionService.ts` | `altaEmpresa(input): Promise<AltaEmpresaResultado>`. Valida con zod y genera para el maestro un hash de contraseña **no utilizable**: un secreto aleatorio de 32 bytes que no se guarda ni se muestra, pasado por el mismo hasher del login. Después delega. No importa Prisma |
| `lib/repositories/OrganizacionRepository.ts` | Una transacción: `pg_advisory_xact_lock(hashtext(slug))` y lectura de `organizacion` por slug. Si no existe: `INSERT organizacion`, `fijarEmpresa(id)` e `INSERT usuario` (rol `maestro`, estado `activo`, `organizacionId` explícito). Si existe, decide entre idempotencia y conflicto (tabla de abajo) sin escribir. Traduce P2002 de `email` o `cedula` a conflicto y revierte la transacción entera |
| `lib/actions/organizaciones.ts` | `'use server'`, con `altaEmpresaAction(input)`. Hace `resolveActorFromSession()` y `exigirSuperadmin(actor)`; si falla, devuelve «no autorizado» sin llamar al servicio (R48). Si pasa, ejecuta `comoPlataforma("SL-17", "alta de empresa por el superadmin", () => servicio.altaEmpresa(input))`. Entra en `EXCEPCIONES_DE_PLATAFORMA` |
| `lib/auth/exigir-superadmin.ts` | **El punto de enganche con SL-32.** `exigirSuperadmin(actor: Actor \| null): boolean`. Si `lib/auth/plataforma.ts` ya existe al implementar, delega en su `esPlataforma(actor.rol)`. Si no existe, devuelve **siempre `false`**, con el comentario `// SL-32: sustituir por esPlataforma de lib/auth/plataforma.ts`. Una guardia (en `tests/unit/actions/organizaciones-action.test.ts`) comprueba que, cuando `lib/auth/plataforma.ts` existe, este archivo lo importa. Así el enganche no se queda en `false` por olvido |

**Desenlaces de `altaEmpresa`:**

| Caso | Resultado |
|---|---|
| Slug libre | `{ estado: "creada", organizacionId, maestroId }` |
| Slug existente y mismo email de maestro | `{ estado: "ya_existe", organizacionId }`, sin escribir (idempotente) |
| Slug existente con otro email de maestro | `{ estado: "conflicto", campo: "slug" }`, sin escribir |
| Email (o documento) ya usado por otro usuario | `{ estado: "conflicto", campo: "email" \| "documento" }`, con rollback: no queda ni la organización |
| Entrada inválida | `{ estado: "invalida", campo }`, sin escribir |

**El primer acceso del maestro:** usa «recuperar contraseña» (`PasswordResetService`, OTP por
correo), que busca por email y no mira el estado. No se inventa un flujo nuevo.
- El OTP necesita SMTP en cada entorno, o `AUTH_OTP_DEBUG_LOG` encendida de forma temporal.
- El primer login desde un dispositivo nuevo pasa además por el OTP del RBA.

R32 sigue valiendo: nada siembra empresas, y la action la ejecuta una persona superadmin.

### 7.8 Retiro de los conteos públicos (D17, R43)

Se borran:
- `lib/actions/conteos-publicos.ts`;
- `lib/repositories/ConteosPublicosRepository.ts`;
- `lib/interfaces/repositories/IConteosPublicosRepository.ts`;
- `lib/interfaces/external/IConteosPublicosCache.ts`;
- `lib/config/conteos-publicos-cache.ts`;
- `lib/cache/conteos-publicos-cache-nula.ts`;
- `lib/cache/next-conteos-publicos-cache.ts`;
- `lib/types/conteos-publicos.ts`;
- `app/_landing/cifras-publicas.tsx`;
- `tests/unit/actions/conteos-publicos.test.ts` y `tests/components/cifras-publicas.test.tsx`.

Se editan `app/_landing/LandingHero.tsx` y `app/_landing/LandingBanda.tsx`, que dejan de
mostrar cifras, y las guardias y fixtures que las citan:
- `tests/unit/guards/landing-sin-maqueta.guardia.test.ts`;
- `tests/unit/guards/rastreo-frontera.guardia.test.ts`;
- `tests/unit/analytics/cache-aislamiento.guardia.test.ts`;
- `tests/fixtures/superficies-publicas.ts`.

Los otros archivos que mencionan los conteos (`OrdenRepository`, `geografia-activa`, tipos de
rastreo) se revisan: si solo es un comentario, se actualiza el comentario.

Hay un test nuevo para R43: ningún export de `lib/actions/` sin sesión devuelve agregados de
negocio. La lista de superficies públicas de `tests/fixtures/superficies-publicas.ts` ya no tiene
conteos.

### 7.9 Que todo funcione con dos empresas (no solo que no filtre)

Además de «B no ve A», cada entrada sin sesión tiene un test con **dos empresas con datos**, que
comprueba que el trabajo se hace en las dos y con la empresa correcta:

- **Crons:** con A y B sembradas, `corte-diario`, `generar-gastos-fijos`, `liberar-reprogramadas`,
  `procesar-devueltas-sla` y `snapshot-ranking` producen sus filas en las **dos** empresas, cada
  fila con su `organizacion_id`. El resumen del cron cuenta las dos. Un fallo provocado en A no
  impide que B termine (R16).
- **Drenador:** un job encolado en A y otro en B se ejecutan. Lo que escribe cada handler
  (notificación, `push_envio_dia`, entrega de WhatsApp) queda en su empresa (R42).
- **API key:** con la key de A se crea una orden, y queda en A. Con la key de B se consulta, y no
  la ve. Una key de B no puede cancelar la guía de A: responde «no encontrado» (R13).

## 8. Guardias (`tests/unit/guards/`, R23–R27, R39)

Son estáticas y sin base. Leen `lib/db/modelos-de-negocio.ts`, `db/schema.prisma` y `db/migrations/`.

| Guardia | Falla si |
|---|---|
| `organizacion-en-modelos.guardia.test.ts` (R5, R23, R2, R4) | Un modelo no está clasificado, o negocio + plataforma + diferidos no suman los modelos del esquema. Un modelo de negocio no tiene `organizacionId @map("organizacion_id")` y `@@index([organizacionId…])`. Uno de plataforma la tiene. Uno de negocio distinto de `Usuario` la tiene opcional |
| `rls-por-empresa.guardia.test.ts` (R24) | Una tabla de negocio no tiene un `CREATE POLICY … ON "<t>" … TO servi_app` con `current_setting('app.organizacion_id'` en alguna migración, o un `DROP POLICY` posterior la deja sin ella |
| `sql-a-mano-por-empresa.guardia.test.ts` (R25, R26) | Un archivo de `lib/` o `app/` con `$queryRaw`/`$executeRaw`/`Prisma.sql` nombra una tabla de negocio (`"orden"`, `orden o`, `FROM orden`, …) y no contiene `organizacion_id`, salvo que esté en `EXCEPCIONES_SQL_A_MANO` |
| `plataforma-solo-en-lista.guardia.test.ts` (R27, R26) | Un archivo llama a `comoPlataforma(` y no está en `EXCEPCIONES_DE_PLATAFORMA`. Una excepción no trae `ficha: "SL-<n>"` y `motivo`, o apunta a un archivo que no existe |
| `fk-misma-empresa.guardia.test.ts` (R39) | Una FK de negocio a negocio de `Prisma.dmmf` (calculada con `lib/db/fk-de-negocio.ts`, la misma función que usa el generador) no tiene en `db/migrations/` un `CREATE TRIGGER "<nombre determinista>" … verificar_misma_empresa`, o un `DROP TRIGGER` posterior se lo quita. También falla si una FK de negocio es compuesta, y si una tabla de negocio no tiene `<tabla>_sin_cambio_de_empresa` |

`EXCEPCIONES_SQL_A_MANO` y `EXCEPCIONES_DE_PLATAFORMA` viven en `lib/db/excepciones-aislamiento.ts`:
`{ archivo, ficha, motivo }[]`.

- La primera arranca con **todos** los archivos de SQL a mano que hoy no filtran (son unos 66).
  Todos llevan `ficha: "SL-17"` y el motivo «cubierto por RLS; revisión fina pendiente», que
  es D7: la RLS ya los cubre y la revisión uno a uno es una tanda siguiente.
- Es una lista que solo puede **bajar**. Un archivo nuevo con SQL a mano sin filtro pone el gate
  en rojo.
- Las guardias se prueban contra sí mismas: cada una tiene un caso con un esquema o una fuente
  inventados que **debe** fallar. Una guardia que nunca puede fallar no prueba nada.

## 9. Tests

### 9.1 Fábricas (R33)

- `tests/fabricas/organizaciones.ts` (archivo nuevo; SL-31 es dueño del resto de la carpeta):
  ```ts
  export async function crearOrganizacion(c: ClienteDeFabrica, o?: { nombre?: string }): Promise<{ id: string }>;
  export async function fijarEmpresa(tx, organizacionId: string): Promise<void>;          // set_config('app.organizacion_id', …, true)
  export async function comoApp(tx, organizacionId: string): Promise<void>;               // fijarEmpresa + set_config('role','servi_app', true): para probar la RLS
  ```
  Con `fijarEmpresa`, las fábricas de SL-31 (`crearUsuario`, `crearZona`, `crearOrden`) no
  cambian: el `DEFAULT` de §3 pone la empresa.
- `tests/integration/db/_postgres-real.ts`: `enTransaccionRevertida` acepta `{ organizacionId? }`.
  Si no se lo pasan, crea una organización de prueba dentro de la transacción y la fija. Así los
  tests de integración que ya existen siguen insertando sin conocer SL-17, y el rollback la borra.
- `tests/integration/db/_fixtures/orden-minima.ts`: sin cambios si hereda la empresa de la
  transacción. Si un test inserta fuera de `enTransaccionRevertida`, la suite completa (T4.3) lo encuentra.

### 9.2 Dos empresas (R28–R31, R17–R22)

Patrón: en una transacción revertida, bajo `serializarEscriturasReales`:

1. Se crean las organizaciones A y B.
2. Se siembran datos de A con `fijarEmpresa(A)`.
3. Se cambia a `fijarEmpresa(B)`; el `set_config` local se puede volver a fijar en la misma
   transacción.
4. Se ejecuta el **repositorio o servicio real**, con el cliente extendido y el contexto
   `conEmpresa(B)`, contra los ids de A.

Se mide en la base: la fila de A sigue igual, el listado de B no la trae y la operación por id da
«no encontrado».

| Archivo | R |
|---|---|
| `tests/integration/db/aislamiento-ordenes.test.ts` | R28, R7, R8, R9 |
| `tests/integration/db/aislamiento-wallet.test.ts` | R29 |
| `tests/integration/db/aislamiento-cierres.test.ts` | R30 |
| `tests/integration/db/aislamiento-usuarios.test.ts` | R31, R3, R35 |
| `tests/integration/db/aislamiento-rls.test.ts` | R17–R22, R40, R10: con `comoApp(B)`, un SQL a mano sin `WHERE` solo ve filas de B; sin empresa ve 0 filas y el `INSERT` falla; el ajuste no sobrevive a la transacción; los catálogos se leen, pero `INSERT`/`UPDATE`/`DELETE` en `vehiculos` y en `provincia` dan `permission denied` y la fila no cambia; `Session` solo muestra usuarios de B |
| `tests/integration/db/aislamiento-fk-misma-empresa.test.ts` | R37, R38. Casos: un `INSERT` de una orden de B con la `tienda_id` de A, **por SQL a mano y como dueño** (sin servicio ni extensión), lo rechaza la base con `SL017`; un `UPDATE` que mueve la FK de una fila de B a una de A, igual; cambiar el `organizacion_id` de una fila, igual; un `historial_accion` de A con el superadmin como actor pasa; una FK nula pasa; un id inexistente lo rechaza la FK (`23503`), no el trigger. Se mata quitando el trigger de `orden.tienda_id` |
| `tests/integration/db/migracion-sl17-ida-y-vuelta.test.ts` | R6, R32: `migration.sql` → `down.sql` → esquema igual (`information_schema`, `pg_policies` y `pg_trigger`) para M1, M2, M3 y M4, en un esquema desechable con la técnica de `crearPrismaDeTestEnEsquema`. Tras aplicarlas, `organizacion` tiene 0 filas |
| `tests/integration/db/dos-empresas-entradas.test.ts` | R16, R42, R13 con dos empresas **con datos** (§7.9): crons, drenador y API key trabajan en las dos, cada una en la suya |
| `tests/unit/services/organizacion-service.test.ts` | R44–R46 con un repositorio doble: validación zod campo a campo; el hash no utilizable se genera y no sale en el resultado; los cinco desenlaces se propagan |
| `tests/integration/db/organizacion-alta.test.ts` | R44–R46 contra Postgres. Cubre la creación (organización y maestro `activo` con esa empresa), la idempotencia con el mismo slug y el mismo email, el conflicto por slug con otro email, el conflicto de email con rollback total (0 filas nuevas en `organizacion`) y la entrada inválida sin escrituras. Además, tras «recuperar contraseña» con el OTP del doble de correo, el maestro inicia sesión |
| `tests/unit/actions/organizaciones-action.test.ts` | R48: con un actor `maestro`, `admin`, `mensajero`, `adminTienda`, `adminSatelite`, `apiKey` o sin sesión, la respuesta es «no autorizado» y el servicio doble **no** se llama. Sin `lib/auth/plataforma.ts`, también el superadmin recibe «no autorizado». Con `plataforma.ts` presente, el superadmin pasa, y `exigir-superadmin.ts` lo importa |
| `tests/unit/actions/postulacion-sin-empresa.test.ts` | R41: sin sesión ni empresa, las dos postulaciones públicas responden con el mensaje neutro y no llaman a ninguna escritura |
| `tests/unit/guards/conteos-publicos-retirados.guardia.test.ts` | R43: no queda ninguna acción ni componente de conteos públicos, y la landing no importa ninguno |
| `tests/unit/db/extension-empresa.test.ts` | R7–R11, R14, R35, R36 (`email` único global): con un `PrismaClient` doble, se comprueban los `args` que llegan a `query` y los errores sin ejecutar |
| `tests/unit/auth/empresa-de-la-peticion.test.ts` | R12, R14: la empresa sale del usuario de la sesión. Una cabecera, query o cuerpo con otro id no la cambia. El superadmin da `null` |
| `tests/unit/api/api-key-empresa.test.ts` | R13 |
| `tests/unit/db/para-cada-empresa.test.ts` | R16 |
| `tests/unit/cache/cache-por-empresa.test.ts` | R34 |

Cada test de aislamiento se **mata con una mutación** antes de creerlo: quitar el filtro de la
extensión, o la política, tiene que ponerlo en rojo. La evidencia va a `progress/impl_SL-17.md`.
Es la lección «probar el WHERE donde vive» y la del «test verde sin datos»: sin filas de A
sembradas, el test **falla**, no se salta.

**CI:** los shards de vitest no migran la base hoy. Eso lo arregla SL-31 (D5 de su spec). Hasta
que mergee, los tests de §9.2 corren en local con `HAY_BASE_DE_DATOS`, y en CI se saltan como el
resto de `tests/integration/db/`. Queda dicho en el PR.

### 9.3 Humo de aceptación de dos empresas (R47, tanda 4)

`e2e/dos-empresas-humo.spec.ts` (Playwright, local; la aborta una base remota, como
`e2e/marca.spec.ts`):

1. **Alta.** Desde la fixture del spec, llama a `OrganizacionService.altaEmpresa` dentro de
   `comoPlataforma` dos veces, para A y B, con slugs y emails aleatorios. Repetir la de A da
   `ya_existe` (R45). La contraseña de cada maestro la fija la fixture directamente en la base,
   porque el humo no prueba el correo. **Cuando exista la pantalla «Empresas» de SL-32, este paso
   se cambia** para dar de alta A y B desde ella como superadmin.
2. **Datos.** Siembra en cada empresa, con `fijarEmpresa`, lo mínimo para que cada pantalla tenga
   algo que enseñar: una zona, una tienda, un mensajero, una orden con número de guía, un
   movimiento de wallet, un cierre del día, una tarifa, una API key con su webhook y una
   plantilla. Cada dato de A lleva un marcador de texto único (`A-<uuid>`).
3. **Recorrido.** Entra como maestro de A y como maestro de B, con un `trusted_device` sembrado
   para saltar el OTP (la técnica de `marca.spec.ts`). Visita **todas las rutas del menú del
   maestro**. La lista no se escribe a mano: sale de `lib/auth/menu-visibility.ts` para el rol
   `maestro`, con sus hijos. Hoy incluye:
   - dashboard, analítica y monitoreo;
   - órdenes, recolección, novedades e incidentes;
   - ranking y su histórico;
   - wallet (caja principal, tiendas, mensajeros, satélites);
   - cierres;
   - configuración: usuarios, tarifas, API y webhooks, plantillas, envíos automáticos,
     vehículos, geografía y SINPE;
   - histórico de conversaciones y de acciones;
   - ayuda.
4. **Qué comprueba en cada ruta:**
   - responde sin la pantalla de error de `app/(app)/error.tsx` ni un 500, y sin
     `EmpresaNoResuelta` en el log del servidor;
   - en las páginas de B no aparece ningún marcador `A-…`;
   - B abriendo la URL de detalle de la orden de A ve «no encontrado».
5. **Pantallas de solo lectura.** Vehículos y geografía se abren y se leen (R40). Que su escritura
   falle cerrado lo prueba `aislamiento-rls`, no el humo.

Su salida va a `progress/impl_SL-17.md`. Es la prueba de «dos empresas reales mañana».

**E2E y flujos críticos:** el aislamiento entre empresas entra en
`docs/checkpoints-proyecto.md > Flujos críticos`, con este E2E como evidencia, y se cierra el
ABIERTO de esa sección.

## 10. Choques con otras ramas — regla: quien mergea segundo rebasa

| Rama | Qué compartimos | Contrato |
|---|---|---|
| SL-32 (rol superadmin) | `db/schema.prisma` (`Usuario`, enum `RolValue`), `usuario`, migraciones posteriores | SL-17 deja `usuario.organizacion_id` **nulable**, sin `CHECK` (R3). La extensión rechaza crear un usuario sin empresa salvo con `null` explícito en plataforma (R35). **SL-32 añade después** `CHECK (("organizacion_id" IS NULL) = ("rol_id" = '<UUID_ROL_SUPERADMIN>'))` y su índice global de un solo superadmin. Su comando de arranque usa `comoPlataforma("SL-32", …)` y entra en `EXCEPCIONES_DE_PLATAFORMA`. Email y cédula siguen únicos globales (R36). Sus migraciones llevan timestamp posterior a `20261022130300`. **Cambios para SL-32:** (1) Vehículos deja de ser del maestro, por D12: el catálogo es de plataforma y lo edita el superadmin en SL-26; si SL-32 lista Vehículos entre los permisos o el menú del maestro, eso cambia. (2) **Punto de enganche:** la action de alta de SL-17 (`lib/actions/organizaciones.ts`) comprueba el rol en `lib/auth/exigir-superadmin.ts`, que delega en `esPlataforma` de `lib/auth/plataforma.ts` (de SL-32). Si SL-17 mergea primero, ese archivo devuelve siempre `false` (falla cerrado para todos), y SL-32, al rebasar, lo cambia por la delegación; la guardia de `organizaciones-action.test.ts` lo exige en cuanto `plataforma.ts` existe. Si SL-32 mergea primero, SL-17 delega desde el principio. (3) **La pantalla «Empresas» es de SL-32** y llama a `altaEmpresaAction`. SL-17 no crea UI. Ya no hay choque en `faltasDeScripts` ni en `package.json`, porque SL-17 no añade ningún script |
| SL-31 (fábricas y CI) | `tests/fabricas/`, `tests/integration/db/_postgres-real.ts`, `.github/workflows/gate.yml` | SL-17 solo **crea** `tests/fabricas/organizaciones.ts` y toca `enTransaccionRevertida`. No toca `gate.yml`. Si SL-31 mergea antes, SL-17 rebasa y pasa `fijarEmpresa` al `ClienteDeFabrica`; el humo E2E puede entonces usar `tests/fabricas/e2e.ts`. Si SL-17 va antes, SL-31 rebasa sobre la firma nueva de `enTransaccionRevertida` |
| SL-18 | únicos, secuencias, índices compuestos | Arranca con la columna ya puesta. Hereda la nota del rastreo público (§7) |
| SL-19 | `jobs`, storage | Hereda `jobs.organizacion_id` (M4) y el drenador por empresa. Le queda el resto: `dedupe_key` por empresa, storage, revisión de cada handler y las purgas de storage |
| SL-25 | alta de empresas en autoservicio | Puede reutilizar `OrganizacionService.altaEmpresa`. El autoservicio (plan, módulos) es suyo |
| SL-28 | migraciones | Va después: consolida también M1–M4 |

## 11. Alternativas descartadas

- **A. Pasar `organizacionId` a mano por cada servicio y repositorio**, el «filtro en cada
  repositorio» literal. Son unos 25 repositorios, 169 archivos con `getPrismaClient()` y 103
  `$transaction`. Un olvido es una fuga y no hay quien lo detecte: la guardia no puede saber si un
  `where` concreto filtra. Además no llega a mañana. La extensión lo hace por construcción, y
  las guardias y la RLS cierran lo que no ve.
- **B. `FORCE ROW LEVEL SECURITY` en vez de un rol nuevo.** No sirve en CI, porque `postgres` es
  superusuario y se salta incluso `FORCE`. Además obligaría a que el login y el superadmin
  pasaran también por políticas, mezclando la plataforma con la empresa.
- **C. Un segundo usuario de base (`DATABASE_URL_APP`, con login) en vez de `SET ROLE`.** Es más
  limpio en teoría, pero añade secretos por entorno, dos pools y una URL más que configurar en
  Vercel y en CI, todo para mañana. `SET LOCAL ROLE` da la misma garantía en la transacción con la
  URL de siempre. Se puede revisitar al desplegar.
- **D. Fijar la empresa con `SET` (de sesión) al abrir la conexión.** Con el pooler transaccional,
  la conexión se reparte entre peticiones de empresas distintas: una fuga entre empresas por
  diseño. Por eso es `set_config(..., true)` en cada transacción (D4).
- **E. Esquema de Postgres por empresa.** Contradice la decisión 1 de `docs/plan-saas.md`: una sola
  base compartida, separada por `organizacion_id`.
- **G. FK compuestas `(organizacion_id, id)` para la misma empresa.** Habría que tocar unas
  170 relaciones de Prisma (`fields`/`references` dobles), con un `@@unique([organizacionId, id])`
  en cada tabla referenciada. Cambian el esquema y los tipos del cliente en todos los
  `connect`. Hacerlo solo en SQL, sin Prisma, deja drift: `migrate dev` lo detectaría y
  propondría borrarlo. Los triggers de M3 dan la misma garantía sin que Prisma se entere (D15).
- **H. Solo la lectura previa en los servicios.** Depende de que nadie olvide leer antes de
  enlazar, y no cubre el SQL a mano ni el contexto de plataforma. Se mantiene como primera línea,
  pero ya no es la única (D15).
- **F. `AsyncLocalStorage.enterWith` dentro de `buildAutenticar` para no tocar las 9 rutas de
  API key.** El contexto fijado así dentro de una función `async` no llega de forma fiable a la
  continuación de quien la llamó. Se prefiere el `conEmpresa(…)` explícito en cada una de las 9 rutas.

## 12. Riesgos y lo que esto NO cubre

- **FK entre empresas:** las cubren los triggers de M3 (R37–R39). Lo que queda es su **coste por
  insert** (T2.7 lo mide), y que una FK escrita en SQL a mano **fuera** de Prisma no aparece en el
  DMMF, así que la guardia R39 no la ve. Hoy no hay ninguna: todas las FK del esquema están
  declaradas en `schema.prisma`.
- **Credenciales globales de WhatsApp** hasta SL-36 «Módulo de integraciones por empresa». Dos
  empresas comparten número y plantillas de Meta. Los datos del chat sí quedan separados por
  empresa.
- **Coste por consulta** de la envoltura (§6.3): T1.1 lo mide. Si en una ruta caliente se pasa
  del presupuesto, se anota como deuda y no se optimiza mañana.
- **Memo de 60 s** sessionId → empresa (§5): tras cerrar sesión, durante 60 s una cookie vieja
  seguiría resolviendo empresa. La autorización la rechaza igual (`resolveActorFromSession` valida
  la sesión), así que el memo no concede nada que la sesión no conceda.
- **Revisión fina del SQL a mano** (D7): unos 66 archivos quedan en la lista de excepciones con la
  ficha SL-17. La RLS es su única defensa hasta que se revisen.

## Perfil del proyecto (`docs/perfil-agentes.md > spec_author`)

- **Modelo de datos:** §2 y §3: `organizacion_id`, RLS y migraciones con `down.sql`. Los únicos por
  empresa son SL-18 (R36).
- **Autorización:** no cambia. Sigue en Server Actions, route handlers y Server Components, y el
  filtro de empresa se suma a ella. No depende de ningún módulo encendido (fase 4).
- **País:** no introduce datos de país. La geografía sigue siendo de plataforma (SL-20).
- **Dependencias:** ninguna nueva. `AsyncLocalStorage` es de Node (`node:async_hooks`), y
  `$extends` ya viene con `@prisma/client`.
