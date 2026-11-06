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

## Tanda D — Sección de la pantalla (frontend)

Sin maqueta, por decisión de Carlos. Mismo lenguaje que `TarifasTiendas` y `TarifasValores`. Sin tocar backend, resolver ni
precedencia, y sin dependencias.

### Archivos

| Archivo | Qué |
|---|---|
| `app/(app)/configuracion/tarifas/_components/TarifasMensajeros.tsx` | Nuevo: `filasDeMensajeros`, la sección, quitar con confirmación |
| `app/(app)/configuracion/tarifas/_components/TarifaMensajeroDialogo.tsx` | Nuevo: añadir y editar |
| `app/(app)/configuracion/tarifas/_components/TarifasModule.tsx` | Pinta la sección tras las tiendas |
| `app/(app)/configuracion/tarifas/_components/tarifas-borrador.ts` | `mensajeroId` opcional en `ColumnasDelNivel` y en el plan |
| `app/(app)/configuracion/tarifas/_components/tarifas-textos.ts` | Textos de la sección |
| `tests/components/TarifasMensajeros.test.tsx` | Nuevo, 52 casos |
| `tests/components/TarifasModulo.test.tsx`, `TarifasDisposicion.test.tsx`, `tests/unit/app/tarifas/TarifasPage.test.tsx` | Al día, con casos SLT-55 |
| `tests/unit/descarga/censo-tablas.ts`, `cobertura-tablas.guardia.test.ts` | Tabla nueva `fuera`; contadores 36→37, 14→15, 37→38 y 15→16, tras verlos rojos |
| `specs/SLT-55-valor-propio-mensajero/tasks.md` | Casillas T4.1, T4.2 y T4.3 |

### Mapa R → test

`componente` = `tests/components/TarifasMensajeros.test.tsx`, `módulo` = `tests/components/TarifasModulo.test.tsx`,
`disposición` = `tests/components/TarifasDisposicion.test.tsx`.

| R | Test |
|---|---|
| R27 | `componente` «R27: una columna por resultado…», «R27: agrupa por mensajero…», «R27: un mensajero sin valores no tiene fila…»; `módulo` «R27: enseña lo que da la lectura» |
| R28 | `componente` bloque «R28 — el diálogo» |
| R29 | `componente` bloque «R29 — qué se envía» y bloque «T4.1 — planDeGuardado»; `módulo` «R29: guarda con `mensajeroId`…» |
| R30 | `componente` bloque «R30 — fallos al guardar», «R30: tras guardar parte, el mensajero queda fijo…» |
| R31 | `componente` bloque «R31 — añadir» |
| R32 | `componente` «R32: el inactivo sale marcado…», «R32: `elegible: false`…», bloque «R32 — el inactivo en el diálogo» |
| R33 | `componente` bloque «R33 — quitar» |
| R34 | `componente` los dos «R34:» de la lista y «R34: activada, el botón y el aviso…» |
| R35 | `componente` bloque «R35 — el `admin` solo lee»; `módulo` «R35: con `puedeEscribir` falso…». Otro rol: `TarifasPage.test.tsx` «R55: otro rol o sin sesión…», que ya lo cubría |
| R36 | `componente` «R36: sin ninguno…»; `módulo` «design §7.2: sin zonas no sale…» |
| R38 | `disposición` «SLT-55 R38» (2 casos) y «lo que no puede estar escrito» sobre los 12 archivos; la medida real, en el E2E |
| R23 (pantalla) | `módulo` «R23: un valor propio no mueve…» |

### Estados

- **Vacío:** R36, con y sin escritura.
- **Cargando:** la sección no tiene lectura propia: sus datos llegan con la página, y no hay `loading.tsx` en la ruta. Lo único que
  carga es el guardado: `aria-busy` y botones apagados (`componente` «Mientras guarda…»).
- **Error:** la lectura de la página cae en `TarifasErrorCarga` (R57 de SLT-54, ya probado). Al guardar: toast y fila. Si falla la
  zona, la sección sigue (`módulo` «Si la zona no carga…»).
- **Móvil:** `overflow-hidden` en la sección y desplazamiento dentro de la tabla, como las tiendas; controles `min-h-11`. Solo por clases.

### Lo que no prueban estos tests

Las actions están dobladas: prueban lo que se pinta y el payload que se le da a la action, no que llegue al servidor, se guarde o
se autorice. Lo del servidor está en las Tandas A y C; el recorrido real es la Tanda E.

### Salida real

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, la misma cifra que las Tandas A, B y C; ninguno en los dos componentes nuevos.
- `pnpm exec vitest run` de 10 archivos (los de Tarifas y la guardia del censo): `Test Files 10 passed (10)`, `Tests 192 passed (192)`.
- `TarifasMensajeros.test.tsx` solo: `Tests 52 passed (52)`.
- `pnpm run test:guardias`: exit 1. 1 archivo rojo de 331; 4 failed, 4617 passed y 1 skipped de 4622. Es
  `dependencias-declaradas-presentes.guardia.test.ts`, los mismos 4 tests de las Tandas A, B y C. No se volvió a medir `origin/dev`.

### Mutaciones D

Arnés: autocomprobación previa (exige > 50 tests, 0 rojos, 0 saltos y ninguna suite rota), una a una, patrón con exactamente una
aparición, cada corrida con el mismo total de tests y un rojo cuyo nombre sea el del requisito. Restauración byte a byte y huella sha256
de los archivos mutados y de `git status` + `git diff`. Nada más corría a la vez.

| Mutación | Req. | Rojos | Del req. |
|---|---|---|---|
| D1. Mandar `ivaPct` en el plan | R29 | 5/76 | 3 |
| D2. Vaciar no quita | R29 | 1/76 | 1 |
| D3. Sin la marca «Inactivo» | R32 | 2/76 | 1 |
| D4. Acciones con `puedeEscribir` falso | R35 | 1/76 | 1 |
| X5. Añadir con `puedeEscribir` falso | R35 | 2/76 | 2 |
| X6. El plan sin `mensajeroId` | R29 | 5/76 | 3 |
| X7. La zona manda `mensajeroId: null` | T4.1 | 2/76 | 2 |
| X8. Ofrece a quien ya tiene valor | R31 | 2/76 | 2 |
| X9. Ofrece a los dados de baja | R31 | 2/76 | 2 |
| X10. Selector vacío sin aviso | R31 | 2/76 | 2 |
| X11. Filas vacías del inactivo habilitadas | R32 | 1/76 | 1 |
| X12. Filas con valor del inactivo deshabilitadas | R32 | 2/76 | 2 |
| X13. `elegible` no decide inactivo | R32 | 4/76 | 3 |
| X14. Otro texto en lo vacío | R27 | 1/76 | 1 |
| X15. Filas sin ordenar por nombre | R27 | 2/76 | 1 |
| X16. Confirmación con cuenta falsa | R33 | 1/76 | 1 |
| X17. Quitar con la lista de filas vieja | R33 | 1/76 | 1 |
| X18. Un fallo pierde lo digitado | R30 | 4/76 | 4 |
| X19. Lo guardado se reenvía | R30 | 1/77 | 1 |
| X20. El error no sale en la fila | R30 | 2/76 | 2 |
| X21. Un fallo parcial cierra | R30 | 4/76 | 4 |
| X22. El selector sigue tras guardar parte | R30 | 1/76 | 1 |
| X23. Sin activar dice lo de activada | R34 | 1/76 | 1 |
| X24. Activada dice lo de sin activar | R34 | 1/76 | 1 |
| X25. Toast sin mirar `activada` | R34 | 1/76 | 1 |
| X26. Estado vacío sin acción | R36 | 3/76 | 1 |
| X27. Guardar sin mensajero elegido | R31 | 1/76 | 1 |
| X28. La nota del diálogo sin la base | R28 | 1/76 | 1 |
| X29. Campos de 40 en el diálogo | R38 | 1/76 | 1 |
| X30. El módulo no pasa los valores | R27 | 5/105 | 1 |
| X31. La tabla nueva sin censar | T4.2 | 2/105 | 2 |
| X32. El módulo no recarga tras guardar | R29 | 1/105 | 1 |
| X33. El módulo da escritura a todos | R35 | 1/105 | 1 |

**33/33 muertas** (las 4 de `tasks.md` y 29 extra), en tres corridas. Primera: 30 de 31, y **X19 sobrevivió**: un reintento antes de
la recarga reenviaba lo ya guardado y nada lo veía. Se añadió el test «El reintento antes de que llegue la recarga…» y murió. Después
se añadieron los casos del módulo, X32 y X33, y se repitieron X30 a X33. Entre corridas solo cambiaron tests y la lista de mutaciones,
ningún código de producción, así que las 29 primeras no se repitieron. Las tres corridas terminaron con la huella inicial.

### Desviaciones del spec

1. **`cobertura-tablas.guardia.test.ts`** no está en «Archivos esperados», pero la guardia exige subir sus contadores con la tabla nueva.
2. **`TarifasMensajeros.test.tsx` lleva el test de T4.1:** `planDeGuardado` no tenía archivo de test propio.
3. **Tras un guardado parcial al añadir, el selector desaparece** y el mensajero queda fijo. El spec no lo pide: el elegido ya tiene
   valores, sale de los disponibles, y cambiarlo dejaría atrás lo guardado sin decirlo.
4. **Quitar busca la fila en cada render,** a diferencia de `TarifasTiendas`, que guarda la fila: con un fallo parcial, reintentar con
   la lista vieja pediría quitar lo que ya no existe. `TarifasTiendas` tiene ese defecto, por lectura y sin medirlo; no se tocó.
5. **R31:** «Añadir mensajero» sigue activo sin candidatos, y es el diálogo el que lo dice, en lugar del selector.
6. **`mensajerosEnVigor` no reutiliza `enVigorNota`:** son dos frases casi iguales a propósito, porque la misma frase repetida en la
   pantalla es ruido para quien lee y rompe un `getByText` existente.
7. **Un mensajero sin nombre conocido** («Cuenta retirada») se trata como inactivo. No debería ocurrir: la lectura incluye a quien tiene valor.
8. **Veintinueve mutaciones extra,** que `tasks.md` no apuntaba.

### Sin verificar

- **Nada se ha visto en un navegador:** ni 390 px real, ni modo oscuro, ni el `Select` dentro del `Modal` con foco y puntero reales. Es T5.4.
- **La sesión y el servidor de punta a punta:** Tanda E.
- **Tras un guardado parcial, hasta que llega `router.refresh()`,** la fila ya guardada se ve con el valor anterior, igual que en `TarifasValores`. No se mide cuánto dura.
- **`origin/dev` para la guardia roja:** no se volvió a medir en esta tanda.

**Veredicto Tanda D:** la sección «Mensajeros con valor propio» está montada y probada con las actions dobladas; 33/33 mutaciones muertas y ningún rojo atribuible al cambio.

## Tanda E — E2E y medida

Base: `servi_gate_slt55`, desechable, con DROP/CREATE, `migrate deploy` (304 de 304) y `db:seed` antes de las corridas finales. Servidor: `next start`
del `.next` construido con `NEXT_PUBLIC_APP_URL` local, puerto 3055 y doble de Storage en 54355. Sin código de producción tocado. Cero `retries`,
`waitForTimeout` o plazos mayores que los de `tarifas-activacion`; los clics que abren algo van por `abrirCon` y `navegarCon`.

### Archivos

| Archivo | Qué |
|---|---|
| `e2e/tarifas-valor-propio-mensajero.spec.ts` | Nuevo, 11 casos en 3 bloques |
| `e2e/_tarifas-activacion-fixture.ts` | `digitarValorPropio`, `editarValorPropio`, `mensajerosDe`, `movimientosDelCierre`; `modo`, `nivel` y `base` en `pagosCongelados`; `irAZona`, `irAPestana` y `activarConFaltantes` por `abrirCon` |
| `playwright.config.ts` | El spec, en el proyecto `dinero` |
| `progress/capturas/SLT-55/*.png` | 13 capturas de T5.4 |
| `specs/SLT-55-valor-propio-mensajero/tasks.md` | Casillas T5.1 a T5.4 |

### Mapa R → test

`e2e/tarifas-valor-propio-mensajero.spec.ts`:

| Línea | Caso | R |
|---|---|---|
| 166 | Añadir el propio no mueve la cobertura | R1, R2, R23, R27, R34, R36 |
| 209 | Sin activar, 1.700 | R21 |
| 227 | Activa; M1 ve 3.110; solicitud y aprobación reales; nivel `mensajero`; wallet | R12, R17, R22, R23, R39, R40 |
| 264 | M2 cobra 2.200 y 0 | R16 |
| 283 | Cambiar: lo aprobado no se mueve, lo congelado se aprueba a 3.110, el siguiente paga 3.000 de entregado | R24 |
| 324 | Quitar: 2.200, confirmación, libro en pantalla, historial | R4, R11, R24, R33 |
| 383 | M1 sin «valor propio» en `/cierre-dia`, y sin entrar a Tarifas | R35, R39 |
| 443 | B no ve ni le ofrecen nada de A, y lo suyo queda en B | R31, R37 |
| 479 | La sesión de B manda el mensajero de A: `validation_error` en `mensajeroId`, sin escribir | R7, R37 |
| 501 | El `admin` lee sin controles; su sesión recibe `forbidden` | R10, R35 |
| 547 | 390 px: sin scroll de página, controles de 44, `Select` dentro de `Modal` | R38 |

**`empresaDeLaPeticion`:** los casos 443 y 479 pasan por la cookie real de `/login`. El 479 reenvía la Server Action capturada, primero con el mensajero
de B (se guarda: prueba que la acción responde) y luego con el de A (se rechaza). No hay `conEmpresa` en ese camino.

### Corridas reales

Cada una sobre la misma base, después de recrearla una vez, con el árbol limpio en `98eb1def`. Log sin `tail`, con `INIT_EXIT` dentro.

| Corrida | passed | failed | flaky | did not run | skipped | INIT_EXIT |
|---|---|---|---|---|---|---|
| Spec, 1 | 11 | 0 | 0 | 0 | 0 | 0 |
| Spec, 2 | 11 | 0 | 0 | 0 | 0 | 0 |
| Spec, 3 | 11 | 0 | 0 | 0 | 0 | 0 |
| `--project=dinero`, 1 | 60 | 0 | 0 | 0 | 0 | 0 |
| `--project=dinero`, 2 | 60 | 0 | 0 | 0 | 0 | 0 |
| `dos-empresas-humo` (`aislamiento --no-deps`) | 8 | 0 | 0 | 0 | 0 | 0 |

`dinero` incluye `tarifas-activacion`, que usa la fixture tocada (T5.2). Antes de estas corridas hubo tres de puesta a punto con rojos del propio spec,
ninguno de producción: un toast repetido, el `input` oculto de cada `Select` medido como control, y los libros de una satélite, que no se escriben hasta
consolidar.

**Servidor y base:** un vigía cruzó cada 5 s el PID que escucha en 3055 (`netstat`) con `pg_stat_activity` por `client_port`. Todas las muestras con
conexiones dicen `servi_gate_slt55`, y ninguna otra base. **Base local:** `organizacion` 11, `usuario` 44, `wallet_movimiento` 13, `cierre_dia` 6 y
`chat_mensaje` 0, igual antes y después. **Puertos:** ninguno escuchando tras cada corrida.

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, la misma cifra que las tandas anteriores.
- `pnpm run test:guardias`: exit 1. 1 archivo rojo de 331; 4 failed, 4617 passed y 1 skipped de 4622. Es `dependencias-declaradas-presentes.guardia.test.ts`,
  los mismos 4 de las Tandas A a D. No se volvió a medir `origin/dev`.

### Mutaciones E

Cada tanda en producción, con `next build` rehecho y `git checkout` después, comprobando el árbol limpio. Todas cambian lo que el usuario ve o lo que el dinero dice.

| Tanda | Mutación | Cae | Dónde y qué vio |
|---|---|---|---|
| B1 | El propio cuenta como cobertura (`faltantes.ts` y `valoresDeZonaOGrupo`) | :166 | `:191`, «Faltan 2» en lugar de «Sin empezar» |
| B1 | El service no mira la elegibilidad del mensajero | :479 | `:494`, la respuesta ya no trae `validation_error` |
| B1 | «Añadir mensajero» sin `min-h-11` | :547 | `:553`, controles bajos |
| B2 | `usaModeloNuevo` siempre cierto | :209 | `:213`, Ganancia 3.110 en lugar de 1.700 |
| B2 | `listarMensajeros` con `comoPlataforma` | :443 | `:467`, el selector de B ofrece mensajeros de otras empresas |
| B3 | Sin la rama `mensajeros` de `whereValores` | :227 | `:242`, Ganancia 2.200 en lugar de 3.110 |
| B3 | `puedeEscribir` siempre cierto | :501 | `:506`, el `admin` ve «Añadir mensajero» |
| B4 | El propio vale para cualquier mensajero | :264 | `:268`, M2 ve 3.110 en lugar de 2.200 |
| B5 | Fijar reescribe `gestion_pago_congelado` | :283 | `:302`, el congelado se mueve |
| B6 | Quitar solo borra el primer valor | :324 | `:333`, la sección no vuelve a su estado vacío |
| B7 | «Total de ganancia con tu valor propio» en `/cierre-dia` | :383 | `:386`, el texto aparece |

**11/11 casos muertos, con 11 mutaciones en 7 construcciones.** B2 tumbó además `:547`: con todas las empresas, la lista crece y la opción queda fuera de la pantalla. Su muerte limpia es la de B1.

### T5.4 — Lo que se ve

Con `next start`, no un dev server, por instrucción de esta tanda. Capturas en `progress/capturas/SLT-55/`: `seccion-`, `dialogo-` y `select-en-modal-`, a
1360 y 390, claro y oscuro, y `vacio-1360-claro.png`. Mirados `seccion-1360-oscuro`, `seccion-390-claro`, `select-en-modal-390-oscuro` y `dialogo-1360-claro`.
Los otros nueve se generaron y no se abrieron.

**Hallazgo a 390 px, sin arreglar:** R38 se cumple (la página no da scroll y los controles miden 44), pero la tabla del diálogo mide 358 de ancho en 308 de
hueco, y el campo «Valor» va de x=281 a x=391, con el diálogo acabando en x=374. El importe va alineado a la derecha, así que un «2900» guardado se ve cortado
hasta desplazar la tabla. Es desplazamiento dentro de la tabla, como anotó la Tanda D. Por el ancho de los dos controles, cuadrarlo parece exigir apilar las
filas (estimado, no probado): es decisión de diseño, no un arreglo mínimo.

### Desviaciones del spec

1. **Recorrido en la zona central, no en la satélite.** El cierre de una satélite no escribe en las wallets hasta consolidar, y R24 las mira. Sigue siendo «1 de 2 zonas completas». Lo aprueba el maestro.
2. **El cierre tras cambiar a 3.000 suma 3.210:** 3.000 de entregado y los 210 del 15 %, que no cambió. `tasks.md` dice «paga 3.000»: es lo de entregado, y el spec afirma los dos.
3. **Un cierre de más:** congelado a 3.110, se cambia el propio y se aprueba después. Mide que la aprobación no recalcula (R24).
4. **Dos casos reenvían la Server Action con `fetch`,** con el id y el cuerpo capturados en la misma corrida. No se ata al id de ningún build.
5. **Tres ayudantes de la fixture pasan por `abrirCon`,** para que un clic perdido en hidratación no los haga fallar. `tarifas-activacion` sigue verde.
6. **`editarValorPropio`, `mensajerosDe` y `movimientosDelCierre`,** que `tasks.md` no apuntaba.

### Sin verificar

- **Producción:** `tasks.md` no pide medirla en la Tanda E; no se tocó.
- **Modo oscuro de R38:** solo a ojo, en dos capturas. Sin medida de contraste.
- **El valor propio en una zona satélite, hasta la consolidación:** el cálculo está en `caminos`; no hay E2E.
- **`origin/dev` para la guardia roja:** no se volvió a medir.
- **Tanda F:** `./init.sh`, docs y el mapa de los 40 siguen pendientes.

**Veredicto Tanda E:** el recorrido R40 pasa de punta a punta con sesión y aprobación reales (3 y 2 corridas, 0 failed), 11/11 casos muertos con servidor rehecho, y queda un hallazgo de usabilidad a 390 px por decidir.

## Ajuste a 390 px y Tanda F

Base: `servi_gate_slt55`, con DROP/CREATE, `migrate deploy` (304 de 304) y `db:seed` antes de las corridas finales. Servidor: `next start` del `.next` rehecho, en 3055,
con doble de Storage en 54355. Sin `prisma generate`.

### Archivos

| Archivo | Qué |
|---|---|
| `app/(app)/configuracion/tarifas/_components/TarifaMensajeroDialogo.tsx` | `:37-38` campo a todo el ancho y rótulo apilado; `:175-176`, `:189` y `:203-225` la fila se apila bajo `sm`, con `role` explícitos |
| `e2e/tarifas-valor-propio-mensajero.spec.ts` | `:552` `camposValor`, `:572` `expectValorDentro`; el caso de `:547` pasa a `:583` y mide en `:595` y en `:634`, con un «2900» guardado |
| `tests/components/TarifasDisposicion.test.tsx` | `:163`: apilado bajo `sm`, 110 desde `sm`, tabla conservada |
| `docs/architecture.md` | `:247` el nivel `mensajero`; `:270` el valor propio |
| `docs/ayuda/oficina/configuracion-tarifas.md` | `actualizado`; `:47` sección de valor propio |
| `specs/SLT-55-valor-propio-mensajero/tasks.md` | `:131-132` lo de 3.210; casillas T6.1 y T6.2. **T6.3 sigue abierta: `./init.sh` lo corre el leader** |
| `specs/SLT-55-valor-propio-mensajero/requirements.md` | Trazabilidad de R38: el test de componente es `TarifasDisposicion`, no `TarifasMensajeros` |
| `progress/capturas/SLT-55/` | `dialogo-*` a 390 y 1360 y `select-en-modal-390-*`, rehechas con el servidor final |

### Medida del diálogo, editando un «2900» guardado

`getBoundingClientRect`, en px. Vieja: `TarifaMensajeroDialogo.tsx` de `f14b0da7`, con su propio `next build`.

| Ancho | Tabla | Diálogo acaba | Campo «Valor» x | Scroll interno (`scroll`/`cliente`) |
|---|---|---|---|---|
| 390, vieja | 358 | 374 | 281 a **391** | 358/308 |
| 390, nueva, claro y oscuro | 308 | 374 | 199 a **345** | 308/308 |
| 320, vieja | 358 | 310 | 275 a 385 | 358/250 |
| 320, nueva | 250 | 310 | 164 a 281 | 250/250 |
| 639, nueva | 557 | 623 | 323,5 a 594 | 557/557 |
| 640, vieja y nueva | 558 | 624 | 437,9 a 547,9 | 558/558 |
| 1360, vieja y nueva, claro y oscuro | 622 | 1016 | 810,5 a 920,5 | 622/622 |

A 640 y a 1360, las dos medidas son **idénticas**, campo a campo, en cada control y en cada alto (comparadas como JSON): el escritorio no cambió. Los campos siguen en 44 de alto
y la página sigue en 390. Vista en `dialogo-390-claro`, `dialogo-390-oscuro` y `dialogo-1360-claro`. Los rótulos «Modo» y «Valor» de cada fila apilada son visuales (`aria-hidden`):
los dos campos ya llevan `aria-label`, y las cabeceras de la tabla siguen para el lector de pantalla (`sr-only`).

### Mutación: la tabla vieja

`TarifaMensajeroDialogo.tsx` de `f14b0da7`, con `next build` rehecho y restauración comprobada con sha256:

| Test | Resultado | Qué vio |
|---|---|---|
| E2E `:583` | **Cae**, 1 failed, `INIT_EXIT=1` | `:595`, los 5 campos: `derecha` 390,875 con `finDialogo` 374 y `desplazado: true` |
| `TarifasDisposicion` `:163` | **Cae**, 1 failed de 22 | sin `max-sm:grid` |

Solo se demuestra la medida de `:595`: con la tabla vieja, el caso se para ahí y no llega a la de `:634`, que usa el mismo ayudante.

### Corridas finales

Código final, con el `.next` construido después de restaurar. Log sin `tail`, con `INIT_EXIT` dentro.

| Corrida | passed | failed | flaky | did not run | skipped | INIT_EXIT |
|---|---|---|---|---|---|---|
| Spec, 1 | 11 | 0 | 0 | 0 | 0 | 0 |
| Spec, 2 | 11 | 0 | 0 | 0 | 0 | 0 |
| Spec, 3 | 11 | 0 | 0 | 0 | 0 | 0 |
| `--project=dinero` | 60 | 0 | 0 | 0 | 0 | 0 |

**Servidor y base:** el vigía cruzó el PID de 3055 con `pg_stat_activity` cada 5 s, en cada corrida. Todas las muestras con conexiones dicen `servi_gate_slt55`, y ninguna otra base.
**Base local:** `organizacion` 11, `usuario` 44, `wallet_movimiento` 13, `cierre_dia` 6 y `chat_mensaje` 0, igual antes y después. **Puertos:** ninguno escuchando tras cada corrida.

### Verificación

- `NODE_OPTIONS=--max-old-space-size=8192 pnpm typecheck`: exit 0.
- `pnpm lint`: exit 0, 0 errores y 234 avisos, la misma cifra que las tandas anteriores; ninguno en los archivos tocados.
- `pnpm exec vitest run` de `TarifasMensajeros`, `TarifasDisposicion`, `TarifasModulo` y `TarifasPage`: `Test Files 4 passed (4)`, `Tests 109 passed (109)`.
- `pnpm run test:guardias`: exit 1. 1 archivo rojo de 331; 4 failed, 4617 passed y 1 skipped de 4622. Es `dependencias-declaradas-presentes.guardia.test.ts`, los mismos 4 de las Tandas A a E.
  Las guardias de ayuda, verdes. No se volvió a medir esa guardia en `origin/dev`: la última vez fue la Tanda A.

### Reconciliación: los 3.210 del cierre tras cambiar a 3.000

`tasks.md` decía «el siguiente de M1 paga 3.000». Era falso como total del cierre. Ese cierre lleva dos gestiones de M1, y el E2E las afirma una a una (`:320-321`): 3.000 de la entrega, que
es el valor nuevo, y 210 de la devolución, el 15 % de un flete de 1.400, que no se cambió. **No hay ningún defecto ni dinero de otro cierre:** 3.000 + 210 = 3.210. Se corrigió `tasks.md`; el
spec y su cabecera ya lo decían bien.

### Ruido de `next build`: está en `origin/dev`

`[AppError:INTERNAL] Error: Dynamic server usage: Route /configuracion/tarifas couldn't be rendered statically because it used 'cookies'`. Sale una vez en cada `next build` de esta rama, y
también **una vez en `origin/dev` (`689cc9df`)**, construido aparte con una copia limpia, ya borrada. **No lo trae SLT-55.** Por lectura de `lib/errors/with-error-handler.ts`, sin aislarlo con una prueba: su `catch` general, en `cargarPantallaTarifas`, recoge el aviso con que Next
marca la ruta como dinámica y lo registra como un error interno. La ruta sale `ƒ` en las dos, y el E2E la ve funcionar con su sesión. Es ruido en el log del build, sin efecto medido. No se tocó.

### Deuda: SLT-54, sin tocar

- **`TarifaMensajeroDialogo` no se comparte:** solo lo monta `TarifasMensajeros`. Las piezas comunes (`Table`, `MontoInput`, `Modal`, `Select`) no se cambiaron.
- **`TarifasValores` tiene el mismo defecto, y mayor.** Medido a 390, en su pestaña de cobro: el contenedor acaba en x=347 y mide 620 de `scroll` en 304 de `cliente`. El campo «Valor» va de x=381,9 a x=491,9 e «IVA» de 510,9
  a 580,9: **quedan enteros fuera de la vista hasta desplazar**. La página no da scroll. Su `min-w-[620px]` lo fija su maqueta y lo afirma `TarifasDisposicion` (R70), así que cambiarlo es decisión de diseño, no un arreglo de esta ficha.
- **`TarifasVehiculo`** tiene también un `minWidth` con campos de 120. No se midió.
- **`TarifasTiendas` al reintentar quitar,** la de la Tanda D, por lectura: sigue sin medir.

### Mapa `R<n>` → test, los 40

`escritura`, `caminos` y `pantalla-db` = `tests/integration/db/tarifas-valor-propio-{escritura,caminos,pantalla}.test.ts`. `service` = `tests/unit/services/tarifa-valor-service.test.ts`. `esquema` = `tests/unit/types/tarifa-schemas.test.ts`.
`action` = `tests/integration/actions/tarifas-action.test.ts`. `migración` = `tests/integration/db/tarifas-flexibles-migration.test.ts`. `faltantes` = `tests/unit/tarifas/faltantes.test.ts`. `componente`, `módulo` y `disposición` =
`tests/components/{TarifasMensajeros,TarifasModulo,TarifasDisposicion}.test.tsx`. `page` = `tests/unit/app/tarifas/TarifasPage.test.tsx`. `e2e` = `e2e/tarifas-valor-propio-mensajero.spec.ts`. El número es la línea del caso o de su bloque.

| R | Test |
|---|---|
| R1 | `escritura:216`; `service:280`; `action:255`; `e2e:166` |
| R2 | `escritura:251`; `service:298`; `e2e:166` |
| R3 | `escritura:278`, `:291`; `service:307` |
| R4 | `escritura:310`; `service:321`; `e2e:324` |
| R5 | `escritura:328`; `service:333`; `esquema:281`; `action:323` |
| R6 | `escritura:337`; `esquema:249`; `action:332`; la base, `migración:494` |
| R7 | `escritura:359`; `service:359`; `action:305`; `e2e:479` |
| R8 | `escritura:381`, `:402`, `:415`; `service:359`; `action:305` |
| R9 | `escritura:423` |
| R10 | `escritura:442`; `service:372`; `action:284`; `pantalla-db:332`, `:346`, `:420`; `e2e:501` |
| R11 | `escritura:461`, `:482`; `e2e:324` |
| R12 | `caminos:590`; `e2e:227` |
| R13 | `caminos:628` |
| R14 | `caminos:660` |
| R15 | `caminos:692`; `componente:220` |
| R16 | `caminos:709`; `e2e:264` |
| R17 | `caminos:784`; `e2e:227` |
| R18 | `caminos:845` |
| R19 | `caminos:869` |
| R20 | `caminos:991` |
| R21 | `caminos:1027`; `e2e:209` |
| R22 | `caminos:1060` |
| R23 | `pantalla-db:177`, `:207`, `:222`, `:479`; `faltantes:83`; `módulo:407`; `e2e:166` |
| R24 | `caminos:1086`; `e2e:283`, `:324` |
| R25 | `caminos:1156` |
| R26 | `escritura:495`, `:508` |
| R27 | `componente:166`, `:182`, `:204`, `:225`; `módulo:402`; `e2e:166` |
| R28 | `componente:289` |
| R29 | `componente:102`, `:127`, `:346`; `módulo:412` |
| R30 | `componente:457`, `:611` |
| R31 | `componente:563`; `pantalla-db:263`; `e2e:443` |
| R32 | `componente:186`, `:250`, `:256`, `:638`; `pantalla-db:279`, `:299` |
| R33 | `componente:674`; `e2e:324` |
| R34 | `componente:231`, `:237`, `:446`; `e2e:166` |
| R35 | `componente:263`; `módulo:444`; `page:91`; `e2e:383`, `:501` |
| R36 | `componente:243`; `e2e:166` |
| R37 | `pantalla-db:432`, `:452`, `:507`; `e2e:443`, `:479` |
| R38 | `e2e:583`; `disposición:135`, `:151`, `:163`, `:201`, `:249`; `componente:217` (la moneda) |
| R39 | `e2e:227`, `:383` |
| R40 | `e2e:146`, el bloque entero, y `e2e:418`, con `:443`, `:479` y `:501` |

**40 de 40 con test.** La tabla de `requirements.md` y este mapa dicen lo mismo tras corregir R38; el mapa añade tests que aquella no pedía, sin quitar ninguno.

### Mutaciones de toda la feature

A 8/8, B 8/8, C 15/15, D 33/33 y E 11/11, en sus secciones de arriba. Esta tanda, 1/1: la tabla vieja, que tumba dos tests. **76 de 76 muertas**, con X19 de la Tanda D como única superviviente en su primera corrida, muerta al añadir su test.

### Lo que no cubre el mapa

Un requisito con test no es un requisito medido de todas las maneras. Lo que ya quedó dicho en cada tanda, junto:

- **R25, cambio de rol:** con test, pero ninguna mutación lo quita a él en concreto (Tanda B).
- **R13:** en la 477 y la 398 solo el cambio de vehículo llega al resolver (Tanda B).
- **R38, modo oscuro:** sin colores fijos por `disposición:249` y, para el diálogo apilado, una captura mirada a ojo; sin medida de contraste.
- **El valor propio en una zona satélite, hasta consolidar:** el cálculo está en `caminos`, sin E2E (Tanda E).

### Sin verificar

- **`./init.sh` y T6.3:** los corre el leader. El `gate-completo` lo da el PR.
- **La semántica con un lector de pantalla real:** los `role` explícitos se afirman en `disposición:163`, pero no se probó con NVDA, VoiceOver ni el árbol de accesibilidad del navegador.
- **Un teléfono real:** la medida es con la ventana de Chromium de Playwright a 320, 390 y 639, sin Safari.
- **`TarifasVehiculo` a 390 y la pestaña de pago de `TarifasValores`.**
- **Capturas sin abrir:** `dialogo-1360-oscuro`, `select-en-modal-390-*`. Se rehicieron, pero solo se abrieron las tres citadas.
- **Producción:** no se tocó.
- **La rama va por detrás de `origin/dev`:** su base es `cc63e547` y `origin/dev` está en `689cc9df`. Estas corridas no incluyen esos commits.

**Veredicto:** el importe se lee entero a 390 px sin cambiar el escritorio, el E2E cae con la tabla vieja, y T6.1 y T6.2 están hechas; falta T6.3, del leader.
