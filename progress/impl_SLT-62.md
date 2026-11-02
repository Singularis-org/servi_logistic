# SLT-62 — bitácora de implementación (frontend_dev, T1-T5)

Fecha: 2026-11-02. T6 (init.sh, captura en /analitica) queda para el leader.

## Archivos
- Modificados: `lib/analytics/madurez-cohorte.ts`, `app/(app)/analitica/_components/entregas/madurez-textos.ts`,
  `app/(app)/analitica/_components/entregas/EfectividadHeroe.tsx` (llamada sin `cargadas`),
  `tests/unit/analytics/madurez-cohorte.test.ts`, `tests/components/EfectividadHeroe.test.tsx`,
  `tests/components/KpisEfectividad.test.tsx` (literal desfasado, fuera del censo del design),
  `tests/unit/components/textos-455-recorrido.test.ts` (firma), `tests/unit/analytics/tablero-operativo-frontera.guardia.test.ts`.
- Creado: `tests/unit/components/madurez-textos.test.ts`.
- Borrado: `lib/config/efectividad-cohorte.ts` (borrado en el índice con `git rm --cached`; sin eso `catalogo-postgres-acota-esquema.guardia` da ENOENT porque usa `git ls-files`).
- `fraseSobreCerradas` pierde el parámetro `cargadas`: eslint lo marcaba sin uso (design §3 lo prevé).

## Literales confirmados con ejecución (vitest, locale es-CR)
`formatearValor(11/12)` = `91,7%`, `2/3` = `66,7%`, `6/8` = `75%` (NO `75,0 %`), sin espacio.
Los tests los afirman como literales con `\s*` antes del `%`.

## Mapa R → test
| R | Test |
|---|---|
| R1 | `madurez-cohorte.test.ts` › «SLT-62 · R1 · base chica: el % sobre cargadas se escribe» (12/11/1, 1/1/0, 19/x) |
| R2 | `madurez-cohorte.test.ts` › «SLT-62 · R2 · base chica: el % sobre las que tienen desenlace se escribe» (64/2/61, 8/6/0) |
| R3 | `madurez-cohorte.test.ts` › «SLT-62 · R3 · sin cifra ÚNICAMENTE con cero desenlaces…» (3276 repartos) |
| R4 | `EfectividadHeroe.test.tsx` › «Jason Barrios: 11 de 12 pinta 91,7 %» |
| R5 | `EfectividadHeroe.test.tsx` › «la línea de abajo se pinta con 3 y con 8 de 8 con desenlace» |
| R6 | `madurez-textos.test.ts` (barrido 3250) + `EfectividadHeroe.test.tsx` (los 3 casos SLT-62, `queryByText` nulo) |
| R7 | `EfectividadHeroe.test.tsx` › «con 0 de 27 cerradas no hay porcentaje: hay una frase» + `madurez-cohorte.test.ts` › «R2 · CERO CERRADAS…» (existentes) |
| R8 | `EfectividadHeroe.test.tsx` › «sin ninguna orden en el recorte lo dice con esas palabras» (existente) |

## Rojo antes del cambio
- T1 (`vitest related --run lib/analytics/madurez-cohorte.ts`): 8 failed | 110 passed, todos en SLT-62 · R1 (5), R2 (2), R3 (1).
- T3 (los dos archivos, contra la regla y los textos de HEAD): 4 failed | 11 passed: los 3 casos SLT-62 de `EfectividadHeroe.test.tsx` y el barrido de `madurez-textos.test.ts`.

## Mutaciones (T5) — cada una revertida; hash de `git diff` idéntico antes y después
| Mutación | Failed | Tests que caen |
|---|---|---|
| M1 `if (base < 20) return {valor:null,…}` en `porcentaje` | 12 | madurez-cohorte: R1 ×5, R2 ×2, R3 barrido; EfectividadHeroe: los 3 SLT-62; madurez-textos: barrido |
| M2 suelo sólo en `sobreCerradas` | 6 | madurez-cohorte: R1 «1 de 1», R2 ×2, R3 barrido; EfectividadHeroe: «la línea de abajo…»; madurez-textos: barrido |
| M3 frase «hacen falta 20… baile solo» con base < 20 | 4 | EfectividadHeroe: los 3 SLT-62; madurez-textos: barrido |
| M4 quitar guardia `sin_cerradas` | 4 | madurez-cohorte: «con 0 de 27 cerradas, NINGUNA…», «sin ninguna orden tampoco hay porcentaje», R3 barrido; EfectividadHeroe: «con 0 de 27 cerradas no hay porcentaje: hay una frase» |

## Verificación final
- Por archivo: madurez-cohorte 20 passed; EfectividadHeroe 13; KpisEfectividad 20; madurez-textos 2; textos-455-recorrido 8; tablero-operativo-frontera.guardia 21.
- `vitest related --run <tocados>`: 9 passed | 1 skipped files; 140 passed | 23 skipped.
- `vitest run guard`: 2 files failed antes de indexar el borrado; tras `git rm --cached` sólo queda
  `dependencias-declaradas-presentes.guardia` (5 failed): ajeno, «faltan 55 de 55» (el worktree no tiene
  `node_modules` propio) y `init.sh` sin el marcador del paso 2. Esta tanda no toca `init.sh`.
- `tsc --noEmit` (8 GB): 0 errores. eslint de los 9 archivos tocados: 0 problemas.
- `pnpm exec vitest` no encuentra el binario en el worktree; se usó `../../node_modules/.bin/vitest`.

## Abierto para el leader
- `KpisEfectividad.tsx`: la tarjeta «Efectividad de la gestión» comparte el veto del héroe
  (`madurez.sobreCargadas.valor !== null`), así que también pasa a mostrar su % con base chica. El design
  no lo censó. No se tocó el componente; sólo se actualizó su test.
- Con 1 orden aparecen «de las 1 orden que entraron» y «100% de las 1 orden con desenlace»: concordancia
  del artículo, antes inalcanzable por el suelo. Fuera de spec; no se tocó.

## T6 (implementer, 2026-11-02) — pendiente, no marcada
- Re-ejecutado por el implementer: los 6 archivos tocados, 6 passed files / 84 passed tests.
- `rg "hacen falta 20|baile solo|muy pocas para un porcentaje|MINIMO_BASE_PORCENTAJE|base_insuficiente|efectividad-cohorte" app/ lib/`: vacío.
- `./init.sh` no corrido aquí: el gate lo corre el leader.
- Captura de la tarjeta héroe en `/analitica`: no se hizo; exige dev server y el encargo lo prohíbe
  (`.next` compartido con el worktree de SLT-52).

Veredicto: T1-T5 hechas, verdes salvo una guardia de dependencias ajena; quedan dos puntos abiertos.
