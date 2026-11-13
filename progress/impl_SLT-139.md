# impl SLT-139 «Pago al mensajero independiente del efectivo: satélite»

> backend_dev, 2026-11-12. Tanda pedida: T0-T10. **PARADO en T0.2**: la medición da 41 archivos (> 40),
> y `tasks.md > T0.2` y el leader piden parar y avisar antes de seguir.

## Entorno

- Worktree al día con `origin/dev` (0df9f7b0 es ancestro de HEAD). Junction de `node_modules` creado.
- Base desechable `slt139_satelite`: base nueva + `prisma migrate deploy` (todas las de `dev`, EXIT 0) +
  `pnpm run db:seed` (EXIT 0). Las dos migraciones de SLT-139 **aún no** están aplicadas en ella.
- `prisma generate` desde este worktree:
  - 2026-11-12 19:35:25 — tras añadir `pago_satelite` a `schema.prisma`. Comprobado: el `index.d.ts` del
    cliente compartido (`@prisma+client@7.8.0_…/node_modules/.prisma/client/index.d.ts`) contiene
    `pago_satelite`.

## T0.1 — definiciones vigentes (base desechable, todas las migraciones de `dev`)

`pago_mensajero_movimiento_tipo_categoria_check` (`pg_get_constraintdef`):
`CHECK (((tipo = 'devengo') AND (categoria = ANY (ARRAY['pago_devengado','ajuste_devengo','premio_ranking','incentivo']))) OR ((tipo = 'pago') AND (categoria = ANY (ARRAY['pago_efectivo','liquidacion','ajuste_pago','reverso_incentivo'])))))`

`pago_mensajero_movimiento_origen_uq` (`pg_indexes`):
`CREATE UNIQUE INDEX … USING btree (origen_tipo, origen_id, mensajero_id, categoria) WHERE ((origen_id IS NOT NULL) AND (categoria <> ALL (ARRAY['premio_ranking','ajuste_pago','incentivo'])))`

Coinciden con `design.md > 3.2`. Además existen `…_incentivo_origen_check` y `…_premio_dia_check`; ninguno
cambia.

## T0.2 — qué cae con R336 (la marca en el `updateMany` que aprueba, para todo destino)

Método: 26 archivos de `tests/integration/` que nombran `pago_efectivo`, «Pago del efectivo», «La central
debe», «se paga del efectivo» o `marcarConciliado`, corridos contra `slt139_satelite` dos veces: con R336
aplicado a mano (sin commitear) y con `CierresAdminRepository.ts` de HEAD. La diferencia es lo que causa
R336; lo que cae en las dos corridas es del entorno (base solo con catálogos: «`orden` vacía», «`usuario`
tiene menos de 2 filas»; todos esos archivos están en `tests/baseline-rojos.json`) o del enum nuevo.

| Archivo | Cae por | Previsto en tasks.md |
|---|---|---|
| `tests/integration/db/slt123-pago-independiente.int.test.ts` (casos 2, 6, 7) | R336: S1 de satélite aprobado ahora lleva la marca | sí |
| `tests/integration/db/slt73-marcar-asienta.int.test.ts` (5 casos: R10, R12 ×2, R20, R22) | R336: sus cierres pasan a nuevos; el libro ya no lleva `pago_efectivo` | sí |
| `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts` (4 casos: CONTROL, R16/R17, R16/D15, R20) | R336: aprueba satélites con `aprobar` real y espera `pago_efectivo` | **no** |
| `tests/integration/db/liquidacion-migration.test.ts` (1 caso, línea 277) | enum: `AGREGADAS_DESPUES` no excluye `pago_satelite` (no está en baseline: rojo nuevo en CI) | **no** |
| `tests/integration/db/premio-ranking-devengo-migration.test.ts` (líneas 86 y 189) | enum: `CATEGORIAS_DE_SLT68` no excluye `pago_satelite` (el archivo está en baseline por otro motivo) | **no** |

Unit con filas de marca `true`: `cierre-dia-pendiente-pago`, `cierres-admin-pendiente`,
`liquidacion-service`, `pendiente-cierre` (ya en la lista de ampliados), `wallet-mensajero-feed-service`
(el diseño lo prevé verde sin cambios) y `liquidacion-pago-repository` (repositorio, no lo toca la ficha).
Los integración que construyen servicios con un doble de premios sin la lectura y un cierre nuevo solo
se pueden medir con T6 escrito: no medidos.

E2E: no corridos (T11.2, fuera de esta tanda). Candidatos por texto: `ajuste-pago-mensajero-cierre`,
`cierre-bodega-satelite`, `cierre-modelo-nuevo-plan-porcentual`, `tarifas-valor-propio-mensajero`,
`wallet-mensajeros`.

Ajuste a `## Archivos esperados`: `tests/unit/repositories/cierre-bodega-repository.test.ts` **no** hace
falta (no fija la fila ni el `select`): −1.

**Total medido: 41 archivos** = 23 producción + 2 tests nuevos + 8 ampliados + 3 con la marca de la fila
consolidable + 5 existentes que caen (2 previstos + 3 nuevos). Por encima de 40 → PARA (tasks.md T0.2).
Si `premio-ranking-devengo-migration` no se tocara (está en baseline), 40; no lo recomiendo: quedaría un
test que afirma un catálogo falso.

## T0.3 — `Record` que señala el typecheck con el enum nuevo

Con `pago_satelite` solo en `schema.prisma`: `lib/types/wallet-mensajero.ts` (guardia de exhaustividad
del SEED) y, en cascada, `EstadoCuentaRepository.ts` y `PagoMensajeroMovimientoRepository.ts` (tipos
derivados del SEED; se resuelven solos con el SEED). Con el SEED al día:
`wallet-mensajeros-labels.ts` (`CATEGORIA_PAGO_LABEL`), `aporte-por-orden.ts` (`FUENTE_MENSAJERO`),
`estado-cuenta-chips.ts` (`CHIP_POR_CATEGORIA_MENSAJERO`). `metrics.ts` no es `Record` (lista). Coincide
con `design.md > 7`; sin archivos nuevos.

## T0.4 — DIFERIDA

Consulta de solo lectura a prod bloqueada para agentes; informativa (decisión de Carlos PA3).

## Lo que queda en la rama (commit de esta tanda)

Hecho y con typecheck en verde (`pnpm run typecheck` EXIT 0), **sin** tests de esta ficha todavía:
- T1.1 `db/schema.prisma`: `pago_satelite` con comentario. `prisma validate` y `prisma generate` OK.
- T1.2/T1.3 (solo los archivos): `db/migrations/20261115120000_pago_satelite_enum/{migration,down}.sql`,
  `db/migrations/20261115120100_pago_satelite_checks/{migration,down}.sql`. **No aplicadas ni probadas**
  (falta subir, revertir y el aborto con una fila `pago_satelite`; T1.4).
- T9.1 (solo el código): `pago_satelite` en los dos SEED, `CATEGORIA_PAGO_LABEL`, `FUENTE_MENSAJERO`,
  `CHIP_POR_CATEGORIA_MENSAJERO` y `cuenta_por_pagar_mensajero.definicion.categorias`.

**No** commiteado: R336 (`CierresAdminRepository.resolverCierre`). Se aplicó a mano solo para medir T0.2
y se devolvió a HEAD: sin el feed (T3) y la lectura (T4-T6) deja dinero contradictorio.

Rojo conocido que deja esta rama hasta T11: `liquidacion-migration.test.ts` y
`premio-ranking-devengo-migration.test.ts` (catálogo del enum).

## Veredicto

PARADO en T0.2: 41 archivos (> 40). El leader decide antes de seguir con T1.4-T10.
