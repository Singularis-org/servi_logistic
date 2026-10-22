# 478 — Detalle por guía y evidencias en el cierre de bodega · tasks

> Requiere aprobación humana del spec (incluidas P1-P4) antes de T1. Base: `dev` @ `502dc2de`.
> Gate de cada tarea: `./init.sh --rapido` (nunca el completo). Un rojo se repite AISLADO.
> `[P]` = paralelizable con las demás `[P]` del mismo bloque.

## T0 — Medir antes de tocar (sin código de producción)

- [x] **T0.1 [P] — Captura del «antes».** Con Playwright, login como maestro, `/cierres-admin` →
  cierres de bodega → «Ver / decidir» de un cierre con gestiones. Capturar el bloque de un
  mensajero sin desplazar en horizontal y la sección Entregadas.
  *Hecho:* capturas en `progress/impl_478.md` con la ruta usada y una línea de qué se ve (qué
  columnas quedan a la vista; si hay o no «Ver evidencia» en Entregadas).
- [x] **T0.2 [P] — Cuántas evidencias hay por resultado.** SELECT de solo lectura, en local y en
  producción (MCP `supabase`, confirmando el ref con `get_project_url` antes): gestiones con
  `cierre_id` en un `cierre_dia` con `cierre_bodega_id IS NOT NULL`, agrupadas por `resultado`, con
  y sin `evidencia_storage_path`.
  *Hecho:* tabla de conteos en `progress/impl_478.md`; si en local no hay ninguna entregada con
  evidencia en un cierre de bodega, anotar cómo se creará para T6 (responde a Q1).
  *Nota 478:* hecho en local (0 cierres de bodega; datos sembrados para T6 y borrados). Producción
  NO medida: el MCP `supabase` no estaba disponible para el agente. Ver `progress/impl_478.md`.

## T1 — Caracterizar el dato (backend, test-only)

- [x] **T1 [P] — R13, R16.** En `tests/unit/services/cierres-bodega-admin-service.test.ts`, caso
  nuevo: el doble del repo devuelve un `cierre_dia` con una gestión por resultado (las cinco), cada
  una con `evidenciaStoragePath`; el firmador se llama con las cinco rutas y cada DTO trae su URL
  firmada y no la ruta. Revisar el caso existente `:199`: si no afirma que `createSignedUrls` no se
  llama con un rol sin acceso total, añadir esa aserción.
  *Hecho:* el test pasa sobre el código actual (es caracterización: no exige cambio de servicio);
  mutación comprobada — filtrar `paths` a solo rechazos en `CierresBodegaAdminService.ts:279-281`
  lo pone rojo — y revertida.

## T2 — Extraer la lista de gestiones del comprobante (frontend)

- [x] **T2.1 — `GestionesPorResultado`.** En `cierre-factura.tsx`, extraer el estado de pestaña
  (`:2312-2316`) y el bloque de pestañas + filas (`:2523-2575`) a un componente exportado con el
  contrato de `design.md §2.1` (incluida la prop `contexto`). `CierreFacturaDetalle` lo monta con
  las props que hoy pasa a `FilaGestion` y SIN `contexto`.
  *Hecho:* typecheck verde; `CierresAdminModule.test.tsx`, `CierreDiaModule.test.tsx`,
  `CierreFacturaSinGestionar.test.tsx`, `CierreRechazosDeTienda.test.tsx`,
  `CierreDetalleIncidente.test.tsx` y `cierre-detalle-superficies.guardia.test.ts` verdes **sin
  editar ni una aserción** (R18). Si hay que editar alguna, parar y anotarlo.
- [x] **T2.2 — P2 en `FilaGestion` (solo si P2 queda en su valor por defecto).** Añadir los tres
  `DatoFila` de `design.md §2.3` (causa, indemnización con marcador pendiente, fulfillment), fuera
  de la vista `esMensajero` para indemnización y fulfillment.
  Test nuevo `tests/components/CierreFacturaFilaIncidente.test.tsx` (R19) con fixture literal
  (causa → su etiqueta del SEED escrita a mano en el test, no leída de `CAUSA_INCIDENTE_LABEL`).
  *Hecho:* test nuevo verde; los de T2.1 siguen verdes; mutación (quitar el `DatoFila` de causa) lo
  pone rojo. Depende de T2.1.

## T3 — Montar en el detalle de bodega (frontend)

- [x] **T3 — Sustituir `DetalleSecciones` por `GestionesPorResultado`.** En
  `CierresBodegaAdminModule.tsx:824-828`, montar `GestionesPorResultado` con
  `grupos={cierreDia.grupos}`, `onVerEvidencia={setEvidencia}` y
  `contexto={cierreDia.mensajeroNombre}`; sin callbacks de corrección; quitar el import de
  `DetalleSecciones`. No tocar el resto del bloque ni el visor (`:886`).
  *Hecho:* typecheck + lint verdes; los tests que montan el módulo (`CierreBodegaDetalleCascadas`,
  `CierreBodegaDesglosePorTienda`, `descarga/CierresBodegaDescargaDetallada`,
  `descarga/CierresDescarga*`) verdes; cualquiera que cambie por P3 se edita citando P3 en el
  commit. Depende de T2.1.

## T4 — Tests del detalle de bodega (frontend)

- [x] **T4 — `tests/components/CierreBodegaDetalleGestiones.test.tsx`** (R1-R12, R14, R15, R17).
  Monta `CierresBodegaAdminModule` con `verCierreBodegaDetalle` doblado devolviendo DOS mensajeros:
  uno con gestiones en los cinco resultados (entregada con pagos y evidencia, reprogramada con
  evidencia, novedad, devolución por rechazo automática con evidencia, incidente) y otro con solo
  entregadas sin evidencia. Un caso por fila de la tabla de trazabilidad de `requirements.md`.
  Reglas: textos esperados como LITERALES del fixture (memoria «Aserción contra su propia fuente»);
  búsquedas `within` la región de cada mensajero (R17); R9 monta además el comprobante de mensajero
  con la misma gestión y compara contra el mismo literal, no entre sí.
  *Hecho:* todos verdes; dos mutaciones comprobadas y revertidas — (a) pasar `onCorregirPagos` en
  T3 pone rojo R14; (b) quitar `onVerEvidencia` en T3 pone rojo R10/R12. Depende de T3 (y de T2.2
  para los casos de incidente si P2 = defecto).

## T5 — Gate y registro

- [x] **T5 — Gate y mapa de trazabilidad.** `./init.sh --rapido` con `INIT_EXIT=$?` escrito dentro
  del log (`progress/gate_478.log`); mirar `skipped`, no solo el exit. Mapa R → test en
  `progress/impl_478.md`.
  *Hecho:* gate verde con el log commiteado; las 19 R mapeadas a un test existente y verde.
  Depende de T1-T4.

## T6 — Verlo en la app (Playwright)

- [x] **T6 — Recorrido.** Dev server propio (no levantar otro si ya hay uno de otro agente).
  Login como maestro (y repetir con admin): `/cierres-admin` → cierres de bodega → abrir un cierre
  con gestiones (el de T0.2 o el creado por el flujo). Por un mensajero: (1) ver las cinco pestañas
  con conteo; (2) desplegar una entregada y comprobar dirección, ubicación, recibido con método,
  tienda, flete+IVA, comisión+IVA, pago al mensajero, «Desglose de ingreso» y «Cobros de esta
  gestión»; (3) «Ver evidencia» abre la imagen (capturar la respuesta de la petición de la imagen,
  no solo el modal); (4) no hay «Corregir…» ni «Aprobar/Rechazar» en el bloque; (5) cambiar de
  pestaña en un mensajero no mueve la del otro. Repetir (2)-(3) en una devolución por rechazo.
  Abrir además un detalle de mensajero (central) y comprobar que se ve igual que en T0/antes (R18).
  Con `adminSatelite`: comprobar que su detalle de cierre de mensajero sigue igual y que no ve el
  detalle de bodega (R16).
  *Hecho:* capturas antes/después en `progress/impl_478.md` con el número de filas y botones vistos;
  cualquier diferencia con el spec, anotada como hallazgo. Depende de T5.

## Dependencias

```
T0.1, T0.2, T1  [P]  ──┐
T2.1 ──> T2.2 (si P2) ─┤
T2.1 ──> T3 ──> T4 ────┴──> T5 ──> T6
```
