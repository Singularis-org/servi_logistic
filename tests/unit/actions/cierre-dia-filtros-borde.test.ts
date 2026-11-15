import { describe, it, expect, vi } from "vitest";
import {
  listarCierresPasadosCompleto,
  listarCierresPasadosPaginado,
} from "@/lib/actions/cierre-dia";
import type { ICierreDiaService } from "@/lib/interfaces/services/ICierreDiaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { MAX_FOLIO_FILTRO } from "@/lib/types/filtros-cierres";

// SLT-138 (R168, R170, R171) — el BORDE del bloque `filtros` de «Cierres solicitados» del
// mensajero, en sus dos acciones: la página y el archivo aceptan el MISMO bloque, y todo lo que no
// es de él muere con `validation_error` sin llegar al servicio (sin leer la base).

const MENSAJERO: Actor = { usuarioId: "m-a", rol: "mensajero" };
const UUID = "22222222-2222-4222-8222-222222222222";

function fakeService() {
  const paginado = vi.fn().mockResolvedValue({
    status: "ok",
    items: [],
    page: 1,
    pageSize: 25,
    total: 0,
  });
  const completo = vi.fn().mockResolvedValue({ status: "ok", items: [], total: 0 });
  return {
    service: {
      listarCierresPasadosPaginado: paginado,
      listarCierresPasadosCompleto: completo,
    } as unknown as ICierreDiaService,
    paginado,
    completo,
  };
}

type Accion = "pagina" | "archivo";

async function llamar(accion: Accion, input: Record<string, unknown>) {
  const f = fakeService();
  const deps = { service: f.service, getActor: async () => MENSAJERO };
  const r =
    accion === "pagina"
      ? await listarCierresPasadosPaginado({ page: 1, pageSize: 25, ...input }, deps)
      : await listarCierresPasadosCompleto(input, deps);
  return { r, llamado: accion === "pagina" ? f.paginado : f.completo };
}

const ACCIONES: Accion[] = ["pagina", "archivo"];

describe("SLT-138 — borde de los filtros de «Cierres solicitados» del mensajero", () => {
  const invalidos: Array<[string, Record<string, unknown>]> = [
    ["mensajeroId fuera del bloque (R168)", { mensajeroId: UUID }],
    ["mensajeroIds dentro del bloque (R168)", { filtros: { mensajeroIds: [UUID] } }],
    ["destinoZonaIds dentro del bloque (R168)", { filtros: { destinoZonaIds: [UUID] } }],
    ["mensajeroId dentro del bloque (R168)", { filtros: { mensajeroId: UUID } }],
    ["clave cualquiera dentro del bloque (R168)", { filtros: { otra: 1 } }],
    ["desde > hasta (R168)", { filtros: { desde: "2026-11-05", hasta: "2026-11-04" } }],
    ["estados vacío (R170)", { filtros: { estados: [] } }],
    ["estado que no es de cierre (R170)", { filtros: { estados: ["consolidado"] } }],
    ["folio de 21 caracteres (R171)", { filtros: { folio: "A".repeat(MAX_FOLIO_FILTRO + 1) } }],
  ];

  for (const accion of ACCIONES) {
    for (const [nombre, input] of invalidos) {
      it(`${accion}: ${nombre} → validation_error sin llamar al servicio`, async () => {
        const { r, llamado } = await llamar(accion, input);
        expect(r.status).toBe("validation_error");
        expect(llamado).not.toHaveBeenCalled();
      });
    }
  }

  it("el tope del folio es 20: con 20 caracteres pasa en las dos acciones (R171)", async () => {
    expect(MAX_FOLIO_FILTRO).toBe(20);
    const filtros = { folio: "A".repeat(20) };
    for (const accion of ACCIONES) {
      const { r, llamado } = await llamar(accion, { filtros });
      expect(r.status, accion).toBe("ok");
      expect(llamado, accion).toHaveBeenCalledTimes(1);
    }
  });

  it("el MISMO bloque válido entra en las dos acciones y llega entero al servicio (R168)", async () => {
    const filtros = {
      desde: "2026-11-03",
      hasta: "2026-11-04",
      estados: ["aprobado", "rechazado"],
      folio: " #3f2a ",
    };

    const pagina = await llamar("pagina", { filtros });
    expect(pagina.r.status).toBe("ok");
    expect(pagina.llamado).toHaveBeenCalledWith({ page: 1, pageSize: 25, filtros }, MENSAJERO);

    const archivo = await llamar("archivo", { filtros });
    expect(archivo.r.status).toBe("ok");
    expect(archivo.llamado).toHaveBeenCalledWith(MENSAJERO, filtros);
  });

  it("sin filtros, la página no lleva la clave y el archivo se llama solo con el actor (R173)", async () => {
    const pagina = await llamar("pagina", {});
    expect(pagina.llamado).toHaveBeenCalledWith({ page: 1, pageSize: 25 }, MENSAJERO);

    const archivo = await llamar("archivo", {});
    expect(archivo.llamado.mock.calls[0]).toEqual([MENSAJERO]);
  });
});
