/** La plataforma: lo que se instala, el remitente del correo, el asistente, la doc de la API. */
export const MARCA = { nombre: "Servi Logistic" } as const;

/**
 * La empresa usuaria: la que cobra, paga, debe, gana y reparte. Nunca es la plataforma.
 * TRANSICIÓN: hasta SL-17 no hay `organizacion`, así que se usa un término neutro y no hay
 * membrete. SL-17 sustituye las tres formas por el nombre de la organización de la sesión.
 */
export const EMPRESA = {
  enFrase: "la empresa",
  alInicio: "La empresa",
  membrete: null as string | null,
} as const;
