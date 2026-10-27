import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import { EnrutadorEmailSender, esDestinoReservado } from "@/lib/services/email/EnrutadorEmailSender";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { ConsoleEmailSender } from "@/lib/services/email/ConsoleEmailSender";
import { NodemailerEmailSender } from "@/lib/services/email/NodemailerEmailSender";

// SL-43 — Con SMTP configurado (preview/dev), los usuarios demo `*@example.test` no veian su OTP:
// el correo salia por nodemailer (y rebotaba) en vez de por la consola. Los destinatarios de TLD
// reservados (RFC 2606 / 6761) van SIEMPRE a consola. Sin red: dobles de IEmailSender, y en la
// composicion los prototipos espiados con credenciales FALSAS.

function mensaje(to: string): EmailMessage {
  return { to, subject: "Asunto", text: "Cuerpo" };
}

function dobles() {
  const smtp: IEmailSender = { enviar: vi.fn(async () => ({ messageId: "smtp-1" })) };
  const consola: IEmailSender = { enviar: vi.fn(async () => ({ messageId: null })) };
  return { smtp, consola, enrutador: new EnrutadorEmailSender(smtp, consola) };
}

describe("EnrutadorEmailSender — reservados a consola", () => {
  it.each([
    "demo@example.test",
    "A@EXAMPLE.TEST",
    "a@x.example.test",
    "a@algo.invalid",
    "a@algo.example",
    "a@algo.localhost",
    "a@test",
    "a@localhost",
    "  a@example.test.  ",
  ])("%s va a consola y nunca al SMTP", async (to) => {
    const { smtp, consola, enrutador } = dobles();
    const resultado = await enrutador.enviar(mensaje(to));
    expect(consola.enviar).toHaveBeenCalledTimes(1);
    expect(consola.enviar).toHaveBeenCalledWith(mensaje(to));
    expect(smtp.enviar).not.toHaveBeenCalled();
    expect(resultado).toEqual({ messageId: null });
  });
});

describe("EnrutadorEmailSender — dominios normales al SMTP", () => {
  it.each(["usuario@empresa.example.net", "foo@testing.example.com", "a@test.example.org", "a@mytest", "a@example.com"])(
    "%s va al SMTP y nunca a consola",
    async (to) => {
      const { smtp, consola, enrutador } = dobles();
      const resultado = await enrutador.enviar(mensaje(to));
      expect(smtp.enviar).toHaveBeenCalledTimes(1);
      expect(smtp.enviar).toHaveBeenCalledWith(mensaje(to));
      expect(consola.enviar).not.toHaveBeenCalled();
      expect(resultado).toEqual({ messageId: "smtp-1" });
    },
  );
});

describe("esDestinoReservado", () => {
  it("una lista con algun reservado se considera reservada: ninguno sale por SMTP", () => {
    expect(esDestinoReservado("real@empresa.example.com, demo@example.test")).toBe(true);
    expect(esDestinoReservado("demo@example.test; real@empresa.example.com")).toBe(true);
    expect(esDestinoReservado("real@empresa.example.com; otro@empresa.example.org")).toBe(false);
  });
});

describe("crearEmailSender con SMTP configurado enruta por destinatario", () => {
  const VARIABLES = ["SMTP_USER", "SMTP_PASSWORD"] as const;
  const original: Partial<Record<(typeof VARIABLES)[number], string | undefined>> = {};

  beforeEach(() => {
    for (const v of VARIABLES) original[v] = process.env[v];
    process.env.SMTP_USER = "usuario-falso@example.test";
    process.env.SMTP_PASSWORD = "credencial-falsa-de-test";
  });

  afterEach(() => {
    for (const v of VARIABLES) {
      if (original[v] === undefined) delete process.env[v];
      else process.env[v] = original[v];
    }
    vi.restoreAllMocks();
  });

  it("un `.test` termina en ConsoleEmailSender y no en nodemailer", async () => {
    const consola = vi.spyOn(ConsoleEmailSender.prototype, "enviar").mockResolvedValue({ messageId: null });
    const smtp = vi.spyOn(NodemailerEmailSender.prototype, "enviar").mockResolvedValue({ messageId: "x" });

    await crearEmailSender().enviar(mensaje("maestro@example.test"));

    expect(consola).toHaveBeenCalledTimes(1);
    expect(smtp).not.toHaveBeenCalled();
  });

  it("un dominio normal termina en nodemailer y no en consola", async () => {
    const consola = vi.spyOn(ConsoleEmailSender.prototype, "enviar").mockResolvedValue({ messageId: null });
    const smtp = vi.spyOn(NodemailerEmailSender.prototype, "enviar").mockResolvedValue({ messageId: "x" });

    await crearEmailSender().enviar(mensaje("maestro@empresa.example.com"));

    expect(smtp).toHaveBeenCalledTimes(1);
    expect(consola).not.toHaveBeenCalled();
  });
});
