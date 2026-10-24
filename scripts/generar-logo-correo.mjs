// SL-41 (decisión de Carlos, 2026-10-24) — Genera el logo que va INCRUSTADO en los correos.
//
//   node scripts/generar-logo-correo.mjs
//
// El correo lleva el logo como adjunto CID, no como `<img src="https://…">`: el PNG alojado no se
// veía en local, dependía de que la URL resolviera y de que el cliente cargara imágenes remotas.
//
// Emite dos archivos desde el vector de marca, en la misma pasada:
//   - `public/brand/logo-correo.png`: 360 px de ancho, el doble de los 180 px a los que se pinta,
//     para que se vea nítido en pantallas de alta densidad. Fondo blanco aplanado: la cabecera del
//     correo es blanca, y algunos clientes pintan la transparencia de un PNG en negro. PNG y no
//     SVG porque Gmail y Outlook bloquean el SVG.
//   - `lib/services/email/plantillas/logo-correo.ts`: los mismos bytes en base64. El correo NO lee
//     el PNG con `fs` en runtime: en Vercel solo viaja a la función lo que el trazado de `next
//     build` ve por los `import` (ver `outputFileTracingIncludes` en `next.config.ts`), y un
//     `readFileSync` de `public/` daría un correo sin logo solo en producción.
// `tests/unit/services/email/logo-correo.test.ts` comprueba que los dos siguen siendo los mismos bytes.

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import sharp from "sharp";

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVG = path.join(RAIZ, "public", "brand", "logo-horizontal-fondo-claro.svg");
const PNG = path.join(RAIZ, "public", "brand", "logo-correo.png");
const MODULO = path.join(RAIZ, "lib", "services", "email", "plantillas", "logo-correo.ts");
const ANCHO = 360;

const bytes = await sharp(readFileSync(SVG), { density: 300 })
  .resize({ width: ANCHO })
  .flatten({ background: "#FFFFFF" })
  .png({ compressionLevel: 9 })
  .toBuffer();
const { width, height } = await sharp(bytes).metadata();
writeFileSync(PNG, bytes);

const base64 = bytes.toString("base64");
const sha256 = createHash("sha256").update(bytes).digest("hex");
const lineas = base64.match(/.{1,100}/g) ?? [];

const modulo = `// GENERADO por \`node scripts/generar-logo-correo.mjs\` desde \`public/brand/logo-horizontal-fondo-claro.svg\`.
// No se edita a mano: el test \`logo-correo.test.ts\` exige que sean los bytes de \`public/brand/logo-correo.png\`.

/** Ancho y alto reales del PNG, en píxeles. El correo lo pinta a la mitad del ancho. */
export const LOGO_CORREO_ANCHO_PX = ${width};
export const LOGO_CORREO_ALTO_PX = ${height};

/** sha256 de los bytes del PNG. */
export const LOGO_CORREO_SHA256 = "${sha256}";

/** El PNG en base64. */
export const LOGO_CORREO_PNG_BASE64 =
${lineas.map((l, i) => `  "${l}"${i === lineas.length - 1 ? ";" : " +"}`).join("\n")}
`;
writeFileSync(MODULO, modulo);

console.log(`logo-correo.png ${width}x${height}, ${bytes.length} bytes, sha256 ${sha256.slice(0, 12)}…`);
