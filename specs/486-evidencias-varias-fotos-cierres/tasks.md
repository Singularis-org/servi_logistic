# 486 — Evidencias con varias fotos en los cierres · tasks

Zona `fullstack`: se secuencia **backend (T0-T5) → frontend (T6-T8)**. Gate de todo:
`./init.sh --rapido` (no toca dinero, esquema ni migraciones). Correr además, a mano, las guardias
que el grafo puede no relacionar (T9).

## T0 — Pre-vuelo
- [ ] T0.1 `git checkout --detach <SHA dado>` + `git merge-base` contra `origin/dev`; confirmar que
  `GESTION_ADMIN_SELECT` (`CierresAdminRepository.ts:275`), `WITH_DETALLE` (`CierreDiaRepository.ts:434`)
  y `toDetalleDTO` (`CierreDiaService.ts:1016`) siguen como describe `design.md §1`.
- [ ] T0.2 `prisma migrate status` contra la base local: `20260723130000_gestion_orden_evidencia`
  aplicada.
- **Hecho:** las tres líneas confirmadas en el archivo real y la migración aplicada; si algo se
  movió, se anota en `progress/impl_486.md` antes de seguir.

## T1 [P] — Util puro de rutas/URLs (R4, R5, R6, R9) — depende de T0
- [ ] Crear `lib/utils/evidencias-gestion.ts` con `rutasEvidenciaGestion(hijas, portada)` y
  `urlsEvidenciaFirmadas(rutas, urlByPath)` (design §2.3).
- [ ] Test `tests/unit/utils/evidencias-gestion.test.ts`: hijas mandan (portada ignorada si hay
  hijas, sin duplicar); sin hijas + portada → `[portada]`; nada → `[]`; firmador que omite la 2 →
  `[url1, url3]` en orden.
- **Hecho:** test verde; mutación «devolver siempre `[portada]`» lo pone rojo.

## T2 — Proyecciones y fila de dominio (R1-R5) — depende de T1
- [ ] `ICierreDiaRepository.CierreGestionPendienteRow` gana `evidenciaStoragePaths: string[]`
  (obligatorio).
- [ ] `GESTION_ADMIN_SELECT` y `WITH_DETALLE.select` ganan
  `evidencias: { select: { storagePath: true }, orderBy: { indice: "asc" } }`, conservando
  `evidenciaStoragePath: true`.
- [ ] `toPendienteRowDesdeSnapshot` y `toPendienteRow` rellenan
  `evidenciaStoragePaths: rutasEvidenciaGestion(g.evidencias, g.evidenciaStoragePath)`.
- [ ] `GESTION_DESCARGA_SELECT` **sin cambios**.
- [ ] Actualizar fixtures de la fila (~20, mecánico: `evidenciaStoragePaths: path ? [path] : []`).
- [ ] `tests/unit/repositories/cierres-admin-gestiones-where.test.ts:199`: el literal pasa a
  `["evidenciaStoragePath", "evidencias"]` con comentario del motivo (contrato, ficha 486). `:171` y
  `cierres-bodega-gestiones-where.test.ts:107` **no se tocan** y siguen verdes (R17).
- **Hecho:** typecheck verde; los dos `*-gestiones-where.test.ts` verdes.

## T3 — Integración contra Postgres (R1-R5, R8) — depende de T2
- [ ] Nuevo `tests/integration/db/486-evidencias-cierres-sql-real.test.ts`, sembrando como
  `cierre-desglose-por-tienda-sql-real.test.ts` / `cierre-bodega-desglose-por-tienda-sql-real.test.ts`:
  - gestión A con 3 hijas insertadas en orden de `indice` 2, 0, 1 (y portada = la de indice 0);
  - gestión B con portada y SIN hijas;
  - gestión C sin nada.
- [ ] Casos: `findCierreByIdEnAlcance` (R1), `findCierreBodegaConDetalle` (R2),
  `findGestionesPendientes` y `findCierrePropioConGestiones` (R3) devuelven A → 3 rutas en orden
  0,1,2 (R4), B → `[portada]` (R5), C → `[]` (R6).
- [ ] R8: con el log de consultas de Prisma, el número de consultas de `findCierreByIdEnAlcance` es
  el mismo con 2 y con 5 gestiones con evidencias.
- [ ] El test afirma que la siembra existe (conteos > 0) antes de comprobar nada; nada de `return`
  temprano.
- **Hecho:** verde contra la base local, sin `skipped`; mutación «quitar el `orderBy`» o «quitar
  `evidencias` del select» lo pone rojo (anotar el resultado de la mutación en `progress/impl_486.md`).

## T4 — DTO y firma en los servicios (R1-R3, R7-R11) — depende de T2
- [ ] `ICierreDiaService.CierreDetalleGestion` gana `evidenciaUrls: string[]`.
- [ ] `toDetalleDTO`: `evidenciaUrls = urlsEvidenciaFirmadas(g.evidenciaStoragePaths, urlByPath)`;
  `evidenciaUrl = evidenciaUrls[0] ?? null`.
- [ ] Las cinco recogidas de rutas pasan a `flatMap((g) => g.evidenciaStoragePaths)`:
  `CierresAdminService.verCierreDetalle`, `CierresBodegaAdminService.verCierreBodegaDetalle`,
  `CierreDiaService.listarCierreDia`, `correccionesDe`, `verCierrePasado`. Sin tocar los
  `try/catch` ni su ausencia.
- **Hecho:** typecheck verde; ninguna referencia a `g.evidenciaStoragePath` queda en los cinco
  puntos de firma.

## T5 [P] — Tests de servicio (R1-R3, R7-R11) — depende de T4
- [ ] `tests/unit/services/cierres-admin-service.test.ts`: 3 evidencias → 3 URLs en orden; una sola
  llamada a `createSignedUrls` con todas las rutas del detalle; firmador que omite la 2 → 1 y 3;
  firmador que lanza → `ok` con `evidenciaUrls: []`; JSON del DTO sin rutas crudas; `forbidden` /
  `no_encontrada` sin llamar al firmador.
- [ ] `tests/unit/services/cierres-bodega-admin-service.test.ts`: lo mismo menos el best-effort
  (bodega propaga hoy).
- [ ] `tests/unit/services/cierre-dia-service.test.ts`: un caso por `listarCierreDia`,
  `verCierrePasado` (con best-effort) y corrección 477.
- **Hecho:** los tres verdes; cada caso nombrado con su `R<n>`.

## T6 — Componente `BotonesEvidencia` (R12-R15) — depende de T4
- [ ] `app/(app)/cierres-admin/_components/botones-evidencia.tsx` (design §2.6): 0 → nada, 1 →
  «Ver evidencia» (texto y aria actuales), N → «Ver evidencia 1..N».
- **Hecho:** typecheck y lint verdes.

## T7 — Montarlo en las superficies (R16) — depende de T6
- [ ] `cierre-factura.tsx` `FilaGestion` (`:1909-1920`) usa `BotonesEvidencia` con `g.evidenciaUrls`.
- [ ] `CierreDiaModule.tsx` `columnaEvidencia` (`:1489-1508`) usa `BotonesEvidencia`; vacío → «—».
- [ ] Actualizar fixtures del DTO (~28, mecánico: `evidenciaUrls: url ? [url] : []`), incluida
  `tests/fixtures/gestion-detalle-478.ts`.
- **Hecho:** suite de componentes relacionada verde, sin cambiar ninguna aserción existente de «Ver
  evidencia» con una sola foto.

## T8 [P] — Tests de componente y descargas (R12-R18) — depende de T7
- [ ] Nuevo `tests/components/CierreEvidenciasVarias486.test.tsx`: 1 → un botón; 3 → «Ver evidencia
  1/2/3» en orden; pulsar la 2 abre el visor con la URL 2; 0 → sin botón; un caso por superficie
  (`CierreFacturaDetalle` en admin/bodega/pasado; `CierreDiaModule` tablas de rechazo e incidente
  en vivo y en corrección).
- [ ] `tests/components/descarga/CierresDescarga.test.tsx`: con una gestión de 3 URLs, la descarga
  no contiene ninguna (R17).
- [ ] `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`: «Sí» con 3, «No» con 0, nunca la
  URL (R18).
- **Hecho:** verdes; las aserciones de texto contra LITERALES, no contra la función que los genera.

## T9 — Gate y guardias — depende de T3, T5, T8
- [ ] `./init.sh --rapido` con `INIT_EXIT=$?` escrito dentro del log en `progress/gate_486.log`;
  revisar `skipped` (con `.env`, la integración no debe saltarse).
- [ ] A mano: `cierres-admin-gestiones-where.test.ts`, `cierres-bodega-gestiones-where.test.ts`,
  `tests/unit/guards/cierre-detalle-superficies.guardia.test.ts`, y el nuevo de integración.
- [ ] `progress/impl_486.md` con el mapa R1..R18 → test (tabla de `requirements.md`).
- **Hecho:** gate verde, mapa completo, todo COMMITEADO en la rama de la ficha.

## T10 — Ver la app — depende de T9
- [ ] Con Playwright, en local: un cierre de mensajero y un cierre de bodega con una gestión de 3
  fotos (sembrarla por el flujo si no existe; anotar cómo); comprobar «Ver evidencia 1/2/3» y que
  cada uno abre una foto distinta; y lo mismo en el cierre pasado del mensajero.
- **Hecho:** capturas o notas en `progress/impl_486.md` con los textos vistos.
