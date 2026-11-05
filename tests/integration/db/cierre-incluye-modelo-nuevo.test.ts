import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient, type TarifaModelo } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { cierresConModeloNuevo } from "@/lib/repositories/_shared/detalle-modelo-nuevo";
import { CierreBodegaRepository } from "@/lib/repositories/CierreBodegaRepository";
import { CierreDiaRepository } from "@/lib/repositories/CierreDiaRepository";
import { CierresAdminRepository } from "@/lib/repositories/CierresAdminRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { TarifaZonaMensajeroRepository } from "@/lib/repositories/TarifaZonaMensajeroRepository";
import { WalletMovimientoRepository } from "@/lib/repositories/WalletMovimientoRepository";
import { CierreBodegaService } from "@/lib/services/CierreBodegaService";
import { CierreDiaService } from "@/lib/services/CierreDiaService";
import { CierresAdminService } from "@/lib/services/CierresAdminService";
import { comoApp, crearOrganizacion, fijarEmpresa, sembrarActivacion } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  crearPrismaDeTestConEspia,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type EventoSqlDeTest,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SLT-54 (R71 y menor 6 de la revision F2.2) — `incluyeModeloNuevo` EN LOS DTO, CONTRA POSTGRES REAL.
//
// Lo que se prueba vive en el SQL: el conteo filtrado de la cabecera y la lectura en lote del libro de la
// caja. Cada superficie se lee como `servi_app`, con la RLS puesta, por el servicio que usa la pantalla
// (listado y consolidacion) o por el repositorio (libro). Cada mapa se consulta por el id sembrado: un id
// ausente da `undefined` y el caso se pone rojo, asi que ninguno puede pasar con la lectura vacia.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const SATELITE = "bodega_satelite" as const;
const PAGINA = { page: 1, pageSize: 25 };

let base: PrismaClient;

beforeAll(() => {
  if (!HAY_BASE_DE_DATOS) return;
  base = crearPrismaDeTest();
});

afterAll(async () => {
  if (base) await base.$disconnect();
});

let siguienteGuia = 945_000_000 + Math.floor(Math.random() * 4_000_000);

interface Empresa {
  org: string;
  fks: FksDeOrden;
  M: string;
}

async function crearEmpresa(tx: TxDeTest): Promise<Empresa> {
  const org = (await crearOrganizacion(tx)).id;
  await fijarEmpresa(tx, org);
  const fks = await crearFksDeOrden(tx);
  const M = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  return { org, fks, M };
}

async function crearOrden(tx: TxDeTest, fks: FksDeOrden): Promise<string> {
  siguienteGuia += 1;
  const orden = await tx.orden.create({
    data: {
      numGuia: siguienteGuia,
      numRemision: `R-SLT54H-${randomUUID().slice(0, 12)}`,
      destinatario: "Modelo SLT-54",
      telefonoDest: "88880000",
      producto: "caja",
      estatusId: fks.estatusId,
      tiendaId: fks.tiendaId,
      zonaId: fks.zonaId,
      provinciaId: fks.provinciaId,
      cantonId: fks.cantonId,
      montoCobrar: new Prisma.Decimal("1000.00"),
      cobraComision: false,
    },
    select: { id: true },
  });
  return orden.id;
}

async function crearDetalle(tx: TxDeTest, e: Empresa, cierreId: string, modelo: TarifaModelo): Promise<void> {
  await tx.cierreDetail.create({
    data: {
      cierreId,
      ordenId: await crearOrden(tx, e.fks),
      cobraComision: false,
      zonaId: e.fks.zonaId,
      tiendaId: e.fks.tiendaId,
      esCentral: false,
      tarifaModelo: modelo,
      numRemision: "R-1",
      destinatario: "Modelo SLT-54",
      producto: "caja",
      tiendaNombre: "T",
      zonaNombre: "Z",
      provinciaNombre: "P",
      cantonNombre: "C",
    },
  });
}

/** Un `cierre_dia` aprobado de la satelite con una fila de detalle por cada modelo pedido. */
async function crearCierre(tx: TxDeTest, e: Empresa, modelos: readonly TarifaModelo[]): Promise<string> {
  const cierre = await tx.cierreDia.create({
    data: { mensajeroId: e.M, estado: "aprobado", destinoTipo: SATELITE, destinoZonaId: e.fks.zonaId },
    select: { id: true },
  });
  for (const modelo of modelos) await crearDetalle(tx, e, cierre.id, modelo);
  return cierre.id;
}

async function crearMovimiento(
  tx: TxDeTest,
  origenId: string,
  origenTipo: "cierre_dia" | "gestion_orden" = "cierre_dia",
): Promise<string> {
  const fila = await tx.walletMovimiento.create({
    data: {
      tipo: "ingreso",
      categoria: "ingreso_flete_devolucion",
      monto: new Prisma.Decimal("282.50"),
      origenTipo,
      origenId,
      descripcion: "marca-slt54h",
    },
    select: { id: true },
  });
  return fila.id;
}

async function comoEmpresa<T>(tx: TxDeTest, org: string, fn: () => Promise<T>): Promise<T> {
  await comoApp(tx, org);
  try {
    return await fn();
  } finally {
    await tx.$executeRawUnsafe("RESET ROLE");
  }
}

function servicioListado(cli: PrismaClient, zonaId: string) {
  const nada = {} as never;
  return new CierresAdminService(
    new CierresAdminRepository(cli, nada, nada, nada, nada, nada, nada, nada),
    nada,
    {
      findUsuarioZonaId: async () => zonaId,
      contarCierresAbiertosPorMensajero: async () => new Map(),
    } as never,
    nada,
    { sumarVigentesPorCierre: async () => ({}), obtenerCierreParaPago: async () => null } as never,
    { sumarPremiosVivosPorCierre: async () => ({}) } as never,
    { contarPorCierre: async () => new Map() } as never,
  );
}

function servicioConsolidacion(cli: PrismaClient, zonaId: string) {
  return new CierreBodegaService(new CierreBodegaRepository(cli), {
    findUsuarioZonaId: async () => zonaId,
  } as never);
}

interface Lectura {
  /** `CierreAdminResumen` por cierre: la tarjeta del listado. */
  tarjeta: Map<string, boolean | undefined>;
  /** `CierreBodegaResumenLite` por cierre: la tarjeta de la consolidacion. */
  consolidable: Map<string, boolean | undefined>;
  /** `ListarConsolidacionServiceResult.incluyeModeloNuevoAgregado`: el total de la consolidacion. */
  agregado: boolean;
  /** `WalletMovimientoDTO` por movimiento, por la rama de Prisma y por la de SQL del libro. */
  libro: Map<string, boolean | undefined>;
  libroConTermino: Map<string, boolean | undefined>;
}

/** Lee las cuatro superficies como la empresa `e`, con la RLS puesta. */
async function leer(tx: TxDeTest, e: Empresa): Promise<Lectura> {
  const actor: Actor = { usuarioId: "adminSatelite-del-test", rol: "adminSatelite" };
  return comoEmpresa(tx, e.org, async () => {
    const cli = clienteConSavepoint(tx);
    const listado = await servicioListado(cli, e.fks.zonaId).listarHistoricoCierresAdminPaginado(PAGINA, actor);
    if (listado.status !== "ok") throw new Error("el listado no devolvio ok");
    const consolidacion = await servicioConsolidacion(cli, e.fks.zonaId).listarConsolidacion(actor);
    if (consolidacion.status !== "ok") throw new Error("la consolidacion no devolvio ok");
    const libro = new WalletMovimientoRepository(cli);
    const pagina = await libro.listar(PAGINA);
    const conTermino = await libro.listar({ ...PAGINA, termino: "marca-slt54h" });
    return {
      tarjeta: new Map(listado.items.map((c) => [c.cierreId, c.incluyeModeloNuevo])),
      consolidable: new Map(consolidacion.consolidables.map((c) => [c.cierreDiaId, c.incluyeModeloNuevo])),
      agregado: consolidacion.incluyeModeloNuevoAgregado,
      libro: new Map(pagina.movimientos.map((m) => [m.id, m.incluyeModeloNuevo])),
      libroConTermino: new Map(conTermino.movimientos.map((m) => [m.id, m.incluyeModeloNuevo])),
    };
  });
}

/** Un cierre con su movimiento, medido en las cuatro superficies. */
function afirmar(l: Lectura, cierreId: string, movimientoId: string, esperado: boolean) {
  expect(l.tarjeta.get(cierreId)).toBe(esperado);
  expect(l.consolidable.get(cierreId)).toBe(esperado);
  expect(l.libro.get(movimientoId)).toBe(esperado);
  expect(l.libroConTermino.get(movimientoId)).toBe(esperado);
}

describeSiHayBase("SLT-54 R71 — incluyeModeloNuevo, contra Postgres", () => {
  it("solo viejo: falso en la tarjeta, en la consolidacion, en su total y en el libro", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["viejo", "viejo"]);
      const movimiento = await crearMovimiento(tx, cierre);
      return { cierre, movimiento, l: await leer(tx, e) };
    });
    afirmar(r.l, r.cierre, r.movimiento, false);
    expect(r.l.agregado).toBe(false);
  });

  it("un cierre sin ninguna fila de detalle se lee como viejo", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, []);
      const movimiento = await crearMovimiento(tx, cierre);
      return { cierre, movimiento, l: await leer(tx, e) };
    });
    afirmar(r.l, r.cierre, r.movimiento, false);
    expect(r.l.agregado).toBe(false);
  });

  it("solo nuevo: verdadero en las cuatro, con una sola gestion basta", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["nuevo"]);
      const movimiento = await crearMovimiento(tx, cierre);
      const porId = await comoEmpresa(tx, e.org, () =>
        new WalletMovimientoRepository(clienteConSavepoint(tx)).obtenerPorId(movimiento),
      );
      return { cierre, movimiento, porId, l: await leer(tx, e) };
    });
    afirmar(r.l, r.cierre, r.movimiento, true);
    expect(r.l.agregado).toBe(true);
    expect(r.porId?.incluyeModeloNuevo).toBe(true);
  });

  it("mixto dentro de un cierre: verdadero", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["viejo", "nuevo", "viejo"]);
      const movimiento = await crearMovimiento(tx, cierre);
      return { cierre, movimiento, l: await leer(tx, e) };
    });
    afirmar(r.l, r.cierre, r.movimiento, true);
    expect(r.l.agregado).toBe(true);
  });

  it("mixto entre cierres: cada tarjeta dice el suyo y el total de la consolidacion, verdadero", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const viejo = await crearCierre(tx, e, ["viejo"]);
      const nuevo = await crearCierre(tx, e, ["nuevo"]);
      const movViejo = await crearMovimiento(tx, viejo);
      const movNuevo = await crearMovimiento(tx, nuevo);
      return { viejo, nuevo, movViejo, movNuevo, l: await leer(tx, e) };
    });
    afirmar(r.l, r.viejo, r.movViejo, false);
    afirmar(r.l, r.nuevo, r.movNuevo, true);
    expect(r.l.agregado).toBe(true);
  });

  it("empresa activada: el cierre de antes de activar sigue en falso y el siguiente sale verdadero", async () => {
    const solicitar = async (tx: TxDeTest, e: Empresa, M: string): Promise<string> => {
      const ordenId = await crearOrden(tx, e.fks);
      await tx.gestionOrden.create({
        data: {
          ordenId,
          mensajeroId: M,
          resultado: "entregado",
          montoRecibido: new Prisma.Decimal("1000.00"),
          pagos: { create: [{ metodo: "efectivo", monto: new Prisma.Decimal("1000.00") }] },
        },
      });
      const r = await comoEmpresa(tx, e.org, () => {
        const cli = clienteConSavepoint(tx);
        return new CierreDiaService(
          new CierreDiaRepository(cli, new TarifaVigenteRepository(cli)),
          { findCentralZonaId: async () => e.fks.zonaId } as never,
          {
            findUsuarioZonaId: async () => e.fks.zonaId,
            findUsuarioVehiculoId: async () => null,
            findEstatusIdByValue: async () => null,
            findOrdenesEnCorreccion: async () => new Set<string>(),
            findBloqueoDetalle: async () => ({
              bloqueado: false,
              cierresAbiertos: 0,
              cierresPorReenviar: 0,
              aResolverPrimero: null,
              resolicitableMasViejo: null,
            }),
          } as never,
          {} as never,
          new TarifaZonaMensajeroRepository(cli),
        ).solicitarCierre({ usuarioId: M, rol: "mensajero" });
      });
      if (r.status !== "ok" || r.cierreId === undefined) {
        throw new Error(`la solicitud no creo el cierre: ${JSON.stringify(r)}`);
      }
      // El cierre lo decide la solicitud real. Aqui solo se lleva a donde lo leen las dos pantallas.
      await tx.cierreDia.update({
        where: { id: r.cierreId },
        data: { estado: "aprobado", destinoTipo: SATELITE },
      });
      return r.cierreId;
    };

    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const anterior = await solicitar(tx, e, e.M);
      const movAnterior = await crearMovimiento(tx, anterior);
      const leidoAntes = await leer(tx, e);

      await sembrarActivacion(tx, e.org);
      const leidoSoloAnterior = await leer(tx, e);

      const M2 = (await crearUsuarioDePrueba(tx, "mensajero")).id;
      const posterior = await solicitar(tx, e, M2);
      const movPosterior = await crearMovimiento(tx, posterior);

      const modelos = await tx.cierreDetail.findMany({
        where: { cierreId: { in: [anterior, posterior] } },
        select: { cierreId: true, tarifaModelo: true },
      });
      return {
        anterior,
        posterior,
        movAnterior,
        movPosterior,
        modelos: new Map(modelos.map((m) => [m.cierreId, m.tarifaModelo])),
        leidoAntes,
        leidoSoloAnterior,
        l: await leer(tx, e),
      };
    });

    // Lo sembrado, medido: la solicitud real congelo cada cierre con su modelo.
    expect(r.modelos.get(r.anterior)).toBe("viejo");
    expect(r.modelos.get(r.posterior)).toBe("nuevo");

    afirmar(r.leidoAntes, r.anterior, r.movAnterior, false);
    // Activar no mueve lo congelado, ni con la empresa ya activada y ese cierre como unico conjunto.
    afirmar(r.leidoSoloAnterior, r.anterior, r.movAnterior, false);
    expect(r.leidoSoloAnterior.agregado).toBe(false);

    afirmar(r.l, r.anterior, r.movAnterior, false);
    afirmar(r.l, r.posterior, r.movPosterior, true);
    expect(r.l.agregado).toBe(true);
  });

  it("otra empresa no contamina: B en nuevo no asoma en A, y A no ve sus filas", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const B = await crearEmpresa(tx);
      const deB = await crearCierre(tx, B, ["nuevo"]);
      const movDeB = await crearMovimiento(tx, deB);

      const A = await crearEmpresa(tx);
      const deA = await crearCierre(tx, A, ["viejo"]);
      const movDeA = await crearMovimiento(tx, deA);

      // `origen_id` es polimorfico y no tiene FK, asi que un movimiento de A puede apuntar al cierre de B:
      // esa lectura la para la RLS de `cierre_detail`. Sin el rol de la app se veria, y la contraprueba
      // de abajo lo mide. El cruce por detalle no hace falta probarlo: lo rechaza el trigger de la tabla.
      const movDeAConOrigenEnB = await crearMovimiento(tx, deB);
      const sinRls = await cierresConModeloNuevo(tx, [deB]);

      const lecturaDeA = await leer(tx, A);
      await fijarEmpresa(tx, B.org);
      const lecturaDeB = await leer(tx, B);
      return { deA, deB, movDeA, movDeB, movDeAConOrigenEnB, sinRls, lecturaDeA, lecturaDeB };
    });

    expect([...r.sinRls]).toEqual([r.deB]);

    afirmar(r.lecturaDeA, r.deA, r.movDeA, false);
    expect(r.lecturaDeA.agregado).toBe(false);
    expect(r.lecturaDeA.libro.get(r.movDeAConOrigenEnB)).toBe(false);
    expect(r.lecturaDeA.tarjeta.has(r.deB)).toBe(false);
    expect(r.lecturaDeA.consolidable.has(r.deB)).toBe(false);
    expect(r.lecturaDeA.libro.has(r.movDeB)).toBe(false);

    // Contraprueba: el mismo cierre de B, leido por B, si es del modelo nuevo.
    afirmar(r.lecturaDeB, r.deB, r.movDeB, true);
    expect(r.lecturaDeB.agregado).toBe(true);
  });

  it("solo un movimiento con origen `cierre_dia` mira el detalle, aunque su id coincida", async () => {
    const r = await enTransaccionRevertida(base, async (tx) => {
      await serializarEscriturasReales(tx);
      const e = await crearEmpresa(tx);
      const cierre = await crearCierre(tx, e, ["nuevo"]);
      const movimiento = await crearMovimiento(tx, cierre, "gestion_orden");
      return { movimiento, l: await leer(tx, e) };
    });
    expect(r.l.libro.get(r.movimiento)).toBe(false);
    expect(r.l.libroConTermino.get(r.movimiento)).toBe(false);
  });

  describe("sin una consulta por fila", () => {
    const { prisma: espia, eventos } = HAY_BASE_DE_DATOS
      ? crearPrismaDeTestConEspia()
      : { prisma: undefined as unknown as PrismaClient, eventos: [] as EventoSqlDeTest[] };

    afterAll(async () => {
      if (HAY_BASE_DE_DATOS) await espia.$disconnect();
    });

    /** Las sentencias que tocan `cierre_detail` mientras corre `fn`. */
    async function sentencias<T>(fn: () => Promise<T>): Promise<{ valor: T; n: number }> {
      eventos.length = 0;
      const valor = await fn();
      return { valor, n: eventos.filter((ev) => ev.query.includes('"cierre_detail"')).length };
    }

    it("tres cierres cuestan una sentencia en cada lectura, y una pagina sin cierres ninguna", async () => {
      const r = await enTransaccionRevertida(espia, async (tx) => {
        await serializarEscriturasReales(tx);
        const e = await crearEmpresa(tx);
        const actor: Actor = { usuarioId: "adminSatelite-del-test", rol: "adminSatelite" };
        const sinCierres = await tx.walletMovimiento.create({
          data: {
            tipo: "ingreso",
            categoria: "ingreso_ajuste",
            monto: new Prisma.Decimal("1.00"),
            origenTipo: "manual",
            descripcion: "marca-slt54h-manual",
          },
          select: { id: true },
        });
        const paginaSinCierres = await comoEmpresa(tx, e.org, () =>
          sentencias(() => new WalletMovimientoRepository(clienteConSavepoint(tx)).listar(PAGINA)),
        );
        for (let i = 0; i < 3; i += 1) {
          await crearMovimiento(tx, await crearCierre(tx, e, ["nuevo"]));
        }
        return comoEmpresa(tx, e.org, async () => {
          const cli = clienteConSavepoint(tx);
          const libro = await sentencias(() => new WalletMovimientoRepository(cli).listar(PAGINA));
          const listado = await sentencias(() =>
            new CierresAdminRepository(cli, ...nadaDeRepo()).findHistoricoPaginado(
              { destinoTipo: SATELITE, destinoZonaId: e.fks.zonaId },
              { skip: 0, take: 25 },
            ),
          );
          const consolidables = await sentencias(() =>
            servicioConsolidacion(cli, e.fks.zonaId).listarConsolidacion(actor),
          );
          return { sinCierres: sinCierres.id, paginaSinCierres, libro, listado, consolidables };
        });
      });

      expect(r.paginaSinCierres.valor.movimientos.map((m) => m.id)).toEqual([r.sinCierres]);
      expect(r.paginaSinCierres.n).toBe(0);

      expect(r.libro.valor.movimientos.filter((m) => m.incluyeModeloNuevo === true)).toHaveLength(3);
      expect(r.libro.n).toBe(1);

      expect(r.listado.valor.items.filter((c) => c.incluyeModeloNuevo === true)).toHaveLength(3);
      expect(r.listado.n).toBe(1);

      const c = r.consolidables.valor;
      if (c.status !== "ok") throw new Error("la consolidacion no devolvio ok");
      expect(c.consolidables.filter((x) => x.incluyeModeloNuevo === true)).toHaveLength(3);
      expect(r.consolidables.n).toBe(1);
    });
  });
});

function nadaDeRepo(): [never, never, never, never, never, never, never] {
  const nada = {} as never;
  return [nada, nada, nada, nada, nada, nada, nada];
}
