import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { CierresBodegaAdminRepository } from "@/lib/repositories/CierresBodegaAdminRepository";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { filtrosParaRepo } from "@/lib/services/zona-de-la-empresa";
import type { Alcance } from "@/lib/interfaces/repositories/ICierresAdminRepository";
import type { FiltrosCierres, FiltrosCierresBodega } from "@/lib/types/filtros-cierres";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (R456, R458, R459) — el
 * folio en el `WHERE` de los TRES repositorios de `/cierres-admin`, contra Postgres real.
 *
 * Los filtros pasan por `filtrosParaRepo` (la normalización real del servicio) y llegan al
 * repositorio real; el SQL a mano de los ids y el `WHERE` de Prisma corren de verdad.
 *
 * EL CORPUS (una transacción que SIEMPRE se revierte). Los ids se fijan a mano para conocer el folio
 * (los últimos 8 caracteres del id, R156): `<8 hex por corrida>-<4 hex>-4000-8000-0000<folio>`.
 *
 * cierre_dia, empresa A:
 *   | Clave | Destino          | Estado     | solicitado_at | Folio     |
 *   | D1    | central (ZC)     | aprobado   | 11-03 12:00   | 3F2A0001  |
 *   | D2    | central (ZC)     | solicitado | 11-05 12:00   | A13F2A02  |
 *   | D3    | central (ZC)     | aprobado   | 11-02 12:00   | 0000BEEF  |
 *   | D4    | central (ZC)     | aprobado   | 11-01 12:00   | 00000004  | id empieza por «3f2a7e57»: fuera del folio
 *   | D5    | satélite Z1      | aprobado   | 11-03 13:00   | 3F2A0005  | consolidable de Z1
 *   | D6    | satélite Z2      | aprobado   | 11-03 14:00   | 3F2A0006  | consolidable de Z2 (otra zona)
 *   | D7    | satélite Z1      | solicitado | 11-05 13:00   | 3F2A0007  |
 *   | D8    | central (ZC)     | rechazado  | 11-04 12:00   | 3F2A0008  |
 * cierre_dia, empresa B: DB1 central, aprobado, folio 3F2A00B1 (mismo texto, otra empresa).
 *
 * cierre_bodega, empresa A:
 *   | Clave | Zona | Marca      | solicitado_at | Folio     |
 *   | B1    | Z1   | sin marca  | 11-06 12:00   | 3F2A0B01  |
 *   | B2    | Z1   | recibido   | 11-05 12:00   | 3F2A0B02  |
 *   | B3    | Z2   | sin marca  | 11-07 12:00   | 3F2A0B03  |
 *   | B4    | Z1   | sin marca  | 11-04 12:00   | 0000CAFE  |
 *   | B5    | Z1   | sin marca  | 11-03 12:00   | 00000B05  | id empieza por «3f2a7e57»
 * cierre_bodega, empresa B: BB1 sin marca, folio 3F2A0BB1.
 *
 * El `tx` es el del rol dueño (sin RLS): lo que separa a la empresa B en estas listas es el
 * `organizacion_id` ESCRITO en el SQL de los ids. Sin base se SALTA; con base y sin catálogos, FALLA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt153-${Date.now().toString(36)}`;
const P = randomBytes(4).toString("hex");
const S = randomBytes(2).toString("hex");
const id = (folio: string) => `${P}-${S}-4000-8000-0000${folio}`;
const idFueraDelFolio = (folio: string) => `3f2a7e57-${S}-4000-8000-0000${folio}`;

type Clave =
  | "D1" | "D2" | "D3" | "D4" | "D5" | "D6" | "D7" | "D8" | "DB1"
  | "B1" | "B2" | "B3" | "B4" | "B5" | "BB1";

const IDS: Record<Clave, string> = {
  D1: id("3f2a0001"),
  D2: id("a13f2a02"),
  D3: id("0000beef"),
  D4: idFueraDelFolio("00000004"),
  D5: id("3f2a0005"),
  D6: id("3f2a0006"),
  D7: id("3f2a0007"),
  D8: id("3f2a0008"),
  DB1: id("3f2a00b1"),
  B1: id("3f2a0b01"),
  B2: id("3f2a0b02"),
  B3: id("3f2a0b03"),
  B4: id("0000cafe"),
  B5: idFueraDelFolio("00000b05"),
  BB1: id("3f2a0bb1"),
};
const ID_A_CLAVE = new Map<string, Clave>((Object.keys(IDS) as Clave[]).map((k) => [IDS[k], k]));
const clave = (i: string): Clave | "?" => ID_A_CLAVE.get(i) ?? "?";

const ZONA_CR = async () => "America/Costa_Rica";
const ALCANCE_CENTRAL: Alcance = { destinoTipo: "bodega_central", destinoZonaId: null };

interface Resultado {
  claves: Array<Clave | "?">;
  total: number;
}
interface Medida {
  casos: Record<string, Resultado>;
}

async function sembrar(
  tx: TxDeTest,
  cat: { rol: string; tipo: string },
): Promise<{ Z1: string; Z2: string }> {
  const zona = async (n: string) =>
    (
      await tx.zona.create({
        data: { nombre: `Zona ${n} ${SUFIJO}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
        select: { id: true },
      })
    ).id;
  const usuario = async (n: string) =>
    (
      await tx.usuario.create({
        data: {
          nombre: `U ${n}`,
          email: `u-${n}-${SUFIJO}@example.test`,
          telefono: "88880000",
          passwordHash: "x",
          cedula: `C-${n}-${SUFIJO}`,
          tipoIdentificacionId: cat.tipo,
          rolId: cat.rol,
        },
        select: { id: true },
      })
    ).id;
  const cierreDia = (
    k: Clave,
    m: string,
    destinoTipo: "bodega_central" | "bodega_satelite",
    destinoZonaId: string,
    estado: "aprobado" | "solicitado" | "rechazado",
    at: string,
  ) =>
    tx.cierreDia.create({
      data: { id: IDS[k], mensajeroId: m, destinoTipo, destinoZonaId, estado, solicitadoAt: new Date(at) },
    });
  const cierreBodega = (k: Clave, zonaId: string, u: string, recibido: boolean, at: string) =>
    tx.cierreBodega.create({
      data: {
        id: IDS[k],
        zonaId,
        solicitadoPor: u,
        solicitadoAt: new Date(at),
        ...(recibido
          ? {
              estado: "aprobado" as const,
              conciliadoAt: new Date(at),
              conciliadoPor: u,
              montoRecibido: new Prisma.Decimal("0.00"),
            }
          : { estado: "solicitado" as const }),
      },
    });

  const ZC = await zona("c");
  const Z1 = await zona("1");
  const Z2 = await zona("2");
  const M = await usuario("m");
  const A = await usuario("a");

  await cierreDia("D1", M, "bodega_central", ZC, "aprobado", "2026-11-03T12:00:00.000Z");
  await cierreDia("D2", M, "bodega_central", ZC, "solicitado", "2026-11-05T12:00:00.000Z");
  await cierreDia("D3", M, "bodega_central", ZC, "aprobado", "2026-11-02T12:00:00.000Z");
  await cierreDia("D4", M, "bodega_central", ZC, "aprobado", "2026-11-01T12:00:00.000Z");
  await cierreDia("D5", M, "bodega_satelite", Z1, "aprobado", "2026-11-03T13:00:00.000Z");
  await cierreDia("D6", M, "bodega_satelite", Z2, "aprobado", "2026-11-03T14:00:00.000Z");
  await cierreDia("D7", M, "bodega_satelite", Z1, "solicitado", "2026-11-05T13:00:00.000Z");
  await cierreDia("D8", M, "bodega_central", ZC, "rechazado", "2026-11-04T12:00:00.000Z");

  await cierreBodega("B1", Z1, A, false, "2026-11-06T12:00:00.000Z");
  await cierreBodega("B2", Z1, A, true, "2026-11-05T12:00:00.000Z");
  await cierreBodega("B3", Z2, A, false, "2026-11-07T12:00:00.000Z");
  await cierreBodega("B4", Z1, A, false, "2026-11-04T12:00:00.000Z");
  await cierreBodega("B5", Z1, A, false, "2026-11-03T12:00:00.000Z");

  // Empresa B: el MISMO texto de folio, en una central y en una bodega.
  const [{ org: empresaA }] = await tx.$queryRawUnsafe<{ org: string }[]>(
    `SELECT current_setting('app.organizacion_id', true) AS org`,
  );
  if (!empresaA) throw new Error("la transacción no tiene empresa fijada");
  const empresaB = (await crearOrganizacion(tx, { nombre: `Empresa B ${SUFIJO}` })).id;
  await fijarEmpresa(tx, empresaB);
  const ZB = await zona("b");
  const MB = await usuario("mb");
  await cierreDia("DB1", MB, "bodega_central", ZB, "aprobado", "2026-11-04T13:00:00.000Z");
  await cierreBodega("BB1", ZB, MB, false, "2026-11-06T13:00:00.000Z");
  await fijarEmpresa(tx, empresaA);

  // El corpus se comprueba ANTES de medir: si falta una fila, el test LANZA, no pasa en vacío.
  const sembrados =
    (await tx.cierreDia.count({ where: { id: { in: Object.values(IDS) } } })) +
    (await tx.cierreBodega.count({ where: { id: { in: Object.values(IDS) } } }));
  if (sembrados !== 15) throw new Error(`corpus incompleto: ${sembrados} de 15 filas`);

  return { Z1, Z2 };
}

describeSiHayBase("SLT-153 — el folio en el WHERE de /cierres-admin, contra Postgres real", () => {
  let prisma: PrismaClient;
  let medida: Medida | undefined;
  let fallo: unknown;

  function caso(nombre: string): Resultado {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llegó a tomarse");
    const r = medida.casos[nombre];
    if (r === undefined) throw new Error(`caso sin medir: ${nombre}`);
    return r;
  }

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const rol = await prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    if (rol === null || tipo === null) {
      throw new Error(
        "faltan catálogos (`rol` mensajero o `tipo_identificacion`): corre " +
          "`pnpm exec prisma migrate deploy` y `pnpm run db:seed` antes de esta suite.",
      );
    }

    try {
      medida = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const { Z1, Z2 } = await sembrar(tx, { rol: rol.id, tipo: tipo.id });
        const cliente = tx as unknown as PrismaClient;
        const dia = new CierresAdminRepository(
          cliente, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never, {} as never,
        );
        const bodegaCentral = new CierresBodegaAdminRepository(cliente);
        const satelite = new CierreBodegaRepository(cliente);
        const SAT_Z1: Alcance = { destinoTipo: "bodega_satelite", destinoZonaId: Z1 };
        const casos: Record<string, Resultado> = {};

        const rango = (take = 50) => ({ skip: 0, take });
        const resolverDia = async (f: FiltrosCierres) => {
          const r = await filtrosParaRepo(f, ZONA_CR);
          if (r.tipo !== "aplicar") throw new Error(`folio imposible en un caso positivo: ${JSON.stringify(f)}`);
          return r.filtros;
        };
        const resolverBodega = async (f: FiltrosCierresBodega) => {
          const r = await filtrosParaRepo(f, ZONA_CR);
          if (r.tipo !== "aplicar") throw new Error(`folio imposible en un caso positivo: ${JSON.stringify(f)}`);
          return r.filtros;
        };
        const pag = (nombre: string, p: { items: Array<{ id: string }>; total: number }) => {
          casos[nombre] = { claves: p.items.map((i) => clave(i.id)), total: p.total };
        };
        const todo = (nombre: string, items: Array<{ id: string }>) => {
          casos[nombre] = { claves: items.map((i) => clave(i.id)), total: items.length };
        };
        const deDia = <T extends { cierreId: string }>(xs: T[]) => xs.map((x) => ({ id: x.cierreId }));
        const deBodega = <T extends { cierreBodegaId: string }>(xs: T[]) => xs.map((x) => ({ id: x.cierreBodegaId }));
        const deConsolidable = <T extends { cierreDiaId: string }>(xs: T[]) => xs.map((x) => ({ id: x.cierreDiaId }));
        const pagDia = async (nombre: string, a: Alcance, cola: boolean, f: FiltrosCierres, take?: number) => {
          const r = cola
            ? await dia.findColaPaginada(a, rango(take), await resolverDia(f))
            : await dia.findHistoricoPaginado(a, rango(take), await resolverDia(f));
          pag(nombre, { items: deDia(r.items), total: r.total });
        };

        // ── Cierres de mensajeros (CierresAdminRepository) ──────────────────────────────────
        await pagDia("dia-hist-prefijo", ALCANCE_CENTRAL, false, { folio: " #3f2a " });
        await pagDia("dia-hist-entero-minusculas", ALCANCE_CENTRAL, false, { folio: "3f2a0001" });
        await pagDia("dia-cola-prefijo", ALCANCE_CENTRAL, true, { folio: "#3F2A" });
        await pagDia("dia-hist-inexistente", ALCANCE_CENTRAL, false, { folio: "FEDCBA98" });
        await pagDia("dia-hist-primer-bloque", ALCANCE_CENTRAL, false, { folio: "2A7E57" });
        await pagDia("dia-hist-combinado", ALCANCE_CENTRAL, false, { folio: "3f2a", estados: ["rechazado"] });
        await pagDia("dia-hist-pagina-de-1", ALCANCE_CENTRAL, false, { folio: "3F2A" }, 1);
        await pagDia("dia-sat-z1-hist", SAT_Z1, false, { folio: "3F2A" });
        await pagDia("dia-sat-z1-cola", SAT_Z1, true, { folio: "3F2A" });
        todo("dia-hist-completo", deDia(await dia.findHistoricoCompleto(ALCANCE_CENTRAL, await resolverDia({ folio: "3F2A" }))));
        todo("dia-cola-completo", deDia(await dia.findColaCompleta(SAT_Z1, await resolverDia({ folio: "3F2A" }))));

        // ── Cierres de bodega de la central (CierresBodegaAdminRepository) ─────────────────
        const pagBC = async (nombre: string, cola: boolean, f: FiltrosCierresBodega, take?: number) => {
          const r = cola
            ? await bodegaCentral.findColaPaginada(rango(take), await resolverBodega(f))
            : await bodegaCentral.findHistoricoPaginado(rango(take), await resolverBodega(f));
          pag(nombre, { items: deBodega(r.items), total: r.total });
        };
        await pagBC("bc-cola-prefijo", true, { folio: "#3f2a" });
        await pagBC("bc-hist-prefijo", false, { folio: "3F2A" });
        await pagBC("bc-cola-entero-minusculas", true, { folio: " 3f2a0b03 " });
        await pagBC("bc-cola-inexistente", true, { folio: "FEDCBA98" });
        await pagBC("bc-cola-primer-bloque", true, { folio: "2A7E57" });
        await pagBC("bc-cola-combinado-zona", true, { folio: "3F2A", destinoZonaIds: [Z2] });
        await pagBC("bc-cola-pagina-de-1", true, { folio: "3F2A" }, 1);
        todo("bc-cola-completo", deBodega(await bodegaCentral.findColaCompleta(await resolverBodega({ folio: "3F2A" }))));

        // ── Consolidación de la satélite Z1 (CierreBodegaRepository) ───────────────────────
        const cons = await satelite.findCierresDiaConsolidablesPaginado(Z1, rango(), await resolverBodega({ folio: "3f2a" }));
        pag("sat-consolidables", { items: deConsolidable(cons.items), total: cons.total });
        todo(
          "sat-consolidables-completo",
          deConsolidable(await satelite.findCierresDiaConsolidables(Z1, await resolverBodega({ folio: "3f2a" }))),
        );
        const cons0 = await satelite.findCierresDiaConsolidablesPaginado(Z1, rango(), await resolverBodega({ folio: "FEDCBA98" }));
        pag("sat-consolidables-inexistente", { items: deConsolidable(cons0.items), total: cons0.total });
        const sol = await satelite.findCierresBodegaByZonaPaginado(Z1, rango(), await resolverBodega({ folio: "#3F2A" }));
        pag("sat-solicitados", { items: deBodega(sol.items), total: sol.total });
        const sol1 = await satelite.findCierresBodegaByZonaPaginado(Z1, rango(1), await resolverBodega({ folio: "#3F2A" }));
        pag("sat-solicitados-pagina-de-1", { items: deBodega(sol1.items), total: sol1.total });
        todo(
          "sat-solicitados-completo",
          deBodega(await satelite.findCierresBodegaByZona(Z1, await resolverBodega({ folio: "#3F2A" }))),
        );
        const solB = await satelite.findCierresBodegaByZonaPaginado(Z1, rango(), await resolverBodega({ folio: "0b02" }));
        pag("sat-solicitados-entero-trozo", { items: deBodega(solB.items), total: solB.total });
        const solP = await satelite.findCierresBodegaByZonaPaginado(Z1, rango(), await resolverBodega({ folio: "2A7E57" }));
        pag("sat-solicitados-primer-bloque", { items: deBodega(solP.items), total: solP.total });

        return { casos };
      });
    } catch (e) {
      fallo = e;
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  // ── Cierres de mensajeros ───────────────────────────────────────────────────────────────
  it("R456/R458 mensajeros: « #3f2a » en resueltos de la central → D8 y D1; ni D4 (fuera del folio), ni DB1 (otra empresa), ni satélites", () => {
    const r = caso("dia-hist-prefijo");
    expect(r.claves).toEqual(["D8", "D1"]);
    expect(r.total).toBe(2);
  });

  it("R456 mensajeros: el folio entero en minúsculas «3f2a0001» encuentra D1", () => {
    expect(caso("dia-hist-entero-minusculas")).toEqual({ claves: ["D1"], total: 1 });
  });

  it("R458 mensajeros: la cola con folio solo trae la cola (D2), no los resueltos", () => {
    expect(caso("dia-cola-prefijo")).toEqual({ claves: ["D2"], total: 1 });
  });

  it("R458 mensajeros: un folio inexistente «FEDCBA98» da 0", () => {
    expect(caso("dia-hist-inexistente")).toEqual({ claves: [], total: 0 });
  });

  it("R458 mensajeros: un texto que solo está en el primer bloque del uuid («2A7E57») da 0", () => {
    expect(caso("dia-hist-primer-bloque")).toEqual({ claves: [], total: 0 });
  });

  it("R458 mensajeros: folio + estado se cumplen a la vez (D8) y el total cuadra", () => {
    expect(caso("dia-hist-combinado")).toEqual({ claves: ["D8"], total: 1 });
  });

  it("R458 mensajeros: con pageSize 1 el total es el del conjunto filtrado", () => {
    expect(caso("dia-hist-pagina-de-1")).toEqual({ claves: ["D8"], total: 2 });
  });

  it("R458 mensajeros: la satélite Z1 solo ve su zona: D5 en resueltos (no D6 de Z2) y D7 en la cola", () => {
    expect(caso("dia-sat-z1-hist")).toEqual({ claves: ["D5"], total: 1 });
    expect(caso("dia-sat-z1-cola")).toEqual({ claves: ["D7"], total: 1 });
  });

  it("R459 mensajeros: el archivo con folio lleva los mismos cierres que la lista filtrada", () => {
    expect(caso("dia-hist-completo").claves).toEqual(["D8", "D1"]);
    expect(caso("dia-hist-completo").claves).toEqual(caso("dia-hist-prefijo").claves);
    expect(caso("dia-cola-completo").claves).toEqual(["D7"]);
  });

  // ── Cierres de bodega de la central ─────────────────────────────────────────────────────
  it("R456/R458 bodega central: « #3f2a » en la cola → B3 y B1; ni B2 (resuelto), ni B5 (fuera del folio), ni BB1 (otra empresa)", () => {
    expect(caso("bc-cola-prefijo")).toEqual({ claves: ["B3", "B1"], total: 2 });
  });

  it("R458 bodega central: en resueltos solo B2", () => {
    expect(caso("bc-hist-prefijo")).toEqual({ claves: ["B2"], total: 1 });
  });

  it("R456 bodega central: el folio entero en minúsculas « 3f2a0b03 » encuentra B3", () => {
    expect(caso("bc-cola-entero-minusculas")).toEqual({ claves: ["B3"], total: 1 });
  });

  it("R458 bodega central: inexistente y primer bloque dan 0", () => {
    expect(caso("bc-cola-inexistente")).toEqual({ claves: [], total: 0 });
    expect(caso("bc-cola-primer-bloque")).toEqual({ claves: [], total: 0 });
  });

  it("R458 bodega central: folio + bodega Z2 a la vez → B3", () => {
    expect(caso("bc-cola-combinado-zona")).toEqual({ claves: ["B3"], total: 1 });
  });

  it("R458/R459 bodega central: página de 1 con total del conjunto, y el archivo = la lista", () => {
    expect(caso("bc-cola-pagina-de-1")).toEqual({ claves: ["B3"], total: 2 });
    expect(caso("bc-cola-completo")).toEqual({ claves: ["B3", "B1"], total: 2 });
  });

  // ── Consolidación de la satélite ────────────────────────────────────────────────────────
  it("R456/R458 satélite: a consolidar con «3f2a» → solo D5 (ni D6 de Z2, ni D7 solicitado)", () => {
    expect(caso("sat-consolidables")).toEqual({ claves: ["D5"], total: 1 });
    expect(caso("sat-consolidables-inexistente")).toEqual({ claves: [], total: 0 });
  });

  it("R459 satélite: el archivo de «a consolidar» = la lista", () => {
    expect(caso("sat-consolidables-completo")).toEqual({ claves: ["D5"], total: 1 });
  });

  it("R456/R458 satélite: solicitados con «#3F2A» → B1 y B2 de Z1 (ni B3 de Z2, ni B4, ni B5, ni BB1)", () => {
    expect(caso("sat-solicitados")).toEqual({ claves: ["B1", "B2"], total: 2 });
    expect(caso("sat-solicitados-pagina-de-1")).toEqual({ claves: ["B1"], total: 2 });
    expect(caso("sat-solicitados-completo")).toEqual({ claves: ["B1", "B2"], total: 2 });
  });

  it("R456/R458 satélite: un trozo del final «0b02» encuentra B2; el primer bloque, nada", () => {
    expect(caso("sat-solicitados-entero-trozo")).toEqual({ claves: ["B2"], total: 1 });
    expect(caso("sat-solicitados-primer-bloque")).toEqual({ claves: [], total: 0 });
  });
});
