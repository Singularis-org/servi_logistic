import { BookOpen, Download, FileJson } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";
import { RUTA_DESCARGA_GUIA_API_PDF, RUTA_DESCARGA_POSTMAN } from "@/lib/ayuda/guia-api";
import { cn } from "@/lib/utils";

const TEXTOS_POR_DEFECTO = {
  etiqueta: "Descargas y referencia de la API",
  pdf: "Descargar PDF",
  swagger: "Referencia interactiva (Swagger)",
  swaggerPestanaNueva: "(se abre en una pestaña nueva)",
  postman: "Colección de Postman",
} as const;

export type TextosAccionesGuiaApi = typeof TEXTOS_POR_DEFECTO;

/** La referencia interactiva que ya sirve la app; no es una descarga de esta ficha. */
const RUTA_SWAGGER = "/api-docs";

/**
 * SLT-80 (R1308) — las tres acciones que acompañan a la guía de integración en Ayuda.
 *
 * Son `<a href>` y no `next/link`: el PDF y la colección son rutas GET del servidor que
 * responden con un adjunto (D2, D3). `Link` las precargaría y trataría como navegación
 * de cliente, y una descarga no es una página. Las URLs salen de `lib/ayuda/guia-api.ts`
 * (R1315) para no desfasarse de las rutas reales.
 */
export function AccionesGuiaApi({
  textos = TEXTOS_POR_DEFECTO,
}: Readonly<{ textos?: TextosAccionesGuiaApi }>) {
  const clase = cn(buttonVariants({ variant: "outline", className: "h-11 md:h-8" }));

  return (
    <nav aria-label={textos.etiqueta} className="mb-6 flex flex-wrap gap-2">
      <a href={RUTA_DESCARGA_GUIA_API_PDF} className={clase}>
        <Download aria-hidden="true" />
        {textos.pdf}
      </a>
      <a href={RUTA_SWAGGER} target="_blank" rel="noopener noreferrer" className={clase}>
        <BookOpen aria-hidden="true" />
        {textos.swagger}
        <span className="sr-only"> {textos.swaggerPestanaNueva}</span>
      </a>
      <a href={RUTA_DESCARGA_POSTMAN} className={clase}>
        <FileJson aria-hidden="true" />
        {textos.postman}
      </a>
    </nav>
  );
}
