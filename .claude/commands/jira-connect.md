---
description: Conecta tu cuenta de Jira al arnes, verifica que la conexion es real, lista los proyectos a los que tienes acceso y fija tu identidad en .arnes.local.json
---

> Solo para Jira. Si `arnes.config.json > tracker.tipo` es `trello`, usa `/tracker-connect`.
> `jira.site` y `jira.project` valen tambien como `tracker.site` y `tracker.prefijo`
> (`docs/jira.md`, cabecera).

Vas a dejar a quien corre este comando conectado al board de Jira con **su propia cuenta**, a
demostrarselo listando los proyectos que ve, y a dejar escrita su identidad en
`.arnes.local.json`. No es un tutorial: cada paso termina en una comprobacion, y el comando no
dice "listo" sin haber llamado a una herramienta de Jira.

Contrato completo en `docs/jira.md`. Este comando automatiza su seccion
`## Montar un colaborador nuevo`. Para que sirve la identidad: `docs/equipo.md > Quien soy`.

El board que este repo espera **no lo tienes memorizado**: leelo de `arnes.config.json > jira`
(`site` y `project`).

## Regla que no se rompe: el token no entra en el chat

**Nunca pidas que peguen el token ni el `ATLASSIAN_MCP_AUTH` en la conversacion**, ni con el
prefijo `!`. Todo lo que pasa por aqui queda en el transcript, en el historial de la sesion y en
los logs. El comando **dicta** el comando a ejecutar; la persona lo corre en **otra terminal** y
solo vuelve a decir "hecho". Si aun asi lo pegan, dilo, y di que ese token hay que revocarlo y
generar otro — no sigas como si nada.

## Paso 1 — Detectar en que fase estas

Llama a `mcp__atlassian__getVisibleJiraProjects`. El resultado decide todo lo que sigue:

- **La herramienta no existe** en tu set → no hay conexion. Ve a la **Fase A**.
- **La herramienta responde** → hay conexion. Ve a la **Fase B**.
- **La herramienta existe pero da error** → hay credencial pero es incorrecta. Diagnostica con
  la tabla del Paso 4 y luego ve a la Fase A por el paso que falle.

No uses `/mcp` ni el color del servidor para decidir: el servidor de Atlassian conecta **sin
credencial valida** y expone igual tres herramientas de Teamwork Graph. Si solo ves esas tres,
no hay conexion util por mucho que el indicador este en verde.

## Fase A — No hay conexion todavia

Guia los cuatro pasos, **uno a uno**, esperando confirmacion antes de dictar el siguiente. No
los vuelques todos de golpe: el modo de fallo real es que alguien haga el 3 sin el 1.

**A.1 — Que este invitado al proyecto.** Pregunta si ya acepto una invitacion al sitio de
`arnes.config.json > jira.site` con la cuenta que va a usar. Si no, para: el admin tiene que
agregarlo al proyecto de `arnes.config.json > jira.project` como **Member** (no *Viewer*: el
ciclo se asigna features y escribe labels en F1.0, comenta en F1.3 y F2.5 y mueve tarjetas). Sin esa invitacion aceptada, el token que genere no
sirve para este sitio.

Recuerdale que el email con el que acepte la invitacion es el que va en A.3. Si acepta con otro,
el par `email:token` no va a autenticar contra este board.

**A.2 — Crear el token.** Pega el enlace **y las instrucciones completas en el mismo mensaje**,
antes de pedir nada. Nadie tiene que ir a buscarlas a otro archivo ni volver a preguntar que
boton era: cuando la persona esta mirando la pantalla de Atlassian ya tiene que saber los cuatro
clics de memoria.

Enlace para generar el token:

```
https://id.atlassian.com/manage-profile/security/api-tokens
```

Y los pasos, tal cual, dentro del mensaje:

1. Entrar con **su propia cuenta** de Atlassian — la misma con la que acepto la invitacion en A.1.
2. Apretar **Create API token with scopes**. ⚠️ Hay dos botones y solo uno sirve: *Create API
   token* a secas genera un token **legacy sin scopes**, que autentica contra la API REST (200)
   pero el MCP rechaza con `403: ... require a modern API token`. El sintoma enganna, porque el
   servidor conecta igual.
3. En el selector de app, elegir **"Rovo MCP"**. ⚠️ **No "Rovo MCP v2"**: con la v2, aun marcando
   *todos* los scopes, el servidor autentica pero solo expone cinco herramientas de identidad y
   Teamwork Graph — **ninguna de Jira**. Verificado en este repo.
4. Marcar los scopes de **Jira, read y write**. Write no es opcional: el ciclo asigna y escribe
   labels en F1.0, comenta en F1.3 y F2.5 y mueve tarjetas.
5. Ponerle un nombre reconocible (p. ej. `claude-code-<maquina>`), para poder revocar **solo ese**
   el dia que haga falta.
6. **Copiar el token en ese momento y guardarlo donde lo tenga a mano un minuto.** Atlassian no lo
   vuelve a mostrar; si se pierde, se empieza de nuevo desde el paso 2.

Recien cuando confirme que lo tiene, pasa a A.3. Y no le pidas que lo pegue aqui: lo va a usar el
mismo, en su terminal.

**A.3 — Exportar la credencial, en otra terminal.** Ahora si, dicta el comando **completo y
listo para pegar**, diciendo explicitamente que lo corra **fuera de esta conversacion** — en una
terminal aparte, no con el prefijo `!`.

El email es el de la cuenta **Atlassian** duena del token, no el de git. Que reemplace
`SU_EMAIL` y `SU_TOKEN` y nada mas; el `:` entre los dos es parte del formato.

En Windows (PowerShell), que deja la variable persistente para su usuario:

    [Environment]::SetEnvironmentVariable("ATLASSIAN_MCP_AUTH",
      [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes("SU_EMAIL:SU_TOKEN")), "User")

En Linux o macOS, anadiendo ademas la linea al `.bashrc` o `.zshrc` para que sobreviva a la
terminal:

    export ATLASSIAN_MCP_AUTH=$(printf '%s' "SU_EMAIL:SU_TOKEN" | base64 -w0)

Si pregunta por que base64: el header es `Authorization: Basic`, y `Basic` transporta el par
`usuario:contrasena` codificado. No es cifrado ni protege nada — es el formato que espera el
servidor. El token sigue siendo un secreto.

**A.4 — Reiniciar el proceso correcto.** En Windows una variable de usuario nueva **no entra en
procesos ya vivos ni en sus hijos**: hay que cerrar **la terminal o el VS Code entero**, no solo
Claude Code. Que verifique en la terminal nueva, antes de arrancar, imprimiendo la longitud de
`$env:ATLASSIAN_MCP_AUTH` — un numero esta bien; vacio o error significa que A.3 no llego.

**El comando termina aqui**: la conexion MCP se establece al arrancar Claude Code, asi que la
verificacion no puede pasar en esta misma sesion. Cierra diciendo exactamente eso y pidiendo que
vuelva a correr `/jira-connect` despues de reabrir — ahi caera en la Fase B.

## Fase B — Hay conexion: verificar y listar

**B.1 — Quien eres.** Llama a `mcp__atlassian__atlassianUserInfo` y di con que cuenta esta
entrando (nombre y `accountId`). Guarda los dos: los usa B.4. Sirve para
cazar el error mas silencioso de todos: estar conectado con la cuenta de otro —por un token
compartido o uno viejo en la variable— y no enterarse hasta que el board muestre a la persona
equivocada aprobando specs.

**B.2 — Los proyectos a los que tiene acceso.** Lee `jira.project` de `arnes.config.json`:
ese es el proyecto que este repo espera, no uno que tengas memorizado. Si `arnes.config.json`
no existe o no declara `jira.project`, dilo: el repo no tiene perfil (`/arnes-init`) y no hay
contra que comprobar. Con el resultado de `mcp__atlassian__getVisibleJiraProjects`, lista cada
proyecto con **clave y nombre** y marca explicitamente si el proyecto declarado esta entre
ellos:

- **Aparece** → la conexion sirve para este repo. Sigue en B.3.
- **No aparece** → esta autenticado contra Atlassian pero **sin acceso al board de este
  repo**. Es el paso A.1 lo que falta, no el token: el admin tiene que agregarlo al proyecto.
  Dilo asi, porque el sintoma (herramientas de Jira presentes, todo "verde") sugiere lo
  contrario.

Si la lista trae proyectos de otros sitios de Atlassian, dilo tambien: significa que su cuenta
pertenece a varias organizaciones, y conviene que sepa cual esta usando el arnes. Para ver a que
sitios llega la cuenta, `mcp__atlassian__getAccessibleAtlassianResources`; compara con
`arnes.config.json > jira.site`.

**B.3 — El limite de lo que acabas de probar.** Se honesto: listar proyectos demuestra
**lectura**. El permiso de **escritura** no queda probado hasta que el ciclo escriba de verdad —
los labels de F1.0, el comentario de F1.3, la transicion de F2.5. Si entro como *Viewer*, esto
pasa en verde y falla mas tarde. No lo presentes como "todo listo"; presentalo como "lectura
confirmada, escritura sin probar". No inventes una prueba de escritura tocando un issue real
solo para verificar.

**B.4 — Fijar la identidad local.** Escribe `.arnes.local.json` en la **raiz del worktree
principal**, no en el worktree donde estes:

1. Localiza la raiz: `git rev-parse --path-format=absolute --git-common-dir` devuelve el `.git`
   comun; la raiz es su directorio padre. Desde un worktree de feature, el directorio actual
   **no** es la raiz.
2. Escribe el archivo con los datos de B.1, y nada mas:

       {"jira_account_id": "<accountId de atlassianUserInfo>", "nombre": "<displayName>"}

   Si ya existe con otro `jira_account_id`, **no lo pises en silencio**: muestra los dos y
   pregunta. Cambiar de cuenta cambia que features cuentan como tuyas en el cupo.
3. Comprueba que esta ignorado: `git check-ignore -q <raiz>/.arnes.local.json` (el `.gitignore`
   trae `/.arnes.local.json`). Si no lo esta, avisa y para: es identidad personal y no se
   versiona.

Escribe la identidad aunque el proyecto declarado no aparezca en B.2: la cuenta es la correcta,
lo que falta es el acceso. Pero dilo en el cierre.

**B.5 — Cierre.** Una linea con: cuenta, si el proyecto declarado esta, que `.arnes.local.json`
quedo escrito, y cual es el siguiente paso real — el arranque de sesion de `CLAUDE.md`, que
sigue importando el board (F0 de `AGENTS.md`).

## Paso 4 — Tabla de errores

Cuando algo falle, no propongas reintentar a ciegas: el error dice en que paso esta.

| Error | Que falta |
|---|---|
| solo 3 herramientas, ninguna de Jira | A.2: eligio la app "Rovo MCP v2", o el token es legacy |
| `403 ... require a modern API token` | A.2: apreto *Create API token* a secas, sin scopes |
| `401 ... 'bearer' prefix missing` | A.3 o A.4: la variable no llega al proceso, o el par `email:token` esta mal |
| `You don't have permission to connect via API token` | Rovo sin habilitar en la organizacion. **No lo puede arreglar el colaborador**: es el paso 4 de `docs/jira.md`, y lo hace el admin una sola vez para toda la organizacion |
| conecta, hay herramientas de Jira, pero el proyecto declarado no esta | A.1: no esta invitado al proyecto, o la cuenta es de otra organizacion (B.2) |

Para separar "la credencial es mala" de "el MCP es el problema", esta la llamada REST directa a
`/rest/api/3/myself` del final de `## Verificar que la conexion es real` en `docs/jira.md`. Un
200 con su cuenta significa que la credencial es buena y el problema esta mas arriba — casi
siempre A.2, la app o el boton.

## Lo que este comando no hace

- **No crea el token.** Atlassian no tiene API para emitir API tokens, a proposito: un token que
  se pudiera crear por API seria un token que se puede crear robando otro. Ese clic es
  irreducible.
- **No invita gente.** El provisioning automatico (SCIM) necesita Atlassian Guard, que es de
  pago; en el plan Free la invitacion es manual.
- **No comparte credenciales.** Si alguien propone reusar el token de otro, di que no y por que:
  un token hereda **todos** los permisos de su dueno —el del creador del sitio es admin de la
  organizacion—, todos los empujones del ciclo quedarian firmados por la misma cuenta (que es
  justo la autoria que la transicion del estado de `spec_ready` al de `in_progress` existe para registrar), el assignee dejaria
  de distinguir quien tiene cada feature, y revocarlo el dia que haga falta tumba al dueno
  tambien.
- **No versiona la identidad.** `.arnes.local.json` es de cada persona y de cada maquina.
