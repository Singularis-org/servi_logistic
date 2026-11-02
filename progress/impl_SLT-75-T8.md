# SLT-75 · T8 Pantalla (R15-R22) · frontend_dev

Commit: `caa9a79f` (rama `hotfix/SLT-75-distrito-zona-unica`, sin push).

## Archivos
- `app/(app)/configuracion/tarifas/_components/GeografiaSelector.tsx`: prop `zonaEnEdicionId`;
  `estaBloqueado(d, zonaEnEdicionId)`; casilla `disabled` + `aria-label` con `(zona: X)` si bloqueado;
  `(zona: …)` sale de `d.zonas`; `provDistIds`/`cantDistIds` solo seleccionables; grupo sin
  seleccionables `disabled`.
- `.../CrearZonaForm.tsx`: `zonaEnEdicionId={zonaIdGuardada}`; `primeroYCuantosMas(distritoIds)` antes
  del genérico; `conflict` → «Ya existe una zona con ese nombre.».
- `.../ZonasTarifasModule.tsx`: `leerArbol()` (status != ok o excepción → null); `abrirCrear` async y
  `abrirEditar` lo leen al abrir; preselección desde `d.zonas`; si falla no abren.
- Tests nuevos: `tests/unit/components/geografia-selector-zona-ocupada.test.tsx`,
  `tests/components/ZonasTarifasEditarDistritos.test.tsx`, `tests/components/ZonaDistritoEnOtraZona.test.tsx`.
- Fixtures con `zonas`: `geografia-selector-inactivos` (y pasa `zonaEnEdicionId="z-sur"`: sus distritos
  son de la zona editada), `ZonaCentralConfirmacion`, `ZonaDistritoEspecial`, `ZonaNombreNoImprimible`,
  `CrearZonaFormReconciliacion`.
- Ajuste por R21: el caso «validation_error de OTRO campo conserva el genérico» de
  `ZonaNombreNoImprimible` y `ZonaCentralConfirmacion` usaba `distritoIds`; pasa a `tarifas`.

## R → test
| R | Test |
|---|---|
| R15 | geografia-selector-zona-ocupada › R15 (3 casos) |
| R16 | idem › R16 (3 casos) |
| R17 | idem › R17 «checked, no indeterminado» y «sin seleccionables: deshabilitado» |
| R18 | idem › R18 |
| R19 | ZonasTarifasEditarDistritos › R19 |
| R20 | idem › R20 (Crear bloqueado con árbol fresco; Editar falla/lanza; Crear falla) |
| R21 | ZonaDistritoEnOtraZona › R21 (2 casos) |
| R22 | idem › R22 |

## Mutaciones (autocomprobadas: verde sin mutar → grep → rojo → `git checkout --` → diff vacío)
Harness: `run.sh <id> <archivo> <orig> <mut> <grep> <test> <-t>`; `pnpm exec vitest run <test> -t <filtro>`.
| R | Mutación | Rojo |
|---|---|---|
| R15 | quitar `disabled={esBloqueado}` | 3 failed (R15 ×3) |
| R16 | `cantDistIds` con todos los ids | 3 failed (R16 ×3) |
| R17 | `stateFor` sobre todos los distritos del cantón | 1 failed «checked, no indeterminado» |
| R17 | quitar `disabled={cIds.length === 0}` | 1 failed «sin seleccionables» |
| R18 | `estaBloqueado` = `d.zonas.length > 0` | 1 failed R18 |
| R19 | derivar de `provincias` del estado | 1 failed R19 |
| R20 | editar ignora el fallo del árbol | 2 failed (falla/lanza) |
| R20 | crear ignora el fallo del árbol | 1 failed |
| R20 | crear sin `setProvincias(arbol)` | 1 failed «sale bloqueado» |
| R21 | `mensajeDeError` sin rama `distritoIds` | 2 failed R21 |
| R22 | texto viejo del conflict | 1 failed R22 |

## Comandos
- `pnpm exec vitest run` (8 archivos de componentes + guardia): 9 files, 62 passed.
- `etiquetas-geograficas-sin-literal`: 4 passed.
- `pnpm exec eslint <11 archivos>`: sin issues.
- `pnpm run typecheck` (con `NODE_OPTIONS=--max-old-space-size=8192`; sin él, OOM): exit 2, 0 errores en
  mis rutas. Errores ajenos en `lib/repositories/{LibroCajaAutoria,PagoMensajeroMovimiento,WalletMovimiento,WalletTiendaMovimiento}Repository.ts`,
  `lib/services/AnaliticaFinancieraService.ts`, `lib/types/wallet.ts`, `tests/integration/db/{abono-tienda-457,incentivo-mensajero-slt68}.test.ts`.
- `vitest related --run` de los 3 componentes: 87/90; los 2 rojos de `tests/unit/app/tarifas/TarifasPage.cobertura.test.tsx`
  (timeout de 20 s al importar la página, y el segundo en cascada) fallan también solos y mockean
  `ZonasTarifasModule`: no los toca este cambio.

Veredicto: T8 hecha, R15-R22 con test y mutación medida en rojo; falta la evidencia visual (la hace el leader).
