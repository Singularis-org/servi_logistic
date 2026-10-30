import type { JobTipo, ModuloApagable } from "@prisma/client";

// SL-23 (design §3, aprobado el 2026-10-26; R3) — a qué módulo pertenece cada pieza del sistema. Son
// datos, no lógica: la guardia `tests/unit/guards/modulos-reparto.guardia.test.ts` compara estas
// tablas con el disco y falla nombrando la pieza que falte o sobre. Las puertas (`exigir-modulo.ts`),
// el drenador y el menú leen de aquí, así que una pieza mal clasificada se ve en un solo sitio.
//
// Solo tipos de Prisma: lo importan la guardia y el menú cliente.

/** Las dos claves de una pieza compartida (§3.7): la pieza exige las dos encendidas (R33). */
export type ParDeModulos = readonly [ModuloApagable, ModuloApagable];

export type Destino = ModuloApagable | "nucleo" | ParDeModulos;

/** Las claves que una pieza exige encendidas. El núcleo no exige ninguna. */
export function modulosDe(destino: Destino): readonly ModuloApagable[] {
  if (destino === "nucleo") return [];
  return typeof destino === "string" ? [destino] : destino;
}

/** §3.1 — rutas de `app/(app)/`, escritas como la URL (`/wallet/tiendas/[tiendaId]`). */
export const MODULO_POR_RUTA: Readonly<Record<string, Destino>> = {
  // núcleo
  "/dashboard": "nucleo",
  "/ordenes": "nucleo",
  // Redirige a `/mis-asignaciones/reparto` (Entregas, núcleo): no pinta nada propio.
  "/mis-asignaciones": "nucleo",
  "/mis-asignaciones/reparto": "nucleo",
  "/mis-asignaciones/recoger": "nucleo",
  "/cierre-dia": "nucleo",
  "/cierres-admin": "nucleo",
  "/incidentes": "nucleo",
  "/novedades": "nucleo",
  "/configuracion": "nucleo",
  "/configuracion/tarifas": "nucleo",
  "/configuracion/zonas": "nucleo",
  "/ayuda": "nucleo",
  "/ayuda/[...slug]": "nucleo",
  "/historico/acciones": "nucleo",
  "/configuracion/integraciones": "nucleo",
  // API e integraciones (núcleo desde el 2026-10-27).
  "/configuracion/api": "nucleo",
  "/configuracion/sinpe": "nucleo",
  "/configuracion/vehiculos": "nucleo",
  "/plataforma/empresas": "nucleo",
  "/plataforma/empresas/[organizacionId]": "nucleo",
  // SL-20: la geografía se gestiona desde la plataforma (superadmin), ya no desde `/configuracion`.
  "/plataforma/geografia": "nucleo",
  // Recolección y Bodegas satélite (núcleo desde el 2026-10-27).
  "/recoleccion": "nucleo",
  "/recepcion-satelite": "nucleo",
  "/recepcion-satelite/por-recibir": "nucleo",
  "/recepcion-satelite/en-bodega": "nucleo",
  "/mi-bodega": "nucleo",
  // analitica, monitoreo
  "/analitica": "analitica",
  "/monitoreo": "monitoreo",
  // Wallet (núcleo desde el 2026-10-28).
  "/wallet": "nucleo",
  "/wallet/tiendas": "nucleo",
  "/wallet/tiendas/[tiendaId]": "nucleo",
  "/wallet/mensajeros": "nucleo",
  "/wallet/mensajeros/[mensajeroId]": "nucleo",
  "/wallet/satelites": "nucleo",
  "/wallet/satelites/[zonaId]": "nucleo",
  "/mi-wallet": "nucleo",
  // ranking
  "/ranking": "ranking",
  "/ranking/historico": "ranking",
  // WhatsApp (núcleo desde el 2026-10-27).
  "/configuracion/plantillas": "nucleo",
  "/configuracion/envios-whatsapp": "nucleo",
  "/configuracion/envios-whatsapp/nuevo": "nucleo",
  "/configuracion/envios-whatsapp/[id]": "nucleo",
  "/configuracion/envios-whatsapp/historial": "nucleo",
  "/historico/conversaciones": "nucleo",
};

/**
 * §3.2 — archivos de `lib/actions/` por su nombre sin `.ts`. Un archivo que se consume desde una
 * pantalla del núcleo va al núcleo aunque su nombre suene a un módulo (mixto): lo protege la puerta
 * de la ruta que lo monta.
 */
export const MODULO_POR_ACTION: Readonly<Record<string, Destino>> = {
  // analitica (13)
  "analitica-financiera": "analitica",
  "analitica-operativa": "analitica",
  "analitica-refrescar": "analitica",
  "ciclo-vida": "analitica",
  "cohorte-carga": "analitica",
  "conteo-cargadas-por-dia": "analitica",
  "conteo-devoluciones": "analitica",
  "conteo-entregas": "analitica",
  "conteo-hoy-gestion": "analitica",
  "conteo-por-status": "analitica",
  "conteo-productos": "analitica",
  "detalle-dinero-producto": "analitica",
  "finanzas-diario": "analitica",
  // monitoreo
  "tablero-dia": "monitoreo",
  // Wallet (núcleo desde el 2026-10-28; 18)
  "abono-tienda": "nucleo",
  "aporte-capital": "nucleo",
  "como-quedo": "nucleo",
  "deuda-plataforma": "nucleo",
  "efecto-movimiento": "nucleo",
  "estado-cuenta": "nucleo",
  "gasto-fijo-cobro": "nucleo",
  "gasto-fijo-plantilla": "nucleo",
  "libro-caja-autoria": "nucleo",
  "pago-por-cuenta-tienda": "nucleo",
  "rechazo-tienda-cobro": "nucleo",
  wallet: "nucleo",
  "wallet-anulacion": "nucleo",
  "wallet-comprobante": "nucleo",
  "wallet-egresos": "nucleo",
  "wallet-filtros": "nucleo",
  "wallet-mensajero": "nucleo",
  "wallet-tienda": "nucleo",
  // ranking (antes wallet + ranking, §3.7; Wallet es núcleo desde el 2026-10-28)
  "premio-ranking-devengo": "ranking",
  // ranking
  ranking: "ranking",
  "ranking-historico": "ranking",
  // WhatsApp (núcleo desde el 2026-10-27).
  "chat-whatsapp": "nucleo",
  "envios-whatsapp": "nucleo",
  "historico-conversaciones": "nucleo",
  plantillas: "nucleo",
  "plantillas-sync": "nucleo",
  "whatsapp-envio": "nucleo",
  "informe-picking": "nucleo",
  "informe-transito": "nucleo",
  // núcleo (60 + `modulos-empresa` y `geografia-plataforma`, de plataforma, + 5 de Recolección,
  // Bodegas satélite y API e integraciones; las 8 de WhatsApp van arriba, en su bloque)
  auth: "nucleo",
  // API e integraciones (núcleo desde el 2026-10-27).
  "api-keys": "nucleo",
  webhooks: "nucleo",
  "aprobacion-postulaciones": "nucleo",
  "atencion-postulaciones-recurso": "nucleo",
  "carga-masiva-resumen": "nucleo",
  "cierre-bodega": "nucleo",
  "cierre-dia": "nucleo",
  "cierres-admin": "nucleo",
  // Cierres, mixto: `/cierres-admin` y `/wallet/satelites` (§3.9, a confirmar por el humano).
  "conciliacion-satelites": "nucleo",
  // Incidentes y novedades (núcleo desde el 2026-10-26).
  "gestion-desde-ayuda": "nucleo",
  "habilitar-novedad": "nucleo",
  incidentes: "nucleo",
  novedades: "nucleo",
  "rechazos-sla-tienda": "nucleo",
  cobertura: "nucleo",
  "cobro-plataforma": "nucleo",
  "corregir-datos-cliente": "nucleo",
  "corregir-dia-reparto": "nucleo",
  "corregir-fecha-reprogramacion": "nucleo",
  descargas: "nucleo",
  "deshacer-asignacion": "nucleo",
  "devolucion-origen": "nucleo",
  "devolucion-tienda": "nucleo",
  // Bodegas satélite (núcleo desde el 2026-10-27).
  "envio-devolucion-central": "nucleo",
  "eliminar-orden": "nucleo",
  "etiquetas-guia": "nucleo",
  "filtros-ordenes": "nucleo",
  geografia: "nucleo",
  "geografia-plataforma": "nucleo",
  "historial-acciones": "nucleo",
  integraciones: "nucleo",
  "liberacion-reprogramada": "nucleo",
  // Cierres, mixto: pagos desde `/cierres-admin`, también usada por `/wallet/tiendas` y `/wallet/mensajeros` (§3.9).
  liquidacion: "nucleo",
  manifiesto: "nucleo",
  "mis-asignaciones": "nucleo",
  "modulos-empresa": "nucleo",
  notificaciones: "nucleo",
  "orden-ayuda": "nucleo",
  "orden-historial": "nucleo",
  "orden-mensajero-meta": "nucleo",
  "orden-notas": "nucleo",
  ordenes: "nucleo",
  "ordenes-guia": "nucleo",
  "order-status": "nucleo",
  organizaciones: "nucleo",
  "password-reset": "nucleo",
  // SL-24: de plataforma, como `modulos-empresa` (solo el superadmin).
  planes: "nucleo",
  "postulacion-mensajero": "nucleo",
  "postulacion-recurso": "nucleo",
  push: "nucleo",
  "rastreo-publico": "nucleo",
  "recepcion-bodega-central": "nucleo",
  "recepcion-origen": "nucleo",
  // Recolección y Bodegas satélite (núcleo desde el 2026-10-27).
  "recepcion-satelite": "nucleo",
  "recoleccion-tienda": "nucleo",
  "recuperar-orden": "nucleo",
  "reprogramadas-retenidas": "nucleo",
  "resolver-novedad": "nucleo",
  "ruta-mensajero": "nucleo",
  "sinpe-bodega": "nucleo",
  tarifas: "nucleo",
  "traspasar-mensajero": "nucleo",
  usuarios: "nucleo",
  "usuarios-por-rol": "nucleo",
  vehiculos: "nucleo",
  "vistas-filtro": "nucleo",
  zonas: "nucleo",
};

/** §3.3 — cada `JobTipo`. Un tipo nuevo sin clasificar no compila. */
export const MODULO_POR_JOB: Readonly<Record<JobTipo, Destino>> = {
  liberar_reprogramadas: "nucleo",
  geocodificacion: "nucleo",
  optimizacion_ruta: "nucleo",
  push_web: "nucleo",
  analitica_rollup_diario: "analitica",
  analitica_invalidacion_cache: "analitica",
  // WhatsApp (núcleo desde el 2026-10-27).
  whatsapp_template_sync: "nucleo",
  whatsapp_chat_envio: "nucleo",
  whatsapp_bienvenida: "nucleo",
  whatsapp_envio_programado: "nucleo",
  whatsapp_envio_evento: "nucleo",
  whatsapp_envio_ejecucion: "nucleo",
  whatsapp_envio_reintento: "nucleo",
  whatsapp_envio_mantenimiento: "nucleo",
  // API e integraciones (núcleo desde el 2026-10-27).
  webhook_estado: "nucleo",
  webhook_evento: "nucleo",
  // Cambio programado de un plan (SL-24, design §16.3 y §16.4): de plataforma, sin módulo.
  plan_aplicar_cambio: "nucleo",
  plan_recordatorio_cambio: "nucleo",
  plan_aviso_correo: "nucleo",
  plan_cambios_vencidos: "nucleo",
};

/** §3.4 — carpetas de `app/api/cron/`. */
export const MODULO_POR_CRON: Readonly<Record<string, Destino>> = {
  "procesar-jobs": "nucleo",
  "corte-diario": "nucleo",
  "liberar-reprogramadas": "nucleo",
  "procesar-devueltas-sla": "nucleo",
  "avisos-diarios": "nucleo",
  "aviso-reparto-manana": "nucleo",
  "purga-descargas": "nucleo",
  "purga-pdf-cargas": "nucleo",
  "purga-postulaciones-recurso": "nucleo",
  // Wallet (núcleo desde el 2026-10-28).
  "generar-gastos-fijos": "nucleo",
  "snapshot-ranking": "ranking",
  // WhatsApp (núcleo desde el 2026-10-27).
  "sync-plantillas-whatsapp": "nucleo",
};

/** §3.5 — endpoints de `app/api/` que no son cron, por su carpeta relativa a `app/api/`. */
export const MODULO_POR_API: Readonly<Record<string, Destino>> = {
  asistente: "nucleo",
  "ordenes/carga-masiva/chunk": "nucleo",
  "docs/openapi": "nucleo",
  // WhatsApp (núcleo desde el 2026-10-27).
  "chat/media/[mensajeId]": "nucleo",
  "webhooks/whatsapp": "nucleo",
  // API e integraciones (núcleo desde el 2026-10-27). La de analítica sigue exigiendo Analítica.
  "ordenes/api-key/analitica": "analitica",
  "ordenes/api-key": "nucleo",
  "ordenes/api-key/[numGuia]/cancelar": "nucleo",
  "ordenes/api-key/carga": "nucleo",
  "ordenes/api-key/carga/[cargaId]/generate": "nucleo",
  "ordenes/api-key/cotizacion": "nucleo",
  "ordenes/api-key/habilitar": "nucleo",
  "ordenes/api-key/orden/[id]": "nucleo",
  "ordenes/api-key/orden/[id]/generate": "nucleo",
};

/**
 * §3.8 (P2, R30) — jobs y crons de un módulo que siguen corriendo con el módulo apagado. Siguen
 * clasificados en su módulo arriba; aquí solo se dice que no se saltan: el drenador les pasa
 * `"nucleo"` y sus crons llaman a `paraCadaEmpresa` sin `modulo`.
 */
export const CALCULO_CONTINUO = {
  jobs: ["analitica_rollup_diario", "analitica_invalidacion_cache"],
  crons: ["snapshot-ranking"],
} as const satisfies { jobs: readonly JobTipo[]; crons: readonly string[] };

export function esCalculoContinuo(tipo: JobTipo): boolean {
  return (CALCULO_CONTINUO.jobs as readonly JobTipo[]).includes(tipo);
}

export interface ConsumoEntreModulos {
  /** El archivo de la pieza, relativo a la raíz del repo. */
  pieza: string;
  /** Las rutas (`MODULO_POR_RUTA`) que la pintan. */
  anfitrionas: readonly string[];
  /** Lo que la pieza exige encendido. */
  modulo: Destino;
}

/**
 * §6.3 — piezas de un módulo que se pintan en una pantalla de otro (o del núcleo). La anfitriona
 * solo las pinta con su módulo encendido, con el flag por props desde su Server Component. La
 * guardia (caso e) exige que todo import cruzado de una action de un módulo, directo o a través de
 * `components/` y `hooks/`, esté aquí. Una pieza puede ser un componente compartido de `components/`.
 * El chat y el botón de plantilla de WhatsApp salieron de aquí el 2026-10-27, al pasar WhatsApp al núcleo.
 */
export const CONSUMOS_ENTRE_MODULOS: readonly ConsumoEntreModulos[] = [
  {
    pieza: "app/(app)/wallet/mensajeros/_components/PremiosRankingPanel.tsx",
    anfitrionas: ["/wallet/mensajeros"],
    modulo: "ranking",
  },
];
