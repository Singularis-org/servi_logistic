# SL-10 — Gate en verde: CRLF y rojos heredados de Ordenex

> Zona: fullstack · Complejidad: medium · depends_on: — · Rama: `feature/SL-10-gate-verde-heredado`
>
> **Alcance.** Dejar `./init.sh` (modo rápido) en verde en servi_logistic. Se diagnostica uno por uno
> los 15 archivos rojos del log `_trabajo/gate-rojo-2026-10-21.log` (corrida en el checkout
> principal, `INIT_EXIT=1`; typecheck y lint verdes) y cada uno recibe el arreglo mínimo de su
> clase: (a) entorno o cableado del arnés, (b) test que vigila algo de Ordenex que aquí no existe,
> (c) contrato que cambió legítimamente, (d) deuda registrada en `tests/baseline-rojos.json`. Se
> conecta `pnpm run test:rapido` al mecanismo del arnés v2 (`scripts/test-rapido.mjs` + baseline).
> Y `.env.example` pasa a estar versionado, vigilado por una guardia: hoy solo existe en el checkout
> principal, y dos tests que lo leen fallan en los worktrees y fallarían en CI. Lo pide SL-14.
>
> Toda excepción que añade esta feature es temporal y nombra la ficha que la retira (regla del
> humano del 2026-10-21: «Ordenex» desaparece del todo).
>
> **Lo que NO entra.**
> - `specs/` de Ordenex: no se edita ningún archivo (decisión del humano).
> - Costa Rica (provincias, SINPE, colones): no se toca (decisión del humano; es la fase 3).
> - Los archivos del arnés (`arnes.manifest`: `init.sh`, `scripts/test-rapido.mjs`,
>   `tests/guards/*`…): no se editan. Una mejora a ellos va por `/afinar-regla` (regla 8 de `CLAUDE.md`).
> - El destino de la migración `20260925120300_reclasificar_cobros_459` y de su lista con datos de
>   la tienda del integrador → SL-13 (`fuera-nuform`).
> - El seed de desarrollo que necesita la base local para los tests de integración → SL-11
>   (`fuera-zonas-y-seeds-ordenex`).
> - Los colores y textos de marca del manifiesto más allá de fijar los que hay hoy → SL-8 / SL-9.
> - Las capturas del manifiesto que aún dicen «Ordenex» → SL-9.
> - Comentarios de código que citan bitácoras `progress/` de Ordenex o las guardias retiradas: se
>   quedan como están (SL-15 / SL-16 limpian textos).
> - El contenido de `.env.example`: se versiona como está en el checkout principal, y solo se le
>   añade un comentario inicial con las excepciones (R21).
>   - Su comentario con el email de soporte de Ordenex se va con SL-14.
>   - El que cita `scripts/seed-sinpe-inicial.ts` se va con SL-11.
>   - Los que hablan de SINPE y de Costa Rica son de la fase 3.

## Diagnóstico de los 15 archivos rojos

La causa sale de leer cada test y su salida en el log, no de suponerla. Detalle por archivo en
`design.md > Diagnóstico`. Resumen:

| Archivo | Causa leída | Clase | Acción |
|---|---|---|---|
| `tests/guards/guard-test-rapido-rojos-heredados.test.ts` | `SyntaxError` al importar `scripts/test-rapido.mjs`, que en el checkout principal está en CRLF | a | ninguna en el test; re-materializar LF + guardia de finales de línea |
| `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts` | ídem | a | ídem |
| `tests/integration/db/zona-central-guarda-y-rastro.test.ts` | lo selecciona `vitest run guard` por la subcadena «guard» de «guarda»; con `DATABASE_URL` corre y la base local no tiene la tabla `orden` | d | baseline hasta SL-11 |
| `tests/integration/db/zona-guardado-conserva-inactivos.test.ts` | ídem («guardado») | d | baseline hasta SL-11 |
| `tests/unit/analytics/catalogo-produccion.guardia.test.ts` | el caso R14 exige ≥3 decisiones derivadas de `progress/decision*.md`; el `progress/` de Ordenex no se copió | b | adaptar el caso R14 |
| `tests/unit/analytics/financiera-180-trazabilidad.guardia.test.ts` | `ENOENT progress/impl_180.md` (bitácora de Ordenex) | b | retirar |
| `tests/unit/analytics/financiera-trazabilidad.guardia.test.ts` | `ENOENT progress/impl_127.md` | b | retirar |
| `tests/unit/guards/tablero-lineas-trazabilidad.guardia.test.ts` | `ENOENT progress/impl_186.md` | b | retirar |
| `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` | vigila el paso 2 del `init.sh` de Ordenex (ficha 420: marcadores, `verificar-dependencias.mjs`, `--frozen-lockfile`); el `init.sh` del arnés v2 no lo tiene | d | baseline hasta SL-29 |
| `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts` | `ENOENT progress/reclasificacion_459/lista_aprobada.csv` (lista con datos del integrador, no copiada) | d | baseline hasta SL-13 |
| `tests/unit/guards/no-embalaje.test.ts` | `docs/limpieza-ordenex.md` (nuevo en este repo) nombra el archivo de la guardia | a/c | alta por archivo en su lista blanca |
| `tests/unit/guards/push-alta-punto-unico.guardia.test.ts` | raíz de código `perfiles/` (traída por el arnés v2) sin clasificar en `INVENTARIO_DE_RAICES` | a | clasificar `perfiles/` |
| `tests/unit/guards/push-intencion-de-baja.guardia.test.ts` | ídem, y el censo esperaba nueve raíces | a | ídem y censo a diez |
| `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` | espera `name` «Ordenex»; el manifiesto ya dice «Servi Logistic» (y sus colores cambiaron) | c | literales al valor actual |
| `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` | dos casos anclan en la historia de git de Ordenex (`da544b30`, ≥20 borrados); este repo no la tiene | b | adaptar los dos casos |

Fuera del log, porque el log se corrió en el checkout principal, que sí tiene `.env.example`:

| Archivo | Causa leída | Clase | Acción |
|---|---|---|---|
| `tests/unit/config/push-config.test.ts` | lee `.env.example`; `.gitignore` ignora `.env*`, así que en un worktree o en CI no existe | a | versionar `.env.example` |
| `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts` | exige que `.env.example` esté en su censo | a | ídem |

## Requisitos (EARS)

### Finales de línea

- **R1.** SI `init.sh`, un `scripts/*.sh` o un `scripts/*.mjs` tiene algún fin de línea CRLF en el
  árbol de trabajo, ENTONCES el gate rápido DEBE fallar nombrando cada archivo afectado y la orden
  que lo re-materializa con LF.
- **R2.** CUANDO las guardias `tests/guards/guard-test-rapido-rojos-heredados.test.ts` y
  `tests/guards/guard-tests-de-arbol-en-el-gate.test.ts` corren sobre una copia con finales LF, el
  sistema DEBE importarlas sin `SyntaxError` y DEBEN pasar, sin que se modifique su código.

### Cableado del gate al arnés v2

- **R3.** `pnpm run test:rapido` DEBE ejecutar `scripts/test-rapido.mjs` (relacionados por diff contra
  la rama de integración + `gate.siempre` + rojos heredados del baseline).
- **R4.** `pnpm run test:json` DEBE escribir su informe JSON en `.vitest-rojos.json`, la ruta que leen
  `init.sh` y `.github/workflows/gate.yml`, y ese archivo y `.vitest-codigo` NO DEBEN poder
  versionarse.
- **R5.** El repositorio DEBE tener `tests/baseline-rojos.json` en el que cada entrada nombra un
  archivo de test que existe y lleva `motivo` (con la causa y la ficha o condición que la poda) y
  `desde` (fecha `AAAA-MM-DD`).
- **R6.** MIENTRAS un archivo esté en `tests/baseline-rojos.json`, el gate rápido NO DEBE ponerse en
  rojo por él; SI un archivo que no está en el baseline sale en rojo, ENTONCES el gate rápido DEBE
  salir en rojo nombrándolo.

### Rojos heredados

- **R7.** El repositorio NO DEBE contener tests cuyo único sujeto sea una bitácora de Ordenex que aquí
  no existe: `tests/unit/analytics/financiera-trazabilidad.guardia.test.ts` (`progress/impl_127.md`),
  `tests/unit/analytics/financiera-180-trazabilidad.guardia.test.ts` (`progress/impl_180.md`) y
  `tests/unit/guards/tablero-lineas-trazabilidad.guardia.test.ts` (`progress/impl_186.md`).
- **R8.** El caso R14 de `tests/unit/analytics/catalogo-produccion.guardia.test.ts` DEBE conservar la
  autocomprobación del derivador sobre texto sintético y la comprobación de cada decisión que haya en
  `progress/decision*.md`, y NO DEBE exigir un número mínimo de decisiones en `progress/`.
- **R9.** El inventario de raíces de código (`tests/fixtures/raices-de-codigo.ts`) DEBE clasificar
  `perfiles/` con su motivo, y el censo de `push-intencion-de-baja` DEBE esperar exactamente las raíces
  que el árbol tiene hoy, `perfiles` incluida.
- **R10.** La guardia del manifiesto DEBE afirmar como contrato los valores actuales de
  `public/manifest.json` para `name`, `short_name`, `description`, `theme_color` y
  `background_color`, sin ninguna aserción que espere «Ordenex».
- **R11.** La guardia `tests/unit/guards/no-embalaje.test.ts` DEBE admitir, por archivo o por carpeta
  de spec, `docs/limpieza-ordenex.md` y `specs/SL-10-gate-verde-heredado/`, y DEBE seguir en rojo
  ante la palabra en cualquier otro archivo de texto del árbol.
- **R12.** La guardia `tests/unit/guards/no-embalaje.test.ts` NO DEBE recorrer `.worktrees/` ni leer
  `.vitest-rojos.json`.
- **R13.** La guardia `tests/unit/guards/test-citado-desaparecido.guardia.test.ts` DEBE probar su
  conocido-positivo con una historia de borrados sintética, sin depender de commits de Ordenex, y SI
  el clon es superficial, ENTONCES DEBE salir en rojo.

### Cierre

- **R14.** CUANDO se corre `./init.sh` en el worktree de la feature, el gate DEBE terminar con código 0.
- **R15.** CUANDO la rama se integre en `dev` y el checkout principal se re-materialice con LF,
  `./init.sh` en el checkout principal DEBE terminar con código 0.
- **R16.** El cambio NO DEBE modificar ningún archivo bajo `specs/` salvo
  `specs/SL-10-gate-verde-heredado/`, ni añadir, cambiar o quitar ningún literal de geografía de
  Costa Rica, SINPE o colones en código. `.env.example` entra sin reescribir ni quitar ninguno de sus
  comentarios.
- **R17.** El cambio NO DEBE modificar ningún archivo listado en `arnes.manifest`.

### `.env.example` versionado

- **R18.** El repositorio DEBE versionar `.env.example`, y `.gitignore` DEBE seguir ignorando
  cualquier otro archivo `.env*`.
- **R19.** SI `.env.example` contiene una línea que no sea vacía, un comentario `#` o un `NOMBRE=` sin
  valor, ENTONCES el gate rápido DEBE fallar nombrando el número de línea, sin imprimir el valor.
- **R20.** CUANDO corren en una copia recién materializada (un worktree o el CI), los tests
  `tests/unit/config/push-config.test.ts` y
  `tests/unit/guards/sinpe-sin-variables-de-entorno.guardia.test.ts` DEBEN encontrar `.env.example`
  y pasar.

### Excepciones temporales

- **R21.** Toda excepción que añade SL-10 DEBE citar en su `motivo` o en su comentario la ficha
  `SL-<n>` que la retira. Son excepciones: cada entrada de `tests/baseline-rojos.json`, cada alta en
  la lista blanca de `no-embalaje` y la mención a Ordenex que entra con `.env.example`.

### Migraciones sin `down.sql` (ampliación del 2026-10-21)

- **R22.** Las migraciones `20260814120000_ruta_optimizada_trazado`, `20260814140000_ruta_parada_tramo`
  y `20260814160000_ruta_tramo_vivo_at` DEBEN tener un `down.sql` que revierta exactamente su
  `migration.sql`, en orden inverso, sin que se modifique ningún `migration.sql`. Sin esto, el paso 7
  de `init.sh` («migraciones sin down.sql») deja el gate en rojo y R14 no se cumple.

## Preguntas abiertas

Ninguna.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-10-21 | ¿Se tocan los `specs/` de Ordenex? | No. Se quedan como historia del comportamiento heredado (humano, vía leader; `docs/limpieza-ordenex.md` regla 5). → R16 |
| 2026-10-21 | ¿Se toca lo de Costa Rica (provincias, SINPE, colones)? | No en esta feature: es la fase 3 (humano, vía leader). → R16 |
| 2026-10-21 | ¿Arreglo o rediseño? | Arreglo mínimo por archivo, no rediseño de guardias ni del gate (humano, vía leader). → R2, R7–R13, R17 |
| 2026-10-21 | ¿Las cuatro clases (a) entorno/arnés, (b) vigila Ordenex, (c) contrato cambiado, (d) baseline con motivo y fecha? | Sí, y cada archivo queda en una sola (humano, vía leader). → R1–R13 |
| 2026-10-21 | ¿Se versiona `.env.example`? | Sí, sin valores (el repo será público), y con una guardia que lo vigila. Lo pide SL-14, que depende de esto (humano, vía leader). → R18, R19, R20 |
| 2026-10-21 | ¿Se aceptan restos de «Ordenex»? | Solo como excepción temporal con la ficha que la retira; SL-27 retira los de `specs/` (humano, vía leader). → R21 |
| 2026-10-21 | Guardia 420: ¿baseline, retirarla o portarla? | Baseline, atada a SL-29 «Paso de dependencias declaradas en el gate del arnés», la ficha `/afinar-regla` (humano, P1). → R5, R21 |
| 2026-10-21 | ¿Qué ficha retira las dos altas de `no-embalaje` (`docs/limpieza-ordenex.md` y `specs/SL-10-gate-verde-heredado/`)? | SL-27 «Retirar los specs/ heredados de Ordenex»: retira toda la historia de Ordenex, incluidos los docs de historia y las guardias cuyo sujeto es herencia (humano, vía leader). → R11, R21 |
| 2026-10-21 | ¿Se migra la base local para los tests de zona? | No. Esperan a SL-11, que les dará sus propios fixtures; hasta entonces, baseline (humano, P2). → R5, R21 |
| 2026-10-21 | ¿Quién decide sobre la migración 459 y su guardia? | SL-13; hasta entonces, baseline (humano, P3). → R5, R21 |
| 2026-10-21 | ¿Se re-ancla R14 de `catalogo-produccion` a las decisiones de los specs? | Sí, en SL-30 «Re-anclar la firma humana del catálogo de producción»; SL-10 solo quita el mínimo sobre `progress/` (humano, P4). → R8, R21 |
| 2026-10-21 | ¿R10 fija los colores actuales del manifiesto? | Sí; si SL-8 cambia la paleta, SL-8 actualiza el test (humano, P5). → R10 |
| 2026-10-21 | ¿Qué se hace con las tres migraciones heredadas sin `down.sql` que el paso 7 de `init.sh` marca en rojo? | Ampliación decidida por el leader el 2026-10-21: sin esto R14 no se cumple. SL-10 añade los tres `down.sql`, sin tocar ningún `migration.sql`. → R22 |
