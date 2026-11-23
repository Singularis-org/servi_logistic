import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

import { filaCargaSchema } from "@/lib/types/carga-masiva";
import { configurarZodEnEspanol } from "@/lib/validacion/zod-es";

// SLT-208 «Manual, Postman y Swagger de la API: revisión completa para que un integrador se conecte».
//
// R3 del spec: en la fila de la carga, una clave AUSENTE responde «Este campo es obligatorio» y una
// clave VACÍA, «<campo> es obligatorio». En CI (build de `next start` en Linux) la clave ausente salía
// en inglés porque el mensaje dependía del `localeError` global de `instrumentation.ts`. Este test
// quita ese mapa global antes de validar: el mensaje tiene que venir del propio schema.

const FILA = {
  num_remision: "REM-1",
  destinatario: "Ana",
  telefono: "88880000",
  producto: "Caja",
};
const CAMPOS = ["num_remision", "destinatario", "telefono", "producto"] as const;

function erroresDe(fila: Record<string, string>): Record<string, string[] | undefined> {
  const r = filaCargaSchema.safeParse(fila);
  expect(r.success, "la fila tiene que fallar").toBe(false);
  return z.flattenError(r.error!).fieldErrors as Record<string, string[] | undefined>;
}

describe("SLT-208 R3 — mensajes de la fila de carga sin depender del mapa global de zod", () => {
  afterEach(() => configurarZodEnEspanol());

  it("control positivo: la fila completa es válida", () => {
    z.config({ localeError: undefined });
    expect(filaCargaSchema.safeParse(FILA).success).toBe(true);
  });

  it.each(CAMPOS)("%s ausente: «Este campo es obligatorio», aunque no haya mapa global", (campo) => {
    z.config({ localeError: undefined });
    const fila: Record<string, string> = { ...FILA };
    delete fila[campo];
    expect(erroresDe(fila)[campo]).toEqual(["Este campo es obligatorio"]);
  });

  it.each(CAMPOS)("%s vacío: «%s es obligatorio»", (campo) => {
    z.config({ localeError: undefined });
    expect(erroresDe({ ...FILA, [campo]: "" })[campo]).toEqual([`${campo} es obligatorio`]);
  });
});
