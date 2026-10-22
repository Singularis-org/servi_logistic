# progress/ — estado en disco (arnés v2)

| Qué | Dónde | Git | Cuándo se lee |
|---|---|---|---|
| Tu sesión: dónde lo dejaste | `sesion.local.md` (plantilla: `sesion.local.example.md`) | no | siempre al arrancar (≤ 40 líneas) |
| Estado de una feature: evaluación, decisiones, preguntas, tandas, overrides de modelo, cierre | `features/<key>.md` (plantilla: `features/_plantilla.md`) | sí; solo lo edita la rama de esa feature | solo al trabajar esa feature |
| Deudas y cosas abiertas del proyecto | `deudas.md` | sí | bajo demanda, por grep |
| Informes de agente | `impl_<key>.md`, `review_<key>.md`, `fix-*.md`, `qc77-mediciones/` | sí | bajo demanda |
| Logs de corridas (gate, E2E, suites) | `logs/` | no | nunca enteros: `tail` o grep |
| Archivo congelado (antes del 2026-10-06) | `archivo/` | sí | nunca al arrancar; por grep |

La copia del board es `feature_list.json` en la raíz (no se versiona): se consulta con node o jq,
nunca entera.

Reglas:
- Un archivo por feature evita los conflictos de merge que tenía el viejo `current.md` único.
- Al cerrar una feature, su `features/<key>.md` registra el cierre en la sección *Cierre*.
- `deudas.md` tiene una deuda por bloque `### D<n>`; las marcadas `(¿vigente?)` no se pudieron
  confirmar al migrar.
- `archivo/current-2026-10-06.md` e `archivo/history-hasta-2026-10-06.md` son el estado y la
  bitácora anteriores, congelados.
