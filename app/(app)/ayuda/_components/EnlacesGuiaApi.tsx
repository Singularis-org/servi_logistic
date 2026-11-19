import { BookOpen, Download } from "lucide-react";
import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { RUTA_DESCARGA_GUIA_API_PDF, RUTA_GUIA_API } from "@/lib/ayuda/guia-api";
import { cn } from "@/lib/utils";

const TEXTOS_POR_DEFECTO = {
  guia: "Guía de integración",
  guiaPdf: "Descargar guía en PDF",
} as const;

export type TextosEnlacesGuiaApi = typeof TEXTOS_POR_DEFECTO;

/**
 * SLT-80 (R1313, R1314) — la guía de integración y su PDF, a mano desde la cabecera de
 * `Configuración › API` y `Configuración › Integraciones`. El PDF va en `<a href>`: es una ruta
 * GET que responde con un adjunto (D2), no una página que precargar.
 */
export function EnlacesGuiaApi({
  textos = TEXTOS_POR_DEFECTO,
}: Readonly<{ textos?: TextosEnlacesGuiaApi }>) {
  const clase = cn(buttonVariants({ variant: "outline", className: "h-11 md:h-8" }));
  return (
    <>
      <Link href={RUTA_GUIA_API} className={clase}>
        <BookOpen aria-hidden="true" />
        {textos.guia}
      </Link>
      <a href={RUTA_DESCARGA_GUIA_API_PDF} className={clase}>
        <Download aria-hidden="true" />
        {textos.guiaPdf}
      </a>
    </>
  );
}
