# Review SLT-73 «El dinero de la satélite entra a la wallet de la central solo al conciliar»

- Rama `hotfix/SLT-73-dinero-satelite-al-conciliar`, HEAD `06e5973f`. Diff: `git diff origin/prod...HEAD`
  (155 archivos).
- Revisado el 2026-10-31 sobre la base local `servi_slt73c`. No se tocó prod ni `servi_slt75`.
- MCP del grafo: no se usó, porque el worktree no está indexado (lo dice el design). La revisión se hizo con
  Grep/Read.

## Checklist

| # | Punto | Estado |
|---|---|---|
| 1 | Trazabilidad: cada R1–R35 tiene un test que lo verifica | **NO**: falta una cláusula de R16/D15 (B1) |
| 2 | Tasks en `[x]` | T1–T9 y T11–T14 sí. **T10 sin marcar**: el gate da INIT_EXIT=1 por un rojo ajeno; lo decide el leader |
| 3 | `design.md > ## Lo que ya existe` presente; el diff no re-crea nada de esa lista | OK (`asentarCierreDia` mueve el bloque, no lo copia; `esperadoDe` envuelve `paraLaCentral`) |
| 3 | Specs EARS, alternativas descartadas, mapa R→test en `impl_SLT-73.md` | OK |
| 3 | Migraciones con `down.sql`, sin editar una ya aplicada | OK (3 nuevas, con timestamp posterior a la última de prod) |
| 3 | Tabla nueva con `organizacion_id`, RLS, triggers de misma empresa, clasificada como de negocio | OK (`conciliacion_bodega_ajuste`, más su int de RLS) |
| 3 | Query nueva de negocio filtrada por empresa, con test de dos empresas | Parcial (m3) |
| 3 | Sin literales de país ni de moneda en código nuevo | OK (solo reutiliza `METODO_LABEL.SINPE`, que ya existía) |
| 3 | Sin dependencias nuevas; sin recursos de Ordenex; sin secretos | OK |
| 3 | Flujo crítico (dinero y cierres) con E2E | OK: `cierre-bodega-satelite`, `wallet`, `cierres-admin`, `dos-empresas-humo` y `recepcion-satelite`, 27/27 (`e2e_SLT-73_v3.log`) |
| 4 | Typecheck (`npx prisma generate` en este worktree justo antes) | OK: `TC_EXIT=0` |
| 4 | Lint | OK: 0 errores y 232 avisos, los mismos de antes |
| 4 | Guardias | 1 rojo: `dependencias-declaradas-presentes`, que **está en el baseline** desde el 2026-10-21. No es hallazgo |
| 4 | Int afectados (8 `slt73-*`, `marca-conciliacion`, `saldo-satelites`, `wallet-caracterizacion-458`, `estado-cuenta-saldo-corrido`) | 12/12 verdes en `servi_slt73c` |
| 4 | Rojo del gate `geografia-por-pais` | Reproducido en `servi_slt73c`: 23001 en vez de 23503. El diff no toca geografía (sus 3 migraciones son de SLT-73) y `prodcheck_prod.log` da el mismo rojo. **Ajeno**, pero NO está en el baseline (ver m6) |
| 5 | Reglas del proyecto (perfil reviewer) | OK, salvo m3 |

## Mutaciones re-ejecutadas por el reviewer

Las corrió `rv73_mut.sh`, en el scratchpad. Antes de cada mutación hace `prisma generate` y comprueba que el
cliente tiene `conciliacionBodegaAjuste` (739 apariciones, antes y después). Aplica la mutación y la confirma
con grep y `git diff --stat`. Al terminar, `git checkout` y `git status` vacío.

Ojo: la primera corrida de M1 cayó por `Cannot read properties of undefined (reading 'aggregate')`. SLT-75
regeneró el cliente Prisma a las 23:39 desde su schema. Esa corrida se descartó y se repitió con el cliente
regenerado aquí.

| M | Mutación | Test | Resultado |
|---|---|---|---|
| M1 | Migración C, conjunto S: quitar `OR b.conciliado_at IS NULL` | `slt73-migracion-retira-asientos` | MUERE (3 rojos de aserción: R16, R18, R20) |
| M2 | Migración C, libro del mensajero: quitar `AND m.premio_dia IS NULL` | ídem | **SOBREVIVE** (5/5 verdes) → B1 |
| M3 | `marcarConciliado`: quitar `destinoTipo: "bodega_satelite"` del WHERE | `slt73-marcar-asienta` | MUERE (centinela R10) |
| M4 | `revertirConciliacion`: conteo con `origenTipo: "cierre_bodega"` | `marca-conciliacion` | MUERE (R14). Ese archivo está en el baseline (m2) |
| M5 | Deuda: quitar `estado: "aprobado"` de `APORTE_WHERE` | `slt73-deuda-satelite` | MUERE (R5/R6 y R7) |
| M6 | Diferencia: `delta` sin `yaAsentado` | `slt73-corregir-diferencia` + `slt73-marcar-asienta` | MUERE (4 rojos: R13, R15, R26) |
| M7 | Aprobación: `=== "bodega_central"` → `!== null` (la satélite asienta) | `slt73-aprobar-*` | MUERE (R1) |
| M8 | Estado de cuenta: rama `sin_consolidar` sin `cbc.estado <> 'rechazado'` | `slt73-estado-cuenta-bodega` | MUERE (5 rojos: R31–R33) |

## Lo que se verificó en lo crítico

- **Conjunto S de la migración C contra prod.**
  - El predicado es idéntico al de `t9-prod.cjs`: `bodega_satelite`, `aprobado`, y sin consolidar o con su
    consolidación sin conciliar.
  - Con esa medición (1 cierre; caja 6 filas, ₡94.745 = 76.890 + 7.800 + 1.014 + 2.691,15 + 349,85 + 6.000;
    tienda 2 créditos + 8 débitos; mensajero 1 fila de ₡6.000), la migración retira 6 + 10 + 1 filas.
  - El 1 del mensajero es el devengo: el pago es `min(P, efectivo) = 0`. T9 no excluye premios y aun así da 1,
    así que en S no hay premios ni incentivos.
  - `liquidacion_pago` = 0, así que la migración no aborta.
- **Respaldo y `down.sql`.**
  - `respaldo.slt73_asientos(tabla, fila jsonb, id generado)`, con `REVOKE` a `PUBLIC`. El `DELETE` filtra por
    el id del respaldo.
  - El down repone con `jsonb_populate_record … ON CONFLICT DO NOTHING`; los únicos por origen de los tres
    libros existen. Después hace `DROP SCHEMA respaldo CASCADE`.
  - El down de B borra las diferencias y restaura el CHECK de `20261024130100`. El de A quita los valores con
    la lista vigente de `pg_enum` y guarda y recrea los triggers.
  - Ninguna tabla usa `FORCE ROW LEVEL SECURITY` y no hay triggers que bloqueen el `DELETE` en los libros.
- **Idempotencia de la marca.**
  - El `updateMany` guardado bloquea la fila: la segunda marca da `conflict`.
  - `asentarCierreDia` usa `skipDuplicates` contra el único por origen.
  - La diferencia se calcula como objetivo − Σ ajustes previos.
  - Un fallo revierte la tx entera. Lo prueba R12, con un feed que falla y un reintento.
  - Dos correcciones concurrentes se serializan por el bloqueo de fila del `updateMany`, y el `aggregate`
    posterior (READ COMMITTED) ve el ajuste ya commiteado.
- **D10/D12, el bolsillo «Por cobrar a satélites».**
  - Las dos categorías van a `por_cobrar_satelite`, con liquidez `efectivo`.
  - `acumular` tiene ramas explícitas y un `never`.
  - `derivarCaja` hace 6 restas. R26 se prueba sobre filas reales, tras marcar y tras corregir.
- **D11.** El conteo previo devuelve `con_asientos` sin escribir. El servicio, la acción y la UI lo traducen, y
  el E2E lo recorre en el navegador.
- **Aprobación central sin cambios.**
  - `asentarCierreDia` es el bloque movido, en el mismo orden. Con `fechaMovimiento` `undefined`, `fechar`
    devuelve las mismas listas.
  - Las dependencias son las mismas que inyecta el constructor.
  - R3 compara contra un literal y M7 muere.
  - No hay otro escritor de los feeds en `lib/` ni en `app/`. `CajaBackfillTesoreriaService` deriva del libro
    de la tienda, así que tras la migración no re-emite nada.

## Hallazgos

### BLOQUEANTE

- **B1 — R16/D15: no hay test para la cláusula `premio_dia IS NULL`.**
  - Dónde: `db/migrations/20261031140200_slt73_retirar_asientos_satelite/migration.sql:89` y
    `tests/integration/db/slt73-migracion-retira-asientos.int.test.ts:77-83,115-140`.
  - Qué pide R16: no retirar «ninguna fila con `premio_dia` (la compensación de un premio anulado)». La
    trazabilidad del design (§6, fila R16–R19) pide sembrar «un premio, **su compensación (`premio_dia`)** y un
    incentivo». También lista la mutación «quitar la exclusión … `premio_dia`».
  - Qué hay: el test siembra solo `incentivo` y `premio_ranking`. Este último ya lo cubre el `NOT IN`. No siembra
    la compensación `ajuste_pago` con `premio_dia` ni origen `cierre_dia`.
  - Resultado: quitar `AND m.premio_dia IS NULL` deja la suite en 5/5 verde (M2).
  - El SQL de la migración es correcto y en prod no hay filas así en S (T9), así que el riesgo de hoy es nulo.
    Lo que falla es la trazabilidad de una cláusula de dinero que el spec exige probar.
  - Qué falta:
    1. Sembrar en el cierre satélite sin consolidar una fila `pago_mensajero_movimiento` de compensación
       (`ajuste_pago`, `premio_dia` no nulo, origen `cierre_dia`).
    2. Afirmar que sigue en el libro tras el up, que no está en el respaldo y que el down no la duplica.
    3. Volver a correr M2 y que muera.
  - No se toca la migración.

### Menores

- **m1 — Verificación en navegador de T7, T12 y T14 (piden «verificado en el navegador»; están en `[x]` sin
  ella).**
  - **T7** queda cubierta en lo esencial por el E2E `cierre-bodega-satelite`, en un navegador real: precarga
    7.000 = «Para la central», la marca asienta y desmarcar se rechaza con el aviso.
  - **T12** (bloque «Por cobrar a satélites», barra de 3 tramos, dueño «Satélite» en el libro) y **T14**
    (región «Conciliación» de `/cierres-admin`, nota de Q10) solo tienen tests de componente que leen el DOM.
  - No bloquea el veredicto. Pero **los 3 tramos no se van a poder ver en prod tras el deploy**: hacen falta una
    conciliación con faltante, y en prod hay 0. Recomiendo una pasada local en `servi_slt73c` antes del merge:
    1. Marcar con faltante (por ejemplo 6.900 sobre 7.000).
    2. En `/wallet`, el bloque muestra ₡100, «De las tiendas» no cambia y la barra pinta 3 tramos.
    3. La fila del libro dice «Satélite».
    4. En `/cierres-admin`, recibido + falta = «Para la central», y la nota no dice «no mueve dinero».
  - **Tras el deploy en prod**, mirar:
    - El NOTICE de la migración C en el log del deploy: «1 cierres … retiradas 6 filas de caja, 10 de tienda y 1
      del mensajero». Con 0, el rol del deploy no veía las filas.
    - `/wallet/satelites`: la satélite ya no sale al día. Deuda ₡70.890 (76.890 − 6.000 − 0) y «1 cierre» sin
      consolidar.
    - `/wallet`: la caja sin esos 6 movimientos y el bloque «Por cobrar a satélites» en ₡0.
    - Los saldos de las 2 tiendas, unos ₡65.035 netos menos y en positivo (T9).
    - El estado de cuenta de la bodega: «Pendiente de llegar» = ₡70.890, con una fila «Cierre aprobado sin
      consolidar».
- **m2 — La protección SQL de R14 vive en un archivo del baseline.**
  - El conteo de `revertirConciliacion` (`lib/repositories/CierresBodegaAdminRepository.ts:710-717`) solo lo
    prueba contra Postgres `tests/integration/db/marca-conciliacion.int.test.ts:344`.
  - Ese archivo está en `tests/baseline-rojos.json` («la app nace vacía»), así que en el CI su rojo no cuenta.
    Aquí pasa y M4 muere, pero en el CI no protege.
  - Conviene mover ese caso a un `slt73-*` con datos propios.
  - Pasa lo mismo con lo que el diff edita en `corregir-conciliacion`, `caja-invariante-tiendas`,
    `wallet-anulacion-458`, `cierre-rechazo-tienda-aprobacion` y `454/455 dinero-aprobacion`. En
    `servi_slt73c` fallan o se saltan por fixtures (`referencia a otra empresa`, `usuario_empresa_o_superadmin`),
    así que esas ediciones no se pudieron verificar. Las cifras de SLT-73 las cubren los `slt73-*`.
- **m3 — El SQL a mano nuevo del estado de cuenta de la bodega no tiene test de dos empresas.**
  - `totalesDeBodega` y `periodoDeBodega` (`lib/repositories/EstadoCuentaRepository.ts:406-456`) pasan de
    Prisma, filtrado por la extensión, a `$queryRaw` sin `organizacion_id`. Los cubre la RLS: el archivo está en
    `EXCEPCIONES_SQL_A_MANO` y la guardia pasa.
  - Ningún test los corre con dos empresas, y el int corre con un rol que salta la RLS.
  - `docs/checkpoints-proyecto.md` pide ese test. Ya faltaba para `paginaDeBodega`; el diff amplía el hueco.
- **m4 — Revertir puede dejar una diferencia huérfana.**
  - `revertirConciliacion` solo cuenta asientos `cierre_dia`
    (`lib/repositories/CierresBodegaAdminRepository.ts:710-717`). No mira las filas de
    `conciliacion_bodega_ajuste`.
  - Caso: una consolidación cuyos cierres no emiten ningún asiento pero que se marcó con una diferencia. Se
    revierte, y la diferencia queda en la caja, en «Por cobrar a satélites», con la marca deshecha.
  - Re-marcar lo compensa (usa Σ ajustes previos), así que no se duplica. Es un caso límite, improbable con
    cierres reales.
- **m5 — `esperado` duplicado.** `asentarDiferenciaSatelite`
  (`lib/repositories/CierresBodegaAdminRepository.ts:101-107`) llama a `paraLaCentral` a mano en vez de usar
  `esperadoDe` (`lib/utils/conciliacion-satelite.ts`). La fórmula es la misma; son dos lugares.
- **m6 — `geografia-por-pais` no está en el baseline.**
  - Es ajeno: el diff no toca geografía y da el mismo rojo con el código de `origin/prod`.
  - Si también sale rojo en el CI, `gate-completo` lo cuenta como rojo nuevo y bloquea el merge. Si en el CI pasa,
    es de la base local. Mirarlo en el check del PR antes de decidir T10.
- **m7 — Textos provisionales.** Q10, las pistas del bloque y el dueño «Satélite» siguen pendientes. No
  bloquean.

## Veredicto

**RECHAZADO**, por un solo bloqueante: B1, el test de R16/D15 para la compensación con `premio_dia`. Es un
arreglo solo en el test; la migración y el código de dinero se sostienen.

Todo lo demás pasó:
- el conjunto S coincide con prod;
- respaldo, down y abort;
- la idempotencia de la marca;
- D10/D12 y la invariante R8 de la 459;
- D11;
- la aprobación central, sin cambios;
- 7 de 8 mutaciones mueren.

Para la vuelta 2 basta revisar el diff del test, más M2 re-ejecutada.
