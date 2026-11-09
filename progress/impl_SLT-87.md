# SLT-87 «Reporte de bugs: botón flotante y envío» · bitácora del implementer

## Tanda backend (T1–T6)

Hecha por `backend_dev` el 2026-11-09 en `.worktrees/SLT-87-reporte-de-bugs`, contra la base propia
`servi_logistic_slt87` (local). Un commit por tarea, sin push.

### Archivos

**Creados**
- `db/migrations/20261110120000_bug_report/migration.sql` y `down.sql` (T1)
- `lib/config/reporte-bug.ts` y `lib/types/reporte-bug.ts` (T3)
- `lib/services/email/plantillas/reporte-bug.ts` (T4)
- `lib/interfaces/repositories/IBugReportRepository.ts`, `lib/interfaces/services/IReporteBugService.ts`,
  `lib/repositories/BugReportRepository.ts` y `lib/services/ReporteBugService.ts` (T5)
- `lib/actions/reporte-bug.ts` (T6)
- Tests: `tests/unit/config/reporte-bug-config.test.ts`, `tests/unit/services/email/plantilla-reporte-bug.test.ts`,
  `tests/unit/services/reporte-bug-service.test.ts`, `tests/integration/db/bug-report.test.ts` y
  `tests/unit/actions/reporte-bug-action.test.ts`

**Modificados**
- `db/schema.prisma`: modelo `BugReport` y los inversos `bugReports` en `Usuario` y `Organizacion` (T1)
- `lib/db/modelos-de-negocio.ts`: `BugReport` en `MODELOS_DE_PLATAFORMA` (T2)
- `docs/architecture.md > Multi-empresa`: el párrafo «Reportes de problemas» de design §10 (parte de T9;
  va en el commit de T2)
- `lib/db/excepciones-aislamiento.ts`: `BugReportRepository.ts` con la ficha `"SL-17"` (es de T2, pero va
  en el commit de T5: `plataforma-solo-en-lista` exige que el archivo exista)
- `.env.example`: `BUG_REPORT_EMAILS=` con el texto de design §9 (T3)
- `lib/modulos/reparto.ts`: `"reporte-bug": "nucleo"` (T6)
- `tests/fixtures/api-key-dependencias-usuario.ts`: la relación nueva `BugReport.reporter` clasificada como
  `no_alcanzable` (la pidió `api-key-dependencias-usuario.guardia`; va en el commit de T6)
- `specs/SLT-87-reporte-de-bugs/tasks.md`: T1–T6 en `[x]`

### Mapa R → test (lo de backend)

| R | Test |
|---|---|
| R11 | `tests/unit/actions/reporte-bug-action.test.ts` «R11 — sin sesión responde unauthenticated sin llamar al servicio» y «R11 — el forbidden del servicio llega tal cual»; `tests/unit/services/reporte-bug-service.test.ts` «R11 — el superadmin, un actor sin empresa y un usuario que el repositorio no encuentra en su empresa dan forbidden sin guardar ni enviar correo»; `tests/integration/db/bug-report.test.ts` «R11/R13 — con un usuario de otra empresa devuelve null y no escribe» |
| R12 | `tests/unit/actions/reporte-bug-action.test.ts` «R12 — descripción vacía tras recortar, de 501 caracteres (y 500 pasa), página con query o con fragmento y campos de más (`organizacionId`, `rol`) dan validation_error sin llamar al servicio»; `tests/integration/db/bug-report.test.ts` «R12 — el CHECK rechaza una descripción de 501 caracteres y una página con `?`» |
| R13 | `tests/integration/db/bug-report.test.ts` «R13 — crear guarda la empresa, el usuario, el rol y el nombre del actor, la ruta sin query, el agente y la ventana», «R13 — crear devuelve lo que pinta el correo…» y «R11/R13 — con un usuario de otra empresa devuelve null y no escribe»; `tests/unit/actions/reporte-bug-action.test.ts` «R13 — el agente de usuario sale de la cabecera»; `tests/unit/services/reporte-bug-service.test.ts` «R13 — guarda la empresa, el usuario y el rol del actor, la ruta, el agente recortado a 512 y la ventana». La parte E2E de R13 es de T9. |
| R14 | `tests/integration/db/bug-report.test.ts` «R14 — con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report dan 42501, aun con una fila de su propia empresa», su control del dueño, «R14 — la empresa tampoco lee por el modelo…» y «R14 — crear funciona también llamado dentro del contexto de una empresa» |
| R15 | `tests/unit/services/reporte-bug-service.test.ts` «R15 — manda un correo por destinatario y a nadie más, después de guardar»; `tests/unit/services/email/plantilla-reporte-bug.test.ts` «lleva la descripción y cada dato del contexto, en HTML y en texto» |
| R16 | `tests/unit/config/reporte-bug-config.test.ts` «vacía, ausente o sin direcciones válidas da []; recorta, filtra y quita duplicados»; `tests/unit/services/reporte-bug-service.test.ts` «R16 — sin destinatarios guarda y responde enviado sin llamar al emisor» |
| R17 | `tests/unit/services/reporte-bug-service.test.ts` «R17 — si un envío falla, los demás salen, el reporte queda guardado, la respuesta es enviado y el fallo se registra sin reintento» y «R17 — si fallan todos…» |
| R18 | `tests/unit/services/email/plantilla-reporte-bug.test.ts` «escapa `<script>` en la descripción, el nombre, la página y el navegador» |
| R19 | `tests/integration/db/bug-report.test.ts` «R19 — la fila nace con created_at y updated_at y deleted_at nulo; las columnas están en inglés» |
| R20 | `tests/unit/config/reporte-bug-config.test.ts` «.env.example documenta BUG_REPORT_EMAILS vacía» |

Además cubren el lado servidor de R9 («la respuesta buena es solo «enviado»») y R10 («si guardar falla
responde error y el log lleva solo el nombre de la causa») en `tests/unit/actions/reporte-bug-action.test.ts`.

### Salida real

**Ida y vuelta de la migración** sobre `servi_logistic_slt87`:
1. `pnpm exec prisma migrate deploy` → «The following migration(s) have been applied: 20261110120000_bug_report
   … All migrations have been successfully applied.»
2. `pnpm run db:rollback` → «Aplicando rollback: 20261110120000_bug_report … Rollback completado:
   20261110120000_bug_report».
3. Comprobación (consulta con `pg`): `to_regclass('public.bug_report') is null` = `true`; filas de
   `20261110120000%` en `_prisma_migrations` = `0`.
4. `pnpm exec prisma migrate deploy` de nuevo → «All migrations have been successfully applied.» Después:
   tabla presente, `relrowsecurity = true`, `has_table_privilege('servi_app', …, 'SELECT'|'INSERT')` =
   `false`, `0` políticas. `prisma migrate diff` base → esquema: «This is an empty migration.» (sin
   drift). La base queda CON la migración aplicada.

**Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `tsc --noEmit`, exit 0, tras
T1 (3 min 32 s) y al final, con todo T1–T6.

**ESLint** (`pnpm exec eslint` sobre los 17 `.ts` tocados): exit 0, sin avisos.

**Vitest** (los archivos de la tanda y las guardias que nombran T2 y T6; con `DATABASE_URL` de slt87):

```
tests/integration/db/bug-report.test.ts {"passed":9}
tests/unit/actions/reporte-bug-action.test.ts {"passed":8}
tests/unit/analytics/rollup-guards.test.ts {"passed":21}
tests/unit/config/reporte-bug-config.test.ts {"passed":6}
tests/unit/guards/api-key-dependencias-usuario.guardia.test.ts {"passed":12}
tests/unit/guards/modulos-reparto.guardia.test.ts {"passed":41}
tests/unit/guards/organizacion-en-modelos.guardia.test.ts {"passed":13}
tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts {"passed":7}
tests/unit/guards/rls-por-empresa.guardia.test.ts {"passed":21}
tests/unit/services/reporte-bug-service.test.ts {"passed":8}
tests/unit/services/email/plantilla-reporte-bug.test.ts {"passed":6}
total passed 152 skipped 0 failed 0
```

`bug-report.test.ts` corrió contra Postgres: 9 passed, 0 skipped.

**Guardias** (`pnpm run test:guardias`, al final): `Test Files 2 failed | 340 passed (342)`,
`Tests 5 failed | 4806 passed | 1 skipped (4812)`.
- `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`: está en `tests/baseline-rojos.json`.
- `tests/unit/guards/superficie-de-uso.guardia.test.ts`: NO está en el baseline. Su única entrada es
  `lib/actions/reporte-bug.ts:55 enviarReporteBugAction`: la action aún no la importa ninguna pantalla.
  Se pone verde con T8, cuando `ReporteBugBoton` se monta en `app/(app)/layout.tsx`. No se anotó
  `@sin-superficie` porque el motivo sería falso.

En la primera corrida salieron también `api-key-dependencias-usuario` (la relación nueva hacia `Usuario`
sin clasificar) y `rollup-guards` (el literal `20000` de `VENTANA_LADO_MAX` coincide con el umbral de
R47). Las dos se arreglaron en el commit de T6.

### Propuestas (decisiones que el spec no cubría)

- `VENTANA_LADO_MAX = 20 * 1000` en `lib/types/reporte-bug.ts`, con un comentario: el literal `20000`
  choca con `rollup-guards` (R47), que prohíbe copiar el umbral de volumen aunque sea otro dato. **(propuesta)**
- `BugReport.reporter` clasificada como `no_alcanzable` en el censo de la ficha 373: la única escritura
  es la action con sesión, y la cuenta de una API key no entra por el login. **(propuesta)**
- La descripción se parte en párrafos sin las líneas en blanco, para no dejar párrafos vacíos en el
  correo. El dispositivo muestra solo lo que llegó: la ventana, el modo, las dos cosas o «Sin datos». **(propuesta)**
- Sin índice propio para `reporter_user_id`: design §2.1 pide dos índices y se respetó. Borrar un
  usuario recorre la tabla por la FK CASCADE; si crece, el índice lo añade SLT-97. **(propuesta)**

**Veredicto:** T1–T6 hechas y verdes en lo suyo. Queda un rojo fuera del baseline, `superficie-de-uso`,
que cierra T8.

## Tanda frontend y E2E (T7–T9)

Hecha por `frontend_dev` el 2026-11-09 en `.worktrees/SLT-87-reporte-de-bugs`. Un commit por tarea, sin push.

### Archivos

**Creados**
- `hooks/useBorradorReporteBug.ts` (T7)
- `components/shared/ReporteBugBoton.tsx` y `tests/components/ReporteBugBoton.test.tsx` (T8)
- `e2e/reporte-de-bugs.spec.ts` (T9)

**Modificados**
- `app/(app)/layout.tsx`: `ReporteBugBoton` como hermano de `{children}`, junto a `AsistentePanel`, con la
  condición de design §8.1 (T8)
- `playwright.config.ts`: `reporte-de-bugs` en el proyecto `aislamiento` y
  `BUG_REPORT_EMAILS: "reportes-e2e@example.test"` en `webServer.env` (T9)
- `specs/SLT-87-reporte-de-bugs/tasks.md`: T7, T8 y T9 en `[x]`
- `progress/impl_SLT-87.md`: esta sección

### Mapa R → test (lo de interfaz y E2E)

| R | Test |
|---|---|
| R1 | `e2e/reporte-de-bugs.spec.ts` «el maestro ve el botón en dos pantallas del portal y el mensajero en un móvil en `/mis-asignaciones`» (`/dashboard` y `/ordenes`; el mensajero en un contexto `Pixel 7`) |
| R2 | `e2e/reporte-de-bugs.spec.ts` «el superadmin no ve el botón» (con `e2e/_superadmin-fixture.ts`; el título «Empresas» hace de anti-vacío) |
| R3 | `tests/components/ReporteBugBoton.test.tsx` «en `/mis-asignaciones` y sus subrutas se apila encima del chat; en el resto va en la esquina». El E2E de R1 comprueba además `data-posicion="sobre-chat"` en el móvil. |
| R4 | `tests/components/ReporteBugBoton.test.tsx` «abre un panel con descripción, Enviar y Descartar, sin campo de archivos» y «el contador muestra exactamente "0/500" vacío, "120/500" con 120 caracteres y "500/500" en el máximo, y el campo no admite el carácter 501» |
| R5 | `tests/components/ReporteBugBoton.test.tsx` «Enviar está deshabilitado con la descripción vacía o solo con espacios» |
| R6 | `tests/components/ReporteBugBoton.test.tsx` «el texto sobrevive a cerrar el panel y a montar de nuevo el componente» y «Escape y el botón de cerrar lo cierran sin tocar el borrador»; `e2e/reporte-de-bugs.spec.ts` «el borrador sobrevive a recargar la página» |
| R7 | `tests/components/ReporteBugBoton.test.tsx` «el borrador de un usuario no aparece con otro usuarioId» |
| R8 | `tests/components/ReporteBugBoton.test.tsx` «Descartar borra el borrador y no llama a la action»; `e2e/reporte-de-bugs.spec.ts` «Descartar borra el borrador, deja el panel vacío y no guarda ningún reporte» |
| R9 | `tests/components/ReporteBugBoton.test.tsx` «tras enviar muestra Gracias, vacía el panel y borra el borrador»; `e2e/reporte-de-bugs.spec.ts` «enviar muestra Gracias y tras recargar el panel está vacío» |
| R10 | `tests/components/ReporteBugBoton.test.tsx` «si la action responde error, avisa y conserva el texto» (con `error`, `forbidden`, `unauthenticated` y `validation_error`) y «si la llamada se cae (red), avisa igual y conserva el texto» |
| R13 (E2E) | `e2e/reporte-de-bugs.spec.ts` «la fila guardada lleva la empresa, el rol y la página sin query, aunque la URL del navegador tenga query». Lee como dueño la empresa, el usuario, el rol, `/ordenes` sin `?…#…`, el agente, la ventana y `is_standalone=false`. |
| R15 (E2E) | `e2e/reporte-de-bugs.spec.ts` «el log del servidor tiene el correo a reportes-e2e@example.test con la descripción». Hay una sola línea `[email][debug]` con la descripción, va `to=reportes-e2e@example.test` y ninguna va al maestro. |

Además: «sin localStorage el panel sigue funcionando en memoria» (design §8.3).

### Salida real

**Typecheck** (`NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`): `tsc --noEmit`, exit 0, tras T8 y
al final con T9.

**ESLint** (`pnpm exec eslint` sobre los 6 archivos tocados: el hook, el componente, el layout, el test, el
spec y `playwright.config.ts`): «No issues found», exit 0.

**Vitest** (`pnpm exec vitest run <archivos>`):

```
tests/components/ReporteBugBoton.test.tsx                   12 passed
tests/components/AppLayout.test.tsx                         23 passed
tests/unit/guards/superficie-de-uso.guardia.test.ts         18 passed   (en rojo antes de T8; verde al montar el botón)
tests/unit/guards/asistente-panel-hermano.guardia.test.ts   12 passed
tests/unit/guards/revision-sinpe-no-bloquea.guardia.test.ts  7 passed
tests/unit/guards/push-alta-punto-unico.guardia.test.ts     24 passed
tests/unit/guards/e2e-sin-saltos.guardia.test.ts            38 passed
Test Files  7 passed (7) · Tests  134 passed (134)
```

**Guardias** (`pnpm run test:guardias`, al final): `Test Files 1 failed | 341 passed (342)`,
`Tests 4 failed | 4807 passed | 1 skipped (4812)`. El único archivo en rojo es
`tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`.
`superficie-de-uso` ya está verde.

### E2E

**Preparación.**
- Base propia `servi_logistic_slt87_e2e`: DROP/CREATE con el script del leader, `prisma migrate deploy` y
  `pnpm run db:seed`.
- `next build` con `NODE_OPTIONS=--max-old-space-size=8192` y `NEXT_PUBLIC_APP_URL=http://localhost:3044`:
  2 min 48 s, exit 0.
- Los puertos 3044 y 54329 estaban libres antes de empezar.

**Entorno de las corridas,** además del `.env`:
- `DATABASE_URL` a la base e2e;
- `DIRECT_URL=""` y `PRISMA_LOG_QUERIES=""`;
- `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` y `SUPABASE_SERVICE_ROLE_KEY` al
  doble local (ver «Avisos»).

**Comando:** `CI=1 E2E_PUERTO=3044 pnpm exec playwright test e2e/reporte-de-bugs.spec.ts --project=aislamiento --reporter=list`.
Arrastra `plataforma-vacia` por `dependencies`.

**Corrida 1,** sobre la base recién recreada:
```
  ✓   1 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:54:5 › el comando de arranque deja un superadmin sin empresa y no imprime sus datos (R18)
  ✓   2 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:72:5 › entra con OTP y aterriza en «Empresas», … (R18, R6; SL-20 R21; …)
  ✓   3 [plataforma-vacia] › e2e\superadmin-arranque.spec.ts:90:5 › /configuracion no le deja entrar (R6, R5)
  ✓   4 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:207:5 › 1. «Empresas» abre con el formulario de alta y sin aviso (R29)
  ✓   5 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:215:5 › 2. crea A y B desde el formulario y las dos salen en el listado con su maestro (R30, R37, R29)
  ✓   6 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:255:5 › 3. repetir el slug de A marca su campo y no crea nada (R31)
  ✓   7 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:273:5 › 4. un slug inválido marca el campo sin crear nada (R34)
  ✓   8 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:323:7 › 5-6. el maestro de A crea su contraseña con el enlace de bienvenida, …
  ✓   9 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:323:7 › 5-6. el maestro de B crea su contraseña con «¿Olvidaste tu contraseña?», …
  ✓  10 [plataforma-vacia] › e2e\superadmin-empresas.spec.ts:349:5 › 7. con las dos contraseñas creadas, ni la fila de A ni la de B ofrecen «Reenviar bienvenida» (R38)
  ✓  11 [aislamiento] › e2e\reporte-de-bugs.spec.ts:139:7 › SLT-87 — quién ve el botón › el maestro ve el botón en dos pantallas del portal y el mensajero en un móvil en `/mis-asignaciones` (3.7s)
  ✓  12 [aislamiento] › e2e\reporte-de-bugs.spec.ts:166:7 › SLT-87 — quién ve el botón › el superadmin no ve el botón (6.9s)
  ✓  13 [aislamiento] › e2e\reporte-de-bugs.spec.ts:190:7 › SLT-87 — el borrador › el borrador sobrevive a recargar la página (1.3s)
  ✓  14 [aislamiento] › e2e\reporte-de-bugs.spec.ts:202:7 › SLT-87 — el borrador › Descartar borra el borrador, deja el panel vacío y no guarda ningún reporte (1.5s)
  ✓  15 [aislamiento] › e2e\reporte-de-bugs.spec.ts:228:7 › SLT-87 — el envío › enviar muestra Gracias y tras recargar el panel está vacío (1.6s)
  ✓  16 [aislamiento] › e2e\reporte-de-bugs.spec.ts:240:7 › SLT-87 — el envío › la fila guardada lleva la empresa, el rol y la página sin query, aunque la URL del navegador tenga query (1.7s)
  ✓  17 [aislamiento] › e2e\reporte-de-bugs.spec.ts:268:7 › SLT-87 — el envío › el log del servidor tiene el correo a reportes-e2e@example.test con la descripción (1.5s)
  17 passed (45.4s)
```

**Corrida 2,** justo después, sobre la misma base y sin recrearla. Sale la misma lista, con los 17 en `✓`
(se copian los de SLT-87):
```
  ✓  11 … el maestro ve el botón en dos pantallas del portal y el mensajero en un móvil en `/mis-asignaciones` (2.5s)
  ✓  12 … el superadmin no ve el botón (3.0s)
  ✓  13 … el borrador sobrevive a recargar la página (867ms)
  ✓  14 … Descartar borra el borrador, deja el panel vacío y no guarda ningún reporte (940ms)
  ✓  15 … enviar muestra Gracias y tras recargar el panel está vacío (928ms)
  ✓  16 … la fila guardada lleva la empresa, el rol y la página sin query, aunque la URL del navegador tenga query (1.1s)
  ✓  17 … el log del servidor tiene el correo a reportes-e2e@example.test con la descripción (1.2s)
  17 passed (47.0s)
```
Las dos corridas dan 0 failed, 0 skipped y 0 flaky: el log no tiene ninguna línea con `retry`, `flaky`,
`skipped` ni `failed`.

**Corrida previa, descartada.** Salió con `1 flaky` en `superadmin-arranque.spec.ts:54` (R18, «no imprime sus
datos»). La causa: el `.env` del worktree trae `PRISMA_LOG_QUERIES=params`, y con eso
`pnpm arranque:superadmin` imprime el email del superadmin en sus consultas. No viene del diff. Se puso
`PRISMA_LOG_QUERIES=""`, se recreó la base y se corrieron las dos de arriba.

**Grupo `aislamiento` entero** (`CI=1 E2E_PUERTO=3044 pnpm exec playwright test --project=aislamiento
--reporter=list`, sobre la misma base): `3 failed · 91 passed (8.0m)`.
- Los tres rojos son de la landing pública `/`, que está fuera del layout privado: el botón no se monta ahí.
- Los tres fallan igual: `page.goto("/")` no llega al evento `load` en 30 s. Son:
  - `e2e/marca.spec.ts:294` «landing a 1280 px: barra y héroe, y pie (claro)»;
  - `e2e/rastreo-publico.spec.ts:86` y `:115`.
- Corridos solos, sobre la misma base y el mismo build, pasan: `e2e/rastreo-publico.spec.ts` da
  `12 passed (27.9s)` y `e2e/marca.spec.ts`, `17 passed (33.1s)`.
- Conclusión: es carga de la máquina en la corrida larga, no el diff.
- `dos-empresas-humo` pasó dentro del grupo.

### Avisos

- **El `.env` del worktree apunta `SUPABASE_URL` y las `NEXT_PUBLIC_SUPABASE_*` a un proyecto prohibido.** Es
  uno de los que reconoce `BASES_PROHIBIDAS` de `e2e/_dos-empresas-fixture.ts`.
  - No se usó: en el build y en las corridas, las cuatro variables iban al doble local
    (`http://127.0.0.1:54329` y `clave-falsa-e2e`).
  - Un `grep` de la referencia de ese proyecto en `.next/static` y `.next/server` no encuentra nada.
  - Qué hacer con ese `.env` lo decide el leader.
- `./init.sh` y `node scripts/tamano-pr.mjs`, del «Hecho» de T9, los cierra el leader. Aquí no se corrieron.

### Propuestas (decisiones que el spec no cubría)

- **Lectura del borrador.** Se lee con `useSyncExternalStore` y no con `useState` + `useEffect`.
  - Design §8.3 pide no leer en el primer render, y un `setState` dentro de un efecto es error de lint en este
    repo (`react-hooks/set-state-in-effect`).
  - La instantánea del servidor es `""`. Es el mismo precedente que `hooks/usePreferenciaSonido.ts`.
  **(propuesta)**
- **Copia en memoria.** Solo guarda lo que no se pudo escribir en `localStorage`, y se lee antes que él. **(propuesta)**
- **Ventana.** Si `innerWidth` o `innerHeight` caen fuera de 1–20 000, la ventana no se manda. Así el reporte
  no se pierde por un `validation_error`. **(propuesta)**
- **Fallos.** Una caída de la llamada (red o servidor) cuenta como el estado `error` de R10, y `unauthenticated`
  da el mismo aviso que `forbidden` y `validation_error`. **(propuesta)**
- **Avisos del panel.** El de fallo se queda hasta el siguiente envío. El de «Gracias» se va al volver a escribir,
  como pide design §8.2. **(propuesta)**
- **Textos accesibles.** El campo lleva la etiqueta «Describe el problema» (`sr-only`), y el botón de cerrar, «Cerrar».
  §8.4 no da esos dos textos. **(propuesta)**
- **Posición del panel.** Va en `bottom-20` en la esquina y en `bottom-40` sobre el chat, para quedar encima del
  botón. **(propuesta)**
- **Datos del E2E.** Usa dos empresas. La del maestro no tiene zonas, para que «Confirmá el SINPE» no tape los
  clics; la del mensajero tiene la zona que exige su rol. **(propuesta)**

**Veredicto:** T7–T9 hechas. El E2E sale verde dos veces seguidas (0 failed, 0 skipped, 0 flaky) y las guardias
están verdes salvo el rojo del baseline. `./init.sh` y `tamano-pr` quedan para el leader.
