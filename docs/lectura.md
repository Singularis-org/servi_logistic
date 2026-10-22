# docs/lectura.md — Qué se lee, cuándo y cuánto

Cada byte leído ocupa contexto durante el resto de la sesión. Esta tabla manda sobre la costumbre
de "leerlo todo por si acaso".

| Archivo | Cuándo | Cómo |
| --- | --- | --- |
| `CLAUDE.md`, `AGENTS.md` | al arrancar | completos |
| `progress/sesion.local.md` | al arrancar (lo inyecta el hook `SessionStart`) | completo; **máx. 40 líneas**, recórtalo al cerrar |
| Mis features en vuelo | al arrancar (lo inyecta el hook) | la lista; el detalle, abajo |
| `progress/features/<key>.md` | al trabajar **esa** feature | completo |
| `specs/<key>-*/` | al trabajar esa feature | completos los 3 |
| `progress/impl_<key>.md`, `progress/review_<key>.md` | al lanzar la siguiente vuelta del reviewer o del implementer | la sección que toque |
| `docs/*.md` | cuando la tarea lo pide | **por sección** (`docs/x.md > Sección`); salta las subsecciones `### Por qué` salvo que dudes de la regla |
| `CHECKPOINTS.md`, `docs/checkpoints-proyecto.md` | reviewer, al revisar | completos |
| `docs/perfil-agentes.md` | cada subagente, al empezar | solo su sección y `> Todos los agentes` |
| `feature_list.json` | **nunca entero** (cientos de KB) | consulta con `node -e` o `jq` por `key`/`status`/`assignee` |
| `progress/deudas.md` | al buscar una deuda concreta | por grep |
| `progress/archivo/*`, `progress/logs/*` | casi nunca | por grep; jamás enteros |

## Escribir para que se lea barato

- **`sesion.local.md`:** es un marcador de página, no un diario. Pon en qué feature estás, dónde
  lo dejaste, qué esperas y el siguiente paso.
- **`features/<key>.md`:** registra las decisiones y su porqué en una línea. Las salidas de tests
  y los logs van a `progress/logs/`, fuera de git.
- **Docs:** la regla va arriba, en imperativo. El incidente que la motivó va en `### Por qué`, al
  final de la sección.
