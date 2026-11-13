import { beforeEach, describe, expect, it, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type { Actor } from "@/lib/interfaces/services/IOrdenService";

// SLT-60 (design §4.6; R16, R20, R24) — EL COMPOSITION ROOT PASA EL REPOSITORIO REAL, no solo lo importa
// (molde `planes.composition-root.test.ts`). Se mockea solo `getPrismaClient`, con un cliente falso que
// responde a `$queryRaw` lo que la base respondería, y se llaman las actions reales sin servicio inyectado.
// Si el root montara el servicio con otro repositorio, o con ninguno, el cliente falso no vería las llamadas
// y el mapeo del DTO no saldría.

const ORG = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PAGO = "0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e";
const F1 = "11111111-2222-4333-8444-555555555555";

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: RolValue.superadmin, organizacionId: null };
const MAESTRO: Actor = { usuarioId: "u-m", rol: RolValue.maestro, organizacionId: ORG };

const queryRaw = vi.fn<(sql: TemplateStringsArray, ...valores: unknown[]) => Promise<unknown[]>>();

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({ $queryRaw: queryRaw }),
  PRISMA_OMIT: {},
}));

const acciones = await import("@/lib/actions/pagos-plataforma");

/** El texto del SQL de la llamada `n` (los trozos de la plantilla, unidos). */
const sqlDe = (n: number) => queryRaw.mock.calls[n][0].join("?");

beforeEach(() => queryRaw.mockReset());

describe("SLT-60 — verPagosDeEmpresaAction usa PagoPlataformaConfirmacionRepository (R12, R14, R32)", () => {
  it("sin deps.service, lee por el repositorio real y mapea su jsonb al DTO", async () => {
    queryRaw.mockResolvedValueOnce([
      {
        pagos: [
          {
            id: PAGO,
            monto: "300000",
            fecha: "2026-11-18T12:00:00",
            referencia: "Transferencia 123",
            registrado_por: "Ana Pérez",
            tiene_comprobante: true,
          },
        ],
        // Según el driver, el jsonb puede llegar como texto.
        facturas: JSON.stringify([
          { id: F1, numero: 1, desde: "2026-11-01T06:00:00", hasta: "2026-11-16T06:00:00", total: "200000.00", saldo: "200000" },
        ]),
      },
    ]);
    const r = await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, { getActor: async () => SUPERADMIN });
    expect(r).toEqual({
      estado: "ok",
      datos: {
        pagos: [
          {
            id: PAGO,
            monto: "300000.00",
            fecha: new Date("2026-11-18T12:00:00Z"),
            referencia: "Transferencia 123",
            registradoPor: "Ana Pérez",
            tieneComprobante: true,
          },
        ],
        facturas: [
          {
            id: F1,
            numero: 1,
            desde: new Date("2026-11-01T06:00:00Z"),
            hasta: new Date("2026-11-16T06:00:00Z"),
            total: "200000.00",
            saldo: "200000.00",
          },
        ],
      },
    });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = sqlDe(0);
    expect(sql).toContain("pago_plataforma_por_confirmar(");
    expect(sql).toContain("factura_plataforma_saldos(");
    // Solo las facturas con saldo (R15, R18, R31).
    expect(sql).toContain('s."saldo" > 0');
    // Todos los valores de texto interpolados son la empresa pedida: nada más llega de fuera. (El otro valor
    // es el fragmento del nombre completo, `Prisma.raw` de un literal del código.)
    const textos = queryRaw.mock.calls[0].slice(1).filter((v) => typeof v === "string");
    expect(textos.length).toBeGreaterThan(0);
    expect(new Set(textos)).toEqual(new Set([ORG]));
  });

  it("si la base devuelve otra forma, lanza (la página lo pinta como «No se pudieron cargar», R13)", async () => {
    queryRaw.mockResolvedValueOnce([{ pagos: [{ id: PAGO }], facturas: [] }]);
    await expect(
      acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, { getActor: async () => SUPERADMIN }),
    ).rejects.toThrow(/forma inesperada/);
  });
});

describe("SLT-60 — confirmarPagoPlataformaAction usa PagoPlataformaConfirmacionRepository (R16, R20)", () => {
  const entrada = { organizacionId: ORG, pagoId: PAGO, aplicaciones: [{ facturaId: F1, monto: "300000.00" }] };

  it("R16: sin deps.service, confirma por la función de la base con el superadmin de la sesión", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ok" }]);
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({ estado: "ok" });
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(sqlDe(0)).toContain("pago_plataforma_confirmar(");
    const [, org, pago, aplicaciones, por] = queryRaw.mock.calls[0];
    expect([org, pago, por]).toEqual([ORG, PAGO, "u-sa"]);
    expect(JSON.parse(aplicaciones as string)).toEqual([{ factura_id: F1, monto: "300000.00" }]);
  });

  it("R19: ya_confirmado de la base llega tal cual", async () => {
    queryRaw.mockResolvedValueOnce([{ resultado: "ya_confirmado" }]);
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "ya_confirmado",
    });
  });

  it("R20: el rechazo SL060 pago_no_encontrado (P2010 del SQL a mano) es not_found", async () => {
    queryRaw.mockRejectedValueOnce(
      Object.assign(new Error('Raw query failed. Code: `SL060`. Message: `{"codigo": "pago_no_encontrado"}`'), { code: "P2010" }),
    );
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "not_found",
    });
  });

  it("R17: el rechazo SL060 supera_saldo (error del driver) es validation_error bajo su factura", async () => {
    queryRaw.mockRejectedValueOnce(
      Object.assign(new Error("driver"), {
        name: "DriverAdapterError",
        cause: { kind: "postgres", code: "SL060", originalCode: "SL060", message: `{"codigo": "supera_saldo", "factura_id": "${F1}"}` },
      }),
    );
    expect(await acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).toEqual({
      estado: "validation_error",
      errores: { [`aplicaciones.${F1}`]: "El monto supera el saldo de la factura." },
    });
  });

  it("otro error de la base no se traga", async () => {
    const otro = Object.assign(new Error("driver"), { cause: { kind: "postgres", code: "40P01", message: "deadlock" } });
    queryRaw.mockRejectedValueOnce(otro);
    await expect(acciones.confirmarPagoPlataformaAction(entrada, { getActor: async () => SUPERADMIN })).rejects.toBe(otro);
  });
});

describe("SLT-60 — solo el superadmin (R24)", () => {
  it("R24: un maestro recibe forbidden en las dos actions sin tocar el cliente", async () => {
    const deps = { getActor: async () => MAESTRO };
    expect(await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, deps)).toEqual({ estado: "forbidden" });
    expect(
      await acciones.confirmarPagoPlataformaAction({ organizacionId: ORG, pagoId: PAGO, aplicaciones: [] }, deps),
    ).toEqual({ estado: "forbidden" });
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("R24: sin sesión, forbidden sin tocar el cliente", async () => {
    const deps = { getActor: async () => null };
    expect(await acciones.verPagosDeEmpresaAction({ organizacionId: ORG }, deps)).toEqual({ estado: "forbidden" });
    expect(await acciones.confirmarPagoPlataformaAction({}, deps)).toEqual({ estado: "forbidden" });
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
