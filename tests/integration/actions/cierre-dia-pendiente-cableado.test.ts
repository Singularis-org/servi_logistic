import { describe, expect, it, vi } from "vitest";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { LiquidacionPagoRepository } from "@/lib/repositories/LiquidacionPagoRepository";
import { PagoMensajeroMovimientoRepository } from "@/lib/repositories/PagoMensajeroMovimientoRepository";

/**
 * SLT-137 (R165) — EL COMPOSITION ROOT **PASA** LAS DOS LECTURAS DEL PENDIENTE DE PAGO.
 *
 * El parametro `pendientes` de `CierreDiaService` es opcional: sin el, el listado sale sin
 * `pendientePagoMensajero` y la cola dice «Sin dato» en cada aprobado, con la suite en verde. Por
 * eso no basta con que `lib/actions/cierre-dia.ts` IMPORTE los repositorios: se ejecuta la acción
 * SIN servicio inyectado y se mira qué recibió el constructor (patron de
 * `gestion-desde-ayuda-cableado.test.ts`).
 *
 * Se mockea la clase del servicio para capturar sus argumentos y el cliente de Prisma para no abrir
 * ninguna conexion: aqui se mide el cableado, no la base.
 *
 * SLT-139 (R335, R344) — la lectura de «pagado por la satelite» es OPCIONAL en el tipo de los tres
 * servicios (`CierreDiaService`, `CierresAdminService`, `LiquidacionService`) y ruidosa si falta.
 * Lo que garantiza que en produccion no falte es esto: las tres acciones, ejecutadas sin servicio
 * inyectado, le pasan el `PagoMensajeroMovimientoRepository` real con
 * `sumarPagadoSatelitePorCierre` como funcion.
 */

const argsCapturados: unknown[][] = [];
const argsCierresAdmin: unknown[][] = [];
const argsLiquidacion: unknown[][] = [];

vi.mock("@/lib/db/prisma-client", () => ({
  // Los repositorios solo lo guardan en su constructor; ninguno consulta al construirse.
  getPrismaClient: () => ({}) as never,
  PRISMA_OMIT: { orden: { busquedaTexto: true } },
}));

vi.mock("@/lib/services/CierreDiaService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/CierreDiaService")>();
  return {
    ...real,
    CierreDiaService: class {
      constructor(...args: unknown[]) {
        argsCapturados.push(args);
      }
      async listarCierresPasadosPaginado(input: { page: number; pageSize: number }) {
        return { status: "ok" as const, items: [], page: input.page, pageSize: input.pageSize, total: 0 };
      }
      async resumenGanancia() {
        return { status: "sin_dato" as const }; // SLT-112: aqui solo se mide el constructor
      }
    },
  };
});

vi.mock("@/lib/services/CierresAdminService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/CierresAdminService")>();
  return {
    ...real,
    CierresAdminService: class {
      constructor(...args: unknown[]) {
        argsCierresAdmin.push(args);
      }
      async listarCierresAdmin() {
        return { status: "ok" as const, pendientes: [], historico: [] };
      }
    },
  };
});

vi.mock("@/lib/services/LiquidacionService", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/services/LiquidacionService")>();
  return {
    ...real,
    LiquidacionService: class {
      constructor(...args: unknown[]) {
        argsLiquidacion.push(args);
      }
      async previsualizarRepartoMensajero() {
        return { status: "forbidden" as const };
      }
    },
  };
});

const MENSAJERO: Actor = { usuarioId: "m-1", rol: "mensajero" };
const MAESTRO: Actor = { usuarioId: "adm-1", rol: "maestro" };

/** SLT-139: el argumento es el repositorio REAL del libro y trae la lectura como funcion. */
function esLecturaDeSatelite(arg: unknown): void {
  expect(arg).toBeInstanceOf(PagoMensajeroMovimientoRepository);
  expect(typeof (arg as PagoMensajeroMovimientoRepository).sumarPagadoSatelitePorCierre).toBe("function");
}

describe("SLT-137 · `buildService()` de /cierre-dia inyecta las lecturas del pendiente", () => {
  it("ejecutada SIN servicio inyectado, el ultimo argumento trae los dos repositorios reales (R165)", async () => {
    const { listarCierresPasadosPaginado } = await import("@/lib/actions/cierre-dia");

    const r = await listarCierresPasadosPaginado({}, { getActor: async () => MENSAJERO });

    expect(r.status).toBe("ok");
    expect(argsCapturados).toHaveLength(1);
    const args = argsCapturados[0];
    // El parametro va despues de `reglasPais` (el octavo); SLT-112 añade `ganancia` detras (el decimo).
    expect(args).toHaveLength(10);
    const pendientes = args[8] as { liquidaciones?: unknown; premios?: unknown } | undefined;

    expect(pendientes).toBeDefined();
    expect(pendientes?.liquidaciones).toBeInstanceOf(LiquidacionPagoRepository);
    expect(pendientes?.premios).toBeInstanceOf(PagoMensajeroMovimientoRepository);
    expect(typeof (pendientes?.liquidaciones as LiquidacionPagoRepository).sumarVigentesPorCierre).toBe(
      "function",
    );
    expect(
      typeof (pendientes?.premios as PagoMensajeroMovimientoRepository).sumarPremiosVivosPorCierre,
    ).toBe("function");
    // SLT-139 (R335): el mismo repositorio trae la lectura de «pagado por la satelite».
    esLecturaDeSatelite(pendientes?.premios);
  });
});

describe("SLT-139 R335/R344 — las otras dos acciones pasan la lectura de «pagado por la satelite»", () => {
  it("/cierres-admin: el sexto argumento de CierresAdminService es el repositorio real con la lectura (R335)", async () => {
    const { listarCierresAdmin } = await import("@/lib/actions/cierres-admin");

    const r = await listarCierresAdmin({ getActor: async () => MAESTRO });

    expect(r.status).toBe("ok");
    expect(argsCierresAdmin).toHaveLength(1);
    // (repo, zonaRepo, ordenRepo, signedUrls, liquidacionRepo, premiosRepo, ...)
    esLecturaDeSatelite(argsCierresAdmin[0]![5]);
  });

  it("liquidacion: el tercer argumento de LiquidacionService es el repositorio real con la lectura (R344)", async () => {
    const { previsualizarRepartoMensajeroAction } = await import("@/lib/actions/liquidacion");

    await previsualizarRepartoMensajeroAction(
      { mensajeroId: "6b1f2c3d-0000-4000-8000-000000000139", monto: "1000.00" },
      { getActor: async () => MAESTRO },
    );

    expect(argsLiquidacion).toHaveLength(1);
    // (pagoRepo, tiendaRepo, mensajeroRepo, runTransaction, ...)
    esLecturaDeSatelite(argsLiquidacion[0]![2]);
  });
});

describe("SLT-112 · `buildService()` de /cierre-dia inyecta la lectura de los pagos del mes", () => {
  it("ejecutada SIN servicio inyectado, el decimo argumento trae el repositorio real de pagos (R352, R357)", async () => {
    const { resumenGananciaMensajero } = await import("@/lib/actions/cierre-dia");
    argsCapturados.length = 0;

    const r = await resumenGananciaMensajero({ getActor: async () => MENSAJERO });

    // La accion devuelve lo que da el doble del servicio; las cifras reales contra la base las mide
    // `tests/integration/db/cierre-dia-ganancia-accion-real.test.ts`.
    expect(r).toEqual({ status: "sin_dato" });
    expect(argsCapturados).toHaveLength(1);
    const args = argsCapturados[0];
    expect(args).toHaveLength(10);
    const ganancia = args[9] as { pagos?: unknown; pagadoPorSatelite?: unknown } | undefined;
    expect(ganancia).toBeDefined();
    expect(ganancia?.pagos).toBeInstanceOf(LiquidacionPagoRepository);
    expect(
      typeof (ganancia?.pagos as LiquidacionPagoRepository).sumarVigentesDelMensajeroEnRango,
    ).toBe("function");
    // R353: hasta SLT-139 no hay lectura de lo pagado por la satelite que inyectar.
    expect(ganancia?.pagadoPorSatelite).toBeUndefined();
  });
});
