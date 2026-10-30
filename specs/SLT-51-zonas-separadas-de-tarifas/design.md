# SLT-51 — zonas-separadas-de-tarifas · design.md

## Lo que ya existe

Buscado `zonas separadas`, `configuracion/zonas`, `ZonasModule`, `módulo de zonas`, `pantalla de
zonas`, `costos por zona` en `feature_list.json` (todos los estados), `specs/` y el código.

- **Board.** Ninguna ficha duplica esta. Las vecinas de la épica EP-8 son consecuencias, no
  solapes: SLT-52 (modelo nuevo y fin de GAM), SLT-54 (pantalla nueva de Tarifas, que trae de vuelta
  el editor de costos), SLT-57 (retira `tarifa_zona_mensajero` y la tarifa especial). SLT-46
  (`pending`, épica GEO) tocará `GeografiaSelector`; no está en vuelo.
- **Specs.** `specs/24-gestion-zonas` creó un `ZonasModule` en `configuracion/_components/` que nunca
  se montó y se borró el 2026-08-07 (lo cuentan `tests/unit/descarga/censo-tablas.ts:287-294` y
  `cobertura-tablas.guardia.test.ts:78-81`). No hay código vivo que reutilizar de ahí.
- **Código que se reutiliza, no se re-crea.** Todo el CRUD de zonas ya existe y se MUDA:
  `ZonasTarifasModule.tsx` (listado + borrar + modal), `CrearZonaForm.tsx` (formulario, SINPE,
  confirmación de zona central con `impactoZonaCentral`), `GeografiaSelector.tsx`,
  `DescargarCoberturaButton.tsx` + `cobertura-descarga-columnas.ts` (ficha 465). Acciones
  `lib/actions/zonas.ts`, servicio `lib/services/ZonaService.ts` (solo `maestro`), repositorio
  `lib/repositories/ZonaRepository.ts`, esquemas `lib/types/zona.ts`. Nada de backend nuevo.

## 1. Modelo de datos

**Sin cambios.** Ninguna tabla, columna, RLS ni migración nueva; no hay `down.sql` porque no hay
migración. Las tablas implicadas ya tienen `organizacion_id` y RLS por empresa (`zona`,
`zona_distrito`, `tarifa_zona_mensajero`, `tarifas`, `distrito_zona_especial`). `zona.es_central`
conserva nombre y semántica: decide la bodega del cierre y, hasta SLT-52, la columna de flete GAM
(`resolverFlete`).

Datos que dependen del país: el SINPE (CR, `lib/utils/sinpe-cr`) y el catálogo geográfico global
(SL-20, `listarArbolGeografico`). Esta ficha solo los muda de pantalla.

## 2. Rutas y menú

| Ruta | Antes | Después |
|---|---|---|
| `/configuracion/zonas` | no existe | **nueva**: Cobertura + listado + crear/editar/borrar zona |
| `/configuracion/tarifas` | Cobertura + Costos por zona + Tiendas | solo tarifas por tienda (`TiendasModule`) |

- `app/(app)/configuracion/zonas/page.tsx` — Server Component con el MISMO gate que Tarifas:
  `resolveActorFromSession()`; si `rol !== "maestro"`, solo el aviso «No tienes permiso…» (R2).
  Pre-carga `listarArbolGeografico()` y `listarZonas({ page: 1, pageSize: 100 })`. **Ya no**
  `listarVehiculos`: sin costos no hace falta.
- `lib/auth/menu-visibility.ts` — subítem `{ label: "Zonas", href: "/configuracion/zonas" }`
  entre «Usuarios» y «Tarifas». No es el primer hijo, así que `primerDestino` no cambia (R1). Hereda
  la visibilidad `maestro`-only del padre.
- `lib/modulos/reparto.ts` — `"/configuracion/zonas": "nucleo"` (la guardia
  `modulos-reparto.guardia.test.ts` compara la tabla con el disco).
- `/configuracion/tarifas/page.tsx` — quita el bloque «Cobertura» y `ZonasTarifasModule`; monta
  `<TiendasModule zonas={zonas} />` con las zonas pre-cargadas (antes las recibía de
  `ZonasTarifasModule`). Deja de cargar árbol y vehículos.

**Autorización.** La de la página es la de presentación; la que manda es `ZonaService` (`esMaestro`
en crear/obtener/listar/actualizar/borrar/impacto) y `lib/actions/cobertura.ts`, que vuelven a
autorizar por su cuenta. Ningún módulo apagable: Zonas es núcleo.

## 3. Archivos que se mudan

De `app/(app)/configuracion/tarifas/_components/` a `app/(app)/configuracion/zonas/_components/`
(con `git mv`, para conservar historia):

| Antes | Después |
|---|---|
| `ZonasTarifasModule.tsx` | `ZonasModule.tsx` (sin `TiendasModule`, sin `listarTarifas`) |
| `CrearZonaForm.tsx` | `CrearZonaForm.tsx` (sin costos) |
| `GeografiaSelector.tsx` | `GeografiaSelector.tsx` |
| `DescargarCoberturaButton.tsx` | `DescargarCoberturaButton.tsx` |
| `cobertura-descarga-columnas.ts` | `cobertura-descarga-columnas.ts` |

Se quedan en `tarifas/_components/`: `TiendasModule`, `CrearTiendaForm`, `TarifaCampos`,
`tarifas-labels`, `useDestinoAnimado` y `CobroVehiculoTarifas`.

## 4. Formulario de zona (contrato de UI)

`CrearZonaForm` pierde: la sección «Pago…» (`CobroVehiculoTarifas`), la sección «Tarifas de zona»
(`TarifaCamposGrid`), `guardarTarifaZona`, `guardarEspeciales`, el estado `cobro`, `tarifaValores`,
`tarifaZonaId`, `especiales` y las props `vehiculos`/`initial.cobro`/`initial.tarifaZonaId`/
`initial.tarifaValores`. Conserva nombre, SINPE al crear (ficha 429), casilla de bodega principal,
`GeografiaSelector`, el modal de confirmación y los mensajes de reconciliación (366/377).

**Payload.** `validar()` arma `{ nombre, esCentral, distritoIds }` (+ `sinpeNumero`/`sinpeNombre` al
crear). No manda `cobroVehiculo` ni `tarifas`.

**Distrito especial.** `GeografiaSelector` gana la prop opcional `permitirEspecial` (por defecto
`false`). Con `false` no pinta el botón «Especial» ni el conteo «Zonas especiales: N» y no llama a
`onEspecialesChange`. Zonas la deja en `false` (R4). La prop existe para que SLT-54 la reutilice si
quiere; hoy nadie la pone en `true`.

**Listado (R3).** El mismo `<ul>` de hoy: nombre + «N distritos» + la etiqueta «Zona de bodega
principal» si `esCentral`. Se quita «· cobro por vehículo».

**Rótulos (R10).** Cambian a «Zona de bodega principal» / «zona de bodega principal»:

- casilla `es-central-zona`;
- títulos del modal: «Zona de bodega principal ya asignada» y «Quitar la marca de zona de bodega
  principal»; `descripcionConfirmacion` en las dos direcciones;
- `mensajeBorradoFallido` (motivo `es_central`): «No se puede eliminar la zona de bodega principal.
  Marca otra zona como bodega principal antes de eliminarla.»;
- `MSG_SIN_ZONA_CENTRAL` en `ZonaService.ts`: «Tiene que haber una zona de bodega principal. Para
  quitarle la marca a ésta, márcala en otra zona.» (se pinta en la pantalla, por eso entra);
- el texto vacío: «Crea la primera zona.» (ya no «para definir sus costos»).

Los identificadores (`esCentral`, `es_central`, `impactoZonaCentral`, `ConfirmacionCentral`) **no**
se renombran: R10 habla de texto visible.

**Modal de impacto (R11): se conserva.** Mientras SLT-52 no retire la variante GAM, mover la marca
sigue cambiando la columna de flete de las órdenes vivas (`resolverFlete` lee `esCentral` en vivo).
Quitar el modal ahora dejaría ese efecto de dinero sin aviso; el texto «…cambiarían de tarifa de
flete» sigue siendo cierto. Lo retira o lo reescribe SLT-52.

## 5. Backend: `cobroVehiculo` y `tarifas[]` pasan a opcionales

El formulario deja de enviarlos, pero no se quitan del contrato: las fábricas de tests y las
semillas de integración (`tests/fabricas/escenarios/reparto.ts`, `tests/integration/db/*`) crean
zonas con pagos, y el modelo viejo vive hasta SLT-57.

**`lib/types/zona.ts`**

- `crearZonaSchema`: `cobroVehiculo: z.boolean().default(false)`; `tarifas` ya tiene `.default([])`.
  Un payload sin los dos crea la zona sin pagos (R5). `applyTarifaRules` sigue aplicando (con
  `false` + `[]` pasa).
- `actualizarZonaSchema`: `cobroVehiculo: z.boolean().optional()` y `tarifas: z.array(...).optional()`
  **sin default**, con el mismo criterio que `esCentral` (376/R1): ausente significa «no lo mandé».
  `superRefine` nuevo:
  - los dos ausentes → válido, no se aplica `applyTarifaRules`;
  - solo uno presente → issue en el que falta: «cobroVehiculo y tarifas viajan juntos» (R8);
  - los dos presentes → `applyTarifaRules` como hoy (R9).
- `ActualizarZonaInput` refleja la opcionalidad. `.strict()` se mantiene.

**`lib/services/ZonaService.ts` — `prepararDatos`**: valida vehículos solo si `input.tarifas` viene;
el `data` lleva `cobroVehiculo` y `tarifas` como `undefined` cuando no vienen.
`lib/interfaces/repositories/IZonaRepository.ts`: `UpdateZonaData.cobroVehiculo?` y `tarifas?`
opcionales; `CreateZonaData` no cambia (el servicio ya recibe valores por default del zod).

**`lib/repositories/ZonaRepository.update`** (R6/R7):

- `cobroVehiculo: data.cobroVehiculo` en el `update` de Prisma: `undefined` no escribe la columna (el
  mismo mecanismo que `esCentral`).
- Si `data.tarifas === undefined`: no se leen `pagosPrevios`, no hay `deleteMany`/`createMany` de
  `tarifa_zona_mensajero` y no se escribe la fila `zona_pago_mensajero_cambiado` (380). El `findMany` final para el
  DTO se queda.
- Si viene: exactamente el código de hoy (R9).

La tabla `tarifas` (cobro de zona con `tienda_id` NULL) y `distrito_zona_especial` **no las toca**
`ZonaRepository.update`; hoy solo las escribía el formulario por `crearTarifa`/`actualizarTarifa` y
`actualizarDistritosEspeciales`. Al quitar esas llamadas del formulario, R6 queda garantizado; el test
de integración lo afirma contra Postgres.

**Acciones sin superficie.** `actualizarDistritosEspeciales` (`lib/actions/geografia.ts`) y
`CobroVehiculoTarifas` se quedan sin quien los monte. La guardia `superficie-de-uso.guardia.test.ts`
lo detecta: se anotan con `/** @sin-superficie editor de costos de zona retirado en SLT-51; vuelve en
SLT-54 */` en vez de borrarlos, porque SLT-54 decide si los reutiliza. `crearTarifa`,
`actualizarTarifa` y `listarTarifas` siguen vivos por `TiendasModule`.

## 6. Contratos I/O (sin cambios de forma)

- `crearZona(input)` → `CrearZonaResult` (igual). Input sin `cobroVehiculo`/`tarifas` válido.
- `actualizarZona(id, input)` → `ActualizarZonaResult` (igual). Input nuevo válido:
  `{ nombre, distritoIds, esCentral? }`.
- `obtenerZona`, `listarZonas`, `borrarZona`, `impactoZonaCentral`, `listarCoberturaDistritos`: sin
  cambios.

## 7. Ayuda

- `docs/ayuda/oficina/configuracion-zonas.md` (nuevo, `pantalla: /configuracion/zonas`,
  `roles: [maestro]`): qué se configura (nombre, distritos, bodega principal, SINPE al crear),
  Cobertura, y que los costos de zona se configuran en Tarifas.
- `docs/ayuda/oficina/configuracion-tarifas.md`: quitar «Las zonas se crean acá mismo» y la parte
  de Costos por zona; actualizar `actualizado`.

## 8. Tests (mapa R → test)

| R | Test | Tipo |
|---|---|---|
| R1 | `tests/unit/auth/menu-visibility.test.ts` (lista de hijos con `/configuracion/zonas`; `primerDestino` igual) + `modulos-reparto.guardia` | unit |
| R2 | `tests/unit/app/zonas/ZonasPage.test.tsx` (aviso para admin/adminTienda/adminSatelite/mensajero/sin sesión) + casos `forbidden` existentes de `tests/integration/actions/zonas-action.test.ts` | unit/integration |
| R3 | `tests/components/ZonasModuleListado.test.tsx` (nombre, distritos, etiqueta bodega principal, sin «cobro por vehículo») | component |
| R4 | `tests/components/ZonaFormSinCostos.test.tsx` (ni campos de pago, ni tarifa, ni botón «Especial»; SINPE solo al crear) | component |
| R5 | `ZonaFormSinCostos.test.tsx` (payload sin `cobroVehiculo`/`tarifas`; no llama `crearTarifa` ni `actualizarDistritosEspeciales`) + `tests/integration/db/zona-guardado-conserva-costos.test.ts` (crear sin costos: 0 filas de pago, `cobro_vehiculo=false`, 0 filas `tarifas` de la zona) + `e2e/zonas-crear-sin-costos.spec.ts` | component/integration/E2E |
| R6 | `zona-guardado-conserva-costos.test.ts` (zona con pagos por vehículo, tarifa de zona y especiales; `actualizarZona` sin cobro; todo igual, 0 filas `zona_pago_mensajero_cambiado` en historial) | integration (Postgres) |
| R7 | mismo archivo, caso `cobroVehiculo=true` sin campos: columna sigue en `true` | integration (Postgres) |
| R8 | `tests/unit/types/zona-schema.test.ts` (solo uno → issue en el que falta) + `zonas-action.test.ts` (sin escritura) | unit/integration |
| R9 | tests existentes de 380 (`tests/integration/db/zona-pago-mensajero-rastro.test.ts`) y `zona-schema.test.ts` sin cambios, verdes | integration |
| R10 | `ZonaCentralConfirmacion.test.tsx` y `ZonaBorradoMotivo.test.tsx` actualizados a los textos nuevos + un caso que afirma que ningún texto de la pantalla contiene «central» | component |
| R11 | `ZonaCentralConfirmacion.test.tsx` (se conserva, con ruta y textos nuevos) | component |
| R12 | `tests/unit/app/zonas/ZonasPage.test.tsx` (Cobertura antes del listado) + `TarifasPage.test.tsx` (sin Cobertura) | unit |
| R13 | `tests/unit/app/tarifas/TarifasPage.test.tsx` (sin «Costos por zona», sin «Crear zona», monta `TiendasModule` con las zonas) | unit |
| R14 | `ZonaBorradoMotivo.test.tsx` (ruta nueva, motivos) | component |
| R15 | `tests/integration/asimetria-sin-tarifa.test.ts` (274/R39) sin cambios, verde | integration |
| R16 | `ZonasPage.test.tsx` (pasa el árbol de `listarArbolGeografico` al selector) + `geografia-selector-inactivos.test.tsx` (ruta nueva) | unit |

Tests existentes que cambian de ruta de import o pierden casos de costos:
`CrearZonaFormReconciliacion`, `ZonaCentralConfirmacion`, `ZonaDistritoEspecial` (se reescribe: la
marca ya no se hace desde Zonas y el formulario no llama a `actualizarDistritosEspeciales`),
`ZonaBorradoMotivo`, `ZonaNombreNoImprimible`, `TarifasClaridadMontos` (pierde los casos del
formulario de zona; `CobroVehiculoTarifas` se sigue probando suelto), `geografia-selector-inactivos`,
`zona-guardado-conserva-inactivos`, `DescargarCoberturaButton`, `TarifasPage.cobertura` (se parte en
`ZonasPage.test.tsx` y `TarifasPage.test.tsx`), `Sidebar.test.tsx`.

**E2E.** `e2e/zonas-crear-sin-costos.spec.ts`: mismo patrón que `zona-especial-dos-empresas.spec.ts`
(base local desechable, `sembrarEmpresa` de `_zona-especial-fixture`, login del maestro), una sola
empresa: abre `/configuracion/zonas`, «Crear zona», nombre único, un distrito libre, SINPE de
prueba, guarda, ve «Zona creada» y la fila en el listado; por detrás comprueba 0 filas de
`tarifa_zona_mensajero` para esa zona. `e2e/zona-especial-dos-empresas.spec.ts` queda en
`test.fixme` citando SLT-54 (P1 de `requirements.md`).

## 9. Alternativas descartadas

1. **Quitar `cobroVehiculo` y `tarifas` del esquema (que `.strict()` los rechace).** Es lo más
   limpio en el borde, pero rompe las semillas y fábricas de integración que crean zonas con pagos
   (decenas de archivos) y obliga a otra vía para escribir pagos antes de SLT-54. SLT-57 retira el
   modelo viejo entero; quitarlos ahora es adelantar esa ficha a medias.
2. **Que el formulario reenvíe los costos que leyó al abrir (campos ocultos).** Mantiene el
   reemplazo completo de hoy sin tocar backend, pero una edición concurrente de costos (SLT-54) se
   pisaría en silencio con la foto vieja, y cada guardado seguiría escribiendo una fila de historial
   de pago (380) sin cambio real. Ausente = «no se toca» es el patrón que el repo ya usa para
   `esCentral`.
3. **Dejar los componentes de zona en `tarifas/_components/` e importarlos desde la página nueva.**
   Menos diff, pero SLT-54 rehace la carpeta de Tarifas y se llevaría por delante código de Zonas;
   y `archivos-en-vuelo` marcaría choques falsos entre las dos fichas.
4. **Listado con `DataTable` y descarga.** Entraría en el censo de tablas
   (`censo-tablas.ts`, `cobertura-tablas.guardia`) y pediría columnas de descarga; no lo pide el
   alcance. Se conserva el `<ul>` de hoy.
5. **Quitar el modal de impacto de la marca.** Descartado en §4: el efecto en el flete GAM sigue
   vivo hasta SLT-52.

Sin dependencias nuevas.
