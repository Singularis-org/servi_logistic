import { describe, it, expect, vi, afterEach } from "vitest";
import type {
  EmailMessage,
  EmailSendResult,
  IEmailSender,
} from "@/lib/interfaces/external/IEmailSender";
import { EmailNotificacionProvider, crearEmailSender } from "@/lib/services/EmailProvider";
import { ConsoleEmailSender } from "@/lib/services/email/ConsoleEmailSender";
import { NodemailerEmailSender } from "@/lib/services/email/NodemailerEmailSender";
import { plantillaOtpCodigo } from "@/lib/services/email/plantillas/otp-codigo";

// Feature 80 — la capa de notificaciones por correo: plantilla pura, un caso de
// uso (OTP) que compone y delega, y la seleccion de transporte por entorno.

const CODIGO = "045912";

class SenderEspia implements IEmailSender {
  public enviados: EmailMessage[] = [];
  async enviar(mensaje: EmailMessage): Promise<EmailSendResult> {
    this.enviados.push(mensaje);
    return { messageId: "id-de-prueba" };
  }
}

describe("plantillaOtpCodigo", () => {
  it("lleva el codigo y la expiracion en el cuerpo de texto plano", () => {
    const mensaje = plantillaOtpCodigo({
      to: "ana@example.com",
      code: CODIGO,
      expiresInMinutes: 10,
    });
    expect(mensaje.to).toBe("ana@example.com");
    expect(mensaje.text).toContain(CODIGO);
    expect(mensaje.text).toContain("10 minutos");
  });

  it("siempre trae texto plano, aunque haya HTML", () => {
    const mensaje = plantillaOtpCodigo({ to: "ana@example.com", code: CODIGO, expiresInMinutes: 5 });
    expect(mensaje.text.trim().length).toBeGreaterThan(0);
    expect(mensaje.html).toContain(CODIGO);
  });

  it("escapa el codigo al interpolarlo en el HTML", () => {
    const mensaje = plantillaOtpCodigo({
      to: "ana@example.com",
      code: "<script>x</script>",
      expiresInMinutes: 5,
    });
    expect(mensaje.html).not.toContain("<script>");
    expect(mensaje.html).toContain("&lt;script&gt;");
  });

  it("SL-15 (R2, R19) — el correo de acceso lo firma la plataforma", () => {
    const mensaje = plantillaOtpCodigo({ to: "ana@example.com", code: CODIGO, expiresInMinutes: 5 });
    expect(mensaje.text).toContain("Tu codigo de verificacion de Servi Logistic es:");
    expect(mensaje.html).toContain("<p>Tu codigo de verificacion de Servi Logistic es:</p>");
  });
});

describe("EmailNotificacionProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("entrega al transporte el mensaje renderizado con el codigo", async () => {
    const sender = new SenderEspia();
    await new EmailNotificacionProvider(sender).sendOtpCode({
      to: "ana@example.com",
      code: CODIGO,
      expiresInMinutes: 10,
    });
    expect(sender.enviados).toHaveLength(1);
    expect(sender.enviados[0].to).toBe("ana@example.com");
    expect(sender.enviados[0].text).toContain(CODIGO);
  });

  it("no escribe el codigo en el log: solo destinatario y expiracion", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await new EmailNotificacionProvider(new SenderEspia()).sendOtpCode({
      to: "ana@example.com",
      code: CODIGO,
      expiresInMinutes: 10,
    });
    const escrito = [...info.mock.calls, ...log.mock.calls].flat().join(" ");
    expect(escrito).toContain("ana@example.com");
    expect(escrito).not.toContain(CODIGO);
  });

  it("propaga el fallo del transporte en vez de tragarselo", async () => {
    const sender: IEmailSender = {
      enviar: vi.fn().mockRejectedValue(new Error("smtp caido")),
    };
    await expect(
      new EmailNotificacionProvider(sender).sendOtpCode({
        to: "ana@example.com",
        code: CODIGO,
        expiresInMinutes: 10,
      }),
    ).rejects.toThrow("smtp caido");
  });
});

describe("ConsoleEmailSender", () => {
  const ORIG = process.env.AUTH_OTP_DEBUG_LOG;
  afterEach(() => {
    if (ORIG === undefined) delete process.env.AUTH_OTP_DEBUG_LOG;
    else process.env.AUTH_OTP_DEBUG_LOG = ORIG;
    vi.restoreAllMocks();
  });

  const mensaje: EmailMessage = {
    to: "ana@example.com",
    subject: "asunto",
    text: `codigo ${CODIGO}`,
  };

  it("sin el flag de debug no imprime el cuerpo, solo metadata", async () => {
    delete process.env.AUTH_OTP_DEBUG_LOG;
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resultado = await new ConsoleEmailSender().enviar(mensaje);
    expect(resultado.messageId).toBeNull();
    expect(info.mock.calls.flat().join(" ")).toContain("ana@example.com");
    expect([...info.mock.calls, ...warn.mock.calls].flat().join(" ")).not.toContain(CODIGO);
  });

  it("con AUTH_OTP_DEBUG_LOG=1 vuelca el cuerpo para poder probar en local", async () => {
    process.env.AUTH_OTP_DEBUG_LOG = "1";
    vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await new ConsoleEmailSender().enviar(mensaje);
    expect(warn.mock.calls.flat().join(" ")).toContain(CODIGO);
  });

  // SL-32 (review m4) — con el correo REAL de la plantilla, no con uno sintetico: el codigo se
  // fugaba por el asunto, que la consola registra siempre.
  const otpReal = () => plantillaOtpCodigo({ to: "ana@example.com", code: CODIGO, expiresInMinutes: 10 });
  const todoLoEscrito = (...espias: { mock: { calls: unknown[][] } }[]) =>
    espias.flatMap((e) => e.mock.calls.flat()).join(" ");

  it("SL-32 m4 — el asunto de la plantilla OTP no lleva el codigo; el cuerpo, en texto y html, si", () => {
    const m = otpReal();
    expect(m.subject).not.toContain(CODIGO);
    expect(m.subject).toBe("Tu codigo de verificacion de Servi Logistic");
    expect(m.text).toContain(CODIGO);
    expect(m.html).toContain(CODIGO);
  });

  it("SL-32 m4 — sin AUTH_OTP_DEBUG_LOG, la consola no escribe el codigo del OTP real por ningun canal", async () => {
    delete process.env.AUTH_OTP_DEBUG_LOG;
    const espias = (["info", "warn", "log", "error", "debug"] as const).map((n) =>
      vi.spyOn(console, n).mockImplementation(() => {}),
    );
    await new ConsoleEmailSender().enviar(otpReal());
    expect(todoLoEscrito(...espias)).toContain("ana@example.com");
    expect(todoLoEscrito(...espias)).not.toContain(CODIGO);
  });

  it("SL-32 m4 — con AUTH_OTP_DEBUG_LOG=1, una sola linea con destinatario y codigo, y el asunto sigue sin el", async () => {
    process.env.AUTH_OTP_DEBUG_LOG = "1";
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await new ConsoleEmailSender().enviar(otpReal());
    expect(todoLoEscrito(info)).not.toContain(CODIGO);
    expect(warn.mock.calls).toHaveLength(1);
    const linea = String(warn.mock.calls[0][0]);
    expect(linea).not.toContain("\n");
    // El formato que leen los E2E (bitacora SL-32, «Review vuelta 1 — B1 y m4»): es contrato.
    expect(linea).toMatch(new RegExp(`^\\[email\\]\\[debug\\] to=ana@example\\.com cuerpo="[^"]*\\\\n${CODIGO}\\\\n`));
  });
});

describe("crearEmailSender", () => {
  const ORIG = { user: process.env.SMTP_USER, password: process.env.SMTP_PASSWORD };
  afterEach(() => {
    if (ORIG.user === undefined) delete process.env.SMTP_USER;
    else process.env.SMTP_USER = ORIG.user;
    if (ORIG.password === undefined) delete process.env.SMTP_PASSWORD;
    else process.env.SMTP_PASSWORD = ORIG.password;
  });

  it("sin credencial de Google devuelve el emisor de consola", () => {
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASSWORD;
    expect(crearEmailSender()).toBeInstanceOf(ConsoleEmailSender);
  });

  it("con credencial de Google devuelve el emisor de nodemailer", () => {
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    expect(crearEmailSender()).toBeInstanceOf(NodemailerEmailSender);
  });
});
