import { describe, expect, it } from "vitest";

import {
  plantillaBienvenidaMaestro,
  type BienvenidaMaestroParams,
} from "@/lib/services/email/plantillas/bienvenida-maestro";

// SL-41 (design §6.4, R13, R14) — el correo de bienvenida del maestro. Los textos son el
// contrato (T1): se escriben aquí a mano.

const URL_ENLACE =
  "https://app.example.com/recuperar-contrasena#enlace=0f8fad5b-d9cb-469f-a165-70867728950e.AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE";

const PARAMS: BienvenidaMaestroParams = {
  to: "maestra@empresa.example",
  nombre: "Ana Pérez",
  empresaNombre: "Mensajería Rápida",
  url: URL_ENLACE,
  ttlHoras: 72,
  baseUrl: "https://app.example.com",
  contacto: null,
};

const bienvenida = (extra: Partial<BienvenidaMaestroParams> = {}) => plantillaBienvenidaMaestro({ ...PARAMS, ...extra });

describe("plantillaBienvenidaMaestro (R13)", () => {
  it("va al email del maestro con el asunto de bienvenida", () => {
    const m = bienvenida();
    expect(m.to).toBe("maestra@empresa.example");
    expect(m.subject).toBe("Te damos la bienvenida a Servi Logistic");
  });

  it("el texto plano lleva, en orden, el saludo, la empresa, el usuario, el enlace, la caducidad y el aviso", () => {
    expect(bienvenida().text).toBe(
      [
        "SERVI LOGISTIC",
        "",
        "Hola, Ana Pérez:",
        "",
        "Se creó la cuenta de Mensajería Rápida en Servi Logistic y tú eres su maestro.",
        "",
        "Para entrar, crea tu contraseña. Tu usuario es este correo: maestra@empresa.example.",
        "",
        `Crear mi contraseña: ${URL_ENLACE}`,
        "",
        "El enlace vence en 72 horas y sirve una sola vez. Si venció, pide al equipo de Servi Logistic que te lo reenvíe, o entra en https://app.example.com/recuperar-contrasena y pide un enlace nuevo con tu correo.",
        "",
        "Si no esperabas este correo, ignóralo: sin la contraseña nadie puede entrar a tu cuenta.",
        "",
        "Servi Logistic · Este correo se envió automáticamente; no lo respondas.",
      ].join("\n"),
    );
  });

  it("el HTML lleva el nombre, la empresa y que su usuario es su email", () => {
    const h = bienvenida().html!;
    expect(h).toContain(">Hola, Ana Pérez:</p>");
    expect(h).toContain(">Se creó la cuenta de Mensajería Rápida en Servi Logistic y tú eres su maestro.</p>");
    expect(h).toContain(">Para entrar, crea tu contraseña. Tu usuario es este correo: maestra@empresa.example.</p>");
  });

  it("el HTML lleva el botón «Crear mi contraseña» al enlace y el mismo enlace como URL visible", () => {
    const h = bienvenida().html!;
    expect(h).toMatch(/<a href="([^"]+)"[^>]*>Crear mi contraseña<\/a>/);
    expect(/<a href="([^"]+)"[^>]*>Crear mi contraseña<\/a>/.exec(h)![1]).toBe(URL_ENLACE);
    expect(h).toContain(`>${URL_ENLACE}</a>`);
  });

  it("el HTML dice cuántas horas dura, que sirve una vez y qué hacer si venció", () => {
    const h = bienvenida().html!;
    expect(h).toContain(
      ">El enlace vence en 72 horas y sirve una sola vez. Si venció, pide al equipo de Servi Logistic que te lo reenvíe, o entra en https://app.example.com/recuperar-contrasena y pide un enlace nuevo con tu correo.</td>",
    );
  });

  it("las horas salen del parámetro, no de un literal", () => {
    expect(bienvenida({ ttlHoras: 24 }).text).toContain("El enlace vence en 24 horas");
  });

  it("el preheader nombra la empresa", () => {
    expect(bienvenida().html).toContain(">Crea tu contraseña para entrar a Mensajería Rápida.</div>");
  });

  it("con contacto, el pie lo muestra", () => {
    expect(bienvenida({ contacto: "soporte@example.com" }).text).toContain(
      "¿Dudas? Escríbenos a soporte@example.com.",
    );
  });

  it("escapa el nombre, la empresa y el email del maestro en el HTML", () => {
    const h = bienvenida({ nombre: "<i>Ana</i>", empresaNombre: "A&B <S.A.>", to: '"x"@empresa.example' }).html!;
    expect(h).not.toContain("<i>Ana</i>");
    expect(h).toContain("Hola, &lt;i&gt;Ana&lt;/i&gt;:");
    expect(h).toContain("Se creó la cuenta de A&amp;B &lt;S.A.&gt; en");
    expect(h).toContain("Tu usuario es este correo: &quot;x&quot;@empresa.example.");
  });
});

describe("plantillaBienvenidaMaestro (R14)", () => {
  it("no lleva ningún código de 6 dígitos, ni en el texto ni en el HTML", () => {
    const m = bienvenida();
    expect(m.text).not.toMatch(/(^|\D)\d{6}(\D|$)/);
    // En el HTML se ignora la URL del enlace: su UUID y su secreto son datos del enlace, no un OTP.
    expect(m.html!.split(URL_ENLACE).join("")).not.toMatch(/(^|[^\w#])\d{6}([^\w]|$)/);
  });

  it("no habla de una contraseña dada ni de un hash", () => {
    const m = bienvenida();
    for (const cuerpo of [m.subject, m.text, m.html!]) {
      expect(cuerpo.toLowerCase()).not.toContain("hash");
      expect(cuerpo.toLowerCase()).not.toMatch(/tu contraseña es|contraseña temporal|contraseña provisional/);
      expect(cuerpo).not.toMatch(/\$2[aby]\$\d{2}\$/);
    }
  });
});
