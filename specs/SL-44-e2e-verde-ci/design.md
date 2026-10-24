# SL-44 — E2E en verde en CI · design

## Lo que ya existe

**Términos buscados:** `e2e`, `datos propios`, `PRECONDITION (seed)`, `fixme`, `OTP`,
`SL17_HUMO_LOG_SERVIDOR`, `AUTH_OTP_DEBUG_LOG`, `SupabaseFileStorage`, `createServerClient`. Se buscó
en `feature_list.json`, `specs/`, `progress/` y el código, con Grep y Read. El MCP del grafo no
estaba disponible.

| Qué apareció | Qué es | Qué se hace |
|---|---|---|
| SL-31, tanda 7 (T10, T11a, T11b; R19–R23) | La misma reescritura de los E2E heredados, sin hacer. `tests/fabricas/e2e.ts` no existe. | **Absorbida** (P1, 2026-10-24). Anotado en `specs/SL-31-tests-datos-propios-ci/tasks.md`. Se conserva su nombre de módulo, `tests/fabricas/e2e.ts`, y su guarda de host (R12). |
| `e2e/_dos-empresas-fixture.ts` (SL-17) | `urlDeBase` (aborta con base prohibida), `clienteDueno`, `altaDeEmpresa` por `OrganizacionService`, `prepararAcceso` (hash + dispositivo confiado), `sembrarDatos`, `LogDelServidor`. | **Se reutiliza.** `LogDelServidor` pasa a leer `E2E_LOG_SERVIDOR`. `correoDelMaestro`, `liberarCorreos` y `solicitarRecuperacion` (con SMTP) salen con D16. |
| `e2e/_superadmin-fixture.ts` (SL-32) | `asegurarSuperadmin`, `codigoEnviadoA` (lee la línea `[email][debug]`), `entrarConOtp`, `conCandadoDelSuperadmin`. | **Se reutiliza** tal cual. Es la base de R15. |
| `e2e/_zona-especial-fixture.ts` (SL-38), `e2e/_wallet-iva-sl39-siembra.ts` (SL-39) | Siembras de dos empresas con dispositivo confiado. | Se reutilizan. La de SL-39 escribe filas de caja a mano: excepción de R8, en D4. |
| `lib/services/email/ConsoleEmailSender.ts`, `lib/config/email.ts` | Sin SMTP, emisor de consola. Con `AUTH_OTP_DEBUG_LOG=1`, escribe la línea con el código. `otpDebugLogHabilitado()` **no mira el entorno**. | D1 añade la guarda de producción. Nada más cambia. |
| `tests/fabricas/organizaciones.ts` (`fijarEmpresa`) | Fija la empresa en una transacción para escribir como la app. | Se usa en las excepciones de R8. |
| `tests/integration/db/organizacion-alta.test.ts` | Prueba la repetición `ya_existe` del alta. | Cubre lo que el humo deja de comprobar al pasar a la pantalla (D16). |
| D16 y D17 (`progress/deudas.md`) | El alta del humo por la pantalla, y los E2E con OTP fuera de CI. | Las cierra esta ficha (R16, R17, R14, R15, R29). |
| SL-43 (datos demo QA, `pending`) | Sin descripción en disco. | No hay dependencia. SL-43 podrá importar `tests/fabricas/e2e.ts`. |

## Multi-empresa, autorización y país

- **Sin tablas, columnas, RLS ni migraciones nuevas.** La ficha toca un predicado de configuración
  (D1), la infraestructura de pruebas y CI.
- **Todo dato de E2E vive en una empresa creada por la corrida:** `OrganizacionService.altaEmpresa`
  dentro de `comoPlataforma`, o la pantalla «Empresas» en el humo. Se escribe con la empresa fijada,
  así que el `DEFAULT` de `organizacion_id`, la RLS y los triggers de misma empresa trabajan como en
  la app. La autorización la sigue validando la app: los E2E entran por `/login` como cada rol.
- **Datos de país:** la geografía y la moneda salen de los catálogos de `db:seed` y de
  `lib/config/`.
  - Los importes esperados se escriben a mano: son el contrato.
  - El símbolo y los separadores se comparan con una expresión tolerante, como hoy en
    `mis-asignaciones.spec.ts`, porque salen de configuración.

## D1 — Guarda del OTP en producción (R1–R3)

`lib/config/email.ts`:

```ts
export function otpDebugLogHabilitado(): boolean {
  // En producción el código del OTP no se escribe nunca, aunque alguien encienda la variable: los
  // logs de Vercel los ve todo el equipo y se conservan.
  if (process.env.VERCEL_ENV === "production") return false;
  return leerBooleano("AUTH_OTP_DEBUG_LOG", false);
}
```

- Se mira `VERCEL_ENV`, no `NODE_ENV`, porque el E2E de CI corre `next start` (D3), que es
  `NODE_ENV=production`.
- **Tests (R1, R2):** `tests/unit/config/email-config.test.ts` y
  `tests/unit/services/email-notificacion.test.ts`, con 4 casos:
  - `production` + `1`: no hay línea de debug, y el código no aparece en ningún canal;
  - `preview` + `1`: sí hay línea;
  - sin `VERCEL_ENV` + `1`: sí hay línea;
  - `production` + `true`: no hay línea.
- **Mutación que lo mata:** quitar el `if`.
- **Guardia (R3):** `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts`.
  - Recorre los archivos versionados (`git ls-files`).
  - Da rojo con una asignación de `AUTH_OTP_DEBUG_LOG` a un valor no vacío fuera de `e2e/`,
    `playwright.config.ts`, `.github/workflows/gate.yml` y `tests/`.
  - Comprueba que `.env.example` la deja vacía.
  - Fixtures: un caso verde y uno rojo por motivo.

## D2 — Storage en el E2E: un doble del API de Storage (R4–R6)

**Lo que hay.**
- Todas las clases de `lib/storage/` crean su cliente con `createServerClient()` (`@supabase/supabase-js`
  con `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`), de forma perezosa, y hablan con
  `${SUPABASE_URL}/storage/v1`.
- Unas 25 composition roots hacen `new SupabaseFileStorage(...)` o `new SupabaseSignedUrlProvider(...)`
  directamente. Ejemplos: `lib/actions/mis-asignaciones.ts:120`, `cierres-admin.ts:132`,
  `cierre-bodega.ts:83`.

**Lo que se hace.** El único punto común es la URL, así que el E2E arranca un **doble HTTP del API
de Storage** y le da a la app `SUPABASE_URL` apuntando a él. Producción no cambia.

- `e2e/_storage-falso/servidor.mjs`: Node puro (`node:http`), sin dependencias, en `127.0.0.1` y en
  el puerto de `E2E_STORAGE_PUERTO` (por defecto 54329). Guarda los objetos en memoria, por
  `bucket/path`. Atiende lo que usan `SupabaseFileStorage` y `SupabaseSignedUrlProvider`:
  - subir (`POST /storage/v1/object/<bucket>/<path>`): guarda bytes y `content-type`, y responde
    `{ Key }`. Un path repetido sin `x-upsert` da 400, como Storage (`upsert: false`);
  - borrar (`DELETE /storage/v1/object/<bucket>`, cuerpo `{ prefixes }`): mejor esfuerzo;
  - firmar uno (`POST /storage/v1/object/sign/<bucket>/<path>`) y varios
    (`POST /storage/v1/object/sign/<bucket>`, cuerpo `{ paths }`). Un path no subido lleva `error`;
  - servir lo firmado (`GET /storage/v1/object/sign/<bucket>/<path>?token=…`): los bytes, o 400 si
    el path no existe o el token no casa (R5);
  - salud (`GET /salud`), para el `webServer` de Playwright.
- Las rutas y las formas exactas las fija T2.1 leyendo `@supabase/storage-js` instalado; no se
  adivinan.
- **Test de contrato:** `tests/unit/e2e/storage-falso.test.ts`.
  - Levanta el doble en un puerto libre y usa **el cliente real** `createClient(url, "clave-falsa")`.
  - Sube, firma uno y varios, descarga por `fetch` y compara bytes y tipo, borra y pide uno ausente.
  - Si una versión nueva de supabase-js cambia el protocolo, este test cae antes que el E2E.
  - Mutación: que el doble devuelva otros bytes. Tiene que salir rojo.
- **Las fixtures** que crean gestiones con evidencia llaman al servicio con
  `new SupabaseFileStorage(undefined, gestionConfig.EVIDENCIA_BUCKET)`, apuntado al mismo doble. La
  app y la fixture ven el mismo almacén.
- **Imagen de evidencia:** `e2e/fixtures/evidencia.jpg`, una imagen pequeña generada, sin fotos
  reales.

**Por qué esta y no otra** (las dos descartadas, en `## Alternativas`):

- Cero cambios en `lib/` y en las 25 composition roots, así que cumple R6, y no hay riesgo de un
  almacén de pruebas encendido por error en producción: el doble solo existe en `e2e/` y solo lo
  arranca Playwright.
- Sin dependencias nuevas y sin Docker extra.
- El riesgo, que el protocolo derive, lo cubre el test de contrato.

## D3 — Servidor, log y configuración de Playwright (R14, R15, R24, R26)

`playwright.config.ts`:

- **`webServer` pasa a ser una lista con dos servidores:**
  1. el doble de Storage (`node e2e/_storage-falso/servidor.mjs`, `url: …/salud`);
  2. la app, arrancada por `node e2e/_servidor-app.mjs`.
- **`e2e/_servidor-app.mjs`** lanza `next start`, o `next dev` si `E2E_SERVIDOR=dev`. Le escribe
  stdout y stderr, a la vez, en `E2E_LOG_SERVIDOR`, y los reenvía a la consola. Es Node, así que
  vale en Windows y en Linux, sin redirecciones de shell.
- **Entorno de la app** (`webServer.env`):
  - `AUTH_OTP_DEBUG_LOG=1`;
  - `SUPABASE_URL=http://127.0.0.1:<puerto>` y `SUPABASE_SERVICE_ROLE_KEY=clave-falsa-e2e`;
  - `SMTP_USER=""` y `SMTP_PASSWORD=""`;
  - `CRON_SECRET`, que viene del entorno o se genera;
  - `E2E_LOG_SERVIDOR`.
- **El `.env` local:** T1.3 mide si `@next/env` respeta un valor vacío ya definido o lo pisa con el
  `.env`. Si lo pisa, `_servidor-app.mjs` borra esas claves y pone el `SMTP_HOST` de un puerto
  cerrado. La salida que se quiere es esta: sin SMTP, el emisor de consola (R14).
- **`E2E_LOG_SERVIDOR`:** por defecto, `path.join(os.tmpdir(), "servi-logistic-e2e-servidor.log")`.
  Se fija en el config y lo heredan los workers. En CI es `$RUNNER_TEMP/...`, fuera del checkout,
  para que las guardias que barren el árbol no lo lean (lección del PR #1 de SL-31).
  `LogDelServidor.desdeEntorno()` lee esta variable; `SL17_HUMO_LOG_SERVIDOR` desaparece.
- **Por qué `next start` en CI:**
  - cada ruta ya está compilada, y el humo visita ~25 rutas por maestro. Con `next dev`, la primera
    visita compila;
  - no hay HMR: el falso `EmpresaNoResuelta` de recarga que vio SL-38 no se da;
  - se parece a producción.

  El coste es que la cookie de sesión es `secure` con `NODE_ENV=production` (`lib/actions/auth.ts:61`).
  Chromium acepta cookies `Secure` en `http://localhost`. T1.3 lo comprueba con un login real; si
  no, CI usa `E2E_SERVIDOR=dev` y se anota el motivo. En local el valor por defecto es el mismo, y
  `reuseExistingServer` sigue fuera de CI.
- **Proyectos** (R26), todos con `chromium`:
  - `plataforma-vacia`: `superadmin-arranque` y `superadmin-empresas`, que afirmaban «Aún no hay
    empresas» (hasta T7; ver el cambio de abajo);
  - `aislamiento`, con `dependencies: ["plataforma-vacia"]`: `dos-empresas-humo`,
    `zona-especial-dos-empresas`, `wallet-iva-aparte-sl39`, `marca`, `auth`, `rastreo-publico`,
    `analitica-roles`;
  - `reparto`: `asignacion-satelite`, `recepcion-satelite`, `mis-asignaciones`, `devolucion-origen`,
    `historial-orden`, `reintentos-escalado`, `reprogramacion-liberacion`;
  - `dinero`: `cierre-dia`, `cierre-vencido-modelo`, `cierres-admin`, `cierres-admin-rechazos-sla`,
    `cierre-bodega-satelite`, `reglas-bloqueos-cierre`, `wallet`, `mi-wallet`, `wallet-mensajeros`.
  - `reparto` y `dinero` no dan de alta empresas por la pantalla ni afirman el vacío, así que no
    dependen de `plataforma-vacia`.
  - **Cambio de T7 (2026-10-24), por A1.** Con datos únicos por corrida y sin borrado, la 2.ª
    corrida local de `aislamiento` sobre la misma base encontraba las empresas de la 1.ª, y
    `superadmin-empresas` caía en su `beforeAll` (exigía `organizacion.count() == 0`), arrastrando
    a todo `aislamiento` por la dependencia. En CI no pasaba (base nueva por grupo). Salida mínima:
    `superadmin-empresas` ya no exige ni afirma el vacío, y comprueba el listado por los slugs de
    su corrida, no por un recuento total. El texto del estado vacío y la ausencia de la tabla los
    cubre `tests/components/empresas-module.test.tsx` («sin empresas pinta el estado vacío y no la
    tabla»), que cae si se quita esa rama del componente. El proyecto conserva su nombre y la
    dependencia: el superadmin es único por base y su alta sigue yendo antes que el resto. Ningún
    E2E afirma ya la plataforma sin empresas, así que R26 se cumple sin caso que ordenar.
  - **Guardia de cobertura** (en `e2e-sin-saltos`, D7): todo `e2e/*.spec.ts` cae en exactamente un
    proyecto.
- **Reintentos:** `retries: process.env.CI ? 1 : 0` y `failOnFlakyTests: !!process.env.CI` (R24).
  El reintento sirve para tener la traza (`trace: "on-first-retry"`). Un caso que solo pasa al
  reintentar deja el grupo en rojo.
- **`workers: 1` por grupo:**
  - el superadmin es único por base (`conCandadoDelSuperadmin` se queda para la corrida local con
    varios workers);
  - los crons (`corte-diario`, `liberar-reprogramadas`, `procesar-devueltas-sla`) recorren todas las
    empresas de la base. Con un solo worker, un archivo termina antes de que empiece el siguiente,
    así que el cron de un spec solo toca usuarios de specs ya terminados.
- **Reporter:** `list` en CI, más `html` con `open: "never"`. El `html` por defecto se queda
  sirviendo al fallar, como se vio en SL-32.

## D4 — Fixtures (R7–R12)

**`tests/fabricas/e2e.ts`**, el nombre que fijó SL-31. Sin `.test`, para que lo importen los E2E y
SL-43:

```ts
export function abrirBaseE2E(): PrismaClient;       // R11, R12: sin DATABASE_URL lanza; host ≠ localhost/127.0.0.1 lanza
export interface EmpresaE2E { organizacionId: string; maestro: UsuarioE2E; slug: string }
export interface UsuarioE2E { id: string; email: string; password: string; nombre: string }
export async function crearEmpresaE2E(etiqueta: string): Promise<EmpresaE2E>;   // OrganizacionService.altaEmpresa en comoPlataforma
export async function crearUsuarioE2E(e: EmpresaE2E, rol: RolValue, extra?: { zonaId?: string; tiendaId?: string }): Promise<UsuarioE2E>;
export async function confiarDispositivo(u: UsuarioE2E, userAgent: string): Promise<void>; // técnica de prepararAcceso
export async function sesionDe(browser: Browser, u: UsuarioE2E): Promise<Cookie[]>;      // /login real, espera salir de /login
```

- **Usuarios:**
  - se crean por el servicio de alta de usuarios de la empresa (`UsuarioService`), con correo
    `e2e-<rol>-<sufijo>@example.test` (R10);
  - la contraseña la fija `hashPassword`, el hasher del login, y el dispositivo queda confiado: entra
    sin OTP;
  - el OTP solo se ejerce donde es lo que se prueba: el caso OTP de `auth`, el superadmin y los
    maestros del humo.
- **Escenarios por dominio**, en `e2e/_escenarios/`, uno por familia. Cada uno devuelve los ids y
  las cifras que el spec afirma:
  - `reparto.ts`: zona central y satélite (`ZonaService`), tarifa (`TarifaService`) y orden
    (`OrdenService`). La lleva hasta el estado que pide el spec por `RecepcionSateliteService`,
    `AsignacionSateliteService`, `RecepcionBodegaCentralService` y `MisAsignacionesService`
    (recoger y gestionar, con la evidencia contra el doble de D2);
  - `cierres.ts`: el cierre del mensajero por `CierreDiaService`, la decisión por
    `CierresAdminService`, y la bodega por `CierresBodegaAdminService`;
  - `crons.ts`: `GET /api/cron/<nombre>` con `Authorization: Bearer $CRON_SECRET` contra el servidor
    del E2E, para `corte-diario`, `liberar-reprogramadas` y `procesar-devueltas-sla`. Es la vía real.
  - El escenario fija el estado que quiere dar por vencido (por ejemplo, la fecha de la gestión de
    ayer) solo por el servicio, si lo admite. Si no lo admite, entra como excepción en la tabla de
    abajo.
- **Si un servicio exige un actor**, la fixture construye el mismo contexto que la action:
  `autenticar` con el usuario creado y la empresa fijada. Así lo hacen hoy los tests de integración
  de `tests/fabricas/`.
- **Excepciones de R8** (la fixture escribe la fila con `fijarEmpresa`). Cada una lleva su motivo, y
  T3 la confirma o la quita:

  | Dónde | Qué escribe a mano | Motivo |
  |---|---|---|
  | `_dos-empresas-fixture.ts > sembrarDatos` (humo) | API key, webhook, plantilla y movimiento manual con marcadores | Son marcadores de texto para buscar fugas; la pantalla que los crea no es lo que prueba el humo. T3 mira si `ApiKeyService`/`PlantillaService` sirven sin coste y, si sirven, se usan. |
  | `_wallet-iva-sl39-siembra.ts` (SL-39) | Filas de caja del ejemplo de design §1 de SL-39 | Las cifras del contrato son las de ese ejemplo. Producirlas aprobando cierres reales cambiaría el número que el spec afirma. |
  | `crons.ts` | La fecha de una gestión en el pasado (para `corte-diario`) | Sin reloj falso, un cron no ve nada vencido el mismo día. Solo la fecha; el resto, por servicio. **T3.2 (2026-10-24):** la mitad de la REPROGRAMACIÓN se quita: la fecha «ya llegada» la produce `CorreccionFechaReprogramacionService` (fecha = hoy, con el liberador por defecto del servicio) y la libera el cron real. La de la gestión la confirma o la quita el grupo `dinero`. **T6 (2026-10-24): se QUITA también la de la gestión:** `corte-diario` toma toda gestión sin cierre sin mirar su fecha (rama (a) de `CorteDiarioRepository.findMensajerosConActividadSinCierre`), así que el `vencido` sale del cron real con la gestión de hoy. |
  | `cierres.ts > anclarDevolucionHaceDias` (T6.1, `cierres-admin-rechazos-sla`) | La fecha (`created_at`) de la fila `anclaje_devolucion` del historial de una orden en `novedad`, 6 días atrás | El plazo de 5 días de una devolución `wrong_*` corre desde la aprobación del cierre y ningún servicio lo fija; sin reloj falso el cron `procesar-devueltas-sla` no la ve vencida. La vía del tope de intentos no sirve: con el tope la gestión `novedad` ya no se admite (feature 276). Solo esa fecha; la gestión, la aprobación y el escalado son del servicio y del cron reales. |

- **Re-ejecutable (R27):** cada corrida crea empresa y usuarios nuevos con sufijo aleatorio, y nada
  se busca por nombre fijo ni por recuento total. Nada se borra al terminar (A1). `superadmin-empresas`
  perdió en T7 su borrado del `afterAll` y su exigencia del vacío, con el motivo en D3; su listado
  se comprueba por los slugs que mandó esa corrida.
- **Lo que se retira de las fixtures:** `correoDelMaestro`, `liberarCorreos`, `solicitarRecuperacion`
  (SMTP), la lectura de `SL17_HUMO_*` y el `test.skip` de `SL39_UI`.

## D5 — Inventario spec por spec (R18, R19)

«Por qué falla» sale de leer el código en `dev` (`dc95473`). El error exacto del run 40020120423 lo
captura T1.1 en `progress/impl_SL-44.md`. Si contradice esta tabla, se corrige la tabla.

| Spec | Qué cubre | Por qué falla hoy | Decisión |
|---|---|---|---|
| `auth` | Login, error genérico, validación, cuenta bloqueada, logout, OTP, teclado y a11y | Usuarios fijos inexistentes; espera `/` tras el login (la app va a `/dashboard`); OTP con código inventado | **Se arregla.** Usuario por fixture; bloqueo provocado con N intentos fallidos por la UI; OTP real del log (R15). |
| `home` | Que `/` tenga título `/Next/` | La plantilla de create-next-app: el título es el de la marca | **Se retira.** La landing la cubren `marca` (dos anchos, barra, héroe y pie) y `rastreo-publico` (la carga sin sesión). No es un flujo crítico. |
| `marca` | Landing, login y dashboard: color, fuente, logos, 360 px | Crea un `admin` sin `organizacion_id`, anterior a SL-17 | **Se arregla.** El `maestro` de una `crearEmpresaE2E`. |
| `analitica-roles` | El recorte de `/analitica` por rol | Usuarios fijos; `waitForURL("/")` | **Se arregla.** Una empresa con maestro, adminTienda (con tienda), adminSatelite (con zona) y mensajero. |
| `asignacion-satelite` | adminSatelite asigna un lote recibido a un mensajero de su zona | Usuarios y orden fijos | **Se arregla.** `reparto.ts`: orden en `en_bodega_satelite` y mensajero de la zona. |
| `recepcion-satelite` | Recepción por código (teclado) | Ídem; `ORDEN_ID` inventado | **Se arregla.** Orden en `en_ruta_bodega_satelite`; se teclea su id real. |
| `mis-asignaciones` | Recoger, gestionar (entregada, rechazo, reprogramada, pago mixto) y totales del cierre | Usuarios fijos; la UI cambió (sin «Recoger» por fila, panel en línea en vez de modal, botones en vez de select, según su cabecera); sin bucket ni `evidencia.jpg` | **Se arregla:** se reescribe contra la UI actual, con la evidencia contra el doble de D2. |
| `cierre-dia` | El mensajero solicita el cierre, y deshace una gestión | Usuarios fijos; totales y remisión fijos | **Se arregla.** Gestiones por `MisAsignacionesService`; las cifras, las de lo creado. |
| `cierre-vencido-modelo` | Bloqueo total con `vencido`, solicitarlo, aprobarlo y desbloqueo | Usuarios fijos | **Se arregla.** Vencido por el cron `corte-diario`, con la fecha de la gestión en el pasado (excepción de D4). |
| `cierres-admin` | Aprobar o rechazar un cierre, con detalle y evidencia | Usuarios fijos; cierre sembrado inexistente | **Se arregla.** Cierre solicitado por `CierreDiaService`, con una rechazada con evidencia. |
| `cierres-admin-rechazos-sla` | Subtotales SLA y manual del ingreso por rechazos | Ídem; importes fijos | **Se arregla.** Rechazo SLA por el cron `procesar-devueltas-sla` y rechazo manual por gestión. |
| `cierre-bodega-satelite` | Cierre de bodega satélite: solicitar, aprobar y rechazar | Ídem | **Se arregla.** Cierres aprobados de la zona por servicio. |
| `reglas-bloqueos-cierre` | Vencido, bloqueo del mensajero y del satélite, válvula y desbloqueo | Ídem | **Se arregla.** Como `cierre-vencido-modelo`, más una orden recibida en la zona. |
| `devolucion-origen` | Devolver a la tienda una orden rechazada, y verlo en el historial | Usuarios y orden fijos | **Se arregla.** Orden rechazada por gestión. |
| `historial-orden` | Línea de tiempo y el lado deny | Ídem | **Se arregla.** Creación, reprogramación por gestión y liberación por el cron; otra tienda para el deny. |
| `reintentos-escalado` | Tres devoluciones escalan a rechazada; «Intento 3 de 3» | Ídem; la UI de gestión cambió | **Se arregla.** Devoluciones 1 y 2 por la UI o por servicio (las decide T6); la 3.ª por la UI. |
| `reprogramacion-liberacion` | Bloqueo de la reprogramada; el cron la libera; «Liberadas hoy» | Ídem; sin `CRON_SECRET` en CI | **Se arregla.** `CRON_SECRET` efímero (R23); A con fecha futura y B con fecha vencida. |
| `wallet` | Caja del maestro, filtro, ajuste manual y bloqueo de otro rol | Usuarios fijos; balance fijo | **Se arregla.** Movimientos por aprobación de cierre (servicio); el balance, el de lo creado. |
| `mi-wallet` | Saldo de la tienda, desglose y bloqueo | Ídem | **Se arregla.** Ídem, con la tienda del cierre aprobado. |
| `wallet-mensajeros` | Cuentas por pagar a mensajeros, desglose y bloqueo | Ídem | **Se arregla.** Ídem. |
| `rastreo-publico` | Consulta sin sesión; el mismo texto en los dos rechazos | Guía y factor fijos (`1001`/`8899`) o por `E2E_RASTREO_*` | **Se arregla.** Orden creada por servicio, con historial; guía y factor, los suyos. |
| `dos-empresas-humo` | Aislamiento de dos empresas en todo el menú del maestro | Sin `SL17_HUMO_LOG_SERVIDOR`, buzones ni SMTP en CI | **Se arregla** con D16: alta por la pantalla, OTP del log y sin SMTP (R16, R17). |
| `superadmin-arranque` | El comando de arranque, el login con OTP y el menú «Empresas» | Sin log del servidor | **Se arregla:** solo cambia el montaje (D3). |
| `superadmin-empresas` | Alta de A y B por la pantalla, sus errores y el acceso de los maestros | Ídem | **Se arregla:** cambia el montaje; va en `plataforma-vacia`. En T7 deja de afirmar el vacío (D3). |
| `zona-especial-dos-empresas` | La marca de zona especial por empresa | No debería fallar por datos (no lee log ni SMTP); no estaba en el run de 24 | **Se mantiene.** T1.1 lo confirma en CI. |
| `wallet-iva-aparte-sl39` | El IVA aparte en `/wallet` y en el cierre, con dos empresas | `test.skip` sin `SL39_UI=1` | **Se arregla:** fuera el skip (R13). |

**Resumen:** 26 specs. **25 quedan:**
- 20 heredados se reescriben con fixtures;
- el humo se rehace (D16);
- SL-39 pierde su skip;
- los 2 del superadmin solo cambian de montaje;
- `zona-especial` se mantiene.

**1 se retira:** `home`. Todos los flujos críticos de
`docs/checkpoints-proyecto.md` conservan su spec (R19).

## D6 — Montaje en CI (R20–R25, R28)

`.github/workflows/gate.yml`:

- **Disparo:** el `if` del job deja de exigir `base_ref == 'prod'`. Queda
  `workflow_dispatch || pull_request.draft == false`, igual que `gate-completo`. `on.pull_request`
  ya cubre `dev` y `prod`.
- **`e2e-grupo`**, con matriz `grupo: [aislamiento, reparto, dinero]` y `fail-fast: false`.
  `aislamiento` arrastra `plataforma-vacia` por `dependencies`. Cada grupo:
  - lleva su propio servicio `postgres:17` (R21);
  - pasos actuales: checkout, pnpm, Node 24, `pnpm install --frozen-lockfile`, `prisma generate` y
    `next typegen`;
  - «Credenciales efímeras»: `SESSION_SECRET` y ahora también `CRON_SECRET`, cada uno con
    `::add-mask::` antes de ir a `$GITHUB_ENV` (R23). `E2E_LOG_SERVIDOR=$RUNNER_TEMP/servidor-e2e.log`;
  - «Base del grupo (migrada + catálogos)», con `set -euo pipefail`: `migrate deploy` y `db:seed`
    (R21);
  - «Build de la app»: `pnpm exec next build`. No `pnpm build`, que migraría con su script;
  - caché de navegadores (sin cambios);
  - «Playwright»: `pnpm exec playwright test --project=${{ matrix.grupo }}`;
  - si falla: artefacto `e2e-<grupo>` con `test-results/`, `playwright-report/` y el log del
    servidor (R25). Todo es dato de prueba efímero: correos `@example.test`, contraseñas generadas.
    El repo es público, así que no hay que subir nada más.
- **`timeout-minutes: 30`** por grupo (R28).
- **`e2e`** (el check que se mira): `needs: [e2e-grupo]`, `if: always() && (…mismo if…)`.
  - Sale en verde solo con `needs.e2e-grupo.result == 'success'`. Cualquier otro resultado da rojo
    con un mensaje que lo nombra (R22), como hace `gate-completo` con los shards.
  - Es el check que la convención de merge exige junto a `gate-completo`.
- **Comentario de cabecera** del workflow: «PR hacia `dev` → gate-completo + e2e».

**Para verlo verde antes del PR a `prod`:**
- desde esta ficha, el PR de SL-44 a `dev` ya corre el E2E;
- antes de abrir ese PR (o con el PR en borrador), `gh workflow run gate.yml --ref
  feature/SL-44-e2e-verde-ci`.

## D7 — Guardias (R13, R19, R9)

`tests/unit/guards/e2e-sin-saltos.guardia.test.ts`, con fixtures por desenlace:

- **R13:** ningún `e2e/**/*.ts` contiene `test.skip`, `test.fixme`, `.describe.skip`,
  `.describe.fixme`, `test.only` ni `.describe.only`. Tampoco con argumentos condicionales.
- **R9:** ninguno contiene `correct-password`, ni un correo literal `@example.com`, ni
  `E2E_RASTREO_`, `SL17_HUMO_` o `SL39_UI`.
  - Los correos de fixture son `@example.test` generados (R10), como ya hacen las fixtures de
    SL-17, SL-32 y SL-38.
  - Esto sustituye, para el E2E, el `@example.com` de la decisión de fábricas de SL-31.
- **D3:** cada `e2e/*.spec.ts` está en exactamente un proyecto de `playwright.config.ts`. Se lee el
  config como texto, por los `testMatch`.
- **R19:** cada nombre entre backticks de `docs/checkpoints-proyecto.md > Flujos críticos` resuelve
  a un archivo de `e2e/`, y los que llevan `*`, a al menos uno.

Ya hay guardias que barren `e2e/` (`sin-nombre-heredado`, `test-citado-desaparecido` y otras). Al
retirar `home.spec.ts` y renombrar variables hay que correrlas todas.

## D8 — Tiempo estimado

Es una estimación, no una medida. La mide T8.2 y se anota en `progress/impl_SL-44.md`.

| Tramo, por grupo | Estimado |
|---|---|
| Install + generate + typegen | 2 min |
| Migrate + seed | 1 min |
| `next build` (2 vCPU) | 4–6 min |
| Navegadores (con caché) | 0,5 min |
| `aislamiento` + `plataforma-vacia` (humo: ~25 rutas × 2 maestros, más 6 specs) | 8–10 min |
| `reparto` (7 specs con escenarios por servicio) | 6–9 min |
| `dinero` (9 specs, cadenas de cierre) | 8–11 min |

- Reloj del PR: **~17–20 min**, con los tres grupos en paralelo.
- Facturado: ~50 min por corrida (repo público, sin coste).
- Si un grupo pasa de 25 min, se parte otra vez. El config ya admite un proyecto más sin tocar el
  resto.

## Alternativas descartadas

1. **Storage con un almacén local en `lib/`**: una fábrica `crearFileStorage(bucket)` y un
   `LocalDiskFileStorage` activado por variable.
   - Toca unas 25 composition roots de producción. «El composition root que no inyecta» ya dejó dos
     notificadores muertos con la suite verde.
   - Mete en el bundle de producción un almacén que solo debe existir en pruebas.
   - El doble HTTP da lo mismo sin tocar `lib/`.
2. **Storage con Supabase local** (`supabase start` en el job).
   - Requiere la CLI de Supabase, que sería una dependencia nueva con sus cuatro checks, y ~6
     contenedores.
   - Suma minutos a cada grupo y lo levanta entero para usar solo Storage.
3. **OTP por un buzón de pruebas** (Mailpit en un contenedor + SMTP real de la app).
   - Prueba también el transporte SMTP, pero añade un servicio y una imagen.
   - Los E2E de SL-32 ya leen la línea de consola, con su mutación probada.
   - El envío real por SMTP lo verificó SL-32 a mano y sigue siendo una prueba de QA, no de CI.
4. **Leer el OTP de la base**: no se puede, porque el reto se guarda con hash.
5. **Un solo job sin grupos**: unos 25–30 min de reloj y una sola base compartida por specs que se
   estorban (el vacío del superadmin). Los grupos con base propia los pidió Carlos (P3).
6. **Borrar los datos al terminar cada spec** (R19 de SL-31).
   - Con cierres, caja e historial, el orden de borrado por FK `RESTRICT` es largo y frágil, y un
     fallo del borrado tapa el fallo del test.
   - En CI la base muere con el job, y en local la base es desechable (`docs/verification.md`).
   - Se sustituye por datos únicos por corrida y dos corridas seguidas en verde (R27). Queda abierto
     (A1).
7. **`retries: 2` como hoy**: un caso inestable sale verde y nadie lo ve. Contradice «verde de
   verdad». Se cambia por un reintento con `failOnFlakyTests`.

## Dependencias

Ninguna nueva. El doble de Storage y el lanzador de la app son Node puro.
