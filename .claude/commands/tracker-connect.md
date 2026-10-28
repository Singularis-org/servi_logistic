---
description: Conecta tu cuenta del tracker (Jira o Trello) al arnes, verifica que la conexion es real y fija tu identidad en .arnes.local.json
---

Vas a dejar a quien corre este comando conectado al tracker del repo con **su propia cuenta** y a
dejar escrita su identidad en `.arnes.local.json`. El comando no dice "listo" sin haber llamado al
tracker de verdad.

## Paso 0 — Que tracker usa este repo

Lee `arnes.config.json > tracker.tipo`. Si no hay bloque `tracker`, el tipo es `jira` (el bloque
`jira` antiguo equivale a `tipo: "jira"`; `scripts/tracker.mjs`).

- **`jira`** → sigue **entero** el flujo de `.claude/commands/jira-connect.md` y para aqui. Ese
  flujo escribe `jira_account_id`.
- **`trello`** → sigue con el Paso 1.
- **Otro valor** → dilo y para: `scripts/validate-features.mjs` tambien lo rechaza.

## Regla que no se rompe: el token no entra en el chat

**Nunca pidas que peguen `TRELLO_KEY` ni `TRELLO_TOKEN` en la conversacion**, ni con el prefijo
`!`. El comando **dicta** el comando; la persona lo corre en **otra terminal** y vuelve a decir
"hecho". Si aun asi los pega, dilo, y di que el token hay que revocarlo y generar otro.

## Paso 1 — Detectar en que fase estas (Trello)

Corre `node scripts/trello.mjs yo`:

- **`faltan TRELLO_KEY y/o TRELLO_TOKEN`** → Fase A.
- **`401`** → la credencial esta mal: Fase A desde A.2.
- **Imprime `{id, fullName, username}`** → Fase B.

## Fase A — No hay conexion todavia

Un paso cada vez, esperando confirmacion. El contrato esta en
`docs/trello.md > Montar un colaborador nuevo`.

**A.1 — Que este en el board.** Pregunta si ya es miembro del board de
`arnes.config.json > tracker.board` (miembro normal, no observador: el ciclo se asigna tarjetas,
las mueve y comenta). Si no, para: lo invita el admin del board.

**A.2 — Clave y token.** Enlace y pasos en el mismo mensaje:

```
https://trello.com/power-ups/admin
```

1. Entrar con **su propia cuenta** de Trello.
2. Crear un Power-Up (cualquier nombre, p. ej. `arnes-<maquina>`) y abrir **API key**.
3. Generar la **API key** y, desde ese mismo panel, el **token** (enlace "Token"), aceptando
   lectura y escritura.
4. Copiar los dos en ese momento.

**A.3 — Exportarlos, en otra terminal.** Dicta el comando completo, para correr **fuera de esta
conversacion**:

    [Environment]::SetEnvironmentVariable("TRELLO_KEY", "SU_KEY", "User")
    [Environment]::SetEnvironmentVariable("TRELLO_TOKEN", "SU_TOKEN", "User")

En Linux o macOS, en el `.bashrc` o `.zshrc`:

    export TRELLO_KEY=SU_KEY TRELLO_TOKEN=SU_TOKEN

**A.4 — Reiniciar el proceso correcto.** En Windows hay que cerrar **la terminal o el VS Code
entero**, no solo el agente. Despues, que vuelva a correr `/tracker-connect`.

## Fase B — Hay conexion: verificar y fijar la identidad

**B.1 — Quien eres.** Del resultado de `yo`, di con que cuenta entra (`fullName` e `id`).
Pregunta si es la suya: un token ajeno firma todo el ciclo con otra persona.

**B.2 — El limite de lo que acabas de probar.** `yo` prueba la credencial, no el acceso al board.
Ese acceso se prueba en F0 (`node scripts/trello.mjs importar`): un `401` o `404` ahi es A.1.
Presentalo como "credencial confirmada, board sin probar".

**B.3 — Fijar la identidad local.** Escribe `.arnes.local.json` en la **raiz del worktree
principal** (`git rev-parse --path-format=absolute --git-common-dir`, su directorio padre):

    {"trello_member_id": "<id de yo>", "nombre": "<fullName>"}

- Si el archivo ya existe, **conserva** sus otros campos (un `jira_account_id` previo se queda).
- Si ya trae otro `trello_member_id`, muestra los dos y pregunta: cambia que features son tuyas.
- Comprueba que esta ignorado (`git check-ignore -q <raiz>/.arnes.local.json`). Si no, avisa y para.

**B.4 — Cierre.** Una linea: cuenta, `.arnes.local.json` escrito y el siguiente paso real, el
arranque de sesion de `CLAUDE.md` (F0 con `node scripts/trello.mjs importar`).

## Lo que este comando no hace

- **No crea la clave ni el token**: ese clic es de la persona.
- **No invita gente** al board.
- **No comparte credenciales** (`docs/jira.md > Montar un colaborador nuevo > Por qué`).
- **No versiona la identidad.**
