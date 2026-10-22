# docs/grafo-de-codigo.md — Explorar código con el grafo

El MCP `codebase-memory-mcp` indexa el repo como grafo: símbolos, llamadas e imports. Para
preguntas de código ("¿quién llama a X?", "¿qué toca este cambio?", "¿dónde vive Y?") el grafo es
más barato y preciso que Grep.

## Quién usa qué

- **Todos los agentes:** para código, el grafo primero (`search_graph`, `trace_path`,
  `get_code_snippet`, `search_code`, `query_graph`). Grep y Read quedan para lo que no es código
  (docs, specs, JSON, textos de UI) y para leer un archivo antes de editarlo.
- **Tu proyecto es el de tu worktree:** `list_projects` → el que tenga `root_path` en
  `.worktrees/<key>-<slug>`. No consultes el de otro worktree.
- **Solo el leader indexa:**

| Momento | Acción |
| --- | --- |
| Arranque | si el árbol principal no está indexado o va detrás de la rama de integración, `index_repository` sobre él |
| F1.0, tras `wt.sh new` | `index_repository` sobre `.worktrees/<key>-<slug>` |
| Cierre de cada tanda y tras sincronizar | reindexar el worktree |
| F2.5, si `wt.sh done` desmontó | `delete_project` del worktree |

## Si no responde

Avisa y sigue con Grep/Read. Ningún paso del flujo se bloquea por el grafo. Un subagente que no
pudo usarlo lo anota en su informe.

## Instalación

- Binario `codebase-memory-mcp` en el `PATH`, o en la ruta que diga la variable
  `CODEBASE_MEMORY_MCP_BIN`.
- El repo lo declara en `.mcp.json`. Si ya lo tienes registrado a nivel de usuario (`claude mcp
  add -s user …`), desactiva la entrada del proyecto en tu `.claude/settings.local.json`
  (`"disabledMcpjsonServers": ["codebase-memory-mcp"]`) para no tener dos instancias. Esa
  configuración es personal y no se versiona.
- Comprobación: `list_projects` debe responder.
