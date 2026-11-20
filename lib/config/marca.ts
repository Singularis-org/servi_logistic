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

/**
 * SLT-136 (design §4): la marca de la factura de la plataforma (R7, R12, R14). La emite Singularis, dueña de la
 * plataforma, no la empresa usuaria.
 *
 * PROVISIONAL: `public/brand/logo-singularis.png` es un rectángulo negro de 400 × 100. El humano lo reemplaza por el
 * logo real con el MISMO nombre de archivo, sin tocar código; si cambian sus proporciones, se ajustan `ancho` y `alto`.
 * Es un PNG porque jsPDF no pinta SVG.
 */
export const MARCA_FACTURA = {
  emisor: "Singularis",
  pie: `Singularis · Plataforma ${MARCA.nombre}`,
  logo: { ruta: "/brand/logo-singularis.png", ancho: 400, alto: 100 },
} as const;
