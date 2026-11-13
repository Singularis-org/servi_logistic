# impl SLT-147 «Limpieza de backend de cierres: deudas D63, D66, D68 y D72»

backend_dev, 2026-11-13. Ruta ligera. D68 por la opción A (decisión de Carlos en `progress/features/SLT-147.md`).
El grafo no se consultó: todo con Grep/Read sobre el worktree.

## Archivos

Producción (6):
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts` — fuera `listarCierresImputables`; su doc pasa a la de `listarCierresImputablesEnAlcance`; comentarios desfasados corregidos.
- `lib/repositories/LiquidacionPagoRepository.ts` — fuera la implementación; doc unificada; comentario de `contarCierresNoAprobadosPorEstado`.
- `lib/interfaces/repositories/ICierreDiaRepository.ts` — nuevo `CierrePasadoDeRepositorio` (marca obligatoria); `findCierresByMensajeroPaginado` lo devuelve.
- `lib/repositories/CierreDiaRepository.ts` — `toCierrePasadoDTO` devuelve `CierrePasadoDeRepositorio` (único constructor); la paginada lo declara.
- `lib/services/CierreDiaService.ts` — `conPendientePago(items: CierrePasadoDeRepositorio[])` lee la marca sin `=== true`.
- `lib/interfaces/services/ICierreDiaService.ts` — comentario de `CierrePasadoDTO.pagoIndependienteEfectivo`.

Tests (12; 1 nuevo):
- `tests/unit/guards/imputables-solo-en-alcance.guardia.test.ts` (nuevo, R410).
- `tests/unit/repositories/liquidacion-pago-repository.test.ts` — borrado el `describe` sin alcance (7) y el de contraste; 4 casos R411 contra la lectura con alcance.
- Dobles sin el método: `liquidacion-reparto-bloqueos.guardia.test.ts`, `caja-cadena-pago-anulacion.test.ts`, `liquidacion-anulacion.test.ts`, `liquidacion-reparto-service.test.ts` (+ las 3 `not.toHaveBeenCalled()`), `liquidacion-service.test.ts` (solo el doble de `ILiquidacionPagoRepository`, 4 líneas; el de `ICierresAdminRepository` intacto para SLT-149).
- `tests/unit/utils/pago-modelo-nuevo.test.ts` (R412, R413), `tests/unit/services/cierre-pago-por-gestion.test.ts` (R414), `tests/components/FilaGestion.test.tsx` (R415).
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts` (R416, R417).
- `tests/integration/actions/cierre-dia-action.test.ts` — el único doble que pidió el compilador: `pagoIndependienteEfectivo: false` en la página (no la ejercita esa suite; ninguna aserción cambia).

Disco: `progress/impl_SLT-106.md` (R190/R191, D72), `specs/.../requirements.md` (casillas T0-T5).
NO tocado por indicación del leader: `progress/deudas.md` (T6 la cierra el leader tras #156).

## Mapa R → test

| R | Test |
|---|---|
| R410 | `tests/unit/guards/imputables-solo-en-alcance.guardia.test.ts` (3 casos: barrido no vacío; ningún archivo de lib/app/tests nombra el método; el prototipo del repositorio no lo tiene) + `pnpm run typecheck` |
| R411 | `tests/unit/repositories/liquidacion-pago-repository.test.ts`, `describe` «SLT-122 — …listarCierresImputablesEnAlcance (R9)»: «R411: no nombra `resueltoAt` ni pagina», «R411: lee SIETE columnas…escala 2», «R411: listarlos no ESCRIBE nada», «R411: …lista vacia (no null)». WHERE/orden/`take`/`tx`: los dos R9 que ya estaban |
| R412 | `tests/unit/utils/pago-modelo-nuevo.test.ts` «SLT-147 R412»: monto `1250.00`; 10 % de `2750.55` → `275.06` |
| R413 | mismo archivo, «SLT-147 R413»: `derivarPagos` 1250.50 + 1250.00 = `2500.50`; `pagosDelCierre` congela g2 con `1250.00` |
| R414 | `tests/unit/services/cierre-pago-por-gestion.test.ts` «SLT-147 R414»: vista en vivo (grupo `incidente` = `[["g4","1250.00"]]`, total `2750.00`) y solicitud (pago congelado g4 `1250.00`, total `2750.00`) |
| R415 | `tests/components/FilaGestion.test.tsx` «SLT-147 (D66, R415)…»: «₡1.250», sin «₡0» ni «—» |
| R416 | `tests/unit/services/cierre-dia-pendiente-pago.test.ts` «R416: un cierre de la pagina sin la marca no compila» (`@ts-expect-error` sobre el tipo sacado de la firma de `findCierresByMensajeroPaginado`) + `pnpm run typecheck` |
| R417 | mismo archivo: «R417: marca true, P 3 000 y E 5 000, pagado por la satelite 3 000 -> 0.00» (y sin conciliar `3000.00`); marca `false` E ≥ P → `0.00` y P 3 000 / E 1 000 → `2000.00`: ya existían en «SLT-123 R320 — misma pagina…» (citado, no duplicado) |
| R418 | `progress/impl_SLT-106.md` filas R190/R191 → `tests/components/ConsolidacionBodegaRefresco.test.tsx` «(b) R291, deuda R190» (:479) y «(a) R291, deuda R191» (:459) |

## D66: contra el código de hoy

Los 7 casos nuevos de D66 (R412-R415) salieron **verdes sin mutación** contra el código actual: no hay hallazgo de dinero. El caso «incidente 0.00» de la tabla de SLT-52 no se tocó.

## Mutaciones (rojo con la mutación, verde al revertir; salida real)

| # | Mutación | Resultado |
|---|---|---|
| M1 (R410) | volver a declarar `listarCierresImputables?(…)` en `ILiquidacionPagoRepository` | guardia: `Tests 1 failed \| 2 passed (3)` (infractor: la interfaz). Revertida: `3 passed (3)` |
| M2 (R410) | método con nombre computado `["listarCierres" + "Imputables"]` en `LiquidacionPagoRepository` (esquiva el texto) | `× el repositorio no la expone en tiempo de ejecucion` — `1 failed \| 2 passed`. Revertida: `3 passed` |
| M3 (R412-R413) | `if (resultado === "incidente") return "0.00";` en `importePagoNuevo` | `pago-modelo-nuevo.test.ts`: `4 failed \| 14 passed (18)` (los 4 de SLT-147; el «0.00» de SLT-52 sigue verde, que es D66). Revertida: `18 passed` |
| M4 (R414) | la misma de M3 | `cierre-pago-por-gestion.test.ts`: `2 failed \| 10 passed (12)`. Revertida: verde |
| M5 (R415) | `montoDeColumna`: `ganancia` de un `incidente` → `"0.00"` | `FilaGestion.test.tsx`: `1 failed \| 29 passed (30)`. Revertida: `30 passed` (junto con M4: `42 passed`) |
| M6 (R416) | marca opcional en `CierrePasadoDeRepositorio` | `pnpm run typecheck` EXIT 2: `CierreDiaService.ts(646,7) TS2345` y `cierre-dia-pendiente-pago.test.ts(279,5) TS2578 Unused '@ts-expect-error'`. Revertida: EXIT 0 |
| M7 (R416) | `findCierresByMensajeroPaginado` vuelve a devolver `PaginaRepositorio<CierrePasadoDTO>` | typecheck EXIT 2: `CierreDiaService.ts(626,42) TS2345` + el mismo TS2578. Revertida: EXIT 0 |
| M8 (R417) | el servicio ignora la marca (`pagoIndependienteEfectivo: false`) | `cierre-dia-pendiente-pago.test.ts`: `6 failed \| 8 passed (14)` (incluye el R417 nuevo). Revertida: `14 passed` |

`git diff --stat` del archivo mutado tras cada reversión: idéntico al de antes de mutar.

## Verificación final

Variables: `DATABASE_URL` a la base desechable `slt147_wt` y `NODE_OPTIONS=--max-old-space-size=8192` antes de cada vitest. Sin `prisma generate`, sin `init.sh` (lo corre el leader).

- `pnpm run typecheck` → `TC_EXIT=0` (0 `error TS`).
- `npx eslint <los 13 .ts/.tsx tocados>` → `LINT_EXIT=0`, sin salida.
- `npx vitest related --run <los 13 .ts/.tsx tocados>` → `RELATED_EXIT=1`: `Test Files 121 failed | 348 passed (469)`, `Tests 14 failed | 5307 passed | 713 skipped (6034)`.
  **Todos los rojos son de `tests/integration/db/` y de la base desechable `slt147_wt` SIN SEMBRAR**, no del cambio:
  75× «tabla `orden` vacia: corre `pnpm run db:seed`», 31× «faltan la zona central, el tipo `cedula`…», 18× `Cannot read properties of undefined (reading 'prisma')` (setup caído por lo mismo), y en `wallet-458-migration` los catálogos no son los seeds. Ningún rojo fuera de `tests/integration/db/`; todos los unit, guardias y componentes verdes.
  No sembré la base (no es de este agente; el leader corre el gate).
- Integración de lo tocado, que crea sus datos y no depende del seed, contra Postgres real:
  - `cierre-dia-pendiente-pago.test.ts`, `cierre-dia-filtros-propios.test.ts`, `slt139-pago-satelite.int.test.ts` (paginada del histórico, D68) → `3 passed`, `35 passed`, 0 skipped.
  - los que llaman `listarCierresImputablesEnAlcance` o `findCierresByMensajeroPaginado`: `actions/cierre-dia-action.test.ts`, `aprobacion-consultas-en-serie.test.ts`, `pago-mensajero-bodega-duena.test.ts`, `slt123-pago-independiente.int.test.ts` → `4 passed`, `43 passed`, 0 skipped.
- Archivos tocados, sueltos: D63 (7 archivos) `339 passed`; `pago-modelo-nuevo` `18 passed`; `cierre-pago-por-gestion` + `FilaGestion` `42 passed`; `cierre-dia-pendiente-pago` `14 passed`.
- CRLF: ninguno en los archivos tocados.

## Abierto

- T6 (`progress/deudas.md`): lo hace el leader tras mergear #156 (SLT-115).
- T7: `./init.sh` del leader. La base `slt147_wt` necesita `pnpm run db:seed` (o base nueva + `migrate deploy` + seed) para que la integración no salga roja por datos.
- `liquidacion-service.test.ts` choca en archivo con SLT-149 «Fábrica de dobles de ICierresAdminRepository»: aquí solo −4 líneas del doble de `ILiquidacionPagoRepository`.

## Veredicto

R410-R418 implementados con su test y sus mutaciones mordiendo; typecheck y lint verdes; D66 verde contra el código de hoy (sin hallazgo de dinero); el rojo de `vitest related` es la base desechable sin sembrar, a confirmar con el `./init.sh` del leader.
