import { ambienteDePruebas } from "@/lib/config/ambiente";

// SLT-257 — franja «Sandbox» arriba de todas las pantallas, solo en el ambiente de pruebas.
//
// Server Component: lee la variable en el servidor y, fuera del sandbox, no pinta nada (ni un
// contenedor vacio, R2). Colores fijos de marca que no giran con el tema: negro sobre amarillo,
// nunca amarillo sobre blanco (R7). Va en el flujo normal, sin sticky/fixed/z-index, para no tapar
// barras pegadas ni Sheets (R11); `shrink-0` la deja a su alto natural en el body flex (R9). El
// padding de arriba incluye el area segura de iOS para la PWA con barra `black-translucent` (R8).

interface BannerAmbientePruebasProps {
  /** Texto de la franja. Prop para un i18n futuro; por decision (R4) es «Sandbox». */
  texto?: string;
}

export function BannerAmbientePruebas({
  texto = "Sandbox",
}: BannerAmbientePruebasProps = {}) {
  if (!ambienteDePruebas()) return null;
  return (
    <div className="shrink-0 bg-brand-light text-brand-dark text-center text-xs font-semibold tracking-wide pb-1 pt-[calc(env(safe-area-inset-top)+0.25rem)]">
      {texto}
    </div>
  );
}
