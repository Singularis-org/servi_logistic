// SLT-125 (T3.6; R19, R42; tasks T3.6) — LOS ARCHIVOS FUENTE DE ESTA FEATURE, PARA LAS GUARDIAS.
//
// Las guardias `etiquetas-geograficas-sin-literal`, `geografia-sin-cte-recursiva` y
// `geografia-lecturas-sin-nodo-fk` se amplian a estos archivos, ENTEROS y sin excepciones nuevas de
// lectura (P1 = B). La lista es la salida de
//
//     git diff --name-only origin/feature/SLT-47-geo-jerarquica-presentacion...HEAD -- app lib components hooks
//
// mas `CampoVariablePicker.tsx` (T3.5). Va escrita y no se calcula en el test: el CI clona sin la
// rama base. Si SLT-125 toca otro archivo fuente, se suma aqui.

/** Los 4 archivos que SLT-125 crea (los demas los modifica). */
export const ARCHIVOS_NUEVOS_SLT125 = [
  "app/(app)/_components/lugar-de-la-orden.ts",
  "app/(app)/_components/niveles-de-columnas.ts",
  "lib/types/ubicacion-snapshot.ts",
  "lib/utils/ubicacion-presentacion.ts",
] as const;

/** Todos los archivos fuente que SLT-125 crea o modifica: los del diff mas el de T3.5, en orden alfabetico. */
export const ARCHIVOS_SLT125: readonly string[] = [
  "app/(app)/_components/lugar-de-la-orden.ts",
  "app/(app)/_components/niveles-de-columnas.ts",
  "app/(app)/cierre-dia/_components/cierre-dia-descarga-columnas.ts",
  "app/(app)/cierre-dia/_components/CierreDiaModule.tsx",
  "app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx",
  "app/(app)/cierres-admin/_components/cierres-gestiones-fundida-descarga-columnas.ts",
  "app/(app)/configuracion/plantillas/_components/CampoVariablePicker.tsx",
  "app/(app)/configuracion/zonas/_components/cobertura-descarga-columnas.ts",
  "app/(app)/configuracion/zonas/_components/DescargarCoberturaButton.tsx",
  "app/(app)/mis-asignaciones/_components/AsignacionDetalle.tsx",
  "app/(app)/mis-asignaciones/_components/chat/chat-format.ts",
  "app/(app)/mis-asignaciones/_components/chat/ChatOrdenesLista.tsx",
  "app/(app)/mis-asignaciones/_components/pos-card/pos-format.ts",
  "app/(app)/mis-asignaciones/_components/pos-card/PosNavBlock.tsx",
  "app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle.tsx",
  "app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico.tsx",
  "app/(app)/novedades/_components/ayuda-descarga-columnas.ts",
  "app/(app)/novedades/_components/novedad-a-orden-card.ts",
  "app/(app)/novedades/_components/novedades-descarga-columnas.ts",
  "app/(app)/ordenes/_components/ordenes-columns.tsx",
  "app/(app)/ordenes/_components/ordenes-descarga-columnas.ts",
  "app/(app)/ordenes/_components/OrdenesModule.tsx",
  "app/(app)/recepcion-satelite/_components/RecepcionDetalle.tsx",
  "app/(app)/recepcion-satelite/_components/RecepcionSateliteModule.tsx",
  "app/(app)/recepcion-satelite/_components/recibidas-columns.tsx",
  "app/(app)/recepcion-satelite/_components/satelite-descarga-columnas.ts",
  "app/(app)/recepcion-satelite/_components/SateliteOrdenesListado.tsx",
  "app/(app)/recepcion-satelite/_components/SateliteOrderCard.tsx",
  "app/paquete/[numGuia]/page.tsx",
  "lib/geo/direccion-query.ts",
  "lib/interfaces/repositories/ICierreDiaRepository.ts",
  "lib/interfaces/repositories/ICoberturaRepository.ts",
  "lib/interfaces/repositories/IOrdenGeocodeRepository.ts",
  "lib/interfaces/repositories/IOrdenRepository.ts",
  "lib/interfaces/services/ICierreDiaService.ts",
  "lib/interfaces/services/ICierresAdminService.ts",
  "lib/pdf/etiquetas-dibujo.ts",
  "lib/repositories/_shared/ruta-del-lugar.ts",
  "lib/repositories/CierreDiaRepository.ts",
  "lib/repositories/CierresAdminRepository.ts",
  "lib/repositories/CoberturaRepository.ts",
  "lib/repositories/GestionOrdenRepository.ts",
  "lib/repositories/InformeTransitoRepository.ts",
  "lib/repositories/OrdenEnvioReader.ts",
  "lib/repositories/OrdenGeocodeRepository.ts",
  "lib/repositories/OrdenRepository.ts",
  "lib/services/CierreDiaService.ts",
  "lib/services/EtiquetaGuiaService.ts",
  "lib/services/GeocodificacionService.ts",
  "lib/services/jobs/geocodificacion-encolado.ts",
  "lib/types/cobertura.ts",
  "lib/types/etiqueta-guia.ts",
  "lib/types/orden.ts",
  "lib/types/plantilla-datos.ts",
  "lib/types/ubicacion-snapshot.ts",
  "lib/utils/cobertura-distrito.ts",
  "lib/utils/plantilla-geo.ts",
  "lib/utils/ubicacion-presentacion.ts",
  "lib/utils/whatsapp-envio-valores.ts",
  "lib/whatsapp-envios/informes/transito/calculo.ts",
  "lib/whatsapp-envios/informes/transito/pdf.ts",
  "lib/whatsapp-envios/informes/transito/tipos.ts",
];
