import { MARCA } from "@/lib/config/marca";

export type FondoDeLogo = "claro" | "oscuro";

/** Por debajo de este ancho el horizontal no se lee: `docs/marca.md > Reglas de uso`. */
export const ANCHO_MINIMO_HORIZONTAL = 140;

/** Proporción del `viewBox` de los dos horizontales (`8 6 733 214`). */
const VIEWBOX_HORIZONTAL = { ancho: 733, alto: 214 } as const;

const ARCHIVOS = {
  claro: {
    horizontal: "/brand/logo-horizontal-fondo-claro.svg",
    isotipo: "/brand/isotipo.svg",
  },
  oscuro: {
    horizontal: "/brand/logo-horizontal-fondo-oscuro.svg",
    isotipo: "/brand/isotipo-mono-blanco.svg",
  },
} as const;

function esHorizontal(ancho: number): boolean {
  return ancho >= ANCHO_MINIMO_HORIZONTAL;
}

export function archivoDeLogo(fondo: FondoDeLogo, ancho: number): string {
  const variante = esHorizontal(ancho) ? "horizontal" : "isotipo";
  return ARCHIVOS[fondo][variante];
}

function altoDeLogo(ancho: number): number {
  if (!esHorizontal(ancho)) return ancho;
  return Math.round((ancho * VIEWBOX_HORIZONTAL.alto) / VIEWBOX_HORIZONTAL.ancho);
}

interface LogoProps {
  /** Obligatorio: cada llamada decide la variante según la superficie donde se pinta. */
  fondo: FondoDeLogo;
  /** En px. Decide entre horizontal e isotipo (`ANCHO_MINIMO_HORIZONTAL`). */
  ancho: number;
  className?: string;
  /** Saca la imagen del árbol de accesibilidad. Para una variante montada pero invisible
   * (p. ej. cruzada por opacidad), que no debe anunciar el nombre una segunda vez. */
  oculto?: boolean;
}

export function Logo({ fondo, ancho, className, oculto = false }: Readonly<LogoProps>) {
  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG estático: next/image no lo optimiza
    <img
      src={archivoDeLogo(fondo, ancho)}
      alt={MARCA.nombre}
      width={ancho}
      height={altoDeLogo(ancho)}
      className={className}
      aria-hidden={oculto || undefined}
    />
  );
}
