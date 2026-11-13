import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { Prisma, type PrismaClient } from "@prisma/client";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import { construirQueryDireccion, hashDireccion } from "@/lib/geo/direccion-query";
import { collapseSpaces } from "@/lib/geo/normalize";
import type { JobDTO } from "@/lib/interfaces/repositories/IJobRepository";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import { GeocodeCacheRepository } from "@/lib/repositories/GeocodeCacheRepository";
import { OrdenGeocodeRepository } from "@/lib/repositories/OrdenGeocodeRepository";
import { GeocodificacionService } from "@/lib/services/GeocodificacionService";
import { comoApp } from "@/tests/fabricas/organizaciones";
import { crearEscenarioGeo125, type EmpresaGeo125 } from "./_fixtures/geo-125";
import { comoDueno, revertida } from "./_fixtures/pais-20";
import { HAY_BASE_DE_DATOS, crearPrismaDeTest, type TxDeTest } from "./_postgres-real";

// SLT-125 T2.4 (design §4.5; R32, R33) — UNA ENTRADA DE `GeocodeCache` ESCRITA HOY SE SIGUE SIRVIENDO.
//
// La entrada se siembra con la huella de la consulta que armaba el codigo de antes de SLT-125: los
// nombres de las tablas viejas (`provincia`, `canton`, `distrito`) y el pais fijo. Despues corre el job
// real (repositorio de la orden con la ruta del catalogo, cache real) como la app, en la empresa de CR.
// Si la consulta nueva diera otra huella, la cache fallaria y el job llamaria al proveedor: el doble
// del proveedor cuenta esas llamadas y debe quedarse en 0.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

let base: PrismaClient;

/** La consulta tal como la armaba `construirQueryDireccion` antes de SLT-125 (feature 91). */
function consultaDeHoy(o: {
  direccion: string | null;
  distritoNombre: string | null;
  cantonNombre: string;
  provinciaNombre: string;
}): string | null {
  const n = (s: string | null) => (s === null ? "" : collapseSpaces(s));
  const direccion = n(o.direccion);
  if (direccion === "") return null;
  return [direccion, n(o.distritoNombre), n(o.cantonNombre), n(o.provinciaNombre), "Costa Rica"]
    .filter((p) => p !== "")
    .join(", ");
}

/** La huella de hoy de una orden, medida como dueño con las relaciones viejas. */
async function huellaDeHoy(tx: TxDeTest, ordenId: string): Promise<string> {
  const o = await tx.orden.findUniqueOrThrow({
    where: { id: ordenId },
    select: {
      direccion: true,
      provincia: { select: { nombre: true } },
      canton: { select: { nombre: true } },
      distrito: { select: { nombre: true } },
    },
  });
  const q = consultaDeHoy({
    direccion: o.direccion,
    distritoNombre: o.distrito?.nombre ?? null,
    cantonNombre: o.canton.nombre,
    provinciaNombre: o.provincia.nombre,
  });
  if (q === null) throw new Error("la orden del fixture debe tener direccion");
  return hashDireccion(q);
}

function job(ordenId: string, organizacionId: string): JobDTO {
  const ahora = new Date("2026-11-12T12:00:00.000Z");
  return {
    organizacionId,
    id: "job-slt125",
    tipo: "geocodificacion",
    payload: { ordenId },
    estado: "processing",
    intentos: 1,
    maxIntentos: 8,
    runAfter: ahora,
    lockedAt: ahora,
    lastError: null,
    dedupeKey: `geocodificacion:${ordenId}:slt125`,
    createdAt: ahora,
    updatedAt: ahora,
  } as JobDTO;
}

/** Corre el job real como la app en la empresa; devuelve el doble del proveedor. */
async function ejecutarComoLaEmpresa(tx: TxDeTest, e: EmpresaGeo125, ordenId: string) {
  const geocodificar = vi.fn(async () => ({ status: "sin_resultados" as const }));
  const crearCliente = vi.fn(() => ({ geocodificar }));
  // Con credencial lista: si la cache fallara, el job SI llamaria al proveedor.
  const credenciales = {
    leer: vi.fn(async () => ({
      estado: "lista",
      integracionId: "int-maps",
      credencial: { clave_api: "clave-de-prueba" },
      datosPublicos: {},
    })),
    marcarRechazo: vi.fn(async () => {}),
  } as unknown as ICredencialesIntegracion;
  const cliente = tx as unknown as PrismaClient;
  const service = new GeocodificacionService(
    new OrdenGeocodeRepository(cliente),
    new GeocodeCacheRepository(cliente),
    credenciales,
    crearCliente as never,
    () => new Date("2026-11-12T12:00:00.000Z"),
  );
  await comoApp(tx, e.empresaId);
  try {
    await conEmpresa(e.empresaId, () => service.ejecutar(job(ordenId, e.empresaId)));
  } finally {
    await comoDueno(tx);
  }
  return { geocodificar, crearCliente };
}

describeSiHayBase("SLT-125 R33 — GeocodeCache escrita hoy se sirve sin llamar al proveedor", () => {
  beforeAll(() => {
    base = crearPrismaDeTest();
  });
  afterAll(async () => {
    await base?.$disconnect();
  });

  it.each([
    ["con distrito", "conDistritoId"],
    ["sin distrito", "sinDistritoId"],
  ] as const)("orden de CR %s: acierto de cache con la huella de hoy, 0 llamadas", async (_caso, clave) => {
    await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      const ordenId = e.cr.ordenes[clave];
      const huella = await huellaDeHoy(tx, ordenId);
      await tx.geocodeCache.upsert({
        where: { direccionHash: huella },
        create: {
          direccionHash: huella,
          latitud: new Prisma.Decimal("9.9333000"),
          longitud: new Prisma.Decimal("-84.0833000"),
          precision: "ROOFTOP",
        },
        update: {},
      });

      const { geocodificar, crearCliente } = await ejecutarComoLaEmpresa(tx, e.cr, ordenId);

      expect(crearCliente).not.toHaveBeenCalled();
      expect(geocodificar).not.toHaveBeenCalled();
      const orden = await tx.orden.findUniqueOrThrow({
        where: { id: ordenId },
        select: { latitud: true, longitud: true, geocodeStatus: true },
      });
      expect(orden.geocodeStatus).toBe("OK");
      expect(orden.latitud?.toString()).toBe("9.9333");
      expect(orden.longitud?.toString()).toBe("-84.0833");
    });
  }, 60_000);

  it("la consulta que arma el repositorio nuevo es, en CR, la misma cadena que la de hoy", async () => {
    await revertida(base, async (tx) => {
      const e = await crearEscenarioGeo125(tx);
      const repo = new OrdenGeocodeRepository(tx as unknown as PrismaClient);
      for (const ordenId of Object.values(e.cr.ordenes)) {
        const huella = await huellaDeHoy(tx, ordenId);
        await comoApp(tx, e.cr.empresaId);
        let fila;
        try {
          fila = await conEmpresa(e.cr.empresaId, () => repo.findParaGeocodificar(ordenId));
        } finally {
          await comoDueno(tx);
        }
        expect(fila).not.toBeNull();
        const q = construirQueryDireccion({
          direccion: fila!.direccion,
          ruta: fila!.ruta,
          paisNombre: fila!.paisNombre,
        });
        expect(hashDireccion(q as string)).toBe(huella);
      }
    });
  }, 60_000);
});
