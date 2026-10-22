# 484 — Puntero `orden_en_gestion` colgado · tasks

> Zona `backend`. Sin migración. Implementa `backend_dev` en worktree aislado nacido de `origin/dev`.
> Tests que prueban un `WHERE` van en `tests/integration/db` contra Postgres (no dobles).
> Cada test nuevo se valida con **una mutación que lo ponga rojo** (anotada en
> `progress/impl_484.md`): quitar la sentencia de limpieza, o quitar su guarda, o quitar la rama
> «colgado» del `where`.

## Bloque A — raíz (tests primero, luego código)

- [x] **T1** `[P]` Test rojo del corte — `tests/integration/db/484-puntero-corte-sql-real.test.ts`.
  Casos: (a) puntero → orden barrida queda NULL y la orden queda `sin_gestionar` (R1); (b) puntero →
  otra orden `en_reparto` del mismo mensajero que no se barre, a una reservada para un día posterior y
  a una con gestión pendiente: intactos (R2); (c) neutralidad: resto de columnas del `usuario`, nº de
  filas de `orden_historial_estado` y totales del cierre iguales a los de una corrida sin puntero (R8).
  *Hecho:* el archivo falla contra `dev` sólo en (a).
- [x] **T2** `[P]` Test rojo de la aprobación — `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts`.
  Casos: liberación a bodega (R3); terminación por tope (R4); puntero a una orden que la aprobación
  no mueve, y aprobación que lanza → punteros intactos (R5); neutralidad (R8). Reutilizar el
  escenario de `cierre-sin-gestion-sql-real.test.ts` / `cierre-sin-gestion-tope-sql-real.test.ts`.
  *Hecho:* falla contra `dev` en R3 y R4.
- [x] **T3** `[P]` Test rojo del traspaso — `tests/integration/db/484-puntero-traspaso-sql-real.test.ts`.
  Casos: origen apuntando a la orden traspasada → NULL; origen apuntando a otra orden y destino con
  puntero propio → intactos (R6); lote con una perdedora (conflicto) → puntero del origen intacto
  (R7). Escenario base: `traspaso-mensajero.int.test.ts`.
  *Hecho:* falla contra `dev` en el primer caso.
- [x] **T4** (dep. T1) Limpieza en `CierreDiaRepository.crearCierre`, bloque `corteSinGestionar`,
  dentro de `if (movidas.count > 0)`: `tx.usuario.updateMany` con
  `ordenEnGestionId IN ids` y `ordenEnGestion.estatusId = sinGestionarEstatusId` (design §3).
  *Hecho:* T1 verde; mutación «borrar la sentencia» lo pone rojo.
- [x] **T5** (dep. T2) Limpieza en `CierresAdminRepository.resolverCierre`, ramas `aBodega` y
  `enElTope`, dentro de cada `if (movidas.count > 0)`, con la guarda de destino de cada rama.
  *Hecho:* T2 verde; mutación por rama la pone roja por separado.
- [x] **T6** (dep. T3) Limpieza en `OrdenRepository.traspasarMensajeroLote` tras el bucle de `UPDATE`
  (después del `throw` de perdedoras): `id = mensajeroOrigenId AND ordenEnGestionId IN ids`.
  *Hecho:* T3 verde; mutación «quitar `id = mensajeroOrigenId`» o «quitar la sentencia» la pone roja.

## Bloque B — defensa

- [x] **T7a** `[P]` Test rojo del repositorio — `tests/integration/db/484-puntero-vigente-sql-real.test.ts`.
  Casos de `getOrdenEnGestion`: vigente → id; colgado por estado, por mensajero distinto, por borrado
  y por gestión pendiente → `null` (R9, R13). Casos de `setOrdenEnGestion`: colgado + orden
  gestionable → `true` y puntero sustituido (R11); vigente apuntando a otra → `false` y puntero
  intacto (R12); NULL e igual → `true` (regresión 36/R19-R21).
  *Hecho:* falla contra `dev` en los casos colgados.
- [x] **T7b** `[P]` Test rojo del servicio — `tests/unit/services/mis-asignaciones-puntero-colgado.test.ts`
  (dobles válidos: no prueba ningún `WHERE`). `listarMisAsignaciones`: puntero fuera de
  `porGestionar ∪ conAyuda` → `ordenEnGestionId: null`; dentro (en cada una de las dos) → el id (R9);
  ningún método de escritura de los dobles invocado (R10). `gestionar`: `getOrdenEnGestion` → `null`
  no rechaza por «otra orden activa» (R13); → otro id sí (R14).
  *Hecho:* falla contra `dev` en el caso «fuera de la lista».
- [x] **T7c** (dep. T7a) Predicado único de vigencia + `getOrdenEnGestion` + tercera rama del `where`
  de `setOrdenEnGestion` (design §4.1). Actualizar el JSDoc de `IGestionOrdenRepository`.
  *Hecho:* T7a verde; las mutaciones de cada condición del predicado lo ponen rojo.
- [x] **T7d** (dep. T7b) Invariante en `MisAsignacionesService.listarMisAsignaciones` (design §4.2).
  *Hecho:* T7b verde; `tests/unit/services/mis-asignaciones-service.test.ts` y
  `tests/components/RepartoModule*.test.tsx` siguen verdes.

## Bloque C — incidente y cierre

- [x] **T8** (dep. T4, T5, T7c, T7d) Reproducción del incidente —
  `tests/integration/db/484-puntero-incidente-blst765.test.ts`: mensajero con puntero a una orden
  `en_reparto` → corte → aprobación con liberación → puntero NULL, Reparto con `ordenEnGestionId: null`
  y `escogerParaGestion` de otra orden suya → `ok` (R15). Variante «puntero heredado de antes del
  despliegue» (puntero puesto a mano sobre una orden ya `en_bodega_central`): Reparto `null` y
  escoger `ok` (R9, R11).
  *Hecho:* verde, y rojo si se revierten a la vez T4/T5 y T7c.
- [x] **T9** Gate y guardias. `./init.sh --rapido` (debe ampliarse con `tests/integration/db` por tocar
  repositorios de cierre; si no se amplía, correr a mano los cinco archivos `484-*` más
  `cierre-sin-gestion-sql-real`, `cierre-sin-gestion-tope-sql-real` y `traspaso-mensajero.int`).
  Correr A MANO las guardias que leen estos archivos y que el grafo no relaciona:
  `historial-accion-escrituras-cubiertas`, `aprobacion-escrituras-cubiertas`,
  `cierre-sin-gestion-sin-dinero`, `consultas-concurrentes-en-transaccion`, `carga-del-mensajero`.
  Comprobar que ningún archivo de `integration/db` sale `skipped` por falta de `.env`.
  *Hecho:* todo verde con los conteos de `skipped` anotados en `progress/impl_484.md`, junto con la
  tabla R → test y las mutaciones.
- [x] **T10** Release (leader): ejecutar en solo lectura contra producción la consulta de `design.md`
  §6 y anotar el número de filas antes y después del despliegue (R16). Esperado: 0.
  *Hecho 2026-10-19:* base de producción de la app de origen (prod). Antes del despliegue 0 filas; después (358ae461 READY) 0 filas.
  *Hecho:* resultado anotado en `progress/` con fecha y host verificado.

## Dependencias

```
T1 ─► T4 ┐
T2 ─► T5 ├─► T8 ─► T9 ─► T10
T3 ─► T6 ┘    ▲
T7a ─► T7c ───┤
T7b ─► T7d ───┘
```

T1, T2, T3, T7a y T7b son paralelizables entre sí. T4/T5 tocan dos repositorios distintos y pueden ir
en paralelo; T6 y T7c tocan `OrdenRepository` y `GestionOrdenRepository`, sin solape.

## Trazabilidad

| R | Test |
|---|---|
| R1, R2 | `484-puntero-corte-sql-real.test.ts` |
| R3, R4, R5 | `484-puntero-aprobacion-sql-real.test.ts` |
| R6, R7 | `484-puntero-traspaso-sql-real.test.ts` |
| R8 | `484-puntero-corte-sql-real.test.ts`, `484-puntero-aprobacion-sql-real.test.ts` |
| R9 | `mis-asignaciones-puntero-colgado.test.ts`, `484-puntero-vigente-sql-real.test.ts`, `484-puntero-incidente-blst765.test.ts` |
| R10 | `mis-asignaciones-puntero-colgado.test.ts` |
| R11, R12 | `484-puntero-vigente-sql-real.test.ts` |
| R13, R14 | `mis-asignaciones-puntero-colgado.test.ts`, `484-puntero-vigente-sql-real.test.ts` |
| R15 | `484-puntero-incidente-blst765.test.ts` |
| R16 | T10 (verificación de release, manual) |
