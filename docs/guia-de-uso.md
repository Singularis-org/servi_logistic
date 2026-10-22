# docs/guia-de-uso.md — Cómo se usa el arnés, con el agente o a mano

Cada acción tiene dos caminos:
- **Con el agente:** lo que le dices a Claude Code, abierto en la raíz del repo. Ahí actúa como
  *leader*.
- **A mano:** los comandos o clics equivalentes, por si trabajas sin agente o quieres comprobar lo
  que hizo.

Los dos caminos dejan el mismo estado. Puedes mezclarlos.

## 1. Montar tu máquina (una vez)

| Paso | Con el agente | A mano |
| --- | --- | --- |
| Dependencias y `.env` | «prepara el entorno» | `cp .env.example .env` (rellena los valores) · `pnpm install` |
| Tu identidad de Jira | `/jira-connect` | crea `.arnes.local.json` en la raíz del worktree principal: `{"jira_account_id": "<tu accountId>", "nombre": "<tu nombre>"}`. El accountId sale de tu perfil de Jira (la URL de tu perfil lo termina) |
| Copia del board | «importa el board» (paso F0) | no hay atajo manual práctico: F0 consulta Jira por MCP. Sin él, trabaja con la copia que haya y avísalo |
| Comprobar que todo está bien | «corre el gate» | `./init.sh` → debe terminar en `== init OK ==` |

Si ya tenías features en curso **antes** del arnés v2: asígnatelas en Jira (campo *Responsable*).
Si no, el gate se pone en rojo con «features en vuelo sin assignee».

## 2. Empezar el día

| Qué | Con el agente | A mano |
| --- | --- | --- |
| Ver dónde lo dejé | se muestra solo al abrir Claude Code (hook `SessionStart`) | lee `progress/sesion.local.md` |
| Ver mis features en vuelo | idem | `node -e "const f=require('./feature_list.json').features;const yo=require('./.arnes.local.json').jira_account_id;console.table(f.filter(x=>['spec_ready','in_progress'].includes(x.status)&&x.assignee?.accountId===yo).map(x=>({key:x.key,name:x.name,status:x.status})))"` |
| Refrescar el board | «importa el board» | — (ver arriba) |

## 3. Tomar una feature

| Paso | Con el agente | A mano |
| --- | --- | --- |
| Elegir | «toma la siguiente feature» o «toma QC-123» | elige en el board una tarea **sin responsable** cuya dependencia esté hecha |
| Comprobar choques con el equipo | lo hace solo | `node scripts/archivos-en-vuelo.mjs --candidata QC-123` → `exit 1` = choca, espera; con otra persona, `--acepto <key>` si el humano lo acepta |
| Asignártela | lo hace solo (relee, asigna, relee) | en Jira: *Responsable* = tú. Recarga y confirma que sigue siendo tuya |
| Candado y worktree | lo hace solo | `./scripts/wt.sh new QC-123 <slug>`. Si sale **`TOMADA`** (código 4), otro ganó: quítate de responsable y elige otra |
| Etiquetas | lo hace solo | en el issue, labels `zone:<frontend\|backend\|fullstack>` y `complexity:<low\|medium\|high>` |

Tu cupo es **personal**: `arnes.config.json > cupos_por_persona` (2 frontend, 3 backend y 3 fullstack
en curso a la vez).

## 4. Del spec al PR

| Paso | Con el agente | A mano |
| --- | --- | --- |
| Acotar antes del spec (opcional) | `/afinar-feature QC-123` | escribe `specs/QC-123-<slug>/requirements.md` con alcance, decisiones y preguntas abiertas |
| Spec | «escribe el spec» (lanza `spec_author`) | crea `requirements.md` (EARS `R1…`), `design.md` (+ una alternativa descartada) y `tasks.md` (con `## Archivos esperados`) — `docs/specs.md` |
| **Aprobar el spec** | — (lo decides tú) | mueve la tarjeta del estado de `spec_ready` al de `in_progress` (según `arnes.config.json > jira.estados`), o escribe «aprobado» al agente |
| Implementar | «implementa» (lanza `implementer`) | trabaja dentro de `.worktrees/QC-123-<slug>/`, marca `[x]` en `tasks.md` |
| Cerrar una tanda | lo hace solo | `./init.sh` en el worktree + `git push` (**siempre**: así el equipo ve lo que tocas) |
| Revisión | «revisa» (lanza `reviewer`) | recorre `CHECKPOINTS.md` y `docs/checkpoints-proyecto.md`; cada `R<n>` con su test |
| Sincronizar | lo hace solo | `git fetch origin dev && git merge origin/dev && git push` |
| Abrir el PR | lo hace solo | `./init.sh` · `gh pr create --base dev --title "feat(QC-123): …"` |
| Esperar el CI | lo hace solo (`gh pr checks --watch`) | mira el check **`gate-completo`** en el PR (~25 min). Rojo → `./init.sh --completo` lo reproduce en local |
| **Mergear** | — | solo con `gate-completo` en **verde** (en el plan gratuito GitHub no lo impide: es regla nuestra) |

## 5. Cerrar la feature (tras el merge)

| Paso | Con el agente | A mano |
| --- | --- | --- |
| Estado y tarjeta | «cierra QC-123» | tarjeta al estado de `done` (según `jira.estados`) + comentario con la URL del PR |
| Desmontar el worktree | lo hace solo | `./scripts/wt.sh done QC-123-<slug>` (añade `--assume-merged` si fue *squash*). Si dice `HOLD`, anótalo en `progress/deudas.md` |
| Registro | lo hace solo | completa `progress/features/QC-123.md > Cierre` |
| Poda del baseline | lo hace solo | en el resumen del run de CI, las entradas de `tests/baseline-rojos.json` que ya pasan: bórralas |

## 6. Al terminar el día

| Con el agente | A mano |
| --- | --- |
| «cierra la sesión» | actualiza `progress/sesion.local.md` (≤ 40 líneas): en qué feature estás, dónde lo dejaste, qué esperas y el siguiente paso |

## 7. Situaciones

| Situación | Con el agente | A mano |
| --- | --- | --- |
| Retomar en otra máquina una feature tuya | «retoma QC-123» | `./scripts/wt.sh --retomar new QC-123 <slug>` |
| Soltar una feature | «suelta QC-123» | quítate de responsable, anota en `progress/features/QC-123.md` hasta dónde llegaste y haz push |
| Anotar una deuda sin feature en curso | «anota la deuda …» | rama `chore/deudas-<fecha>` desde `dev`, bloque `### D<n>` en `progress/deudas.md`, PR |
| El gate avisa que el perfil está vencido | `/arnes-init revisar` | relee el doc, corrígelo y actualiza `revisado=` en su primera línea |
| Mejorar el arnés | `/afinar-regla <la mejora>` (aplica, prueba, la sube y abre los dos PRs) | aplica el cambio · `./init.sh` · commit · `./scripts/arnes-sync.sh --subir -m "<qué mejora>"` (abre el PR en la plantilla y actualiza `arnes.lock.json`) · commit del lock · PR al proyecto |
| Ver si tengo mejoras sin subir | lo dice `./init.sh` (aviso amarillo) | `./scripts/arnes-sync.sh --estado` |
| Traer la última versión del arnés | «sincroniza el arnés» | `./scripts/arnes-sync.sh` (ver) · `./scripts/arnes-sync.sh --aplicar` · `./init.sh` · commit |
| El sync dice «conflicto» | «resuelve el conflicto del arnés» | integra a mano los dos cambios en el archivo · `./scripts/arnes-sync.sh --aplicar --resuelto <archivo>` · `--subir` |
| Proyecto nuevo con el arnés | `/arnes-init` | copia `harness_config` · `cp arnes.config.example.json arnes.config.json` · rellena los docs del perfil · copia `plantillas/github/gate.yml` a `.github/workflows/` |

## 8. Cómo viajan las mejoras del arnés

```
proyecto A ──(--subir)──► PR en harness_config ──(humano mergea)──► plantilla
                                                                       │
proyecto A, B, C ◄──────────────(--aplicar)────────────────────────────┘
```

- **Bajar** (`--aplicar`) trae lo que cambió en la plantilla. **Nunca pisa** un archivo que
  cambiaste tú y no has subido.
- **Subir** (`--subir -m "…"`) lleva tus cambios a archivos del arnés a un PR en la plantilla.
  No sube nada del perfil del proyecto. También actualiza `arnes.lock.json`, que va en el **mismo**
  PR del proyecto. Cuando se mergean los dos PRs (plantilla y proyecto), el proyecto queda al día
  sin nada más. Si la plantilla rechaza o cambia la mejora, el siguiente `--aplicar` baja su
  versión: la plantilla manda.
- `arnes.lock.json` (versionado) recuerda qué versión de cada archivo trajo el último sync. Con él
  el script sabe, archivo por archivo, si cambió la plantilla (`↓`), si cambiaste tú (`↑`) o si
  cambiaron los dos (`!`, conflicto).
- Mientras tengas una mejora sin subir, `./init.sh` lo avisa en amarillo. No bloquea, pero no se
  olvida.
- **No se edita `harness_config` a mano ni se copian archivos entre repos.** Todo pasa por estos
  dos comandos y por un PR que revisa un humano.
