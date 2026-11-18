# review SLT-186 «Tests con estados retirados del catálogo»

Ruta ligera, review acotada a `git diff origin/dev...HEAD` (HEAD 301c0043). PR #218.
Diff: 13 tests + `tests/baseline-rojos.json` + spec/progress. Producción (`lib/ app/ db/ scripts/ init.sh`): vacío.

## Checklist

- [x] **Ruta:** ligera correcta. El diff solo toca tests (no dinero, permisos, auth, integraciones ni
  webhooks de producción); los tests de dinero que cambian no tocan código de dinero.
- [x] **Trazabilidad R1150-R1158** (el rango reserva R1159; no existe ese R en el spec). Mapa en
  `progress/impl_SLT-186.md > Mapa R -> test`:
  - R1150: corrida repetida por mí en `servi_slt186_desechable`: **13/13 archivos, 179/179 casos, 0 saltados, EXIT=0**.
  - R1151: corrida (b) del implementer con las 3 filas retiradas confirmadas (no repetida; la siembra
    es `INSERT … WHERE NOT EXISTS` y las búsquedas son por `value`, así que no depende de la fila previa).
  - R1152/R1153: caso R45 de `analytics-daily-job` siembra en `conBase` (tx revertida) y afirma
    `not.toBeNull()` + fuera de `ORDER_STATUS_SEED`. **Mutación M1 repetida por mí** (quitar el INSERT):
    ROJO «la fila huerfana debe existir en order_status: expected null not to be null». Restaurado (árbol limpio).
  - R1154: `reprogramado` está en `ESTADOS_BODEGA_SATELITE` (`lib/utils/estados-bodega-satelite.ts:200`),
    comentario con la referencia en el test.
  - R1155: M2 declarada (no repetida: muta `lib/`).
  - R1156: 179 casos antes y después; literales nuevos medidos, no generados (ver abajo).
  - R1157: sin fallo de producción documentado.
  - R1158: 13 entradas fuera (69 -> 56); ninguna entrada del baseline cita ya SLT-186.
- [x] **Tasks** T1-T5 `[x]` en `## Tasks` del requirements.
- [x] **Tamaño:** `tamano-pr.mjs` 14/40 archivos, 0/1000 prod, 311/3000 tests.
- [x] **Lo que ya existe:** presente; el diff no re-crea nada (reutiliza el patrón `asegurarRetirados`).
- [x] **Typecheck** (`tsc --noEmit`) verde; **lint** de los 13 archivos verde.
- [x] **Guardias** (`tests/unit/guards`, en desechable): 253/254; el único rojo es
  `dependencias-declaradas-presentes.guardia.test.ts`, que está en `tests/baseline-rojos.json` (no es hallazgo).
- [x] **Siembra propia / control positivo:** ningún `if (!x) return;` añadido. Los catálogos que se leen
  (`novedad`, `en_reparto`, `reprogramado`…) son del seed vigente y siguen con `throw` si faltan. El
  corte conserva su control anti-vacío (M4 declarada).
- [x] **Ningún test contra su propia fuente:** `ESTADOS_TRASPASABLES` se compara con el literal
  `["en_reparto"]` (contrato), no consigo mismo; listas de consultas, policy (`orden_dia_reparto_cambio_por_empresa`,
  `{servi_app}`), columnas del rastro e `ivaFulfillment: "0.00"` son literales medidos.
- [x] **`tarifa-zona-borrado-fk-real` por versión:** no queda verde por vacuidad en ninguna rama.
  Siempre se afirma `crudo !== null` (el DELETE falló) y `esViolacionDeClaveForanea(e) === true`; en
  >= 18 las 5 aserciones de la cicatriz; en <= 17 `esConocido`, `code === "P2003"` y la ingenua caza. M3
  (forzar el brazo <= 17 en PG 18) declarada roja. El brazo <= 17 es hipótesis: lo confirma o lo
  tumba el CI (Postgres 17), que estaba `pending` al revisar.
- [x] **Reglas del proyecto** (`perfil-agentes.md > reviewer`): no aplica ninguna (sin tablas, migraciones,
  dependencias ni literales de país en código nuevo; sin Ordenex). Comentarios explican el porqué.

## Hallazgos

- **menor m1** — El alcance creció de 2 a 13 archivos por `progress/features/SLT-186.md`, pero los EARS
  (R1150, R1158) y «Archivos esperados» del requirements siguen nombrando solo los 2 originales. La
  trazabilidad de los 11 añadidos descansa en la corrida (a) y el mapa de la bitácora. Aceptable para
  tests-only; conviene una línea en el spec que diga que R1150/R1156/R1158 aplican a los 13.
- **menor m2** — `dinero-productos.int` (k) R22: la rama `modelo === "nuevo"` del sobre nunca se ejerce
  (el archivo siembra solo tarifas viejas y 449-h lo fija con `toBe("viejo")`). Código muerto en el
  test, no vacuidad: la rama vieja sí tiene `importes.length > 0`.
- **menor m3** — El brazo PG <= 17 de `tarifa-zona-borrado-fk-real` no está medido en local. Antes del
  aviso «listo para mergear», confirmar que `vitest` del CI (Postgres 17) sale verde en ese archivo;
  si sale rojo, vuelve al implementer según el propio comentario del test.

## Veredicto

**OK** (sin bloqueantes). Condición de merge habitual: `gate-completo` verde en el PR (cubre m3).
