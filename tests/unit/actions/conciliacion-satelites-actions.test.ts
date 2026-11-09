import { describe, it, expect, vi } from "vitest";

import {
  corregirConsolidacionRecibidaAction,
  listarConsolidacionesSateliteAction,
  listarSaldosSatelitesAction,
  marcarConsolidacionRecibidaAction,
  revertirConciliacionAction,
} from "@/lib/actions/conciliacion-satelites";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IConciliacionSatelitesService } from "@/lib/interfaces/services/IConciliacionSatelitesService";
import { montoPositivoSchema } from "@/lib/types/wallet";
import { MENSAJE_MONTO_RECIBIDO_FORMA } from "@/lib/types/conciliacion-satelites";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 / T8 (R10/R27) — EL BORDE: SIN SESION, ENTRADA INVALIDA, Y LO QUE NO SE ESCRIBE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// EL ORDEN ES LA ASERCION, no un detalle de estilo:
//   1. SIN SESION se corta ANTES de validar y ANTES de construir el servicio;
//   2. `schema.parse` mata en el BORDE el monto ausente, negativo o con tres decimales (R10), y
//      —por el `.strict()`— cualquier clave colada;
//   3. el ROL lo decide el SERVICIO (eso se mide en `conciliacion-satelites-service.test.ts`).
//
// En los dos primeros casos, `expect(service.x).not.toHaveBeenCalled()` es lo que afirma que NO SE
// ESCRIBE NADA: R10 dice «y NO DEBE escribir nada», y eso no se prueba mirando el `status`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const CB = "22222222-2222-4222-8222-222222222222";
const ZONA = "11111111-1111-4111-8111-111111111111";

function fakeService(overrides: Partial<IConciliacionSatelitesService> = {}) {
  return {
    listarSaldosSatelites: vi.fn(async () => ({
      status: "ok" as const,
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    })),
    listarSaldosSatelitesCompleto: vi.fn(async () => ({
      status: "ok" as const,
      items: [],
      total: 0,
    })),
    listarConsolidacionesSatelite: vi.fn(async () => ({
      status: "ok" as const,
      items: [],
      page: 1,
      pageSize: 25,
      total: 0,
    })),
    listarConsolidacionesSateliteCompleto: vi.fn(async () => ({
      status: "ok" as const,
      items: [],
      total: 0,
    })),
    marcarRecibida: vi.fn(async () => ({ status: "ok" as const, cierreBodegaId: CB })),
    revertirConciliacion: vi.fn(async () => ({ status: "ok" as const, cierreBodegaId: CB })),
    corregirRecibida: vi.fn(async () => ({ status: "ok" as const, cierreBodegaId: CB })),
    ...overrides,
  } as unknown as IConciliacionSatelitesService & Record<string, ReturnType<typeof vi.fn>>;
}

const conActor = (actor: Actor | null) => ({ getActor: async () => actor });

/** Lee las llamadas de un doble que viaja tipado como el metodo de la interfaz (ver el servicio). */
function llamadasDe(fn: unknown): unknown[][] {
  return (fn as { mock: { calls: unknown[][] } }).mock.calls;
}

describe("431/T8 — el borde: sin sesion", () => {
  it("⭑ sin sesion, las cuatro acciones devuelven `unauthenticated` y NO tocan el servicio", async () => {
    const service = fakeService();
    const deps = { service, ...conActor(null) };

    expect((await listarSaldosSatelitesAction({}, deps)).status).toBe("unauthenticated");
    expect(
      (await listarConsolidacionesSateliteAction({ zonaId: ZONA }, deps)).status,
    ).toBe("unauthenticated");
    expect(
      (
        await marcarConsolidacionRecibidaAction(
          { cierreBodegaId: CB, montoRecibido: "485.00" },
          deps,
        )
      ).status,
    ).toBe("unauthenticated");
    expect((await revertirConciliacionAction({ cierreBodegaId: CB }, deps)).status).toBe(
      "unauthenticated",
    );

    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });
});

describe("431/T8 (R10) — el monto muere en el borde, y no se escribe nada", () => {
  it.each([
    ["ausente", {}],
    ["cadena vacia", { montoRecibido: "" }],
    ["negativo", { montoRecibido: "-1.00" }],
    ["con TRES decimales", { montoRecibido: "485.123" }],
    ["no numerico", { montoRecibido: "mucho" }],
    ["un number y no un string", { montoRecibido: 485 }],
  ])("⭑ monto %s -> `validation_error` y el servicio NI SE LLAMA", async (_n, parche) => {
    const service = fakeService();
    const r = await marcarConsolidacionRecibidaAction(
      { cierreBodegaId: CB, ...parche },
      { service, ...conActor(MAESTRO) },
    );

    expect(r.status).toBe("validation_error");
    // R10: «NO DEBE escribir nada». Esto es lo que lo afirma.
    expect(service.marcarRecibida).not.toHaveBeenCalled();
  });

  it("⭑ SLT-96: el CERO pasa el borde y llega al servicio, que decide contra lo declarado", async () => {
    // La 431 lo rechazaba aqui («recibi ₡0 no es una marca»). Carlos (2026-11-09) lo admite SOLO con
    // lo declarado en 0, y eso el borde no lo sabe: deja pasar la forma y el repositorio decide.
    const service = fakeService();
    const r = await marcarConsolidacionRecibidaAction(
      { cierreBodegaId: CB, montoRecibido: "0.00" },
      { service, ...conActor(MAESTRO) },
    );
    expect(r.status).toBe("ok");
    expect(service.marcarRecibida).toHaveBeenCalledWith(
      { cierreBodegaId: CB, montoRecibido: "0.00" },
      MAESTRO,
    );
  });

  it("un monto VALIDO pasa, con y sin nota", async () => {
    // Control positivo: sin el, un schema que lo rechazara todo pasaria los casos de arriba.
    const service = fakeService();
    const deps = { service, ...conActor(MAESTRO) };

    expect(
      (
        await marcarConsolidacionRecibidaAction(
          { cierreBodegaId: CB, montoRecibido: "485.00" },
          deps,
        )
      ).status,
    ).toBe("ok");
    expect(
      (
        await marcarConsolidacionRecibidaAction(
          { cierreBodegaId: CB, montoRecibido: "485", nota: "faltaron 15" },
          deps,
        )
      ).status,
    ).toBe("ok");
    expect(service.marcarRecibida).toHaveBeenCalledTimes(2);
  });

  it("⭑ `.strict()`: una clave colada muere en el borde", async () => {
    // Lo que esto impide de verdad: que alguien mande `actorUsuarioId` o `estado` en el payload y
    // el borde se lo pase al servicio. Quien marca sale de la SESION, siempre.
    const service = fakeService();
    const r = await marcarConsolidacionRecibidaAction(
      { cierreBodegaId: CB, montoRecibido: "485.00", actorUsuarioId: "otro" },
      { service, ...conActor(MAESTRO) },
    );

    expect(r.status).toBe("validation_error");
    expect(service.marcarRecibida).not.toHaveBeenCalled();
  });

  it("un `cierreBodegaId` que no es uuid muere en el borde", async () => {
    const service = fakeService();
    const r = await revertirConciliacionAction(
      { cierreBodegaId: "no-soy-un-uuid" },
      { service, ...conActor(MAESTRO) },
    );
    expect(r.status).toBe("validation_error");
    expect(service.revertirConciliacion).not.toHaveBeenCalled();
  });
});

describe("431/T8 — el borde transporta lo que el servicio decide, sin reinterpretarlo", () => {
  it("`forbidden` del servicio llega tal cual (el rol es dominio, no transporte)", async () => {
    const service = fakeService({
      marcarRecibida: vi.fn(async () => ({ status: "forbidden" as const })),
    });
    const r = await marcarConsolidacionRecibidaAction(
      { cierreBodegaId: CB, montoRecibido: "485.00" },
      { service, ...conActor(MAESTRO) },
    );
    expect(r).toEqual({ status: "forbidden" });
  });

  it("`conflict` y `no_encontrada` llegan tal cual", async () => {
    const enConflicto = fakeService({
      marcarRecibida: vi.fn(async () => ({ status: "conflict" as const })),
    });
    expect(
      await marcarConsolidacionRecibidaAction(
        { cierreBodegaId: CB, montoRecibido: "1.00" },
        { service: enConflicto, ...conActor(MAESTRO) },
      ),
    ).toEqual({ status: "conflict" });

    const inexistente = fakeService({
      revertirConciliacion: vi.fn(async () => ({ status: "no_encontrada" as const })),
    });
    expect(
      await revertirConciliacionAction(
        { cierreBodegaId: CB },
        { service: inexistente, ...conActor(MAESTRO) },
      ),
    ).toEqual({ status: "no_encontrada" });
  });

  it("⭑ SLT-73 R14: `con_asientos` llega con el mensaje «Ya entró a la caja…»", async () => {
    const service = fakeService({
      revertirConciliacion: vi.fn(async () => ({ status: "con_asientos" as const })),
    });
    expect(
      await revertirConciliacionAction({ cierreBodegaId: CB }, { service, ...conActor(MAESTRO) }),
    ).toEqual({
      status: "con_asientos",
      mensaje: "Ya entró a la caja: corrige el monto en vez de revertir",
    });
  });

  it("el listado aplica los valores por defecto de paginacion del dominio", async () => {
    const service = fakeService();
    await listarSaldosSatelitesAction({}, { service, ...conActor(MAESTRO) });
    const input = llamadasDe(service.listarSaldosSatelites)[0][0] as {
      page: number;
      pageSize: number;
    };
    expect(input.page).toBe(1);
    expect(input.pageSize).toBeGreaterThan(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 473 / T4 (R10/R11) — CORREGIR: el mismo borde que marcar, y la escritura propia.
// ═════════════════════════════════════════════════════════════════════════════════════════════

describe("473/T4 — corregirConsolidacionRecibidaAction", () => {
  it("R10 corregir sin sesion responde unauthenticated sin llamar al servicio", async () => {
    const service = fakeService();
    const r = await corregirConsolidacionRecibidaAction(
      // Entrada INVALIDA a proposito: sin sesion se corta ANTES de validar.
      { cierreBodegaId: "no-uuid", montoRecibido: "-1", extra: 1 },
      { service, ...conActor(null) },
    );
    expect(r.status).toBe("unauthenticated");
    for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
  });

  it.each([
    ["monto ausente", {}],
    ["monto negativo", { montoRecibido: "-5.00" }],
    ["monto con tres decimales", { montoRecibido: "200800.001" }],
    ["monto no numerico", { montoRecibido: "doscientos" }],
    ["clave extra", { montoRecibido: "200800.00", actorUsuarioId: "otro" }],
    ["nota de 501 caracteres", { montoRecibido: "200800.00", nota: "x".repeat(501) }],
  ])(
    "R11 corregir con %s responde validation_error sin llamar al servicio",
    async (_n, parche) => {
      const service = fakeService();
      const r = await corregirConsolidacionRecibidaAction(
        { cierreBodegaId: CB, ...parche },
        { service, ...conActor(MAESTRO) },
      );
      expect(r.status).toBe("validation_error");
      // La clave colada la reporta zod como error de FORMULARIO (`unrecognized_keys`), no de campo:
      // es el mismo mapeo que hoy usa marcar. Los demas casos SI traen su campo.
      if (r.status === "validation_error" && _n !== "clave extra") {
        expect(Object.keys(r.fieldErrors).length).toBeGreaterThan(0);
      }
      for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    },
  );

  it("corregir ok: llama a corregirRecibida (con nota de 500) y NUNCA a marcarRecibida", async () => {
    const service = fakeService();
    const nota = "y".repeat(500);
    const r = await corregirConsolidacionRecibidaAction(
      { cierreBodegaId: CB, montoRecibido: "200800.00", nota },
      { service, ...conActor(MAESTRO) },
    );
    expect(r).toEqual({ status: "ok", cierreBodegaId: CB });
    expect(service.corregirRecibida).toHaveBeenCalledTimes(1);
    expect(service.corregirRecibida).toHaveBeenCalledWith(
      { cierreBodegaId: CB, montoRecibido: "200800.00", nota },
      MAESTRO,
    );
    expect(service.marcarRecibida).not.toHaveBeenCalled();
  });

  it("marcar NO llama a corregirRecibida", async () => {
    const service = fakeService();
    await marcarConsolidacionRecibidaAction(
      { cierreBodegaId: CB, montoRecibido: "1.00" },
      { service, ...conActor(MAESTRO) },
    );
    expect(service.corregirRecibida).not.toHaveBeenCalled();
  });

  it("`conflict`, `no_encontrada` y `forbidden` del servicio llegan tal cual", async () => {
    for (const status of ["conflict", "no_encontrada", "forbidden"] as const) {
      const service = fakeService({ corregirRecibida: vi.fn(async () => ({ status })) });
      expect(
        await corregirConsolidacionRecibidaAction(
          { cierreBodegaId: CB, montoRecibido: "1.00" },
          { service, ...conActor(MAESTRO) },
        ),
      ).toEqual({ status });
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ SLT-96 «Consolidación de ₡0 no se puede marcar recibida» (R5/R6/R8) — el borde admite la FORMA
// del 0 en marcar y corregir; si vale, lo decide el repositorio leyendo lo declarado de la base.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const ACCIONES = [
  ["marcar", marcarConsolidacionRecibidaAction, "marcarRecibida"],
  ["corregir", corregirConsolidacionRecibidaAction, "corregirRecibida"],
] as const;

describe("SLT-96 (R6) — la forma del monto en el borde, en marcar y en corregir", () => {
  const RECHAZOS: Array<[string, Record<string, unknown>]> = [
    ["ausente", {}],
    ["vacio", { montoRecibido: "" }],
    ["negativo", { montoRecibido: "-1.00" }],
    ["-0", { montoRecibido: "-0" }],
    ["-0.00", { montoRecibido: "-0.00" }],
    ["0 con tres decimales", { montoRecibido: "0.000" }],
    ["con tres decimales", { montoRecibido: "485.123" }],
    ["no numerico", { montoRecibido: "mucho" }],
    ["un number 0", { montoRecibido: 0 }],
    ["un number", { montoRecibido: 485 }],
  ];

  for (const [nombre, accion, metodo] of ACCIONES) {
    it.each(RECHAZOS)(
      `R6 ${nombre} con monto %s -> validation_error en el campo y el servicio NI SE LLAMA`,
      async (_n, parche) => {
        const service = fakeService();
        const r = await accion({ cierreBodegaId: CB, ...parche }, { service, ...conActor(MAESTRO) });
        expect(r.status).toBe("validation_error");
        if (r.status === "validation_error") {
          expect(r.fieldErrors.montoRecibido?.length ?? 0).toBeGreaterThan(0);
        }
        for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
        void metodo;
      },
    );

    it.each(["0", "0.0", "0.00", "485.00", "0.01"])(
      `R6 ${nombre} con monto %s llega al servicio tal cual`,
      async (monto) => {
        const service = fakeService();
        const r = await accion(
          { cierreBodegaId: CB, montoRecibido: monto },
          { service, ...conActor(MAESTRO) },
        );
        expect(r.status).toBe("ok");
        expect(service[metodo]).toHaveBeenCalledWith(
          { cierreBodegaId: CB, montoRecibido: monto },
          MAESTRO,
        );
      },
    );

    it(`R5 ${nombre}: una clave «declarado» en la entrada muere en el borde (lo declarado sale de la base)`, async () => {
      const service = fakeService();
      const r = await accion(
        { cierreBodegaId: CB, montoRecibido: "0.00", declarado: "0.00" },
        { service, ...conActor(MAESTRO) },
      );
      expect(r.status).toBe("validation_error");
      for (const fn of Object.values(service)) expect(fn).not.toHaveBeenCalled();
    });
  }

  it("R6 el aviso de forma del monto es el literal del contrato", async () => {
    const service = fakeService();
    const r = await marcarConsolidacionRecibidaAction(
      { cierreBodegaId: CB, montoRecibido: "-0" },
      { service, ...conActor(MAESTRO) },
    );
    expect(r).toEqual({
      status: "validation_error",
      fieldErrors: { montoRecibido: ["El monto debe ser 0 o mayor, con hasta 2 decimales."] },
    });
    // El literal de arriba ES el contrato; esta linea solo comprueba que la constante no se aparto.
    expect(MENSAJE_MONTO_RECIBIDO_FORMA).toBe("El monto debe ser 0 o mayor, con hasta 2 decimales.");
  });

  it("R2 el validation_error del servicio (0 con declarado distinto de 0) llega tal cual", async () => {
    const fe = { montoRecibido: ["Solo se puede registrar 0 cuando lo declarado es 0."] };
    const service = fakeService({
      marcarRecibida: vi.fn(async () => ({ status: "validation_error" as const, fieldErrors: fe })),
    });
    expect(
      await marcarConsolidacionRecibidaAction(
        { cierreBodegaId: CB, montoRecibido: "0.00" },
        { service, ...conActor(MAESTRO) },
      ),
    ).toEqual({ status: "validation_error", fieldErrors: fe });
  });
});

describe("SLT-96 (R8) — `montoPositivoSchema` no cambia", () => {
  it.each(["0", "0.00"])("R8 montoPositivoSchema sigue rechazando %s", (v) => {
    expect(montoPositivoSchema.safeParse(v).success).toBe(false);
  });

  it("R8 control: montoPositivoSchema acepta 0.01", () => {
    expect(montoPositivoSchema.safeParse("0.01").success).toBe(true);
  });
});
