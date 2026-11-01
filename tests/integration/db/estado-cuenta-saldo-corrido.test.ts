import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

import { verEstadoCuentaAction } from "@/lib/actions/estado-cuenta";
import type { EstadoCuentaDTO, VerEstadoCuentaResult } from "@/lib/types/estado-cuenta";
import type { VerEstadoCuentaCompletoServiceResult } from "@/lib/interfaces/services/IEstadoCuentaService";

import { HAY_BASE_DE_DATOS, crearPrismaDeTest } from "./_postgres-real";
import { cargarCatalogo459, enTransaccionRevertida459, montarServicios459 } from "./_fixtures/caja-459";
import { leerEstadoCuenta, lineaDe, montarEstadoCuenta, sembrarEscenario458 } from "./_fixtures/wallet-458";

// SL-23 (design §10): la puerta de módulo con todo encendido; aquí no se prueba el módulo apagado.
vi.mock("@/lib/modulos/exigir-modulo", async () => (await import("@/tests/fabricas/modulos")).puertasAbiertas());


// ═════════════════════════════════════════════════════════════════════════════════════════════
// FICHA 458-B / TB.6 — EL ESTADO DE CUENTA contra Postgres: lo que la fotografia no cubre
// (R16, R21–R23, R81). Los literales del extracto viven en `wallet-caracterizacion-458.test.ts`.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
//  · R22 con un par anulado A CABALLO de dos periodos: el pago (c5, 12 sep) entra y su anulacion
//    (c6, 15 sep) no → el pago NO se excluye de los totales y `inicial + abonos − cargos` sigue dando el
//    corrido de la ultima fila del periodo.
//  · R23 — paginas de 3 sobre las 7 filas de la tienda: 0 repetidas, 0 faltantes, el mismo orden y el
//    mismo corrido que la lectura entera.
//  · R81 — por la ACTION: una tienda (rol) → `forbidden`; la tienda pedida como MENSAJERO (otro papel)
//    o un uuid que no existe → `no_encontrado` sin distinguir; un chip de otro tipo de cuenta →
//    `validation_error`; una clave de mas → `validation_error`.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

interface Medida {
  pagoSinSuAnulacion: EstadoCuentaDTO;
  /** SLT-73 (R33): la bodega Z en el periodo del 12 sep, con el chip «sin consolidar» y su descarga. */
  bodega12: EstadoCuentaDTO;
  bodegaSinConsolidar: EstadoCuentaDTO;
  bodegaEntera: EstadoCuentaDTO;
  bodegaDescarga: VerEstadoCuentaCompletoServiceResult;
  entero: EstadoCuentaDTO;
  paginas: EstadoCuentaDTO[];
  respuestas: Record<string, VerEstadoCuentaResult>;
}

describeSiHayBase("458-B/TB.6 — el estado de cuenta contra Postgres (R16, R21–R23, R81)", () => {
  let prisma: PrismaClient;
  let medida: Medida | undefined;
  let fallo: unknown;

  function m(): Medida {
    if (fallo !== undefined) throw fallo;
    if (medida === undefined) throw new Error("la medida no llego a tomarse");
    return medida;
  }

  beforeAll(async () => {
    prisma = crearPrismaDeTest();
    const cat = await cargarCatalogo459(prisma);
    try {
      medida = await enTransaccionRevertida459(prisma, async (tx) => {
        const s = montarServicios459(tx);
        const esc = await sembrarEscenario458(tx, cat);
        const ec = montarEstadoCuenta(s);
        const tienda = { tipo: "tienda" as const, id: esc.tiendaC };
        const bodega = { tipo: "bodega" as const, id: esc.zonaZ };
        const paginas: EstadoCuentaDTO[] = [];
        for (let page = 1; page <= 3; page += 1) {
          paginas.push(await leerEstadoCuenta(ec, esc.maestro, { cuenta: tienda, page, pageSize: 3 }));
        }
        const tiendaActor = { usuarioId: esc.tiendaC, rol: "adminTienda" as const };
        const accion = (input: unknown, actor = esc.maestro) =>
          verEstadoCuentaAction(input, { getActor: async () => actor, service: ec });
        return {
          pagoSinSuAnulacion: await leerEstadoCuenta(ec, esc.maestro, {
            cuenta: tienda,
            desde: "2026-09-12",
            hasta: "2026-09-12",
          }),
          entero: await leerEstadoCuenta(ec, esc.maestro, { cuenta: tienda }),
          bodega12: await leerEstadoCuenta(ec, esc.maestro, { cuenta: bodega, desde: "2026-09-12", hasta: "2026-09-12" }),
          bodegaSinConsolidar: await leerEstadoCuenta(ec, esc.maestro, { cuenta: bodega, chip: "sin_consolidar" }),
          bodegaEntera: await leerEstadoCuenta(ec, esc.maestro, { cuenta: bodega }),
          bodegaDescarga: await ec.leerCompleto({ cuenta: bodega, sortBy: "fecha", sortDir: "asc" }, esc.maestro),
          paginas,
          respuestas: {
            tiendaPideLaSuya: await accion({ cuenta: tienda }, tiendaActor),
            comoMensajero: await accion({ cuenta: { tipo: "mensajero", id: esc.tiendaC } }),
            inexistente: await accion({ cuenta: { tipo: "tienda", id: "00000000-0000-4000-8000-000000000458" } }),
            chipAjeno: await accion({ cuenta: tienda, chip: "premios" }),
            claveDeMas: await accion({ cuenta: tienda, tiendaId: esc.tiendaC }),
            desdeDespuesDeHasta: await accion({ cuenta: tienda, desde: "2026-09-15", hasta: "2026-09-10" }),
            sinSesion: await verEstadoCuentaAction({ cuenta: tienda }, { getActor: async () => null, service: ec }),
          },
        };
      });
    } catch (error) {
      fallo = error;
    }
  }, 300_000);

  afterAll(async () => {
    await prisma?.$disconnect();
  });

  it("R22/D3: con el pago en el periodo y su anulacion FUERA, el pago cuenta en los totales y la cuenta cuadra con el corrido", () => {
    const e = m().pagoSinSuAnulacion;
    // Saldo inicial al terminar el 11 CR: 6 200,00. Solo c5 (−3 000,00). Final 3 200,00 = su corrido.
    expect(e.filas.map(lineaDe)).toEqual(["2026-09-12|3000.00|-|3200.00|pagos"]);
    expect([e.saldoInicial, e.abonos, e.cargos, e.saldoFinal]).toEqual(["6200.00", "0.00", "3000.00", "3200.00"]);
    expect(e.saldoFinal).toBe(e.filas[e.filas.length - 1].saldoCorrido);
  });

  // SLT-73 (R33) — la bodega Z (ver la siembra en `_fixtures/wallet-458.ts`). Saldo inicial al terminar
  // el 11 CR: b1 4 500 + b2 6 000 = 10 500,00. El 12: b2 recibido 4 000 y el cierre de la rechazada 900.
  // Final 10 500 + 900 − 4 000 = 7 400,00 = el corrido de la ultima fila. Con `total_efectivo` en los
  // totales el inicial seria 9 500,00 y no cuadraria con el corrido.
  it("SLT-73 R33: los totales del periodo de la bodega salen de la misma formula que la pagina", () => {
    const e = m().bodega12;
    expect(e.filas.map(lineaDe)).toEqual([
      "2026-09-12|-|4000.00|6500.00|recibido",
      "2026-09-12|900.00|-|7400.00|sin_consolidar",
    ]);
    expect([e.saldoInicial, e.abonos, e.cargos, e.saldoFinal, e.saldoActual]).toEqual([
      "10500.00",
      "4000.00",
      "900.00",
      "7400.00",
      "9150.00",
    ]);
    expect(e.saldoFinal).toBe(e.filas[e.filas.length - 1].saldoCorrido);
  });

  it("SLT-73 R32/R33: el chip «sin consolidar» filtra solo esas filas, sin mover el corrido; la descarga = la pantalla", () => {
    expect(m().bodegaSinConsolidar.filas.map(lineaDe)).toEqual([
      "2026-09-12|900.00|-|7400.00|sin_consolidar",
      "2026-09-15|1750.00|-|9150.00|sin_consolidar",
    ]);
    expect(m().bodegaSinConsolidar.filas.every((f) => f.consolidacionId === null)).toBe(true);
    const d = m().bodegaDescarga;
    if (d.status !== "ok") throw new Error(`descarga: ${d.status}`);
    const entera = m().bodegaEntera;
    expect(d.estado.filas.map(lineaDe)).toEqual(entera.filas.map(lineaDe));
    expect(d.estado.filas).toHaveLength(5);
    expect([d.estado.saldoInicial, d.estado.abonos, d.estado.cargos, d.estado.saldoFinal]).toEqual([
      "0.00",
      "4000.00",
      "13150.00",
      "9150.00",
    ]);
  });

  it("R23: paginas de 3 = la lectura entera, sin repetir ni omitir, con el mismo corrido", () => {
    const juntas = m().paginas.flatMap((p) => p.filas.map(lineaDe));
    expect(juntas).toEqual(m().entero.filas.map(lineaDe));
    expect(m().paginas.map((p) => p.filas.length)).toEqual([3, 3, 1]);
    expect(m().paginas.every((p) => p.total === 7)).toBe(true);
    const refs = m().paginas.flatMap((p) => p.filas.map((f) => (f.ref && "movimientoId" in f.ref ? f.ref.movimientoId : "")));
    expect(new Set(refs).size).toBe(7);
  });

  it("R81: sin acceso total `forbidden`; otro papel o inexistente `no_encontrado`; chip ajeno, clave de mas o periodo al reves `validation_error`; sin sesion `unauthenticated`", () => {
    const r = m().respuestas;
    expect(r.tiendaPideLaSuya).toEqual({ status: "forbidden" });
    expect(r.comoMensajero).toEqual({ status: "no_encontrado" });
    expect(r.inexistente).toEqual({ status: "no_encontrado" });
    expect(r.chipAjeno.status).toBe("validation_error");
    expect(r.claveDeMas.status).toBe("validation_error");
    expect(r.desdeDespuesDeHasta.status).toBe("validation_error");
    expect(r.sinSesion).toEqual({ status: "unauthenticated" });
  });

  it("H6: ninguna fila lleva un identificador donde se pinta: fecha, montos y chip son datos; el id solo viaja en `ref`", () => {
    const uuid = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
    for (const f of m().entero.filas) {
      expect(lineaDe(f)).not.toMatch(uuid);
      expect(f.registro.nombre ?? "").not.toMatch(uuid);
    }
  });
});
