import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { analizarBloques } from "@/lib/ayuda/bloques";
import { leerDocumentoAyuda } from "@/lib/ayuda/catalogo";
import { SLUG_GUIA_API } from "@/lib/ayuda/guia-api";
import { construirPdfGuiaApi } from "@/lib/pdf/guia-api-pdf";

// SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte».
//
// R6: el PDF que se entrega al integrador se genera desde la guía revisada y lleva la URL de
// producción. Se construye igual que la ruta de descarga (`construirPdfGuiaApi` sobre los bloques del
// `.md`): si un carácter de la guía no cabe en la fuente del PDF, lanza `ErrorCaracterNoImprimible`.
// El texto del PDF va codificado por glifo, así que la URL se comprueba en los bloques que lo
// alimentan, que son exactamente lo que se dibuja.
//
// R7: la revisión queda anunciada en el changelog del canal y en el historial de la guía.

const URL_PRODUCCION = "https://www.servilogistic.co";
const FECHA = "2026-11-18";

describe("SLT-208 R6 — el PDF de la guía se genera con la URL de producción", () => {
  it("se construye sin error y los bloques que dibuja llevan la URL de producción y ninguna de prueba", async () => {
    const doc = await leerDocumentoAyuda(SLUG_GUIA_API);
    expect(doc, "la guía existe en la Ayuda").not.toBeNull();
    const bloques = analizarBloques(doc!.cuerpo);
    const pdf = construirPdfGuiaApi(bloques, doc!, null);
    expect(pdf.length, "el PDF no está vacío").toBeGreaterThan(10_000);
    expect(doc!.actualizado).toBe(FECHA);
    const texto = JSON.stringify(bloques);
    expect(texto).toContain(`${URL_PRODUCCION}/api/ordenes/api-key/carga`);
    // Toda URL absoluta que se dibuja es de producción o un marcador `<...>`.
    const ajenas = (texto.match(/https?:\/\/[^\s"'`\\)]+/g) ?? []).filter(
      (u) => !u.startsWith(`${URL_PRODUCCION}`) && !u.includes("<"),
    );
    expect(ajenas).toEqual([]);
    expect(texto).not.toContain("example.com");
    expect(texto).not.toContain("localhost");
  });
});

describe("SLT-208 R7 — la revisión está en el changelog y en el historial de la guía", () => {
  it("el changelog del canal tiene la entrada del 2026-11-18", () => {
    const changelog = readFileSync(path.join(process.cwd(), "docs", "api", "CHANGELOG.md"), "utf8");
    expect(changelog).toContain(
      `## ${FECHA} — Sin ruptura — La guía, Postman y el contrato apuntan a producción y se corrigen contra el código`,
    );
  });

  it("la sección 9 de la guía abre con la revisión del 2026-11-18", () => {
    const guia = readFileSync(path.join(process.cwd(), "docs", "ayuda", "oficina", "guia-integracion-api.md"), "utf8");
    const historial = guia.slice(guia.indexOf("# 9. Historial de versiones del documento"));
    expect(historial).toMatch(new RegExp(`\\| ${FECHA} \\| Revisión completa \\|`));
  });
});
