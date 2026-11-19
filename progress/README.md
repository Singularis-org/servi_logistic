# progress/ — estado en disco

| Qué | Dónde | Git | Cuándo se lee |
|---|---|---|---|
| Tu sesión: dónde lo dejaste | `sesion.local.md` (plantilla: `sesion.local.example.md`) | no | siempre al arrancar (≤ 40 líneas) |
| Estado de una feature: evaluación, decisiones, preguntas, tandas, overrides de modelo, cierre | `features/<key>.md` (plantilla: `features/_plantilla.md`) | sí; solo lo edita la rama de esa feature | solo al trabajar esa feature |
| Deudas y cosas abiertas del proyecto | `deudas.md` | sí | bajo demanda, por grep |
| Informes de agente | `impl_<key>.md`, `review_<key>.md` | sí | bajo demanda |
| Logs de corridas (gate, E2E, suites) | `logs/` | no | nunca enteros: `tail` o grep |
| Métricas del ciclo (gate local y fases) | `logs/metricas.jsonl` | no | con `node scripts/metricas.mjs informe`, nunca a mano |
| Archivo congelado (opcional: registros anteriores al arnés) | `archivo/` | sí | nunca al arrancar; por grep |

La copia del board es `feature_list.json` en la raíz (no se versiona): se consulta con node o jq,
nunca entera (`docs/lectura.md`).

Reglas:
- Un archivo por feature evita los conflictos de merge de un registro único compartido.
- Al cerrar una feature, su `features/<key>.md` registra el cierre en la sección *Cierre*.
- `deudas.md` tiene una deuda por bloque `### D<n>`; dónde se edita:
  `docs/equipo.md > Dónde se edita progress/deudas.md`.
- `impl_1-ejemplo-*` y `review_1-ejemplo-*` son ejemplos de formato, como
  `specs/1-ejemplo-*`. Bórralos al montar el arnés en un proyecto real.
