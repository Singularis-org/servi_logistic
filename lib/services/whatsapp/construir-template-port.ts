// Ficha 474 — UNA sola fabrica del puerto de templates de produccion, para que la propagacion en
// linea (`lib/actions/plantillas.ts`) y el job de reintento (`whatsapp-template-sync-handler.ts`)
// creen los templates IGUAL. Si cada uno construyera el suyo, el reintento de una plantilla con
// documento podria crear el template SIN la cabecera (el proveedor del handle se olvida en uno de
// los dos y nada falla): es el fallo de «el composition root que no inyecta».
//
// SL-36 (design §9.1): recibe la credencial de la empresa YA leida (`whatsappDeLaEmpresa`), y los
// tres clientes de Meta se construyen con ella y con su `fetch` (R30). El resolutor del app id usa
// esa misma credencial: no vuelve a leer otra, asi que la app y el token son de la misma empresa.
import type { WhatsappDeLaEmpresa } from "@/lib/services/whatsapp/whatsapp-de-la-empresa";
import { WhatsappPlantillasClient } from "@/lib/clients/whatsapp-cloud";
import { ResolutorAppIdMeta } from "@/lib/clients/whatsapp-app-id";
import { WhatsappSubidaReanudableClient } from "@/lib/clients/whatsapp-subida-reanudable";
import { WhatsappTemplatePort } from "@/lib/services/whatsapp/WhatsappTemplatePort";
import { ProveedorHandleDocumentoEjemplo } from "@/lib/services/whatsapp/documento-ejemplo-plantilla";

export function construirWhatsappTemplatePort(wa: WhatsappDeLaEmpresa): WhatsappTemplatePort {
  const { config, fetchImpl } = wa;
  return new WhatsappTemplatePort(
    new WhatsappPlantillasClient({ config, fetchImpl }),
    config,
    new ProveedorHandleDocumentoEjemplo(
      new ResolutorAppIdMeta({ leerWhatsapp: async () => wa }),
      new WhatsappSubidaReanudableClient({ config, fetchImpl }),
    ),
  );
}
