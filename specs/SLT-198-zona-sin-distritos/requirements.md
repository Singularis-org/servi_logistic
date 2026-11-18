# SLT-198 «Cerrar una bodega: dejar una zona sin distritos» — requirements

> Ruta ligera, zona fullstack, complejidad low. Rango reservado: **R1220–R1239** (se usan
> R1220–R1233). Sin migración ni cambio de esquema. Depende de SLT-197 «Retirar paquetes de una
> bodega satélite a la central» (ya en `dev`). El grafo de código no indexa este worktree: todo se
> leyó con Grep/Read.

## Alcance

Problema real (producción, 2026-11-17): el cliente cierra la bodega satélite «Cartago (Kevin #2)», que
tiene un solo distrito (Quebradilla), y quiere pasarlo a «GAM» (la zona central). Hoy no puede:

- guardar Cartago sin distritos falla en el borde: `lib/types/zona.ts:27`
  (`distritoIds: z.array(idSchema).min(1)`), dentro de `zonaFieldsComunes`, que comparten
  `crearZonaSchema` (`:109`) y `actualizarZonaSchema` (`:144`). El formulario valida contra el mismo
  esquema antes de llamar a la acción (`CrearZonaForm.tsx:148-152`), así que el rechazo sale ya en el
  navegador;
- guardar GAM con Quebradilla falla porque un distrito es único por empresa:
  `ZonaRepository.update` → `leerDistritosEnOtraZona` (`ZonaRepository.ts:259-273`, `:503-506`) →
  `ZonaService.erroresDistritoEnOtraZona` (`ZonaService.ts:53-61`, `:234-238`).

Bloqueo mutuo. La salida: **al editar** una zona se permite dejarla con 0 distritos; **al crear** se
sigue exigiendo al menos uno. Flujo del cliente: guardar Cartago vacía → guardar GAM con Quebradilla →
retirar el estante de Cartago a la central con la acción de SLT-197.

### Lo que ya existe (y se reutiliza, no se re-crea)

Buscado `zona sin distritos`, `distritoIds min(1)`, `cerrar bodega`, `retirar a central` en
`feature_list.json`, `specs/` y el código:

- **SLT-197** (`specs/SLT-197-retirar-satelite-a-central/`): la transición
  `en_bodega_satelite → en_ruta_bodega_central`, su recepción en la central y R986 (guardar una zona
  re-asigna la zona de una orden retirada). Esta ficha no la toca; solo la usa.
- **La capa de datos ya tolera la lista vacía.** `leerDistritosEnOtraZona` sale con `[]`
  (`ZonaRepository.ts:264`); `countExistingDistritos([])` devuelve 0 y cuadra con `length` 0
  (`:907-910`, `ZonaService.ts:124-128`); el reemplazo por diferencia borra todo lo que «sale»
  (`ZonaRepository.ts:572-583`); `create` ya protege `createMany` con `length > 0` (`:374`).
- **La reconciliación (366/377) ya hace lo correcto con un distrito que se queda sin zona:** el
  distrito quitado entra en `distritosAfectados` (`:601-603`), `zonaUnicaDeDistrito([])` da `null`
  (`_shared/zona-colapso.ts:22`) y no mueve ninguna orden (`:628-629`). Al guardar luego GAM con el
  distrito, resuelve a GAM y mueve las elegibles; las del estante se quedan y se cuentan como
  retenidas (`:672-680`).
- **Las órdenes nuevas ya salen del distrito, no de la zona:** `findDistritosByCantonIds`
  (`OrdenRepository.ts:2703-2746`) y `findDistritoParaCorreccion` (`:2876-2909`) colapsan
  `zona_distrito` con `zonaUnicaDeDistrito`. Una zona sin filas en `zona_distrito` no puede salir de ahí.
- **El rastro de distritos** (SLT-76, `ZonaRepository.ts:799-819`) ya escribe una fila por distrito
  quitado.
- **El listado** ya recibe `distritosCount` (`lib/types/zona.ts:203`, `ZonaRepository.ts:416-448`) y
  pinta «N distritos» (`ZonasModule.tsx:249-251`); la marca de central ya usa `Badge`
  (`ZonasModule.tsx:244-246`, `components/ui/badge`). La marca nueva reutiliza ese mismo `Badge`.

### Qué otras partes asumen «≥ 1 distrito» (revisado)

| Parte | Dónde | ¿Se rompe con 0? |
|---|---|---|
| Zod compartido crear/actualizar | `lib/types/zona.ts:24-28` | **Sí: es el bloqueo.** Se separa (R1220, R1221). |
| Formulario de zona | `CrearZonaForm.tsx:148-152` valida con el esquema de la acción | Se arregla solo al separar el zod (R1231). |
| Colapso distrito → zona | `_shared/zona-colapso.ts:22`, `OrdenRepository.ts:2729-2745`, `cobertura-distrito.ts:26,34`, `GeoRepository.ts:397` | No: opera por distrito; la zona vacía simplemente no aparece (R1224). |
| Re-asignación de `orden.zona_id` al guardar | `ZonaRepository.ts:600-711` | No (R1225, R1226). |
| Grupos de distritos (SLT-52) | `zona_distrito` es padre CASCADE de `grupo_distritos_distrito` (`ZonaRepository.ts:567-570`); los grupos ya admiten `distritoIds: []` (`lib/types/tarifa-flexible.ts:268`) | No: los grupos de la zona quedan vacíos, no se borran. |
| Tarifas por zona / pago al mensajero | `tarifa_zona_mensajero` y tarifas cuelgan de `zona_id`, no de los distritos | No: se conservan (R1220). |
| Selects de zona / filtro de `/ordenes` | `ZonaRepository.listLite` (`:451-456`) lista TODAS las zonas | No; y debe seguir así para retirar bodega a bodega (R1232). |
| Mapa/cobertura y su descarga | `cobertura-distrito.ts`, `cobertura-descarga-columnas.ts:70` | No: van por distrito. |
| Analítica | agrega por `orden.zona_id` | No: el histórico de Cartago sigue siendo de Cartago. |
| Borrar zona | `ZonaRepository.hardDelete` (`:848-905`) | No: con órdenes sigue `en_uso` (R1229). |
| **Zona central** | `ZonaRepository.update` (`:487-499`) | **Decisión técnica: NO se permite** (R1222, ver abajo). |

### Decisión técnica: la zona central no puede quedarse sin distritos (R1222)

La zona central es la que recibe en la central y la que reparte con «Asignar mensajero» de la central
(`GuiaAsignacionService.ts:430`, citado por SLT-197). Vaciarla deja a la empresa sin reparto central y
el caso pedido no lo necesita (se vacía una **satélite**). Ya existe el precedente de rechazar lo que
deja sin central (`sin_zona_central`, `ZonaRepository.ts:497-499`), con un mensaje que dice qué hacer.
Se rechaza igual: «para vaciarla, marca primero otra zona como bodega principal». Si el humano quiere
lo contrario, se cambia al aprobar el spec; el resto de la ficha no depende de esto.

### Lo que NO entra

- Desactivar, ocultar o borrar la bodega satélite, ni tocar a su `adminSatelite` o sus mensajeros.
- Cualquier cambio a la acción de retiro de SLT-197 o a la recepción en la central.
- Bloquear «Rutear a bodega satélite» hacia una zona sin distritos (ver P2).
- Un estado nuevo de zona («cerrada», «inactiva»): la marca es derivada de `distritosCount === 0`.
- Migración, esquema o RLS: nada cambia en `db/`.

## Decisiones cerradas (no reabrir)

| # | Decisión | Fecha | Quién | Cubre |
|---|---|---|---|---|
| D1 | Al EDITAR una zona se permite guardarla con 0 distritos; al CREAR se sigue exigiendo ≥ 1. | 2026-11-17 | Carlos | R1220, R1221, R1231 |
| D2 | Una zona sin distritos no recibe órdenes nuevas (la zona de la orden sale del distrito vía `zona_distrito`); sus paquetes en estante siguen ahí y se retiran a la central con la acción de SLT-197. | 2026-11-17 | Carlos | R1224, R1225, R1227 |
| D3 | La lista de Zonas (Configuración → Zonas) marca la zona como «Sin distritos». | 2026-11-17 | Carlos | R1230 |
| D4 | Flujo: guardar Cartago vacía → guardar GAM con Quebradilla → retirar el estante a la central. | 2026-11-17 | Carlos | R1225, R1226, R1227, R1228, R1233 |

## Requisitos (EARS)

### Guardar una zona sin distritos

- **R1220** — CUANDO un maestro actualiza una zona no central con la lista de distritos vacía, el
  sistema DEBE guardarla sin distritos y DEBE conservar sin cambio su nombre, su marca de central, su
  pago al mensajero, su SINPE y sus tarifas. (D1)
- **R1221** — SI se crea una zona con la lista de distritos vacía, ENTONCES el sistema DEBE
  rechazarla con error de validación en `distritoIds` y no crear nada. (D1)
- **R1222** — SI una actualización dejaría sin distritos a la zona central (porque ya es la central y
  el guardado no le quita la marca, o porque el mismo guardado la marca como central), ENTONCES el
  sistema DEBE rechazarla con error de validación en `distritoIds` y el mensaje «La zona de bodega
  principal necesita al menos un distrito. Para vaciarla, marca primero otra zona como bodega
  principal.», sin escribir nada (ni nombre, ni distritos, ni marca, ni historial).
- **R1223** — CUANDO se vacía una zona, el sistema DEBE registrar en el historial una fila por cada
  distrito quitado, como en cualquier otro guardado de distritos (SLT-76).

### Órdenes de la zona vaciada

- **R1224** — MIENTRAS una zona no tiene distritos, ninguna orden nueva DEBE resolverse a esa zona: un
  distrito que salió de ella y no está en otra zona DEBE resolver «sin zona», y uno que ya está en otra
  zona DEBE resolver esa otra. (D2)
- **R1225** — CUANDO se vacía una zona, el sistema NO DEBE cambiar la zona de ninguna de sus órdenes
  (`ordenesReconciliadas = 0`). (D2, D4) *Corregido por el leader 2026-11-17 tras la implementación: el
  guardado no informa «retenidas» al vaciar, porque con el criterio de la ficha 377 «retenida» es una
  orden que el guardado HABRÍA movido y al vaciar no se movería ninguna; el conteo de retenidas aparece
  en el guardado de la zona que recibe el distrito (R1226).*
- **R1226** — CUANDO, con esa zona ya vacía, se guarda otra zona que añade uno de sus antiguos
  distritos, el sistema DEBE aceptar el guardado (sin «el distrito ya está en otra zona»), DEBE pasar a
  la nueva zona las órdenes elegibles de ese distrito que no están en el estante, y DEBE dejar con su
  zona y contar como retenidas las que están en el estante. (D4)
- **R1227** — MIENTRAS una zona no tiene distritos, la acción «Retirar a bodega central» (SLT-197)
  DEBE seguir admitiendo sus órdenes en `en_bodega_satelite` y pasarlas a `en_ruta_bodega_central`. (D2, D4)
- **R1228** — CUANDO una orden retirada de una zona sin distritos ya está en `en_bodega_central` y se
  guarda la zona que contiene su distrito, el sistema DEBE pasarla a esa zona (R986 de SLT-197
  aplicado al caso de la zona vaciada). (D4)

### Lo que no cambia

- **R1229** — SI se borra una zona sin distritos que todavía tiene órdenes, ENTONCES el sistema DEBE
  rechazarlo con conflicto de motivo `en_uso` y no borrar nada; SI no tiene órdenes, usuarios ni
  tarifas liquidadas, ENTONCES DEBE borrarla.
- **R1232** — Los selectores de zona (lista ligera de zonas, filtro de zona de `/ordenes`) DEBEN seguir
  ofreciendo la zona sin distritos.

### Pantalla

- **R1230** — MIENTRAS una zona no tiene distritos, el listado de Configuración → Zonas DEBE mostrarla
  con la marca «Sin distritos» (el mismo `Badge` que la marca de bodega principal) en lugar del texto
  «0 distritos»; una zona con al menos un distrito NO DEBE llevar esa marca. (D3)
- **R1231** — CUANDO el maestro edita una zona, desmarca todos sus distritos y guarda, el formulario
  DEBE enviar el guardado sin error en el campo de distritos; CUANDO crea una zona sin marcar ningún
  distrito, el formulario DEBE mostrar el error del campo y NO DEBE llamar a la acción. (D1)
- **R1233** — El flujo de D4 DEBE poder recorrerse en pantalla: editar Cartago y dejarla sin
  distritos → el listado la marca «Sin distritos» → editar GAM y añadirle Quebradilla → guardar sin
  error. (D4)

## Trazabilidad prevista (R -> test)

Integración con Postgres real en base **desechable** (`con-desechable.cjs` + `prisma migrate deploy`
+ `pnpm db:seed`): nunca la base del `.env`, nunca `migrate reset`.

| R | Test | Tipo |
|---|---|---|
| R1220 | `tests/unit/types/zona-schema.test.ts` (`actualizarZonaSchema` acepta `[]`) + `tests/integration/db/zona-sin-distritos.test.ts` (filas de `zona_distrito` = 0; nombre, marca, `tarifa_zona_mensajero`, SINPE y tarifas iguales antes/después) | unit + integración |
| R1221 | `tests/unit/types/zona-schema.test.ts` (ya existe el caso de `crearZonaSchema`; se conserva) + `tests/integration/actions/zonas-action.test.ts:110` (se conserva) | unit |
| R1222 | `tests/unit/types/zona-schema.test.ts` (`esCentral: true` + `[]` rechazado) + `tests/unit/services/zona-service.test.ts` (estado del repo → `validation_error` con el literal del mensaje) + `zona-sin-distritos.test.ts` (central con `esCentral` ausente + `[]` → rechazo y nada escrito, contando filas de `zona_distrito` y de historial) | unit + integración |
| R1223 | `zona-sin-distritos.test.ts` (una fila de historial por distrito quitado) | integración |
| R1224 | `zona-sin-distritos.test.ts` (`OrdenRepository.findDistritosByCantonIds` y `findDistritoParaCorreccion` devuelven `zonaId: null` tras vaciar y el id de GAM tras guardarla con el distrito) | integración |
| R1225 | `zona-sin-distritos.test.ts` (órdenes de Cartago: `zona_id` intacto en todas; `ordenesReconciliadas = 0`) | integración |
| R1226 | `zona-sin-distritos.test.ts` (guardar GAM con Quebradilla → `ok`; en tránsito pasan a GAM; las del estante siguen en Cartago y se cuentan) | integración |
| R1227 | `zona-sin-distritos.test.ts` (retiro de SLT-197 sobre una orden del estante de Cartago vacía → `en_ruta_bodega_central`) | integración |
| R1228 | `zona-sin-distritos.test.ts` (orden recibida en `en_bodega_central` con zona Cartago; re-guardar GAM → `zona_id` = GAM, no retenida) | integración |
| R1229 | `zona-sin-distritos.test.ts` (borrar Cartago vacía con órdenes → `referenced`; una zona vacía sin nada → borrada) | integración |
| R1230 | `tests/components/ZonasModuleListado.test.tsx` (`distritosCount: 0` → «Sin distritos» y sin «0 distritos»; `1` → sin la marca) | componente |
| R1231 | `tests/components/ZonaFormSinDistritos.test.tsx` (editar sin distritos → llama a `actualizarZona` con `distritoIds: []`; crear sin distritos → error inline y la acción no se llama) | componente |
| R1232 | `zona-sin-distritos.test.ts` (`ZonaRepository.listLite` incluye la zona vacía) | integración |
| R1233 | `e2e/zona-sin-distritos.spec.ts` | E2E |

## Tasks

- [x] **T1 — Separar el zod (R1220, R1221, R1222).** En `lib/types/zona.ts`, `distritoIds` sale de
  `zonaFieldsComunes`: `crearZonaSchema` conserva `.min(1)`; `actualizarZonaSchema` acepta `[]`, y su
  `superRefine` añade el rechazo de `esCentral === true` con `distritoIds` vacío (issue en
  `distritoIds`, el mensaje de R1222). Comentario corto con el porqué (SLT-198). *Hecho:* tests de
  `tests/unit/types/zona-schema.test.ts` en verde (actualizar acepta `[]`; crear sigue rechazando;
  `esCentral: true` + `[]` rechazado), y el caso existente de crear sin distritos intacto.
- [x] **T2 — Guarda de la central en el repositorio (R1222).** `UpdateZonaResult` gana el estado
  `central_sin_distritos` (`lib/interfaces/repositories/IZonaRepository.ts`). En
  `ZonaRepository.update`, junto al rechazo de `sin_zona_central` y antes de la primera escritura:
  si `data.distritoIds` está vacío y (`exists.esCentral` y `data.esCentral !== false`, o
  `data.esCentral === true`), devolver ese estado. `ZonaService.actualizar` lo traduce a
  `validation_error` en `distritoIds` con el literal de R1222. *Hecho:* caso nuevo en
  `tests/unit/services/zona-service.test.ts` y el de integración de R1222 en verde. Depende de T1.
- [x] **T3 — Integración del flujo (R1220, R1222–R1229, R1232).** Nuevo
  `tests/integration/db/zona-sin-distritos.test.ts` sobre base desechable: monta Cartago (satélite,
  1 distrito) y GAM (central), órdenes de Quebradilla en `en_bodega_satelite` y en
  `en_ruta_bodega_satelite`, y recorre el flujo de D4 con las aserciones de la tabla de trazabilidad.
  Cada aserción de «no cambió» compara contra un valor leído antes, no contra la función que lo
  produce. *Hecho:* verde, y una mutación de la guarda de T2 (quitarla) lo pone rojo. Depende de T2.
- [x] **T4 [P] — Marca «Sin distritos» en el listado (R1230).** En `ZonasModule.tsx` (`ZonasList`),
  con `distritosCount === 0` se pinta `<Badge variant="secondary">Sin distritos</Badge>` (mismo
  componente y variante que «Zona de bodega principal») en lugar de «0 distritos». Sin estilos ni
  componentes nuevos. *Hecho:* casos nuevos en `tests/components/ZonasModuleListado.test.tsx` en verde.
- [x] **T5 [P] — Formulario (R1231).** Verificar que `CrearZonaForm` no valida los distritos por su
  cuenta (hoy usa el esquema de la acción, `CrearZonaForm.tsx:148-152`); solo se toca si el test lo
  pide. *Hecho:* `tests/components/ZonaFormSinDistritos.test.tsx` en verde. Depende de T1.
- [x] **T6 — E2E corto (R1233).** `e2e/zona-sin-distritos.spec.ts`: maestro edita una satélite de un
  solo distrito y la deja vacía → ve «Sin distritos» → edita la central, añade ese distrito y guarda
  sin error. Esperas por condición, nunca `waitForTimeout`. Correrlo en local con base desechable
  nueva y `next build` antes del PR (`docs/perfil-agentes.md > Todos los agentes`); también
  `e2e/zonas-crear-sin-costos.spec.ts`, que toca la misma pantalla. *Hecho:* los dos en verde en local.
  Depende de T1, T4.
- [x] **T7 — Cierre.** `./init.sh` en verde (con `.env` copiado al worktree, para que la integración no
  se salte), mapa `R1220–R1233 → test` y evidencia (salidas del gate, del test de integración, de la
  mutación de T3 y de los E2E) en `progress/impl_SLT-198.md`. *Hecho:* el archivo existe con cada R
  mapeado y el gate verde. Depende de T1–T6.

## Archivos esperados

- `lib/types/zona.ts`
- `lib/interfaces/repositories/IZonaRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/services/ZonaService.ts`
- `app/(app)/configuracion/zonas/_components/ZonasModule.tsx`
- `app/(app)/configuracion/zonas/_components/CrearZonaForm.tsx`
- `tests/unit/types/zona-schema.test.ts`
- `tests/unit/services/zona-service.test.ts`
- `tests/integration/db/zona-sin-distritos.test.ts`
- `tests/components/ZonasModuleListado.test.tsx`
- `tests/components/ZonaFormSinDistritos.test.tsx`
- `e2e/zona-sin-distritos.spec.ts`
- `progress/impl_SLT-198.md`

## Tamaño

13 archivos (de 40). Producción: ~40–70 líneas (zod, guarda, traducción en el servicio, `Badge`).
Tests: ~350–500 líneas, casi todo el test de integración del flujo.

## Preguntas abiertas

- **P1 — Orden del flujo y órdenes retiradas.** Con el orden de D4 (Cartago vacía → GAM → retirar),
  las órdenes del estante se quedan con zona Cartago al guardar GAM (retenidas, R1226), se retiran y,
  ya recibidas en la central, **siguen siendo de Cartago** hasta que alguien vuelva a guardar GAM
  (R1228): sin ese re-guardado, «Rutear a bodega satélite» las mandaría de vuelta a Cartago y
  «Asignar mensajero» de la central las rechaza por zona no central. Dos salidas sin código nuevo:
  (a) tras recibirlas en la central, guardar GAM otra vez (sin cambios) — es lo que prueba R1228;
  (b) cambiar el orden: retirar y recibir primero, después vaciar Cartago y guardar GAM, que las pasa a
  GAM en ese mismo guardado. Recomendación: (b) para el caso de Cartago, y dejar (a) documentado.
  ¿Confirmas?
- **P2 — ¿Bloquear «Rutear a bodega satélite» hacia una zona sin distritos?** Hoy nada lo impide.
  Fuera de esta ficha salvo que digas lo contrario (sería otra ficha).
