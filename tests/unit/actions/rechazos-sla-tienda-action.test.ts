import { describe, it, expect, vi } from "vitest";

import { listarRechazosSlaTiendaAction } from "@/lib/actions/rechazos-sla-tienda";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  IRechazosSlaTiendaService,
  ListarRechazosSlaTiendaServiceResult,
} from "@/lib/interfaces/services/IRechazosSlaTiendaService";

// SLT-194 (T4, R955) — el borde de la lista de Rechazos por plazo vencido valida `q` como el `q`
// de `/ordenes`: recortado, entre 3 y 80 caracteres, opcional. Un `q` invalido se queda en el borde
// (`validation_error`) sin llegar al servicio. Literales a mano: 3 y 80 son el contrato del spec.

const ADMIN_TIENDA: Actor = { usuarioId: "tienda-1", rol: "adminTienda" };

const OK: ListarRechazosSlaTiendaServiceResult = {
  status: "ok",
  items: [],
  total: 0,
  page: 1,
  pageSize: 10,
};

function dobleServicio() {
  const listar = vi.fn<IRechazosSlaTiendaService["listar"]>(async () => OK);
  return { service: { listar }, listar };
}

const getActor = async () => ADMIN_TIENDA;

describe("listarRechazosSlaTiendaAction — validacion de q (SLT-194/R955)", () => {
  it("R955: q de 2 caracteres -> validation_error y el servicio sin llamadas", async () => {
    const { service, listar } = dobleServicio();
    const r = await listarRechazosSlaTiendaAction({ page: 1, q: "ab" }, { service, getActor });
    expect(r.status).toBe("validation_error");
    if (r.status !== "validation_error") throw new Error("esperaba validation_error");
    expect(Object.keys(r.fieldErrors)).toContain("q");
    expect(listar).not.toHaveBeenCalled();
  });

  it("R955: q de 81 caracteres -> validation_error y el servicio sin llamadas", async () => {
    const { service, listar } = dobleServicio();
    const r = await listarRechazosSlaTiendaAction({ q: "9".repeat(81) }, { service, getActor });
    expect(r.status).toBe("validation_error");
    expect(listar).not.toHaveBeenCalled();
  });

  it("R955: q de 80 caracteres pasa (el tope es inclusivo, como en /ordenes)", async () => {
    const { service, listar } = dobleServicio();
    const r = await listarRechazosSlaTiendaAction({ q: "9".repeat(80) }, { service, getActor });
    expect(r.status).toBe("ok");
    expect(listar).toHaveBeenCalledTimes(1);
  });

  it("R955: q con espacios alrededor -> el servicio recibe el termino recortado", async () => {
    const { service, listar } = dobleServicio();
    const r = await listarRechazosSlaTiendaAction({ page: 2, q: " 91024 " }, { service, getActor });
    expect(r.status).toBe("ok");
    expect(listar).toHaveBeenCalledWith(
      { page: 2, pageSize: 10, busqueda: { busqueda: "91024" } },
      ADMIN_TIENDA,
    );
  });

  it("R955: q que recortado queda en 2 caracteres -> validation_error (recorta ANTES de medir)", async () => {
    const { service, listar } = dobleServicio();
    const r = await listarRechazosSlaTiendaAction({ q: "  ab  " }, { service, getActor });
    expect(r.status).toBe("validation_error");
    expect(listar).not.toHaveBeenCalled();
  });

  it("R957: sin q, el servicio recibe el input de siempre, sin la clave busqueda", async () => {
    const { service, listar } = dobleServicio();
    await listarRechazosSlaTiendaAction({ page: 3 }, { service, getActor });
    // `toStrictEqual`: una clave `busqueda: undefined` tambien lo pondria en rojo.
    expect(listar.mock.calls).toStrictEqual([[{ page: 3, pageSize: 10 }, ADMIN_TIENDA]]);
    await listarRechazosSlaTiendaAction(undefined, { service, getActor });
    expect(listar.mock.calls[1]).toStrictEqual([{ page: 1, pageSize: 10 }, ADMIN_TIENDA]);
  });

  it("sin sesion -> unauthenticated antes de validar q o tocar el servicio", async () => {
    const { service, listar } = dobleServicio();
    const r = await listarRechazosSlaTiendaAction({ q: "ab" }, { service, getActor: async () => null });
    expect(r.status).toBe("unauthenticated");
    expect(listar).not.toHaveBeenCalled();
  });
});
