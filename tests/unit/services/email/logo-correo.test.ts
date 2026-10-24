import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  LOGO_CORREO_ALTO_PX,
  LOGO_CORREO_ANCHO_PX,
  LOGO_CORREO_PNG_BASE64,
  LOGO_CORREO_SHA256,
} from "@/lib/services/email/plantillas/logo-correo";

// SL-41 (decisión de Carlos, 2026-10-24) — el logo que va incrustado en los correos. El módulo
// lleva los bytes en base64 porque en Vercel la función no puede leer `public/` con `fs`; este
// test ata esos bytes al PNG de marca commiteado, para que el módulo no se edite a mano ni se
// quede viejo si alguien regenera el PNG (`node scripts/generar-logo-correo.mjs`).

const RAIZ = path.resolve(__dirname, "../../../..");
const PNG = readFileSync(path.join(RAIZ, "public", "brand", "logo-correo.png"));
const BYTES = Buffer.from(LOGO_CORREO_PNG_BASE64, "base64");

/** Ancho y alto del chunk IHDR, que en todo PNG empieza en el byte 16. */
function dimensiones(png: Buffer): { ancho: number; alto: number } {
  return { ancho: png.readUInt32BE(16), alto: png.readUInt32BE(20) };
}

describe("logo del correo", () => {
  it("el base64 del módulo son exactamente los bytes de public/brand/logo-correo.png", () => {
    expect(BYTES.equals(PNG)).toBe(true);
    expect(createHash("sha256").update(PNG).digest("hex")).toBe(LOGO_CORREO_SHA256);
  });

  it("es un PNG de 360 px de ancho: el doble de los 180 px a los que se pinta", () => {
    expect(BYTES.subarray(1, 4).toString("latin1")).toBe("PNG");
    expect(dimensiones(BYTES)).toEqual({ ancho: 360, alto: LOGO_CORREO_ALTO_PX });
    expect(LOGO_CORREO_ANCHO_PX).toBe(360);
  });

  it("pesa poco: va en cada OTP", () => {
    expect(BYTES.length).toBeLessThan(20_000);
  });
});
