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
  ranking: {
    nombre: "Ranking",
    descripcion: "Ranking de mensajeros y su histórico.",
  },
};

/** El orden de pantalla. Es una tupla aparte para que reordenar no toque el enum ni la base. */
export const ORDEN_MODULOS = [
  "analitica",
  "monitoreo",
  "ranking",
] as const satisfies readonly ModuloApagable[];

/**
 * Lo que nunca se apaga, solo para mostrarlo («Núcleo (siempre activo)»). No es una clave de base:
 * no hay fila que encender ni petición que lo acepte (R2). «Cierres» e «Incidentes y novedades»
 * entraron por decisión del humano del 2026-10-26; «Recolección», «Bodegas satélite», «API e
 * integraciones» y «WhatsApp» (antes apagables) por las del 2026-10-27, y «Wallet» por la del 2026-10-28 (migraciones 20261027120000_modulos_nucleo y
 * 20261028120000_modulo_wallet_nucleo).
 */
export const NUCLEO = [
  "Inicio",
  "Órdenes",
  "Entregas",
  "Recolección",
  "Bodegas satélite",
  "Cierres",
  "Wallet",
  "Incidentes y novedades",
  "Usuarios",
  "Tarifas",
  "API e integraciones",
  "WhatsApp",
  "Ayuda",
] as const;

export function esModuloApagable(valor: string): valor is ModuloApagable {
  return Object.hasOwn(MODULOS_APAGABLES, valor);
}

export function nombreDelModulo(modulo: ModuloApagable): string {
  return MODULOS_APAGABLES[modulo].nombre;
}
