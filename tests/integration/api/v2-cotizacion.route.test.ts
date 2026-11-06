import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { handleCotizacionApi } from "@/app/api/ordenes/api-key/cotizacion/route";
import type { AutenticadorApiKey } from "@/lib/api/api-key-request";
import { MSG_PAIS_NO_HABILITADO } from "@/lib/services/geo-ubicacion";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "../db/_postgres-real";
import { conEscenario, cotizacionServiceDe, post, rutaEsperada, sinUbicacion, type Contexto } from "./_v2-escenario";

// SLT-45 T5.4 (design §4.3; R19) — LA COTIZACION DE v2 = LA DE v1 + `filas[].ubicacion`.
//
// Contra Postgres real, con el rol de la app (`servi_app`, RLS) y en una transaccion que siempre se
// revierte, sobre la misma siembra que el contrato de v1 (`_v2-escenario.ts`). En la MISMA
// transaccion se cotiza el mismo lote por v1 (terna) y por v2 (ruta de nombres o codigo oficial)
// con el `CotizacionOrdenService` real: la cotizacion no escribe, asi que las dos ven la misma
// tienda, las mismas zonas y las mismas tarifas. Quitando `ubicacion`, el cuerpo de v2 debe ser el
// de v1 valor a valor.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

type Fila = Record<string, unknown>;

interface Respuesta {
  status: number;
  cuerpo: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

async function cotizar(c: Contexto, version: "v1" | "v2", cuerpo: unknown, autenticar: AutenticadorApiKey = c.autenticar): Promise<Respuesta> {
  const url = version === "v1" ? "/api/ordenes/api-key/cotizacion" : "/api/v2/ordenes/cotizacion";
  const res = await handleCotizacionApi(post(url, cuerpo), { autenticar, cotizacionService: cotizacionServiceDe(c.cli) }, version);
  return { status: res.status, cuerpo: (await res.json()) as Record<string, any> }; // eslint-disable-line @typescript-eslint/no-explicit-any
}

const OCCIDENTAL = ["Cartago", "Cartago", "Occidental"];
const OROSI = ["Cartago", "Paraíso", "Orosi"];
const RIO_BLANCO = ["Limón", "Limón", "Río Blanco"];

/** Una fila del lote, en v1 con la terna y en v2 con la ruta (o el codigo, si se da). */
function filaDe(version: "v1" | "v2", n: number, ruta: string[], monto: string, codigo?: string): Fila {
  const ubicacion: Fila =
    version === "v1"
      ? { provincia: ruta[0], canton: ruta[1], distrito: ruta[2] }
      : codigo !== undefined
        ? { ubicacion_codigo: codigo }
        : { ubicacion: ruta };
  return {
    num_remision: `R19-${n}`,
    destinatario: `Destinatario ${n}`,
    telefono: "80000001",
    direccion: `Direccion ${n}`,
    producto: `Producto ${n}`,
    peso: "1",
    monto_cobrar: monto,
    ...ubicacion,
  };
}

/** Zona central con y sin cobro, zona no central, zona especial; por nombre y por codigo. */
function lote(version: "v1" | "v2"): { ordenes: Fila[] } {
  return {
    ordenes: [
      filaDe(version, 1, OCCIDENTAL, "25900"),
      filaDe(version, 2, OCCIDENTAL, "0"),
      filaDe(version, 3, OROSI, "15000", "30203"),
      filaDe(version, 4, RIO_BLANCO, "100"),
      filaDe(version, 5, ["Cartago", "Cartago", "Oriental"], "7300", "30101"),
    ],
  };
}

describeSiHayBase("SLT-45 R19 — cotizacion de v2 (Postgres real)", () => {
  let base: PrismaClient;

  beforeAll(() => {
    base = crearPrismaDeTest();
  });

  afterAll(async () => {
    await base?.$disconnect();
  });

  it("R19: mismos importes y misma forma que v1 para la misma ubicacion, tienda y monto, mas `filas[].ubicacion` con la ruta del nodo", async () => {
    await conEscenario(base, {}, async (c) => {
      const v1 = await cotizar(c, "v1", lote("v1"));
      const v2 = await cotizar(c, "v2", lote("v2"));

      expect(v1.status).toBe(200);
      expect(v2.status).toBe(200);
      expect(v1.cuerpo).toMatchObject({ total: 5, cotizadas: 5, conError: 0, errores: [] });

      // `ubicacion`, de la raiz al nodo, con el tipo de cada eslabon (R21).
      expect(v2.cuerpo.filas.map((f: { ubicacion: unknown }) => f.ubicacion)).toEqual([
        await rutaEsperada(c.tx, OCCIDENTAL),
        await rutaEsperada(c.tx, OCCIDENTAL),
        await rutaEsperada(c.tx, OROSI),
        await rutaEsperada(c.tx, RIO_BLANCO),
        await rutaEsperada(c.tx, ["Cartago", "Cartago", "Oriental"]),
      ]);
      // Sin `ubicacion`, el cuerpo de v1 tal cual: claves, orden e importes.
      expect(JSON.stringify({ ...v2.cuerpo, filas: sinUbicacion(v2.cuerpo.filas) })).toBe(JSON.stringify(v1.cuerpo));
      // Los importes no son todos iguales: el lote distingue central, no central y especial.
      const totales = new Set(v1.cuerpo.filas.map((f: { costos: { entregado: { flete: string } } }) => f.costos.entregado.flete));
      expect(totales.size).toBeGreaterThan(1);
    });
  }, 120_000);

  it("R19: con una tarifa propia de la tienda, v1 y v2 cotizan con ella y dan los mismos importes", async () => {
    await conEscenario(
      base,
      {},
      async (c) => {
        const v1 = await cotizar(c, "v1", lote("v1"));
        const v2 = await cotizar(c, "v2", lote("v2"));
        expect(v2.status).toBe(200);
        // La tarifa de la tienda (flete GAM 3100) gana a la de la zona (2000) en zona_1.
        expect(v1.cuerpo.filas[0].costos.entregado.flete).toBe("3100.00");
        expect(JSON.stringify({ ...v2.cuerpo, filas: sinUbicacion(v2.cuerpo.filas) })).toBe(JSON.stringify(v1.cuerpo));
      },
      async (tx, s) => {
        const zona = await tx.zona.findFirstOrThrow({ where: { nombre: "zona_1" }, select: { id: true } });
        await tx.tarifa.create({
          data: {
            zonaId: zona.id,
            tiendaId: s.tiendaId,
            valorFlete: "3600.00",
            valorFleteDevuelto: "1800.00",
            valorFleteGam: "3100.00",
            valorFleteDevueltoGam: "1550.00",
            comisionCod: "3.00",
            ivaFlete: "13.00",
            ivaComisionCod: "13.00",
            tarifaEspecial: "5000.00",
            tarifaEspecialDevuelta: "2000.00",
          },
        });
      },
    );
  }, 120_000);

  it("R19: sin ninguna tarifa, v2 responde el mismo 409 que v1, sin importes", async () => {
    await conEscenario(
      base,
      {},
      async (c) => {
        const v1 = await cotizar(c, "v1", lote("v1"));
        const v2 = await cotizar(c, "v2", lote("v2"));
        expect(v1.status).toBe(409);
        expect(v2.status).toBe(409);
        expect(v2.cuerpo).toEqual(v1.cuerpo);
      },
      async (tx) => {
        const zonas = await tx.zona.findMany({ select: { id: true } });
        await tx.tarifa.deleteMany({ where: { zonaId: { in: zonas.map((z) => z.id) } } });
      },
    );
  }, 120_000);

  it("R19 (+R12, R15, R16): una fila mala no tumba el lote: va a `errores[]` bajo `ubicacion`, como en v1 van bajo la terna", async () => {
    await conEscenario(base, {}, async (c) => {
      const buena = filaDe("v2", 1, OCCIDENTAL, "25900");
      const { ubicacion: _sin, ...sinUbicacionNiCodigo } = filaDe("v2", 2, OCCIDENTAL, "100");
      void _sin;
      const provincia = { ...filaDe("v2", 3, OCCIDENTAL, "100"), ubicacion: ["Cartago"] };
      const canton = { ...filaDe("v2", 4, OCCIDENTAL, "100"), ubicacion: ["Cartago", "Paraíso"] };
      const r = await cotizar(c, "v2", { ordenes: [buena, sinUbicacionNiCodigo, provincia, canton] });

      expect(r.status).toBe(200);
      expect(r.cuerpo).toMatchObject({ total: 4, cotizadas: 1, conError: 3 });
      expect(r.cuerpo.filas.map((f: { fila: number }) => f.fila)).toEqual([1]);
      expect(r.cuerpo.errores.map((e: { fila: number; errores: unknown }) => [e.fila, e.errores])).toEqual([
        [2, { ubicacion: ["indica ubicacion o ubicacion_codigo, uno de los dos"] }],
        [3, { ubicacion: [MSG_PAIS_NO_HABILITADO] }],
        [4, { ubicacion: ["la ubicacion 'Paraíso' no tiene zona asignada"] }],
      ]);
    });
  }, 120_000);

  it("R19 (+R11): la cotizacion de v2 responde los mismos 401 y 403 que v1", async () => {
    await conEscenario(base, {}, async (c) => {
      for (const [auth, status, code] of [
        [async () => ({ status: "unauthenticated" }), 401, "UNAUTHORIZED"],
        [async () => ({ status: "forbidden" }), 403, "FORBIDDEN"],
      ] as [AutenticadorApiKey, number, string][]) {
        const v1 = await cotizar(c, "v1", lote("v1"), auth);
        const v2 = await cotizar(c, "v2", lote("v2"), auth);
        expect(v2.status).toBe(status);
        expect(v2.cuerpo).toMatchObject({ status: "error", code });
        expect(v2.cuerpo).toEqual(v1.cuerpo);
      }
    });
  }, 120_000);
});
