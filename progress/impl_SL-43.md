# SL-43 «datos-demo-qa» — bitácora de implementación

## T0 — Punto de partida (2026-10-25)

- `git merge origin/dev` → `c80c508` (trae SL-19 `9ba60c2` y los PR #14 y #15). `pnpm install` limpio.
- Última migración de `dev`: `20261025150000_jobs_por_empresa`. Timestamps de SL-43:
  `20261025160000_organizacion_es_demo` y `20261025160100_entorno_marca` (T2b cayó en la opción 3).
- Base local `servi_logistic_sl43`, creada y migrada. Gate tras el merge: `INIT_EXIT=0`.
- Variables de Preview y duración del build: ver `progress/features/SL-43.md > Cierre` (leader).
- Firmas de SL-19, `JobRepository` y guardias: ver `## T1 > 5`.

## T2b — La marca de QA en Supabase (2026-10-25)

Sobre el Supabase de QA (`.env.qa`, por `DIRECT_URL`), tras comprobar con booleanos que las tres URLs
de `.env.qa` son de un proyecto distinto del de `.env.prod` y del mismo proyecto entre sí. Las dos
conexiones (`DIRECT_URL` y `DATABASE_URL`) entran con el rol `postgres` en la base `postgres`.

| Sentencia | Resultado |
|---|---|
| `ALTER DATABASE postgres SET servi.entorno = 'qa'` | **rechazada**: `42501 permission denied to set parameter "servi.entorno"` |
| `ALTER ROLE postgres SET servi.entorno = 'qa'` | **rechazada**: `42501`, mismo mensaje |

Lectura posterior por conexión nueva: `DIRECT_URL` → `""` y `DATABASE_URL` → `null`. Ninguna vale
`qa`. El `""` de `DIRECT_URL` sale de que el pooler en modo sesión reutiliza el backend en el que
se intentó la sentencia. **No es una marca.**

**Se aplica la opción 3 de `design.md > D2.2`:** migración `20261025160100_entorno_marca`, una tabla
de plataforma vacía en todos los entornos, y `comprobarMarcaDeQa` lee
`SELECT valor FROM entorno_marca WHERE clave = 'entorno'`.

- **Pendiente humano (Carlos):** la tabla solo existe en QA cuando el build de QA aplica la migración,
  así que hoy no se puede insertar la fila `('entorno', 'qa')`.
- **Orden recomendado:** primero un despliegue de QA con la migración y sin `DEMO_ON_PREVIEW`; luego
  `INSERT INTO entorno_marca VALUES ('entorno','qa')` en QA; al final se crea `DEMO_ON_PREVIEW`.
- Si `DEMO_ON_PREVIEW` ya existe en el primer despliegue, ese build sale rojo por R3 (sin marca)
  después de migrar. Basta insertar la fila y redesplegar.
- Producción no se leyó (orden del leader: nunca apuntar a producción). Sin la migración aplicada, no
  tiene la tabla; con ella, la tiene vacía. En los dos casos, `comprobarMarcaDeQa` rechaza.

## Tanda A + T7 — mutaciones (2026-10-25)

Cada mutación se aplicó sola, dio rojo y se revirtió.

| # | Mutación | Test que cae |
|---|---|---|
| 1 | quitar el `if` de `production` | `demo-qa-guardia` «VERCEL_ENV=production…» (2), «R5 — ningún motivo…», «la capa 1 va primero» |
| 2 | marca con `includes` en vez de `!==` | `demo-qa-guardia > comprobarMarcaDeQa` «'qa ' con espacio», «'qaa'», «'prod-qa'» (3 failed / 34 passed, repetida sola por el implementer) |
| 3 | aceptar base local + Storage remoto | «base local y Storage remoto», «base remota y Storage local» |
| 4 (unit) | no cerrar `optimizacion_ruta` | `demo-qa-jobs` «cierra todos los abiertos con fail(id, motivo, null)…» |
| 5 | no comparar `DATABASE_URL` con `DIRECT_URL` | «DIRECT_URL y DATABASE_URL de refs distintos» |
| 10 | `decidirDemo` sin mirar `MIGRATE_ON_PREVIEW` | los cuatro «preview sin migraciones (…) → omitida (R30)» |

Migraciones en sl43: las dos se aplican, se revierten en orden inverso (`160100` con
`db:rollback`; `160000` con su `down.sql`) y se vuelven a aplicar. Resultado: `rls=true`, 0
políticas y ningún permiso de `servi_app` sobre `entorno_marca`. `servi_app` tampoco tiene
`UPDATE` sobre `es_demo`. `prisma migrate diff` contra sl43 sale vacío.

Tests: `demo-qa-guardia` 37, `demo-qa-build` 16, `demo-qa-jobs` 11, más los censos
(`schema-drift-saneamiento`, `organizacion-en-modelos`, `rls-por-empresa`, `aislamiento-*`,
`empresas-plataforma-cobro`, `migracion-sl17/sl40-ida-y-vuelta`): 14 archivos, 182 tests en verde y
ninguno saltado, contra sl43.

## Tanda B (T4, T5) y T6 — 2026-10-25

**T4/T5.** `tests/fabricas/empresa-y-usuarios.ts` (`crearEmpresa`, `crearUsuario`),
`tests/fabricas/escenarios/reparto.ts` (`escenarioReparto(deps)` con `lector`, `evidencia`,
`prepararAsignacion` y `altas`) y `cierres.ts` (`escenarioCierres({ lector })`). Los núcleos no leen
`process.env` ni importan Playwright. `tests/fabricas/e2e.ts` y `e2e/_escenarios/*` delegan en ellos,
y ningún `*.spec.ts` cambió.
- Contra la base `servi_logistic_sl43_e2e`, con `next build` y una sola app en el puerto 3044:

| Corrida | Resultado | Duración |
|---|---|---|
| reparto 1 | 15 passed, 0 failed, 0 flaky | 47.2s |
| reparto 2 | 15 passed, 0 failed, 0 flaky | 44.1s |
| dinero 1 | 28 passed, 0 failed, 0 flaky | 1.1m |
| dinero 2 | 28 passed, 0 failed, 0 flaky | 1.5m |

- Además: `e2e-sin-saltos` 30/30 y `vitest related` de las fábricas 11/11.
- `contrasena_definida_at` solo se escribe con `marcarContrasenaDefinida: true` (D5.3). El E2E no lo
  pasa y la demo sí debe pasarlo.

**T6.** `scripts/demo-qa/borrar.ts` y `tests/integration/db/demo-qa-borrado.test.ts`: 3 passed, 0
failed, 0 skipped, contra sl43 y con el doble de Storage.
- Casos: R7+R9 (siete familias de filas y los objetos); R8 (FK sintética hacia `orden`, y R28 al
  reintentar); R10.
- Cada caso tiene un control de no vacuidad: siete familias con más de 0 filas.

| # | Mutación | Test que cae |
|---|---|---|
| 9 | `orden` fuera de la pasada | R8: «expected ['zona'] to include 'orden'» (y también R7/R9) |
| 1 | sin el filtro `es_demo` | R7/R9: `r.empresas` trae la real (repetida sin la comprobación extra `EmpresaNoDemo`, que también la frena) |
| 2 | la base antes que Storage | R7/R9: los objetos de la demo siguen en el doble |

Desviaciones de T6:
- `"Session"."userId"` no tiene FK. Va en una lista fija, `COLUMNAS_DE_USUARIO_SIN_FK`.
- Doble comprobación de `es_demo`: antes de borrar, y en el `DELETE` de `organizacion`.
- Solo una violación de FK manda la tabla a la siguiente pasada. Cualquier otro error aborta con
  `BorradoDemoFallido`.
- **Para el reviewer (D12):** el borrado genérico borra `wallet_movimiento` como dueño, y la guardia
  de SL-45 no lo detecta.

## T8 — La receta (2026-10-25)

`scripts/demo-qa/receta.ts` (`crearEmpresaDemo`, `comprobarEmpresaDemo`, `ResumenEmpresaDemo`).
`tests/fabricas/escenarios/reparto.ts` recibe un parámetro aditivo (`distritosExtra`) para la zona
especial.
- E2E repetido tras el cambio: reparto 15 passed (41.5s) y dinero 28 passed (54.0s).

**Corridas locales** (sl43, marca `entorno_marca`, doble de Storage). Fueron dos seguidas, la segunda
borró la primera, y las dos salieron con exit 0:
- **Volumen:** por empresa, 43 órdenes y 13 usuarios.
  - 12 usuarios `demo-qa-<x>-<perfil>@example.test`.
  - El usuario de la API key lo crea `ApiKeyService` (`apikey+…@apikey.invalid`).
- **Estados:** `entregado` 3, `en_reparto` 4 y los otros 18 estados, 2 cada uno. No falta ninguno.
- **Jobs:** 43 `geocodificacion` cerrados con `complete` y 27 `optimizacion_ruta` cerrados sin
  ejecutar. Ningún `push_web` (en local no hay VAPID) y ningún tipo no esperado.
- **Comprobaciones:** 0 órdenes no asignables por el gate, 0 filas en las 4 tablas de integraciones y
  0 llamadas a los emisores de correo (espía).
- **Tiempos:**

| Corrida | Borrado | A | B | Total |
|---|---|---|---|---|
| 1 | 0,66 s | 6,4 s | 5,3 s | 11,7 s |
| 2 | 0,57 s | 6,4 s | 5,1 s | 11,5 s |
| recorte de B (prueba) | — | — | 3,3 s | — |

**Decisiones y desviaciones de T8:**
- **B1 `novedad_interna`: confirmado por Carlos el 2026-10-25 (D27).**
  - Se llama a `CorteDiarioService.ejecutarCorte(ahora + 24 h)` montado como en su route y dentro de
    `conEmpresa(<demo>)`, nunca a la ruta del cron.
  - Va detrás de `NOVEDAD_INTERNA_CON_CORTE_DE_MANANA = true`.
  - La receta comprueba que el corte creó exactamente 1 vencido y que solo cambiaron sus órdenes.
- **R14:** no existe una pantalla de alta individual (`OrdenService.crear` se borró el 2026-08-07).
  - La pantalla es la subida de archivo (`procesarEnChunks` → `handleCargaMasivaChunk`).
  - La carga masiva es `cargarMasiva`. En los datos **no se distinguen**: las dos tienen origen
    `carga_masiva`.
- **R12:** el usuario `api` no termina en `@example.test` porque `ApiKeyService.generar` crea el suyo.
  Su secreto solo vive en memoria: 0 coincidencias en los logs.
- **R17, cierre de bodega:** `CierresBodegaAdminService.aprobarCierreBodega` choca con el CHECK
  `cierre_bodega_conciliacion_coherente`. **No es un bug** (corregido en la review vuelta 1, m4): la
  ficha 431 retiró a propósito la aprobación de nivel 2.
  - La evidencia está en `lib/actions/cierre-bodega.ts:389` (`@sin-superficie`), en la migración
    `20260919120100_cierre_bodega_conciliacion` y en `cierre-bodega-conciliacion.int.test.ts`, caso (d).
  - La receta usa `ConciliacionSatelitesService.marcarRecibida`, el camino actual, que deja el cierre
    en `aprobado` («Recibido»).
- **Montos:** solo cobran la entrega mixta (8.000), la satélite, los incidentes y las órdenes por API.
  El abono necesita deuda de la tienda, y el pago al mensajero es `min(P, E)`: por eso quedó en 500.
- El pago mixto usa transferencia en vez del método local, para no meter un literal de país.
- Mensajeros añadidos a D7: recolector, corte, cierre-rechazado, cierre-pendiente y reposo.
- **Excepción de cobro:** 100 por orden, antes de crear órdenes, con un actor superadmin sintético
  (`usuarioId` «demo-qa»; el servicio no lo escribe).
- **Pago a la plataforma:** `registrarEgreso` de tipo `pago_plataforma` por 1.000.
- Escrituras directas: solo las de D5.3 (contraseña del maestro y `contrasena_definida_at`,
  `es_demo` con 1 fila exacta, coordenadas y cierre de jobs).

## T9 — Entrypoint, candado, tope, salida y build (2026-10-25)

Archivos:
- nuevos: `scripts/demo-qa.ts` (`ejecutarDemo(parciales: Partial<EfectosDemo>)` →
  `{ codigo, topeVencido }`, `TOPE_MS` = 15 min), `scripts/demo-qa/candado.ts`,
  `scripts/demo-qa/salida.ts` y `tests/unit/scripts/demo-qa-candado.test.ts`;
- modificados: `package.json` (`build` y `demo:qa`), `.env.example`, `demo-qa-build.test.ts` y
  `demo-qa-guardia.test.ts`.

Tests: `pnpm exec vitest run tests/unit/scripts/` da 11 archivos y 154 passed (`demo-qa-build` 33,
`demo-qa-guardia` 45, `demo-qa-candado` 6).

| Mutación | Test que cae |
|---|---|
| 11: fallo de la receta convertido en aviso con salida 0 | 5 tests de R31 («fallo de la receta → salir(1)…», y los de R5, R3, R23 y R15 por el entrypoint) |
| conectar antes de decidir | los 5 «OMITIDA… sin conectar» (R30) y 8 de la guardia (R2/R4/R25) |
| sin el tope | los 2 tests de R33 |

**Build local (R30):**
- Con `VERCEL_ENV` sin definir sale `[migrate] migraciones OMITIDAS — build local…`, después
  `[demo-qa] OMITIDA — build local (sin VERCEL_ENV): usa pnpm demo:qa`, y `next build` compila con
  `BUILD_EXIT=0`.
- Con `DIRECT_URL`/`DATABASE_URL` en `127.0.0.1:1` (puerto cerrado), la cadena migrate → demo omite
  los dos pasos con `CADENA_EXIT=0` en 3,7 s, así que no conecta.

**Corrida simulada `--build`** con `VERCEL_ENV=preview`, `MIGRATE_ON_PREVIEW=true` y
`DEMO_ON_PREVIEW=true`, contra sl43, el doble de Storage y una contraseña generada en el momento:
- **Sin la fila de `entorno_marca`:** sale 1, con «la base no es la de QA…» y la línea de desbloqueo.
- **1.ª corrida con la marca:** exit 0. La demo tarda 13,5 s (A 7,0 s, B 5,5 s) y el proceso
  entero, 15,0 s.
- **2.ª corrida con la marca:** exit 0 en 14,0 s. Borró 2 empresas, 1.252 filas y 48 archivos.
- **Salida:**
  - la tabla `empresa · perfil · correo`, con 13 perfiles por empresa;
  - los 20 estados en cada empresa;
  - los jobs: 86 `geocodificacion` cerrados como hechos y 54 `optimizacion_ruta` sin ejecutar;
  - la línea del corte de mañana.
- **Sin secretos:** en la salida no aparecen la contraseña, `postgresql://`, la clave ni ningún hash.
- **Al terminar:** 0 empresas demo y 0 filas en `entorno_marca`.

**Desviación:** `EXCEPCIONES_DE_PLATAFORMA` no hizo falta.
- Ningún archivo de `scripts/` llama a `comoPlataforma`: el alta pasa por `tests/fabricas/`, que la
  guardia `plataforma-solo-en-lista` no recorre (7/7 en verde).
- El design y la task la pedían. **Para el reviewer.**

## T11 — Documentación (2026-10-25)

- README: sección «Datos de demostración en QA (SL-43)», con cuándo corre, las variables, las tres
  capas, la marca con su `INSERT`, el orden del primer despliegue, qué se pierde, cómo entrar y cómo
  desbloquear `dev`.
- `docs/verification.md`:
  - en «El OTP», la excepción de Carlos del 2026-10-25;
  - en «Base de datos de test», la marca del test de la demo y su limpieza en `afterAll`.

## T10 — Test de integración de dos corridas (2026-10-25)

`tests/integration/db/demo-qa.test.ts` corre contra Postgres real (sl43) y el doble de Storage: 11/11
passed, sin skips, en tres corridas seguidas. El archivo tarda unos 80 s.
- Las 20 cifras de estado van como literal: `entregado` 3, `en_reparto` 4, el resto 2.
- El caso R26 entra con `AuthService.login` real y lleva su control con una contraseña mala.

| Corrida | s | Código |
|---|---|---|
| corrida 1 | 14,5 | 0 |
| corrida 2 | 11,4 | 0 |
| sin marca | 0,1 | 1 |
| slug en una real | 0,2 | 1 |
| tipo no esperado | 6,2 | 1 |
| cortada en B | 7,7 | 1 |
| tras el corte | 11,5 | 0 |
| simultánea 1 | 11,2 | 0 |
| simultánea 2 (esperó el candado) | 26,6 | 0 |

| # (D9.3) | Mutación | Caso que cae | Error |
|---|---|---|---|
| 1 | sin filtro `es_demo` | segunda ejecución | la huella de la real cambia |
| 2 | la base antes que Storage | segunda ejecución | `expected [ …(50) ] to deeply equal []` |
| 3 | sin `guardarResultado` | primera ejecución y casi todos | sale 1: la receta cae al asignar |
| 4 | no cerrar `optimizacion_ruta` | primera ejecución | «jobs pendientes: optimizacion_ruta 27» |
| 5 | `optimizacion_ruta` fuera de los esperados | primera ejecución | «encoló jobs de un tipo no esperado: optimizacion_ruta» |
| 6 | corte con `paraCadaEmpresa` | primera ejecución | «la empresa real cambió»: `cierre_dia` 0→1, historial 8→9 |
| 7 (D2.3-4) | marca leída después del borrado | R3 | las organizaciones pasan de 3 a 1 |
| 8 | `GRANT UPDATE (es_demo)` a `servi_app` | R6 | `expected null to be '42501'` |
| 12 | candado que no bloquea | R32 | una de las dos sale 1 |

Cambios fuera del test, **para el reviewer**:
- **Fallo real de R9 arreglado.**
  - El PDF de etiquetas de la carga por API solo deja su URL firmada en `carga.download_url`, que no
    está en `RUTAS_GUARDADAS`.
  - Quedaba un PDF huérfano por empresa en cada corrida.
  - `borrar.ts > rutaDeUrlFirmada` lee `carga.download_url` y `orden.download_url`, y solo acepta rutas
    `<demo>/` del bucket de etiquetas. Lo prueba `tests/unit/scripts/demo-qa-url-firmada.test.ts`
    (3/3). Es un cambio a D4.1.
- **Turno entre archivos de test** (`tests/integration/db/_exclusion-demo-qa.ts`, un advisory lock):
  - Mientras la demo tiene datos en la base, caen 14 tests de 8 archivos ajenos (medido):
    `caja-backfill` y 7 `notificacion-evento-*-migration`.
  - Los dos archivos de la demo toman el turno en exclusivo, y esos 8 en compartido: cada uno añade
    `beforeAll`/`afterAll`, nada más.
  - Los 13 archivos juntos: 245/245.

Desviaciones:
- R23 inyecta el job con un `vi.mock` que envuelve `cerrarJobsSinEjecutar`.
- R11 admite `ajuste_estado` (lo escriben los servicios reales de devolución) y prohíbe
  `creacion_manual` y `recuperacion_manual`.
- R14 distingue la pantalla de la carga masiva por la tienda.
- **Riesgo de CI:** `jobs` sin empresa, `geocode_cache` y `cobro_plataforma_tarifa` se comparan por
  igualdad estricta. Un test concurrente que commitee en esas tablas lo haría fallar.

## Review vuelta 1 → correcciones (2026-10-25)

- **B1 (rojo intermitente en CI):** se aplicó la opción 2 de la review, acotar las fotos, en vez de
  tomar `tomarLockDeEscrituraReal`.
  - **Por qué no el lock:** el implementer midió que sostenerlo 80 s hacía caer 9 de 10 casos de 6
    archivos pequeños que lo usan, por sus timeouts de 20 s.
  - **Fotos acotadas:**
    - `jobs` sin empresa: un centinela propio más los jobs cuyo `payload` nombra ids de la demo.
    - `geocode_cache`: la tabla entera más un centinela.
    - `cobro_plataforma_tarifa`: se lee bajo el lock de SL-40 (`tomarTarifaGlobal`), con un valor de
      control que se restaura.
  - R3 y R10 ya no comparan `organizacion` entera: miran las demo, los slugs `demo-qa%` y la real.
  - **Mutaciones:** cada una de las 4 cae en «la segunda ejecución» (borrar jobs `done` sin empresa,
    borrar `geocode_cache`, insertar un job sin empresa con un id demo, cambiar la tarifa global).
  - **Robustez:** un escritor concurrente de jobs sin empresa (98 jobs) no tumba la corrida 1, la 2
    ni R3: 3/3 en verde.
- **m1:** se mantiene `_exclusion-demo-qa.ts`, con otra clave que el lock de escritura real (por la
  medición de B1). Su cabecera documenta el motivo y que la lista de 8 archivos se mantiene a mano.
- **m2:** `e2e/dos-empresas-humo.spec.ts --no-deps` contra `servi_logistic_sl43_e2e`:
  **6 passed (56.8s)**, `E2E_EXIT=0`.
- **m3:** T2b y T12 quedan como «puerta humana tras el merge», con sus pasos en
  `progress/features/SL-43.md > Cierre`.
- **m4:** la nota de «posible bug» de `aprobarCierreBodega` está corregida: es el diseño de la ficha
  431.
- **m5:** las guardias de SL-45 y SL-40 detectan ahora un `DELETE`/`UPDATE`/`TRUNCATE` con la tabla
  dinámica (`tests/unit/guards/_mutaciones-sql-dinamicas.ts`). La de SL-40 mira también `scripts/`.
  - La única excepción es `scripts/demo-qa/borrar.ts` (SL-43, D12), y solo mientras conserve sus 4
    filtros `es_demo`.
  - **Mutaciones:** un `DELETE` dinámico en `WalletMovimientoRepository` hace caer las dos guardias;
    quitar `AND "es_demo"` de `borrar.ts` hace caer la excepción.
- **m6:** `plataforma-solo-en-lista` recorre ahora `tests/fabricas/`, y
  `tests/fabricas/empresa-y-usuarios.ts` entra en `EXCEPCIONES_DE_PLATAFORMA`. Quitar esa entrada la
  pone roja.
- **m7:** `demo-qa.test.ts` usa `describe.sequential` y la cabecera declara el orden. Cada caso que
  depende de la corrida 1 llama a `exigirCorrida1()` y, suelto, falla con «córrelo entero».
- **m8:** R12 está enmendado en `requirements.md`, como D28 (decisión del leader).
- **B1 de la implementación:** confirmado por Carlos (D27).
- **Corrida conjunta de 13 archivos** (los dos de la demo, `caja-backfill` y los 10
  `notificacion-evento-*`):
  - 245/245 en 92 s, con un superadmin temporal;
  - sin ningún usuario en la base caen 5, como en HEAD (`SELECT id FROM usuario LIMIT 1`).
- `demo-qa.test.ts`, solo: 11/11 en 90 s.

## Rojo de CI en el PR #18 (run 40271163801, HEAD `0b38312`) — 2026-10-26

**Causa raíz.** El detector de FK `esViolacionDeClaveForanea` solo leía `cause.code`, y en Postgres 17
`@prisma/adapter-pg` deja el SQLSTATE en otro campo, así que `borrar.ts` no reconocía la FK.
- **Postgres 17 (CI):** `orden_carga_id_fkey` (`ON DELETE RESTRICT`) da SQLSTATE `23503`, y el adaptador lo
  traduce a `{ kind: "ForeignKeyConstraintViolation", originalCode: "23503" }`, sin `code`.
- **Postgres 18 (local):** la misma FK da `23001`, con `code`. Por eso en local no se veía.
- **Efecto:** cuando una pasada intentaba `carga` antes que `orden`, `borrar.ts` tomaba la FK por otro
  error y abortaba con `BorradoDemoFallido` (P2010). Quedaban 3 empresas demo vivas, y esas empresas
  tumbaban `demo-qa-borrado` y `notificacion-evento-gasto-fijo-migration`.

**Reproducción.**
- Entorno: contenedor `postgres:17`, el mismo motor que el job de CI, migrado y con `db:seed`.
- Comando: `pnpm exec vitest run --maxWorkers=3 tests/integration/db/demo-qa.test.ts tests/integration/db/demo-qa-borrado.test.ts tests/integration/db/notificacion-evento-gasto-fijo-migration.test.ts`.
- **Antes:** el mismo mensaje que en CI (`tabla carga … P2010`) y 3 empresas demo vivas. En la
  segunda corrida caen los tres archivos, igual que el shard 2.
- **Después:** 35/35 y la base limpia.
- **Shard 2, sus 186 archivos de `tests/integration/db/` en Postgres 17:** solo quedan en rojo 82
  archivos, todos del baseline.

**Arreglo.**
- **Detector (`lib/repositories/_shared/prisma-fk.ts`):** `esViolacionDeClaveForanea` lee `code` y,
  si falta, `originalCode`. Lo prueba `tests/unit/repositories/prisma-fk.test.ts`, con las formas
  medidas en 17.11 y 18.2.
  - **Para el reviewer y el leader:** el helper es compartido. `ZonaRepository`, `TarifaRepository`,
    `DistritoZonaEspecialRepository` y `ApiKeyRepository` reconocen ahora también una FK RESTRICT en
    Postgres 17.
- **`borrar.ts`:** `BorradoDemoFallido` incluye el SQLSTATE, nunca el mensaje ni el `detail`. Las
  4 condiciones `es_demo` que exige la guardia de SL-40/SL-45 siguen intactas.
- **Limpieza robusta (`tests/integration/db/_limpieza-demo-qa.ts`):** una limpieza de emergencia que
  no usa el código que se prueba.
  - Borra las empresas `es_demo` en una transacción con `session_replication_role = replica`, para lo
    que necesita superusuario (lo es en CI y en local).
  - Los dos archivos de la demo la usan en `beforeAll` para quitar restos ajenos, y en `afterAll`
    cuando el borrado real falla.
  - Aun así, el archivo sale rojo si el borrado falló o si queda una empresa demo viva.
- **R8** se prueba ahora con `RESTRICT` y con `NO ACTION`.

**Mutaciones.**
- **A, sin `originalCode`:**
  - en Postgres 17 vuelve el rojo de CI (6 fallos, con el mensaje de `carga`);
  - en Postgres 18 caen R8 con `NO ACTION` y 2 casos unitarios.
- **B, limpieza de emergencia vacía (junto con A):** el `afterAll` falla con «quedan 3 empresas demo
  vivas».

**Choque latente con `arranque-superadmin`, visto en el gate local.**
- **Síntoma:** corridos juntos, `arranque-superadmin.test.ts` caía 2/10 («expected 3 to be 5»). Solo
  pasa 10/10.
- **Causa:** los archivos de la demo commitean altas y bajas de usuarios sin el lock de escritura
  real, y R14 de `arranque-superadmin` leía `count(*)` de `usuario` entre dos tramos sueltos del lock.
- **Por qué no se vio en CI:** hoy caen en shards distintos (3 y 2), pero el reparto cambia al añadir
  archivos.
- **Arreglo:** la demo toma `bajoLockDeEscrituraReal` solo en cada ventana que escribe usuarios o
  empresas, no todo el archivo:
  - cada `borrar` y `crearEmpresa` de `correr`;
  - la preparación y la limpieza;
  - en `demo-qa-borrado`: siembra, limpieza, borrados y la FK sintética de R8;
  - en `_limpieza-demo-qa`, `serializarEscriturasReales(tx)`.
  - La ventana más larga mide 6,9 s, frente a los 80 s descartados en la vuelta 1.
- **Otros cambios:**
  - R14 de `arranque-superadmin` pone sus dos ejecuciones y sus lecturas en un solo tramo del lock,
    sin cambiar las aserciones.
  - `scripts/demo-qa.ts` exporta `cargarPasosReales`, sin cambio de comportamiento.
- **Orden de locks:** turno de la demo → tarifa global → candado de la demo → escritura real. Nadie
  pide uno anterior teniendo el de escritura.
- **Corridas:**
  - los 5 archivos juntos: 41/41 tres veces seguidas;
  - los 203 archivos que usan el lock, con la demo: 0 timeouts (los rojos son todos del baseline);
  - los 13 archivos de la vuelta 1: 246/246.
- **Mutación:** quitar la protección del lado de la demo da rojo en 2 de 3 corridas. Es probabilístico,
  como el original.
- **Riesgo fuera de alcance:** R7 de `empresas-plataforma-cobro.test.ts` cuenta las empresas con
  tarifa propia sin tomar el lock. Su ventana es de milisegundos y no se ha visto caer.

**Aviso:** `tarifa-zona-borrado-fk-real.test.ts:371` espera `23001`, y en 17 daría `23503`. Ya está en
el baseline por otro motivo y no se toca.

## Tiempo de la demo en el build de QA (2026-10-26, tras el merge del PR #18)

**El problema:** en Vercel, A tardó ~457 s y B no terminó, así que se venció el tope de 15 min. El
build corre en Cleveland y Supabase de QA está en us-west-2, a ~70–90 ms por ida y vuelta, y la demo
hace miles de consultas en serie. El log trae además un `DeprecationWarning` de `pg` por consultas
solapadas en un mismo cliente. Carlos dejó `DEMO_ON_PREVIEW=false` para desbloquear `dev`.

**Idas y vueltas a la base**, contadas a nivel de `pg` en el dueño y en la app, incluidos `BEGIN`,
`set_config` y `COMMIT`:

| Fase | Antes (`e50ae78`) | Ronda 1 | Ronda 2 |
|---|---|---|---|
| inicio + preparación | 48 | 4 | 4 |
| borrado (2 empresas) | 304 (+8 Storage) | 124 (1 pasada) | 124 |
| A | 8.991 (+45 Storage) | 5.402 | 6.248 |
| B | 8.990 (+45 Storage) | 5.416 | 6.250 |
| comprobación final | 23 | 23 | 23 |
| suma × 90 ms (en serie) | **1.661 s** | 996 s | ~1.140 s, pero A y B van en paralelo, repartidas en 12 conexiones |

- El envoltorio de empresa (`BEGIN` + `set_config` + `COMMIT`) se lleva unas 5.000 de las ~9.000 idas
  y vueltas de cada empresa.
- La ronda 2 sube el número de consultas al repartir las gestiones entre más mensajeros, pero baja el
  tiempo porque acorta la ruta crítica.

**Tiempos medidos**, con un proxy local de latencia; el último con el pool limitado a 8, como el pooler:

| Medición | Total | A | B |
|---|---|---|---|
| antes, 90 ms | ~854 s A, B abortada por el tope a los 905 s | | |
| ronda 1, 90 ms | 214,2 s | 199,2 s | 199,1 s |
| ronda 1, 160 ms | P2028 a los 55 s | | |
| ronda 2, 90 ms | **167,6 s** | 153,0 s | 152,2 s |
| ronda 2, 160 ms | 305,1 s | 280,3 s | 280,4 s |
| ronda 2, 160 ms, 8 conexiones | 348,4 s | | |

**Medición real contra QA desde el PC del implementer**, con el OK de Carlos:
- Cómo se corrió: `--build` simulado y una contraseña de usar y tirar que no se imprime.
- Ida y vuelta medida: p50 163 ms por `DIRECT_URL` y 150 ms por `DATABASE_URL`, casi el doble que el
  build.

| Corrida | Resultado |
|---|---|
| 1, ronda 1 | **falló a los 72 s con P2028** (timeout de la transacción de `cargarMasiva`: 46 consultas, ~8,8 s a 160 ms, frente a los 5 s por defecto) |
| 2, ronda 2 | **`EXIT=0` en 278,3 s** (A 252,7 s, B 246,7 s; borrado de las 2 anteriores en 1 pasada). Los 20 estados en las dos empresas, 0 avisos de `pg`, y en la salida ni la contraseña ni ninguna URL |

- **Lo que queda en QA:** las dos empresas demo, con la contraseña de usar y tirar. El próximo build
  con la variable real las recrea.
- **Estimación para el build:** a 90 ms se midieron 167,6 s con el proxy, así que la demo debería
  quedar por debajo de 3 min. Solo el primer build con `DEMO_ON_PREVIEW=true` lo confirma.

**Cambios:**
- **`scripts/demo-qa.ts`:**
  - A y B en paralelo (`enParalelo`: si una falla, espera a la otra, suelta el candado y cierra);
  - un lector del dueño de 4 conexiones;
  - `DB_POOL_MAX=12` para la app, solo en este proceso;
  - `conectarDemo` fija las opciones de transacción de la demo (`maxWait` 30 s, `timeout` 60 s).
- **`scripts/demo-qa/receta.ts`:**
  - una carga masiva y servicios por lotes de 4;
  - altas, ubicación y tramos en paralelo;
  - gestiones repartidas en 5 mensajeros, 3 perfiles más por empresa (`mensajero-novedades`,
    `mensajero-rechazos`, `mensajero-satelite-2`);
  - las cifras por estado del contrato no cambian.
- **`scripts/demo-qa/borrar.ts`:** una pasada en orden de FK dentro de un `SAVEPOINT`. Si choca, vuelve
  a las pasadas de antes, así que R8 no cambia.
- **`scripts/demo-qa/paso.ts`:** los errores nombran el paso de la receta y, en un P2028, qué tiempo
  venció. No incluyen el mensaje de la base.
- **`lib/db/consultas-en-serie.ts`** (nuevo) y **`lib/db/prisma-client.ts`**:
  - **Para el reviewer: afectan a toda la app.**
  - Las consultas que Prisma 7.8 lanza a la vez dentro de una transacción (un `include` con varios
    hijos) se encolan en orden. Eso quita el `DeprecationWarning`: 626 solapes antes, 0 después.
  - `opcionesDeTransaccion()` lee `DB_TX_MAX_WAIT_MS` y `DB_TX_TIMEOUT_MS`. Sin ellas, la app sigue
    con 2 s y 5 s.
- **`RECORTE_DE_B`:** no se enciende. A 90 ms solo baja de 167,6 a 161,2 s, porque la ruta crítica es
  la de A.
- **Riesgo:** con 12 conexiones de la app más 4 del dueño, durante unos 3 min la demo deja poco margen
  en el pooler de QA si tiene unos 15 slots (no se conoce el tamaño).

**Tests:**
- Los 5 archivos de integración juntos, dos veces: 42/42.
- `tests/unit/scripts/` y `tests/unit/db/`: 369/369.
- E2E: reparto 15/15 y dinero 28/28.
- Mutaciones M1–M9 en rojo: A‖B en serie, sin serializar, orden de FK, sin vuelta a las pasadas, y las
  opciones de transacción del cliente, del dueño y del lector, la ruta del paso y la clasificación del
  P2028.

## Mapa `R<n> → test`

| R | Test | Estado |
|---|---|---|
| R1 | `tests/integration/db/demo-qa.test.ts` «la primera ejecución deja dos empresas demo completas» | verde |
| R2 | `tests/unit/scripts/demo-qa-guardia.test.ts` (production → rechaza, sin conectar); `demo-qa-build.test.ts` (omitida en `--build`) | verde |
| R3 | `demo-qa.test.ts` «sin la marca de QA no escribe nada»; `demo-qa-guardia.test.ts > comprobarMarcaDeQa`; `demo-qa-build.test.ts` (sin marca → 1) | verde |
| R4 | `demo-qa-guardia.test.ts` (refs distintos, local+remoto, host sin ref; sin conectar) | verde |
| R5 | `demo-qa-guardia.test.ts` (ningún motivo ni salida con URL/clave/contraseña); `demo-qa.test.ts` «R5 — ninguna salida…» | verde |
| R6 | `demo-qa.test.ts` «`servi_app` no puede cambiar `es_demo`» y «el alta normal nace sin marca» | verde |
| R7 | `demo-qa.test.ts` «la segunda ejecución recrea y no toca la empresa real»; `demo-qa-borrado.test.ts` (R7+R9) | verde |
| R8 | `tests/integration/db/demo-qa-borrado.test.ts` (FK sintética) | verde |
| R9 | `demo-qa.test.ts` «la segunda ejecución…»; `demo-qa-borrado.test.ts`; `tests/unit/scripts/demo-qa-url-firmada.test.ts` | verde |
| R10 | `demo-qa.test.ts` «slug demo en una empresa real: aborta sin cambios»; `demo-qa-borrado.test.ts` | verde |
| R11 | `demo-qa.test.ts` «la primera ejecución…» (origen de historial y cargo SL-40 por orden) + revisión del diff contra D5.3 | verde |
| R12–R19 | `demo-qa.test.ts` «la primera ejecución…» | verde (R12 con la excepción del usuario `api`; R14 con pantalla = carga por chunks) |
| R20, R21, R22, R24 | `demo-qa.test.ts` «órdenes ubicadas y asignables, cola sin pendientes, sin integraciones ni correo»; `demo-qa-jobs.test.ts` | verde |
| R23 | `demo-qa.test.ts` «un job de un tipo no esperado: sale 1 y lo nombra»; `demo-qa-jobs.test.ts`; `demo-qa-build.test.ts` | verde |
| R25 | `demo-qa-guardia.test.ts` (contraseña ausente/débil, sin conectar) | verde |
| R26 | `demo-qa.test.ts` «la primera ejecución…» (`AuthService.login` real); `demo-qa-build.test.ts` (tabla de usuarios en la salida) | verde |
| R27 | `demo-qa.test.ts` «la segunda ejecución…» | verde |
| R28 | `demo-qa.test.ts` «una ejecución cortada a mitad de la receta»; reintento de `demo-qa-borrado.test.ts` | verde |
| R29 | `tests/unit/scripts/demo-qa-build.test.ts` (`decidirDemo` y orden de `build` en `package.json`) | verde |
| R30 | `demo-qa-build.test.ts` (omitida sin conectar, cada motivo) + build local medido (T9) | verde |
| R31 | `demo-qa-build.test.ts` (fallo → `salir(1)`) | verde |
| R32 | `demo-qa.test.ts` «dos ejecuciones a la vez»; `tests/unit/scripts/demo-qa-candado.test.ts` | verde |
| R33 | `demo-qa-build.test.ts` (tope vencido en la receta y esperando el candado) | verde |

Pendiente fuera de los tests: **T12** (puerta humana, primer despliegue de QA) y la fila de
`entorno_marca` en QA (T2b).

## T1 — Inventario de la receta

> Solo lectura. Leído con Grep/Read: el MCP del grafo no tiene proyecto para este worktree (lo dice
> ya `design.md > Lo que ya existe`). Rama con `dev` mergeado (SL-19 incluido, `c80c508`).
> Aviso: al escribir esto el árbol tiene cambios sin commitear de OTRA tanda (`db/schema.prisma`,
> `lib/db/modelos-de-negocio.ts`, `db/migrations/20261025160000_organizacion_es_demo/`,
> `db/migrations/20261025160100_entorno_marca/`, `chk-tmp.ts`). No son de T1 y no se tocaron.

### 0. El contexto de empresa y el actor

| Pieza | Dónde | Firma |
|---|---|---|
| `conEmpresa` | `lib/db/contexto-empresa.ts:36` | `conEmpresa<T>(organizacionId: string, fn: () => Promise<T>): Promise<T>`. Rechaza id vacío. Corre `fn` dentro de `AsyncLocalStorage` y la espera dentro (las `PrismaPromise` perezosas corren con la empresa). |
| `comoPlataforma` | `lib/db/contexto-empresa.ts:45` | `comoPlataforma<T>(ficha: \`SL-${number}\`, motivo: string, fn: () => Promise<T>): Promise<T>`. Exige ficha `SL-<n>` y motivo no vacío. |
| Tabla de la extensión | `lib/db/extension-empresa.ts:14-19` | Empresa fuera de tx: filtro + envoltura (`set_config('app.organizacion_id')` + `set role servi_app`). Plataforma: tal cual. **Sin contexto: modelo de negocio y SQL a mano lanzan `EmpresaNoResuelta`.** |
| `Actor` | `lib/interfaces/services/IOrdenService.ts:11` | `{ usuarioId, rol: RolValue, zonaId?: string \| null, organizacionId }`. Las actions lo sacan de `resolveActorFromSession` (`lib/auth/resolve-actor.ts:16`) y lo pasan al servicio tras validar con zod. |
| Storage | `lib/storage/carpeta-de-empresa.ts:29` | `empresaDelAlmacen` toma la empresa de `conEmpresa`; en `comoPlataforma` **lanza**; sin contexto intenta la sesión (en un script, lanza). Todo upload/remove de la demo va dentro de `conEmpresa(<demo>)`. |

Patrón común de las actions: `actor = resolveActorFromSession()` → `schema.parse(input)` → `build*()` → `service.metodo(data, actor)`. La demo sustituye las dos primeras por el actor construido y el mismo `schema.parse`.

### 1. Mapa D5.1, fila a fila

Notación: `P = getPrismaClient()`, `OR = new OrdenRepository(P)`, `HIST = new OrdenHistorialService(OR, new OrdenHistorialRepository(P), new OrdenDiaRepartoCambioRepository(P), new OrdenTraspasoRepository(P))`, `EVID = gestionConfig.EVIDENCIA_BUCKET`, `COMP = walletComprobanteConfig.BUCKET`.

| Qué | Composition root (action/route) | Servicio y constructor exacto | Método y actor |
|---|---|---|---|
| Empresa y maestro | `lib/actions/organizaciones.ts:67` (`construirServicio`), `altaEmpresaAction` :122 | `new OrganizacionService(new OrganizacionRepository(P))` | `altaEmpresa(input)` (`lib/services/OrganizacionService.ts:20`) dentro de `comoPlataforma("SL-…", motivo, …)`. Input `altaEmpresaInputSchema` (`lib/types/organizacion.ts:17`, `.strict()`): `{ nombre, slug, maestro: { nombre, email, telefono, documento, tipoDocumento } }`. Resultado `{ estado: "creada", organizacionId, maestroId }`. La action manda además la bienvenida (SL-41) **fuera** del servicio: la demo no la llama. |
| Usuarios (R12) | `lib/actions/usuarios.ts:55` (`buildUsuarioService`), `crearUsuario` :83 | `new UsuarioService(new UserRepository(P), new ZonaRepository(P), new VehiculoRepository(P), new SessionRepository(P), new CierreBodegaRepository(P))` | `crear(crearUsuarioSchema.parse(...), actorMaestro)` (`UsuarioService.ts:115`), `passwordMode: "manual"`, `password`. `zonaId` obligatoria para `mensajero`/`adminSatelite`; `vehiculoId` para `mensajero`; `fulfillment` solo `adminTienda`. Igual que `tests/fabricas/e2e.ts:221-287`. |
| Zonas central y satélite + tarifa del mensajero | `lib/actions/zonas.ts:65` (`buildZonaService`), `crearZona` :76 | `new ZonaService(new ZonaRepository(P))` | `crear(crearZonaSchema.parse({ nombre, cobroVehiculo, distritoIds, esCentral, tarifas: [{ cobroEntregado, cobroRechazado }], sinpeNumero, sinpeNombre }), maestro)` (`ZonaService.ts:111`). |
| SINPE de la bodega | `lib/actions/sinpe-bodega.ts:72`, `confirmarSinpeBodega` :143 | `new SinpeBodegaService(new ZonaRepository(P))` | `confirmar(zonaId, maestro)` (`SinpeBodegaService.ts:92`). Sin ella, la pantalla abre «Confirmá el SINPE» (ficha 429). |
| Tarifas de tienda | `lib/actions/tarifas.ts:40`, `crearTarifa` :51 | `new TarifaService(new TarifaRepository(P))` | `crear(crearTarifaSchema.parse({ tiendaId, valorFlete, valorFleteDevuelto, valorFleteGam, valorFleteDevueltoGam, comisionCod, ivaFlete, ivaComisionCod }), maestro)` (`TarifaService.ts:57`). Una por tienda (las dos `adminTienda`). |
| Zona especial (SL-38) | `lib/actions/geografia.ts:269` (`buildDistritoZonaEspecialService`), `actualizarDistritosEspeciales` :285 | `new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(P))` | `actualizar(distritosEspecialesSchema.parse({ marcar: [distritoId], desmarcar: [] }), maestro)` (`DistritoZonaEspecialService.ts:16`). Solo `maestro`. |
| **Orden por pantalla (R14)** | **No existe `OrdenService.crear`.** `lib/actions/ordenes.ts:41-48`: `crearOrden` se borró el 2026-08-07 («nacieron muertas»). La pantalla crea órdenes por la **carga masiva por chunks**: `app/(app)/ordenes/_components/carga-masiva-chunks.ts` → `app/api/ordenes/carga-masiva/chunk/route.ts` (`handleCargaMasivaChunk`, `buildBulkService` :37) | `new BulkOrdenService(OR, new TarifaVigenteRepository(P))` (sin notificador: el default es no-op) | `cargarMasiva(rows: RawRow[], actorTienda, { dryRun?, cargaId?, name?, totalFiles? })` (`BulkOrdenService.ts:159`). Solo `adminTienda`; `tiendaId = actor.usuarioId`. Es la misma fila de abajo: «por pantalla» y «carga masiva» son un solo camino. |
| Órdenes por carga masiva (R14) | idem | idem | Filas con claves `num_remision, destinatario, telefono, producto, provincia, canton_distrito ("<cantón> (<distrito>)"), direccion, notas, monto_cobrar` (`e2e/_escenarios/reparto.ts:386-401`). La tienda **con** `fulfillment` nace `en_preparacion` sin guía; **sin** él, `por_recolectar_en_tienda` con guía. |
| API key (R12, R14) | `lib/actions/api-keys.ts:34`, `generarApiKey` :86 | `new ApiKeyService(new ApiKeyRepository(P))` | `generar(generarApiKeySchema.parse({ identificador, tiendaDestinoId? }), maestro)` (`ApiKeyService.ts:66`). Solo `maestro`. Devuelve `{ status: "ok", apiKey, plainKey }` una sola vez. **Crea su propio usuario `apiKey`** con correo `apikey+<slug>@apikey.invalid` y contraseña aleatoria que no se devuelve (`lib/utils/api-key-identity.ts:9-48`, `ApiKeyService.ts:104-120`). |
| Órdenes por API (R14) | `app/api/ordenes/api-key/carga/route.ts:264` `handleCargaApi(req, deps?)` | Se llama con una `Request` real. Monta dentro: `buildAutenticar()` (`lib/api/api-key-request.ts:47`, resuelve la key en `comoPlataforma("SL-17")`), `conEmpresaDeLaKey` (:74), `new BulkOrdenService(OR, new TarifaVigenteRepository(P), notificarCargaMasivaTerminadaReal)` (:167), `EtiquetasDescargaService(EtiquetasLotePdfService(EtiquetaGuiaService(OR), new SupabaseFileStorage(undefined, ETIQUETAS_BUCKET), new SupabaseSignedUrlProvider(undefined, ETIQUETAS_BUCKET), TTL, MAX), OR)` (:184) y `ManifiestoService` (:200) | `POST` con `Authorization: Bearer <plainKey>` y cuerpo `{ ordenes: Record<string,string>[], name?, download_type? }`. Fija la empresa él mismo: **llamarlo fuera de `conEmpresa`**. Lleva el notificador real de «carga terminada» (puede encolar `push_web`). |
| Recolección en tienda (157) | Asignar: `lib/actions/ordenes-guia.ts:144` `asignarRecoleccion` (con `buildGuiaService` :33). Confirmar: `lib/actions/recoleccion-tienda.ts:87` `recolectarEnTiendaPorQr` (`buildService` :61) | Guía: `new GuiaAsignacionService(OR, new ZonaRepository(P), new AsignabilidadCoordenadasService(new JobRepository(P)), HIST)`. Recolección: `new RecoleccionTiendaService(new OrdenRepository(P), new GestionOrdenRepository(P), new OrdenHistorialRepository(P))` | `asignarRecoleccion({ ordenIds, mensajeroId }, maestro)` (`GuiaAsignacionService.ts:618`; el comentario de la action :140 dice «NO transiciona», pero el servicio sí pasa a `recolectando`, :731). `recolectarEnTienda(numGuia, mensajero)` (`RecoleccionTiendaService.ts:98`). |
| Camino de estados (R15) | `lib/actions/ordenes-guia.ts` (`generarGuia` :110, `asignarDesdeBodega` :125, `rutearABodegaSatelite` :250); `lib/actions/recepcion-satelite.ts:67/82` (`recibirPorQr` :247, `asignarDesdeSatelite` :268); `lib/actions/mis-asignaciones.ts:112` (`recogerAsignaciones` :169) | Guía: el de arriba. `new RecepcionSateliteService(OR, HIST)`. `new AsignacionSateliteService(OR, new AsignabilidadCoordenadasService(new JobRepository(P)), HIST)`. `MisAsignacionesService`: fila de gestiones | Igual que `e2e/_escenarios/reparto.ts:237-276` y `llevarA` :443 (comprobado contra las actions: coinciden). |
| Gestiones (R16) | `lib/actions/mis-asignaciones.ts:112` (`escogerParaGestion` :188, `gestionar` :208) | `new MisAsignacionesService(new GestionOrdenRepository(P), OR, new SupabaseFileStorage(undefined, EVID), new SupabaseSignedUrlProvider(undefined, EVID), new RutaOptimizadaRepository(P), new OrdenMensajeroMetaRepository(P), HIST)` | `escogerParaGestion(ordenId, mensajero)` :558 y `gestionar(GestionarInput, mensajero)` :592. Resultados: `entregado`, `reprogramado`, `novedad`, `devolucion_a_origen_por_rechazo`, `incidente` (`IMisAsignacionesService.ts:403-445`). La orden sigue `en_reparto` hasta aprobar el cierre (ficha 454). |
| Incidente con indemnización (158) | `lib/actions/incidentes.ts:73` (`buildService`), `reportarIncidente` :221, `aprobarIncidente` :242 | `new IncidenteAdminService(new IncidenteAdminRepository(P, new WalletMovimientoRepository(P), new WalletIndemnizacionIncidenteFeedService()), OR, new OrdenHistorialRepository(P), new SupabaseFileStorage(undefined, EVID), new SupabaseSignedUrlProvider(undefined, EVID))` | `reportar({ ordenId, causa, motivo, evidencias: EvidenciaArchivo[] }, actor)` :362 → la orden pasa a `incidente` en el acto. `aprobar(incidenteId, monto: string, actor)` :414 → indemnización. **R51: quien aprueba no puede ser quien reportó** (reporta el `maestro`, aprueba el `admin`, o al revés). `causa` ∈ `CAUSA_INCIDENTE_SEED`. |
| Devolución a tienda (139/48/419) | `lib/actions/envio-devolucion-central.ts:42` (`enviarACentral` :73); `lib/actions/recepcion-bodega-central.ts:46` (`recibirEnBodegaCentralPorQr` :62); `lib/actions/devolucion-origen.ts:42` (`devolverATienda` :74); `lib/actions/recepcion-origen.ts:47` (`recibirEnOrigenPorQr` :61); `lib/actions/devolucion-tienda.ts:50` (`confirmarEntregaTienda` :73) | `new EnvioDevolucionCentralService(OR)`; `new RecepcionBodegaCentralService(OR)`; `new DevolucionOrigenService(OR)`; `new RecepcionOrigenService(OR)`; `new DevolucionTiendaService(new DevolucionTiendaRepository(P), new SupabaseFileStorage(undefined, EVID), new SupabaseSignedUrlProvider(undefined, EVID))` | `enviarACentral(ordenId, adminSatelite)`; `recibirEnBodegaCentral(numGuia, maestro)`; `devolverATienda(ordenId, maestro)`; `recibirEnOrigen(numGuia, adminTienda)`; `confirmarEntrega({ tiendaId, ordenIds, evidencias }, maestro)` (comprobante obligatorio, imagen). |
| Rechazo de la tienda sobre una novedad (240) | `lib/actions/resolver-novedad.ts:116` (`buildRechazoService`), `rechazarNovedad` :197 | `new RechazoTiendaService(new OrdenRepository(P), new GestionOrdenRepository(P), new TarifaVigenteRepository(P), new RechazoTiendaCobroRepository(P))` | `rechazar(ordenId, motivo, adminTiendaDueña)` (`RechazoTiendaService.ts:102`): `novedad → devolucion_a_origen_por_rechazo` y alta de un cobro pendiente (`rechazo_tienda_cobro`). No estaba en D5.1; hace falta para un estado (§2). |
| Cierres de día (R17) | `lib/actions/cierre-dia.ts:46` (`solicitarCierre` :186); `lib/actions/cierres-admin.ts:101` (`aprobarCierre` :342, `rechazarCierre` :416) | `CierreDiaService(new CierreDiaRepository(P, new TarifaVigenteRepository(P)), new ZonaRepository(P), OR, new SupabaseSignedUrlProvider(undefined, EVID), new TarifaZonaMensajeroRepository(P), notificarCierreDiaPorAprobarReal, notificarMensajeroBloqueadoReal)`. `CierresAdminService(new CierresAdminRepository(P, new WalletMovimientoRepository(P), new WalletFeedService(), new WalletTiendaMovimientoRepository(P), new WalletTiendaFeedService(), new PagoMensajeroMovimientoRepository(P), new WalletMensajeroFeedService(), new WalletIndemnizacionFeedService()), new ZonaRepository(P), OR, new SupabaseSignedUrlProvider(undefined, EVID), new LiquidacionPagoRepository(P), new PagoMensajeroMovimientoRepository(P), buildReprogramadasRetenidasService(P), notificarMensajeroBloqueadoReal, liberarAlAprobarCierreCon(buildLiberarReprogramadasService()), notificarCierreDiaRechazadoReal)` | `solicitarCierre(mensajero)` (`CierreDiaService.ts:583`). `aprobarCierre(cierreId, actor, indemnizaciones, confirmacionFisica)` (`CierresAdminService.ts:962`): `adminSatelite` si `destinoTipo = bodega_satelite`, si no `maestro`. `rechazarCierre(cierreId, motivo, actor)` :1597. Coincide con `e2e/_escenarios/cierres.ts:56-92`. |
| Cierre de bodega satélite (R17) | `lib/actions/cierre-bodega.ts:73` (`solicitarCierreBodega` :108), :78 (`aprobarCierreBodega`) | `new CierreBodegaService(new CierreBodegaRepository(P), OR)`; `new CierresBodegaAdminService(new CierresBodegaAdminRepository(P), new SupabaseSignedUrlProvider(undefined, EVID))` | `solicitarCierreBodega(adminSatelite)` (`CierreBodegaService.ts:419`); `aprobarCierreBodega(cierreBodegaId, maestro)` (`CierresBodegaAdminService.ts:455`). |
| Novedad interna (corte diario) | `app/api/cron/corte-diario/route.ts` (`buildService`), recorre todas las empresas con `paraCadaEmpresa` | `new CorteDiarioService(new CorteDiarioRepository(P), new CierreDiaRepository(P, new TarifaVigenteRepository(P)), new ZonaRepository(P), OR, new TarifaZonaMensajeroRepository(P), { warn }, notificarCierreDiaVencidoReal)` | `ejecutarCorte(now: Date = new Date())` (`CorteDiarioService.ts:152`) dentro de `conEmpresa(<demo>)`. **Ver BLOQUEO B1 (§2).** |
| Pago a mensajero (R18) | `lib/actions/liquidacion.ts:104` (`buildService`), `registrarPagoMensajeroAction` :131 | `new LiquidacionService(new LiquidacionPagoRepository(P), new WalletTiendaMovimientoRepository(P), new PagoMensajeroMovimientoRepository(P), (fn) => P.$transaction((tx) => fn(tx)), new CajaPagoTiendaFeedService(new WalletMovimientoRepository(P)), new LiquidacionRepartoRepository(P), undefined, undefined, buildComprobantes(P))` | `registrarPagoMensajero(registrarPagoMensajeroSchema.parse({ cierreId, claveIdempotencia: uuid, monto: "…", metodo, referencia? }), maestro)` (`LiquidacionService.ts:306`). Contra un cierre **aprobado**. Sin comprobante en esta action. `buildComprobantes` vive en `lib/actions/_shared/comprobante-lateral.ts:18`. |
| Aporte de capital con comprobante (R18) | `lib/actions/aporte-capital.ts:30`, `registrarAporteCapitalAction` :78 | `new AporteCapitalService(new AporteCapitalRepository(P), new CajaAporteCapitalFeedService(caja), caja, new SupabaseFileStorage(undefined, COMP), new SupabaseSignedUrlProvider(undefined, COMP), (fn) => P.$transaction((tx) => fn(tx)))`, `caja = new WalletMovimientoRepository(P)` | `registrar({ claveIdempotencia, clase: "saldo_inicial" \| "aporte", monto: "…", fecha: "YYYY-MM-DD", motivo }, { contentType, bytes } \| null, maestro)` (`AporteCapitalService.ts:95`). Ojo: el comprobante es el **2.º** argumento y el actor el 3.º. |
| Abono de tienda (R18) | `lib/actions/abono-tienda.ts:43`, `registrarAbonoTiendaAction` :108 | `new AbonoTiendaService(new AbonoTiendaRepository(P), new WalletTiendaMovimientoRepository(P), new LiquidacionPagoRepository(P), new UserRepository(P), new CajaAbonoTiendaFeedService(new WalletMovimientoRepository(P)), new SupabaseFileStorage(undefined, COMP), new SupabaseSignedUrlProvider(undefined, COMP), (fn) => P.$transaction((tx) => fn(tx)))` | `registrar({ claveIdempotencia, tiendaId, monto, metodo, referencia?, motivo… }, comprobante \| null, maestro)` (`AbonoTiendaService.ts:149`). |
| Excepción de cobro (SL-40) | `lib/actions/cobro-plataforma.ts:22`, `fijarCobroEmpresaAction` :42 | `new CobroPlataformaService(new CobroPlataformaTarifaRepository(P))` | `fijarDeEmpresa(actor, { organizacionId, monto: "100" })` (`CobroPlataformaService.ts:43`; ojo: el actor es el **1.er** argumento). Exige `esPlataforma(actor.rol)` = `superadmin` (`lib/auth/plataforma.ts:17`). El repositorio ya abre su propio `comoPlataforma("SL-40")`; el `usuarioId` del actor no se escribe. **Tiene que ir antes de crear órdenes**: el cargo de SL-40 se calcula al nacer cada orden. |
| Pago a la plataforma (SL-45) | `lib/actions/wallet-egresos.ts:67` (`buildService`), `registrarEgresoAdministrativoAction` :89 | `new WalletEgresoService(new WalletMovimientoRepository(P), P, buildComprobantes(P), new TopePagoPlataformaService(new CobroPlataformaMovimientoRepository(P), new PagoPlataformaRepository(P)))` | `registrarEgreso({ tipoEgreso: "pago_plataforma", monto: "…", descripcion, fecha?, claveIdempotencia }, maestro, comprobante \| null)` (`WalletEgresoService.ts:65`). El tope de SL-45 exige deuda ≥ monto. No es un servicio propio: es el egreso administrativo con tipo `pago_plataforma`. |

Reprogramada con fecha corregida (si hiciera falta): `lib/actions/corregir-fecha-reprogramacion.ts`, `CorreccionFechaReprogramacionService.corregir` (:74), como `reparto.ts:570`.

### 2. Los 20 estados de `ORDER_STATUS_SEED` (`lib/types/order-status.ts:62-97`)

Aristas: `lib/types/order-status-transiciones.ts:14-156`. Origen: tienda **con** bodega (`fulfillment`) → `en_preparacion`; **sin** bodega → `por_recolectar_en_tienda` (con guía). «CA» = aprobar el cierre del mensajero (`CierresAdminService.aprobarCierre`); «llevarA» = `e2e/_escenarios/reparto.ts:443`.

| # | Estado | Nace en | Llamadas de servicio | Notas |
|---|---|---|---|---|
| 1 | `en_preparacion` | `en_preparacion` | `cargarMasiva` con tienda `fulfillment` | — |
| 2 | `en_bodega_central` | `en_preparacion` | `GuiaAsignacionService.generarGuia({ ordenIds }, maestro)` | — |
| 3 | `en_ruta_bodega_satelite` | `en_preparacion` | 2 + `rutearABodegaSatelite({ ordenIds }, maestro)` | orden de la zona satélite |
| 4 | `en_bodega_satelite` | `en_preparacion` | 3 + `RecepcionSateliteService.recibir(numGuia, adminSatelite)` | — |
| 5 | `mensajero_recogiendo_en_bodega` | `en_preparacion` | central: 2 + `asignarDesdeBodega({ ordenIds, mensajeroId, dia: "hoy" }, maestro)`; satélite: 4 + `AsignacionSateliteService.asignar(…, adminSatelite)` | exige ubicada (D6.1) antes de asignar |
| 6 | `en_reparto` | `en_preparacion` | 5 + `MisAsignacionesService.recogerAsignaciones({ ordenIds }, mensajero)` | ver restricciones R-a, R-b |
| 7 | `entregado` | `en_preparacion` | 6 + `escogerParaGestion` + `gestionar(entregado)` + `solicitarCierre` + CA | — |
| 8 | `reprogramado` | `en_preparacion` | 6 + `gestionar(reprogramado, fecha = mananaCalendarioCR())` + cierre + CA | con fecha de mañana, `liberarAlAprobarCierreCon` no la suelta |
| 9 | `novedad` | `en_preparacion` | 6 + `gestionar(novedad, causa)` + cierre + CA (anclaje) | — |
| 10 | `devolucion_a_origen_por_rechazo` | `en_preparacion` | 9 + `RechazoTiendaService.rechazar(ordenId, motivo, adminTiendaDueña)` | **No** se alcanza con `gestionar(rechazo)` + CA: la misma aprobación la dispara a `por_devolver_*` (`CierresAdminRepository.ts:2287-2345`). Queda en reposo hasta la **siguiente** aprobación de un cierre de ese mensajero (el disparo busca por `mensajero_asignado_id`). Alternativa: `CierresAdminService.corregirResultadoGestion` (:1535) `entregado → rechazada` (398). |
| 11 | `por_devolver_a_bodega_central` | `en_preparacion` (satélite) | 6 + `gestionar(devolucion_a_origen_por_rechazo)` + cierre + CA por `adminSatelite` | — |
| 12 | `devolviendo_a_bodega_central` | idem | 11 + `EnvioDevolucionCentralService.enviarACentral(ordenId, adminSatelite)` | — |
| 13 | `por_devolver_a_tienda` | `en_preparacion` (central) | 6 + `gestionar(rechazo)` + cierre + CA por `maestro`; o 12 + `RecepcionBodegaCentralService.recibirEnBodegaCentral(numGuia, maestro)` | — |
| 14 | `devolviendo_a_tienda` | idem | 13 + `DevolucionOrigenService.devolverATienda(ordenId, maestro)` | — |
| 15 | `devuelta_a_tienda` | idem | 14 + `RecepcionOrigenService.recibirEnOrigen(numGuia, adminTienda)` o `DevolucionTiendaService.confirmarEntrega({ tiendaId, ordenIds, evidencias }, maestro)` | — |
| 16 | `por_recolectar_en_tienda` | `por_recolectar_en_tienda` | `cargarMasiva` (o la API) con tienda **sin** `fulfillment` | — |
| 17 | `recolectando` | `por_recolectar_en_tienda` | `GuiaAsignacionService.asignarRecoleccion({ ordenIds, mensajeroId }, maestro)` | ver R-c |
| 18 | `en_ruta_bodega_central` | `por_recolectar_en_tienda` | 17 + `RecoleccionTiendaService.recolectarEnTienda(numGuia, mensajero)` | — |
| 19 | `incidente` | `en_preparacion` | 2 (u otro de los 5 orígenes: `en_ruta_bodega_central`, `en_bodega_central`, `en_ruta_bodega_satelite`, `en_bodega_satelite`, `mensajero_recogiendo_en_bodega`) + `IncidenteAdminService.reportar(…, maestro)`; indemnización con `aprobar(incidenteId, monto, admin)` | alternativa: `gestionar(incidente)` + cierre + CA |
| 20 | `novedad_interna` | `en_preparacion` | 6 + `CorteDiarioService.ejecutarCorte(now)` en `conEmpresa(<demo>)` | **BLOQUEO B1** |

**BLOQUEO B1 — `novedad_interna` no se alcanza el mismo día con el reloj real.**
- `ejecutarCorte` cierra «el día anterior»: `diaQueElCorteCierra(now) = startOfDayCR(now) − 1 día` (`CorteDiarioService.ts:117`).
- Solo barre órdenes `en_reparto` con `fecha_reparto IS NULL OR fecha_reparto <= diaCerrado` (`CorteDiarioRepository.ts:127`, gemelo en `CierreDiaRepository.ts:1043-1048`).
- Las dos asignaciones escriben `fecha_reparto = hoy` (`resolverFechaReparto("hoy")`, `lib/utils/dia-reparto.ts:29`; `GuiaAsignacionService.ts:573`, `AsignacionSateliteService.ts:321`). El corte de hoy no la ve.
- El E2E nunca produjo este estado: usa el corte solo para el `vencido` por gestión pendiente (`e2e/cierre-vencido-modelo.spec.ts:55`).
- Único camino por servicio sin escribir a mano: pasar el reloj del propio servicio, `ejecutarCorte(<mañana>)`. Es un parámetro público del método, no una escritura directa, pero simula que el día pasó. **Pregunta para Carlos:** ¿se acepta `ejecutarCorte(mañana)` (y entra en D5.3 con su motivo), o `novedad_interna` queda fuera de la demo?

Restricciones de orden de la receta (salen del código, no del design):
- **R-a (cierre con pendientes):** `solicitarCierre` devuelve `conflict` si el mensajero tiene órdenes pendientes de gestión (`CierreDiaService.ts` tras :645, `contarOrdenesPendientesGestion`). Las órdenes en reposo en `en_reparto` (y, a confirmar en T5, `mensajero_recogiendo_en_bodega`) tienen que ser de un mensajero que ya cerró o que no cierra.
- **R-b (alcance del corte):** el corte barre **todos** los mensajeros de la empresa: los que tienen gestiones sin cierre (rama a, sin mirar fecha) y los que tienen `en_reparto` barribles (rama b). Quien tiene un cierre abierto queda fuera. Con B1 aceptada, hay que correr el corte **antes** de dejar en reposo las demás órdenes `en_reparto`, con un mensajero dedicado, que además queda bloqueado por su `vencido`.
- **R-c (dedicación, 157):** `asignarRecoleccion` rechaza a un mensajero con reparto pendiente (`GuiaAsignacionService.ts:706-719`, `ESTADOS_REPARTO_PENDIENTE`), y quien recolecta no recibe órdenes de bodega (:145). Hace falta un mensajero recolector propio.
- **R-d (estado 10):** después del rechazo de la tienda no se aprueba ningún otro cierre de ese mensajero.
- **Consecuencia para D7:** con `mensajero-central` y `mensajero-satelite` no alcanza. Hacen falta al menos un recolector y uno para el corte, por empresa (perfiles extra, o mensajeros sin entrada en la tabla de acceso).

### 3. Comprobantes, `geocode_precision`, módulos

- **Comprobantes: admiten imagen.** `WALLET_COMPROBANTE_MIME = ["image/jpeg", "image/png", "image/webp", "application/pdf"]` (`lib/config/wallet-comprobante.ts`), máx. 4 MB. Vale para el aporte de capital, el abono, el pago a la plataforma y el reparto o pago a la tienda (`buildComprobantes`). El pago a mensajero contra un cierre (`registrarPagoMensajeroAction`) no recibe comprobante. Las evidencias de gestión, incidente y devolución a tienda solo admiten imagen (`GESTION_ALLOWED_MIME`, `lib/config/gestion.ts:14`). `e2e/fixtures/evidencia.jpg` empieza por `FF D8 FF DB` (JPEG, 274 B) y sirve para todo. **No hace falta `jspdf`.**
- **`geocode_precision`: la UI no lo pinta.** Ningún archivo de `app/` ni `components/` lo lee. Solo lo escriben `OrdenGeocodeRepository.guardarResultado` y `GeocodificacionService.ts:200`, que guarda la precisión que reporta Google, `APPROXIMATE` incluida (Q8). El gate solo mira `latitud`/`longitud` y `geocodeStatus` (`AsignabilidadCoordenadasService.ts:123-127`). `precision: "APPROXIMATE"` con `status: "OK"` (`STATUS_OK`, `GeocodificacionService.ts:26`) es coherente.
- **Módulos por empresa: no existen.** No hay ningún modelo ni flag de módulo encendido o apagado por empresa (se buscó en `db/schema.prisma` y `lib/`). Las pantallas sí dependen de datos: el aviso «Confirmá el SINPE» si la zona no tiene el SINPE confirmado (ficha 429; se confirma con `SinpeBodegaService.confirmar`) y el rol `apiKey`, que no navega (`lib/auth/menu-visibility.ts:174`).

### 4. Guardias que barren `scripts/` o `tests/`

| Guardia | Raíces | Qué exige a `scripts/demo-qa*.ts` y a `tests/fabricas/escenarios/*` |
|---|---|---|
| `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts` (helper `_aislamiento-por-empresa.ts:119`, `CARPETAS_PLATAFORMA = ["lib","app","scripts"]`, recursivo) | lib, app, scripts | **Cada archivo** de `scripts/` (también `scripts/demo-qa/*.ts`) que llame a `comoPlataforma(` va en `EXCEPCIONES_DE_PLATAFORMA` (`lib/db/excepciones-aislamiento.ts:78`) con ficha y motivo, y la lista tiene que estar ordenada. `tests/fabricas/` no se barre: el alta en la fábrica no necesita entrada. |
| `tests/unit/guards/sql-a-mano-por-empresa.guardia.test.ts` | **solo lib y app** (`CARPETAS_SQL_A_MANO`, `_aislamiento-por-empresa.ts:104`) | Nada para `scripts/` ni `tests/`. El SQL del borrado y de la marca no entra en `EXCEPCIONES_SQL_A_MANO`. |
| `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts` (`CARPETAS = ["app","lib","scripts"]`) | app, lib, scripts | Prohíbe `createXClient().storage`, `.storage.from(`/`createBucket(`…, la desestructuración `{ storage } = createXClient()` y el alias `= x.storage`. Usar `new SupabaseFileStorage(...).remove()` y `new SupabaseAlmacenDescargas(...)` no casa. **`scripts/demo-qa/` no entra en `EXCEPCIONES_DE_STORAGE`** (`lib/db/excepciones-aislamiento.ts:193`). |
| `pago-plataforma-inmutable-sl45.guardia.test.ts` | lib, app, scripts | Ni `walletMovimiento.update/delete…(` ni SQL literal `UPDATE`/`DELETE FROM`/`TRUNCATE` sobre `wallet_movimiento`. El borrado genérico por nombre de tabla sacado del catálogo no lo dispara, pero borra esas filas igual (D12). Que el reviewer lo vea a la luz: es el caso que la guardia quiere vigilar. |
| `otp-debug-solo-en-pruebas.guardia.test.ts` | todo el repo salvo `e2e/`, `tests/`, `playwright.config.ts` y `gate.yml`; los `.md` no cuentan | **Ninguna línea de código** de `scripts/demo-qa*` puede tener `AUTH_OTP_DEBUG_LOG=…`, `: "1"` ni nada parecido, ni siquiera dentro de un texto de salida. Nombrarla en prosa o en un `.md` sí se puede. |
| `sin-credenciales-de-entorno.guardia.test.ts` | app, lib, scripts | No leer ni nombrar como literal las variables retiradas (`GOOGLE_MAPS_API_KEY`, `WHATSAPP_*`, `ANTHROPIC_API_KEY`…). |
| `prisma-client-sin-adaptador.guardia.test.ts` | lib, app, components, scripts… | `new PrismaClient()` sin argumentos prohibido. El cliente dueño lleva `adapter: new PrismaPg(...)`, como `abrirBaseE2E`. |
| `fuera-datos-ordenex.guardia.test.ts` | `package.json`; texto de tests, scripts, lib y app | R2: ningún script de `package.json` puede nombrar `seed-maestro`, `seed-usuarios`, `superadmin` ni `crear-usuario`. `"demo:qa": "tsx scripts/demo-qa.ts"` y el `build` nuevo pasan. R3: toda mención `db:seed…` tiene que ser un script declarado. `SCRIPTS_QUE_CREAN_USUARIOS` (SL-32 R19) se compara por nombre: la demo crea usuarios sin entrar en esa lista. Es una decisión para el reviewer. |
| `marcador-fallo-config-declaracion-unica`, `historial-accion-punto-unico`, `p2003-detector-unico`, `clave-remision-solo-lectura`, `caja-173-alcance`, `premio-ranking-alcance`, `sinpe-sin-variables-de-entorno`, `push-alta-punto-unico`, analítica (`cache-*`, `modulo-puro`, `alcance-fuente-unica`, `export-*`) | incluyen scripts | Solo disparan si la demo escribe sus literales: `[geocode:config]`, escritura directa a `historial_accion`, alta de push o caché de analítica. La receta no hace nada de eso. |
| `ayuda-columna-retirada`, `gestion-aprobada-retirada`, `nota-privada-retirada`, `tablero-dia/buckets-estatus`, `cache-tags` | incluyen `tests/` (y `e2e/`) | Nombres retirados prohibidos también en `tests/fabricas/escenarios/*`. Lo que se mueve desde `e2e/_escenarios` ya los cumple, porque `e2e/` también se barre. |
| `finales-de-linea-lf.guardia.test.ts` | `init.sh`, `scripts/*.sh`, `scripts/*.mjs` | No afecta a los `.ts`. |

### 5. Datos de T0

- **Última migración de `dev`:** `db/migrations/20261025150000_jobs_por_empresa`. En el árbol ya hay, sin commitear, `20261025160000_organizacion_es_demo` y `20261025160100_entorno_marca`, de otra tanda.
- **`RUTAS_GUARDADAS`** (`scripts/migrar-storage-a-carpetas.ts:100`): `readonly RutaGuardada[]`, con `RutaGuardada = { readonly bucket: () => string; readonly columna: string; readonly leer: (db: LectorDeRutas, where: { organizacionId: { in: string[] } } | undefined) => Promise<{ organizacionId: string; ruta: string | null }[]> }` (:89-93).
  - `LectorDeRutas` (:64) es un `Pick<Prisma.TransactionClient, …>` de 13 delegados.
  - Son 12 entradas: `mensajero_documento`, `gestion_orden.evidencia_storage_path`, `gestion_orden_evidencia`, `orden_incidente_evidencia`, `devolucion_tienda_evidencia`, `orden.download_storage_path`, `carga.download_storage_path`, `wallet_comprobante`, `abono_tienda`, `aporte_capital`, `pago_por_cuenta_tienda` y `whatsapp_envio_ejecucion.pdf_ruta`.
  - Importarlo no ejecuta nada: `main` solo corre como entrypoint (`esEntrypoint`, al final del archivo).
- **`SupabaseAlmacenDescargas`** (`lib/storage/SupabaseAlmacenDescargas.ts:66`): `constructor(storage?: AlmacenStorageClientLike, bucket = descargaConfig.BUCKET, nuevoId = randomUUID)`. **`purgarAnterioresA(corte: Date, maximo: number): Promise<{ borrados: number; quedaPendiente: boolean }>`** (:116).
  - **Desviación:** pide `maximo`, que el design no pone. La purga del cron usa `MAX_OBJETOS_POR_CORRIDA = 5000` (`lib/services/PurgaDescargasService.ts:6`).
  - Hay que repetirla mientras `quedaPendiente`. Purga `<org>/tmp`.
- **`SupabaseFileStorage`** (`lib/storage/SupabaseFileStorage.ts:33`): `constructor(storage?: StorageClientLike, bucket: string = postulacionConfig.BUCKET)`, con el cliente perezoso. `remove(paths: string[]): Promise<void>` (:65): no hace nada con `[]`, antepone `<org>/` a cada ruta y es de mejor esfuerzo (no mira el error). Necesita `conEmpresa`.
- **`JobRepository.complete(id)` / `fail(id, error, runAfter: Date | null)`** (`lib/repositories/JobRepository.ts:195`, :203) son `$executeRaw` sobre `jobs`.
  - Tras `20261025150000_jobs_por_empresa` (política `jobs_por_empresa` FOR ALL TO `servi_app`, `organizacion_id = current_setting('app.organizacion_id')`, sin `FORCE`), y como la extensión rechaza el SQL a mano sin contexto: **sí piden contexto**.
  - Dentro de `conEmpresa(<demo>)` corren como `servi_app` y solo ven los jobs de la demo. En `comoPlataforma` correrían como el usuario de la conexión, sin filtro. Usar `conEmpresa`.
  - Los jobs que encolan los servicios toman `organizacion_id` por el DEFAULT de la columna (`JobRepository.ts:91`).
  - Buscar por clave exacta: `findByDedupeKeys(keys: string[])` (:188).
- **Guardia de Storage de SL-19:** `tests/unit/guards/storage-solo-por-adaptador.guardia.test.ts`, lista `EXCEPCIONES_DE_STORAGE`. `scripts/demo-qa/` no necesita entrar en ella (§4).
- **`OrdenGeocodeRepository`:** `constructor(prisma)` (:14). `guardarResultado(ordenId: string, data: { latitud: number | null; longitud: number | null; precision: string | null; status: string; geocodedAt: Date }): Promise<void>` (:38, tipo en `lib/interfaces/repositories/IOrdenGeocodeRepository.ts:15`). Usa `updateMany` sobre `orden`: modelo de negocio, va dentro de `conEmpresa`.
- **`dedupeKeyGeocodificacion(ordenId: string, hash: string): string`** → `geocodificacion:<ordenId>:<hash[0..8]>` (`lib/services/jobs/geocodificacion-encolado.ts:35`). **`hashDireccion(query: string): string`** (`lib/geo/direccion-query.ts:67`), SHA-256 de la dirección normalizada. Se calcula sobre `orden.direccion` **libre**, no sobre la consulta completa (`geocodificacion-encolado.ts:65`).
- **`handleCargaApi(req: Request, deps: CargaApiDeps = {}): Promise<NextResponse>`** (`app/api/ordenes/api-key/carga/route.ts:264`).
- **`AsignabilidadCoordenadasService`:** `constructor(jobs: IJobRepository)`. `evaluar(ordenes: { id, direccion, latitud, longitud, geocodeStatus }[], autorizadasSinUbicacion: ReadonlySet<string> = new Set()): Promise<Map<string, EstadoAsignabilidad>>` (`lib/services/AsignabilidadCoordenadasService.ts:109`).
- **`strongPasswordSchema`** (`lib/types/password-policy.ts:20`): zod string, `PASSWORD_MIN_LENGTH..PASSWORD_MAX_LENGTH`, con mayúscula, minúscula, dígito y símbolo.
- **`hashPassword(plain: string): Promise<string>`** (`lib/utils/password.ts:6`).
- **`fechaCalendarioCR(now: Date = new Date()): string`** (`YYYY-MM-DD`, `lib/utils/fecha-cr.ts:47`). `mananaCalendarioCR` está en :86.
- `usuario.contrasena_definida_at` existe (`db/schema.prisma:101`). `crearEmpresaE2E` hoy no la escribe; D5.3 sí la pide.

### 6. Qué separar para T4/T5

| Archivo | `process.env` | Playwright | Otros efectos |
|---|---|---|---|
| `tests/fabricas/e2e.ts` | lee `DATABASE_URL` (`urlBaseE2E`, :66) y la exige local (:41-62) | `import type { Browser, Cookie }` (:3), solo tipo. `sesionDe` usa el `browser` recibido. | `abrirBaseE2E` (:73) crea `PrismaClient` + `PrismaPg`. `dueno()` es compartido. `comprobarBaseE2E` mira los catálogos. Correos y contraseñas aleatorios (:159-167). `TIPO_IDENTIFICACION_E2E = "cedula"`. `confiarDispositivo` escribe `trusted_device` (la demo no lo usa, D7). |
| `e2e/_escenarios/reparto.ts` | **escribe** `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` al cargarse (:126-127) y lee `E2E_STORAGE_PUERTO` | `import type { Browser, BrowserContextOptions, Page }` (:5), solo tipo. `paginaDe` (:563) es lo único que usa un navegador. | Importa `drenarGeocodificacion` de `./crons` (cron por HTTP, :478). `baseReparto()` = `abrirBaseE2E` (:205). Lee la fixture con `fs` y `__dirname` (:129, :508-512). `dosDistritos` elige distritos del catálogo (:281); la demo los fija por `codigo_dta`, D22. |
| `e2e/_escenarios/cierres.ts` | ninguno directo, **pero importa `./reparto`**: cargarlo pisa `SUPABASE_URL` | ninguno | Lee con `baseReparto()` (`aprobarCierre` :103-115, `rechazarCierre` :146). `fijarEmpresa` de `tests/fabricas/organizaciones.ts` solo para `anclarDevolucionHaceDias` (excepción R8 del E2E, se queda en `e2e/`). |
| `e2e/_escenarios/crons.ts` | lee `CRON_SECRET` y `E2E_PUERTO` | ninguno | `fetch` al servidor local. Se queda en `e2e/` y la demo no lo usa. |

Al núcleo: de `reparto.ts`, `servicios()`, `crearZona`, `crearEscenarioReparto` (con empresa y usuarios parametrizables), `crearMensajero`, `crearOrden` (con el lector dueño inyectado), `estadoDe`, `gestionesDe`, `llevarA` (con `prepararAsignacion(ordenIds)` inyectado en lugar de `drenarGeocodificacion`), `gestionar` (con los bytes de la evidencia inyectados) y `corregirFechaReprogramacion`. De `cierres.ts`, `cierreDia()`, `cierresAdmin()`, `solicitarCierre`, `aprobarCierre` y `rechazarCierre`.

Se quedan en `e2e/`: `paginaDe`, la sustitución de `process.env`, `abrirBaseE2E` como lector, `cierresDe`, `anclarDevolucionHaceDias` e `importe`.

### Desviaciones del design detectadas

1. **No existe `OrdenService.crear`** (D5.1 «Orden por pantalla»). La pantalla crea por `BulkOrdenService.cargarMasiva` (route `carga-masiva/chunk`). Esa fila y la de carga masiva son el mismo camino.
2. **`purgarAnterioresA(corte, maximo)`** pide un segundo argumento, y hay que repetirla mientras `quedaPendiente`.
3. **El perfil `api` de D7** no puede tener `demo-qa-<x>-api@example.test` ni la contraseña de la demo. `ApiKeyService.generar` crea el usuario con `apikey+<slug>@apikey.invalid` y contraseña aleatoria, y el rol `apiKey` no navega. El slug sale de `identificador` y tiene que ser distinto entre A y B, porque el correo es único global.
4. **Pago a la plataforma** = `WalletEgresoService.registrarEgreso` con `tipoEgreso: "pago_plataforma"`. **Excepción de cobro** = `CobroPlataformaService.fijarDeEmpresa(actor, input)`, con el actor primero y `rol: "superadmin"`.
5. **D7 se queda corto de mensajeros** por R-a, R-b y R-c: hacen falta un recolector y un mensajero para el corte, además de los dos de reparto.
6. **`devolucion_a_origen_por_rechazo`** necesita `RechazoTiendaService.rechazar` (240), que D5.1/D5.2 no listan.
7. **`jspdf` no hace falta:** los comprobantes admiten JPEG.
