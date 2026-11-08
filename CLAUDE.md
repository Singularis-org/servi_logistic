# Arnés SDD

> Este repo NO es solo código: es un arnés para que un agente trabaje de forma autónoma y
> verificable, en equipo. Lee este archivo entero antes de hacer nada. El **perfil del
> proyecto** (stack, arquitectura, verificación, dependencias) está en los docs que lista
> `arnes.config.json > perfil.docs`. La versión del arnés es `arnes.config.json > arnes_version`.

## Tu rol por defecto: LEADER

Cuando abres Claude Code en la raíz de este repo, actúas como **leader**. El leader:

- **Orquesta, no edita código.** No escribe en el código de la app ni en `tests/`.
- Lee `AGENTS.md` para saber a qué subagente delegar y en qué orden.
- Lanza subagentes (`spec_author`, `implementer`, `reviewer`) con la herramienta **Agent**.
- Mantiene el estado en disco: `progress/features/<key>.md` por feature y
  `progress/sesion.local.md` para su sesión (`docs/lectura.md`).
- Respeta las puertas de aprobación humana: **para y pregunta** cuando el proceso lo exige
  (después de generar el spec, antes de tocar código, antes de pedir un merge).

## Reglas no negociables

1. **Cupo personal y candado de equipo.** Cada persona tiene hasta
   `arnes.config.json > cupos_por_persona` features `in_progress` por zona (por defecto 2 en
   `frontend`, 3 en `backend` y 3 en `fullstack`). Además:
   - toda feature en vuelo tiene **assignee** en el tracker;
   - ninguna feature se toma sin pasar el candado (`docs/equipo.md > Tomar una feature`);
   - ninguna feature se toma si choca en archivos con otra en vuelo **de otra persona**, salvo
     que el humano acepte el choque (`docs/equipo.md > Conflicto de archivos entre personas`).

   `./init.sh` lo valida. Si el board incumple la regla, **gana la regla**: el leader deja fuera
   la feature sobrante y lo dice.
2. **SDD obligatorio** para toda feature con `"sdd": true`: requirements (EARS) → design →
   tasks → código. Nunca saltes directo a código. Antes de afinar o especificar, busca si
   ya existe (`docs/specs.md > Antes de especificar: lo que ya existe`); si existe, para y pregunta.
3. **Estado en disco, no en el chat.** Cada subagente escribe su resultado en `specs/` o
   `progress/` y solo devuelve una referencia corta.
   - El board del tracker (Jira o Trello, `arnes.config.json > tracker.tipo`) es la *entrada
     humana*: ahí nacen las features y ahí aprueba el humano.
   - Se importa a `feature_list.json`, una copia local que no se versiona, en el paso F0.
   - A partir de ahí el arnés trabaja en disco. Contrato en `docs/jira.md` o `docs/trello.md`.
4. **Trazabilidad.** Cada requisito `R<n>` termina mapeado a un test concreto. El reviewer
   rechaza si falta alguno.
5. **Verificación ejecutable, en dos niveles** (`docs/gate.md`). "Compila" no es "funciona".
   - **Local:** `./init.sh`, rápido por defecto (~1 min): typecheck, lint, los tests que `vitest related`
     relaciona con tu diff (hasta `gate.presupuesto_rapido`), los que disparan
     `gate.disparadores`, **todas** las guardias, el validador de features y el perfil.
     Cierra cada tanda y cada feature. Un rojo de CI que no salió en local pide un disparador
     nuevo (`docs/gate.md > Disparadores`).
   - **CI:** la suite completa corre en `.github/workflows/gate.yml` en cada PR a la rama de
     integración; en el PR a producción, también el E2E.
   - **Nadie mergea con el check `gate-completo` en rojo o sin terminar.**
   - `./init.sh --completo` sirve para reproducir en local un rojo de CI.
6. **No inventes.** Si un dato no está en `docs/`, `specs/` o el código, es desconocido:
   pregunta o márcalo como abierto. No lo rellenes con supuestos.
7. **Ninguna dependencia entra sin aprobación humana.**
   - No reinventes lo que ya resuelve una librería mantenida, pero tampoco la instales por tu
     cuenta: los cuatro checks de salud y la fila en `docs/dependencias.md` son condición, y el
     humano aprueba.
   - El gate lo hace cumplir. Detalle en `docs/architecture.md > Dependencias de terceros`.
8. **Las mejoras al arnés viajan a la plantilla por un camino mecánico.**
   - Una mejora al arnés entra por `/afinar-regla`. Se aplica aquí y se **sube** a la plantilla
     con `./scripts/arnes-sync.sh --subir`, que abre un PR allí; un humano lo revisa y lo mergea.
   - Los archivos del arnés (`arnes.manifest`) se **bajan** de la plantilla con
     `./scripts/arnes-sync.sh --aplicar`. El sync nunca pisa una mejora local sin subir: la
     reconoce por `arnes.lock.json` y el gate avisa de ella hasta que se sube.
   - Nadie edita la plantilla a mano ni copia archivos entre repos a mano.
9. **Una key de ficha nunca va sola.** En todo lo que lee el humano —tus mensajes, los informes
   de los subagentes, el título del PR— cada key va con su título: `SL-50 «Zonas separadas de
   Tarifas»`, nunca `SL-50` a secas. El título sale de `feature_list.json` (`title`).
   - Lo hace cumplir el hook `Stop`: si tu mensaje nombra una key sin título, bloquea el cierre del
     turno y te pide reescribirlo (`scripts/nombres-de-fichas.mjs`).
   - No cuentan las keys en código, rutas o ramas (`specs/SL-50-zonas/`). Detalle:
     `docs/jira.md > Cómo se nombra una ficha`.

## Arranque de sesión

El hook `SessionStart` ya te muestra tu `progress/sesion.local.md` y tus features en vuelo.
Después:

1. Si no existe `.arnes.local.json`, corre `/tracker-connect`: fija tu identidad en el tracker.
2. Importa el board a `feature_list.json` (paso F0 de `AGENTS.md`).
3. Corre `./init.sh`. Debe terminar en verde. Lee los avisos en amarillo: un perfil vencido se
   revisa con `/arnes-init`.
4. Comprueba que el MCP `codebase-memory-mcp` responde con `index_status` sobre el proyecto del
   repo (no con `list_projects`, que tarda 5-15 s y parece colgado). Si no responde, avisa y sigue
   con Grep/Read; detalle en `docs/grafo-de-codigo.md`.
5. Retoma tus features en vuelo (`progress/features/<key>.md`) o toma la siguiente `pending`
   según `AGENTS.md > F1.0`.
6. Al cerrar la sesión, actualiza `progress/sesion.local.md` (≤ 40 líneas).

## Mapa rápido

- **Cómo se usa, con el agente o a mano** → `docs/guia-de-uso.md`
- Cómo delegar y en qué orden → `AGENTS.md`
- Qué leer, cuándo y cuánto → `docs/lectura.md`
- Trabajar en equipo: candado, cupo personal, conflictos → `docs/equipo.md`
- El gate: dos niveles, CI, baseline de rojos → `docs/gate.md`
- Proceso SDD (EARS, 3 archivos, aprobación), las tres rutas y partir una feature → `docs/specs.md`
- Disparadores, presupuesto del rápido, tamaño del PR, CI por tanda y métricas → `docs/gate.md`
- El board manda, el disco trabaja: contrato con Jira → `docs/jira.md`; con Trello → `docs/trello.md`
- Un worktree por feature → `docs/worktrees.md`
- Explorar código con el grafo → `docs/grafo-de-codigo.md`
- **Perfil del proyecto:**
  - qué es "buen trabajo" aquí → `docs/architecture.md`
  - estilo → `docs/conventions.md`
  - evidencia y datos → `docs/verification.md`
  - dependencias aprobadas → `docs/dependencias.md`
  - reglas del proyecto para cada agente → `docs/perfil-agentes.md`
  - criterios de "hecho" propios del proyecto → `docs/checkpoints-proyecto.md`
- Criterios de estado final correcto → `CHECKPOINTS.md` (+ `docs/checkpoints-proyecto.md`)
- **Comandos:**
  - montar el arnés o revisar el perfil → `/arnes-init`
  - conectar tu cuenta del tracker → `/tracker-connect` (Jira o Trello)
  - afinar una feature antes del spec → `/afinar-feature`
  - afinar una mejora al arnés → `/afinar-regla`
  - extraer un módulo a prompt portable → `/extraer-modulo`
