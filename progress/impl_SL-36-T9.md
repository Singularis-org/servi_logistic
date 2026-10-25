# SL-36 · T9.1 (E2E `integraciones-por-empresa`) — bitácora de frontend_dev

> Sin commit (lo hace el leader). MCP del grafo no consultado: todo se leyó con Read/Grep (specs,
> config de Playwright, fixtures E2E y la pantalla de T7.2).

## Archivos

Creados:
- `e2e/integraciones-por-empresa.spec.ts` — 4 casos en serie sobre dos empresas de la fábrica
  (`crearEmpresaE2E`, `crearUsuarioE2E`, `sesionDe`) y el superadmin de prueba
  (`asegurarSuperadmin` + `entrarConOtp` con el OTP del log, bajo `conCandadoDelSuperadmin`).

Modificados:
- `playwright.config.ts` — el spec entra en el proyecto `aislamiento` (y solo en él).

## Mapa R<n> → caso del E2E

| R | Caso |
|---|---|
| R13 | «alta rechazada: texto del catálogo, ninguna fila…» (texto literal escrito a mano; `integracion.count` de A = 0) |
| R36 | ídem (tras el rechazo, secretos vacíos y `type=password`; Phone Number ID conservado) |
| R12 | «alta buena: conectada…» (tarjeta «Conectada» con el nombre visible; 1 fila de A) |
| R18 | ídem (token leído del diálogo; tras recargar, `page.content()` no lo contiene; control: el HTML recargado SÍ trae la integración, y tampoco trae el token de acceso ni el App Secret) |
| R6 | «el admin de A, el maestro de B y el superadmin no ven…» (sin nombre/número/WABA/token de A en el HTML; admin y superadmin ven «No tienes permiso…», sin formulario ni enlace en el menú; B ve su WhatsApp «Sin configurar» y 0 filas) |
| R31, R32 | «probar y desconectar…» («La conexión funciona.»; el diálogo muestra «Requerido» y el «qué deja de funcionar» literal antes de confirmar, la fila sigue; tras confirmar, «Sin configurar» y 0 filas) |

## Corridas (base desechable `servi_logistic_sl36_e2e` en localhost)

Preparación: DROP/CREATE de la base (`prisma db execute` contra `postgres`; `prisma migrate reset`
lo bloquea el guard de Prisma para agentes), `pnpm exec prisma migrate deploy`, `pnpm run db:seed`,
`NODE_OPTIONS=--max-old-space-size=8192 pnpm exec next build` (exit 0). Puertos 3044 y 54329 libres.

Comando, dos veces seguidas sobre la misma base (recreada solo antes de la primera):
`E2E_PUERTO=3044 pnpm exec playwright test e2e/integraciones-por-empresa.spec.ts --project=aislamiento --no-deps --reporter=list`

Chromium (`Desktop Chrome`, único navegador de la config), corrida 1:
```
Running 4 tests using 1 worker
  ok 1 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:127:5 › alta rechazada: texto del catálogo, ninguna fila y solo lo no secreto se conserva (R13, R36) (899ms)
  ok 2 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:150:5 › alta buena: conectada, el token se ve una vez y al recargar no está en el HTML (R12, R18) (859ms)
[integraciones] superadmin en /configuracion/integraciones termina en /configuracion/integraciones
  ok 3 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:190:5 › el admin de A, el maestro de B y el superadmin no ven la integración de A ni su formulario (R6) (4.3s)
  ok 4 [aislamiento] › e2e\integraciones-por-empresa.spec.ts:243:5 › probar y desconectar: el aviso de qué deja de funcionar va antes y la fila se borra (R31, R32) (748ms)
  4 passed (13.4s)
PW_EXIT=0
```
Corrida 2:
```
Running 4 tests using 1 worker
  ok 1 [aislamiento] › ... (R13, R36) (854ms)
  ok 2 [aislamiento] › ... (R12, R18) (898ms)
  ok 3 [aislamiento] › ... (R6) (4.3s)
  ok 4 [aislamiento] › ... (R31, R32) (753ms)
  4 passed (13.3s)
PW_EXIT=0
```
0 failed, 0 skipped, 0 flaky en las dos.

## Otros comandos

- `pnpm exec vitest run tests/unit/guards/e2e-sin-saltos.guardia.test.ts`: `Test Files 1 passed (1) · Tests 30 passed (30)`.
- `pnpm run lint`: exit 0 (`0 errors, 231 warnings`); `eslint` sobre los dos archivos tocados: «No issues found».
- `pnpm run typecheck`: exit 0.
- LF: 0 `\r` en los dos archivos. Sin procesos vivos en 3044/54329 al terminar; no hay `.next/dev`.

## Desviaciones

1. **No hay segundo navegador en el proyecto.** `playwright.config.ts` solo define `Desktop Chrome`
   en los cinco proyectos. «Hecho cuando: pasa en Chromium y en el segundo navegador» no se puede
   cumplir sin añadir un navegador a la config (decisión de CI, no de esta task): queda abierto.
2. **`--no-deps`.** `aislamiento` depende de `plataforma-vacia`, y el filtro de archivo no se aplica a
   las dependencias: sin `--no-deps` corre también `superadmin-empresas.spec.ts`, que en local cae
   porque el entorno no trae `NEXT_PUBLIC_APP_URL` (espera «El correo no está configurado…»). Ajeno a
   SL-36. Este spec no depende de `plataforma-vacia`: el superadmin lo asegura él mismo.
3. **Flujo crítico sin listar.** tasks.md llama a este spec «flujo crítico E2E», pero
   `docs/checkpoints-proyecto.md > Flujos críticos` no lo nombra; no lo toqué (docs del perfil).

## Bugs de la app

Ninguno. Dos ajustes del test, no de la app: los campos se buscan por rol (la etiqueta lleva un `*`
de obligatorio fuera del nombre accesible) y la tarjeta se mira después de cerrar el diálogo del
token (mientras está abierto, el fondo es inerte, como debe).

## Veredicto

T9.1 hecho en Chromium (proyecto `aislamiento`): 4/4 dos corridas seguidas; el segundo navegador queda abierto porque la config no lo define.
