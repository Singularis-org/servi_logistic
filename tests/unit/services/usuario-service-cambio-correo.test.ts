import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { UsuarioService } from "@/lib/services/UsuarioService";
import {
  CambioCorreoSimultaneoError,
  type ICambioCorreoRepository,
  type IUserRepository,
  type UsuarioPublico,
} from "@/lib/interfaces/repositories/IUserRepository";
import type { Actor, CorreoDeCambio } from "@/lib/interfaces/services/IUsuarioService";
import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { verifyPassword } from "@/lib/utils/password";

// SLT-221 (T2.4): el servicio del maestro para pedir, reenviar, cancelar y consultar el cambio de
// correo. La plantilla es la real (sin doble): lo que se mira es el mensaje que sale.

const MAESTRO: Actor = { usuarioId: "maestro-1", rol: "maestro" };
const BASE_URL = "https://app.ejemplo.test";
const ROLES = [
  { id: "rol-maestro", value: "maestro" as const },
  { id: "rol-tienda", value: "adminTienda" as const },
  { id: "rol-api", value: "apiKey" as const },
  { id: "rol-super", value: "superadmin" as const },
];

function usuario(over: Partial<UsuarioPublico> = {}): UsuarioPublico {
  return {
    id: "usr-1",
    nombre: "Ana",
    email: "ana@empresa.test",
    telefono: "0991234567",
    estado: "activo",
    cedula: "1710034065",
    tipoIdentificacionId: "tipo-1",
    rolId: "rol-tienda",
    seRecogeEnTienda: true,
    createdAt: new Date("2026-01-01"),
    updatedAt: new Date("2026-01-01"),
    ...over,
  };
}

function montar(opts: { usuario?: UsuarioPublico | null; enviar?: IEmailSender["enviar"]; baseUrl?: string | null } = {}) {
  const repo = {
    findById: vi.fn().mockResolvedValue(opts.usuario === undefined ? usuario() : opts.usuario),
    listRoles: vi.fn().mockResolvedValue(ROLES),
    update: vi.fn(),
  };
  const cambios: { [K in keyof ICambioCorreoRepository]: ReturnType<typeof vi.fn> } = {
    existeEmailEnEmpresa: vi.fn().mockResolvedValue(false),
    abrirCambioCorreo: vi
      .fn()
      .mockImplementation(async (input: { expiraAt: Date }) => ({ id: "cc-1", expiraAt: input.expiraAt })),
    anularCambioCorreo: vi.fn().mockResolvedValue(undefined),
    anularCambioCorreoAbierto: vi.fn().mockResolvedValue(undefined),
    cambioCorreoAbierto: vi.fn().mockResolvedValue(null),
    empresaDelCambioCorreo: vi.fn(),
    cambioCorreoParaCanje: vi.fn(),
    aplicarCambioCorreo: vi.fn(),
  };
  const enviados: EmailMessage[] = [];
  const enviar = vi.fn(
    opts.enviar ??
      (async (m: EmailMessage) => {
        enviados.push(m);
        return { messageId: null };
      }),
  );
  const correo: CorreoDeCambio = {
    repo: cambios as unknown as ICambioCorreoRepository,
    sender: { enviar } as unknown as IEmailSender,
    baseUrl: opts.baseUrl === undefined ? BASE_URL : opts.baseUrl,
    contacto: null,
    ttlHoras: 72,
  };
  const service = new UsuarioService(
    repo as unknown as IUserRepository,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    correo,
  );
  return { service, repo, cambios, enviar, enviados };
}

describe("SLT-221 · solicitarCambioCorreo", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T10:00:00.000Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("R1610/R1614/R1621: crea el pendiente, escribe SOLO al correo nuevo y no toca el usuario", async () => {
    const { service, repo, cambios, enviados } = montar();
    const r = await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);

    expect(r).toEqual({
      status: "ok",
      pendiente: { emailNuevo: "nuevo@empresa.test", expiraAt: "2026-11-23T10:00:00.000Z", vencido: false },
    });
    expect(cambios.abrirCambioCorreo).toHaveBeenCalledTimes(1);
    const abierto = cambios.abrirCambioCorreo.mock.calls[0][0];
    expect(abierto).toMatchObject({ usuarioId: "usr-1", emailNuevo: "nuevo@empresa.test", solicitadoPorId: "maestro-1" });
    // R1621: 72 h desde la emisión.
    expect(abierto.expiraAt.toISOString()).toBe("2026-11-23T10:00:00.000Z");
    // R1614: un solo mensaje, al correo NUEVO; nunca al anterior.
    expect(enviados).toHaveLength(1);
    expect(enviados[0].to).toBe("nuevo@empresa.test");
    expect(JSON.stringify(enviados)).not.toContain("ana@empresa.test");
    expect(enviados[0].subject).toContain("Confirma tu correo");
    // m7 (review PR 2): el correo aún no cambió; el texto lo dice pendiente, no hecho.
    expect(enviados[0].text).toContain("pidió cambiar el correo de tu cuenta a este. El cambio está pendiente");
    expect(enviados[0].text).not.toContain("cambió el correo");
    // R1610: el correo del usuario no cambia al pedir.
    expect(repo.update).not.toHaveBeenCalled();
    expect(cambios.aplicarCambioCorreo).not.toHaveBeenCalled();
  });

  it("R1632: en la base solo el hash del secreto, y la URL lo lleva solo en el fragmento `#enlace=`", async () => {
    const { service, cambios, enviados } = montar();
    await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);

    const { secretoHash } = cambios.abrirCambioCorreo.mock.calls[0][0];
    const url = /https:\/\/app\.ejemplo\.test\/recuperar-contrasena\/confirmar-correo#enlace=cc-1\.([A-Za-z0-9_-]{43})/.exec(
      enviados[0].text,
    );
    expect(url, "la URL del correo no tiene la forma <base>/recuperar-contrasena/confirmar-correo#enlace=<id>.<secreto>").not.toBeNull();
    const secreto = url![1];
    expect(secretoHash).not.toContain(secreto);
    expect(await verifyPassword(secreto, secretoHash)).toBe(true);
    // El secreto no va en la query ni en el asunto.
    expect(enviados[0].text).not.toMatch(/\?[^#\s]*cc-1/);
    expect(enviados[0].subject).not.toContain(secreto);
  });

  it("R1611: correo de otro usuario de la empresa -> conflict en `email`, sin pendiente ni envío", async () => {
    const { service, cambios, enviar } = montar();
    cambios.existeEmailEnEmpresa.mockResolvedValue(true);
    const r = await service.solicitarCambioCorreo("usr-1", { email: "otro@empresa.test" }, MAESTRO);
    expect(r).toEqual({ status: "conflict", campo: "email" });
    expect(cambios.existeEmailEnEmpresa).toHaveBeenCalledWith("otro@empresa.test", "usr-1");
    expect(cambios.abrirCambioCorreo).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("m5 (review PR 2): dos pedidos a la vez -> conflict en `email` con un mensaje llano, sin envío ni anulación", async () => {
    const { service, cambios, enviar } = montar();
    cambios.abrirCambioCorreo.mockRejectedValue(new CambioCorreoSimultaneoError());
    const r = await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);
    expect(r).toEqual({
      status: "conflict",
      campo: "email",
      mensaje: "Se estaba pidiendo otro cambio de correo para este usuario al mismo tiempo. Vuelve a intentarlo.",
    });
    expect(enviar).not.toHaveBeenCalled();
    // El abierto es el de la otra petición: no se anula.
    expect(cambios.anularCambioCorreo).not.toHaveBeenCalled();
  });

  it("m5: otro error al abrir el pendiente no se disfraza de conflicto: se propaga", async () => {
    const { service, cambios, enviar } = montar();
    cambios.abrirCambioCorreo.mockRejectedValue(new Error("caida de la base"));
    await expect(service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO)).rejects.toThrow(
      "caida de la base",
    );
    expect(enviar).not.toHaveBeenCalled();
  });

  it("R1612: el mismo correo que el actual -> validation_error en `email`, sin pendiente ni envío", async () => {
    const { service, cambios, enviar } = montar();
    const r = await service.solicitarCambioCorreo("usr-1", { email: "ana@empresa.test" }, MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["email"]);
    expect(cambios.abrirCambioCorreo).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("R1613: la cuenta de una API key -> validation_error en `email`, sin pendiente ni envío", async () => {
    const { service, cambios, enviar } = montar({ usuario: usuario({ rolId: "rol-api" }) });
    const r = await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);
    expect(r.status).toBe("validation_error");
    if (r.status === "validation_error") expect(Object.keys(r.fieldErrors)).toEqual(["email"]);
    expect(cambios.abrirCambioCorreo).not.toHaveBeenCalled();
    expect(enviar).not.toHaveBeenCalled();
  });

  it("R1617/R1632: si el envío falla, anula ESE pendiente, responde envio_fallido y el log no lleva destinatario ni URL", async () => {
    const error = Object.assign(new Error("fallo SMTP para nuevo@empresa.test https://app.ejemplo.test"), {
      name: "EmailEnvioError",
    });
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, cambios } = montar({ enviar: async () => Promise.reject(error) });

    const r = await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);

    expect(r).toEqual({ status: "envio_fallido" });
    expect(cambios.anularCambioCorreo).toHaveBeenCalledWith("cc-1");
    const escrito = log.mock.calls.flat().map(String).join(" ");
    expect(escrito).toContain("EmailEnvioError");
    expect(escrito).not.toContain("nuevo@empresa.test");
    expect(escrito).not.toContain("app.ejemplo.test");
    expect(escrito).not.toContain("cc-1");
  });

  it("R1616/R1620: reenviar (mismo correo nuevo) abre otro pendiente con vencimiento contado desde ahora", async () => {
    const { service, cambios, enviados } = montar();
    await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);
    vi.setSystemTime(new Date("2026-11-25T08:00:00.000Z")); // el primero ya venció
    cambios.abrirCambioCorreo.mockImplementationOnce(async (input: { expiraAt: Date }) => ({
      id: "cc-2",
      expiraAt: input.expiraAt,
    }));
    const r = await service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO);

    expect(r.status).toBe("ok");
    expect(cambios.abrirCambioCorreo).toHaveBeenCalledTimes(2);
    expect(cambios.abrirCambioCorreo.mock.calls[1][0].expiraAt.toISOString()).toBe("2026-11-28T08:00:00.000Z");
    // El enlace nuevo lleva el id nuevo; el anterior lo anula `abrirCambioCorreo` (integración).
    expect(enviados[1].text).toContain("#enlace=cc-2.");
    const s1 = /#enlace=cc-1\.(\S{43})/.exec(enviados[0].text)![1];
    const s2 = /#enlace=cc-2\.(\S{43})/.exec(enviados[1].text)![1];
    expect(s2).not.toBe(s1);
  });

  it("sin URL base lanza ANTES de crear el pendiente", async () => {
    const { service, cambios } = montar({ baseUrl: null });
    await expect(
      service.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, MAESTRO),
    ).rejects.toThrow(/NEXT_PUBLIC_APP_URL/);
    expect(cambios.abrirCambioCorreo).not.toHaveBeenCalled();
  });
});

describe("SLT-221 · cancelar y consultar", () => {
  afterEach(() => vi.useRealTimers());

  it("R1619: cancelar anula el abierto del usuario", async () => {
    const { service, cambios } = montar();
    expect(await service.cancelarCambioCorreo("usr-1", MAESTRO)).toEqual({ status: "ok" });
    expect(cambios.anularCambioCorreoAbierto).toHaveBeenCalledWith("usr-1");
  });

  it("R1618: consultar devuelve el pendiente sin id ni hash, y `vencido` según la hora", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-20T10:00:00.000Z"));
    const { service, cambios } = montar();
    cambios.cambioCorreoAbierto.mockResolvedValue({
      id: "cc-1",
      emailNuevo: "nuevo@empresa.test",
      expiraAt: new Date("2026-11-20T09:59:59.000Z"),
    });
    const r = await service.cambioCorreoPendiente("usr-1", MAESTRO);
    expect(r).toEqual({
      status: "ok",
      pendiente: { emailNuevo: "nuevo@empresa.test", expiraAt: "2026-11-20T09:59:59.000Z", vencido: true },
    });
    cambios.cambioCorreoAbierto.mockResolvedValue(null);
    expect(await service.cambioCorreoPendiente("usr-1", MAESTRO)).toEqual({ status: "ok", pendiente: null });
  });
});

describe("SLT-221 · permisos y empresa (R1630, R1631)", () => {
  const operaciones = [
    ["solicitar", (s: UsuarioService, a: Actor) => s.solicitarCambioCorreo("usr-1", { email: "nuevo@empresa.test" }, a)],
    ["cancelar", (s: UsuarioService, a: Actor) => s.cancelarCambioCorreo("usr-1", a)],
    ["consultar", (s: UsuarioService, a: Actor) => s.cambioCorreoPendiente("usr-1", a)],
  ] as const;

  for (const [nombre, op] of operaciones) {
    it(`R1631 ${nombre}: un rol distinto de maestro -> forbidden sin leer ni escribir nada`, async () => {
      const { service, repo, cambios, enviar } = montar();
      const r = await op(service, { usuarioId: "t-1", rol: "adminTienda" });
      expect(r).toEqual({ status: "forbidden" });
      expect(repo.findById).not.toHaveBeenCalled();
      for (const fn of Object.values(cambios)) expect(fn).not.toHaveBeenCalled();
      expect(enviar).not.toHaveBeenCalled();
    });

    it(`R1630 ${nombre}: usuario de otra empresa (no visible) -> not_found sin tocar el pendiente`, async () => {
      const { service, cambios, enviar } = montar({ usuario: null });
      expect(await op(service, MAESTRO)).toEqual({ status: "not_found" });
      for (const fn of Object.values(cambios)) expect(fn).not.toHaveBeenCalled();
      expect(enviar).not.toHaveBeenCalled();
    });

    it(`R1630 ${nombre}: el superadmin -> not_found sin tocar el pendiente`, async () => {
      const { service, cambios, enviar } = montar({ usuario: usuario({ rolId: "rol-super" }) });
      expect(await op(service, MAESTRO)).toEqual({ status: "not_found" });
      for (const fn of Object.values(cambios)) expect(fn).not.toHaveBeenCalled();
      expect(enviar).not.toHaveBeenCalled();
    });

    it(`${nombre}: sin el correo de cambio inyectado, LANZA (opcional en el constructor, obligatorio en el uso)`, async () => {
      const repo = { findById: vi.fn().mockResolvedValue(usuario()), listRoles: vi.fn().mockResolvedValue(ROLES) };
      const sinCorreo = new UsuarioService(repo as unknown as IUserRepository);
      await expect(op(sinCorreo, MAESTRO)).rejects.toThrow(/correo de confirmacion/);
    });
  }
});
