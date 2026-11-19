# SLT-97 — reporte-bugs-modulo-superadmin · requirements.md

> **Zona** fullstack · **Complejidad** medium · **depends_on** SLT-87 ·
> **Rama** `feature/SLT-97-reporte-bugs-modulo-superadmin`
>
> **Alcance.** Entrega 2 de 3 del reporte de bugs. En `/plataforma`, un módulo solo para el
> superadmin: listado de los reportes que guarda SLT-87, con filtros por empresa, estado y fecha;
> detalle con descripción y contexto; y estado del reporte (nuevo → en revisión → resuelto /
> descartado), con una nota interna en cada cambio y el historial de cambios. El E2E de SLT-87 se
> amplía: el reporte enviado aparece en el módulo.
>
> **Lo que NO entra.** Imágenes, que van en SLT-98 «Reporte de bugs: imágenes». Responder al usuario,
> avisar a la empresa o al usuario. Que la empresa vea sus reportes.
>
> Sembrado por `/afinar-feature` el 2026-11-09. El bloque de Alcance y la tabla de «Decisiones cerradas»
> los fijó el humano ANTES del spec. `spec_author` los respeta, no los reabre y no los reescribe: su
> trabajo aquí es `## Requisitos (EARS)`.

## Requisitos (EARS)

Los textos exactos de pantalla están en `design.md > §9 Textos`. «Superadmin» es el rol de la
plataforma. Las fechas se muestran y se filtran en UTC (`design.md > §7`).

**Menú y acceso**

- **R1.** MIENTRAS el usuario de la sesión sea el superadmin, el sistema DEBE mostrar en el menú el
  ítem «Reportes», que lleva al listado de reportes. Va justo después de «Vehículos» y no lleva
  subítems. El superadmin DEBE seguir aterrizando en «Empresas» al entrar.
- **R2.** SI quien abre el listado o el detalle, o llama a una de sus operaciones, no tiene sesión o
  tiene un rol de empresa, ENTONCES el sistema DEBE:
  - en las páginas, responder «no encontrado» antes de leer ningún reporte;
  - en las operaciones, rechazar la petición sin leer ni escribir nada;
  - no mostrar el ítem «Reportes» en el menú de ningún rol de empresa.
- **R3.** El sistema NO DEBE permitir que una empresa lea, cree, modifique ni borre el estado de un
  reporte ni su historial. Con SQL a mano bajo el rol de la app, la base DEBE responder `42501` en la
  tabla del historial, igual que en la de reportes.
- **R4.** CUANDO el superadmin cambia el estado de un reporte, el sistema NO DEBE enviar ningún correo
  ni aviso a la empresa ni a quien reportó, ni dejar ninguna fila en el historial de acciones de la
  empresa.

**Listado**

- **R5.** CUANDO el superadmin abre el listado sin filtros en la dirección, el sistema DEBE:
  - mostrar el filtro de estado en «Pendientes», el de empresa en «Todas las empresas» y las fechas
    vacías;
  - mostrar solo los reportes en estado Nuevo o En revisión, de todas las empresas;
  - ordenarlos del más reciente al más antiguo;
  - mostrarlos en páginas de 25.
- **R6.** Cada fila del listado DEBE mostrar la fecha y hora del reporte (UTC), la empresa, el nombre
  de quien reportó, su rol, las primeras 120 letras de la descripción y el estado. Al pulsarla, DEBE
  llevar al detalle de ese reporte.
- **R7.** El filtro de estado DEBE ofrecer, en este orden, «Pendientes» (Nuevo y En revisión),
  «Todos», «Nuevo», «En revisión», «Resuelto» y «Descartado». Con cada opción, el listado DEBE mostrar
  solo los reportes de esos estados.
- **R8.** El filtro de empresa DEBE ofrecer «Todas las empresas» y cada empresa dada de alta,
  ordenadas por nombre. Con una empresa elegida, el listado DEBE mostrar solo los reportes de esa
  empresa.
- **R9.** El filtro de fechas DEBE tener «Desde» y «Hasta», los dos opcionales e inclusivos, por día
  UTC: «Desde» incluye el día entero desde las 00:00 UTC y «Hasta» incluye el día entero hasta las
  24:00 UTC. SI «Desde» es posterior a «Hasta», o una fecha no es válida, ENTONCES el sistema DEBE
  responder con un error de validación, mostrar el aviso de §9 y no mostrar filas.
- **R10.** Los filtros DEBEN combinarse: una fila sale solo si cumple todos. CUANDO el superadmin
  cambia un filtro, el sistema DEBE volver a la página 1. Los filtros y la página DEBEN quedar en la
  dirección de la página, de forma que al recargarla se vea el mismo listado.
- **R11.** El listado DEBE mostrar el rango y el total de los reportes que cumplen los filtros (por
  ejemplo «1-25 de 60») y dejar pasar de página. SI la página pedida es mayor que la última, ENTONCES
  el sistema DEBE mostrar la última. SI es menor que 1 o no es un número, ENTONCES DEBE mostrar la
  primera.
- **R12.** SI ningún reporte cumple los filtros, ENTONCES el sistema DEBE mostrar un estado vacío. Con
  los filtros por defecto, el texto es el de «sin pendientes»; con cualquier otro filtro, el de «sin
  coincidencias» (§9). SI el listado no se puede leer, ENTONCES el sistema DEBE mostrar el aviso de
  fallo de carga y no el estado vacío.
- **R13.** Un reporte con borrado lógico NO DEBE aparecer en el listado ni contar en el total.

**Detalle**

- **R14.** CUANDO el superadmin abre el detalle de un reporte, el sistema DEBE mostrar:
  - la descripción completa, con sus saltos de línea;
  - el contexto: empresa, nombre de quien reportó (el del momento del reporte), su correo, su rol, la
    página, el navegador, el dispositivo (ancho × alto de la ventana y si corría como app instalada, o
    «Sin datos»), la fecha y hora (UTC) y el identificador del reporte;
  - el estado actual.
- **R15.** SI el identificador del detalle no existe, no es válido o es de un reporte con borrado
  lógico, ENTONCES el sistema DEBE responder «no encontrado».

**Estado**

- **R16.** Todo reporte DEBE tener estado. Los reportes nuevos y los que ya existían antes de esta
  entrega DEBEN quedar en «Nuevo».
- **R17.** CUANDO el superadmin cambia el estado de un reporte, el sistema DEBE aceptar solo estas
  transiciones:
  - desde Nuevo, a En revisión, Resuelto o Descartado;
  - desde En revisión, a Resuelto o Descartado.

  El detalle DEBE ofrecer como destinos solo los permitidos desde el estado actual.
- **R18.** SI llega un cambio de estado que no está en R17 (hacia atrás, al mismo estado o desde
  Resuelto o Descartado), ENTONCES el sistema DEBE:
  - rechazarlo con el resultado `transicion_invalida`, que lleva el estado actual;
  - no cambiar el reporte ni escribir en el historial;
  - mostrar el aviso de §9 con el estado actual.

  La base DEBE rechazar también esa transición con SQL a mano, incluso como dueño (SQLSTATE `SL097`).
- **R19.** MIENTRAS un reporte esté en Resuelto o Descartado, el detalle NO DEBE ofrecer ningún cambio
  de estado y DEBE mostrar el texto de reporte cerrado (§9). Si el bug vuelve, se reporta de nuevo.

**Nota e historial**

- **R20.** CUANDO el superadmin cambia el estado, el sistema DEBE ofrecer una nota interna opcional:
  - de hasta 500 caracteres, con el contador «{n}/500» (por ejemplo «0/500» con el campo vacío y
    «120/500» con 120 caracteres);
  - una nota vacía o solo con espacios se guarda como «sin nota»;
  - SI la nota recibida en el servidor supera 500 caracteres tras recortar espacios, ENTONCES el
    sistema DEBE rechazar el cambio como error de validación, sin cambiar el estado ni escribir en el
    historial.
- **R21.** CUANDO se acepta un cambio de estado, el sistema DEBE dejar en el historial del reporte una
  entrada con el estado de antes, el de después, la nota (o «sin nota»), el nombre del superadmin y la
  fecha y hora. El cambio de estado y la entrada DEBEN guardarse juntos: si uno falla, no queda ninguno.
- **R22.** El detalle DEBE mostrar el historial del reporte, del cambio más reciente al más antiguo,
  con los datos de R21. SI el reporte no tiene cambios, ENTONCES DEBE mostrar el texto de historial
  vacío (§9).
- **R23.** Una entrada del historial NO DEBE poder editarse ni borrarse:
  - la pantalla y el servidor no ofrecen ninguna forma de hacerlo;
  - la base DEBE rechazar `UPDATE` y `DELETE` directos sobre la tabla del historial, incluso como
    dueño (`SL097`);
  - la entrada solo desaparece cuando se borra su reporte (borrado de una empresa demo).

### Cobertura de las decisiones cerradas

| Decisión | Requisitos |
|---|---|
| Módulo del superadmin | R1, R5–R15, R16–R22 |
| Visibilidad | R1, R2, R3, R4 |
| ¿Cómo se mueve el estado? (con P2) | R16, R17, R18, R19 |
| Nota interna (con P3) | R20, R21, R22, R23 |
| Dónde se guarda | R3, R23 (y `design.md > §2`) |
| Vistas de referencia | Sin requisito: los textos de §9 se contrastan con la vista en la revisión del spec |
| ¿Hace falta E2E? | E2E de R1, R5, R6, R14, R17, R19, R20, R21 y R22 (`tasks.md`) |
| ¿Librería nueva? No | Sin requisito: lo hace cumplir `guard-dependencias-aprobadas` |
| Ruta completa | El proceso de este spec |
| P1 (un solo PR) | Sin requisito: proceso; la línea `tamano-pr-aceptado` está en `progress/features/SLT-97.md` |
| P2 (saltar hacia adelante) | R17, R18 |
| P3 (nota de 500 con contador) | R20 |
| P4 (filtro por defecto, orden, páginas de 25, «Todos») | R5, R7, R11 |

## Preguntas abiertas

Ninguna.

**Nota (medida del 2026-11-09).** La entrega completa en un PR sale en unos 31 archivos (el aviso empieza
en 32, y el máximo es 40) y unas 2300-2450 líneas (el máximo es 1000). Por la P1, el humano aceptó el
exceso en un solo PR, y la línea `tamano-pr-aceptado` está en `progress/features/SLT-97.md`. El desglose
está en `tasks.md > Archivos esperados`.

**Nota (vista de referencia).** https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms no se pudo abrir desde
el agente que escribió el spec. Los textos de `design.md > §9` son propuesta del spec: se contrastan con
la vista al aprobarlo, y si chocan, manda el spec.

## Decisiones cerradas (no reabrir)

| Fecha | Pregunta | Decisión |
|---|---|---|
| 2026-11-05 | Módulo del superadmin | En `/plataforma`: listado con filtros (empresa, estado, fecha), detalle con descripción y contexto, y estado nuevo → en revisión → resuelto / descartado con nota interna. (Heredado del alcance original de SLT-87.) |
| 2026-11-05 | Visibilidad | Solo el superadmin ve los reportes. La empresa (maestro, admin) no ve ninguno, ni los de su gente. Nunca se notifica a la empresa ni al usuario. (Heredado de SLT-87.) |
| 2026-11-09 | ¿Cómo se mueve el estado? | Solo hacia adelante: nuevo → en revisión → resuelto o descartado. Un reporte resuelto o descartado no se reabre; si el bug vuelve, entra como reporte nuevo. |
| 2026-11-09 | Nota interna | Una nota opcional por cada cambio de estado, que queda en el historial con quién, cuándo, el estado de antes y el de después. Las notas no se editan ni se borran. |
| 2026-11-09 | Dónde se guarda | Sobre la tabla de plataforma `bug_report` de SLT-87, que no tiene políticas y tiene REVOKE para `servi_app`; solo se lee y se escribe en `comoPlataforma`. El estado y el historial siguen la misma regla. (Heredado de SLT-87.) |
| 2026-11-09 | Vistas de referencia | Listado y detalle en https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms (sin las imágenes, que son de SLT-98). Si la vista choca con el spec, manda el spec. |
| 2026-11-09 | ¿Hace falta E2E? | Sí: amplía el de SLT-87 (enviar → aparece en el módulo → cambiar estado con nota → historial). |
| 2026-11-09 | ¿Librería nueva? | No. |
| 2026-11-09 | Ruta | Completa: cambia el esquema y toca permisos de plataforma. |
| 2026-11-09 | P1 — La entrega no cabe en un PR (~31 archivos, ~2300-2450 líneas frente a 1000). ¿Cómo se corta? | No se corta: va en un solo PR, con el exceso aceptado. La línea `tamano-pr-aceptado` está en `progress/features/SLT-97.md`. |
| 2026-11-09 | P2 — ¿Se puede saltar un paso hacia adelante? | Sí. Desde Nuevo se pasa a cualquiera de los otros tres; desde En revisión, a Resuelto o Descartado; desde estos dos, a ninguno. |
| 2026-11-09 | P3 — ¿Largo máximo de la nota interna? | 500 caracteres, con el contador «{n}/500». Vacía o solo con espacios cuenta como «sin nota». |
| 2026-11-09 | P4 — ¿Con qué filtro abre el listado? | En «Pendientes» (Nuevo y En revisión), sin empresa ni fechas, del más reciente al más antiguo y en páginas de 25. Ofrece la opción «Todos». |
