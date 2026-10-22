---
description: Interroga una feature del board, detecta las decisiones que omitiste y siembra su requirements.md
argument-hint: <el key de la feature (QC-14)>
---

Vas a cerrar el alcance y las decisiones de una feature **antes** de que `spec_author` escriba,
y a dejarlas sembradas en `specs/<key>-<slug>/requirements.md`.

Feature: **$ARGUMENTS**

Alcance: **solo features del board**. Si lo que te pidieron es una mejora al arnés (una regla, un
`docs/*.md`, un archivo de agente, el gate), **no uses este comando**: eso entra por
`/afinar-regla`. Dilo y para.

Este comando **no invierte el orden SDD** (regla 2 de `CLAUDE.md`): no dicta tasks ni diseño.
Cierra el *qué* y sus fronteras; los requisitos EARS, el `design.md` y el `tasks.md` los sigue
escribiendo `spec_author` en F1.2.

## Paso 0 — Guardas

Para, di por qué y no escribas nada si:

- La ficha **no existe en `feature_list.json`**. Las features nacen en el board y entran por F0
  (`docs/jira.md`). Créala allí primero.
- La ficha tiene **assignee de otra persona**. No es tuya: quien la tiene es quien la acota
  (`docs/equipo.md > Tomar una feature`).
- La ficha **no está tomada por ti** (sin worktree en `.worktrees/<key>-<slug>/`). Lo que este
  comando siembra es de la rama de la feature (`docs/equipo.md > Qué estado es de quién`):
  tómala antes (`AGENTS.md > F1.0`) o para. Puedes conversar el alcance sin tomarla, pero no
  escribes nada.
- La ficha está en `spec_ready`, `in_progress` o `done`. **El spec ya existe y no se pisa.** Si
  hay que cambiar algo, es una revisión del spec por F1.2, no un sembrado.
- Ya existe `specs/<key>-<slug>/requirements.md`. **No se sobrescribe.** Ofrece añadir filas a su
  tabla de decisiones, y solo eso.

## Paso 1 — Encuadre

Lee lo necesario para saber qué está ya decidido. No asumas:

- `feature_list.json`: **solo esa ficha**, consultada por `key` (`docs/lectura.md`; el archivo
  no se lee entero) — `description` (el único campo que escribe el humano), `zone`,
  `complexity`, `depends_on`, `epic`, `assignee`.
- `docs/architecture.md`: `> Dominio`, `> Preguntas abiertas del dominio` (las cuatro que son
  caras de meter después), el patrón de capas y `> Dependencias de terceros`.
- `docs/conventions.md` y `CHECKPOINTS.md`.
- `progress/features/<key>.md` (`> Evaluación`, `> Decisiones`, `> Preguntas abiertas`) y
  `grep "<key>" progress/deudas.md`. **Si la ficha ya tiene encargos o preguntas abiertas
  anotadas ahí, son la entrada del paso 3: no las reinventes.**
- **Precedentes.** Las decisiones ya cerradas en los specs escritos (`specs/4-*`, `specs/10-*`,
  `specs/11-*`). **Búscalas por `grep -i "decisiones cerradas"`, no por un heading exacto: el
  formato ya diverge.** La 11 usa `## Decisiones cerradas (no reabrir)` con tabla; la 4 usa
  `## Decisiones cerradas por el humano (<fecha>)` con lista numerada. Si buscas solo uno de los
  dos te saltas medio repo — y la 4 es justo la que fija el borrado lógico y los identificadores
  en inglés.
  Lo que ya se decidió una vez **no se vuelve a preguntar**: se propone como heredado, citando de
  qué feature viene, y solo se pregunta si esta feature tiene un motivo concreto para apartarse.
- **Lo que ya existe.** Busca en el board, en `specs/` y en el código, como manda
  `docs/specs.md > Antes de especificar: lo que ya existe`. **Si aparece algo, es la primera
  pregunta del paso 3** y es bloqueante: no se siembra hasta que el humano decida.

## Paso 2 — Checklist de ejes de ambigüedad

Recorre los ejes. Para cada uno decide: **¿la `description` ya lo resuelve?** Si sí, es un eje
resuelto y no se pregunta. Si no, es un hueco. Los ejes salen de las preguntas que realmente han
aparecido en los specs de este repo, no de una lista genérica.

### Datos y persistencia (si la `zone` es `backend`)

1. **Obligatoriedad** de cada campo. Se preguntó en la 4 (teléfono y fecha de nacimiento).
2. **Unicidad**, y si es sensible a mayúsculas. La 4 la fijó case-insensitive para correo y
   usuario.
3. **Tipo y precisión de los números**: ¿entero o decimal? ¿se admite negativo? Es pregunta
   abierta viva de la 14. Nunca `float` para importes.
4. **Borrado**: físico o lógico, y `created_at` / `updated_at` / `deleted_at`. La 4 lo fijó
   lógico: propónlo heredado.
5. **Conjunto cerrado**: ¿enum de Prisma, tabla propia o texto libre? ¿Tiene que crecer sin
   migrar los datos ya guardados? Es lo que decidió el tipo de documento en la 4 y la
   presentación en la 14.
6. **Idioma de los identificadores** de la DB. La 4 los fijó en inglés: propónlo heredado.

### Pantalla (si la `zone` es `frontend`)

7. **Estados**: vacío, cargando, error. Qué se muestra y qué no.
8. **Qué entra por props** y qué obtiene el componente por su cuenta. Los componentes privados
   reciben por props (`docs/architecture.md > Permisos y autenticacion`).
9. **Qué es placeholder y qué es definitivo.** Los 5 ítems de navegación de la 11 son deuda
   registrada justo por no haberlo dicho: hoy enlazan a rutas que dan 404.

### Frontera (siempre)

10. **Qué NO entra**, y a qué ficha va. Es la frase que hace que las descripciones buenas del
    board funcionen: «El alta y la consulta van aparte».
11. **Qué se hereda ya montado** de una feature anterior y no se re-crea. La T0 de
    `specs/11-*/tasks.md` existe por esto; sin ella, la 11 habría vuelto a montar shadcn y Vitest
    — que es exactamente el choque que sí ocurrió entre la 4 y la 10.
12. **Permiso y rol**: ¿quién puede? La autorización se valida **en el service**
    (`docs/architecture.md > Acceso a datos y autorizacion`) y `docs/checkpoints-proyecto.md > Datos y seguridad` exige su test.

### Verificación y coste (siempre)

13. **¿Hace falta E2E?** `CHECKPOINTS.md` lo pide para flujos críticos (`docs/checkpoints-proyecto.md > Flujos criticos`: autenticación, permisos,
    movimientos de inventario, importes, webhooks). Si se difiere, **se difiere aquí y con
    motivo**, no al final.
14. **¿Librería o a mano?** Regla 7 de `CLAUDE.md` y la lección más cara del repo: la primera
    versión de la 5 implementó scrypt a mano, llegó completa hasta el PR y se rehízo con bcrypt.
    Si ya se sabe que se quiere una librería, decirlo ahora ahorra un spec entero.
15. **Preguntas abiertas del dominio.** Si la feature toca unidades de medida, lote y
    vencimiento, FDS/GHS o contabilidad (`docs/architecture.md > Preguntas abiertas del
    dominio`), es bloqueante de negocio: se pregunta.

## Paso 3 — Preguntar, en lenguaje llano

Pregunta **solo los huecos reales**, con `AskUserQuestion`, en tandas de hasta 4 preguntas. Pon tu
recomendación como primera opción y etiquétala `(Recomendado)`. Si solo hay un hueco, haz una
pregunta.

Antes de preguntar, enumera en una línea los ejes que ya estaban resueltos **y los precedentes que
propones heredar**, para que se vea que no los ignoraste ni los estás re-preguntando.

Reglas de redacción de las preguntas:

- **En lenguaje de negocio, no técnico.** No «¿enum de Prisma o tabla propia?», sino «¿va a haber
  que agregar presentaciones nuevas con el tiempo, sin tocar lo ya cargado?».
- **Si la pregunta es de negocio y no es trivial, la opción lleva un ejemplo concreto** en su
  `description`, con datos del ERP: «un bidón de 20 L de hipoclorito que entra como 1 bidón pero
  se despacha en litros». Usa `preview` cuando lo que se compara son dos formas distintas del
  mismo dato.
- **Lo que quede sin decidir no se rellena con supuestos** (regla 6 de `CLAUDE.md`): va a
  `## Preguntas abiertas` y `spec_author` lo hereda como tal.

## Paso 4 — Proponer, sin escribir

Muestra el archivo **tal cual quedaría** y, aparte, la lista de lo que queda abierto y por qué.

**No escribas nada hasta un sí explícito.**

## Paso 5 — Si el alcance cambió, actualiza el board PRIMERO

**Bloqueante. Va antes de escribir nada en disco.**

La acotación puede dejar el board desactualizado de tres formas. Recórrelas en orden; si
ninguna aplica, salta al paso 6.

1. **Campos que quedaron mintiendo.** Compara lo acordado con la ficha y mira estos cuatro:
   `description`, `complexity`, `zone`, `depends_on`.
2. **Trabajo que quedó sin ficha.** Todo lo que el bloque «Lo que NO entra» mande a otra
   feature necesita una ficha que exista. Si no existe, es una ficha nueva.
3. **Fichas que quedaron huérfanas.** Si lo acordado absorbe una ficha existente o la deja sin
   alcance, esa ficha ya no describe trabajo real.

Para cualquiera de las tres: redacta el valor nuevo, muéstralo, y **con un sí explícito
escríbelo en el issue** con las herramientas MCP de `atlassian`. Recién entonces siembras.

- **Antes de crear una ficha, búscala** en el board con la JQL de `docs/specs.md > Antes de
  especificar: lo que ya existe`. Si ya existe, no se crea: «Lo que NO entra» cita la existente.
- **Una ficha nueva se crea completa o no se crea:** en el proyecto que declara
  `arnes.config.json > jira.project` —no en uno elegido por contexto—, tipo `Tarea`, sin
  assignee,
  `parent` puesto a la épica del módulo, el link **«is blocked by»** hacia lo que la bloquea, y los labels del contrato
  (`sdd`, `slug:<kebab-case>`, `zone:<...>`, más `complexity:<...>` **solo si la acotación ya
  lo sabe**; si no, se deja fuera y lo asigna el leader en F1.0). Una ficha a medias es peor
  que ninguna: F0 la importa igual y aterriza en el backlog sin slug ni zona.
  **No la siembras.** Nace en el estado de `pending` (según `jira.estados`) y se acota cuando le toque, con su propia
  corrida de este comando.
- **Una ficha huérfana se mueve al estado de `cancelled`** (según `jira.estados`), con un comentario en el
  issue que diga por qué y qué ficha la absorbe. **Nunca se borra.**
- **Si el humano dice que no: no siembres.** Un spec construido sobre un alcance que la tarjeta
  contradice es la divergencia que `docs/jira.md` existe para evitar. Para y dilo.
- **Si el MCP de `atlassian` no responde**, no tires el trabajo: siembra igual, pero mete el
  marcador como **primera línea** del archivo —
  `<!-- board-pendiente: <key> · <qué quedó sin escribir> · <motivo> -->`. Sirve para las tres
  formas: campos sin editar, ficha nueva sin crear, ficha huérfana sin cancelar. El bloque 5 de
  `scripts/validate-features.mjs` deja el gate en **rojo** mientras siga puesto. Avisa al humano
  de que `./init.sh` va a fallar hasta que actualice el issue y borre la línea.

El porqué, la tabla de los cuatro campos y el incidente que originó esta regla:
`docs/jira.md > Cuando el disco descubre que el board está desactualizado`.

## Paso 6 — Sembrar, tras el sí

Crea `specs/<key>-<slug>/requirements.md`, **en el worktree de la feature**, con esta estructura, que es la que ya usa
`specs/11-layout-privado-con-sidebar/requirements.md`:

> `# <key> — <slug> · requirements.md`
>
> Bloque de cita con `Zona` · `Complejidad` · `depends_on` · `Rama`, seguido de **Alcance** (dos a
> cuatro líneas en llano: lo que entra) y **Lo que NO entra** (y a qué ficha va). Cierra el bloque
> con la nota de sembrado: *"Sembrado por `/afinar-feature` el `<fecha>`. El bloque de Alcance y la
> tabla de «Decisiones cerradas» los fijó el humano ANTES del spec. `spec_author` los respeta, no
> los reabre y no los reescribe: su trabajo aquí es `## Requisitos (EARS)`."*
>
> Después, tres secciones y nada más:
>
> - `## Requisitos (EARS)` — con el marcador `_Pendiente: los escribe spec_author (F1.2)._`
> - `## Preguntas abiertas` — las que quedaron genuinamente abiertas, o «Ninguna.»
> - `## Decisiones cerradas (no reabrir)` — tabla `| Fecha | Pregunta | Decisión |`, anotando en
>   la decisión de qué feature se hereda cuando aplique.

Después, en este orden:

- **Refleja en `feature_list.json` (la copia local, en la raíz del worktree principal) lo que
  acabas de escribir en el board**, y solo eso: la ficha
  acotada más las que el paso 5 creó o canceló. **No reimportes el board entero** — eso es F0, y
  un comando de acotación no tiene por qué reescribir fichas `in_progress` que no está tocando.
  Los campos se derivan como manda `docs/jira.md > El contrato de campos`: `name` del label
  `slug:`, `branch` como `feature/<key>-<slug>`, `spec_path` como `specs/<key>-<slug>`, `epic`
  del `parent` y `epic_name` de su summary. Una ficha nueva entra con `status: "pending"` y
  `assignee: null`. Si el
  paso 5 no escribió nada en el board, aquí tampoco se escribe nada.
- Añade **una línea** en `progress/features/<key>.md > Decisiones` apuntando al archivo. **No
  copies la tabla**: una es la fuente, la otra enlaza.
- Si alguna respuesta cerró una de las cuatro preguntas abiertas del dominio, actualiza
  `docs/architecture.md > Preguntas abiertas del dominio`.
- **No muevas de estado la ficha que estás acotando.** Sigue `pending` y su `status`
  no cambia: quien lo mueve es el leader en F1.3. Los únicos empujones a Jira de este comando son
  los tres del paso 5: editar los cuatro campos, crear la ficha que falta y cancelar la huérfana.
- Corre `./init.sh` (rápido por defecto) en el worktree de la feature y haz `git push`.

Termina listando el archivo escrito y una línea de veredicto. No pegues el contenido completo en
el chat.
