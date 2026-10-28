import { describe, it, expect, vi } from "vitest";
import { EtiquetaGuiaService } from "@/lib/services/EtiquetaGuiaService";
import type { EtiquetaRow, IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const ADMIN_TIENDA: Actor = { usuarioId: "u-tienda", rol: "adminTienda" };
const MENSAJERO: Actor = { usuarioId: "u-msg", rol: "mensajero" };
const ADMIN_SATELITE: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };

// Fila de etiqueta con guia asignada por defecto (nombres resueltos). Los tests
// sobreescriben lo que necesiten.
function etiquetaRow(overrides: Partial<EtiquetaRow> = {}): EtiquetaRow {
  return {
    id: "o1",
    tiendaId: "tienda-1",
    numGuia: 501,
    numRemision: "REM-1",
    destinatario: "Juan Perez",
    telefonoDest: "0999999999",
    direccion: "Av. Siempre Viva 742",
    producto: "Caja x2",
    montoCobrar: 25.5,
    tiendaNombre: "Tienda Uno",
    zonaNombre: "GAM",
    provinciaNombre: "San Jose",
    cantonNombre: "Central",
    distritoNombre: "Carmen",
    fechaCreacion: "2026-08-25", // feature 295: ya serializada por el repo (YYYY-MM-DD de CR)
    ...overrides,
  };
}

// Stub de IOrdenRepository: solo `findEtiquetasByIds` / `findEtiquetaByNumGuia` se
// ejercitan; el resto son stubs que fallarian si se invocan (patron
// guia-asignacion-service.test.ts).
function fakeRepo(rows: EtiquetaRow[] = [etiquetaRow()]): IOrdenRepository {
  return {
    create: vi.fn(),
    findById: vi.fn(),
    list: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    existsEstatus: vi.fn(),
    findEstatusIdByValue: vi.fn(),
    findUsuarioFulfillment: vi.fn(),
    existsGeo: vi.fn(),
    findExistingRemisiones: vi.fn(),
    findAllProvincias: vi.fn(),
    findCantonesByProvinciaIds: vi.fn(),
    findDistritosByCantonIds: vi.fn(),
    createManyOrdenes: vi.fn(),
    findByIdsForTransicion: vi.fn(),
    findByNumGuiaForTransicion: vi.fn(),
    findMensajeroIdsValidos: vi.fn(),
    findAllMensajeros: vi.fn(),
    listOrderStatus: vi.fn(),
    generarGuiaLote: vi.fn(),
    asignarBodegaLote: vi.fn(),
    findMensajerosByZona: vi.fn(),
    findMensajeroIdsConVehiculo: vi.fn(async (ids: string[]) => new Set(ids)),
    findMensajeroIdsValidosByZona: vi.fn(),
    rutearBodegaSateliteLote: vi.fn(),
    // Feature 32: filtra por ids solicitados (simula el `where id in` del repo).
    // SLT-49: simula tambien el `tienda_id` del `where` (string -> solo esa tienda; null -> sin
    // frontera). El `vi.fn` registra con que `tiendaId` se le llamo.
    findEtiquetasByIds: vi.fn(async (ids: string[], tiendaId: string | null) =>
      rows.filter((r) => ids.includes(r.id) && (tiendaId === null || r.tiendaId === tiendaId)),
    ),
    // QR por guia: simula el `where num_guia = ? and deleted_at is null` (UNIQUE) + SLT-49 dueño.
    findEtiquetaByNumGuia: vi.fn(
      async (numGuia: number, tiendaId: string | null) =>
        rows.find(
          (r) => r.numGuia === numGuia && (tiendaId === null || r.tiendaId === tiendaId),
        ) ?? null,
    ),
  } as unknown as IOrdenRepository;
}

/**
 * SLT-49 — doble que IGNORA el `tiendaId` (como un repo al que se le cayo el filtro del
 * `where`). Sirve para probar la SEGUNDA capa del service (`esVisiblePara`).
 */
function repoQueIgnoraTienda(rows: EtiquetaRow[]): IOrdenRepository {
  return {
    findEtiquetasByIds: vi.fn(async (ids: string[]) => rows.filter((r) => ids.includes(r.id))),
    findEtiquetaByNumGuia: vi.fn(
      async (numGuia: number) => rows.find((r) => r.numGuia === numGuia) ?? null,
    ),
  } as unknown as IOrdenRepository;
}

// SLT-49 — CAMBIO DE CONTRATO EXPLICITO. Hasta la SLT-49 este bloque afirmaba «cualquier rol
// (admin/adminTienda/mensajero/maestro) genera etiqueta» con una orden de `tienda-1` y el actor
// `u-tienda`. Desde la SLT-49 eso deja de ser cierto para `adminTienda`: solo ve lo suyo (bloque
// propio, abajo). Aqui quedan maestro/admin (R11) y mensajero (R12).
describe("EtiquetaGuiaService — autorizacion (roles sin frontera de tienda)", () => {
  it("R11/R12: maestro/admin/mensajero generan la etiqueta de cualquier tienda, sin forbidden", async () => {
    const repo = fakeRepo();
    const service = new EtiquetaGuiaService(repo);

    for (const actor of [ADMIN, MENSAJERO, MAESTRO]) {
      const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, actor);
      expect(r.status).toBe("ok");
      if (r.status !== "ok") throw new Error("unreachable");
      expect(r.etiquetas).toHaveLength(1);
    }
    expect(repo.findEtiquetasByIds).toHaveBeenCalled();
  });
});

// Feature 136 — aislamiento entre tiendas para el canal de integracion. Hasta la
// 136 la garantia descansaba SOLO en el borde (los ids salian del summary de la
// propia carga); estos tests la fijan en el service, que es donde vive la autz.
describe("EtiquetaGuiaService — aislamiento por dueño del rol apiKey (feature 136)", () => {
  const KEY_TIENDA_1: Actor = { usuarioId: "tienda-1", rol: "apiKey" };
  const KEY_TIENDA_2: Actor = { usuarioId: "tienda-2", rol: "apiKey" };

  it("una API key NO obtiene la etiqueta de una orden de otra tienda", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", tiendaId: "tienda-1" })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, KEY_TIENDA_2);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas).toEqual([]);
    // Se reporta igual que una orden inexistente: no revela que la orden existe.
    expect(r.omitidas).toEqual([{ ordenId: "o1", motivo: "no_encontrada" }]);
  });

  it("una API key SI obtiene la etiqueta de sus propias ordenes", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", tiendaId: "tienda-1" })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, KEY_TIENDA_1);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas).toHaveLength(1);
    expect(r.etiquetas[0].ordenId).toBe("o1");
    expect(r.omitidas).toEqual([]);
  });

  it("en un lote mixto, la API key solo recibe las etiquetas de su tienda", async () => {
    const repo = fakeRepo([
      etiquetaRow({ id: "propia", tiendaId: "tienda-1", numGuia: 11 }),
      etiquetaRow({ id: "ajena", tiendaId: "tienda-2", numGuia: 22 }),
    ]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["propia", "ajena"] }, KEY_TIENDA_1);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas).toHaveLength(1);
    expect(r.etiquetas[0].ordenId).toBe("propia");
    expect(r.etiquetas.map((e) => e.numGuia)).not.toContain(22);
    expect(r.omitidas).toEqual([{ ordenId: "ajena", motivo: "no_encontrada" }]);
  });

  it("la ruta por num_guia tampoco expone la orden de otra tienda a una API key", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", tiendaId: "tienda-1", numGuia: 501 })]);
    const service = new EtiquetaGuiaService(repo);

    expect((await service.obtenerEtiquetaPorGuia(501, KEY_TIENDA_2)).status).toBe("no_encontrada");
    expect((await service.obtenerEtiquetaPorGuia(501, KEY_TIENDA_1)).status).toBe("ok");
  });

  it("R13: el repo se llama con el dueño de la key como `tiendaId` (frontera en el where)", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", tiendaId: "tienda-1", numGuia: 501 })]);
    const service = new EtiquetaGuiaService(repo);

    await service.generarEtiquetas({ ordenIds: ["o1"] }, KEY_TIENDA_1);
    await service.obtenerEtiquetaPorGuia(501, KEY_TIENDA_1);

    expect(repo.findEtiquetasByIds).toHaveBeenCalledWith(["o1"], "tienda-1");
    expect(repo.findEtiquetaByNumGuia).toHaveBeenCalledWith(501, "tienda-1");
  });

  // SLT-49: antes incluia a ADMIN_TIENDA; ahora la tienda tiene frontera (bloque de abajo).
  it("R11/R12: maestro/admin/mensajero/adminSatelite NO se filtran por dueño", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", tiendaId: "otra-tienda" })]);
    const service = new EtiquetaGuiaService(repo);

    for (const actor of [MAESTRO, ADMIN, MENSAJERO, ADMIN_SATELITE]) {
      const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, actor);
      if (r.status !== "ok") throw new Error("unreachable");
      expect(r.etiquetas).toHaveLength(1);
    }
  });
});

// SLT-49 — la tienda (`adminTienda`) solo lee las etiquetas de sus ordenes (R7, R8, R9, R10).
// `ADMIN_TIENDA.usuarioId` ("u-tienda") es el `tienda_id` de sus ordenes.
describe("EtiquetaGuiaService — frontera por dueño del adminTienda (SLT-49)", () => {
  const PROPIA = etiquetaRow({ id: "propia", tiendaId: "u-tienda", numGuia: 11 });
  const AJENA = etiquetaRow({ id: "ajena", tiendaId: "otra-tienda", numGuia: 22 });

  it("R7: tienda propia -> recibe su etiqueta", async () => {
    const service = new EtiquetaGuiaService(fakeRepo([PROPIA, AJENA]));

    const r = await service.generarEtiquetas({ ordenIds: ["propia"] }, ADMIN_TIENDA);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas.map((e) => e.ordenId)).toEqual(["propia"]);
    expect(r.omitidas).toEqual([]);
  });

  it("R8: lote de uno con la orden de otra tienda -> sin etiqueta y `no_encontrada`", async () => {
    const service = new EtiquetaGuiaService(fakeRepo([PROPIA, AJENA]));

    const r = await service.generarEtiquetas({ ordenIds: ["ajena"] }, ADMIN_TIENDA);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas).toEqual([]);
    expect(r.omitidas).toEqual([{ ordenId: "ajena", motivo: "no_encontrada" }]);
  });

  it("R7: lote mixto -> la propia en `etiquetas`, la ajena en `omitidas` como `no_encontrada`", async () => {
    const service = new EtiquetaGuiaService(fakeRepo([PROPIA, AJENA]));

    const r = await service.generarEtiquetas({ ordenIds: ["propia", "ajena"] }, ADMIN_TIENDA);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas.map((e) => e.ordenId)).toEqual(["propia"]);
    expect(r.etiquetas.map((e) => e.numGuia)).not.toContain(22);
    expect(r.omitidas).toEqual([{ ordenId: "ajena", motivo: "no_encontrada" }]);
  });

  it("R9: por guia ajena -> `no_encontrada`; por guia propia -> ok", async () => {
    const service = new EtiquetaGuiaService(fakeRepo([PROPIA, AJENA]));

    expect((await service.obtenerEtiquetaPorGuia(22, ADMIN_TIENDA)).status).toBe("no_encontrada");
    expect((await service.obtenerEtiquetaPorGuia(11, ADMIN_TIENDA)).status).toBe("ok");
  });

  it("R10: el repo se llama con el usuarioId de la tienda como `tiendaId` (lote y guia)", async () => {
    const repo = fakeRepo([PROPIA, AJENA]);
    const service = new EtiquetaGuiaService(repo);

    await service.generarEtiquetas({ ordenIds: ["propia", "ajena"] }, ADMIN_TIENDA);
    await service.obtenerEtiquetaPorGuia(22, ADMIN_TIENDA);

    expect(repo.findEtiquetasByIds).toHaveBeenCalledWith(["propia", "ajena"], "u-tienda");
    expect(repo.findEtiquetaByNumGuia).toHaveBeenCalledWith(22, "u-tienda");
  });

  it("R11/R12: maestro/admin/mensajero/adminSatelite -> repo llamado con `null` (sin frontera)", async () => {
    for (const actor of [MAESTRO, ADMIN, MENSAJERO, ADMIN_SATELITE]) {
      const repo = fakeRepo([PROPIA, AJENA]);
      const service = new EtiquetaGuiaService(repo);

      await service.generarEtiquetas({ ordenIds: ["ajena"] }, actor);
      await service.obtenerEtiquetaPorGuia(22, actor);

      expect(repo.findEtiquetasByIds).toHaveBeenCalledWith(["ajena"], null);
      expect(repo.findEtiquetaByNumGuia).toHaveBeenCalledWith(22, null);
    }
  });

  it("R7/R8/R9 segunda capa: un repo que IGNORA `tiendaId` y devuelve la ajena -> sigue `no_encontrada`", async () => {
    const service = new EtiquetaGuiaService(repoQueIgnoraTienda([PROPIA, AJENA]));

    const r = await service.generarEtiquetas({ ordenIds: ["propia", "ajena"] }, ADMIN_TIENDA);
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas.map((e) => e.ordenId)).toEqual(["propia"]);
    expect(r.omitidas).toEqual([{ ordenId: "ajena", motivo: "no_encontrada" }]);

    expect((await service.obtenerEtiquetaPorGuia(22, ADMIN_TIENDA)).status).toBe("no_encontrada");
  });

  it("R13 segunda capa: tambien para una API key con un repo que ignora `tiendaId`", async () => {
    const service = new EtiquetaGuiaService(repoQueIgnoraTienda([PROPIA, AJENA]));
    const key: Actor = { usuarioId: "u-tienda", rol: "apiKey" };

    const r = await service.generarEtiquetas({ ordenIds: ["ajena"] }, key);
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.omitidas).toEqual([{ ordenId: "ajena", motivo: "no_encontrada" }]);
  });
});

describe("EtiquetaGuiaService — armado del DTO de etiqueta (R1)", () => {
  it("R1: orden con guia y geografia completas -> DTO con todos los nombres resueltos", async () => {
    const repo = fakeRepo([etiquetaRow()]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.omitidas).toEqual([]);
    expect(r.etiquetas).toHaveLength(1);
    expect(r.etiquetas[0]).toEqual({
      ordenId: "o1",
      numGuia: 501,
      numRemision: "REM-1",
      destinatario: "Juan Perez",
      telefonoDest: "0999999999",
      direccion: "Av. Siempre Viva 742",
      producto: "Caja x2",
      montoCobrar: 25.5,
      tiendaNombre: "Tienda Uno",
      zonaNombre: "GAM",
      provinciaNombre: "San Jose",
      cantonNombre: "Central",
      distritoNombre: "Carmen",
      // Feature 295: la fecha de creacion viaja del repo al DTO SIN reformatearse.
      fechaCreacion: "2026-08-25",
      qrValue: "501",
      barcodeValue: "501",
    });
  });
});

describe("EtiquetaGuiaService — orden sin guia (R2)", () => {
  it("R2: orden existente sin num_guia -> omitida 'sin_guia', sin etiqueta (no tiene QR)", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", numGuia: null })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas).toEqual([]);
    expect(r.omitidas).toEqual([{ ordenId: "o1", motivo: "sin_guia" }]);
  });
});

describe("EtiquetaGuiaService — orden inexistente/borrada (R3)", () => {
  it("R3: id no encontrado (no viene de la query) + orden valida -> etiqueta del valido, omitida del otro (no aborta el lote)", async () => {
    // El repo solo devuelve o1 (o2 no existe o esta borrada -> el repo lo excluye).
    const repo = fakeRepo([etiquetaRow({ id: "o1" })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1", "o2"] }, MAESTRO);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas).toHaveLength(1);
    expect(r.etiquetas[0].ordenId).toBe("o1");
    expect(r.omitidas).toEqual([{ ordenId: "o2", motivo: "no_encontrada" }]);
  });
});

describe("EtiquetaGuiaService — distrito ausente (R4)", () => {
  it("R4: orden sin distrito -> distritoNombre null con etiqueta valida y resto de geografia", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", distritoNombre: null })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas[0].distritoNombre).toBeNull();
    expect(r.etiquetas[0].zonaNombre).toBe("GAM");
    expect(r.etiquetas[0].provinciaNombre).toBe("San Jose");
    expect(r.etiquetas[0].cantonNombre).toBe("Central");
  });
});

describe("EtiquetaGuiaService — montoCobrar serializable (R5)", () => {
  it("R5: montoCobrar number cuando la orden lo trae; sin simbolo de moneda", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", montoCobrar: 99.9 })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas[0].montoCobrar).toBe(99.9);
    expect(typeof r.etiquetas[0].montoCobrar).toBe("number");
  });

  it("R5: montoCobrar null cuando la orden no lo trae", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", montoCobrar: null })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas[0].montoCobrar).toBeNull();
  });
});

describe("EtiquetaGuiaService — no expone internos (R6)", () => {
  it("R6: el DTO de etiqueta no contiene deletedAt ni claves fuera del contrato", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1" })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    if (r.status !== "ok") throw new Error("unreachable");
    const keys = Object.keys(r.etiquetas[0]).sort();
    expect(keys).not.toContain("deletedAt");
    expect(keys).toEqual(
      [
        "barcodeValue",
        "cantonNombre",
        "destinatario",
        "direccion",
        "distritoNombre",
        "fechaCreacion", // feature 295
        "montoCobrar",
        "numGuia",
        "numRemision",
        "ordenId",
        "producto",
        "provinciaNombre",
        "qrValue",
        "telefonoDest",
        "tiendaNombre",
        "zonaNombre",
      ].sort(),
    );
  });
});

describe("EtiquetaGuiaService — codificacion QR/barcode (R7/R8)", () => {
  it("R7: qrValue === String(numGuia) (el QR ya NO codifica orden.id)", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "orden-uuid-abc", numGuia: 700 })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["orden-uuid-abc"] }, MAESTRO);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas[0].qrValue).toBe("700");
    expect(r.etiquetas[0].qrValue).toBe(String(r.etiquetas[0].numGuia));
    expect(r.etiquetas[0].qrValue).not.toBe(r.etiquetas[0].ordenId);
  });

  it("R7/R8: qrValue y barcodeValue codifican el MISMO num_guia", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", numGuia: 4242 })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas[0].qrValue).toBe(r.etiquetas[0].barcodeValue);
  });

  it("R8: barcodeValue === String(numGuia)", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", numGuia: 12345 })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.generarEtiquetas({ ordenIds: ["o1"] }, MAESTRO);

    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiquetas[0].barcodeValue).toBe("12345");
    expect(r.etiquetas[0].barcodeValue).toBe(String(r.etiquetas[0].numGuia));
  });
});

describe("EtiquetaGuiaService — etiqueta por num_guia (ruta /paquete/<numGuia>)", () => {
  it("R1/R7: resuelve la etiqueta de la orden con ese num_guia (mismo DTO)", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", numGuia: 501 })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.obtenerEtiquetaPorGuia(501, MAESTRO);

    expect(r.status).toBe("ok");
    if (r.status !== "ok") throw new Error("unreachable");
    expect(r.etiqueta.ordenId).toBe("o1");
    expect(r.etiqueta.numGuia).toBe(501);
    expect(r.etiqueta.qrValue).toBe("501");
    expect(repo.findEtiquetaByNumGuia).toHaveBeenCalledWith(501, null); // maestro: sin frontera
  });

  it("R3: sin orden viva con ese num_guia (inexistente o borrada) -> no_encontrada", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", numGuia: 501 })]);
    const service = new EtiquetaGuiaService(repo);

    const r = await service.obtenerEtiquetaPorGuia(999, MAESTRO);

    expect(r.status).toBe("no_encontrada");
  });

  // SLT-49: ADMIN_TIENDA sale de este bucle (la orden es de `tienda-1`, no suya); su caso por
  // guia vive en el bloque «frontera por dueño del adminTienda».
  it("R11/R12: maestro/admin/mensajero/adminSatelite resuelven la etiqueta por guia de cualquier tienda", async () => {
    const repo = fakeRepo([etiquetaRow({ id: "o1", numGuia: 501 })]);
    const service = new EtiquetaGuiaService(repo);

    for (const actor of [ADMIN, MENSAJERO, MAESTRO, ADMIN_SATELITE]) {
      const r = await service.obtenerEtiquetaPorGuia(501, actor);
      expect(r.status).toBe("ok");
    }
  });
});
