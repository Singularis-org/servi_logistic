import { numericIdentifierSchema } from "@/lib/types/auth";
import type { TipoDocumentoDTO } from "@/lib/types/pais";
import { validarDocumento } from "@/lib/utils/documento";
import { validarTelefonoDelPais } from "@/lib/validacion/telefono";

// SLT-42 (design §4.2; R10, R11, R14-R17) — la regla del pais para el documento y el telefono de una
// persona usuaria, compartida por los puntos donde nace una: alta de usuario, postulacion de
// mensajero (al recibirla y al aprobarla) y maestro del alta de empresa.
//
// Modulo PURO: no lee la base ni el contexto. Quien llama ya resolvio el pais (`paisId`) y el tipo
// (`TipoDocumentoDTO`, o `null` si no es de ese pais), cada uno por su camino: el puerto de la
// empresa en curso o, en plataforma, el pais elegido. Asi la regla es una sola aunque el pais salga
// de sitios distintos.

/** R14, R16: el texto de cada motivo de rechazo del telefono. */
export const MENSAJE_TELEFONO = {
  invalido: "El teléfono no es válido para el país de la empresa",
  pais_sin_reglas: "El país de la empresa no tiene reglas de teléfono",
} as const;

/**
 * R11: un tipo de otro pais no se distingue de uno que no existe; para la empresa no existe. El
 * inactivo si lleva su propio texto: existe, pero ya no se puede elegir (desvio aceptado 2).
 */
export function rechazoDeTipo(tipo: TipoDocumentoDTO | null): string | null {
  if (tipo === null) return "El tipo de documento indicado no existe";
  if (!tipo.activo) return "El tipo de documento indicado ya no está activo";
  return null;
}

/** R17: la regla generica de antes, para cuando no hay empresa de la que sacar el pais. */
export function rechazoGenerico(valor: string): string | null {
  const r = numericIdentifierSchema().safeParse(valor);
  return r.success ? null : (r.error.issues[0]?.message ?? "valor no valido");
}

export type ResultadoTipoYDocumento =
  | { ok: true; tipo: TipoDocumentoDTO; documento: string }
  | { ok: false; en: "tipo" | "documento"; mensaje: string };

/**
 * R11 y R10: primero el tipo (si no vale, el documento no se mira: no hay regla con que medirlo) y
 * despues el documento con la regla de ese tipo. `documento` sale normalizado (`validarDocumento`).
 */
export function validarTipoYDocumento(tipo: TipoDocumentoDTO | null, documento: string): ResultadoTipoYDocumento {
  const motivoTipo = rechazoDeTipo(tipo);
  if (tipo === null || motivoTipo !== null) return { ok: false, en: "tipo", mensaje: motivoTipo ?? "" };
  const r = validarDocumento(documento, tipo);
  if (!r.ok) return { ok: false, en: "documento", mensaje: r.mensaje };
  return { ok: true, tipo, documento: r.valor };
}

/** R14, R16; R15: si vale, el numero nacional en digitos, que es lo que se guarda. */
export function validarTelefonoDePersona(
  raw: string,
  paisId: string,
): { ok: true; nacional: string } | { ok: false; mensaje: string } {
  const r = validarTelefonoDelPais(raw, paisId);
  return r.ok ? { ok: true, nacional: r.nacional } : { ok: false, mensaje: MENSAJE_TELEFONO[r.motivo] };
}

/** Como se llama cada dato en los `fieldErrors` de quien valida: cada formulario tiene sus claves. */
export interface CamposDePersona {
  telefono: string;
  documento: string;
  tipo: string;
}

export type ResultadoPersona =
  | { ok: true; telefono: string; documento: string; tipo: TipoDocumentoDTO }
  | { ok: false; fieldErrors: Record<string, string[]> };

/**
 * R10, R11, R14-R16 de una persona nueva: tipo, documento y telefono a la vez, y junta todos los
 * errores para que el formulario los pinte de una vez. Si todo vale, devuelve lo que se guarda.
 */
export function validarPersonaDelPais(
  paisId: string,
  persona: { telefono: string; documento: string; tipo: TipoDocumentoDTO | null },
  campos: CamposDePersona,
): ResultadoPersona {
  const fieldErrors: Record<string, string[]> = {};
  const doc = validarTipoYDocumento(persona.tipo, persona.documento);
  if (!doc.ok) fieldErrors[doc.en === "tipo" ? campos.tipo : campos.documento] = [doc.mensaje];
  const telefono = validarTelefonoDePersona(persona.telefono, paisId);
  if (!telefono.ok) fieldErrors[campos.telefono] = [telefono.mensaje];

  if (!doc.ok || !telefono.ok) return { ok: false, fieldErrors };
  return { ok: true, telefono: telefono.nacional, documento: doc.documento, tipo: doc.tipo };
}
