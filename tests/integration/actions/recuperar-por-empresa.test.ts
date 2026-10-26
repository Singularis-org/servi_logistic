import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";

import * as accionesRecuperacion from "@/lib/actions/password-reset";
import {
  crearContrasenaConEnlace,
  restablecerContrasena,
  solicitarRecuperacion,
  verificarCodigoRecuperacion,
} from "@/lib/actions/password-reset";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { SendOtpCodeParams } from "@/lib/interfaces/external/IEmailProvider";
import type { EmailMessage } from "@/lib/interfaces/external/IEmailSender";
import { EmailOtpChallengeRepository } from "@/lib/repositories/EmailOtpChallengeRepository";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { OtpChallengeIssuer } from "@/lib/services/OtpChallengeIssuer";
import { PasswordResetService } from "@/lib/services/PasswordResetService";
import { hashPassword, verifyPassword } from "@/lib/utils/password";
import { datosDeOrganizacionDePrueba } from "../../fabricas/organizaciones";
import { HAY_BASE_DE_DATOS, bajoLockDeEscrituraReal, crearPrismaDeTest } from "../db/_postgres-real";

// SL-18 T3.3 (design §4) — «recuperar contraseña» con el MISMO email y la MISMA contraseña en dos
// empresas, contra Postgres real, por las Server Actions:
//   R18: el enlace de B cambia solo la contraseña de B; la de A sigue entrando con la vieja.
//   R20: los pasos «verificar código» y «restablecer con código» ya no cambian nada, ni con un
//        desafío real activo, y el servicio ya no los tiene.
//
// Todo es real (repositorios sobre `getPrismaClient()`, el cliente extendido de la app, dentro del
// `comoPlataforma` de cada action) salvo el transporte del correo, que aquí se captura para leer los
// enlaces. Los datos se commitean con un sufijo único y se borran en el `afterAll`, bajo el lock.

const describeSiHayBase = HAY_BASE_DE_DATOS ? describe : describe.skip;

const RUN = randomUUID().replace(/-/g, "").slice(0, 10);
const EMAIL = `sl18-recuperar-${RUN}@ejemplo.test`;
const VIEJA = `Vieja-${RUN}-Clave!1`;
const NUEVA = `Nueva-${RUN}-Clave!2`;
const CTX = { ipAddress: "10.18.3.1", userAgent: `vitest-sl18-recuperar-${RUN}` };

let base: PrismaClient;
let orgA = "";
let orgB = "";
const ids = { a: "", b: "" };

const enviados: EmailMessage[] = [];

function servicio(): PasswordResetService {
  const prisma = getPrismaClient();
  return new PasswordResetService(new UserRepository(prisma), new EmailOtpChallengeRepository(prisma), {
    sender: {
      enviar: async (m) => {
        enviados.push(m);
        return { messageId: null };
      },
    },
    baseUrl: "https://app.example.test",
  });
}

const deps = () => ({ service: servicio(), getContext: async () => CTX });

async function hashDe(usuarioId: string): Promise<string> {
  return (await base.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { passwordHash: true } }))
    .passwordHash;
}

describeSiHayBase("SL-18 — recuperar contraseña con el email en dos empresas (Server Actions, Postgres)", () => {
  beforeAll(async () => {
    base = crearPrismaDeTest();
    const passwordHash = await hashPassword(VIEJA);

    await bajoLockDeEscrituraReal(async () => {
      [orgA, orgB] = await Promise.all(
        [datosDeOrganizacionDePrueba(`A ${RUN}`), datosDeOrganizacionDePrueba(`B ${RUN}`)].map(
          async (d) => (await base.organizacion.create({ data: d, select: { id: true } })).id,
        ),
      );
      const rolMaestro = (await base.rol.findFirstOrThrow({ where: { value: "maestro" } })).id;
      const tipoCedula = (await base.tipoIdentificacion.findFirstOrThrow({ where: { value: "cedula" } })).id;
      const crear = async (organizacionId: string, tag: string) =>
        (
          await base.usuario.create({
            data: {
              nombre: `Persona ${tag} ${RUN}`,
              email: EMAIL,
              telefono: "88887777",
              cedula: `sl18-recuperar-${tag}-${RUN}`,
              tipoIdentificacionId: tipoCedula,
              rolId: rolMaestro,
              passwordHash,
              estado: "activo",
              organizacionId,
            },
            select: { id: true },
          })
        ).id;
      ids.a = await crear(orgA, "a");
      ids.b = await crear(orgB, "b");
    });
  }, 120_000);

  afterAll(async () => {
    if (!base) return;
    const uids = Object.values(ids).filter(Boolean);
    await bajoLockDeEscrituraReal(async () => {
      await base.emailOtpChallenge.deleteMany({ where: { usuarioId: { in: uids } } });
      await base.usuario.deleteMany({ where: { id: { in: uids } } });
      await base.organizacion.deleteMany({ where: { id: { in: [orgA, orgB].filter(Boolean) } } });
    });
    await base.$disconnect();
    await getPrismaClient().$disconnect();
  }, 120_000);

  it("R20: con un desafío real activo, «verificar código» y «restablecer con código» no cambian ninguna contraseña ni consumen el desafío", async () => {
    // Un código real y vigente para la cuenta de A, emitido por el mismo emisor que el OTP del login.
    const codigos: SendOtpCodeParams[] = [];
    const { challengeId } = await new OtpChallengeIssuer(new EmailOtpChallengeRepository(base), {
      sendOtpCode: async (p) => void codigos.push(p),
    }).emitir({ usuarioId: ids.a, email: EMAIL, deviceHash: "sha-del-navegador", ipAddress: CTX.ipAddress });
    expect(codigos).toHaveLength(1);
    const code = codigos[0].code;

    const verificado = await verificarCodigoRecuperacion({ email: EMAIL, code }, deps());
    const restablecido = await restablecerContrasena(
      { email: EMAIL, code, password: NUEVA, confirmPassword: NUEVA },
      deps(),
    );

    expect(verificado).toEqual({ status: "invalid_or_expired" });
    expect(restablecido).toEqual({ status: "invalid_or_expired" });
    expect(await verifyPassword(VIEJA, await hashDe(ids.a))).toBe(true);
    expect(await verifyPassword(VIEJA, await hashDe(ids.b))).toBe(true);
    const desafio = await base.emailOtpChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    expect(desafio.consumedAt).toBeNull();

    // Y el servicio ya no tiene los pasos del código.
    const s = servicio() as unknown as Record<string, unknown>;
    expect(s.verificarCodigo).toBeUndefined();
    expect(s.restablecer).toBeUndefined();
    expect(Object.keys(accionesRecuperacion).sort()).toEqual([
      "crearContrasenaConEnlace",
      "restablecerContrasena",
      "solicitarRecuperacion",
      "verificarCodigoRecuperacion",
    ]);
  });

  it("R18: el enlace de B cambia solo la contraseña de B; la de A sigue entrando con la vieja", async () => {
    enviados.length = 0;
    expect(await solicitarRecuperacion({ email: EMAIL }, deps())).toEqual({ status: "ok" });

    expect(enviados).toHaveLength(1);
    const lineas = [...enviados[0].text.matchAll(/^(.+): \S+#enlace=(\S+)$/gm)].map((r) => ({
      empresa: r[1],
      enlace: r[2],
    }));
    expect(lineas.map((l) => l.empresa)).toEqual([`A ${RUN}`, `B ${RUN}`]);
    const enlaceB = lineas.find((l) => l.empresa === `B ${RUN}`)!.enlace;

    // En la base, una fila de recuperación por cuenta, con el hash y no el secreto (R21).
    const filaB = await base.emailOtpChallenge.findUniqueOrThrow({ where: { id: enlaceB.split(".")[0] } });
    expect(filaB.usuarioId).toBe(ids.b);
    expect(filaB.deviceHash).toBe("recuperacion");
    expect(filaB.codeHash).not.toContain(enlaceB.split(".")[1]);

    const r = await crearContrasenaConEnlace({ enlace: enlaceB, password: NUEVA, confirmPassword: NUEVA }, deps());

    expect(r).toEqual({ status: "ok" });
    const [hashA, hashB] = [await hashDe(ids.a), await hashDe(ids.b)];
    expect(await verifyPassword(NUEVA, hashB)).toBe(true);
    expect(await verifyPassword(VIEJA, hashB)).toBe(false);
    expect(await verifyPassword(VIEJA, hashA)).toBe(true);
    expect(await verifyPassword(NUEVA, hashA)).toBe(false);

    // Ya usado: un segundo canje no cambia nada (R19, aquí con la base real).
    const otra = `Otra-${RUN}-Clave!3`;
    expect(
      await crearContrasenaConEnlace({ enlace: enlaceB, password: otra, confirmPassword: otra }, deps()),
    ).toEqual({ status: "invalid_or_expired" });
    expect(await verifyPassword(NUEVA, await hashDe(ids.b))).toBe(true);
  });
});
