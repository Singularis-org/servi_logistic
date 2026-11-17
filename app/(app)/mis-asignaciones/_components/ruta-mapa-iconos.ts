// SLT-166 (R539, design §11) — el HTML de los marcadores del mapa de ruta. Función pura, sin
// `leaflet`: `RutaMapaInner` la envuelve en un `L.divIcon` y el test la lee sin montar el mapa.
//
// Los colores son VARIABLES de la paleta, nunca un hex: el `divIcon` vive en el DOM de la página, así
// que las variables resuelven con el tema del documento. Antes eran `#2563eb` y `#16a34a`, dos
// colores que no son de la marca (`docs/marca.md`).
//
// Por qué `--color-*` y no `--navy`/`--brand-light`/`--success` (los nombres de `design.md §11`):
// esos tres no existen en `app/globals.css`; un `var()` a una variable que no existe pinta el
// marcador transparente sin dar ningún error. Los que sí existen son los de `@theme`
// (`--color-brand-light` = Amarillo Señal, `--color-brand-dark` = Negro Servi) y no giran con el
// tema: el amarillo con número negro se lee igual sobre los tiles claros de OpenStreetMap.

export type TipoMarcador = "siguiente" | "pendiente" | "gestionada" | "origen";

/** Variables de la paleta que pinta cada marcador. Exportadas para la leyenda (misma fuente). */
export const COLOR_MARCADOR: Record<TipoMarcador, { fondo: string; texto: string }> = {
  // Canvas v35 (RepartoMapa): la siguiente parada, amarilla con número negro y anillo.
  siguiente: { fondo: "var(--color-brand-light)", texto: "var(--color-brand-dark)" },
  // Pendientes: negras con número blanco.
  pendiente: { fondo: "var(--color-brand-dark)", texto: "var(--color-white)" },
  // Gestionadas: gris cálido de la paleta con check.
  gestionada: { fondo: "var(--color-asfalto-4)", texto: "var(--color-white)" },
  // Origen «Tú».
  origen: { fondo: "var(--color-success)", texto: "var(--color-white)" },
};

/** Lado del área que se toca: 44 px (R493), aunque el círculo dibujado sea más chico. */
export const LADO_MARCADOR = 44;

const SOMBRA = "0 1px 4px color-mix(in srgb, var(--color-brand-dark) 40%, transparent)";
const CHECK = "✓";

/** Nombre accesible del marcador: solo la posición, sin datos de la orden (van en el tooltip). */
export function nombreMarcador(tipo: TipoMarcador, numero?: number | null): string {
  if (tipo === "origen") return "Tú";
  const parada = numero === null || numero === undefined ? "Parada sin posición" : `Parada ${numero}`;
  if (tipo === "siguiente") return `${parada}, siguiente`;
  if (tipo === "gestionada") return `${parada}, gestionada`;
  return parada;
}

/**
 * HTML del icono. `numero` es la posición en la ruta (`null` = sin optimizar todavía: «·», como la
 * tarjeta). El texto `sr-only` da al marcador (Leaflet lo vuelve `role="button"`) un nombre.
 */
export function htmlMarcador(tipo: TipoMarcador, numero?: number | null): string {
  const { fondo, texto } = COLOR_MARCADOR[tipo];
  const nombre = `<span class="sr-only">${nombreMarcador(tipo, numero)}</span>`;

  if (tipo === "origen") {
    return (
      `<div style="display:flex;flex-direction:column;align-items:center;gap:2px">` +
      `<div style="width:18px;height:18px;border-radius:9999px;background:${fondo};border:3px solid var(--color-white);box-shadow:${SOMBRA}"></div>` +
      `<span aria-hidden="true" style="border-radius:4px;padding:0 4px;background:${fondo};color:${texto};font-size:11px;font-weight:700;line-height:16px">Tú</span>` +
      `${nombre}</div>`
    );
  }

  const esSiguiente = tipo === "siguiente";
  const lado = esSiguiente ? 34 : 28;
  const contenido = tipo === "gestionada" ? CHECK : numero === null || numero === undefined ? "·" : String(numero);
  // El anillo de la siguiente: Negro Servi alrededor del borde blanco, para que destaque entre las negras.
  const anillo = esSiguiente ? `, 0 0 0 5px var(--color-brand-dark)` : "";
  return (
    `<div style="display:flex;align-items:center;justify-content:center;width:${LADO_MARCADOR}px;height:${LADO_MARCADOR}px">` +
    `<div aria-hidden="true" style="display:flex;align-items:center;justify-content:center;width:${lado}px;height:${lado}px;border-radius:9999px;background:${fondo};color:${texto};font-size:${esSiguiente ? 14 : 12}px;font-weight:800;border:2px solid var(--color-white);box-shadow:${SOMBRA}${anillo}">${contenido}</div>` +
    `${nombre}</div>`
  );
}
