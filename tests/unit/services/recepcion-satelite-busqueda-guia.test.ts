import { describe, it, expect, vi } from "vitest";

import { RecepcionSateliteService } from "@/lib/services/RecepcionSateliteService";
import type {
  IOrdenRepository,
  RecepcionSateliteFiltro,
} from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IOrdenHistorialService } from "@/lib/interfaces/services/IOrdenHistorialService";
import {
  listarIdsVigentesBodegaSchema,
  listarOrdenesBodegaCompletoSchema,
  listarOrdenesBodegaPaginadoSchema,
} from "@/lib/types/recepcion-satelite";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";

// SLT-160 «Buscar escaneando en los listados» (R606, R607) — la DECISION del servicio: un término
// de solo dígitos que es la guía de una orden del listado viaja como `numGuia` y sin `busqueda`;
// si no lo es, contención como siempre. Este archivo usa DOBLES y no ve el SQL: el `WHERE` se
// prueba en `tests/integration/db/satelite-busqueda-guia-sql-real.test.ts`.

const SAT: Actor = { usuarioId: "u-sat", rol: "adminSatelite" };
const ID = "11111111-1111-4111-8111-111111111111";

function montar(guiasDelListado: number[]) {
  const existeGuiaEnBodega = vi.fn(async (filtro: RecepcionSateliteFiltro) =>
    guiasDelListado.includes(filtro.numGuia ?? -1),
  );
  const findRecepcionSatelitePaginada = vi.fn(async () => ({ items: [], total: 0 }));
  const findRecepcionSateliteCompleta = vi.fn(async () => []);
  const findIdsVigentesEnBodega = vi.fn(async () => [] as string[]);
  const repo = {
    findUsuarioZonaId: vi.fn(async () => "z-a"),
    existeGuiaEnBodega,
    findRecepcionSatelitePaginada,
    findRecepcionSateliteCompleta,
    findIdsVigentesEnBodega,
  } as unknown as IOrdenRepository;
  const historial = {
    contarIntentosEnLote: vi.fn(async () => new Map()),
  } as unknown as Pick<IOrdenHistorialService, "contarIntentosEnLote">;
  const svc = new RecepcionSateliteService(repo, historial, undefined, reglasPaisFijas());
  return {
    svc,
    existeGuiaEnBodega,
    findRecepcionSatelitePaginada,
    findRecepcionSateliteCompleta,
    findIdsVigentesEnBodega,
  };
}

async function filtroDePagina(q: string, guias: number[]) {
  const m = montar(guias);
  await m.svc.listarOrdenesBodegaPaginado(listarOrdenesBodegaPaginadoSchema.parse({ q }), SAT);
  return { ...m, filtro: m.findRecepcionSatelitePaginada.mock.calls[0]![0] as RecepcionSateliteFiltro };
}

describe("SLT-160 — R606: guía exacta en la satélite", () => {
  it("la guía existe en el listado: el filtro lleva `numGuia` y no `busqueda`", async () => {
    const { filtro, existeGuiaEnBodega } = await filtroDePagina("91024", [91024]);
    expect(filtro.numGuia).toBe(91024);
    expect(filtro).not.toHaveProperty("busqueda");
    expect(filtro).not.toHaveProperty("busquedaDigitos");
    expect(filtro.zonaId).toBe("z-a");
    // La pregunta lleva el mismo alcance que la página, con la guía y sin contención.
    expect(existeGuiaEnBodega).toHaveBeenCalledTimes(1);
    const pregunta = existeGuiaEnBodega.mock.calls[0]![0];
    expect(pregunta.numGuia).toBe(91024);
    expect(pregunta.zonaId).toBe("z-a");
    expect(pregunta).not.toHaveProperty("busqueda");
  });

  it("la guía NO está en el listado: contención como hoy", async () => {
    const { filtro, existeGuiaEnBodega } = await filtroDePagina("9102", [91024]);
    expect(existeGuiaEnBodega).toHaveBeenCalledTimes(1);
    expect(filtro.busqueda).toBe("9102");
    expect(filtro).not.toHaveProperty("numGuia");
  });

  it("un término que no son solo dígitos no pregunta por la guía", async () => {
    for (const q of ["Ana Pérez", "8888-0000", "91024x"]) {
      const { filtro, existeGuiaEnBodega } = await filtroDePagina(q, [91024]);
      expect(existeGuiaEnBodega).not.toHaveBeenCalled();
      expect(filtro).not.toHaveProperty("numGuia");
      expect(filtro.busqueda).toBeDefined();
    }
  });

  it("dígitos fuera del rango de `num_guia` (0 o > int4) no preguntan", async () => {
    for (const q of ["000", "2147483648", "99999999999999999999"]) {
      const { filtro, existeGuiaEnBodega } = await filtroDePagina(q, [0, 2147483648]);
      expect(existeGuiaEnBodega).not.toHaveBeenCalled();
      expect(filtro).not.toHaveProperty("numGuia");
    }
  });

  it("sin término no pregunta", async () => {
    const m = montar([91024]);
    await m.svc.listarOrdenesBodegaPaginado(listarOrdenesBodegaPaginadoSchema.parse({}), SAT);
    expect(m.existeGuiaEnBodega).not.toHaveBeenCalled();
  });
});

describe("SLT-160 — R607: el mismo criterio en la descarga y en la vigencia", () => {
  it("la descarga recibe la guía exacta", async () => {
    const m = montar([91024]);
    await m.svc.listarOrdenesBodegaCompleto(
      listarOrdenesBodegaCompletoSchema.parse({ q: "91024" }),
      SAT,
    );
    const filtro = m.findRecepcionSateliteCompleta.mock.calls[0]![0] as RecepcionSateliteFiltro;
    expect(filtro.numGuia).toBe(91024);
    expect(filtro).not.toHaveProperty("busqueda");
  });

  it("la vigencia de la selección recibe la guía exacta", async () => {
    const m = montar([91024]);
    await m.svc.listarIdsVigentesBodega(
      listarIdsVigentesBodegaSchema.parse({ q: "91024", ids: [ID] }),
      SAT,
    );
    const filtro = m.findIdsVigentesEnBodega.mock.calls[0]![0] as RecepcionSateliteFiltro;
    expect(filtro.numGuia).toBe(91024);
    expect(filtro).not.toHaveProperty("busqueda");
  });
});
