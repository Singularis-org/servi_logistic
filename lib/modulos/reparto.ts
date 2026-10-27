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
  "/ayuda": "nucleo",
  "/ayuda/[...slug]": "nucleo",
  "/historico/acciones": "nucleo",
  "/configuracion/integraciones": "nucleo",
  // API e integraciones (núcleo desde el 2026-10-27).
  "/configuracion/api": "nucleo",
  "/configuracion/sinpe": "nucleo",
  "/configuracion/vehiculos": "nucleo",
  "/configuracion/geografia": "nucleo",
  "/plataforma/empresas": "nucleo",
  "/plataforma/empresas/[organizacionId]": "nucleo",
  // Recolección y Bodegas satélite (núcleo desde el 2026-10-27).
  "/recoleccion": "nucleo",
  "/recepcion-satelite": "nucleo",
  "/recepcion-satelite/por-recibir": "nucleo",
  "/recepcion-satelite/en-bodega": "nucleo",
  "/mi-bodega": "nucleo",
  // analitica, monitoreo
  "/analitica": "analitica",
  "/monitoreo": "monitoreo",
  // wallet
  "/wallet": "wallet",
  "/wallet/tiendas": "wallet",
  "/wallet/tiendas/[tiendaId]": "wallet",
  "/wallet/mensajeros": "wallet",
  "/wallet/mensajeros/[mensajeroId]": "wallet",
  "/wallet/satelites": "wallet",
  "/wallet/satelites/[zonaId]": "wallet",
  "/mi-wallet": "wallet",
  // ranking
  "/ranking": "ranking",
  "/ranking/historico": "ranking",
  // whatsapp
  "/configuracion/plantillas": "whatsapp",
  "/configuracion/envios-whatsapp": "whatsapp",
  "/configuracion/envios-whatsapp/nuevo": "whatsapp",
  "/configuracion/envios-whatsapp/[id]": "whatsapp",
  "/configuracion/envios-whatsapp/historial": "whatsapp",
  "/historico/conversaciones": "whatsapp",
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
  // wallet (18)
  "abono-tienda": "wallet",
  "aporte-capital": "wallet",
  "como-quedo": "wallet",
  "deuda-plataforma": "wallet",
  "efecto-movimiento": "wallet",
  "estado-cuenta": "wallet",
  "gasto-fijo-cobro": "wallet",
  "gasto-fijo-plantilla": "wallet",
  "libro-caja-autoria": "wallet",
  "pago-por-cuenta-tienda": "wallet",
  "rechazo-tienda-cobro": "wallet",
  wallet: "wallet",
  "wallet-anulacion": "wallet",
  "wallet-comprobante": "wallet",
  "wallet-egresos": "wallet",
  "wallet-filtros": "wallet",
  "wallet-mensajero": "wallet",
  "wallet-tienda": "wallet",
  // wallet + ranking (§3.7, P5)
  "premio-ranking-devengo": ["wallet", "ranking"],
  // ranking
  ranking: "ranking",
  "ranking-historico": "ranking",
  // whatsapp
  "chat-whatsapp": "whatsapp",
  "envios-whatsapp": "whatsapp",
  "historico-conversaciones": "whatsapp",
  plantillas: "whatsapp",
  "plantillas-sync": "whatsapp",
  "whatsapp-envio": "whatsapp",
  "informe-picking": "whatsapp",
  "informe-transito": "whatsapp",
  // núcleo (60 + `modulos-empresa`, de plataforma, + 5 de Recolección, Bodegas satélite y API e integraciones)
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
  whatsapp_template_sync: "whatsapp",
  whatsapp_chat_envio: "whatsapp",
  whatsapp_bienvenida: "whatsapp",
  whatsapp_envio_programado: "whatsapp",
  whatsapp_envio_evento: "whatsapp",
  whatsapp_envio_ejecucion: "whatsapp",
  whatsapp_envio_reintento: "whatsapp",
  whatsapp_envio_mantenimiento: "whatsapp",
  // API e integraciones (núcleo desde el 2026-10-27).
  webhook_estado: "nucleo",
  webhook_evento: "nucleo",
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
  "generar-gastos-fijos": "wallet",
  "snapshot-ranking": "ranking",
  "sync-plantillas-whatsapp": "whatsapp",
};

/** §3.5 — endpoints de `app/api/` que no son cron, por su carpeta relativa a `app/api/`. */
export const MODULO_POR_API: Readonly<Record<string, Destino>> = {
  asistente: "nucleo",
  "ordenes/carga-masiva/chunk": "nucleo",
  "docs/openapi": "nucleo",
  "chat/media/[mensajeId]": "whatsapp",
  "webhooks/whatsapp": "whatsapp",
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
 */
export const CONSUMOS_ENTRE_MODULOS: readonly ConsumoEntreModulos[] = [
  {
    pieza: "app/(app)/mis-asignaciones/_components/chat/ChatFlotante.tsx",
    anfitrionas: ["/mis-asignaciones/reparto", "/mis-asignaciones/recoger"],
    modulo: "whatsapp",
  },
  {
    pieza: "app/(app)/mis-asignaciones/_components/chat/ChatConversacion.tsx",
    anfitrionas: ["/mis-asignaciones/reparto", "/mis-asignaciones/recoger"],
    modulo: "whatsapp",
  },
  {
    pieza: "app/(app)/wallet/mensajeros/_components/PremiosRankingPanel.tsx",
    anfitrionas: ["/wallet/mensajeros"],
    modulo: ["wallet", "ranking"],
  },
  {
    // Hoy sin montar (la sección está comentada en `analitica/page.tsx`); si vuelve, no se pinta con
    // Wallet apagado (§3.9).
    pieza: "app/(app)/analitica/_components/finanzas/cargar-kpis.ts",
    anfitrionas: ["/analitica"],
    modulo: "wallet",
  },
  {
    // Lo montan `NovedadAcciones` (`/novedades`) y `GestionarOrdenPanel` (`/mis-asignaciones/reparto`,
    // vía `RepartoModule`), los dos del núcleo (§3.9).
    pieza: "components/shared/EnviarPlantillaWhatsappButton.tsx",
    anfitrionas: ["/novedades", "/mis-asignaciones/reparto"],
    modulo: "whatsapp",
  },
];
