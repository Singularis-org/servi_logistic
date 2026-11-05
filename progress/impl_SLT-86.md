# impl SLT-86 — Planes: período de facturación de calendario por empresa y sin tope de órdenes

Bitácora del implementer. Se completa por tandas; T13 la cierra con el mapa completo y los tests retirados.

## Tanda 1 — T0 y T1 (2026-11-05)

### Commits
- `229ddce1` merge de `origin/dev` (SLT-83 incluida, `8eb66b88`), sin conflictos.
- `0999df40` docs(SLT-86): T0 integra dev tras SLT-83 (§9, §12, archivos esperados).
- `e0362b2c` feat(SLT-86): T1 migración y esquema del período de facturación.

### Archivos
- T0: `specs/SLT-86-planes-periodo-facturacion/design.md` (§9, §12) y `tasks.md` (35 tests añadidos a «Archivos
  esperados»; T0 marcada).
- T1, creados: `db/migrations/20261106120000_plan_periodo_facturacion/migration.sql`, `down.sql` y
  `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.
- T1, modificados: `db/schema.prisma`, `lib/db/modelos-de-negocio.ts` y `tasks.md` (T1 marcada).

### T0: SLT-83 contra el spec
- R23 y R24 de SLT-83 se cuentan en SQL con `plan_cobro_del_ciclo(org, p_desde)`. Esa función se llama desde
  `plan_de_la_empresa` y desde `PlanesRepository.planDeEmpresa`.
- Basta pasar el inicio del período de calendario en `p_desde`. No cambia ningún requisito.
- El timestamp `20261106120000` queda detrás de `20261104150200`, la última migración de dev.

### Mapa R → test (parcial, de esta tanda)
Todos los casos están en `tests/integration/db/migracion-slt86-ida-y-vuelta.test.ts`.

| R | Qué cubre |
|---|---|
| R33 | P3 rechaza (plan y versión pendiente) sin cambiar nada; conversión del precio anual a descuento anual con el mismo coste; versiones pendientes; orden y `down.sql` |
| R34 | Rastro `editado` «Sistema (migración SLT-86)»; se retiran el trigger, `plan_cupo_ordenes` y la columna |
| R35 | Todas las empresas con plan entran hoy a las 00:00 sin ciclo corto; `plan_de_la_empresa` da el tramo hasta el 1 de enero |
| R36 | Seis negativas del `down` con la foto intacta; el `down` limpio restaura esquema, md5 de funciones, ACL, triggers y RLS; la vuelta a subir es idempotente; cuerpos literales |
| R1, R10, R32 (parte de base) | Los CHECK dan 23514; `servi_app` recibe 42501 en las dos tablas nuevas |

### Salida real
- Base `servi_logistic_slt86` en localhost:5432: creada; migraciones y seed aplicados.
  - El `db:rollback` de la migración nueva funciona.
  - Se vuelve a aplicar con `migrate deploy` y la base queda migrada.
- `prisma generate`: ok. `prisma migrate diff` entre la base y el esquema da vacío.
- `migracion-slt86-ida-y-vuelta.test.ts`: 1 archivo, 15 passed, 0 skipped.
- `test:guardias`: 329 archivos ok y 2 rojos; 4613 tests ok, 4 rojos, 4 skipped.
  - `dependencias-declaradas-presentes.guardia` está en `tests/baseline-rojos.json`.
  - `filtros-url-r25` pasa cuando se corre solo; falló por carga.
  - Corridas aparte, `organizacion-en-modelos`, `unicos-por-empresa`, `fk-misma-empresa`, `rls-por-empresa`,
    `planes-sin-borrado` y `planes-sin-seed` dan 6 archivos y 70/70.
- eslint de los TS tocados: 0 errores.
- typecheck: **48 errores esperados**, todos de columnas que se retiran y que limpian T4, T8 y T9.
  - Por columna: `topeOrdenesCiclo` 18, `planCicloCortoDesdeAt` 13, `precioAnual` 4, `descuentoAnualPct` 4, más
    errores derivados.
  - Archivos: `PlanesRepository.ts` (10), `planes-catalogo` (7), `planes-cambio-programado` (6),
    `e2e/planes-superadmin.spec.ts` (6), `planes-acceso-servi-app` (5), `planes-asignacion-inicio-ciclo` (3),
    `planes-crear-custom-asigna` (3), `planes-cambio-correos` (2), `plan-topes-concurrencia` (2), y uno en cada
    uno de `_fixtures/planes.ts`, `mi-plan-repository`, `plan-de-la-empresa` y `planes-cambiar-tipo-cobro`.

### Avisos de la tanda
- T1 reescribe `plan_de_la_empresa` (§3.3), porque la migración borra columnas que su cuerpo viejo leía. A T3 le
  toca probarla.
- `MiPlanRepository`, `consumo.ts` y `costeo.ts` todavía esperan `precio_anual`, `tope_ordenes_ciclo` y
  `ciclo_corto_desde` en tiempo de ejecución. Los arreglan T5, T6 y T9.
- `plan_precio_historial.desde_at = -infinity` no se puede leer como `DateTime` de Prisma. T9 lo lee con SQL crudo
  o con `::text`.
- Formatos elegidos donde §1.2 no dice nada:
  - en `descuentos`, los importes van como texto, con la forma de `PrecioPlan.descuentos`;
  - `precio_del_periodo` es `{precio_mensual, descuentos}`;
  - hay un CHECK extra para los cuatro tipos en `plan_cambio_tipo_cobro`.
- **Abierto:** una empresa sin plan pero con una primera asignación pendiente (P4 = a) recibe NULL de
  `plan_de_la_empresa`, así que «Mi plan» no le muestra el cambio pendiente (R26). Lo deciden T3/T9.
- Entorno: hubo que correr `pnpm install --frozen-lockfile --ignore-scripts` en el worktree. No entró ninguna
  dependencia nueva y el lockfile quedó igual.
