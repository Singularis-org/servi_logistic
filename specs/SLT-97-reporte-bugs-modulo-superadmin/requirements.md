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

_Pendiente: los escribe spec_author (F1.2)._

## Preguntas abiertas

> **Estado del spec (spec_author, 2026-11-09): BLOQUEADO, no cabe en un PR.** Faltan los requisitos,
> `design.md` y `tasks.md`; se escriben cuando el humano responda la P1 (`docs/specs.md > Partir una feature`).

**Lo que ya existe** (búsqueda del 2026-11-09 de `bug_report`, `BugReport`, «nota interna», «reporte de
bug» en `feature_list.json`, `specs/` y el código; el grafo no tiene índice de este worktree, así que la
búsqueda se hizo con Grep y Read). Solo aparecen la base de SLT-87 «Reporte de bugs: botón flotante y
envío», que esta entrega reutiliza, y SLT-98 «Reporte de bugs: imágenes», que va después. No hay ningún
listado, estado ni historial de reportes. Lo que se reutilizaría:
- la tabla `bug_report` (`20261110120000`), que ya trae los dos índices del listado;
- `BugReportRepository` en `comoPlataforma`, con su entrada en `EXCEPCIONES_DE_PLATAFORMA`;
- `exigirSuperadmin` y `esPlataforma`;
- `listarEmpresasPlataforma`, para el filtro de empresa;
- `components/shared/Pagination.tsx` y `EmptyState.tsx`;
- el patrón de página de `/plataforma/vehiculos` (SL-42): `notFound()` antes de leer y el ítem de menú
  con `ROLES_PLATAFORMA`;
- el patrón de rastro inmutable de plataforma (`vehiculo_rastro`, `plan_rastro`) y el trigger de
  inmutabilidad de `cobro_plataforma_traza` (`SL085`).

**Medida.** El tope es `gate.tamano_pr` (40 archivos y 1000 líneas, con aviso al 80%: 32 archivos y 800
líneas). La entrega completa en un PR saldría así:

| Pieza | Archivos | Líneas (aprox.) |
|---|---|---|
| Datos: enum y columna de estado, tabla del historial, trigger de «solo hacia adelante» e inmutabilidad, `down.sql`, `schema.prisma`, clasificación y excepción | 5 | 230 |
| Servidor: tipos y zod, repositorio (listar, detalle, cambiar estado), servicio e interfaces, action, reparto | 7 | 560 |
| Menú: ítem «Reportes» con icono propio (`menu-visibility.ts`, `Sidebar.tsx`) | 2 | 20 |
| Pantallas: listado con filtros y paginación, y detalle con estado, nota e historial | 4 | 600 |
| `docs/architecture.md` | 1 | 10 |
| Tests: integración, servicio, action, componentes, las 4 pruebas del menú (`menu-visibility`, `Sidebar`, `superadmin-fuera-de-empresa`, `pwa-manifiesto-atajos`), `superadmin-arranque` y el E2E ampliado | 10 | 850-1000 |
| **Total** | **29** | **~2300-2450** |

Los archivos caben (29 de 32), pero las líneas se pasan unas 2,3 veces del máximo. SLT-87 «Reporte de
bugs: botón flotante y envío» ya se pasó (~1300, aceptado en su Q1), y esto sería casi el doble.

**P1 — ¿Cómo se corta?** (bloqueante; la decide el humano)

- **A (recomendada): dos rebanadas, por comportamiento.**
  - **SLT-97 «Reporte de bugs: módulo del superadmin» se queda con «ver»:**
    - el enum y la columna de estado; todos los reportes nacen y se quedan en «Nuevo»;
    - el ítem del menú;
    - el listado con los tres filtros, el orden, la paginación y el estado vacío;
    - el detalle de solo lectura: descripción, contexto y estado;
    - el E2E: «el reporte enviado aparece en el módulo».

    Cubre las filas «Módulo del superadmin» (listado, filtros y detalle), «Visibilidad» y «Dónde se
    guarda». Tamaño: unos 27 archivos y 1250-1350 líneas. **Sigue pasándose del máximo en un 25-35%**,
    así que hace falta aceptar el exceso con la línea `tamano-pr-aceptado`, como en SLT-87.
  - **Una ficha nueva, «Reporte de bugs: estado y nota interna»** (con `depends_on` SLT-97), se
    queda con «gestionar»:
    - el cambio de estado solo hacia adelante y el rechazo de las transiciones inválidas;
    - la nota opcional;
    - la tabla del historial, inmutable;
    - el historial en el detalle;
    - el E2E: cambiar el estado con nota y verla en el historial.

    Cubre las filas «¿Cómo se mueve el estado?» y «Nota interna», y la parte de estado del E2E.
    Tamaño: unos 17 archivos y 900-1000 líneas.

  SLT-98 «Reporte de bugs: imágenes» sigue dependiendo de SLT-97, porque solo necesita el detalle.
- **B: tres rebanadas.** Listado (~1000 líneas), detalle de solo lectura (~450) y estado con nota e
  historial (~950). Ninguna se pasa del máximo, pero son tres ciclos de spec, revisión y PR, y el
  listado se mergea sin detalle: hasta que llegue la segunda, la fila no lleva a ninguna parte.
- **C: un solo PR, aceptando el exceso** (~2300-2450 líneas, 2,3 veces el máximo). Es lo que desaconseja
  `docs/gate.md > Tamaño del PR`.

Si la respuesta es A o B, `/afinar-feature` crea las fichas nuevas y acota el Alcance de esta. Las
filas de «Decisiones cerradas» pasan a la ficha que les toque.

**Preguntas que quedan para después de la P1.** No bloquean el corte. Cada una se resuelve al afinar
la rebanada que la necesita, y cada una lleva una recomendación:

- **P2 — ¿Se puede saltar un paso hacia adelante?** Por ejemplo, de «Nuevo» directo a «Descartado»
  para un reporte basura. **Recomendación: sí.** La decisión cerrada prohíbe volver atrás y reabrir,
  pero no saltar hacia adelante. Desde «Nuevo» se iría a cualquiera de los otros tres estados; desde
  «En revisión», a «Resuelto» o «Descartado»; desde estos dos, a ninguno. La rebanada que cambia el
  estado la necesita.
- **P3 — ¿Largo máximo de la nota interna?** **Recomendación: 500 caracteres**, el mismo
  `DESCRIPCION_MAX` de la descripción. Una nota vacía o solo con espacios cuenta como «sin nota». La
  necesita la misma rebanada.
- **P4 — ¿Con qué filtro abre el listado?** **Recomendación: estado «Pendientes»** (Nuevo y En
  revisión), sin empresa ni fechas, del más reciente al más antiguo y en páginas de 25. Ver los cerrados
  queda a un cambio de filtro, con la opción «Todos». La necesita la rebanada del listado.

**Nota.** La vista de referencia (https://claude.ai/artifact/RAaa8zU5Tbw2gyYnnMaRms) no se pudo abrir
desde este agente, porque no tiene la herramienta de documentos de claude.ai. Los textos de pantalla se
contrastan con ella al escribir el design de cada rebanada, y si chocan, manda el spec.

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
