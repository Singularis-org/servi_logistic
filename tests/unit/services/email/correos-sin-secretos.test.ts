import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import type { IEmailOtpChallengeRepository } from "@/lib/interfaces/repositories/IEmailOtpChallengeRepository";
import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { EmailNotificacionProvider } from "@/lib/services/EmailProvider";
import { OtpChallengeIssuer } from "@/lib/services/OtpChallengeIssuer";
import { PasswordResetService } from "@/lib/services/PasswordResetService";
import { plantillaBienvenidaMaestro } from "@/lib/services/email/plantillas/bienvenida-maestro";
import { hashPassword } from "@/lib/utils/password";
import { NOMBRE_HEREDADO } from "@/tests/fixtures/nombre-heredado";

// SL-41 (R7, R11, R35) — lo que NO puede llevar ningún correo de la app, comprobado sobre los tres
// mensajes ya renderizados: el OTP del login, el de «recuperar contraseña» y la bienvenida. Los dos
// OTP se capturan en el transporte, al final de su camino real (emisor de OTP y servicio de
// recuperación), y no llamando a la plantilla: así cuenta todo lo que se añada por el camino.

const SMTP_PASSWORD_DE_PRUEBA = "clave-smtp-de-prueba-9f3k2q";
const SECRETO_ENLACE = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE";
const CHALLENGE_ID = "0f8fad5b-d9cb-469f-a165-70867728950e";
const URL_ENLACE = `https://app.example.com/recuperar-contrasena#enlace=${CHALLENGE_ID}.${SECRETO_ENLACE}`;

interface Capturado {
  nombre: string;
  mensaje: EmailMessage;
  /** Lo que no puede aparecer en el asunto de ESTE correo, además de lo común. */
  secretosDelAsunto: string[];
  /** Hashes que no pueden aparecer en ninguna parte del correo (R35). */
  hashes: string[];
}

const capturados: Capturado[] = [];
const ORIG_SMTP_PASSWORD = process.env.SMTP_PASSWORD;

function transporteEspia(destino: EmailMessage[]): IEmailSender {
  return {
    enviar: async (m) => {
      destino.push(m);
      return { messageId: "id" };
    },
  };
}

function otpRepoDoble(codeHashes: string[]): IEmailOtpChallengeRepository {
  return {
    create: vi.fn(async (input) => {
      codeHashes.push(input.codeHash);
      return { ...input, id: "otp-1", consumedAt: null, createdAt: new Date() };
    }),
    findActiveById: vi.fn(),
    markConsumed: vi.fn(),
    consumirSiActivo: vi.fn(),
    findLatestActiveByUsuarioId: vi.fn(),
    contarRecientesPorUsuario: vi.fn().mockResolvedValue(0),
  };
}

const codigoDe = (m: EmailMessage) => /\n(\d{6})\n/.exec(m.text)![1];

beforeAll(async () => {
  // La clave SMTP vive en el entorno del proceso que envía: si alguna plantilla la interpolara, se
  // vería aquí.
  process.env.SMTP_PASSWORD = SMTP_PASSWORD_DE_PRUEBA;
  vi.spyOn(console, "info").mockImplementation(() => {});
  const passwordHashDelUsuario = await hashPassword("Contraseña-Del-Usuario-1!");

  // 1. OTP del login: AuthService llama a `OtpChallengeIssuer.emitir`.
  const login: EmailMessage[] = [];
  const hashesLogin: string[] = [];
  await new OtpChallengeIssuer(otpRepoDoble(hashesLogin), new EmailNotificacionProvider(transporteEspia(login))).emitir({
    usuarioId: "usr-1",
    email: "ana@example.com",
    deviceHash: "hash-device",
    ipAddress: "1.2.3.4",
  });
  capturados.push({
    nombre: "OTP del login",
    mensaje: login[0],
    secretosDelAsunto: [codigoDe(login[0])],
    hashes: [...hashesLogin, passwordHashDelUsuario],
  });

  // 2. OTP de «recuperar contraseña», por `PasswordResetService.solicitar`.
  const recuperacion: EmailMessage[] = [];
  const hashesRecuperacion: string[] = [];
  const otpRepo = otpRepoDoble(hashesRecuperacion);
  await new PasswordResetService(
    {
      findByEmail: vi.fn().mockResolvedValue({ id: "usr-1", email: "ana@example.com", passwordHash: passwordHashDelUsuario }),
      updatePasswordHash: vi.fn(),
    },
    otpRepo,
    new OtpChallengeIssuer(otpRepo, new EmailNotificacionProvider(transporteEspia(recuperacion))),
  ).solicitar({ email: "ana@example.com", deviceHash: "hash-device", ipAddress: "1.2.3.4" });
  capturados.push({
    nombre: "OTP de recuperar contraseña",
    mensaje: recuperacion[0],
    secretosDelAsunto: [codigoDe(recuperacion[0])],
    hashes: [...hashesRecuperacion, passwordHashDelUsuario],
  });

  // 3. Bienvenida: el `code_hash` del desafío es el bcrypt del secreto del enlace (design §5.1).
  capturados.push({
    nombre: "bienvenida del maestro",
    mensaje: plantillaBienvenidaMaestro({
      to: "maestra@empresa.example",
      nombre: "Ana Pérez",
      empresaNombre: "Mensajería Rápida",
      url: URL_ENLACE,
      ttlHoras: 72,
      baseUrl: "https://app.example.com",
      contacto: "soporte@example.com",
    }),
    secretosDelAsunto: [URL_ENLACE, SECRETO_ENLACE, CHALLENGE_ID, "#enlace="],
    hashes: [await hashPassword(SECRETO_ENLACE), passwordHashDelUsuario],
  });
});

afterAll(() => {
  if (ORIG_SMTP_PASSWORD === undefined) delete process.env.SMTP_PASSWORD;
  else process.env.SMTP_PASSWORD = ORIG_SMTP_PASSWORD;
  vi.restoreAllMocks();
});

const partes = (m: EmailMessage) => ({ asunto: m.subject, texto: m.text, html: m.html ?? "" });

describe("correos sin secretos", () => {
  it("se capturaron los tres correos", () => {
    expect(capturados.map((c) => c.nombre)).toEqual([
      "OTP del login",
      "OTP de recuperar contraseña",
      "bienvenida del maestro",
    ]);
    for (const c of capturados) expect(c.mensaje.html?.length ?? 0).toBeGreaterThan(0);
  });

  it("R7 — ningún correo nombra la app de origen, en ninguna capitalización", () => {
    const prohibidos = [NOMBRE_HEREDADO.minusculas, NOMBRE_HEREDADO.prefijoLlave];
    for (const c of capturados) {
      for (const [parte, valor] of Object.entries(partes(c.mensaje))) {
        for (const p of prohibidos) {
          expect(valor.toLowerCase().includes(p), `${c.nombre}, ${parte}`).toBe(false);
        }
      }
    }
  });

  it("R11 — ningún asunto lleva un código, un enlace, un secreto de enlace ni una contraseña", () => {
    for (const c of capturados) {
      const asunto = c.mensaje.subject;
      expect(asunto, c.nombre).not.toMatch(/\d{6}/);
      expect(asunto, c.nombre).not.toMatch(/https?:|www\.|\/\//i);
      expect(asunto.toLowerCase(), c.nombre).not.toContain("contraseña");
      expect(asunto, c.nombre).not.toContain(SMTP_PASSWORD_DE_PRUEBA);
      for (const s of c.secretosDelAsunto) expect(asunto, c.nombre).not.toContain(s);
    }
  });

  it("R11 — el código y el enlace SÍ van en el cuerpo: la ausencia en el asunto no es por vacío", () => {
    for (const c of capturados) {
      for (const s of c.secretosDelAsunto) expect(c.mensaje.text, c.nombre).toContain(s);
    }
  });

  it("R35 — ningún correo lleva la contraseña SMTP del entorno", () => {
    for (const c of capturados) {
      for (const [parte, valor] of Object.entries(partes(c.mensaje))) {
        expect(valor.includes(SMTP_PASSWORD_DE_PRUEBA), `${c.nombre}, ${parte}`).toBe(false);
      }
    }
  });

  it("R35 — ningún correo lleva el hash de la contraseña ni el del código o el secreto", () => {
    for (const c of capturados) {
      expect(c.hashes.length).toBeGreaterThan(0);
      for (const [parte, valor] of Object.entries(partes(c.mensaje))) {
        for (const h of c.hashes) expect(valor.includes(h), `${c.nombre}, ${parte}`).toBe(false);
        // Cualquier bcrypt, no solo los conocidos: un hash nunca tiene por qué salir en un correo.
        expect(valor, `${c.nombre}, ${parte}`).not.toMatch(/\$2[aby]\$\d{2}\$/);
      }
    }
  });
});
