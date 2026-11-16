# SLT-167 «Recepción: destinatario y tienda en la respuesta» — requirements

Ruta: **ligera** (zona backend, complejidad low). Requisitos: **R710-R716** (reserva R710-R719; R690+
es de SLT-176 «Sacar de CierreBodegaService las lecturas de cifras de presentación del cierre»).
Es la rebanada (a) de SLT-159 «Escaneo continuo en recepciones y recogidas»
(`specs/SLT-159-escaneo-continuo-recepciones/requirements.md`, DC7 (a) y R614;
`design.md > Servidor: destinatario y tienda en la respuesta (R614)`; `tasks.md` T0). Estos
requisitos **desarrollan R614**: SLT-159 los consume (fila de R581, línea de estado de R610) y no
vuelve a implementarlos.

## Lo que ya existe

- Las tres acciones de recepción por guía: `recibirEnBodegaCentralPorQr`
  (`lib/actions/recepcion-bodega-central.ts`, maestro y admin), `recibirEnOrigenPorQr`
  (`lib/actions/recepcion-origen.ts`, adminTienda) y `recibirPorQr` (`lib/actions/recepcion-satelite.ts`,
  adminSatelite). Reenvían tal cual el resultado de su servicio.
- Hoy `ok` trae solo `ordenId` y `estado`, y `ya_recibida` nada más
  (`lib/types/recepcion-bodega-central.ts:24-32`, `lib/types/recepcion-origen.ts:19-28`,
  `lib/types/recepcion-satelite.ts:209-219`, y sus espejos en `lib/interfaces/services/IRecepcion*Service.ts`).
- Orden de las guardas que ya protege el alcance: rol → guía (`no_encontrada`) → alcance
  (`tienda_ajena` en `RecepcionOrigenService.ts:51`, `zona_ajena` en `RecepcionSateliteService.ts:414`;
  la bodega central es global dentro de la empresa) → `ya_recibida` → estado → transición.
- No existe ninguna lectura de «resumen de recepción» (búsqueda de `resumenRecepcion` y `resumen` en
  `lib/`, 2026-11-16: ninguna en recepción). El nombre de la tienda ya se lee como
  `tienda.nombre` en `OrdenRepository` (p. ej. `tiendaNombre: row.tienda.nombre`).

## Alcance

**Dentro:**
- Las respuestas `ok` y `ya_recibida` de las tres acciones de recepción ganan un `resumen` con dos
  textos: el destinatario de la orden (`orden.destinatario`, el nombre) y el nombre de la tienda dueña
  (`usuario.nombre` de `orden.tienda_id`).
- Una lectura nueva del resumen por id de orden en el repositorio de órdenes, acotada a la empresa de
  la sesión.

**Fuera:**
- Cualquier cambio de pantalla: los consumidores de hoy ignoran el campo nuevo. La lista y la línea
  de estado que lo muestran son de SLT-159 (rebanadas b y c).
- Acciones nuevas o en lote, esquema, migraciones, RLS, permisos, roles o el orden de las guardas.
- Teléfono, dirección, correo, cédula, montos o cualquier otro dato de la orden, del destinatario o
  de la tienda (privacidad: el escaneo solo necesita el nombre para reconocer el paquete).

## Requisitos (EARS)

- **R710** — CUANDO `recibirEnBodegaCentralPorQr`, `recibirEnOrigenPorQr` o `recibirPorQr` responde
  `ok`, la respuesta DEBE traer, además de `ordenId` y `estado`, `resumen` con `destinatario` (el
  destinatario de esa orden) y `tienda` (el nombre de la tienda dueña de esa orden).
- **R711** — CUANDO cualquiera de las tres acciones responde `ya_recibida`, tanto por la guarda de
  idempotencia como tras perder la carrera y releer, la respuesta DEBE traer el mismo `resumen` que
  R710.
- **R712** — SI la respuesta es cualquier otra (`forbidden`, `sin_zona`, `tienda_ajena`, `zona_ajena`,
  `no_encontrada`, `estado_invalido`, `validation_error`, `conflict` o `unauthenticated`), ENTONCES
  NO DEBE traer `resumen` y el sistema NO DEBE leer el resumen de la orden. `tienda_ajena` y
  `zona_ajena` DEBEN seguir respondiendo antes de cualquier lectura del resumen.
- **R713** — El `resumen` DEBE tener exactamente las claves `destinatario` y `tienda`, ambas texto;
  NO DEBE traer teléfono, dirección, correo ni ningún otro dato de la orden, del destinatario o de la
  tienda.
- **R714** — La lectura del resumen por id de orden DEBE devolver el destinatario y el nombre de la
  tienda solo de una orden de la empresa de la sesión. SI la orden es de otra empresa o el id no
  existe, ENTONCES NO DEBE devolver datos.
- **R715** — SI la lectura del resumen no devuelve datos o falla, ENTONCES la respuesta DEBE conservar
  su `status` (`ok` o `ya_recibida`) y sus demás campos, sin `resumen`, y la recepción ya hecha NO
  DEBE deshacerse.
- **R716** — Los campos y respuestas de hoy NO DEBEN cambiar: `status`, `ordenId` y `estado` con los
  mismos valores, y el mismo `status` para cada caso que hoy cubren los tests de los tres servicios y
  las tres acciones.

## Trazabilidad (R → test)

Literales a mano (no se compara contra la función que los genera). En los negativos, valores imposibles
por casualidad: guía `7777777`, id `00000000-0000-0000-0000-00000000dead`.

| R | Test |
| --- | --- |
| R710 | `tests/unit/services/recepcion-resumen.test.ts` (nuevo) — en los tres servicios, con un repo doble cuyo `resumenRecepcion` devuelve `{ destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" }`, `ok` es `toEqual` del literal completo con ese `resumen`; el doble se llamó con el `id` de la orden recibida. Y las tres acciones, con `deps.service` doble, reenvían el `resumen`. |
| R711 | `tests/unit/services/recepcion-resumen.test.ts` — `ya_recibida` por la guarda (orden ya en el estado destino) y `ya_recibida` tras carrera perdida (la transición devuelve `false` y la relectura está recibida), en los tres servicios: traen el `resumen` literal. |
| R712 | `tests/unit/services/recepcion-resumen.test.ts` — tabla por servicio: `forbidden`, `no_encontrada` (guía `7777777`), `estado_invalido`, `conflict`, `tienda_ajena` (origen), `zona_ajena` y `sin_zona` (satélite): sin clave `resumen` y `resumenRecepcion` del doble no llamado. |
| R713 | `tests/unit/services/recepcion-resumen.test.ts` — `Object.keys(r.resumen).sort()` es `["destinatario", "tienda"]`. `tests/integration/db/recepcion-resumen-sql-real.test.ts` — lo que devuelve la lectura real tiene exactamente esas dos claves aunque la orden sembrada lleve `telefonoDest` y `direccion` (con valores sembrados que el test comprueba que NO aparecen en el objeto serializado). |
| R714 | `tests/integration/db/recepcion-resumen-sql-real.test.ts` (nuevo, Postgres real) — siembra dos empresas, cada una con su tienda y una orden; leyendo con la empresa A: la orden de A devuelve su destinatario y tienda sembrados (**control positivo**: si no hay datos, el test falla, no pasa); la orden de B y el id `…dead` no devuelven datos. Se mata con una mutación (leer sin el acotado de empresa) antes de darlo por bueno; la mutación y su rojo quedan en `progress/impl_SLT-167.md`. |
| R715 | `tests/unit/services/recepcion-resumen.test.ts` — con `resumenRecepcion` que devuelve `null` y con uno que rechaza: `ok` y `ya_recibida` siguen con su `status`, `ordenId` y `estado`, sin `resumen`; la transición del doble se llamó una vez y no hubo otra escritura. |
| R716 | Los tests de hoy en verde, sin cambiar sus aserciones de `status`, `ordenId` ni `estado`: `tests/unit/services/recepcion-bodega-central-service.test.ts`, `recepcion-origen-service.test.ts`, `recepcion-satelite-service.test.ts`, `rol-admin-satelite-authz.test.ts` y `tests/unit/actions/recepcion-*-action.test.ts` (solo se añade `resumenRecepcion` a sus dobles si lo necesitan). |

## Tasks

Todas `backend_dev`. Requisito previo: `.env` en el worktree y base local desechable migrada y con
seed antes del primer gate (si no, la integración se salta y el gate sale verde a ciegas).

- [ ] **T1 — Lectura del resumen.** `resumenRecepcion(ordenId)` en `IOrdenRepository` y
  `OrdenRepository`: selecciona solo `destinatario` y `tienda.nombre` y devuelve
  `{ destinatario, tienda } | null`; acotada a la empresa de la sesión con el mismo mecanismo que
  el resto de lecturas de `OrdenRepository` (extensión del cliente; si el implementer necesita SQL a
  mano, filtro explícito por `organizacion_id`). El tipo `ResumenRecepcion` vive junto a la
  interfaz y lo reutilizan los tres resultados. *Hecho:* R713 y R714 en verde en
  `tests/integration/db/recepcion-resumen-sql-real.test.ts`, que siembra sus datos con
  `tests/fabricas/organizaciones` dentro de una transacción revertida (patrón de
  `tests/integration/db/zona-especial-dos-empresas.test.ts` y
  `ruta-primera-pendiente-dos-empresas-sql-real.test.ts`), falla cerrado si faltan catálogos, solo
  corre contra host local, y se pone rojo con la mutación de R714.
- [ ] **T2 — Resumen en los tres servicios (depende de T1).** Los tipos de resultado
  (`lib/types/recepcion-*.ts` y `lib/interfaces/services/IRecepcion*Service.ts`) ganan
  `resumen?: ResumenRecepcion` en `ok` y `ya_recibida`; los tres servicios añaden
  `"resumenRecepcion"` a su `Pick` y lo llaman solo justo antes de devolver `ok` o `ya_recibida`
  (también en la relectura tras carrera), después de todas las guardas; si devuelve `null` o lanza,
  responden sin `resumen` (R715). Las acciones no cambian. *Hecho:* R710-R712 y R715 en verde en
  `tests/unit/services/recepcion-resumen.test.ts`.
- [ ] **T3 — Sin regresión (depende de T2).** Dobles de los tests existentes con `resumenRecepcion`
  donde lleguen a `ok`/`ya_recibida`; sus aserciones de `status`, `ordenId` y `estado` intactas.
  *Hecho:* R716: los archivos de su fila en verde con `pnpm exec vitest related --run`, y
  `pnpm run typecheck` en verde (los componentes que consumen las acciones compilan sin tocarse).
- [ ] **T4 — Cierre.** `./init.sh` en verde con la integración ejecutada (no saltada); mapa R → test
  y la mutación de R714 en `progress/impl_SLT-167.md`. *Hecho:* gate verde y mapa con R710-R716.

## Archivos esperados

- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/interfaces/services/IRecepcionBodegaCentralService.ts`
- `lib/interfaces/services/IRecepcionOrigenService.ts`
- `lib/interfaces/services/IRecepcionSateliteService.ts`
- `lib/types/recepcion-bodega-central.ts`
- `lib/types/recepcion-origen.ts`
- `lib/types/recepcion-satelite.ts`
- `lib/services/RecepcionBodegaCentralService.ts`
- `lib/services/RecepcionOrigenService.ts`
- `lib/services/RecepcionSateliteService.ts`
- `tests/unit/services/recepcion-resumen.test.ts`
- `tests/integration/db/recepcion-resumen-sql-real.test.ts`
- `tests/unit/services/recepcion-bodega-central-service.test.ts`
- `tests/unit/services/recepcion-origen-service.test.ts`
- `tests/unit/services/recepcion-satelite-service.test.ts`
- `tests/unit/services/rol-admin-satelite-authz.test.ts`

## Tamaño

- **17 archivos** (11 de producción, 6 de tests: 2 nuevos y 4 que pueden necesitar el método en su
  doble); tope 40, 80 % = 32. Cabe en un PR.
- Líneas estimadas: producción ~110 (tipos ~25, repositorio ~30, servicios ~45, interfaces ~10);
  tests ~380 (servicios ~200, Postgres real ~150, dobles ~30). Bajo los topes (1000 / 3000).
- Coincide con SLT-159 «Escaneo continuo en recepciones y recogidas» en los 8 archivos de su
  rebanada (a), que esta ficha la sustituye; SLT-159 (b) y (c) no los vuelven a tocar.

## Preguntas abiertas

- **Resuelta por el spec_author (2026-11-16):** `resumen` va como clave **opcional** en los tipos y
  sin `resumen` cuando la lectura no da datos o falla (R715): la recepción ya se escribió y responder
  error haría reintentar algo hecho; SLT-159 R581 ya pinta «—» si falta. Opcional además evita tocar
  los dobles de los tests de componentes que construyen `ok` a mano.
- **Resuelta (privacidad):** solo nombre del destinatario y nombre de la tienda (R713). Los cuatro
  roles que reciben ya ven ambos en sus listados (`/ordenes`; la satélite por
  `relaciones.tienda` recortado por zona, sin correo ni teléfono).
- **Para el leader:** `tasks.md` de SLT-159 lista los 8 archivos de la rebanada (a) y la fila R614 de
  su trazabilidad; al mergear esta ficha conviene anotar allí que R614 se cumple con R710-R716 de
  SLT-167, para que la rebanada (b) no la reimplemente. No bloquea.
- Ninguna para Carlos.
