# review_SLT-63 — SLT-63 «Recolección recibida en central sigue a nombre del mensajero» (HOTFIX a prod)

Reviewer, 2026-10-31. Rama `hotfix/SLT-63-recoleccion-recibida-libera-mensajero`, base `origin/prod`
(603aad68). Diff revisado: `a623ab7d..4ec67e04`. Grafo MCP no usado: exploración con Grep/Read.

## Checklist

- [x] `requirements.md` en EARS (R1–R12), con decisiones D1/D2 y alcance.
- [x] `design.md` abre con `## Lo que ya existe`, no vacía; el diff no re-crea nada de esa lista
      (reutiliza `recibirEnBodegaCentral`, el molde de limpieza del trío y `_postgres-real.ts`).
- [x] `design.md` con alternativas descartadas (§4, cuatro).
- [ ] `tasks.md`: T1–T6 en `[x]`; **T7 (`./init.sh` en verde) en `[ ]`**: depende del gate del leader
      (ver «Gate» abajo).
- [x] Trazabilidad: cada R1–R12 tiene un test concreto con aserciones reales (tabla abajo), y el mapa
      está en `progress/impl_SLT-63.md`.
- [x] Los tests de integración no pueden pasar vacíos: `describe.skip` sin base (sale `skipped`), la
      siembra lanza ante catálogos ausentes y cada caso fija su precondición (p. ej. R1 exige que la
      orden llegara con Ana; R9 tiene la contraprueba `deCarla`; R11 exige mensajero y `asignado_at`
      antes del UP).
- [x] Tests relacionados corridos por mí contra `servi_slt63`: 5 archivos, **45/45 passed, 0 skipped**
      (los dos de integración, los dos unitarios y la guardia de `asignado_at`).
- [x] Migración con `down.sql`; no edita ninguna migración aplicada; timestamp posterior a la última
      de prod y de dev.
- [x] Sin tabla nueva, sin SQL de negocio nuevo fuera de la migración (que corre como dueño, a propósito).
- [x] Sin literales de país/moneda, sin recursos de Ordenex, sin dependencias nuevas, sin secretos en
      el diff.
- [x] Capas: escritura en el repo, decisión (`liberaAsignacion`) en el service; firma obligatoria sin
      valor por defecto.
- [x] Comentarios explican el porqué (138/R18 acotado, atomicidad, R9).
- [~] Flujo crítico «Asignación y recepción de órdenes»: no hay E2E de la recepción central ni de
      «Recolectadas hoy» (ver m4).

## Trazabilidad R → test (verificada leyendo el test)

| R | Test | ¿Verifica de verdad? |
|---|---|---|
| R1 | I › «R1: …NULL» + unit repo + unit service | Sí: siembra por el camino real, precondición «llegó con Ana», tres columnas a NULL |
| R2 | I › «R2: …no transiciona…» | Sí: service (`ya_recibida`, `estado_invalido`) y repo directo con `liberaAsignacion: true` → `false` y trío intacto |
| R3 | I › «R3: …devolución conserva…» + unit repo/service | Sí: `ok`, `por_devolver_a_tienda`, Carla + `asignado_at` + `fecha_reparto` no nulos |
| R4 | I › «R4: …» | Sí: guía igual, 0 → 1 fila de recepción, total 3 filas |
| R5 | I › «R5: …reasignables…» | Sí: conjunto exacto `{recibida, deBeto}`; excluye `aMano` y `enRuta` |
| R6 | I › «R6: …» | Sí: Beto sin tarjeta, suma de asignadas y de cubos = 1 (solo la en ruta) |
| R7 | I › «R7: …» | Sí: Ana cuenta 1 y la orden sigue en ruta con Ana |
| R8 | I › «R8: …» | Sí: precondición «sin mensajero» obliga a que la traiga la rama nueva |
| R9 | I › «R9: …» | Sí: ni la de Beto ni la reasignada a Carla; contraprueba de que la reasignada existe |
| R10 | I › «R10: …» | Sí: conteos globales iguales (dentro de la tx serializada) |
| R11 | M › «R11: …» | Sí: el SQL real del archivo, hermanas con mensajero, historial sin filas nuevas |
| R12 | M › «R12: …» | Sí: repone a Ana (la última), no a Beto; hermanas iguales tras el DOWN |

I = `tests/integration/db/recoleccion-recibida-libera-mensajero.int.test.ts`;
M = `tests/integration/db/liberar-recolecciones-recibidas-migration.test.ts`.

## Mutaciones repetidas por el reviewer

Contra `servi_slt63`, después del aviso de «gate terminado». Cada una se hizo con un reemplazo exacto
que aborta si no casa una vez, se corrió el archivo y se revirtió con `git checkout`. Al final,
`git status -s` solo muestra este review, y la corrida sin mutar da 12/12 passed.

| # | Mutación | Rojo |
|---|---|---|
| A | `recibirEnBodegaCentral`: `data: { estatusId }` (sin limpiar el trío) | R1, R5, R6, R7, R8 (5/10) |
| B | `migration.sql`: quitar el `NOT EXISTS` de «la última fila» | R11 (1/2) |
| C | `TRANSICIONES.devolviendo_a_bodega_central.liberaAsignacion = true` | R3 (1/10) |
| D | `findMisAsignacionesByIds`: quitar `mensajeroAsignadoId: null` de la rama nueva | R9 (1/10) |

Coincide con M1, M5, M2 y M4 de la bitácora del implementer.

## Gate (lo corrió el leader sobre 4ec67e04)

`INIT_EXIT=1`. typecheck, lint y guardias en verde. Hay un único rojo entre 7102 tests:
`tests/integration/db/indices-rutas-calientes.test.ts` (R24: el planificador elige
`analytics_daily_tienda_fecha_idx` en vez de `analytics_daily_organizacion_id_fecha_idx`). Está fuera
del diff: SLT-63 no toca `analytics_daily` ni sus índices. Relanzado aislado, salió una vez rojo y otra
verde, y es el mismo rojo de entorno que H5 de `review_SLT-68`. No es un hallazgo de esta ficha.
Aviso: a las 12:49 corrí una vez los 5 archivos de la ficha contra la base del `.env`, por error y en
paralelo con el gate. Fallaron los 12 de integración (a esa base le faltan migraciones), dentro de
transacciones revertidas. No toca `analytics_daily`, pero lo dejo dicho.

## Migración que corre en producción

- **Alcance (R11):** `UPDATE "orden"` solo de filas vivas, en `en_bodega_central`, con mensajero, cuya
  última fila de historial (desempate `(created_at, id)`) es `recepcion_bodega_central` desde
  `en_ruta_bodega_central`. Coincide con R11; el `mensajero_asignado_id IS NOT NULL` extra solo evita
  escrituras inútiles. No hay `INSERT` en historial. `order_status` es catálogo global: el subselect
  devuelve una fila.
- **Disparadores:** el `UPDATE OF mensajero_asignado_id` dispara `verificar_misma_empresa`; con NULL
  pasa, y en el DOWN el actor de la `recoleccion_tienda` es de la misma empresa. El test M corre ambos
  con los disparadores reales instalados.
- **`down.sql`:** coherente con el UP y con el límite declarado (no distingue lo liberado por la
  migración de lo liberado por el código nuevo; no repone `asignado_at`/`fecha_reparto`).
- **Bloqueo/lentitud:** es DML, no DDL: toma `RowExclusiveLock` sobre `orden` (no choca con lecturas
  ni con escrituras de otras filas) y bloqueo de fila solo en las órdenes que casan (en prod, del orden
  de las 5 evidenciadas). El recorrido: `orden` por `estatus_id` (índice) y, por cada candidata, el
  `EXISTS`/`NOT EXISTS` sobre `orden_historial_estado` por el índice `(orden_id, created_at)`. Coste
  lineal en las órdenes en `en_bodega_central` × su historial: despreciable. D18 y D32 son deadlocks de
  **tests** que hacen DDL (`ALTER/DROP` con `AccessExclusiveLock` sobre `usuario`) en el shard; no
  aplican a esta migración. Los dos tests nuevos llaman a `serializarEscriturasReales` y no hacen DDL.

## Guardia `asignado-at-solo-lectura` (desviación declarada, commit 37d4faf7)

Legítima según la propia guardia: su cabecera pide expresamente «si aparece una tercera, hay que
mirarla a mano antes de tocar esta lista», y la 246 fijó el precedente de entrar con recibo escrito. La
entrada de SLT-63 trae su recibo, y la escritura (`asignado_at = NULL`) es la letra de R11, aprobada por
el humano en D2. El `down.sql` solo nombra la columna en un comentario y el censo (sin comentarios) no
lo cuenta. Dos matices en m1 y m2.

## Hallazgos

No hay bloqueantes.

- **m1 (menor). La quinta entrada de la lista blanca de `asignado_at` es un permiso sin acotar.** La
  246 entró con un caso que exige que su entrada solo indexe la columna («246: el permiso nuevo es
  SOLO para indexar»). La de SLT-63 entra con su recibo en prosa, pero ningún caso exige que solo
  escriba `NULL`. Si alguien editara esa migración a `SET "asignado_at" = NOW()`, la guardia seguiría
  verde. Una vez aplicada en prod la migración es inmutable, así que el riesgo real es bajo. Propuesta
  para una ficha posterior: un caso «SLT-63: solo `asignado_at = NULL`».
- **m2 (menor; recomiendo comprobarlo antes del merge). Nadie ha medido en prod la premisa «la columna
  ya es NULL».** El UP limpia `asignado_at` sin exigir `asignado_at IS NULL`, y el DOWN no la repone.
  Si en prod casara alguna orden con `asignado_at` puesto, saldría del denominador del ranking de días
  pasados y el rollback no la devolvería. Una recolección nunca estampa `asignado_at` (157/R38), pero a
  `en_ruta_bodega_central` también se llega revirtiendo un incidente en tránsito (#56). Comprobación
  de solo lectura en prod: el mismo `WHERE` de `migration.sql` más `AND o."asignado_at" IS NOT NULL`
  debería contar 0. Que la contabilice también el `SELECT count(*)` del `WHERE` completo (se esperan
  unas 5).
- **m3 (menor). En el DOWN, la cláusula «la última fila es la recepción» no tiene hermana que la
  pruebe con la orden sin mensajero.** La única hermana sin mensajero es `cargaApi`, que se descarta
  por no tener recolección. M8 (quitar `mensajero_asignado_id IS NULL`) sobrevive, y el implementer lo
  declara como mutante equivalente. Lo acepto para un rollback.
- **m4 (menor). No hay E2E de la recepción central ni de «Recolectadas hoy».** El flujo crítico
  «Asignación y recepción de órdenes» de `docs/checkpoints-proyecto.md` nombra `mis-asignaciones`,
  `asignacion-satelite` y `recepcion-satelite`, y ninguno de esos tres toca este diff. La semántica
  está cubierta contra Postgres real, y el PR a prod corre el E2E (dos empresas incluido). No bloqueo.
- **m5 (menor, de proceso). T7 sigue en `[ ]`.** Es del leader: el gate dio el rojo de entorno
  descrito arriba. Hay que marcarla al cerrar, con `gate-completo` en verde.

Revisado en concreto:
- **R3:** la cubren el test de integración (la devolución recibida conserva el trío) y los dos
  unitarios. La mutación C pone en rojo el de integración.
- **R8/R9:** la lectura es real (`findMisAsignacionesByIds` contra Postgres). La precondición «sin
  mensajero» de R8 obliga a que la traiga la rama nueva. R9 cubre el actor ajeno y la orden reasignada,
  con contraprueba. Las mutaciones A y D lo confirman.

## Veredicto

**OK.** No hay bloqueantes. Antes del merge a prod, recomiendo la comprobación de solo lectura de m2.
Para cerrar faltan T7 y el `gate-completo` del CI en verde.
