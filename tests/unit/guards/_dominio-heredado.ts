import { NOMBRE_HEREDADO } from "../../fixtures/nombre-heredado";

// SL-14 (R9-R11, D6) — el detector del dominio de la marca anterior y su lista de excepciones. Lo
// comparten la guardia de dominio de SL-14 (`tests/unit/guards/dominio-*-fuera.guardia.test.ts`) y
// `recursos-origen-fuera.guardia.test.ts` (SL-34). Este modulo NO es un test (no casa `*.test.*`):
// importarlo no registra los casos de ninguna guardia.
//
// El detector se compone por partes para que este archivo no contenga el dominio literal ni el
// nombre heredado (SL-15, R17).

const DOMINIO = new RegExp(NOMBRE_HEREDADO.minusculas + "\\.co(?![a-z0-9-])", "i");

/** Numeros de linea (desde 1) donde aparece el dominio de la marca anterior. */
export function lineasConDominio(texto: string): number[] {
  if (!DOMINIO.test(texto)) return [];
  const lineas: number[] = [];
  texto.split(/\r?\n/).forEach((linea, i) => {
    if (DOMINIO.test(linea)) lineas.push(i + 1);
  });
  return lineas;
}

export interface ExcepcionDominio {
  /** Ruta relativa al repo con `/`. Si termina en `/`, es un prefijo. */
  ruta: string;
  /** Ficha que retira la excepcion. Obligatoria: no hay excepciones permanentes. */
  ficha: string;
  motivo: string;
}

// SL-16 (R22) retiro las dos que dejo SL-14 (`docs/api/` y `openapi-406-evidencias-url`): sus
// ejemplos ya usan `example.com`. La lista queda vacia y no admite permanentes.
export const EXCEPCIONES_DOMINIO: readonly ExcepcionDominio[] = [];
