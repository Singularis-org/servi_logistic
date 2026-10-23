import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { contextoActual, type ContextoDatos } from "@/lib/db/contexto-empresa";

// SL-17 T2.1 (design §5 y §7) — la empresa de una peticion sale del usuario de la sesion (R12),
// el superadmin no tiene (R14), y la cadena de sesion/login lee `usuario` en plataforma (R15)
// porque todavia no hay empresa. Dobles para `next/headers` y para el cliente de Prisma; el
// `SessionRepository` y el contexto (`AsyncLocalStorage`) son los reales.

const cookiesMock = vi.fn();
const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  cookies: () => cookiesMock(),
  headers: () => headersMock(),
}));

type FilaUsuario = {
  id: string;
  organizacionId: string | null;
  zonaId: string | null;
  estado: string;
  rol: { value: string };
};

// La "base": sesiones y usuarios. Cada lectura anota el contexto en el que corrio, que es lo que
// prueba que la cadena de sesion opera en plataforma y no sin contexto.
const sesiones = new Map<string, { id: string; userId: string; expiresAt: Date }>();
const usuarios = new Map<string, FilaUsuario>();
const lecturas: Array<{ modelo: string; ctx: ContextoDatos | undefined }> = [];

const sessionFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
  lecturas.push({ modelo: "Session", ctx: contextoActual() });
  return sesiones.get(where.id) ?? null;
});
const usuarioFindUnique = vi.fn(async ({ where }: { where: { id: string } }) => {
  lecturas.push({ modelo: "Usuario", ctx: contextoActual() });
  return usuarios.get(where.id) ?? null;
});

vi.mock("@/lib/db/prisma-client", () => ({
  getPrismaClient: () => ({
    session: { findUnique: sessionFindUnique },
    usuario: { findUnique: usuarioFindUnique },
  }),
}));

import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { isSessionActive } from "@/lib/auth/session-guard";
import { login, verifyChallenge } from "@/lib/actions/auth";
import {
  restablecerContrasena,
  solicitarRecuperacion,
  verificarCodigoRecuperacion,
} from "@/lib/actions/password-reset";
import type { IAuthService } from "@/lib/interfaces/services/IAuthService";
import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";

const EMPRESA_A = "org-a";
const EMPRESA_B = "org-b";
const FUTURO = new Date("2099-01-01T00:00:00Z");

let secuencia = 0;
// El memo vive en el modulo y dura todo el archivo: cada caso usa ids de sesion propios para no
// heredar lo memorizado por otro.
function sesionDe(usuario: Omit<FilaUsuario, "id">): string {
  secuencia += 1;
  const userId = `u-${secuencia}`;
  const sessionId = `sess-${secuencia}`;
  usuarios.set(userId, { id: userId, ...usuario });
  sesiones.set(sessionId, { id: sessionId, userId, expiresAt: FUTURO });
  return sessionId;
}

const usuarioDe = (organizacionId: string | null): Omit<FilaUsuario, "id"> => ({
  organizacionId,
  zonaId: null,
  estado: "activo",
  rol: { value: organizacionId ? "admin" : "superadmin" },
});

function conCookies(valores: Record<string, string>) {
  cookiesMock.mockResolvedValue({
    get: (nombre: string) => (nombre in valores ? { name: nombre, value: valores[nombre] } : undefined),
    getAll: () => Object.entries(valores).map(([name, value]) => ({ name, value })),
    has: (nombre: string) => nombre in valores,
  });
}

function conCabeceras(valores: Record<string, string>) {
  headersMock.mockResolvedValue(new Headers(valores));
}

beforeEach(() => {
  lecturas.length = 0;
  sessionFindUnique.mockClear();
  usuarioFindUnique.mockClear();
  cookiesMock.mockReset();
  headersMock.mockReset();
  conCabeceras({});
});

afterEach(() => {
  vi.useRealTimers();
});

describe("empresaDeLaPeticion (R12, R14)", () => {
  it("R12: la empresa sale del usuario de la sesion, leido en plataforma", async () => {
    const sessionId = sesionDe(usuarioDe(EMPRESA_A));
    conCookies({ session: sessionId });

    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);

    // Sin plataforma, leer `usuario` volveria a pedir empresa a este mismo resolutor.
    expect(lecturas.map((l) => l.modelo)).toEqual(["Session", "Usuario"]);
    for (const l of lecturas) {
      expect(l.ctx).toEqual({ tipo: "plataforma", ficha: "SL-17", motivo: "resolver la empresa de la sesión" });
    }
  });

  it("R12: ni una cabecera, ni la query, ni otra cookie con otro id cambian la empresa", async () => {
    const sessionId = sesionDe(usuarioDe(EMPRESA_A));
    conCookies({
      session: sessionId,
      organizacion_id: EMPRESA_B,
      organizacionId: EMPRESA_B,
      empresa: EMPRESA_B,
    });
    conCabeceras({
      "x-organizacion-id": EMPRESA_B,
      "x-empresa": EMPRESA_B,
      referer: `https://ejemplo.test/ordenes?organizacionId=${EMPRESA_B}`,
      "next-url": `/ordenes?organizacion_id=${EMPRESA_B}`,
    });

    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);
    expect(headersMock).not.toHaveBeenCalled();
  });

  it("R12: el resolutor no acepta argumentos: el cuerpo de una peticion no tiene por donde entrar", async () => {
    const sessionId = sesionDe(usuarioDe(EMPRESA_A));
    conCookies({ session: sessionId });

    expect(empresaDeLaPeticion.length).toBe(0);
    // Aunque alguien le pase un "cuerpo" a la fuerza, se ignora.
    const forzado = empresaDeLaPeticion as unknown as (cuerpo: unknown) => Promise<string | null>;
    expect(await forzado({ organizacionId: EMPRESA_B })).toBe(EMPRESA_A);
  });

  it("R14: el superadmin (organizacion_id NULL) no tiene empresa", async () => {
    conCookies({ session: sesionDe(usuarioDe(null)) });

    expect(await empresaDeLaPeticion()).toBeNull();
  });

  it("sin cookie de sesion devuelve null sin tocar la base", async () => {
    conCookies({ organizacion_id: EMPRESA_A });

    expect(await empresaDeLaPeticion()).toBeNull();
    expect(sessionFindUnique).not.toHaveBeenCalled();
    expect(usuarioFindUnique).not.toHaveBeenCalled();
  });

  it("fuera de una peticion (`cookies()` lanza) devuelve null", async () => {
    cookiesMock.mockImplementation(() => {
      throw new Error("`cookies` was called outside a request scope");
    });

    expect(await empresaDeLaPeticion()).toBeNull();
    expect(sessionFindUnique).not.toHaveBeenCalled();
  });

  it("una sesion que no existe o caducada devuelve null", async () => {
    conCookies({ session: "sess-inexistente" });
    expect(await empresaDeLaPeticion()).toBeNull();

    const caducada = sesionDe(usuarioDe(EMPRESA_A));
    sesiones.get(caducada)!.expiresAt = new Date("2000-01-01T00:00:00Z");
    conCookies({ session: caducada });
    expect(await empresaDeLaPeticion()).toBeNull();
    expect(usuarioFindUnique).not.toHaveBeenCalled();
  });

  it("memo de 60 s: la segunda lectura dentro del plazo no va a la base, y caduca despues", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-22T12:00:00Z"));
    const sessionId = sesionDe(usuarioDe(EMPRESA_A));
    conCookies({ session: sessionId });

    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);
    expect(usuarioFindUnique).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-22T12:00:59Z"));
    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);
    expect(usuarioFindUnique).toHaveBeenCalledTimes(1);
    expect(sessionFindUnique).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date("2026-10-22T12:01:00Z"));
    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);
    expect(usuarioFindUnique).toHaveBeenCalledTimes(2);
    expect(sessionFindUnique).toHaveBeenCalledTimes(2);
  });

  it("el memo es por sesion: otra sesion de otra empresa resuelve la suya", async () => {
    const deA = sesionDe(usuarioDe(EMPRESA_A));
    const deB = sesionDe(usuarioDe(EMPRESA_B));

    conCookies({ session: deA });
    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);
    conCookies({ session: deB });
    expect(await empresaDeLaPeticion()).toBe(EMPRESA_B);
    conCookies({ session: deA });
    expect(await empresaDeLaPeticion()).toBe(EMPRESA_A);
  });

  it("una sesion invalida no se memoriza: si despues existe, se resuelve", async () => {
    conCookies({ session: "sess-tardia" });
    expect(await empresaDeLaPeticion()).toBeNull();

    usuarios.set("u-tardio", { id: "u-tardio", ...usuarioDe(EMPRESA_B) });
    sesiones.set("sess-tardia", { id: "sess-tardia", userId: "u-tardio", expiresAt: FUTURO });
    expect(await empresaDeLaPeticion()).toBe(EMPRESA_B);
  });
});

describe("validacion de sesion en plataforma (R15, design §7)", () => {
  const VALIDAR = { tipo: "plataforma", ficha: "SL-17", motivo: "validar sesión" };

  it("resolveActorFromSession lee la sesion y el usuario en plataforma y puebla organizacionId", async () => {
    conCookies({ session: sesionDe({ ...usuarioDe(EMPRESA_A), zonaId: "zona-1" }) });

    const actor = await resolveActorFromSession();

    expect(actor).toMatchObject({ rol: "admin", zonaId: "zona-1", organizacionId: EMPRESA_A });
    expect(lecturas.map((l) => l.modelo)).toEqual(["Session", "Usuario"]);
    for (const l of lecturas) expect(l.ctx).toEqual(VALIDAR);
  });

  // SLT-32 (decision humana 2026-10-23): mientras el rol superadmin no exista en `dev`, un usuario
  // sin empresa no tiene actor (`puedeIniciarSesion`). Cuando SL-32 amplie el predicado con
  // `esPlataforma(rol)`, este caso vuelve a esperar el actor con `organizacionId: null` (R14).
  it("SLT-32: un usuario sin empresa no obtiene actor mientras el superadmin no exista", async () => {
    conCookies({ session: sesionDe(usuarioDe(null)) });

    expect(await resolveActorFromSession()).toBeNull();
  });

  it("isSessionActive valida en plataforma y sigue exigiendo usuario activo", async () => {
    const activa = sesionDe(usuarioDe(EMPRESA_A));
    const bloqueada = sesionDe({ ...usuarioDe(EMPRESA_A), estado: "bloqueado" });

    expect(await isSessionActive(activa)).toBe(true);
    expect(await isSessionActive(bloqueada)).toBe(false);
    expect(await isSessionActive("sess-inexistente")).toBe(false);
    expect(lecturas.length).toBeGreaterThan(0);
    for (const l of lecturas) expect(l.ctx).toEqual(VALIDAR);
  });

  // SLT-32 (decision humana 2026-10-23, m1 de la review): una sesion abierta de un usuario sin
  // empresa se trata como caducada. Mismo comentario que el caso de resolveActorFromSession: cuando
  // SL-32 amplie el predicado con `esPlataforma(rol)`, el superadmin vuelve a pasar.
  it("SLT-32: isSessionActive rechaza la sesion de un usuario activo sin empresa (null o vacia)", async () => {
    const sinEmpresa = sesionDe(usuarioDe(null));
    const empresaVacia = sesionDe({ ...usuarioDe(EMPRESA_A), organizacionId: "" });
    const conEmpresa = sesionDe(usuarioDe(EMPRESA_A));

    expect(await isSessionActive(sinEmpresa)).toBe(false);
    expect(await isSessionActive(empresaVacia)).toBe(false);
    expect(await isSessionActive(conEmpresa)).toBe(true);

    // La empresa sale de la MISMA lectura que el estado: una consulta de usuario por validacion.
    expect(usuarioFindUnique).toHaveBeenCalledTimes(3);
    for (const [args] of usuarioFindUnique.mock.calls) {
      expect(args).toMatchObject({ select: { estado: true, organizacionId: true } });
    }
    expect(lecturas.map((l) => l.modelo)).toEqual(["Session", "Usuario", "Session", "Usuario", "Session", "Usuario"]);
  });
});

describe("login, OTP y recuperacion en plataforma (R15, R36)", () => {
  const LOGIN = { tipo: "plataforma", ficha: "SL-17", motivo: "login" };
  const CONTEXTO = { ipAddress: "1.2.3.4", userAgent: "vitest" };

  it("login y verifyChallenge llaman al servicio dentro de comoPlataforma", async () => {
    const vistos: Array<ContextoDatos | undefined> = [];
    const authService: Pick<IAuthService, "login" | "verifyChallenge"> = {
      login: vi.fn(async () => {
        vistos.push(contextoActual());
        return { status: "invalid_credentials" as const };
      }),
      verifyChallenge: vi.fn(async () => {
        vistos.push(contextoActual());
        return { status: "invalid_or_expired" as const };
      }),
    };

    await login(
      { email: "ana@example.com", password: "clave123" },
      { authService, getContext: async () => CONTEXTO, setCookie: async () => {} },
    );
    await verifyChallenge(
      { challengeId: "00000000-0000-4000-8000-000000000000", code: "123456" },
      { authService, getContext: async () => CONTEXTO, setCookie: async () => {} },
    );

    expect(authService.login).toHaveBeenCalledTimes(1);
    expect(authService.verifyChallenge).toHaveBeenCalledTimes(1);
    expect(vistos).toEqual([LOGIN, LOGIN]);
  });

  it("los tres pasos de recuperacion llaman al servicio dentro de comoPlataforma", async () => {
    const vistos: Array<ContextoDatos | undefined> = [];
    const service: IPasswordResetService = {
      solicitar: vi.fn(async () => {
        vistos.push(contextoActual());
        return { status: "ok" as const };
      }),
      verificarCodigo: vi.fn(async () => {
        vistos.push(contextoActual());
        return { status: "invalid_or_expired" as const };
      }),
      restablecer: vi.fn(async () => {
        vistos.push(contextoActual());
        return { status: "invalid_or_expired" as const };
      }),
    };
    const deps = { service, getContext: async () => CONTEXTO };

    await solicitarRecuperacion({ email: "ana@example.com" }, deps);
    await verificarCodigoRecuperacion({ email: "ana@example.com", code: "123456" }, deps);
    await restablecerContrasena(
      { email: "ana@example.com", code: "123456", password: "Clave-Fuerte-2026!", confirmPassword: "Clave-Fuerte-2026!" },
      deps,
    );

    expect(vistos).toEqual([LOGIN, LOGIN, LOGIN]);
  });
});
