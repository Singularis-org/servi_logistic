import { describe, it, expect, vi } from "vitest";
import { Prisma } from "@prisma/client";

import { ApiKeyService } from "@/lib/services/ApiKeyService";
import type { IApiKeyRepository } from "@/lib/interfaces/repositories/IApiKeyRepository";
import type { Actor } from "@/lib/interfaces/services/IApiKeyService";
import type { ApiKeyPublico } from "@/lib/types/api-key";
import { activarApiKey, generarApiKey } from "@/lib/actions/api-keys";

// SL-24 (R35, design §6.5) — crear una key o activar una `inactiva` es un alta de API key. Con el
// tope del plan lleno el trigger de `api_key` la rechaza (SQLSTATE SL024) y `ApiKeyService` lo
// devuelve como `tope_plan` con el mensaje. Desactivar no es un alta y nunca se rechaza por tope.
// Repositorio mockeado: el rechazo real con `ApiKeyRepository` lo prueba
// `tests/integration/db/plan-topes-api-keys.test.ts`.

const MAESTRO: Actor = { usuarioId: "u-maestro", rol: "maestro" };
const KEY_ID = "3f0e6a52-7c1e-4b6c-9a52-6f2d8f1b0c11";

const TOPE = 'tope_plan {"tope": "api_keys", "maximo": 2, "usados": 2, "pedidas": 1}';
const MENSAJE =
  "Tu plan permite 2 API keys activas. Ya tienes 2. Desactiva o elimina alguna, o pide un cambio de plan.";

function errorDelTrigger(mensaje = TOPE) {
  return Object.assign(new Error(mensaje), {
    name: "DriverAdapterError",
    cause: { kind: "postgres", code: "SL024", originalCode: "SL024", message: mensaje },
  });
}

/** La forma con que sale de una `$transaction` interactiva que revierte (P2010 con meta). */
function errorDelTriggerP2010(mensaje = TOPE) {
  return new Prisma.PrismaClientKnownRequestError(`Raw query failed. Code: \`SL024\`. Message: \`${mensaje}\``, {
    code: "P2010",
    clientVersion: "7.8.0",
    meta: { driverAdapterError: errorDelTrigger(mensaje) },
  });
}

const KEY: ApiKeyPublico = {
  id: KEY_ID,
  identificador: "Integracion",
  keyPrefix: "svl_ab12cd3",
  estado: "inactiva",
  usuarioId: "u-dedicado",
  tiendaDestinoId: null,
  ownerUsuarioId: "u-dedicado",
  createdAt: new Date("2026-10-01T12:00:00Z"),
};

function servicio(overrides: Partial<IApiKeyRepository>) {
  const repo = {
    createConUsuario: vi.fn().mockResolvedValue({ ...KEY, estado: "activa" }),
    setEstado: vi.fn().mockResolvedValue({ ...KEY, estado: "activa" }),
    findTiendaDestino: vi.fn().mockResolvedValue(null),
    ...overrides,
  } as unknown as IApiKeyRepository;
  return { repo, service: new ApiKeyService(repo) };
}

describe("SL-24 R35 — ApiKeyService.generar (crear) con el tope de API keys lleno", () => {
  it("devuelve `tope_plan` con el mensaje (el `catch` deja pasar el error para traducirlo)", async () => {
    const { service } = servicio({ createConUsuario: vi.fn().mockRejectedValue(errorDelTrigger()) });

    expect(await service.generar({ identificador: "Integracion" }, MAESTRO)).toEqual({
      status: "tope_plan",
      mensaje: MENSAJE,
    });
  });

  it("también cuando llega como P2010 desde la transacción", async () => {
    const { service } = servicio({ createConUsuario: vi.fn().mockRejectedValue(errorDelTriggerP2010()) });

    expect(await service.generar({ identificador: "Integracion" }, MAESTRO)).toEqual({
      status: "tope_plan",
      mensaje: MENSAJE,
    });
  });

  it("un error que no es del tope sigue saliendo tal cual", async () => {
    const otro = new Error("conexion caida");
    const { service } = servicio({ createConUsuario: vi.fn().mockRejectedValue(otro) });

    await expect(service.generar({ identificador: "Integracion" }, MAESTRO)).rejects.toBe(otro);
  });
});

describe("SL-24 R35 — ApiKeyService.activar con el tope de API keys lleno", () => {
  it("devuelve `tope_plan` con el mensaje", async () => {
    const { service } = servicio({ setEstado: vi.fn().mockRejectedValue(errorDelTrigger()) });

    expect(await service.activar({ id: KEY_ID }, MAESTRO)).toEqual({ status: "tope_plan", mensaje: MENSAJE });
  });

  it("un error que no es del tope sigue saliendo tal cual", async () => {
    const otro = new Error("conexion caida");
    const { service } = servicio({ setEstado: vi.fn().mockRejectedValue(otro) });

    await expect(service.activar({ id: KEY_ID }, MAESTRO)).rejects.toBe(otro);
  });

  it("sin tope el camino de siempre no cambia", async () => {
    const { service } = servicio({});
    expect(await service.activar({ id: KEY_ID }, MAESTRO)).toEqual({
      status: "ok",
      apiKey: { ...KEY, estado: "activa" },
    });
  });
});

describe("SL-24 R36 — las actions entregan `tope_plan` a la pantalla sin transformarlo", () => {
  it("generarApiKey devuelve { status: 'tope_plan', mensaje }", async () => {
    const { service } = servicio({ createConUsuario: vi.fn().mockRejectedValue(errorDelTrigger()) });

    const r = await generarApiKey(
      { identificador: "Integracion" },
      { apiKeyService: service, getActor: async () => MAESTRO },
    );

    expect(r).toEqual({ status: "tope_plan", mensaje: MENSAJE });
  });

  it("activarApiKey devuelve { status: 'tope_plan', mensaje }", async () => {
    const { service } = servicio({ setEstado: vi.fn().mockRejectedValue(errorDelTrigger()) });

    const r = await activarApiKey({ id: KEY_ID }, { apiKeyService: service, getActor: async () => MAESTRO });

    expect(r).toEqual({ status: "tope_plan", mensaje: MENSAJE });
  });
});
