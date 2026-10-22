# docs/jira.md — El board manda, el disco trabaja

Las features se gestionan desde un board de Jira. El arnés **importa** ese board a
`feature_list.json` y trabaja contra el disco; el gate nunca llama a Jira.

- **`feature_list.json` es una copia local del board.** Vive en la raíz del worktree principal,
  **no se versiona** (`.gitignore`) y F0 la regenera entera. Contiene solo `features`. No se lee
  entera: se consulta por `key`/`status`/`assignee` (`docs/lectura.md`).
- **El board al que pertenece el repo** se declara en `arnes.config.json > jira` (`site`,
  `project`), que sí se versiona.
- **Un issue que no es épica = una feature.** F0 importa con
  `project = <jira.project> AND issuetype != Epic` (`AGENTS.md > F0`); las fichas se crean de
  tipo `Tarea`. Las **épicas agrupan features por módulo y no son features**: una épica que
  aparezca en `feature_list.json` es un bug de importación, no una ficha.
- **Las tasks `T0..T7` no suben a Jira.** Las genera el `spec_author`, cambian durante la
  implementación y viven en `specs/<key>-<slug>/tasks.md`.

### Por qué

Sincronizar las tasks sería ruido constante en un board que nadie leería. Y `feature_list.json`
dejó de versionarse en el arnés v2: con varias personas, cada F0 reescribía el archivo entero en
cada sesión y era una fuente de conflictos de merge constantes en `dev` (`docs/equipo.md > Qué
estado es de quién`).

## El board de este repo

Sitio y proyecto se leen de `arnes.config.json > jira`. No se escriben en `.mcp.json` ni en
ningún otro sitio: el Rovo MCP resuelve el sitio desde el propio token, y `jira.project` es lo
único que dice qué proyecto importar en F0 si el sitio tiene más de uno. Para saber cuál es el
board de este repo, abre `arnes.config.json`: este documento es del arnés y no lo repite.

## Montar el board (una vez)

1. Sitio Jira Cloud (plan Free llega). Como creador quedas **admin de la organización**,
   que es lo que habilita el token de API.
2. Proyecto **Kanban** gestionado por el equipo. Su clave es la que se declara en
   `arnes.config.json > jira.project`.
3. Un estado del board por cada estado del arnés (`pending`, `spec_ready`, `in_progress`,
   `done`, `cancelled`), con el nombre que el proyecto ya use. La traducción se declara en
   `arnes.config.json > jira.estados` (`## Los estados del board`).

4. Habilitar el token: **Atlassian Administration → Rovo → Rovo MCP server →
   Authentication**, activando el acceso vía API token (viene apagado).
5. Crear el token en `id.atlassian.com/manage-profile/security/api-tokens` con
   **Create API token with scopes**, eligiendo la app **"Rovo MCP"** y marcando los
   scopes de Jira read/write.

   ⚠️ La app importa. Con **"Rovo MCP v2"** —aun marcando *todos* los scopes— el servidor
   autentica pero solo expone cinco herramientas (identidad y Teamwork Graph): **ninguna
   de Jira**. Con "Rovo MCP" aparecen `searchJiraIssuesUsingJql`, `editJiraIssue`,
   `transitionJiraIssue`, `createIssueLink` y el resto del set.

   ⚠️ Hay dos botones y solo uno sirve. *Create API token* a secas genera un token
   **legacy sin scopes**: la credencial autentica —la API REST responde 200— pero el MCP
   la rechaza con `403: Teamwork Graph tools require a modern API token`. El síntoma es
   engañoso, porque el servidor conecta igual y expone tres herramientas de Teamwork
   Graph; simplemente no aparece ninguna de Jira.

6. Exportar en el entorno (nunca en el repo):

   ```bash
   export ATLASSIAN_MCP_AUTH=$(printf '%s' "<tu-email>@example.com:TU_TOKEN" | base64 -w0)
   ```

   ```powershell
   # Windows. El email es el de la cuenta ATLASSIAN dueña del token, no el de git.
   [Environment]::SetEnvironmentVariable("ATLASSIAN_MCP_AUTH", `
     [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("<tu-email>@example.com:TU_TOKEN")), "User")
   ```

   En Windows, una variable de usuario nueva **no entra en procesos ya vivos ni en sus
   hijos**: hay que cerrar la terminal (o el VS Code) que lanza Claude Code, no solo
   Claude Code. Verificar con `$env:ATLASSIAN_MCP_AUTH.Length` en la terminal nueva
   *antes* de arrancar.

`.mcp.json` ya declara el servidor `atlassian` apuntando a `https://mcp.atlassian.com/v1/mcp`
con `Authorization: Basic ${ATLASSIAN_MCP_AUTH}`.

- **Token de API, no OAuth.** `Basic` es el camino headless y estable; OAuth emite tokens de
  vida corta que Claude Code no renueva y la conexión se cae a media sesión.
- **No usar el endpoint legacy `/v1/sse`**: dejó de soportarse el 30-jun-2026.
- **`/v1/mcp/authv2` no es "el endpoint de OAuth".** El README oficial lo da como recomendado y
  acepta API token igual que `/v1/mcp`. El endpoint es indiferente: **lo que decide es la app del
  token** (paso 5).

### Por qué

Las dos trampas del paso 5 están verificadas en este repo. Se probaron `/v1/mcp` y
`/v1/mcp/authv2` con la misma credencial y devuelven el mismo conjunto de herramientas. Una
versión previa de este documento afirmaba que `authv2` era solo para OAuth; era falso.

## Los estados del board

Los nombres de los estados son **de cada proyecto**: Jira los traduce, cada plantilla de
proyecto trae los suyos y cualquiera los renombra. Por eso el arnés no los da por supuestos: se
declaran en `arnes.config.json > jira.estados`, que es perfil y se versiona. Es una tabla
**nombre del estado en Jira → estado del arnés**:

```json
"jira": {
  "project": "XX",
  "estados": {
    "<nombre en Jira>": "pending",
    "<nombre en Jira>": "spec_ready",
    "<nombre en Jira>": "in_progress",
    "<nombre en Jira>": "done",
    "<nombre en Jira>": "cancelled"
  }
}
```

- **F0 traduce por el nombre del estado**, con esta tabla y con nada más. Ni por la posición de
  la columna ni por la categoría de Jira (*To Do* / *In Progress* / *Done*), que no distingue
  `spec_ready` de `in_progress` ni `done` de `cancelled`.
- **Un estado que no esté en la tabla detiene F0**, con un mensaje que nombre el estado y el
  issue. Nunca se adivina: se añade la fila a `jira.estados` (con el humano) y se repite F0.
- **Varios nombres pueden ir al mismo estado del arnés** (un *Bloqueado* que cuente como
  `in_progress`, por ejemplo). Lo que no vale es un valor fuera de los cinco.
- **La puerta de aprobación humana F1.4 es la transición** del estado de `spec_ready` al de
  `in_progress`: aprobar es mover la tarjeta, con autor y fecha.
- En el resto de los docs del arnés los estados se nombran **por su papel**: «el estado de
  `spec_ready`» es el nombre que `jira.estados` le asigne en este proyecto.

`scripts/validate-features.mjs` lo hace cumplir sin red: falla si un valor de `jira.estados`
no es uno de los cinco, o si una ficha de `feature_list.json` trae un `status` fuera de ellos;
avisa si a alguno de los cinco no le corresponde ningún nombre.

### Por qué

- **2026-10-08, F0 de QC.** Este documento decía que el board tenía cinco columnas —*Backlog*,
  *Spec en revisión*, *En curso*, *Hecho*, *Cancelado*— que mapeaban 1:1 a los estados del
  arnés. El board real, verificado por API, tenía *Por hacer*, *En revisión*, *En curso*,
  *Finalizado* y *Cancelado*: F0 encontró tres estados sin traducción y no tenía regla para
  ellos. Un nombre fijo en un doc del arnés es un supuesto sobre el proyecto, y los supuestos
  sobre el proyecto viven en el perfil.

## Montar un colaborador nuevo

La sección anterior está escrita desde quien creó el sitio. Esta es la otra mitad: **qué
pasa cuando alguien clona el repo**.

**Cada persona se autentica con su propio token.** Nada de la credencial viaja en el repo:
`.mcp.json` declara `Authorization: Basic ${ATLASSIAN_MCP_AUTH}` y nada más. No se comparte el
token de quien montó el board.

**Lo que hace el admin de la organización:** solo agregar a la persona al proyecto de
`arnes.config.json > jira.project` con permiso de escritura (*Member*, no *Viewer*). Tiene que
poder editar issues, asignárselos y transicionarlos. El paso 4 de la sección anterior es a nivel
organización y ya está hecho: **no se repite por persona.**

**Lo que hace el colaborador:** correr **`/jira-connect`** dentro del repo. El comando:
- detecta si ya hay conexión y guía los pasos que falten, uno a uno;
- verifica llamando a una herramienta de Jira de verdad y lista los proyectos accesibles,
  diciendo si el de `jira.project` está entre ellos;
- escribe su identidad en `.arnes.local.json` (`docs/equipo.md > Quién soy`), que el validador
  usa para contar el cupo personal.

Lo que el comando automatiza sigue valiendo a mano: los pasos 5 y 6 de la sección anterior con
**su** cuenta (las dos trampas del paso 5 siguen valiendo) y **su** email de Atlassian —no el del
dueño del board, no el de git—. Después, `## Verificar que la conexión es real`.

**Sin token, el gate sigue corriendo, pero no se trabaja el board.** `./init.sh` corre sin red
(regla 3 de `CLAUDE.md`); sin `feature_list.json`, el validador sale en verde con la nota «sin
copia local del board». Lo que se pierde es F0, el candado de F1.0 (que relee y asigna en vivo)
y los empujones hacia Jira, incluida la aprobación por tarjeta de F1.4, que vuelve a ser un
"aprobado" escrito.

### Por qué

El token hereda los permisos de su dueño en Jira. Uno compartido haría que todos los empujones
del ciclo —assignee y labels en F1.0, comentarios en F1.3 y F2.5, transiciones— aparecieran
firmados por la misma cuenta, que es justo la autoría que la transición del estado de `spec_ready`
al de `in_progress` existe para registrar, y el assignee dejaría de distinguir quién tiene cada feature. Si alguien entra
como lectora, el arnés no falla al importar en F0 sino más tarde, al asignar, escribir labels o
mover la tarjeta.

## Verificar que la conexión es real

`/mcp` en verde no basta: el servidor conecta sin credencial y expone igual las tres
herramientas de Teamwork Graph. **El indicador fiable es que aparezcan herramientas de
Jira** (buscar por JQL, editar issue, transicionar). Si solo hay tres, no hay conexión
útil por mucho que el color diga lo contrario.

Los errores distinguen bien en qué paso estás:

| Error | Qué falta |
|---|---|
| `You don't have permission to connect via API token` | el paso 4: Rovo sin habilitar en la organización |
| `401 ... 'bearer' prefix missing` | la variable no llega al proceso, o el par `email:token` es incorrecto |
| `403 ... require a modern API token` | el paso 5: token legacy, sin scopes |

Para aislar si el problema es la credencial o el MCP, la API REST responde directo:

```powershell
Invoke-WebRequest "https://TU-SITIO.atlassian.net/rest/api/3/myself" `
  -Headers @{ Authorization = "Basic $env:ATLASSIAN_MCP_AUTH" } -UseBasicParsing
```

Un 200 con tu cuenta significa que la credencial es buena y el problema está más arriba.

## El contrato de campos

Cada dato tiene **un solo sitio donde se escribe**. Eso es lo que evita que "Jira manda"
degenere en dos verdades peleadas.

`feature_list.json` es `{ "features": [ … ] }`. Sitio y proyecto **no** van en este archivo:
están en `arnes.config.json > jira` (`## El board al que pertenece el disco`).

| Campo de cada ficha | De dónde sale |
|---|---|
| `key` | el issue key tal cual: `QC-7`. **Es la identidad de la feature.** |
| `title` | summary del issue tal cual. **Se almacena**: el gate corre sin red, y es lo que el humano reconoce (`## Cómo se nombra una ficha`). |
| `id` | número del key (`QC-7` → `7`). **Solo fallback** para fichas que aún no tienen issue. |
| `epic` | key de la épica padre (campo `parent` del issue). Agrupa por módulo; **no** es dependencia. |
| `epic_name` | summary de esa épica (`QC-17` → «Identidad y acceso»). **Se almacena, no se deriva**: el gate corre sin red y no puede resolver un key contra Jira. |
| `description` | campo Description del issue. Lo **decide** siempre el humano; lo **escribe** él en el board, o `/afinar-feature` en su nombre tras un sí explícito (`## Cuando el disco descubre que el board está desactualizado`). |
| `status` | el nombre del estado del issue, traducido con `arnes.config.json > jira.estados` (`## Los estados del board`). Un nombre que no esté en la tabla detiene F0. |
| `assignee` | campo Assignee del issue: `{ "accountId": "…", "displayName": "…" }`, o `null` si no tiene. Es el candado visible del equipo (`## El assignee: el candado visible del equipo`). |
| `depends_on` | issue links **"is blocked by"**, escritos como keys (`["QC-9", "QC-12"]`) |
| `zone` | label `zone:backend` \| `zone:frontend` \| `zone:fullstack` |
| `complexity` | label `complexity:low` \| `complexity:medium` \| `complexity:high` |
| `name` (slug) | label `slug:<kebab-case>` |
| `sdd` | label `sdd` presente ⇒ `true` |
| `branch` | **derivado**: `feature/<key>-<slug>`. No se almacena en Jira. |
| `spec_path` | **derivado**: `specs/<key>-<slug>`. No se almacena en Jira. |

Decisiones que conviene entender antes de cambiarlas:

- **La épica agrupa, no bloquea.** La épica dice a *qué* módulo pertenece la feature, no
  *cuándo* puede arrancar. El orden lo marcan `depends_on` y el cupo por zona, que se cuentan
  sobre features y nunca por épica.
- **La identidad es el `key`, no el número.** El `id` numérico se conserva como fallback —una
  feature puede nacer en disco antes de tener issue— pero nada del arnés depende de él cuando
  hay `key`. `scripts/validate-features.mjs` exige que, si hay `key`, el `id` sea su número.
- **Labels y no campos personalizados.** Funcionan en el plan Free sin configurar nada, se
  filtran en el board y se leen por nombre, sin conocer los IDs internos de campo.
- **El slug se almacena, no se deriva del summary.** Si se derivara, editar el título de un
  issue en curso cambiaría `branch` y `spec_path` y dejaría huérfanos el worktree y la carpeta
  de specs.
- **`depends_on` por issue links**: los links son N a N por naturaleza, y el validador acepta
  escalar y array.
- **`assignee` se importa tal cual, sin interpretarlo.** F0 copia lo que dice Jira; quién puede
  tomar qué lo decide F1.0 releyendo el issue en vivo, nunca la copia.

### Por qué

- **Épica:** en QuimiCloude una épica es un módulo del ERP, con la misma frontera que el módulo
  hexagonal (`QC-15`). «Plataforma» es la excepción consciente: no es un módulo de dominio sino
  el armazón donde se montan los demás, y conviene que sea la única.
- **`key` frente a `id`:** una numeración propia y en serie ya se desincronizó del board.
  `QC-13` acabó con `branch: feature/10-…`, y el registro de sesión de entonces (hoy en
  `progress/archivo/`) siguió hablando de "Feature 2, 7, 8, 11" cuando en el JSON ya eran 5,
  10, 11 y 14. Un fallback que miente es peor que no tenerlo.
- **`depends_on`:** el campo era polimórfico —escalar en casi todas las fichas y array en la 10
  (`[6, 7, 9]`)—; los links lo resolvieron de paso.

## Cómo se nombra una ficha

Nombra siempre una ficha como `<key> «<title>»`: `SL-10 «Gate en verde: CRLF y guardias rojas
heredadas»`, nunca `SL-10` solo. Va así en:

- todo lo que lee el humano: los mensajes del leader y los informes de los subagentes;
- la salida del hook de arranque (`.claude/hooks/arranque.mjs`);
- la cabecera de `progress/features/<key>.md`;
- el título del PR.

Los commits siguen `feat(<key>): <qué>` (`docs/conventions.md`): el título largo no cabe en la
primera línea. El `title` sale de F0 y `scripts/validate-features.mjs` falla si una ficha con
`key` no lo trae. Una copia en la que ninguna ficha lo trae es anterior a esta regla: avisa y
no falla, como la copia sin `assignee`, y la siguiente F0 lo arregla.

### Por qué

- **2026-10-21, servi_logistic.** Con 19 fichas recién creadas, el leader hablaba de «SL-10»,
  «SL-13», «SL-15» y el humano no sabía de qué historia se hablaba sin abrir el board. F0 no
  importaba el summary, así que ni el hook ni el leader podían decirlo sin red.

## El assignee: el candado visible del equipo

Con varias personas sobre el mismo board, el assignee dice **quién tiene cada feature**. Es la
mitad visible del candado; la otra mitad, la atómica, es la rama publicada.

- **F0** importa `assignee` de cada issue (`{accountId, displayName}` o `null`). Es una foto:
  puede tener horas.
- **F1.0 — tomar.** El leader relee el issue en vivo, solo sigue si no tiene assignee o es suyo,
  se lo asigna con su `jira_account_id` (`.arnes.local.json`), relee para confirmarlo y publica
  la rama con `./scripts/wt.sh new <key> <slug>`. Si `wt.sh` sale con **4 (`TOMADA`)**, suelta
  el assignee y elige otra. Procedimiento completo, sin duplicarlo aquí:
  `docs/equipo.md > Tomar una feature`.
- **En vuelo** (`spec_ready`, `in_progress`) toda feature tiene assignee; si no, el validador
  falla. El cupo de cada persona se cuenta solo sobre las features con **su** assignee
  (`docs/equipo.md > Cupo por persona`).
- **F2.5 — cerrar.** El assignee **se queda** en el issue: es el historial de quién la hizo.
- **Soltar** una feature sin terminarla: `docs/equipo.md > Soltar una feature`.

### Por qué

Jira no ofrece una operación atómica de "asignar si nadie la tiene": dos personas pueden leer
`null` en el mismo segundo y asignársela las dos. Por eso el assignee avisa a las personas y la
publicación de la rama con lease vacío, que el servidor de git sí comprueba de forma atómica,
decide quién gana.

## Quién sincroniza y cuándo

Lo hace el **leader** con las herramientas MCP. No hay script de sincronización ni una
segunda copia de las credenciales.

| Paso | Qué hace con Jira |
|---|---|
| **F0** — arranque de sesión | Lee el board y regenera la lista `features` de `feature_list.json` entera (altas, `description`, `status`, `assignee`, `depends_on` desde los links). Después `./init.sh`. **Es el único paso que regenera el archivo entero.** |
| **F1.0** — tomar | Relee el issue, escribe el **assignee** y las labels `zone:` y `complexity:` de la evaluación. Sin las labels, la siguiente importación borraría la evaluación. |
| **F1.3** | Mueve al estado de `spec_ready` y comenta la ruta de `specs/<key>-<slug>/`. |
| **F1.4** | La aprobación humana **es** mover la tarjeta del estado de `spec_ready` al de `in_progress`. |
| **F2.0** | Asegura la tarjeta en el estado de `in_progress`. |
| **F2.5** | Mueve al estado de `done` y comenta la URL del PR. El assignee no se toca. |
| **Al soltar** | Quita el assignee y devuelve la tarjeta a su estado anterior (`docs/equipo.md > Soltar una feature`). |

**Del ciclo, F1.0 es el único paso que escribe campos del issue**; los demás mueven tarjetas o
comentan.

**Al acotar (`/afinar-feature`, antes de F1.2)** hay tres empujones más, todos **antes** de
sembrar el spec y todos con un sí explícito del humano:
1. escribir en el issue los campos que la conversación invalidó (`description`, `complexity`,
   `zone`, `depends_on`);
2. **crear** la ficha que el alcance descubre que falta;
3. mover al estado de `cancelled` la que quedó huérfana.

Son los únicos empujones que nacen de una conversación y no de una transición de estado.
Después, el comando refleja esas mismas fichas —y solo esas— en `feature_list.json`. Ver
`## Cuando el disco descubre que el board está desactualizado`.

## Si Jira y el disco divergen

**Manda Jira**, con dos excepciones que son las que el board no puede saber:

1. **Una feature `in_progress` no se degrada** aunque su tarjeta esté en otro estado. Hay
   un worktree y una rama con trabajo real; primero se cierra o se cancela a mano.
2. **`zone` y `complexity` no se borran** si el issue perdió sus labels. Se re-escriben en
   Jira desde la copia local y se anota en `progress/deudas.md`.

Todo lo demás —altas, bajas, `description`, `status`, `assignee`, dependencias— se sobrescribe
desde el board sin preguntar.

## El board al que pertenece el disco

`arnes.config.json > jira` declara sitio y proyecto. Está **fuera** de lo que F0 regenera, y esa
separación es todo el punto:

- `scripts/validate-features.mjs` (bloque 0) **falla** si alguna ficha con `key` no lleva el
  prefijo de `jira.project`, o si `jira.project` falta habiendo fichas con `key`.
- Un repo sin fichas no está obligado a declararlo; en cuanto entra la primera con `key`, sí.
- **Formato anterior a v2:** el bloque `jira` vivía en `feature_list.json`. El validador todavía
  lo acepta como respaldo si `arnes.config.json` no lo declara; F0 ya no lo escribe.
- **Cambiar de proyecto a propósito** es editar `arnes.config.json > jira.project` y correr F0.
  El gate falla entre una cosa y otra, y es lo que se quiere: obliga a que el cambio sea un acto
  deliberado y no el residuo de una sesión mal conectada.

### Por qué

La comprobación evidente sería derivar el proyecto de los `key`: si las 90 fichas son `QC-*`, el
proyecto es QC. No sirve. F0 regenera `features` entero y ante divergencia manda Jira
(`## Si Jira y el disco divergen`). Un F0 disparado contra otro proyecto del sitio deja las
fichas nuevas, todas con el mismo prefijo nuevo, coherentes entre sí: una comprobación derivada
las da por buenas. Validaría el resultado del error contra el error.

Conectado al board equivocado —y basta con tener acceso a un segundo proyecto del sitio— F0
borra las fichas y las reemplaza, en silencio y con todo en verde: el token es válido, las
herramientas de Jira están, `./init.sh` pasa. No ha ocurrido; el mecanismo sí está verificado
(2026-09-12), y la primera versión de este documento ya lo anticipaba sin cerrarlo («si algún
día hay un segundo proyecto en el sitio nada en el código diría cuál importar en F0»). En v2 el
bloque pasó a `arnes.config.json` porque `feature_list.json` dejó de versionarse: la
declaración del board tiene que viajar con el repo.

## Cuando el disco descubre que el board está desactualizado

La sección anterior resuelve el caso normal: el board manda. Este es el complementario —
**el disco descubrió algo que el board todavía no sabe**.

Pasa en `/afinar-feature`, que cierra el alcance con el humano antes del spec. Una respuesta
puede invalidar lo que la tarjeta dice, y son cuatro los campos que pueden quedar mintiendo:

| Campo | Cómo se invalida |
|---|---|
| `description` | el alcance acordado ya no es el que describe la tarjeta |
| `complexity` | lo acordado hace la feature más grande o más chica de lo que se evaluó en F1.0 |
| `zone` | lo acordado mueve la feature de capa |
| `depends_on` | lo acordado introduce o elimina un bloqueante |

Y dos formas más, que no son campos de una ficha sino fichas enteras:

| Caso | Cómo se resuelve |
|---|---|
| el «Lo que NO entra» manda trabajo a una ficha que no existe | se **crea** el issue: tipo `Tarea`, `parent` a la épica del módulo, link «is blocked by», y los labels `sdd` / `slug:` / `zone:` / `complexity:`. Nace en el estado de `pending`, sin assignee, y **no se siembra**: se acota cuando le toque |
| lo acordado absorbe una ficha existente o la deja sin alcance | se mueve al estado de **`cancelled`**, con un comentario que diga qué ficha la absorbe. Nunca se borra |

**La regla: no se siembra hasta que el board esté al día.**
- El comando redacta el valor nuevo de cada campo afectado, lo muestra, y **con el sí explícito
  del humano lo escribe en Jira** vía MCP antes de crear `specs/<key>-<slug>/requirements.md`.
- Si el humano dice que no, **no se siembra**: un spec construido sobre un alcance que la
  tarjeta contradice es exactamente la divergencia que este documento existe para evitar.
- Que lo escriba el agente no contradice la fila `description` del contrato: **quien decide
  sigue siendo el humano**, a través de la pregunta. El agente solo lo persiste, y solo tras el
  sí.

**Y el disco se sincroniza en la misma corrida.** Escrito el board, el comando refleja en
`feature_list.json` la ficha acotada y las que acaba de crear o cancelar —**solo esas**,
derivando los campos como manda `## El contrato de campos`. No reimporta el board entero: eso es
F0, y un comando de acotación no tiene por qué reescribir fichas `in_progress` que no está
tocando. `feature_list.json` tiene así **dos escritores**, y es deliberado: los dos escriben
*desde el board*, nunca desde su cabeza, así que sigue habiendo una sola verdad. Lo que verifica
que no diverjan es el **bloque 6** de `scripts/validate-features.mjs`.

**La excepción, y su marca.** Si el MCP de `atlassian` no responde, el trabajo no se tira: se
siembra igual, pero con un marcador en la primera línea del archivo —

```
<!-- board-pendiente: QC-14 · description, complexity · el MCP no respondio -->
```

`scripts/validate-features.mjs` (bloque 5) **falla** mientras haya un marcador puesto, así que
`./init.sh` queda en rojo hasta que alguien actualice el issue y lo borre. El gate corre sin red
y no puede preguntarle a Jira si la description está al día; lo que sí puede es ver la marca. Sin
ella esto sería una nota, y lo que no sale en `./init.sh` no existe (regla 5 de `CLAUDE.md`).

### Por qué

**El incidente que lo origina (2026-09-01).** La primera corrida real de `/afinar-feature` sobre
`QC-14` (`modelo-inventario`) preguntó por las «Preguntas abiertas del dominio» de
`docs/architecture.md` y el humano respondió que **sí hay que rastrear lote y vencimiento**. Eso
convierte la existencia de «un número por producto» en «un número por lote»: la `description` de
la tarjeta —que enumera *"una descripcion, una cantidad, una presentacion y una cantidad de
alerta"*— dejó de describir lo que se va a construir, y `complexity: medium` dejó de ser cierto.
La primera versión del comando solo dejaba una nota en las deudas del registro de sesión. Era
inútil: **la siguiente F0 sobrescribe la `description` desde el board sin preguntar**, así que la
nota sobrevive pero el dato no, y el spec sembrado queda huérfano de la ficha que dice
especificar.

**El segundo incidente (2026-09-01).** La corrida sobre `QC-14` decidió que «producto» y
«elemento de inventario» son la misma tabla, y que el CRUD sale a una ficha aparte. El comando no
tenía contrato para crear esa ficha: **QC-20** se creó improvisando, fuera de lo que el paso 5
autorizaba. Y `feature_list.json` se quedó con `name: modelo-inventario` y
`spec_path: specs/QC-14-modelo-inventario` —una carpeta que no existe— además de no conocer a
QC-20, hasta que el siguiente F0 lo arregló. De ahí salen las dos mitades de esta regla: crear
entra en contrato, y el disco se sincroniza en la misma corrida en vez de esperar al arranque de
la sesión siguiente.

## Lo que NO cambia

- **El gate no llama a Jira.** `./init.sh` corre sin red, en local y en CI. La sincronización es
  responsabilidad del leader en F0, no del gate.
- **El estado de trabajo sigue en disco** (regla 3 de `CLAUDE.md`). Jira es la entrada
  humana; `feature_list.json`, `progress/` y `specs/` son lo que el arnés lee.
- **El cupo personal por zona** (regla 1 de `CLAUDE.md`) también se puede violar arrastrando
  tarjetas o asignando de más. Lo valida el leader al importar y `./init.sh` después
  (`scripts/validate-features.mjs`). Si el board la incumple, gana la regla: el leader deja la
  feature sobrante fuera y lo dice.
