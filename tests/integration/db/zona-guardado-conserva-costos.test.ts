import { randomUUID } from "node:crypto";
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { actualizarZona, crearZona } from "@/lib/actions/zonas";
import type { Actor } from "@/lib/interfaces/services/IZonaService";
import { ZonaRepository } from "@/lib/repositories/ZonaRepository";
import { ZonaService } from "@/lib/services/ZonaService";

import {
  HAY_BASE_DE_DATOS,
  clienteConSavepoint,
  crearPrismaDeTest,
  enTransaccionRevertida,
  serializarEscriturasReales,
  type TxDeTest,
} from "./_postgres-real";
import { crearFksDeOrden, crearUsuarioDePrueba } from "./_fixtures/orden-minima";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-51 / T3 — GUARDAR UNA ZONA DESDE «ZONAS» NO TOCA SUS COSTOS (Postgres real).
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// El formulario de zona deja de mandar `cobroVehiculo` y `tarifas`. Lo que hay que demostrar vive
// en la TABLA: que el `deleteMany` + `createMany` de `tarifa_zona_mensajero` no corre (los `id` se
// conservan, porque Postgres los regenera en cada reemplazo), que la columna `cobro_vehiculo` no se
// escribe y que no aparece la fila de historial de la 380. Un doble de Prisma no distingue
// «`undefined`» de «`false`» ni ve los `id`; por eso este archivo existe.
//
// Se entra por la Server Action con el servicio y el repositorio REALES: es el camino del
// formulario, con el zod del borde incluido (R8 se decide ahi).
//
// ⚠️ Sin `if (!x) return;`: cada caso afirma su PREMISA (lo sembrado existe) antes de afirmar el
// efecto. Sin base alcanzable, `describe.skip` VISIBLE.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const ACCION_PAGO = "zona_pago_mensajero_cambiado";
const SUFIJO = `slt51-${Date.now().toString(36)}`;
let contador = 0;
function unico(): string {
  contador += 1;
  return `${SUFIJO}-${contador.toString(36)}-${randomUUID().slice(0, 6)}`;
}

interface Foto {
  nombre: string;
  cobroVehiculo: boolean;
  pagos: { id: string; vehiculoId: string | null; cobroEntregado: string; cobroRechazado: string }[];
  tarifasDeZona: { id: string; valorFlete: string; updatedAt: string }[];
  especiales: string[];
  filasDePago: number;
  distritos: string[];
}

async function foto(tx: TxDeTest, zonaId: string): Promise<Foto> {
  const zona = await tx.zona.findUniqueOrThrow({
    where: { id: zonaId },
    select: { nombre: true, cobroVehiculo: true },
  });
  const pagos = await tx.tarifaZonaMensajero.findMany({
    where: { zonaId },
    select: { id: true, vehiculoId: true, cobroEntregado: true, cobroRechazado: true },
    orderBy: { id: "asc" },
  });
  const tarifas = await tx.tarifa.findMany({
    where: { zonaId, tiendaId: null },
    select: { id: true, valorFlete: true, updatedAt: true },
    orderBy: { id: "asc" },
  });
  const especiales = await tx.distritoZonaEspecial.findMany({
    select: { distritoId: true },
    orderBy: { distritoId: "asc" },
  });
  const filasDePago = await tx.historialAccion.count({
    where: { accion: ACCION_PAGO, entidadId: zonaId },
  });
  const distritos = await tx.zonaDistrito.findMany({
    where: { zonaId },
    select: { distritoId: true },
    orderBy: { distritoId: "asc" },
  });
  return {
    nombre: zona.nombre,
    cobroVehiculo: zona.cobroVehiculo,
    pagos: pagos.map((p) => ({
      id: p.id,
      vehiculoId: p.vehiculoId,
      cobroEntregado: p.cobroEntregado.toFixed(2),
      cobroRechazado: p.cobroRechazado.toFixed(2),
    })),
    tarifasDeZona: tarifas.map((t) => ({
      id: t.id,
      valorFlete: t.valorFlete.toFixed(2),
      updatedAt: t.updatedAt.toISOString(),
    })),
    especiales: especiales.map((e) => e.distritoId),
    filasDePago,
    distritos: distritos.map((d) => d.distritoId),
  };
}

interface Escenario {
  tx: TxDeTest;
  deps: { zonaService: ZonaService; getActor: () => Promise<Actor | null> };
  repo: ZonaRepository;
  usuarioId: string;
  crearDistrito: () => Promise<string>;
}

describeSiHayBase("SLT-51/T3 — guardar una zona conserva sus costos (Postgres real)", () => {
  let prisma: PrismaClient;

  beforeAll(() => {
    prisma = crearPrismaDeTest();
  });

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  async function conEscenario(fn: (e: Escenario) => Promise<void>): Promise<void> {
    await enTransaccionRevertida(prisma, async (tx) => {
      await serializarEscriturasReales(tx);
      const FKS = await crearFksDeOrden(tx);
      const maestro = await crearUsuarioDePrueba(tx, "maestro");
      const repo = new ZonaRepository(clienteConSavepoint(tx));
      const actor: Actor = { usuarioId: maestro.id, rol: "maestro" };
      await fn({
        tx,
        repo,
        usuarioId: maestro.id,
        deps: { zonaService: new ZonaService(repo), getActor: async () => actor },
        crearDistrito: async () =>
          (
            await tx.distrito.create({
              data: { nombre: `SLT51 D ${unico()}`, cantonId: FKS.cantonId },
              select: { id: true },
            })
          ).id,
      });
    });
  }

  /**
   * Zona con todo lo que el formulario viejo escribia: pagos por vehiculo (por el repositorio
   * real, que ya deja su fila 380), tarifa de cobro de la zona y dos distritos especiales.
   */
  async function sembrarZonaConCostos(e: Escenario) {
    const [d1, d2, d3] = [await e.crearDistrito(), await e.crearDistrito(), await e.crearDistrito()];
    const [moto, carro] = await Promise.all([
      e.tx.vehiculo.create({ data: { name: `SLT51 moto ${unico()}` }, select: { id: true } }),
      e.tx.vehiculo.create({ data: { name: `SLT51 carro ${unico()}` }, select: { id: true } }),
    ]);
    const nombre = `SLT51 Z ${unico()}`;
    const zona = await e.tx.zona.create({
      data: { nombre, sinpeNumero: "80000000", sinpeNombre: "Titular de Prueba" },
      select: { id: true },
    });
    const sembrado = await e.repo.update(
      zona.id,
      {
        nombre,
        distritoIds: [d1, d2],
        cobroVehiculo: true,
        tarifas: [
          { cobroEntregado: 1500, cobroRechazado: 700, vehiculoId: moto.id },
          { cobroEntregado: 2500, cobroRechazado: 900, vehiculoId: carro.id },
        ],
      },
      e.usuarioId,
    );
    if (sembrado.estado !== "ok") throw new Error(`sembrado fallido: ${sembrado.estado}`);
    await e.tx.tarifa.create({
      data: {
        zonaId: zona.id,
        valorFlete: 3000,
        valorFleteDevuelto: 1500,
        valorFleteGam: 2800,
        valorFleteDevueltoGam: 1400,
        comisionCod: 2,
        ivaFlete: 13,
        ivaComisionCod: 13,
      },
    });
    await e.tx.distritoZonaEspecial.createMany({
      data: [{ distritoId: d1 }, { distritoId: d2 }],
    });
    return { zonaId: zona.id, nombre, d1, d2, d3 };
  }

  it("R5: crear SIN costos -> 0 pagos, cobro_vehiculo=false, 0 tarifas de zona, especiales iguales", async () => {
    await conEscenario(async (e) => {
      const d = await e.crearDistrito();
      // Un especial YA marcado en el distrito que la zona va a usar: si crear tocara las marcas,
      // este es el que cambiaria.
      await e.tx.distritoZonaEspecial.create({ data: { distritoId: d } });
      const especialesAntes = (await e.tx.distritoZonaEspecial.findMany({
        select: { distritoId: true },
        orderBy: { distritoId: "asc" },
      })).map((x) => x.distritoId);
      expect(especialesAntes).toContain(d);

      const r = await crearZona(
        {
          nombre: `SLT51 nueva ${unico()}`,
          distritoIds: [d],
          sinpeNumero: "80000000",
          sinpeNombre: "Titular de Prueba",
        },
        e.deps,
      );
      if (r.status !== "ok") throw new Error(`crear fallo: ${r.status}`);

      const f = await foto(e.tx, r.zona.id);
      expect(f.distritos).toEqual([d]);
      expect(f.pagos).toEqual([]);
      expect(f.cobroVehiculo).toBe(false);
      expect(f.tarifasDeZona).toEqual([]);
      expect(f.especiales).toEqual(especialesAntes);
    });
  });

  it("⭑ R6/R7: actualizar con { nombre, distritoIds } conserva pagos, cobro_vehiculo=true, tarifa, especiales y no escribe historial", async () => {
    await conEscenario(async (e) => {
      const z = await sembrarZonaConCostos(e);
      const antes = await foto(e.tx, z.zonaId);

      // PREMISA: lo sembrado existe, o el «todo igual» seria verde por vacio.
      expect(antes.cobroVehiculo).toBe(true);
      expect(antes.pagos).toHaveLength(2);
      expect(antes.tarifasDeZona).toHaveLength(1);
      expect(antes.especiales).toEqual(expect.arrayContaining([z.d1, z.d2]));
      expect(antes.filasDePago).toBe(1);

      const nuevoNombre = `SLT51 renombrada ${unico()}`;
      const r = await actualizarZona(
        z.zonaId,
        { nombre: nuevoNombre, distritoIds: [z.d1, z.d3] },
        e.deps,
      );
      expect(r.status).toBe("ok");

      const despues = await foto(e.tx, z.zonaId);
      // El guardado SI se aplico (si no, el resto pasaria por un update que no escribe nada).
      expect(despues.nombre).toBe(nuevoNombre);
      expect(despues.distritos).toEqual([z.d1, z.d3].sort());
      // Y los costos quedaron EXACTAMENTE como estaban, `id` incluidos.
      expect(despues.cobroVehiculo).toBe(true);
      expect(despues.pagos).toEqual(antes.pagos);
      expect(despues.tarifasDeZona).toEqual(antes.tarifasDeZona);
      expect(despues.especiales).toEqual(antes.especiales);
      expect(despues.filasDePago).toBe(antes.filasDePago);
    });
  });

  it("⭑ R8: solo `tarifas` -> validation_error en cobroVehiculo y NADA escrito", async () => {
    await conEscenario(async (e) => {
      const z = await sembrarZonaConCostos(e);
      const antes = await foto(e.tx, z.zonaId);
      expect(antes.pagos).toHaveLength(2);

      const r = await actualizarZona(
        z.zonaId,
        {
          nombre: `SLT51 no debe quedar ${unico()}`,
          distritoIds: [z.d3],
          tarifas: [{ cobroEntregado: 1, cobroRechazado: 1 }],
        },
        e.deps,
      );
      expect(r.status).toBe("validation_error");
      if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["cobroVehiculo"]);

      expect(await foto(e.tx, z.zonaId)).toEqual(antes);
    });
  });

  it("R9 (contraprueba): con los dos campos el reemplazo es REAL — cambian los `id` y hay fila 380", async () => {
    // Sin este caso, el de R6 podria estar verde porque la foto no ve un reemplazo. Aqui se
    // demuestra que si lo ve.
    await conEscenario(async (e) => {
      const z = await sembrarZonaConCostos(e);
      const antes = await foto(e.tx, z.zonaId);

      const r = await actualizarZona(
        z.zonaId,
        {
          nombre: z.nombre,
          distritoIds: [z.d1, z.d2],
          cobroVehiculo: false,
          tarifas: [{ cobroEntregado: 1000, cobroRechazado: 500 }],
        },
        e.deps,
      );
      expect(r.status).toBe("ok");

      const despues = await foto(e.tx, z.zonaId);
      expect(despues.cobroVehiculo).toBe(false);
      expect(despues.pagos.map((p) => [p.vehiculoId, p.cobroEntregado])).toEqual([[null, "1000.00"]]);
      const idsAntes = new Set(antes.pagos.map((p) => p.id));
      expect(despues.pagos.filter((p) => idsAntes.has(p.id))).toEqual([]);
      expect(despues.filasDePago).toBe(antes.filasDePago + 1);
    });
  });
});
