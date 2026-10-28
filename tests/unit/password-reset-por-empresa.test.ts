import { afterEach, describe, expect, it, vi } from "vitest";

import { loadAuthConfig, type AuthConfig } from "@/lib/config/auth";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import type { EmailOtpChallengeRecord } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { CuentaPublica } from "@/lib/interfaces/repositories/IUserRepository";
import {
  DEVICE_HASH_BIENVENIDA,
  DEVICE_HASH_RECUPERACION,
  PasswordResetService,
} from "@/lib/services/PasswordResetService";
import { verifyPassword } from "@/lib/utils/password";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";

// SL-18 T3.2 (design §4.1) — «recuperar contraseña» con el email repetido entre empresas: un
// correo con un enlace por cuenta (R16, R17), el canje que rechaza lo vencido, usado, sustituido
// o ajeno (R19), y el secreto fuera de la base y de la consola (R21). R18 (solo cambia la cuenta
// del enlace) y R20 se prueban con base real en `tests/integration/actions/recuperar-por-empresa.test.ts`.
//
// El repositorio de desafíos es un doble EN MEMORIA con la semántica del real (activo = sin consumir
// y sin vencer; «último» = el más reciente activo de la cuenta), para que los enlaces salgan del
// correo y se canjeen de verdad, no con filas fabricadas a mano.

const CONFIG: AuthConfig = { ...loadAuthConfig(), OTP_TTL_MINUTES: 10, RESET_MAX_REQUESTS: 3 };
const EMAIL = "ana@example.com";
const BASE_URL = "https://app.example.test";
const NUEVA = "Contrasena-Nueva-2026!";

const cuenta = (id: string, organizacionId: string | null, empresaNombre: string | null): CuentaPublica => ({
  id,
  email: EMAIL,
  estado: "activo",
  organizacionId,
  rol: organizacionId === null ? "superadmin" : "maestro",
  empresaNombre,
});
const A = cuenta("usr-a", "org-a", "Empresa A");
const B = cuenta("usr-b", "org-b", "Empresa B");
const PLATAFORMA = cuenta("usr-p", null, null);

type Entrada = Omit<EmailOtpChallengeRecord, "id" | "consumedAt" | "createdAt">;

function repoEnMemoria() {
  const filas: EmailOtpChallengeRecord[] = [];
  /** Solicitudes previas por cuenta, para llevar una al límite sin crear filas. */
  const previas: Record<string, number> = {};
  let n = 0;
  const activa = (f: EmailOtpChallengeRecord) => f.consumedAt === null && f.expiresAt.getTime() > Date.now();
  return {
    filas,
    previas,
    create: vi.fn(async (input: Entrada) => {
      n += 1;
      const f: EmailOtpChallengeRecord = {
        ...input,
        id: `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`,
        consumedAt: null,
        createdAt: new Date(Date.now() + n), // orden estable: la más nueva es la última creada
      };
      filas.push(f);
      return f;
    }),
    findActiveById: vi.fn(async (id: string) => filas.find((f) => f.id === id && activa(f)) ?? null),
    findLatestActiveByUsuarioId: vi.fn(
      async (usuarioId: string) =>
        filas
          .filter((f) => f.usuarioId === usuarioId && activa(f))
          .sort((x, y) => y.createdAt.getTime() - x.createdAt.getTime())[0] ?? null,
    ),
    consumirSiActivo: vi.fn(async (id: string) => {
      const f = filas.find((x) => x.id === id && activa(x));
      if (!f) return false;
      f.consumedAt = new Date();
      return true;
    }),
    contarRecientesPorUsuario: vi.fn(
      async (usuarioId: string) => (previas[usuarioId] ?? 0) + filas.filter((f) => f.usuarioId === usuarioId).length,
    ),
  };
}

function montar(cuentas: CuentaPublica[], opciones: { baseUrl?: string | null; enviar?: (m: EmailMessage) => Promise<never> } = {}) {
  const enviados: EmailMessage[] = [];
  const otpRepo = repoEnMemoria();
  const userRepo = {
    findCuentasPorEmail: vi.fn(async (email: string) => (email === EMAIL ? cuentas : [])),
    updatePasswordHash: vi.fn(async () => undefined),
  };
  const sender = {
    enviar: vi.fn(
      opciones.enviar ??
        (async (m: EmailMessage) => {
          enviados.push(m);
          return { messageId: "id" };
        }),
    ),
  };
  const baseUrl = opciones.baseUrl === undefined ? BASE_URL : opciones.baseUrl;
  const service = new PasswordResetService(
    userRepo,
    otpRepo,
    { sender, baseUrl, contacto: null },
    new ResetRateLimiter(() => 1000),
    CONFIG,
  );
  return { service, otpRepo, userRepo, sender, enviados };
}

/** Las líneas `<empresa>: <url>` del texto plano, en orden. */
function enlacesDelCorreo(m: EmailMessage): Array<{ empresa: string; enlace: string }> {
  return [...m.text.matchAll(/^(.+): https:\/\/app\.example\.test\/recuperar-contrasena#enlace=(\S+)$/gm)].map(
    (r) => ({ empresa: r[1], enlace: r[2] }),
  );
}

const solicitar = (s: PasswordResetService, email = EMAIL) =>
  s.solicitar({ email, deviceHash: "sha-del-navegador", ipAddress: "10.0.0.1" });
const canjear = (s: PasswordResetService, enlace: string) =>
  s.crearContrasenaConEnlace({ enlace, newPassword: NUEVA, ipAddress: "10.0.0.2" });

afterEach(() => {
  vi.restoreAllMocks();
});

describe("SL-18 R16 — un correo con un enlace por cuenta", () => {
  it("R16: dos cuentas → un solo correo al email con dos enlaces, cada uno con su empresa («Plataforma» la de plataforma)", async () => {
    const m = montar([A, PLATAFORMA]);

    expect(await solicitar(m.service)).toEqual({ status: "ok" });

    expect(m.sender.enviar).toHaveBeenCalledTimes(1);
    expect(m.enviados[0].to).toBe(EMAIL);
    const lineas = enlacesDelCorreo(m.enviados[0]);
    expect(lineas.map((l) => l.empresa)).toEqual(["Empresa A", "Plataforma"]);
    // Cada enlace es el de la fila de su cuenta, con la marca de recuperación y el TTL del OTP.
    expect(m.otpRepo.filas.map((f) => [f.usuarioId, f.deviceHash])).toEqual([
      [A.id, DEVICE_HASH_RECUPERACION],
      [PLATAFORMA.id, DEVICE_HASH_RECUPERACION],
    ]);
    expect(lineas.map((l) => l.enlace.split(".")[0])).toEqual(m.otpRepo.filas.map((f) => f.id));
  });

  it("R16: el enlace vence a los AUTH_OTP_TTL_MINUTES", async () => {
    const m = montar([A]);
    const antes = Date.now();
    await solicitar(m.service);
    const despues = Date.now();

    const vence = m.otpRepo.filas[0].expiresAt.getTime();
    expect(vence).toBeGreaterThanOrEqual(antes + CONFIG.OTP_TTL_MINUTES * 60_000);
    expect(vence).toBeLessThanOrEqual(despues + CONFIG.OTP_TTL_MINUTES * 60_000);
  });

  it("R16: la cuenta que superó AUTH_RESET_MAX_REQUESTS se omite; las demás reciben su enlace", async () => {
    const m = montar([A, B, PLATAFORMA]);
    m.otpRepo.previas[B.id] = CONFIG.RESET_MAX_REQUESTS;

    expect(await solicitar(m.service)).toEqual({ status: "ok" });

    expect(m.sender.enviar).toHaveBeenCalledTimes(1);
    expect(enlacesDelCorreo(m.enviados[0]).map((l) => l.empresa)).toEqual(["Empresa A", "Plataforma"]);
    expect(m.enviados[0].text).not.toContain("Empresa B");
    expect(m.otpRepo.filas.map((f) => f.usuarioId)).toEqual([A.id, PLATAFORMA.id]);
  });

  it("sin URL base no emite ni envía, y responde lo mismo", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = montar([A, B], { baseUrl: null });

    expect(await solicitar(m.service)).toEqual({ status: "ok" });

    expect(m.otpRepo.create).not.toHaveBeenCalled();
    expect(m.sender.enviar).not.toHaveBeenCalled();
    expect(warn.mock.calls.flat().join(" ")).not.toContain(EMAIL);
  });

  it("si el envío falla, anula los enlaces recién emitidos y responde lo mismo", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const m = montar([A, B], {
      enviar: async () => {
        throw new Error(`fallo al enviar a ${EMAIL}`);
      },
    });

    expect(await solicitar(m.service)).toEqual({ status: "ok" });

    expect(m.otpRepo.filas).toHaveLength(2);
    for (const f of m.otpRepo.filas) expect(f.consumedAt).not.toBeNull();
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.flat().join(" ")).not.toContain(EMAIL);
  });
});

describe("SL-18 R17 — sin cuentas o todas al límite: sin correo y la misma respuesta", () => {
  it("R17: un email sin cuentas no emite ni envía, y responde igual que uno con cuentas", async () => {
    const sin = montar([]);
    const con = montar([A]);

    const rSin = await solicitar(sin.service, "nadie@example.com");
    const rCon = await solicitar(con.service);

    expect(rSin).toEqual(rCon);
    expect(rSin).toEqual({ status: "ok" });
    expect(sin.otpRepo.create).not.toHaveBeenCalled();
    expect(sin.sender.enviar).not.toHaveBeenCalled();
    expect(con.sender.enviar).toHaveBeenCalledTimes(1); // control: con cuentas sí sale
  });

  it("R17: con todas las cuentas al límite no emite ni envía, y responde lo mismo", async () => {
    const m = montar([A, B]);
    m.otpRepo.previas[A.id] = CONFIG.RESET_MAX_REQUESTS;
    m.otpRepo.previas[B.id] = CONFIG.RESET_MAX_REQUESTS + 2;

    expect(await solicitar(m.service)).toEqual({ status: "ok" });

    expect(m.otpRepo.create).not.toHaveBeenCalled();
    expect(m.sender.enviar).not.toHaveBeenCalled();
  });
});

describe("SL-18 R19 — el canje rechaza lo vencido, usado, sustituido o ajeno", () => {
  /** Pide la recuperación de A y devuelve el enlace que le llegó. */
  async function enlaceDeA(m: ReturnType<typeof montar>) {
    await solicitar(m.service);
    const [linea] = enlacesDelCorreo(m.enviados.at(-1)!);
    return linea.enlace;
  }

  it("control: un enlace de recuperación vigente se canjea y cambia la contraseña de su cuenta", async () => {
    const m = montar([A]);
    const enlace = await enlaceDeA(m);

    expect(await canjear(m.service, enlace)).toEqual({ status: "ok" });

    expect(m.userRepo.updatePasswordHash).toHaveBeenCalledTimes(1);
    const [usuarioId, hash] = m.userRepo.updatePasswordHash.mock.calls[0] as unknown as [string, string];
    expect(usuarioId).toBe(A.id);
    expect(await verifyPassword(NUEVA, hash)).toBe(true);
  });

  const casos: Array<{ caso: string; preparar: (m: ReturnType<typeof montar>, enlace: string) => Promise<unknown> }> = [
    {
      caso: "vencido (pasó AUTH_OTP_TTL_MINUTES)",
      preparar: async (m) => {
        m.otpRepo.filas[0].expiresAt = new Date(Date.now() - 1);
      },
    },
    {
      caso: "ya usado",
      preparar: async (m, enlace) => {
        expect(await canjear(m.service, enlace)).toEqual({ status: "ok" });
        m.userRepo.updatePasswordHash.mockClear();
      },
    },
    {
      caso: "sustituido por otro enlace de recuperación posterior de la misma cuenta",
      preparar: async (m) => {
        await solicitar(m.service);
      },
    },
    {
      caso: "sustituido por un enlace de bienvenida posterior de la misma cuenta",
      preparar: async (m) => {
        await m.service.emitirEnlaceBienvenida({ usuarioId: A.id, ipAddress: "10.0.0.9" });
      },
    },
    {
      caso: "no es un enlace de recuperación ni de bienvenida (un desafío de login)",
      preparar: async (m) => {
        m.otpRepo.filas[0].deviceHash = "a3f1c2e4b5d6e7f8a3f1c2e4b5d6e7f8a3f1c2e4b5d6e7f8a3f1c2e4b5d6e7f8";
      },
    },
  ];

  for (const c of casos) {
    it(`R19: ${c.caso} → invalid_or_expired sin cambiar ninguna contraseña`, async () => {
      const m = montar([A, B]);
      const enlace = await enlaceDeA(m);
      await c.preparar(m, enlace);

      expect(await canjear(m.service, enlace)).toEqual({ status: "invalid_or_expired" });
      expect(m.userRepo.updatePasswordHash).not.toHaveBeenCalled();
    });
  }

  it("R19: la marca de bienvenida sigue valiendo (SL-41 no cambia)", async () => {
    const m = montar([A]);
    const { enlace } = await m.service.emitirEnlaceBienvenida({ usuarioId: A.id, ipAddress: "10.0.0.9" });
    expect(m.otpRepo.filas[0].deviceHash).toBe(DEVICE_HASH_BIENVENIDA);

    expect(await canjear(m.service, enlace)).toEqual({ status: "ok" });
  });
});

describe("SL-18 R21 — el secreto: solo su hash en la base y nunca en la consola", () => {
  it("R21: a create solo llega el hash del secreto que viaja en el enlace", async () => {
    const m = montar([A, PLATAFORMA]);
    await solicitar(m.service);

    const lineas = enlacesDelCorreo(m.enviados[0]);
    expect(lineas).toHaveLength(2);
    for (const [i, { enlace }] of lineas.entries()) {
      const secreto = enlace.split(".")[1];
      expect(secreto).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const recibido = m.otpRepo.create.mock.calls[i][0];
      expect(JSON.stringify(recibido)).not.toContain(secreto);
      expect(await verifyPassword(secreto, recibido.codeHash)).toBe(true);
    }
  });

  it("R21: ni la solicitud, ni un envío fallido, ni un canje bueno o malo escriben el secreto en console", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((metodo) =>
      vi.spyOn(console, metodo).mockImplementation(() => {}),
    );
    const bien = montar([A, B]);
    await solicitar(bien.service);
    const secretos = enlacesDelCorreo(bien.enviados[0]).map((l) => l.enlace);
    await canjear(bien.service, `${secretos[0]}x`);
    expect(await canjear(bien.service, secretos[0])).toEqual({ status: "ok" }); // control: camino entero

    const noSalieron: EmailMessage[] = [];
    const mal = montar([A], {
      enviar: async (m) => {
        noSalieron.push(m);
        throw new Error("smtp caido");
      },
    });
    await solicitar(mal.service);
    expect(noSalieron).toHaveLength(1);
    secretos.push(...enlacesDelCorreo(noSalieron[0]).map((l) => l.enlace));
    expect(secretos).toHaveLength(3);

    const impreso = espias.flatMap((e) => e.mock.calls).map((args) => JSON.stringify(args)).join("\n");
    expect(impreso.length).toBeGreaterThan(0); // control: el envío fallido sí registró algo
    for (const enlace of secretos) expect(impreso).not.toContain(enlace.split(".")[1]);
    expect(impreso).not.toContain(NUEVA);
    expect(impreso).not.toContain(EMAIL);
  });
});
