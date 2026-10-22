# Limpieza de Ordenex — inventario medido

> Generado el 2026-10-21 al crear el repo, con `git grep` sobre el árbol copiado. Es la lista de
> trabajo de la **fase 1** de `docs/plan-saas.md`. Vuelve a medir antes de cada ficha: los números
> cambian a medida que se limpia. Cuando un grep dé 0, esa sección está hecha.

## Regla para decidir qué es «de Ordenex»

1. **Identidad:** el nombre, el dominio, los proyectos de Supabase y Vercel, y las llaves. → Fuera.
   Lo que necesite un valor pasa a configuración de marca o a una variable de entorno.
2. **Datos de clientes reales:** el integrador de Ordenex y sus clientes, los usuarios, teléfonos y
   emails de los seeds, los xlsx de zonas. → Fuera del código, de los seeds y de los docs.
3. **Operación de Ordenex:** el runbook de release, los backfills de un incidente de producción
   suyo, las correcciones de datos hechas a mano. → Fuera.
4. **Costa Rica** (provincia/cantón/distrito, SINPE, colones): **NO** es limpieza de la fase 1.
   Es funcionalidad que la fase 3 convierte en configuración por país. No se borra.
5. **`specs/`**: historia de Ordenex. Se queda como documentación del comportamiento heredado,
   porque hay tests que leen esos archivos. No es backlog, y sus ids no son los de este proyecto.

## Hecho al crear el repo

- `.mcp.json` ya no apunta a los Supabase de Ordenex: es el de la plantilla del arnés.
- Se borró `docs/release.md`, el runbook de producción de Ordenex, que llevaba refs de su Supabase.
- `package.json` se llama `servi_logistic`.
- No se copió `progress/` de Ordenex.

## Lista concreta, revisada a mano

| Qué | Dónde | Acción |
| --- | --- | --- |
| Geografía y zonas de CR de Ordenex | `public/geografia-cr-completa.xlsx`, `public/mapa-geografico-costa-rica.xlsx`, `public/geografia-cr-completa-NOTAS.md`, `scripts/seed-zonas.ts`, `04_insert_zonas_pago_distrito.sql` | **Hecho (SL-11).** Fuera los cinco archivos y la migración `20260713010000`, que sembraba las 7 zonas de Ordenex: la base recién migrada nace sin zonas. La geografía de CR sigue en sus tres migraciones; vuelve a revisarse en la fase 3 como dato de país. La guardia `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` impide que vuelvan. |
| Seeds con personas reales | `scripts/seed-maestro.ts`, `scripts/seed-usuarios-qa.ts`, `scripts/seed-sinpe-inicial.ts` | **Hecho (SL-11).** Fuera los tres scripts y el usuario que sembraba la migración `20260709120000`. No hay seed de desarrollo: la app nace sin usuarios (decisión del 2026-10-21) y el primero llega con SL-32. `db:seed` (catálogos) se queda. La guardia `tests/unit/guards/fuera-datos-ordenex.guardia.test.ts` impide que vuelvan. |
| Backfills de Ordenex | `scripts/backfill-*.ts` | **Hecho (SL-12).** Fuera los tres scripts y sus cinco tests. Comprobación de migraciones: ningún archivo de `db/migrations/` cita ni ejecuta los scripts, y tampoco `package.json`, CI ni ningún job; la guardia `tests/unit/guards/backfills-retirados.guardia.test.ts` impide que vuelvan. |
| Docs de la API pública de Ordenex | `docs/api/` (incluye `ordenex-api-key.postman_collection.json` y la guía de integración) | Renombrar y quitar el dominio; si no aplica todavía, fuera. |
| Ayuda al usuario | `docs/ayuda/` | Revisar textos con el nombre. |
| Diseños de Ordenex | `design-notificaciones/`, `design-whatsapp/`, `DESIGN.md` | Fuera o renombrar; la marca nueva se define en la fase 7. |
| PWA | `public/manifest.json`, `public/icons/`, `public/sw.js`, `public/offline.html`, `public/screenshots/` | Nombre y logo: es la fase 7 (marca), pero el `name` del manifest se cambia ya. |
| Landing | `app/_landing/`, `app/page.tsx`, `public/landing/` | Textos y dominio de Ordenex. |
| Specs con refs de Supabase de Ordenex | `specs/172-liquidacion/tasks.md`, `specs/215-reintento-en-cierre/*`, `specs/484-puntero-gestion-colgado/tasks.md` | Borrar solo la línea con la ref. |

## Inventario por grep

### 1. Nombre «Ordenex» en código y textos de UI

Cambiar por el nombre nuevo o por un valor de configuración de marca. En los tests, actualizar el literal solo si es contrato.

**241 archivos** (`git grep -il -E 'ordenex'`, sin `specs/`):

- `app/(app)/_components/Sidebar.tsx`
- `app/(app)/analitica/_components/entregas/DineroProductoDetalle.tsx`
- `app/(app)/analitica/_components/entregas/ProductosTabla.tsx`
- `app/(app)/analitica/_components/entregas/analitica-productos-descarga-columnas.ts`
- `app/(app)/analitica/_components/finanzas/cargar-kpis.ts`
- `app/(app)/cierre-dia/_components/CierreDiaModule.tsx`
- `app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/CascadasCierreMensajero.tsx`
- `app/(app)/cierres-admin/_components/CierresAdminModule.tsx`
- `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx`
- `app/(app)/cierres-admin/_components/DesglosePorTienda.tsx`
- `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx`
- `app/(app)/cierres-admin/_components/cierre-factura.tsx`
- `app/(app)/cierres-admin/_components/cierre-labels.ts`
- `app/(app)/cierres-admin/_components/cierres-bodega-descarga-columnas.ts`
- `app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts`
- `app/(app)/configuracion/api/_components/ApiKeysModule.tsx`
- `app/(app)/configuracion/envios-whatsapp/page.tsx`
- `app/(app)/configuracion/tarifas/_components/CrearZonaForm.tsx`
- `app/(app)/configuracion/tarifas/_components/tarifas-labels.ts`
- `app/(app)/mi-wallet/_components/MiEstadoCuenta.tsx`
- `app/(app)/mi-wallet/_components/ResumenMiWallet.tsx`
- `app/(app)/mi-wallet/_components/VerComprobanteMiMovimiento.tsx`
- `app/(app)/mi-wallet/_components/mi-estado-cuenta-descarga-columnas.ts`
- `app/(app)/mi-wallet/_components/mi-estado-cuenta-labels.ts`
- `app/(app)/mi-wallet/_components/mi-wallet-labels.ts`
- `app/(app)/mi-wallet/page.tsx`
- `app/(app)/mis-asignaciones/_components/GestionarOrdenPanel.tsx`
- `app/(app)/novedades/_components/GestionarDesdeAyudaModal.tsx`
- `app/(app)/novedades/_components/RechazarNovedadModal.tsx`
- `app/(app)/ordenes/_components/CorregirUbicacionAviso.tsx`
- `app/(app)/ordenes/_components/EtiquetaGuia.tsx`
- `app/(app)/ordenes/_components/OrdenesExistentesTabla.tsx`
- `app/(app)/ordenes/_components/carga-masiva-clasificacion.ts`
- `app/(app)/ordenes/_components/ordenes-descarga-columnas.ts`
- `app/(app)/wallet/_components/BarraComposicionCaja.tsx`
- `app/(app)/wallet/_components/CajaResumenCard.tsx`
- `app/(app)/wallet/_components/ComposicionGananciaCard.tsx`
- `app/(app)/wallet/_components/DesgloseEgresosLista.tsx`
- `app/(app)/wallet/_components/DetalleFilaComposicion.tsx`
- `app/(app)/wallet/_components/FilaComposicion.tsx`
- `app/(app)/wallet/_components/WalletLedger.tsx`
- `app/(app)/wallet/_components/WalletModule.tsx`
- `app/(app)/wallet/_components/composicion-detalle-labels.ts`
- `app/(app)/wallet/_components/libro-caja-labels.ts`
- `app/(app)/wallet/_components/wallet-conceptos-manuales.ts`
- `app/(app)/wallet/_components/wallet-labels.ts`
- `app/(app)/wallet/mensajeros/_components/EstadoCuentaMensajero.tsx`
- `app/(app)/wallet/mensajeros/_components/estado-cuenta-mensajero-labels.ts`
- `app/(app)/wallet/mensajeros/_components/wallet-mensajeros-labels.ts`
- `app/(app)/wallet/page.tsx`
- `app/(app)/wallet/satelites/_components/satelites-labels.ts`
- `app/(app)/wallet/satelites/page.tsx`
- `app/(app)/wallet/tiendas/_components/EstadoCuentaAcciones.tsx`
- `app/(app)/wallet/tiendas/_components/EstadoCuentaTienda.tsx`
- `app/(app)/wallet/tiendas/_components/PagosTiendaEstadoCuenta.tsx`
- `app/(app)/wallet/tiendas/_components/SaldosTiendasTable.tsx`
- `app/(app)/wallet/tiendas/_components/desglose-tienda-labels.ts`
- `app/(app)/wallet/tiendas/_components/estado-cuenta-tienda-labels.ts`
- `app/_landing/LandingFooter.tsx`
- `app/_landing/LandingNav.tsx`
- `app/_landing/LandingPoliticas.tsx`
- `app/_landing/LandingPostular.tsx`
- `app/_landing/primitivas.tsx`
- `app/api-docs/route.ts`
- `app/globals.css`
- `app/layout.tsx`
- `app/page.tsx`
- `components/shared/AsistentePanel.tsx`
- `components/shared/AvisoVersionNueva.tsx`
- `components/shared/Logo.tsx`
- `components/shared/PushOptIn.tsx`
- `components/shared/RevisionSinpeBodega.tsx`
- `components/shared/estado-cuenta/EstadoCuenta.tsx`
- `components/shared/estado-cuenta/TarjetasEstadoCuenta.tsx`
- `components/shared/estado-cuenta/estado-cuenta-descarga-columnas.ts`
- `components/shared/estado-cuenta/estado-cuenta-labels.ts`
- `components/shared/estado-cuenta/estado-cuenta-lineas.ts`
- `components/shared/sinpe-textos.ts`
- `components/shared/wallet/DetalleMovimientoPanel.tsx`
- `components/shared/wallet/RegistrarMovimientoDialog.tsx`
- `components/shared/wallet/conceptos-filtro.ts`
- `components/shared/wallet/detalle-movimiento-panel-labels.ts`
- `components/shared/wallet/registrar-movimiento-labels.ts`
- `hooks/usePreferenciaColumnas.ts`
- `hooks/usePreferenciaSonido.ts`
- `lib/actions/abono-tienda.ts`
- `lib/actions/estado-cuenta.ts`
- `lib/actions/rechazo-tienda-cobro.ts`
- `lib/actions/wallet-anulacion.ts`
- `lib/actions/wallet-tienda.ts`
- `lib/actions/wallet.ts`
- `lib/analytics/metrics.ts`
- `lib/api/openapi-spec.ts`
- `lib/asistente/instrucciones.ts`
- `lib/audio/preferencia-sonido.ts`
- `lib/auth/menu-visibility.ts`
- `lib/columnas/preferencia-columnas.ts`
- `lib/config/composicion-detalle.ts`
- `lib/config/email.ts`
- `lib/config/push.ts`
- `lib/config/wallet-tienda.ts`
- `lib/constants/origen-legible-rotulos.ts`
- `lib/constants/wallet-rotulos.ts`
- `lib/crypto/webhook-firma.ts`
- `lib/interfaces/external/IAsistenteProvider.ts`
- `lib/interfaces/repositories/IAbonoTiendaRepository.ts`
- `lib/interfaces/repositories/IAjusteCajaAnulacionRepository.ts`
- `lib/interfaces/repositories/ICierreDiaRepository.ts`
- `lib/interfaces/repositories/ICobroTiendaAnulacionRepository.ts`
- `lib/interfaces/repositories/IComoQuedoRepository.ts`
- `lib/interfaces/repositories/ICuentasPorPagarAnaliticaRepository.ts`
- `lib/interfaces/repositories/IEstadoCuentaRepository.ts`
- `lib/interfaces/repositories/ILibroCajaAutoriaRepository.ts`
- `lib/interfaces/repositories/IOrdenRepository.ts`
- `lib/interfaces/repositories/IOrigenLegibleRepository.ts`
- `lib/interfaces/repositories/ITarifaVigenteRepository.ts`
- `lib/interfaces/repositories/IWalletComprobanteRepository.ts`
- `lib/interfaces/repositories/IWalletMovimientoRepository.ts`
- `lib/interfaces/repositories/IWalletTiendaMovimientoRepository.ts`
- `lib/interfaces/services/IAbonoTiendaService.ts`
- `lib/interfaces/services/ICajaAbonoTiendaFeedService.ts`
- `lib/interfaces/services/ICajaCobroTiendaFeedService.ts`
- `lib/interfaces/services/ICajaPagoTiendaFeedService.ts`
- `lib/interfaces/services/ICajaPremioRankingFeedService.ts`
- `lib/interfaces/services/ICierreBodegaService.ts`
- `lib/interfaces/services/ICierreDiaService.ts`
- `lib/interfaces/services/ICierresAdminService.ts`
- `lib/interfaces/services/ICierresBodegaAdminService.ts`
- `lib/interfaces/services/ICobroTiendaService.ts`
- `lib/interfaces/services/IEgresoCajaAnulacionService.ts`
- `lib/interfaces/services/IEstadoCuentaService.ts`
- `lib/interfaces/services/IRechazoTiendaCobroService.ts`
- `lib/interfaces/services/IWalletService.ts`
- `lib/manifiesto/preferencia-columnas.ts`
- `lib/pdf/etiquetas-dibujo.ts`
- `lib/pdf/etiquetas-maqueta.ts`
- `lib/pwa/actualizacion.ts`
- `lib/repositories/AbonoTiendaRepository.ts`
- `lib/repositories/AjusteCajaAnulacionRepository.ts`
- `lib/repositories/CierreBodegaRepository.ts`
- `lib/repositories/CierreDiaRepository.ts`
- `lib/repositories/CierresAdminRepository.ts`
- `lib/repositories/CobroTiendaAnulacionRepository.ts`
- `lib/repositories/ComoQuedoRepository.ts`
- `lib/repositories/EgresoCajaDocumentosRepository.ts`
- `lib/repositories/EstadoCuentaRepository.ts`
- `lib/repositories/OrdenRepository.ts`
- `lib/repositories/RechazoTiendaCobroRepository.ts`
- `lib/repositories/WalletTiendaMovimientoRepository.ts`
- `lib/repositories/ZonaRepository.ts`
- `lib/repositories/libro-caja-a-quien-sql.ts`
- `lib/services/AbonoTiendaService.ts`
- `lib/services/AnaliticaFinancieraService.ts`
- `lib/services/AporteCapitalService.ts`
- `lib/services/BulkOrdenService.ts`
- `lib/services/CajaAbonoTiendaFeedService.ts`
- `lib/services/CajaCobroTiendaFeedService.ts`
- `lib/services/CajaCodFeedService.ts`
- `lib/services/CajaPremioRankingFeedService.ts`
- `lib/services/CierreDiaService.ts`
- `lib/services/CierresAdminService.ts`
- `lib/services/CierresBodegaAdminService.ts`
- `lib/services/CobroTiendaService.ts`
- `lib/services/ConteoProductosService.ts`
- `lib/services/CorregirDatosClienteService.ts`
- `lib/services/CotizacionOrdenService.ts`
- `lib/services/DetalleDineroProductoService.ts`
- `lib/services/DetalleEnLoteService.ts`
- `lib/services/EgresoCajaAnulacionService.ts`
- `lib/services/EstadoCuentaService.ts`
- `lib/services/LibroCajaAutoriaService.ts`
- `lib/services/LiquidacionService.ts`
- `lib/services/OrigenLegibleService.ts`
- `lib/services/PagoPorCuentaTiendaService.ts`
- `lib/services/RechazoTiendaCobroService.ts`
- `lib/services/RechazoTiendaService.ts`
- `lib/services/WalletFeedService.ts`
- `lib/services/WalletService.ts`
- `lib/services/WalletTiendaFeedService.ts`
- `lib/services/WalletTiendaService.ts`
- `lib/services/WebhookEstadoService.ts`
- `lib/services/email/plantillas/otp-codigo.ts`
- `lib/tema/tema.ts`
- `lib/types/abono-tienda.ts`
- `lib/types/analitica-financiera.ts`
- `lib/types/api-orden.ts`
- `lib/types/aporte-capital.ts`
- `lib/types/carga-masiva.ts`
- `lib/types/conteo-productos.ts`
- `lib/types/correccion-datos-cliente.ts`
- `lib/types/cotizacion.ts`
- `lib/types/dinero-productos.ts`
- `lib/types/efecto-movimiento.ts`
- `lib/types/estado-cuenta.ts`
- `lib/types/historial-accion-etiquetas.ts`
- `lib/types/historial-accion.ts`
- `lib/types/libro-caja-autoria.ts`
- `lib/types/orden.ts`
- `lib/types/pago-por-cuenta-tienda.ts`
- `lib/types/plantilla-datos.ts`
- `lib/types/rechazo-tienda-cobro.ts`
- `lib/types/tarifa.ts`
- `lib/types/wallet-anulacion.ts`
- `lib/types/wallet-comprobante-lateral.ts`
- `lib/types/wallet-filtros.ts`
- `lib/types/wallet-laterales.ts`
- `lib/types/wallet-mensajero.ts`
- `lib/types/wallet-tienda.ts`
- `lib/types/wallet.ts`
- `lib/utils/anotacion-de-fila.ts`
- `lib/utils/api-orden-costo.ts`
- `lib/utils/aporte-por-orden.ts`
- `lib/utils/aviso-ubicacion-denegada.ts`
- `lib/utils/caja-tesoreria.ts`
- `lib/utils/cierre-detalle.ts`
- `lib/utils/comprobante.ts`
- `lib/utils/cuenta-por-pagar.ts`
- `lib/utils/descripcion-abono.ts`
- `lib/utils/descripcion-cobro-tienda.ts`
- `lib/utils/descripcion-pago-por-cuenta.ts`
- `lib/utils/desglose-tienda.ts`
- `lib/utils/dinero-por-producto.ts`
- `lib/utils/efecto-movimiento.ts`
- `lib/utils/egreso-anulable.ts`
- `lib/utils/estado-cuenta-chips.ts`
- `lib/utils/estado-cuenta.ts`
- `lib/utils/finanzas-diarias.ts`
- `lib/utils/ingreso-ordenex.ts`
- `lib/utils/invariante-tiendas.ts`
- `lib/utils/linkificar.ts`
- `lib/utils/mapeo-concepto-tienda.ts`
- `lib/utils/mensaje-caracter-no-imprimible.ts`
- `lib/utils/nombre-imprimible-etiqueta.ts`
- `lib/utils/preferencia-navegacion.ts`
- `lib/utils/saldo-tienda.ts`
- `lib/utils/texto-imprimible-etiqueta.ts`
- `lib/whatsapp-envios/informes/aviso-interno.ts`
- `lib/whatsapp-envios/informes/picking/informe.ts`
- `lib/whatsapp-envios/informes/picking/pdf.ts`
- `lib/whatsapp-envios/informes/transito/pdf.ts`

### 2. Nombre «Ordenex» en tests

Se actualizan junto con el código que vigilan, nunca antes.

**341 archivos** (`git grep -il -E 'ordenex'`, sin `specs/`):

- `e2e/mi-wallet.spec.ts`
- `e2e/wallet-mensajeros.spec.ts`
- `e2e/wallet.spec.ts`
- `tests/components/AppLayout.test.tsx`
- `tests/components/AyudaDocumentoPage.test.tsx`
- `tests/components/BusquedaPorGuia469.test.tsx`
- `tests/components/CajaComposicionBarra.test.tsx`
- `tests/components/CajaResumenCard.test.tsx`
- `tests/components/ChatBurbujaContenido.test.tsx`
- `tests/components/ChatNoLeidos.test.tsx`
- `tests/components/CierreBodegaDesglosePorTienda.test.tsx`
- `tests/components/CierreBodegaDetalleCascadas.test.tsx`
- `tests/components/CierreBodegaDetalleGestiones.test.tsx`
- `tests/components/CierreBodegaTarjetaCascada.test.tsx`
- `tests/components/CierreCobrosDeLaGestion.test.tsx`
- `tests/components/CierreDetalleIncidente.test.tsx`
- `tests/components/CierreFacturaFilaIncidente.test.tsx`
- `tests/components/CierreFacturaSinGestionar.test.tsx`
- `tests/components/CierreMensajeroDesglosePorTienda.test.tsx`
- `tests/components/CierreMensajeroDetalleCascadas.test.tsx`
- `tests/components/CierreMotivoRechazoAutomatico.test.tsx`
- `tests/components/CierrePremioPendiente.test.tsx`
- `tests/components/CierreRechazosDeTienda.test.tsx`
- `tests/components/CierreTarifaAplicada.test.tsx`
- `tests/components/CierreTarifaEspecial.test.tsx`
- `tests/components/CierresAdminConfirmacionFisica.test.tsx`
- `tests/components/CierresAdminDeepLink.test.tsx`
- `tests/components/CierresAdminIndemnizacion.test.tsx`
- `tests/components/CierresAdminModule.test.tsx`
- `tests/components/CierresAdminPage.test.tsx`
- `tests/components/CierresAdminPagoMensajero.test.tsx`
- `tests/components/ColumnasPopoverReordenar.test.tsx`
- `tests/components/ComposicionGananciaCard.test.tsx`
- `tests/components/CorregirResultadoCierre.test.tsx`
- `tests/components/CuentasPorPagarTable.test.tsx`
- `tests/components/DescargarManifiestoColumnas.test.tsx`
- `tests/components/DesgloseTiendaAbono457.test.tsx`
- `tests/components/DetalleFilaComposicion.test.tsx`
- `tests/components/DetalleMiMovimientoCierre.test.tsx`
- `tests/components/DetalleMovimientoCierre.test.tsx`
- `tests/components/DetalleMovimientoPanel.test.tsx`
- `tests/components/DineroIdentidadesEnPantalla.test.tsx`
- `tests/components/EscanerRecepcion.test.tsx`
- `tests/components/EscanerRecepcionBodegaCentral.test.tsx`
- `tests/components/EscanerRecepcionOrigen.test.tsx`
- `tests/components/EstadoCuenta.test.tsx`
- `tests/components/EstadoCuenta458DPantalla.test.tsx`
- `tests/components/EstadoCuentaAcciones.test.tsx`
- `tests/components/EstadoCuentaAnulados.test.tsx`
- `tests/components/EstadoCuentaMensajeroAnular.test.tsx`
- `tests/components/GestionarDesdeAyudaModal.test.tsx`
- `tests/components/GestionarOrdenUbicacionContexto.test.tsx`
- `tests/components/HistorialAccionesAbonoTienda457.test.tsx`
- `tests/components/LandingPage.test.tsx`
- `tests/components/Logo.test.tsx`
- `tests/components/MiWalletComprobante458.test.tsx`
- `tests/components/NotificationsBell.push.test.tsx`
- `tests/components/NotificationsBell.test.tsx`
- `tests/components/OrdenesCargaPreview.test.tsx`
- `tests/components/OrdenesDescargaColumnas.test.tsx`
- `tests/components/OrdenesExistentesTabla.test.tsx`
- `tests/components/PagoMensajeroAcciones.test.tsx`
- `tests/components/PagosTiendaEstadoCuenta.test.tsx`
- `tests/components/ProductosTablaDinero.test.tsx`
- `tests/components/PushOptIn.test.tsx`
- `tests/components/QrScanner.test.tsx`
- `tests/components/RecogerPaqueteCard.test.tsx`
- `tests/components/RecoleccionModule.test.tsx`
- `tests/components/ResumenMiWallet.test.tsx`
- `tests/components/TableroFinanciero.test.tsx`
- `tests/components/VerificarGuiaGate.test.tsx`
- `tests/components/WalletCaja463.test.tsx`
- `tests/components/WalletCaja468.test.tsx`
- `tests/components/WalletCajaBarra467.test.tsx`
- `tests/components/WalletCuentasPorPagarRefrescoP1.test.tsx`
- `tests/components/WalletFechaCostaRica459.test.tsx`
- `tests/components/WalletFiltroAQuien458E.test.tsx`
- `tests/components/WalletLedgerAcciones457.test.tsx`
- `tests/components/WalletLedgerAcciones459.test.tsx`
- `tests/components/WalletLedgerAcciones461.test.tsx`
- `tests/components/WalletLedgerVer458C.test.tsx`
- `tests/components/WalletLibroCaja458E.test.tsx`
- `tests/components/WalletRefrescoDirigido.test.tsx`
- `tests/components/descarga/CierresAdminDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresBodegaDescargaDetallada.test.tsx`
- `tests/components/descarga/CierresDescarga.test.tsx`
- `tests/components/descarga/CierresDescargaColumnas.test.tsx`
- `tests/components/descarga/CierresDescargaNiveles.test.tsx`
- `tests/components/descarga/ConfiguracionDescarga.test.tsx`
- `tests/components/descarga/ControlDescargaTransversal.test.tsx`
- `tests/components/descarga/DescargarGestionesDialog.test.tsx`
- `tests/components/descarga/IncidentesDescarga.test.tsx`
- `tests/components/descarga/ProductosDescargaColumnas.test.tsx`
- `tests/components/descarga/WalletDescarga.test.tsx`
- `tests/components/paginacion/BajoRiesgoPaginacion.test.tsx`
- `tests/fixtures/api-key-dependencias-usuario.ts`
- `tests/fixtures/dto-financiero-servido.ts`
- `tests/fixtures/estado-cuenta.ts`
- `tests/fixtures/gestion-detalle-478.ts`
- `tests/fixtures/plantilla-datos.ts`
- `tests/integration/actions/analitica-financiera-action.test.ts`
- `tests/integration/actions/novedades-pestana-por-url.test.ts`
- `tests/integration/actions/purga-postulaciones-recurso-route.test.ts`
- `tests/integration/api/procesar-jobs-whatsapp-bienvenida.test.ts`
- `tests/integration/api/webhook-evidencias-url-resuelve.route.test.ts`
- `tests/integration/asistente-route.test.ts`
- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts`
- `tests/integration/db/_fixtures/caja-459.ts`
- `tests/integration/db/_fixtures/escrituras-459.ts`
- `tests/integration/db/abono-tienda-457-concurrencia.test.ts`
- `tests/integration/db/abono-tienda-457-migration.test.ts`
- `tests/integration/db/abono-tienda-457.test.ts`
- `tests/integration/db/analitica-anulacion-rechazo-458.test.ts`
- `tests/integration/db/analytics-daily-job.test.ts`
- `tests/integration/db/analytics-daily-migration.test.ts`
- `tests/integration/db/api-key-migration.test.ts`
- `tests/integration/db/aporte-capital.test.ts`
- `tests/integration/db/caja-caracterizacion-459.test.ts`
- `tests/integration/db/caja-invariante-tiendas.test.ts`
- `tests/integration/db/caja-tesoreria-idempotencia.test.ts`
- `tests/integration/db/caja-tesoreria-migration.test.ts`
- `tests/integration/db/cierre-bodega-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cierre-desglose-por-tienda-sql-real.test.ts`
- `tests/integration/db/cobro-tienda-461.test.ts`
- `tests/integration/db/como-quedo.test.ts`
- `tests/integration/db/composicion-detalle-postgres.test.ts`
- `tests/integration/db/correccion-resultado-gestion-migration.test.ts`
- `tests/integration/db/detalle-en-lote-464.test.ts`
- `tests/integration/db/efecto-movimiento-predice.test.ts`
- `tests/integration/db/estado-cuenta-servidor-458d.test.ts`
- `tests/integration/db/historial-accion-cobro-tienda-migration.test.ts`
- `tests/integration/db/historial-accion-conciliacion-bodega-migration.test.ts`
- `tests/integration/db/historial-accion-orden-zona-reconciliada-migration.test.ts`
- `tests/integration/db/historial-accion-q1-ubicacion.test.ts`
- `tests/integration/db/historial-accion-zona-pago-mensajero-migration.test.ts`
- `tests/integration/db/historial-accion-zona-sinpe-migration.test.ts`
- `tests/integration/db/job-tipo-analitica-invalidacion-migration.test.ts`
- `tests/integration/db/job-tipo-analitica-rollup-migration.test.ts`
- `tests/integration/db/libro-caja-a-quien.test.ts`
- `tests/integration/db/libro-caja-filtro-a-quien.test.ts`
- `tests/integration/db/libro-caja-revision-458c.test.ts`
- `tests/integration/db/liquidacion-pago-tienda-458-concurrencia.test.ts`
- `tests/integration/db/orden-incidente-migration.test.ts`
- `tests/integration/db/orden-remision-borrada-libera-numero.test.ts`
- `tests/integration/db/orden-traspaso-migration.test.ts`
- `tests/integration/db/pago-por-cuenta-tienda-concurrencia.test.ts`
- `tests/integration/db/premio-ranking-devengo-migration.test.ts`
- `tests/integration/db/resolver-novedad-reprograma-dinero.test.ts`
- `tests/integration/db/wallet-461-idempotencia-clave.test.ts`
- `tests/integration/db/wallet-caracterizacion-458.test.ts`
- `tests/integration/db/wallet-comprobante-alcance.test.ts`
- `tests/integration/db/wallet-documento-comprobante-458.test.ts`
- `tests/integration/db/wallet-fecha-elegida.test.ts`
- `tests/integration/db/wallet-migration.test.ts`
- `tests/integration/db/wallet-tienda-cobro.test.ts`
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`
- `tests/integration/mi-wallet-page.test.tsx`
- `tests/integration/repositories/dinero-productos.int.test.ts`
- `tests/integration/repositories/historico-conversaciones.int.test.ts`
- `tests/integration/wallet-page.test.tsx`
- `tests/integration/wallet-satelites.test.tsx`
- `tests/integration/wallet-tiendas-page.test.tsx`
- `tests/unit/actions/wallet-actions.test.ts`
- `tests/unit/actions/wallet-caja-descarga-action.test.ts`
- `tests/unit/actions/wallet-egresos-actions.test.ts`
- `tests/unit/actions/wallet-tienda-cobro-action.test.ts`
- `tests/unit/analytics/_dinero-falso.ts`
- `tests/unit/analytics/alcance-dinero.guardia.test.ts`
- `tests/unit/analytics/conteo-productos-dinero.test.ts`
- `tests/unit/analytics/detalle-dinero-producto.test.ts`
- `tests/unit/analytics/dinero-producto-no-sumable.guardia.test.ts`
- `tests/unit/analytics/etiquetas-visibles.guardia.test.ts`
- `tests/unit/analytics/financiera-borde.guardia.test.ts`
- `tests/unit/analytics/financiera-contratos.test.ts`
- `tests/unit/analytics/financiera-correspondencia.guardia.test.ts`
- `tests/unit/analytics/financiera-desglose-ids.guardia.test.ts`
- `tests/unit/analytics/financiera-forma-importe.guardia.test.ts`
- `tests/unit/analytics/financiera-granularidad.test.ts`
- `tests/unit/analytics/financiera-ingresos-repo.test.ts`
- `tests/unit/analytics/finanzas-diario.test.ts`
- `tests/unit/analytics/fulfillment-fuera-de-la-formula.guardia.test.ts`
- `tests/unit/analytics/kpis-financieros.test.ts`
- `tests/unit/analytics/metrics-caja-naturaleza.guardia.test.ts`
- `tests/unit/analytics/metrics-cuenta-por-pagar-tienda-457.test.ts`
- `tests/unit/analytics/metrics.test.ts`
- `tests/unit/analytics/tablero-financiero-cargar.test.ts`
- `tests/unit/api/openapi-266-habilitar.test.ts`
- `tests/unit/api/openapi-320-eliminar.test.ts`
- `tests/unit/api/openapi-405-gestiones.test.ts`
- `tests/unit/api/openapi-406-evidencias-url.test.ts`
- `tests/unit/api/openapi-webhook-estado-actualizado.test.ts`
- `tests/unit/app/tarifas/DescargarCoberturaButton.test.tsx`
- `tests/unit/asistente/contexto-457.test.ts`
- `tests/unit/asistente/contexto-458.test.ts`
- `tests/unit/asistente/contexto-460.test.ts`
- `tests/unit/asistente/contexto-461.test.ts`
- `tests/unit/asistente/instrucciones.test.ts`
- `tests/unit/auth/menu-visibility.test.ts`
- `tests/unit/clients/google-route-optimization.test.ts`
- `tests/unit/clients/webhook-sender.test.ts`
- `tests/unit/clients/whatsapp-app-id.test.ts`
- `tests/unit/columnas/orden-efectivo.test.ts`
- `tests/unit/components/desglose-tienda-labels.test.ts`
- `tests/unit/components/desglose-tienda-ledger.test.tsx`
- `tests/unit/components/mi-wallet-labels.test.ts`
- `tests/unit/components/ordenes-columns.test.tsx`
- `tests/unit/components/rechazo-nombre-466-app.test.ts`
- `tests/unit/components/saldo-tienda-card.negativo.test.tsx`
- `tests/unit/components/wallet-conceptos-manuales.test.ts`
- `tests/unit/components/wallet-indemnizacion-libro.test.tsx`
- `tests/unit/components/wallet-labels.test.ts`
- `tests/unit/components/wallet-ledger-dueno.test.tsx`
- `tests/unit/components/wallet-page-cobros-pendientes.test.tsx`
- `tests/unit/components/wallet-registrar-movimiento-dialog.test.tsx`
- `tests/unit/config/email-config.test.ts`
- `tests/unit/config/push-config.test.ts`
- `tests/unit/db/orden-num-remision-parcial.test.ts`
- `tests/unit/db/orden-num-remision-por-tienda.test.ts`
- `tests/unit/descarga/analitica-productos-descarga-columnas.test.ts`
- `tests/unit/descarga/censo-tablas.ts`
- `tests/unit/descarga/cierre-dia-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-fundida-descarga-columnas.test.ts`
- `tests/unit/descarga/cierres-gestiones-paridad.test.ts`
- `tests/unit/descarga/cobertura-tablas.guardia.test.ts`
- `tests/unit/descarga/estado-cuenta-descarga-columnas.test.ts`
- `tests/unit/descarga/libro-kardex-468.test.ts`
- `tests/unit/descarga/wallet-caja-descarga-columnas.test.ts`
- `tests/unit/descarga/wallet-tienda-descarga-columnas.test.ts`
- `tests/unit/guards/abono-tienda-alcance.guardia.test.ts`
- `tests/unit/guards/caja-173-alcance.guardia.test.ts`
- `tests/unit/guards/caja-clasificacion-459.guardia.test.ts`
- `tests/unit/guards/caja-composicion-exhaustiva.guardia.test.ts`
- `tests/unit/guards/caja-textos-459.guardia.test.ts`
- `tests/unit/guards/cierre-bodega-vocabulario.guardia.test.ts`
- `tests/unit/guards/factura-contraste.guardia.test.ts`
- `tests/unit/guards/flete-por-rechazo-censo.guardia.test.ts`
- `tests/unit/guards/historial-accion-escrituras-cubiertas.guardia.test.ts`
- `tests/unit/guards/historial-correccion-dia.guardia.test.ts`
- `tests/unit/guards/incidente-exhaustividad.test.ts`
- `tests/unit/guards/mensajero-forma-unica.guardia.test.ts`
- `tests/unit/guards/no-embalaje.test.ts`
- `tests/unit/guards/nombres-wallet-461.guardia.test.ts`
- `tests/unit/guards/openapi-canal-rutas-reales.guardia.test.ts`
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts`
- `tests/unit/guards/pwa-push.guardia.test.ts`
- `tests/unit/guards/pwa-relevo-y-purga.guardia.test.ts`
- `tests/unit/guards/pwa-servida-sin-sesion.guardia.test.ts`
- `tests/unit/guards/quitador-comentarios.guardia.test.ts`
- `tests/unit/guards/tablero-doble-vs-servicio.guardia.test.ts`
- `tests/unit/guards/tema-encendido.guardia.test.ts`
- `tests/unit/guards/wallet-conceptos-sin-seed.guardia.test.ts`
- `tests/unit/guards/wallet-sin-uuid.guardia.test.tsx`
- `tests/unit/guards/wallet-textos-458.guardia.test.ts`
- `tests/unit/historial-accion/catalogo-y-choke-point.test.ts`
- `tests/unit/hooks/usePushEnVentana.test.tsx`
- `tests/unit/hooks/useTonoAlIncrementar.test.tsx`
- `tests/unit/manifiesto/preferencia-columnas.test.ts`
- `tests/unit/pdf/etiquetas-pdf-lote.smoke.test.ts`
- `tests/unit/pdf/etiquetas-verificacion.ts`
- `tests/unit/pdf/informe-transito-pdf.test.ts`
- `tests/unit/push/web-push-sender.test.ts`
- `tests/unit/repositories/cierre-detalle-causa-monto.test.ts`
- `tests/unit/repositories/cierre-dia-repository.test.ts`
- `tests/unit/repositories/cierres-admin-caja-cod.test.ts`
- `tests/unit/repositories/cierres-admin-repository.test.ts`
- `tests/unit/repositories/cierres-gestiones-descarga-dto.test.ts`
- `tests/unit/repositories/orden-repository.test.ts`
- `tests/unit/repositories/wallet-movimiento-repository.test.ts`
- `tests/unit/repositories/webhook-orden-reader.test.ts`
- `tests/unit/scripts/backfill-analitica-cli.test.ts`
- `tests/unit/scripts/backfill-analitica-invalidacion.test.ts`
- `tests/unit/scripts/backfill-caja-tesoreria-cli.test.ts`
- `tests/unit/scripts/backfill-marcador-config-geocode-cli.test.ts`
- `tests/unit/services/CierresAdminService.gestiones-completo.test.ts`
- `tests/unit/services/CierresBodegaAdminService.gestiones-completo.test.ts`
- `tests/unit/services/WebhookEventoOrdenService.test.ts`
- `tests/unit/services/abono-tienda-anulacion.test.ts`
- `tests/unit/services/analitica-financiera-derivacion.test.ts`
- `tests/unit/services/analitica-financiera-serie-frontera.test.ts`
- `tests/unit/services/analitica-financiera-serie.test.ts`
- `tests/unit/services/analitica-financiera-service.test.ts`
- `tests/unit/services/analitica-rollup-handler.test.ts`
- `tests/unit/services/caja-abono-tienda-feed.test.ts`
- `tests/unit/services/caja-backfill-tesoreria.test.ts`
- `tests/unit/services/caja-cadena-pago-anulacion.test.ts`
- `tests/unit/services/caja-cod-feed-service.test.ts`
- `tests/unit/services/cierre-desglose-tres-superficies.test.ts`
- `tests/unit/services/cierre-dia-service-totales-mixtos.test.ts`
- `tests/unit/services/cierre-dia-service.test.ts`
- `tests/unit/services/cierres-admin-fulfillment-solo-central.test.ts`
- `tests/unit/services/cierres-admin-service.aprobar.sin-gestion.test.ts`
- `tests/unit/services/cierres-admin-service.test.ts`
- `tests/unit/services/cierres-bodega-admin-service.test.ts`
- `tests/unit/services/cierres-bodega-pendientes-paginado.test.ts`
- `tests/unit/services/cobro-tienda-service.test.ts`
- `tests/unit/services/corregir-datos-cliente-texto-etiqueta.test.ts`
- `tests/unit/services/cotizacion-orden-service.test.ts`
- `tests/unit/services/email-notificacion.test.ts`
- `tests/unit/services/libro-kardex-468.test.ts`
- `tests/unit/services/liquidacion-anulacion.test.ts`
- `tests/unit/services/liquidacion-caja-puerto.test.ts`
- `tests/unit/services/nodemailer-email-sender.test.ts`
- `tests/unit/services/nombres-que-imprime-la-etiqueta.test.ts`
- `tests/unit/services/rechazo-tienda-cobro-service.test.ts`
- `tests/unit/services/wallet-anulacion-service.test.ts`
- `tests/unit/services/wallet-caja-descarga.test.ts`
- `tests/unit/services/wallet-egreso-reverso-legible.test.ts`
- `tests/unit/services/wallet-indemnizacion-no-reversable.test.ts`
- `tests/unit/services/wallet-origen-legible.test.ts`
- `tests/unit/services/wallet-service.test.ts`
- `tests/unit/services/wallet-tienda-feed-service.test.ts`
- `tests/unit/services/webhook-estado-service.mensajero.test.ts`
- `tests/unit/services/webhook-estado-service.test.ts`
- `tests/unit/types/abono-tienda-schema.test.ts`
- `tests/unit/types/cobro-tienda-anulacion-schema.test.ts`
- `tests/unit/types/plantilla-datos.test.ts`
- `tests/unit/types/wallet-461-clave-schema.test.ts`
- `tests/unit/utils/aporte-por-orden-equivalencia.test.ts`
- `tests/unit/utils/aporte-por-orden.test.ts`
- `tests/unit/utils/aviso-ubicacion-denegada.test.ts`
- `tests/unit/utils/caja-composicion.test.ts`
- `tests/unit/utils/caja-derivacion-457.test.ts`
- `tests/unit/utils/caja-derivacion-459.test.ts`
- `tests/unit/utils/caja-derivacion-461.test.ts`
- `tests/unit/utils/caja-tesoreria.test.ts`
- `tests/unit/utils/cascadas-cierre-bodega.test.ts`
- `tests/unit/utils/cuenta-por-pagar.test.ts`
- `tests/unit/utils/descripcion-abono.test.ts`
- `tests/unit/utils/descripcion-cobro-tienda.test.ts`
- `tests/unit/utils/desglose-tienda.test.ts`
- `tests/unit/utils/dinero-por-producto.test.ts`
- `tests/unit/utils/efecto-movimiento.test.ts`
- `tests/unit/utils/incidente-no-mueve-dinero.test.ts`
- `tests/unit/utils/ingreso-ordenex.test.ts`
- `tests/unit/utils/libro-kardex-468.test.ts`
- `tests/unit/utils/linkificar.test.ts`
- `tests/unit/utils/paquete-url.test.ts`
- `tests/unit/utils/partes-por-tienda.test.ts`
- `tests/unit/utils/tarifa-especial-por-distrito.test.ts`
- `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts`
- `tests/unit/whatsapp-envios/picking-pdf.test.ts`

### 3. Nombre «Ordenex» en scripts, docs, configuración y raíz



**40 archivos** (`git grep -il -E 'ordenex'`, sin `specs/`):

- `DESIGN.md`
- `design-notificaciones/Push.dc.html`
- `design-notificaciones/notificaciones-ordenex.html`
- `design-whatsapp/Formulario.dc.html`
- `design-whatsapp/Historial.dc.html`
- `design-whatsapp/ListaMovil.dc.html`
- `design-whatsapp/Main.dc.html`
- `design-whatsapp/PdfPicking.dc.html`
- `design-whatsapp/PdfTransito1.dc.html`
- `design-whatsapp/PdfTransito2.dc.html`
- `design-whatsapp/Vacio.dc.html`
- `docs/api/CHANGELOG.md`
- `docs/api/api-key-openapi.yaml`
- `docs/api/guia-integracion/README.md`
- `docs/api/guia-integracion/guia-integracion.html`
- `docs/api/manual-metricas-por-mensajero.md`
- `docs/api/ordenex-api-key.postman_collection.json`
- `docs/ayuda/README.md`
- `docs/ayuda/compartido/analitica.md`
- `docs/ayuda/oficina/cierres.md`
- `docs/ayuda/oficina/configuracion-plantillas.md`
- `docs/ayuda/oficina/configuracion-tarifas.md`
- `docs/ayuda/oficina/wallet-caja.md`
- `docs/ayuda/oficina/wallet-mensajeros.md`
- `docs/ayuda/oficina/wallet-satelites.md`
- `docs/ayuda/oficina/wallet-tiendas.md`
- `docs/ayuda/publico/entrar-y-recuperar-contrasena.md`
- `docs/ayuda/publico/rastreo-de-paquete.md`
- `docs/ayuda/tienda/mi-wallet.md`
- `docs/release.md`
- `package.json`
- `public/manifest.json`
- `public/offline.html`
- `public/sw.js`
- `scripts/backfill-analitica.ts`
- `scripts/contraste-454.ts`
- `scripts/drenar-jobs.ts`
- `scripts/rollup-analitica-manual.ts`
- `scripts/seed-maestro.ts` — **ya salió con SL-11**
- `scripts/seed-usuarios-qa.ts` — **ya salió con SL-11**

### 4. Dominio de Ordenex

Va a configuración (variable de entorno del dominio público). No se sustituye por otro dominio fijo.

Medida viva: la guardia `tests/unit/guards/dominio-ordenex-fuera.guardia.test.ts` (SL-14) falla si un
archivo versionado lleva el dominio, salvo sus excepciones temporales, cada una con la ficha que la
retira. La lista de abajo es la foto de partida.

**39 archivos** (`git grep -il -E 'ordenex\.co'`, sin `specs/`):

- `app/_landing/LandingNav.tsx`
- `app/_landing/primitivas.tsx`
- `app/globals.css`
- `app/page.tsx`
- `docs/api/CHANGELOG.md`
- `docs/api/api-key-openapi.yaml`
- `docs/api/guia-integracion/guia-integracion.html`
- `docs/api/manual-metricas-por-mensajero.md`
- `docs/release.md`
- `lib/api/openapi-spec.ts`
- `lib/config/push.ts`
- `lib/types/plantilla-datos.ts`
- `lib/utils/linkificar.ts`
- `lib/whatsapp-envios/informes/aviso-interno.ts`
- `scripts/seed-maestro.ts` — **ya salió con SL-11**
- `tests/components/ChatBurbujaContenido.test.tsx`
- `tests/fixtures/plantilla-datos.ts`
- `tests/integration/actions/novedades-pestana-por-url.test.ts`
- `tests/integration/api/webhook-evidencias-url-resuelve.route.test.ts`
- `tests/integration/db/455/caracterizacion/webhook-estado.test.ts`
- `tests/integration/db/webhook-evidencias-url-resuelve-sql-real.test.ts`
- `tests/unit/api/openapi-406-evidencias-url.test.ts`
- `tests/unit/components/ordenes-columns.test.tsx`
- `tests/unit/config/email-config.test.ts`
- `tests/unit/config/push-config.test.ts`
- `tests/unit/guards/mensajero-forma-unica.guardia.test.ts`
- `tests/unit/guards/no-embalaje.test.ts`
- `tests/unit/guards/pwa-push.guardia.test.ts`
- `tests/unit/push/web-push-sender.test.ts`
- `tests/unit/repositories/orden-repository.test.ts`
- `tests/unit/repositories/webhook-orden-reader.test.ts`
- `tests/unit/services/WebhookEventoOrdenService.test.ts`
- `tests/unit/services/email-notificacion.test.ts`
- `tests/unit/services/nodemailer-email-sender.test.ts`
- `tests/unit/services/webhook-estado-service.mensajero.test.ts`
- `tests/unit/services/webhook-estado-service.test.ts`
- `tests/unit/types/plantilla-datos.test.ts`
- `tests/unit/utils/linkificar.test.ts`
- `tests/unit/whatsapp-envios/informe-aviso-interno.test.ts`

### 5. Proyectos Supabase de Ordenex

Ninguno debe quedar. Si aparece uno, se borra la referencia. Si un `.env` o un MCP apunta a uno de ellos, PARA.

**1 archivos** (`git grep` con los dos ids de la app de origen (memoria local del leader, fuera del repo), sin `specs/`):

- `docs/release.md`

### 6. Integradores y clientes de Ordenex: hecho por SL-13

Datos de clientes reales: fuera del código, de los seeds y de los docs.

La medida es la guardia `tests/unit/guards/sin-integrador-de-ordenex.guardia.test.ts`. Sus términos
prohibidos están en esa guardia (no se repiten aquí) y recorre todos los archivos versionados y sin
versionar no ignorados, salvo `specs/` y los binarios. Corre en cada gate: si un término vuelve, el
gate se pone en rojo con `ruta:línea (término)`.

Tiene exactamente dos excepciones:

- **El propio archivo de la guardia**, el único que define los términos.
- **El slug de la ficha SL-13 en el board**, que aparece en la rama, en la ruta del spec y en
  `progress/`. Vive mientras exista la ficha.
