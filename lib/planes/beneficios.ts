import { z } from "zod";

import { collapseSpaces, stripDiacritics } from "@/lib/geo/normalize";

// SLT-214 (design §3.1; R2–R5, R25) — los beneficios de texto de un plan: el catálogo de íconos, el esquema que
// valida toda escritura (crear, programar y aplicar la versión) y las líneas de «qué cambia». Sin React: lo usan
// el servidor, el formulario y las vistas. El componente que pinta cada ícono vive en `components/shared/planes`.

/**
 * R5: los 12 íconos, en el orden en que se ofrecen. La clave es la que guarda la base: el CHECK
 * `plan_beneficio_icono_check` de 20261120120000 admite exactamente estas.
 */
export const ICONOS_DE_BENEFICIO = [
  "equipo",
  "soporte",
  "reloj_24h",
  "rayo",
  "estrella",
  "escudo",
  "cohete",
  "regalo",
  "grafica",
  "camion",
  "check",
  "corazon",
] as const;
export type IconoDeBeneficio = (typeof ICONOS_DE_BENEFICIO)[number];

/** R5: el nombre que ve el superadmin al elegir el ícono. */
export const NOMBRE_DEL_ICONO: Record<IconoDeBeneficio, string> = {
  equipo: "Equipo de trabajo",
  soporte: "Soporte",
  reloj_24h: "Reloj 24 h",
  rayo: "Rayo",
  estrella: "Estrella",
  escudo: "Escudo",
  cohete: "Cohete",
  regalo: "Regalo",
  grafica: "Gráfica",
  camion: "Camión",
  check: "Check",
  corazon: "Corazón",
};

export type Beneficio = { icono: IconoDeBeneficio; texto: string };

export const TEXTO_VACIO = "Escribe el texto del beneficio.";
export const TEXTO_LARGO = "El texto del beneficio admite hasta 120 caracteres.";
export const BENEFICIO_REPETIDO = "Ya hay un beneficio con ese texto";

/**
 * R4: dos textos son el mismo si coinciden sin mayúsculas, tildes ni espacios de más. `\p{Diacritic}` también
 * quita la virgulilla de la «ñ» («Año» = «Ano»); el spec lo acepta (design §3.1).
 */
export function claveDelBeneficio(texto: string): string {
  return stripDiacritics(collapseSpaces(texto)).toLowerCase();
}

/** R3: un ícono del catálogo. Lo usan el esquema y la lectura de `plan_beneficio` (design §3.3). */
export const iconoDeBeneficioSchema = z.enum(ICONOS_DE_BENEFICIO);

// R2: el largo se mide ya sin los espacios de los extremos, y así se guarda; el CHECK de la base exige lo mismo.
export const beneficioSchema = z
  .object({
    icono: iconoDeBeneficioSchema,
    texto: z.string().trim().min(1, TEXTO_VACIO).max(120, TEXTO_LARGO),
  })
  .strict();

/** R4: el error va en cada repetido después del primero, para que el formulario lo pinte junto a su campo. */
function sinRepetidos(beneficios: readonly Beneficio[], ctx: z.RefinementCtx): void {
  const vistas = new Set<string>();
  beneficios.forEach((b, i) => {
    const clave = claveDelBeneficio(b.texto);
    if (vistas.has(clave)) ctx.addIssue({ code: "custom", path: [i, "texto"], message: BENEFICIO_REPETIDO });
    vistas.add(clave);
  });
}

// R1: sin tope de cantidad; la lista vacía es válida (R9).
export const beneficiosSchema = z.array(beneficioSchema).superRefine(sinRepetidos);

export const CAMBIAN_ICONOS_U_ORDEN = "Cambian los íconos o el orden de los beneficios.";

function mismaLista(antes: readonly Beneficio[], despues: readonly Beneficio[]): boolean {
  return antes.length === despues.length && antes.every((b, i) => b.icono === despues[i].icono && b.texto === despues[i].texto);
}

/**
 * R25: las líneas de «Esto es lo que cambia:» de los beneficios. Agregados en el orden de después y quitados en
 * el de antes, comparados con la clave de R4. Si ninguno entra ni sale pero la lista difiere (ícono, orden o
 * mayúsculas), una sola línea (P8). Sin diferencia, ninguna.
 */
export function cambiosDeBeneficios(antes: readonly Beneficio[], despues: readonly Beneficio[]): string[] {
  const clavesAntes = new Set(antes.map((b) => claveDelBeneficio(b.texto)));
  const clavesDespues = new Set(despues.map((b) => claveDelBeneficio(b.texto)));
  const lineas = [
    ...despues.filter((b) => !clavesAntes.has(claveDelBeneficio(b.texto))).map((b) => `Se agrega: ${b.texto}`),
    ...antes.filter((b) => !clavesDespues.has(claveDelBeneficio(b.texto))).map((b) => `Se quita: ${b.texto}`),
  ];
  if (lineas.length > 0) return lineas;
  return mismaLista(antes, despues) ? [] : [CAMBIAN_ICONOS_U_ORDEN];
}
