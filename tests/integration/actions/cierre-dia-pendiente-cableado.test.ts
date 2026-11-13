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
 */

const argsCapturados: unknown[][] = [];

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

const MENSAJERO: Actor = { usuarioId: "m-1", rol: "mensajero" };

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
