// Ficha 475 (design §2/§4/§8.3) — DTOs del informe de transito. Colocados junto al modulo (no en
// `lib/types/`, design §0). Sin imports de Prisma en tiempo de ejecucion: el panel importa la
// forma del resultado de la vista previa.
import type { Hito, ZonaInforme } from "@/lib/whatsapp-envios/informes/transito/parametros";
import type { NivelDelPais, Ruta } from "@/lib/utils/ubicacion-presentacion";

export type { ZonaInforme } from "@/lib/whatsapp-envios/informes/transito/parametros";

/** Corte de una zona: entra la orden cuyo hito es ESTRICTAMENTE anterior a `corte` (design §4). */
export interface CorteZona {
  zonaId: string;
  corte: Date;
}

/** Lo que el repositorio necesita para seleccionar. */
export interface ConsultaTransito {
  hito: Hito;
  /** Estados INCLUIDOS (ya validados por el schema). */
  estados: readonly string[];
  /** Una por zona existente. Una orden de una zona sin corte no vuelve. */
  cortes: readonly CorteZona[];
}

/**
 * Una orden en alerta tal como sale de la base. NO trae telefono, direccion, tienda, mensajero ni
 * producto: la consulta no los selecciona (R30 por construccion).
 */
export interface FilaTransito {
  ordenId: string;
  numRemision: string;
  numGuia: number | null;
  /** `order_status.value`. */
  estado: string;
  zonaId: string;
  destinatario: string;
  canton: string;
  distrito: string | null;
  /**
   * SLT-125 (design §4.2; R13, R15) — la ruta del lugar de la orden, del nivel 1 al lugar, con los
   * nombres del catalogo. La celda de lugar del PDF toma de aqui los dos niveles mas hondos
   * (`dosMasHondos`): con solo `canton` y `distrito` un pais de 2 niveles no podria pintar su nivel 1.
   */
  ruta: Ruta;
  /**
   * SLT-125 (R13, R42) — los niveles del pais de la empresa (`nivelesDelCatalogo`). El titulo de la
   * columna de lugar sale de sus tipos: el PDF no escribe ningun nombre de nivel a mano.
   */
  niveles: readonly NivelDelPais[];
  /** `monto_cobrar::text` (`"18500.00"`) o `null`. Nunca `number` (dinero). */
  montoCobrar: string | null;
  hitoAt: Date;
  /** Ultima transicion de estado de la orden; `null` si no tiene historial. */
  ultimaTransicionAt: Date | null;
}

/** Zona tal como la pinta el panel. */
export type ZonaPanel = ZonaInforme;

/**
 * R38/R39 — resultado de `previsualizarInformeTransito`. Con parametros invalidos se devuelven
 * igualmente las zonas para pintar la tabla, y NINGUN conteo.
 */
export type PrevisualizarTransitoResult =
  | { status: "ok"; zonas: ZonaPanel[]; totalEnAlerta: number; parados: number; sinHito: number }
  | { status: "validation_error"; fieldErrors: Record<string, string[]>; zonas: ZonaPanel[] }
  | { status: "unauthenticated" }
  | { status: "forbidden" };
