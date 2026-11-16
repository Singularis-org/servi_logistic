import { describe, it, expect, vi } from "vitest";

import { recibirEnBodegaCentralPorQr } from "@/lib/actions/recepcion-bodega-central";
import { recibirEnOrigenPorQr } from "@/lib/actions/recepcion-origen";
import { recibirPorQr } from "@/lib/actions/recepcion-satelite";
import type { IOrdenRepository, OrdenTransicionRow } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IRecepcionBodegaCentralService } from "@/lib/interfaces/services/IRecepcionBodegaCentralService";
import type { IRecepcionOrigenService } from "@/lib/interfaces/services/IRecepcionOrigenService";
import type { IRecepcionSateliteService } from "@/lib/interfaces/services/IRecepcionSateliteService";
import { RecepcionBodegaCentralService } from "@/lib/services/RecepcionBodegaCentralService";
import { RecepcionOrigenService } from "@/lib/services/RecepcionOrigenService";
import { RecepcionSateliteService } from "@/lib/services/RecepcionSateliteService";

// SLT-167 (R710-R713, R715) — destinatario y tienda en la respuesta de las tres recepciones por guia.
// Literales a mano: el `resumen` esperado NO sale de la funcion que lo genera. En los negativos,
// valores imposibles por casualidad (guia 7777777).

const RESUMEN = { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" };
const ORDEN_ID = "0b1c2d3e-4f50-4617-8a9b-0c1d2e3f4a5b";
const GUIA = 4242;
const GUIA_INEXISTENTE = 7777777;
const TIENDA = "t-tienda-norte";
const ZONA = "z-zona-norte";
const ESTATUS_ID = "estatus-destino";

type Repo = {
  findUsuarioZonaId: ReturnType<typeof vi.fn>;
  findByNumGuiaForTransicion: ReturnType<typeof vi.fn>;
  findEstatusIdByValue: ReturnType<typeof vi.fn>;
  recibirEnBodegaCentral: ReturnType<typeof vi.fn>;
  recibirEnOrigen: ReturnType<typeof vi.fn>;
  recibirEnSatelite: ReturnType<typeof vi.fn>;
  resumenRecepcion: ReturnType<typeof vi.fn>;
};

/** Un escenario por servicio: su actor, su par origen->destino y su escritura. */
interface Escenario {
  nombre: string;
  actor: Actor;
  origen: string;
  destino: string;
  escritura: "recibirEnBodegaCentral" | "recibirEnOrigen" | "recibirEnSatelite";
  recibir: (repo: Repo, numGuia: number, actor: Actor) => Promise<Record<string, unknown>>;
}

const ESCENARIOS: Escenario[] = [
  {
    nombre: "bodega central",
    actor: { usuarioId: "u-maestro", rol: "maestro" },
    origen: "en_ruta_bodega_central",
    destino: "en_bodega_central",
    escritura: "recibirEnBodegaCentral",
    recibir: (repo, guia, actor) =>
      new RecepcionBodegaCentralService(repo as unknown as IOrdenRepository).recibirEnBodegaCentral(guia, actor),
  },
  {
    nombre: "origen",
    actor: { usuarioId: TIENDA, rol: "adminTienda" },
    origen: "devolviendo_a_tienda",
    destino: "devuelta_a_tienda",
    escritura: "recibirEnOrigen",
    recibir: (repo, guia, actor) =>
      new RecepcionOrigenService(repo as unknown as IOrdenRepository).recibirEnOrigen(guia, actor),
  },
  {
    nombre: "satelite",
    actor: { usuarioId: "u-satelite", rol: "adminSatelite" },
    origen: "en_ruta_bodega_satelite",
    destino: "en_bodega_satelite",
    escritura: "recibirEnSatelite",
    recibir: (repo, guia, actor) =>
      new RecepcionSateliteService(repo as unknown as IOrdenRepository, {
        contarIntentosEnLote: vi.fn(async () => new Map()),
      }).recibir(guia, actor),
  },
];

function fila(estatusValue: string, extra: Partial<OrdenTransicionRow> = {}): OrdenTransicionRow {
  return {
    id: ORDEN_ID,
    estatusValue,
    numGuia: GUIA,
    deletedAt: null,
    zonaId: ZONA,
    zonaEsGam: false,
    tiendaId: TIENDA,
    mensajeroAsignadoId: null,
    fechaReparto: null,
    ...extra,
  };
}

function repoDoble(estatusValue: string, extra: Partial<Repo> = {}): Repo {
  return {
    findUsuarioZonaId: vi.fn(async () => ZONA),
    findByNumGuiaForTransicion: vi.fn(async () => fila(estatusValue)),
    findEstatusIdByValue: vi.fn(async () => ESTATUS_ID),
    recibirEnBodegaCentral: vi.fn(async () => true),
    recibirEnOrigen: vi.fn(async () => true),
    recibirEnSatelite: vi.fn(async () => true),
    resumenRecepcion: vi.fn(async () => ({ ...RESUMEN })),
    ...extra,
  };
}

/** Escrituras del doble: la transicion de la recepcion es la UNICA que existe. */
function escrituras(repo: Repo): number {
  return (
    repo.recibirEnBodegaCentral.mock.calls.length +
    repo.recibirEnOrigen.mock.calls.length +
    repo.recibirEnSatelite.mock.calls.length
  );
}

describe.each(ESCENARIOS)("SLT-167 — recepcion $nombre", (e) => {
  it("R710: `ok` trae el resumen literal, leido con el id de la orden recibida", async () => {
    const repo = repoDoble(e.origen);
    const r = await e.recibir(repo, GUIA, e.actor);
    expect(r).toEqual({
      status: "ok",
      ordenId: ORDEN_ID,
      estado: e.destino,
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
    expect(repo.resumenRecepcion).toHaveBeenCalledTimes(1);
    expect(repo.resumenRecepcion).toHaveBeenCalledWith(ORDEN_ID);
  });

  it("R713: el resumen tiene exactamente las claves destinatario y tienda", async () => {
    const r = await e.recibir(repoDoble(e.origen), GUIA, e.actor);
    expect(Object.keys(r.resumen as object).sort()).toEqual(["destinatario", "tienda"]);
  });

  it("R711: `ya_recibida` por la guarda (ya en el destino) trae el resumen, sin escribir", async () => {
    const repo = repoDoble(e.destino);
    const r = await e.recibir(repo, GUIA, e.actor);
    expect(r).toEqual({
      status: "ya_recibida",
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
    expect(escrituras(repo)).toBe(0);
    expect(repo.resumenRecepcion).toHaveBeenCalledWith(ORDEN_ID);
  });

  it("R711: `ya_recibida` tras perder la carrera (la relectura esta recibida) trae el resumen", async () => {
    const repo = repoDoble(e.origen, {
      findByNumGuiaForTransicion: vi
        .fn()
        .mockResolvedValueOnce(fila(e.origen))
        .mockResolvedValueOnce(fila(e.destino)),
      [e.escritura]: vi.fn(async () => false),
    });
    const r = await e.recibir(repo, GUIA, e.actor);
    expect(r).toEqual({
      status: "ya_recibida",
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
    expect(repo[e.escritura]).toHaveBeenCalledTimes(1);
  });

  it("R715: si la lectura devuelve null, `ok` conserva status, ordenId y estado, sin resumen; una sola escritura", async () => {
    const repo = repoDoble(e.origen, { resumenRecepcion: vi.fn(async () => null) });
    const r = await e.recibir(repo, GUIA, e.actor);
    expect(r).toEqual({ status: "ok", ordenId: ORDEN_ID, estado: e.destino });
    expect("resumen" in r).toBe(false);
    expect(repo[e.escritura]).toHaveBeenCalledTimes(1);
    expect(escrituras(repo)).toBe(1);
  });

  it("R715: si la lectura falla, `ok` sale igual sin resumen y la recepcion no se deshace", async () => {
    const repo = repoDoble(e.origen, {
      resumenRecepcion: vi.fn(async () => {
        throw new Error("lectura caida");
      }),
    });
    const r = await e.recibir(repo, GUIA, e.actor);
    expect(r).toEqual({ status: "ok", ordenId: ORDEN_ID, estado: e.destino });
    expect(repo[e.escritura]).toHaveBeenCalledTimes(1);
    expect(escrituras(repo)).toBe(1);
  });

  it("R715: `ya_recibida` con lectura null o caida sale sin resumen", async () => {
    const nula = await e.recibir(
      repoDoble(e.destino, { resumenRecepcion: vi.fn(async () => null) }),
      GUIA,
      e.actor,
    );
    const caida = await e.recibir(
      repoDoble(e.destino, {
        resumenRecepcion: vi.fn(async () => {
          throw new Error("lectura caida");
        }),
      }),
      GUIA,
      e.actor,
    );
    expect(nula).toEqual({ status: "ya_recibida" });
    expect(caida).toEqual({ status: "ya_recibida" });
  });

  // R712: cualquier otra respuesta no trae resumen ni lo lee.
  const negativos: { caso: string; status: string; repo: () => Repo; actor?: Actor; guia?: number }[] = [
    {
      caso: "forbidden",
      status: "forbidden",
      repo: () => repoDoble(e.origen),
      actor: { usuarioId: "u-mensajero", rol: "mensajero" },
    },
    {
      caso: "no_encontrada (guia 7777777)",
      status: "no_encontrada",
      repo: () => repoDoble(e.origen, { findByNumGuiaForTransicion: vi.fn(async () => null) }),
      guia: GUIA_INEXISTENTE,
    },
    { caso: "estado_invalido", status: "estado_invalido", repo: () => repoDoble("en_reparto") },
    {
      caso: "conflict",
      status: "conflict",
      repo: () =>
        repoDoble(e.origen, {
          findByNumGuiaForTransicion: vi
            .fn()
            .mockResolvedValueOnce(fila(e.origen))
            .mockResolvedValueOnce(fila("en_reparto")),
          [e.escritura]: vi.fn(async () => false),
        }),
    },
  ];
  if (e.escritura === "recibirEnOrigen") {
    negativos.push({
      caso: "tienda_ajena",
      status: "tienda_ajena",
      repo: () =>
        repoDoble(e.destino, {
          findByNumGuiaForTransicion: vi.fn(async () => fila(e.destino, { tiendaId: "t-otra-tienda" })),
        }),
    });
  }
  if (e.escritura === "recibirEnSatelite") {
    negativos.push(
      {
        caso: "zona_ajena",
        status: "zona_ajena",
        repo: () =>
          repoDoble(e.destino, {
            findByNumGuiaForTransicion: vi.fn(async () => fila(e.destino, { zonaId: "z-otra-zona" })),
          }),
      },
      {
        caso: "sin_zona",
        status: "sin_zona",
        repo: () => repoDoble(e.origen, { findUsuarioZonaId: vi.fn(async () => null) }),
      },
    );
  }

  it.each(negativos)("R712: $caso no trae resumen y no lo lee", async (n) => {
    const repo = n.repo();
    const r = await e.recibir(repo, n.guia ?? GUIA, n.actor ?? e.actor);
    expect(r.status).toBe(n.status);
    expect("resumen" in r).toBe(false);
    expect(repo.resumenRecepcion).not.toHaveBeenCalled();
  });
});

describe("SLT-167 R710/R711 — las tres acciones reenvian el resumen del servicio", () => {
  const actor = async (): Promise<Actor> => ({ usuarioId: TIENDA, rol: "adminTienda" });

  it("bodega central", async () => {
    const service: IRecepcionBodegaCentralService = {
      recibirEnBodegaCentral: vi.fn(async () => ({
        status: "ok" as const,
        ordenId: ORDEN_ID,
        estado: "en_bodega_central" as const,
        resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
      })),
    };
    const r = await recibirEnBodegaCentralPorQr({ numGuia: GUIA }, { service, getActor: actor });
    expect(r).toEqual({
      status: "ok",
      ordenId: ORDEN_ID,
      estado: "en_bodega_central",
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
  });

  it("origen", async () => {
    const service: IRecepcionOrigenService = {
      recibirEnOrigen: vi.fn(async () => ({
        status: "ya_recibida" as const,
        resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
      })),
    };
    const r = await recibirEnOrigenPorQr({ numGuia: GUIA }, { service, getActor: actor });
    expect(r).toEqual({
      status: "ya_recibida",
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
  });

  it("satelite", async () => {
    const service = {
      recibir: vi.fn(async () => ({
        status: "ok" as const,
        ordenId: ORDEN_ID,
        estado: "en_bodega_satelite" as const,
        resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
      })),
    } as unknown as IRecepcionSateliteService;
    const r = await recibirPorQr({ numGuia: GUIA }, { service, getActor: actor });
    expect(r).toEqual({
      status: "ok",
      ordenId: ORDEN_ID,
      estado: "en_bodega_satelite",
      resumen: { destinatario: "Ana Quesada Mora", tienda: "Tienda Prueba Norte" },
    });
  });
});
