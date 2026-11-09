import { describe, expect, it } from "vitest";

import { CID_LOGO } from "@/lib/services/email/plantillas/plantilla-marca";
import { plantillaReporteBug } from "@/lib/services/email/plantillas/reporte-bug";
import type { BugReportCreado } from "@/lib/types/reporte-bug";

// SLT-87 (design §7; R15, R18) — la copia por correo de un reporte, ya renderizada. Se afirma sobre el
// mensaje que sale de la plantilla de marca, en HTML y en texto plano.

const BASE: BugReportCreado = {
  id: "0f8fad5b-d9cb-469f-a165-70867728950e",
  createdAt: new Date("2026-11-09T15:04:59.000Z"),
  description: "El botón de guardar no responde.\nPasa desde ayer.",
  reporterName: "Ana Pérez Mora",
  reporterEmail: "ana@empresa.example",
  organizationName: "Envíos Rápidos",
  reporterRole: "mensajero",
  pagePath: "/mis-asignaciones/123",
  userAgent: "Mozilla/5.0 (iPhone) Safari/604.1",
  viewportWidth: 390,
  viewportHeight: 844,
  isStandalone: true,
};

const correo = (r: Partial<BugReportCreado> = {}) =>
  plantillaReporteBug({ to: "soporte@example.test", reporte: { ...BASE, ...r } });

describe("SLT-87 · plantilla del correo del reporte (R15, R18)", () => {
  it("lleva la descripción y cada dato del contexto, en HTML y en texto", () => {
    const m = correo();
    const datos = [
      "El botón de guardar no responde.",
      "Pasa desde ayer.",
      "Empresa: Envíos Rápidos",
      "Usuario: Ana Pérez Mora (ana@empresa.example)",
      "Rol: Mensajero",
      "Página: /mis-asignaciones/123",
      "Navegador: Mozilla/5.0 (iPhone) Safari/604.1",
      "Dispositivo: 390 × 844 · app instalada: sí",
      "Fecha: 2026-11-09 15:04 UTC",
      "Reporte: 0f8fad5b-d9cb-469f-a165-70867728950e",
    ];
    for (const d of datos) {
      expect(m.text, d).toContain(d);
      expect(m.html, d).toContain(d);
    }
    expect(m.to).toBe("soporte@example.test");
    expect(m.subject).toBe("Reporte de un problema · Envíos Rápidos · Mensajero");
    expect(m.text).toContain("Nuevo reporte de un problema en Servi Logistic.");
  });

  it("los saltos de línea de la descripción salen como párrafos separados y sin párrafos vacíos", () => {
    const m = correo({ description: "uno\n\n\ndos\r\ntres" });
    expect(m.html).toContain(">uno</p>");
    expect(m.html).toContain(">dos</p>");
    expect(m.html).toContain(">tres</p>");
    expect(m.html).not.toMatch(/<p[^>]*><\/p>/);
  });

  it("el dispositivo dice «Sin datos» si el cliente no mandó la ventana ni el modo", () => {
    const m = correo({ viewportWidth: null, viewportHeight: null, isStandalone: null });
    expect(m.text).toContain("Dispositivo: Sin datos");
    expect(correo({ isStandalone: false }).text).toContain("Dispositivo: 390 × 844 · app instalada: no");
  });

  it("el asunto se recorta a 150 y el preheader son las primeras 90 letras de la descripción", () => {
    const larga = "x".repeat(300);
    expect(correo({ organizationName: larga }).subject).toHaveLength(150);
    const desc = "a".repeat(90) + "COLA";
    const html = correo({ description: desc }).html ?? "";
    expect(html).toContain(`overflow:hidden;opacity:0;mso-hide:all;">${"a".repeat(90)}</div>`);
  });

  it("sin pie de contacto y con solo el logo en línea: no lleva adjuntos ni imágenes del reporte", () => {
    const m = correo();
    expect(m.text).not.toContain("Escríbenos");
    expect(m.imagenesEnLinea?.map((i) => i.cid)).toEqual([CID_LOGO]);
  });

  it("escapa `<script>` en la descripción, el nombre, la página y el navegador", () => {
    const ataque = '<script>alert("x")</script>';
    const m = correo({
      description: `desc ${ataque}`,
      reporterName: `nombre ${ataque}`,
      pagePath: `/ruta/${ataque}`,
      userAgent: `agente ${ataque}`,
      organizationName: `empresa ${ataque}`,
    });
    const html = m.html ?? "";
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    // Cada uno de los cuatro, escapado y presente, no solo «alguno».
    for (const prefijo of ["desc ", "Usuario: nombre ", "Página: /ruta/", "Navegador: agente "]) {
      expect(html).toContain(`${prefijo}&lt;script&gt;`);
    }
    // El texto plano no es HTML: va tal cual.
    expect(m.text).toContain(`desc ${ataque}`);
  });
});
