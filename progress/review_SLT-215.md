# Review SLT-215 «Planes: niveles de beneficio por volumen de órdenes»

- Ruta: completa (dinero, migración, cron). Diff revisado: `git diff origin/dev...HEAD` en `a2f02d28`.
- PR #254 contra `dev`. CI al cerrar esta revisión: `estatico`, `e2e (reparto)` y `cambios` en verde; `vitest` (3
  shards), `e2e (aislamiento)` y `e2e (dinero)` en curso.
- Grafo: no usado (worktree recién mergeado con dev). Exploración con Grep/Read.

## Checklist

- [x] **Trazabilidad R1–R38.** Cada R tiene un test concreto con aserciones reales (mapa consolidado en
  `progress/impl_SLT-215.md > Cierre (T12)`). Comprobado por nombre y contenido:
  - R1–R5, R18, R20, R21 (textos): `tests/unit/planes/niveles.test.ts`;
  - R6, R15, R17, R18, R35, R36: `tests/integration/db/plan-nivel.test.ts`;
  - R7, R10: `plan-borrador-schema.test.ts`, `PlanFormPasos.test.tsx`;
  - R8–R10, R13, R14: `PlanFormNiveles.test.tsx`; R11: `plan-form-borrador.test.ts`;
  - R12, R15, R16: `plan-borrador-confirmar.test.ts`;
  - R19, R20: `rastro.test.ts`, `PlanDetalle.test.tsx`; R21: `PlanesModule.test.tsx`;
  - R22–R29: `plan-nivel-cierre.test.ts`. Incluye `cancelacion_api` dentro y después del mes, 152 − 3 = 149 contra
    150, el borde 05:59/06:00 UTC, el cierre el día 5 igual que el día 1 y dos cierres en paralelo;
  - R29, R30: `tests/unit/planes/jobs-niveles.test.ts` (06:20 UTC, `dedupe_key` diaria, siembra, fallo parcial
    con ids);
  - R16 (versión a medias), R31–R34: `plan-nivel-recalculo.test.ts`;
  - R37: `migracion-plan-nivel-ida-y-vuelta.test.ts`; R38: `e2e/planes-niveles.spec.ts` (CI).
- [x] **Tasks:** T1–T12 marcadas `[x]` en `tasks.md` (36 casillas, ninguna abierta).
- [x] **Tamaño:** `node scripts/tamano-pr.mjs` da 67/40 archivos, 1466/1000 líneas de producción y 3512/3000 de
  tests. Está aceptado con `<!-- tamano-pr-aceptado: … -->` en `progress/features/SLT-215.md` (ver menor 1).
- [x] **`design.md > ## Lo que ya existe`:** existe y tiene contenido. El diff no re-crea nada de esa lista: reutiliza
  `porcentajeSchema`, `montoCobroSchema`, `plan_inicio/fin_periodo_calendario` y el molde de `plan_beneficio` y de
  `jobs-factura-plataforma`.
- [x] **Datos y seguridad:**
  - `plan_nivel` es de plataforma: RLS sin políticas y `REVOKE ALL … FROM servi_app`, como `plan_beneficio`;
  - `plan_nivel_empresa` y `plan_nivel_historial` llevan `organizacion_id`, la política `_por_empresa`,
    `REVOKE INSERT, UPDATE, DELETE`, el trigger de «sin cambio de empresa» y un test con dos empresas (R36);
  - las cinco funciones son `SECURITY DEFINER`, con `search_path` fijo y `REVOKE EXECUTE … FROM PUBLIC`;
  - las dos migraciones traen `down.sql` y no editan ninguna migración aplicada.
- [x] **Dinero con decimal:**
  - columnas `DECIMAL(5,2)` y `DECIMAL(12,2)`;
  - en TypeScript los importes son texto, con `toFixed(2)` desde `Prisma.Decimal` e `importeCanonico` sin `Number`;
  - el CHECK de monto exige `> 0` y zod también (`refine /[1-9]/`).
- [x] **Cancelaciones:** `plan_nivel_ordenes_efectivas` excluye las órdenes con
  `orden_historial_estado.origen_tipo = 'cancelacion_api'` y `created_at < p_hasta`. Una guardia del test falla si el
  enum gana otra forma de cancelar.
- [x] **Bordes de mes en −06:00:** `plan_inicio_periodo_calendario('mensual', …)` y `plan_fin_periodo_calendario`, sin
  copiar el `interval '6 hours'` (R23). El repositorio lista las empresas pendientes con la misma función.
- [x] **Job a las 00:20:** recurrente a las 06:20 UTC, de plataforma y de núcleo. Está cableado en `buildHandlers`,
  `buildRecurrencias` y `RECURRENTES_DE_PLATAFORMA`, y sembrado en `SIEMBRAS_RECURRENTES`.
- [x] **País y moneda:** sin literales de país ni de moneda en código nuevo. Sin recursos de Ordenex. Sin
  dependencias nuevas.
- [x] **Capas:** SQL del dueño en la migración, acceso en `lib/repositories/`, zod en el borde
  (`nivelesSchema` en crear, programar y el borrador), autorización por las actions del borrador (superadmin).
- [ ] **E2E en local** (`perfil-agentes > reviewer`): no se corrieron. **No es bloqueante** por decisión del humano
  (política de CI). El E2E lo cubre `gate-completo`.
- [ ] **`gate-completo` en verde:** en curso al cerrar la revisión. **Condición para mergear.**

## Verificación ejecutada (salida real, `NODE_OPTIONS=--max-old-space-size=8192`)

- `pnpm run typecheck`: exit 0.
- `eslint` sobre los `.ts/.tsx` añadidos o modificados: sin salida (0 problemas).
- `pnpm run test:guardias`: 357 archivos pasan y 3 se saltan; 5396 tests pasan y 28 se saltan; 0 rojos.
- `vitest run` de unit y componentes (niveles, jobs-niveles, rastro, plan-form-borrador, plan-borrador-schema,
  PlanFormNiveles, PlanesModule, PlanDetalle, PlanFormPasos, PlanFormRevisar, procesar-jobs-registro): 11/11
  archivos, 248/248 tests.
- `vitest run --no-file-parallelism` de integración, base `servi_logistic_slt215`:
  - plan-nivel-cierre, plan-nivel-recalculo, plan-nivel y migracion-plan-nivel-ida-y-vuelta: 4/4 archivos, 48/48
    tests, ninguno saltado;
  - los afectados por `aplicarEnTx`/`recibirCambio` (plan-borrador-confirmar, planes-version-por-empresa,
    factura-plataforma-cambio-plan, planes-cambio-empresa, planes-asignacion*): 6/6 archivos, 94/94 tests.

## Las desviaciones anotadas por el implementer

1. **Textos de R21 con dos decimales («−10.00 %», «−1500.00»).** R21 pide el monto «en el formato del costo por
   orden», que es `importeCanonico`. Para el porcentaje sigue el formato que ya usan los descuentos del período
   (`valorDelDescuento` en `mensajes.ts`). Coherente: **aceptada**. Ver menor 2.
2. **`plan_nivel_recalcular` devuelve NULL sin fila.**
   - Toda empresa con plan tiene fila: el relleno de R37 la crea y `plan_nivel_tomar_plan` la crea en cada entrada.
   - El único otro sitio que escribe `organizacion.plan_id` es `aplicarEnTx`. No hay otra escritura en la app ni en
     scripts.
   - Una fila que falta solo sale de fixtures antiguos, y la siguiente entrada la trata como primera asignación.
   - **Aceptada.**
3. **En `aplicarEnTx`, el cierre va antes de `salirDelCambioEnTx`** (`lib/repositories/PlanesRepository.ts:1785`).
   Es más correcto que el design: `salirDelCambioEnTx` borra la versión propia, que puede traer los niveles que la
   empresa corría (R16). Sigue bajo el mismo cerrojo de la empresa. **Aceptada.**
4. **`PlanDetalle` pinta también la edición** («Niveles por volumen: antes → después» vía `lineasDeCambioDelPlan`).
   R20 pide la línea en «Esto es lo que cambia», y sin esto una edición de niveles no dejaba rastro visible.
   Probado en `PlanDetalle.test.tsx`. **Aceptada.**
5. **`nivelEscrito` en `textos.ts`.** Usa el mismo formato aprobado de R21, sin canonizar, para un nivel que todavía
   no pasa el esquema en «Revisar», como ya hacen descuentos y topes. No es un texto de producto nuevo. **Aceptada.**
6. **Archivos fuera de `tasks.md`:**
   - `lib/planes/importes.ts` rompe un ciclo de imports real: hoja sin imports de la app, reexportada con los nombres
     de siempre;
   - `lib/planes/consumo.ts` evita un falso «Sin niveles → …» en «Mi plan», cuya vigente no trae niveles hasta
     SLT-216.
   - **Aceptadas.** Ver menor 3.
7. **Migraciones renombradas.**
   - Orden: `20261121130000_pago_plataforma_por_fuera` (última de dev), `20261121140000_plan_nivel_job_enum`,
     `20261121140100_plan_nivel`.
   - El enum va solo, sin `BEGIN` ni uso del valor (55P04). La de tablas va en `BEGIN`/`COMMIT`.
   - Ni SLT-224 ni SLT-143 tocan `job_tipo`, `plan_borrador_pasos_conocidos` ni `plan_nivel*`: no chocan.
   - El test de disco comprueba el orden relativo (`M_ANTERIOR` + 1, + 2), así que no se rompe cuando dev añada
     migraciones posteriores.
   - **OK.** Ver menor 4.

## Hallazgos

Ningún BLOQUEANTE.

1. **menor — tamaño real sobre lo aceptado.** El humano aceptó ~52 archivos y ~1100 líneas de producción, y el PR
   tiene 67 archivos y 1466 líneas. La marca existe y el script no bloquea, pero la cifra aceptada no coincide con la
   real. El leader lo trata con el humano (fuera de esta revisión).
2. **menor — «−10.00 %» frente al ejemplo del design** (`design.md §7`: «−p %»). Es coherente con los descuentos del
   período, pero el humano lo verá distinto del ejemplo. Conviene mencionarlo al pedir el merge.
3. **menor — «Mi plan» no muestra la línea de niveles de un cambio pendiente** (`lib/planes/consumo.ts:120-124`): la
   vigente de `plan_de_la_empresa` no trae niveles. El correo y el detalle del superadmin sí la muestran. Queda para
   SLT-216 «Planes: descuento por nivel en el cobro, la factura y «Mi plan»»: conviene anotarlo en su ficha para que
   no se pierda.
4. **menor — comentario desfasado.** `db/migrations/20261121140000_plan_nivel_job_enum/migration.sql:11` y
   `db/migrations/20261121140100_plan_nivel/migration.sql:32` dicen «va después de … 20261120130000_slt221…». Tras
   el renombrado van después de `20261121130000_pago_plataforma_por_fuera`. Solo es documentación.
5. **menor — bajada silenciosa defensiva.** En `plan_nivel_cerrar_meses`, `v_nivel := LEAST(nivel,
   cardinality(v_metas))` (`migration.sql:224`) puede bajar el nivel y escribirlo sin fila de historial, contra «cada
   bajada se registra» (R35).
   - Hoy es inalcanzable: todo cambio de metas pasa por un recálculo que deja el nivel en rango.
   - Si algún día se alcanza, falta el rastro. Conviene un `RAISE WARNING` o una fila de historial; no bloquea.
6. **menor — riesgo de §10 también en `recibirCambio`** (anotado por el implementer). Con más de un borde de mes de
   retraso, el cierre usa `ahora` y el recálculo usa el mes anterior a `recibeAt`. El barrido es horario y el riesgo
   está documentado.

## Veredicto

**OK**, sin bloqueantes. **Condición para mergear:** `gate-completo` en verde en el PR #254. Al cerrar esta revisión
están en curso los vitest de CI, `e2e (aislamiento)` (que incluye `planes-niveles` y `dos-empresas-humo`) y
`e2e (dinero)`.
