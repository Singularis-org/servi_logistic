# impl SL-36 «integraciones-por-empresa» — bitácora consolidada

Rama `feature/SL-36-integraciones-por-empresa`, worktree `.worktrees/SL-36-integraciones-por-empresa/`.
Spec: `specs/SL-36-integraciones-por-empresa/`. Detalle por tanda (archivos, mutaciones, desviaciones):

| Tanda | Bitácora |
|---|---|
| T1 datos, T2 bóveda | `progress/impl_SL-36-T1-T2.md` |
| T3 repositorios, T5.5 catálogo | `progress/impl_SL-36-T3.md` |
| T4 probadores | `progress/impl_SL-36-T4.md` |
| T5.1-T5.2 services | `progress/impl_SL-36-T5a.md` |
| T5.3-T5.4 webhook y recifrado | `progress/impl_SL-36-T5b.md` |
| T6.1-T6.2 WhatsApp y webhook | `progress/impl_SL-36-T6a.md` |
| T6.3-T6.5 Maps, rutas, asistente | `progress/impl_SL-36-T6b.md` |
| T6.6-T6.7 builders, docs, guardia R41 | `progress/impl_SL-36-T6c.md` |
| T7.1 actions | `progress/impl_SL-36-T7a.md` |
| T7.2 pantalla | `progress/impl_SL-36-T7b.md` |
| T8.1 guías | `progress/impl_SL-36-T8.md` |
| T9.1 E2E | `progress/impl_SL-36-T9.md` |

## Archivos

Diff contra `d461727` (spec): 203 archivos, 101 nuevos, 98 modificados, 4 borrados
(`lib/auth/google-wif-token.ts`, `lib/auth/google-adc-token.ts` y sus tests, design §9.2).

- Datos: `db/schema.prisma`; migraciones `20261025120000_integracion` y
  `20261025120100_historial_accion_integraciones`, cada una con `down.sql`; `lib/db/modelos-de-negocio.ts`;
  `lib/db/excepciones-aislamiento.ts`; `lib/types/historial-accion*.ts`.
- Bóveda y config: `lib/crypto/boveda-integraciones.ts`, `lib/config/integraciones.ts` y
  `lib/types/integraciones.ts` (catálogo, con las marcas como constante PROVISIONAL).
- Interfaces: `lib/interfaces/external/{ICifradorSecretos,IResumenSecreto,IFuenteAleatoria,IProbadorIntegracion}.ts`,
  `lib/interfaces/repositories/IIntegracion{,Enrutado,PruebaMinuto,Recifrado}Repository.ts` y
  `lib/interfaces/services/{IIntegracionesService,ICredencialesIntegracion,IWebhookWhatsappService,IRecifradoIntegracionesService}.ts`.
- Repositorios: `lib/repositories/Integracion{,Enrutado,PruebaMinuto,Recifrado}Repository.ts` y
  `EmpresasPlataformaRepository.ts`.
- Services: `lib/services/{Integraciones,CredencialesIntegracion,WebhookWhatsapp,RecifradoIntegraciones,EmpresasPlataforma}Service.ts`;
  `lib/services/integraciones/{credencial-de-la-empresa,rutas-de-la-empresa,asistente-de-la-empresa}.ts`;
  `lib/services/whatsapp/whatsapp-de-la-empresa.ts`.
- Probadores: `lib/clients/probadores/*`. R30 de WhatsApp en `lib/clients/whatsapp-rechazo-credencial.ts`.
- Consumidores: todos los de design §9.1 (WhatsApp, Maps, rutas, asistente), más `procesar-jobs`, el cron de
  plantillas, `chat/media` y el webhook. La tabla de composition root está en T6a, T6b y T6c.
- Comando: `scripts/recifrar-integraciones.ts`, `package.json` (`integraciones:recifrar`).
- Pantalla: `lib/actions/integraciones.ts`, `lib/actions/_shared/integraciones.ts`,
  `app/(app)/configuracion/integraciones/` y `lib/auth/menu-visibility.ts`.
- Guías: `docs/ayuda/oficina/{configuracion-integraciones,integracion-whatsapp,integracion-google-maps,integracion-optimizacion-rutas,integracion-asistente}.md`.
- E2E: `e2e/integraciones-por-empresa.spec.ts` y `playwright.config.ts` (proyecto `aislamiento`; probador doble y anillo de prueba en `webServer.env`).
- Configuración y documentación: `.env.example`, `README.md`, `docs/architecture.md`, `progress/deudas.md` (D10 resuelta).

## Mapa R<n> → test

Los nombres de caso son los de la tabla de `tasks.md > Trazabilidad`. Todos los archivos se corrieron juntos
(salida abajo). Las pruebas de base real corrieron contra Postgres local (`servi_logistic_sl36`), con 0 skipped.

| R | Test | Tipo |
|---|---|---|
| R1, R2, R3, R38 | `tests/unit/crypto/boveda-integraciones.test.ts` | unit |
| R4 | `tests/unit/config/integraciones-config.test.ts` (+ caso R4 en la bóveda) | unit |
| R5 | `tests/integration/db/integracion-dos-empresas.test.ts` › «R5 …» + `integracion-migracion.test.ts` (CHECK) + `tests/unit/services/integraciones-service.test.ts` (vista sin secretos) | base real + unit |
| R6, R7 | `tests/unit/services/integraciones-autorizacion.test.ts` (6 operaciones × 9 actores) | unit |
| R8 | `integracion-dos-empresas.test.ts` › «R8 …» (repo y SQL a mano con `comoApp(B)`) + `integracion-migracion.test.ts` (RLS) | base real |
| R9 | `integraciones-service.test.ts` + `integracion-dos-empresas.test.ts` › «R9 …» | unit + base real |
| R10, R11, R32, R33 | `integracion-dos-empresas.test.ts` | base real |
| R12-R15 | `integraciones-service.test.ts` | unit |
| R16 | `tests/integration/db/integracion-prueba-minuto.test.ts` + `integraciones-service.test.ts` (`reintentarEnS`) | base real + unit |
| R17 | `tests/unit/clients/probadores/*.test.ts` | unit |
| R18 | `integraciones-service.test.ts` + `tests/components/integraciones/IntegracionesModule.test.tsx` + E2E «al recargar no está en el HTML» | unit + componente + E2E |
| R19, R21 | `tests/unit/services/webhook-whatsapp-service.test.ts` (+ casos en la ruta de integración) | unit |
| R20 | `webhook-whatsapp-service.test.ts` + `tests/integration/api/webhook-whatsapp.route.test.ts` › «⭑ R20: dos empresas …» | unit + base real |
| R22 | `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts` + `tests/integration/db/integracion-enrutado.test.ts` | guardia + base real |
| R23 | `tests/unit/services/credenciales-integracion-service.test.ts` + `whatsapp-composition-root.test.ts` + `integraciones-consumidores-composition-root.test.ts` | unit |
| R24 | `tests/unit/services/whatsapp-sin-integracion.test.ts` | unit |
| R25 | `tests/unit/services/geocodificacion-service.test.ts` + `asignabilidad-coordenadas.test.ts` | unit |
| R26 | `tests/unit/services/optimizacion-ruta-degradacion.test.ts` | unit |
| R27 | `tests/integration/asistente-route.test.ts` › «sin integración: texto de R27 …» | integración |
| R28 | `tests/unit/clients/whatsapp-app-id.test.ts` › «la caché de A no responde a B» + `tests/unit/services/optimizacion-ruta-token-por-empresa.test.ts` | unit |
| R29 | `credenciales-integracion-service.test.ts` + casos «ilegible» en los consumidores | unit |
| R30 | `credenciales-integracion-service.test.ts` › «marcarRechazo» + `whatsapp-rechazo-credencial.test.ts` (Meta 401/190) + REQUEST_DENIED (`geocodificacion-service.test.ts`), invalid_grant/401 y 403 → permiso (`optimizacion-ruta-token-por-empresa.test.ts`), Anthropic 401 (`asistente-route.test.ts`), y los cuatro de extremo a extremo en `integraciones-consumidores-composition-root.test.ts` | unit + integración |
| R31 | `tests/components/integraciones/DesconectarDialogo.test.tsx` (literales del design §7 escritos en el test) + E2E | componente + E2E |
| R34 | `tests/components/integraciones/TarjetaIntegracion.test.tsx` | componente |
| R35 | `TarjetaIntegracion.test.tsx` › «enlace a la guía» + `tests/unit/ayuda/guias-integraciones.test.ts` | componente + unit |
| R36 | `tests/components/integraciones/FormularioIntegracion.test.tsx` + E2E | componente + E2E |
| R37 | `tests/integration/db/empresas-plataforma-integraciones.test.ts` | base real |
| R39, R40 | `tests/integration/db/recifrado-integraciones.test.ts` | base real |
| R41 | `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts` | guardia |

Cada test clave se mató con una mutación antes de darlo por bueno. La lista y el resultado de cada una están en
la bitácora de su tanda. Hubo dos supervivientes, y en los dos se arregló el test:
- la dirección fija de Maps: el test comparaba contra su propia constante;
- `metaReal` sin `fetchImpl`: faltaba un test de composition root.

## Salida real

Tests de la trazabilidad, juntos, con `DATABASE_URL` de la base de la feature (2026-10-25):

```
 Test Files  38 passed (38)
      Tests  559 passed (559)
EXIT=0
```

E2E (`progress/impl_SL-36-T9.md`), base desechable `servi_logistic_sl36_e2e` recreada solo antes de la primera
corrida, después de `next build`:

```
E2E_PUERTO=3044 pnpm exec playwright test e2e/integraciones-por-empresa.spec.ts --project=aislamiento --no-deps --reporter=list
corrida 1: 4 passed (13.4s)   exit 0
corrida 2: 4 passed (13.3s)   exit 0
```

Gate local: ver `progress/features/SL-36.md > Tandas`.

## Abierto

- T8.2: falta la revisión humana de los pasos en las consolas de terceros. La lista de pasos marcados
  «(verificar en la consola)» está en `progress/impl_SL-36-T8.md`.
- T9.1, segundo navegador: `playwright.config.ts` solo define Chromium. Añadir otro es una decisión de CI.

## Vuelta 2 (m1, m2, m4 de `progress/review_SL-36.md`; m3 no se toca)

**m1, el design §5 alineado con el código, sin cambiar la conducta.**
- `specs/SL-36-integraciones-por-empresa/design.md` §5 describe lo que hace el código ante un 403 de
  `optimizeTours`:
  - `fetchOptimizacion` marca `optimizacion_rutas.permiso`;
  - el cliente de Google devuelve `config_invalida` y `FallbackRouteOptimizationClient` lo re-lanza
    sin pasar a Haversine;
  - `OptimizacionRutaService` conserva el orden previo, marca la ruta `desactualizada` y lanza
    `RutaIntentoFallidoError`; la cola reintenta y, si sigue fallando, el job va a dead-letter.
  - Incluye el porqué: R26 y R30 se cumplen, y caer a Haversine sería cambiar la conducta del
    cliente compuesto de la feature 92.
- `docs/ayuda/oficina/integracion-optimizacion-rutas.md` decía «se ordena con el cálculo
  aproximado». Ahora dice que la ruta conserva el orden que tenía y se reintenta.
- Sin test: solo cambian documentos.

**m2, la caché del app id de Meta ve un token editado.**
- En `lib/clients/whatsapp-app-id.ts`, la entrada de `CacheAppId` guarda `huellaToken`: un sha256 en
  hex del token, que no se loguea. La entrada solo vale si coinciden empresa, integración y huella.
- No reutilicé `huellaDe` de `rutas-de-la-empresa.ts`: no se exporta y recibe una
  `ClaveCuentaServicio`. Uso el mismo método (`createHash("sha256")`).
- Test nuevo en `tests/unit/clients/whatsapp-app-id.test.ts`: «un token editado en la misma
  integración no reutiliza el app id cacheado».
  - Con el token viejo devuelve 444; con el nuevo, 555 y una segunda llamada a Graph.
  - Con el mismo token sirve la caché y no hay tercera llamada.
  - La caché no contiene el token en claro.
- Las dos cachés que precargan los tests existentes llevan ahora `huellaToken: "h"`.
- Mutación: cambié `enCache.huellaToken === huellaToken` por `true`.
  - Mutado: `× un token editado en la misma integración no reutiliza el app id cacheado`, `Tests  1 failed | 13 passed (14)`.
    El de R28 «la caché de A no responde a B» siguió verde.
  - Revertido: `Tests  14 passed (14)`.

**m4, la forma de R5 en el test de base, con el contrato exacto.**
- `tests/integration/db/integracion-dos-empresas.test.ts` (test R5) define el literal
  `FORMA_CIFRADA` sin importarlo de producción:
  `^v[1-9][0-9]*:[A-Za-z0-9+/]{16}:[A-Za-z0-9+/]{22}==:(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{4}|[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)$`.
  - Las longitudes salen de `lib/crypto/boveda-integraciones.ts`: `BYTES_IV = 12` da 16 caracteres;
    `BYTES_TAG = 16` da 22 caracteres más `==`.
  - El cifrado es base64 estándar, no vacío y con relleno canónico, como el CHECK
    `integracion_secretos_cifrados` de `db/migrations/20261025120000_integracion/migration.sql`.
- Mutación: no muté la bóveda, porque un valor con otra forma lo rechaza el CHECK antes del INSERT.
  Muté una copia del valor leído, dentro del `expect`. Cada mutante corrió con `-t "R5: en la base"`:
  - `v.replace(/^(v[0-9]+:)./, "$1_")` (base64url en el iv): `Tests  1 failed | 11 skipped (12)`;
  - `v.replace(/:[^:]+:([^:]+)$/, ":$1")` (sin la parte del tag): `Tests  1 failed | 11 skipped (12)`;
  - `v + "x"` (comprueba el ancla `$`): `Tests  1 failed | 11 skipped (12)`;
  - revertido, el archivo completo: `Tests  12 passed (12)`.

**Salida real (vuelta 2)**
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck` → `tsc --noEmit`, `TC_EXIT=0`.
- `pnpm run lint` → `LINT_EXIT=0`, `✖ 231 problems (0 errors, 231 warnings)`. Ningún aviso es de
  los archivos tocados.
- `pnpm run test:guardias` → `Test Files  1 failed | 305 passed | 2 skipped (308)`,
  `Tests  4 failed | 4190 passed | 20 skipped (4214)`. Los 4 rojos son de
  `dependencias-declaradas-presentes.guardia.test.ts` (baseline conocido).
- `pnpm exec vitest run tests/unit/clients/whatsapp-app-id.test.ts` → `Tests  14 passed (14)`.
- `pnpm exec vitest run tests/integration/db/integracion-dos-empresas.test.ts` (base de la feature)
  → `Tests  12 passed (12)`.
- `pnpm exec vitest related --run lib/clients/whatsapp-app-id.ts` (base de la feature) →
  `Test Files  193 passed (193)`, `Tests  2584 passed (2584)`, `REL_EXIT=0`.

Veredicto vuelta 2: m1, m2 y m4 corregidos, cada mutación probada y revertida, y todo lo tocado en
verde.

### B1: dos-empresas-humo

Base desechable `servi_logistic_sl36_e2e` en localhost, recreada solo antes de la primera corrida.
- DROP y CREATE en dos `prisma db execute` separados contra `postgres`. Prisma 7 no acepta `--url`
  y `DROP DATABASE` no corre dentro de una transacción.
- Después `pnpm exec prisma migrate deploy` («All migrations have been successfully applied.») y
  `pnpm run db:seed` (exit 0).
- Build nuevo, porque m2 cambió `lib/clients/whatsapp-app-id.ts`:
  `NODE_OPTIONS=--max-old-space-size=8192 pnpm exec next build` → `BUILD_EXIT=0`.
- Antes de correr, los puertos 3044 y 54329 estaban libres.

Comando exacto, el mismo en las dos corridas:
`E2E_PUERTO=3044 pnpm exec playwright test e2e/dos-empresas-humo.spec.ts --project=aislamiento --no-deps --reporter=list`

Opción elegida: **`--no-deps`**. El humo no depende de `plataforma-vacia`:
- en su `beforeAll` llama a `conCandadoDelSuperadmin(() => asegurarSuperadmin(db))`, que corre el
  arranque del superadmin por su cuenta;
- las dos empresas las da de alta él mismo, por la pantalla;
- los correos cambian en cada corrida.

Por eso no hizo falta `NEXT_PUBLIC_APP_URL`, que solo lo pide `superadmin-empresas` (T9, desviación 2).

Corrida 1 (Chromium):
```
Running 6 tests using 1 worker
  ok 1 [aislamiento] › e2e\dos-empresas-humo.spec.ts:174:5 › alta de A y B desde «Empresas» por el superadmin, y el correo de recuperación de cada maestro consta en el log (R16, R17) (11ms)
  ok 2 [aislamiento] › e2e\dos-empresas-humo.spec.ts:198:7 › el maestro de A recorre todas las rutas de su menú sin error ni datos de B (18.5s)
  ok 3 [aislamiento] › e2e\dos-empresas-humo.spec.ts:198:7 › el maestro de B recorre todas las rutas de su menú sin error ni datos de A (17.5s)
  ok 4 [aislamiento] › e2e\dos-empresas-humo.spec.ts:243:5 › cada maestro abre el webhook de su API key y ve su URL, no la de la otra empresa (2.3s)
  ok 5 [aislamiento] › e2e\dos-empresas-humo.spec.ts:264:5 › B abriendo los detalles de A ve «no encontrado», y A los ve con su marcador (3.2s)
  ok 6 [aislamiento] › e2e\dos-empresas-humo.spec.ts:311:5 › vehículos carga y escribir desde la pantalla falla cerrado (R40); geografía le da 404 al maestro (SL-32 R26) (3.3s)
  6 passed (55.3s)
PW_EXIT=0
```
En el recorrido del menú entró la ruta nueva de SL-36. Para cada maestro salió
`{"ruta":"/configuracion/integraciones","estado":200,"error":false,"noEncontrado":false,"cincoXX":[],"empresaNoResuelta":false,"fugas":[]}`.

Corrida 2 (misma base, sin recrear):
```
Running 6 tests using 1 worker
  ok 1 [aislamiento] › ... (R16, R17) (11ms)
  ok 2 [aislamiento] › ... el maestro de A recorre ... (18.6s)
  ok 3 [aislamiento] › ... el maestro de B recorre ... (17.3s)
  ok 4 [aislamiento] › ... webhook de su API key ... (2.4s)
  ok 5 [aislamiento] › ... detalles de A ... (3.2s)
  ok 6 [aislamiento] › ... vehículos ... (R40) ... (SL-32 R26) (3.3s)
  6 passed (55.4s)
PW_EXIT=0
```
En las dos: 6/6 passed, 0 failed, 0 skipped y 0 flaky.

Confirmación de m2, una corrida sobre la misma base y el mismo build:
`E2E_PUERTO=3044 pnpm exec playwright test e2e/integraciones-por-empresa.spec.ts --project=aislamiento --no-deps --reporter=list`
```
Running 4 tests using 1 worker
  ok 1 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:127:5 › alta rechazada: texto del catálogo, ninguna fila y solo lo no secreto se conserva (R13, R36) (872ms)
  ok 2 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:150:5 › alta buena: conectada, el token se ve una vez y al recargar no está en el HTML (R12, R18) (915ms)
  ok 3 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:190:5 › el admin de A, el maestro de B y el superadmin no ven la integración de A ni su formulario (R6) (4.3s)
  ok 4 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:243:5 › probar y desconectar: el aviso de qué deja de funcionar va antes y la fila se borra (R31, R32) (923ms)
  4 passed (13.2s)
PW_EXIT=0
```
Al terminar:
- los puertos 3044 y 54329 quedaron libres;
- no quedó vivo ningún proceso `next start`, `_servidor-app` ni `storage-falso`;
- no hay `.next/dev`.

No se tocó código.

Veredicto B1: el humo de aislamiento pasa 6/6 en las dos corridas seguidas, y
`integraciones-por-empresa` sigue en 4/4 con el build que ya trae m2.
