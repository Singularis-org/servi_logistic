# 484 — Puntero `orden_en_gestion` colgado tras corte o liberación · requirements

> Fuente: ficha 484 de `feature_list.json` e incidente medido en producción el 2026-10-19.
> Alcance: **arreglo mínimo, no rediseño** (decisión del humano).
>
> **El incidente.** El mensajero Andres Aguero tenía `usuario.orden_en_gestion_id` = BLST-765. El
> 16/10 la orden pasó a `en_reparto` (`recoleccion`) y él pulsó «Gestionar pedido», lo que fija el
> puntero (`GestionOrdenRepository.setOrdenEnGestion`). El 17/10 a las 06:00 el corte diario la pasó a
> `sin_gestionar` (`corte_sin_gestionar`, `CierreDiaRepository.crearCierre`) **sin tocar el
> puntero**. El 19/10 a las 15:50 la aprobación del cierre la devolvió a `en_bodega_central` con
> `mensajero_asignado_id` NULL (`liberacion_sin_gestionar`, `CierresAdminRepository.resolverCierre`),
> **tampoco tocó el puntero**. Resultado: `listarMisAsignaciones` devolvía el puntero crudo, Reparto
> entraba en modo foco y le enseñaba 1 de sus 40 órdenes; no podía escoger otra (el `WHERE` de
> `setOrdenEnGestion` exige puntero NULL o igual), ni registrar su gestión (la guarda de `gestionar`
> rechaza «otra orden activa»), ni «Cancelar gestión» (`liberarOrdenEnGestion` exige que el puntero
> sea la orden mostrada). Se desbloqueó con un `UPDATE` manual.
>
> **Vocabulario.**
> - **Puntero**: la columna `usuario.orden_en_gestion_id` (la orden que el mensajero tiene «en
>   gestión», 1 a 1; feature 36/R19-R21).
> - **Puntero vigente**: apunta a una orden que está `en_reparto`, asignada a ESE mensajero, no
>   borrada y sin gestión pendiente de confirmar. Es exactamente la condición para que la orden
>   aparezca en sus listas «por gestionar» o «con ayuda» de Reparto.
> - **Puntero colgado**: un puntero no nulo que no es vigente.

## Requisitos

### A. Raíz: los caminos que sacan una orden de la mano del mensajero limpian el puntero

- **R1** — CUANDO el corte diario transiciona una orden de `en_reparto` a `sin_gestionar`, el sistema
  DEBE dejar a NULL el puntero de todo usuario que apunte a esa orden, en la misma transacción que la
  transición (o quedan los dos efectos o ninguno).
  *Test previsto:* `tests/integration/db/484-puntero-corte-sql-real.test.ts`.
- **R2** — CUANDO el corte diario se ejecuta, el sistema NO DEBE modificar un puntero que apunte a una
  orden que ese corte no transicionó: otra orden del mismo mensajero, una orden reservada para un día
  posterior, o una orden con gestión pendiente de confirmar.
  *Test previsto:* `tests/integration/db/484-puntero-corte-sql-real.test.ts`.
- **R3** — CUANDO la aprobación de un cierre devuelve a bodega una orden barrida a `sin_gestionar`
  (`liberacion_sin_gestionar`), el sistema DEBE dejar a NULL el puntero de todo usuario que apunte a
  esa orden, en la misma transacción que la aprobación.
  *Test previsto:* `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts`.
- **R4** — CUANDO la aprobación de un cierre termina en `rechazada` una orden barrida que alcanzó el
  tope de intentos (`rechazo_tope_intentos`), el sistema DEBE dejar a NULL el puntero de todo usuario
  que apunte a esa orden, en la misma transacción que la aprobación.
  *Test previsto:* `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts`.
- **R5** — CUANDO se aprueba un cierre, el sistema NO DEBE modificar un puntero que apunte a una orden
  que esa aprobación no libera ni termina por tope; y SI la aprobación no llega a confirmarse,
  ENTONCES ningún puntero DEBE quedar modificado.
  *Test previsto:* `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts`.
- **R6** — CUANDO un traspaso mueve una orden de un mensajero a otro, el sistema DEBE dejar a NULL el
  puntero del mensajero de origen SI apunta a esa orden, en la misma transacción que el traspaso; y NO
  DEBE modificar el puntero del mensajero de destino ni el del origen cuando apunta a otra orden.
  *Test previsto:* `tests/integration/db/484-puntero-traspaso-sql-real.test.ts`.
- **R7** — SI un traspaso se revierte por conflicto, ENTONCES el puntero del mensajero de origen NO
  DEBE quedar modificado.
  *Test previsto:* `tests/integration/db/484-puntero-traspaso-sql-real.test.ts`.
- **R8** — Cuando el sistema limpia un puntero por R1, R3, R4 o R6, NO DEBE modificar ninguna otra
  columna de `usuario` (salvo `updated_at`, que Prisma actualiza como en los escritores previos del puntero), ni añadir filas a `orden_historial_estado`, ni escribir en ningún libro de
  dinero ni en los totales del cierre, más allá de lo que esos caminos ya escribían.
  *Test previsto:* `tests/integration/db/484-puntero-corte-sql-real.test.ts` y
  `tests/integration/db/484-puntero-aprobacion-sql-real.test.ts` (aserciones de neutralidad).

### B. Defensa: un puntero colgado no bloquea a nadie

- **R9** — CUANDO un mensajero consulta su Reparto, el sistema DEBE informar como orden en gestión el
  valor del puntero SOLO si esa orden está en su lista «por gestionar» o «con ayuda» de la misma
  respuesta; en cualquier otro caso DEBE informar que no hay orden en gestión.
  *Test previsto:* `tests/unit/services/mis-asignaciones-puntero-colgado.test.ts` y
  `tests/integration/db/484-puntero-vigente-sql-real.test.ts` (la lectura del repositorio).
- **R10** — CUANDO un mensajero consulta su Reparto, el sistema NO DEBE escribir en la base de datos,
  aunque el puntero esté colgado.
  *Test previsto:* `tests/unit/services/mis-asignaciones-puntero-colgado.test.ts`.
- **R11** — CUANDO un mensajero cuyo puntero está colgado escoge para gestión una orden que puede
  gestionar, el sistema DEBE fijar esa orden como su orden en gestión y responder éxito.
  *Test previsto:* `tests/integration/db/484-puntero-vigente-sql-real.test.ts`.
- **R12** — MIENTRAS el puntero de un mensajero sea vigente y apunte a otra orden, el sistema DEBE
  responder «conflicto» al escoger una orden distinta y NO DEBE cambiar el puntero (comportamiento de
  hoy, que no debe aflojarse).
  *Test previsto:* `tests/integration/db/484-puntero-vigente-sql-real.test.ts`.
- **R13** — CUANDO un mensajero cuyo puntero está colgado registra la gestión de una orden que puede
  gestionar, el sistema NO DEBE rechazarla por tener «otra orden activa en gestión».
  *Test previsto:* `tests/unit/services/mis-asignaciones-puntero-colgado.test.ts` (rama del servicio)
  y `tests/integration/db/484-puntero-vigente-sql-real.test.ts` (la lectura que la alimenta).
- **R14** — MIENTRAS el puntero de un mensajero sea vigente y apunte a otra orden, el sistema DEBE
  responder «conflicto» al registrar la gestión de una orden distinta (comportamiento de hoy).
  *Test previsto:* `tests/unit/services/mis-asignaciones-puntero-colgado.test.ts`.

### C. El incidente, de punta a punta

- **R15** — CUANDO una orden en gestión de un mensajero pasa por el corte diario y después por la
  aprobación de su cierre, el mensajero DEBE quedar sin orden en gestión, su Reparto DEBE informar que
  no hay orden en gestión, y DEBE poder escoger cualquier otra orden gestionable suya.
  *Test previsto:* `tests/integration/db/484-puntero-incidente-blst765.test.ts`.

### D. Datos existentes

- **R16** — La feature NO DEBE incluir migración de esquema ni backfill de datos. La release DEBE
  ejecutar, en solo lectura contra producción, la consulta de verificación de punteros colgados
  definida en `design.md` §6 y registrar su resultado.
  *Verificación prevista:* paso de release en `tasks.md` (T9); no es un test automatizado.

## Fuera de alcance

- La interfaz de Reparto (`RepartoModule.tsx`) no cambia: con R9 recibe `null` y deja de entrar en
  modo foco por sí sola.
- Los caminos enumerados y descartados en `design.md` §2 (registro de gestión, ayuda, devoluciones,
  incidentes, cancelación por API, borrado, liberación de reprogramadas, deshacer gestión).
- Mover la liberación del puntero de la solicitud de ayuda (`SolicitudAyudaService`) dentro de la
  transacción del hecho: deuda conocida y escrita en su código; la defensa (R9-R13) cubre su único
  fallo posible.

## Preguntas abiertas

Ninguna bloqueante. Decisiones técnicas tomadas y anotadas en `design.md` (alcance de los caminos,
dónde vive la defensa, sin backfill). Si el humano quiere que el traspaso (R6/R7) quede fuera por ser
un camino sin incidente medido, se retira sin afectar al resto.
