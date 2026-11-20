import { RolValue } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import type { IProveedorCobro, PagoDelProveedor } from "@/lib/interfaces/external/IProveedorCobro";
import type { ICobroIntentoRepository } from "@/lib/interfaces/repositories/ICobroIntentoRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { CobroIntentoService } from "@/lib/services/CobroIntentoService";
import type { CobroIntentoDTO, ProveedorCobroId } from "@/lib/types/cobro";

// SLT-226 (design §4.4, §8) — el servicio del cobro en línea con el repositorio y el proveedor dobles. Lo que la base
// hace de verdad (el candado, la idempotencia del pago, la máquina de estados) lo cubren los tests de integración
// `cobro-intento`, `cobro-webhook-evento` y `cobro-pago-en-linea`.

const ORG = "6f1c2b3a-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const FACTURA = "fa000000-0000-4000-8000-000000000001";
const INTENTO = "c0000000-0000-4000-8000-000000000001";
const AHORA = new Date("2026-11-20T15:00:00.000Z");

const EVENTO = { proveedor: "rebill", logId: "log-1", tipo: "payment.pending", pagoProveedorId: "pay-1" } as const;

const pagoDelProveedor = (estado: PagoDelProveedor["estado"]): PagoDelProveedor => ({
  pagoProveedorId: "pay-1",
  idExterno: "ext-1",
  estado,
  monto: "20000.00",
  moneda: "CRC",
});

const INTENTO_DTO: CobroIntentoDTO = {
  id: INTENTO,
  facturaId: FACTURA,
  proveedor: "rebill",
  estado: "creado",
  montoLocal: "20000.00",
  monedaLocal: "CRC",
  montoCobrado: "20000.00",
  monedaCobro: "CRC",
  tasa: null,
  tasaFuente: null,
  tasaAt: null,
  idExterno: null,
  pagoProveedorId: null,
  createdAt: AHORA,
  estadoAt: AHORA,
  aprobadoAt: null,
};

function montar(opciones: {
  llegada?: "nuevo" | "repetido" | "pendiente";
  consultar?: IProveedorCobro["consultarPago"];
  registrar?: Awaited<ReturnType<ICobroIntentoRepository["registrarPagoAprobado"]>>["resultado"];
  avanzar?: Awaited<ReturnType<ICobroIntentoRepository["avanzar"]>>["resultado"];
} = {}) {
  const repo = {
    obtenerOCrear: vi.fn<ICobroIntentoRepository["obtenerOCrear"]>(async () => ({ estado: "creado", intento: INTENTO_DTO })),
    registrarEnlace: vi.fn<ICobroIntentoRepository["registrarEnlace"]>(async () => "ok"),
    avanzar: vi.fn<ICobroIntentoRepository["avanzar"]>(async () => ({
      resultado: opciones.avanzar ?? "ok",
      intentoId: opciones.avanzar === "sin_intento" ? null : INTENTO,
    })),
    registrarPagoAprobado: vi.fn<ICobroIntentoRepository["registrarPagoAprobado"]>(async () => ({
      resultado: opciones.registrar ?? "ok",
      intentoId: opciones.registrar === "sin_intento" ? null : INTENTO,
    })),
    registrarEvento: vi.fn<ICobroIntentoRepository["registrarEvento"]>(async () => opciones.llegada ?? "nuevo"),
    cerrarEvento: vi.fn<ICobroIntentoRepository["cerrarEvento"]>(async () => "ok"),
    intentosDeFactura: vi.fn<ICobroIntentoRepository["intentosDeFactura"]>(async () => [INTENTO_DTO]),
  } satisfies ICobroIntentoRepository;
  const consultarPago = vi.fn<IProveedorCobro["consultarPago"]>(opciones.consultar ?? (async () => pagoDelProveedor("aprobado")));
  const proveedor: IProveedorCobro = { proveedor: "rebill", consultarPago };
  const service = new CobroIntentoService(repo, new Map<ProveedorCobroId, IProveedorCobro>([["rebill", proveedor]]), () => AHORA, "CRC");
  return { service, repo, consultarPago };
}

describe("SLT-226 — procesarEvento (R13–R16, R20)", () => {
  it("R13: un evento ya procesado se ignora sin consultar al proveedor ni escribir nada", async () => {
    const { service, repo, consultarPago } = montar({ llegada: "repetido" });
    await expect(service.procesarEvento(EVENTO)).resolves.toEqual({ estado: "ignorado" });
    expect(repo.registrarEvento).toHaveBeenCalledWith({ ...EVENTO, ahora: AHORA });
    expect(consultarPago).not.toHaveBeenCalled();
    expect(repo.registrarPagoAprobado).not.toHaveBeenCalled();
    expect(repo.avanzar).not.toHaveBeenCalled();
    expect(repo.cerrarEvento).not.toHaveBeenCalled();
  });

  it("R13: un evento que llegó y no terminó se procesa otra vez y se cierra", async () => {
    const { service, repo, consultarPago } = montar({ llegada: "pendiente" });
    await expect(service.procesarEvento(EVENTO)).resolves.toEqual({ estado: "procesado", resultado: "aplicado" });
    expect(consultarPago).toHaveBeenCalledWith("pay-1");
    expect(repo.cerrarEvento).toHaveBeenCalledWith({
      proveedor: "rebill",
      logId: "log-1",
      resultado: "aplicado",
      intentoId: INTENTO,
      ahora: AHORA,
    });
  });

  it("R14: el evento dice «pendiente» y el proveedor «aprobado»: registra el pago aprobado con los datos del proveedor", async () => {
    const { service, repo } = montar();
    await service.procesarEvento(EVENTO);
    expect(repo.registrarPagoAprobado).toHaveBeenCalledWith({
      proveedor: "rebill",
      pagoProveedorId: "pay-1",
      idExterno: "ext-1",
      monto: "20000.00",
      moneda: "CRC",
      ahora: AHORA,
    });
    expect(repo.avanzar).not.toHaveBeenCalled();
  });

  it("R14: el evento dice «aprobado» y el proveedor «rechazado»: avanza al estado del proveedor, no registra el pago", async () => {
    const { service, repo } = montar({ consultar: async () => pagoDelProveedor("rechazado") });
    await expect(service.procesarEvento({ ...EVENTO, tipo: "payment.approved" })).resolves.toEqual({
      estado: "procesado",
      resultado: "aplicado",
    });
    expect(repo.avanzar).toHaveBeenCalledWith({ proveedor: "rebill", idExterno: "ext-1", destino: "rechazado", ahora: AHORA });
    expect(repo.registrarPagoAprobado).not.toHaveBeenCalled();
  });

  it.each(["sin_cambio", "no_alcanzable"] as const)(
    "R15: con «%s» el evento se cierra como «sin_cambio», con su intento",
    async (avanzar) => {
      const { service, repo } = montar({ consultar: async () => pagoDelProveedor("pendiente"), avanzar });
      await expect(service.procesarEvento(EVENTO)).resolves.toEqual({ estado: "procesado", resultado: "sin_cambio" });
      expect(repo.cerrarEvento).toHaveBeenCalledWith(expect.objectContaining({ resultado: "sin_cambio", intentoId: INTENTO }));
    },
  );

  it("R16: si la consulta al proveedor falla, no cambia el intento, no cierra el evento y propaga con el logId", async () => {
    const { service, repo } = montar({
      consultar: async () => {
        throw new Error("timeout de red");
      },
    });
    const error = await service.procesarEvento(EVENTO).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("log-1");
    expect((error as Error).message).not.toContain("pay-1");
    expect((error as Error).cause).toBeInstanceOf(Error);
    expect(repo.registrarPagoAprobado).not.toHaveBeenCalled();
    expect(repo.avanzar).not.toHaveBeenCalled();
    expect(repo.cerrarEvento).not.toHaveBeenCalled();
  });

  it("R20: un pago ya registrado cierra el evento como «aplicado»", async () => {
    const { service, repo } = montar({ registrar: "ya_registrado" });
    await expect(service.procesarEvento(EVENTO)).resolves.toEqual({ estado: "procesado", resultado: "aplicado" });
    expect(repo.cerrarEvento).toHaveBeenCalledWith(expect.objectContaining({ resultado: "aplicado", intentoId: INTENTO }));
  });

  it("R21: un pago aprobado que no cabe cierra el evento como «requiere_revision»", async () => {
    const { service, repo } = montar({ registrar: "requiere_revision" });
    await expect(service.procesarEvento(EVENTO)).resolves.toEqual({ estado: "procesado", resultado: "requiere_revision" });
    expect(repo.cerrarEvento).toHaveBeenCalledWith(expect.objectContaining({ resultado: "requiere_revision" }));
  });

  it("si el proveedor no conoce el pago (null), cierra el evento como «sin_intento» sin tocar intentos", async () => {
    const { service, repo } = montar({ consultar: async () => null });
    await expect(service.procesarEvento(EVENTO)).resolves.toEqual({ estado: "procesado", resultado: "sin_intento" });
    expect(repo.registrarPagoAprobado).not.toHaveBeenCalled();
    expect(repo.avanzar).not.toHaveBeenCalled();
    expect(repo.cerrarEvento).toHaveBeenCalledWith(expect.objectContaining({ resultado: "sin_intento", intentoId: null }));
  });

  it("R12: un evento sin logId se rechaza antes de escribir", async () => {
    const { service, repo } = montar();
    await expect(service.procesarEvento({ ...EVENTO, logId: "" })).rejects.toThrow(/forma esperada/);
    expect(repo.registrarEvento).not.toHaveBeenCalled();
  });
});

describe("SLT-226 — obtenerOCrearIntento y registrarEnlace (R1, R2, R10)", () => {
  it("R1: pide el intento en la moneda local, con el actor y la hora del reloj, y lo marca nuevo", async () => {
    const { service, repo } = montar();
    await expect(service.obtenerOCrearIntento({ organizacionId: ORG, facturaId: FACTURA, actorUsuarioId: "u-1" })).resolves.toEqual({
      estado: "ok",
      intento: INTENTO_DTO,
      nuevo: true,
    });
    expect(repo.obtenerOCrear).toHaveBeenCalledWith({
      organizacionId: ORG,
      facturaId: FACTURA,
      proveedor: "rebill",
      monedaLocal: "CRC",
      por: "u-1",
      ahora: AHORA,
    });
  });

  it("R2: un intento existente vuelve con nuevo = false", async () => {
    const { service, repo } = montar();
    repo.obtenerOCrear.mockResolvedValueOnce({ estado: "existente", intento: INTENTO_DTO });
    await expect(service.obtenerOCrearIntento({ organizacionId: ORG, facturaId: FACTURA, actorUsuarioId: null })).resolves.toMatchObject({
      estado: "ok",
      nuevo: false,
    });
  });

  it("R5: «sin_saldo» y «factura_no_valida» pasan tal cual", async () => {
    const { service, repo } = montar();
    repo.obtenerOCrear.mockResolvedValueOnce({ estado: "sin_saldo" });
    await expect(service.obtenerOCrearIntento({ organizacionId: ORG, facturaId: FACTURA, actorUsuarioId: null })).resolves.toEqual({ estado: "sin_saldo" });
    repo.obtenerOCrear.mockResolvedValueOnce({ estado: "factura_no_valida" });
    await expect(service.obtenerOCrearIntento({ organizacionId: ORG, facturaId: FACTURA, actorUsuarioId: null })).resolves.toEqual({
      estado: "factura_no_valida",
    });
  });

  it("R10: registrarEnlace pasa la empresa, el intento y el id externo con la hora del reloj", async () => {
    const { service, repo } = montar();
    await expect(service.registrarEnlace({ organizacionId: ORG, intentoId: INTENTO, idExterno: "ext-1" })).resolves.toEqual({ estado: "ok" });
    expect(repo.registrarEnlace).toHaveBeenCalledWith({ organizacionId: ORG, intentoId: INTENTO, idExterno: "ext-1", ahora: AHORA });
  });
});

describe("SLT-226 — intentosDeFactura (R27)", () => {
  const actor = (rol: RolValue, organizacionId: string | null = ORG): Actor => ({ usuarioId: "u-1", rol, organizacionId });

  it.each([RolValue.maestro, RolValue.admin])("R27: %s lee los intentos de su empresa", async (rol) => {
    const { service, repo } = montar();
    await expect(service.intentosDeFactura(actor(rol), FACTURA)).resolves.toEqual({ estado: "ok", intentos: [INTENTO_DTO] });
    expect(repo.intentosDeFactura).toHaveBeenCalledWith({ tipo: "empresa", organizacionId: ORG }, FACTURA);
  });

  it("R27: el superadmin lee los de cualquier empresa, como plataforma", async () => {
    const { service, repo } = montar();
    await expect(service.intentosDeFactura(actor(RolValue.superadmin, null), FACTURA)).resolves.toEqual({
      estado: "ok",
      intentos: [INTENTO_DTO],
    });
    expect(repo.intentosDeFactura).toHaveBeenCalledWith({ tipo: "plataforma" }, FACTURA);
  });

  it.each([RolValue.mensajero, RolValue.adminTienda, RolValue.adminSatelite, RolValue.apiKey])("R27: %s recibe forbidden sin que se lea nada", async (rol) => {
    const { service, repo } = montar();
    await expect(service.intentosDeFactura(actor(rol), FACTURA)).resolves.toEqual({ estado: "forbidden" });
    expect(repo.intentosDeFactura).not.toHaveBeenCalled();
  });

  it("R27: un maestro sin empresa en la sesión recibe forbidden sin que se lea nada", async () => {
    const { service, repo } = montar();
    await expect(service.intentosDeFactura(actor(RolValue.maestro, null), FACTURA)).resolves.toEqual({ estado: "forbidden" });
    expect(repo.intentosDeFactura).not.toHaveBeenCalled();
  });
});
