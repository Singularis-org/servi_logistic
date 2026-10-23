import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { conAislamientoPorEmpresa } from "@/lib/db/extension-empresa";
import { actualizarDistritosEspeciales } from "@/lib/actions/geografia";
import {
  CierreDiaRepository,
  SNAPSHOT_SELECT,
  leerDescriptivosDeOrdenes,
} from "@/lib/repositories/CierreDiaRepository";
import { CoberturaRepository } from "@/lib/repositories/CoberturaRepository";
import { DistritoZonaEspecialRepository } from "@/lib/repositories/DistritoZonaEspecialRepository";
import { GeoRepository } from "@/lib/repositories/GeoRepository";
import { OrdenRepository } from "@/lib/repositories/OrdenRepository";
import { TarifaVigenteRepository } from "@/lib/repositories/TarifaVigenteRepository";
import { DistritoZonaEspecialService } from "@/lib/services/DistritoZonaEspecialService";
import { crearOrganizacion, fijarEmpresa } from "@/tests/fabricas/organizaciones";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";
import {
  CLAVE_LOCK_ESCRITURA_REAL,
  HAY_BASE_DE_DATOS,
  bajoLockDeEscrituraReal,
  crearPrismaDeTest,
  type FksDeOrden,
  type TxDeTest,
} from "./_postgres-real";

// SL-38 / T8 (design §6) — DOS EMPRESAS DE PUNTA A PUNTA, contra Postgres real.
//
// A marca el distrito D y B no; B marca D2 y A no. Cada una de las nueve lecturas del inventario
// (design «Lo que ya existe») se mide con el REPOSITORIO REAL sobre el cliente de la app
// (`conAislamientoPorEmpresa` + `conEmpresa`): dentro de A, D es especial; dentro de B, no (R14-R21).
// Con dos marcas distintas, «B no ve la de A» convive con «B ve la suya»: un vacio no pasa.
// Ademas: R20 (un cierre de A congela `true`, A desmarca D y la fila congelada sigue en `true`) y R9
// (la accion con el servicio real y un `maestro` de la empresa responde `ok`, no 500).
//
// POR QUE SE COMMITEA LA SIEMBRA. El cliente de la app abre su propia transaccion por consulta: no
// veria filas sin commitear. Se siembra en `beforeAll` y se borra en `afterAll`, por empresa.
//
// SIN DATOS FALLA. `crearFksDeOrden` lanza sin geografia ni catalogos, y el `beforeAll` comprueba
// como dueno las organizaciones, las ordenes y la marca de B. La marca de A NO se comprueba ahi a
// proposito: si faltara, caen los casos de A (que la esperan), no se salta el archivo entero.
//
// Mutaciones (progress/impl_SL-38.md, T8): sin la politica, con `esZonaEspecialDeLaEmpresa` fijo en
// `true` y sin sembrar la marca de A.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Semillas = {
  A: string;
  B: string;
  /** Distrito de Cartago/Cartago que marca A. */
  D: string;
  /** Distrito del mismo canton que marca B. */
  D2: string;
  /** Distrito sin marca de nadie, para la escritura de R9. */
  D3: string;
  fksA: FksDeOrden;
  fksB: FksDeOrden;
  /** Ordenes de A en D y en D2; de B en D y en D2. */
  ordenA: string;
  ordenA2: string;
  ordenB: string;
  ordenB2: string;
  mensajeroA: string;
  mensajeroB: string;
  gestionA: string;
  gestionB: string;
  maestroA: string;
  maestroB: string;
};

let base: PrismaClient;
let app: PrismaClient;
let s: Semillas;

// Tarifa de la tienda en su zona (no central): flete normal 2000 y pacto especial 5000, IVA 13 %.
const FLETE_NORMAL_CON_IVA = "2260.00";
const FLETE_ESPECIAL_CON_IVA = "5650.00";

async function insertarOrden(tx: TxDeTest, fks: FksDeOrden, distritoId: string): Promise<string> {
  const id = randomUUID();
  await tx.$executeRawUnsafe(
    `INSERT INTO orden (id, num_remision, estatus_id, destinatario, telefono_dest, tienda_id, zona_id,
                        provincia_id, canton_id, distrito_id, producto, created_at, updated_at)
     VALUES ($1, $2, $3, 'Destinatario SL38 T8', '88880000', $4, $5, $6, $7, $8, 'caja', now(), now())`,
    id,
    `SL38T8-${id.slice(0, 8)}`,
    fks.estatusId,
    fks.tiendaId,
    fks.zonaId,
    fks.provinciaId,
    fks.cantonId,
    distritoId,
  );
  return id;
}

/** Siembra lo de una empresa (con la empresa ya fijada): tarifa, mensajero, maestro. */
async function sembrarEmpresa(tx: TxDeTest, fks: FksDeOrden) {
  await tx.tarifa.create({
    data: {
      tiendaId: fks.tiendaId,
      zonaId: fks.zonaId,
      valorFlete: "2000.00",
      valorFleteDevuelto: "1000.00",
      valorFleteGam: "2000.00",
      valorFleteDevueltoGam: "1000.00",
      tarifaEspecial: "5000.00",
      tarifaEspecialDevuelta: "2500.00",
      comisionCod: "0.00",
      ivaFlete: "13.00",
      ivaComisionCod: "13.00",
    },
    select: { id: true },
  });
  const mensajero = (await crearUsuarioDePrueba(tx, "mensajero")).id;
  const maestro = (await crearUsuarioDePrueba(tx, "maestro")).id;
  return { mensajero, maestro };
}

async function sembrarGestion(tx: TxDeTest, ordenId: string, mensajeroId: string): Promise<string> {
  const g = await tx.gestionOrden.create({
    data: { ordenId, mensajeroId, resultado: "entregado", cierreId: null },
    select: { id: true },
  });
  return g.id;
}

/** La accion real con el servicio real inyectado y un `maestro` de la empresa. */
function accionComoMaestro(maestroId: string, input: { marcar: string[]; desmarcar: string[] }) {
  const service = new DistritoZonaEspecialService(new DistritoZonaEspecialRepository(app));
  return actualizarDistritosEspeciales(input, {
    getActor: async () => ({ usuarioId: maestroId, rol: "maestro" }),
    distritoZonaEspecialService: service,
  });
}

/**
 * Las marcas de A y B en `distrito`, medidas como dueno fuera de toda transaccion. Acotadas a las
 * dos empresas del archivo: otro archivo en paralelo puede marcar el mismo distrito con las suyas.
 */
async function marcasDe(distrito: string): Promise<string[]> {
  const filas = await base.distritoZonaEspecial.findMany({
    where: { distritoId: distrito, organizacionId: { in: [s.A, s.B] } },
    select: { organizacionId: true },
    orderBy: { organizacionId: "asc" },
  });
  return filas.map((f) => f.organizacionId);
}

/** Lo que una empresa ve de las dos ordenes suyas (en D y en D2) por un camino. */
type PorDistrito = { D: boolean; D2: boolean };

describeSiHayBase("SL-38 T8 — dos empresas de punta a punta: cada una solo ve su marca (R9, R14-R21)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    app = conAislamientoPorEmpresa(base, async () => null);

    s = await base.$transaction(
      async (tx) => {
        await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${CLAVE_LOCK_ESCRITURA_REAL})`);
        const A = (await crearOrganizacion(tx, { nombre: "Empresa A SL38 T8" })).id;
        const B = (await crearOrganizacion(tx, { nombre: "Empresa B SL38 T8" })).id;

        await fijarEmpresa(tx, A);
        const fksA = await crearFksDeOrden(tx);
        const restoA = await sembrarEmpresa(tx, fksA);
        await fijarEmpresa(tx, B);
        const fksB = await crearFksDeOrden(tx);
        const restoB = await sembrarEmpresa(tx, fksB);

        // Los TRES ULTIMOS por id: `distrito-zona-especial-por-empresa.test.ts` marca los dos
        // primeros del mismo canton y mide sus marcas como dueno; en paralelo se pisarian.
        const distritos = await tx.distrito.findMany({
          where: { cantonId: fksA.cantonId },
          orderBy: { id: "desc" },
          take: 3,
          select: { id: true },
        });
        if (distritos.length < 3) throw new Error("faltan distritos de Cartago/Cartago: aplica las migraciones");
        const [D, D2, D3] = distritos.map((d) => d.id);

        // Las marcas, sin `organizacion_id` en los datos: la pone el DEFAULT de M1.
        await fijarEmpresa(tx, A);
        await tx.distritoZonaEspecial.create({ data: { distritoId: D } });
        const ordenA = await insertarOrden(tx, fksA, D);
        const ordenA2 = await insertarOrden(tx, fksA, D2);
        const gestionA = await sembrarGestion(tx, ordenA, restoA.mensajero);

        await fijarEmpresa(tx, B);
        await tx.distritoZonaEspecial.create({ data: { distritoId: D2 } });
        const ordenB = await insertarOrden(tx, fksB, D);
        const ordenB2 = await insertarOrden(tx, fksB, D2);
        const gestionB = await sembrarGestion(tx, ordenB, restoB.mensajero);

        return {
          A,
          B,
          D,
          D2,
          D3,
          fksA,
          fksB,
          ordenA,
          ordenA2,
          ordenB,
          ordenB2,
          mensajeroA: restoA.mensajero,
          mensajeroB: restoB.mensajero,
          gestionA,
          gestionB,
          maestroA: restoA.maestro,
          maestroB: restoB.maestro,
        };
      },
      { timeout: 60_000, maxWait: 15_000 },
    );

    // La siembra, medida como dueno. La marca de A se deja a los casos (ver cabecera).
    const ordenes = await base.orden.findMany({
      where: { id: { in: [s.ordenA, s.ordenA2, s.ordenB, s.ordenB2] } },
      select: { organizacionId: true, distritoId: true },
    });
    expect(ordenes).toHaveLength(4);
    expect(ordenes.filter((o) => o.organizacionId === s.A).map((o) => o.distritoId).sort()).toEqual([s.D, s.D2].sort());
    expect(ordenes.filter((o) => o.organizacionId === s.B).map((o) => o.distritoId).sort()).toEqual([s.D, s.D2].sort());
    expect(await marcasDe(s.D2)).toEqual([s.B]);
    expect(await marcasDe(s.D3)).toEqual([]);
  }, 120_000);

  afterAll(async () => {
    if (s !== undefined) {
      const orgs = [s.A, s.B];
      // En el orden que piden las FK, bajo el lock de la 227 como la siembra.
      await bajoLockDeEscrituraReal(async () => {
        for (const tabla of [
          "cierre_detail",
          "gestion_orden",
          "cierre_dia",
          "orden",
          "tarifas",
          "distrito_zona_especial",
          "usuario",
          "zona",
          "organizacion",
        ]) {
          const columna = tabla === "organizacion" ? "id" : "organizacion_id";
          await base.$executeRawUnsafe(`DELETE FROM "${tabla}" WHERE "${columna}" = ANY($1::text[])`, orgs);
        }
      });
    }
    await base?.$disconnect();
  }, 120_000);

  /** Corre `leer` dentro de cada empresa y devuelve lo que cada una ve en D y en D2. */
  async function enLasDos(leer: (empresa: "A" | "B") => Promise<PorDistrito>) {
    return {
      A: await conEmpresa(s.A, () => leer("A")),
      B: await conEmpresa(s.B, () => leer("B")),
    };
  }

  /** Lo esperado: A ve especial solo D y B solo D2. */
  const ESPERADO = { A: { D: true, D2: false }, B: { D: false, D2: true } };

  it("la siembra: A marca D y B marca D2, cada una con su empresa", async () => {
    expect(await marcasDe(s.D)).toEqual([s.A]);
    expect(await marcasDe(s.D2)).toEqual([s.B]);
  });

  /* ------------------------- R14: el arbol de Tarifas ------------------------- */

  it("R14: GeoRepository.listArbol marca D solo para A y D2 solo para B", async () => {
    const repo = new GeoRepository(app);
    const r = await enLasDos(async () => {
      const distritos = (await repo.listArbol()).flatMap((p) => p.cantones.flatMap((c) => c.distritos));
      const de = (id: string) => {
        const d = distritos.find((x) => x.id === id);
        if (d === undefined) throw new Error(`el arbol no trae el distrito ${id}`);
        return d.zonaEspecial;
      };
      return { D: de(s.D), D2: de(s.D2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  /* ---------------------- R15: el Excel de cobertura ---------------------- */

  it("R15: CoberturaRepository.listDistritos marca D solo para A y D2 solo para B", async () => {
    const nombres = await base.distrito.findMany({
      where: { id: { in: [s.D, s.D2] } },
      select: { id: true, nombre: true, canton: { select: { nombre: true, provincia: { select: { nombre: true } } } } },
    });
    const clave = (p: string, c: string, d: string) => `${p}/${c}/${d}`;
    const claveDe = new Map(nombres.map((n) => [n.id, clave(n.canton.provincia.nombre, n.canton.nombre, n.nombre)]));
    const repo = new CoberturaRepository(app);
    const r = await enLasDos(async () => {
      const filas = await repo.listDistritos();
      const de = (id: string) => {
        const k = claveDe.get(id);
        const coinciden = filas.filter((f) => clave(f.provincia.nombre, f.canton.nombre, f.distrito.nombre) === k);
        if (coinciden.length !== 1) throw new Error(`cobertura: ${coinciden.length} filas para ${k}`);
        return coinciden[0].distrito.zonaEspecial;
      };
      return { D: de(s.D), D2: de(s.D2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  /* --------------- R16: la tarifa de una orden nueva (carga, API, cotizacion) --------------- */

  it("R16: OrdenRepository.findDistritosByCantonIds marca D solo para A y D2 solo para B", async () => {
    const repo = new OrdenRepository(app);
    const r = await enLasDos(async () => {
      const filas = await repo.findDistritosByCantonIds([s.fksA.cantonId]);
      const de = (id: string) => {
        const d = filas.find((x) => x.id === id);
        if (d === undefined) throw new Error(`no vino el distrito ${id}`);
        return d.esZonaEspecial;
      };
      return { D: de(s.D), D2: de(s.D2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  /* ------------------ R17: la correccion de datos del cliente ------------------ */

  it("R17: OrdenRepository.findParaCorreccion lee la marca de la empresa de la orden", async () => {
    const repo = new OrdenRepository(app);
    const r = await enLasDos(async (e) => {
      const marca = async (id: string) => {
        const o = await repo.findParaCorreccion(id);
        if (o === null) throw new Error(`la empresa ${e} no ve su orden ${id}`);
        return o.esZonaEspecial;
      };
      return e === "A"
        ? { D: await marca(s.ordenA), D2: await marca(s.ordenA2) }
        : { D: await marca(s.ordenB), D2: await marca(s.ordenB2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  it("R17: OrdenRepository.findDistritoParaCorreccion marca el distrito propuesto por empresa", async () => {
    const repo = new OrdenRepository(app);
    const r = await enLasDos(async () => {
      const marca = async (id: string) => {
        const d = await repo.findDistritoParaCorreccion(id);
        if (d === null) throw new Error(`no vino el distrito ${id}`);
        return d.esZonaEspecial;
      };
      return { D: await marca(s.D), D2: await marca(s.D2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  /* ------------------------ R18: el cobro del rechazo ------------------------ */

  it("R18: OrdenRepository.findBaseCobroDevolucion congela la marca de la empresa de la orden", async () => {
    const repo = new OrdenRepository(app);
    const r = await enLasDos(async (e) => {
      const marca = async (id: string) => {
        const o = await repo.findBaseCobroDevolucion(id);
        if (o === null) throw new Error(`la empresa ${e} no ve su orden ${id}`);
        return o.esZonaEspecial;
      };
      return e === "A"
        ? { D: await marca(s.ordenA), D2: await marca(s.ordenA2) }
        : { D: await marca(s.ordenB), D2: await marca(s.ordenB2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  /* ------------------- R19: el listado y el costeo de la API ------------------- */

  it("R19/R21: el listado (list -> toListItem) cobra el pacto especial solo donde marca la empresa", async () => {
    const repo = new OrdenRepository(app);
    const leer = (tiendaId: string) =>
      repo.list({ where: { tiendaId }, sortBy: "created_at", sortDir: "asc", skip: 0, take: 50 });
    const enA = await conEmpresa(s.A, () => leer(s.fksA.tiendaId));
    const enB = await conEmpresa(s.B, () => leer(s.fksB.tiendaId));
    const fila = (items: typeof enA.items, id: string) => {
      const f = items.find((x) => x.id === id);
      if (f === undefined) throw new Error(`el listado no trae la orden ${id}`);
      return { fleteOrigen: f.fleteOrigen, fleteConIva: f.fleteConIva };
    };
    const especial = { fleteOrigen: "especial", fleteConIva: FLETE_ESPECIAL_CON_IVA };
    const normal = { fleteOrigen: "normal", fleteConIva: FLETE_NORMAL_CON_IVA };
    expect({ D: fila(enA.items, s.ordenA), D2: fila(enA.items, s.ordenA2) }).toEqual({ D: especial, D2: normal });
    expect({ D: fila(enB.items, s.ordenB), D2: fila(enB.items, s.ordenB2) }).toEqual({ D: normal, D2: especial });
  });

  it("R19: el costeo de la API (apiOrdenSelect -> toApiOrdenRow, listByOwner) lee la marca de la empresa", async () => {
    const repo = new OrdenRepository(app);
    const r = await enLasDos(async (e) => {
      const tiendaId = e === "A" ? s.fksA.tiendaId : s.fksB.tiendaId;
      const { items } = await repo.listByOwner({ ownerId: tiendaId, skip: 0, take: 50 });
      const marca = (remisionDe: string) => {
        const f = items.find((x) => x.numRemision === `SL38T8-${remisionDe.slice(0, 8)}`);
        if (f === undefined) throw new Error(`la API no trae la orden ${remisionDe}`);
        return f.costeo.esZonaEspecial;
      };
      return e === "A"
        ? { D: marca(s.ordenA), D2: marca(s.ordenA2) }
        : { D: marca(s.ordenB), D2: marca(s.ordenB2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  /* ------------------------- R20: el congelado del cierre ------------------------- */

  it("R20: leerDescriptivosDeOrdenes resuelve la marca de la empresa de la transaccion", async () => {
    const r = await enLasDos(async (e) => {
      const filas = await app.gestionOrden.findMany({
        where: { id: e === "A" ? s.gestionA : s.gestionB },
        select: SNAPSHOT_SELECT,
      });
      if (filas.length !== 1) throw new Error(`la empresa ${e} no ve su gestion`);
      // La misma fila con el distrito cambiado a D2, para leer las dos marcas en una llamada.
      const conD2 = { ...filas[0], orden: { ...filas[0].orden, distritoId: s.D2 } };
      const { distritos } = await leerDescriptivosDeOrdenes([filas[0], conD2], app);
      const marca = (id: string) => {
        const d = distritos.get(id);
        if (d === undefined) throw new Error(`no vino el distrito ${id}`);
        return d.zonaEspecial;
      };
      return { D: marca(s.D), D2: marca(s.D2) };
    });
    expect(r).toEqual(ESPERADO);
  });

  it("R9: la accion con el servicio real y un maestro de la empresa marca y desmarca con ok (no 500)", async () => {
    try {
      const marcar = await conEmpresa(s.B, () => accionComoMaestro(s.maestroB, { marcar: [s.D3], desmarcar: [] }));
      expect(marcar).toEqual({ status: "ok", actualizados: 1 });
      expect(await marcasDe(s.D3)).toEqual([s.B]);
      const desmarcar = await conEmpresa(s.B, () => accionComoMaestro(s.maestroB, { marcar: [], desmarcar: [s.D3] }));
      expect(desmarcar).toEqual({ status: "ok", actualizados: 1 });
      expect(await marcasDe(s.D3)).toEqual([]);
      // Ni la marca de A ni la de B en los otros distritos se movieron (R10).
      expect(await marcasDe(s.D)).toEqual([s.A]);
      expect(await marcasDe(s.D2)).toEqual([s.B]);
    } finally {
      await bajoLockDeEscrituraReal(() =>
        base.$executeRawUnsafe(
          `DELETE FROM distrito_zona_especial WHERE distrito_id = $1 AND organizacion_id = ANY($2::text[])`,
          s.D3,
          [s.A, s.B],
        ),
      );
    }
  });

  it("R20/R21: el cierre congela la marca de su empresa (A true, B false), y desmarcar despues no la mueve", async () => {
    const cierre = new CierreDiaRepository(app, new TarifaVigenteRepository(app));
    const solicitar = (mensajeroId: string, zonaId: string) =>
      cierre.crearCierre({
        mensajeroId,
        destinoTipo: "bodega_central",
        destinoZonaId: zonaId,
        totales: { efectivo: "0.00", simpe: "0.00", transferencia: "0.00", general: "0.00" },
        pagoByGestionId: {},
        totalPagoMensajero: "0.00",
        ingresoByGestionId: {},
        totalIngresoBodegaRechazos: "0.00",
      });
    const congelado = async (ordenId: string) =>
      (
        await base.cierreDetail.findMany({ where: { ordenId }, select: { esZonaEspecial: true, cierreId: true } })
      ).map((f) => f.esZonaEspecial);

    const cierreA = await conEmpresa(s.A, () => solicitar(s.mensajeroA, s.fksA.zonaId));
    const cierreB = await conEmpresa(s.B, () => solicitar(s.mensajeroB, s.fksB.zonaId));
    expect(cierreA).not.toBeNull();
    expect(cierreB).not.toBeNull();
    // Las dos ordenes estan en D: A la marca, B no.
    expect(await congelado(s.ordenA)).toEqual([true]);
    expect(await congelado(s.ordenB)).toEqual([false]);

    try {
      // A desmarca D por la accion real (R9) y la lectura viva lo refleja...
      const desmarcar = await conEmpresa(s.A, () => accionComoMaestro(s.maestroA, { marcar: [], desmarcar: [s.D] }));
      expect(desmarcar).toEqual({ status: "ok", actualizados: 1 });
      const viva = await conEmpresa(s.A, () => new OrdenRepository(app).findBaseCobroDevolucion(s.ordenA));
      expect(viva?.esZonaEspecial).toBe(false);
      // ...pero la fila congelada del cierre no se mueve.
      expect(await congelado(s.ordenA)).toEqual([true]);
    } finally {
      if ((await marcasDe(s.D)).length === 0) {
        const remarcar = await conEmpresa(s.A, () => accionComoMaestro(s.maestroA, { marcar: [s.D], desmarcar: [] }));
        expect(remarcar).toEqual({ status: "ok", actualizados: 1 });
      }
    }
  });
});
