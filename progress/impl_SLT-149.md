# impl SLT-149 «Fábrica de dobles de ICierresAdminRepository»

backend_dev, 2026-11-13. Ruta ligera. Solo tests: cero cambios en `lib/` y `app/` (`git status -- lib app` vacío).
El grafo no se consultó: todo con Grep/Read sobre el worktree.

## T0 — Re-inventario sobre el árbol con SLT-147

- SLT-147 «Limpieza de backend de cierres» borró `listarCierresImputables` de **`ILiquidacionPagoRepository`**, no de
  `ICierresAdminRepository`: `git diff origin/dev -- lib/interfaces/repositories/ICierresAdminRepository.ts` vacío.
- Barrido de `tests/` (cast, `satisfies`, función con tipo de retorno, alias local): los **mismos 24** archivos
  A1-A12/B1-B12 del spec, en las mismas líneas. `liquidacion-service.test.ts` solo importa el tipo `Alcance`.
- **Diferencia con el spec:** el interfaz tiene **20** métodos obligatorios + 1 opcional, no 22 (la tabla D2/D3 del
  propio spec lista 20). El test de completitud afirma `>= 20` (T2 pedía `>= 22`, que estaría rojo siempre).

## Archivos

Nuevos (3):
- `tests/fixtures/dobles/cierres-admin-repository.ts` — `dobleCierresAdmin(sobrescrituras?)` y tipo `DobleCierresAdmin`.
- `tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts` — completitud (R430-R433), 5 tests.
- `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts` — guardia de dobles a mano (R438-R439), 16 tests.

Migrados (24), con las sobrescrituras que difieren de la tabla D2/D3:

| # | Archivo | Sobrescrituras |
|---|---|---|
| A1 | `cierres-admin-service.test.ts` | ninguna (`repoCon` sigue igual) |
| A2 | `cierres-admin-aviso-rechazo.test.ts` | `findCierreByIdEnAlcance` y `resolverCierre` con traza |
| A3 | `cierres-admin-ajustar-pago.test.ts` | `findGestionEditableEnCierre` (`editable()`), `ajustarPagoMensajeroEnCierre` (`UPDATED`) |
| A4 | `cierres-admin-corregir-resultado.test.ts` | `findGestionEditableEnCierre`, `corregirResultadoGestionEnCierre` (`updated`) |
| A5 | `cierres-admin-corregir-pagos.test.ts` | `findGestionEditableEnCierre`, `actualizarPagosGestion` (`updated`) |
| A6 | `cierres-admin-confirmacion-fisica.test.ts` | `actualizarPagosGestion` (`fuera_de_alcance`) |
| A7 | `cierres-admin-indemnizacion.test.ts` | ninguna |
| A8 | `cierres-admin-pendiente.test.ts` | ninguna (`repoConDetalle` sigue igual) |
| A9 | `cierres-admin-tope-sin-gestion.test.ts` | ninguna |
| A10 | `CierresAdminService.aprobar.devolucion.test.ts` | ninguna |
| A11 | `indemnizacion-tope-negocio-cierre.test.ts` | `findGestionesIncidenteDelCierre` (`delCierre`) |
| A12 | `liberacion-al-aprobar-cierre.test.ts` | `findCierreByIdEnAlcance`, `resolverCierre` con traza |
| B1 | `cierres-admin-completo.test.ts` | los 5 de lectura (honestos) |
| B2 | `cierres-admin-filtro-estado.test.ts` | los 4 de lectura |
| B3 | `cierres-admin-historico-paginado.test.ts` | `findCierresByAlcance`, `findHistoricoPaginado` |
| B4 | `cierres-admin-pendientes-paginado.test.ts` | `findCierresByAlcance`, `findColaPaginada` |
| B5 | `cierres-admin-detalle-lectura.test.ts` | `findCierreByIdEnAlcance`, `resolverCierre`, `forzarSolicitudVencido` (por alcance) |
| B6 | `cierres-admin-fulfillment-solo-central.test.ts` | `findCierreByIdEnAlcance`, `findGestionesPorAlcanceCompleto` |
| B7 | `cierres-admin-retenidas.test.ts` | ninguna (las de cada `it` siguen) |
| B8 | `cierres-admin-senales-cola.test.ts` | ninguna (las de cada `it` siguen) |
| B9 | `cierres-resumen-modelo-nuevo-descarga-service.test.ts` | `findHistoricoCompleto`, `findColaCompleta`, `contarSenalesPorCierre` (opcional), `findGestionesDeCierresEnAlcance` |
| B10 | `cierres-gestiones-modelo-nuevo-descarga-service.test.ts` | `findGestionesPorAlcanceCompleto`, `findRechazosTiendaModeloNuevoCompleto`; fuera el `& {…}` |
| B11 | `CierresAdminService.gestiones-completo.test.ts` | `findGestionesPorAlcanceCompleto`; fuera el `& {…}` |
| B12 | `cierre-desglose-tres-superficies.test.ts` | `findCierreByIdEnAlcance` |

D3 aplicada en los 12 completos: el `throw` de `findGestionesDeCierresEnAlcance` pasa a `Map` vacío (ningún test cambió).

**Lo que el cast escondía (B6, B11, B12):** sus datos no cumplían el contrato (sin `rechazosDeTienda` ni
`pagoIndependienteEfectivo` en el detalle; DTO en vez de `CierreGestionDescargaRow`). Para no cambiar el
comportamiento (R436) se conservan tal cual con un cast **del dato** al tipo de retorno del método
(`as unknown as DetalleDelRepo` / `as FilasDescargaDelRepo`, alias derivados con `ReturnType`), comentado. No es un
cast del repositorio y la guardia no lo cuenta. Abierto: completar esos datos es otra ficha (cambiaría lo que pintan).

Además: 5 imports de tipo `ICierresAdminRepository` quedaron sin uso y se quitaron (A10, A12, B2, B5, B10).

## R437 — antes = después (T3)

Medido con `vitest run --reporter=json` sobre los 24 (base desechable `slt149_wt`), antes de tocar ninguno y
después de la migración. «Títulos» = hash de los `fullName` de `describe`/`it` ordenados.

| # | Archivo | `expect(` antes | verdes antes | `expect(` después | verdes después | títulos |
|---|---|---|---|---|---|---|
| A1 | `cierres-admin-service.test.ts` | 293 | 106/106 | 293 | 106/106 | iguales |
| A2 | `cierres-admin-aviso-rechazo.test.ts` | 74 | 28/28 | 74 | 28/28 | iguales |
| A3 | `cierres-admin-ajustar-pago.test.ts` | 35 | 24/24 | 35 | 24/24 | iguales |
| A4 | `cierres-admin-corregir-resultado.test.ts` | 34 | 26/26 | 34 | 26/26 | iguales |
| A5 | `cierres-admin-corregir-pagos.test.ts` | 28 | 13/13 | 28 | 13/13 | iguales |
| A6 | `cierres-admin-confirmacion-fisica.test.ts` | 72 | 32/32 | 72 | 32/32 | iguales |
| A7 | `cierres-admin-indemnizacion.test.ts` | 35 | 16/16 | 35 | 16/16 | iguales |
| A8 | `cierres-admin-pendiente.test.ts` | 62 | 43/43 | 62 | 43/43 | iguales |
| A9 | `cierres-admin-tope-sin-gestion.test.ts` | 12 | 6/6 | 12 | 6/6 | iguales |
| A10 | `CierresAdminService.aprobar.devolucion.test.ts` | 8 | 4/4 | 8 | 4/4 | iguales |
| A11 | `indemnizacion-tope-negocio-cierre.test.ts` | 24 | 12/12 | 24 | 12/12 | iguales |
| A12 | `liberacion-al-aprobar-cierre.test.ts` | 31 | 14/14 | 31 | 14/14 | iguales |
| B1 | `cierres-admin-completo.test.ts` | 48 | 8/8 | 48 | 8/8 | iguales |
| B2 | `cierres-admin-filtro-estado.test.ts` | 9 | 4/4 | 9 | 4/4 | iguales |
| B3 | `cierres-admin-historico-paginado.test.ts` | 43 | 8/8 | 43 | 8/8 | iguales |
| B4 | `cierres-admin-pendientes-paginado.test.ts` | 54 | 9/9 | 54 | 9/9 | iguales |
| B5 | `cierres-admin-detalle-lectura.test.ts` | 22 | 13/13 | 22 | 13/13 | iguales |
| B6 | `cierres-admin-fulfillment-solo-central.test.ts` | 20 | 13/13 | 20 | 13/13 | iguales |
| B7 | `cierres-admin-retenidas.test.ts` | 25 | 10/10 | 25 | 10/10 | iguales |
| B8 | `cierres-admin-senales-cola.test.ts` | 13 | 6/6 | 13 | 6/6 | iguales |
| B9 | `cierres-resumen-modelo-nuevo-descarga-service.test.ts` | 20 | 7/7 | 20 | 7/7 | iguales |
| B10 | `cierres-gestiones-modelo-nuevo-descarga-service.test.ts` | 24 | 8/8 | 24 | 8/8 | iguales |
| B11 | `CierresAdminService.gestiones-completo.test.ts` | 19 | 14/14 | 19 | 14/14 | iguales |
| B12 | `cierre-desglose-tres-superficies.test.ts` | 14 | 5/5 | 14 | 5/5 | iguales |

Total: 429/429 antes y después; 24 de 24 filas iguales.

## T7 — Mutaciones (ninguna commiteada; cada una revertida con copia byte a byte y `cmp`)

1. **Fuera `findBarridasDelCierre` de la fábrica.** `tsc` EXIT=2 con UN error:
   `tests/fixtures/dobles/cierres-admin-repository.ts(38,3): error TS2741: Property 'findBarridasDelCierre' is missing`.
   Completitud EXIT=1, 2 rojos: `metodos obligatorios sin doble en la fabrica: expected [ 'findBarridasDelCierre' ] to deeply equal []`.
   Revertida: 5/5 verdes, EXIT=0.
2. **Método obligatorio ficticio en el interfaz** (`metodoFicticioSlt149`).
   - Solo en el interfaz: `tsc` EXIT=2 con 21 errores en 17 archivos. Todos menos el de la fábrica son la clase real
     `CierresAdminRepository` que no lo implementa (`Argument of type 'CierresAdminRepository' is not assignable…`),
     no dobles: `lib/actions`, `lib/repositories`, integración y `new CierresAdminRepository` en A1.
   - Como se añadiría de verdad (interfaz + clase real): `tsc` EXIT=2 con **un solo archivo**:
     `tests/fixtures/dobles/cierres-admin-repository.ts(38,3): error TS2741: Property 'metodoFicticioSlt149' is missing`.
   Revertida (`git status -- lib` vacío): `tsc` EXIT=0.
3. **Cast `as unknown as ICierresAdminRepository` de vuelta en B3.** Guardia EXIT=1:
   `+ "tests/unit/services/cierres-admin-historico-paginado.test.ts:161"`, 1 rojo / 15 verdes. Revertida: 16/16, EXIT=0.
4. **Default de `findCierreByIdEnAlcance` a `undefined`: SOBREVIVE** (24 archivos, 429/429 verdes, EXIT=0).
   Es una mutación equivalente: el servicio trata `undefined` como `null`. Lo comprobé con un `throw` en ese default:
   también sobrevive (429/429). Ninguna suite usa ese default: todas las que llaman al método lo sobrescriben.
   **Sustituta, 4c: default de `resolverCierre` a `"conflict"`.** EXIT=1, 27 rojos en 5 archivos (A10 1, A6 6, A7 5,
   A8 10, A11 5). Revertida: 24 archivos, 429/429, EXIT=0. Las suites sí dependen de la fábrica.

## Mapa R → test

- R430, R431, R432, R433 → `tests/unit/guards/fabrica-dobles-cierres-admin.guardia.test.ts` (+ mutación 1).
- R434 → mutación 2 (interfaz + clase real: un solo archivo en rojo).
- R435 → `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts` «ningun archivo de tests/ salvo la fabrica…» sobre el árbol.
- R436, R437 → las 24 suites migradas en verde y la tabla de arriba (+ mutación 4c).
- R438, R439 → `tests/unit/guards/dobles-cierres-admin-a-mano.guardia.test.ts` (8 formas que detecta, 5 que no) (+ mutación 3).
  La guardia cuenta además la variable anotada con el interfaz a la que se asigna un literal (forma a mano que el spec no listaba).

## Verificación (salida real)

- `pnpm exec tsc --noEmit -p tsconfig.json` → `TYPECHECK_EXIT=0`.
- `pnpm exec eslint <27 tocados>` → `ESLINT_EXIT=0`, 0 errores, 10 warnings de parámetros `_alcance`/`_rango`/`_filtros` ya
  existentes en B2 (líneas que no toqué).
- `pnpm exec vitest related --run <27 tocados>` → `RELATED_EXIT=0`, 450 tests, 450 verdes (429 migrados + 5 + 16).
- `pnpm exec vitest run guard` → `GUARDIAS_EXIT=1`: 5070 verdes, 4 rojos, todos en
  `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` (`init.sh ya no tiene el marcador ">>> FIN PASO 2…"`).
  **No es de esta rama:** `init.sh` y esa guardia están sin tocar; `init.sh` llegó así con `chore(arnes): sync a 2.14.0`.

## Abierto para el leader

- Un log mío del scratchpad (`tc.log`) apareció con la cabecera de `pnpm run typecheck` del worktree de SLT-147: el
  scratchpad lo comparte otro agente y el nombre chocó. Re-medido: `pnpm run` aquí corre en este worktree. Los logs de
  las mutaciones y del cierre llevan nombres propios y nombran archivos y métodos de esta rama.
- Guardia de dependencias en rojo por `init.sh` (arriba).
- Datos fuera de contrato en B6, B11 y B12 (arriba), conservados con un cast del dato.
- T2 decía `>= 22` obligatorios; el interfaz tiene 20.

Veredicto: T1-T7 hechos, 24 de 24 migrados con R437 igual antes y después; T8 (`./init.sh`) queda para el leader.


## T8 (leader)
- `./init.sh` verde tras mergear dev: `INIT_EXIT=0` (log `gate-149b.log`, base `slt149_wt`). Nota de la review: «429/429» son tests, no `expect(`; R437 por `expect(` lo comprobó el reviewer en 7 archivos (iguales). D69 cerrada; B6/B11/B12 a D75.
