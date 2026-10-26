import { describe, it, expect, vi, afterEach } from "vitest";

import { DEVICE_HASH_BIENVENIDA, PasswordResetService } from "@/lib/services/PasswordResetService";
import { loadAuthConfig, type AuthConfig } from "@/lib/config/auth";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";
import type { EmailOtpChallengeRecord } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";

// SL-41 / T6 (design §6.1) — el enlace de bienvenida en `PasswordResetService`: emision (R15, R17)
// y canje (R18, R19, R20, R22), sin el secreto en ningun `console.*` (R34). El `WHERE` de
// `consumirSiActivo` (la carrera de verdad) se prueba contra Postgres en
// `tests/integration/db/enlace-bienvenida.test.ts`; aqui se prueba que el servicio lo respeta.

const CONFIG: AuthConfig = { ...loadAuthConfig(), BIENVENIDA_TTL_HORAS: 72 };

const USUARIO_ID = "usr-maestro-1";
const CHALLENGE_ID = "6b1f6d0c-3c0e-4f7e-9d43-0f6a2b8c9e11";
// 43 caracteres base64url, como los que genera el servicio.
const SECRETO = "q2Zl3x8VtYw0bN4mR7cK1pJ9sH6dA5eG2uI0oL3nB8z";
const NUEVA = "Contrasena-Fuerte-2026!";

function fila(over: Partial<EmailOtpChallengeRecord> & { codeHash: string }): EmailOtpChallengeRecord {
  return {
    id: CHALLENGE_ID,
    usuarioId: USUARIO_ID,
    deviceHash: DEVICE_HASH_BIENVENIDA,
    ipAddress: "10.0.0.1",
    expiresAt: new Date(Date.now() + 3_600_000),
    consumedAt: null,
    createdAt: new Date(),
    ...over,
  };
}

/** Dobles con un registro del ORDEN de las llamadas, para probar «consume antes de guardar». */
function buildDeps() {
  const orden: string[] = [];
  const userRepo = {
    findCuentasPorEmail: vi.fn(),
    updatePasswordHash: vi.fn(async () => {
      orden.push("updatePasswordHash");
    }),
  };
  const otpRepo = {
    findLatestActiveByUsuarioId: vi.fn(async (): Promise<EmailOtpChallengeRecord | null> => null),
    contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
    markConsumed: vi.fn().mockResolvedValue(undefined),
    create: vi.fn(async (input: Omit<EmailOtpChallengeRecord, "id" | "consumedAt" | "createdAt">) => ({
      ...input,
      id: CHALLENGE_ID,
      consumedAt: null,
      createdAt: new Date(),
    })),
    findActiveById: vi.fn(async (): Promise<EmailOtpChallengeRecord | null> => null),
    consumirSiActivo: vi.fn(async () => {
      orden.push("consumirSiActivo");
      return true;
    }),
  };
  const otpIssuer = { emitir: vi.fn() };
  return { userRepo, otpRepo, otpIssuer, orden };
}

function buildService(deps: ReturnType<typeof buildDeps>, config: AuthConfig = CONFIG) {
  return new PasswordResetService(
    deps.userRepo,
    deps.otpRepo,
    deps.otpIssuer,
    new ResetRateLimiter(() => 1000),
    config,
  );
}

/** Deja los dobles como para un canje bueno: la fila existe, es la ultima y gana la carrera. */
async function conFilaVigente(deps: ReturnType<typeof buildDeps>, over: Partial<EmailOtpChallengeRecord> = {}) {
  const f = fila({ codeHash: await hashPassword(SECRETO), ...over });
  deps.otpRepo.findActiveById.mockResolvedValue(f);
  deps.otpRepo.findLatestActiveByUsuarioId.mockResolvedValue(f);
  return f;
}

const canje = (enlace = `${CHALLENGE_ID}.${SECRETO}`) => ({ enlace, newPassword: NUEVA, ipAddress: "1.2.3.4" });

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("SL-41 — emitirEnlaceBienvenida (R15, R17)", () => {
  it("R15: el secreto tiene 43+ caracteres base64url y a la base solo llega su hash", async () => {
    const deps = buildDeps();
    const { enlace } = await buildService(deps).emitirEnlaceBienvenida({ usuarioId: USUARIO_ID, ipAddress: "10.0.0.1" });

    const [id, secreto] = enlace.split(".");
    expect(id).toBe(CHALLENGE_ID);
    expect(secreto.length).toBeGreaterThanOrEqual(43);
    expect(secreto).toMatch(/^[A-Za-z0-9_-]+$/);

    expect(deps.otpRepo.create).toHaveBeenCalledTimes(1);
    const recibido = deps.otpRepo.create.mock.calls[0][0];
    expect(JSON.stringify(recibido)).not.toContain(secreto);
    expect(recibido.codeHash).not.toBe(secreto);
    expect(await verifyPassword(secreto, recibido.codeHash)).toBe(true);
    expect(recibido).toMatchObject({ usuarioId: USUARIO_ID, deviceHash: "bienvenida", ipAddress: "10.0.0.1" });
  });

  it("R15: dos emisiones dan secretos distintos", async () => {
    const deps = buildDeps();
    const s = buildService(deps);
    const a = await s.emitirEnlaceBienvenida({ usuarioId: USUARIO_ID, ipAddress: "x" });
    const b = await s.emitirEnlaceBienvenida({ usuarioId: USUARIO_ID, ipAddress: "x" });
    expect(a.enlace).not.toBe(b.enlace);
  });

  it("R17: por defecto el enlace vence a las 72 horas", async () => {
    vi.stubEnv("AUTH_BIENVENIDA_TTL_HORAS", "");
    const config = loadAuthConfig();
    expect(config.BIENVENIDA_TTL_HORAS).toBe(72);

    const deps = buildDeps();
    const antes = Date.now();
    const r = await buildService(deps, config).emitirEnlaceBienvenida({ usuarioId: USUARIO_ID, ipAddress: "x" });
    const despues = Date.now();

    const vence = deps.otpRepo.create.mock.calls[0][0].expiresAt.getTime();
    expect(vence).toBeGreaterThanOrEqual(antes + 72 * 3_600_000);
    expect(vence).toBeLessThanOrEqual(despues + 72 * 3_600_000);
    expect(r.ttlHoras).toBe(72);
  });

  it("R17: con AUTH_BIENVENIDA_TTL_HORAS=24 vence a las 24 horas", async () => {
    vi.stubEnv("AUTH_BIENVENIDA_TTL_HORAS", "24");
    const config = loadAuthConfig();

    const deps = buildDeps();
    const antes = Date.now();
    const r = await buildService(deps, config).emitirEnlaceBienvenida({ usuarioId: USUARIO_ID, ipAddress: "x" });
    const despues = Date.now();

    const vence = deps.otpRepo.create.mock.calls[0][0].expiresAt.getTime();
    expect(vence).toBeGreaterThanOrEqual(antes + 24 * 3_600_000);
    expect(vence).toBeLessThanOrEqual(despues + 24 * 3_600_000);
    expect(r.ttlHoras).toBe(24);
  });
});

describe("SL-41 — crearContrasenaConEnlace (R18, R19, R20, R22)", () => {
  it("R18: con un enlace vigente guarda la contrasena nueva y consume el enlace ANTES de guardarla", async () => {
    const deps = buildDeps();
    await conFilaVigente(deps);

    const r = await buildService(deps).crearContrasenaConEnlace(canje());

    expect(r).toEqual({ status: "ok" });
    expect(deps.otpRepo.findActiveById).toHaveBeenCalledWith(CHALLENGE_ID);
    expect(deps.otpRepo.consumirSiActivo).toHaveBeenCalledWith(CHALLENGE_ID);
    expect(deps.orden).toEqual(["consumirSiActivo", "updatePasswordHash"]);
    const [usuarioId, hash] = deps.userRepo.updatePasswordHash.mock.calls[0] as unknown as [string, string];
    expect(usuarioId).toBe(USUARIO_ID);
    expect(hash).not.toBe(NUEVA);
    expect(await verifyPassword(NUEVA, hash)).toBe(true);
    // El enlace no es el codigo: el flujo viejo (`markConsumed` sin condicion) no se usa.
    expect(deps.otpRepo.markConsumed).not.toHaveBeenCalled();
  });

  const rechazos: Array<{ caso: string; preparar: (d: ReturnType<typeof buildDeps>) => Promise<unknown>; enlace?: string }> = [
    {
      caso: "R19: vencido, consumido o inexistente (findActiveById null)",
      preparar: async (d) => d.otpRepo.findActiveById.mockResolvedValue(null),
    },
    {
      caso: "R22: sustituido por un enlace o un codigo posterior (el ultimo activo es otro)",
      preparar: async (d) => {
        await conFilaVigente(d);
        d.otpRepo.findLatestActiveByUsuarioId.mockResolvedValue(
          fila({ id: "otro-desafio-mas-nuevo", codeHash: "x", deviceHash: "sha-de-un-dispositivo" }),
        );
      },
    },
    {
      caso: "R22: sin desafio activo mas reciente (findLatestActiveByUsuarioId null)",
      preparar: async (d) => {
        await conFilaVigente(d);
        d.otpRepo.findLatestActiveByUsuarioId.mockResolvedValue(null);
      },
    },
    {
      caso: "R19: un desafio de login o recuperacion (otro deviceHash) no se canjea por enlace",
      preparar: async (d) => conFilaVigente(d, { deviceHash: "a3f1c2e4b5d6" }),
    },
    {
      caso: "R19: secreto erroneo",
      preparar: async (d) => conFilaVigente(d),
      enlace: `${CHALLENGE_ID}.${SECRETO.slice(0, -1)}A`,
    },
    {
      caso: "R19: enlace sin separador",
      preparar: async (d) => conFilaVigente(d),
      enlace: `${CHALLENGE_ID}${SECRETO}`,
    },
  ];

  for (const r of rechazos) {
    it(`${r.caso}: responde el generico y no toca la contrasena ni consume`, async () => {
      const deps = buildDeps();
      await r.preparar(deps);

      const res = await buildService(deps).crearContrasenaConEnlace(canje(r.enlace));

      expect(res).toEqual({ status: "invalid_or_expired" });
      expect(deps.userRepo.updatePasswordHash).not.toHaveBeenCalled();
      expect(deps.otpRepo.consumirSiActivo).not.toHaveBeenCalled();
    });
  }

  it("R20: si otro canje gano la carrera (consumirSiActivo false), no guarda la contrasena", async () => {
    const deps = buildDeps();
    await conFilaVigente(deps);
    deps.otpRepo.consumirSiActivo.mockResolvedValue(false);

    const res = await buildService(deps).crearContrasenaConEnlace(canje());

    expect(res).toEqual({ status: "invalid_or_expired" });
    expect(deps.otpRepo.consumirSiActivo).toHaveBeenCalledWith(CHALLENGE_ID);
    expect(deps.userRepo.updatePasswordHash).not.toHaveBeenCalled();
  });

  it("R19: pasado el limite de intentos del mismo enlace e IP, rechaza sin leer la base", async () => {
    const deps = buildDeps();
    await conFilaVigente(deps);
    const s = buildService(deps);
    const malo = canje(`${CHALLENGE_ID}.${SECRETO.slice(0, -1)}A`);
    for (let i = 0; i < CONFIG.RESET_MAX_VERIFY_ATTEMPTS; i++) await s.crearContrasenaConEnlace(malo);
    deps.otpRepo.findActiveById.mockClear();

    const res = await s.crearContrasenaConEnlace(canje());

    expect(res).toEqual({ status: "invalid_or_expired" });
    expect(deps.otpRepo.findActiveById).not.toHaveBeenCalled();
    expect(deps.userRepo.updatePasswordHash).not.toHaveBeenCalled();
  });
});

describe("SL-41 — R34: el secreto no sale por consola", () => {
  it("ni al emitir, ni en un canje bueno, ni en uno rechazado", async () => {
    const espias = (["log", "info", "warn", "error", "debug"] as const).map((m) =>
      vi.spyOn(console, m).mockImplementation(() => {}),
    );
    const deps = buildDeps();
    const s = buildService(deps);

    const { enlace } = await s.emitirEnlaceBienvenida({ usuarioId: USUARIO_ID, ipAddress: "x" });
    const secreto = enlace.split(".")[1];
    const f = fila({ codeHash: deps.otpRepo.create.mock.calls[0][0].codeHash });
    deps.otpRepo.findActiveById.mockResolvedValue(f);
    deps.otpRepo.findLatestActiveByUsuarioId.mockResolvedValue(f);
    await s.crearContrasenaConEnlace(canje(`${CHALLENGE_ID}.${secreto}x`));
    await s.crearContrasenaConEnlace(canje(enlace));

    // Control: el canje bueno llego a guardar, asi que se recorrio el camino entero.
    expect(deps.userRepo.updatePasswordHash).toHaveBeenCalledTimes(1);
    const impreso = espias.flatMap((e) => e.mock.calls).map((args) => JSON.stringify(args)).join("\n");
    expect(impreso).not.toContain(secreto);
    expect(impreso).not.toContain(NUEVA);
  });
});

// Revisión m2: un «Reenviar» cuyo correo falla anula el enlace nuevo, y el anterior vuelve a valer.
// Que el anterior pase a ser el último activo se prueba contra Postgres en
// `tests/integration/db/enlace-bienvenida.test.ts`.
describe("SL-41 — anularEnlaceBienvenida (revisión m2)", () => {
  it("consume el desafío del enlace por su id", async () => {
    const deps = buildDeps();
    await buildService(deps).anularEnlaceBienvenida(`${CHALLENGE_ID}.${SECRETO}`);
    expect(deps.otpRepo.consumirSiActivo).toHaveBeenCalledTimes(1);
    expect(deps.otpRepo.consumirSiActivo).toHaveBeenCalledWith(CHALLENGE_ID);
  });

  it("con un enlace roto no toca la base", async () => {
    const deps = buildDeps();
    await buildService(deps).anularEnlaceBienvenida("sin-punto");
    expect(deps.otpRepo.consumirSiActivo).not.toHaveBeenCalled();
  });
});
