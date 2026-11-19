# docs/specs.md — Proceso Spec Driven Development

Toda feature con `"sdd": true` pasa por este proceso ANTES de tocar código.
Produce tres archivos en `specs/<key>-<slug>/`, dentro del worktree de la feature (son de su
rama, `docs/equipo.md > Qué estado es de quién`). Hay una puerta de aprobación humana
entre la especificación y la implementación.

## Antes de especificar: lo que ya existe

Antes de sembrar un `requirements.md`, de crear una ficha o de escribir un spec, busca si eso ya
existe. Es **bloqueante**: si aparece algo, para y pregunta al humano.

Se busca siempre en los tres sitios:

1. **El board**, en todos sus estados, incluidos los de `done` y `cancelled` (según `arnes.config.json > tracker.estados` o `jira.estados`): `feature_list.json`
   (F0 las importa todas), por `name` y `description`. Quien tiene el MCP de `atlassian`
   (`/afinar-feature`) lo confirma en vivo con
   `project = <arnes.config.json > jira.project> AND issuetype != Epic AND text ~ "<término>"`.
   Con Trello, cualquiera lo confirma con `node scripts/trello.mjs buscar "<término>"`, que mira
   también las tarjetas archivadas.
2. **Los specs** ya escritos: `grep -ril "<término>" specs/`.
3. **El código**: el grafo (`search_graph`, `search_code`) con los nombres del dominio
   (`docs/grafo-de-codigo.md`).

Busca con dos o tres términos del dominio de la feature, no con su título literal.

Si aparece algo, el humano decide una de tres:

- **Es la misma feature** → la ficha nueva se mueve al estado de `cancelled` con un comentario que cite la
  original. Nunca se borra (`docs/jira.md > Cuando el disco descubre que el board está
  desactualizado`).
- **Se solapa en parte** → se acota: lo que ya existe va a «Lo que NO entra», o una ficha absorbe
  a la otra.
- **Ya hay código que lo resuelve** → se sigue, reutilizándolo en vez de re-crearlo.

La decisión queda como fila en `## Decisiones cerradas (no reabrir)` del `requirements.md`.

| Quién | Cuándo |
|---|---|
| `/afinar-feature` | paso 1, antes de preguntar; y paso 5, antes de crear una ficha nueva |
| `spec_author` | F1.2, antes de escribir (cubre las fichas que llegan sin afinar) |
| `reviewer` | F2.2: comprueba la sección y que el diff no re-cree nada de ella |

El resultado se escribe en `design.md > ## Lo que ya existe`: términos buscados, qué apareció
(key, spec o símbolo) y qué se reutiliza. Si no apareció nada, se dice: «Buscado `<términos>`:
nada». Sección ausente o vacía es BLOQUEANTE del reviewer.

Aplica a los specs escritos desde el 2026-10-06: los anteriores no se auditan.

**Lo que cuesta:** una búsqueda en el board y otra en el grafo por feature, y una pregunta más al
humano cuando hay coincidencia.

### Por qué

Una ficha duplicada reparte el mismo trabajo entre dos personas que no se ven; código re-creado
deja dos versiones que divergen. **No hay un caso verificado** en este repo: la regla es
preventiva.

## Tres rutas: directa, ligera y completa

El proceso se ajusta al riesgo de la feature. El leader propone la ruta en F1.0, la escribe como
label `ruta:<directa|ligera|completa>` en la tarjeta y la anota en `progress/features/<key>.md >
Evaluación`. Sin label, la ficha va por la **completa**.

| Ruta | Para qué | Spec | Aprobación del spec (F1.4) | Reviewer |
| --- | --- | --- | --- | --- |
| **directa** | texto, estilo, bug localizado con causa clara | ninguno: un test que reproduce el fallo antes del arreglo, y el PR dice qué cambió y cómo se probó | no: el humano revisa el PR | no |
| **ligera** | feature acotada, sin decisiones de diseño caras | un solo `requirements.md`: alcance, requisitos EARS, `## Tasks` y `## Archivos esperados` | sí | sí, acotado al diff |
| **completa** | todo lo demás | los tres archivos de abajo | sí | sí |

**Va siempre por la completa** (lo comprueba el gate, no el criterio del agente):
- si el diff toca algo de `arnes.config.json > rutas.completa_si_toca` (por defecto migraciones,
  esquemas `.prisma` y `.sql`): `scripts/validate-features.mjs` falla mientras la ruta sea otra;
- si toca dinero, permisos, autenticación, integraciones externas o webhooks, o su `complexity` es
  `high`. Esto lo comprueba el reviewer, porque no se ve en las rutas de los archivos.

**Subir de ruta siempre se puede** (lo decide el humano, o el leader al descubrir más alcance).
**Bajar por debajo del suelo, nunca.** La ruta directa solo vale con `complexity: low`, sin
comportamiento nuevo y sin tocar un flujo crítico.

Lo que no cambia en ninguna ruta: el candado, la trazabilidad (todo cambio de comportamiento con
su test), el gate y el PR con `gate-completo` en verde antes del merge.

### Por qué

El SDD completo es caro: tres documentos, una espera de aprobación y un reviewer por feature. En el
proyecto de origen, el ciclo mediano de una feature era de 38 h (2026-11-07), y los cambios
pequeños pagaban lo mismo que los grandes. Las críticas públicas a Kiro y spec-kit dicen lo mismo:
un bug menor no debería producir cuatro historias de usuario. Organic Driven Development (Gentle-AI)
propone la misma proporcionalidad. Aquí se adopta la idea, no la herramienta, y con un suelo que
comprueba el gate.

## Partir una feature

Una feature tiene que caber en **un PR por debajo de `gate.tamano_pr`** (por defecto 40 archivos,
1000 líneas de producción y 3000 de tests, con topes separados; `docs/gate.md > Tamaño del PR`). Si no cabe, se parte en el board **antes** de
implementar, no a mitad.

**Cuándo se mira:**
- **en F1.0,** al evaluar: si la description ya promete más de lo que cabe, el leader propone el
  corte con `/afinar-feature`;
- **en F1.2,** al escribir el spec: si `## Archivos esperados` pasa del 80% de `max_archivos`,
  `spec_author` devuelve `BLOQUEADO: no cabe en un PR` con la propuesta de corte;
- **en cada tanda:** si `./init.sh` avisa del 80% o da rojo por tamaño, el implementer para y el
  leader propone el corte de lo que falta.

**Cómo se parte, en rebanadas verticales:**
- **Cada rebanada se mergea sola y deja el producto funcionando.** Ninguna rompe la rama de
  integración ni deja una pantalla a medias visible. Si algo no puede verse aún, va detrás de una
  bandera o sin enlace en la navegación.
- **Por comportamiento, no por capa:** «alta de clientes» y luego «edición de clientes», no
  «backend de clientes» y luego «frontend de clientes». Una rebanada por capa deja la primera
  sin probar de punta a punta.
- **Primero lo que desbloquea:** el modelo de datos y su migración van en la primera rebanada si
  las demás dependen de él. Es la única excepción razonable al corte por comportamiento.
- **En el board:** se crean las fichas nuevas con `/afinar-feature` (paso 5: crear la ficha que
  falta), con `depends_on` encadenado. La ficha original se queda con la primera rebanada y su
  `description` se acota a ella.
- Cada rebanada pasa el ciclo entero: su ruta, su spec si lo lleva, su gate y su PR.

### Por qué

Ver `docs/gate.md > Tamaño del PR > Por qué`.

## Los tres archivos (ruta completa)

### 1. requirements.md — el QUÉ, en EARS
Requisitos numerados (`R1`, `R2`…), sin detalles de implementación. Usa notación
EARS para que sean testeables y sin ambigüedad:

- **Ubicuo:** El sistema DEBE `<comportamiento>`.
- **Por evento:** CUANDO `<disparador>`, el sistema DEBE `<respuesta>`.
- **De estado:** MIENTRAS `<estado>`, el sistema DEBE `<comportamiento>`.
- **Condicional:** SI `<condición>`, ENTONCES el sistema DEBE `<respuesta>`.
- **Opcional:** DONDE `<feature presente>`, el sistema DEBE `<comportamiento>`.

Cada requisito debe poder verificarse con un test. Si no se puede testear, está
mal escrito.

**El archivo puede venir sembrado.** El comando `/afinar-feature` cierra el alcance y las
decisiones con el humano *antes* de F1.2 y deja escrito el bloque de Alcance, la tabla
`## Decisiones cerradas (no reabrir)` y las `## Preguntas abiertas` que queden. En ese caso
`spec_author` **completa** el archivo —rellena los requisitos EARS— y no reabre la tabla ni
reescribe el alcance. Cada fila de la tabla debe acabar cubierta por al menos un `R<n>`, o esa
decisión nunca llega a tener test.

Es el mismo checkpoint de siempre, solo que la conversación ocurre antes de escribir en vez de
después. No es opcional por comodidad.

### 2. design.md — el CÓMO técnico
Decisiones antes de escribir código: modelo de datos (tablas, RLS, migraciones),
endpoints/rutas Next, contratos de entrada/salida, integraciones externas si las hay,
y **al menos una alternativa que descartaste y por qué**.
Abre con `## Lo que ya existe` (`> Antes de especificar: lo que ya existe`).

Si propone una librería nueva, lo dice aquí: la aprobación del spec la incluye (regla 7 de
`CLAUDE.md`, `AGENTS.md > F1.4`).

### 3. tasks.md — el desglose
Checklist de pasos discretos y verificables. Cada task pequeña, con criterio de
"hecho". Marca dependencias y las que pueden ir en paralelo `[P]`.

Incluye una sección **`## Archivos esperados`** con las rutas que la feature va a tocar, cada una
entre backticks (en la ruta ligera, la misma sección va en el `requirements.md` único).
`scripts/archivos-en-vuelo.mjs` lee **solo** las rutas de esa sección, desde la
rama publicada, para detectar choques con las features en vuelo de todo el equipo: una ruta citada
en otra parte del `tasks.md` no cuenta, y un comando (`./init.sh`) tampoco (`docs/equipo.md >
Conflicto de archivos entre personas`).

## La puerta de aprobación humana (`spec_ready`)

Cuando los tres archivos están listos, el leader pasa la feature a `spec_ready`, mueve la
tarjeta al estado de `spec_ready` (según `tracker.estados` o `jira.estados`), comenta en la tarjeta dónde está el spec y hace `git push`
(`AGENTS.md > F1.3`). El proceso **se detiene**. El humano lee los tres archivos y responde:

- **aprobado** → la forma canónica es mover la tarjeta del estado de `spec_ready` al de `in_progress`
  (queda autor y fecha); un "aprobado" escrito también vale. Se procede a implementar.
- **cambios** → el `spec_author` corrige y se vuelve a pedir aprobación.

Nunca se escribe código de producción sin esta aprobación. Es el checkpoint que
evita construir lo incorrecto de forma rápida y cara.

## Trazabilidad

Cada `R<n>` de requirements.md debe terminar mapeado a un test concreto. El
implementer documenta ese mapa en `progress/impl_<key>.md` y el reviewer lo
verifica. Un requisito sin test es un fallo de la feature.

### Por qué

**Sembrar antes del spec.** Los primeros specs escritos en el proyecto de origen del arnés necesitaron una o dos
revisiones completas —con renumeración de requisitos incluida— para incorporar respuestas que el
humano ya tenía desde el principio. `/afinar-feature` existe para hacer esa conversación antes.
