# 486 — Las evidencias de una gestión con varias fotos solo muestran la primera en los cierres · requirements

## Contexto (evidencia leída en el código, 2026-10-21)

Reporte del humano (2026-10-21): en el detalle de los cierres, admin y maestro ven UNA foto de
evidencia aunque la gestión tenga hasta 3. Solo visto en cierres.

Causa, confirmada en los archivos:

- Desde la feature 119 las fotos viven en `gestion_orden_evidencia` (1..N, `indice`, único
  `(gestion_id, indice)`). La columna `gestion_orden.evidencia_storage_path` quedó como **portada**
  (indice 0) por retro-compatibilidad: `insertarGestionConHijas` (`GestionOrdenRepository.ts:187-205`)
  la escribe en el mismo INSERT que las hijas. La 119 dejó a propósito a los cierres en la portada
  (`specs/119-evidencias-multiples-fotos/requirements.md:121`; la 478 lo repite en su «Fuera de
  alcance», `specs/478-.../requirements.md:149`).
- Las dos proyecciones que producen la fila de gestión de un cierre leen SOLO la columna:
  `GESTION_ADMIN_SELECT` (`CierresAdminRepository.ts:275`, mapper `:457`), usada por el detalle de
  cierre de mensajero (admin/maestro) y por el de cierre de bodega satélite
  (`CierresBodegaAdminRepository.ts:358/374`); y `WITH_DETALLE` (`CierreDiaRepository.ts:434`,
  mapper `:513`), usada por las vistas del propio mensajero.
- Las tres superficies pasan por el MISMO mapper de DTO, `toDetalleDTO`
  (`CierreDiaService.ts:1016`), que emite un único `evidenciaUrl`.
- **La vista del propio mensajero (cierre del día en vivo, cierre pasado y corrección de la 477)
  comparte el camino** —mismo DTO, mismo mapper, misma firma en lote—, con otra proyección
  (`WITH_DETALLE`). Tiene el mismo defecto y entra en el alcance (ver P1).
- Backfill: la migración `20260723130000_gestion_orden_evidencia` insertó una fila `indice 0` por
  cada gestión que ya tenía `evidencia_storage_path`. Aun así, el escritor conserva una rama que
  escribe la columna sin hijas (portada suelta, `GestionOrdenRepository.ts:192`), así que una
  gestión con columna y sin filas es posible y se cubre con el fallback (R5).

Superficies afectadas (todas las que hoy ofrecen «Ver evidencia» de una gestión de cierre):

- **S1** detalle de cierre de mensajero de la central — admin y maestro (`CierresAdminService.verCierreDetalle`).
- **S2** detalle de cierre de bodega satélite — admin y maestro (`CierresBodegaAdminService.verCierreBodegaDetalle`).
- **S3** vistas del mensajero: cierre del día en vivo (`listarCierreDia`), cierre pasado
  (`verCierrePasado`) y corrección de cierre rechazado (`correccionesDe`, ficha 477).

## Requisitos

### Conjunto de evidencias entregado por el servidor

- **R1.** CUANDO un admin o maestro abre el detalle de un cierre de mensajero (S1), el sistema DEBE
  entregar, por cada gestión, la lista de URLs firmadas de TODAS las evidencias registradas de esa
  gestión.
- **R2.** CUANDO un admin o maestro abre el detalle de un cierre de bodega satélite (S2), el sistema
  DEBE entregar, por cada gestión de cada cierre del día incluido, la lista de URLs firmadas de
  TODAS las evidencias registradas de esa gestión.
- **R3.** CUANDO un mensajero abre su cierre del día en vivo, un cierre pasado propio o la
  corrección de un cierre rechazado (S3), el sistema DEBE entregar, por cada gestión, la lista de
  URLs firmadas de TODAS las evidencias registradas de esa gestión.
- **R4.** El sistema DEBE ordenar la lista de evidencias de cada gestión por su `indice` ascendente,
  con independencia del orden en que se insertaron las filas.
- **R5.** SI una gestión no tiene ninguna fila en el conjunto de evidencias pero sí una evidencia en
  la columna única antigua, ENTONCES el sistema DEBE entregar una lista con esa única evidencia.
- **R6.** SI una gestión no tiene evidencia ni en el conjunto ni en la columna antigua, ENTONCES el
  sistema DEBE entregar una lista vacía.
- **R7.** El sistema DEBE entregar al cliente las evidencias de un cierre SOLO como URLs firmadas de
  vigencia acotada, nunca como ruta de almacenamiento cruda.
- **R8.** CUANDO el sistema arma cualquiera de los detalles de R1-R3, DEBE firmar todas las
  evidencias de ese detalle en UNA sola petición de firma al almacenamiento, y la cantidad de
  consultas a la base para leer las evidencias NO DEBE crecer con el número de gestiones.
- **R9.** SI el almacenamiento no puede firmar una evidencia concreta, ENTONCES el sistema DEBE
  omitir solo esa evidencia de la lista y entregar las demás de la misma gestión.
- **R10.** MIENTRAS el almacenamiento falle por completo, el detalle de cierre de mensajero de admin
  (S1), el cierre pasado y la corrección del mensajero (S3) DEBEN seguir sirviéndose, con listas de
  evidencias vacías (comportamiento actual, que esta ficha conserva).
- **R11.** SI el actor no tiene acceso al cierre pedido o el cierre está fuera de su alcance,
  ENTONCES el sistema NO DEBE firmar ninguna evidencia.

### Lo que ve el usuario

- **R12.** SI una gestión de un cierre tiene exactamente una evidencia, ENTONCES el sistema DEBE
  ofrecer un único botón «Ver evidencia», como hoy.
- **R13.** SI una gestión de un cierre tiene más de una evidencia, ENTONCES el sistema DEBE ofrecer
  un botón por evidencia, rotulados «Ver evidencia 1», «Ver evidencia 2»… en el orden de R4.
- **R14.** CUANDO se pulsa el botón de la evidencia k de una gestión, el sistema DEBE abrir el visor
  de evidencia con la URL firmada k de ESA gestión.
- **R15.** SI una gestión no tiene ninguna evidencia, ENTONCES el sistema NO DEBE ofrecer ningún
  botón de evidencia en su fila.
- **R16.** El sistema DEBE aplicar R12-R15 en todas las superficies donde hoy se ofrece «Ver
  evidencia» de una gestión de cierre: la fila desplegable del comprobante (S1, S2 y cierre pasado
  de S3) y la columna «Evidencia» de las tablas de rechazo e incidente de la vista en vivo del
  mensajero y de su corrección (S3).

### Descargas (no se rompen R22/R41 de la feature 230)

- **R17.** CUANDO se genera cualquier descarga de cierres de admin o maestro (hoja fundida, detalle
  de cierre de mensajero, cierres de bodega), el sistema NO DEBE leer ninguna evidencia (ni la
  columna antigua ni el conjunto) ni incluir URL alguna de evidencia en el archivo.
- **R18.** CUANDO el mensajero descarga su cierre del día, el sistema DEBE conservar la columna de
  evidencia como «Sí»/«No» sin URL, y DEBE poner «Sí» si y solo si la gestión tiene al menos una
  evidencia firmada.

## Trazabilidad prevista (test por requisito)

| R | Test previsto | Tipo |
| --- | --- | --- |
| R1 | `tests/integration/db/486-evidencias-cierres-sql-real.test.ts` (nuevo) — «el detalle de cierre de mensajero trae las 3 rutas de una gestión con 3 fotos» (contra `findCierreByIdEnAlcance` real) + `tests/unit/services/cierres-admin-service.test.ts` — «entrega las 3 URLs firmadas de una gestión con 3 evidencias» | integración + unitario |
| R2 | idem integración — «el detalle de cierre de bodega trae las 3 rutas» (contra `findCierreBodegaConDetalle` real) + `tests/unit/services/cierres-bodega-admin-service.test.ts` — «entrega las 3 URLs firmadas…» | integración + unitario |
| R3 | idem integración — «la vista en vivo y el cierre pasado del mensajero traen las 3 rutas» (`findGestionesPendientes`, `findCierrePropioConGestiones`) + `tests/unit/services/cierre-dia-service.test.ts` — un caso por `listarCierreDia`, `verCierrePasado` y corrección 477 | integración + unitario |
| R4 | idem integración — «insertadas en orden 2,0,1 salen 0,1,2» (una mutación que quite el `orderBy` debe ponerlo rojo) + `tests/unit/utils/evidencias-gestion.test.ts` (nuevo) | integración + unitario |
| R5 | idem integración — «gestión con columna y sin filas hijas → lista de una» + `tests/unit/utils/evidencias-gestion.test.ts` | integración + unitario |
| R6 | `tests/unit/utils/evidencias-gestion.test.ts` — «sin hijas ni columna → []» | unitario |
| R7 | `tests/unit/services/cierres-admin-service.test.ts`, `cierres-bodega-admin-service.test.ts`, `cierre-dia-service.test.ts` — «el DTO no contiene ninguna ruta cruda» (JSON del DTO no contiene los paths del fixture) | unitario |
| R8 | los tres tests de servicio — «`createSignedUrls` se llama UNA vez con las rutas de todas las gestiones»; integración — «las evidencias de N gestiones se leen sin una consulta por gestión» (conteo de consultas con el log de Prisma, o 2 vs 5 gestiones con mismo número de consultas) | unitario + integración |
| R9 | `tests/unit/services/cierres-admin-service.test.ts` — «si el firmador omite la foto 2, la gestión trae la 1 y la 3» (+ un caso en bodega) | unitario |
| R10 | `tests/unit/services/cierres-admin-service.test.ts` y `cierre-dia-service.test.ts` — «firmador que lanza → detalle `ok` con listas vacías» (los existentes de best-effort se re-ejecutan y se extienden a `evidenciaUrls`) | unitario |
| R11 | tests existentes de `forbidden`/`no_encontrada` en los tres servicios — se re-ejecutan; donde no afirmen que `createSignedUrls` no se llama, se añade | unitario |
| R12 | `tests/components/CierreEvidenciasVarias486.test.tsx` (nuevo) — «una evidencia → un botón Ver evidencia» | componente |
| R13 | idem — «tres evidencias → Ver evidencia 1, 2 y 3 en orden» | componente |
| R14 | idem — «pulsar Ver evidencia 2 abre el visor con la URL 2» | componente |
| R15 | idem — «sin evidencias no hay botón» | componente |
| R16 | idem — un caso por superficie: `CierreFacturaDetalle` (admin, bodega, cierre pasado) y `CierreDiaModule` (tabla de rechazo e incidente en vivo y en corrección) | componente |
| R17 | `tests/unit/repositories/cierres-admin-gestiones-where.test.ts` y `cierres-bodega-gestiones-where.test.ts` — los casos «la proyección NO lee evidencia» siguen en verde; el literal de diferencia de claves pasa a `["evidenciaStoragePath", "evidencias"]` a sabiendas (es el contrato); `tests/components/descarga/CierresDescarga.test.tsx` — la descarga no contiene ninguna de las URLs de una gestión con 3 fotos | unitario + componente |
| R18 | `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts` — «Sí con 3 evidencias, No con ninguna, nunca la URL» | unitario |

## Fuera de alcance

- La API de lectura de órdenes (feature 106, `OrdenRepository.ts:495-504`) y cualquier otro lector
  de la columna fuera de cierres: no se reportaron y la 119 los dejó en la portada a propósito.
- Retirar la columna `evidencia_storage_path` o el dual-write de la portada.
- Cambios de esquema o migraciones.
- Cambiar el visor de evidencia (sigue abriendo una URL), o convertir a «best-effort» el detalle
  de bodega y la vista en vivo, que hoy propagan un fallo total del almacenamiento.
- Las evidencias de incidentes del admin (`orden_incidente_evidencia`), que ya muestran N fotos.

## Preguntas abiertas (con valor por defecto)

- **P1 — Vista del mensajero.** El reporte habla de admin y maestro, pero la vista del propio
  mensajero (en vivo, pasado y corrección 477) comparte DTO, mapper y firma, y tiene el mismo
  defecto. **Por defecto: entra (R3/R16)**; arreglar solo admin obligaría a mantener dos contratos
  del mismo DTO. Alternativa: dejarla fuera y que sus proyecciones entreguen solo la portada.
- **P2 — Forma en pantalla.** **Por defecto: botones numerados** «Ver evidencia 1/2/3» junto al
  actual (cambio mínimo, mismo visor). Alternativa: miniaturas como en el detalle de incidentes
  (`IncidentesAdminModule.tsx:511-534`), que carga las 3 imágenes al desplegar cada fila.
