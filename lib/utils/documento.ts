// SLT-42 (R10, P5) — validacion de un documento de identidad con la regla de su tipo, que es un
// dato del catalogo del pais (`tipo_identificacion`). Modulo PURO: sin DB, sin `process.env`.
//
// No se quitan guiones ni espacios: antes de esta ficha tampoco se aceptaban, y limpiar aqui haria
// que dos formas del mismo documento pasen como distintas frente al unico (R13).

export interface ReglaDocumento {
  caracteres: "digitos" | "alfanumerico";
  largoMin: number;
  largoMax: number;
}

export type ResultadoDocumento = { ok: true; valor: string } | { ok: false; mensaje: string };

/**
 * Valida `valor` contra `r`. En el alfanumerico se compara y se devuelve en MAYUSCULAS, para que el
 * mismo pasaporte escrito en minusculas no cuente como otro documento; `valor` es lo que se guarda.
 */
export function validarDocumento(valor: string, r: ReglaDocumento): ResultadoDocumento {
  const normalizado = r.caracteres === "alfanumerico" ? valor.toUpperCase() : valor;
  const forma = r.caracteres === "digitos" ? /^\d+$/ : /^[A-Z0-9]+$/;
  if (!forma.test(normalizado)) {
    return {
      ok: false,
      mensaje:
        r.caracteres === "digitos"
          ? "Solo se admiten dígitos, sin espacios ni guiones."
          : "Solo se admiten letras y dígitos, sin espacios ni guiones.",
    };
  }
  if (normalizado.length < r.largoMin || normalizado.length > r.largoMax) {
    const unidad = r.caracteres === "digitos" ? "dígitos" : "caracteres";
    return {
      ok: false,
      mensaje:
        r.largoMin === r.largoMax
          ? `Debe tener ${r.largoMin} ${unidad}.`
          : `Debe tener entre ${r.largoMin} y ${r.largoMax} ${unidad}.`,
    };
  }
  return { ok: true, valor: normalizado };
}
