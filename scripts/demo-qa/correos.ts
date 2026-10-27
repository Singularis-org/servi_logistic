// SL-43 (R12, D7, D29) — los correos fijos de los usuarios demo.
//
// `servi-<slug de la empresa>-<perfil>@yopmail.com` (D29, Carlos, 2026-10-26): el buzón de yopmail
// es público y se puede leer sin cuenta; se acepta porque solo son datos demo de QA y entrar exige
// además `DEMO_QA_CONTRASENA`. El usuario de la API key NO pasa por aquí: su correo lo pone el
// servicio de API keys (`apikey+…@apikey.invalid`, D28).
//
// El borrado NO identifica a los usuarios demo por este dominio: lo hace por la empresa
// (`organizacion.es_demo`, `borrar.ts`). Un usuario `@yopmail.com` de una empresa real no se toca.

/** El dominio de los correos demo (D29). */
export const DOMINIO_CORREO_DEMO = "yopmail.com";

/** Tope del local-part de una dirección (RFC 5321 §4.5.3.1.1). */
export const MAXIMO_LOCAL_PART = 64;

/** Los perfiles de la demo, en el orden de la tabla de usuarios de la salida (R26). */
export const PERFILES_DEMO = [
  "maestro",
  "admin",
  "tienda-bodega",
  "tienda",
  "satelite",
  "mensajero-central",
  "mensajero-novedades",
  "mensajero-rechazos",
  "mensajero-satelite",
  "mensajero-satelite-2",
  "mensajero-recolector",
  "mensajero-corte",
  "mensajero-cierre-rechazado",
  "mensajero-cierre-pendiente",
  "mensajero-reposo",
  "api",
] as const;

/** Un local-part que pasa del tope de 64: la receta lo pararía antes de dar de alta a nadie. */
export class CorreoDemoDemasiadoLargo extends Error {
  constructor(readonly localPart: string) {
    super(`[demo-qa] el correo demo «${localPart}@${DOMINIO_CORREO_DEMO}» pasa de ${MAXIMO_LOCAL_PART} caracteres antes de la @`);
    this.name = "CorreoDemoDemasiadoLargo";
  }
}

/** R12, D29: `servi-<slug>-<perfil>@yopmail.com`. Lanza si el local-part pasa de 64. */
export function correoDemo(slug: string, perfil: string): string {
  const localPart = `servi-${slug}-${perfil}`;
  if (localPart.length > MAXIMO_LOCAL_PART) throw new CorreoDemoDemasiadoLargo(localPart);
  return `${localPart}@${DOMINIO_CORREO_DEMO}`;
}

/** Los correos de todos los perfiles de una empresa demo, salvo `api` (D28). Lanza si alguno pasa de 64. */
export function correosDemoDe(slug: string): string[] {
  return PERFILES_DEMO.filter((p) => p !== "api").map((p) => correoDemo(slug, p));
}
