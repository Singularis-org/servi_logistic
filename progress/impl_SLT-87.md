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
