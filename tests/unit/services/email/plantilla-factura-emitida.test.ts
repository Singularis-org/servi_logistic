import { describe, expect, it } from "vitest";

import {
  plantillaFacturaEmitida,
  type FacturaEmitidaParams,
} from "@/lib/services/email/plantillas/factura-emitida";
import type { CuotaDeLaFactura } from "@/lib/types/factura-plataforma";

// SLT-136 · T6.1 (design §7.4; R26, R29) — el correo de una factura de la plataforma recién cerrada. Los literales
// del spec (asunto, conceptos, botón y la nota sin URL) se escriben aquí a mano. Los importes son los de la base,
// con el formato de dinero de la app (`money()`): «₡1.234,50», «-₡300», «₡0».

function cuota(importe: string): CuotaDeLaFactura {
  return {
    planId: "plan-1",
    planNombre: "Básico",
    tipoCobro: "quincenal",
    desde: new Date("2026-11-16T06:00:00.000Z"),
    hasta: new Date("2026-12-01T06:00:00.000Z"),
    precioMensual: "20000.00",
    cuota: importe,
    diasCobrados: 15,
    diasPeriodo: 15,
  } as CuotaDeLaFactura;
}

const PARAMS: FacturaEmitidaParams = {
  to: "maestra@empresa.example",
  nombre: "Ana Pérez",
  empresaNombre: "Mensajería Rápida",
  factura: {
    numero: 3,
    desde: new Date("2026-11-16T06:00:00.000Z"),
    hasta: new Date("2026-12-01T06:00:00.000Z"),
    cargos: "1234.50",
    reversos: "300.00",
    cuota: cuota("10000.00"),
    primeraCuota: cuota("2500.25"),
    total: "13434.75",
  },
  contacto: "soporte@plataforma.example",
  urlApp: "https://app.example.com",
  // SLT-121 R25: con `hasta` = 1 dic a las 00:00 de la plataforma, la fecha límite es el 8 dic.
  gracia: 7,
};

const correo = (extra: Partial<FacturaEmitidaParams> = {}) => plantillaFacturaEmitida({ ...PARAMS, ...extra });
const conFactura = (f: Partial<FacturaEmitidaParams["factura"]>) =>
  correo({ factura: { ...PARAMS.factura, ...f } });

describe("SLT-136/R26 — el correo de la factura emitida", () => {
  it("⭑ va al maestro con el asunto del número y la empresa, y el total en la vista previa", () => {
    const m = correo();
    expect(m.to).toBe("maestra@empresa.example");
    expect(m.subject).toBe("Factura N.º 3 de la plataforma — Mensajería Rápida");
    expect(m.html).toContain("Total a pagar ₡13.434,75");
  });

  it("⭑ el texto plano lleva, en orden, saludo, período, cuota (con la primera cuota), cargos, reversos, total y botón", () => {
    const esperado = [
        "SERVI LOGISTIC",
        "",
        "Hola, Ana Pérez:",
        "",
        "Se emitió la factura N.º 3 de la plataforma, del 16/11/2026 al 30/11/2026.",
        "",
        "Cuota del plan: ₡12.500,25",
        "",
        "Cargos por orden: ₡1.234,50",
        "",
        "Reversos de cargos: -₡300",
        "",
        "Total a pagar: ₡13.434,75",
        "",
        "Paga hasta el 08/12/2026.",
        "",
        "Ver factura: https://app.example.com/mi-plan",
        "",
      ].join("\n");
    // Después del botón viene solo el pie común de la plantilla de marca.
    expect(correo().text.slice(0, esperado.length)).toBe(esperado);
  });

  it("la cuota es solo la de la emisión si no hay primera cuota, y ₡0 si no lleva ninguna", () => {
    expect(conFactura({ primeraCuota: null }).text).toContain("Cuota del plan: ₡10.000\n");
    expect(conFactura({ cuota: null, primeraCuota: null }).text).toContain("Cuota del plan: ₡0\n");
  });

  it("el total es el de la base, sin recalcular", () => {
    expect(conFactura({ total: "1.00" }).text).toContain("Total a pagar: ₡1\n");
  });

  it("⭑ el HTML lleva el botón «Ver factura» a «Mi plan»", () => {
    const h = correo().html!;
    expect(h).toContain('href="https://app.example.com/mi-plan"');
    expect(h).toContain("Ver factura");
  });

  it("⭑ no lleva adjuntos: solo el logo en línea de la plantilla de marca", () => {
    const m = correo();
    expect(Object.keys(m).sort()).toEqual(["html", "imagenesEnLinea", "subject", "text", "to"]);
    expect(m.imagenesEnLinea).toHaveLength(1);
    expect(m.imagenesEnLinea![0]!.tipoContenido).toBe("image/png");
  });

  it("un nombre o una empresa con `<` se escapan en el HTML", () => {
    const h = correo({ nombre: "<i>Ana</i>", empresaNombre: "A&B <S.A.>" }).html!;
    expect(h).toContain("Hola, &lt;i&gt;Ana&lt;/i&gt;:");
    expect(h).not.toContain("<i>Ana</i>");
  });

  it("una factura sin número (no cerrada) no tiene correo", () => {
    expect(() => conFactura({ numero: null })).toThrow("plantillaFacturaEmitida");
  });
});

describe("SLT-136/R29 — sin la URL de la app", () => {
  it("⭑ el correo va sin botón y dice que la factura está en «Mi plan»", () => {
    const m = correo({ urlApp: null });
    expect(m.text).not.toContain("Ver factura");
    expect(m.text).not.toContain("/mi-plan");
    expect(m.html).not.toContain("/mi-plan");
    expect(m.text).toContain("Encuéntrala en Mi plan, dentro de la app.");
    expect(m.html).toContain("Encuéntrala en Mi plan, dentro de la app.");
  });
});

describe("SLT-121/R25 — la fecha límite de pago en el correo de cierre", () => {
  it("⭑ con total mayor que 0 lleva «Paga hasta el dd/mm/aaaa», con la gracia de la empresa", () => {
    expect(correo().text).toContain("Paga hasta el 08/12/2026.\n");
    expect(correo().html).toContain("Paga hasta el 08/12/2026.");
    // La gracia propia de la empresa manda: 15 días desde el 1 dic.
    expect(correo({ gracia: 15 }).text).toContain("Paga hasta el 16/12/2026.\n");
    // Fin de mes: el 30 de noviembre más 1 día de gracia pasa al 1 de diciembre.
    expect(correo({ gracia: 1, factura: { ...PARAMS.factura, hasta: new Date("2026-11-30T06:00:00.000Z") } }).text).toContain(
      "Paga hasta el 01/12/2026.\n",
    );
  });

  it("⭑ con total 0 o negativo no la lleva", () => {
    expect(conFactura({ total: "0.00" }).text).not.toContain("Paga hasta");
    expect(conFactura({ total: "-50.00" }).text).not.toContain("Paga hasta");
    expect(conFactura({ total: "0.01" }).text).toContain("Paga hasta el 08/12/2026.");
  });
});
