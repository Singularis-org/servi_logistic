import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, it, expect, afterEach } from "vitest";
import {
  loadEmailConfig,
  emailContacto,
  emailSmtpConfigurado,
  otpDebugLogHabilitado,
  EmailNoConfiguradoError,
} from "@/lib/config/email";

// Feature 80 — la config SMTP se lee en un unico sitio, decide por si sola si
// hay envio real y, si falta una pieza, cita el NOMBRE de la variable, jamas su
// valor (mismo invariante que lib/config/whatsapp.ts).

const VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASSWORD",
  "SMTP_FROM",
  "SMTP_FROM_NAME",
  "SMTP_TIMEOUT_MS",
  "SMTP_TLS_REJECT_UNAUTHORIZED",
  "AUTH_OTP_DEBUG_LOG",
  "VERCEL_ENV",
  "EMAIL_CONTACTO",
] as const;

const ORIG = new Map(VARS.map((v) => [v, process.env[v]]));

afterEach(() => {
  for (const v of VARS) {
    const original = ORIG.get(v);
    if (original === undefined) delete process.env[v];
    else process.env[v] = original;
  }
});

function limpiar() {
  for (const v of VARS) delete process.env[v];
}

describe("emailSmtpConfigurado", () => {
  it("es false sin credencial, para que el flujo degrade en dev", () => {
    limpiar();
    expect(emailSmtpConfigurado()).toBe(false);
  });

  it("sigue siendo false con usuario pero sin clave SMTP", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    expect(emailSmtpConfigurado()).toBe(false);
  });

  it("es true con usuario y contrasena, sin necesidad de declarar el host", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcd efgh ijkl mnop";
    expect(emailSmtpConfigurado()).toBe(true);
  });

  it("trata el valor vacio como ausente", () => {
    limpiar();
    process.env.SMTP_USER = "   ";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    expect(emailSmtpConfigurado()).toBe(false);
  });
});

describe("loadEmailConfig", () => {
  it("lanza citando el nombre de la variable ausente, no su valor", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    try {
      loadEmailConfig();
      expect.unreachable("deberia haber lanzado");
    } catch (error) {
      expect(error).toBeInstanceOf(EmailNoConfiguradoError);
      expect((error as Error).message).toContain("SMTP_PASSWORD");
      expect((error as Error).message).not.toContain("no-reply@example.com");
    }
  });

  it("nunca filtra la contrasena en el mensaje de error", () => {
    limpiar();
    process.env.SMTP_PASSWORD = "s3cr3t0-que-no-debe-salir";
    try {
      loadEmailConfig();
      expect.unreachable("deberia haber lanzado por falta de SMTP_USER");
    } catch (error) {
      expect((error as Error).message).toContain("SMTP_USER");
      expect((error as Error).message).not.toContain("s3cr3t0-que-no-debe-salir");
    }
  });

  it("SL-41 R36 — sin SMTP_HOST asume el relay de Brevo, el puerto 587 y STARTTLS", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    const config = loadEmailConfig();
    expect(config.host).toBe("smtp-relay.brevo.com");
    expect(config.port).toBe(587);
    expect(config.secure).toBe(false);
    expect(config.rejectUnauthorized).toBe(true);
    expect(config.fromName).toBe("Servi Logistic");
  });

  it("usa la cuenta autenticada como remitente cuando no se declara SMTP_FROM", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    expect(loadEmailConfig().from).toBe("no-reply@example.com");
  });

  it("respeta SMTP_FROM explicito para el caso del alias verificado", () => {
    limpiar();
    process.env.SMTP_USER = "bot@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    process.env.SMTP_FROM = "hola@example.com";
    expect(loadEmailConfig().from).toBe("hola@example.com");
  });

  it("quita los espacios que arrastra una clave SMTP pegada", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcd efgh ijkl mnop";
    expect(loadEmailConfig().password).toBe("abcdefghijklmnop");
  });

  it("permite mudarse de proveedor sobreescribiendo el host", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    process.env.SMTP_HOST = "smtp.example.com";
    expect(loadEmailConfig().host).toBe("smtp.example.com");
  });

  it("deriva secure=true del puerto 465 sin necesidad de SMTP_SECURE", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    process.env.SMTP_PORT = "465";
    expect(loadEmailConfig().secure).toBe(true);
  });

  it("respeta SMTP_SECURE explicito por encima del puerto", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    process.env.SMTP_PORT = "465";
    process.env.SMTP_SECURE = "false";
    expect(loadEmailConfig().secure).toBe(false);
  });

  it("solo desactiva la validacion del certificado con un 0 explicito", () => {
    limpiar();
    process.env.SMTP_USER = "no-reply@example.com";
    process.env.SMTP_PASSWORD = "abcdefghijklmnop";
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "0";
    expect(loadEmailConfig().rejectUnauthorized).toBe(false);
  });
});

describe("otpDebugLogHabilitado", () => {
  it("esta apagado por defecto: el codigo no se imprime sin pedirlo", () => {
    limpiar();
    expect(otpDebugLogHabilitado()).toBe(false);
  });

  it("no se enciende con un valor cualquiera, solo con 1 o true", () => {
    limpiar();
    process.env.AUTH_OTP_DEBUG_LOG = "no";
    expect(otpDebugLogHabilitado()).toBe(false);
    process.env.AUTH_OTP_DEBUG_LOG = "1";
    expect(otpDebugLogHabilitado()).toBe(true);
    process.env.AUTH_OTP_DEBUG_LOG = "true";
    expect(otpDebugLogHabilitado()).toBe(true);
  });

  // SL-44 (R1, R2; design.md > D1) — en produccion de Vercel queda apagado aunque se encienda.
  it("SL-44 R1 — VERCEL_ENV=production con AUTH_OTP_DEBUG_LOG=1: apagado", () => {
    limpiar();
    process.env.VERCEL_ENV = "production";
    process.env.AUTH_OTP_DEBUG_LOG = "1";
    expect(otpDebugLogHabilitado()).toBe(false);
  });

  it("SL-44 R1 — VERCEL_ENV=production con AUTH_OTP_DEBUG_LOG=true: apagado", () => {
    limpiar();
    process.env.VERCEL_ENV = "production";
    process.env.AUTH_OTP_DEBUG_LOG = "true";
    expect(otpDebugLogHabilitado()).toBe(false);
  });

  it("SL-44 R2 — VERCEL_ENV=preview con AUTH_OTP_DEBUG_LOG=1: encendido", () => {
    limpiar();
    process.env.VERCEL_ENV = "preview";
    process.env.AUTH_OTP_DEBUG_LOG = "1";
    expect(otpDebugLogHabilitado()).toBe(true);
  });

  it("SL-44 R2 — sin VERCEL_ENV con AUTH_OTP_DEBUG_LOG=1: encendido", () => {
    limpiar();
    process.env.AUTH_OTP_DEBUG_LOG = "1";
    expect(otpDebugLogHabilitado()).toBe(true);
  });
});

// SL-41 (R39, P4) — el contacto del pie. Lector aparte de `loadEmailConfig`: el OTP por consola
// compone su correo sin SMTP, así que leer el contacto no puede exigirlo.
describe("emailContacto", () => {
  it("devuelve el email de EMAIL_CONTACTO aunque no haya SMTP", () => {
    limpiar();
    process.env.EMAIL_CONTACTO = "soporte@example.com";
    expect(emailContacto()).toBe("soporte@example.com");
  });

  it("recorta los espacios del valor", () => {
    limpiar();
    process.env.EMAIL_CONTACTO = "  soporte@example.com  ";
    expect(emailContacto()).toBe("soporte@example.com");
  });

  it("es null si la variable no existe", () => {
    limpiar();
    expect(emailContacto()).toBeNull();
  });

  it("es null si la variable está vacía", () => {
    limpiar();
    process.env.EMAIL_CONTACTO = "   ";
    expect(emailContacto()).toBeNull();
  });

  it("es null si el valor no es un email", () => {
    limpiar();
    process.env.EMAIL_CONTACTO = "escribenos por whatsapp";
    expect(emailContacto()).toBeNull();
    process.env.EMAIL_CONTACTO = "soporte@";
    expect(emailContacto()).toBeNull();
  });
});

// SL-41 (R37, D8) — el canal es Brevo. Se leen los dos textos que un operador sigue para montar
// el correo; si vuelven a describir el canal anterior, alguien acaba generando la credencial
// equivocada.
describe("los textos del correo describen Brevo", () => {
  const RAIZ = path.resolve(__dirname, "../../..");
  const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
  // Sin tildes y en minúsculas, para que «contraseña de aplicación» no se escape por la grafía.
  const normalizar = (t: string) => t.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const PROHIBIDOS = ["gmail", "google", "contrasena de aplicacion", "apppasswords"];

  /** La sección de correo de `.env.example`: desde su cabecera hasta la siguiente `# --- `. */
  function seccionCorreoEnvExample(): string {
    const env = leer(".env.example");
    const inicio = env.indexOf("correo saliente");
    expect(inicio, "no encuentro la sección de correo de .env.example").toBeGreaterThan(-1);
    const fin = env.indexOf("\n# --- ", inicio);
    return env.slice(inicio, fin === -1 ? undefined : fin);
  }

  it.each(PROHIBIDOS)("lib/config/email.ts no menciona «%s»", (palabra) => {
    expect(normalizar(leer("lib/config/email.ts"))).not.toContain(palabra);
  });

  it.each(PROHIBIDOS)("la sección de correo de .env.example no menciona «%s»", (palabra) => {
    expect(normalizar(seccionCorreoEnvExample())).not.toContain(palabra);
  });

  it("la sección de correo de .env.example nombra Brevo y las variables de SL-41", () => {
    const seccion = seccionCorreoEnvExample();
    expect(seccion).toContain("Brevo");
    expect(seccion).toContain("smtp-relay.brevo.com");
    expect(seccion).toMatch(/^AUTH_BIENVENIDA_TTL_HORAS=$/m);
    expect(seccion).toMatch(/^EMAIL_CONTACTO=$/m);
    expect(seccion).toContain("NEXT_PUBLIC_APP_URL");
  });
});
