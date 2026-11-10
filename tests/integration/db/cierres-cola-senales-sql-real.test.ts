import { randomUUID } from "node:crypto";

import { Prisma, type GestionResultado, type PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { SenalesColaCierre } from "@/lib/interfaces/services/ICierresAdminService";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { vuelveABodega } from "@/lib/types/gestion-retorno";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import { crearOrganizacion, fijarEmpresa } from "../../fabricas/organizaciones";
import {
  HAY_BASE_DE_DATOS,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

/**
 * SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T1.2; R70, R109) — las tres
 * señales de la cola, contadas por `contarSenalesPorCierre` contra Postgres real.
 *
 * Los tests de servicio usan dobles y no ven el `WHERE`. Aquí solo pasa si Postgres devuelve de
 * verdad los conteos de los cierres pedidos, de la empresa de la transacción.
 *
 * EL CORPUS (una transacción que SIEMPRE se revierte):
 *   empresa A (la de la transacción):
 *     · cierre A1: incidente SIN indemnizar · incidente indemnizado (5 000,00) · entrega ajustada DOS
 *       veces · entrega sin nada · reprogramado · novedad.
 *       Esperado, a mano: 1 incidente sin indemnizar, 1 pago ajustado, 2 vuelven a bodega.
 *     · cierre A2: una entrega sin nada. Esperado: 0 · 0 · 0 (está en el mapa: tiene gestiones).
 *     · cierre A3: un incidente sin indemnizar y una novedad. NO se pide: no puede salir.
 *   empresa B:
 *     · cierre B1: un incidente sin indemnizar, una entrega ajustada y una devolución. Se pide junto
 *       con A1 y A2 y NO puede salir: es de otra empresa.
 *
 * Sin base se SALTA (`describe.skip`, visible en la salida); con base y sin catálogos, FALLA.
 */

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

/** Guía única por corrida: `orden.num_guia` es UNIQUE global (SL-18). */
let siguienteGuia = 930_000_000 + Math.floor(Math.random() * 30_000_000);

interface GestionSembrada {
  resultado: GestionResultado;
  indemnizacion?: string;
  ajustes?: number;
}

interface Empresa {
  fks: Awaited<ReturnType<typeof crearFksDeOrden>>;
  mensajeroId: string;
  adminId: string;
}

async function empresaDeCierres(tx: TxDeTest): Promise<Empresa> {
  const fks = await crearFksDeOrden(tx);
  const mensajero = await crearUsuarioDePrueba(tx, "mensajero");
  const admin = await crearUsuarioDePrueba(tx, "admin");
  return { fks, mensajeroId: mensajero.id, adminId: admin.id };
}

async function sembrarCierre(tx: TxDeTest, e: Empresa, gestiones: GestionSembrada[]): Promise<string> {
  const cero = new Prisma.Decimal("0.00");
  const cierre = await tx.cierreDia.create({
    data: {
      mensajeroId: e.mensajeroId,
      estado: "solicitado",
      destinoTipo: "bodega_central",
      destinoZonaId: e.fks.zonaId,
      totalEfectivo: cero,
      totalSimpe: cero,
      totalTransferencia: cero,
      totalGeneral: cero,
      totalPagoMensajero: cero,
      totalIngresoBodegaRechazos: cero,
    },
    select: { id: true },
  });
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  for (const [i, g] of gestiones.entries()) {
    siguienteGuia += 1;
    const orden = await tx.orden.create({
      data: {
        numGuia: siguienteGuia,
        numRemision: `R-102-${sufijo}-${i}`,
        destinatario: "Corpus SLT-102",
        telefonoDest: "88880000",
        producto: "caja",
        estatusId: e.fks.estatusId,
        tiendaId: e.fks.tiendaId,
        zonaId: e.fks.zonaId,
        provinciaId: e.fks.provinciaId,
        cantonId: e.fks.cantonId,
      },
      select: { id: true },
    });
    // El detalle del cierre sale del snapshot (feature 69): sin su fila, `findCierreByIdEnAlcance` aborta.
    await tx.cierreDetail.create({
      data: {
        cierreId: cierre.id,
        ordenId: orden.id,
        montoCobrar: cero,
        cobraComision: false,
        zonaId: e.fks.zonaId,
        tiendaId: e.fks.tiendaId,
        esCentral: false,
        esZonaEspecial: false,
        tarifaModelo: "nuevo",
        numRemision: `R-102-${sufijo}-${i}`,
        destinatario: "Corpus SLT-102",
        producto: "caja",
        tiendaNombre: "Tienda SLT-102",
        zonaNombre: "Zona SLT-102",
        provinciaNombre: "Provincia",
        cantonNombre: "Canton",
      },
    });
    const gestion = await tx.gestionOrden.create({
      data: {
        ordenId: orden.id,
        mensajeroId: e.mensajeroId,
        resultado: g.resultado,
        cierreId: cierre.id,
        pagoMensajero: new Prisma.Decimal("1500.00"),
        ingresoBodegaRechazo: cero,
        ...(g.resultado === "incidente" ? { causaIncidente: "perdido" as const } : {}),
        ...(g.indemnizacion !== undefined ? { indemnizacion: new Prisma.Decimal(g.indemnizacion) } : {}),
      },
      select: { id: true },
    });
    for (let n = 0; n < (g.ajustes ?? 0); n += 1) {
      await tx.gestionPagoMensajeroAjuste.create({
        data: {
          gestionId: gestion.id,
          cierreId: cierre.id,
          pagoAnterior: new Prisma.Decimal(n === 0 ? "1500.00" : "1200.00"),
          pagoNuevo: new Prisma.Decimal(n === 0 ? "1200.00" : "1000.00"),
          actorUsuarioId: e.adminId,
          actorRol: "admin",
          motivo: `ajuste ${n + 1} del corpus SLT-102`,
        },
      });
    }
  }
  return cierre.id;
}

const repoSobre = (tx: TxDeTest): CierresAdminRepository =>
  new CierresAdminRepository(
    tx as unknown as PrismaClient,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

/** El mapa como lista ordenada por la clave que el test le dio a cada cierre. */
function porNombre(
  mapa: Map<string, SenalesColaCierre>,
  nombres: Record<string, string>,
): Array<[string, SenalesColaCierre]> {
  return [...mapa.entries()]
    .map(([id, s]): [string, SenalesColaCierre] => [nombres[id] ?? `desconocido:${id}`, s])
    .sort(([a], [b]) => a.localeCompare(b));
}

interface Resultado {
  conteo: Array<[string, SenalesColaCierre]>;
  vacio: number;
  /** Lo que la lista «Gestiones» del detalle de A1 pinta, contado con la regla de la fila. */
  detalleA1: SenalesColaCierre;
}

describeSiHayBase("SLT-102 — señales de la cola, contra Postgres real (R70, R109)", () => {
  let prisma: PrismaClient;
  let r: Resultado;

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const catalogo = await prisma.rol.findUnique({ where: { value: "mensajero" }, select: { id: true } });
    if (catalogo === null) {
      throw new Error("faltan catálogos: corre `pnpm exec prisma migrate deploy` y `pnpm run db:seed`.");
    }

    r = await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const [{ org: empresaA }] = await tx.$queryRawUnsafe<{ org: string }[]>(
        `SELECT current_setting('app.organizacion_id', true) AS org`,
      );
      if (!empresaA) throw new Error("la transacción no tiene empresa fijada");

      const a = await empresaDeCierres(tx);
      const a1 = await sembrarCierre(tx, a, [
        { resultado: "incidente" },
        { resultado: "incidente", indemnizacion: "5000.00" },
        { resultado: "entregado", ajustes: 2 },
        { resultado: "entregado" },
        { resultado: "reprogramado" },
        { resultado: "novedad" },
      ]);
      const a2 = await sembrarCierre(tx, a, [{ resultado: "entregado" }]);
      const a3 = await sembrarCierre(tx, a, [{ resultado: "incidente" }, { resultado: "novedad" }]);

      const empresaB = (await crearOrganizacion(tx, { nombre: `Empresa B SLT-102 ${randomUUID()}` })).id;
      await fijarEmpresa(tx, empresaB);
      const b = await empresaDeCierres(tx);
      const b1 = await sembrarCierre(tx, b, [
        { resultado: "incidente" },
        { resultado: "entregado", ajustes: 1 },
        { resultado: "devolucion_a_origen_por_rechazo" },
      ]);
      await fijarEmpresa(tx, empresaA);

      const repo = repoSobre(tx);
      const nombres = { [a1]: "A1", [a2]: "A2", [a3]: "A3", [b1]: "B1" };
      const conteo = porNombre(await repo.contarSenalesPorCierre([a1, a2, b1]), nombres);
      const vacio = (await repo.contarSenalesPorCierre([])).size;

      const detalle = await repo.findCierreByIdEnAlcance(
        a1,
        { destinoTipo: "bodega_central", destinoZonaId: a.fks.zonaId },
        ZONA_CR,
      );
      if (detalle === null) throw new Error("el detalle de A1 no se pudo leer");
      const gs = detalle.gestiones;
      return {
        conteo,
        vacio,
        detalleA1: {
          incidentesSinIndemnizar: gs.filter((g) => g.resultado === "incidente" && g.indemnizacion === null)
            .length,
          pagosAjustados: gs.filter((g) => (g.ajustesPago?.length ?? 0) > 0).length,
          vuelvenABodega: gs.filter((g) => vuelveABodega(g.resultado)).length,
        },
      };
    });
  }, 60_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("cuenta, por cierre pedido de la empresa, las tres señales (números escritos a mano)", () => {
    expect(r.conteo).toEqual([
      ["A1", { incidentesSinIndemnizar: 1, pagosAjustados: 1, vuelvenABodega: 2 }],
      ["A2", { incidentesSinIndemnizar: 0, pagosAjustados: 0, vuelvenABodega: 0 }],
    ]);
  });

  it("el cierre de OTRA empresa no se cuela aunque se pida su id", () => {
    expect(r.conteo.map(([n]) => n)).not.toContain("B1");
  });

  it("un cierre de la empresa que no se pidió no sale", () => {
    expect(r.conteo.map(([n]) => n)).not.toContain("A3");
  });

  it("cada conteo es el número de filas con esa señal en la lista «Gestiones» del detalle", () => {
    expect(r.detalleA1).toEqual({ incidentesSinIndemnizar: 1, pagosAjustados: 1, vuelvenABodega: 2 });
    expect(r.conteo.find(([n]) => n === "A1")?.[1]).toEqual(r.detalleA1);
  });

  it("con la lista vacía no consulta nada y devuelve el mapa vacío", () => {
    expect(r.vacio).toBe(0);
  });
});
