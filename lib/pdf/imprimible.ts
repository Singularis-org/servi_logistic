// Ficha 475 (R32), movido aquí por SLT-136 (design §4) para que lo compartan el informe de tránsito y la
// factura de la plataforma sin duplicarlo.
//
// Las 14 fuentes estándar de jsPDF no tienen `₡` y lo borran sin avisar. Por eso los PDF que pintan texto de la
// base usan la fuente embebida (`fuenteEtiqueta`), y todo ese texto pasa por aquí: un carácter que la fuente no
// cubre sale como «?» visible, nunca desaparece.
import { fuenteEtiqueta } from "@/lib/pdf/etiquetas-fuente";
import { cubreCodePoint } from "@/lib/pdf/etiquetas-fuente-registro";

/** Sustituye por «?» lo que la fuente embebida no puede imprimir, y los saltos y tabuladores por un espacio. */
export function imprimible(texto: string): string {
  let out = "";
  for (const c of texto.replace(/[\r\n\t]+/g, " ")) {
    const cp = c.codePointAt(0) ?? 0x3f;
    out += cubreCodePoint(fuenteEtiqueta, cp) ? c : "?";
  }
  return out;
}
