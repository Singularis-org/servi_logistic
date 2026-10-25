import { describe, it, expect, vi, beforeEach } from "vitest";
import { Prisma, RolValue } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IWalletEgresoService } from "@/lib/interfaces/services/IWalletEgresoService";

// SL-45 (design §6, §12.3) — EL COMPOSITION ROOT DEL EGRESO PASA EL TOPE (memoria «el composition
// root que no inyecta»). Que `lib/actions/wallet-egresos.ts` importe `TopePagoPlataformaService` no
// prueba que lo PASE: aquí se llama a la action SIN servicio inyectado, sobre un cliente falso, y se
// exige que un pago a la plataforma tome el candado, lea la deuda dentro de la transacción y se
// rechace si no cabe. Sin el tope cableado, el servicio lanza y este archivo se pone en rojo.
//
// Además, el borde: «a quién» es opcional SOLO en el pago a la plataforma (R6), y la referencia vacía
// sigue siendo `validation_error` (R12).

const MENSAJE_R9 = "El pago no puede ser mayor que lo que la empresa debe a la plataforma.";

const orden: string[] = [];
const executeRaw = vi.fn<(sql: TemplateStringsArray, ...valores: unknown[]) => Promise<number>>(async () => {
  orden.push("candado");
  return 1;
});
let cargos: unknown[] = [];
const groupBy = vi.fn(async () => {
  orden.push("sumas");
  return cargos;
});
const findFirst = vi.fn(async () => {
  orden.push("clave");
  return null;
});
const findMany = vi.fn(async () => {
  orden.push("pagos");
  return [];
});
const createMany = vi.fn(async () => {
  orden.push("insert");
  throw new Error("SENTINELA: llegó al INSERT");
});
const tx = {
  $executeRaw: executeRaw,
  cobroPlataformaMovimiento: { groupBy },
  walletMovimiento: { findFirst, findMany, createMany },
};
const $transaction = vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ $transaction, ...tx }),
  PRISMA_OMIT: {},
}));

// El puerto de comprobantes construye clientes de Storage; este archivo no sube nada.
vi.mock("@/lib/actions/_shared/comprobante-lateral", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/actions/_shared/comprobante-lateral")>()),
  buildComprobantes: () => ({}),
}));

const { registrarEgresoAdministrativoAction } = await import("@/lib/actions/wallet-egresos");

const maestroA: Actor = { usuarioId: "u-a", rol: RolValue.maestro, organizacionId: "org-a" };
const deps = { getActor: async () => maestroA };
const pago = (monto: string) => ({
  claveIdempotencia: "4b7c3a51-6a7e-4c2f-9d1e-3f0a2b1c9d8e",
  tipoEgreso: "pago_plataforma",
  monto,
  descripcion: "Transferencia de octubre",
});

beforeEach(() => {
  orden.length = 0;
  cargos = [];
  for (const f of [executeRaw, groupBy, findFirst, findMany, createMany, $transaction]) f.mockClear();
});

describe("SL-45 — registrarEgresoAdministrativoAction cablea el tope real (R9, R10, R20)", () => {
  it("sin deuda, un pago se rechaza en monto con el mensaje de R9, tras tomar el candado y sin llegar al INSERT", async () => {
    expect(await registrarEgresoAdministrativoAction(pago("100.00"), deps)).toEqual({
      status: "validation_error",
      fieldErrors: { monto: [MENSAJE_R9] },
    });
    expect($transaction).toHaveBeenCalledTimes(1);
    expect(orden).toEqual(["candado", "clave", "sumas", "pagos"]);
    expect(createMany).not.toHaveBeenCalled();
    // El candado es el de los pagos de la empresa de la transacción (design §6).
    const sql = executeRaw.mock.calls[0][0].join("?");
    expect(sql).toContain("pg_advisory_xact_lock");
    expect(sql).toContain("'pago_plataforma:'");
    expect(sql).toContain("current_setting('app.organizacion_id')");
  });

  it("la deuda se lee con la empresa del actor: cargos, clave y pagos filtrados por org-a", async () => {
    await registrarEgresoAdministrativoAction(pago("100.00"), deps);
    expect(groupBy).toHaveBeenCalledWith({ by: ["tipo"], where: { organizacionId: "org-a" }, _sum: { monto: true } });
    expect(findFirst).toHaveBeenCalledWith({
      where: { organizacionId: "org-a", claveIdempotencia: "4b7c3a51-6a7e-4c2f-9d1e-3f0a2b1c9d8e" },
      select: { id: true },
    });
    expect(findMany).toHaveBeenCalledWith({
      where: { organizacionId: "org-a", tipo: "egreso", categoria: "egreso_pago_plataforma" },
      select: { id: true, monto: true },
    });
  });

  it("con 500,00 de deuda, pagar 500,00 cabe y sigue hasta el INSERT, en la misma transacción", async () => {
    cargos = [{ tipo: "cargo", _sum: { monto: new Prisma.Decimal("500.00") } }];
    await expect(registrarEgresoAdministrativoAction(pago("500.00"), deps)).rejects.toThrow();
    expect(orden).toEqual(["candado", "clave", "sumas", "pagos", "insert"]);
    expect($transaction).toHaveBeenCalledTimes(1);
  });

  it("R12: un monto que no cabe en DECIMAL(12,2) lo para el tope, en monto, antes de que la base lo vea", async () => {
    // `montoPositivoSchema` (compartido por toda la caja) no acota las cifras enteras; en el pago a la
    // plataforma el tope corre antes del INSERT, y ninguna deuda real llega a 10^11.
    cargos = [{ tipo: "cargo", _sum: { monto: new Prisma.Decimal("500.00") } }];
    expect(await registrarEgresoAdministrativoAction(pago("100000000000.00"), deps)).toEqual({
      status: "validation_error",
      fieldErrors: { monto: [MENSAJE_R9] },
    });
    expect(createMany).not.toHaveBeenCalled();
  });

  it("con 500,00 de deuda, pagar 500,01 se rechaza sin llegar al INSERT", async () => {
    cargos = [{ tipo: "cargo", _sum: { monto: new Prisma.Decimal("500.00") } }];
    expect(await registrarEgresoAdministrativoAction(pago("500.01"), deps)).toEqual({
      status: "validation_error",
      fieldErrors: { monto: [MENSAJE_R9] },
    });
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe("SL-45 — el borde del pago a la plataforma (R6, R12)", () => {
  function servicioQueResponde(): IWalletEgresoService {
    return {
      registrarEgreso: vi.fn(async () => ({ status: "forbidden" as const })),
      reversarEgreso: vi.fn(),
      verDesgloseEgresos: vi.fn(),
    };
  }

  it("R6: el pago sin «a quién» pasa el borde y llega al servicio", async () => {
    const service = servicioQueResponde();
    await registrarEgresoAdministrativoAction(pago("100.00"), { ...deps, service });
    expect(service.registrarEgreso).toHaveBeenCalledTimes(1);
  });

  it("el sueldo sin «a quién» sigue rechazándose en el borde (458-C, D5)", async () => {
    const service = servicioQueResponde();
    const r = await registrarEgresoAdministrativoAction(
      { ...pago("100.00"), tipoEgreso: "sueldo" },
      { ...deps, service },
    );
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["contraparteNombre"]);
    expect(service.registrarEgreso).not.toHaveBeenCalled();
  });

  it("R12: la referencia vacía es validation_error en descripcion, sin tocar el servicio", async () => {
    const service = servicioQueResponde();
    const r = await registrarEgresoAdministrativoAction({ ...pago("100.00"), descripcion: "   " }, { ...deps, service });
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["descripcion"]);
    expect(service.registrarEgreso).not.toHaveBeenCalled();
  });

  it.each(["0", "-1.00", "1.001", ""])("R12: el monto «%s» es validation_error en monto, sin tocar el servicio", async (monto) => {
    const service = servicioQueResponde();
    const r = await registrarEgresoAdministrativoAction(pago(monto), { ...deps, service });
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toContain("monto");
    expect(service.registrarEgreso).not.toHaveBeenCalled();
  });
});
