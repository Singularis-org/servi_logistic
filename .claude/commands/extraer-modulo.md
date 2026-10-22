---
description: Analiza un modulo ya construido y extrae su prompt portable y el cuestionario de decisiones que tomo en silencio
argument-hint: <el modulo: un nombre de dominio (login), una carpeta (lib/modules/identity) o un key de feature (QC-14)>
---

Vas a convertir un módulo **ya construido** de este repo en material que otro proyecto pueda
reimplementar: un prompt portable y el cuestionario de las decisiones que el módulo tomó sin
dejarlas escritas.

Módulo: **$ARGUMENTS**

Alcance: **solo módulos con código real en `dev`**. Si te piden extraer una feature que todavía
no tiene código, eso es `/afinar-feature`: no hay nada que leer. Si te piden documentar o cambiar
el arnés (`docs/`, `.claude/`, `CLAUDE.md`, `AGENTS.md`), eso es `/afinar-regla`. Si te piden
*modificar* el módulo, este comando es **solo lectura**. Dilo y para — y di a dónde.

Lo que se extrae no es el código: es el **contrato, la estructura, las invariantes y las
decisiones implícitas**. El código se reescribe en una tarde; las decisiones que nadie escribió se
vuelven a descubrir a golpes en el proyecto destino. Ese es todo el valor de este comando.

## Paso 0 — Guardas

Para, di por qué y no escribas nada si:

- El argumento **no resuelve a ningún archivo**, o resuelve a **uno solo**. Un módulo de un
  archivo no necesita extracción: se pega.
- El código del módulo **solo existe en `.worktrees/`**. No se extrae de una rama sin mergear: el
  prompt describiría algo que nadie tiene, y esas decisiones aún pueden cambiar en el PR.
- Ya existe `extracciones/<slug>/`. **No se sobrescribe.** Ofrece dos salidas y solo esas: añadir
  filas a su `decisiones.md`, o crear `extracciones/<slug>-<fecha>/` como versión nueva.
- La ficha existe en `feature_list.json` (consúltala por `key`, no la leas entera) en `pending`
  o `spec_ready` **y no hay archivos en
  disco**. No hay nada que extraer; lo que se quiere ahí es `/afinar-feature`.
- El cierre transitivo supera **25 archivos** y el humano no ha fijado la frontera. Un módulo de
  60 archivos no produce un prompt portable, produce ruido.

## Paso 1 — Delimitar el módulo

Resuelve el argumento por estos tres modos, en este orden de precedencia, y **anuncia cuál
usaste** — delimitar mal es el fallo caro aquí:

1. **Key de feature** (`QC-14`, o el número suelto de las fichas antiguas como `10`): busca la
   ficha en `feature_list.json` por `key` y toma como semillas los archivos citados en `specs/<key>-<slug>/tasks.md`. Es el modo más rico: el mapa
   `R<n> → test` y las alternativas descartadas de `design.md` vienen ya escritos.
2. **Ruta o glob** (contiene `/`): las semillas son los archivos de esa carpeta.
3. **Nombre de dominio** (`login`, `identity`): semillas por `grep -rl` sobre el término.

Calcula el **cierre transitivo**:

- **Hacia adentro** — desde cada semilla, sigue los imports locales (`@/…`, `./…`)
  recursivamente. Para en `node_modules`, en archivos ya visitados y en `components/ui/*`: los
  primitivos de shadcn se declaran **dependencia asumida**, no se extraen.
- **Hacia afuera** — `grep` inverso por cada símbolo exportado. Los importadores **no entran** al
  módulo: entran a la sección *Contrato público y consumidores*. Esto es lo que evita que extraer
  el login se coma medio repo.
- **Tests** — todo `tests/**` que importe cualquier archivo del cierre. Entran siempre: son el
  criterio de aceptación portable.
- **Specs** — `specs/<key>-*/{requirements,design,tasks}.md`, y las decisiones ya cerradas por
  `grep -i "decisiones cerradas"`, **no por un heading exacto**: el formato ya diverge entre la 4
  y la 11, y buscar solo uno de los dos te salta medio repo.
- **Prohibido `.worktrees/`.**

Muestra la lista de archivos **con el rol de cada uno en una línea** y **pide confirmación antes
de delegar**. Determina también la naturaleza del módulo — `ui`, `datos` o `flujo` — porque
condiciona el eje 13.

## Paso 2 — Inventario, delegado

Delega en el subagente `extractor` (pasada 1) pasándole **solo** el slug, la lista de archivos ya
confirmada, la naturaleza y el SHA actual de `dev`. Él recorre los ejes del Paso 3, los clasifica
con evidencia citada y escribe `extracciones/<slug>/inventario.md`.

Te devuelve la ruta, el conteo por estado y los huecos. **No pegues el inventario en el chat**
(`AGENTS.md > Regla anti telefono-descompuesto`).

## Paso 3 — Los ejes y sus cuatro estados

Estos son los ejes que el `extractor` recorre. Para cada uno decide **uno de cuatro estados**, y
el criterio no es «¿está en el código?» sino **«¿está el *porqué* escrito en alguna parte?»**:

- **RESUELTO** — el código lo hace **y** hay justificación escrita. Va al prompt con su cita.
- **IMPLÍCITA** — el código eligió y existe otra alternativa razonable, pero nadie escribió por
  qué. Va al cuestionario.
- **HUECO** — ni código, ni specs, ni docs. Lo preguntas tú en el Paso 4.
- **NO APLICA** — el eje no tiene sentido para este módulo. **Se declara igual en una línea**: un
  eje omitido en silencio es indistinguible de un olvido.

El desempate entre los dos primeros es la parte fina: la pregunta no es «¿el código es claro?»
sino **«¿otro proyecto razonable habría elegido lo contrario?»**. `login-stub.ts` devuelve siempre
`{ok:false}` y está justificado en R18/R19 con su comentario de costura → RESUELTO. En cambio
`GENERIC_CREDENTIALS_ERROR` eligió mensaje genérico sobre específico y en ningún sitio dice «para
no enumerar usuarios» → **IMPLÍCITA**, aunque el código sea cristalino.

Y la regla anti-inflación: solo es IMPLÍCITA si se puede nombrar **una alternativa concreta y su
consecuencia**. Si no, es RESUELTO. Sin esto el cuestionario llega a 60 filas y deja de leerse.

### Producto: el qué y sus decisiones implícitas (siempre)

1. **Propósito y actor.** Quién lo usa, qué consigue, camino feliz en una frase. Si no puedes
   escribir esa frase leyendo el código, el módulo está mal delimitado: vuelve al Paso 1.
2. **Forma de la entrada primaria.** Qué se le pide al usuario y por qué esa forma: usuario y
   contraseña, OTP, magic link, SSO.
3. **Camino de recuperación y quién lo ejecuta.** ¿El usuario recupera solo, o lo hace un admin?
4. **Quién obtiene acceso.** Autoregistro abierto, invitación, alta administrada.
5. **Estado y duración de la sesión.** Cookie, JWT o servidor; expiración, renovación, cierre, qué
   pasa al recargar.
6. **Autorización y roles.** Quién puede qué y **dónde se valida** — en este repo, en el service
   (`docs/architecture.md > Acceso a datos y autorizacion`), con test exigido por `docs/checkpoints-proyecto.md > Datos y seguridad`.
7. **Política de fallo hacia el usuario.** Mensaje genérico o específico, enumeración de usuarios,
   rate limit o bloqueo por intentos, auditoría del intento fallido, timing. Es el eje con más
   decisiones implícitas de cualquier módulo de autenticación, y el que el receptor más necesita
   que le expliquen.

### Estructura interna (siempre; el 13 solo si la naturaleza es `datos` o `flujo`)

8. **Mapa de capas y flujo de datos.** Archivo a archivo, quién llama a quién, ordenado por el
   camino de la petición.
9. **Contrato congelado.** Los tipos, esquemas y constantes que son la frontera pública y que
   otras features prometieron no cambiar. Es la única parte que se transcribe literal.
10. **Puntos de costura y stubs.** Qué está deliberadamente enchufado a nada, quién lo reemplaza y
    qué firma debe respetar el reemplazo.
11. **Invariantes y validación.** Las garantías que el código sostiene y que un reimplementador
    rompería sin darse cuenta. Cada una **con la consecuencia de romperla**.
12. **Máquina de estados y su forma serializada.** Los estados de UI y cómo se representan —
    incluidos los que están **ausentes a propósito**, que también son una decisión.
13. **Datos persistidos.** Entidades y campos, obligatoriedad, unicidad y si es sensible a
    mayúsculas, conjunto cerrado como enum o tabla o texto libre, borrado físico o lógico,
    timestamps, idioma de los identificadores. Las unicidades parciales escritas a mano no se
    traducen solas a otro ORM: son lo primero que se pierde al portar.

### Portabilidad: qué es del stack y qué sobrevive (siempre)

14. **Acoplado al framework.** Qué existe solo porque es Next App Router — `'use server'`,
    `useActionState`, `redirect()`, los route groups, el par server/client component — cada uno
    **con su equivalente nombrado** en otro stack.
15. **Acoplado a librerías.** Por cada una: qué aporta y cuál es el requisito abstracto que
    sobrevive si se sustituye («validación de esquema declarativa con errores por campo», no
    «zod»).
16. **Acoplado al proyecto.** Rutas literales, copys en español, nombres de dominio,
    identificadores de DB en inglés. Es la tabla de *parámetros a reemplazar*.
17. **El núcleo invariante.** Lo que debe cumplirse en cualquier stack, redactado como **requisitos
    EARS reusables** (las cinco formas de `docs/specs.md`) ya despegados del stack. Es la sección
    que hace útil al prompt portable.

### Fronteras y verificación (siempre)

18. **Lo que el módulo NO hace, y de qué tipo es cada ausencia.** Tres tipos que no se mezclan:
    **deliberado** (va a otra feature), **stub** (hay hueco con firma) y **deuda** (debería estar
    y no está).
19. **Provisionalidad.** Qué es placeholder y qué definitivo. La técnica del login —copys marcados
    provisionales y tests que afirman sobre la constante, nunca sobre el literal— es transferible
    y va al prompt.
20. **Tests como criterio de aceptación.** Por cada uno: qué caso fija, qué `R<n>` cubre, y si es
    **transferible** (comportamiento) o **del stack**. Si falta E2E, decirlo con motivo:
    `CHECKPOINTS.md` lo exige para los flujos críticos de `docs/checkpoints-proyecto.md > Flujos criticos`, autenticación incluida.
21. **Dependencias asumidas ya montadas.** Lo que el módulo da por hecho y no crea: primitivos de
    `components/ui/`, Tailwind, el layout público, el tooling de tests. Omitir esto es la causa
    clásica de que el receptor reimplemente shadcn entero.

## Paso 4 — Preguntar, en lenguaje llano

Pregunta **solo los HUECOS**, con `AskUserQuestion`, en tandas de hasta 4. Pon tu recomendación
como primera opción y etiquétala `(Recomendado)`. Si solo hay un hueco, haz una pregunta.

Antes de preguntar, enumera en una línea el conteo por estado, para que se vea que no ignoraste
los otros ejes ni los estás re-preguntando.

En **lenguaje de negocio, no técnico**: «¿quién le devuelve el acceso a alguien que perdió su
contraseña?», no «¿flujo de reset con token o admin-reset?». Lo que quede sin decidir **no se
rellena con supuestos** (regla 6 de `CLAUDE.md`): va a `## Preguntas abiertas`.

## Paso 5 — Proponer, sin escribir

Muestra dos cosas: el índice de secciones de `prompt.md` con una línea de contenido cada una, y la
tabla de `decisiones.md` **entera** — esa sí, porque es el entregable que el humano tiene que
juzgar.

**No escribas nada hasta un sí explícito.**

## Paso 6 — Escribir, tras el sí

Anexa las respuestas al `inventario.md` y delega la **pasada 2** en `extractor`, que redacta
`prompt.md` y `decisiones.md` desde el inventario ya cerrado — sin volver a leer el código.

Después:

- Si la extracción destapó **deuda real del módulo** (una ruta que da 404, un copy provisional que
  nadie iba a revisar), añade una línea en `progress/deudas.md`, en la sección que le toque. Por ser
  deuda, no por ser extracción: `progress/` es el estado del ciclo de features y una extracción no
  es una feature — no tiene status, ni worktree, ni PR.
- **No corras `./init.sh`.** Este comando no toca código ni `feature_list.json`: escribe tres
  markdown en una carpeta que nada valida. Un verde garantizado que no significa nada es justo el
  agujero que el gate vino a cerrar.
- **No toques Jira.** Ninguno de los empujones de `docs/jira.md > Quién sincroniza y cuándo` es
  de este comando.

Termina listando las tres rutas y una línea de veredicto. No pegues el contenido en el chat.

## Lo que este comando no hace

No modifica el módulo ni ningún archivo de `app/`, `lib/`, `components/`, `db/` o `tests/`. No
escribe en `specs/` ni requisitos `R<n>` para este repo: no invierte el orden SDD. No toca
`feature_list.json`. No extrae de `.worktrees/`. No implementa el port en ningún sitio: produce un
prompt, no un puerto. Y no juzga la calidad del módulo — si detecta un bug, lo anota como deuda y
sigue; arreglarlo es otra feature del board.
