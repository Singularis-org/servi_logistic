# SLT-55 — valor-propio-mensajero · bitácora de implementación

## Tanda 0 y Tanda A — Escritura (backend)

Fecha: 2026-11-05. Agente: `backend_dev`. Base: la desechable `servi_gate_slt55`, comprobada con
`current_database()` desde `crearPrismaDeTest`. Sin migración y sin dependencias.

**T0.1.** `.env` existe, `DATABASE_URL` existe, no apunta a Ordenex (solo booleanos). Los archivos de la tanda
corren con 0 saltos.

### Archivos

| Archivo | Cambio |
|---|---|
| `lib/types/tarifa-flexible.ts` | `mensajeroId` en `nivelSchema` (`nullable().default(null)`) y en `FijarValorInput` |
| `lib/interfaces/repositories/ITarifaValorRepository.ts` | `FijarValorDatos.mensajeroId` y `mensajeroEsElegibleONivelOcupado` |
| `lib/services/TarifaValorService.ts` | Nivel real, chequeo R7 y R8 en `referenciasInvalidas`, `fijar` con `mensajeroId` |
| `lib/repositories/TarifaValorRepository.ts` | `mensajeroEsElegibleONivelOcupado`, `fijar` y `etiquetaDelValor` |
| `lib/types/historial-accion-etiquetas.ts` | Comentario de `tarifa_valor` |
| `tests/integration/db/tarifas-valor-propio-escritura.test.ts` | Nuevo, 21 casos contra Postgres |
| `tests/unit/services/tarifa-valor-service.test.ts` | Bloque SLT-55; `mensajeroId: null` en el literal de SLT-54 R52 |
| `tests/unit/types/tarifa-schemas.test.ts` | Bloque `escrituraValorSchema` |
| `tests/unit/tarifas/esquemas-escritura.test.ts` | `mensajeroId: null` en el literal: el esquema ahora lo devuelve |
| `tests/integration/db/tarifa-activacion.test.ts` | `mensajeroId: null` en sus `FijarValorDatos`: lo exige el tipo |

### Mapa R → test (solo los de esta tanda)

`escritura` = `tests/integration/db/tarifas-valor-propio-escritura.test.ts`, `service` =
`tests/unit/services/tarifa-valor-service.test.ts`, `esquema` = `tests/unit/types/tarifa-schemas.test.ts`.

| R | Test |
|---|---|
| R1 | `escritura` «R1 — guarda modo y valor…»; `service` «R1: llega al repositorio…» |
| R2 | `escritura` «R2 — un valor por cada uno de los 5 resultados…»; `service` «R2: %s admite su valor propio» |
| R3 | `escritura` «R3 — fijar de nuevo reemplaza…» y «R3 — dos fijaciones que chocan…»; `service` «R3: …» |
| R4 | `escritura` «R4 — quitar borra la fila y ese resultado pasa a resolverse con el nivel siguiente»; `service` «R4: …» |
| R5 | `escritura` «R5 — si %s…»; `service` «R5: %s…»; `esquema` «R5: un valor propio con %s…» |
| R6 | `escritura` «R6 — mensajero con otro nivel…»; `service` «R6: %s…»; `esquema` «R6: conserva la clave…». La base: `tarifas-flexibles-migration.test.ts` |
| R7 | `escritura` «R7 — rol admin, rol adminTienda, id inexistente y mensajero de B…» |
| R8 | `escritura` «R8 — inactivo / bloqueado…», «R8 — quien dejó de ser mensajero…», «R8 — un usuario pendiente…» |
| R9 | `escritura` «R9 — la base rechaza con SQL a mano…», con control positivo, como `servi_app` y como dueño |
| R10 | `escritura` «R10 — quien no es maestro…»; `service` «R10: $rol…». La action va en T3.3 |
| R11 | `escritura` «R11 — fijar, reemplazar y quitar…» (etiqueta literal `mensajero_entregado · Ana Torres`) y «R11 — en la misma transacción…» |
| R26 | `escritura` «R26 — borrar de la base a un usuario sin gestiones…» y «R26 — con gestiones…» |

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0, 0 errores.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, ninguno en los archivos tocados.
- Los 8 archivos cercanos (la tanda, `tarifa-activacion`, `tarifas-flexibles-escritura`, `servicios-composicion` y
  `tarifas-action`): `Test Files 8 passed (8)`, `Tests 246 passed (246)`, 0 saltos.
- `pnpm run test:guardias`: 1 archivo rojo de 331, 4 de 4622 tests:
  `dependencias-declaradas-presentes.guardia.test.ts`. Los mismos 4 rojos en un worktree limpio de `origin/dev`.
- `pnpm exec vitest related --run <10 archivos>`: 1035 archivos, 176 rojos, 146 tests fallidos y 1089 saltados, porque
  `historial-accion-etiquetas.ts` lo importa media app. En `origin/dev`, los mismos archivos dan 175 rojos y 146 tests
  fallidos. La causa dominante es la base desechable sin datos («tabla `orden` vacia: corre `pnpm run db:seed`»). El
  único rojo que no sale en `origin/dev` es `geografia-registro-accion.test.ts`: un actor nulo donde esperaba el
  usuario de otra suite que corría en paralelo. Solo en la rama da 2 passed y 12 skipped, tres corridas seguidas.

### Mutaciones A

Arnés: autocomprobación previa (154 tests, 154 verdes, 0 saltos, 21 de ellos en Postgres), una a una, patrón que
debe aparecer exactamente una vez, restauración y huella sha256 comparada tras cada una. Nada más corría a la vez.

| Mutación | Req. | Rojos totales | Del req. | Del req. en Postgres |
|---|---|---|---|---|
| 1. `fijar` vuelve a `mensajeroId: null` | R1 | 15 | 1 | 1 |
| 2. El service vuelve a `{ ...dato, mensajeroId: null }` | R6 | 31 | 8 | 1 |
| 3. Quitar `mensajeroId` de `nivelSchema` | R6 | 56 | 15 | 0 |
| 3b. El hueco real: la 3 + el service que tolera la clave ausente | R6 | 37 | 13 | 1 |
| 4. Quitar `rol` del `where` | R7 | 2 | 1 | 1 |
| 5. Quitar `estado` del `where` | R8 | 2 | 2 | 2 |
| 6. Quitar la rama de `ocupado` | R8 | 3 | 3 | 3 |
| 7. Quitar `mensajero` de `partes` | R11 | 1 | 1 | 1 |

**8/8 muertas** (las 7 de `tasks.md` y la 3b). Corrida final: 154 de 154, huella igual.

La 3 no pone rojo el test de Postgres de R6: sin la clave, `dato.mensajeroId` es `undefined`, `undefined !== null`, y
`nivelDePago` rechaza igual. La mata `esquema` «R6: conserva la clave…». La 3b reproduce el defecto de
`design > Hallazgo` tal cual y sí la ve Postgres.

### Desviaciones del spec

1. **R3, la carrera:** `tasks.md` pide un `P2002` simulado. Aquí es real: la lectura del nivel se vacía y el `create`
   choca contra `tarifa_valor_nivel_key`. Sin hilos, pero el error es el de Postgres.
2. **Dos tests fuera de «Archivos esperados»:** `esquemas-escritura.test.ts` y `tarifa-activacion.test.ts`, por el
   `mensajeroId` nuevo.
3. **Mutación extra 3b**, por lo explicado arriba.

### Sin verificar

- R7 «mensajero de B» se midió con la RLS (`comoApp`), no con la extensión del cliente de producción. Ese cliente no
  se ejerció en esta tanda.
- La action con un valor propio: es T3.3, Tanda C.
- La corrida de `related` en una base con datos: aquí sus 1089 saltos y sus rojos por base vacía no prueban nada
  sobre esos archivos. Lo dará `gate-completo`.

**Veredicto Tanda A:** escritura hecha y probada en Postgres; 8/8 mutaciones muertas y ningún rojo atribuible al cambio.

## Tanda B — Los caminos del cierre (backend)

Fecha: 2026-11-05. Agente: `backend_dev`. Base: la desechable `servi_gate_slt55`. **Cero código de producción**, sin
migración y sin dependencias.

**Qué ya funcionaba sin tocar código:** los cinco caminos (vista previa, solicitud, corte, 477 y 398) pagan el valor
propio y congelan su nivel y su origen. El único rojo de la primera corrida fue un literal mío: el detalle congela
también `tienda_flete_rechazo`, no solo el flete por entregado. No es un defecto (SLT-52 R52 lo necesita para la 398).
**Defectos hallados: ninguno.**

### Archivos

| Archivo | Cambio |
|---|---|
| `tests/integration/db/tarifas-valor-propio-caminos.test.ts` | Nuevo, 37 casos contra Postgres |
| `specs/SLT-55-valor-propio-mensajero/tasks.md` | Casilla T2.1 |

### Mapa R → test

`caminos` = `tests/integration/db/tarifas-valor-propio-caminos.test.ts`.

| R | Test en `caminos` |
|---|---|
| R12 | «%s paga 501 con nivel mensajero» y «%s, quitando el propio, paga 502…», 5 caminos cada uno |
| R13 | «%s con M en otra zona y sin vehiculo sigue pagando 501», 5 caminos, y «control: sin el propio… paga el 777» |
| R14 | «R14 — propio solo en entregado…» (501 + 603 + 0 = 1104.00) |
| R15 | «R15 — un propio de 0 sobre una zona de 505…» |
| R16 | «en un mismo lote del resolver…» y «en el corte, M cobra 501 y M2 502…» |
| R17 | «flete de 3.000 + 13 %…», «precio de tienda de 2.500…», «flete de 10 %…», «flete de 3.333,33…» |
| R18 | «R18 — reprogramado al 20 %…» |
| R19 | «398: el valor de la tienda cambio…», «477: el valor de la tienda cambio…», «398: cobro congelado del viejo…», «477: cobro congelado del viejo…» |
| R20 | «R20 — M sin zona…», con control de que al devolverle la zona paga 501 |
| R21 | «R21 — sin activar, %s…», con y sin propio, los mismos literales |
| R22 | «R22 — digita y activa…» |
| R24 | «R24 — cambiar y quitar el propio tras congelar…» |
| R25 | «estado inactivo», «estado bloqueado», «cambio de rol…» |

### Salida real

- `pnpm exec vitest run tests/integration/db/tarifas-valor-propio-caminos.test.ts`: 37 de 37, 0 saltos, 0 rojos.
- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, ninguno en el archivo nuevo.
- `pnpm run test:guardias`: exit 1. 1 archivo rojo de 331; 4 failed, 4617 passed y 1 skipped de 4622. Es
  `dependencias-declaradas-presentes.guardia.test.ts`, los mismos 4 tests que la Tanda A midió también rojos en un
  worktree limpio de `origin/dev`. En esta tanda no se volvió a medir `origin/dev`.

### Mutaciones B

Arnés: autocomprobación previa (37 tests, 37 verdes, 0 saltos), una a una, patrón que debe aparecer exactamente una
vez, restauración y huella sha256 comparada tras cada una. Nada más corría a la vez.

| Mutación | Req. | Rojos totales de 37 | Del req. |
|---|---|---|---|
| 1. La rama `mensajeros` de `whereValores` fuera | R12 | 29 | 5 |
| 2. El rango del propio a 5 | R12 | 29 | 5 |
| 3. `contextosCobro` con `c.zonaId` | R17 | 4 | 4 |
| 4. `NIVELES_PAGO[1]` a `"zona"` | R12 | 28 | 5 |
| 5. Extra: el resolver ignora que la empresa no está activada | R21 | 5 | 2 |
| 6. Extra: la 398 no rebasa con el cobro congelado | R19 | 2 | 2 |
| 7. Extra: la 477 no rebasa con el cobro congelado | R19 | 2 | 2 |
| 8. Extra: el corte selecciona solo mensajeros activos | R25 | 2 | 2 |

**8/8 muertas** (las 4 de `tasks.md` y 4 extra). Corrida final de cada tanda de mutaciones: 37 de 37, huellas iguales.

### Desviaciones del spec

1. **Vista previa:** `tasks.md` pide «congela nivel» en los cinco caminos, pero la vista previa no congela nada. Ahí el
   nivel y el `tarifaValorId` se leen de lo que devuelve el resolver real, con un espía; el importe, del DTO.
2. **Menos dobles que los moldes:** `OrdenRepository` y `CorteDiarioRepository` son los reales, porque R13, R20 y R25
   hablan de esas filas. Solo se dobla la zona central y las URL firmadas.
3. **R13:** en la 477 y la 398 el cambio de zona y vehículo ocurre tras crear el cierre. Esos caminos resuelven con
   `destinoZonaId`, así que allí solo el cambio de vehículo llega al resolver.
4. **R13:** la zona nueva tiene su propio valor de zona, 777, con un control, para que el propio tenga algo a lo que ganar.
5. **Cuatro mutaciones extra**, para R19, R21 y R25, que la lista de `tasks.md` no apuntaba.
6. **Numeración:** `design.md §4` llama «T3» a esta tarea; en `tasks.md` es T2.1. Se siguió `tasks.md`.

### Sin verificar

- **R24, la aprobación real:** el cierre pasa a `aprobado` con un `UPDATE`, como en el molde, y los feeds de wallet se
  leen construyendo sus movimientos, sin insertarlos. La aprobación de punta a punta queda para el E2E (T5.1).
- **R25, cambio de rol:** ninguna mutación quita específicamente ese caso. La 8 filtra por estado y la 1 solo lo tumba
  por la causa general. La lectura de `findMensajerosConActividadSinCierre` no mira el rol.
- **Otra empresa:** los caminos corren con la RLS (`comoApp`), no con la extensión del cliente de producción. Esta
  tanda no siembra una segunda empresa; R37 va en la Tanda C.
- **Concurrencia real** entre dos caminos: todo corre en una sola transacción.

**Veredicto Tanda B:** los cinco caminos pagan y congelan el valor propio sin código nuevo; 37 de 37 en Postgres y 8/8 mutaciones muertas.

## Tanda C — Lecturas de la pantalla (backend)

Fecha: 2026-11-05. Agente: `backend_dev`. Base: la desechable `servi_gate_slt55`, comprobada con `current_database()`. Sin
migración y sin dependencias. No se tocan resolver ni precedencia.

**Defectos hallados: ninguno.** El camino de producción (extensión + RLS + raíz de composición real) ya aislaba y ya
escribía. Lo que sí se halló es un test débil: `faltantes.test.ts:72` no mide la barrera que `tasks.md` le atribuye (ver
Desviaciones).

### Archivos

| Archivo | Cambio |
|---|---|
| `lib/interfaces/repositories/ITarifasPantallaRepository.ts` | `MensajeroDePantalla`, `listarMensajeros`, `valoresDeMensajeros` |
| `lib/repositories/TarifasPantallaRepository.ts` | Las dos lecturas (`design §7.1`) |
| `lib/interfaces/services/ITarifasPantallaService.ts` | `mensajeros` y `valoresMensajero` en `CargarPantallaResult` |
| `lib/services/TarifasPantallaService.ts` | `cargarPantalla` las da |
| `tests/integration/db/tarifas-valor-propio-pantalla.test.ts` | Nuevo, 19 casos contra Postgres |
| `tests/integration/actions/tarifas-action.test.ts` | Bloque SLT-55, 5 casos; doble con `mensajeroEsElegibleONivelOcupado` |
| `tests/unit/services/tarifas-pantalla-service.test.ts` | Bloque SLT-55, 3 casos; doble al día |
| `tests/unit/tarifas/servicios-composicion.test.ts` | La pantalla por la fábrica llega al cliente |
| `tests/unit/tarifas/faltantes.test.ts` | Caso nuevo de R23 que sí mide la barrera |
| `tests/fixtures/tarifas-pantalla.ts` | `valorPropio` y `mensajeroPantalla` |
| `tests/components/TarifasModulo.test.tsx`, `TarifasDisposicion.test.tsx`, `tests/unit/app/tarifas/TarifasPage.test.tsx` | `mensajeros: []` y `valoresMensajero: []` en sus literales: lo exige el tipo |
| `specs/SLT-55-valor-propio-mensajero/tasks.md` | Casillas T3.1, T3.2 y T3.3 |

### Mapa R → test

`pantalla-db` = `tests/integration/db/tarifas-valor-propio-pantalla.test.ts`, `action` =
`tests/integration/actions/tarifas-action.test.ts`.

| R | Test |
|---|---|
| R10 | `pantalla-db` «el admin lee los mismos datos…», «el rol %s recibe forbidden» (5 roles), «R10: el admin, por la action y sin dobles…»; `action` «R10: el admin recibe forbidden…» |
| R23 | `pantalla-db` «cargarPantalla y activar dan lo mismo…», «la lectura de los faltantes no trae el propio…», «control: el valor de la zona sí la completa…», «R23: `activar` por la action…»; `faltantes.test.ts` «SLT-55 R23: un valor con mensajero…» |
| R31 | `pantalla-db` «R31: `elegible` solo para rol mensajero…». «Sin valor propio» y el mensaje de lista vacía los decide la pantalla: Tanda D |
| R32 | `pantalla-db` «R32: el retirado y los dados de baja…», «R32: quitarle el último valor…». La marca «Inactivo» y las filas deshabilitadas: Tanda D |
| R37 (lectura) | `pantalla-db` «A no lee mensajeros ni valores de B…» (RLS), «R37: cada empresa lee lo suyo…» (producción), «R37: las dos lecturas llevan el filtro…» (SQL) |
| R37 (escritura) | `pantalla-db` «R37: A no escribe sobre un mensajero de B, ni le quita un valor a B» (producción). Cierra el pendiente de R7 de la Tanda A |
| T3.3 | `action` bloque «SLT-55 — guardar un valor propio» (R1, R5, R6, R7, R8, R10); `pantalla-db` «T3.3: la action fija y quita de verdad…», sin ningún doble |

**Raíz de composición.** Las actions se llaman sin `servicio`: montan `serviciosDeTarifas(getPrismaClient())`, el mismo
camino de la petición, y solo la empresa viene de `conEmpresa`. La fila se comprueba con el cliente base. Lo atan las
mutaciones X10 y X11, y `servicios-composicion.test.ts`.

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, la misma cifra que las Tandas A y B; ninguno en el archivo de test nuevo ni en `TarifasPantalla*`.
- `pnpm exec vitest run` de 11 archivos (los tocados, `tarifa-activacion` y `tarifas-referencia` y `-escritura`):
  `archivos 11, 231 total, 231 ok, 0 fail, 0 skip`.
- `pnpm run test:guardias`: exit 1. 1 archivo rojo de 331; 4 failed, 4617 passed y 1 skipped de 4622. Es
  `dependencias-declaradas-presentes.guardia.test.ts`, los mismos 4 tests de las Tandas A y B. En esta tanda no se volvió a
  medir `origin/dev`.
- Tras todo, en la base: 0 `tarifa_valor` con mensajero y 0 zonas `Delta`: la siembra commiteada se limpia.

### Mutaciones C

Arnés: autocomprobación previa (6 archivos, 150 tests, 150 verdes, 0 saltos), una a una, patrón con conteo exacto, cada
corrida exige los 150 tests y un rojo cuyo nombre sea el del requisito. Restauración byte a byte y huella sha256 de cada
archivo y de `git status` + `git diff`. Nada más corría a la vez.

| Mutación | Req. | Rojos de 150 | Del req. |
|---|---|---|---|
| C1. Sin `mensajeroId: null` en `valoresDeZonaOGrupo` | R23 | 2 | 1 |
| C2. Sin `v.mensajeroId === null` en `faltantesDeZona` | R23 | 1 | 1 |
| C3. Sin la rama `tarifaValoresComoMensajero` | R32 | 3 | 1 |
| C4. `elegible` sin mirar el estado | R31 | 1 | 1 |
| X5. `elegible` sin mirar el rol | R31 | 1 | 1 |
| X6. Sin la rama de rol: solo quien ya tiene valor | R31 | 2 | 1 |
| X7. `valoresDeMensajeros` sin `where` | R32, R37 | 5 | 2 |
| X8. La extensión sin filtro, con la RLS | R37 | 1 | 1 |
| X9. La extensión sin filtro y sin bajar de rol | R37 | 3 | 1 |
| X10. La raíz sin el repositorio de valores | T3.3 | 13 | 1 |
| X11. La raíz sin el repositorio de la pantalla | R37 | 14 | 1 |
| X12. `adminTienda` lee | R10 | 3 | 1 |
| X13. El service no da los mensajeros | R31 | 8 | 1 |
| X14. El service no da los valores propios | R23 | 9 | 1 |
| X15. El propio SÍ cubre a la zona | R23 | 6 | 1 |

**15/15 muertas** (las 4 de `tasks.md` y 11 extra). Corrida final: 150 de 150, árbol con la huella inicial.

Lo que dicen X8 y X9: quitar solo el filtro no cambia ninguna fila, porque la RLS lo respalda; lo ve únicamente el test del
SQL. Quitando las dos barreras, sí se cruzan las empresas y el test de dos empresas se pone rojo: no es un verde vacío.

### Desviaciones del spec

1. **Mutación 2:** `tasks.md` la asigna a `faltantes.test.ts:72`, y esa prueba NO la vería: su fila tiene la zona nula y la
   descarta `v.zonaId === zona.id`. Medido: con C2 el único rojo es el caso nuevo, y `:72` sigue verde. El caso nuevo usa una
   fila con zona y mensajero que el CHECK impide en la base: mide la barrera sola, que es de defensa en profundidad.
2. **Mutación 1:** tampoco la vería el recorrido, por lo mismo: el propio se cae en memoria aunque la lectura lo traiga. Por
   eso el R23 de `pantalla-db` afirma también la lectura directa, y X15 comprueba que el recorrido sí se pone rojo si el
   propio llega a cubrir la zona.
3. **Siembra commiteada** en el camino de producción, porque la extensión abre su propia transacción. Se limpia en `afterEach`.
4. **Tres tests de componente tocados por el tipo:** es parte de T4.3 de la Tanda D, pero sin esto el typecheck queda rojo.
   Solo llevan listas vacías.
5. **Once mutaciones extra**, para el rol, la extensión y la raíz de composición, que `tasks.md` no apuntaba.

### Sin verificar

- **La pantalla no consume nada aún:** `TarifasModule` ignora los dos campos hasta la Tanda D. R27-R36 siguen sin test.
- **`empresaDeLaPeticion`:** la empresa viene de `conEmpresa`, no de una cookie real. La sesión de punta a punta es del E2E.
- **R39 y R40:** Tanda E.
- **El orden de `valoresMensajero` entre filas del mismo concepto:** depende de `createdAt`, y en un mismo instante queda sin
  definir. Los tests ordenan antes de comparar. La pantalla debe agrupar por `mensajeroId`, no fiarse del orden.
- **`origin/dev` para la guardia roja:** no se volvió a medir en esta tanda.

**Veredicto Tanda C:** la pantalla ya recibe mensajeros y valores propios, aislados por empresa en el cliente de producción; 15/15 mutaciones muertas y ningún rojo atribuible al cambio.
