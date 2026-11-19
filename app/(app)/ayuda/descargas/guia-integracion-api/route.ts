import { notFound } from "next/navigation";

import { analizarBloques } from "@/lib/ayuda/bloques";
import { leerDocumentoAyuda } from "@/lib/ayuda/catalogo";
import { puedeLeerDocumento } from "@/lib/ayuda/documento";
import { SLUG_GUIA_API } from "@/lib/ayuda/guia-api";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { construirPdfGuiaApi } from "@/lib/pdf/guia-api-pdf";
import { LOGO_CORREO_PNG_BASE64 } from "@/lib/services/email/plantillas/logo-correo";

/**
 * SLT-80 «Guía de integración por API en la ayuda» (D2, R1307, R1309) — el PDF de la guía, generado
 * en el momento desde el MISMO `.md` que pinta `/ayuda/oficina/guia-integracion-api` (R1301).
 *
 * La puerta es la de la página de Ayuda (`[...slug]/page.tsx`): el actor de la sesión y
 * `puedeLeerDocumento` sobre el documento de la guía. Quien no puede leerla recibe el MISMO
 * `notFound()` que un documento que no existe (R1307): la respuesta no dice si la guía existe.
 * `middleware.ts` no se toca (D3): sin cookie de sesión ni siquiera llega aquí.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const actor = await resolveActorFromSession();
  const doc = await leerDocumentoAyuda(SLUG_GUIA_API);
  if (doc === null || !puedeLeerDocumento(doc, actor?.rol ?? null)) notFound();

  const logo = Uint8Array.from(Buffer.from(LOGO_CORREO_PNG_BASE64, "base64"));
  const pdf = construirPdfGuiaApi(analizarBloques(doc.cuerpo), doc, logo);

  return new Response(pdf as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="Guia-Integracion-API-Servi-Logistic-${doc.actualizado}.pdf"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
