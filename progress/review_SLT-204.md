# review SLT-204 «CI: avisar «se cayó un worker» en vez de culpar al PR de filas fuera de su transacción»

PR #231. Ruta directa, revisada completa (toca CI compartido). Diff `origin/dev...6ccad0dd`.
Origen: m2 de `progress/review_SLT-188.md` y D80 (`progress/deudas.md`).

## Checklist

- [x] **Señales presentes en el artefacto de CI.** `gate.yml` (job `vitest`, paso «Informe del shard») sube
  `informe-shard-<i>` con `.vitest-rojos.json` (`include-hidden-files: true`), `.vitest-codigo`, `init-shard.log`
  (copia del `tee` de `init.sh --completo`) y `filas-fuera-de-tx.json`. `gate-completo` lo baja sin
  `merge-multiple` a `informes/informe-shard-<i>/`, que es donde mira `workerCaido`. `.vitest-rojos.json` es la
  salida completa del reporter `json` (`package.json > test:json`), con todos los `testResults`.
- [x] **Reproducción real de la caída con vitest 4.1.10** (la de T7 de SLT-188 fue en local, no en CI): un test
  temporal con `process.kill(process.pid, "SIGKILL")` en el `beforeAll`. El log trae
  `Error: [vitest-pool]: Worker forks emitted error.` y `Caused by: Error: Worker exited unexpectedly`. El JSON
  trae el archivo con `status: "passed"` y `assertionResults` `["pending","pending"]`. `unir` sobre esos dos
  archivos reales avisa, nombra el archivo y sale con 1. Los archivos temporales se borraron (`git status` limpio).
  `StatusMap` de vitest (`index.UpGiHP7g.js`): `run`/`queued`/`only` -> `pending`, `skip` -> `skipped`,
  `todo` -> `todo`. Un `skip` no da falso positivo.
- [x] **El rojo se mantiene con la caída, también con 0 filas** (test «worker caido con 0 filas» y mi
  reproducción: `codigo=1`). **Sin caída, mensajes y código como antes:** la rama `else` del total no cambia y
  `lineasDeInforme` sin `trasCaida` da la línea de siempre (tests «sin caida...»).
- [x] **«Worker» en otro contexto no dispara** (probado a mano, sin test: ver m1). `Service Worker registrado`,
  `[vitest-pool]: Worker forks started`, un JSON con `skipped`/`todo`/`failed` o un JSON roto: `codigo=0` y total
  de siempre.
- [ ] **Falso positivo con la frase exacta**: ver m1.
- [x] **D80: el barrido solo borra lo marcado.** Filtra `nombre startsWith "${marca} "` y reúne usuarios, órdenes y
  zonas por `organizacion_id` de esa empresa. `limpiarComprometido` no sale de ese conjunto, y la empresa va la
  última con RESTRICT, así que falla en voz alta si queda algo. La prueba usa una marca propia distinta de
  `MARCA_C02` y un caso negativo con una empresa sin marca.
- [ ] **D80: que C02 llama al barrido**: sin test (B1).
- [x] **`init.sh` sin tocar** (`git diff --name-only` no lo lista). **`gate.yml`: solo 3 líneas de comentario.**
- [x] Tasks: ruta directa, sin `tasks.md`. Las tandas de `progress/features/SLT-204.md` están cerradas.
- [x] Tamaño: `6/40 archivos, 113/1000 lineas de produccion, 299/3000 de tests`.
- [x] Typecheck (`tsc --noEmit`) y eslint sobre los 5 archivos tocados: limpios.
- [x] Tests del diff contra `servi_slt204_desechable`: `filas-fuera-de-tx.guardia`, `corte-concurrencia-restos`
  y `corte-concurrencia`, `3 passed (3)`, `27 passed (27)`, sin skipped (la base estaba).
- [x] Guardias: `357 passed | 1 failed`. El rojo es `dependencias-declaradas-presentes.guardia.test.ts`, que está
  en `tests/baseline-rojos.json` y no lo toca el diff. No es un hallazgo.
- [x] Reglas del proyecto (`docs/perfil-agentes.md > reviewer`): no toca `db/`, pantallas, dinero ni
  dependencias, no tiene literales de país y no referencia a Ordenex. Los comentarios explican el porqué.
- [x] `CHECKPOINTS.md` / `docs/checkpoints-proyecto.md`: sin `design.md` (ruta directa), no aplica «Lo que ya
  existe». Reutiliza `limpiarComprometido`, `crearOrganizacion` y `claveUnica`; no re-crea nada.

## Hallazgos

### B1 — BLOQUEANTE: ningún test ve que C02 barre al arrancar (el criterio central de D80)
D80 pide exactamente esto: «que el archivo barra al empezar los restos de corridas anteriores». Los tests prueban
el mecanismo (`barrerComprometidosHuerfanos` con una marca de prueba), pero ninguno prueba las dos cosas que lo
conectan con C02:
- el `beforeAll` de `corte-concurrencia.test.ts` llama a `barrerComprometidosHuerfanos(mundo.prisma, MARCA_C02)`;
- la siembra de C02 pasa `{ marca: MARCA_C02 }`.

Si se quita cualquiera de las dos, la suite sigue verde. La propia bitácora lo dice: la mutación M3 sobrevive y
solo se comprobó a mano. Es el patrón de «el composition root que no inyecta»: la pieza existe, nadie comprueba
que se use, y D80 vuelve sin que nada lo diga. Rompe la regla 4 (trazabilidad).

**Qué falta:** un test que muera con M3 y también con «C02 siembra sin marca». Por ejemplo, llevar el arranque y
la siembra de C02 a dos helpers de `_escenario.ts` (`prepararMundoC02()` = `prepararMundo` + barrido de
`MARCA_C02`; `sembrarComprometidoC02(...)` con la marca) que C02 use, y probar los helpers en
`corte-concurrencia-restos.test.ts`. Ojo: ese test no puede sembrar restos con `MARCA_C02` estando C02 en vivo en
otro worker. La otra vía es una guardia de texto sobre `corte-concurrencia.test.ts`. Sea cual sea, hay que anotar
en la bitácora que M3 muere.

### m1 — menor: la frase del aviso se dispara a sí misma (falso positivo reproducido)
`TRAZA_DE_CAIDA` busca `Worker exited unexpectedly` en cualquier parte del log, y `lineaDeCaida` imprime esa misma
frase («Worker exited unexpectedly»). Si un test que compara contra el aviso falla, vitest imprime el string
recibido en `init-shard.log`, y el shard pasa a «se cayó un worker», con rojo y «relanza el shard» aunque haya 0
filas. Puede ser la propia guardia de SLT-204 (`expect(aviso).toContain(...)`) o cualquier test que la cite.
Reproducido: un log con solo `AssertionError: expected 'shard 1/1: se cayó un worker de vitest («Worker exited
unexpectedly»)...'` da `codigo=1`. Pasa justo en el PR que toque `filas-fuera-de-tx.ts`, y el aviso manda a
relanzar en bucle. Arreglo sugerido: anclar al formato de línea de vitest (multilínea,
`^(?:Caused by: )?Error: Worker exited unexpectedly` / `^Error: \[vitest-pool\]: Worker \S+ emitted error`,
tolerando un prefijo ANSI), o no repetir el literal en el aviso. Falta también un caso negativo en la guardia: un
log que nombre «Worker» o la frase fuera de la traza de vitest no avisa. Hoy el punto 3 solo lo comprobé a mano.

### m2 — menor: con caída y 0 filas, la línea del shard sigue diciendo «0 filas fuera de su transacción»
`lineasDeInforme` devuelve `LINEA_CERO` antes de mirar `trasCaida`. El resumen queda: aviso, después «shard 1/1: 0
filas fuera de su transacción» y luego el total «0 filas sueltas con un worker caído». La línea del medio
contradice «ese 0 no mide». Es solo cosmético: el código y el total son correctos.

### m3 — menor: si vitest cambia el formato, la detección se queda ciega sin avisar
Depende de dos detalles internos de vitest 4: el texto `Worker exited unexpectedly` / `[vitest-pool]` y que
`run`/`queued` salgan como `pending` en el JSON. Si una versión futura cambia cualquiera de los dos, se vuelve al
mensaje de antes (rojo y «fuga del PR»), sin falsos rojos nuevos. Basta con que falle una de las dos señales, porque
las dos son independientes. Si mueren las dos a la vez, nadie se entera. Sugerencia opcional: un comentario o un
test que fije la versión de vitest con la que se midió (4.1.10).

### m4 — menor: la bitácora llama «datos reales del run» a una corrida local
Lo de T7 de SLT-188 fue en local (`impl_SLT-188.md`), no en un run de CI. Lo he comprobado con la reproducción de
arriba (mismo vitest y el mismo reporter que en CI), así que el contenido es correcto. Solo es impreciso el origen
que cita.

### m5 — menor: el barrido supone que cada uno tiene su base
«Un archivo no corre dos veces a la vez» vale dentro de una corrida. Si dos worktrees corren C02 a la vez contra la
misma base local, el `beforeAll` de uno barre el escenario vivo del otro. Fallaría en voz alta (no se pierden
datos de otro test, solo los de C02), y la práctica del proyecto es una desechable por worktree. Basta con
anotarlo en el comentario de `barrerComprometidosHuerfanos`.

## Veredicto

**RECHAZADO** por B1. Falta un test que compruebe que C02 marca su empresa y la barre al arrancar, y que muera
con M3. Las otras dos partes están bien: el aviso de CI usa señales que el artefacto trae de verdad (comprobado con
una caída real), mantiene el rojo y no cambia nada sin caída. Conviene resolver m1 en la misma vuelta, porque es
barato y afecta justo a quien toque este script.

## Vuelta 2 (acotada a e96fb6f5..389d50d7)

### Checklist
- [x] **B1 resuelto.** Las dos cosas que conectan C02 con el barrido viven en `_escenario.ts`:
  `escenarioConfirmadoDe(marca)` (con `preparar` = `prepararMundo` + barrido, y `sembrar` con la marca) y
  `ESCENARIO_C02`. Las prueba `corte-concurrencia-restos.test.ts` con una marca propia, que nunca siembra con
  `MARCA_C02`. C02 queda atado por una guardia de texto sobre su código sin comentarios, más el control
  `ESCENARIO_C02.marca === MARCA_C02`. Repetí las mutaciones yo mismo contra `servi_slt204_desechable`, restaurando
  con `git checkout --`:
  - M3a: el `beforeAll` de C02 usa `prepararMundo()` (sin barrido). Resultado: `2 failed | 4 passed`, por las dos guardias de texto.
  - M3b: C02 siembra con `sembrarComprometido(mundo, …)` sin marca. Resultado: `2 failed | 4 passed`.
  - M3c: `preparar` sin `barrerComprometidosHuerfanos`. Resultado: `2 failed | 4 passed`, por «el preparar SIGUIENTE barre…» y el conteo.
  - M3d: `sembrar` sin `{ marca }`. Resultado: `2 failed | 4 passed`.
  Las cuatro dan rojo. La línea base en HEAD da `Test Files 3 passed (3)`, `Tests 32 passed (32)`, sin skips.
- [x] **m1 resuelto.** `TRAZA_DE_CAIDA` va anclada al principio de línea (`/m`), admite ANSI o sangría delante y
  exige `(Caused by: )?Error: `. En la guardia hay un caso negativo: la frase dentro de un AssertionError o de un diff,
  «Service Worker», `[vitest-pool]: Worker forks started` y la frase a media línea. Hay también un positivo con ANSI.
  **Reproducción real:** un archivo temporal compara el aviso de `lineaDeCaida` de cinco formas con vitest 4.1.10:
  `toBe`, `toContain`, `toEqual` con diff, `throw new Error(aviso)` y `console.log`. El log trae la frase 5 veces,
  y `unir` da `codigo=0` y «total: 0 filas fuera de su transacción». Lo borré después y `git status` quedó limpio.
  **Positivo real:** los dos logs de caída reales que ya tenía son la reproducción SIGKILL de la vuelta 1 y el run 2
  de T7 de SLT-188. Pasados por `unir` solo con el log (sin JSON), siguen detectando: `codigo=1`, y las líneas
  `Error: [vitest-pool]: Worker forks emitted error.` y `Caused by: Error: Worker exited unexpectedly` casan con el ancla.
  No repetí una caída SIGKILL nueva porque el clasificador de permisos denegó el archivo temporal con
  `process.kill`. Los dos logs reales cubren el formato.
- [x] **m2 resuelto.** Con caída y 0 filas, la línea del shard dice «0 filas sueltas, pero el shard quedó incompleto:
  ese 0 no mide». El test «worker caido con 0 filas» comprueba que aparece esa línea y que no aparece la de siempre.
- [x] **m4 resuelto.** La bitácora dice ahora «medido con vitest 4.1.10 en local, T7 de SLT-188, y reproducido por la review».
- [x] `tsc --noEmit` y eslint sobre los 5 archivos tocados: limpios. `tamano-pr`: 6/40 archivos, 126/1000 de
  producción, 399/3000 de tests.
- [x] Sin regresiones en el rango: el resto del diff es la bitácora y la ficha.

### Hallazgos
- **menor (n1):** la conexión de C02 se vigila con una guardia de texto, no por comportamiento. Era una de las dos vías
  aceptadas en B1 y muere con M3a y M3b. Si alguien renombra la variable `mundo` en C02, la guardia da rojo: es un
  falso rojo, ruidoso y no silencioso, así que vale.
- **menor (n2):** un test que lance a propósito `new Error("Worker exited unexpectedly")` sin capturarlo imprimiría
  `Error: Worker exited unexpectedly` a principio de línea y contaría como caída. Es teórico: hoy ningún test lo hace.
  Lo anoto, no pide cambio.
- **operativo:** mi M3d sembró empresas sin marca en `servi_slt204_desechable`, y el barrido no las recoge. Antes de
  reutilizar esa base, hay que purgarla o recrearla (el implementer la había dejado con `organizaciones=0`).
- m3 y m5 de la vuelta 1 siguen como estaban (son menores y opcionales). m3 queda en parte cubierto: el comentario
  fija ahora «Medido con vitest 4.1.10».

### Veredicto
**OK.** B1, m1, m2 y m4 están resueltos y lo verifiqué ejecutando las mutaciones y la reproducción. No hay bloqueantes.
