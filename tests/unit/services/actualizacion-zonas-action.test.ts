import { describe, it, expect, vi } from "vitest";

import { actualizarZonas, vistaPreviaActualizacionZonas } from "@/lib/actions/actualizacion-zonas";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IActualizacionZonasService } from "@/lib/interfaces/services/IActualizacionZonasService";
import { agruparVistaPrevia, motivoDeSaltada } from "@/lib/services/ActualizacionZonasService";
import type { FilaZonaErrada } from "@/lib/types/actualizacion-zonas";

// SLT-224 (design §3b, §7.4, R1714) — las dos Server Actions de «Actualizar zonas», con dobles.
//
// Lo que se afirma: sin sesion, `unauthenticated`; con un rol que no es maestro ni admin,
// `forbidden`; en los dos casos SIN llamar al servicio (ni leer ni escribir ordenes). Con maestro y
// admin, el servicio se llama una vez. Y la clasificacion pura de las saltadas, con su precedencia.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro", zonaId: null };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin", zonaId: null };
const SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite", zonaId: "z-sat" };
const TIENDA: Actor = { usuarioId: "u-tienda", rol: "adminTienda", zonaId: null };
const MENSAJERO: Actor = { usuarioId: "u-men", rol: "mensajero", zonaId: "z-sat" };

function servicioDoble() {
  return {
    vistaPrevia: vi.fn<IActualizacionZonasService["vistaPrevia"]>(async () => ({ grupos: [], total: 0, saltadas: [] })),
    actualizar: vi.fn<IActualizacionZonasService["actualizar"]>(async () => ({ actualizadas: 0, saltadas: [] })),
  };
}

describe("SLT-224/R1714 — solo maestro y admin, validado en el servidor", () => {
  it("sin sesion: las dos acciones devuelven `unauthenticated` sin llamar al servicio", async () => {
    const service = servicioDoble();
    const deps = { service, getActor: async () => null };
    expect(await vistaPreviaActualizacionZonas(deps)).toEqual({ status: "unauthenticated" });
    expect(await actualizarZonas(deps)).toEqual({ status: "unauthenticated" });
    expect(service.vistaPrevia).not.toHaveBeenCalled();
    expect(service.actualizar).not.toHaveBeenCalled();
  });

  it.each([
    ["adminSatelite", SATELITE],
    ["adminTienda", TIENDA],
    ["mensajero", MENSAJERO],
  ] as const)("%s: las dos acciones devuelven `forbidden` sin llamar al servicio", async (_rol, actor) => {
    const service = servicioDoble();
    const deps = { service, getActor: async () => actor };
    expect(await vistaPreviaActualizacionZonas(deps)).toEqual({ status: "forbidden" });
    expect(await actualizarZonas(deps)).toEqual({ status: "forbidden" });
    expect(service.vistaPrevia).not.toHaveBeenCalled();
    expect(service.actualizar).not.toHaveBeenCalled();
  });

  it.each([
    ["maestro", MAESTRO],
    ["admin", ADMIN],
  ] as const)("%s: llama al servicio una vez y devuelve `ok`; la actualizacion lleva al actor", async (_rol, actor) => {
    const service = servicioDoble();
    const deps = { service, getActor: async () => actor };
    expect(await vistaPreviaActualizacionZonas(deps)).toEqual({
      status: "ok",
      vistaPrevia: { grupos: [], total: 0, saltadas: [] },
    });
    expect(await actualizarZonas(deps)).toEqual({ status: "ok", resultado: { actualizadas: 0, saltadas: [] } });
    expect(service.vistaPrevia).toHaveBeenCalledTimes(1);
    expect(service.actualizar).toHaveBeenCalledTimes(1);
    expect(service.actualizar).toHaveBeenCalledWith(actor);
  });
});

function fila(o: Partial<FilaZonaErrada>): FilaZonaErrada {
  return {
    ordenId: "o",
    distritoId: "d",
    guia: "1",
    estado: "en_bodega_central",
    zonaActual: "A",
    zonaNueva: "C",
    conCierre: false,
    conGestion: false,
    ...o,
  };
}

describe("SLT-224/R1715 — la clasificacion de las saltadas (funcion pura)", () => {
  it("una orden elegible no se salta", () => {
    expect(motivoDeSaltada(fila({ estado: "en_bodega_central" }))).toBeNull();
    expect(motivoDeSaltada(fila({ estado: "en_ruta_bodega_satelite" }))).toBeNull();
  });

  it("precedencia: estante antes que cierre; devolucion antes que cierre", () => {
    expect(motivoDeSaltada(fila({ estado: "en_bodega_satelite", conCierre: true }))).toBe("estante_satelite");
    expect(motivoDeSaltada(fila({ estado: "por_devolver_a_tienda", conGestion: true }))).toBe("devolucion");
    expect(motivoDeSaltada(fila({ estado: "en_reparto", conGestion: true }))).toBe("cierre_o_dinero");
    expect(motivoDeSaltada(fila({ estado: "entregado", conCierre: true }))).toBe("cierre_o_dinero");
  });

  it("los seis estados de devolucion se saltan como devolucion", () => {
    for (const estado of [
      "por_devolver_a_bodega_central",
      "devolviendo_a_bodega_central",
      "novedad",
      "por_devolver_a_tienda",
      "devolviendo_a_tienda",
      "devuelta_a_tienda",
    ] as const) {
      expect(motivoDeSaltada(fila({ estado }))).toBe("devolucion");
    }
  });

  it("la vista previa agrupa por zona actual -> nueva y separa las saltadas", () => {
    const vp = agruparVistaPrevia([
      fila({ guia: "1", zonaActual: "A", zonaNueva: "C" }),
      fila({ guia: "2", zonaActual: "A", zonaNueva: "C" }),
      fila({ guia: "3", zonaActual: "B", zonaNueva: "C" }),
      fila({ guia: "4", estado: "en_bodega_satelite" }),
    ]);
    expect(vp).toEqual({
      grupos: [
        { zonaActual: "A", zonaNueva: "C", cantidad: 2 },
        { zonaActual: "B", zonaNueva: "C", cantidad: 1 },
      ],
      total: 3,
      saltadas: [{ guia: "4", motivo: "estante_satelite" }],
    });
  });
});
