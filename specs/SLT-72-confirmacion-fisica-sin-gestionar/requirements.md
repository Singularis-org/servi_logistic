# SLT-72 «Confirmación física también para las órdenes sin gestionar del cierre»

> **RESUELTO (Carlos, 2026-10-31): Q1 = (a).** SLT-72 implementa **tal cual** el spec ya aprobado
> de la ficha 451: `specs/451-confirmacion-fisica-sin-gestionar/` (requirements R1–R40, design,
> tasks). Ese es el spec vigente; este archivo solo enlaza la ficha del board con él y conserva la
> evidencia reunida el 2026-10-31. El dato abierto «guía congelada o viva» queda como lo decidió
> la 451 (su Q2). Cualquier desviación del código actual respecto a la 451 (escrita el 2026-09-21)
> se anota en `progress/impl_SLT-72.md`.

## Alcance (de la ficha)

Al aprobar un cierre, las órdenes en `novedad_interna` (sin gestionar) vuelven a bodega sin escaneo:
la confirmación física (238) solo cubre gestiones cuyo resultado vuelve
(`lib/types/gestion-retorno.ts`). Exigir la guía de cada una; si falta una, el botón Aprobar sigue
deshabilitado, como hoy con las demás. HOTFIX urgente a `prod`.

## Decisiones cerradas (no reabrir)

| Fecha | Quién | Decisión |
|---|---|---|
| 2026-10-31 | Carlos | Ficha nueva y HOTFIX urgente. Origen: se aprobó un cierre con 23 órdenes sin gestionar sin escanearlas; la confirmación física (238) solo cubre gestiones con resultado que vuelve a bodega (`lib/types/gestion-retorno.ts`), y las sin gestionar (`novedad_interna`) no tienen gestión. |
| 2026-10-31 | Carlos | Si falta una, NO se puede aprobar — igual que hoy: el botón Aprobar queda deshabilitado hasta leer todas las que el sistema exige. Sin puerta de escape (misma D2 de 238). |

## Requisitos (EARS)

Los de la 451 (`specs/451-confirmacion-fisica-sin-gestionar/requirements.md`, R1–R40).

## Preguntas abiertas

**Q1 · Ya existe un spec de esta misma feature: `specs/451-confirmacion-fisica-sin-gestionar/`. [BLOQUEA]**

Buscado `sin gestionar`, `confirmación física`, `escane` en `specs/`, `feature_list.json` y el
código (el grafo no tiene proyecto indexado para este worktree; se usó Grep/Read).

- **Qué apareció.** `specs/451-confirmacion-fisica-sin-gestionar/{requirements,design,tasks}.md`, en
  el árbol de `origin/prod`. Ficha 451, «Los paquetes sin gestionar también se escanean para
  recibir el cierre». Tiene 40 requisitos EARS y su propia **decisión humana firmada el
  2026-09-21**, la misma que la segunda fila de arriba: sin salida de emergencia y, si falta un
  paquete, se rechaza el cierre.
- **No está implementada.** Las tasks están sin marcar (`[ ]`). La columna que define,
  `cierre_sin_gestion.confirmada_fisica_at`, no está en `db/schema.prisma` (modelo
  `CierreSinGestion`, ~L3136). `CierresAdminService.validarConfirmacionFisica` y
  `CierresAdminRepository.findGestionesRetornablesDelCierre` solo leen `gestion_orden`. No aparece
  en `feature_list.json`.
- **Cómo cambia lo que pide el hotfix.** La 451 resuelve el mismo defecto con dos piezas más:
  1. Una **migración** que persiste una marca por barrida (`confirmada_fisica_at`, con `down.sql`)
     y la escribe dentro de la transacción de aprobación, con fallo cerrado. Eso toca
     `resolverCierre` y el inventario de escrituras cubiertas.
  2. Extiende el punto único `gestion-retorno.ts` a dos orígenes, `gestion` y `barrida`.

  El encargo del hotfix prefiere no migrar si la solución es igual de correcta. Una variante
  mínima bloquearía igual sin persistir nada, con estas piezas:
  - un arreglo paralelo `{ordenId, numGuia}` en el payload;
  - una validación de cobertura en el servicio contra `cierre_sin_gestion` del cierre, dentro del
    alcance;
  - una sección más en la ventana.

  Esa variante pierde lo que la 451 llama «la mitad auditable»: R20-R26 de la 451, poder demostrar
  después que se confirmaron esas barridas.

El humano decide una de tres (`docs/specs.md`):

- **(a) Es la misma feature: se implementa la 451.** SLT-72 la absorbe con su spec tal cual, con
  migración incluida, y se cancela o renombra una de las dos fichas.
- **(b) Se solapa en parte: hotfix mínimo ahora.** SLT-72 implementa solo el bloqueo (sección B y E
  de la 451), sin migración ni marca. La parte persistida de la 451 (sección C) queda como ficha
  aparte hacia `dev`.
- **(c) Otra cosa.**

La decisión entra como fila nueva en `## Decisiones cerradas (no reabrir)`.

**Evidencia ya reunida para quien escriba el spec después (no son decisiones, son hechos del código):**

- **Qué se tiene que escanear.** Todas las órdenes que el corte barrió en este cierre, de las dos
  ramas de la liberación al aprobar. Las dos acaban en un estado de bodega, por eso las dos se
  escanean.
  - Rama bajo el tope: va a `en_bodega_central`/`en_bodega_satelite` (#17/#18,
    `liberacion_sin_gestionar`).
  - Rama en el tope, ficha 276: va a `devolucion_a_origen_por_rechazo` (#68,
    `rechazo_tope_intentos`). En la misma transacción, el bloque de la 139 la lleva a
    `por_devolver_a_bodega_central`/`por_devolver_a_tienda`.
  - Es el mismo destino final que una gestión `devolucion_a_origen_por_rechazo`, y la 238 ya la
    exige (`RETORNA_A_BODEGA.devolucion_a_origen_por_rechazo = true`).
  - Referencias: `CierresAdminRepository.resolverCierre`, ~L1940-2160, y
    `lib/types/order-status-transiciones.ts`, `novedad_interna`. Coincide con la 451 R26.
- **La lista es estable.** `cierre_sin_gestion` solo se escribe en la misma transacción que crea el
  cierre (`CierreDiaRepository.crearCierre`). Desde `novedad_interna` solo salen #17/#18/#68, y las
  tres son de la aprobación. Así que la lista no crece entre la validación y la aprobación.
- **`sinGestionRegistrado`.** Los cierres `solicitado`/`vencido`/`rechazado` lo tienen en `true`
  (backfill de `db/migrations/20260822120000_cierre_sin_gestion/migration.sql`, paso 7) y los
  cierres nuevos nacen en `true`. Un `false` solo puede estar en un cierre ya aprobado.
- **Cómo identificar cada orden en el payload.** `@@unique([cierreId, ordenId])` en
  `cierre_sin_gestion`, así que `ordenId` basta para identificar la fila dentro del cierre (451
  design §4). La ventana ya recibe esas filas en `detalle.ordenesSinGestion` (`CierreOrdenSinGestion`,
  con `ordenId` y `numGuia`).
- **Qué guía comparar: dato abierto.** La 451 (Q2) eligió la guía **congelada**
  (`cierre_sin_gestion.num_guia`) para que pantalla y servidor exijan lo mismo. La 238 compara con
  la viva (`orden.num_guia`). Hay que decidirlo al especificar.
