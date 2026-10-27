import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import { login, verifyChallenge } from "@/lib/actions/auth";
import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { SESSION_COOKIE_NAME } from "@/lib/constants/auth";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IEmailProvider, SendOtpCodeParams } from "@/lib/interfaces/external/IEmailProvider";
import type { IAuthService } from "@/lib/interfaces/services/IAuthService";
import { EmailOtpChallengeRepository } from "@/lib/repositories/EmailOtpChallengeRepository";
import { LoginAttemptRepository } from "@/lib/repositories/LoginAttemptRepository";
import { SessionRepository } from "@/lib/repositories/SessionRepository";
import { TrustedDeviceRepository } from "@/lib/repositories/TrustedDeviceRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { AuthService } from "@/lib/services/AuthService";
import { RiskEngine } from "@/lib/services/RiskEngine";
import { computeDeviceHash } from "@/lib/utils/device";
import { hashPassword } from "@/lib/utils/password";
import { datosDeOrganizacionDePrueba } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "../db/_postgres-real";

// SL-18 T2.3 (design §3.2-§3.4) — la Server Action `login` con el MISMO email y la MISMA contrasena
// en dos empresas, contra Postgres real: R7, R11, R13 y R14.
//
// Todo es real salvo dos bordes: la cookie (`next/headers`, que fuera de una peticion no existe) y el
// envio del correo del OTP, que aqui se captura para leer el codigo. El servicio se arma con los
// repositorios reales sobre `getPrismaClient()`, el cliente EXTENDIDO de la app, cuyo resolutor de
// empresa es `empresaDeLaPeticion()`: asi R13 mide la cadena de produccion, cookie → sesion →
// `usuario.organizacion_id` → filtro de la extension.
//
// Los datos se commitean con un sufijo unico (la action abre sus propias transacciones por el pool de
// la app, no cabe en una transaccion revertida) y se borran en el `afterAll`, bajo el lock de la 227.

// La cookie de sesion del navegador de este test. `vi.hoisted` porque `vi.mock` se iza por encima de
// los imports y su fabrica la lee.
const navegador = vi.hoisted(() => ({ sesion: undefined as string | undefined }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (nombre: string) =>
      nombre === SESSION_COOKIE_NAME && navegador.sesion !== undefined
        ? { name: nombre, value: navegador.sesion }
        : undefined,
  }),
  headers: async () => new Headers(),
}));

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const EMAIL = `sl18-login-${RUN}@ejemplo.test`;
const CLAVE = `clave-${RUN}`;

// Con este dispositivo y esta IP la cuenta de B es conocida (riesgo bajo → sesion directa); con los
// otros, el riesgo es alto (dispositivo + IP nuevos = 70 ≥ 50) y se pide OTP.
const CONOCIDO = { ipAddress: `10.18.0.1`, userAgent: `vitest-sl18-conocido-${RUN}` };
const NUEVO = { ipAddress: `10.18.0.2`, userAgent: `vitest-sl18-nuevo-${RUN}` };

let base: PrismaClient;
let orgA = "";
let orgB = "";
const ids = { a: "", b: "", otroA: "", otroB: "" };

const codigos: SendOtpCodeParams[] = [];
const emailProvider: IEmailProvider = {
  sendOtpCode: async (p) => {
    codigos.push(p);
  },
};

function servicio(): IAuthService {
  const prisma = getPrismaClient();
  const intentos = new LoginAttemptRepository(prisma);
  const dispositivos = new TrustedDeviceRepository(prisma);
  return new AuthService(
    new UserRepository(prisma),
    intentos,
    dispositivos,
    new EmailOtpChallengeRepository(prisma),
    new SessionRepository(prisma),
    new RiskEngine(intentos, dispositivos),
    emailProvider,
  );
}

/** La action con el servicio real; devuelve tambien la cookie que habria puesto. */
async function entrar(input: Record<string, unknown>, ctx: typeof CONOCIDO) {
  const cookies: string[] = [];
  const r = await login(input, {
    authService: servicio(),
    getContext: async () => ctx,
    setCookie: async (sessionId) => {
      cookies.push(sessionId);
    },
  });
  return { r, cookies };
}

describeSiHayBase("SL-18 — login con el email en dos empresas (Server Action, Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    const passwordHash = await hashPassword(CLAVE);

    await bajoLockDeEscrituraReal(async () => {
      [orgA, orgB] = await Promise.all(
        [datosDeOrganizacionDePrueba(`A ${RUN}`), datosDeOrganizacionDePrueba(`B ${RUN}`)].map(
          async (d) => (await base.organizacion.create({ data: d, select: { id: true } })).id,
        ),
      );
      const rolMaestro = (await base.rol.findFirstOrThrow({ where: { value: "maestro" } })).id;
      const tipoCedula = (await base.tipoIdentificacion.findFirstOrThrow({ where: { value: "cedula" } })).id;
      const crear = async (organizacionId: string, tag: string, email: string) =>
        (
          await base.usuario.create({
            data: {
              nombre: `Persona ${tag} ${RUN}`,
              email,
              telefono: "88887777",
              cedula: `sl18-login-${tag}-${RUN}`,
              tipoIdentificacionId: tipoCedula,
              rolId: rolMaestro,
              passwordHash,
              estado: "activo",
              organizacionId,
            },
            select: { id: true },
          })
        ).id;

      ids.a = await crear(orgA, "a", EMAIL);
      ids.b = await crear(orgB, "b", EMAIL);
      ids.otroA = await crear(orgA, "otro-a", `sl18-login-otro-a-${RUN}@ejemplo.test`);
      ids.otroB = await crear(orgB, "otro-b", `sl18-login-otro-b-${RUN}@ejemplo.test`);

      // La cuenta de B ya entro antes desde CONOCIDO: dispositivo confiado e IP con un exito.
      await base.trustedDevice.create({
        data: { usuarioId: ids.b, deviceHash: computeDeviceHash(CONOCIDO.userAgent), ipAddress: CONOCIDO.ipAddress },
      });
      await base.loginAttempt.create({
        data: {
          usuarioId: ids.b,
          emailUsado: EMAIL,
          exitoso: true,
          ipAddress: CONOCIDO.ipAddress,
          userAgent: CONOCIDO.userAgent,
          riskScore: 0,
          riskReason: "siembra",
        },
      });
    });
  }, 120_000);

  afterAll(async () => {
    navegador.sesion = undefined;
    if (!base) return;
    const uids = Object.values(ids).filter(Boolean);
    await bajoLockDeEscrituraReal(async () => {
      await base.session.deleteMany({ where: { userId: { in: uids } } });
      await base.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: uids } } });
      await base.trustedDevice.deleteMany({ where: { usuarioId: { in: uids } } });
      await base.loginAttempt.deleteMany({ where: { OR: [{ usuarioId: { in: uids } }, { emailUsado: EMAIL }] } });
      await base.usuario.deleteMany({ where: { id: { in: uids } } });
      await base.organizacion.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    });
    await base.$disconnect();
    await getPrismaClient().$disconnect();
  }, 120_000);

  it("R7: sin elegir, la respuesta es elegir_empresa con A y B por nombre, y no se escribe nada", async () => {
    const { r, cookies } = await entrar({ email: EMAIL, password: CLAVE }, NUEVO);

    expect(r).toEqual({
      status: "elegir_empresa",
      empresas: [
        { organizacionId: orgA, nombre: `A ${RUN}` },
        { organizacionId: orgB, nombre: `B ${RUN}` },
      ],
    });
    expect(cookies).toEqual([]);
    expect(codigos).toEqual([]);
    const cuentas = [ids.a, ids.b];
    expect(await base.session.count({ where: { userId: { in: cuentas } } })).toBe(0);
    expect(await base.emailOtpChallenge.count({ where: { usuarioId: { in: cuentas } } })).toBe(0);
    // Solo el exito sembrado; el paso de eleccion no registra intento ni confia dispositivo.
    expect(await base.loginAttempt.count({ where: { emailUsado: EMAIL } })).toBe(1);
    expect(await base.trustedDevice.count({ where: { usuarioId: { in: cuentas } } })).toBe(1);
  });

  it("R11: con B elegida, la cookie es de una sesion de la cuenta de B; con una empresa sin cuenta del email, invalid_credentials", async () => {
    const { r, cookies } = await entrar({ email: EMAIL, password: CLAVE, organizacionId: orgB }, CONOCIDO);

    expect(r).toEqual({ status: "ok" });
    expect(cookies).toHaveLength(1);
    const sesion = await base.session.findUniqueOrThrow({ where: { id: cookies[0] } });
    expect(sesion.userId).toBe(ids.b);

    const ajena = await entrar({ email: EMAIL, password: CLAVE, organizacionId: randomUUID() }, CONOCIDO);
    expect(ajena).toEqual({ r: { status: "invalid_credentials" }, cookies: [] });

    navegador.sesion = cookies[0];
  });

  it("R13: con la cookie de esa sesion, empresaDeLaPeticion() es B y el listado de usuarios no trae los de A", async () => {
    expect(navegador.sesion).toBeDefined();

    expect(await empresaDeLaPeticion()).toBe(orgB);

    // Sin `conEmpresa` ni `comoPlataforma`: la empresa la pone la extension desde la cookie, como en
    // cualquier pagina de la app.
    const vistos = await getPrismaClient().usuario.findMany({
      where: { email: { contains: RUN } },
      select: { id: true },
    });
    expect(new Set(vistos.map((u) => u.id))).toEqual(new Set([ids.b, ids.otroB]));
    // Control: los de A existen, pero en A.
    expect(await base.usuario.count({ where: { id: { in: [ids.a, ids.otroA] }, organizacionId: orgA } })).toBe(2);
  });

  it("R14: con riesgo alto y B elegida, el OTP del desafio abre la sesion de la cuenta de B, no la de A", async () => {
    navegador.sesion = undefined;
    const { r, cookies } = await entrar({ email: EMAIL, password: CLAVE, organizacionId: orgB }, NUEVO);

    expect(r.status).toBe("challenge_required");
    if (r.status !== "challenge_required") return;
    expect(cookies).toEqual([]);
    const desafio = await base.emailOtpChallenge.findUniqueOrThrow({ where: { id: r.challengeId } });
    expect(desafio.usuarioId).toBe(ids.b);
    expect(codigos).toHaveLength(1);
    expect(codigos[0].to).toBe(EMAIL);

    const abiertas: string[] = [];
    const v = await verifyChallenge(
      { challengeId: r.challengeId, code: codigos[0].code },
      { authService: servicio(), getContext: async () => NUEVO, setCookie: async (id) => void abiertas.push(id) },
    );

    expect(v).toEqual({ status: "ok" });
    expect(abiertas).toHaveLength(1);
    const sesion = await base.session.findUniqueOrThrow({ where: { id: abiertas[0] } });
    expect(sesion.userId).toBe(ids.b);
    expect(await base.session.count({ where: { userId: ids.a } })).toBe(0);
  });
});
