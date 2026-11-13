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

- **Los nombres de rama salen de `arnes.config.json > ramas`.** El `gate.yml` se genera de ahí
  (abajo) y `./init.sh` falla si no está al día (`scripts/check-perfil.mjs`).

### El CI se genera

Nadie escribe ni copia el workflow a mano:

| Archivo | De quién | Cómo llega |
| --- | --- | --- |
| `.github/workflows/arnes-gate.yml` | del arnés: toda la mecánica (shards, `gate-completo`, E2E, borradores, runner) | lo trae `./scripts/arnes-sync.sh --aplicar`, como el resto del arnés |
| `.github/workflows/gate.yml` | del proyecto, pero **generado**: unas 30 líneas que llaman al de arriba | `node scripts/ci.mjs generar`, desde `ramas` y el bloque `ci` de `arnes.config.json`. El sync lo regenera solo |
| `scripts/ci-entorno.sh` | del proyecto (opcional): lo que la suite necesita en `$GITHUB_ENV` (credenciales efímeras del seed) | se escribe una vez, desde `plantillas/github/ci-entorno.sh` |
| `scripts/ci-e2e-preparar.sh` | del proyecto (opcional): la base y lo demás que el E2E necesita | se escribe una vez, desde `plantillas/github/ci-e2e-preparar.sh` |

- **El bloque `ci`** (`arnes.config.json`): `shards` (3), `postgres_image` (`postgres:17`),
  `node_version` (`24`), `navegadores` (`chromium`), `e2e` (`true`). Para cambiar algo, se edita el
  bloque y `node scripts/ci.mjs generar`.
- **`./init.sh` falla si el `gate.yml` generado no está al día** con `arnes.config.json`, o si falta
  `arnes-gate.yml`. Un `gate.yml` escrito a mano no se pisa nunca: el gate avisa de que conviene
  pasarlo al generado.
- **Los checks se llaman `gate / estatico`, `gate / vitest (shard i/N)`, `gate / gate-completo`** y
  `gate / e2e`: el prefijo es el job que llama. La regla de merge sigue siendo la misma:
  `gate-completo` en verde.

### Por qué

Antes cada proyecto copiaba un workflow de 400 líneas y lo adaptaba, así que cada mejora del CI del
arnés (shards, CI por tanda, runner propio…) había que volver a copiarla a mano en cada proyecto, y
la copia se desalineaba en silencio. Ahora la mecánica viaja con el sync y lo del proyecto es un
dato que el gate comprueba.

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
- El rápido corre también, siempre y fuera del presupuesto, los tests que **nombran por su ruta**
  un archivo del diff (`'app/x/Y.tsx'`, con o sin extensión, entre comillas o backticks): los que
  leen el código como texto sin importarlo. No hace falta declararlos. Una ruta armada con
  `path.join` o por partes no se ve: para esa, un disparador.

### Disparadores: lo que no es un import

`vitest related` solo ve imports. Los tests que leen el esquema, las migraciones o recorren un
módulo no importan lo que vigilan: salen verdes en local y rojos en CI. Para esos, el perfil
declara disparadores en `arnes.config.json > gate.disparadores`: «si el diff toca esto, corre estos
tests».

```json
"disparadores": [
  { "si_cambia": ["db/schema.prisma", "db/migrations/**"], "corre": ["schema", "tests/integration/"] },
  { "si_cambia": "lib/modules/<m>/**", "corre": ["tests/unit/<m>/", "tests/integration/<m>/"] }
]
```

- `si_cambia`: glob o lista. `**` = cualquier cosa, `*` = un segmento, `<nombre>` = un segmento
  capturado.
- `corre`: filtros de vitest (subcadena de la ruta del test, como `gate.siempre`), con `<nombre>`
  sustituido por lo capturado.
- El diff incluye lo que aún no está commiteado. `./init.sh` falla si la forma no es válida
  (`scripts/check-perfil.mjs`).
- **Cuando un rojo de CI no salió en local, añade el disparador que lo habría cazado:** es el
  procedimiento de la sección siguiente. Es el equivalente a un test de regresión, pero para el
  gate.
- Para ver qué correría el rápido sin correr nada: `node scripts/test-rapido.mjs --seleccion`.

Ejemplos por tipo de acoplamiento. Usa las rutas y nombres reales de tu proyecto; esto es la
forma, no los valores:

| El test… | `si_cambia` | `corre` |
| --- | --- | --- |
| lee el esquema de la base | `db/schema.prisma` | `schema` |
| lee o aplica migraciones | `db/migrations/**` | `migration`, `tests/integration/` |
| comprueba el alcance de un módulo (`scope`, contratos) | `lib/modules/<m>/**` | `tests/unit/<m>/scope`, `module-contract` |
| prueba la integración de un módulo contra la base | `lib/modules/<m>/adapters/**` | `tests/integration/<m>/` |
| lee un JSON o una config (rutas, permisos, menús) | `lib/shared/routes.ts`, `config/*.json` | el nombre del test que la lee |
| compara textos o traducciones | `messages/**` | `i18n`, `textos` |

Reglas para escribirlos:
- **Estrecho por los dos lados.** `si_cambia` tiene que nombrar la fuente real del acoplamiento
  (no `lib/**`) y `corre` la familia de tests que la lee (no `tests/`). Un disparador ancho
  convierte el rápido en la suite entera.
- **Un disparador por acoplamiento,** no uno por test: si mañana aparece otro test de esquema, ya
  entra solo.
- Si un test recorre el árbol entero y no depende de ningún archivo concreto, no es un disparador:
  va en `gate.siempre`.

### Cuando el CI sale rojo y el local salió verde

Es el aviso de que falta un disparador. Lo hace el **leader** en F2.4, antes de devolver el rojo al
implementer (`AGENTS.md > F2.4`):

1. **Lee qué falló.** `gh run view <id> --log-failed` muestra, en el job `gate-completo`, la línea
   «hay N archivo(s) de test en rojo que NO están en el baseline» y su lista.
2. **Comprueba si el rápido lo habría corrido:**
   `node scripts/test-rapido.mjs --comprobar <test1> <test2>`. «entra» quiere decir que el rápido
   sí lo seleccionaba: entonces el rojo es de verdad nuevo y va al implementer, sin disparador.
   «NO entra»: sigue.
3. **Encuentra el acoplamiento.** Abre el test y busca qué lee sin importarlo: `readFileSync`,
   `readdir`/`glob`, una ruta armada por partes, la base de datos, una variable de entorno (una
ruta escrita entera en un string ya la selecciona el rápido: si `--comprobar` dice «NO entra»,
no es ese caso). Cruza eso
   con `git diff --name-only origin/<integracion>...HEAD`: el archivo de tu diff que el test lee es
   el `si_cambia`.
4. **Escribe el disparador** en `arnes.config.json > gate.disparadores` (el leader puede editar
   ese archivo), estrecho por los dos lados y siguiendo la tabla de arriba.
5. **Verifica:** `node scripts/test-rapido.mjs --comprobar <test>` tiene que decir «entra». Sin
   eso, el disparador no está probado.
6. **Commitea** `arnes.config.json` en la rama de la feature (`chore(<key>): disparador para
   <test>`) y anota una línea en `progress/features/<key>.md > Decisiones`.

Después, el rojo vuelve al implementer como cualquier otro: con el disparador puesto, su
`./init.sh` ya lo reproduce en local.

### Presupuesto del rápido

Si los tests relacionados por imports pasan de `arnes.config.json > gate.presupuesto_rapido`
(por defecto 150 archivos), **no se corren en local**. Pasa cuando tocas algo que importa medio
repo. Las guardias, `gate.siempre` y los disparadores sí corren. El rápido lo dice en voz alta, y
el resto lo cubre el CI completo del PR, que es obligatorio. `TEST_RAPIDO_SIN_PRESUPUESTO=1
./init.sh` los corre igualmente.

**Cómo elegir el número:** el objetivo es que el rápido no pase de ~3 min (p90 en
`node scripts/metricas.mjs informe`). Si el p90 pasa de ahí, baja el presupuesto. Si casi siempre
se queda muy por debajo y el CI saca rojos de tests relacionados, súbelo. Cámbialo en pasos del 25%
y mira el informe tras una semana.

### Lo que `--rapido` NO cubre — no te engañes

- Acoplamientos que **no son imports**, no nombran el archivo por su ruta literal y ningún
  disparador declara: SQL, rutas armadas por código, lectura de `feature_list.json`.
- Un cambio en un archivo **sin tests que lo importen ni disparador** selecciona cero tests y sale
  verde.
- Los relacionados que pasan del presupuesto.
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

- El CI parte la suite de vitest en N shards (`GATE_SHARD=i/N`); el N es `arnes.config.json > ci.shards`.
- **Ningún shard da veredicto.** Un shard puede no traer ni un archivo de `integration`: la
  garantía «los proyectos declarados corrieron» solo vale sobre el informe unido.
- El job final `gate-completo` une los informes (`./init.sh --unir <dir> <N>`) y aplica baseline y
  garantías una sola vez. **Un shard sin informe es rojo**, no «un shard menos».
- typecheck y lint van en su propio job (`GATE_PARTE=estatico`); `gate-completo` exige que también
  salga verde.
- En local nada cambia: `./init.sh --completo` corre todo sin shard.

### CI en cada tanda (opcional)

El PR se abre **listo** tras el primer push de la feature (`AGENTS.md > F2.1`), así que el gate
completo corre en cada push: un rojo llega en la tanda que lo causó, no al final. Nadie lo mergea
antes del aviso «#n listo para mergear» del leader (review OK + `gate-completo` verde). Dos
variables del repo en GitHub (*Settings → Secrets and variables → Actions → Variables*) ajustan
dónde y cuándo corre:

| Variable | Efecto |
| --- | --- |
| `GATE_RUNNER=<label>` | los jobs corren en ese runner (p. ej. `self-hosted`) en vez de `ubuntu-latest` |
| `GATE_EN_BORRADOR=true` | el gate corre también en PRs en borrador (solo exploratorios: el flujo normal ya no usa borrador) |

- **Coste:** cada push factura ~30 min de CI. En un repo público es gratis; en uno privado del
  plan Free hay 2000 min al mes y, con muchas tandas, conviene un runner propio.
- **Check obligatorio.** Si el repo lo permite (público o plan de pago), marca `gate-completo`
  como check requerido en la rama de integración, sin pedir aprobaciones. GitHub bloquea el botón
  de merge hasta el verde:
  `gh api -X PUT repos/<org>/<repo>/branches/<integracion>/protection --input proteccion.json`,
  con `{"required_status_checks":{"strict":false,"contexts":["gate-completo"]},"enforce_admins":false,"required_pull_request_reviews":null,"restrictions":null}`.
- **Runner propio (self-hosted):** no gasta minutos, conserva la caché entre corridas y permite
  más shards. Necesita una máquina Linux con Docker (los jobs levantan Postgres como servicio).
  Se instala desde *Settings → Actions → Runners → New self-hosted runner*. Después,
  `GATE_RUNNER=self-hosted`.
- Sin ninguna de las dos, el gate corre en `ubuntu-latest` en cada push al PR (listo).

**Activarlo, paso a paso** (lo hace una persona con permisos de admin en el repo):

1. Antes de tocar nada, toma la foto: `node scripts/metricas.mjs informe` (sobre todo la línea
   del CI).
2. **Con runner propio** (recomendado si hay una máquina Linux con Docker siempre encendida):
   - en GitHub, *Settings → Actions → Runners → New self-hosted runner*, Linux. Sigue los
     comandos que da GitHub en esa máquina e instálalo como servicio
     (`sudo ./svc.sh install && sudo ./svc.sh start`);
   - comprueba que aparece *Idle* en esa pantalla;
   - `gh variable set GATE_RUNNER --body self-hosted`.
3. Comprueba que funciona: haz push a una rama con PR abierto y mira
   `gh run list --branch <rama> --limit 1`; tiene que aparecer el workflow `gate` en ese runner.
4. Al cabo de una semana, repite el informe y compara los minutos y la tasa de rojo.

Para desactivarlo: `gh variable delete GATE_RUNNER` (si el runner deja de existir: sin runner
disponible, los jobs se quedan en cola).

### Acelerar la suite (perfil)

Lo que acelera la suite es del proyecto, no del arnés: cambia su configuración de vitest y puede
añadir dependencias, que se aprueban como cualquier otra (regla 7). Las palancas, de menos a más
riesgo, **cada una medida antes y después con `node scripts/metricas.mjs informe`**:

- **Separar entornos:** solo los tests de componentes llevan entorno DOM; los de lógica, `node`.
  Montar jsdom cuesta 200–400 ms por archivo.
- **happy-dom en vez de jsdom** en el proyecto de UI: arranca más rápido, pero se comporta distinto
  en algunos casos. Pruébalo por proyecto y compara rojos.
- **Base de datos de tests:** clonar una base plantilla ya migrada por test o archivo en vez de
  migrar cada vez. Para tests de lógica de datos, Postgres en memoria (PGlite) es mucho más rápido,
  pero no es Postgres completo: no sustituye a la integración contra Postgres real en CI.
- **Más shards en CI**, con runner propio (arriba).
- **`isolate: false`** solo con vigilancia de flakes: comparte estado entre archivos.

**Procedimiento** (cada palanca es una feature del board del proyecto, por la ruta ligera o la
completa, nunca un cambio suelto):

1. **Mide antes:** `node scripts/metricas.mjs informe` y el tiempo del proyecto de vitest afectado
   (`pnpm exec vitest run --project <p>`, tres veces, quédate con la mediana).
2. **Cambia una sola palanca** por PR. Dos a la vez no dicen cuál sirvió.
3. **Mide después** igual, y comprueba que la suite tiene los mismos rojos que antes (ni más ni
   menos).
4. **Anota** el antes y el después en `docs/verification.md` del proyecto: por qué se hizo y qué
   ganó. Si no ganó nada, se revierte.

### Medir el ciclo

`node scripts/metricas.mjs informe` resume dónde se va el tiempo:
- **el gate local:** `./init.sh` registra cada corrida al salir (modo, segundos, resultado);
- **el ciclo por fase:** el leader registra F1.0, F1.3, F1.4, F2.1, F2.4 y F2.5 con
  `node scripts/metricas.mjs fase <key> <fase>`;
- **el CI:** se lee de GitHub con `gh`.

Los eventos van a `progress/logs/metricas.jsonl` (no se versiona: es de cada máquina). Cualquier
cambio al gate o a la suite se justifica con el informe de antes y el de después.

**Cuándo se mira:**
- **al cerrar cada feature (F2.6):** el leader copia `node scripts/metricas.mjs informe --key <key>`
  en `progress/features/<key>.md > Cierre`. Queda el historial de cada feature en git;
- **al revisar el perfil** (`/arnes-init revisar`) y siempre que el equipo note que todo va lento:
  el informe completo.

**Qué decidir con él:**

| Si el informe dice… | Entonces… |
| --- | --- |
| el CI sale en rojo a menudo (> 20%) | revisa los rojos con `--log-failed`: los que el rápido no corrió piden disparadores (arriba) |
| el p90 del rápido pasa de ~3 min | baja `gate.presupuesto_rapido` o estrecha disparadores anchos |
| la mediana del CI pasa de ~10 min | más shards con runner propio, o una palanca de `Acelerar la suite` |
| la espera de aprobación del spec es la fase más larga | más features por la ruta ligera o directa (`docs/specs.md > Tres rutas`) y avisar al humano del cuello de botella |
| la implementación hasta el PR es la fase más larga | features más pequeñas (`docs/specs.md > Partir una feature`) |
| muchas corridas del gate por feature | tandas más pequeñas, o un rojo recurrente que hay que mirar |

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

**`gate.siempre`.** El 2026-10-08, una feature pasó `./init.sh` en verde y el CI completo salió rojo por
tres `module-contract.test.ts`: recorren el árbol de código, no se llamaban `guard` y nadie los
corría en modo rápido. En el proyecto de origen del arnés, los cuatro patrones (`guard`, `module-contract`,
`route-contract`, `scope.test`) suman unos 13 s. Ampliarlo a todo lo que recorre el árbol subía el
rápido de ~35 s a ~145 s; por eso el resto solo **avisa**, y el número queda a la vista para la
revisión del perfil.

**Por qué el completo es un check de CI y no una disciplina.** La lección viene de dos PRs de un
proyecto con este arnés: se mergeó mirando el estado del PR —que era un build y **no corría
tests**— y entró un guard rojo en la rama de integración.

**Merge-base.** Contra el último commit, una tanda de tres commits solo mira el tercero.

**Disparadores, presupuesto y métricas (2026-11-07).** Medido en el proyecto de origen:
- el CI tardaba 13,4 min de media y el 41% de las corridas salía en rojo o cancelada;
- 4 de los 5 últimos rojos eran tests de esquema, de migración, de `scope` o de integración que el
  rápido no había seleccionado, porque no los relaciona ningún import;
- una corrida del rápido llegó a 978 s, porque el diff tocaba algo muy importado;
- nadie medía nada de esto: hubo que reconstruirlo a mano.

De ahí salen las tres piezas.

**Shards en CI.** En el proyecto de origen (2026-10-07) una corrida tardó 22 min, y 14,5 de ellos
fueron del proyecto `ui` (jsdom: importar módulos y montar el entorno, no los tests).
`isolate: false` daba 3–5× pero se descartó por fugas de estado entre archivos.
**Coste aceptado:** con 3 shards se facturan ~30 min por corrida frente a ~23 de un solo job, en el
plan Free (2000 min/mes); a cambio, el reloj del PR baja.

**Tests que nombran un archivo.** En servi_logistic (2026-11-13), SLT-141 cambió
`CierresBodegaSolicitadosLista.tsx`; `paginacion-transversal`, que lo lee como texto por su ruta
literal, no lo importaba ni se llamaba `guard*`. El rápido salió verde y el rojo apareció en
`gate-completo`. Buscar la ruta en el texto de los tests cuesta unos cientos de ms por corrida y
cubre ese caso sin que nadie declare nada.

## Tamaño del PR

`./init.sh` mide el diff de la feature de tu rama contra la rama de integración, con lo no
commiteado incluido (`scripts/tamano-pr.mjs`). Corre también en el CI.

- **Límites** en `arnes.config.json > gate.tamano_pr`: `max_archivos` (por defecto 40, tests
  incluidos), `max_lineas` de producción (por defecto 1000) y `max_lineas_tests` (por defecto
  3000), en líneas añadidas más borradas. Es test lo que casa con `gate.tamano_pr.tests` (por
  defecto `tests/**`, `e2e/**`, `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`; si el perfil lo
  define, sustituye a esos). No cuentan `specs/`, `progress/`, los lockfiles, los snapshots ni lo
  que añadas en `gate.tamano_pr.excluir`.
- **Al 80%, aviso:** cierra la rebanada actual o pide partir la feature.
- **Por encima, rojo:** la feature se parte (`docs/specs.md > Partir una feature`).
- **La única salida es humana y queda escrita:** con el sí del humano, el leader añade a
  `progress/features/<key>.md` la línea
  `<!-- tamano-pr-aceptado: AAAA-MM-DD · <motivo y frase del humano> -->`, y el rojo pasa a aviso.
  Típico: una migración mecánica o un renombrado que no se puede partir.

### Por qué

En el proyecto de origen (2026-11-07) los PRs de feature tocaban entre 50 y 160 archivos. Un PR así
falla más en CI, se revisa peor, choca con más compañeros y cuesta más de mergear. La regla vivía
como consejo y nadie la cumplía: ahora la mide el gate, y saltársela es una decisión humana
escrita.

En servi_logistic (2026-11-12/13), SLT-140 y SLT-141 pasaron el tope solo por sus tests (SLT-141:
933 líneas de producción y 2391 de tests y E2E), y cada vez hizo falta un OK escrito para un PR
cuyo código cabía de sobra. Probar bien no debe obligar a partir la feature ni a pedir permiso: el
código de producción sigue con su tope y los tests tienen el suyo.

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
