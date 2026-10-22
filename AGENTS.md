# AGENTS.md — Mapa de orquestación

Divulgación progresiva: este archivo dice **a quién delegar, en qué orden y qué leer** en cada
paso. Los detalles viven en `docs/` y se leen por sección, bajo demanda (`docs/lectura.md`).

## Los siete subagentes

| Subagente | Hace | NO hace |
| --- | --- | --- |
| `spec_author` | Escribe `requirements.md` (EARS), `design.md` y `tasks.md` | No escribe código de la app |
| `implementer` | Coordina `frontend_dev` y `backend_dev`, ejecuta las tasks en orden, sincroniza la rama con la de integración (F2.3) | No implementa directamente; no se autoaprueba; no abre el PR |
| `frontend_dev` | Componentes, páginas, hooks y layouts del stack de UI del perfil | No toca backend, DB ni APIs |
| `backend_dev` | Servicios, repositorios, migraciones, autorización, Server Actions | No toca UI ni componentes |
| `reviewer` | Verifica trazabilidad `R<n>`→test y revisa contra `docs/` y `CHECKPOINTS.md`; escribe `progress/review_<key>.md` | No edita código |
| `extractor` | Inventaria un módulo ya construido y escribe su prompt portable + cuestionario en `extracciones/<slug>/` | No modifica el módulo ni escribe specs |
| `leader` (tú) | Orquesta, transiciona estados, toma y suelta features en Jira, corre el gate, abre el PR | No edita código |

**Tres comandos alrededor del ciclo.** Son la misma herramienta aplicada a tres sujetos:
- `/afinar-regla` afina el **arnés**. Las mejoras al arnés no se aplican en caliente: entran por
  aquí, y si sirven a todos los proyectos, primero en la plantilla.
- `/afinar-feature` afina una **feature tomada y aún sin spec** (después de F1.0, antes de F1.2).
  Cierra con el humano el alcance y las decisiones y **siembra** `specs/<key>-<slug>/requirements.md`
  en la rama de la feature.
- `/extraer-modulo` interroga un **módulo que ya existe**. Es solo lectura y no entra en el ciclo
  SDD.

Además, `/arnes-init` monta el arnés en un proyecto nuevo o revisa el perfil de uno existente, y
`/jira-connect` fija tu identidad de Jira (`.arnes.local.json`).

## Estrategia de ramas

```
<produccion> <- PR (solo humano mergea) -- <integracion> <- PR <- feature/<key>-<slug>
```

Los nombres reales están en `arnes.config.json > ramas`, y solo ahí.

- Las ramas de feature nacen de la rama de integración y se **publican al nacer** (es el candado
  de equipo, `docs/equipo.md`).
- Los agentes **nunca** tocan la rama de producción. Solo crean ramas, hacen push y abren PRs
  hacia la de integración.
- El merge a producción lo hace el humano.

## Worktrees

Cada feature vive en su propio worktree, dentro del repo, en `.worktrees/<key>-<slug>/`
(ignorado en git). El worktree principal se queda en la rama de integración y **nadie hace
`git checkout` en él**. Hay un worktree por feature.

```
./scripts/wt.sh new <key> <slug>   # F1.0: publica la rama (candado) y crea el worktree
./scripts/wt.sh done <key>-<slug>  # F2.5: lo desmonta cuando el PR ya está mergeado
```

`wt.sh done` **se niega a borrar** si el árbol está sucio, si la rama no está integrada o si el
worktree está bloqueado. Eso es la guarda, no un error. Detalle en `docs/worktrees.md`.

## Evaluación de `zone` y `complexity`

El leader evalúa cada feature `pending` con `zone`/`complexity` en `null` y documenta la
evaluación en `progress/features/<key>.md > Evaluación`.

| Zone | Señales en la description |
| --- | --- |
| `frontend` | pantalla, menú, componente, UI, botón, sidebar, tabla, toast, paginación |
| `backend` | migración, seed, tabla, RLS, API, endpoint, manejador de errores global |
| `fullstack` | las dos categorías en la misma feature |

**Una feature `fullstack` NO se parte**: se trabaja entera, con su propio cupo. Si conviene
partirla porque es demasiado grande, se decide con el humano en `/afinar-feature` y se crean los
issues en el board, nunca en disco.

| Complexity | Señales |
| --- | --- |
| `low` | 1 archivo/tabla, sin lógica condicional compleja |
| `medium` | 2-3 capas, condiciones, varios archivos |
| `high` | multi-feature, webhooks, integraciones externas |

## Modelos

**Los siete agentes heredan el modelo de la sesión. Ninguno declara `model:` en su
frontmatter.** Lo hace cumplir `tests/guards/guard-modelos-de-agentes.test.ts`.

- **Override puntual:** el leader puede pasar otro modelo en una llamada concreta (un `reviewer`
  más capaz en una feature `complexity: high`, por ejemplo). Escribe el motivo en
  `progress/features/<key>.md > Modelos`. No se cambia el frontmatter.
- **Nunca un id con fecha o versión**, solo alias pelados (`sonnet`, `opus`, `haiku`): un id
  escrito a mano envejece y mata al agente al arrancar.

## Paralelismo

- **Cupo personal:** hasta `arnes.config.json > cupos_por_persona` features `in_progress` por
  zona y **por persona** (por defecto 2 `frontend`, 3 `backend`, 3 `fullstack`). Zonas distintas
  no se limitan entre sí.
- **Conflicto de archivos:** se mira contra las features en vuelo de **todo el equipo**:

  ```bash
  node scripts/archivos-en-vuelo.mjs --candidata <key>   # exit 1 = choca
  ```

  Si choca con otra persona, la candidata espera a que la otra pase a `done`, salvo que el humano
  acepte el choque (`--acepto`, `docs/equipo.md`). Con fichas propias da AVISO. Si la candidata
  aún no tiene `tasks.md`, se repite la comprobación en F2.0, antes de implementar.
- **Dependencias:** una feature con `depends_on` no arranca hasta que su dependencia esté `done`.

## Flujo de una feature

### F0 — Importar el board

Al arrancar sesión, con el MCP de `atlassian`:

- Regenera la lista `features` de `feature_list.json` (en la raíz del worktree principal; no se
  versiona). La consulta es `project = <arnes.config.json > jira.project> AND issuetype != Epic`.
- Por cada ficha importa:
  - `title` (el summary del issue: `docs/jira.md > Cómo se nombra una ficha`);
  - `description` y `status`: este último, por el **nombre del estado** del issue, traducido con
    `arnes.config.json > jira.estados`. Un estado que no esté en esa tabla **detiene F0** con un
    mensaje que lo nombre: nunca se adivina (`docs/jira.md > Los estados del board`);
  - `depends_on` (links "is blocked by");
  - `epic` + `epic_name`;
  - **`assignee: {accountId, displayName}`** (o `null`).
- `branch` y `spec_path` se derivan del `key` (`feature/<key>-<slug>`, `specs/<key>-<slug>`); no
  se guardan en Jira.
- **No degrades** una feature `in_progress`, ni una `zone`/`complexity` ya evaluada cuyo issue
  perdió las labels. Conserva el valor, reescríbelo en Jira y anótalo en `progress/deudas.md`.
- Si el MCP no responde, **no inventes el estado**: trabaja con la copia en disco y avisa.

Contrato completo: `docs/jira.md`.

### F1 — Especificación

1. **(F1.0) Evaluar, elegir y tomar.**
   - Evalúa las `pending` sin evaluar.
   - Recorre las `pending` en orden de `id` y elige la **primera** que cumpla todo esto:
     - está sin asignar o asignada a ti;
     - no tiene `depends_on` pendiente;
     - tu cupo en su zona no está lleno;
     - no choca en archivos con otra persona, o el humano aceptó el choque (si ya tiene
       `tasks.md` sembrado; con tus propias fichas solo avisa).
   - **Tómala** siguiendo `docs/equipo.md > Tomar una feature`: releer el issue en vivo →
     asignártela → releer → `./scripts/wt.sh new <key> <slug>`. Si `wt.sh` sale con **4
     (TOMADA)**, suelta el assignee y vuelve a elegir.
   - Escribe `zone:<z>` y `complexity:<c>` como labels del issue. Sin eso, el F0 siguiente
     borraría la evaluación.
   - Crea `progress/features/<key>.md` desde `progress/features/_plantilla.md`.
   - Indexa el worktree en el grafo (`docs/grafo-de-codigo.md`).
2. **(F1.2) Spec.**
   - Si la feature tiene preguntas abiertas y no existe su `requirements.md`, **ofrece
     `/afinar-feature` primero**. No es bloqueante. Si esa acotación cambia el alcance, el
     comando actualiza el board antes de sembrar.
   - Lanza `spec_author` con el key de la feature. Produce `requirements.md` (EARS, `R1`…),
     `design.md` (con al menos una alternativa descartada) y `tasks.md` (con su sección de
     archivos esperados).
   - **El spec lo commitea el leader.** `spec_author` no tiene shell: escribe los tres archivos
     en el worktree de la feature y devuelve. El leader hace
     `git -C .worktrees/<key>-<slug> add specs/<key>-<slug>` + commit
     `docs(<key>): spec <slug>` y comprueba con `git log -1 --stat` que el commit trae los tres.
     Un spec sin commitear no existe para F1.3 ni para el validador de la rama remota.
   - Si `spec_author` devuelve `BLOQUEADO: ya existe <ref>`, **PARA y pregunta** al humano
     (`docs/specs.md > Antes de especificar: lo que ya existe`). Relanza `spec_author` con su
     decisión: él la escribe como fila en `Decisiones cerradas`.
3. **(F1.3)** Cambia a `spec_ready`, mueve la tarjeta al estado de `spec_ready` (según
   `jira.estados`), comenta en el issue la ruta del spec y haz `git push`.
4. **(F1.4) PARA. Pide aprobación humana.**
   - La forma canónica de aprobar es mover la tarjeta del estado de `spec_ready` al de
     `in_progress` (según `jira.estados`). Un "aprobado" escrito también vale.
   - Si el humano pide cambios, vuelve a F1.2.
   - Si el `design.md` propone una librería nueva, la aprobación del spec la incluye: el leader
     añade su fila a `docs/dependencias.md`.

### F2 — Implementación

5. **(F2.0)** Cambia a `in_progress` y asegura la tarjeta en el estado de `in_progress`. Repite
   `archivos-en-vuelo.mjs --candidata <key>`: si ahora choca, espera o pide la aceptación del humano.
6. **(F2.1)** Lanza `implementer` en el worktree.
   - Sigue `tasks.md` una por una, marcando `[x]`, y escribe `progress/impl_<key>.md` (archivos
     tocados, mapa `R<n> -> test`, salida de los tests que corrió).
   - **Al cerrar cada tanda:**
     - el leader corre `./init.sh` (rápido) en el worktree y reindexa el grafo;
     - `git push`, sin excepción: así tus archivos son visibles para el resto del equipo;
     - se actualiza `progress/features/<key>.md > Tandas`.
7. **(F2.2)** Lanza `reviewer`, que escribe `progress/review_<key>.md`. Los hallazgos mayores
   bloquean: se vuelve al implementer.
   - **La vuelta 2 y siguientes se acotan a los arreglos.** El leader pasa el rango
     `<HEAD de la review anterior>..HEAD` y la lista de hallazgos. El reviewer no rehace la
     trazabilidad completa.
   - **Se amplía solo si** el arreglo enmienda el spec, toca piezas compartidas (esquema,
     migraciones, componentes compartidos), es masivo, o el humano lo pide. El leader dice cuál
     aplica (`docs/gate.md > La vuelta 2 del reviewer`).
8. **(F2.3) Sincronizar.** El **implementer**, en el worktree:
   - `git fetch origin <integracion>` y `git merge origin/<integracion>`.
   - Resuelve los conflictos triviales. Si uno es ambiguo, **pregunta al humano** y anótalo en
     `progress/features/<key>.md`.
   - Si el merge trae migraciones, las aplica a la base de la feature antes de verificar
     (`docs/verification.md`).
   - `git push`.
9. **(F2.4) PR.** El **leader**:
   - Corre `./init.sh` (rápido) en el worktree. Debe salir en verde.
   - Si la feature toca un flujo crítico (`CHECKPOINTS.md`), confirma que el implementer corrió
     en local los E2E que escribió o tocó (`pnpm exec playwright test <spec>`), con la salida en
     `impl_<key>.md`.
   - `gh pr create --base <integracion> --title "feat(<key>): <descripción>"`.
   - `gh pr checks <n> --watch`: espera a `gate-completo` en CI.
     - Si sale **rojo**, vuelve al implementer con el detalle; `./init.sh --completo` lo
       reproduce en local.
     - Solo con verde reporta la URL del PR al humano para el merge.
10. **(F2.5) Cerrar.** Cuando el humano mergea:
    - cambia a `done`, mueve la tarjeta al estado de `done` y comenta la URL del PR en el issue;
    - `./scripts/wt.sh done <key>-<slug>` (con `--assume-merged` si el merge fue squash);
    - borra el proyecto del grafo (`delete_project`).

    Si `wt.sh` dice **HOLD**, no fuerces: anótalo en `progress/deudas.md` y sigue.
11. **(F2.6) Registrar.**
    - Completa `progress/features/<key>.md > Cierre`: resumen, PR, deudas que deja. Ese archivo
      queda como historial de la feature.
    - **Poda el baseline de rojos:** el resumen del run de CI (`gh run view`) lista las entradas
      de `tests/baseline-rojos.json` que ya pasan. Se borran, o se escribe por qué se quedan
      (`docs/gate.md > Rojos heredados`).

## Quién corre qué

| Quién | Qué corre |
| --- | --- |
| `frontend_dev` / `backend_dev` | `pnpm typecheck`, `pnpm lint` y **solo** `pnpm exec vitest related --run <sus archivos>`; los E2E que escriban, por archivo |
| `reviewer` | lo que necesite para verificar sus hallazgos |
| **leader** | `./init.sh` (rápido) al cerrar cada tanda y antes del PR; `gh pr checks` antes de pedir el merge |
| **CI** | `./init.sh --completo` en cada PR a integración; además el E2E en el PR a producción |

**Ningún subagente corre la suite completa.** Hay dos razones:
- una corrida larga sin salida corta el stream de la API y mata al subagente;
- el subagente no tiene contexto para juzgar un rojo ajeno.

## Qué puede editar el leader

- **Puede editar:**
  - `progress/**` y `feature_list.json`;
  - `arnes.config.json`;
  - la fila de una dependencia aprobada en `docs/dependencias.md` (F1.4);
  - `tests/baseline-rojos.json`, solo para podar (F2.6).
- **Nunca edita:** código de la app ni tests. Eso lo hacen los subagentes.

## Regla anti teléfono-descompuesto

Los subagentes **no** devuelven su trabajo por el chat: escriben en disco y devuelven qué archivo
escribieron y un veredicto de una línea. Si necesitas el detalle, lee el archivo, por sección.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
