import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type {
  ConfirmarPagoRepoResult,
  IPagoPlataformaConfirmacionRepository,
} from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { ObjetoComprobante } from "@/lib/interfaces/repositories/IWalletComprobanteRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { PagoPlataformaConfirmacionService } from "@/lib/services/PagoPlataformaConfirmacionService";
import type { PagosDeEmpresa } from "@/lib/types/pago-plataforma";

// SLT-60 (design §4.5; R17, R19, R20, R24) — el servicio de la confirmación, con un repositorio doble. Las
// reglas del reparto bajo candado (saldo, factura válida, suma) las decide la base: aquí se prueba que el
// servicio autoriza primero, valida la forma, quita los ceros y traduce cada respuesta de la base. El SQL se
// prueba contra Postgres en `tests/integration/db/pago-plataforma-confirmacion.test.ts`.
//
// El comprobante (design §4.8; R33, R34): forbidden sin leer; not_found y sin_comprobante sin firmar; ok firma
// con el TTL que recibe el servicio DENTRO de `conEmpresa` de la empresa pedida (los dobles leen el contexto
// en el momento de la llamada), y la respuesta no lleva la ruta del archivo.

const ORG = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const PAGO = "0a1b2c3d-4e5f-4061-8728-394a5b6c7d8e";
const F1 = "11111111-2222-4333-8444-555555555555";
const F2 = "66666666-7777-4888-8999-aaaaaaaaaaaa";
const AHORA = new Date("2026-11-20T15:00:00.000Z");
const TTL = 321;
const RUTA = "comprobantes/caja/0a1b2c3d.png";
const URL_FIRMADA = "https://storage.test/firmada?token=abc";

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

/** La empresa del contexto en el momento de la llamada, o `null` fuera de `conEmpresa`. */
function empresaDelContexto(): string | null {
  const c = contextoActual();
  return c?.tipo === "empresa" ? c.organizacionId : null;
}

interface Comprobante {
  pago?: { id: string } | null;
  objeto?: ObjetoComprobante | null;
}

function montar(respuesta: ConfirmarPagoRepoResult = { estado: "ok" }, comprobante: Comprobante = {}) {
  const contextos: Record<string, string | null> = {};
  const leer = vi.fn<IPagoPlataformaConfirmacionRepository["leer"]>(async () => DATOS);
  const confirmar = vi.fn<IPagoPlataformaConfirmacionRepository["confirmar"]>(async () => respuesta);
  const pagoDeLaEmpresa = vi.fn<IPagoPlataformaConfirmacionRepository["pagoDeLaEmpresa"]>(async () => {
    contextos.pago = empresaDelContexto();
    return comprobante.pago === undefined ? { id: PAGO } : comprobante.pago;
  });
  const lateralDe = vi.fn<(destino: { caja: string }) => Promise<ObjetoComprobante | null>>(async () => {
    contextos.lateral = empresaDelContexto();
    return comprobante.objeto === undefined ? { storagePath: RUTA, contentType: "image/png" } : comprobante.objeto;
  });
  const createSignedUrl = vi.fn<(ruta: string, segundos: number) => Promise<string>>(async () => {
    contextos.firma = empresaDelContexto();
    return URL_FIRMADA;
  });
  const service = new PagoPlataformaConfirmacionService(
    { leer, confirmar, pagoDeLaEmpresa },
    { lateralDe },
    { createSignedUrl },
    TTL,
    () => AHORA,
  );
  return { service, leer, confirmar, pagoDeLaEmpresa, lateralDe, createSignedUrl, contextos };
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

describe("SLT-60 — verComprobante: el comprobante del pago para el superadmin (R33, R34)", () => {
  const pedido = { organizacionId: ORG, pagoId: PAGO };

  it.each(ROLES_DE_EMPRESA)("R34: el rol %s recibe forbidden sin leer el pago ni firmar", async (rol) => {
    const { service, pagoDeLaEmpresa, lateralDe, createSignedUrl } = montar();
    expect(await service.verComprobante({ usuarioId: "u-1", rol, organizacionId: ORG }, pedido)).toEqual({ estado: "forbidden" });
    expect(pagoDeLaEmpresa).not.toHaveBeenCalled();
    expect(lateralDe).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("R34: sin sesión, forbidden aunque la entrada sea inválida, sin leer", async () => {
    const { service, pagoDeLaEmpresa } = montar();
    expect(await service.verComprobante(null, {})).toEqual({ estado: "forbidden" });
    expect(pagoDeLaEmpresa).not.toHaveBeenCalled();
  });

  it("una empresa o un pago que no son uuid son validation_error, sin leer", async () => {
    const { service, pagoDeLaEmpresa } = montar();
    const r = await service.verComprobante(SUPERADMIN, { organizacionId: "org-a", pagoId: "p-1" });
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.errores).sort()).toEqual(["organizacionId", "pagoId"]);
    expect(pagoDeLaEmpresa).not.toHaveBeenCalled();
  });

  it("R34: si el movimiento no es un pago a la plataforma de esa empresa, not_found sin buscar el archivo ni firmar", async () => {
    const { service, pagoDeLaEmpresa, lateralDe, createSignedUrl, contextos } = montar({ estado: "ok" }, { pago: null });
    expect(await service.verComprobante(SUPERADMIN, pedido)).toEqual({ estado: "not_found" });
    expect(pagoDeLaEmpresa).toHaveBeenCalledWith(ORG, PAGO);
    expect(contextos.pago).toBe(ORG);
    expect(lateralDe).not.toHaveBeenCalled();
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("R34: si el pago no tiene comprobante, sin_comprobante sin firmar", async () => {
    const { service, lateralDe, createSignedUrl } = montar({ estado: "ok" }, { objeto: null });
    expect(await service.verComprobante(SUPERADMIN, pedido)).toEqual({ estado: "sin_comprobante" });
    expect(lateralDe).toHaveBeenCalledWith({ caja: PAGO });
    expect(createSignedUrl).not.toHaveBeenCalled();
  });

  it("R33: firma con el TTL de la wallet dentro de conEmpresa de la empresa pedida, y la ruta no sale", async () => {
    const { service, createSignedUrl, contextos } = montar();
    const r = await service.verComprobante(SUPERADMIN, pedido);
    expect(r).toEqual({ estado: "ok", url: URL_FIRMADA, contentType: "image/png" });
    expect(createSignedUrl).toHaveBeenCalledWith(RUTA, TTL);
    // Las tres lecturas corren con la empresa del detalle en el contexto, no con la de la sesión (ninguna).
    expect(contextos).toEqual({ pago: ORG, lateral: ORG, firma: ORG });
    expect(JSON.stringify(r)).not.toContain(RUTA);
    // Fuera del servicio no queda empresa en el contexto.
    expect(empresaDelContexto()).toBeNull();
  });
});
