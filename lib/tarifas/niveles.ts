/**
 * SLT-52 (R5, R6, R7) — que nivel ocupa un valor segun las columnas que trae, y si esa combinacion
 * es valida para el actor de su concepto.
 *
 * Es la misma regla que los CHECK `tarifa_valor_niveles_*` de la base, dicha en el service para
 * devolver un `validation_error` sobre el campo culpable en vez de un error crudo de Postgres. Las
 * dos tienen que decir lo mismo: la base es el respaldo (R7: «en el service y en la base»).
 *
 * Modulo PURO, solo imports de TIPO.
 */
import type { TarifaConcepto, TarifaNivel } from "@prisma/client";

import { CATALOGO_CONCEPTOS } from "@/lib/tarifas/catalogo";

export interface ColumnasDeNivel {
  zonaId: string | null;
  grupoId: string | null;
  tiendaId: string | null;
  mensajeroId: string | null;
  vehiculoId: string | null;
}

export type CampoDeNivel = keyof ColumnasDeNivel;

export type NivelResuelto =
  | { ok: true; nivel: TarifaNivel }
  | { ok: false; campo: CampoDeNivel; mensaje: string };

function rechazo(campo: CampoDeNivel, mensaje: string): NivelResuelto {
  return { ok: false, campo, mensaje };
}

/** R5: zona, grupo, tienda en zona, tienda en grupo y tienda en todas sus zonas. */
function nivelDeCobro(c: ColumnasDeNivel): NivelResuelto {
  if (c.mensajeroId !== null) return rechazo("mensajeroId", "Un cobro a la tienda no admite mensajero.");
  if (c.vehiculoId !== null) return rechazo("vehiculoId", "Un cobro a la tienda no admite vehículo.");
  if (c.grupoId !== null && c.zonaId === null) return rechazo("grupoId", "Un grupo necesita su zona.");
  if (c.tiendaId !== null) {
    if (c.zonaId === null) return { ok: true, nivel: "tienda_general" };
    return { ok: true, nivel: c.grupoId === null ? "tienda_zona" : "tienda_grupo" };
  }
  if (c.zonaId === null) return rechazo("zonaId", "El valor necesita una zona o una tienda.");
  return { ok: true, nivel: c.grupoId === null ? "zona" : "grupo" };
}

/**
 * R6: zona y grupo, cada uno para todos los vehiculos o para uno; y solo para el mensajero el valor
 * propio (sin zona, grupo ni vehiculo), que escribe SLT-55.
 */
function nivelDePago(c: ColumnasDeNivel, esDelMensajero: boolean): NivelResuelto {
  if (c.tiendaId !== null) return rechazo("tiendaId", "Un pago no admite tienda.");
  if (c.mensajeroId !== null) {
    if (!esDelMensajero) return rechazo("mensajeroId", "Solo un pago al mensajero admite mensajero.");
    if (c.zonaId !== null || c.grupoId !== null || c.vehiculoId !== null) {
      return rechazo("mensajeroId", "El valor propio del mensajero no lleva zona, grupo ni vehículo.");
    }
    return { ok: true, nivel: "mensajero" };
  }
  if (c.grupoId !== null && c.zonaId === null) return rechazo("grupoId", "Un grupo necesita su zona.");
  if (c.zonaId === null) return rechazo("zonaId", "Un pago necesita una zona.");
  if (c.grupoId !== null) return { ok: true, nivel: c.vehiculoId === null ? "grupo" : "grupo_vehiculo" };
  return { ok: true, nivel: c.vehiculoId === null ? "zona" : "zona_vehiculo" };
}

/** El nivel de un valor de `concepto` con estas columnas, o el campo que lo hace invalido (R7). */
export function nivelDeValor(concepto: TarifaConcepto, columnas: ColumnasDeNivel): NivelResuelto {
  const actor = CATALOGO_CONCEPTOS[concepto].actor;
  if (actor === "tienda") return nivelDeCobro(columnas);
  return nivelDePago(columnas, actor === "mensajero");
}
