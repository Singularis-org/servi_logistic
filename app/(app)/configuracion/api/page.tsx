import { BookOpen, Download } from "lucide-react";
import Link from "next/link";

import { AppPage } from "@/components/shared/AppPage";
import { buttonVariants } from "@/components/ui/button";
import { RUTA_DESCARGA_GUIA_API_PDF, RUTA_GUIA_API } from "@/lib/ayuda/guia-api";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { listarApiKeys } from "@/lib/actions/api-keys";
import { apiKeysConfig } from "@/lib/config/api-keys";
import { cn } from "@/lib/utils";

import { ApiKeysModule, type ApiKeysPageData } from "./_components/ApiKeysModule";

const TEXTOS = {
  guia: "Guía de integración",
  guiaPdf: "Descargar guía en PDF",
} as const;

/**
 * Página de API keys (Server Component, feature 82). Autoriza server-side igual
 * que `/configuracion`: SOLO el rol `maestro` (R11); cualquier otro rol o sesión
 * ausente NO renderiza el módulo. Pre-carga en el servidor la primera página del
 * listado (R12) y la pasa al módulo cliente como `initialData`; si la pre-carga
 * no es `ok`, cae a un listado vacío en vez de fallar (R13). Alineada al shell
 * `AppPage` de `/configuracion` [D7].
 */
export default async function ApiPage() {
  const actor = await resolveActorFromSession();

  if (actor?.rol !== "maestro") {
    return (
      <AppPage title="API">
        <p role="alert" className="text-sm text-muted-foreground">
          No tienes permiso para acceder a esta sección.
        </p>
      </AppPage>
    );
  }

  const res = await listarApiKeys({
    page: 1,
    pageSize: apiKeysConfig.DEFAULT_PAGE_SIZE,
  });

  const data: ApiKeysPageData =
    res.status === "ok"
      ? { items: res.items, total: res.total, pageSize: res.pageSize }
      : { items: [], total: 0, pageSize: apiKeysConfig.DEFAULT_PAGE_SIZE };

  return (
    <AppPage
      title="API"
      description="Credenciales e integraciones de API"
      actions={<EnlacesGuiaApi />}
    >
      <ApiKeysModule initialData={data} />
    </AppPage>
  );
}

/**
 * SLT-80 (R1313, R1314) — la guía de integración y su PDF, a mano desde la cabecera. El PDF va
 * en `<a href>`: es una ruta GET que responde con un adjunto (D2), no una página que precargar.
 */
function EnlacesGuiaApi() {
  const clase = cn(buttonVariants({ variant: "outline", className: "h-11 md:h-8" }));
  return (
    <>
      <Link href={RUTA_GUIA_API} className={clase}>
        <BookOpen aria-hidden="true" />
        {TEXTOS.guia}
      </Link>
      <a href={RUTA_DESCARGA_GUIA_API_PDF} className={clase}>
        <Download aria-hidden="true" />
        {TEXTOS.guiaPdf}
      </a>
    </>
  );
}
