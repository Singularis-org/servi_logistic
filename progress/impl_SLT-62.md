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

## Tanda 2 (decisiones de Carlos, 2026-11-02)

### Archivos
- App: `app/(app)/analitica/_components/entregas/madurez-textos.ts` (helper local `segunNumero`; reutiliza
  `contarOrdenes` de `base-del-kpi.ts`, el helper de plural que ya existía), `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`
  (`textoUniverso` pasa por `contarOrdenes(…, ORDENES)`). `KpisEfectividad.tsx` NO se toca (D1 ya se cumplía).
- Tests: `tests/components/KpisEfectividad.test.tsx`, `tests/unit/components/madurez-textos.test.ts`,
  `tests/components/ProductosTabla.test.tsx`.

### Textos cambiados (antes → después)
| Dónde | n = 1 antes | n = 1 después | n > 1 (sin cambio) |
|---|---|---|---|
| `titularDelHeroe` detalle | «de las 1 orden que entraron» | «de la 1 orden que entró» | «de las 12 órdenes que entraron» |
| `fraseSobreCerradas` | «100% de las 1 orden con desenlace terminaron en Entregado» | «100% de la 1 orden con desenlace terminó en Entregado» | «72,7% de las 11 órdenes con desenlace terminaron en Entregado» |
| `avisoPeriodoEnCurso` (cargadas=1, vivas=1) | «1 de sus 1 orden siguen vivas» | «1 de su 1 orden sigue viva» | — |
| `avisoPeriodoEnCurso` (vivas=1, cargadas=12) | «1 de sus 12 órdenes siguen vivas» | «1 de sus 12 órdenes sigue viva» | «3 de sus 12 órdenes siguen vivas» |
| `ProductosTabla.textoUniverso` | «1 órdenes en el rango · …» | «1 orden en el rango · …» | «12 órdenes en el rango · …» |

Revisadas y SIN cambio: `TEXTO_HEROE.baseCargadas` y `rotuloEfectividadGestion` / `CicloVidaKpi` /
`CohorteCargaTabla` (ya concordaban vía `contarOrdenes`); detalle `sin_cerradas` «0 de 1 orden tienen
desenlace» (el sujeto es `cerradas`, que en esa rama vale siempre 0 → plural correcto, n = 1 inalcanzable);
«supera las ${limite} órdenes» (`DineroProductoDetalle`, `ProductosTabla`: tope fijo, nunca 1);
`eje-de-dias.ts` (cuenta días, no órdenes); `textoAcompanadas` (etiqueta fija «Con otro producto: n de m», sin sustantivo).

### Rojo previo (tests escritos antes del cambio)
3 archivos: 6 failed | 55 passed. Caen: madurez-textos «de la 1 orden que entró», «… terminó en Entregado»,
«1 de su 1 orden sigue viva», «1 de sus 12 órdenes sigue viva»; KpisEfectividad «concuerda en singular con
una sola orden»; ProductosTabla «con una orden: «1 orden en el rango»». El test nuevo de D1 («la tarjeta de
gestión muestra su % con una base chica (12 órdenes)») pasó en verde desde el principio: D1 ya lo cumplía la
tanda 1 y el test sólo lo fija. Formato confirmado ejecutando: `91,7%`, `66,7%`, `72,7%`, `100%` (sin espacio).

### Contrapruebas (revertidas; `git diff` del archivo vacío después)
| Mutación | Failed | Tests que caen |
|---|---|---|
| D1: veto de la tarjeta de gestión `&& total >= 20` en `KpisEfectividad.tsx` | 2 (de 21) | «la tarjeta de gestión muestra su % con una base chica (12 órdenes)», «concuerda en singular con una sola orden» |
| D2: `madurez-textos.ts` y `ProductosTabla.tsx` de vuelta a HEAD (plural fijo) | 6 (de 61) | los 6 del rojo previo |

### Literales de otros tests
Grep de «que entraron», «terminaron en», «siguen vivas», «órdenes en el rango» en `tests/` y `e2e/`: todos los
literales existentes son de n > 1 (790, 525, 12, 3, 8, 265/790, 768) y no cambian. Ninguno ajustado.

### Mapa decisión → test
| Decisión | Test |
|---|---|
| D1 (% de gestión con base chica) | `KpisEfectividad.test.tsx` › «la tarjeta de gestión muestra su % con una base chica (12 órdenes)» (8+3 de 12 → 91,7% DENTRO de la tarjeta con su rótulo; el héroe, `role=group` «Efectividad de entrega», dice 66,7% y no 91,7%) |
| D2 (concordancia) | `madurez-textos.test.ts` › «SLT-62 · tanda 2 · las frases del héroe concuerdan…» (7 casos, n = 1 y n > 1); `KpisEfectividad.test.tsx` › «concuerda en singular con una sola orden» (render); `ProductosTabla.test.tsx` › «SLT-62 · tanda 2 · el universo concuerda…» (2 casos) |

### Verificación final
- Por archivo: KpisEfectividad 21 passed / 0 failed; ProductosTabla 31 / 0; madurez-textos 9 / 0.
- `../../node_modules/.bin/vitest related --run <5 tocados>`: 14 files passed; 232 passed | 17 skipped, 0 failed.
- `NODE_OPTIONS=--max-old-space-size=8192 tsc --noEmit`: exit 0, 0 errores.
- `eslint` de los 5 tocados: exit 0, 0 problemas.
- No corridos (prohibidos en el encargo): `./init.sh`, suite completa, `prisma generate`, dev server.

Veredicto tanda 2: D1 fijado con test acotado a la tarjeta; D2 arreglado en 4 frases, verde, con las dos contrapruebas en rojo.

## Captura T6

Evidencia visual de que el % se pinta limpio con base chica (sin «hacen falta 20») y del singular con 1 orden. Sin cambios de código ni de tests.

| PNG | Recorte | Órdenes | Desenlaces |
|---|---|---|---|
| `progress/capturas/SLT-62/heroe-5-ordenes.png` | empresa local nueva, `/analitica` con el filtro inicial (vacío: `FILTRO_ENTREGAS_INICIAL = {}`, sin rango de fechas) | 5 | 3 entregadas, 1 devolución a origen por rechazo, 1 sin desenlace (`en_preparacion`) |
| `progress/capturas/SLT-62/heroe-1-orden.png` | otra empresa local nueva, mismo filtro | 1 | 1 entregada |

Texto exacto de la tarjeta (`role=group` «Efectividad de entrega», `innerText` leído del DOM):

- 5 órdenes: `EFECTIVIDAD DE ENTREGA | de 5 órdenes cargadas | 60% | Entregado: 3 | de las 5 órdenes que entraron | Entregado 3 | Otro desenlace 1 | Todavía en proceso 1 | 75% de las 4 órdenes con desenlace terminaron en Entregado`
- 1 orden: `EFECTIVIDAD DE ENTREGA | de 1 orden cargada | 100% | Entregado: 1 | de la 1 orden que entró | Entregado 1 | Otro desenlace 0 | Todavía en proceso 0 | 100% de la 1 orden con desenlace terminó en Entregado`

Ninguna de las dos contiene «hacen falta» ni aviso de base pequeña.

Cómo se obtuvo (2026-11-02, HEAD 684c18ad):
- La base local (localhost, comprobado como booleano) no tenía órdenes con desenlace (13 órdenes en 2 empresas, todas sin cerrar) ni credenciales conocidas: el héroe habría caído en `sin_cerradas`.
- Datos sembrados SOLO en la base local por los servicios reales, con los escenarios del E2E (`e2e/_escenarios/reparto.ts` y `cierres.ts`): `crearEscenarioReparto` → `crearMensajero` → `crearOrden` → `llevarA(en_reparto)` → `gestionar` → `solicitarCierre` + `aprobarCierre`. Login del maestro por `/login` real (`paginaDe`). Sin migraciones ni escrituras a mano.
- Un solo `next dev -p 3062` en este worktree, con el doble de Storage (`e2e/_storage-falso`, 54329); los dos se mataron al terminar. El spec y el config de Playwright vivieron en el scratchpad, fuera del repo.
- El escenario se corrió dos veces (la primera solo falló al escribir el JSON con el texto): quedan 4 empresas `e2e-slt62-*` en la base local.
