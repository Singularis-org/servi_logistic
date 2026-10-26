import type { ModuloApagable } from "@prisma/client";

// SL-23 (design §2; R1, R2) — el catálogo cerrado de módulos apagables. Las claves son las del enum
// de Postgres `modulo_apagable`: el `Record` obliga a nombrar aquí cualquier valor nuevo del enum, así
// que la base y el código no pueden divergir sin que el typecheck lo diga.
//
// Solo `import type`: el `Sidebar` cliente lo importa y no debe arrastrar nada de servidor.

export interface FichaModulo {
  nombre: string;
  descripcion: string;
}

export const MODULOS_APAGABLES: Readonly<Record<ModuloApagable, FichaModulo>> = {
  analitica: {
    nombre: "Analítica",
    descripcion: "Métricas operativas y financieras de la empresa.",
  },
  monitoreo: {
    nombre: "Monitoreo",
    descripcion: "Tablero del día por mensajero.",
  },
  recoleccion: {
    nombre: "Recolección",
    descripcion: "Recolección en tienda por el mensajero.",
  },
  bodegas_satelite: {
    nombre: "Bodegas satélite",
    descripcion: "Recepción en bodega satélite y Mi bodega.",
  },
  wallet: {
    nombre: "Wallet",
    descripcion: "Caja, cuentas de tiendas, mensajeros y satélites, y Mi wallet.",
  },
  ranking: {
    nombre: "Ranking",
    descripcion: "Ranking de mensajeros y su histórico.",
  },
  incidentes_novedades: {
    nombre: "Incidentes y novedades",
    descripcion: "Gestión de incidentes y novedades de las órdenes.",
  },
  whatsapp: {
    nombre: "WhatsApp",
    descripcion: "Chat, plantillas, envíos automáticos e histórico de conversaciones.",
  },
  api_integraciones: {
    nombre: "API e integraciones",
    descripcion: "API keys, webhooks y carga de órdenes por API.",
  },
};

/** El orden de pantalla. Es una tupla aparte para que reordenar no toque el enum ni la base. */
export const ORDEN_MODULOS = [
  "analitica",
  "monitoreo",
  "recoleccion",
  "bodegas_satelite",
  "wallet",
  "ranking",
  "incidentes_novedades",
  "whatsapp",
  "api_integraciones",
] as const satisfies readonly ModuloApagable[];

/**
 * Lo que nunca se apaga, solo para mostrarlo («Núcleo (siempre activo)»). No es una clave de base:
 * no hay fila que encender ni petición que lo acepte (R2). «Cierres» entró al aprobar el spec.
 */
export const NUCLEO = ["Inicio", "Órdenes", "Entregas", "Cierres", "Usuarios", "Tarifas", "Ayuda"] as const;

export function esModuloApagable(valor: string): valor is ModuloApagable {
  return Object.hasOwn(MODULOS_APAGABLES, valor);
}

export function nombreDelModulo(modulo: ModuloApagable): string {
  return MODULOS_APAGABLES[modulo].nombre;
}
