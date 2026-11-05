# Review SLT-83 «Planes: costo por orden porcentual sobre el valor del paquete»

## Vuelta 1 (completa, `origin/dev...08eb8c78`, base 86d299f4)

### Qué corrí
- `pnpm run typecheck` → verde.
- `eslint` sobre los 100+ `.ts/.tsx` añadidos o modificados → 0 problemas.
- `vitest run` de los tests de la feature (unit + componentes: costeo-porcentual, costeo, mensajes,
  schema, service, costo-concreto, rastro, ConsumoDelPlanPorcentual, PlanFormCostoPorcentual,
  EmpresasModuleCobroPorcentual, PlanEmpresaCostoPorcentual) → `11 passed`, 166 tests verdes.
- Guardias `rls-por-empresa`, `fk-misma-empresa`, `organizacion-en-modelos`, `cobro-plataforma-solo-por-trigger`,
  `historico-sin-migracion` + `verificar-rls-despliegue.test.ts` → 6/6, 77 verdes.
- Integración de `db`: en este worktree no hay `.env`/`DATABASE_URL`, así que salen `skipped`. No los
  pude ejecutar; me apoyo en lectura del SQL y de los tests, y en la bitácora (80/80 y las mutaciones de
  §9.4). Los confirma CI.
- No corrí `./init.sh`, la suite completa ni el E2E (instrucción del leader; los corre CI).

### Checklist

**Especificación**
- [x] requirements.md con R1–R29 EARS; tabla «Decisiones cerradas» respetada.
- [x] design.md con alternativas descartadas (§11).
- [ ] tasks.md todo `[x]`: **T5 y T16 sin marcar**. Ambos tienen como «Hecho» la suite completa / `./init.sh`
  en CI. Ver hallazgo m1.
- [x] `## Lo que ya existe` presente, con búsqueda documentada; el diff reutiliza (`cobro_plataforma_tarifa_de`,
  triggers de alta/anulación, `cobro_plataforma_movimiento`, `porcentajeSchema`, `montoCobroSchema`,
  `deuda-plataforma`) y no re-crea nada de la lista.

**Trazabilidad**
- [x] R1–R28 mapean a tests existentes y no vacíos (revisados: los de cobro, importe, estados finales,
  aislamiento, ciclo, ida y vuelta, componentes y unit). R29 = gate de CI + «sin dependencias» medido
  (sin cambios en `package.json`/lockfile).
- [x] `progress/impl_SLT-83.md > T16` contiene el mapa R → test.

**Calidad de código**
- [x] typecheck · [x] lint (archivos del diff) · [ ] `gate-completo` en CI: pendiente (PR aún no abierto).
- [x] Flujo crítico de dinero con E2E: `e2e/planes-costo-porcentual.spec.ts` (R28), en el proyecto `dinero`.
- [x] Sin dependencias nuevas.

**Seguridad / Configuración**
- [x] Sin secretos, sin webhooks nuevos, sin valores por entorno hardcodeados.

**Datos y seguridad (proyecto)**
- [x] Tabla nueva `cobro_plataforma_porcentual_orden`: `organizacion_id` NOT NULL con DEFAULT de contexto,
  FK, índice, único por empresa, RLS con política `…_por_empresa`, `REVOKE INSERT, UPDATE, DELETE` a
  `servi_app`, triggers de misma empresa y de sin-cambio-de-empresa. Registrada en `MODELOS_DE_NEGOCIO`.
- [x] Funciones nuevas `SECURITY DEFINER`, `search_path` fijo, `REVOKE EXECUTE … FROM PUBLIC`; solo
  `plan_de_la_empresa` conserva su GRANT y su 42501 de contexto.
- [x] Las tres migraciones traen `down.sql`; ninguna migración aplicada se edita.
- [ ] La bajada se niega con datos porcentuales **en todos sus pasos**: falla en M3 (hallazgo B1).
- [x] Ningún recurso de Ordenex; ningún literal de país/moneda nuevo en `app/`, `lib/`, `components/`, `db/`.
- [x] Ningún `console.log` nuevo.

**Arquitectura / permisos**
- [x] Lógica en services, acceso en repositories; zod en el borde (`costoPorOrdenPorcentualSchema`,
  refine «un solo modo» en crear, editar y versión). Superadmin validado en el service antes del repo (R3).

### Reglas de cobro (revisión del SQL)
- Piso: `GREATEST(round(COALESCE(monto,0)*pct/100, 2), COALESCE(minimo,0))` → mayor entre % y mínimo, nunca
  el global. Correcto (R9).
- Redondeo: `round(numeric, 2)` es mitad lejos de cero; con importes ≥ 0 (y `monto_cobrar` con CHECK de
  entero) equivale a mitad arriba. Correcto. Sin coma flotante en SQL ni en TS (`centimos.ts` en bigint).
- Congelado al crear: el trigger de alta inserta la condición con `cobro_plataforma_tarifa_de` del instante;
  la conciliación usa siempre la fila congelada (R11). La excepción va antes del plan porcentual (R7).
- Cargo al entrar a estado final, reverso al salir o anular (mismo importe y fuente que el último cargo),
  recobro con el `monto_cobrar` del instante, final → final sin movimiento: todo sale de una sola función
  idempotente (`cobro_plataforma_porcentual_conciliar`). Correcto (R8, R12–R15). Las órdenes fijas y las
  anteriores a la ficha siguen exactamente su camino (cuerpos literales salvo la rama nueva).
- Excepción > plan > global > 0 conservado; `ESTADOS_TERMINALES` atado por test (R19).
- **Sentencia combinada (estado + anulación).** Con los dos triggers AFTER, la primera conciliación hace el
  trabajo y la segunda no ve nada que hacer. «Entrar a final y anular» en una sentencia no deja
  movimientos; por separado deja cargo+reverso (o nada, según el orden). El resultado que fija R15
  —cargo vigente sí/no y deuda de la orden— es idéntico en todos los casos, y es lo que el design §3.3
  (aprobado) define como «mismo resultado»: las dos secuencias separadas ya difieren entre sí en la lista
  de movimientos, así que exigir igualdad de lista sería imposible de cumplir. **Cumple el spec.**
- **Zona horaria (R24).** `ocurrido_at = now()` en una columna `TIMESTAMP` toma la zona de la sesión;
  `plan_cobro_del_ciclo` compara contra el inicio de ciclo en UTC, y el reverso por anulación usa
  `deleted_at` (escrito en UTC por Prisma). En Supabase y en CI la sesión es UTC, así que R24 se cumple
  donde corre; es el mismo patrón que SL-40 ya usa para todos los movimientos. Ver hallazgo m2.

### Tests existentes modificados (57)
Revisé todas las líneas eliminadas de tests/e2e/scripts existentes. Por causa:
- tipo nuevo (`costoPorOrdenPorcentual: null`, `modo: "fijo"`, `cobroCiclo`): las aserciones se conservan y
  ganan el campo; ninguna se afloja (p. ej. `plan-de-la-empresa-costeo` pasa de `toEqual(esperado)` a
  `toEqual({ modo: "fijo", ...esperado })` y `{ ...esperado, porcentaje: null, minimo: null }`: más estrictas);
- contadores de tabla nueva (85→86, 167→168): control positivo, coherente con la tabla añadida;
- textos de la wallet / ayuda: cambian por decisión del humano registrada en `progress/features/SLT-83.md`;
- `demo-qa.test.ts`: el invariante «toda orden tiene un cargo» se acota a órdenes sin condiciones
  congeladas; causa real (R6) y la demo no pierde ninguna orden (tiene excepción).
Ninguna relajación sin causa.

### Hallazgos

- **B1 — BLOQUEANTE (R27).** El `down.sql` de M3 (`20261104150200…/down.sql`) **no se niega** con datos
  porcentuales; solo lo hacen M2 y M1. El rollback del repo (`pnpm run db:rollback` → `scripts/db-rollback.ts`)
  baja **una migración por vez, empezando por la última**, así que el primer paso de la bajada —M3— se
  aplica siempre y deja un estado intermedio roto mientras M2 se niega después:
  - `cobro_plataforma_tarifa_de` vuelve a la versión de SLT-66, que no lee `costo_por_orden_pct`: una
    empresa con plan porcentual (`costo_por_orden` NULL) cobra **el global** en cada orden nueva, sin que
    nadie lo decida;
  - desaparece el trigger de cambio de estado: las órdenes con condiciones congeladas **dejan de cobrarse**
    al llegar a su estado final, y anularlas ya no concilia.
  Es exactamente lo que R27 quiere impedir («la bajada DEBE negarse … porque perdería el cobro de esas
  órdenes»). El test de ida y vuelta no lo detecta porque corre los `down.sql` de M2 y M1 con M3 todavía
  arriba (`migracion-slt83-ida-y-vuelta.test.ts:237`), no en el orden real M3 → M2 → M1.
  **Qué falta:** que `down.sql` de M3 lleve al principio la misma guarda (planes con `costo_por_orden_pct`,
  versiones pendientes con `costoPorOrdenPorcentual` no nulo, filas en `cobro_plataforma_porcentual_orden`)
  y aborte antes de tocar nada; y que el test de R27 compruebe que, con datos porcentuales, **M3** se niega
  y las funciones quedan con su `md5` de subida. Ajustar la línea «Orden de bajada» de `design.md §2.3` y el
  comentario de cabecera del `down.sql` («Este down NO se niega solo…»).

- **m1 — menor.** T5 y T16 siguen `[ ]` en `tasks.md`. Su «Hecho» es la suite de integración completa /
  `./init.sh` + `gate-completo`, que por regla corre en CI. No bloquea esta revisión, pero el leader no debe
  pedir merge hasta marcarlos con el CI en verde.

- **m2 — menor (deuda, no de esta ficha).** Zona horaria de `ocurrido_at`: los cargos usan `now()` (zona de
  la sesión) y los reversos por anulación `deleted_at` (UTC), mientras el ciclo de R24 se corta en UTC
  (`docs/architecture.md > Ciclo en UTC`). Correcto con la sesión en UTC (Supabase, CI); una sesión en otra
  zona correría «lo cobrado en el ciclo» por la diferencia horaria, y la base local de esta feature
  (America/Bogota) obligó a los tests de R24 a usar márgenes de días. Es heredado de SL-40, y cambiar solo
  los movimientos nuevos dejaría la tabla mezclada; recomiendo registrar la deuda (sesión fijada a UTC o
  `now() AT TIME ZONE 'UTC'` en todos los triggers de cobro) en `progress/features/SLT-83.md > Cierre`.

- **m3 — menor.** No pude ejecutar los tests de integración de `db` (sin `DATABASE_URL` en el worktree). El
  veredicto de R6–R19, R22, R24, R25 y R27 se apoya en lectura del SQL y de los tests y en la bitácora; los
  confirma `gate-completo`.

### Veredicto

**RECHAZADO** — un bloqueante: B1 (R27, la bajada de M3 no se niega con datos porcentuales y rompe el
cobro en el rollback real). El resto (reglas de cobro, sentencia combinada, RLS, trazabilidad, tests
modificados) está bien.
