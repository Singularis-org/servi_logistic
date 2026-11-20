import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { CierreDiaService } from "@/lib/services/CierreDiaService";
import {
  CierreDiaRepository,
  idsDeCierresPorFolio,
} from "@/lib/repositories/CierreDiaRepository";
import type { ITarifaVigenteRepository } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import type { IZonaRepository } from "@/lib/interfaces/repositories/IZonaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { ITarifaZonaMensajeroRepository } from "@/lib/interfaces/repositories/ITarifaZonaMensajeroRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { FiltrosColaPropia } from "@/lib/types/filtros-cierres";
import { reglasPaisFijas } from "@/tests/fabricas/reglas-pais";
import { comoApp, crearOrganizacion } from "@/tests/fabricas/organizaciones";

import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";

/**
 * SLT-138 «/cierre-dia: buscador y filtros de la cola del mensajero» (T1.6; R169-R174) — los filtros
 * de «Cierres solicitados» contra Postgres real: el `WHERE` de Prisma y la lectura a mano del folio.
 *
 * EL CORPUS (una empresa propia, en una transaccion que SIEMPRE se revierte). Los ids se fijan a mano
 * para conocer el folio (los ultimos 8 caracteres, R156): `<8 hex por corrida>-0000-4000-8000-0000<folio>`.
 *
 *   | Cierre | Mensajero | Estado     | solicitado_at (UTC) | Hora en CR    | Folio     |
 *   | K1     | M         | aprobado   | 2026-11-03 06:00    | 03-nov 00:00  | 3F2A0001  |
 *   | K2     | M         | rechazado  | 2026-11-05 05:59    | 04-nov 23:59  | A13F2A02  |
 *   | K3     | M         | solicitado | 2026-11-05 06:00    | 05-nov 00:00  | 0000BEEF  |
 *   | K4     | M         | vencido    | 2026-11-03 05:59    | 02-nov 23:59  | 3F2B0004  |
 *   | K5     | M         | aprobado   | 2026-11-04 12:00    | 04-nov 06:00  | 00000005  | «3F2A» en el id, fuera del folio
 *   | K6     | M2        | aprobado   | 2026-11-04 12:00    | 04-nov 06:00  | 3F2A0006  |
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catalogos, FALLA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SUFIJO = `slt138-${Date.now().toString(36)}`;
const PREFIJO = randomBytes(4).toString("hex"); // 8 hex por corrida: no choca con otra corrida
const PREFIJO_K5 = randomBytes(2).toString("hex");

type Clave = "K1" | "K2" | "K3" | "K4" | "K5" | "K6";
type Estado = "aprobado" | "rechazado" | "solicitado" | "vencido";

const FILAS: Record<Clave, { m: "M" | "M2"; estado: Estado; at: string; id: string }> = {
  K1: { m: "M", estado: "aprobado", at: "2026-11-03T06:00:00.000Z", id: `${PREFIJO}-0000-4000-8000-00003f2a0001` },
  K2: { m: "M", estado: "rechazado", at: "2026-11-05T05:59:00.000Z", id: `${PREFIJO}-0000-4000-8000-0000a13f2a02` },
  K3: { m: "M", estado: "solicitado", at: "2026-11-05T06:00:00.000Z", id: `${PREFIJO}-0000-4000-8000-00000000beef` },
  K4: { m: "M", estado: "vencido", at: "2026-11-03T05:59:00.000Z", id: `${PREFIJO}-0000-4000-8000-00003f2b0004` },
  K5: { m: "M", estado: "aprobado", at: "2026-11-04T12:00:00.000Z", id: `3f2a${PREFIJO_K5}-0000-4000-8000-000000000005` },
  K6: { m: "M2", estado: "aprobado", at: "2026-11-04T12:00:00.000Z", id: `${PREFIJO}-0000-4000-8000-00003f2a0006` },
};

const ID_A_CLAVE = new Map<string, Clave>(
  (Object.keys(FILAS) as Clave[]).map((k) => [FILAS[k].id, k]),
);

interface Resultado {
  claves: Array<Clave | "?">;
  total: number;
}

interface Medida {
  casos: Record<string, Resultado>;
  folioSql: Record<string, Array<Clave | "?">>;
}

async function sembrar(
  tx: TxDeTest,
  cat: { rolMensajero: string; tipoIdentificacion: string },
): Promise<{ M: string; M2: string }> {
  const zonaId = (
    await tx.zona.create({
      data: { nombre: `Zona ${SUFIJO}`, sinpeNumero: "88880000", sinpeNombre: "Zona de prueba" },
      select: { id: true },
    })
  ).id;

  const usuario = async (clave: string) =>
    (
      await tx.usuario.create({
        data: {
          nombre: `U ${clave}`,
          email: `u-${clave}-${SUFIJO}@example.test`,
          telefono: "88880000",
          passwordHash: "x",
          cedula: `C-${clave}-${SUFIJO}`,
          tipoIdentificacionId: cat.tipoIdentificacion,
          rolId: cat.rolMensajero,
        },
        select: { id: true },
      })
    ).id;
  const mensajeros = { M: await usuario("m"), M2: await usuario("m2") };

  for (const f of Object.values(FILAS)) {
    await tx.cierreDia.create({
      data: {
        id: f.id,
        mensajeroId: mensajeros[f.m],
        estado: f.estado,
        destinoTipo: "bodega_central",
        destinoZonaId: zonaId,
        solicitadoAt: new Date(f.at),
      },
    });
  }
  return mensajeros;
}

function servicio(tx: TxDeTest): CierreDiaService {
  return new CierreDiaService(
    new CierreDiaRepository(tx as unknown as PrismaClient, {} as unknown as ITarifaVigenteRepository),
    {} as unknown as IZonaRepository,
    {} as unknown as IOrdenRepository,
    {} as unknown as ISignedUrlProvider,
    {} as unknown as ITarifaZonaMensajeroRepository,
    undefined,
    undefined,
    reglasPaisFijas(), // Costa Rica, UTC−6
  );
}

function claves(items: ReadonlyArray<{ cierreId: string }>): Array<Clave | "?"> {
  return items.map((i) => ID_A_CLAVE.get(i.cierreId) ?? "?");
}

describeSiHayBase("SLT-138 — filtros de «Cierres solicitados» del mensajero, contra Postgres real", () => {
  let prisma: PrismaClient;
  let medida: Medida | undefined;
  let fallo: unknown;

  function caso(nombre: string): Resultado {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llego a tomarse");
    const r = medida.casos[nombre];
    if (r === undefined) throw new Error(`caso sin medir: ${nombre}`);
    return r;
  }
  function folioSql(nombre: string): Array<Clave | "?"> {
    if (fallo !== undefined) throw fallo;
    const r = medida?.folioSql[nombre];
    if (r === undefined) throw new Error(`lectura sin medir: ${nombre}`);
    return r;
  }

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const rol = await prisma.rol.findFirst({ where: { value: "mensajero" }, select: { id: true } });
    const tipo = await prisma.tipoIdentificacion.findFirst({ select: { id: true } });
    if (rol === null || tipo === null) {
      throw new Error(
        "faltan catalogos (`rol` mensajero o `tipo_identificacion`): corre " +
          "`pnpm exec prisma migrate deploy` y `pnpm run db:seed` antes de esta suite.",
      );
    }

    try {
      medida = await enTransaccionRevertida(prisma, async (tx) => {
        await serializarEscriturasReales(tx);
        const { M } = await sembrar(tx, { rolMensajero: rol.id, tipoIdentificacion: tipo.id });
        const actor: Actor = { usuarioId: M, rol: "mensajero" };
        const svc = servicio(tx);
        const casos: Record<string, Resultado> = {};

        const pagina = async (nombre: string, filtros?: FiltrosColaPropia, pageSize = 50) => {
          const r = await svc.listarCierresPasadosPaginado(
            filtros === undefined ? { page: 1, pageSize } : { page: 1, pageSize, filtros },
            actor,
          );
          if (r.status !== "ok") throw new Error(`${nombre}: ${r.status}`);
          casos[nombre] = { claves: claves(r.items), total: r.total };
        };
        const archivo = async (nombre: string, filtros?: FiltrosColaPropia) => {
          const r = await svc.listarCierresPasadosCompleto(actor, filtros);
          if (r.status !== "ok") throw new Error(`${nombre}: ${r.status}`);
          casos[nombre] = { claves: claves(r.items), total: r.total };
        };

        await pagina("1-sin-parametro");
        await pagina("1-bloque-vacio", {});
        await pagina("2-folio", { folio: " #3f2a " });
        await pagina("3-un-dia", { desde: "2026-11-04", hasta: "2026-11-04" });
        await pagina("4-desde", { desde: "2026-11-03" });
        await pagina("5-estado", { estados: ["aprobado"] });
        await pagina("6-combinados", {
          folio: "3F2A",
          estados: ["rechazado"],
          desde: "2026-11-04",
          hasta: "2026-11-04",
        });
        await pagina("7-folio-imposible", { folio: "ZZ" });
        await pagina("8-pagina-de-1", { estados: ["aprobado"] }, 1);
        await archivo("9-archivo-estado", { estados: ["aprobado"] });
        await archivo("10-archivo-sin-filtros");

        const folio = async (texto: string) =>
          (await idsDeCierresPorFolio(tx, M, texto)).map((id) => ID_A_CLAVE.get(id) ?? "?");
        const folioSqlMedido: Record<string, Array<Clave | "?">> = {
          "11-3F2A": await folio("3F2A"),
          // Comodines de LIKE: con `strpos` son texto literal y no casan con nada.
          "porcentaje": await folio("%"),
          "guion-bajo": await folio("_"),
        };

        // Empresa: la lectura a mano no escribe `organizacion_id`; la acota la RLS. Como la app
        // (rol `servi_app`), con la empresa propia ve K1/K2; con otra empresa, nada.
        const { organizacionId } = await tx.cierreDia.findUniqueOrThrow({
          where: { id: FILAS.K1.id },
          select: { organizacionId: true },
        });
        const otra = (await crearOrganizacion(tx)).id;
        await comoApp(tx, organizacionId);
        folioSqlMedido["rls-propia"] = await folio("3F2A");
        await comoApp(tx, otra);
        folioSqlMedido["rls-otra"] = await folio("3F2A");

        return { casos, folioSql: folioSqlMedido };
      });
    } catch (e) {
      fallo = e;
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("1. sin filtros (sin el parámetro o con el bloque vacío): los de siempre, en el orden de siempre (R173)", () => {
    for (const nombre of ["1-sin-parametro", "1-bloque-vacio"]) {
      const r = caso(nombre);
      expect(r.claves, nombre).toHaveLength(5);
      expect(r.total, nombre).toBe(5);
      expect(r.claves, nombre).toEqual(["K3", "K2", "K5", "K1", "K4"]);
    }
  });

  it("2. folio « #3f2a »: contiene, en cualquier posición del folio; K5 (fuera del folio) y K6 no (R171)", () => {
    const r = caso("2-folio");
    expect(r.claves).toHaveLength(2);
    expect(r.total).toBe(2);
    expect(r.claves).toEqual(["K2", "K1"]);
  });

  it("3. desde = hasta = 04-nov en hora de CR: 23:59 entra, 00:00 del 5 no (R169)", () => {
    const r = caso("3-un-dia");
    expect(r.claves).toHaveLength(2);
    expect(r.total).toBe(2);
    expect(r.claves).toEqual(["K2", "K5"]);
  });

  it("4. desde 03-nov: las 00:00 del 3 entran, las 23:59 del 2 no (R169)", () => {
    const r = caso("4-desde");
    expect(r.claves).toHaveLength(4);
    expect(r.total).toBe(4);
    expect(r.claves).toEqual(["K3", "K2", "K5", "K1"]);
  });

  it("5. estado aprobado: solo los del mensajero, K6 no (R170, R172)", () => {
    const r = caso("5-estado");
    expect(r.claves).toHaveLength(2);
    expect(r.total).toBe(2);
    expect(r.claves).toEqual(["K5", "K1"]);
  });

  it("6. folio + estado + rango, combinados a la vez (R172)", () => {
    const r = caso("6-combinados");
    expect(r.claves).toHaveLength(1);
    expect(r.total).toBe(1);
    expect(r.claves).toEqual(["K2"]);
  });

  it("7. folio imposible «ZZ»: cero cierres y total 0 (R171)", () => {
    const r = caso("7-folio-imposible");
    expect(r.claves).toHaveLength(0);
    expect(r.total).toBe(0);
  });

  it("8. con pageSize 1 el total es el del conjunto filtrado, no la página (R172)", () => {
    const r = caso("8-pagina-de-1");
    expect(r.claves).toHaveLength(1);
    expect(r.total).toBe(2);
    expect(r.claves).toEqual(["K5"]);
  });

  it("9. el archivo con estado aprobado lleva TODOS los que cumplen, no la página (R174)", () => {
    const r = caso("9-archivo-estado");
    expect(r.claves).toHaveLength(2);
    expect(r.total).toBe(2);
    expect(r.claves).toEqual(["K5", "K1"]);
  });

  it("10. el archivo sin filtros: los de siempre (R173)", () => {
    const r = caso("10-archivo-sin-filtros");
    expect(r.claves).toHaveLength(5);
    expect(r.total).toBe(5);
    expect(r.claves).toEqual(["K3", "K2", "K5", "K1", "K4"]);
  });

  it("11. la lectura a mano del folio también va por mensajero: K1 y K2, no K6 (R172)", () => {
    const r = folioSql("11-3F2A");
    expect(r).toHaveLength(2);
    expect([...r].sort()).toEqual(["K1", "K2"]);
  });

  it("12. «%» y «_» no son comodines en la lectura del folio: cero filas (R171)", () => {
    expect(folioSql("porcentaje")).toEqual([]);
    expect(folioSql("guion-bajo")).toEqual([]);
  });

  it("13. la lectura a mano del folio la acota la empresa (RLS): otra empresa no ve nada (R172)", () => {
    const propia = folioSql("rls-propia");
    expect(propia).toHaveLength(2);
    expect([...propia].sort()).toEqual(["K1", "K2"]);
    expect(folioSql("rls-otra")).toEqual([]);
  });
});
