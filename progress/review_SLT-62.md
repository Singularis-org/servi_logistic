# SLT-62 «Mostrar el % de efectividad aunque haya pocas órdenes» — revisión (F2.2)

Fecha: 2026-11-02. Rango revisado: `origin/dev...684c18ad` (17 archivos, +894 / −301).
Entrada: specs/SLT-62-porcentaje-efectividad-base-chica/{requirements,design,tasks}.md,
progress/features/SLT-62.md (decisiones de 2026-10-30 y 2026-11-02), progress/impl_SLT-62.md.
MCP del grafo (`codebase-memory-mcp`): no conectó (timeout). Se usaron Grep y Read.

## Checklist

- [x] **Trazabilidad R1..R8 → test.** Cada R tiene un test que lo afirma de verdad:
  - R1: `madurez-cohorte.test.ts` › «SLT-62 · R1 · …» (12/11/1, 1/1/0, y 19 con tres repartos).
  - R2: `madurez-cohorte.test.ts` › «SLT-62 · R2 · …» (64/2/61 → 2/3; 8/6/0 → 0,75 con `toEqual`).
  - R3: `madurez-cohorte.test.ts` › barrido de 3276 repartos, con un caso que impide que salga vacío (cuenta exacta).
  - R4: `EfectividadHeroe.test.tsx` › «Jason Barrios: 11 de 12 pinta 91,7 %» (`/^91,7\s*%$/`, «Entregado: 11», «de las 12 órdenes que entraron»).
  - R5: `EfectividadHeroe.test.tsx` › «la línea de abajo se pinta con 3 y con 8 de 8…» (literales `66,7 %` y `75 %`).
  - R6: `madurez-textos.test.ts` (barrido de 3250 repartos, también con conteo que impide el vacío) y los tres casos de `EfectividadHeroe.test.tsx` (`queryByText` nulo).
  - R7: `EfectividadHeroe.test.tsx` › «con 0 de 27 cerradas no hay porcentaje: hay una frase» y `madurez-cohorte.test.ts` › «R2 · CERO CERRADAS…» (ya existían y se conservan).
  - R8: `EfectividadHeroe.test.tsx` › «sin ninguna orden en el recorte lo dice con esas palabras» (ya existía y se conserva; afirma también que no hay barra).
- [x] **Decisiones del 2026-11-02 con su test.**
  - D1 (la tarjeta de gestión enseña su % con base chica): `KpisEfectividad.test.tsx` › «la tarjeta de gestión muestra su % con una base chica (12 órdenes)». Busca dentro de la tarjeta y comprueba que el héroe da otra cifra.
  - D2 (concordancia): `madurez-textos.test.ts` › «tanda 2» (7 casos, con n = 1 y n > 1), `KpisEfectividad.test.tsx` › «concuerda en singular…» y `ProductosTabla.test.tsx` › «tanda 2» (2 casos).
- [x] **Literales contra el literal, no contra su fuente.** Los tests nuevos ya no llaman a `formatearValor` para construir lo que esperan. Afirman cadenas escritas a mano: `91,7`, `66,7`, `75`, `100% de la 1 orden con desenlace terminó en Entregado`, `1 orden en el rango · 0 sin producto interpretable.` y similares. Los literales de concordancia comparan la cadena entera (`toBe`), no un trozo.
- [ ] **Tasks.** T1 a T5 están marcadas `[x]`. **T6 sigue `[ ]`**: falta la captura en `/analitica`, que hace otro agente en paralelo. Ver el hallazgo m3.
- [x] **`## Lo que ya existe`** está presente y tiene contenido (lista de quién usa el suelo y de los consumidores que no cambian). El diff no vuelve a crear nada de esa lista: reutiliza `contarOrdenes` y `ORDENES` de `base-del-kpi.ts`, y lo único nuevo es `segunNumero`, de 3 líneas y local al módulo. No hay un helper genérico de plural que duplique.
- [x] **Sin código muerto de la regla de 20.** Grep en `app/`, `lib/`, `tests/`, `docs/`, `scripts/`, JSON y `.mjs` de `MINIMO_BASE_PORCENTAJE|base_insuficiente|efectividad-cohorte|efectividadCohorteConfig|MAXIMO_SALTO_POR_ORDEN|baile solo|muy pocas para`: no queda nada vivo.
  - Se borraron `lib/config/efectividad-cohorte.ts` y su entrada en la allowlist de la guardia de frontera.
  - Los «hacen falta» que siguen apareciendo son prosa de otros módulos.
  - Lo único que queda es un comentario histórico en `heroe-por-rol.test.ts:23`. Ver el hallazgo m4.
- [x] **Singular y plural en todos los sitios que interpolan un conteo de órdenes** (`app/(app)/analitica`, `components/private/analytics`, `lib/analytics`):
  - `titularDelHeroe`, `fraseSobreCerradas`, `avisoPeriodoEnCurso` y `textoUniverso`: corregidos.
  - Detalle de `sin_cerradas`: «0 de N tienen desenlace». El sujeto es 0, así que el plural es correcto.
  - `TEXTO_HEROE.baseCargadas`, rótulos de `KpisEfectividad`, `CicloVidaKpi` y `CohorteCargaTabla`: ya concordaban vía `contarOrdenes`.
  - «supera las ${limite} órdenes»: el tope es fijo y nunca vale 1.
  - `ProductosTabla:321` ya tenía su propio singular.
- [x] **Contrapruebas.** Re-ejecuté tres en un worktree temporal, desmontado al terminar, sin tocar el árbol de la feature ni el dev server:
  - **M1** (reponer `if (base < 20) return {valor:null…}` en `porcentaje`): 16 failed de 94. Caen R1 ×5, R2 ×2, el barrido de R3, los 3 casos SLT-62 del héroe, el barrido de R6, D1, «concuerda en singular» y los dos detalles del titular. Coincide con lo que declara la bitácora (allí 12; la diferencia viene de que la tanda 2 añadió tests).
  - **D2** (`segunNumero` siempre en plural): 5 failed. Caen los 4 de concordancia de `madurez-textos` y el de `KpisEfectividad`, como declara la bitácora.
  - **M4** (quitar el guardia `sin_cerradas`): 4 failed. Caen R7 en los dos archivos y el barrido de R3, como declara la bitácora.
- [x] **Regresión R7 y R8.** R7 cae con la mutación M4, tanto en unidad como en componente. R8 tiene su propio orden de ramas (`cargadas === 0` va antes del motivo) y su test existente lo afirma con el literal, sin `%` y sin barra.
- [x] **Ejecución.** Los 8 archivos relacionados salen 8/8 files y 137/137 tests en verde: madurez-cohorte, EfectividadHeroe, KpisEfectividad, ProductosTabla, madurez-textos, textos-455-recorrido, tablero-operativo-frontera.guardia y heroe-por-rol. Para que jest-dom cargue, hay que lanzarlo con `node_modules/vitest/vitest.mjs` del worktree: con `../../node_modules/.bin/vitest`, los tests de componente fallan con «Invalid Chai property». `eslint` de los 9 archivos tocados: exit 0. Typecheck y gate: me apoyo en el `./init.sh` verde del leader sobre 684c18ad; no lo repetí.
- [x] **Reglas del proyecto (`perfil-agentes > reviewer`).** Sin tablas, queries ni migraciones, sin literales de país ni moneda en código nuevo (el «es-CR» solo sale en un comentario de test), sin Ordenex y sin dependencias nuevas. Los comentarios explican el porqué.

## Hallazgos

- **m1 · menor — JSDoc fuera de su sitio** en `app/(app)/analitica/_components/entregas/madurez-textos.ts:73-88`.
  - El bloque nuevo de `segunNumero` se insertó entre el JSDoc de `contarEntregadas` («Entregado: 424»… FICHA 455) y su función.
  - Quedan dos JSDoc seguidos, y el de la ficha 455 pasa a documentar `segunNumero`. `contarEntregadas` se queda sin el suyo.
  - Arreglo: mover `segunNumero` con su bloque por encima del JSDoc de `contarEntregadas`.
- **m2 · menor — el spec no recoge las decisiones del 2026-11-02.**
  - D1 (tarjeta «Efectividad de la gestión») y D2 (concordancia, también `textoUniverso` de `ProductosTabla`) amplían el alcance. `requirements.md` sigue diciendo que solo cambia el héroe, y `ProductosTabla.tsx`/`KpisEfectividad.test.tsx` no aparecen en `tasks.md > Archivos esperados`.
  - La trazabilidad existe, pero solo en `progress/impl_SLT-62.md` (mapa «Decisión → test»).
  - Recomendado antes del cierre: añadir R9 y R10 (o filas en «Decisiones cerradas»), con su test.
- **m3 · menor (condición de cierre) — T6 sin marcar.** La captura de `/analitica` con un recorte de menos de 20 órdenes está en curso en paralelo. Antes del PR:
  - marcar T6 `[x]`;
  - dejar la captura en `progress/impl_SLT-62.md`;
  - comprobar en ella «91,7%» o su equivalente y las frases en singular si el recorte lo permite.
- **m4 · menor — comentario histórico ya obsoleto** en `tests/unit/analytics/heroe-por-rol.test.ts:23`.
  - La tabla medida dice que `adminSatelite` ve «1 entregada de 8 ordenes» + «son muy pocas para un %». Desde SLT-62 eso ya no se pinta.
  - Es una medición fechada y no rompe nada. Conviene añadir una línea: «(SLT-62 quitó el suelo: hoy pinta el %)».

Nota, sin hallazgo: la regex del barrido de R6 (`\d+ de \d+ órdenes$`) no detectaría un titular sustituto en singular («1 de 1 orden»). Ese caso lo cubre la aserción `titular.porcentaje === null` del mismo barrido, así que no hay hueco.

## Veredicto

**OK**: 0 bloqueantes y 4 menores. Antes de pedir el merge hay que cumplir m3 (T6 marcada y captura en la bitácora). m1, m2 y m4 son recomendables y no bloquean.
