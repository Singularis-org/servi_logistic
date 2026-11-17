# Review SLT-129 «Planes: borrador del plan guardado en el servidor por pasos» — F2.2

Ruta completa, zona backend. Diff `origin/dev...HEAD` (rama `feature/SLT-129-planes-borrador-servidor`, PR #200).
Grafo: no consultado (worktree sin índice según design); revisado con Grep/Read y ejecución.

## Vuelta 1

### Checklist

**Ruta y especificación**
- [x] Ruta completa (complexity high, esquema y migración nuevos): respeta el suelo.
- [x] `requirements.md` con R1–R24 en EARS; `design.md` con 5 alternativas descartadas (A–E) y su porqué.
- [x] `design.md` abre con `## Lo que ya existe`; el diff reutiliza `PlanesService.crear/editar`,
      `crearEnTx`, `programarCambio`, los esquemas de `lib/types/planes.ts` (exportados, no copiados) y
      `nombreDelActor`. No re-crea nada de la lista.
- [~] `tasks.md`: todo `[x]` salvo T8.1 (`./init.sh`), que corre el leader (menor 1).

**Tamaño**
- [x] `node scripts/tamano-pr.mjs`: 26/40 archivos, 1080/1000 producción, 2192/3000 tests; aceptación humana
      en `progress/features/SLT-129.md:24`. No es hallazgo.

**Trazabilidad** (cada test abierto y leído; todos existen y aseveran lo que dice el requisito)
- [x] R1 `unit/services/plan-borrador-service.test.ts` (5 operaciones × maestro/admin/null, repo sin llamar) + `unit/actions/plan-borrador.test.ts`.
- [x] R2 `integration/db/plan-borrador.test.ts > R2` (iniciador, nombre congelado, fecha).
- [x] R3 servicio + esquema.
- [x] R4 `> R4 — guardar un paso no toca los demás` y `> R4 — dos guardados simultáneos…` (dos conexiones, simultaneidad forzada con `pg_blocking_pids`).
- [x] R5 `> R5 — el segundo superadmin…` y `> R5 — dos primeros guardados simultáneos…` (una fila, iniciador de uno de los dos).
- [x] R6, R7 `unit/types/plan-borrador-schema.test.ts` (un caso por paso, claves, lista de descuentos) + servicio.
- [x] R8 integración + unit.
- [x] R9, R10 integración (otro superadmin, orden de la lista de descuentos, null sin borrador; lista con nombres).
- [x] R11 `> R11` con control positivo (un plan real sí aparece en asignables, públicos y catálogo; los dos borradores no; asignar → `not_found`; 0 filas en `plan`).
- [x] R12 foto de 11 tablas (incluye `jobs`, `plan_rastro`, recepciones y versiones) con un pendiente SLT-128 vivo y no-vacuidad comprobada.
- [x] R13, R14, R22 integración.
- [x] R15 guardia `plan-borrador-sin-caducidad.guardia.test.ts` con contrapruebas en memoria y control positivo sobre el árbol.
- [x] R16 unit servicio + puro.
- [x] R17 público y custom (id del borrador, rastro `creado`, borrador borrado, asignación).
- [x] R18 pendiente, recepciones, trabajos de aviso, rastro, borrador borrado.
- [x] R19 tres casos (validación cruzada, fecha pasada, `cambio_a_medias` bajo el cerrojo), el borrador queda.
- [x] R20 descartado, borrado entre la lectura del servicio y el `FOR UPDATE`, y dos confirmaciones simultáneas reales (1 plan, 1 rastro, 0 borradores).
- [x] R21 suites citadas sin cambios en el diff (`git diff --stat` vacío sobre ellas) y en verde.
- [x] R23 `planes-acceso-servi-app.test.ts > R23` (SELECT/INSERT/UPDATE/DELETE → `42501`, también por Prisma).
- [x] R24 `migracion-plan-borrador-ida-y-vuelta.test.ts` (5 casos: orden, atomicidad, RLS sin políticas, CHECK/UNIQUE/FK, bajar = antes, subir otra vez = mismo esquema).
- [x] Mapa R→test en `progress/impl_SLT-129.md`.

**Calidad (ejecutado por el reviewer)**
- [x] `pnpm run typecheck`: sin errores.
- [x] `pnpm exec eslint` sobre los `.ts` del diff: sin salida.
- [x] Vitest, base `servi_logistic_slt129`, `--no-file-parallelism`: los 9 archivos de la ficha → 135 passed;
      R21 + guardias (`planes-service*`, `planes-schema*`, `planes-cambio-programado`, `planes-cambio-por-empresa`,
      `planes-crear-custom-asigna`, `organizacion-en-modelos`, `modulos-reparto`, `planes-sin-borrado`,
      `plataforma-solo-en-lista`) → 20 archivos, 632 passed.
- [x] E2E de planes (T8.2): constancia en la bitácora (20 passed ×2, base desechable).
- [x] `e2e/dos-empresas-humo.spec.ts` (exigido por tocar `lib/db/`): no estaba en la bitácora; lo corrió el
      reviewer contra `servi_logistic_slt129_e2e`: **8 passed (2.5 m)** (menor 2).
- [ ] `gate-completo` en CI y `./init.sh`: pendientes del leader.

**Datos y seguridad**
- [x] Tabla de plataforma sin `organizacion_id`: justificada (como `plan`, `plan_cambio_programado`), clasificada en
      `MODELOS_DE_PLATAFORMA`, sin excepción nueva de aislamiento (solo se amplía el `motivo` de `PlanesRepository`).
- [x] RLS activada sin políticas + `REVOKE ALL … FROM servi_app` (migration.sql:46-47); probado en R23 y R24.
- [x] `down.sql` presente (DROP TABLE, BEGIN/COMMIT); no edita migraciones aplicadas; prefijo posterior a la mayor de `dev`.
- [x] Sin literales de país/moneda, sin recursos de Ordenex, sin secretos, sin `console.log`.
- [x] Sin dependencias nuevas.

**Arquitectura y permisos**
- [x] Servicio/repositorio/action en sus capas; zod en el borde (servicio); actor de la sesión; `forbidden` antes de leer.
- [x] Action en el núcleo (`lib/modulos/reparto.ts`), como `planes`.
- [x] Comentarios explican el porqué.

### Puntos pedidos por el leader

**Fuga de un borrador a asignables/públicos/carrusel/catálogo/cobro/facturación/jobs.** No hay: un borrador de
creación no es fila de `plan`, ninguna lectura existente se toca, y la guardia R15 vigila que crons y `jobs-*` no
nombren la tabla. R11 lo prueba con control positivo; R12 prueba que un borrador de cambio no mueve nada (11 tablas).

**Concurrencia.**
- Un solo borrador de cambio por plan: `UNIQUE(plan_id)` + `INSERT … ON CONFLICT DO UPDATE` con mezcla `||`. Probado con dos conexiones.
- Pasos distintos simultáneos: la mezcla `||` va en una sentencia sobre la fila bloqueada por el UPDATE; probado.
- Confirmar doble: `consumirBorrador` toma `FOR UPDATE` al empezar y borra en el camino `ok` dentro de la misma
  transacción (`PlanesRepository.ts:1220-1230`); la segunda no encuentra la fila y lanza `BorradorNoEncontrado`
  (deshace todo). Probado; el implementer hizo la contraprueba quitando el `FOR UPDATE`.
- Orden de bloqueos: confirmar = borrador → (organización) → plan; guardar cambio = borrador → plan `FOR SHARE`
  (`PlanesRepository.ts:1574-1577`). Coherentes entre sí. Única inversión: el borrado en cascada del plan
  (plan → borrador), menor 3.
- Rechazos devueltos como valor no borran el borrador; `AsignacionRechazada` en `crearYAsignar` lanza y revierte,
  así que el borrador también queda.

**RLS / REVOKE / down.sql.** Correctos (ver arriba). Los CHECK de forma (`objeto`, `pasos_conocidos`,
`vigencia_solo_cambio`) están probados en R24.

**`CURRENT_TIMESTAMP` → `now() AT TIME ZONE 'UTC'`.** Solo afecta a las tres sentencias nuevas del borrador
(`AHORA_UTC`, usado en `PlanesRepository.ts:1547, 1558, 1584, 1586`). El diff no elimina ni cambia ninguna escritura
existente (`git diff | grep '^-'` sin timestamps). Es coherente con `docs/architecture.md > Ciclo en UTC`. El DEFAULT
de la migración queda `CURRENT_TIMESTAMP` como en las demás `plan_*`, pero ninguna escritura del código depende de
él. Queda un `CURRENT_TIMESTAMP` preexistente en `descartarTrabajos` (`PlanesRepository.ts:834`, `jobs.updated_at`),
fuera del alcance (menor 5).

**Aviso de `pg` «client.query() while already executing».** No lo introduce este diff. Sale también en
`tests/integration/db/477-deshacer-cierre-rechazado-sql-real.test.ts`, que no toca planes, y en las suites de
planes de antes. La traza apunta a `@prisma/adapter-pg` `PgTransaction.performIO` (Prisma lanza consultas en
paralelo dentro de una transacción interactiva). Es del adaptador.

### Las 10 decisiones fuera del spec

| # | Decisión | Juicio |
|---|---|---|
| 1 | Mensajes de R3 y R7 | Aceptable: el spec fija claves, no textos. |
| 2 | Borrador `FOR UPDATE` antes del plan `FOR SHARE` | Aceptable y correcta: mismo orden que confirmar. |
| 3 | `guardarPasoDeCreacion` filtra `plan_id IS NULL` | Aceptable: evita mezclar pasos de crear en un cambio. |
| 4 | `IPlanBorradorRepository extends Pick<IPlanesRepository,"plan">` | Aceptable. |
| 5 | Confirmar un cambio sin diferencias (`ok`, `cambio:false`) borra el borrador | **Al humano (informativa):** es comportamiento de producto que verá SLT-144. Es razonable, pero la decide el humano. |
| 6 | Import circular `lib/types/plan-borrador.ts` ↔ `lib/planes/borrador.ts` | Aceptable: solo se usan dentro de funciones y está documentado. Es frágil a futuro. |
| 7 | `asignarPlanSchema` usa `noInicioYEfecto` | Aceptable: misma lógica y mensaje; suites de esquema en verde. |
| 8 | Lista por `updated_at DESC, id` | Aceptable; conviene que SLT-144 lo sepa. |
| 9 | Nombre de la lista de General solo si valida | Aceptable: coherente con la lectura defensiva del design §4. |
| 10 | Fechas del borrador en UTC | Aceptable: arreglo correcto y acotado (ver arriba). |

### Hallazgos

1. **menor** — `specs/SLT-129-planes-borrador-servidor/tasks.md` T8.1 (`./init.sh`) sin marcar. Lo corre el leader;
   hay que marcarlo antes del cierre.
2. **menor** — `progress/impl_SLT-129.md`: falta la constancia de `e2e/dos-empresas-humo.spec.ts`, que el diff exige
   por tocar `lib/db/` (`docs/checkpoints-proyecto.md > Aislamiento`). El reviewer lo corrió sobre
   `servi_logistic_slt129_e2e` con el build del worktree: 8 passed. Ese build (`.next/BUILD_ID` de las 12:21) es
   anterior al último commit (12:30), que solo cambia las fechas del borrador, código que este spec no recorre.
   Anotarlo en la bitácora o en `progress/features/SLT-129.md`.
3. **menor** — `lib/repositories/PlanesRepository.ts:1574-1577` frente al borrado en cascada (R22): guardar o confirmar
   toman borrador → plan, y borrar la empresa del custom toma plan → borrador. Si coinciden, Postgres resuelve con
   `40P01` y la action devuelve un error sin traducir. Es muy improbable porque exige borrar la empresa mientras
   se edita su custom. Aceptarlo o anotarlo en deudas.
4. **menor** — `PlanesRepository.ts:1574-1590`: si un guardado del cambio espera al `FOR UPDATE` de una confirmación
   en curso, al soltarse no encuentra la fila y el `INSERT … ON CONFLICT` crea un borrador NUEVO con solo ese paso.
   Es coherente con «un borrador por plan», pero SLT-144 debe saber que un guardado tardío tras «Programar cambios»
   abre otro borrador.
5. **menor** — `PlanesRepository.ts:834` (`descartarTrabajos`, preexistente): `jobs.updated_at = CURRENT_TIMESTAMP`
   tiene el mismo sesgo de zona que arregló la decisión 10. Fuera del alcance; candidato a `progress/deudas.md`.

Mayores: 0. Menores: 5.

### Veredicto

**OK.** No hay bloqueantes. Antes del merge siguen pendientes T8.1 (`./init.sh`) y `gate-completo` en verde, y la
decisión 5 pasa al humano como informativa.
