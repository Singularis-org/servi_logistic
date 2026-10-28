import { describe, it, expect, vi, beforeAll } from "vitest";
import { AuthService } from "@/lib/services/AuthService";
import { hashPassword } from "@/lib/utils/password";
import type { CuentaConHash, IUserRepository } from "@/lib/interfaces/repositories/IUserRepository";
import type { ILoginAttemptRepository } from "@/lib/interfaces/repositories/ILoginAttemptRepository";
import type { ITrustedDeviceRepository } from "@/lib/interfaces/repositories/ITrustedDeviceRepository";
import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { ISessionRepository } from "@/lib/interfaces/repositories/ISessionRepository";
import type { IRiskEngine } from "@/lib/interfaces/services/IRiskEngine";
import type { IEmailProvider } from "@/lib/interfaces/external/IEmailProvider";

// SL-18 T2.2 (design §3.2) — login con el email repetido entre empresas. El repositorio es un doble
// que devuelve las cuentas YA en el orden de design §3.1 (por nombre de empresa, plataforma al
// final): ese orden lo prueba `user-repository.test.ts`; aqui se prueba que el servicio lo respeta.

const CTX = { ipAddress: "1.2.3.4", userAgent: "vitest-agent" };
const EMAIL = "ana@example.com";
const CLAVE = "clave-compartida";
const OTRA = "otra-clave";

const ORG_A = "org-a";
const ORG_B = "org-b";
const ORG_C = "org-c";

let hashClave: string;
let hashOtra: string;

beforeAll(async () => {
  hashClave = await hashPassword(CLAVE);
  hashOtra = await hashPassword(OTRA);
});

function cuenta(id: string, extra: Partial<CuentaConHash> = {}): CuentaConHash {
  return {
    id,
    email: EMAIL,
    estado: "activo",
    organizacionId: ORG_A,
    rol: "maestro",
    empresaNombre: "Alfa",
    passwordHash: hashClave,
    ...extra,
  };
}

const deA = (extra: Partial<CuentaConHash> = {}) =>
  cuenta("usr-a", { organizacionId: ORG_A, empresaNombre: "Alfa", ...extra });
const deB = (extra: Partial<CuentaConHash> = {}) =>
  cuenta("usr-b", { organizacionId: ORG_B, empresaNombre: "Beta", ...extra });
const deC = (extra: Partial<CuentaConHash> = {}) =>
  cuenta("usr-c", { organizacionId: ORG_C, empresaNombre: "Gamma", ...extra });
const dePlataforma = (extra: Partial<CuentaConHash> = {}) =>
  cuenta("usr-p", { organizacionId: null, empresaNombre: null, rol: "superadmin", ...extra });

interface Opciones {
  cuentas: CuentaConHash[];
  /** ids de cuenta que ya superaron `AUTH_MAX_FAILED_ATTEMPTS`. */
  bloqueadas?: string[];
  riesgoAlto?: boolean;
}

function montar({ cuentas, bloqueadas = [], riesgoAlto = false }: Opciones) {
  const userRepo = {
    findCuentasPorEmailConHash: vi.fn().mockResolvedValue(cuentas),
    findById: vi.fn(),
  } as unknown as IUserRepository;
  const loginAttemptRepo: ILoginAttemptRepository = {
    registrar: vi.fn(),
    contarFallosConsecutivosRecientes: vi.fn(async ({ usuarioId }: { usuarioId: string }) =>
      bloqueadas.includes(usuarioId) ? 99 : 0,
    ),
    ipReconocida: vi.fn().mockResolvedValue(true),
  };
  const trustedDeviceRepo: ITrustedDeviceRepository = {
    findByUsuarioAndDevice: vi.fn().mockResolvedValue({ id: "td-1" }),
    upsert: vi.fn(),
  };
  const otpRepo = {
    create: vi.fn(async (d: { usuarioId: string }) => ({ id: `challenge-${d.usuarioId}` })),
    findActiveById: vi.fn(),
    markConsumed: vi.fn(),
    findLatestActiveByUsuarioId: vi.fn(),
    contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
    consumirSiActivo: vi.fn(),
  } as unknown as IEmailOtpChallengeRepository;
  const sessionRepo: ISessionRepository = {
    create: vi.fn(async ({ userId }: { userId: string }) => ({
      id: `sess-${userId}`,
      userId,
      expiresAt: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    })),
    findValidById: vi.fn(),
    deleteById: vi.fn(),
    deleteAllByUserId: vi.fn().mockResolvedValue(0),
  };
  const riskEngine: IRiskEngine = {
    evaluate: vi.fn().mockResolvedValue(
      riesgoAlto
        ? { score: 90, reasons: ["dispositivo_no_reconocido"], isHigh: true }
        : { score: 0, reasons: [], isHigh: false },
    ),
  };
  const emailProvider: IEmailProvider = { sendOtpCode: vi.fn() };

  const servicio = new AuthService(
    userRepo,
    loginAttemptRepo,
    trustedDeviceRepo,
    otpRepo,
    sessionRepo,
    riskEngine,
    emailProvider,
  );
  return { servicio, userRepo, loginAttemptRepo, trustedDeviceRepo, otpRepo, sessionRepo, riskEngine, emailProvider };
}

type Montaje = ReturnType<typeof montar>;

/** Los intentos registrados, como `[usuarioId, exitoso, riskReason]`. */
function intentos(m: Montaje): Array<[string | null, boolean, string]> {
  return (m.loginAttemptRepo.registrar as ReturnType<typeof vi.fn>).mock.calls.map(([i]) => [
    i.usuarioId,
    i.exitoso,
    i.riskReason,
  ]);
}

function sinEscrituras(m: Montaje): void {
  expect(m.loginAttemptRepo.registrar).not.toHaveBeenCalled();
  expect(m.trustedDeviceRepo.upsert).not.toHaveBeenCalled();
  expect(m.otpRepo.create).not.toHaveBeenCalled();
  expect(m.emailProvider.sendOtpCode).not.toHaveBeenCalled();
  expect(m.sessionRepo.create).not.toHaveBeenCalled();
}

describe("SL-18 — AuthService.login con el email en varias empresas", () => {
  it("R6: la contrasena vale en una sola cuenta habilitada → sesion de esa cuenta; con riesgo alto, OTP de esa cuenta", async () => {
    // La de B tiene otra contrasena: el email esta en dos empresas, pero vale en una.
    const bajo = montar({ cuentas: [deA(), deB({ passwordHash: hashOtra })] });
    const r = await bajo.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });

    expect(r).toMatchObject({ status: "ok", sessionId: "sess-usr-a" });
    expect(bajo.sessionRepo.create).toHaveBeenCalledWith({ userId: "usr-a", ttlHours: 24 });
    expect(bajo.trustedDeviceRepo.upsert).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: "usr-a" }));
    expect(intentos(bajo)).toEqual([["usr-a", true, "ninguno"]]);

    const alto = montar({ cuentas: [deA(), deB({ passwordHash: hashOtra })], riesgoAlto: true });
    const r2 = await alto.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });

    expect(r2).toEqual({ status: "challenge_required", challengeId: "challenge-usr-a" });
    expect(alto.otpRepo.create).toHaveBeenCalledWith(expect.objectContaining({ usuarioId: "usr-a" }));
    expect(alto.sessionRepo.create).not.toHaveBeenCalled();
  });

  it("R7: la contrasena vale en dos o mas cuentas → elegir_empresa en el orden del repositorio, «Plataforma» con null, sin escrituras", async () => {
    const m = montar({ cuentas: [deA(), deB(), dePlataforma()], riesgoAlto: true });

    const r = await m.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });

    expect(r).toEqual({
      status: "elegir_empresa",
      empresas: [
        { organizacionId: ORG_A, nombre: "Alfa" },
        { organizacionId: ORG_B, nombre: "Beta" },
        { organizacionId: null, nombre: "Plataforma" },
      ],
    });
    // Ni intento, ni dispositivo, ni OTP, ni sesion; tampoco se llega a evaluar el riesgo.
    sinEscrituras(m);
    expect(m.riskEngine.evaluate).not.toHaveBeenCalled();
  });

  it("R8: la lista excluye la cuenta con otra contrasena, la inactiva y la bloqueada", async () => {
    const m = montar({
      cuentas: [
        deA(),
        deB({ passwordHash: hashOtra }), // contrasena que no vale
        deC({ estado: "inactivo" }), // no habilitada
        cuenta("usr-d", { organizacionId: "org-d", empresaNombre: "Delta" }), // bloqueada
        dePlataforma(),
      ],
      bloqueadas: ["usr-d"],
    });

    const r = await m.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });

    expect(r).toEqual({
      status: "elegir_empresa",
      empresas: [
        { organizacionId: ORG_A, nombre: "Alfa" },
        { organizacionId: null, nombre: "Plataforma" },
      ],
    });
    sinEscrituras(m);
  });

  it("R9: sin cuentas, o sin ninguna contrasena valida → invalid_credentials igual en los dos casos; un fallo por cuenta no bloqueada, o uno sin cuenta", async () => {
    const sinCuentas = montar({ cuentas: [] });
    const r1 = await sinCuentas.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });

    const ninguna = montar({ cuentas: [deA(), deB(), deC()], bloqueadas: ["usr-c"] });
    const r2 = await ninguna.servicio.login({ email: EMAIL, password: "no-es-ninguna", ...CTX });

    expect(r1).toEqual({ status: "invalid_credentials" });
    expect(r2).toEqual(r1); // la misma respuesta, sin nombrar empresas
    expect(intentos(sinCuentas)).toEqual([[null, false, "usuario_no_encontrado"]]);
    // A y B suman su fallo; C ya estaba bloqueada y no se toca.
    expect(intentos(ninguna)).toEqual([
      ["usr-a", false, "password_incorrecta"],
      ["usr-b", false, "password_incorrecta"],
    ]);
    expect(ninguna.sessionRepo.create).not.toHaveBeenCalled();
  });

  it("R10: la contrasena vale en A → ningun fallo registrado en B, donde no vale", async () => {
    const m = montar({ cuentas: [deA(), deB({ passwordHash: hashOtra })] });

    const r = await m.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });

    expect(r.status).toBe("ok");
    const registrados = intentos(m);
    expect(registrados.filter(([id]) => id === "usr-b")).toEqual([]);
    expect(registrados.filter(([, exitoso]) => !exitoso)).toEqual([]);
  });

  it("R11: con empresa elegida se evalua solo esa cuenta; con una empresa sin cuenta del email → invalid_credentials", async () => {
    const conB = montar({ cuentas: [deA(), deB(), dePlataforma()] });
    const r = await conB.servicio.login({ email: EMAIL, password: CLAVE, organizacionId: ORG_B, ...CTX });

    expect(r).toMatchObject({ status: "ok", sessionId: "sess-usr-b" });
    expect(conB.sessionRepo.create).toHaveBeenCalledWith({ userId: "usr-b", ttlHours: 24 });
    // El bloqueo solo se mira en la cuenta elegida.
    const miradas = (conB.loginAttemptRepo.contarFallosConsecutivosRecientes as ReturnType<typeof vi.fn>).mock.calls.map(
      ([p]) => p.usuarioId,
    );
    expect(miradas.filter((id) => id !== "usr-b")).toEqual([]);

    // `null` elige la cuenta de plataforma.
    const conPlataforma = montar({ cuentas: [deA(), dePlataforma()] });
    const rp = await conPlataforma.servicio.login({ email: EMAIL, password: CLAVE, organizacionId: null, ...CTX });
    expect(rp).toMatchObject({ status: "ok", sessionId: "sess-usr-p" });

    // Empresa ajena: el email no tiene cuenta alli.
    const ajena = montar({ cuentas: [deA(), deB()] });
    const r2 = await ajena.servicio.login({ email: EMAIL, password: CLAVE, organizacionId: ORG_C, ...CTX });
    expect(r2).toEqual({ status: "invalid_credentials" });
    expect(intentos(ajena)).toEqual([[null, false, "usuario_no_encontrado"]]);
    expect(ajena.sessionRepo.create).not.toHaveBeenCalled();

    // La contrasena vale en A pero no en la elegida B → invalid_credentials, y el fallo es de B.
    const malEnB = montar({ cuentas: [deA(), deB({ passwordHash: hashOtra })] });
    const r3 = await malEnB.servicio.login({ email: EMAIL, password: CLAVE, organizacionId: ORG_B, ...CTX });
    expect(r3).toEqual({ status: "invalid_credentials" });
    expect(intentos(malEnB)).toEqual([["usr-b", false, "password_incorrecta"]]);
  });

  it("R12: todas las cuentas bloqueadas → account_locked; la contrasena solo vale en cuentas no habilitadas → account_unavailable", async () => {
    const bloqueadas = montar({ cuentas: [deA(), deB()], bloqueadas: ["usr-a", "usr-b"] });
    const r1 = await bloqueadas.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });
    expect(r1).toEqual({ status: "account_locked", retryAfterMinutes: 15 });
    sinEscrituras(bloqueadas);

    const inactivas = montar({
      cuentas: [deA({ estado: "inactivo" }), deB({ estado: "bloqueado" }), deC({ passwordHash: hashOtra })],
    });
    const r2 = await inactivas.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });
    expect(r2).toEqual({ status: "account_unavailable" });
    // Un intento en la primera valida, como hoy; ningun fallo de contrasena en C (R10).
    expect(intentos(inactivas)).toEqual([["usr-a", false, "estado_no_activo:inactivo"]]);
    expect(inactivas.sessionRepo.create).not.toHaveBeenCalled();
  });

  it("R15: una cuenta sin empresa que no es la de plataforma nunca es opcion ni abre sesion", async () => {
    const huerfana = (extra: Partial<CuentaConHash> = {}) =>
      cuenta("usr-x", { organizacionId: null, empresaNombre: null, rol: "maestro", ...extra });

    // Junto a otra valida: no aparece en la lista; entra directo en la unica habilitada.
    const conA = montar({ cuentas: [deA(), huerfana()] });
    const r1 = await conA.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });
    expect(r1).toMatchObject({ status: "ok", sessionId: "sess-usr-a" });

    // Sola: account_unavailable, sin sesion.
    const sola = montar({ cuentas: [huerfana()] });
    const r2 = await sola.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });
    expect(r2).toEqual({ status: "account_unavailable" });
    expect(sola.sessionRepo.create).not.toHaveBeenCalled();
    // Activa pero sin empresa: el motivo nombra la causa, no `estado_no_activo:activo`.
    expect(intentos(sola)).toEqual([["usr-x", false, "sin_empresa"]]);

    // Elegida con `null` (R11): tampoco.
    const elegida = montar({ cuentas: [deA(), huerfana()] });
    const r3 = await elegida.servicio.login({ email: EMAIL, password: CLAVE, organizacionId: null, ...CTX });
    expect(r3).toEqual({ status: "account_unavailable" });
    expect(elegida.sessionRepo.create).not.toHaveBeenCalled();
    expect(intentos(elegida)).toEqual([["usr-x", false, "sin_empresa"]]);

    // Con otras dos validas: la lista no la nombra.
    const tres = montar({ cuentas: [deA(), deB(), huerfana()] });
    const r4 = await tres.servicio.login({ email: EMAIL, password: CLAVE, ...CTX });
    expect(r4).toEqual({
      status: "elegir_empresa",
      empresas: [
        { organizacionId: ORG_A, nombre: "Alfa" },
        { organizacionId: ORG_B, nombre: "Beta" },
      ],
    });
  });
});
