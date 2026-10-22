# SL-10 — Diseño

## Lo que ya existe

Buscado en el board (`feature_list.json`, todas las fichas), en `specs/` y en el código, con los
términos `gate`, `guardia`, `baseline`, `CRLF`/`finales de línea`, `test:rapido`, `manifest`,
`progress/`. El MCP del grafo no estaba disponible para este agente; el código se buscó con
Grep/Read.

| Dónde | Qué apareció | Qué se hace |
|---|---|---|
| Board | SL-8 y SL-9 (marca, manifiesto y capturas) | Solape parcial: SL-10 solo fija en el test los valores que el manifiesto ya tiene. Lo demás va a «Lo que NO entra». |
| Board | SL-11 (seeds de Ordenex fuera, seed de desarrollo) | Solape parcial: los dos tests de zona necesitan base sembrada. Quedan en el baseline hasta SL-11, que depende de SL-10. |
| Board | SL-13 (fuera el integrador) | Solape parcial: la migración 459 y su lista llevan datos del integrador. Su guardia queda en el baseline hasta SL-13. |
| Board | SL-15 / SL-16 (nombre «Ordenex» en código y docs) | Sin solape: SL-10 no renombra textos salvo el literal de la guardia del manifiesto, que es contrato. |
| Board | SL-14 (dominio de Ordenex a configuración) | Depende de SL-10, que le versiona `.env.example`. El comentario de `.env.example` con el email de soporte de Ordenex es suyo. |
| Board | SL-27 (retirar los `specs/` heredados de Ordenex) | Retira las altas de `no-embalaje` que apuntan a specs de Ordenex. También retira las dos altas nuevas de SL-10, porque retira toda la historia de Ordenex: docs de historia y guardias cuyo sujeto es herencia. |
| Board | SL-29 (paso de dependencias declaradas en el gate del arnés) y SL-30 (re-anclar la firma humana del catálogo) | Retiran la entrada 420 del baseline y re-anclan el caso R14 de `catalogo-produccion`. |
| `.env.example` (solo en el checkout principal) | 35 nombres, todos sin valor (comprobado con Grep: 0 líneas `NOMBRE=<algo>`) | Se versiona tal cual. |
| `specs/420-gate-dependencias-presentes/` | Spec de Ordenex del paso 2 de su `init.sh` y de `scripts/verificar-dependencias.mjs` | Se reutiliza como explicación del rojo. No se porta: ver alternativa descartada B. |
| `.gitattributes` | Ya normaliza a LF (`* text=auto eol=lf`, `*.sh text eol=lf`) | Se reutiliza tal cual. El fallo no está en la regla, sino en un árbol de trabajo materializado antes de que la regla aplicara. |
| `scripts/test-rapido.mjs`, `scripts/comparar-baseline-rojos.mjs`, `init.sh > veredicto_tests` | El mecanismo de rojos heredados del arnés v2, ya en el repo y sin conectar | Se conecta: `package.json` lo llama y se siembra `tests/baseline-rojos.json`. No se re-crea nada. |
| `tests/fixtures/raices-de-codigo.ts` | Inventario de raíces compartido por las dos guardias de push | Se añade una entrada. |

## Diagnóstico

La corrida del log se hizo en el **checkout principal** (`R:\job\singularis\projects\servi_logistic`),
no en el worktree. Esto importa para la clase (a):

- En el checkout principal, `init.sh` tiene 415 líneas en CRLF, y 11 archivos de `scripts/` y 11 de
  `tests/guards/` también lo tienen.
- En el worktree, materializado desde el mismo `HEAD` (`bb2d983`), `init.sh` y `scripts/` tienen 0
  líneas en CRLF.
- Al hacer checkout git no convierte CRLF→LF, así que un checkout LF implica blobs LF. **El
  repositorio está bien.** Lo que está en CRLF es el árbol de trabajo del checkout principal: esos
  archivos se escribieron con CRLF (montaje del arnés en Windows) y al commitearlos git normalizó
  el blob, pero dejó la copia de trabajo como estaba.

Por archivo:

1. **`guard-test-rapido-rojos-heredados` y `guard-tests-de-arbol-en-el-gate`.** Fallan con
   `SyntaxError: Invalid or unexpected token`, con 0 tests ejecutados. Son las dos únicas guardias
   que importan `scripts/test-rapido.mjs`, que empieza con `#!/usr/bin/env node`; en el checkout
   principal ese archivo está en CRLF. `guard-unir-informes-vitest` también lee un `.mjs` en CRLF y
   pasa, pero no lo importa como módulo.
   - **Causa probable:** el hashbang con `\r` dentro del módulo que transforma vitest. **A
     confirmar en T1** corriendo las dos guardias en el worktree (LF): si pasan, la causa es el CRLF
     y no hace falta tocar nada más.
2. **`dependencias-declaradas-presentes`** (5 de 15 casos en rojo).
   - Buscan en `init.sh` el marcador `>>> FIN PASO 2: DEPENDENCIAS (ficha 420) <<<`, la llamada a
     `scripts/verificar-dependencias.mjs` y `--frozen-lockfile`, y que el `ok "dependencias
     presentes"` no cuelgue solo de que exista `node_modules`.
   - El `init.sh` actual es el del arnés v2 (está en `arnes.manifest`) y no tiene nada de eso. El
     CRLF también se ve en el log (`'    pnpm install\r'`), pero no es la causa: en LF fallaría
     igual.
   - Los 10 casos que prueban el script directamente pasan.
3. **`zona-central-guarda-y-rastro` y `zona-guardado-conserva-inactivos`.**
   - `test:guardias` es `vitest run guard`, y vitest filtra por subcadena de la ruta: «guard**a**» y
     «guard**ado**» casan.
   - Con `DATABASE_URL` cargada (`HAY_BASE_DE_DATOS`), corren. `fksDeOrden` revienta con
     `The table (not available) does not exist`: la base local no tiene la tabla `orden`.
   - La base no es de Ordenex: ninguno de sus dos project ref aparece en `.env*`.
4. **`catalogo-produccion`** (1 de 5 casos). El caso R14 deriva cambios de catálogo de
   `progress/decision*.md` y exige al menos 3, de al menos 2 ficheros, y por las dos reglas. Aquí
   `progress/` no tiene ninguna decisión: el de Ordenex no se copió (`docs/limpieza-ordenex.md >
   Hecho al crear el repo`).
5. **`financiera-trazabilidad`, `financiera-180-trazabilidad` y `tablero-lineas-trazabilidad`.**
   `ENOENT` en `progress/impl_127.md`, `impl_180.md` e `impl_186.md`. Su único sujeto es el mapa
   R→test que vive dentro de esas bitácoras de Ordenex.
6. **`reclasificacion-459-lista`.** `ENOENT` en `progress/reclasificacion_459/lista_aprobada.csv`.
   Compara la migración `20260925120300_reclasificar_cobros_459` con la lista aprobada, que son
   datos del integrador (`docs/limpieza-ordenex.md` §6).
7. **`no-embalaje`.** `docs/limpieza-ordenex.md:537` y `:718` citan el nombre de archivo de la
   guardia. Es el mismo caso que los specs 155/159/167 ya dieron de alta por archivo.
8. **`push-alta-punto-unico` y `push-intencion-de-baja`.** `raicesDelArbol()` lee las raíces del
   disco y encuentra `perfiles/`, que trajo el arnés v2 (`perfiles/hexagonal/…`, con `.ts`) y no está
   en `INVENTARIO_DE_RAICES`. El censo esperaba 10 entradas (9 raíces + `(raiz)`) y hoy hay 11.
9. **`pwa-manifiesto-atajos`** (1 de 11 casos). Espera `name` «Ordenex». El manifiesto ya dice
   «Servi Logistic» (`docs/limpieza-ordenex.md` tabla: «el `name` del manifest se cambia ya»). Las
   aserciones siguientes del mismo caso también fallarían, porque `description`, `theme_color`
   (`#111111`) y `background_color` (`#F7F7F5`) también cambiaron.
10. **`test-citado-desaparecido`** (2 de 13 casos).
    - El conocido-positivo pide que `ChatWhatsappPanel.test.tsx` figure entre los borrados de la
      historia.
    - El de anti-vacuidad pide ≥20 borrados y el commit `da544b30`.
    - Este repo nació sin la historia de Ordenex, y se va a aplanar antes del primer push
      (`progress/features/SL-10.md`).

## Decisiones técnicas

No hay modelo de datos, rutas, endpoints, migraciones ni autorización: la feature solo toca el gate
y los tests. `organizacion_id`, RLS y módulos: no aplican. Datos por país: ninguno, y R16 prohíbe
tocar los de Costa Rica.

### D1 — CRLF: re-materializar + guardia (R1, R2, R15)

- **Re-materializar** es una operación de entorno sobre el checkout principal, no un commit. La hace
  el leader (o el humano) tras integrar la rama. Solo afecta a archivos **sin cambios locales**, para
  no pisar trabajo de nadie:
  ```bash
  git ls-files --eol | awk '$1=="i/lf" && $2=="w/crlf" {print $NF}' > _trabajo/crlf.txt
  # por cada archivo de la lista que `git status --porcelain -- <f>` da limpio:
  rm -- "<f>" && git checkout -- "<f>"
  ```
- **Guardia nueva** `tests/unit/guards/finales-de-linea-lf.guardia.test.ts`. Lee del disco
  `init.sh`, `scripts/*.sh` y `scripts/*.mjs`, y falla si alguno contiene `\r\n`. El mensaje nombra
  cada archivo y la orden de arriba.
  - Lleva un caso que muerde: la función pura de detección, sobre un texto sintético con CRLF, lo
    marca, y sobre uno LF no.
  - El alcance son los archivos que el gate **ejecuta o importa**, porque son los que rompen con un
    error críptico. No es todo `* text=auto`: eso sería un barrido de miles de archivos para un
    fallo que en el resto solo ensucia el diff.

### D2 — `package.json` al contrato del arnés v2 (R3, R4)

- `"test:rapido": "node scripts/test-rapido.mjs"`. `test:cambiados` y `test:guardias` se quedan, porque
  `docs/verification.md` cita `test:guardias` como comando suelto.
- `"test:json"` pasa a escribir `--outputFile.json=.vitest-rojos.json`. Hoy escribe en
  `.vitest/rojos.json` y ni `init.sh --completo` ni `gate.yml` lo encontrarían: el comparador moriría
  con «no existe el reporte».
- `.gitignore`: se añaden `.vitest-rojos.json` y `.vitest-codigo`.
- **Trampa:** el informe JSON lleva los nombres de todos los tests, incluido el de `no-embalaje`, y
  `no-embalaje` lee `.json`. Ordenex movió el informe a `.vitest/` justo por eso (comentario en
  `IGNORED_DIRS`). Por eso R12 hace que esa guardia no lea `.vitest-rojos.json`.
- La guardia nueva `tests/unit/guards/gate-cableado-arnes-v2.guardia.test.ts` afirma los dos
  scripts como literales. Son el contrato con `init.sh` y `gate.yml`, no un polizón. También afirma
  la forma del baseline (D3).

### D3 — `tests/baseline-rojos.json` (R5, R6)

Formato del comparador: `{ "_comentario": "…", "archivos": { "<ruta>": { "motivo": "…", "desde":
"2026-10-21" } } }`. Se siembra con **cuatro** entradas, las de clase (d):

| Ruta | Motivo (resumen) | Ficha que la retira (R21) |
|---|---|---|
| `tests/unit/guards/dependencias-declaradas-presentes.guardia.test.ts` | vigila el paso 2 del `init.sh` de Ordenex (ficha 420); el `init.sh` del arnés v2 no lo tiene y es archivo del arnés | SL-29, la ficha `/afinar-regla` que decide subir la mejora a la plantilla o retirar la guardia |
| `tests/unit/guards/reclasificacion-459-lista.guardia.test.ts` | la lista aprobada es del integrador y no se copió; borrar la guardia obligaría a anotar `specs/461` | SL-13 |
| `tests/integration/db/zona-central-guarda-y-rastro.test.ts` | la base local no se migra; el test cuelga de filas de `orden` sembradas por los seeds de Ordenex | SL-11, que le da sus propios fixtures |
| `tests/integration/db/zona-guardado-conserva-inactivos.test.ts` | ídem | SL-11 |

- La guardia `gate-cableado-arnes-v2` comprueba que cada entrada tenga un `motivo` de al menos 40
  caracteres que cite una ficha `SL-<n>` (R21), un `desde` con formato `AAAA-MM-DD` y una ruta que
  exista.  - No fija la lista: podar es obligatorio (`docs/gate.md`), y una guardia que congelara las
    cuatro rutas pelearía con la poda.
  - El comparador de CI ya exige `motivo` y `desde`. El rápido no lo valida, y por eso hace falta
    aquí.
- R6 no necesita código nuevo: `scripts/test-rapido.mjs` ya excluye y tolera los heredados, y
  `tests/guards/guard-test-rapido-rojos-heredados.test.ts` prueba su veredicto (verde solo con
  heredados, rojo con uno nuevo). Además se prueba que muerde: rojo forzado en una guardia fuera del
  baseline, `./init.sh` sale con 1, y se restaura desde copia.
- **Aviso esperado en CI.** Si el Postgres del CI tiene esquema y semilla, los dos tests de zona
  pueden pasar allí y el comparador avisará de que «ya pasan». No es rojo. El leader lo atiende en
  F2.6 escribiendo por qué se quedan, porque en local siguen rojos hasta SL-11.

### D4 — Retirar las tres guardias de bitácoras de Ordenex (R7)

Se borran `financiera-trazabilidad`, `financiera-180-trazabilidad` y `tablero-lineas-trazabilidad`.

- Ningún `specs/*/tasks.md` ni `specs/*/design.md` las cita en una fila `| R<n> | … |`; solo en
  prosa o con la ruta como primera celda. Así que `test-citado-desaparecido` no exigirá anotar ninguna
  ficha de Ordenex. Comprobado con Grep. El implementer lo vuelve a comprobar con la guardia verde
  tras commitear el borrado.
- Las citas en `specs/186/requirements.md` (R18) y `specs/132/design.md` quedan como historia (R16).

### D5 — `catalogo-produccion`, caso R14 (R8)

- Se quitan solo las tres aserciones de suficiencia sobre `progress/` real:
  - `cambios.length >= 3`;
  - `≥2` ficheros distintos;
  - una derivación por cada regla.
- Se quedan:
  - la autocomprobación del derivador y la del lector de citas sobre texto sintético, que es lo que
    hace que la regla muerda;
  - el bucle que comprueba cada decisión que sí exista.
- Un comentario dice por qué el bucle hoy no tiene sujetos: el `progress/` de Ordenex no se copió, y
  en el arnés v2 las decisiones viven en los specs. Cita SL-30, la que re-ancla la regla
  (decisión del humano, P4).
- Mutación que el reviewer puede pedir: romper `cambiosDeclaradosEnTexto` debe poner el caso en rojo.

### D6 — Raíz `perfiles/` (R9)

- Entrada en `INVENTARIO_DE_RAICES` con `censada: true` y su motivo: plantillas de perfil que trae
  el arnés v2. No se despliegan, pero contienen `.ts` y censarlas cuesta cero, el mismo criterio que
  ya tiene `scripts`.
- Si al censarla aparece una coincidencia de push dentro de `perfiles/`, el implementer lo dice y
  la entrada pasa a `censada: false` con el motivo medido.
- En `push-intencion-de-baja`, la lista esperada gana `"perfiles"` y el título pasa de «NUEVE» a
  «DIEZ».

### D7 — Manifiesto (R10)

- Los literales pasan a «Servi Logistic», «Plataforma de logística y entregas Servi Logistic»,
  `#111111` y `#F7F7F5`. Las demás claves no cambian.
- Se dejan como literales y no se leen del propio manifiesto: el test es de no regresión, y
  compararlo contra su fuente lo dejaría siempre verde.

### D8 — `no-embalaje` (R11, R12)

- `WHITELIST_FILES` gana `docs/limpieza-ordenex.md`, con el mismo comentario de precedente que
  los specs 155/159/167: cita el nombre de la guardia, no el valor.
- `WHITELIST_PREFIXES` gana `specs/SL-10-gate-verde-heredado/`, porque este spec la nombra.
- `IGNORED_DIRS` gana `.worktrees`: son checkouts anidados del propio repo, el mismo motivo que ya
  tiene `.claude`. Sin esto, en el checkout principal con un worktree abierto, la guardia se
  encuentra a sí misma bajo otra ruta.
- Se ignora por nombre el archivo `.vitest-rojos.json` (D2).
- Las dos altas nuevas de la lista blanca son excepciones temporales (R21): su comentario cita la
  ficha que las retira, SL-27. `.worktrees` y `.vitest-rojos.json` no son excepciones:
  no son fuente del repo, igual que `.claude` y `.vitest`.

### D10 — `.env.example` versionado (R18, R19, R20, R21)

- **Causa.** `.gitignore:50` ignora `.env*`. `.env.example` solo existe en el checkout principal, y
  `push-config.test.ts` (lo lee) y `sinpe-sin-variables-de-entorno.guardia.test.ts` (lo exige en su
  censo) fallan en cualquier copia recién materializada: worktrees y CI.
- **`.gitignore`:** tras `.env*` se añade `!.env.example`. El resto de `.env*` sigue ignorado.
- **El archivo:** se copia tal cual desde el checkout principal al worktree. Lo único que se le añade
  es el bloque de comentario inicial de abajo. Los finales de
  línea los normaliza `.gitattributes` al commitear. Medido antes de versionarlo: 35 líneas
  `NOMBRE=`, ninguna con valor.
- **Comentarios que se quedan:** no se reescriben, por la regla del humano sobre Costa Rica y por el
  arreglo mínimo.
  - el email de soporte de Ordenex → SL-14.
  - `scripts/seed-sinpe-inicial.ts` → SL-11.
  - SINPE y Costa Rica → fase 3.
  - Un comentario nuevo al principio del archivo lista esas excepciones con su ficha (R21).
- **Guardia nueva** `tests/unit/guards/env-example-sin-valores.guardia.test.ts`:
  - Toda línea es vacía, empieza por `#` o casa con `^[A-Z][A-Z0-9_]*=$`.
  - Si falla, el mensaje nombra la línea **sin imprimir su contenido**: si alguien pega un secreto,
    el log del CI no lo debe repetir.
  - Caso que muerde: la función pura sobre un texto sintético con `CLAVE=algo` lo marca; con `CLAVE=`
    y comentarios, no.
  - Afirma además que `git ls-files .env.example` lo devuelve, que es lo que le falta hoy a un
    worktree.
- **Alternativa descartada.** Que los dos tests usen `existsSync` y se salten sin el archivo. Es la
  validación opcional de `docs/gate.md`: verde mudo justo en CI, que es donde más importa.

### D9 — `test-citado-desaparecido` (R13)

- **Conocido-positivo:** el detector se prueba con un mapa de borrados **sintético**
  (`ChatWhatsappPanel.test.tsx` → `{ ruta, commit }` inventado). Para eso, el filtro
  `!existeHoy && borrados.has(nombre)` se extrae a una función pura que recibe el mapa.
- **Anti-vacuidad:** la comprobación pasa a «el clon no es superficial»
  (`git rev-parse --is-shallow-repository` responde `false`). Ese era el motivo declarado del caso.
  - Se va el umbral de ≥20 borrados.
  - Se va el ancla `da544b30`.
  - Se queda «toda entrada trae su commit».
  - El CI hace checkout con `fetch-depth: 0`, así que allí no es superficial.
- La parte que lee de verdad la historia (`DESAPARECIDOS`, R-1) no cambia. Hoy tiene pocos sujetos y
  los irá ganando con la historia de este repo.

## Alternativas descartadas

- **A. Meter los 15 en el baseline.** Deja el gate ciego sobre arreglos de una línea (marca,
  `perfiles/`, lista blanca, CRLF). `docs/gate.md` pide sembrar con pocas entradas, porque un baseline
  que nace grande no se poda nunca.
- **B. Portar el paso 420 a `init.sh` ahora.**
  - `init.sh` está en `arnes.manifest`: el siguiente `arnes-sync --aplicar` lo pisaría, y la regla
    8 de `CLAUDE.md` manda esa mejora por `/afinar-regla` con subida a la plantilla.
  - Además rompería R17. Va a SL-29.
- **C. Borrar `reclasificacion-459-lista`.** `specs/461-cobro-a-tienda-y-nombres-claros/design.md:827`
  la cita en la fila `| R61 |`. Borrada, `test-citado-desaparecido` exigiría una anotación
  `@test-desaparecido` dentro de ese spec de Ordenex, que no se toca.
- **D. Renombrar los dos tests de zona para que «guard» no los seleccione.**
  - Esconde la causa real, una base sin esquema ni semilla, que seguiría ahí en `--completo`.
  - Deja citas rancias en `specs/374`, `376` y `380` y en tres comentarios de código.
- **E. `describe.skipIf(!existsSync(<bitácora>))` en las guardias de Ordenex.** Es la validación
  opcional que `docs/gate.md > El anti-patrón` prohíbe: verde mudo en la máquina sin el archivo.
- **F. Solo re-materializar, sin guardia de finales de línea.** El fallo volvería en la siguiente
  copia escrita desde Windows, y otra vez como un `SyntaxError` sin nombre. La guardia lo convierte en
  un mensaje con el archivo y la orden.

## Trampas para el implementer

- **No escribas filas `| R<n> | \`<test>\` |` que citen las tres guardias retiradas** en un
  `tasks.md` o `design.md`, tampoco en este spec. Al borrarlas, `test-citado-desaparecido` exigiría
  anotarlas.
- `no-embalaje` recorre el árbol entero: este spec y `progress/impl_SL-10.md` la nombran. `progress/`
  ya está en `IGNORED_DIRS`; el spec entra por R11.
- Verifica el gate en el **worktree** (LF). El checkout principal sigue en CRLF hasta R15, y la
  guardia de R1 estará roja allí, que es lo esperado.
- Log del gate a archivo con `INIT_EXIT=$?` escrito dentro (`docs/gate.md > Trampas conocidas`).

## Dependencias de terceros

Ninguna nueva.
