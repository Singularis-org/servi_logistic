---
description: Interroga una mejora al arnes, detecta los ejes que omitiste y propone el parche exacto
argument-hint: <la mejora en bruto, en una frase>
---

Vas a convertir una mejora al arnes dicha en bruto en una regla completa y verificable.

Mejora en bruto: **$ARGUMENTS**

Alcance: **solo el arnes y el perfil del proyecto**:
- **del arnes**: todo lo que lista `arnes.manifest` (`CLAUDE.md`, `AGENTS.md`, `CHECKPOINTS.md`,
  `.claude/agents/`, `.claude/commands/`, `.claude/hooks/`, `.claude/settings.json`, `init.sh`,
  los `docs/` y `scripts/` del arnes);
- **del perfil**: `arnes.config.json` y los docs de `arnes.config.json > perfil.docs`.

Si lo que te pidieron es un requisito de producto
(una pantalla, un endpoint, un flujo de negocio), **no uses este comando**: eso entra por el
board de Jira → F0 → `spec_author` (`docs/specs.md`). Dilo y para — y di a donde: si la ficha ya
esta en el board, se acota con **`/afinar-feature`** antes del spec; si todavia no existe, se crea
primero en Jira.

## Paso 1 — Encuadre

Lee lo necesario para saber **donde vive hoy** lo que se quiere cambiar: `CLAUDE.md`,
`AGENTS.md`, el archivo de agente afectado y el `docs/*.md` relacionado. No asumas el destino:
"el front" es `.claude/agents/frontend_dev.md` (o `docs/perfil-agentes.md > frontend_dev` si la regla es del proyecto); "el proceso" puede ser `AGENTS.md` o `docs/`.
Si no puedes determinar el destino leyendo, eso es un hueco mas (regla 6 de `CLAUDE.md`: no
inventes). Comprueba tambien si la regla **ya existe** en alguna forma: si existe, el trabajo
es afinarla, no duplicarla.

## Paso 2 — Checklist de ejes de omision

Recorre los diez ejes. Para cada uno decide: **¿la frase original ya lo resuelve?** Si si, es
un eje resuelto y no se pregunta. Si no, es un hueco.

1. **Simetria / conjunto completo.** Se nombro un miembro de un grupo obvio: ¿y el resto?
   Android → iOS y web escritorio; `frontend_dev` → `backend_dev`; `create` → `update`/`delete`;
   `dev` → `main`. Este es el eje que mas huecos produce.
2. **Alcance por agente.** ¿Que subagentes heredan esto? ¿El `reviewer` tiene que conocerlo
   para poder rechazar? Una regla que solo vive en el agente que la ejecuta no se hace cumplir.
3. **Fuerza.** ¿Consejo, regla, o bloqueante? Sin esto no se aplica igual dos veces seguidas.
4. **Quien lo verifica.** Reviewer humano, agente `reviewer`, `./init.sh`, un hook de
   `.claude/settings.json`, o nadie. Una regla sin verificador es una nota — y hay que decirlo
   en voz alta (regla 5 de `CLAUDE.md`: verificacion ejecutable).
5. **Retroactividad.** ¿Solo codigo nuevo, o hay que arreglar lo ya escrito? Si es lo segundo,
   de aqui sale una feature para el board, no solo un parche de markdown.
6. **Donde vive.** Archivo de agente (instruccion operativa, corta, imperativa) · `docs/` (el
   porque y el detalle) · `CLAUDE.md` (solo si es no negociable). Si se cita en dos sitios: una
   es la fuente, la otra enlaza. Nunca dos copias del mismo texto.
7. **Excepciones.** ¿Hay salida de emergencia? ¿Como se documenta cuando alguien la usa?
8. **Coste implicito.** Que prohibe o encarece esta regla: librerias que quedan descartadas,
   trabajo extra por PR, tiempo de gate. Decirlo evita que se revierta en tres semanas.
9. **Ejemplo concreto.** ¿Que caso real habria evitado esta regla? Si no lo sabes y el humano
   no lo da, marcalo como no verificado; no lo inventes.
10. **Arnes o perfil.** ¿Sirve a cualquier proyecto que use el arnes, o solo a este (su stack,
    su dominio, sus incidentes)? Decide donde se aplica el parche (paso 5). Mira
    `arnes.manifest`: si el archivo destino esta ahi, es del arnes.

## Paso 3 — Preguntar

Pregunta **solo los huecos reales**, con `AskUserQuestion`, en tandas de hasta 4 preguntas.
Pon tu recomendacion como primera opcion y etiquetala `(Recomendado)`. No rellenes tandas con
preguntas de adorno: si solo hay un hueco, haz una pregunta.

Antes de preguntar, enumera en una linea los ejes que ya estaban resueltos, para que se vea que
no los ignoraste.

Si no queda ningun hueco, dilo y pasa directo al paso 4.

## Paso 4 — Proponer el parche, sin escribir

Devuelve, en este orden:

- **Requisito refinado** — 2 a 4 lineas, ya con las decisiones tomadas.
- **Parche propuesto** — por archivo: la ancla exacta (seccion, numero de regla siguiente) y el
  texto literal a insertar. Respeta el estilo del destino: numeracion continua, viñetas
  anidadas, imperativo en español, y la convencion de tildes **que ya use ese archivo** (no
  la cambies a medias en un parche).
- **Donde se aplica** — arnes (plantilla) o perfil (proyecto), segun el eje 10.
- **Efectos colaterales** — si el eje 4 dice que lo verifica el `reviewer`, el parche incluye
  tambien la linea en `.claude/agents/reviewer.md` (regla del arnes) o en `docs/perfil-agentes.md > reviewer` (regla del proyecto); si es bloqueante, la mencion en `CLAUDE.md`.
- **Regla arriba, historia abajo.** La regla va en imperativo al principio de su seccion. Si nace
  de un incidente concreto, el incidente (fecha, key, que paso) va en una subseccion
  `### Por que` al final de esa misma seccion (`docs/lectura.md > Escribir para que se lea
  barato`). En el archivo del agente, solo la instruccion corta. No uses titulos fechados: los
  `##` se citan desde otros archivos y una fecha en el titulo rompe las citas.
- Si cambias un titulo `##` que se cita desde otro archivo (`grep -rn "<archivo> > <titulo>"`),
  el parche incluye tambien esas citas.

**No escribas nada hasta un si explicito.**

## Paso 5 — Aplicar, en el sitio correcto

- **Mejora del perfil del proyecto** (eje 10: solo sirve aqui) → aplica el parche en el
  proyecto, en `arnes.config.json` o en el doc del perfil, y actualiza su marcador
  `<!-- perfil: revisado=AAAA-MM-DD por=<nombre> -->`.
- **Mejora generica del arnes** (archivos de `arnes.manifest`) → se aplica aqui y **se sube a la
  plantilla** (`singularis-co/harness_config`) por el camino mecanico, nunca a mano:
  1. Antes de tocar nada: `./scripts/arnes-sync.sh` (dry-run). Si la plantilla trae cambios
     (`↓`), baja primero con `./scripts/arnes-sync.sh --aplicar`: asi tu mejora parte de la ultima
     version y no choca.
  2. Aplica el parche en el proyecto y corre `./init.sh` en verde.
  3. Commit en una rama del proyecto (`chore/arnes-<slug>`).
  4. **`./scripts/arnes-sync.sh --subir -m "<titulo de la mejora>"`**: crea la rama
     `mejora/<proyecto>-<slug>-<fecha>` en la plantilla con los archivos del arnes que cambiaste,
     abre el PR alli y **actualiza `arnes.lock.json`**. Si sale «conflicto», la plantilla cambio
     esos mismos archivos: baja, integra a mano, `--aplicar --resuelto <archivo>` y repite.
  5. Commit de `arnes.lock.json` en la MISMA rama, push y PR al proyecto. Da al humano las dos
     URLs: la del PR de la plantilla y la del proyecto. Cuando se mergeen los dos, el proyecto ya
     queda «al dia»: **no hace falta un `--aplicar` ni un PR extra**. Si cambia el contrato, el
     PR de la plantilla lleva `arnes_version` y `CHANGELOG.md` al dia. Los demas proyectos la
     reciben con su propio sync.
- Si `--subir` no puede (sin red, sin `gh`), la mejora queda en el proyecto y el gate la sigue
  avisando como «sin subir»: no se pierde. Dilo y anotalo en `progress/deudas.md`.

Termina con `./init.sh` en verde (en el proyecto, tras el sync o tras el parche del perfil) y
listando los archivos modificados, y en que repo.
