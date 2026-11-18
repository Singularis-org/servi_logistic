# impl SLT-198 «Cerrar una bodega: dejar una zona sin distritos»

Implementado por backend_dev (con la excepcion de rol del leader para el `Badge` y el test del
formulario), 2026-11-17. Spec: `specs/SLT-198-zona-sin-distritos/requirements.md`.

## Archivos

Produccion:
- `lib/types/zona.ts` — `distritoIds` sale de los campos comunes: crear `.min(1)`, actualizar
  admite `[]`; `superRefine` de actualizar rechaza `esCentral: true` + `[]`;
  `MENSAJE_CENTRAL_SIN_DISTRITOS` (literal de R1222).
- `lib/interfaces/repositories/IZonaRepository.ts` — estado `central_sin_distritos`.
- `lib/repositories/ZonaRepository.ts` — guarda antes de la primera escritura en `update`.
- `lib/services/ZonaService.ts` — traduce el estado a `validation_error` en `distritoIds`.
- `app/(app)/configuracion/zonas/_components/ZonasModule.tsx` — `Badge` «Sin distritos».
- `playwright.config.ts` — el spec E2E nuevo en el proyecto `aislamiento`.

`CrearZonaForm.tsx` no se toco (T5): ya valida con el esquema de la accion.

Tests:
- `tests/unit/types/zona-schema.test.ts` (bloque SLT-198)
- `tests/unit/services/zona-service.test.ts` (bloque SLT-198)
- `tests/integration/db/zona-sin-distritos.test.ts` (nuevo)
- `tests/components/ZonasModuleListado.test.tsx` (bloque SLT-198/R1230)
- `tests/components/ZonaFormSinDistritos.test.tsx` (nuevo)
- `e2e/zona-sin-distritos.spec.ts` (nuevo)

## R -> test

| R | Test |
|---|---|
| R1220 | `zona-schema.test.ts` «R1220: actualizar acepta `distritoIds: []`»; `zona-service.test.ts` «R1220: una lista vacia llega al repositorio»; `zona-sin-distritos.test.ts` «R1220/R1223/R1225» (0 filas de `zona_distrito`; zona, pagos y tarifas iguales a lo leido antes) |
| R1221 | `zona-schema.test.ts` «R1221: crear sigue rechazando» + caso previo «rechaza conjunto de distritos vacio»; `ZonaFormSinDistritos.test.tsx` «crear: sin marcar ningun distrito» |
| R1222 | `zona-schema.test.ts` «R1222: ... `esCentral: true`»; `zona-service.test.ts` «R1222: -> validation_error ... literal»; `zona-sin-distritos.test.ts` los dos casos «R1222» (estado, zona, distritos e historial iguales) |
| R1223 | `zona-sin-distritos.test.ts` «R1220/R1223/R1225» (una fila por distrito quitado) |
| R1224 | `zona-sin-distritos.test.ts` «R1224/R1226/...» (`findDistritosByCantonIds` y `findDistritoParaCorreccion`: null tras vaciar; GAM / null tras guardar GAM) |
| R1225 | `zona-sin-distritos.test.ts` «R1220/R1223/R1225» (zona intacta en las dos ordenes; resuelto: `ordenesReconciliadas = 0`) |
| R1226 | `zona-sin-distritos.test.ts` «R1224/R1226/...» (ok, 1 reconciliada, 1 retenida) |
| R1227 | idem (retiro -> `en_ruta_bodega_central`) |
| R1228 | idem (recibida sigue en Cartago; re-guardar GAM la pasa) |
| R1229 | `zona-sin-distritos.test.ts` «R1229» (`referenced` / `ok`) |
| R1230 | `ZonasModuleListado.test.tsx` bloque «SLT-198/R1230» |
| R1231 | `ZonaFormSinDistritos.test.tsx` (los dos casos) |
| R1232 | `zona-sin-distritos.test.ts` «R1224/R1226/...» (`listLite` contiene la zona vacia) |
| R1233 | `e2e/zona-sin-distritos.spec.ts` |

## RESUELTO — R1225 (leader, 74a6bb02: spec corregido, sin cambio de código), el conteo de retenidas al vaciar

El spec pide que al VACIAR Cartago la respuesta cuente como retenidas las ordenes de su estante.
El codigo (que el spec da por bueno y no manda tocar) no lo hace: el distrito quitado resuelve
`null` y la reconciliacion hace `continue` antes del conteo (`ZonaRepository.ts`, bucle de
`distritosPorZonaResuelta`), asi que el guardado devuelve `ordenesRetenidasEnBodegaSatelite = 0`.
El conteo de 377 significa «las que este guardado habria movido»: al vaciar no se moveria ninguna.
No se cambio la reconciliacion (contradice el spec en un punto que necesita decision). El test
afirma la parte de R1225 que si se cumple (zona intacta) y `ordenesReconciliadas = 0`.

## Mutaciones (control positivo)

| Mutacion | Resultado |
|---|---|
| Quitar la guarda `central_sin_distritos` del repo (`if (false && ...)`) | rojo: los 2 casos R1222 de integracion |
| Guarda solo con `esCentral === true` (sin «ya es central») | rojo: «R1222: vaciar la central (marca ausente)» |
| `actualizarZonaSchema` vuelve a `.min(1)` | rojo: unit R1220 y R1222; componente «editar» de R1231 |
| Quitar el `superRefine` de central + `[]` | rojo: unit R1222 |
| Quitar la traduccion en `ZonaService` | rojo: unit R1222 del servicio |
| `crearZonaSchema` sin `.min(1)` | rojo: componente «crear» de R1231 |
| Badge con `distritosCount === -1` | rojo: los 2 casos R1230 |

Todas revertidas (`git checkout` / sed inverso; `git status` limpio tras cada una).

## Evidencia (salidas reales, 2026-11-17)

- typecheck: `✓ typecheck paso` (dentro del gate; tambien suelto: 0 `error TS`).
- lint de los archivos tocados: 0 errores (1 warning previo: `normalizeName` sin uso en `ZonaRepository.ts`).
- Unit + componente: `zona-schema`, `zona-service`, `ZonasModuleListado`, `ZonaFormSinDistritos` -> 4 archivos, 83 tests passed.
- Integracion (base desechable `servi_slt198_desechable`, migrate deploy + db:seed): `zona-sin-distritos.test.ts` 5/5.
  Con las suites de zonas que tocan `update` (`zona-central-guarda-y-rastro`, `zona-distrito-rastro`,
  `zona-reconciliacion-ordenes`, `zona-distrito-unica`, `retiro-satelite-central`, `zona-guardado-conserva-costos`,
  `zona-update-conserva-grupos`, `actions/zonas-action`) y `tests/components/` entero: 8023 passed, 2 failed
  (`TableroDiaFiltro.test.tsx`, timeout 20 s por carga; corrido solo: 13/13 verde; no toca zonas).
- E2E (base `servi_slt198e_desechable` + `next build`, puerto 3198, `--retries=0`):
  `zona-sin-distritos` + `zonas-crear-sin-costos` -> 12 passed (con las dependencias de `plataforma-vacia`);
  tras el arreglo de la guardia SINPE, `zona-sin-distritos` otra vez -> 11 passed.
- Gate `./init.sh` (rapido): primera corrida ROJA por la guardia `sinpe-en-toda-superficie` (literal SINPE en el
  E2E; arreglado con constante). Segunda: `INIT_EXIT=0`. Nota: `vitest related` = 487 > presupuesto 150, no
  se corrieron en el gate; por eso la corrida dirigida de arriba.

## Tamano

Produccion: 6 archivos, +52/-7. Tests: 6 archivos, +889 (el estimado del spec era 350-500; el test de
integracion del flujo se llevo ~500).

## Veredicto

Hecho: R1225 (conteo de retenidas al vaciar) contradice el codigo; requiere decision.
