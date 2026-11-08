import type {
  TarifaVigente,
  TarifaVigenteResuelta,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { PagoTarifa } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import { vi } from "vitest";
import type { ContextoPagoGestion, TarifaPago, TarifaTienda } from "@/lib/types/tarifa-flexible";

/**
 * SLT-52 (design §5) — los dobles del resolver de tarifas devuelven `TarifaTienda`. Los tests de
 * antes de la ficha describen empresas en el modelo VIEJO: su tarifa va envuelta tal cual, sin
 * tocar un importe (R36). `null` sigue siendo «sin tarifa».
 */
export function tarifaVieja(t: TarifaVigenteResuelta): TarifaTienda;
export function tarifaVieja(t: TarifaVigenteResuelta | null): TarifaTienda | null;
export function tarifaVieja(t: TarifaVigenteResuelta | null): TarifaTienda | null {
  return t === null ? null : { modelo: "viejo", tarifa: t };
}

/**
 * Para los dobles que solo sembraban los campos de la FORMULA (`TarifaVigente`): el resolver real
 * devuelve ademas `tarifaId` y `fulfillment`, que la formula no lee. `fulfillment: "0.00"` es la
 * tienda sin fulfillment, el mismo valor que normaliza el resolver para una fila sin monto.
 */
export function tarifaViejaDeFormula(t: TarifaVigente | null): TarifaTienda | null {
  return t === null ? null : tarifaVieja({ ...t, tarifaId: "tarifa-doble", fulfillment: "0.00" });
}

/**
 * Para los dobles de PRISMA que alimentan al `TarifaVigenteRepository` real: el resolver unico
 * pregunta primero si la empresa esta activada (`tarifaActivacion.findFirst`, SLT-54 R1). Este
 * delegado responde «no», asi que el resto de la resolucion es la cascada vieja que esos tests ya
 * describen (R36).
 */
export function empresaSinActivar() {
  return { tarifaActivacion: { findFirst: async () => null } };
}

/** El Map del lote de un doble, con cada tarifa envuelta en el modelo viejo. */
export function mapaViejo(
  m: ReadonlyMap<string, TarifaVigenteResuelta | null>,
): Map<string, TarifaTienda | null> {
  const out = new Map<string, TarifaTienda | null>();
  for (const [clave, t] of m) out.set(clave, tarifaVieja(t));
  return out;
}

/**
 * SLT-52 (T5.1) — `derivarPagos` / `derivarIngresoBodega` reciben el pago POR GESTION
 * (`Map<gestionId, TarifaPago | null>`), que es lo que devuelve el resolver. Los tests de antes de la
 * ficha describen una sola `PagoTarifa` del modelo viejo para todo el lote: esto la reparte a cada
 * gestion, envuelta tal cual (R36). `null` sigue siendo la zona sin tarifa.
 */
export function pagoViejoPorGestion(
  gestiones: readonly { gestionId: string }[],
  tarifa: PagoTarifa | null,
): Map<string, TarifaPago | null> {
  return new Map(
    gestiones.map((g) => [
      g.gestionId,
      tarifa === null ? null : ({ modelo: "viejo", tarifa } as const),
    ]),
  );
}

type ResolvePagoTarifaDoble = (zonaId: string, vehiculoId: string | null) => Promise<PagoTarifa | null>;

/**
 * SLT-52 (T5.1) — el `resolvePagos` de un doble de `ITarifaZonaMensajeroRepository` para una empresa
 * en el modelo VIEJO: hace lo mismo que el resolver real en esa rama (`pagosViejos`), una consulta
 * por par (zona, vehiculo) DISTINTO al `resolvePagoTarifa` del propio doble, y envuelve el resultado.
 * Asi los tests de antes de la ficha siguen afirmando con que zona y vehiculo se resuelve (39/R4) y
 * con que importes, sin tocar un literal. Lee `resolvePagoTarifa` en cada llamada: un
 * `mockResolvedValue` posterior del test se respeta.
 */
export function conResolvePagosViejo<T extends { resolvePagoTarifa: ResolvePagoTarifaDoble }>(
  repo: T,
): T & {
  resolvePagos: (ctxs: readonly ContextoPagoGestion[]) => Promise<Map<string, TarifaPago | null>>;
} {
  const resolvePagos = vi.fn(async (ctxs: readonly ContextoPagoGestion[]) => {
    const porPar = new Map<string, TarifaPago | null>();
    const out = new Map<string, TarifaPago | null>();
    for (const c of ctxs) {
      const clave = `${c.zonaId}|${c.vehiculoId ?? ""}`;
      if (!porPar.has(clave)) {
        const t = await repo.resolvePagoTarifa(c.zonaId, c.vehiculoId);
        porPar.set(clave, t === null ? null : { modelo: "viejo", tarifa: t });
      }
      out.set(c.gestionId, porPar.get(clave) ?? null);
    }
    return out;
  });
  return Object.assign(repo, { resolvePagos });
}
