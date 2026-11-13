import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type {
  ConfirmarPagoRepoResult,
  IPagoPlataformaConfirmacionRepository,
} from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PagoPlataformaConfirmacionService } from "@/lib/services/PagoPlataformaConfirmacionService";
import type { PagosDeEmpresa } from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.5; R17, R19, R20, R24) — el servicio de la confirmación, con un repositorio doble. Las
// reglas del reparto bajo candado (saldo, factura válida, suma) las decide la base: aquí se prueba que el
// servicio autoriza primero, valida la forma, quita los ceros y traduce cada respuesta de la base. El SQL se
// prueba contra Postgres en `tests/integration/db/pago-plataforma-confirmacion.test.ts`.

const ORG = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PAGO = "0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e";
const F1 = "11111111-2222-4333-8444-555555555555";
const F2 = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const AHORA = new Date("2026-11-20T15:00:00.000Z");

const SUPERADMIN: Actor = { usuarioId: "u-sa", rol: RolValue.superadmin, organizacionId: null };
const ROLES_DE_EMPRESA = Object.values(RolValue).filter((r) => r !== RolValue.superadmin);

const DATOS: PagosDeEmpresa = {
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
  facturas: [],
};

function montar(respuesta: ConfirmarPagoRepoResult = { estado: "ok" }) {
  const leer = vi.fn<IPagoPlataformaConfirmacionRepository["leer"]>(async () => DATOS);
  const confirmar = vi.fn<IPagoPlataformaConfirmacionRepository["confirmar"]>(async () => respuesta);
  const service = new PagoPlataformaConfirmacionService({ leer, confirmar }, () => AHORA);
  return { service, leer, confirmar };
}

const entrada = (aplicaciones: { facturaId: string; monto: string }[] = [
  { facturaId: F1, monto: "200000.00" },
  { facturaId: F2, monto: "100000.00" },
]) => ({ organizacionId: ORG, pagoId: PAGO, aplicaciones });

describe("SLT-60 — solo el superadmin, antes de leer o escribir (R24)", () => {
  it("hay roles de empresa que comprobar", () => {
    expect(ROLES_DE_EMPRESA.length).toBeGreaterThan(0);
  });

  it.each(ROLES_DE_EMPRESA)("R24: el rol %s recibe forbidden al ver los pagos, sin tocar el repositorio", async (rol) => {
    const { service, leer } = montar();
    expect(await service.verDeEmpresa({ usuarioId: "u-1", rol, organizacionId: ORG }, { organizacionId: ORG })).toEqual({
      estado: "forbidden",
    });
    expect(leer).not.toHaveBeenCalled();
  });

  it.each(ROLES_DE_EMPRESA)("R24: el rol %s recibe forbidden al confirmar, sin tocar el repositorio", async (rol) => {
    const { service, confirmar } = montar();
    expect(await service.confirmar({ usuarioId: "u-1", rol, organizacionId: ORG }, entrada())).toEqual({
      estado: "forbidden",
    });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("R24: sin sesión (actor null), forbidden en las dos, aunque la entrada sea inválida", async () => {
    const { service, leer, confirmar } = montar();
    expect(await service.verDeEmpresa(null, {})).toEqual({ estado: "forbidden" });
    expect(await service.confirmar(null, {})).toEqual({ estado: "forbidden" });
    expect(leer).not.toHaveBeenCalled();
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("R24: un rol de empresa con entrada inválida recibe forbidden, no validation_error", async () => {
    const { service } = montar();
    const maestro: Actor = { usuarioId: "u-1", rol: RolValue.maestro, organizacionId: ORG };
    expect(await service.confirmar(maestro, { pagoId: "x" })).toEqual({ estado: "forbidden" });
  });
});

describe("SLT-60 — verDeEmpresa (R12, R14)", () => {
  it("el superadmin lee los pagos y las facturas de la empresa pedida", async () => {
    const { service, leer } = montar();
    expect(await service.verDeEmpresa(SUPERADMIN, { organizacionId: ORG })).toEqual({ estado: "ok", datos: DATOS });
    expect(leer).toHaveBeenCalledWith(ORG);
  });

  it("una empresa que no es un uuid es validation_error, sin leer", async () => {
    const { service, leer } = montar();
    const r = await service.verDeEmpresa(SUPERADMIN, { organizacionId: "org-a" });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.errores)).toEqual(["organizacionId"]);
    expect(leer).not.toHaveBeenCalled();
  });
});

describe("SLT-60 — confirmar: la forma del reparto (R17)", () => {
  it("R16: con un reparto válido, pasa la empresa, el pago, el reparto, el superadmin y el reloj, y responde ok", async () => {
    const { service, confirmar } = montar();
    expect(await service.confirmar(SUPERADMIN, entrada())).toEqual({ estado: "ok" });
    expect(confirmar).toHaveBeenCalledWith({
      organizacionId: ORG,
      pagoId: PAGO,
      aplicaciones: [
        { facturaId: F1, monto: "200000.00" },
        { facturaId: F2, monto: "100000.00" },
      ],
      por: "u-sa",
      ahora: AHORA,
    });
  });

  it("R17: los montos 0 no se mandan, y los demás van con dos decimales", async () => {
    const { service, confirmar } = montar();
    await service.confirmar(
      SUPERADMIN,
      entrada([
        { facturaId: F1, monto: "300000" },
        { facturaId: F2, monto: "0.00" },
      ]),
    );
    expect(confirmar.mock.calls[0][0].aplicaciones).toEqual([{ facturaId: F1, monto: "300000.00" }]);
  });

  it("R17: todo en 0 es validation_error en el reparto, sin llamar a la base", async () => {
    const { service, confirmar } = montar();
    expect(
      await service.confirmar(
        SUPERADMIN,
        entrada([
          { facturaId: F1, monto: "0" },
          { facturaId: F2, monto: "0.00" },
        ]),
      ),
    ).toEqual({ estado: "validation_error", errores: { aplicaciones: "El reparto debe sumar exactamente el monto del pago." } });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it("R17: un reparto vacío es validation_error en aplicaciones, sin llamar a la base", async () => {
    const { service, confirmar } = montar();
    const r = await service.confirmar(SUPERADMIN, entrada([]));
    expect(r).toEqual({ estado: "validation_error", errores: { aplicaciones: "El reparto debe sumar exactamente el monto del pago." } });
    expect(confirmar).not.toHaveBeenCalled();
  });

  it.each(["-1.00", "1.001", "1,50", "abc", "", "1234567890123.00"])(
    "R17: el monto «%s» es validation_error bajo su factura, sin llamar a la base",
    async (monto) => {
      const { service, confirmar } = montar();
      const r = await service.confirmar(
        SUPERADMIN,
        entrada([
          { facturaId: F1, monto },
          { facturaId: F2, monto: "100.00" },
        ]),
      );
      expect(r).toEqual({
        estado: "validation_error",
        errores: { [`aplicaciones.${F1}`]: "El monto debe ser un número sin signo, con dos decimales como máximo." },
      });
      expect(confirmar).not.toHaveBeenCalled();
    },
  );

  it("un pago o una factura que no son uuid son validation_error, sin llamar a la base", async () => {
    const { service, confirmar } = montar();
    const r = await service.confirmar(SUPERADMIN, { organizacionId: ORG, pagoId: "p-1", aplicaciones: [{ facturaId: "f-1", monto: "1.00" }] });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.errores).sort()).toEqual(["aplicaciones.f-1", "pagoId"]);
    expect(confirmar).not.toHaveBeenCalled();
  });
});

describe("SLT-60 — confirmar: lo que responde la base (R15, R17, R19, R20)", () => {
  it("R19: ya confirmado → ya_confirmado", async () => {
    const { service } = montar({ estado: "ya_confirmado" });
    expect(await service.confirmar(SUPERADMIN, entrada())).toEqual({ estado: "ya_confirmado" });
  });

  it("R20: pago anulado, inexistente o de otra empresa → not_found", async () => {
    const { service } = montar({ estado: "rechazado", error: { codigo: "pago_no_encontrado" } });
    expect(await service.confirmar(SUPERADMIN, entrada())).toEqual({ estado: "not_found" });
  });

  it.each([
    ["factura_no_valida", "Esta factura no admite el pago: no está cerrada, no es de la empresa o ya no tiene saldo."],
    ["supera_saldo", "El monto supera el saldo de la factura."],
    ["factura_repetida", "La factura aparece dos veces en el reparto."],
    ["monto_no_positivo", "El monto aplicado a una factura debe ser mayor que cero."],
  ] as const)("R15, R17: %s de la base va bajo su factura", async (codigo, texto) => {
    const { service } = montar({ estado: "rechazado", error: { codigo, facturaId: F2 } });
    expect(await service.confirmar(SUPERADMIN, entrada())).toEqual({
      estado: "validation_error",
      errores: { [`aplicaciones.${F2}`]: texto },
    });
  });

  it("R17: suma_distinta de la base va al reparto entero", async () => {
    const { service } = montar({ estado: "rechazado", error: { codigo: "suma_distinta" } });
    expect(await service.confirmar(SUPERADMIN, entrada())).toEqual({
      estado: "validation_error",
      errores: { aplicaciones: "El reparto debe sumar exactamente el monto del pago." },
    });
  });

  it("un error que no es de la confirmación se propaga", async () => {
    const { service, confirmar } = montar();
    confirmar.mockRejectedValueOnce(new Error("conexión perdida"));
    await expect(service.confirmar(SUPERADMIN, entrada())).rejects.toThrow("conexión perdida");
  });
});
