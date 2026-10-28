// SL-20 (R17, design §2.1) — la regla del codigo oficial de un nodo geografico.
//
// Pura: la usan el alta a mano (GeografiaService) y la carga CSV (planificarDivision), y tiene que
// ser LA MISMA en los dos caminos, o un CSV admitiria un codigo que el alta rechaza.
//
// La regla de Costa Rica (1/3/5 digitos y prefijo del padre) NO se reconoce por el codigo `CR`:
// sale de las columnas `digitos_codigo_nivel_n` de la fila del pais (docs/architecture.md >
// Principios 4). Un pais nuevo con regla propia solo necesita esos tres numeros.

import type { NivelGeografico } from "@/lib/types/geografia-nodo";

/**
 * Lo unico del pais que necesita la regla. Estructural a proposito: lo cumple la fila de Prisma y
 * el DTO del pais sin que este modulo dependa de ninguno de los dos.
 */
export interface ReglaDeCodigoDePais {
  digitosCodigoNivel1: number | null;
  digitosCodigoNivel2: number | null;
  digitosCodigoNivel3: number | null;
}

export const CODIGO_LIBRE_MAX = 20;

const DIGITOS_DEL_NIVEL: Record<NivelGeografico, keyof ReglaDeCodigoDePais> = {
  provincia: "digitosCodigoNivel1",
  canton: "digitosCodigoNivel2",
  distrito: "digitosCodigoNivel3",
};

const CODIGO_LIBRE = new RegExp(`^\\S{1,${CODIGO_LIBRE_MAX}}$`);

/**
 * ¿Tiene el pais regla de digitos? La base exige que las tres columnas sean nulas o no nulas a la
 * vez (`CHECK` de design §2.1); una mezcla aqui es un dato roto, y aceptar codigos en silencio con
 * media regla seria peor que fallar.
 */
export function tieneReglaDeCodigo(pais: ReglaDeCodigoDePais): boolean {
  const puestas = Object.values(DIGITOS_DEL_NIVEL).filter((k) => pais[k] !== null).length;
  if (puestas === 0) return false;
  if (puestas === 3) return true;
  throw new Error(
    `regla de codigo del pais incompleta: digitos ${pais.digitosCodigoNivel1}/${pais.digitosCodigoNivel2}/${pais.digitosCodigoNivel3}`,
  );
}

/**
 * Valida el codigo de un nodo. Devuelve `null` si es valido y el motivo si no.
 *
 * `codigo` llega ya recortado; un espacio dentro es un error, no algo que se arregle aqui.
 * `codigoPadre` es el codigo que tiene (o va a tener) el padre; `null` para una provincia o para un
 * padre sin codigo.
 */
export function validarCodigo(
  pais: ReglaDeCodigoDePais,
  nivel: NivelGeografico,
  codigo: string,
  codigoPadre: string | null,
): string | null {
  if (!tieneReglaDeCodigo(pais)) {
    return CODIGO_LIBRE.test(codigo)
      ? null
      : `El código debe tener de 1 a ${CODIGO_LIBRE_MAX} caracteres, sin espacios.`;
  }

  const digitos = pais[DIGITOS_DEL_NIVEL[nivel]] as number;
  if (!new RegExp(`^[0-9]{${digitos}}$`).test(codigo)) {
    return `El código debe tener exactamente ${digitos} ${digitos === 1 ? "dígito" : "dígitos"}.`;
  }
  if (nivel === "provincia") return null;
  if (codigoPadre === null) {
    return "El nodo padre no tiene código, así que este nodo no puede llevarlo.";
  }
  if (!codigo.startsWith(codigoPadre)) {
    return `El código debe empezar por el código de su padre («${codigoPadre}»).`;
  }
  return null;
}
