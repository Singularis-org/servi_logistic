# review SLT-126 «Cobro por orden: retirar el valor propio de la empresa»

> reviewer, 2026-11-11. Rama `feature/SLT-126-cobro-retirar-valor-empresa`, diff `origin/dev...HEAD`
> (11 commits, 57 archivos, +2 234 / −974). Ruta completa (migración, `.prisma`, `.sql`, dinero): el suelo
> se respeta. Grafo: el worktree no está indexado; todo con Grep/Read y ejecución.

## Veredicto: RECHAZADO (solo por proceso; el código está bien)

No hay ningún hallazgo bloqueante en el código, la migración ni los tests. El rechazo es por dos tasks
abiertas que le tocan al leader, no al implementer (B1, B2). En cuanto el leader las cierre, el veredicto
pasa a OK sin otra vuelta del implementer.

## Checklist

### Ruta y especificación
- [x] Ruta completa (toca dinero y `db/`): requirements (EARS R1–R13 + D1), design y tasks presentes.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no vuelve a crear nada de esa tabla: reutiliza
      `PlanesService.crear` y `PlanesRepository.crearYAsignar` sin cambios.
- [x] Alternativas descartadas en el design §6, con su porqué.
- [ ] Tasks: T1–T9 `[x]`; **T0 y T10 siguen `[ ]`** → B1, B2.
- [x] Tamaño: `node scripts/tamano-pr.mjs` da 57/40 archivos y 2 168/1 000 líneas. La línea
      `<!-- tamano-pr-aceptado: 2026-11-11 · … -->` está en `progress/features/SLT-126.md` (P0).

### Trazabilidad (R → test, leído el test, no solo el nombre)
- [x] R1: `EmpresasModuleCobro.test.tsx` «R1: sin «Cambiar», sin «Usar el global»…» revisa botón, textbox,
      form y spinbutton en cada celda y en toda la tabla. E2E `cobro-plataforma-sl40.spec.ts` (`sinEditorPorFila`).
- [x] R2: `cobro-plataforma.composition-root.test.ts` (las exportaciones son exactamente las dos del global),
      `cobro-plataforma-service.test.ts` (`forbidden` en `verGlobal`/`fijarGlobal`; sin `fijarDeEmpresa`).
- [x] R3: `EmpresasModuleCobro.test.tsx` («del plan», «global», `sin_configurar` → «global», nunca «propio»).
      E2E «SLT-126 R3» con un plan custom real de 300.
- [x] R4: el texto exacto está en el test como literal, no importado del componente
      (`getByText` + `toHaveAccessibleDescription`). Coincide palabra por palabra con P1. También en el E2E.
- [x] R5: `cobro-plataforma-sin-valor-empresa.test.ts`, las cuatro ramas sobre la base migrada: porcentual
      (congela, sin cargo al crear y 2 000 «plan» al entregarse), fijo, plan sin costo y sin plan → global,
      sin global → 0,00 `sin_configurar`.
- [x] R6, R7: `migracion-slt126-ida-y-vuelta.test.ts`. E (propio 80 + plan 100) → 100 «plan»; G (propio 80,
      sin plan) → 50 «global»; P (propio 80 + plan 2 %) → congela y luego 2 000 «plan». Hay un barrido de
      que ninguna orden nueva tiene fuente `empresa`. La mutación de la bitácora (rama vieja repuesta) tumba
      estos casos.
- [x] R8: anular y recuperar O1 da `cargo/reverso/cargo 80.00 empresa`, y su traza `empresa ±80.00`. El
      reverso de O2 (sin plan) no toma el global de hoy.
- [x] R9: libro completo antes y después (cuenta, Σ con signo y md5 fila a fila de movimientos y trazas, Σ
      por empresa y deuda SL-45 R13 por empresa). Sale igual.
- [x] R10: columna y CHECK ausentes (`information_schema`). Ninguna función de `public` contiene el nombre
      en `pg_get_functiondef`. `enum_range` sigue siendo `{empresa,global,sin_configurar,plan}`.
- [x] R11: `cobro-plataforma-sin-valor-empresa` (tarifa y `plan_de_la_empresa` = fuente del cargo; barrido
      de toda la base sin `empresa`), `plan-de-la-empresa-costeo.test.ts` «SLT-126 R11»,
      `ConsumoDelPlanCosteo.test.tsx` y `PlanEmpresaSinCosto.test.tsx` (sin «precio acordado para tu empresa»
      ni «excepción de la empresa»).
- [x] R12: `down.sql` devuelve columna y CHECK. El md5 de `cobro_plataforma_tarifa_de` es el de antes y la
      foto de esquema, funciones, triggers, privilegios y políticas no tiene diferencias. NULL en todas las
      empresas. La regla vieja vuelve (propio 70 → «empresa») y el CHECK muerde (`23514`).
- [x] R13: `demo-qa.test.ts` «SLT-126 R13». Plan custom exclusivo de la empresa, `costo_por_orden = 100.00`,
      sin porcentual. Cargos agrupados = `[plan, 100.00, n = órdenes]`. Módulos iguales antes y después. El
      pago a la plataforma lo cubre el caso de la primera ejecución.
- [x] Mapa `R<n> → test` en `progress/impl_SLT-126.md`.

### Lo que pidió mirar el leader
- [x] **Precedencia plan > global.** `migration.sql` reemplaza `cobro_plataforma_tarifa_de` con el mismo
      `RETURNS TABLE`, `STABLE SECURITY DEFINER SET search_path`, y un cuerpo con este orden: plan
      porcentual > plan fijo > global > 0,00 `sin_configurar`. Sin `v_excepcion` y sin leer la columna.
      `CREATE OR REPLACE` conserva dueño y `REVOKE`; R12 lo comprueba con `proacl` en la foto.
- [x] **Las órdenes ya creadas conservan su importe.** Los triggers de anulación y recuperación no cambian:
      copian fuente y monto del último movimiento. R8 y R9 lo prueban sobre órdenes con cargo `empresa`
      anteriores a la migración.
- [x] **`down.sql` fiel y reversible.** Lo comparé con un script: el cuerpo de la función, desde
      `RETURNS TABLE` hasta `END $$;`, es idéntico byte a byte al de 20261104150200 §3. La columna
      (`DECIMAL(12,2)`) y el CHECK (mismo nombre y expresión) coinciden con 20261023130000. El orden es
      columna → función. Los valores no vuelven, como manda R12/P3.
- [x] **El enum conserva `empresa`.** La migración no toca el tipo, `CobroPlataformaFuente` de
      `schema.prisma` no cambia, y R10 lo afirma.
- [x] **Ningún uso queda vivo.** `git grep` (sin `db/migrations`, `specs`, `progress` ni `docs`) de
      `cobro_plataforma_por_orden|cobroPlataformaPorOrden|fijarDeEmpresa|fijarCobroEmpresa` solo encuentra
      tests de migración a punto fijo y aserciones negativas. En `app/`, `lib/`, `components/` y
      `scripts/` no queda la fuente `"empresa"` del costo vigente ni el rótulo «propio» del cobro (los
      «propio» que siguen son de caja/analítica y no tienen relación). `FuenteDelCosto` y el `z.enum` de
      `MiPlanRepository` ya no la incluyen.
- [x] **Demo de QA con plan fijo de 100.** `PlanesService.crear` crea un custom `Demo QA <clave>` con
      `organizacionId`, `ORDEN_MODULOS`, sin topes, `sin_precio`, `costoPorOrden: "100.00"` y `mensual`.
      Va en el mismo `enParalelo` de antes y antes de la primera orden. Un `estado !== "ok"` lanza. El
      CASCADE de `plan.organizacion_exclusiva_id` se lo lleva al borrar la demo.

### Checkpoints (`CHECKPOINTS.md` + `docs/checkpoints-proyecto.md`)
- [x] Typecheck: `pnpm run typecheck` → exit 0 (corrido por mí).
- [x] Lint: `eslint` sobre los 50 `.ts/.tsx` añadidos o modificados → exit 0, sin salida (corrido por mí).
      El implementer reporta `pnpm run lint` completo con 0 errores y 243 warnings.
- [x] Guardias: `pnpm run test:guardias` → `1 failed | 339 passed | 3 skipped (343)`. Los 4 rojos son de
      `dependencias-declaradas-presentes.guardia.test.ts` (guardia 420), que está en
      `tests/baseline-rojos.json`: rojo heredado, no hallazgo.
- [ ] `./init.sh` verde: corta en el validador del board por el exceso de cupo backend (aceptado por la
      épica geo, ajeno a la rama). Las demás etapas del rápido (typecheck, lint, guardias, tests
      relacionados) las corrí por separado y salen verdes → B2.
- [ ] `gate-completo` en CI: pendiente; todavía no hay PR.
- [x] Migración nueva con `down.sql`; no edita ninguna migración ya aplicada.
- [x] Sin tabla nueva ni query de negocio nueva. La RLS y el «solo lectura» de `organizacion` para
      `servi_app` no cambian. `cobro_plataforma_tarifa_de` sigue sin `GRANT` a `servi_app`.
- [x] La autorización sigue en el servidor: `CobroPlataformaService` comprueba `esPlataforma` antes de
      validar; la action solo baja por props.
- [x] Sin dependencias nuevas, secretos, literales de país/moneda nuevos ni recursos de Ordenex.
- [x] E2E de los flujos afectados, con constancia en la bitácora (T9): `plataforma-vacia`, `aislamiento`
      (`cobro-plataforma-sl40`, `pago-plataforma-sl45`, `dos-empresas-humo`, `planes-*`, …) y `dinero`
      entero, sobre una base desechable. Las corridas 3 y 4 salen seguidas en verde.
- [x] Comentarios: explican el porqué (reloj real en la demo, orden función → columna, `z.enum` sin
      `empresa`). Algunos solo apuntan historia («SLT-126: …»); no es motivo de rechazo.

### Ejecutado por el reviewer (salida real)
- Unit y componentes del diff (14 rutas, 32 archivos): `Test Files 32 passed (32) · Tests 597 passed (597)`.
- Integración, base `servi_logistic_slt126` local: `migracion-slt126-ida-y-vuelta`,
  `cobro-plataforma-sin-valor-empresa`, `plan-de-la-empresa-costeo`, `cobro-plataforma-cargos`,
  `pago-plataforma-sl45-blindaje`, `cobro-plataforma-plan` → `Test Files 6 passed (6) · Tests 68 passed (68)`.
- `demo-qa.test.ts`: `Tests 13 passed (13)`. Corrida 1: código 0 en 24,5 s; corrida 2: código 0 en 23,4 s.
- `pnpm run typecheck`: exit 0. `eslint` de los archivos del diff: exit 0.
- `pnpm run test:guardias`: solo los 4 rojos de la guardia 420, que está en el baseline.

## Hallazgos

### BLOQUEANTE

**B1 — BLOQUEANTE (proceso, leader). T0 sigue `[ ]` y D1 no tiene responsable.**
`tasks.md:10` pide que la consulta de D1 y quién la corre en producción queden escritos. La consulta está
en `progress/features/SLT-126.md > Deudas`, pero el responsable dice «por fijar en T0». Esta feature borra
datos de dinero sin copia (P3): el informe de D1 es el único registro de los importes. Para levantarlo:
nombrar al responsable (con acceso de lectura a producción) en esa línea y marcar T0 `[x]`. El informe
mismo se adjunta antes del merge a `prod`, como dice T0; no hace falta para el merge a `dev`.

**B2 — BLOQUEANTE (proceso, leader). T10 sigue `[ ]` y `./init.sh` no llega a verde.**
`./init.sh` corta en el validador del board por el cupo backend 6/5. Es estado del board, no de esta rama,
y el leader dice que el exceso está aceptado por la épica geo. Las etapas de código del rápido salen verdes
cuando las corro por separado (arriba). Para levantarlo: el leader deja escrita en
`progress/features/SLT-126.md` la excepción al validador (cupo aceptado por geo, con su fecha) junto con
esta evidencia por etapas, o corre `./init.sh` cuando el board vuelva al cupo. Luego marca T10 `[x]`.
El código no cambia.

### menor

**m1 — menor.** Las ramas de R5 en `cobro-plataforma-sin-valor-empresa.test.ts` no siembran ningún valor
propio, así que con la función vieja darían lo mismo. La mutación 3 tumbó el archivo solo porque la columna
ya no existía. El test que de verdad distingue la regla nueva de la vieja es el de ida y vuelta (R6/R7).
Como la cobertura de R5 está bien repartida entre los dos, no pido cambio.

**m2 — menor.** La cabecera de `progress/features/SLT-126.md` sigue con estado `pending`, «(sin asignar en
feature_list.json)» y «Pendiente de aprobación (F1.4). Sin código». Está desactualizada; la ajusta el leader
al cerrar.

**m3 — menor.** Algunos comentarios solo apuntan historia, por ejemplo `page.tsx` «SLT-126: la del valor
propio ya no existe» y `costeo.test.ts` «SLT-126: fuera los casos…». No es motivo de rechazo
(`docs/conventions.md`: el porqué, no el qué).

## Los desvíos declarados por el implementer

| # | Desvío | Juicio |
|---|---|---|
| 1 | `pago-plataforma-sl45-blindaje`: plan fijo de 500,00 en lugar de 300,00 | **Correcto.** El archivo sembraba 500 en A y B; el design quería «mismo importe» para no tocar las expectativas de deuda. Lo que estaba mal era la cifra del design. |
| 2 | `tope-intentos-migration` y `migracion-sl40-ida-y-vuelta` corridos sin tocar | **No es un desvío.** Es lo que pide el design §5.2 («No se tocan… el implementer los corre»). Verdes. |
| 3 | `cobro-plataforma-plan`: p1 de B se queda como 100,00 «plan» en lugar de borrarse | **Aceptado.** Conserva la orden que usan los pasos siguientes del archivo y prueba la rama `plan` en lugar de la excepción. Sin pérdida de cobertura. |
| 4 | `ConsumoDelPlan.CostoDelCiclo`: `<li>` con el texto, sin el `<span>` | **Aceptado.** Sin la nota, el envoltorio no servía. Cambio de marcado mínimo, y el test se ajustó a la forma nueva sin perder la aserción de «sin nota». |
| 5 | `CeldaCobroEmpresa` sin `flex-col gap-2` | **Aceptado.** Con un solo bloque de lectura, el contenedor flex no hace nada. Cosmético. |
| 6 | `PlanesService` en la demo con el reloj real y no con `ahora` | **Aceptado.** El trigger de alta lee `organizacion.plan_id` sin mirar fechas, así que el cargo de 100 no depende del reloj del servicio. Con `ahora`, el caso R28 («cortada a mitad») dispararía su reloj que lanza antes de la primera orden, y eso cambiaría lo que ese test mide. Queda explicado en un comentario en `receta.ts`. |
| 7 | `e2e/_planes-fixture.ts`: `costoPorOrden` opcional en `asignarPlanCustom` | **Aceptado.** Por defecto vale `null`, así que los demás llamadores no cambian. Permite una fila «del plan» en el E2E con el repositorio real en lugar de un `UPDATE` a mano. La empresa A es nueva en cada corrida, así que el plan de 300 no se cuela en otros specs. |
| — | Residuo de `plan_rastro` por corrida de la demo | Ya estaba aceptado en el design §4; anotado en Deudas. |

## El rojo E2E de `tope-intentos-por-empresa.spec.ts:493`

**No veo relación con el diff.** Las razones:
- El spec no importa nada de lo que toca la rama: ni `_planes-fixture`, ni el cobro por orden, ni
  `plataforma/empresas`. Sus imports son fábricas de usuarios y empresas, cierres, crons, `pulsar` y la
  activación de tarifas.
- El timeout fue en `pulsar.ts:30`, al abrir «Ver / decidir» en `/cierres-admin`, una pantalla que el diff
  no toca.
- Lo único de la rama que corre en ese spec es el trigger de alta de cada orden, que ahora llama a una
  `cobro_plataforma_tarifa_de` con una lectura menos. Eso no puede añadir 30 s.
- Ese mismo spec ya tumbó #97 por inestabilidad de tiempo (`docs/perfil-agentes.md > Por qué`). Pasó en
  3 de 4 corridas y también solo. La corrida que falló tardó 13,3 min frente a 8,2: carga de la máquina.

No está en `tests/baseline-rojos.json`. Por el perfil, se arregla en una rama `chore/`. Para esta feature no
es hallazgo, pero conviene registrarlo como deuda del proyecto: con `failOnFlakyTests` puede tumbar el CI de
cualquier PR a `prod`.
