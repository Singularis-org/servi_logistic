# docs/gate.md — El gate: qué corre, dónde, y cómo se verifica el propio gate

"Compila" y "el agente dice que está listo" NO son verificación. Nada se da por hecho sin pasar
el gate. Este archivo es el **proceso** del gate y es igual en todo proyecto con el arnés; lo
propio del stack (base de tests, artefactos que se regeneran, flakes concretos, qué cuenta como
evidencia) vive en `docs/verification.md` del proyecto.

## El gate tiene DOS niveles — usa el que toca

| Momento | Comando | Dónde |
| --- | --- | --- |
| Cerrar tanda, cerrar feature, antes de abrir el PR | `./init.sh` (rápido, el **default**) | local |
| PR hacia la rama de integración (`ramas.integracion`, p. ej. `dev`) | `./init.sh --completo` | CI (`.github/workflows/gate.yml`), check `gate-completo` |
| PR integración → producción (`ramas.produccion`, p. ej. `dev` → `main`, despliegue) | `./init.sh --completo` + E2E (Playwright) | CI, check `gate-completo` + E2E |

- **Los nombres de rama salen de `arnes.config.json > ramas`.** `gate.yml` los lleva escritos
  (GitHub no lee el JSON) y `./init.sh` falla si no coinciden (`scripts/check-perfil.mjs`).

- **En local corre siempre el rápido**: typecheck + lint + los tests que el grafo de imports
  (`vitest related`) relaciona con tu diff + **todas** las guardias (~1 min).
- **El completo (la suite entera) corre en CI**, como check del PR (`gate-completo`). Nadie
  mergea con ese check en rojo o sin terminar. Si el plan de GitHub no permite hacerlo
  obligatorio con *branch protection*, rige como convención (`docs/equipo.md > Merge sin
  protección de ramas`).
- `./init.sh --completo` existe en local **para reproducir un rojo de CI**, no como paso de rutina.
- `./init.sh --rapido` sigue aceptado como alias del default.
- En CI no hay `feature_list.json`: el validador sale en verde con la nota «sin copia del board».

### Las guardias van SIEMPRE

- El modo rápido corre **todas** las guardias, enteras, siempre.
- Se seleccionan por patrón (`vitest run guard`), no por lista: una guardia nueva entra sola.
- Toda comprobación cuyo objeto **no se importa** (un censo en JSON, la configuración, un
  `.spec.ts`, el árbol de archivos) va en las guardias: fuera de ellas nadie la ejecutaría en
  modo rápido.
- **Además de `guard`, el rápido corre siempre los patrones de `arnes.config.json > gate.siempre`**
  (por defecto `["guard"]`). Ahí se declaran los tests del proyecto que recorren el árbol sin
  llamarse `guard*`: contratos de módulo, de ruta… Cada patrón cuesta tiempo de gate: mídelo
  antes de añadirlo.
- `./init.sh` **avisa** (no falla) de los tests que recorren `app/`, `lib/` o `components/` y no
  casan con ningún patrón (`scripts/tests-de-arbol.mjs`). Un test sale del aviso con
  `// gate: related` y su motivo.

### Lo que `--rapido` NO cubre — no te engañes

- Acoplamientos que **no son imports**: SQL, nombres de archivo, lectura de `feature_list.json`.
- Un cambio en un archivo **sin tests que lo importen** selecciona cero tests y sale verde.
- Regresiones lejanas que solo aparecen con la suite entera.

Eso lo cubre el completo de CI, y por eso no se mergea sin él en verde. **Si tocas `init.sh` o
`scripts/`, el rápido no te cubre** —ningún test los importa, así que sale verde sin probarlos—:
son cimientos, y quien los prueba es el completo del CI en el PR. El modo rápido **no** lo
detecta ni lo avisa: no leas su verde como prueba de esos cambios.

**Al seleccionar en modo rápido, el diff se calcula contra el merge-base** con la rama de
integración, no contra el último commit:

```bash
pnpm exec vitest related --run $(git diff --name-only origin/dev...HEAD)   # tres puntos
```

### En CI la suite va en shards

- El CI parte la suite de vitest en N shards (`GATE_SHARD=i/N`); el N lo fija el perfil en `gate.yml`.
- **Ningún shard da veredicto.** Un shard puede no traer ni un archivo de `integration`: la
  garantía «los tres proyectos corrieron» solo vale sobre el informe unido.
- El job final `gate-completo` une los informes (`./init.sh --unir <dir> <N>`) y aplica baseline y
  garantías una sola vez. **Un shard sin informe es rojo**, no «un shard menos».
- typecheck y lint van en su propio job (`GATE_PARTE=estatico`); `gate-completo` exige que también
  salga verde.
- En local nada cambia: `./init.sh --completo` corre todo sin shard.

### Por qué

**Dos niveles.** Una suite madura son miles de tests y varios minutos. Correrla al cerrar
**cada** tanda convierte el arnés en una sala de espera: una feature de 9 tandas se lleva media
hora de reloj **solo esperando**, y el arnés existe para mejorar el trabajo, no para alargarlo.
Cerrar la feature y mergear son otra cosa: ahí sí se paga la suite entera.

Referencia medida el 2026-08-03 sobre un proyecto que corría este mismo arnés (las cifras son de
donde salió la regla, no una medición de cada proyecto):

| Qué corres | Archivos | Tests | Tiempo |
| --- | --- | --- | --- |
| suite entera | 804 | 10.187 | ~235 s |
| relacionados con un servicio | 16 | 437 | 21 s |
| relacionados con un cambio en un util muy importado | 155 | 2.577 | 103 s |
| **`./init.sh --rapido` entero** (typecheck + lint + tests) | — | — | **~58 s** |

**Las guardias siempre.** `--rapido` selecciona por el **grafo de imports**. Las guardias **no
importan lo que vigilan**: recorren el árbol de archivos (censo de tablas, columnas sensibles,
módulos puros, emisores de una categoría). **Ningún grafo de imports las selecciona**, así que
serían justo lo que se pierde. Cuestan ~8 s.

**`gate.siempre`.** El 2026-10-08, QC-230 pasó `./init.sh` en verde y el CI completo salió rojo por
tres `module-contract.test.ts`: recorren el árbol de código, no se llamaban `guard` y nadie los
corría en modo rápido. En QuimiCloude, los cuatro patrones (`guard`, `module-contract`,
`route-contract`, `scope.test`) suman unos 13 s. Ampliarlo a todo lo que recorre el árbol subía el
rápido de ~35 s a ~145 s; por eso el resto solo **avisa**, y el número queda a la vista para la
revisión del perfil.

**Por qué el completo es un check de CI y no una disciplina.** La lección viene de dos PRs de un
proyecto con este arnés: se mergeó mirando el estado del PR —que era un build y **no corría
tests**— y entró un guard rojo en la rama de integración.

**Merge-base.** Contra el último commit, una tanda de tres commits solo mira el tercero.

- **Shards en CI.** El 2026-10-07 el run 37568468781 tardó 22 min, y 14,5 de ellos fueron del
  proyecto `ui` (jsdom: importar módulos y montar el entorno, no los tests). `isolate: false` daba
  3–5× pero se descartó por fugas entre archivos (`progress/fix-ci-velocidad-ui.md`, PR #161).
  **Coste aceptado:** con 3 shards se facturan ~30 min por corrida frente a ~23 de un solo job, en
  el plan Free (2000 min/mes); a cambio, el reloj del PR baja.

## Rojos heredados: la pregunta es «¿rompí algo YO?»

El completo **no exige que la suite esté verde**, sino que **no aparezca ningún archivo de test
rojo que no estuviera ya en `tests/baseline-rojos.json`** (lo compara
`scripts/comparar-baseline-rojos.mjs`).

- **La comparación es por archivo, no por conteo.**
- **El rápido aplica la misma regla** (`scripts/test-rapido.mjs`): lee el informe JSON de su
  corrida y solo da por bueno un rojo si todos sus archivos rojos están en el baseline. No se
  apoya en `--exclude`, porque `vitest related` lo ignora.
- **Cada entrada del baseline necesita `motivo` y `desde`**; el comparador falla si faltan.
- **Un archivo del baseline que ya pasa** genera aviso, no rojo, y **solo si esa corrida lo
  ejecutó**. Nunca se calcula como `baseline − rojos`.
- **Podar es obligatorio.** El job de CI imprime las entradas que ya pasan; el leader lo atiende
  en F2.6 leyendo el resumen del run (`gh run view`): borra la entrada, o escribe por qué se queda.
- **Un arreglo de la causa retira sus entradas en el mismo cambio.** Si la causa se arregla y las
  entradas se quedan, el gate sigue ciego sobre esos archivos.
- **Al sembrarlo:** mídelo en una rama que sea la de integración más archivos que no toquen
  producto, para saber que la deuda es de la rama y no tuya. Y siémbralo con pocas entradas.

### Por qué

Cuando la rama de integración arrastra tests rojos que no son tuyos, la suite completa termina
siempre en rojo y el gate deja de responder lo único que importa al cerrar una feature. Comparar a
mano contra un número que viaja por el chat no escala: en una sola feature de un proyecto anterior
hubo que hacerlo **ocho veces** y una se concluyó mal.

- **Por archivo:** una suite grande tira 2–5 flakes de saturación que cambian de sitio —se
  midieron 30, 31 y 32 rojos sobre el mismo código—, así que exigir conteos exactos daría falsas
  alarmas constantes, y un gate que grita en falso se ignora.
- **Coste aceptado:** si un archivo ya listado gana un rojo nuevo de verdad, no lo ves. A cambio la
  pregunta que sí responde —«¿apareció un archivo que antes no fallaba?»— aguanta el ruido.
- **`motivo` y `desde`:** sin eso la lista se vuelve el sitio donde cualquiera mete lo que le
  estorba.
- **Solo lo que corrió:** calcular `baseline − rojos` parece natural y está **mal**, porque un
  archivo que no corrió no dice nada. Esa versión, con fixtures de dos archivos, pedía limpiar 6 de
  las 7 entradas —una falsa alarma en el primer uso—.
- **Pocas entradas al sembrar:** si nace con cincuenta, nadie lo va a limpiar nunca.
- **Podar:** un baseline que no se poda deja el gate **ciego** sobre esos archivos y se acaba
  usando para tapar problemas que no son suyos.

## Cuando lo que verificas es el gate mismo

Al tocar `init.sh`, `scripts/` o una guardia no basta con que el gate salga verde: hay que
comprobar que **muerde**.

### Probar que muerde, no que pasa

- Para cada validación nueva, **un fixture por desenlace**: el caso correcto (`exit 0`) y **uno
  por cada motivo de fallo** (`exit 1`, con el mensaje nombrando qué falla).
- Después, **rompe el archivo real** —inyecta el dato inválido en `feature_list.json`, renombra
  el script—, corre el gate, confirma que sale con 1 y restaura.
- Restaura desde una copia (`cp`), **no con `git checkout`**: el archivo puede tener cambios sin
  commitear que no son tuyos.
- Un check probado solo con su caso verde no está probado.

### Trampas conocidas

- **No pipees el gate a `head` o `tail` para leer el código de salida.** Redirige a un archivo y
  lee `$?`.
- **Un mensaje de fallo no debe prometer un detalle que no entrega.** O capturas `2>&1`, o dejas
  que stderr salga por su cuenta y el mensaje no promete nada.
- **Tocar `init.sh` o `scripts/` deja al modo rápido ciego** (nadie los importa) y él no lo
  avisa: son cimientos, los prueba el completo del CI (y `./init.sh --completo` si necesitas
  reproducir en local), más los fixtures de «Probar que muerde».

### El anti-patrón: la validación opcional

- Una validación colgada de `if command -v <herramienta>` o `if [ -f <script> ]` con un `warn` en
  el `else` **no es una validación**. Si el check importa, en el `else` va `fail`; si no importa,
  bórralo.
- Instalar la herramienta que falta no lo arregla: mueve el problema a la siguiente máquina.
- **Antes de escribir un check, mira si ya existe.** Dos validadores con nombres parecidos e
  `init.sh` llamando a uno solo es la misma enfermedad con mejor disfraz.
- Los avisos propios de `scripts/validate-features.mjs` —no ampliar la comprobación de specs a
  las fichas `done`, no cambiar el cupo por defecto sin mirar `arnes.config.json >
  cupos_por_persona` y `CLAUDE.md` regla 1— viven como
  comentarios en el script, que es donde se leen en el momento de romperlos.

### Por qué

Un check que no corre es peor que uno que no existe: crees que te cubre. El gate se rompe al revés
que el código normal, y estas son las formas conocidas de equivocarse.

- **Pipes:** el estado de una tubería es el del último comando, así que verás `0` aunque el gate
  haya fallado.
- **Mensajes:** `$(...)` captura solo stdout; si los errores del script van a stderr, un
  `fail "invalido: $SALIDA"` imprime `invalido:` y nada más.
- **Validación opcional:** en la máquina que no tenga la herramienta o el script, el check se
  salta entero y el gate sigue en verde, y nadie nota que sus `ok` no se imprimen nunca.

## La vuelta 2 del reviewer se acota a los arreglos

- Tras un RECHAZADO, la vuelta 2 revisa **el diff de los arreglos** (`<A>..<B>`), no la feature
  entera.
- Se amplía solo en las excepciones de `AGENTS.md > F2.2`; el leader dice en el prompt cuál aplica.
- Cada vuelta va como sección añadida al final de `progress/review_<key>.md`:
  `## Vuelta N (acotada a <A>..<B>)`. Si el leader amplió, el título dice qué excepción aplicó.
- El gate completo (CI) sigue siendo obligatorio antes de mergear, sin excepción; el E2E, en
  el PR a producción (y los specs E2E tocados, en local en F2.4: `AGENTS.md > F2.4`).

### Por qué

Tras un RECHAZADO, lo que cambió es el diff de los arreglos, no la feature. Revisar la feature
entera otra vez repite un trabajo ya hecho y no añade cobertura: la red contra regresiones fuera
del diff ya existe, y es el gate completo y el E2E. **Qué se acepta a cambio:** una regresión fuera
del diff de los arreglos no se ve hasta el gate completo; por eso ese gate y el E2E no tienen
excepción.
