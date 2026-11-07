import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { CAMPOS_PLANTILLA_POR_CLAVE } from "@/lib/types/plantilla-datos";

// SLT-42 (T5.7; decisión del humano tras T5.5, punto 2) — las descripciones de las variables de los
// informes de WhatsApp y de las plantillas ya no nombran la hora de un país: dicen «(hora local)»,
// porque la hora se pinta en la zona del país de la empresa que envía.

const INFORMES = [
  "lib/whatsapp-envios/informes/aviso-interno.ts",
  "lib/whatsapp-envios/informes/picking/informe.ts",
  "lib/whatsapp-envios/informes/prueba-envio.ts",
  "lib/whatsapp-envios/informes/transito/informe.ts",
] as const;

const leer = (rel: string) => readFileSync(path.resolve(process.cwd(), rel), "utf8");

describe("SLT-42 R22 — las descripciones de fecha y hora dicen «hora local»", () => {
  it.each(INFORMES)("%s: ninguna descripción nombra la hora de Costa Rica", (rel) => {
    const fuente = leer(rel);
    expect(fuente).not.toMatch(/hora de Costa Rica/);
    expect(fuente).toMatch(/\(hora local\)\./);
  });

  it("las variables de fecha y hora de las plantillas dicen «en hora local»", () => {
    for (const clave of ["fecha_asignacion", "fecha_creacion"]) {
      const descripcion = CAMPOS_PLANTILLA_POR_CLAVE.get(clave)?.descripcion ?? "";
      expect(descripcion).toMatch(/en hora local\.$/);
      expect(descripcion).not.toMatch(/Costa Rica/);
    }
  });
});
