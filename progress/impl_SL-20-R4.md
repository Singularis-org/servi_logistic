# SL-20 — R4: F2.3, merge de `origin/dev` (SL-18 y SL-23)

Rama `feature/SL-20-pais-geografia-configurable`, base HEAD `9b273d2`. `origin/dev` iba 83 commits por delante.
Base de datos: `servi_logistic_sl20` (localhost). `DATABASE_URL` se exportó por comando desde `../../.env`,
cambiando solo el nombre de la base y con una guarda que corta si la URL no acaba en `/servi_logistic_sl20`.

## 1. Conflictos de contenido

| Archivo | Resolución |
|---|---|
| `docs/architecture.md` | Se quedan los dos bloques: «País por empresa (SL-20)» y luego «Módulos por empresa (SL-23)». |
| `lib/db/excepciones-aislamiento.ts` | Se quedan las dos entradas: `lib/actions/geografia-plataforma.ts` (SL-20) y `lib/repositories/PushEndpointPlataformaRepository.ts` (SL-18). |
| `lib/db/modelos-de-negocio.ts` | Cabecera con negocio **78** (77 + `organizacion_modulo` de SL-23) y plataforma **18** (16 + `pais` y `historial_plataforma` de SL-20). Las listas se fusionaron solas. |
| `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts` | `toHaveLength(72)`, que son los 70 más `modulo_activado` y `modulo_desactivado` de SL-23. SL-20 no suma ninguno: los `nodo_geografico_*` se quedan en el enum, sin escritor. Se conservan los dos comentarios. |

## 2. Migraciones renombradas (timestamps posteriores a `20261026120200_job_estado_descartado`)

Se mantiene el orden de la decisión 1 (`organizacion_pais` antes que `geografia_por_pais`):

| Antes | Ahora |
|---|---|
| `20261026120000_pais` | `20261026130000_pais` |
| `20261026120100_organizacion_pais` | `20261026130100_organizacion_pais` |
| `20261026120200_geografia_por_pais` | `20261026130200_geografia_por_pais` |
| `20261026120300_geografia_del_pais_de_la_empresa` | `20261026130300_geografia_del_pais_de_la_empresa` |
| `20261026120400_historial_plataforma` | `20261026130400_historial_plataforma` |
| `20261026120500_pais_disponible` | `20261026130500_pais_disponible` |

- El SQL ejecutable es el mismo, sin comentarios, que en `9b273d2`. Se comprobó con `cmp` en las seis.
- Solo cambian los comentarios que nombran los timestamps.
- Referencias actualizadas:
  - los `migration.sql` y `down.sql` de las seis;
  - `db/schema.prisma`, solo el bloque de SL-20 (la línea 789 es de SL-23 y sigue con `20261026120000`);
  - `lib/db/errores-pais.ts`;
  - `lib/repositories/registrar-accion-plataforma.ts`;
  - `tests/fabricas/etiquetas-geograficas.tsx`;
  - `specs/SL-20-…/design.md` (§3 y el rango «130100–130500») y `tasks.md`;
  - `tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts`: las constantes `M_*`, y `PREVIA`, que ahora es `20261026120200_job_estado_descartado`. La base propia del test aplica todo lo anterior a `M_PAIS`, es decir, ya incluye SL-18 y SL-23.
- Las bitácoras anteriores (`progress/impl_SL-20*.md`) se dejan como registro histórico, con los nombres viejos.

## 3. Interacción con lo que trajo dev

- **`modulos-reparto.guardia` (SL-23) en rojo tras el merge.** Seguía `/configuracion/geografia` y faltaban `/plataforma/geografia` y la action `geografia-plataforma`.
  - `backend_dev` corrigió `lib/modulos/reparto.ts`: la ruta `/plataforma/geografia` y la action `geografia-plataforma` entran como `nucleo`, y se ajustó el comentario de recuento.
  - Ningún otro código de SL-23 (menú, `CONSUMOS_ENTRE_MODULOS`) nombraba la ruta vieja.
- **`historial_accion_modulos` frente a `historial_plataforma`.**
  - No se pisan: SL-23 añade valores a los enums de `historial_accion`, y SL-20 escribe en su propia tabla `historial_plataforma`.
  - La guardia de escrituras queda en 72 y su sección 1b (SL-20) sigue verde.
- **`organizacion_modulo` frente a `organizacion.pais_id`.**
  - Son independientes. `organizacion_modulo` tiene FK a `organizacion(id)` y no lee `pais_id`.
  - El trigger `organizacion_pais_inmutable` solo mira `pais_id`.
- **Unicidad por empresa (SL-18) frente al alta con país.**
  - `usuario_unico_por_empresa` solo toca los índices de `usuario`. El alta de empresa con `paisId` no cambia.
  - Se arregló un rojo de SL-20 que el merge no causó y que estaba también en `9b273d2`: en `tests/unit/actions/organizaciones-action.composition-root.test.ts`, el mock de `pais.findUnique` no devolvía `disponible`, y desde la decisión 6 el alta lo exige (R45). El mock ahora devuelve `{ id: "CR", disponible: true }`.

## 4. `servi_logistic_sl20`

`prisma migrate deploy` aplicó sin problema las seis de dev. Con `20261026130000_pais` falló, con P3018/42P07 («la relación pais ya existe»): la base ya tenía las seis de SL-20 con su nombre viejo.

**Sin reset.** Como el SQL es idéntico, se reconcilió el registro de migraciones:

1. `prisma migrate resolve --rolled-back 20261026130000_pais`. La migración falló en su primera sentencia, así que no dejó nada a medias.
2. `prisma migrate resolve --applied` para las seis con su nombre nuevo.

Después:

- `migrate deploy` da «No pending migrations to apply».
- `prisma migrate diff --from-config-datasource --to-schema db/schema.prisma --script` da «This is an empty migration».

En `_prisma_migrations` quedan las seis filas con el nombre viejo, huérfanas: Prisma las lista como «not found locally», pero no bloquean. No se borraron a mano.

## 5. Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm run typecheck`: verde, antes y después del arreglo de `reparto.ts`.
- `pnpm run lint`: 0 errores y 230 warnings, todos previos.
- `pnpm exec vitest run tests/unit/guards` (más el composition-root y `carga-division-service`): `Test Files 1 failed | 225 passed (226)`, `Tests 4 failed | 3127 passed | 1 skipped`.
  - Los 4 rojos son de `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json`: deuda ajena, no es un hallazgo.
- Unitarios y de componente de SL-20 (los 66 archivos de `tests/unit` y `tests/components` que tocó la rama). En la primera pasada, `2 failed | 64 passed`, `Tests 3 failed | 1331 passed`:
  - el composition-root: 2 tests, arreglados (§3);
  - `carga-division-service.test.ts` › «CONTRAPRUEBA: exactamente 5 MB…»: rojo con la tanda en paralelo y verde al repetirlo (aislado y luego con las guardias). Parece inestable por carga y queda anotado.
- `pnpm exec vitest run tests/integration/db/migracion-sl20-ida-y-vuelta.test.ts`: `Test Files 1 passed (1)`, `Tests 6 passed (6)`.
- `modulos-reparto.guardia` y `menu-modulos.test.ts`, corridos por `backend_dev`: `2 passed`, `55 passed`.

No se corrió `./init.sh` ni la suite completa. No se tocó ninguna base distinta de `servi_logistic_sl20`. No entró ninguna dependencia nueva.
