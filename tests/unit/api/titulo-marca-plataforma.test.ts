import { describe, it, expect } from "vitest";

import { openApiSpec } from "@/lib/api/openapi-spec";
import { GET } from "@/app/api-docs/route";

// SL-15 (R2, R19) — la documentacion de la API la publica la plataforma, asi que su titulo lleva
// la marca. Se afirma el LITERAL, no `MARCA.nombre`: comparar contra la fuente que genera el
// texto daria verde aunque la marca cambiara en silencio.
const TITULO = "Servi Logistic — API de integración por API key";

describe("SL-15 — el titulo de la documentacion de la API lleva la marca de la plataforma", () => {
  it("el OpenAPI se titula con la marca", () => {
    expect(openApiSpec.info.title).toBe(TITULO);
  });

  it("la pagina de Swagger UI se titula con la marca", async () => {
    const html = await GET().text();
    expect(html).toContain(`<title>${TITULO}</title>`);
  });
});
