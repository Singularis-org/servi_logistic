import { describe, it, expect, vi } from "vitest";
import { DevolucionTiendaService, clasificarOrden } from "@/lib/services/DevolucionTiendaService";
import {
  SinTransicionesError,
  type IDevolucionTiendaRepository,
  type OrdenParaReporte,
} from "@/lib/interfaces/repositories/IDevolucionTiendaRepository";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { RolValue } from "@prisma/client";

// FICHA 419 — unit de `DevolucionTiendaService` con dobles (repo, storage, firmador). Lo que vive
// en el SQL (WHERE del UPDATE, reversion, historial, webhook, dinero) se prueba contra Postgres en
// `tests/integration/db/419/`: estos dobles no ven el SQL.

const TIENDA = "11111111-1111-4111-8111-111111111111";
const O1 = "22222222-2222-4222-8222-222222222221";
const O2 = "22222222-2222-4222-8222-222222222222";
const RUTA_R23 = /^devolucion-tienda\/[0-9a-f-]{36}\.(jpg|png|webp)$/;

const actor = (rol: RolValue): Actor => ({ usuarioId: `u-${rol}`, rol });
const jpg = (n = 3) => ({ contentType: "image/jpeg", bytes: new Uint8Array(n) });
const png = () => ({ contentType: "image/png", bytes: new Uint8Array(3) });

function fila(over: Partial<OrdenParaReporte> = {}): OrdenParaReporte {
  return {
    id: O1,
    numGuia: 101,
    tiendaId: TIENDA,
    deletedAt: null,
    estatusValue: "devolviendo_a_tienda",
    ...over,
  };
}

function montar(over: Partial<IDevolucionTiendaRepository> = {}, storageOver: Partial<IFileStorage> = {}) {
  const repo: IDevolucionTiendaRepository = {
    findEstatusIdByValue: vi.fn(async (v: string) => `id-${v}`),
    esTienda: vi.fn(async () => true),
    confirmarEntregaLote: vi.fn(async (i) => ({ comprobanteId: "c1", transicionadas: i.ordenIds })),
    findOrdenesParaReporte: vi.fn(async (ids: string[]) => ids.map((id, k) => fila({ id, numGuia: 100 + k }))),
    findComprobanteDeOrden: vi.fn(async () => null),
    ...over,
  };
  const subidos: string[] = [];
  const storage: IFileStorage = {
    upload: vi.fn(async (input) => {
      subidos.push(input.path);
      return input.path;
    }),
    remove: vi.fn(async () => {}),
    ...storageOver,
  };
  const urls: ISignedUrlProvider = {
    createSignedUrl: vi.fn(async (p: string) => `https://firmada/${p}`),
    createSignedUrls: vi.fn(async (ps: string[]) => Object.fromEntries(ps.map((p) => [p, `https://firmada/${p}`]))),
  };
  const service = new DevolucionTiendaService(repo, storage, urls, {
    maxFileBytes: 5 * 1024 * 1024,
    maxEvidencias: 3,
    signedUrlTtlSeconds: 300,
  });
  return { repo, storage, urls, service, subidos };
}

const lote = (over: Partial<{ tiendaId: string; ordenIds: string[]; evidencias: ReturnType<typeof jpg>[] }> = {}) => ({
  tiendaId: TIENDA,
  ordenIds: [O1, O2],
  evidencias: [jpg()],
  ...over,
});

describe("R1/R2 — autorizacion", () => {
  it.each(["maestro", "admin"] as const)("R1: %s ejecuta el lote", async (rol) => {
    const m = montar();
    const r = await m.service.confirmarEntrega(lote(), actor(rol));
    expect(r.status).toBe("ok");
    expect(m.repo.confirmarEntregaLote).toHaveBeenCalledTimes(1);
    expect(vi.mocked(m.repo.confirmarEntregaLote).mock.calls[0][0].subidoPor).toBe(`u-${rol}`);
  });

  it.each(["adminSatelite", "adminTienda", "mensajero", "apiKey"] as const)(
    "R2: %s -> forbidden sin leer, sin subir y sin escribir",
    async (rol) => {
      const m = montar();
      const r = await m.service.confirmarEntrega(lote(), actor(rol));
      expect(r).toEqual({ status: "forbidden" });
      for (const fn of Object.values(m.repo)) expect(fn).not.toHaveBeenCalled();
      expect(m.storage.upload).not.toHaveBeenCalled();
      expect(m.storage.remove).not.toHaveBeenCalled();
    },
  );
});

describe("R3/R4/R5 — validacion en el servicio, sin subir ni escribir", () => {
  const casos: [string, ReturnType<typeof lote>, string][] = [
    ["R3: sin archivos", lote({ evidencias: [] }), "evidencias"],
    ["R4: tipo no admitido", lote({ evidencias: [{ contentType: "application/pdf", bytes: new Uint8Array(3) }] }), "evidencias"],
    ["R4: archivo vacio", lote({ evidencias: [jpg(0)] }), "evidencias"],
    ["R4: supera 5 MB", lote({ evidencias: [jpg(5 * 1024 * 1024 + 1)] }), "evidencias"],
    ["R4: mas de 3 archivos", lote({ evidencias: [jpg(), jpg(), jpg(), jpg()] }), "evidencias"],
    ["R5: sin ordenes", lote({ ordenIds: [] }), "ordenIds"],
    ["R5: supera el tope", lote({ ordenIds: Array.from({ length: 301 }, (_, i) => `o-${i}`) }), "ordenIds"],
    ["R5: sin tienda", lote({ tiendaId: "" }), "tiendaId"],
  ];
  it.each(casos)("%s -> validation_error", async (_n, input, campo) => {
    const m = montar();
    const r = await m.service.confirmarEntrega(input, actor("admin"));
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toContain(campo);
    expect(m.storage.upload).not.toHaveBeenCalled();
    expect(m.repo.confirmarEntregaLote).not.toHaveBeenCalled();
  });

  it("tienda del lote inexistente o que no es tienda -> validation_error en tiendaId", async () => {
    const m = montar({ esTienda: vi.fn(async () => false) });
    const r = await m.service.confirmarEntrega(lote(), actor("admin"));
    expect(r).toEqual({ status: "validation_error", fieldErrors: { tiendaId: ["la tienda del lote no existe"] } });
    expect(m.storage.upload).not.toHaveBeenCalled();
  });

  it("catalogo sin los estados -> validation_error, sin subir", async () => {
    const m = montar({ findEstatusIdByValue: vi.fn(async () => null) });
    const r = await m.service.confirmarEntrega(lote(), actor("admin"));
    expect(r.status).toBe("validation_error");
    expect(m.storage.upload).not.toHaveBeenCalled();
  });
});

describe("R6/R7 — el lote y el reporte por orden", () => {
  it("pasa los ids deduplicados, los dos estados y los archivos subidos al repo", async () => {
    const m = montar();
    const r = await m.service.confirmarEntrega(
      lote({ ordenIds: [O1, O2, O1], evidencias: [jpg(), png()] }),
      actor("maestro"),
    );
    const arg = vi.mocked(m.repo.confirmarEntregaLote).mock.calls[0][0];
    expect(arg.ordenIds).toEqual([O1, O2]);
    expect(arg.tiendaId).toBe(TIENDA);
    expect(arg.origenEstatusId).toBe("id-devolviendo_a_tienda");
    expect(arg.destinoEstatusId).toBe("id-devuelta_a_tienda");
    expect(arg.evidencias.map((e) => [e.indice, e.contentType])).toEqual([
      [0, "image/jpeg"],
      [1, "image/png"],
    ]);
    expect(r).toEqual({
      status: "ok",
      devueltas: 2,
      desenlaces: [
        { ordenId: O1, numGuia: 100, desenlace: "devuelta_a_tienda" },
        { ordenId: O2, numGuia: 101, desenlace: "devuelta_a_tienda" },
      ],
    });
  });

  it("clasificarOrden: los cinco desenlaces", () => {
    const hechas = new Set([O1]);
    expect(clasificarOrden(O1, fila({ estatusValue: "devuelta_a_tienda" }), TIENDA, hechas).desenlace).toBe("devuelta_a_tienda");
    expect(clasificarOrden(O2, undefined, TIENDA, hechas)).toEqual({ ordenId: O2, numGuia: null, desenlace: "no_encontrada" });
    expect(clasificarOrden(O2, fila({ id: O2, deletedAt: new Date() }), TIENDA, hechas)).toEqual({
      ordenId: O2,
      numGuia: null,
      desenlace: "no_encontrada",
    });
    expect(clasificarOrden(O2, fila({ id: O2, tiendaId: "otra" }), TIENDA, hechas).desenlace).toBe("tienda_distinta");
    expect(clasificarOrden(O2, fila({ id: O2, estatusValue: "devuelta_a_tienda" }), TIENDA, hechas).desenlace).toBe(
      "ya_devuelta",
    );
    expect(clasificarOrden(O2, fila({ id: O2, estatusValue: "en_reparto" }), TIENDA, hechas)).toEqual({
      ordenId: O2,
      numGuia: 101,
      desenlace: "estado_invalido",
      estado: "en_reparto",
    });
    // R7: una orden que sigue en `devolviendo_a_tienda` y NO transiciono (perdio la carrera) no es `devuelta`.
    expect(clasificarOrden(O2, fila({ id: O2 }), TIENDA, hechas).desenlace).toBe("estado_invalido");
  });
});

describe("R11/R12/R13 — compensacion de archivos", () => {
  it("R11: ninguna transiciona -> ninguna_devuelta con reporte y se retiran EXACTAMENTE los subidos", async () => {
    const m = montar({
      confirmarEntregaLote: vi.fn(async () => {
        throw new SinTransicionesError();
      }),
      findOrdenesParaReporte: vi.fn(async () => [fila({ estatusValue: "devuelta_a_tienda" })]),
    });
    const r = await m.service.confirmarEntrega(lote({ ordenIds: [O1], evidencias: [jpg(), png()] }), actor("admin"));
    expect(r).toEqual({
      status: "ninguna_devuelta",
      desenlaces: [{ ordenId: O1, numGuia: 101, desenlace: "ya_devuelta" }],
    });
    expect(m.subidos).toHaveLength(2);
    expect(m.storage.remove).toHaveBeenCalledTimes(1);
    expect(m.storage.remove).toHaveBeenCalledWith(m.subidos);
  });

  it("R12: falla la 2a subida -> comprobante_no_guardado, se retira la 1a y no se escribe", async () => {
    let n = 0;
    const m = montar(
      {},
      {
        upload: vi.fn(async (input) => {
          n += 1;
          if (n === 2) throw new Error("storage caido");
          return input.path;
        }),
      },
    );
    const r = await m.service.confirmarEntrega(lote({ evidencias: [jpg(), png(), jpg()] }), actor("admin"));
    expect(r).toEqual({ status: "comprobante_no_guardado" });
    const primera = vi.mocked(m.storage.upload).mock.calls[0][0].path;
    expect(m.storage.remove).toHaveBeenCalledWith([primera]);
    expect(m.repo.confirmarEntregaLote).not.toHaveBeenCalled();
  });

  it("R12: falla la 1a subida -> no se llama a remove (nada que retirar)", async () => {
    const m = montar({}, { upload: vi.fn(async () => Promise.reject(new Error("caido"))) });
    const r = await m.service.confirmarEntrega(lote(), actor("admin"));
    expect(r).toEqual({ status: "comprobante_no_guardado" });
    expect(m.storage.remove).not.toHaveBeenCalled();
  });

  it("R13: la escritura falla -> se retiran los subidos y el error se propaga", async () => {
    const boom = new Error("db caida");
    const m = montar({
      confirmarEntregaLote: vi.fn(async () => {
        throw boom;
      }),
    });
    await expect(m.service.confirmarEntrega(lote({ evidencias: [jpg(), png()] }), actor("admin"))).rejects.toBe(boom);
    expect(m.storage.remove).toHaveBeenCalledWith(m.subidos);
    expect(m.repo.findOrdenesParaReporte).not.toHaveBeenCalled();
  });
});

describe("R23 — la ruta del objeto no lleva ids y nunca sale al cliente", () => {
  it("cada ruta es devolucion-tienda/<uuid>.<ext> y no contiene tienda, orden ni usuario", async () => {
    const m = montar();
    const r = await m.service.confirmarEntrega(lote({ evidencias: [jpg(), png()] }), actor("admin"));
    expect(m.subidos).toHaveLength(2);
    for (const p of m.subidos) {
      expect(p).toMatch(RUTA_R23);
      for (const id of [TIENDA, O1, O2, "u-admin"]) expect(p).not.toContain(id);
    }
    expect(m.subidos[0]).not.toBe(m.subidos[1]);
    const texto = JSON.stringify(r);
    for (const p of m.subidos) expect(texto).not.toContain(p);
    expect(texto).not.toContain("storagePath");
  });

  it("verComprobante: devuelve URLs firmadas, nunca la ruta interna", async () => {
    const ruta = "devolucion-tienda/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg";
    const m = montar({
      findComprobanteDeOrden: vi.fn(async () => ({
        createdAt: new Date("2026-10-21T15:00:00.000Z"),
        subidoPorNombre: "Ana",
        evidencias: [{ storagePath: ruta, contentType: "image/jpeg", indice: 0 }],
      })),
    });
    const r = await m.service.verComprobante(O1, actor("maestro"));
    expect(r).toEqual({
      status: "ok",
      confirmadoAt: "2026-10-21T15:00:00.000Z",
      confirmadoPor: "Ana",
      archivos: [{ url: `https://firmada/${ruta}`, contentType: "image/jpeg", indice: 0 }],
    });
    expect(m.urls.createSignedUrls).toHaveBeenCalledWith([ruta], 300);
    expect(JSON.stringify(r)).not.toContain('"storagePath"');
  });
});

describe("R22 — ver el comprobante: solo maestro/admin, sin revelar existencia", () => {
  it.each(["adminSatelite", "adminTienda", "mensajero", "apiKey"] as const)(
    "%s recibe no_encontrado sin consultar el repo",
    async (rol) => {
      const m = montar();
      const r = await m.service.verComprobante(O1, actor(rol));
      expect(r).toEqual({ status: "no_encontrado" });
      expect(m.repo.findComprobanteDeOrden).not.toHaveBeenCalled();
      expect(m.urls.createSignedUrls).not.toHaveBeenCalled();
    },
  );

  it("orden sin comprobante -> el MISMO no_encontrado", async () => {
    const m = montar();
    expect(await m.service.verComprobante(O1, actor("admin"))).toEqual({ status: "no_encontrado" });
  });
});
