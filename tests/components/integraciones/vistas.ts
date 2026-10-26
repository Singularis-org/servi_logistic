import type { VistaIntegracion } from "@/lib/interfaces/services/IIntegracionesService";
import { MARCAS_INTEGRACION, type ServicioIntegracion } from "@/lib/types/integraciones";

/** Una vista de integración para los tests de componentes de SL-36; por defecto, sin configurar. */
export function vista(servicio: ServicioIntegracion, cambios: Partial<VistaIntegracion> = {}): VistaIntegracion {
  return {
    id: null,
    servicio,
    marca: MARCAS_INTEGRACION[servicio],
    estado: "sin_configurar",
    datosPublicos: {},
    ultimoErrorTexto: null,
    ultimaPruebaAt: null,
    ultimoWebhookAt: null,
    ...cambios,
  };
}
