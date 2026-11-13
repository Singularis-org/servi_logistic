import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CifrasBodegaLoteRepository } from "@/lib/repositories/CifrasBodegaLoteRepository";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";

/**
 * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (T2.3; R385, R386, R389) — EL
 * COMPOSITION ROOT **PASA** LAS LECTURAS DE LAS CIFRAS.
 *
 * En los dos servicios la lectura en lote (y, en la central, las tres de pago) es OPCIONAL en el tipo:
 * sin ella, con un cierre nuevo, el servicio lanza y la descarga se cae con la suite en verde. No basta
 * con que `lib/actions/cierre-bodega.ts` IMPORTE los repositorios: se ejecuta cada accion SIN servicio
 * inyectado y se mira que recibio el constructor (patron de `cierre-dia-pendiente-cableado.test.ts`).
 *
 * Se mockean las clases de los servicios para capturar sus argumentos y el cliente de Prisma para no
 * abrir ninguna conexion: aqui se mide el cableado, no la base.
 */

const argsAdmin: unknown[][] = [];
const argsSatelite: unknown[][] = [];

vi.mock("@/lib/db/prisma-client", () => ({
  // Los repositorios solo lo guardan en su constructor; ninguno consulta al construirse.
  getPrismaClient: () => ({}) as never,
  PRISMA_OMIT: { orden: { busquedaTexto: true } },
}));

vi.mock("@/lib/services/CierresBodegaAdminService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/CierresBodegaAdminService")>();
  return {
    ...real,
    CierresBodegaAdminService: class {
      constructor(...args: unknown[]) {
        argsAdmin.push(args);
      }
      async listarHistoricoCierresBodegaCompleto() {
        return { status: "ok" as const, items: [], total: 0 };
      }
      async listarPendientesCierresBodegaCompleto() {
        return { status: "ok" as const, items: [], total: 0 };
      }
    },
  };
});

vi.mock("@/lib/services/CierreBodegaService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/CierreBodegaService")>();
  return {
    ...real,
    CierreBodegaService: class {
      constructor(...args: unknown[]) {
        argsSatelite.push(args);
      }
      async listarCierresBodegaSolicitadosCompleto() {
        return { status: "ok" as const, items: [], total: 0 };
      }
    },
  };
});

const MAESTRO: Actor = { usuarioId: "adm-1", rol: "maestro" };
const SATELITE: Actor = { usuarioId: "sat-1", rol: "adminSatelite" };

/** El argumento es la lectura en lote REAL, con su metodo como funcion. */
function esLecturaEnLote(arg: unknown): void {
  expect(arg).toBeInstanceOf(CifrasBodegaLoteRepository);
  expect(typeof (arg as CifrasBodegaLoteRepository).leerCierresDiaDeBodegas).toBe("function");
}

describe("SLT-141 · las acciones de la central construyen CierresBodegaAdminService con las lecturas de las cifras", () => {
  it.each([
    ["Conciliados", "listarHistoricoCierresBodegaCompleto"],
    ["Por conciliar", "listarPendientesCierresBodegaCompleto"],
  ] as const)("%s: el quinto argumento es la lectura en lote y el sexto, las tres lecturas de pago reales", async (_n, accion) => {
    const acciones = await import("@/lib/actions/cierre-bodega");
    argsAdmin.length = 0;

    const r = await acciones[accion]({}, { getActor: async () => MAESTRO });

    expect(r.status).toBe("ok");
    expect(argsAdmin).toHaveLength(1);
    const args = argsAdmin[0]!;
    // (repo, signedUrls, reglasPais, zonaDelUsuario, cifrasLote, pagosEntregados)
    expect(args).toHaveLength(6);
    esLecturaEnLote(args[4]);
    const pagos = args[5] as { liquidaciones?: unknown; premios?: unknown } | undefined;
    expect(pagos).toBeDefined();
    expect(pagos?.liquidaciones).toBeInstanceOf(LiquidacionPagoRepository);
    expect(typeof (pagos?.liquidaciones as LiquidacionPagoRepository).sumarVigentesPorCierre).toBe("function");
    expect(pagos?.premios).toBeInstanceOf(PagoMensajeroMovimientoRepository);
    const premios = pagos?.premios as PagoMensajeroMovimientoRepository;
    expect(typeof premios.sumarPremiosVivosPorCierre).toBe("function");
    // SLT-139: el mismo repositorio trae la lectura de «pagado por la satelite».
    expect(typeof premios.sumarPagadoSatelitePorCierre).toBe("function");
  });
});

describe("SLT-141 · la accion de la satelite construye CierreBodegaService con la lectura en lote y sin pagos", () => {
  it("«Solicitados»: el quinto argumento es la lectura en lote real y no hay sexto (F481)", async () => {
    const { listarCierresBodegaSolicitadosCompleto } = await import("@/lib/actions/cierre-bodega");
    argsSatelite.length = 0;

    const r = await listarCierresBodegaSolicitadosCompleto({}, { getActor: async () => SATELITE });

    expect(r.status).toBe("ok");
    expect(argsSatelite).toHaveLength(1);
    const args = argsSatelite[0]!;
    // (repo, ordenRepo, reglasPais, ahora, cifrasLote)
    expect(args).toHaveLength(5);
    esLecturaEnLote(args[4]);
  });
});
