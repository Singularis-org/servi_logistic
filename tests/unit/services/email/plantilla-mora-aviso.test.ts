import { describe, expect, it } from "vitest";

import { money } from "@/lib/config/moneda";
import { plantillaMoraAviso, type MoraAvisoParams } from "@/lib/services/email/plantillas/mora-aviso";

// SLT-121 · T3.3 (design §4.2; R26, R27, R28) — los tres correos de la mora. Los asuntos del spec se escriben aquí a
// mano; los importes van con el formato de dinero de la app (`money()`), que es el de la moneda de los planes.

const BASE: Omit<MoraAvisoParams, "contenido"> = {
  to: "maestra@empresa.example",
  nombre: "Ana Pérez",
  empresaNombre: "Mensajería Rápida",
  contacto: "soporte@plataforma.example",
  urlApp: "https://app.example.com",
};

const correo = (contenido: MoraAvisoParams["contenido"], extra: Partial<MoraAvisoParams> = {}) =>
  plantillaMoraAviso({ ...BASE, contenido, ...extra });

const RECORDATORIO = { tipo: "recordatorio", numero: 3, saldo: "1234.50", fechaLimite: "2026-11-23" } as const;
const CONGELADA = {
  tipo: "congelada",
  facturas: [
    { numero: 3, saldo: "1000.00" },
    { numero: 5, saldo: "234.50" },
  ],
  saldoVencido: "1234.50",
} as const;

describe("SLT-121/R26 — el recordatorio de la víspera", () => {
  it("⭑ «Tu factura N.º n vence mañana», con el saldo y la fecha límite, y el botón a «Mi plan»", () => {
    const m = correo(RECORDATORIO);
    expect(m.to).toBe("maestra@empresa.example");
    expect(m.subject).toBe("Tu factura N.º 3 vence mañana");
    expect(m.text).toContain("Hola, Ana Pérez:");
    expect(m.text).toContain("La factura N.º 3 de la plataforma de Mensajería Rápida vence mañana, 23/11/2026.");
    expect(m.text).toContain(`Saldo por pagar: ${money("1234.50")}`);
    expect(m.text).toContain("Ver facturas: https://app.example.com/mi-plan");
    expect(m.html).toContain('href="https://app.example.com/mi-plan"');
    expect(m.html).toContain("Fecha límite 23/11/2026");
  });
});

describe("SLT-121/R27 — la empresa congelada", () => {
  it("⭑ asunto con la empresa; cada factura vencida con su saldo, el saldo vencido y qué se puede hacer", () => {
    const m = correo(CONGELADA);
    expect(m.subject).toBe("La operación de Mensajería Rápida está congelada por falta de pago");
    expect(m.text).toContain(`Factura N.º 3: ${money("1000.00")}`);
    expect(m.text).toContain(`Factura N.º 5: ${money("234.50")}`);
    expect(m.text).toContain(`Saldo vencido: ${money("1234.50")}`);
    expect(m.text).toContain("pagar a la plataforma desde la wallet");
    expect(m.text).toContain("Ver facturas: https://app.example.com/mi-plan");
  });
});

describe("SLT-121/R28 — la operación activa de nuevo", () => {
  it("⭑ por pago, por gracia y a mano: el mismo asunto y el porqué de cada uno", () => {
    const pago = correo({ tipo: "descongelada", motivo: "pago" });
    expect(pago.subject).toBe("La operación de Mensajería Rápida está activa de nuevo");
    expect(pago.text).toContain("Se registró el pago de las facturas vencidas.");

    const gracia = correo({ tipo: "descongelada", motivo: "gracia" });
    expect(gracia.subject).toBe("La operación de Mensajería Rápida está activa de nuevo");
    expect(gracia.text).toContain("El plazo de pago cambió y ya no hay facturas vencidas.");

    const aMano = correo({ tipo: "descongelada", motivo: "a_mano", hasta: "2026-12-05" });
    expect(aMano.subject).toBe("La operación de Mensajería Rápida está activa de nuevo");
    expect(aMano.text).toContain("La plataforma habilitó la operación hasta el 05/12/2026.");
  });

  it("a mano sin fecha (payload viejo) sale sin la frase del plazo", () => {
    const m = correo({ tipo: "descongelada", motivo: "a_mano" });
    expect(m.text).toContain("está activa de nuevo.");
    expect(m.text).not.toContain("habilitó");
  });
});

describe("SLT-121 — bordes de los tres correos", () => {
  it("⭑ sin la URL de la app: sin botón y con la nota de dónde están las facturas", () => {
    for (const contenido of [RECORDATORIO, CONGELADA, { tipo: "descongelada", motivo: "pago" } as const]) {
      const m = correo(contenido, { urlApp: null });
      expect(m.text, contenido.tipo).not.toContain("/mi-plan");
      expect(m.html, contenido.tipo).not.toContain("/mi-plan");
      expect(m.text, contenido.tipo).toContain("Encuentra tus facturas en Mi plan, dentro de la app.");
    }
  });

  it("⭑ el nombre y la empresa se escapan en el HTML", () => {
    const h = correo(CONGELADA, { nombre: "<i>Ana</i>", empresaNombre: "A&B <S.A.>" }).html!;
    expect(h).toContain("Hola, &lt;i&gt;Ana&lt;/i&gt;:");
    expect(h).not.toContain("<i>Ana</i>");
    expect(h).toContain("A&amp;B &lt;S.A.&gt;");
  });

  it("no lleva adjuntos: solo el logo en línea de la plantilla de marca", () => {
    const m = correo(RECORDATORIO);
    expect(Object.keys(m).sort()).toEqual(["html", "imagenesEnLinea", "subject", "text", "to"]);
  });
});

// SLT-255 · T3.1 (design §4.3) — los correos de la prórroga y el recordatorio durante el plazo. Los textos del spec
// se escriben aquí a mano.

const SE_CONGELA = "se congela";

describe("SLT-255/R16 — prórroga dada, alargada o acortada", () => {
  it("⭑ dada: «Tienes prórroga de pago hasta el …», la fecha y que se congela la madrugada siguiente", () => {
    const m = correo({ tipo: "prorroga", cambio: "dada", hasta: "2026-11-27" });
    expect(m.subject).toBe("Tienes prórroga de pago hasta el 27/11/2026");
    expect(m.text).toContain("Hola, Ana Pérez:");
    expect(m.text).toContain(
      "La plataforma dio a Mensajería Rápida plazo para pagar las facturas pendientes hasta el 27/11/2026.",
    );
    expect(m.text).toContain(
      "Si para entonces no se pagan las facturas vencidas, la operación se congela la madrugada siguiente.",
    );
    expect(m.text).toContain("Ver facturas: https://app.example.com/mi-plan");
  });

  it("⭑ alargada y acortada: el asunto dice que cambió y la fecha nueva", () => {
    for (const cambio of ["alargada", "acortada"] as const) {
      const m = correo({ tipo: "prorroga", cambio, hasta: "2026-12-01" });
      expect(m.subject, cambio).toBe("Tu prórroga de pago cambió: ahora vence el 01/12/2026");
      expect(m.text, cambio).toContain("hasta el 01/12/2026.");
      expect(m.text, cambio).toContain("la operación se congela la madrugada siguiente.");
    }
  });
});

describe("SLT-255/R17 — prórroga quitada", () => {
  it("⭑ con vencidas: dice que ya no hay prórroga y que se congela la madrugada siguiente", () => {
    const m = correo({ tipo: "prorroga_quitada", conVencidas: true });
    expect(m.subject).toBe("Tu prórroga de pago se quitó");
    expect(m.text).toContain("La plataforma quitó la prórroga de pago de Mensajería Rápida.");
    expect(m.text).toContain("Como hay facturas vencidas sin pagar, la operación se congela la madrugada siguiente.");
  });

  it("⭑ sin vencidas: no dice que se congela", () => {
    const m = correo({ tipo: "prorroga_quitada", conVencidas: false });
    expect(m.subject).toBe("Tu prórroga de pago se quitó");
    expect(m.text).toContain("La plataforma quitó la prórroga de pago de Mensajería Rápida.");
    expect(m.text).not.toContain(SE_CONGELA);
  });
});

describe("SLT-255/R18 — la víspera del plazo", () => {
  it("⭑ «Tu prórroga de pago vence mañana», con la fecha y que se congela la madrugada siguiente", () => {
    const m = correo({ tipo: "prorroga_vence", hasta: "2026-11-27" });
    expect(m.subject).toBe("Tu prórroga de pago vence mañana");
    expect(m.text).toContain(
      "La prórroga de pago de Mensajería Rápida vence mañana, 27/11/2026. Si no se pagan las facturas vencidas, " +
        "la operación se congela la madrugada siguiente.",
    );
    expect(m.text).toContain("Ver facturas: https://app.example.com/mi-plan");
  });
});

describe("SLT-255/R22 — el recordatorio durante el plazo", () => {
  it("⭑ con `plazoHasta`: dice hasta cuándo corre la prórroga y no dice que se congela", () => {
    const m = correo({ ...RECORDATORIO, plazoHasta: "2026-11-27" });
    expect(m.subject).toBe("Tu factura N.º 3 vence mañana");
    expect(m.text).toContain("La factura N.º 3 de la plataforma de Mensajería Rápida vence mañana, 23/11/2026.");
    expect(m.text).toContain(`Saldo por pagar: ${money("1234.50")}`);
    expect(m.text).toContain("Tienes prórroga de pago hasta el 27/11/2026.");
    expect(m.text).not.toContain(SE_CONGELA);
    expect(m.html).not.toContain(SE_CONGELA);
  });

  it("sin `plazoHasta` sigue diciendo que se congela (SLT-121 R26)", () => {
    expect(correo(RECORDATORIO).text).toContain(SE_CONGELA);
  });
});

describe("SLT-255 — bordes de los correos de la prórroga", () => {
  const PRORROGAS = [
    { tipo: "prorroga", cambio: "dada", hasta: "2026-11-27" },
    { tipo: "prorroga_quitada", conVencidas: true },
    { tipo: "prorroga_vence", hasta: "2026-11-27" },
  ] as const;

  it("⭑ sin la URL de la app: sin botón y con la nota de dónde están las facturas", () => {
    for (const contenido of PRORROGAS) {
      const m = correo(contenido, { urlApp: null });
      expect(m.text, contenido.tipo).not.toContain("/mi-plan");
      expect(m.text, contenido.tipo).toContain("Encuentra tus facturas en Mi plan, dentro de la app.");
    }
  });

  it("⭑ la empresa se escapa en el HTML, también en el preheader", () => {
    for (const contenido of PRORROGAS) {
      const h = correo(contenido, { empresaNombre: "A&B <S.A.>" }).html!;
      expect(h, contenido.tipo).toContain("A&amp;B &lt;S.A.&gt;");
      expect(h, contenido.tipo).not.toContain("<S.A.>");
    }
  });
});
