# SL-43 «Datos de demostración para QA» — design

## Lo que ya existe

**Términos buscados:** `seed`, `siembra`, `demo`, `fabrica`, `escenario`, `crearEmpresa`,
`altaEmpresa`, `limpiar`, `DELETE FROM`, `drenarGeocodificacion`, `geocode_cache`, `es_demo`,
`RUTAS_GUARDADAS`, `confiarDispositivo`, `VERCEL_ENV`. Se buscó en `feature_list.json` (por `key`),
`specs/`, `progress/`, `scripts/`, `db/`, `e2e/` y `tests/`, con Grep y Read. **El MCP del grafo no
tiene proyecto para este worktree** (`list_projects` no lo lista): todo se leyó con Grep y Read.

Nada cubre la ficha entera. Lo que aparece se reutiliza:

| Qué apareció | Qué es | Qué se hace |
|---|---|---|
| `tests/fabricas/e2e.ts` (SL-44) | Alta de empresa por `OrganizacionService.altaEmpresa` en `comoPlataforma`, alta de usuarios por `UsuarioService`, contraseña del maestro con `hashPassword`, `confiarDispositivo`. Su cabecera dice que «lo importan los E2E y, después, SL-43». **Solo admite bases `localhost`** y genera correos y contraseñas aleatorios. | **Se reutiliza**, separando la parte genérica (D1.2). Su API pública y su guarda de host no cambian. |
| `e2e/_escenarios/reparto.ts` y `cierres.ts` (SL-44) | Zonas, tarifas, órdenes por carga masiva, el camino de estados (`llevarA`), gestiones y aprobación de cierres, todo por servicio y montado como en cada Server Action. | **Se reutiliza su núcleo**, que pasa a `tests/fabricas/escenarios/` (D1.2). No se puede importar tal cual: al cargarse **pisa `SUPABASE_URL` con el doble de Storage**, lee con `abrirBaseE2E` (solo local) y ubica las órdenes llamando al cron por HTTP. |
| `e2e/_escenarios/crons.ts > drenarGeocodificacion` | Drena la cola hasta que la geocodificación falla por configuración: la orden queda `asignable_sin_ubicacion`, **sin coordenadas**. | **No se usa en la demo**: D8 pide órdenes ubicadas (alternativa 1). |
| `scripts/drenar-jobs.ts` | Drenador manual con handlers reales y guarda de host. | No se usa (alternativa 1). |
| `scripts/migrar-storage-a-carpetas.ts > RUTAS_GUARDADAS` (SL-19, rama sin mergear) | Las 12 columnas que guardan una ruta de Storage, con su bucket y un lector filtrable por `organizacionId`. | **Se reutiliza** para saber qué archivos borrar (D4.1). |
| `lib/storage/*` de SL-19 | Adaptadores que escriben y borran en `<organizacion_id>/<ruta>`; `SupabaseAlmacenDescargas.purgarAnterioresA` limpia `tmp/` de la empresa en curso. | **Se usan** para subir y borrar (D8). Ninguna excepción nueva en la guardia de Storage de SL-19. |
| `tests/integration/db/aislamiento-cierres.test.ts > limpiar` | Borrado de todo lo de unas empresas por pasadas, cada `DELETE` en su `SAVEPOINT`, hasta que no queda nada. | **Se reutiliza la técnica** (D4.2). |
| `e2e/_storage-falso/servidor.mjs` (SL-44) | Doble HTTP del API de Storage, ya usado por los tests de integración de SL-19. | Lo usa el test de integración (D9). |
| `app/api/ordenes/api-key/carga/route.ts > handleCargaApi` | El handler de la carga por API, exportado para tests. | La demo lo llama con una `Request` y la API key real (D5.1). |
| `lib/repositories/OrdenGeocodeRepository.ts > guardarResultado`, `JobRepository.complete/fail`, `lib/services/jobs/geocodificacion-encolado.ts > dedupeKeyGeocodificacion` | El escritor de coordenadas que usa el job, y el cierre de jobs de la cola. | Se usan para ubicar y cerrar (D6). |
| `scripts/arranque-superadmin.ts` (SL-32) | Patrón de comando: `main` solo si es entrypoint, salida inyectable, errores sin datos. | Se sigue el patrón. |
| SL-44 R27 y alternativa 6 de su design | Los E2E no borran nada: borrar por FK es «largo y frágil». | Aquí borrar es el pedido (D7). Se mide con dos corridas seguidas y una pasada que no avanza aborta (R8). |
| `feature_list.json`, `specs/` | Ninguna otra ficha de datos de demostración. SL-44 menciona SL-43 solo como consumidora futura de la fábrica. | — |

## Multi-empresa, autorización y país

- **Una migración pequeña** (D3): la columna `organizacion.es_demo`. Ninguna tabla nueva.
- **Todo lo que crea la demo** vive en sus dos organizaciones y se escribe con `conEmpresa(<demo>)`.
  Así actúan como en la app la extensión, la RLS de `servi_app`, los triggers de misma empresa y los
  de SL-40 y SL-45.
- **Lo que corre como plataforma:**
  - el alta de cada empresa, la marca `es_demo` y la excepción de cobro;
  - el borrado, con el rol dueño (D4).

  `scripts/demo-qa.ts` entra en `EXCEPCIONES_DE_PLATAFORMA` con la ficha SL-43.
- **Autorización.** El comando no pasa por las Server Actions. Hace lo que hace la action después de
  validar la sesión: monta el servicio y le da el actor del rol (`usuarioId`, `rol`, `zonaId`,
  `organizacionId`). Los permisos por rol que viven en los servicios se ejercen igual.
- **Módulos.** El encargo no menciona módulos encendidos o apagados por empresa. Si `T1` encuentra uno
  que apaga una de las pantallas de la receta, lo enciende por su servicio y lo anota.
- **País.** La geografía, la moneda, los vehículos y los tipos de identificación salen de los
  catálogos de `db:seed` y de `lib/config/`. Las coordenadas no existen en el catálogo (P3).

## D1 — Dónde vive y cómo se corre

### D1.1 El comando

```
pnpm demo:qa [--confiar-navegador="<user agent>"]      # P1
```

- `package.json`: `"demo:qa": "tsx scripts/demo-qa.ts"`.
- Variables que lee:
  - `DATABASE_URL`, con el rol dueño de la base de QA;
  - `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`, el Storage de QA;
  - `DEMO_QA_CONTRASENA`, la contraseña de los usuarios demo;
  - `VERCEL_ENV`, si está.
- Como `arranque-superadmin.ts`: `process.loadEnvFile()` si hay `.env`, `main` solo como entrypoint,
  `ejecutarDemo(deps, salida)` inyectable para los tests, y `process.exitCode`, no `exit()`.
- Se corre a mano, desde la máquina de quien prueba, con el entorno de QA (P5). Nunca en el build ni
  en CI.

Pasos de `ejecutarDemo`, en este orden. Un paso que falla corta los siguientes:

1. guardia sin conexión (D2.1);
2. conexión y guardia de la base (D2.2);
3. comprobación del slug (R10);
4. borrado de Storage y después de la base (D4);
5. por empresa, A y después B: alta y marca (D3), receta (D5), ubicar y cerrar jobs (D6);
6. comprobación final: estados, jobs, integraciones (D6.3), y resumen (D7).

### D1.2 Reutilizar las fábricas del E2E sin cambiar su API

| Archivo | Qué pasa |
|---|---|
| `tests/fabricas/empresa-y-usuarios.ts` (nuevo) | `crearEmpresa(base, { nombre, slug, correoMaestro, contrasena })` y `crearUsuario(base, empresa, rol, { correo, contrasena, zonaId?, vehiculoId?, fulfillment? })`: el cuerpo actual de `crearEmpresaE2E`/`crearUsuarioE2E`, con el cliente dueño y los datos como parámetros. |
| `tests/fabricas/e2e.ts` | `crearEmpresaE2E` y `crearUsuarioE2E` delegan en los de arriba con sus correos y contraseñas aleatorios y con `dueno()`. Su guarda de host local no cambia. |
| `tests/fabricas/escenarios/reparto.ts` (nuevo) | El núcleo de `e2e/_escenarios/reparto.ts`: `servicios()`, `crearZona`, `crearEscenarioReparto`, `crearMensajero`, `crearOrden`, `llevarA`, `gestionar`, `corregirFechaReprogramacion`. Recibe por parámetro el lector dueño, la evidencia (bytes) y `prepararAsignacion(ordenIds)`. **No toca `process.env`.** |
| `tests/fabricas/escenarios/cierres.ts` (nuevo) | El núcleo de `e2e/_escenarios/cierres.ts`: `solicitarCierre`, `aprobarCierre`, `rechazarCierre`. Mismo patrón. |
| `e2e/_escenarios/reparto.ts`, `cierres.ts` | Conservan sus exportaciones y su cabecera. Montan el núcleo con `abrirBaseE2E`, `drenarGeocodificacion` como `prepararAsignacion` y el doble de Storage, que se sigue pisando aquí y solo aquí. Ningún `*.spec.ts` cambia. |

- **Hecho cuando** los grupos `reparto` y `dinero` del E2E siguen en verde sin tocar un spec. Es el
  check `e2e` del PR.
- Las importaciones de `scripts/` hacia `tests/fabricas/` ya tienen precedente: la cabecera de la
  fábrica las anuncia. No entran en el bundle de la app.

### D1.3 El código propio de la demo

`scripts/demo-qa.ts` (entrypoint) y `scripts/demo-qa/`:

| Archivo | Responsabilidad |
|---|---|
| `guardia-entorno.ts` | `validarEntornoDemo(env)` puro (D2.1) y `comprobarMarcaDeQa(cliente)` (D2.2). |
| `borrar.ts` | Encontrar las empresas demo, borrar sus archivos y sus filas (D4). |
| `receta.ts` | Los datos de una empresa, paso a paso, sobre las fábricas de D1.2 (D5). |
| `ubicar-y-cerrar-jobs.ts` | Coordenadas, cierre de jobs y la comprobación final de la cola (D6). |
| `geografia.ts` | Distritos de la demo (por `codigo_dta`) y su punto (P3). |
| `salida.ts` | El resumen sin secretos (D7). |

Nada de esto vive en `lib/`: no es código de la app y no debe llegar al bundle.

## D2 — La guardia anti-producción (R2–R5, R25)

### D2.1 Antes de conectar: `validarEntornoDemo(env)`

Es una función pura que devuelve `{ ok: true }` o `{ ok: false, motivo }`, con motivos fijos y sin
valores. Rechaza, en este orden:

1. `VERCEL_ENV === "production"` (R2);
2. falta `DATABASE_URL`, `SUPABASE_URL` o `SUPABASE_SERVICE_ROLE_KEY`, o no son URLs válidas;
3. la base y el Storage no son del mismo proyecto (R4):
   - el proyecto de Supabase sale del host `db.<ref>.supabase.co`, del usuario `postgres.<ref>` del
     pooler o del host `<ref>.supabase.co` de `SUPABASE_URL`;
   - los dos locales (`localhost`/`127.0.0.1`, sin `?host=`/`?hostaddr=`, como en
     `validarUrlBaseE2E`) cuentan como el mismo;
   - uno local y otro remoto, o dos refs distintos, se rechazan;
   - un host remoto del que no se puede sacar el ref también se rechaza;
4. falta `DEMO_QA_CONTRASENA` o no pasa `strongPasswordSchema` (R25).

### D2.2 Después de conectar, antes de escribir: la marca de la base

```sql
SELECT current_setting('servi.entorno', true) AS entorno
```

- Si no vale exactamente `qa`, aborta (R3). Es lo primero que se hace con la conexión abierta, antes
  de cualquier lectura de negocio.
- La marca vive en la propia base, no en el archivo de entorno de quien corre el comando. El README
  recuerda que Preview y Production **compartieron base**: con esta marca, un `DATABASE_URL` de
  producción copiado en el archivo de QA no pasa.
- La pone un humano una vez en QA (P2). En local la pone el test sobre su base desechable.
- `VERCEL_ENV` solo es una segunda capa: en la máquina de quien corre el comando casi nunca está
  definida.

### D2.3 Tests y mutaciones

- `tests/unit/scripts/demo-qa-guardia.test.ts`:
  - un caso por motivo de D2.1, más un caso verde local y otro remoto con el mismo ref;
  - comprueba que ningún mensaje contiene la URL, la clave ni la contraseña (R5);
  - `ejecutarDemo` con dobles: con la guardia en rojo, el doble de conexión no se llamó (R2, R4, R25).
- En `tests/integration/db/demo-qa.test.ts`, sobre una base sin la marca: el comando sale distinto
  de 0 y el recuento de `organizacion` no cambia (R3).
- **Mutaciones que deben salir rojas:**
  1. quitar el `if` de `production`;
  2. comparar la marca con `includes` en vez de `===`;
  3. aceptar el par «base local + Storage remoto»;
  4. leer la marca **después** del borrado.

## D3 — Qué es una empresa demo (R6, R10, R29)

### D3.1 Migración `<ts>_organizacion_es_demo`

El timestamp lo fija T0, posterior a `20261025150000_jobs_por_empresa` de SL-19.

`migration.sql`:

```sql
ALTER TABLE "organizacion" ADD COLUMN "es_demo" BOOLEAN NOT NULL DEFAULT false;
COMMENT ON COLUMN "organizacion"."es_demo" IS
  'SL-43: la creó el comando de datos de demostración (pnpm demo:qa). Solo la pone ese comando, como dueño.';
```

`down.sql`:

```sql
ALTER TABLE "organizacion" DROP COLUMN "es_demo";
```

- Prisma: `esDemo Boolean @default(false) @map("es_demo")` en `Organizacion`.
- **Quién puede escribirla:** nadie desde una empresa. `organizacion` ya es de solo lectura para
  `servi_app` (`REVOKE` de `20261022130000_organizacion_y_rol_app`), así que no hace falta otro
  `REVOKE`. El test lo comprueba como `servi_app` (R6).
- `OrganizacionService.altaEmpresa` no cambia: toda empresa nace con `false`.
- La guardia `organizacion-en-modelos` no cambia: `Organizacion` ya está clasificada como plataforma.
- Sin índice: hay pocas filas en `organizacion` y la consulta corre una vez por ejecución.

### D3.2 Slugs y marca

- Slugs fijos: `demo-qa-a` y `demo-qa-b`. Nombres: «Demo QA A» y «Demo QA B».
- Tras el alta, en `comoPlataforma("SL-43", …)`:
  `UPDATE organizacion SET es_demo = true WHERE id = <nueva> AND slug = <demo>`. Si actualiza una
  fila distinta de 1, aborta.
- **R10:** antes de borrar, si hay una organización con slug demo y `es_demo = false`, el comando
  aborta sin tocar nada y lo dice.
- **R29:** una ejecución que cae a mitad de la receta deja la empresa ya marcada, y la siguiente la
  borra.
- **Límite conocido:** si el proceso muere justo entre el alta y la marca (dos sentencias seguidas),
  queda una empresa con slug demo sin marcar, y la siguiente ejecución para por R10. La salida lo
  explica. Cerrarlo del todo obligaría a tocar `altaEmpresa` para una sola llamada (alternativa 3).

## D4 — El borrado (R7, R8, R9, R28)

Se buscan las empresas demo, como dueño:
`SELECT id FROM organizacion WHERE es_demo`. Para cada una se borran primero sus archivos y después
sus filas.

### D4.1 Storage primero (R9)

Con `conEmpresa(<demo>)`, para que los adaptadores de SL-19 resuelvan su carpeta y nunca otra:

1. Para cada entrada de `RUTAS_GUARDADAS`, se leen sus rutas con `leer(db, { organizacionId: { in: [demo] } })`,
   se quitan los nulos y los duplicados, y se borra por bucket con
   `new SupabaseFileStorage(undefined, bucket).remove(rutas)`.
2. `new SupabaseAlmacenDescargas(...).purgarAnterioresA(<ahora + 1 día>)` vacía `<demo>/tmp`.

- El adaptador solo puede expresar `<demo>/<ruta>` (R16 y R17 de SL-19), así que un archivo de otra
  empresa es inalcanzable por construcción.
- Va antes de la base porque las rutas viven en las filas. Si después falla la base, la empresa sigue
  marcada y la siguiente ejecución vuelve a intentarlo. Los archivos que falten no rompen nada: el
  borrado de un objeto que no existe es un no-op en Storage.
- **Límite conocido:** un objeto subido que ninguna fila nombra (una subida cuya transacción revirtió
  y cuya compensación falló) no se borra. La demo no produce ninguno en el camino feliz.

`remove` es de mejor esfuerzo (R24 de SL-19). El comando comprueba el resultado listando la carpeta
en el test (D9), no en QA.

### D4.2 La base: una transacción, por pasadas (R7, R8)

Con un `PrismaClient` dueño, sin la extensión de empresa. Es el mismo que abre `abrirBaseE2E`, pero
con la guardia de D2 en vez de la de host local.

1. **Tablas con empresa.** Se sacan del catálogo: `information_schema.columns` con
   `column_name = 'organizacion_id'`, en el esquema `public`, quitando `organizacion` y `usuario`.
   Así una tabla nueva queda cubierta sin tocar el comando.
2. **Filas de plataforma que cuelgan de los usuarios demo** (sesiones, dispositivos confiados,
   intentos de login, retos de OTP, suscripciones push…). Se sacan de `pg_constraint`: las FK hacia
   `usuario(id)` de tablas sin `organizacion_id`. Se borran por `<columna> = ANY(<usuarios demo>)`.
3. **Por pasadas.** Cada `DELETE … WHERE organizacion_id = ANY($1)` va en su `SAVEPOINT`. Si choca
   con una FK, se deshace ese `SAVEPOINT` y la tabla pasa a la siguiente pasada. Es la técnica de
   `aislamiento-cierres.test.ts > limpiar`.
4. Si una pasada entera no borra nada y quedan tablas, se lanza un error con sus nombres, la
   transacción entera revierte y no queda nada borrado (R8).
5. Al final, `usuario` de las empresas demo y después `organizacion`.

**Por qué con el rol dueño y no como la empresa (D12).**
- `servi_app` no tiene `DELETE` sobre `orden` (`20261024120000_cobro_plataforma_blindaje_orden`), ni
  `INSERT`/`UPDATE`/`DELETE` sobre `cobro_plataforma_movimiento` (`20261023130100`), ni
  `UPDATE`/`DELETE` sobre `wallet_movimiento` (`20261024140000_pago_plataforma_blindaje`). Es justo
  lo que esas fichas pidieron: que una empresa no pueda borrar su deuda ni reescribir su caja.
- Ningún servicio de la app borra una empresa: no hay baja de empresa.
- Los triggers no frenan un `DELETE`:
  - los de misma empresa y de cobro corren en `INSERT` y en `UPDATE OF deleted_at`;
  - el tope de SL-45 corre en `BEFORE INSERT`.

  El test lo confirma con datos reales.
- No se debilita el blindaje: el rol dueño no lo usa ningún camino de la app, y este camino solo
  corre tras la guardia de D2 y filtra por `es_demo`. Es lo que ya hacen las limpiezas de los tests.
- No toca `jobs` sin empresa, `geocode_cache`, `cobro_plataforma_tarifa`, catálogos ni geografía: no
  tienen `organizacion_id` ni FK hacia los usuarios demo.

## D5 — La receta de cada empresa (R11–R19)

### D5.1 Qué se crea y con qué

Cada paso monta su servicio como lo monta su Server Action o su route. `T1` deja escrito el mapa
exacto, action por action, en `progress/impl_SL-43.md`.

| Qué | Servicio (composition root de referencia) | Actor |
|---|---|---|
| Empresa y maestro | `OrganizacionService.altaEmpresa` (`lib/actions/organizaciones.ts`) en `comoPlataforma` | plataforma |
| Usuarios (R12) | `UsuarioService.crear`, `passwordMode: "manual"` (`lib/actions/usuarios.ts`) | maestro |
| Zonas central y satélite, tarifa de pago al mensajero y SINPE (R13) | `ZonaService.crear` y `SinpeBodegaService.confirmar` | maestro |
| Tarifas de tienda (R13) | `TarifaService.crear` | maestro |
| Zona especial (R13) | `DistritoZonaEspecialService` (SL-38) | maestro |
| Orden por pantalla (R14) | `OrdenService.crear` (su action de crear orden) | tienda |
| Órdenes por carga masiva (R14) | `BulkOrdenService.cargarMasiva` (`app/api/ordenes/carga-masiva/chunk/route.ts`) | tienda |
| API key (R12, R14) | `ApiKeyService` (`lib/actions/api-keys.ts`), sin webhook | maestro |
| Órdenes por API (R14) | `handleCargaApi(new Request(…, { Authorization: Bearer <key> }))`, el handler real del route. Genera el PDF de etiquetas en `etiquetas-guia/<demo>/…` | la key |
| Camino de estados (R15) | el núcleo de `llevarA` (D1.2) y los servicios de la tabla D5.2 | el de cada paso |
| Gestiones (R16) | `MisAsignacionesService.escogerParaGestion` y `.gestionar`, con evidencia en Storage | mensajero |
| Incidente con indemnización (R16) | `IncidenteAdminService` (ficha 158) | maestro |
| Devolución a tienda (R16) | `DevolucionOrigenService` y `DevolucionTiendaService` | el de cada paso |
| Cierres de día (R17) | `CierreDiaService.solicitarCierre`; `CierresAdminService.aprobarCierre` y `.rechazarCierre` | mensajero; maestro o adminSatelite |
| Cierre de bodega satélite (R17) | `CierreBodegaService` y `CierresBodegaAdminService` | adminSatelite; maestro |
| Novedad interna (R15) | el servicio del corte diario, **solo para la empresa demo**, dentro de `conEmpresa` | sistema |
| Pago a mensajero (R18) | `LiquidacionService` (o el que monte la action de pago a mensajeros) | maestro |
| Aporte de capital con comprobante (R18) | `AporteCapitalService`, comprobante en `wallet-comprobantes/<demo>/…` | maestro |
| Abono de tienda (R18) | `AbonoTiendaService` | maestro |
| Excepción de cobro (R19) | `CobroPlataformaService` (SL-40), en `comoPlataforma` | plataforma |
| Pago a la plataforma (R19) | el servicio que monta la action de SL-45 | maestro |

- **Nunca se llama a la ruta de un cron.** Las rutas de `/api/cron/*` recorren todas las empresas
  (`paraCadaEmpresa`). El corte diario se invoca sobre el servicio, dentro de `conEmpresa(<demo>)`.
  El test lo vigila: una empresa real con una orden en reparto sigue igual (R7).
- **Evidencias y comprobantes:** la imagen pequeña de `e2e/fixtures/evidencia.jpg`, que ya existe y
  no es una foto real. `T1` comprueba si un comprobante admite imagen; si solo admite PDF, se genera
  un PDF mínimo con `jspdf`, que ya es dependencia.
- **Sin integraciones, webhooks, plantillas ni envíos de WhatsApp** (R24). La receta no llama a esos
  servicios, y la comprobación final de D6.3 lo verifica.

### D5.2 Camino a cada estado y cifras

- **Los 20 estados (R15).** Cada orden sale del estado en que nace (`en_preparacion` con bodega
  propia; `por_recolectar_en_tienda` sin ella) y avanza por servicios hasta su estado. Se usan:
  - las transiciones del núcleo `llevarA`;
  - la recolección en tienda (ficha 157), para `recolectando` y `en_ruta_bodega_central`;
  - la aprobación de cierres, para `entregado`, `novedad`, `reprogramado` y
    `devolucion_a_origen_por_rechazo`;
  - el flujo de devolución (fichas 139 y 48), para `por_devolver_a_bodega_central`,
    `devolviendo_a_bodega_central`, `por_devolver_a_tienda`, `devolviendo_a_tienda` y
    `devuelta_a_tienda`;
  - la gestión `incidente` (ficha 158);
  - el corte diario sobre una orden que queda en reparto, para `novedad_interna`.

  `T1` fija el camino de cada estado leyendo las transiciones (`lib/types`, `inventario-transiciones-140`).
- **Si un estado no se alcanza por servicio**, no se escribe a mano: se para y se pregunta a Carlos.
  Si lo aprueba, entra en la tabla D5.3 con su motivo.
- **Cifras.** Son contenido de la demo, no reglas (P6). Todas son enteras (ficha 305):
  - tarifa de tienda: 2.500 de flete y 1.250 de devuelto, sin comisión ni IVA, como `reparto.ts`;
  - pago al mensajero: 1.500 por entrega y 164 por rechazo, como el E2E;
  - excepción de cobro de la plataforma: 100 por orden;
  - órdenes: unas con monto a cobrar (8.000) y otras sin él.
- **Volumen orientativo:** dos o tres órdenes por estado, entre 50 y 60 por empresa. Lo que tarde en
  QA se anota en `progress/impl_SL-43.md`.
- **Fechas.** Todo ocurre «hoy» según `fechaCalendarioCR`, como en el E2E. Las reprogramadas quedan
  para mañana.

### D5.3 Escrituras directas permitidas (R11)

| Qué | Motivo |
|---|---|
| `usuario.password_hash` del maestro (con `hashPassword`) y `usuario.contrasena_definida_at` | `altaEmpresa` crea al maestro sin contraseña utilizable a propósito, y el único camino de la app es el correo de bienvenida (SL-41), que la demo no envía. Es la misma excepción de `tests/fabricas/e2e.ts`. |
| `trusted_device` (solo con `--confiar-navegador`) | Lo crea el login tras un OTP. Es la técnica de `confiarDispositivo` (P1). |
| `organizacion.es_demo` | Es la marca de este comando (D3). |
| Coordenadas de la orden y cierre de jobs (D6) | Los escribe el job, que en QA no corre (D8). Se usa el mismo repositorio que usa el job. |

No hay ninguna otra. El reviewer comprueba que el diff no añade escrituras fuera de esta tabla.

## D6 — Datos listos en un QA sin cola (R20–R24)

### D6.1 Ubicar cada orden (R20, R21)

Justo después de cada creación de órdenes, dentro de `conEmpresa(<demo>)`:

1. `new OrdenGeocodeRepository(prisma).guardarResultado(ordenId, { latitud, longitud, precision: "APPROXIMATE", status: "OK", geocodedAt: ahora })`:
   - es el mismo escritor que usa `GeocodificacionService` cuando el proveedor contesta bien;
   - el punto sale de `geografia.ts`, según el distrito de la orden, con un desplazamiento
     determinista por orden de unos 100–200 m (P3).
2. El job de esa orden se busca por su clave exacta,
   `dedupeKeyGeocodificacion(ordenId, hashDireccion(direccion))`, y se cierra con
   `JobRepository.complete(id)`: la orden ya tiene lo que el job habría escrito.

Con coordenadas, el gate devuelve `asignable` por su paso R2, antes de mirar la cola. Ninguna orden
queda en `geocodificacion_en_curso`. El paso va **antes** de cualquier asignación de la receta: si se
olvida, la propia receta falla al asignar, que es el primer síntoma.

`T1` mira si la UI traduce `geocode_precision`. Si `APPROXIMATE` se pinta raro, se usa el valor que
la UI ya conoce.

### D6.2 Los demás jobs que encolan los servicios (R22–R24)

| Tipo | ¿Lo encola la receta? | Qué hace el comando |
|---|---|---|
| `geocodificacion` | Sí: al crear cada orden con dirección (pantalla, carga masiva, API). | Ubica y cierra con `complete` (D6.1). |
| `optimizacion_ruta` | Sí: al recoger y al gestionar (outbox del mensajero). | Lo cierra sin ejecutar. Sin la credencial de la empresa solo fallaría, y en QA nunca corre. La ruta del mensajero cae en su orden por defecto (feature 92). |
| `push_web` | Puede: el decorador de notificaciones lo encola si hay claves VAPID y un destinatario elegible gana su cupo. | Lo cierra sin ejecutar. Los usuarios demo no tienen suscripciones push. |
| `webhook_evento`, `webhook_estado` | No: exigen una suscripción de webhook activa del dueño de la orden, y la demo no crea ninguna. | Si aparece, R23. |
| `whatsapp_bienvenida` | No: exige una plantilla marcada como bienvenida. | Si aparece, R23. |
| `whatsapp_envio_evento`, `_programado`, `_ejecucion`, `_reintento` | No: exigen un envío automático encendido. | Si aparece, R23. |
| `whatsapp_chat_envio`, `whatsapp_template_sync` | No: exigen chat o plantillas. | Si aparece, R23. |
| `liberar_reprogramadas`, `analitica_rollup_diario`, `whatsapp_envio_mantenimiento` | Son recurrentes y sin empresa: no son de la demo. | No se tocan. |
| `analitica_invalidacion_cache` | No: lo encola un script de backfill. | Si aparece, R23. |

- **Cerrar sin ejecutar** es `JobRepository.fail(id, "[demo-qa] cerrado sin ejecutar: QA no procesa la cola", null)`.
  El job queda `failed`, con el motivo en `last_error`, sin reintento. Ni el cron ni
  `scripts/drenar-jobs.ts` lo vuelven a tomar.
- **La lista de tipos esperados** es una constante de `ubicar-y-cerrar-jobs.ts`:
  `geocodificacion`, `optimizacion_ruta` y `push_web`. Todo job de la demo en `pending` o
  `processing` de otro tipo se cierra igual y el comando sale con 1 nombrándolo (R23). Un tipo nuevo
  que los servicios empiecen a encolar se ve en la primera ejecución, en vez de quedarse esperando a
  un drenado que lo mande a un proveedor.
- **Correo.** Ningún servicio de la receta envía correo: la bienvenida de SL-41 la manda la action
  del alta, no `altaEmpresa`, y `UsuarioService.crear` no envía nada. El test lo vigila espiando los
  emisores de `lib/services/email/` (D9).
- **Sin proveedores por construcción.** Sin credenciales en `integracion`, los clientes de Google,
  Meta y Anthropic ni se construyen. La receta no llama al asistente, al chat ni a la optimización.
- **Después de SL-19.** `20261025150000_jobs_por_empresa` cambia la tabla `jobs`. T0 relee
  `JobRepository` y, si `complete`/`fail` exigen la empresa en contexto, se llaman dentro de
  `conEmpresa(<demo>)`.

### D6.3 Comprobación final (R15, R21, R22, R24)

Antes de imprimir el resumen, por cada empresa demo:

- un recuento por estado. Un estado vigente sin órdenes hace salir con 1 y lo nombra;
- el gate sobre las órdenes en estados asignables, que debe dar `asignable` en todas;
- cero jobs de la demo en `pending` o `processing`;
- cero filas en `integracion`, `webhook_suscripcion`, `plantilla_mensaje` y `whatsapp_envio`.

Es la misma lista que afirma el test de integración, así que en QA el comando se autocomprueba.

## D7 — Credenciales y salida (R5, R25–R27)

- **Correos fijos:** `demo-qa-<a|b>-<perfil>@example.test`. Los perfiles son `maestro`, `admin`,
  `tienda-bodega`, `tienda`, `satelite`, `mensajero-central`, `mensajero-satelite` y `api`. Son
  únicos globalmente (`usuario.email`) y no chocan entre ejecuciones porque el borrado va antes.
  Los documentos de identidad siguen el mismo patrón (`demo-qa-a-…`).
- **Contraseña:** la de `DEMO_QA_CONTRASENA` para todos. Quien corre el comando la conoce porque la
  ha escrito él. El comando la valida con `strongPasswordSchema` y no la imprime nunca.
- **Secreto de la API key:** se usa en memoria para llamar a `handleCargaApi` y no se imprime. Quien
  quiera probar la API crea su propia key desde la pantalla.
- **`--confiar-navegador`** (R27, pendiente de P1): para cada usuario demo, un `trusted_device` con
  `computeDeviceHash(userAgent)`. Es la técnica de `confiarDispositivo`. Con eso solo suma la IP
  desconocida (30), por debajo del umbral (50).
- **Salida:** una tabla `empresa · perfil · correo`, los recuentos por estado y los jobs cerrados por
  tipo. Los errores llevan el nombre del error y su código, nunca el mensaje de la base (patrón
  `rastroDelError` de `arranque-superadmin.ts`).

## D8 — Storage en el comando

- Todo archivo nuevo lo sube un servicio real con sus adaptadores de siempre: evidencias de gestión,
  comprobante del aporte, PDF de etiquetas del lote por API. Desde SL-19 caen en `<demo>/<ruta>`.
- El comando no crea clientes de Storage propios ni usa `createServerClient().storage`. No hace falta
  ninguna entrada en la lista de excepciones de Storage de SL-19.
- Contra QA, el Storage es el de `SUPABASE_URL`. En el test, el doble de SL-44.

## D9 — Verificación

### D9.1 Mapa `R<n> → test`

| R | Test |
|---|---|
| R1, R12–R19, R26 | `tests/integration/db/demo-qa.test.ts` — «la primera ejecución deja dos empresas demo completas» |
| R2, R4, R5, R25 | `tests/unit/scripts/demo-qa-guardia.test.ts` |
| R3 | `demo-qa.test.ts` — «sin la marca de QA no escribe nada» |
| R6 | `demo-qa.test.ts` — «`servi_app` no puede cambiar `es_demo`» y «el alta normal nace sin marca» |
| R7, R9, R28 | `demo-qa.test.ts` — «la segunda ejecución recrea y no toca la empresa real» |
| R8 | `tests/integration/db/demo-qa-borrado.test.ts` — una FK sintética que bloquea: nada borrado, error con el nombre de la tabla |
| R10 | `demo-qa.test.ts` — «slug demo en una empresa real: aborta sin cambios» |
| R11 | `demo-qa.test.ts`: todo `orden_historial_estado` de la demo tiene un origen de servicio, y cada orden tiene su cargo de SL-40 (prueba de que nació por los caminos con trigger). Además, revisión del diff contra la tabla D5.3. |
| R20, R21, R22, R23, R24 | `demo-qa.test.ts` — «órdenes ubicadas y asignables, cola sin pendientes, sin integraciones ni correo», y un caso con un job sintético de tipo no esperado: sale 1 y lo nombra |
| R27 | `demo-qa.test.ts` — con `--confiar-navegador`, el `RiskEngine` real da menos que el umbral para cada usuario demo |
| R29 | `demo-qa.test.ts` — la receta se corta a la mitad con un doble que lanza, y la siguiente ejecución borra lo que quedó |

### D9.2 El test de integración, en detalle

`tests/integration/db/demo-qa.test.ts`, con Postgres real (`HAY_BASE_DE_DATOS`) y el doble de
Storage levantado en un puerto libre:

- **Preparación:**
  - pone la marca `servi.entorno = 'qa'` en la base del test con `ALTER DATABASE … SET`, y la quita
    en `afterAll`;
  - crea una **empresa real** con `crearEmpresaE2E`, una orden en reparto con evidencia en el doble y
    una huella de sus filas: recuento por tabla con su `organizacion_id`, más la lista de sus objetos
    en el doble.
- **Corrida 1:** `ejecutarDemo` sale con 0, y se afirma:
  - las 20 cifras de estado de cada empresa, cada una ≥ 1, escritas a mano (son el contrato);
  - el resto de R12–R19;
  - el gate `AsignabilidadCoordenadasService.evaluar` real sobre las órdenes asignables;
  - los jobs;
  - los objetos del doble bajo `<demo>/`.
- **Corrida 2:** sale con 0, y se afirma:
  - los ids de la corrida 1 ya no existen en ninguna tabla;
  - el doble no tiene objetos bajo las carpetas de la corrida 1;
  - hay otra vez dos empresas demo;
  - la huella de la empresa real es idéntica;
  - el `jobs` sin empresa, el recuento de `geocode_cache` y el de `cobro_plataforma_tarifa` no
    cambiaron.
- **Control de no vacuidad:** antes de afirmar «no cambió», el test comprueba que la huella tiene
  filas (≥ 1 orden, ≥ 1 objeto). Un verde sin datos no cuenta.
- **Correo:** `vi.mock` de los emisores de `lib/services/email/`, que no deben recibir ninguna
  llamada en las dos corridas.

### D9.3 Mutaciones previstas (cada una debe dar rojo y se anota en `progress/impl_SL-43.md`)

1. Quitar el `WHERE es_demo` del borrado: la huella de la empresa real cambia.
2. Borrar la base antes que Storage: quedan objetos de la corrida 1 en el doble.
3. Quitar la llamada a `guardarResultado`: el gate da `geocodificacion_en_curso` (o la receta cae al
   asignar).
4. No cerrar los `optimizacion_ruta`: queda un job `pending`.
5. Quitar `optimizacion_ruta` de los tipos esperados: el comando sale 1 nombrándolo.
6. Llamar a la ruta del cron de corte en vez de al servicio en `conEmpresa`: la orden en reparto de
   la empresa real cambia de estado.
7. Las cuatro de D2.3.
8. Dejar `es_demo` escribible para `servi_app` (`GRANT UPDATE`): cae el caso de R6.
9. Sacar de la pasada la tabla que bloquea en `demo-qa-borrado.test.ts`: el error deja de nombrarla.

### D9.4 Lo que se comprueba a mano en QA (puerta humana, T12)

1. Carlos pone la marca de QA (P2).
2. Corre `pnpm demo:qa` dos veces.
3. Entra con dos perfiles.
4. Asigna una orden en bodega.
5. Comprueba que «Empresas» del superadmin sigue mostrando sus empresas reales sin cambios.

La salida, sin secretos, se pega en `progress/impl_SL-43.md`.

## Alternativas descartadas

1. **Drenar solo los jobs que encola el comando, con los handlers reales.**
   - Sin la credencial de Google de la empresa, `GeocodificacionService` lanza
     `GeocodeNoConfiguradoError`: la orden queda `asignable_sin_ubicacion`, **sin coordenadas**. Es
     lo que hace el E2E, pero no cumple «nacen ya ubicadas» (D8).
   - El handler, además, registra la caída en la salud de la geocodificación (ficha 401), con su
     aviso a los maestros.
   - Los jobs quedan reagendados con backoff, no cerrados.
2. **Sembrar `geocode_cache` con las direcciones de la demo** para que el handler real las «resuelva»
   sin red.
   - La caché es **de plataforma**, sin `organizacion_id`, y se consulta por huella de dirección.
   - Una empresa real con la misma dirección recibiría las coordenadas inventadas de la demo.
   - Además, igual habría que drenar la cola, que en QA no corre.
3. **Identificar las empresas demo por el slug** (`demo-qa-*`), sin migración.
   - Un superadmin puede crear a mano «demo-qa-a» desde «Empresas», y el comando la borraría: es
     justo lo que D1 prohíbe.
   - Pasar la marca por `altaEmpresa` cerraría el límite de D3.2, pero toca un servicio de producción
     por una sola llamada.
4. **Borrar como la empresa (`servi_app`) o por servicios.** No hay baja de empresa, y los `REVOKE`
   de SL-40 y SL-45 impiden a propósito borrar cargos, órdenes y caja. Quitarlos para la demo
   debilitaría el blindaje de todas las empresas.
5. **`ON DELETE CASCADE` desde `organizacion` en las 74 tablas de negocio**, para borrar con una sola
   sentencia. Es una migración enorme para un comando de QA, y abre un borrado en cascada de una
   empresa entera que hoy no existe.
6. **Un volcado SQL o JSON fijo** que se carga en QA. No pasa por los servicios (D5), se rompe con
   cada migración y no ejercita los triggers ni la RLS.
7. **Llamar a la app desplegada de QA por HTTP** (login, Server Actions, rutas). Necesita sesión y OTP
   por usuario, las Server Actions no tienen un contrato HTTP estable, y es mucho más lento. El
   handler de la API key sí se llama, pero en proceso.
8. **Importar `e2e/_escenarios/*` tal cual.** Pisan `SUPABASE_URL` al cargarse (los archivos irían al
   doble, no a QA), solo admiten bases locales y ubican por el cron HTTP.
9. **Guardia solo por `VERCEL_ENV` o por una lista de hosts prohibidos.** En la máquina de quien corre
   el comando `VERCEL_ENV` casi nunca está, y el ref de producción no está en el repo (y no debe).
   Por eso la marca vive en la base (D2.2).
10. **Un cron de QA** que drene la cola. Lo descartó Carlos el 2026-10-25.

## Dependencias

Ninguna nueva. `jspdf` (por si un comprobante exige PDF), `bcryptjs` (vía `hashPassword`), `tsx` y
`@supabase/supabase-js` ya están en `package.json`.

## Riesgos

- **Duración en QA.** Unas cien órdenes con sus cierres, contra el pooler remoto, pueden tardar
  minutos. Se mide en T12. Si molesta, P4 (B más pequeña).
- **SL-19 sin mergear.** Si su API final cambia (nombres de `RUTAS_GUARDADAS`, `purgarAnterioresA`),
  T0 lo ajusta aquí antes de empezar.
- **Estados inalcanzables por servicio.** Ver D5.2: se para y se pregunta.
