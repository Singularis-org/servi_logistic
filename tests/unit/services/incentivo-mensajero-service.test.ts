import { describe, it, expect, vi } from "vitest";

import type { CierreImputableDTO } from "@/lib/interfaces/repositories/ILiquidacionPagoRepository";
import type {
  CrearPagoMensajeroInput,
  IncentivoRow,
} from "@/lib/interfaces/repositories/IPagoMensajeroMovimientoRepository";
import type { MovimientoDeCajaDeIncentivo } from "@/lib/interfaces/services/ICajaIncentivoMensajeroFeedService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { IncentivoMensajeroService, cierreMasReciente } from "@/lib/services/IncentivoMensajeroService";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// SLT-68 (design §6.1/§6.2) — IncentivoMensajeroService con dobles: el ORDEN (rol → leer →
// transaccion), que se escribe y con que, y que una escritura que falla no deja `ok` (R1, R5, R11).
// Lo que decide la BASE (CHECK, unico de origen, sumas, RLS) se mide en
// `tests/integration/db/incentivo-mensajero-slt68.test.ts`.
// ═════════════════════════════════════════════════════════════════════════════════════════════

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const ADMIN: Actor = { usuarioId: "u-admin", rol: "admin" };
const SIN_ACCESO_TOTAL: Actor[] = [
  { usuarioId: "u-t", rol: "adminTienda" },
  { usuarioId: "u-m", rol: "mensajero" },
  { usuarioId: "u-s", rol: "adminSatelite", zonaId: "z" },
  { usuarioId: "u-a", rol: "apiKey" },
  { usuarioId: "u-x", rol: "superadmin" },
];

const MENSAJERO = "6a1d1f4e-6f0a-4d43-9d1b-2b8d6f1c0a01";
const ID_INCENTIVO = "inc-fijo";

function cierre(id: string, solicitadoAt: string): CierreImputableDTO {
  return { id, mensajeroId: MENSAJERO, estado: "aprobado", totalPagoMensajero: "0.00", totalEfectivo: "0.00", solicitadoAt };
}

const REGISTRO = {
  mensajeroId: MENSAJERO,
  monto: "2500.00",
  motivo: "Cubrió dos rutas extra",
  claveIdempotencia: "1b7a4f0e-2c3d-4e5f-8a9b-0c1d2e3f4a5b",
};

function montaje(opciones: {
  cierres?: CierreImputableDTO[];
  nombre?: string | null;
  enCaja?: number;
  enLibro?: number;
  incentivo?: IncentivoRow | null;
  reversoCaja?: number;
} = {}) {
  const TX = { marca: "tx-slt68" };
  const orden: string[] = [];
  const cierres = {
    listarCierresImputables: vi.fn(async () => {
      orden.push("listarCierres");
      return opciones.cierres ?? [cierre("c-viejo", "2026-10-01T23:00:00.000Z"), cierre("c-nuevo", "2026-10-20T23:00:00.000Z")];
    }),
    bloquearBeneficiario: vi.fn(async () => {
      orden.push("bloquear");
    }),
    obtenerCierreParaPago: vi.fn(async (id: string) => {
      orden.push("releer");
      return { id, mensajeroId: MENSAJERO, estado: "aprobado" as const, totalPagoMensajero: "0.00", totalEfectivo: "0.00" };
    }),
  };
  const libro = {
    obtenerNombreMensajero: vi.fn(async () => (opciones.nombre === undefined ? "Juan Pérez" : opciones.nombre)),
    crearMovimientos: vi.fn(async (_tx: unknown, movs: CrearPagoMensajeroInput[]) => {
      orden.push(`libro:${movs[0]?.categoria}`);
      return opciones.enLibro ?? movs.length;
    }),
    obtenerIncentivo: vi.fn(async () => (opciones.incentivo === undefined ? null : opciones.incentivo)),
    agregarCuentaPorPagar: vi.fn(async () => ({ devengado: "7500.00", pagado: "5000.00" })),
  };
  const caja = {
    emitirEgreso: vi.fn<PuertoDeCaja>(async () => {
      orden.push("caja:egreso");
      return opciones.enCaja ?? 1;
    }),
    reversarEgreso: vi.fn<PuertoDeCaja>(async () => {
      orden.push("caja:reverso");
      return opciones.reversoCaja ?? 1;
    }),
  };
  const runTransaction = vi.fn(async (fn: (tx: never) => Promise<unknown>) => fn(TX as never));
  const servicio = new IncentivoMensajeroService(
    cierres as never,
    libro as never,
    caja,
    runTransaction as never,
    () => ID_INCENTIVO,
  );
  return { servicio, cierres, libro, caja, runTransaction, orden, TX };
}

type PuertoDeCaja = (tx: unknown, m: MovimientoDeCajaDeIncentivo) => Promise<number>;

const INCENTIVO: IncentivoRow = { id: "inc-1", mensajeroId: MENSAJERO, monto: "2500.00", cierreId: "c-nuevo", anulado: false };

describe("SLT-68 R1 — sin acceso total, `forbidden` antes de leer ni escribir", () => {
  it("registrar: los cinco roles sin acceso total no llaman a ningun repositorio ni abren transaccion", async () => {
    for (const actor of SIN_ACCESO_TOTAL) {
      const m = montaje();
      expect(await m.servicio.registrar(REGISTRO, actor), actor.rol).toEqual({ status: "forbidden" });
      expect(m.orden, actor.rol).toEqual([]);
      expect(m.libro.obtenerNombreMensajero).not.toHaveBeenCalled();
      expect(m.runTransaction).not.toHaveBeenCalled();
    }
  });

  it("anular: los cinco roles sin acceso total no leen el incentivo ni abren transaccion", async () => {
    for (const actor of SIN_ACCESO_TOTAL) {
      const m = montaje({ incentivo: INCENTIVO });
      expect(await m.servicio.anular({ incentivoId: "inc-1", motivo: "error" }, actor), actor.rol).toEqual({ status: "forbidden" });
      expect(m.libro.obtenerIncentivo).not.toHaveBeenCalled();
      expect(m.runTransaction).not.toHaveBeenCalled();
    }
  });

  it("maestro y admin si registran", async () => {
    for (const actor of [MAESTRO, ADMIN]) {
      expect((await montaje().servicio.registrar(REGISTRO, actor)).status, actor.rol).toBe("ok");
    }
  });
});

describe("SLT-68 R4/R5/R6 — registrar: que lee, que escribe y en que orden", () => {
  it("R4: mensajero inexistente (en la empresa) → `no_encontrado` sin buscar cierres ni abrir transaccion", async () => {
    const m = montaje({ nombre: null });
    expect(await m.servicio.registrar(REGISTRO, MAESTRO)).toEqual({ status: "no_encontrado" });
    expect(m.cierres.listarCierresImputables).not.toHaveBeenCalled();
    expect(m.runTransaction).not.toHaveBeenCalled();
  });

  it("R5: sin cierre aprobado → `sin_cierre_aprobado` sin abrir transaccion", async () => {
    const m = montaje({ cierres: [] });
    expect(await m.servicio.registrar(REGISTRO, MAESTRO)).toEqual({ status: "sin_cierre_aprobado" });
    expect(m.runTransaction).not.toHaveBeenCalled();
  });

  it("R6/Q1: candado y relectura del cierre MAS RECIENTE, caja primero, devengo `incentivo` despues, con el mismo id, monto y descripcion", async () => {
    const m = montaje();
    const r = await m.servicio.registrar(REGISTRO, MAESTRO);
    expect(r).toEqual({
      status: "ok",
      incentivo: { id: ID_INCENTIVO, monto: "2500.00", cierreId: "c-nuevo", mensajeroNombre: "Juan Pérez" },
      cuentaPorPagar: "2500.00",
    });
    expect(m.orden).toEqual(["listarCierres", "bloquear", "releer", "caja:egreso", "libro:incentivo"]);
    expect(m.cierres.bloquearBeneficiario).toHaveBeenCalledWith(m.TX, { tipo: "cierre", cierreId: "c-nuevo" });
    expect(m.caja.emitirEgreso).toHaveBeenCalledWith(m.TX, {
      incentivoId: ID_INCENTIVO,
      monto: "2500.00",
      descripcion: "Incentivo · Cubrió dos rutas extra",
      registradoPor: "u-maestro",
      fechaMovimiento: undefined,
      claveIdempotencia: REGISTRO.claveIdempotencia,
    });
    expect(m.libro.crearMovimientos).toHaveBeenCalledWith(m.TX, [
      {
        id: ID_INCENTIVO,
        mensajeroId: MENSAJERO,
        tipo: "devengo",
        categoria: "incentivo",
        monto: "2500.00",
        origenTipo: "cierre_dia",
        origenId: "c-nuevo",
        descripcion: "Incentivo · Cubrió dos rutas extra",
        registradoPor: "u-maestro",
      },
    ]);
  });

  it("R6: con una fecha anterior, las dos filas van fechadas al inicio de ese dia en CR (06:00Z)", async () => {
    const m = montaje();
    await m.servicio.registrar({ ...REGISTRO, fecha: "2026-10-01" }, MAESTRO);
    const instante = new Date("2026-10-01T06:00:00.000Z");
    expect(m.caja.emitirEgreso.mock.calls[0]?.[1].fechaMovimiento).toEqual(instante);
    expect(m.libro.crearMovimientos.mock.calls[0]?.[1][0]?.fechaMovimiento).toEqual(instante);
  });

  it("R10: si la caja no escribe (clave repetida) → `ya_registrado` y el libro NO se toca", async () => {
    const m = montaje({ enCaja: 0 });
    expect(await m.servicio.registrar(REGISTRO, MAESTRO)).toEqual({ status: "ya_registrado" });
    expect(m.libro.crearMovimientos).not.toHaveBeenCalled();
  });

  it("el cierre dejo de estar aprobado bajo el candado → `sin_cierre_aprobado` sin escribir", async () => {
    const m = montaje();
    m.cierres.obtenerCierreParaPago.mockResolvedValueOnce({
      id: "c-nuevo", mensajeroId: MENSAJERO, estado: "rechazado" as never, totalPagoMensajero: "0.00", totalEfectivo: "0.00",
    });
    expect(await m.servicio.registrar(REGISTRO, MAESTRO)).toEqual({ status: "sin_cierre_aprobado" });
    expect(m.caja.emitirEgreso).not.toHaveBeenCalled();
  });
});

describe("SLT-68 R11 — una escritura que falla revierte la transaccion y nunca devuelve `ok`", () => {
  it("registrar: la caja escribio y el devengo no → la transaccion LANZA", async () => {
    const m = montaje({ enLibro: 0 });
    await expect(m.servicio.registrar(REGISTRO, MAESTRO)).rejects.toThrow(/su devengo no/);
    expect(m.libro.agregarCuentaPorPagar).not.toHaveBeenCalled();
  });

  it("anular: el contraasiento del libro se escribio y el de la caja no → la transaccion LANZA", async () => {
    const m = montaje({ incentivo: INCENTIVO, reversoCaja: 0 });
    await expect(m.servicio.anular({ incentivoId: "inc-1", motivo: "error" }, MAESTRO)).rejects.toThrow(/el de su caja no/);
  });
});

describe("SLT-68 R13/R15 — anular", () => {
  it("R13: candado del cierre del incentivo, `reverso_incentivo` por el MISMO monto colgado del incentivo, y reverso de caja", async () => {
    const m = montaje({ incentivo: INCENTIVO });
    expect(await m.servicio.anular({ incentivoId: "inc-1", motivo: "Monto equivocado" }, ADMIN)).toEqual({ status: "ok" });
    expect(m.orden).toEqual(["bloquear", "libro:reverso_incentivo", "caja:reverso"]);
    expect(m.cierres.bloquearBeneficiario).toHaveBeenCalledWith(m.TX, { tipo: "cierre", cierreId: "c-nuevo" });
    expect(m.libro.crearMovimientos).toHaveBeenCalledWith(m.TX, [
      {
        mensajeroId: MENSAJERO,
        tipo: "pago",
        categoria: "reverso_incentivo",
        monto: "2500.00",
        origenTipo: "incentivo_mensajero",
        origenId: "inc-1",
        descripcion: "Anulación del incentivo · Monto equivocado",
        registradoPor: "u-admin",
      },
    ]);
    expect(m.caja.reversarEgreso).toHaveBeenCalledWith(m.TX, {
      incentivoId: "inc-1",
      monto: "2500.00",
      descripcion: "Anulación del incentivo · Monto equivocado",
      registradoPor: "u-admin",
    });
  });

  it("R4: incentivo inexistente (o de otra empresa) → `no_encontrado` sin transaccion", async () => {
    const m = montaje({ incentivo: null });
    expect(await m.servicio.anular({ incentivoId: "x", motivo: "m" }, MAESTRO)).toEqual({ status: "no_encontrado" });
    expect(m.runTransaction).not.toHaveBeenCalled();
  });

  it("R15: ya anulado → `ya_anulado` sin transaccion; y si el unico de origen rechaza el reverso, `ya_anulado` sin tocar la caja", async () => {
    const leido = montaje({ incentivo: { ...INCENTIVO, anulado: true } });
    expect(await leido.servicio.anular({ incentivoId: "inc-1", motivo: "m" }, MAESTRO)).toEqual({ status: "ya_anulado" });
    expect(leido.runTransaction).not.toHaveBeenCalled();
    const carrera = montaje({ incentivo: INCENTIVO, enLibro: 0 });
    expect(await carrera.servicio.anular({ incentivoId: "inc-1", motivo: "m" }, MAESTRO)).toEqual({ status: "ya_anulado" });
    expect(carrera.caja.reversarEgreso).not.toHaveBeenCalled();
  });
});

describe("SLT-68 Q1 — cierreMasReciente", () => {
  it("elige el `solicitadoAt` mas reciente y, a igualdad, el mayor id; sin cierres, null", () => {
    expect(cierreMasReciente([])).toBeNull();
    expect(cierreMasReciente([cierre("b", "2026-10-02T00:00:00.000Z"), cierre("a", "2026-10-05T00:00:00.000Z")])?.id).toBe("a");
    expect(cierreMasReciente([cierre("a", "2026-10-05T00:00:00.000Z"), cierre("b", "2026-10-05T00:00:00.000Z")])?.id).toBe("b");
  });
});
