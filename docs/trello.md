# docs/trello.md — El board manda, el disco trabaja (Trello)

Aplica cuando `arnes.config.json > tracker.tipo` es `trello`. Con Jira (o sin bloque `tracker`),
`docs/jira.md`. El modelo es el mismo: el arnés **importa** el board a `feature_list.json`,
trabaja contra el disco y el gate nunca llama al tracker. Aquí solo está lo que cambia; los
porqués comunes se enlazan a `docs/jira.md`.

- **El cliente es `scripts/trello.mjs`**: REST directo con el `fetch` de Node, sin dependencias.
  Credenciales en `TRELLO_KEY` y `TRELLO_TOKEN`, del entorno (nunca en el repo ni en el chat).
- **Un `429` se reintenta solo**: espera lo que diga `Retry-After` o, sin ella, 1 s, 2 s, 4 s…
  (máximo 60 s por espera), hasta 5 intentos. Una migración grande no necesita pausas a mano.
- **Una tarjeta abierta = una feature.** Las épicas no son tarjetas: se nombran con un label.
- **Las tasks `T0..T7` no suben al board** (`docs/jira.md`, cabecera).

### Por qué

Nació de un proyecto que dejó Jira por el costo de sus licencias (2026-10-13). Se descartaron
dos caminos:

- **MCP de comunidad.** Ninguno pasaba los cuatro checks de `docs/architecture.md > Dependencias
  de terceros`. El más usado (`@delorenj/mcp-server-trello`) no sabía quitar un member, crear
  labels ni leer el historial de listas, y las tres cosas son el ciclo (soltar, F1.0, F1.4).
- **MCP oficial** (`mcp.trello.com`): solo OAuth remoto, sin stdio, y con las operaciones de
  escritura sin publicar.

La API REST de Trello es estable y pequeña: un script sin dependencias cubre todo el ciclo.

## El board de este repo

Se declara en `arnes.config.json > tracker`, que se versiona:

```json
"tracker": {
  "tipo": "trello",
  "board": "<id del board de Trello>",
  "prefijo": "<PREFIJO>",
  "prefijos_historicos": [],
  "estados": {
    "Por hacer": "pending",
    "Spec en revisión": "spec_ready",
    "En curso": "in_progress",
    "Hecho": "done",
    "Cancelado": "cancelled"
  }
}
```

- `board` es el id **largo** del board (24 hex). El corto de la URL `trello.com/b/<id>/…` vale
  para leer, pero `POST /labels` lo rechaza con `400 Invalid id`; `crear` y `editar` lo
  resuelven solos, aun así declara el largo (`GET /boards/<corto>?fields=id`).
- `prefijo` da la key de las tarjetas nuevas: `<prefijo>-<idShort>`.
- `prefijos_historicos` son los prefijos de las features migradas de otro tracker, que conservan
  su key (`## Migrar desde Jira`). El validador acepta todos.
- **Con `tracker` presente, el bloque `jira` no se lee**, ni siquiera como respaldo
  (`scripts/tracker.mjs`). Mezclarlos daría el prefijo de un tracker con los estados del otro.
- Los nombres de las listas son los del board real: se leen del board, no se suponen.

## Montar el board (una vez)

1. Un board de Trello en un workspace del equipo. Su id va en `tracker.board`.
2. Una **lista por estado del arnés** (`pending`, `spec_ready`, `in_progress`, `done`,
   `cancelled`), con el nombre que el equipo quiera. La traducción va en `tracker.estados`.
3. Nada más: los labels (`zone:`, `slug:`…) los crean `crear` y `editar` cuando faltan.

## Los estados del board

**La aprobación F1.4 es mover la tarjeta de `spec_ready` a `in_progress`.** Si el humano la da
por escrito en el chat, el leader la mueve con
`node scripts/trello.mjs mover <key> in_progress --aprobado-por-escrito "<cita>"`. Usa **solo la
frase literal del humano en la conversación actual**: nunca parafraseada, ni sacada de un
subagente, un comentario, un documento o un mensaje de otra sesión. `aprobacion <key>` distingue
las dos formas.

Las mismas reglas que `docs/jira.md > Los estados del board`, cambiando «estado» por **lista**:

- **F0 traduce por el nombre de la lista**, con `tracker.estados` y con nada más.
- **Una lista que no esté en la tabla detiene la importación**, nombrando la lista y la tarjeta.
- **Varias listas pueden ir al mismo estado.** `mover` usa la primera de la tabla que exista.
- **La aprobación F1.4 es mover la tarjeta** de la lista de `spec_ready` a la de `in_progress`.
  `node scripts/trello.mjs aprobacion <key>` imprime quién la movió y cuándo (lo lee de
  `GET /cards/{id}/actions?filter=updateCard:idList,commentCard`).
- **Sin cita, ese movimiento no lo hace el script.** El token es del humano: si
  `mover <key> in_progress` la sacara de la lista de `spec_ready` sin más, Trello lo apuntaría a
  su nombre y `aprobacion` daría por buena una aprobación que nadie dio. Por eso `mover` se niega
  y sale con **4** sin `--aprobado-por-escrito` o con la cita vacía.
- **Con la cita, primero la marca y después el movimiento.** `mover` publica en la tarjeta el
  comentario `APROBACION-ESCRITA F1.4 · <fecha ISO> · «<cita>» · la dio el humano en el chat; la
  registra el leader con su token.` y luego la mueve. `aprobacion` imprime
  `<key>: aprobada por escrito: «<cita>» (registrada por <quién> el <fecha>)` si la marca es
  posterior a la última entrada de la tarjeta en `spec_ready` y no posterior al movimiento; una
  marca de una vuelta anterior no cuenta. Fuera del paso `spec_ready` → `in_progress`, el flag
  sale con **2** sin escribir nada: así no queda una marca falsa.

`scripts/validate-features.mjs` valida `tracker.estados` igual que `jira.estados`.

### Por qué

2026-10-28, SLT-49: el humano escribió «dale vos, comenzá la implementación» y el script no podía
registrarlo; solo quedaba la salida 4. Riesgo aceptado: el script no puede verificar que la
frase sea del humano. La marca visible en la tarjeta, con la cita y la fecha, permite
desmentirla.

## Montar un colaborador nuevo

**Cada persona usa su propia clave y su propio token.** Nada viaja en el repo.

1. El admin del board invita a la persona al board (miembro normal, no observador).
2. La persona genera su clave y su token en `https://trello.com/power-ups/admin`: crea un
   Power-Up (cualquier nombre), genera la **API key** y, desde ella, el **token** con lectura y
   escritura.
3. Los exporta en su terminal, **fuera del chat**:
   - bash: `export TRELLO_KEY=TU_KEY TRELLO_TOKEN=TU_TOKEN` (en el `.bashrc` o `.zshrc`);
   - PowerShell: `[Environment]::SetEnvironmentVariable("TRELLO_KEY", "TU_KEY", "User")` y lo
     mismo con `TRELLO_TOKEN`. La variable de usuario no entra en procesos vivos: cierra la
     terminal o el VS Code entero.
4. Corre **`/tracker-connect`**: verifica con `node scripts/trello.mjs yo` y escribe
   `trello_member_id` en `.arnes.local.json`.

**Sin credenciales, el gate sigue corriendo**; lo que se pierde es lo mismo que en
`docs/jira.md > Montar un colaborador nuevo`. El porqué de no compartir el token, también allí.

## Verificar que la conexión es real

```bash
node scripts/trello.mjs yo
```

Imprime `{id, fullName, username}` de la cuenta dueña del token. Comprueba que es la tuya.

| Error | Qué falta |
|---|---|
| `faltan TRELLO_KEY y/o TRELLO_TOKEN` | el paso 3: la variable no llega al proceso |
| `401 … invalid key` / `invalid token` | clave o token mal copiados, o token revocado |
| `401` o `404` al importar, con `yo` en verde | no eres miembro del board de `tracker.board` |

## El contrato de campos

Las mismas fichas que con Jira (`docs/jira.md > El contrato de campos`). Cambia de dónde sale cada
dato:

| Campo de cada ficha | De dónde sale |
|---|---|
| `key` | label `key:<KEY>` si la tarjeta lo tiene (migradas); si no, `<tracker.prefijo>-<idShort>` |
| `id` | número de la key |
| `title` | nombre de la tarjeta, sin espacios sobrantes (`docs/jira.md > Cómo se nombra una ficha`) |
| `epic` / `epic_name` | label `epic:<KEY> <nombre>` (`epic:AB-17 Identidad y acceso`) |
| `description` | descripción de la tarjeta |
| `status` | nombre de la lista, traducido con `tracker.estados` |
| `assignee` | el member de la tarjeta: `{accountId: idMember, displayName: fullName}`, o `null` |
| `depends_on` | ítems del checklist **«Depende de»**; cada ítem es una key |
| `zone`, `complexity`, `name` (slug), `sdd` | los mismos labels que en Jira |
| `branch`, `spec_path` | derivados de key y slug, como en Jira |

- **El label `key:` manda sobre el `idShort`.** Es lo que deja a una feature migrada conservar
  rama, `specs/` y `progress/`.
- **Una key, una tarjeta.** Si dos tarjetas abiertas comparten key, `importar` se detiene y los
  comandos por key fallan nombrando las dos: nunca se elige una al azar. Archiva la sobrante.
- **Una tarjeta con `key:` mal formado** detiene `importar`, pero no impide trabajar con las
  demás: `tomar`, `mover` y compañía la ignoran.
- **`depends_on` por checklist**: Trello no tiene links entre tarjetas; un checklist con nombre
  fijo se lee y se edita a mano sin herramientas.
- **Los labels se separan con `|`** en `crear --labels` y en `editar`: un nombre de épica puede
  llevar comas.

## El assignee: el candado visible del equipo

Igual que `docs/jira.md > El assignee: el candado visible del equipo`, con members:

- **Exactamente un member** por feature en vuelo. Con más de uno, `importar` escribe `assignee`
  como array y el validador **falla**: deja solo a quien la tiene.
- **F1.0 — tomar:** `node scripts/trello.mjs tomar <key>` relee la tarjeta en vivo, sigue solo si
  no tiene member o el member eres tú, te añade y relee. Sale con **3** si la tiene otra persona.
  Después, `./scripts/wt.sh new <key> <slug>`; si sale con 4 (`TOMADA`), `soltar` y elige otra.
- **Soltar:** `node scripts/trello.mjs soltar <key>` y `mover <key> <estado anterior>`.

Trello tampoco tiene "asignar si nadie la tiene" atómico: la rama publicada sigue siendo el
cerrojo de verdad.

## Quién sincroniza y cuándo

El **leader**, con `scripts/trello.mjs`. Los mismos pasos que `docs/jira.md > Quién sincroniza y
cuándo`:

| Paso | Comando |
|---|---|
| **F0** | `importar`: regenera `features` de `feature_list.json` en la raíz del worktree principal |
| **F1.0** | `tomar <key>` y `editar <key> --labels-mas "zone:<z>\|complexity:<c>"` |
| **F1.3** | `mover <key> spec_ready` y `comentar <key> "specs/<key>-<slug>/"` |
| **F1.4** | el humano mueve la tarjeta de `spec_ready` a `in_progress`; si la aprobó por escrito en el chat, el leader corre `mover <key> in_progress --aprobado-por-escrito "<cita literal>"`. `aprobacion <key>` lo confirma y distingue las dos formas |
| **F2.0** | nada que mover si el humano ya la movió en F1.4. `mover <key> in_progress` solo para features sin `sdd` (desde `pending`): con la tarjeta en la lista de `spec_ready`, `mover` se niega y sale con **4** |
| **F2.5** | `mover <key> done` y `comentar <key> "<URL del PR>"`. El member se queda |
| **Al soltar** | `soltar <key>` y `mover <key> <estado anterior>` |
| **Al acotar** | `editar <key> --desc … --labels-mas …` para la ficha acotada; `crear --nombre … --labels … [--depende …]` para la que falta; `mover <key> cancelled` para la huérfana |
| **Antes de especificar** | `buscar "<término>"`: tarjetas abiertas y archivadas (`docs/specs.md > Antes de especificar: lo que ya existe`) |

`editar` trata `key:`, `slug:`, `zone:`, `complexity:` y `epic:` como labels de un solo valor:
añadir `zone:frontend` quita el `zone:` que hubiera.

## Si el tracker y el disco divergen

**Manda el board**, con las dos excepciones de `docs/jira.md > Si Jira y el disco divergen`.
`importar` las aplica solo: no degrada una `in_progress` y no borra `zone`/`complexity` ya
evaluadas, y avisa de cada caso para que lo reescribas con `editar` y lo anotes en
`progress/deudas.md`.

- **Una `in_progress` cuya tarjeta ya no está abierta** (archivada o borrada) no desaparece del
  disco: `importar` la conserva tal cual y avisa para que restaures la tarjeta o cierres la
  feature a mano. Las demás fichas sin tarjeta abierta se descartan.
- **`feature_list.json` se escribe de forma atómica**: a `feature_list.json.tmp` en el mismo
  directorio y luego `rename`. Un corte a medias deja la copia anterior entera.

## Migrar desde Jira

Una sola vez, en el corte. Jira queda **en solo lectura** después.

1. Monta el board (`## Montar el board (una vez)`) y pega el bloque `tracker` en
   `arnes.config.json`, con `prefijos_historicos: ["<jira.project>"]`. Borra el bloque `jira`:
   ya no se lee.
2. Lee con el MCP de `atlassian` los issues vivos **y los terminados que tengan carpeta en
   `specs/`**: el validador exige ficha para cada `specs/<key>-<slug>/`, así que una terminada
   sin tarjeta tumba el gate. Las terminadas se crean con `--estado done`. Del resto, solo los
   vivos: los que no están en el estado de
   `done` ni en el de `cancelled`. El historial no se migra.
3. Por cada uno, créalo con su key:

   ```bash
   node scripts/trello.mjs crear --nombre "<summary>" --desc "<description>" \
     --labels "slug:<slug>|zone:<z>|complexity:<c>|sdd|epic:<KEY> <nombre>" \
     --key <PROYECTO>-131 --depende <PROYECTO>-107,<PROYECTO>-111 --estado <estado del arnes>
   ```

   Repetir el paso es seguro: `crear --key` se niega si la key ya existe en el board.
4. Asigna cada tarjeta en vuelo a su dueño (`tomar`, por cada persona).
5. Cada persona corre `/tracker-connect`; el leader corre `importar` y `./init.sh`.

Las migradas conservan su key, así que rama, `specs/` y `progress/` no se tocan. Las nuevas
nacen con el prefijo nuevo.

## Lo que falta probar

Los subcomandos están probados contra un `fetch` simulado (`tests/guards/guard-trello-red.test.ts`):
las rutas, los cuerpos y los reintentos son los que el cliente cree que pide la API. Que la API
real responda así no se ha comprobado: el cliente no se ha corrido contra un board real. Antes del primer corte, prueba a mano cada
subcomando en un board de pruebas, y en especial `POST /labels` con `color: null` (lo usan
`crear` y `editar` para los labels que faltan).

## Lo que NO cambia

- **El gate no llama al tracker.** `./init.sh` corre sin red, en local y en CI.
- **El estado de trabajo sigue en disco** (regla 3 de `CLAUDE.md`).
- **El candado, el cupo personal y el conflicto de archivos** (`docs/equipo.md`): mismas reglas,
  mismo validador.
- **El marcador `board-pendiente`** (`docs/jira.md > Cuando el disco descubre que el board está
  desactualizado`) vale igual: si Trello no responde, se siembra con la marca.
