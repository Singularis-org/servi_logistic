import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";

import type { EmailMessage, IEmailSender } from "@/lib/interfaces/external/IEmailSender";
import type {
  IBienvenidaMaestroRepository,
  MaestroParaBienvenida,
} from "@/lib/interfaces/repositories/IBienvenidaMaestroRepository";
import type { IPasswordResetService } from "@/lib/interfaces/services/IPasswordResetService";
import { BienvenidaMaestroService } from "@/lib/services/BienvenidaMaestroService";
import { EmailEnvioError } from "@/lib/services/email/NodemailerEmailSender";

// SL-41 / T7 (design §6.3) — R16, R23, R24, R34, R40 y `sin_maestro`. Todo con dobles: el SQL del
// repositorio se prueba contra Postgres en `tests/integration/db/bienvenida-maestro-repository.test.ts`.

const ORG = "6f1c2a4e-1b7d-4c3e-9a8f-1234567890ab";
const MAESTRO: MaestroParaBienvenida = {
  usuarioId: "u-maestro-1",
  nombre: "Lucía Pérez",
  email: "lucia@ejemplo.test",
  empresaNombre: "Envíos del Sur",
};
const CHALLENGE_ID = "0b9d7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4";
// 43 caracteres base64url: la forma real de un secreto de 256 bits.
const SECRETO = "Zq3_x-Kp9LmN2oPqRsTuVwXyZ0123456789abcdEFGH";
const ENLACE = `${CHALLENGE_ID}.${SECRETO}`;
const BASE = "https://app.ejemplo.test";
const IP = "203.0.113.9";

function dobles(opts: { maestro?: MaestroParaBienvenida | null } = {}) {
  const repo = {
    maestroParaBienvenida: vi.fn<IBienvenidaMaestroRepository["maestroParaBienvenida"]>(async () =>
      opts.maestro === undefined ? MAESTRO : opts.maestro,
    ),
    organizacionesConBienvenidaPendiente: vi.fn(async () => []),
  } satisfies IBienvenidaMaestroRepository;
  const emitirEnlaceBienvenida = vi.fn<IPasswordResetService["emitirEnlaceBienvenida"]>(async () => ({
    enlace: ENLACE,
    ttlHoras: 72,
  }));
  const anularEnlaceBienvenida = vi.fn<IPasswordResetService["anularEnlaceBienvenida"]>(async () => {});
  const enviados: EmailMessage[] = [];
  const enviar = vi.fn<IEmailSender["enviar"]>(async (m) => {
    enviados.push(m);
    return { messageId: "id-smtp" };
  });
  return { repo, passwordReset: { emitirEnlaceBienvenida, anularEnlaceBienvenida }, sender: { enviar }, enviados };
}

function servicio(
  d: ReturnType<typeof dobles>,
  opts: { baseUrl?: string | null; smtp?: boolean; contacto?: string | null } = {},
) {
  return new BienvenidaMaestroService(
    d.repo,
    d.passwordReset,
    d.sender,
    opts.baseUrl === undefined ? BASE : opts.baseUrl,
    opts.smtp ?? true,
    opts.contacto ?? null,
  );
}

const METODOS = ["log", "info", "warn", "error", "debug"] as const;
let espias: MockInstance[] = [];

beforeEach(() => {
  espias = METODOS.map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
});
afterEach(() => {
  vi.restoreAllMocks();
});

/** Todo lo que el servicio escribio en la consola, en un solo texto. */
function registrado(): string {
  return espias.flatMap((e) => e.mock.calls.map((c) => c.map(String).join(" "))).join("\n");
}

describe("BienvenidaMaestroService — el camino bueno", () => {
  it("emite el enlace para el primer maestro de esa empresa y le envía el correo", async () => {
    const d = dobles();
    const r = await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });

    expect(r).toEqual({ estado: "enviada", email: MAESTRO.email });
    expect(d.passwordReset.anularEnlaceBienvenida).not.toHaveBeenCalled();
    expect(d.repo.maestroParaBienvenida).toHaveBeenCalledWith(ORG);
    expect(d.passwordReset.emitirEnlaceBienvenida).toHaveBeenCalledWith({
      usuarioId: MAESTRO.usuarioId,
      ipAddress: IP,
    });
    expect(d.enviados).toHaveLength(1);
    expect(d.enviados[0].to).toBe(MAESTRO.email);
    expect(d.enviados[0].text).toContain(MAESTRO.nombre);
    expect(d.enviados[0].text).toContain(MAESTRO.empresaNombre);
    expect(d.enviados[0].text).toContain("72 horas");
  });

  it("R39: el pie lleva el contacto que recibe el servicio", async () => {
    const d = dobles();
    await servicio(d, { contacto: "soporte@ejemplo.test" }).enviar({ organizacionId: ORG, ipAddress: IP });
    expect(d.enviados[0].text).toContain("soporte@ejemplo.test");
  });
});

describe("R16 — el secreto va en el fragmento de la URL", () => {
  it("la URL del correo es <base>/recuperar-contrasena#enlace=<enlace>, sin query y sin el secreto en la ruta", async () => {
    const d = dobles();
    await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });

    const esperada = `${BASE}/recuperar-contrasena#enlace=${ENLACE}`;
    const { text, html } = d.enviados[0];
    expect(text).toContain(esperada);
    expect(html).toContain(esperada);

    const urls = text.match(/https?:\/\/\S*#enlace=\S*/g) ?? [];
    expect(urls).toEqual([esperada]);
    const u = new URL(esperada);
    expect(u.search).toBe("");
    expect(u.pathname).toBe("/recuperar-contrasena");
    expect(u.pathname).not.toContain(SECRETO);
    expect(u.hash).toBe(`#enlace=${ENLACE}`);
  });
});

describe("R23 — si algo falla, devuelve no_enviada y no lanza", () => {
  it("falla el SMTP", async () => {
    const d = dobles();
    d.sender.enviar.mockRejectedValueOnce(new EmailEnvioError(MAESTRO.email, new Error("ECONNRESET")));
    await expect(servicio(d).enviar({ organizacionId: ORG, ipAddress: IP })).resolves.toEqual({
      estado: "no_enviada",
      email: MAESTRO.email,
    });
  });

  // Revisión m2: un envío que falla no puede dejar muerto el enlace anterior. El nuevo, que no lo
  // tiene nadie, se anula, y el anterior vuelve a ser el último activo (R22).
  it("falla el SMTP: anula el enlace recién emitido, y solo ese", async () => {
    const d = dobles();
    d.sender.enviar.mockRejectedValueOnce(new EmailEnvioError(MAESTRO.email, new Error("ECONNRESET")));
    await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });
    expect(d.passwordReset.anularEnlaceBienvenida).toHaveBeenCalledTimes(1);
    expect(d.passwordReset.anularEnlaceBienvenida).toHaveBeenCalledWith(ENLACE);
  });

  it("falla el SMTP y también anular: no_enviada igual, y el registro nombra el error del envío", async () => {
    const d = dobles();
    d.sender.enviar.mockRejectedValueOnce(new EmailEnvioError(MAESTRO.email, new Error("ECONNRESET")));
    d.passwordReset.anularEnlaceBienvenida.mockRejectedValueOnce(new Error("fallo de base"));
    await expect(servicio(d).enviar({ organizacionId: ORG, ipAddress: IP })).resolves.toEqual({
      estado: "no_enviada",
      email: MAESTRO.email,
    });
    expect(registrado()).toContain("causa=EmailEnvioError");
  });

  it("falla la emisión del enlace: no se intenta enviar nada", async () => {
    const d = dobles();
    d.passwordReset.emitirEnlaceBienvenida.mockRejectedValueOnce(new Error("fallo de base"));
    await expect(servicio(d).enviar({ organizacionId: ORG, ipAddress: IP })).resolves.toEqual({
      estado: "no_enviada",
      email: MAESTRO.email,
    });
    expect(d.sender.enviar).not.toHaveBeenCalled();
  });

  it("falla la lectura del maestro: no_enviada sin email", async () => {
    const d = dobles();
    d.repo.maestroParaBienvenida.mockRejectedValueOnce(new Error("fallo de base"));
    await expect(servicio(d).enviar({ organizacionId: ORG, ipAddress: IP })).resolves.toEqual({
      estado: "no_enviada",
      email: null,
    });
    expect(d.passwordReset.emitirEnlaceBienvenida).not.toHaveBeenCalled();
  });

  it("lanza algo que no es un Error: no_enviada igual", async () => {
    const d = dobles();
    d.sender.enviar.mockRejectedValueOnce("texto suelto");
    await expect(servicio(d).enviar({ organizacionId: ORG, ipAddress: IP })).resolves.toMatchObject({
      estado: "no_enviada",
    });
    expect(registrado()).toContain("causa=desconocido");
  });
});

describe("R23 y R40 — sin URL base de la app", () => {
  it("no_enviada sin emitir el enlace ni enviar, y un aviso que nombra NEXT_PUBLIC_APP_URL", async () => {
    const d = dobles();
    const r = await servicio(d, { baseUrl: null }).enviar({ organizacionId: ORG, ipAddress: IP });

    expect(r).toEqual({ estado: "no_enviada", email: MAESTRO.email });
    expect(d.passwordReset.emitirEnlaceBienvenida).not.toHaveBeenCalled();
    expect(d.sender.enviar).not.toHaveBeenCalled();

    const warn = espias[METODOS.indexOf("warn")];
    expect(warn).toHaveBeenCalledTimes(1);
    const linea = String(warn.mock.calls[0][0]);
    expect(linea).toContain("NEXT_PUBLIC_APP_URL");
    expect(linea).toContain(`organizacion=${ORG}`);
    expect(linea).not.toContain(MAESTRO.email);
  });
});

describe("R24 — sin SMTP configurado", () => {
  it("el correo pasa por el emisor (de consola) y el estado es sin_correo", async () => {
    const d = dobles();
    d.sender.enviar.mockResolvedValueOnce({ messageId: null });
    const r = await servicio(d, { smtp: false }).enviar({ organizacionId: ORG, ipAddress: IP });
    expect(r).toEqual({ estado: "sin_correo", email: MAESTRO.email });
    expect(d.sender.enviar).toHaveBeenCalledTimes(1);
    // Revisión m2, decidido: sin SMTP el emisor de consola ES la entrega (en local y en el E2E el
    // enlace se lee del registro con AUTH_OTP_DEBUG_LOG=1). No falló nada, así que no se anula.
    expect(d.passwordReset.anularEnlaceBienvenida).not.toHaveBeenCalled();
  });

  it("con SMTP, un messageId null no lo convierte en sin_correo: manda el flag", async () => {
    const d = dobles();
    d.sender.enviar.mockResolvedValueOnce({ messageId: null });
    const r = await servicio(d, { smtp: true }).enviar({ organizacionId: ORG, ipAddress: IP });
    expect(r.estado).toBe("enviada");
  });
});

describe("sin_maestro", () => {
  it("una empresa sin maestro: sin_maestro, sin emitir ni enviar", async () => {
    const d = dobles({ maestro: null });
    const r = await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });
    expect(r).toEqual({ estado: "sin_maestro" });
    expect(d.passwordReset.emitirEnlaceBienvenida).not.toHaveBeenCalled();
    expect(d.sender.enviar).not.toHaveBeenCalled();
  });
});

describe("R34 — la consola no ve el secreto, la URL, el email ni el message del error", () => {
  const MENSAJE = `email: fallo el envio SMTP a ${MAESTRO.email}`;

  it("en el camino bueno no se registra nada del enlace", async () => {
    const d = dobles();
    await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });
    const todo = registrado();
    expect(todo).not.toContain(SECRETO);
    expect(todo).not.toContain("#enlace=");
  });

  it("si falla el SMTP, el registro de error tiene la empresa, el usuario y el nombre del error, nada más", async () => {
    const d = dobles();
    d.sender.enviar.mockRejectedValueOnce(new EmailEnvioError(MAESTRO.email, new Error(`fallo con ${SECRETO}`)));
    await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });

    const error = espias[METODOS.indexOf("error")];
    expect(error).toHaveBeenCalledTimes(1);
    // Un solo argumento de texto: un objeto Error pasado como segundo argumento se imprimiria entero.
    expect(error.mock.calls[0]).toHaveLength(1);
    expect(String(error.mock.calls[0][0])).toBe(
      `[bienvenida] no se envio organizacion=${ORG} usuario=${MAESTRO.usuarioId} causa=EmailEnvioError`,
    );

    const todo = registrado();
    expect(todo).not.toContain(SECRETO);
    expect(todo).not.toContain(ENLACE);
    expect(todo).not.toContain(`${BASE}/recuperar-contrasena#`);
    expect(todo).not.toContain(MAESTRO.email);
    expect(todo).not.toContain(MENSAJE);
  });

  it("si falla la emisión, el message del error no llega a la consola", async () => {
    const d = dobles();
    d.passwordReset.emitirEnlaceBienvenida.mockRejectedValueOnce(new Error(`detalle con ${MAESTRO.email}`));
    await servicio(d).enviar({ organizacionId: ORG, ipAddress: IP });
    const todo = registrado();
    expect(todo).toContain("causa=Error");
    expect(todo).not.toContain(MAESTRO.email);
    expect(todo).not.toContain("detalle con");
  });
});
