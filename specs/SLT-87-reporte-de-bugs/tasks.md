# SLT-87 — Reporte de bugs: botón flotante y envío · tasks.md

> Entrega 1 de 3. El exceso de líneas está aceptado (decisión Q1 del 2026-11-09); la línea
> `tamano-pr-aceptado` la deja el leader en `progress/features/SLT-87.md`. `[P]` = paralelizable con las demás `[P]` de su bloque una vez
> cumplidas sus dependencias. Reparto por capa: `backend_dev` en T1–T6; `frontend_dev` en T7–T8;
> T9 el que cierre.

## Bloque A — Datos

- [x] **T1. Modelo y migración** (R14, R19).
  - **Archivos:**
    - `BugReport` en `db/schema.prisma`, con los inversos en `Organizacion` y `Usuario`;
    - `db/migrations/20261110120000_bug_report/{migration,down}.sql`, con un timestamp posterior a
      la última migración de `dev` al crearla: tabla, `CHECK`, FK `CASCADE`, índices, RLS y
      `REVOKE ALL … FROM servi_app` (design §2).
  - **Hecho:** `prisma migrate deploy` y `pnpm run db:rollback` aplican y revierten sobre una base
    desechable, y `pnpm run typecheck` está verde.
- [x] **T2. Clasificación y excepción** (dep. T1).
  - **Archivos:** `BugReport` en `MODELOS_DE_PLATAFORMA` y `BugReportRepository.ts` en
    `EXCEPCIONES_DE_PLATAFORMA`, con la ficha `"SL-17"` y el motivo de design §2.3.
  - **Hecho:** `pnpm run test:guardias` verde (`organizacion-en-modelos`,
    `plataforma-solo-en-lista`, `rls-por-empresa`).

## Bloque B — Servidor

- [x] **T3 [P]. Configuración y tipos** (R12, R16, R20).
  - **Archivos:** `lib/config/reporte-bug.ts` (`DESCRIPCION_MAX`, `destinatariosReporteBug`),
    `lib/types/reporte-bug.ts` (zod `strict` de la entrada y los DTO) y `BUG_REPORT_EMAILS=` en
    `.env.example`.
  - **Hecho:** `tests/unit/config/reporte-bug-config.test.ts` verde.
- [x] **T4 [P]. Plantilla del correo** (R15, R18).
  - **Archivo:** `lib/services/email/plantillas/reporte-bug.ts` (design §7).
  - **Hecho:** `tests/unit/services/email/plantilla-reporte-bug.test.ts` verde.
- [x] **T5. Repositorio y servicio** (dep. T1, T2, T3, T4; R11, R13, R14, R15, R16, R17).
  - **Archivos:**
    - las interfaces `IBugReportRepository` e `IReporteBugService`;
    - `BugReportRepository.crear` en `comoPlataforma` (design §6);
    - `ReporteBugService.enviar` (design §5).
  - **Hecho:** verdes `tests/unit/services/reporte-bug-service.test.ts` y
    `tests/integration/db/bug-report.test.ts` (con `DATABASE_URL`: un verde sin base no vale,
    `docs/verification.md`).
- [x] **T6. Server Action y reparto** (dep. T5; R11, R12, R13).
  - **Archivos:** `lib/actions/reporte-bug.ts` (design §4) y `"reporte-bug": "nucleo"` en
    `lib/modulos/reparto.ts`.
  - **Hecho:** `tests/unit/actions/reporte-bug-action.test.ts` y `modulos-reparto.guardia` verdes.

## Bloque C — Interfaz

- [x] **T7 [P]. Borrador** (dep. T3; R6, R7, R8).
  - **Archivo:** `hooks/useBorradorReporteBug.ts` (design §8.3).
  - **Hecho:** sus casos de `tests/components/ReporteBugBoton.test.tsx` verdes.
- [ ] **T8. Botón, panel y montaje** (dep. T6, T7; R1–R5, R9, R10).
  - **Archivos:** `components/shared/ReporteBugBoton.tsx` (design §8.2) y su montaje como hermano en
    `app/(app)/layout.tsx` (design §8.1).
  - **Hecho:** `tests/components/ReporteBugBoton.test.tsx` y las guardias del layout verdes.

## Bloque D — De punta a punta y cierre

- [ ] **T9. E2E y documentación** (dep. T8; R1, R2, R6, R8, R9, R13, R15).
  - **Archivos:**
    - `e2e/reporte-de-bugs.spec.ts`, en el proyecto `aislamiento`;
    - `BUG_REPORT_EMAILS: "reportes-e2e@example.test"` en `webServer.env` de `playwright.config.ts`;
    - el párrafo de `docs/architecture.md` (design §10).
  - **Hecho:**
    - dos corridas seguidas sobre una base desechable con 0 failed, 0 skipped y 0 flaky
      (`docs/verification.md > El E2E`);
    - salida pegada en `progress/impl_SLT-87.md`;
    - `./init.sh` verde;
    - `node scripts/tamano-pr.mjs` en aviso, no en rojo, con la línea `tamano-pr-aceptado` de Q1.
  - **Además:** correr el grupo `aislamiento` entero, que incluye `dos-empresas-humo`, porque el
    diff toca `db/` y la sesión.

## Mapa R → test

| R | Test |
|---|---|
| R1 | `e2e/reporte-de-bugs.spec.ts` «el maestro ve el botón en dos pantallas del portal y el mensajero en un móvil en `/mis-asignaciones`» |
| R2 | `e2e/reporte-de-bugs.spec.ts` «el superadmin no ve el botón» (con `e2e/_superadmin-fixture.ts`) |
| R3 | `tests/components/ReporteBugBoton.test.tsx` «en `/mis-asignaciones` y sus subrutas se apila encima del chat; en el resto va en la esquina» |
| R4 | `tests/components/ReporteBugBoton.test.tsx` «abre un panel con descripción, Enviar y Descartar, sin campo de archivos» y «el contador muestra exactamente "0/500" vacío, "120/500" con 120 caracteres y "500/500" en el máximo, y el campo no admite el carácter 501» |
| R5 | `tests/components/ReporteBugBoton.test.tsx` «Enviar está deshabilitado con la descripción vacía o solo con espacios» |
| R6 | `tests/components/ReporteBugBoton.test.tsx` «el texto sobrevive a cerrar el panel y a montar de nuevo el componente» y `e2e/reporte-de-bugs.spec.ts` «el borrador sobrevive a recargar la página» |
| R7 | `tests/components/ReporteBugBoton.test.tsx` «el borrador de un usuario no aparece con otro usuarioId» |
| R8 | `tests/components/ReporteBugBoton.test.tsx` «Descartar borra el borrador y no llama a la action» y el caso de descartar de `e2e/reporte-de-bugs.spec.ts` |
| R9 | `tests/components/ReporteBugBoton.test.tsx` «tras enviar muestra Gracias, vacía el panel y borra el borrador» y `e2e/reporte-de-bugs.spec.ts` «enviar muestra Gracias y tras recargar el panel está vacío» |
| R10 | `tests/components/ReporteBugBoton.test.tsx` «si la action responde error, avisa y conserva el texto» |
| R11 | `tests/unit/actions/reporte-bug-action.test.ts` «sin sesión responde unauthenticated sin llamar al servicio» y `tests/unit/services/reporte-bug-service.test.ts` «el superadmin, un actor sin empresa y un usuario que el repositorio no encuentra en su empresa dan forbidden sin guardar ni enviar correo» |
| R12 | `tests/unit/actions/reporte-bug-action.test.ts` «descripción vacía tras recortar, de 501 caracteres (y 500 pasa), página con query o con fragmento y campos de más (`organizacionId`, `rol`) dan validation_error sin llamar al servicio»; `tests/integration/db/bug-report.test.ts` «el CHECK rechaza una descripción de 501 caracteres y una página con `?`» |
| R13 | `tests/integration/db/bug-report.test.ts` «crear guarda la empresa, el usuario, el rol y el nombre del actor, la ruta sin query, el agente y la ventana» y «con un usuario de otra empresa devuelve null y no escribe»; `tests/unit/actions/reporte-bug-action.test.ts` «el agente de usuario sale de la cabecera»; `e2e/reporte-de-bugs.spec.ts` «la fila guardada lleva la empresa, el rol y la página sin query, aunque la URL del navegador tenga query» (lectura como dueño) |
| R14 | `tests/integration/db/bug-report.test.ts` «con servi_app, SELECT, INSERT, UPDATE y DELETE de bug_report dan 42501, aun con una fila de su propia empresa» |
| R15 | `tests/unit/services/reporte-bug-service.test.ts` «manda un correo por destinatario y a nadie más, después de guardar»; `tests/unit/services/email/plantilla-reporte-bug.test.ts` «lleva la descripción y cada dato del contexto, en HTML y en texto»; `e2e/reporte-de-bugs.spec.ts` «el log del servidor tiene el correo a reportes-e2e@example.test con la descripción» |
| R16 | `tests/unit/config/reporte-bug-config.test.ts` «vacía, ausente o sin direcciones válidas da []; recorta, filtra y quita duplicados» y `tests/unit/services/reporte-bug-service.test.ts` «sin destinatarios guarda y responde enviado sin llamar al emisor» |
| R17 | `tests/unit/services/reporte-bug-service.test.ts` «si un envío falla, los demás salen, el reporte queda guardado, la respuesta es enviado y el fallo se registra sin reintento» |
| R18 | `tests/unit/services/email/plantilla-reporte-bug.test.ts` «escapa `<script>` en la descripción, el nombre, la página y el navegador» |
| R19 | `tests/integration/db/bug-report.test.ts` «la fila nace con created_at y updated_at y deleted_at nulo; las columnas están en inglés» |
| R20 | `tests/unit/config/reporte-bug-config.test.ts` «.env.example documenta BUG_REPORT_EMAILS vacía» |

## Archivos esperados

- `db/schema.prisma`
- `db/migrations/20261110120000_bug_report/migration.sql`
- `db/migrations/20261110120000_bug_report/down.sql`
- `lib/db/modelos-de-negocio.ts`
- `lib/db/excepciones-aislamiento.ts`
- `lib/config/reporte-bug.ts`
- `.env.example`
- `lib/types/reporte-bug.ts`
- `lib/interfaces/repositories/IBugReportRepository.ts`
- `lib/interfaces/services/IReporteBugService.ts`
- `lib/repositories/BugReportRepository.ts`
- `lib/services/ReporteBugService.ts`
- `lib/services/email/plantillas/reporte-bug.ts`
- `lib/actions/reporte-bug.ts`
- `lib/modulos/reparto.ts`
- `app/(app)/layout.tsx`
- `components/shared/ReporteBugBoton.tsx`
- `hooks/useBorradorReporteBug.ts`
- `docs/architecture.md`
- `playwright.config.ts`
- `e2e/reporte-de-bugs.spec.ts`
- `tests/unit/config/reporte-bug-config.test.ts`
- `tests/unit/services/email/plantilla-reporte-bug.test.ts`
- `tests/unit/services/reporte-bug-service.test.ts`
- `tests/unit/actions/reporte-bug-action.test.ts`
- `tests/components/ReporteBugBoton.test.tsx`
- `tests/integration/db/bug-report.test.ts`

27 archivos (umbral del 80%: 32; máximo: 40). Si cambia el timestamp de la migración, se actualizan
aquí sus dos rutas.
