# docs/grafo-de-codigo.md — Explorar código con el grafo

El MCP `codebase-memory-mcp` indexa el repo como grafo: símbolos, llamadas e imports. Para
preguntas de código ("¿quién llama a X?", "¿qué toca este cambio?", "¿dónde vive Y?") el grafo es
más barato y preciso que Grep.

## Quién usa qué

- **Todos los agentes:** para código, el grafo primero (`search_graph`, `trace_path`,
  `get_code_snippet`, `search_code`, `query_graph`). Grep y Read quedan para lo que no es código
  (docs, specs, JSON, textos de UI) y para leer un archivo antes de editarlo.
- **Tu proyecto es el de tu worktree, y su nombre se deriva de la ruta:** la ruta absoluta con
  `:/` y `/` cambiados por `-`. `R:/repo` → `R-repo`; `R:/repo/.worktrees/PROY-8-x` →
  `R-repo-.worktrees-PROY-8-x`. Confirma con `index_status` sobre ese nombre. No consultes el de
  otro worktree.
- **No uses `list_projects` para buscar tu proyecto ni para comprobar que el MCP responde.** Abre
  todos los índices de la máquina y tarda 5–15 s (medido: mediana 5 s, máximo 15 s, en 57
  llamadas con 9 proyectos y 1,4 GB de índices). Parece colgado, y un agente que lo ve así deja de
  usar el grafo. `index_status` responde en ~70 ms.
- **Solo el leader indexa:**

| Momento | Acción |
| --- | --- |
| Arranque | `index_status` del árbol principal; si no está indexado o va detrás de la rama de integración, `index_repository` sobre él |
| F1.0, tras `wt.sh new` | `index_repository` sobre `.worktrees/<key>-<slug>` |
| Cierre de cada tanda y tras sincronizar | reindexar el worktree |
| F2.5, si `wt.sh done` desmontó | `delete_project` del worktree. Sin esto el índice del worktree borrado se queda en disco y alarga `list_projects` |

## Varias sesiones a la vez

Funciona. Hay **un daemon por máquina** y cada sesión de Claude Code arranca un cliente stdio que
se conecta a él. Verificado el 2026-11-07 con la versión 0.11.0:

- dos sesiones consultando a la vez responden las dos (~50 ms);
- una sesión consulta mientras otra indexa un repo grande, y responde (25–85 ms);
- se cierra la sesión que arrancó el daemon y las demás siguen; el daemon solo se para cuando se
  desconecta el último cliente.

## Si no responde

Avisa y sigue con Grep/Read. Ningún paso del flujo se bloquea por el grafo. Un subagente que no
pudo usarlo lo anota en su informe. Para diagnosticar, en este orden:

1. ¿Llamaste a `list_projects`? Espera 15 s o usa `index_status`: lo normal es que no esté
   colgado, sino lento.
2. ¿La sesión tiene el servidor? Si `mcp__codebase-memory-mcp__*` no aparece entre tus
   herramientas, revisa `## Instalación` (registro duplicado o desactivado).
3. El log del daemon: `~/.cache/codebase-memory-mcp/logs/cbm-daemon.log`. Cada llamada sale como
   `mcp.request ... tool=<x> status=<ok|error> duration_ms=<n>`.
4. Fuera de Claude Code: `codebase-memory-mcp cli index_status --project <nombre>`.

La UI web del grafo usa el puerto 9749. Si arrancan dos daemons distintos (con cachés distintas,
`CBM_CACHE_DIR`), el segundo avisa `ui.unavailable port=9749 reason=in_use`: solo pierde la UI,
el MCP sigue funcionando.

## Instalación

- Binario `codebase-memory-mcp` en el `PATH`, o en la ruta que diga la variable
  `CODEBASE_MEMORY_MCP_BIN`.
- El repo lo declara en `.mcp.json`. **Un solo registro por máquina:** si ya lo tienes a nivel de
  usuario (`claude mcp add -s user …`), desactiva la entrada del proyecto en tu
  `.claude/settings.local.json` (`"disabledMcpjsonServers": ["codebase-memory-mcp"]`). Si no lo
  tienes a nivel de usuario, actívala (`"enabledMcpjsonServers": [..., "codebase-memory-mcp"]`).
  Esa configuración es personal y no se versiona.
- Comprobación: `index_status` sobre el proyecto del repo debe responder.
