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
