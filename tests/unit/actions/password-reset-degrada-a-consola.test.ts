import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// SL-32 T19 (R38, parte de servidor) — EL FLUJO de «recuperar contraseña» degrada a consola.
//
// `tests/unit/services/email-notificacion.test.ts` ya prueba la fabrica `crearEmailSender` sola.
// Lo que no probaba nadie es que la Server Action REAL, construida por su composition root
// (`buildPasswordResetService`, sin `deps.service`), termine en `ConsoleEmailSender` cuando no
// hay credencial SMTP, y que no lance. Si el root dejara de pasar por `crearEmailProvider`, o la
// fabrica dejara de degradar, la recuperacion reventaria en dev y CI sin que la fabrica sola lo
// viera.
//
// Y la otra mitad: con la configuracion de Brevo que decidio el leader (`smtp-relay.brevo.com`,
// 587) la fabrica elige nodemailer con STARTTLS (`secure: false`), sin abrir conexion.
//
// Sin base: Prisma y los dos repositorios son dobles. Credenciales FALSAS, dominio `example.test`.

const dobles = vi.hoisted(() => ({
  findCuentasPorEmail: vi.fn(async (email: string) => [{ id: "u-ficticio", email }]),
  contarRecientes: vi.fn(async () => 0),
  crearDesafio: vi.fn(async () => ({ id: "desafio-ficticio" })),
  createTransport: vi.fn(),
}));

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({}),
  PRISMA_OMIT: {},
}));

vi.mock("@/lib/repositories/UserRepository", () => ({
  UserRepository: class {
    findCuentasPorEmail = dobles.findCuentasPorEmail;
  },
}));

vi.mock("@/lib/repositories/EmailOtpChallengeRepository", () => ({
  EmailOtpChallengeRepository: class {
    contarRecientesPorUsuario = dobles.contarRecientes;
    create = dobles.crearDesafio;
  },
}));

// Si algo intentara abrir el transporte SMTP, este doble lo registra: ningun caso lo espera.
vi.mock("nodemailer", () => ({
  default: { createTransport: dobles.createTransport },
  createTransport: dobles.createTransport,
}));

const { solicitarRecuperacion } = await import("@/lib/actions/password-reset");
const { crearEmailSender } = await import("@/lib/services/EmailProvider");
const { loadEmailConfig } = await import("@/lib/config/email");
const { ConsoleEmailSender } = await import("@/lib/services/email/ConsoleEmailSender");
const { NodemailerEmailSender } = await import("@/lib/services/email/NodemailerEmailSender");

const VARIABLES = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "AUTH_OTP_DEBUG_LOG",
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SITE_URL",
] as const;

const EMAIL = "maestro-ficticio@example.test";
const contexto = async () => ({ ipAddress: "203.0.113.7", userAgent: "vitest" });

let original: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};

beforeEach(() => {
  original = {};
  for (const v of VARIABLES) {
    original[v] = process.env[v];
    delete process.env[v];
  }
  // SL-18 (design §4.1): sin URL base la recuperacion no emite enlaces ni envia; aqui hay una.
  process.env.NEXT_PUBLIC_APP_URL = "https://app.example.test";
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  for (const v of VARIABLES) {
    if (original[v] === undefined) delete process.env[v];
    else process.env[v] = original[v];
  }
  vi.restoreAllMocks();
  dobles.findCuentasPorEmail.mockClear();
  dobles.contarRecientes.mockClear();
  dobles.crearDesafio.mockClear();
  dobles.createTransport.mockClear();
});

describe("T19 — sin SMTP, «recuperar contraseña» envia por consola y no lanza", () => {
  it("la action real, por su composition root, termina en ConsoleEmailSender.enviar", async () => {
    const enviar = vi.spyOn(ConsoleEmailSender.prototype, "enviar");

    const resultado = await solicitarRecuperacion({ email: EMAIL }, { getContext: contexto });

    expect(resultado).toEqual({ status: "ok" });
    // Anti-vacuidad: el flujo llego de verdad al envio, con el usuario del doble.
    expect(dobles.findCuentasPorEmail).toHaveBeenCalledWith(EMAIL);
    expect(dobles.crearDesafio).toHaveBeenCalledTimes(1);
    expect(enviar).toHaveBeenCalledTimes(1);
    expect(enviar.mock.calls[0][0].to).toBe(EMAIL);
    expect(dobles.createTransport).not.toHaveBeenCalled();
  });

  it("con SMTP_HOST de Brevo pero sin credencial, sigue degradando a consola", async () => {
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_PORT = "587";
    const enviar = vi.spyOn(ConsoleEmailSender.prototype, "enviar");

    await expect(
      solicitarRecuperacion({ email: EMAIL }, { getContext: contexto }),
    ).resolves.toEqual({ status: "ok" });
    expect(enviar).toHaveBeenCalledTimes(1);
  });
});

describe("T19 — con la configuracion de Brevo, nodemailer por STARTTLS", () => {
  it("crearEmailSender devuelve el emisor de nodemailer y no abre conexion", () => {
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "usuario-falso@example.test";
    process.env.SMTP_PASSWORD = "credencial-falsa-de-test";

    expect(crearEmailSender()).toBeInstanceOf(NodemailerEmailSender);
    expect(dobles.createTransport).not.toHaveBeenCalled();
  });

  it("loadEmailConfig da host de Brevo, puerto 587 y secure false", () => {
    process.env.SMTP_HOST = "smtp-relay.brevo.com";
    process.env.SMTP_PORT = "587";
    process.env.SMTP_USER = "usuario-falso@example.test";
    process.env.SMTP_PASSWORD = "credencial-falsa-de-test";

    const config = loadEmailConfig();

    expect(config.host).toBe("smtp-relay.brevo.com");
    expect(config.port).toBe(587);
    expect(config.secure).toBe(false);
  });
});
