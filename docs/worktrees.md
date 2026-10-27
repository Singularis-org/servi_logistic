# Worktrees — un checkout por feature, montado y desmontado

Cada feature trabaja en su propio worktree. Se monta al tomar la feature (F1.0) y se desmonta
cuando el humano mergea el PR (F2.5). Las dos puntas las hace `scripts/wt.sh`: nadie crea ni
borra worktrees a mano, salvo el caso de huérfano descrito en
`## wt.sh done desregistra ANTES de borrar`.

### Por qué

Antes el arnés solo hablaba de ramas: `git checkout -b <branch> origin/dev` en un único
checkout. Los worktrees entraban por la puerta de atrás —los crea el harness para aislar
subagentes, o el humano cuando quiere dos features abiertas a la vez— y **ningún paso del
flujo los quitaba**. El ciclo documentado (`pending → spec_ready → in_progress → done`)
era solo estado lógico: cubría rama, PR y bitácora en markdown, y nada de desmontaje.

El coste no es teórico: está medido sobre un proyecto anterior que corría este mismo
arnés sin el paso de desmontaje. Al hacer por fin el inventario había **80 worktrees
registrados y 0 prunables** —todos con directorio vivo en disco— repartidos en cuatro
sitios que nadie llevaba juntos:

| Dónde | Cuántos | Quién los creaba |
|---|---|---|
| carpetas hermanas del repo | 57 | el humano, a mano |
| `C:/w125`, `C:/wbk`, `C:/wfix`… | 19 | el humano, para acortar rutas en Windows |
| `.claude/worktrees/agent-*` | 7 | el harness (`EnterWorktree`) |
| scratchpad de la sesión | 4 | el harness |

El más antiguo llevaba casi dos meses ahí. De los 80, **62 eran desmontables sin perder
nada** y 18 tenían trabajo real retenido — uno de ellos con 133 archivos sin commitear.
Es decir: el problema no era solo el disco, era que había trabajo sin guardar escondido
en carpetas que nadie miraba.

## Dónde viven

Dentro del repo, bajo `.worktrees/` (ignorado en `.gitignore`):

```
<repo>/                                <- worktree principal, siempre en la rama de integración
  feature_list.json, .arnes.local.json <- copia del board e identidad: una vez por máquina, aquí
  .worktrees/QC-8-paginacion/          <- feature/QC-8-paginacion
  .worktrees/QC-9-manejador-errores/   <- feature/QC-9-manejador-errores
```

- **Nadie hace `git checkout` en el worktree principal**: se queda en la rama de integración
  (`arnes.config.json > ramas.integracion`).
- **Lo que es de la máquina vive en la raíz del worktree principal**, no en cada worktree:
  `feature_list.json` y `.arnes.local.json`. El gate los busca ahí aunque corra dentro de un
  worktree de feature.
- **Cada worktree es una copia completa del árbol**, así que hay que excluirlo del toolchain o
  `lint`/`typecheck` empiezan a ver N copias de cada archivo. Está hecho en tres sitios, que son
  del proyecto y no los trae la plantilla del arnés; si montas el arnés en otro repo, rehazlo:
  - `.gitignore` → `/.worktrees/`
  - `eslint.config.mjs` → `".worktrees/**"` en `globalIgnores`
  - `tsconfig.json` → `.worktrees` en `exclude`

### Por qué

Dentro del repo y no como carpetas hermanas **a propósito**: así un solo `rm` del repo se lo
lleva todo y nunca aparecen huérfanas en el directorio padre, que es exactamente cómo se llegó a
las 57 carpetas hermanas del inventario de arriba.

## Los comandos

```bash
./scripts/wt.sh new QC-8 paginacion            # F1.0 — publica la rama (candado) y crea el worktree
./scripts/wt.sh --retomar new QC-8 paginacion  # tu rama, ya publicada desde otra máquina
./scripts/wt.sh done QC-8-paginacion           # F2.5 — lo desmonta si es seguro
./scripts/wt.sh list                           # inventario con veredicto por worktree
./scripts/wt.sh clean                          # dry-run: qué se podría desmontar
./scripts/wt.sh clean --force                  # lo ejecuta
```

| Opción | Para qué |
|---|---|
| `--retomar` | solo `new`: monta el worktree desde `origin/<rama>`. Para **tu** feature, tomada desde otra máquina o soltada por otra persona y reasignada a ti en el tracker. |
| `--sin-publicar` | solo `new`: no publica la rama, así que **no hay candado**. Solo si trabajas sin equipo o sin red. |
| `--assume-merged` | solo `done`: salta la guarda de merge (caso squash, abajo) y mantiene las otras tres. |
| `--base <ref>` | ref contra la que se mide "mergeado" (por defecto se autodetecta `origin/dev`). |
| `-C <repo>` | opera sobre otro repo (`-C ../otro-repo`). |

| Código de salida | Significa |
|---|---|
| `new` → **4 (`TOMADA`)** | la rama ya existe en `origin`: otra persona tomó la feature. Suelta el assignee y elige otra. |
| `done` → **3 (`HOLD`)** | alguna guarda saltó y no se borró nada (`## Qué hacer con un HOLD`). |
| 1 | error (sin red al publicar, sin ref base, etc.). |

`new` es idempotente: si el worktree ya existe lo reporta y sale bien, así que reanudar
una sesión a medias no rompe nada.

## El candado: la rama se publica al nacer

`wt.sh new` crea la rama con un commit propio («feature tomada por …») y la publica **antes** de
crear el worktree, con `git push --force-with-lease=refs/heads/<rama>:`. El lease vacío exige que
la rama **no exista** en el remoto, y el servidor lo comprueba de forma atómica: de dos personas
que toman la misma feature a la vez, solo una gana; la otra recibe el código 4.

Es la mitad atómica del candado. La mitad visible es el assignee del tracker, que el leader pone
**antes** de llamar a `wt.sh new`. El orden completo (releer, asignar, releer, publicar) y qué
hacer al soltar una feature: `docs/equipo.md > Tomar una feature` y
`docs/equipo.md > Soltar una feature`.

### Por qué

Ni siquiera el lease basta si dos personas publican el **mismo** commit de la rama de
integración: git ve "Everything up-to-date", no actualiza nada, no evalúa el lease y sale en verde
para las dos. Por eso la rama nace con un commit vacío propio, de sha único, que de paso deja
escrito quién la tomó y cuándo.

## Las cuatro guardas

`done` y `clean` no borran nada sin pasar por estas cuatro. Cualquiera que salte deja el
worktree en pie con el veredicto `HOLD` y su razón:

1. **Es el worktree principal.** Nunca se toca, pase lo que pase.
2. **Está bloqueado** con `git worktree lock`. Alguien lo protegió a propósito.
3. **Tiene cambios sin commitear** (`git status --porcelain` no vacío).
4. **Su rama no está integrada en la base.** Se comprueba con `merge-base --is-ancestor`
   y, si falla, con `git cherry` (que cubre rebase y cherry-pick: los sha cambian pero
   los parches ya están arriba).

Un worktree cuyo directorio ya no existe se marca `SAFE`: no hay nada que perder, solo
queda el registro y lo limpia `git worktree prune`.

La regla que ordena todo esto: **ante la duda, no se borra**.

### Por qué

El coste de dejar un worktree de más es disco; el de borrar uno con trabajo sin guardar es
trabajo perdido. No son comparables, así que las guardas son deliberadamente pesimistas. La
guarda 3 es la que habría salvado los 133 archivos sin commitear del inventario de arriba.

## Qué hacer con un HOLD

`done` devuelve código 3 y no borra nada. Eso **no bloquea el cierre de la feature**: la feature
pasa a `done` igual, y el worktree retenido se anota en `progress/deudas.md` con la razón que dio
el script. Lo único que no vale es dejarlo ahí en silencio — que es precisamente cómo se llega a
80.

Luego, según la razón:

- **sucio** → entra al worktree, mira qué hay y decide: commitear, descartar o dejarlo.
- **no mergeada** → o el PR no se mergeó todavía, o se mergeó con **squash**. GitHub
  reescribe los commits al hacer squash, así que la rama nunca figura como ancestro de
  la rama de integración aunque su contenido sí esté. Para ese caso:
  `./scripts/wt.sh done QC-8-paginacion --assume-merged`, que salta **solo** la guarda 4 y
  mantiene las otras tres.
- **bloqueado** → `git worktree unlock <path>` si ya no hace falta la protección.

## El gate

- **Se corre dentro del worktree de la feature**: `./init.sh` (rápido por defecto) al cerrar
  cada tanda y antes del PR. La suite completa corre en CI (`docs/gate.md`).
- **Deja el entorno al día antes de mirar nada**: regenera el cliente de Prisma y los tipos de
  ruta de Next, y reinstala si cambió el lock. Un worktree recién montado no trae ninguna de las
  tres cosas, y sus errores no nombran su causa. Detalle y síntomas:
  `docs/verification.md > El gate regenera los artefactos antes de mirar nada`.
- **Un `node_modules` enlazado no se reinstala nunca.** Si el worktree comparte el
  `node_modules` del checkout principal (un enlace o junction), `./init.sh` no corre
  `pnpm install`: solo avisa si el lock es más nuevo. Las dependencias se instalan en el
  checkout principal. Reinstalar desde el worktree borraría el `node_modules` de todos.
- **Lo que sigue siendo tuyo:** aplicar a **tu** base las migraciones que traiga un merge con la
  rama de integración (F2.3).
- **Cuenta los worktrees registrados** y avisa si hay más de 5 además del principal, o si alguno
  quedó con el directorio borrado. Es `warn`, **no `fail`**.

### Por qué

Un gate rojo por tareas domésticas bloquearía trabajo real y la respuesta previsible sería
ignorar el gate, que es justo lo que la regla 5 de `CLAUDE.md` intenta evitar. Pero tampoco puede
ser invisible: lo que no sale en `./init.sh` no existe, y así fue como se llegó a 80 sin que
nadie se enterara.

El enlace de `node_modules`: el 2026-10-21, en servi_logistic, `./init.sh` en un worktree recién
creado vio el lockfile «más nuevo» que el enlace (lo era: acababa de salir del checkout) y lanzó
`pnpm install`, que ofreció borrar y reinstalar el `node_modules` compartido y, sin terminal, se
contestó que sí. Tres corridas seguidas; ninguna llegó a romperlo, pero otra ficha lo estaba usando.

## El validador mira el repo entero, no el worktree

`scripts/validate-features.mjs` resuelve la **raíz del repo** (el worktree principal) aunque
corra dentro de un worktree de feature, y si no puede localizarla **falla**. Desde ahí lee:

- `feature_list.json` y `.arnes.local.json`, que solo existen en la raíz;
- `specs/` de la raíz y `.worktrees/*/specs`, para ver los specs de todas las features en vuelo.

`arnes.config.json`, que sí se versiona, lo lee del directorio actual.

### Por qué

Antes resolvía `specs/` contra el directorio actual, y como el gate se corre **dentro** del
worktree de la feature, desde ahí `.worktrees/` no existe: solo se veía el `specs/` de la propia
rama. Cualquier otra feature en vuelo daba «faltan specs para features sdd en vuelo», con sus
specs sanos en disco a un directorio de distancia, y el gate abortaba **sin llegar a mirar
código**. Como el gate era obligatorio antes de cada PR, eso bloqueaba el F2.4 de **todas** las
features a la vez, no solo el de la que lo sufría.

Pasó tres veces antes de arreglarse (2026-09-08): dos en QC-74 —anotadas en el registro de
sesión de entonces como «sigue sin resolverse»— y la tercera en QC-76, con QC-45 y QC-75 en
vuelo.

## wt.sh done desregistra ANTES de borrar

`wt.sh done` **quita el registro** del worktree en git y después **borra el directorio**. Si el
borrado falla (en Windows basta con que un proceso tenga abierto algo bajo `node_modules`), queda
un **huérfano**:

- git ya **no** conoce el worktree: no sale en `git worktree list` y `git worktree prune` no lo ve;
- el directorio **sigue en disco**, a medias, con `node_modules` y parte del árbol;
- ninguna corrida futura de `wt.sh` lo va a reintentar.

**Cómo se reconoce:** el directorio existe bajo `.worktrees/`, **no** aparece en
`git worktree list`, y dentro **no hay `.git`**.

**Qué hacer mientras no se arregle.** Es la única excepción a «nadie borra worktrees a mano»:
1. Comprueba que no hay nada que perder: la rama figura en `git branch --merged dev`, el PR está
   mergeado y el árbol estaba limpio.
2. Solo entonces borra a mano el directorio y la rama. **Ante la duda, no borres.**
3. Anótalo en `progress/deudas.md` con lo comprobado.

**La salida limpia** es invertir el orden —borrar primero y desregistrar solo si el borrado tuvo
éxito—, de modo que un fallo deje el worktree **entero y registrado**, que es un estado del que
`wt.sh` sí sabe salir. Tiene ficha propia en el board y deuda abierta en `progress/deudas.md`.

### Por qué

A 2026-09-18 iban **ocho** worktrees «a medio borrar», y los ocho se anotaron como «¿archivo en
uso en Windows?», que es el aviso que imprime el script. Ese aviso describe el síntoma y esconde
la causa. No es mala suerte repetida ocho veces: es que el orden de las dos operaciones convierte
un fallo transitorio en basura definitiva, el peor de los dos estados posibles.
