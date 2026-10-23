import type { FichaJira } from "./contexto-empresa";

// SL-17 (design §8) — las dos listas que las guardias leen para tolerar un archivo que se sale
// del aislamiento por empresa. Cada entrada nombra el archivo (ruta desde la raiz del repo), la
// ficha que lo justifica y por que. Solo pueden BAJAR: un archivo nuevo que no filtra pone el
// gate en rojo hasta que alguien escribe aqui su motivo.

export type ExcepcionDeAislamiento = {
  readonly archivo: string;
  readonly ficha: FichaJira;
  readonly motivo: string;
};

/** R25, R26: archivos con SQL a mano sobre tablas de negocio que no filtran por `organizacion_id`. */
export const EXCEPCIONES_SQL_A_MANO: readonly ExcepcionDeAislamiento[] = [];

/** R15, R27: archivos que llaman a `comoPlataforma(` y por tanto operan sin filtro de empresa. */
export const EXCEPCIONES_DE_PLATAFORMA: readonly ExcepcionDeAislamiento[] = [
  {
    archivo: "lib/db/para-cada-empresa.ts",
    ficha: "SL-17",
    motivo: "listar las organizaciones para correr un cron o job una vez por empresa (R16)",
  },
];
