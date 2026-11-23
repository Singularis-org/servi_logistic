import { readFile } from "node:fs/promises";
import path from "node:path";

import { notFound } from "next/navigation";

import { leerDocumentoAyuda } from "@/lib/ayuda/catalogo";
import { puedeLeerDocumento } from "@/lib/ayuda/documento";
import { SLUG_GUIA_API } from "@/lib/ayuda/guia-api";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";

/**
 * SLT-80 «Guía de integración por API en la ayuda» (D3, R1307, R1312) — la colección de Postman del
 * canal por API key, con sesión y con la MISMA regla de lectura que la guía: quien no puede leer la
 * guía recibe el mismo `notFound()` que un documento que no existe.
 *
 * Se sirven los bytes del archivo del repositorio tal cual, sin copia (R1312). Llega a producción por
 * `outputFileTracingIncludes` de `next.config.ts` (clave `/ayuda/descargas/postman`).
 */
export const dynamic = "force-dynamic";

/** La colección, relativa a la raíz del proyecto. La única: no hay otra copia en el repositorio. */
const ARCHIVO_POSTMAN = path.join("docs", "api", "servi-logistic-api-key.postman_collection.json");

export async function GET(): Promise<Response> {
  const actor = await resolveActorFromSession();
  const guia = await leerDocumentoAyuda(SLUG_GUIA_API);
  if (guia === null || !puedeLeerDocumento(guia, actor?.rol ?? null)) notFound();

  const coleccion = await readFile(path.join(process.cwd(), ARCHIVO_POSTMAN));

  return new Response(new Uint8Array(coleccion) as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${path.basename(ARCHIVO_POSTMAN)}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
