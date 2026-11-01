# SLT-75 «Un distrito no puede quedar en dos zonas» (HOTFIX)

## Alcance (de la ficha y de `progress/features/SLT-75.md`)

En /configuracion/tarifas, un distrito puede quedar en dos zonas de la misma empresa. Cuando eso
pasa, el árbol lo colapsa a «sin zona» y al editar la zona sale desmarcado en las dos. El
siguiente guardado lo borra de verdad, y la reconciliación de la 366 puede mover órdenes sin
avisar. En producción hay un caso (2026-10-31): un distrito del cantón Cartago está en dos zonas,
con 1 orden.

Arreglo mínimo, rama desde `prod`:

1. El servidor rechaza el guardado.
2. La base lo impide con un índice único por empresa.
3. Una migración de datos limpia el caso que ya existe.
4. El árbol expone las zonas reales.
5. El selector bloquea el distrito y el formulario se abre con datos vigentes.

**Lo que NO entra:**
- El rastro en `historial_accion` de distritos añadidos o quitados. Va a Q1 como ficha aparte.
- Rediseñar la N:M o el colapso 1/0/>1 de `_shared/zona-colapso.ts`.
- El mensaje del `conflict` del nombre de zona (ver `design.md` §9).
- El distrito de Curridabat sin zona (Q2).

## Decisiones cerradas (no reabrir)

| Fecha | Quién | Decisión | Cubierta por |
|---|---|---|---|
| 2026-10-31 | Carlos | HOTFIX urgente: rama desde `prod`. | Proceso (no es comportamiento). La rama y el worktree ya existen. |
| 2026-10-31 | Carlos | Un distrito que ya tiene otra zona queda BLOQUEADO: no se puede seleccionar en otra. | R15, R16, R17 |
| 2026-10-31 | Carlos | Si se intenta guardar con un distrito que ya tiene otra zona, sale un aviso de error y no se guarda. | R1, R2, R3, R8, R21 |
| 2026-10-31 | Carlos | El distrito de producción que está en dos zonas se quita de las DOS y queda sin zona. | R9, R10, R11 |

## Requisitos (EARS)

### A. El guardado de la zona (servidor)

- **R1** — CUANDO el maestro crea una zona y alguno de los `distritoIds` ya pertenece a otra zona
  de su empresa, el sistema DEBE responder `validation_error` con el motivo en
  `fieldErrors.distritoIds`. NO DEBE escribir nada:
  - ni la zona;
  - ni filas de `zona_distrito` ni de `tarifa_zona_mensajero`;
  - ni el traspaso de la marca de zona central;
  - ni filas de `historial_accion`.
- **R2** — CUANDO el maestro actualiza una zona y alguno de los `distritoIds` ya pertenece a OTRA
  zona de su empresa, el sistema DEBE responder `validation_error` en `fieldErrors.distritoIds`.
  La zona DEBE quedar exactamente como estaba:
  - `nombre`, `cobroVehiculo` y `esCentral`;
  - sus filas de `zona_distrito` y de `tarifa_zona_mensajero`.

  Además, ninguna `orden.zona_id` DEBE cambiar y no DEBE escribirse ninguna fila de
  `historial_accion`.
- **R3** — CUANDO el sistema rechaza por R1 o R2, `fieldErrors.distritoIds` DEBE traer un mensaje
  por cada distrito en conflicto, con la forma `«<nombre del distrito> ya está en la zona <nombre
  de la zona>.»`, ordenados por nombre de distrito.
- **R4** — SI un distrito elegido ya pertenece a la MISMA zona que se actualiza, ENTONCES el
  sistema NO DEBE tratarlo como conflicto. Guardar una zona sin cambiar sus distritos DEBE
  responder `ok`.
- **R5** — SI un distrito elegido pertenece a una zona de OTRA empresa, ENTONCES el sistema NO DEBE
  tratarlo como conflicto. El mensaje NO DEBE nombrar la zona de la otra empresa, y su fila de
  `zona_distrito` NO DEBE cambiar.
- **R6** — El sistema DEBE comprobar R1 y R2 dentro de la misma transacción del guardado y antes
  de su primera escritura.
- **R7** — La base de datos DEBE rechazar una segunda fila de `zona_distrito` con la misma empresa y
  el mismo distrito, también cuando la escritura no pase por la aplicación. DEBE seguir aceptando
  el mismo distrito en zonas de empresas distintas.
- **R8** — SI la base rechaza un guardado por R7 (dos guardados simultáneos que pasaron R6), ENTONCES
  el sistema DEBE responder `validation_error` en `fieldErrors.distritoIds` con el mensaje
  `«Alguno de los elegidos acaba de asignarse a otra zona. Recarga la página y vuelve a
  intentarlo.»`. Nunca DEBE responder un error interno y no DEBE guardar nada.

### B. La migración del dato existente

- **R9** — CUANDO se aplica la migración, todo distrito que esté en más de una zona de la misma
  empresa DEBE quedar sin ninguna fila de `zona_distrito` en esa empresa. Las demás filas DEBEN
  quedar intactas: las de otros distritos y las del mismo distrito en otras empresas.
- **R10** — La migración DEBE guardar, antes de borrar, una copia de cada fila borrada (`id`,
  `zona_id`, `distrito_id`, `organizacion_id`) en un respaldo que el rol de la aplicación
  (`servi_app`) no pueda leer ni escribir.
- **R11** — La migración NO DEBE modificar `orden` (en particular `orden.zona_id`) ni ninguna otra
  tabla de negocio distinta de `zona_distrito`.
- **R12** — CUANDO se ejecuta el `down.sql` de las migraciones de esta ficha, el sistema DEBE:
  - quitar el índice de R7;
  - restaurar las filas respaldadas cuya zona y cuyo distrito sigan existiendo;
  - borrar el respaldo.
- **R13** — SI la base no tiene ningún distrito duplicado, ENTONCES la migración DEBE aplicarse
  sin error y sin borrar ninguna fila.

### C. El árbol geográfico

- **R14** — El árbol de Tarifas (`listarArbolGeografico`) DEBE traer en cada distrito la lista
  completa de las zonas de la empresa a las que pertenece (`id` y `nombre`), ordenada por nombre.
  `zonaId` y `zonaNombre` DEBEN conservar el colapso 1/0/>1 que tienen hoy. Las zonas de otra
  empresa NO DEBEN aparecer.

### D. El selector de distritos

- **R15** — MIENTRAS el selector muestra un distrito que pertenece a una zona distinta de la que
  se edita (o a cualquier zona, al crear), su casilla DEBE estar deshabilitada y la fila DEBE
  mostrar `(zona: <nombre>)`.
- **R16** — CUANDO el maestro marca o desmarca un cantón o una provincia, el sistema DEBE marcar o
  desmarcar solo sus distritos seleccionables. Los bloqueados por R15 DEBEN quedar sin marcar.
- **R17** — El estado de la casilla de un cantón o una provincia (marcada, indeterminada o vacía)
  DEBE calcularse solo sobre sus distritos seleccionables. SI no tiene ninguno, ENTONCES la casilla
  DEBE estar deshabilitada.
- **R18** — MIENTRAS se edita una zona, sus propios distritos DEBEN seguir marcables y desmarcables
  y mostrar `(zona: <su nombre>)`.

### E. Abrir el formulario y mostrar el error

- **R19** — CUANDO el maestro abre «Editar» de una zona, los distritos preseleccionados DEBEN ser
  exactamente los de esa zona en `zona_distrito` en el momento de abrir. Vale también justo después
  de guardar otra zona, sin recargar la página.
- **R20** — CUANDO el maestro abre «Crear zona» o «Editar», el selector DEBE pintar el árbol leído
  al abrir, no uno anterior al último guardado. SI esa lectura falla, ENTONCES el formulario NO
  DEBE abrirse y DEBE avisar con un toast de error.
- **R21** — CUANDO el servidor rechaza con `fieldErrors.distritoIds`:
  - el formulario DEBE pintar todos los mensajes bajo el selector;
  - el toast DEBE mostrar el primero y, si hay más, añadir `« y <N> más.»`.
- **R22** — El texto del toast para `conflict` NO DEBE mencionar distritos.

## Trazabilidad R → test

El mapa completo, con el archivo de cada test, está en `design.md > §8`.

## Preguntas abiertas

**Q1 · El rastro de distritos añadidos/quitados en `historial_accion` va como ficha aparte. [NO
BLOQUEA el hotfix; lo decide Carlos]**

Se pidió registrar en `historial_accion` los distritos que entran y salen en cada guardado de zona,
salvo que costara más que «una migración de enum y unas líneas». Cuesta bastante más (medido en
el código de `prod`):

- **Migración.** Un valor nuevo en `historial_accion_tipo` necesita su `ALTER TYPE … ADD VALUE`. Su
  `down.sql` tiene que **recrear el tipo entero** con la lista completa de valores (precedente:
  `20260918120000_historial_accion_zona_sinpe/down.sql`, ~100 líneas). Ese `down.sql` se queda
  rancio en cuanto otra ficha añade un valor.
- **Catálogo.** `lib/types/historial-accion.ts` tiene tres mapas que tocar (tipos, categoría y
  etiqueta).
- **Guardias y tests con conteos fijos.** Los conteos están en `catalogo-y-choke-point.test.ts` y
  en `historial-accion-escrituras-cubiertas.guardia.test.ts`. Además, unos 13 tests de migración
  (`tests/integration/db/historial-accion-*-migration.test.ts`) fijan la lista o el último valor
  del enum.
- **Forma de la fila: decisiones de producto que no están tomadas.**
  - ¿Una fila por guardado o una por distrito?
  - ¿Qué va en `valorAnterior` y `valorNuevo`?
  - ¿Qué categoría lleva?

Recomendación: una ficha aparte, hacia `dev`, con `/afinar-feature` para esas tres preguntas. El
hotfix no la necesita para cerrar el defecto: con R1-R8 un distrito ya no puede perderse en
silencio.

**Q2 · ¿El distrito de Curridabat que no tiene zona (con 1 orden) debe estar en alguna? [NO BLOQUEA;
viene de `progress/features/SLT-75.md`]**

Es dato de configuración. Lo resuelve el maestro desde la pantalla, no esta ficha.

**Q3 · ¿Cuánto tiempo se conserva el respaldo de R10? [NO BLOQUEA]**

El spec lo deja en el esquema `respaldo` sin fecha de retirada (`design.md` §3). Quitarlo es una
migración de una línea en una ficha futura, cuando Carlos lo decida.
