# Review SLT-97 «Reporte de bugs: módulo del superadmin»

Reviewer, F2.2, 2026-11-10. Worktree `.worktrees/SLT-97-reporte-bugs-modulo-superadmin`, diff
`origin/dev...HEAD` (HEAD `527545a2`): 37 archivos. Ruta completa.

## Verificación ejecutada (no copiada de la bitácora)

- Base propia `servi_logistic_slt97_rev` (Postgres 16 local), con las variables SUPABASE vacías y
  `PRISMA_LOG_QUERIES` vacía. Se borró al terminar.
  - `prisma migrate deploy` aplicó todo, hasta `20261111120000_bug_report_status`.
  - Ida y vuelta: `db:rollback` dio «Rollback completado: 20261111120000_bug_report_status». Después no
    quedaron ni la columna, ni el tipo, ni las funciones, ni la tabla, ni la fila en `_prisma_migrations`.
    `migrate deploy` la volvió a aplicar.
  - Tras la vuelta: 2 triggers, RLS activa en `bug_report_status_change`, `servi_app` sin
    SELECT/INSERT en el historial ni UPDATE en `bug_report`, y 0 políticas.
  - `db:seed` en verde. `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma
    --exit-code` dio exit 0, «empty migration».
- Guardias de esquema y tests de integración contra esa base, todos con `DATABASE_URL`:
  - `schema-drift-saneamiento`, `nucleo-sin-modulos`, `catalogo-postgres-acota-esquema`,
    `catalogo-consulta-acota-esquema`, `bug-report` y `demo-qa-borrado`: 6/6 archivos y 68/68, sin
    saltados;
  - `aislamiento-rls` y `demo-qa`, junto con los vitest de la feature (`ReporteDetalle`,
    `reportes-plataforma-page`, la action, los dos servicios, `menu-visibility` y `Sidebar`): 9/9
    archivos y 183/183.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: exit 0.
- `eslint` de los 30 `.ts/.tsx` añadidos o modificados: exit 0, sin avisos.
- `pnpm run test:guardias`: 341/342 archivos y 4807 ✓, 4 ✗, 1 saltado. El único rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`: no es un
  hallazgo.
- `node scripts/tamano-pr.mjs`: AVISO, 32/40 archivos y 3536/1000 líneas, aceptado por la línea
  `tamano-pr-aceptado` de `progress/features/SLT-97.md`. No es rojo.
- No corridos, por orden del leader: `./init.sh`, la suite completa y el E2E.

## Checklist

- [x] **Trazabilidad.** R1–R23 tienen test real. Revisé los casos clave: R2 afirma `not.toHaveBeenCalled`;
  R3 da 42501 en las cinco operaciones; R4 cuenta `historial_accion` y `jobs`; R17 recorre los 16 pares;
  R18 se prueba en el servicio y como dueño; R20 cubre el cliente, el zod y el CHECK; R21 hace un rollback
  real con SAVEPOINT; R23 prueba UPDATE y DELETE con SL097 y la cascada. Es el mapa de `tasks.md` y de
  `impl_SLT-97.md`, y los nombres existen.
- [ ] **Tasks.** T9 sigue en `[ ]` (`tasks.md:75`). Ver B1.
- [x] **Tamaño.** Aviso aceptado; no pasa a rojo.
- [x] **`design.md > Lo que ya existe`.** Está, y el diff no re-crea nada de esa lista: reutiliza
  `exigirSuperadmin`, `listarEmpresasPlataforma`, `ROL_LABELS`, `Pagination`, `EmptyState`, `AppPage` y
  las primitivas `ui`.
- [x] **Seguridad.**
  - Las dos páginas llaman a `notFound()` antes de cualquier lectura: `page.tsx:52` y
    `[reporteId]/page.tsx:31`.
  - El menú usa `roles: ROLES_PLATAFORMA` (`menu-visibility.ts:766-775`).
  - Las tres actions pasan por sesión, `exigirSuperadmin` y zod (`reportes-bug-plataforma.ts:43-48`), y
    el servicio repite la puerta (`ReportesBugPlataformaService.ts:50,69,80`).
  - La empresa no lee nada: 42501 en las dos tablas.
  - El historial es inmutable: hay trigger SL097 y el repositorio no tiene ningún `update`/`delete`
    sobre él.
  - Las transiciones van solo hacia adelante en el repositorio (`permite` + `updateMany` condicionado,
    `BugReportRepository.ts:212-223`) y en el trigger.
  - La nota tiene 500 como máximo en tres capas:
    - en cliente, `maxLength` (`ReporteDetalle.tsx:178`);
    - en servidor, `.trim().max(500)`;
    - en la base, `CHECK char_length(btrim) BETWEEN 1 AND 500`.
- [x] **Migración.** `down.sql` deshace en orden inverso; la ida y vuelta se verificó arriba.
- [x] **Arreglo `ccaeac92`.**
  - `detalle()` lee en serie dentro de la transacción: fila, empresa, usuario e historial, cada uno con su
    `await` (`BugReportRepository.ts:160-172`).
  - Devuelve el mismo DTO que antes y conserva `null` si el reporte no está o está borrado.
  - El caso R14 de integración lo fija campo a campo, con el historial en orden descendente, y pasó contra
    mi base. Es correcto.
  - El E2E no se ha corrido sobre él (B1).
- [x] **UI.**
  - Los textos de §9 coinciden literalmente en `reportes-textos.ts`.
  - El listado:
    - abre en «Pendientes» con la URL limpia;
    - ordena `createdAt desc, id asc`;
    - pagina de 25 y recorta la página en el servicio;
    - muestra un vacío distinto con filtros por defecto y con otros filtros;
    - el error no se pinta como vacío;
    - con un reporte cerrado, el formulario no se muestra y sale el texto de cerrado.
  - Accesibilidad:
    - `Label` en cada control;
    - `role="region"` con `aria-labelledby` en los bloques;
    - `role="alert"` y `role="status"`;
    - contador con `aria-live` y `aria-describedby`.

  Hay dos menores (m3, m4).
- [x] **Guardias de esquema contra una base.** Verdes, con `DATABASE_URL`. El historial no tiene
  `updated_at`, así que no entra en el censo, y no tiene FK a `usuario`, así que no entra en
  `api-key-dependencias-usuario`.
- [x] **Reglas de `perfil-agentes > reviewer`.**
  - Las tablas nuevas son de plataforma, con RLS y en `MODELOS_DE_PLATAFORMA`.
  - La migración trae `down.sql`.
  - No hay literales de país ni referencias a Ordenex.
  - No entra ninguna dependencia nueva: `Bug` viene de `lucide-react`.
  - Los comentarios explican el porqué.
  - La regla de E2E en local se cumple solo en parte: ver B1.
- [x] **Typecheck y lint.** Verdes.

## Propuestas 1–9 del implementer

Ninguna rompe un requisito en su efecto.

- **La 7** (el trigger deja pasar `X → X`) choca con la letra de R18, pero no con su efecto. Ver m1.
- **La 8** es solo de robustez del E2E. Ver m2.
- **Las demás** son de forma:
  - el color del Badge;
  - `error` → `error.tsx` en el detalle;
  - vaciar el destino tras `transicion_invalida`;
  - el enlace con la fecha como texto (ver m3);
  - el nombre del caso de SL-32;
  - `--from-config-datasource`;
  - las rutas de reparto, que entran en T7 y T8;
  - el caso R7 abierto por URL.

## Hallazgos

### B1 — BLOQUEANTE: T9 sin cerrar; el E2E no se ha corrido sobre el código final

**Dónde:** `specs/SLT-97-reporte-bugs-modulo-superadmin/tasks.md:75-85`.

**Qué pasa:**
- T9 está en `[ ]`, y `CHECKPOINTS.md` (ruta completa) pide todas las tasks en `[x]`.
- De su «Hecho» faltan dos cosas:
  1. **Las dos corridas de E2E sobre el código final.** Las corridas ×2 de `reporte-de-bugs` y
     `superadmin-arranque` son sobre `c9a109a5`. Después, `ccaeac92` reescribió
     `BugReportRepository.detalle()`, que es la lectura de la pantalla de detalle que recorre el E2E.
     `progress/impl_SLT-97.md` («No repetidos sobre `ccaeac92`») lo reconoce.
  2. **El grupo `aislamiento` entero**, que T9 exige porque el diff toca `db/`. No se corrió.
- `docs/perfil-agentes.md > reviewer` marca como bloqueante un PR que toca `db/` y pantallas «sin
  constancia de los E2E afectados corridos en local».
- El CI no lo cubre: según `CLAUDE.md` y `docs/gate.md`, el E2E solo corre en el PR a producción, no en el
  PR a `dev`.

**Qué falta:**
- Sobre HEAD y con una base desechable nueva:
  - dos corridas seguidas de
    `pnpm exec playwright test e2e/reporte-de-bugs.spec.ts e2e/superadmin-arranque.spec.ts`, con 0 failed,
    0 skipped y 0 flaky;
  - `--project=aislamiento` una vez.
- Pegar la salida en `progress/impl_SLT-97.md` y marcar T9 `[x]`.
- El punto `./init.sh` de T9 lo sustituye el `gate-completo` de CI, por la regla de la sesión del humano.
  Conviene dejarlo escrito en T9 para que el checkbox sea honesto.

**Sobre el código:** creo que el arreglo es correcto (ver el checklist). Lo que falta es la constancia
ejecutable, no un cambio de código.

### m1 — menor: R18 pide que la base rechace «al mismo estado», y el trigger lo deja pasar (propuesta 7)

**Dónde:**
- `db/migrations/20261111120000_bug_report_status/migration.sql:57-63`
  (`IF NEW."status" IS DISTINCT FROM OLD."status" AND …`);
- `tests/integration/db/bug-report.test.ts:760` (`de === a || …` → `null`);
- `docs/architecture.md`: el párrafo nuevo dice «rechaza … cualquier paso fuera de
  `TRANSICIONES_REPORTE`».

**El conflicto:** R18 dice que la base rechaza «esa transición», y la lista incluye «al mismo estado». En
cambio, design §2.3 (línea 130), aprobado con el mismo spec, decide lo contrario a propósito: «Un `UPDATE`
que deja el mismo estado no es un cambio y pasa sin historial».

**Por qué es menor:**
- El efecto de R18 se cumple: el servicio lo rechaza como `transicion_invalida` (test `:767`, casos
  `in_review→in_review` y `new→new`).
- En la base, un `X → X` no cambia nada.
- El `CHECK from_status <> to_status` impide que deje rastro en el historial.
- Ningún reporte cerrado se reabre.

**Qué hacer:**
- Que el humano corrija la letra de R18 («la base rechaza el paso hacia atrás o desde un cerrado; un
  `UPDATE` al mismo estado no es un cambio»), o que se endurezca el trigger.
- En los dos casos, ajustar la frase de `docs/architecture.md`.

### m2 — menor: el caso del maestro (R2) va dentro del `describe` en serie (propuesta 8)

**Dónde:** `e2e/reporte-de-bugs.spec.ts:500`, dentro de `test.describe.configure({ mode: "serial" })`
(`:346`).

No depende de los casos anteriores, pero si falla el caso 1 queda como «did not run»: se pierde el
diagnóstico de R2 en esa corrida. No rompe R2, que también cubren los tests de página, action, servicio y
menú, y el CI quedaría rojo igual. Conviene sacarlo a su propio `describe`, aprovechando la corrida de B1.

### m3 — menor (accesibilidad): el enlace de cada fila se anuncia solo con la fecha

**Dónde:** `app/(app)/plataforma/reportes/_components/ReportesModule.tsx:213-218`.

Un lector de pantalla oye una lista de enlaces «2026-11-09 14:05 UTC» que no dice de qué reporte se
trata. El spec no trae texto para un `aria-label`, así que no se puede inventar uno. Que el humano decida
si añadir uno, por ejemplo con la empresa y el resumen, en esta ficha o en otra.

### m4 — menor: un `?estado=` desconocido deja el filtro en blanco y muestra el aviso de fechas

**Dónde:** `app/(app)/plataforma/reportes/page.tsx:66`, que pasa `entrada.estado` sin validar al `Select`;
`ReportesModule.tsx:179`.

Con `?estado=foo`, la action responde `validation_error`, cosa que el spec prevé. Pero el `Select` de
estado recibe un valor que no está entre sus opciones y el aviso habla de fechas. Pasa lo mismo con un
`?empresa=` que no es uuid. Se ajusta al design (§6 y §8.2: todo `validation_error` muestra el aviso de
fechas), así que solo se anota: solo llega ahí quien edita la URL a mano.

## Veredicto

**RECHAZADO**: 1 bloqueante (B1) y 4 menores. El código y los tests cumplen R1–R23, y la verificación
de base, guardias, typecheck y lint está en verde. Falta cerrar T9:
- el E2E ×2 sobre HEAD;
- el grupo `aislamiento`;
- la casilla `[x]`.

Para la vuelta 2, basta un rango con la salida de esas corridas y T9 marcada. m1–m4 no bloquean.
