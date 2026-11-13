# SLT-147 «Limpieza de backend de cierres: deudas D63, D66, D68 y D72» — requirements

Ruta **ligera** (`docs/specs.md > Tres rutas`). Rango de requisitos reservado: **R410-R419**
(el más alto en `specs/` es R409, de SLT-115). Se usan R410-R418.

## Alcance

Cuatro deudas de la épica de cierres, sin comportamiento nuevo para ningún usuario:

- **D63** (`progress/deudas.md`, origen review m1 de SLT-124): la lectura de cierres imputables
  **sin alcance** (`ILiquidacionPagoRepository.listarCierresImputables`) ya no tiene consumidores en
  `lib/` ni en `app/`, pero sigue en la interfaz y la usan 8 tests (7 en su `describe` y 1 de
  contraste en el de SLT-122). Mientras exista, un consumidor nuevo podría volver a mezclar cierres de
  satélite con dinero de la central.
- **D66** (`progress/deudas.md`, origen review m2 de SLT-108): en el modelo nuevo el concepto
  `mensajero_incidente` se paga (`importePagoNuevo`), pero `tests/unit/utils/pago-modelo-nuevo.test.ts:44`
  lo prueba justo con «0.00» y nada prueba una «Ganancia» de Incidente mayor que cero.
- **D68** (**no está escrita en `progress/deudas.md`**; su contenido sale de
  `progress/review_SLT-139.md` m3, heredado de SLT-123): `CierrePasadoDTO.pagoIndependienteEfectivo`
  es opcional y `CierreDiaService.conPendientePago` lo lee con `=== true`. Si el mapper la perdiera,
  un cierre nuevo de satélite ya conciliado saldría en `/cierre-dia` con `P − min(P,E)` en vez de
  0.00, y el compilador no lo diría.
- **D72** (**no está escrita en `progress/deudas.md`**; su contenido sale de
  `progress/review_SLT-106.md` menor 1): el mapa R→test de `progress/impl_SLT-106.md` cita para R190 y
  R191 tests que existen pero que no prueban las dos cláusulas señaladas («cambiar de pestaña conserva
  filtros y página», «cambiar un filtro devuelve a la página 1»).

### Lo que NO entra
- Ningún cambio de cálculo de dinero. Si un test de D66 sale rojo contra el código actual, es un
  hallazgo de dinero: se para y se escala (subiría a ruta completa), no se arregla aquí.
- Las otras deudas abiertas (D62, D64, D70…) y la fábrica de dobles de `ICierresAdminRepository`
  (SLT-149 «Fábrica de dobles de ICierresAdminRepository»).
- E2E nuevo de `/cierre-dia` con tarifa del modelo nuevo (ver Decisión 4).

## Lo que ya existe (búsqueda previa)

Buscado `listarCierresImputables`, `mensajero_incidente`, `pagoIndependienteEfectivo`, `R190`/`R191`
en `feature_list.json`, `specs/`, `progress/` y el código del worktree (Grep; el grafo no se consultó):

- **D63:** sin resolver. Única implementación en `lib/repositories/LiquidacionPagoRepository.ts:348`;
  cero llamadas en `lib/` y `app/`. El comentario de la interfaz (`ILiquidacionPagoRepository.ts:312`,
  «`IncentivoMensajeroService` sigue con el de arriba») está desfasado: el incentivo ya usa
  `listarCierresImputablesEnAlcance` (SLT-124).
- **D66:** sin resolver. `pagoPorResultado` → `importePagoNuevo` no tiene rama propia para
  `incidente` (`lib/utils/pago-mensajero.ts:27-58`); `derivarPagos` y `pagosDelCierre`
  (`lib/utils/cierre-totales.ts`) tampoco. La celda «Ganancia» de la fila sale de
  `montoDeColumna(g, "ganancia") = g.pagoMensajero` (`components/private/cierres/fila/fila-gestion-vista.ts:205`),
  sin rama para `incidente`. El E2E `e2e/cierre-dia.spec.ts:174-176` cubre el modelo **viejo** («₡0»).
- **D68:** sin resolver. Un solo constructor en producción: `toCierrePasadoDTO`
  (`lib/repositories/CierreDiaRepository.ts:971`), que ya devuelve la marca siempre (retorno estrecho
  `& { pagoIndependienteEfectivo: boolean }`). **Hallazgo pedido: ningún consumidor de producción
  recibe hoy `undefined`.** Solo la lee `conPendientePago` (`lib/services/CierreDiaService.ts:640-661`),
  y solo en el camino paginado (`findCierresByMensajeroPaginado`); la pantalla no la lee
  (`app/`, `components/`: cero apariciones). Los que hoy la omiten son dobles de test de la pantalla
  (unos 20 archivos), donde `undefined` = `false` y no cambia ningún resultado.
- **D72:** resuelta en el código, no en el mapa. SLT-107 añadió R291 con
  `tests/components/ConsolidacionBodegaRefresco.test.tsx:459` «(a) R291, deuda R191» y `:479`
  «(b) R291, deuda R190», con mutación V2 matada (`progress/impl_SLT-107.md:306`). El mapa de
  `progress/impl_SLT-106.md:198-199` no los cita.

## Decisiones (técnicas, del spec_author)

| # | Decisión | Por qué |
|---|---|---|
| 1 | **D63: borrar** `listarCierresImputables` de la interfaz y del repositorio, y pasar a la lectura con alcance los invariantes que solo se probaban sobre la sin alcance. Más una guardia que impida que el nombre vuelva. | Cero consumidores (evidencia arriba). Borrarla hace del compilador la guardia principal: no se puede llamar lo que no existe. Una guardia que prohíba llamarla desde `lib/` dejaría el método vivo en la interfaz, obligaría a mantener sus 8 tests y sus dobles en 5 archivos, y una guardia de texto se elude (alias, `repo["…"]`). |
| 2 | **D63:** los 7 tests de su `describe` no se pierden: se reescriben contra `listarCierresImputablesEnAlcance` los que hoy no tienen equivalente con alcance (select de 7 columnas y escala 2, sin `skip`/`cursor`, sin `resueltoAt`, sin escrituras en `cierre_dia`, lista vacía). El de contraste («la lectura SIN alcance no cambia») se borra. | El `WHERE`, el orden, el `take` y el `tx` ya están probados con alcance (`liquidacion-pago-repository.test.ts:1199-1223`); el resto solo existía en la versión que se va. |
| 3 | **D66:** se prueba en tres capas sin E2E: `lib/` (importe), servicio (la gestión Incidente del cierre lleva ese pago y el total lo suma) y la fila (la celda «Ganancia» lo pinta). | La única lógica con riesgo propio de `incidente` está en `lib/`; servicio y fila no tienen rama para el resultado, así que un test de cada uno basta para cerrar la cadena «de punta a punta». |
| 4 | **D66: sin E2E nuevo.** | Un E2E del modelo nuevo exige montar tarifas por concepto en la base desechable; cuesta mucho más que los tres tests de arriba y no prueba nada que ellos no prueben (ninguna capa tiene rama para `incidente`). |
| 5 | **D68: la marca es obligatoria en el tipo que el repositorio entrega al servicio** (la lectura paginada del histórico, la única que deriva el pendiente), no en el DTO de la pantalla. Ver Pregunta 1. | El riesgo de D68 está en la frontera repositorio → servicio. Hacerla obligatoria en `CierrePasadoDTO` obliga a tocar ~20 dobles de pantalla que no la usan y lleva el PR a ~35-40 archivos (tope 40, aviso en 32). |
| 6 | **D72:** se corrige el mapa de `progress/impl_SLT-106.md` (R190 y R191 citan los tests (a) y (b) de SLT-107). No se escribe test nuevo. | Los tests existen, prueban las dos cláusulas y su mutación está matada. |
| 7 | **Dinero:** la feature no cambia ningún cálculo. D66 añade tests sobre un comportamiento existente; D68 cambia un tipo; D63 borra una lectura sin consumidores. Por eso sigue en ruta ligera. | Si R412-R414 salen rojos contra el código actual, se para (Lo que NO entra). |

## Requisitos (EARS)

**D63 — lectura de imputables sin alcance**

- **R410.** El repositorio de pagos de liquidación NO DEBE ofrecer ninguna lectura de cierres
  imputables de un mensajero que no reciba el alcance del actor; el nombre de la lectura sin alcance
  NO DEBE aparecer en `lib/`, `app/` ni `tests/` (salvo en la guardia que lo prohíbe).
  *Test:* `tests/unit/guards/imputables-solo-en-alcance.guardia.test.ts` (nueva) + `pnpm run typecheck`.
  Mutación: volver a declarar el método en la interfaz o llamarlo desde un archivo de `lib/` → rojo.
- **R411.** La lectura de cierres imputables con alcance DEBE leer exactamente las siete columnas
  (`id`, `mensajeroId`, `estado`, `totalPagoMensajero`, `totalEfectivo`, `pagoIndependienteEfectivo`,
  `solicitadoAt`), emitir los montos como texto de escala 2, no paginar (`take`, `skip` ni `cursor`),
  no nombrar `resueltoAt`, no escribir en `cierre_dia` y devolver `[]` (no `null`) sin cierres.
  *Test:* `tests/unit/repositories/liquidacion-pago-repository.test.ts`, `describe` de
  `listarCierresImputablesEnAlcance`.

**D66 — Incidente con ganancia > 0 en el modelo nuevo**

- **R412.** CUANDO una gestión con resultado `incidente` tiene una tarifa del modelo nuevo cuyo valor
  del mensajero es el concepto `mensajero_incidente` mayor que cero, el pago al mensajero de esa
  gestión DEBE ser exactamente ese importe (modo monto) o ese % del flete sin IVA (modo porcentaje),
  sin IVA, en texto de escala 2.
  *Test:* `tests/unit/utils/pago-modelo-nuevo.test.ts` (literales a mano: monto `1250.00`; porcentaje
  10 % de una base `2750.55` → `275.06`).
- **R413.** CUANDO un cierre del modelo nuevo tiene una gestión `entregado` y una `incidente`, ambas con
  valor del mensajero mayor que cero, el total de pago al mensajero del cierre DEBE ser la suma de los
  dos importes, y el pago congelado de la gestión Incidente DEBE llevar su importe.
  *Test:* `tests/unit/utils/pago-modelo-nuevo.test.ts` (`derivarPagos` y `pagosDelCierre`).
- **R414.** CUANDO el mensajero consulta en `/cierre-dia` un cierre del modelo nuevo con una gestión
  `incidente` cuyo valor `mensajero_incidente` es mayor que cero, el servicio DEBE entregar esa
  gestión, en el grupo Incidente, con ese pago, y el total de pago al mensajero DEBE incluirlo.
  *Test:* `tests/unit/services/cierre-pago-por-gestion.test.ts`.
- **R415.** CUANDO la fila de una gestión `incidente` se pinta para el mensajero con un pago mayor que
  cero, la celda «Ganancia» DEBE mostrar ese importe (`1250.00` → «₡1.250»), nunca «₡0» ni «—».
  *Test:* `tests/components/FilaGestion.test.tsx`. El literal «₡1.250» se mide una vez renderizando y
  se escribe a mano; no se compara contra el formateador.

**D68 — la marca del pago independiente, obligatoria**

- **R416.** El tipo con el que el repositorio entrega al servicio la página del histórico de cierres
  del mensajero DEBE exigir la marca `pagoIndependienteEfectivo` como booleano: un objeto sin ella NO
  DEBE compilar.
  *Test:* `tests/unit/services/cierre-dia-pendiente-pago.test.ts`, con un `// @ts-expect-error` sobre
  un cierre sin la marca (si la marca vuelve a ser opcional, `pnpm run typecheck` da rojo).
- **R417.** CUANDO el servicio calcula el pendiente de pago de la página del histórico, DEBE usar la
  marca tal como la entregó el repositorio, sin valor por defecto: un cierre `aprobado` con marca
  `true`, pago 3 000 y efectivo 5 000, ya pagado por la satélite, DEBE salir con pendiente `0.00`; el
  mismo cierre con marca `false` DEBE salir con `0.00` por la regla de la 44 y, con pago 3 000 y
  efectivo 1 000, con `2000.00`.
  *Test:* `tests/unit/services/cierre-dia-pendiente-pago.test.ts` (si ya hay casos equivalentes, se
  citan en el mapa y no se duplican).

**D72 — mapa de SLT-106**

- **R418.** El mapa R→test de `progress/impl_SLT-106.md` DEBE citar para R190 y R191 los tests que
  prueban sus cláusulas: R190 → `tests/components/ConsolidacionBodegaRefresco.test.tsx` «(b) R291,
  deuda R190»; R191 → el mismo archivo, «(a) R291, deuda R191».
  *Test:* los dos tests citados, que ya existen (el reviewer comprueba que existen y que el mapa los
  nombra).

## Tasks

- [x] **T0** — Copiar `.env` al worktree antes del primer gate. *Hecho:* existe y el gate no salta la
  integración.
- [x] **T1 (D63, R410-R411)** — Borrar `listarCierresImputables` de
  `lib/interfaces/repositories/ILiquidacionPagoRepository.ts` y de
  `lib/repositories/LiquidacionPagoRepository.ts`; corregir los comentarios que la citan
  (`ILiquidacionPagoRepository.ts:309-312`, `:324`; `LiquidacionPagoRepository.ts:381`, `:417`).
  Quitarla de los dobles de los 5 tests de servicio/guardia que la declaran, y las 3 aserciones
  `not.toHaveBeenCalled()` de `liquidacion-reparto-service.test.ts` (ya las garantiza el compilador).
  Reescribir contra la lectura con alcance los tests de R411 y borrar el de contraste
  (`liquidacion-pago-repository.test.ts:1225-1233`). Crear la guardia de R410. *Hecho:* typecheck
  verde; `grep -rn "listarCierresImputables\b" lib app tests` solo encuentra la guardia; mutación de
  R410 roja y revertida.
- [x] **T2 (D66, R412-R413)** [P] — Casos nuevos en `pago-modelo-nuevo.test.ts` (no se toca el caso
  «0.00» de la tabla de SLT-52). *Hecho:* verdes contra el código actual; mutación «`incidente` →
  `0.00`» en `importePagoNuevo` roja y revertida. Si salen rojos sin mutación: parar y avisar al leader.
- [x] **T3 (D66, R414-R415)** [P] — Caso nuevo en `cierre-pago-por-gestion.test.ts` y en
  `FilaGestion.test.tsx`. *Hecho:* verdes; mutación «la celda Ganancia de un incidente pinta 0» roja y
  revertida.
- [x] **T4 (D68, R416-R417)** — Declarar el tipo con la marca obligatoria para la lectura paginada del
  histórico (`ICierreDiaRepository.findCierresByMensajeroPaginado`), con `toCierrePasadoDTO` como
  único constructor; `conPendientePago` recibe ese tipo y lee la marca sin `=== true`; actualizar el
  comentario de `ICierreDiaService.ts:352-357`. Añadir `pagoIndependienteEfectivo: false` (el valor que
  hoy se infiere) a los dobles que el compilador pida, nunca `true` donde no estaba. *Hecho:*
  typecheck verde; los tests de los dobles tocados no cambian ninguna aserción; el `@ts-expect-error`
  de R416 muerde (quitarlo con la marca opcional → rojo).
- [x] **T5 (D72, R418)** [P] — Editar las filas R190 y R191 de `progress/impl_SLT-106.md`.
  *Hecho:* el mapa cita los dos tests de `ConsolidacionBodegaRefresco.test.tsx`.
- [ ] **T6** — `progress/deudas.md`: marcar D63 y D66 como cerradas (commit, R410-R415) y **dar de
  alta D68 y D72 ya cerradas** (hoy no existen en el archivo), con su origen. *Hecho:* las cuatro
  constan como cerradas.
- [ ] **T7** — `./init.sh` verde con `INIT_EXIT` en el log; mapa R410-R418 → test en
  `progress/impl_SLT-147.md`.

## Tamaño

Estimado, con el tope de `docs/gate.md > Tamaño del PR` (40 archivos con tests, aviso al 80 % = 32;
1000 líneas de producción; 3000 de tests):

| | Archivos | Líneas (añadidas + borradas) |
|---|---|---|
| Producción | 6 | ~100 (D63 ~-75; D68 ~25) |
| Tests | 11 seguros + 0-5 dobles de D68 | ~450 (D63 ~250, D66 ~150, D68 ~50) |
| **Total** | **17-22** | |

`progress/` y `specs/` no cuentan. Con la variante literal de D68 (Pregunta 1, opción B) los tests
subirían a ~30-35 archivos y el total a **~37-41**: por encima del aviso y posiblemente del tope.

## Archivos esperados

Producción:
- `lib/interfaces/repositories/ILiquidacionPagoRepository.ts`
- `lib/repositories/LiquidacionPagoRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/services/CierreDiaService.ts`

Tests (D63):
- `tests/unit/repositories/liquidacion-pago-repository.test.ts`
- `tests/unit/guards/imputables-solo-en-alcance.guardia.test.ts` (nuevo)
- `tests/unit/guards/liquidacion-reparto-bloqueos.guardia.test.ts`
- `tests/unit/services/caja-cadena-pago-anulacion.test.ts`
- `tests/unit/services/liquidacion-anulacion.test.ts`
- `tests/unit/services/liquidacion-reparto-service.test.ts`
- `tests/unit/services/liquidacion-service.test.ts` — **también tiene un doble de
  `ICierresAdminRepository`** (aquí solo se toca el doble de `ILiquidacionPagoRepository`): choca en
  archivo con SLT-149.

Tests (D66):
- `tests/unit/utils/pago-modelo-nuevo.test.ts`
- `tests/unit/services/cierre-pago-por-gestion.test.ts`
- `tests/components/FilaGestion.test.tsx`

Tests (D68; los cuatro últimos solo si el compilador lo pide):
- `tests/unit/services/cierre-dia-pendiente-pago.test.ts`
- `tests/unit/services/cierre-dia-pasados-paginado.test.ts`
- `tests/unit/services/cierre-dia-pasados-filtros.test.ts`
- `tests/unit/services/cierre-dia-477-resolicitud.test.ts`
- `tests/integration/actions/cierre-dia-action.test.ts`

Disco del arnés (no cuentan para el tamaño):
- `progress/impl_SLT-106.md`
- `progress/deudas.md`
- `progress/impl_SLT-147.md`

## Preguntas abiertas

1. **D68: ¿la marca obligatoria en el tipo del repositorio (A) o en `CierrePasadoDTO` (B)?** La ficha
   dice B. **Recomendación: A** (Decisión 5): cierra el mismo riesgo (el mapper no puede perder la
   marca sin que el compilador lo diga, y el servicio deja de suponer `false`), toca 0-5 dobles en vez
   de ~20 de pantalla que no la usan, y el PR queda en 17-22 archivos. B lleva el PR a ~37-41 archivos
   y pediría `tamano-pr-aceptado` o partir. Depende de Carlos porque cambia lo que dice la ficha.
2. **D68 y D72 no están en `progress/deudas.md`** (el archivo acaba en D66 y D67-D72 no aparecen en
   ningún archivo del worktree; D70 solo se nombra en `progress/review_SLT-134.md:56`). Este spec toma
   su contenido de las reviews citadas en el Alcance. Si el leader tiene otro texto para ellas, que lo
   diga antes de implementar; si no, T6 las da de alta ya cerradas.
