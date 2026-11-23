import { describe, it, expect, vi } from "vitest";
import { RolValue } from "@prisma/client";

import type {
  ConfirmarPagoRepoResult,
  IPagoPlataformaConfirmacionRepository,
} from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import { contextoActual } from "@/lib/db/contexto-empresa";
import type { ObjetoComprobante } from "@/lib/interfaces/repositories/IWalletComprobanteRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IWalletComprobanteService } from "@/lib/interfaces/services/IWalletComprobanteService";
import { PagoPlataformaConfirmacionService } from "@/lib/services/PagoPlataformaConfirmacionService";
import { MENSAJE_TOPE_PAGO_PLATAFORMA } from "@/lib/types/cobro-plataforma";
import { TEXTOS_CONFIRMACION, type PagosDeEmpresa } from "@/lib/types/pago-plataforma";

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
  confirmados: [],
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
    {
      leer,
      confirmar,
      pagoDeLaEmpresa,
      registrarPorFuera: async () => {
        throw new Error("registrarPorFuera no se llama en SLT-60");
      },
      anularConfirmado: async () => {
        throw new Error("anularConfirmado no se llama en SLT-60");
      },
    },
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

/* -------------------------------------------------------------------------- */
/* SLT-143 — registrar un pago hecho por fuera y anular un pago confirmado     */
/* -------------------------------------------------------------------------- */

// SLT-143 (design §4.3; R5–R7, R9, R23–R25, R31) — el mismo orden que la confirmación: quién, qué y la base. Los
// dobles del comprobante y de la zona leen la empresa del contexto en el momento de la llamada, para afirmar que
// el archivo se sube y se retira dentro de `conEmpresa` de la empresa pedida (SL-19).

const CLAVE = "9e8d7c6b-5a49-4382-9716-05f4e3d2c1b0";
const ZONA = "America/Costa_Rica";
const COMPROBANTE = { contentType: "image/png", bytes: new Uint8Array([1, 2, 3]) };
const GUARDADO = { storagePath: "org/caja/9e8d.png", contentType: "image/png" };

type RespuestaRegistro = Awaited<ReturnType<IPagoPlataformaConfirmacionRepository["registrarPorFuera"]>>;
type RespuestaAnulacion = Awaited<ReturnType<IPagoPlataformaConfirmacionRepository["anularConfirmado"]>>;

interface OpcionesPorFuera {
  registro?: RespuestaRegistro;
  anulacion?: RespuestaAnulacion;
  subida?: "ok" | "invalido" | "no_guardado";
}

function montarPorFuera(op: OpcionesPorFuera = {}) {
  const contextos: Record<string, (string | null)[]> = { zona: [], subir: [], registrar: [], retirar: [] };
  const registrarPorFuera = vi.fn<IPagoPlataformaConfirmacionRepository["registrarPorFuera"]>(async () => {
    contextos.registrar.push(empresaDelContexto());
    return op.registro ?? { estado: "ok" };
  });
  const anularConfirmado = vi.fn<IPagoPlataformaConfirmacionRepository["anularConfirmado"]>(
    async () => op.anulacion ?? { estado: "ok" },
  );
  const leer = vi.fn<IPagoPlataformaConfirmacionRepository["leer"]>(async () => DATOS);
  const confirmar = vi.fn<IPagoPlataformaConfirmacionRepository["confirmar"]>(async () => ({ estado: "ok" }));
  const pagoDeLaEmpresa = vi.fn<IPagoPlataformaConfirmacionRepository["pagoDeLaEmpresa"]>(async () => null);
  const zonaHoraria = vi.fn(async () => {
    contextos.zona.push(empresaDelContexto());
    return ZONA;
  });
  const subir = vi.fn(async () => {
    contextos.subir.push(empresaDelContexto());
    if (op.subida === "invalido") return { status: "invalido" as const, problema: "Tipo de archivo no admitido." };
    if (op.subida === "no_guardado") return { status: "no_guardado" as const };
    return { status: "ok" as const, guardado: GUARDADO };
  });
  const retirar = vi.fn(async () => {
    contextos.retirar.push(empresaDelContexto());
  });
  const puerto = {
    subir,
    retirar,
    registrarEnTx: vi.fn(),
    adjuntar: vi.fn(),
    ver: vi.fn(),
  } as unknown as IWalletComprobanteService;
  const service = new PagoPlataformaConfirmacionService(
    { leer, confirmar, pagoDeLaEmpresa, registrarPorFuera, anularConfirmado },
    { lateralDe: vi.fn() },
    { createSignedUrl: vi.fn() },
    TTL,
    () => AHORA,
    puerto,
    { zonaHoraria },
  );
  return { service, registrarPorFuera, anularConfirmado, zonaHoraria, subir, retirar, contextos };
}

const registro = (extra: Record<string, unknown> = {}) => ({
  organizacionId: ORG,
  claveIdempotencia: CLAVE,
  monto: "300000",
  referencia: "  Transferencia del día  ",
  aplicaciones: [
    { facturaId: F1, monto: "200000" },
    { facturaId: F2, monto: "100000.00" },
  ],
  ...extra,
});

/** Ningún efecto: ni la base, ni el archivo, ni la zona. */
function sinEfectos(m: ReturnType<typeof montarPorFuera>) {
  expect(m.registrarPorFuera).not.toHaveBeenCalled();
  expect(m.anularConfirmado).not.toHaveBeenCalled();
  expect(m.subir).not.toHaveBeenCalled();
  expect(m.zonaHoraria).not.toHaveBeenCalled();
}

describe("SLT-143 — solo el superadmin registra por fuera y anula (R31)", () => {
  it.each(ROLES_DE_EMPRESA)("R31: el rol %s recibe forbidden al registrar y al anular, sin leer ni escribir", async (rol) => {
    const m = montarPorFuera();
    const actor: Actor = { usuarioId: "u-x", rol, organizacionId: ORG };
    expect(await m.service.registrarPorFuera(actor, registro(), COMPROBANTE)).toEqual({ estado: "forbidden" });
    expect(await m.service.anularConfirmado(actor, { organizacionId: ORG, pagoId: PAGO, motivo: "x" })).toEqual({
      estado: "forbidden",
    });
    sinEfectos(m);
  });

  it("R31: sin sesión, forbidden aunque la entrada sea inválida", async () => {
    const m = montarPorFuera();
    expect(await m.service.registrarPorFuera(null, {}, null)).toEqual({ estado: "forbidden" });
    expect(await m.service.anularConfirmado(null, {})).toEqual({ estado: "forbidden" });
    sinEfectos(m);
  });
});

describe("SLT-143 — registrarPorFuera: la forma (R5, R7)", () => {
  it("R1: con datos válidos, sin fecha ni comprobante, manda el pago normalizado con el superadmin y el reloj", async () => {
    const m = montarPorFuera();
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), null)).toEqual({ estado: "ok" });
    expect(m.registrarPorFuera).toHaveBeenCalledTimes(1);
    const enviado = m.registrarPorFuera.mock.calls[0][0];
    expect(enviado).toEqual({
      organizacionId: ORG,
      pagoId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      monto: "300000",
      fecha: null,
      referencia: "Transferencia del día",
      claveIdempotencia: CLAVE,
      aplicaciones: [
        { facturaId: F1, monto: "200000.00" },
        { facturaId: F2, monto: "100000.00" },
      ],
      por: "u-sa",
      ahora: AHORA,
      comprobante: null,
    });
    // Sin fecha no se lee la zona; sin comprobante no se toca el almacenamiento.
    expect(m.zonaHoraria).not.toHaveBeenCalled();
    expect(m.subir).not.toHaveBeenCalled();
    // La base corre dentro de la empresa pedida.
    expect(m.contextos.registrar).toEqual([ORG]);
  });

  it.each([
    ["monto vacío", { monto: "" }, "monto"],
    ["monto 0", { monto: "0" }, "monto"],
    ["monto 0.00", { monto: "0.00" }, "monto"],
    ["monto negativo", { monto: "-5" }, "monto"],
    ["monto con tres decimales", { monto: "1.001" }, "monto"],
    ["monto con coma", { monto: "1,50" }, "monto"],
    ["monto que no cabe en el libro", { monto: "10000000000.00" }, "monto"],
    ["referencia vacía", { referencia: "" }, "referencia"],
    ["referencia de espacios", { referencia: "   " }, "referencia"],
    ["clave que no es uuid", { claveIdempotencia: "x" }, "claveIdempotencia"],
    ["empresa que no es uuid", { organizacionId: "x" }, "organizacionId"],
    ["reparto vacío", { aplicaciones: [] }, "aplicaciones"],
  ])("R7: %s es validation_error en %s, sin leer ni escribir", async (_caso, extra, clave) => {
    const m = montarPorFuera();
    const r = await m.service.registrarPorFuera(SUPERADMIN, registro(extra), COMPROBANTE);
    expect(r.estado).toBe("validation_error");
    if (r.estado === "validation_error") expect(Object.keys(r.errores)).toContain(clave);
    sinEfectos(m);
  });

  it("R7: el mayor monto que cabe en el libro pasa la validación", async () => {
    const m = montarPorFuera();
    await m.service.registrarPorFuera(
      SUPERADMIN,
      registro({ monto: "9999999999.99", aplicaciones: [{ facturaId: F1, monto: "9999999999.99" }] }),
      null,
    );
    expect(m.registrarPorFuera).toHaveBeenCalledTimes(1);
  });

  it("R5: el monto mal formado de una factura va bajo su fila, sin escribir", async () => {
    const m = montarPorFuera();
    const r = await m.service.registrarPorFuera(SUPERADMIN, registro({ aplicaciones: [{ facturaId: F1, monto: "1.001" }] }), null);
    expect(r).toEqual({ estado: "validation_error", errores: { [`aplicaciones.${F1}`]: TEXTOS_CONFIRMACION.formato } });
    sinEfectos(m);
  });

  it("R5: los montos 0 se quitan; todo en 0 es validation_error en el reparto, sin escribir", async () => {
    const m = montarPorFuera();
    await m.service.registrarPorFuera(
      SUPERADMIN,
      registro({ aplicaciones: [{ facturaId: F1, monto: "0" }, { facturaId: F2, monto: "300000" }] }),
      null,
    );
    expect(m.registrarPorFuera.mock.calls[0][0].aplicaciones).toEqual([{ facturaId: F2, monto: "300000.00" }]);

    const vacio = montarPorFuera();
    expect(
      await vacio.service.registrarPorFuera(SUPERADMIN, registro({ aplicaciones: [{ facturaId: F1, monto: "0.00" }] }), null),
    ).toEqual({ estado: "validation_error", errores: { aplicaciones: TEXTOS_CONFIRMACION.suma_distinta } });
    sinEfectos(vacio);
  });
});

describe("SLT-143 — registrarPorFuera: la fecha en la zona del país de la empresa (R7)", () => {
  // 2026-11-20T15:00Z es el 20 de noviembre a las 09:00 en Costa Rica.
  it("una fecha anterior empieza a las 00:00 del país de la empresa, leída dentro de conEmpresa", async () => {
    const m = montarPorFuera();
    vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
    try {
      expect(await m.service.registrarPorFuera(SUPERADMIN, registro({ fecha: "2026-11-18" }), null)).toEqual({ estado: "ok" });
    } finally {
      vi.useRealTimers();
    }
    expect(m.registrarPorFuera.mock.calls[0][0].fecha).toEqual(new Date("2026-11-18T06:00:00.000Z"));
    expect(m.contextos.zona).toEqual([ORG]);
  });

  it("la fecha de hoy en el país va como «ahora» (null), como el egreso manual", async () => {
    const m = montarPorFuera();
    vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
    try {
      await m.service.registrarPorFuera(SUPERADMIN, registro({ fecha: "2026-11-20" }), null);
    } finally {
      vi.useRealTimers();
    }
    expect(m.registrarPorFuera.mock.calls[0][0].fecha).toBeNull();
  });

  it.each([
    ["del futuro", "2026-11-21"],
    ["que no existe", "2026-02-31"],
    ["con otro formato", "20-11-2026"],
    ["fuera de la ventana", "2020-01-01"],
  ])("R7: una fecha %s es validation_error en fecha, sin subir ni escribir", async (_caso, fecha) => {
    const m = montarPorFuera();
    vi.useFakeTimers({ now: AHORA, toFake: ["Date"] });
    let r;
    try {
      r = await m.service.registrarPorFuera(SUPERADMIN, registro({ fecha }), COMPROBANTE);
    } finally {
      vi.useRealTimers();
    }
    expect(r?.estado).toBe("validation_error");
    if (r?.estado === "validation_error") expect(Object.keys(r.errores)).toEqual(["fecha"]);
    expect(m.subir).not.toHaveBeenCalled();
    expect(m.registrarPorFuera).not.toHaveBeenCalled();
  });
});

describe("SLT-143 — registrarPorFuera: el comprobante (R8, R9)", () => {
  it("R8: se sube y se guarda con el pago, dentro de conEmpresa de la empresa pedida; no se retira", async () => {
    const m = montarPorFuera();
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), COMPROBANTE)).toEqual({ estado: "ok" });
    expect(m.subir).toHaveBeenCalledWith("wallet_movimiento", COMPROBANTE);
    expect(m.registrarPorFuera.mock.calls[0][0].comprobante).toEqual(GUARDADO);
    expect(m.contextos.subir).toEqual([ORG]);
    expect(m.retirar).not.toHaveBeenCalled();
    expect(empresaDelContexto()).toBeNull();
  });

  it.each<[string, RespuestaRegistro]>([
    ["el reparto falla", { estado: "rechazado", error: { codigo: "suma_distinta" } }],
    ["el tope se supera", { estado: "tope_superado" }],
    ["la clave ya estaba", { estado: "ya_registrado" }],
  ])("R9: si %s, el archivo subido se retira, dentro de la misma empresa", async (_caso, respuesta) => {
    const m = montarPorFuera({ registro: respuesta });
    await m.service.registrarPorFuera(SUPERADMIN, registro(), COMPROBANTE);
    expect(m.retirar).toHaveBeenCalledWith(GUARDADO);
    expect(m.contextos.retirar).toEqual([ORG]);
  });

  it("R9: si la base lanza, el archivo se retira y el error se propaga", async () => {
    const m = montarPorFuera();
    const boom = new Error("conexión perdida");
    m.registrarPorFuera.mockRejectedValueOnce(boom);
    await expect(m.service.registrarPorFuera(SUPERADMIN, registro(), COMPROBANTE)).rejects.toBe(boom);
    expect(m.retirar).toHaveBeenCalledWith(GUARDADO);
  });

  it("R8: un archivo que el puerto no admite es validation_error en comprobante, sin escribir", async () => {
    const m = montarPorFuera({ subida: "invalido" });
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), COMPROBANTE)).toEqual({
      estado: "validation_error",
      errores: { comprobante: "Tipo de archivo no admitido." },
    });
    expect(m.registrarPorFuera).not.toHaveBeenCalled();
  });

  it("R9: si el almacenamiento falla, comprobante_no_guardado, sin escribir", async () => {
    const m = montarPorFuera({ subida: "no_guardado" });
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), COMPROBANTE)).toEqual({ estado: "comprobante_no_guardado" });
    expect(m.registrarPorFuera).not.toHaveBeenCalled();
  });
});

describe("SLT-143 — registrarPorFuera: la traducción de la base (R5, R6, R10)", () => {
  it("R10: ya_registrado llega tal cual", async () => {
    const m = montarPorFuera({ registro: { estado: "ya_registrado" } });
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), null)).toEqual({ estado: "ya_registrado" });
  });

  it("R6: el tope es validation_error en monto, con el mensaje de SLT-60", async () => {
    const m = montarPorFuera({ registro: { estado: "tope_superado" } });
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), null)).toEqual({
      estado: "validation_error",
      errores: { monto: MENSAJE_TOPE_PAGO_PLATAFORMA },
    });
  });

  it.each([
    ["supera_saldo", F1, { [`aplicaciones.${F1}`]: TEXTOS_CONFIRMACION.supera_saldo }],
    ["factura_no_valida", F2, { [`aplicaciones.${F2}`]: TEXTOS_CONFIRMACION.factura_no_valida }],
    ["factura_repetida", F1, { [`aplicaciones.${F1}`]: TEXTOS_CONFIRMACION.factura_repetida }],
    ["suma_distinta", undefined, { aplicaciones: TEXTOS_CONFIRMACION.suma_distinta }],
  ] as const)("R5: %s de la base es validation_error bajo su clave", async (codigo, facturaId, errores) => {
    const error = facturaId === undefined ? { codigo } : { codigo, facturaId };
    const m = montarPorFuera({ registro: { estado: "rechazado", error } });
    expect(await m.service.registrarPorFuera(SUPERADMIN, registro(), null)).toEqual({ estado: "validation_error", errores });
  });

  it("un código que no es del reparto no se traduce en silencio", async () => {
    const m = montarPorFuera({ registro: { estado: "rechazado", error: { codigo: "pago_no_confirmado" } } });
    await expect(m.service.registrarPorFuera(SUPERADMIN, registro(), null)).rejects.toThrow(/código inesperado/);
  });
});

describe("SLT-143 — anularConfirmado (R23–R25, R27)", () => {
  const anulacion = (extra: Record<string, unknown> = {}) => ({ organizacionId: ORG, pagoId: PAGO, motivo: "  Pago duplicado ", ...extra });

  it("R21: pasa la empresa, el pago, el motivo recortado, el superadmin y el reloj, y responde ok", async () => {
    const m = montarPorFuera();
    expect(await m.service.anularConfirmado(SUPERADMIN, anulacion())).toEqual({ estado: "ok" });
    expect(m.anularConfirmado).toHaveBeenCalledWith({
      organizacionId: ORG,
      pagoId: PAGO,
      motivo: "Pago duplicado",
      por: "u-sa",
      ahora: AHORA,
    });
  });

  it.each([
    ["vacío", ""],
    ["de espacios", "   "],
  ])("R23: un motivo %s es validation_error en motivo, sin llamar a la base", async (_caso, motivo) => {
    const m = montarPorFuera();
    expect(await m.service.anularConfirmado(SUPERADMIN, anulacion({ motivo }))).toEqual({
      estado: "validation_error",
      errores: { motivo: TEXTOS_CONFIRMACION.motivo_vacio },
    });
    expect(m.anularConfirmado).not.toHaveBeenCalled();
  });

  it("un pago o una empresa que no son uuid son validation_error, sin llamar a la base", async () => {
    const m = montarPorFuera();
    const r = await m.service.anularConfirmado(SUPERADMIN, anulacion({ pagoId: "x", organizacionId: "y" }));
    expect(r.estado).toBe("validation_error");
    expect(m.anularConfirmado).not.toHaveBeenCalled();
  });

  it.each<[string, RespuestaAnulacion, unknown]>([
    ["R24, R27: ya_anulado llega tal cual", { estado: "ya_anulado" }, { estado: "ya_anulado" }],
    ["R25: pago_no_encontrado es not_found", { estado: "rechazado", error: { codigo: "pago_no_encontrado" } }, { estado: "not_found" }],
    ["R25: pago_no_confirmado es no_confirmado", { estado: "rechazado", error: { codigo: "pago_no_confirmado" } }, { estado: "no_confirmado" }],
    [
      "R23: motivo_vacio de la base es validation_error en motivo",
      { estado: "rechazado", error: { codigo: "motivo_vacio" } },
      { estado: "validation_error", errores: { motivo: TEXTOS_CONFIRMACION.motivo_vacio } },
    ],
  ])("%s", async (_caso, respuesta, esperado) => {
    const m = montarPorFuera({ anulacion: respuesta });
    expect(await m.service.anularConfirmado(SUPERADMIN, anulacion())).toEqual(esperado);
  });

  it("un código del reparto en la anulación no se traduce en silencio", async () => {
    const m = montarPorFuera({ anulacion: { estado: "rechazado", error: { codigo: "suma_distinta" } } });
    await expect(m.service.anularConfirmado(SUPERADMIN, anulacion())).rejects.toThrow(/código inesperado/);
  });
});
