import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { EntornoDelReporte, EnviarReporteBugDatos, PrepararSubidasImagenesInput } from "@/lib/types/reporte-bug";

// SLT-87 (design §5) — enviar un reporte de problema. Resultados de dominio, sin HTTP: `unauthenticated`
// y `validation_error` los resuelve la Server Action antes de llamar aquí.

/**
 * R9 (SLT-87): «enviado» no lleva ni el id ni ningún dato del reporte; SLT-98 R14: tampoco enlaces ni
 * datos de las imágenes. SLT-98 R11: `imagenes_invalidas` lleva los ids (los `imagenId` que dio
 * `prepararSubidas`) de las imágenes que no pasaron la validación, para que el panel las marque.
 */
export type EnviarReporteBugServiceResult =
  | { status: "enviado" }
  | { status: "forbidden" }
  | { status: "imagenes_invalidas"; imagenes: string[] };

/** SLT-98 (design §4.1; R9): un permiso por imagen, en el orden de la entrada. */
export interface PermisoSubidaImagen {
  imagenId: string;
  url: string;
}

export type PrepararSubidasServiceResult =
  | { status: "listas"; permisos: PermisoSubidaImagen[] }
  | { status: "forbidden" }
  // SLT-98 (design §16.4; R25): el tope diario está lleno. Sin el conteo, la fecha ni el usuario.
  | { status: "sin_cupo_imagenes" };

export interface IReporteBugService {
  /**
   * Solo un usuario de empresa (R11). Guarda y después manda una copia por destinatario; un fallo del
   * correo se registra y no cambia la respuesta (R15–R17). Un fallo al guardar se propaga.
   * SLT-98 (R10, R11, R13, R20, R21): antes de guardar valida cada imagen leyéndola del almacén.
   */
  enviar(actor: Actor, entrada: EnviarReporteBugDatos, entorno: EntornoDelReporte): Promise<EnviarReporteBugServiceResult>;
  /**
   * SLT-98 (R9): solo un usuario de empresa. La ruta la fija el servidor con la sesión. Un fallo del
   * almacén se propaga.
   * SLT-98 (R24–R27): antes del almacén cuenta los permisos en el tope diario; sin cupo no toca el
   * almacén, y si el almacén falla devuelve lo contado antes de propagar.
   */
  prepararSubidas(actor: Actor, entrada: PrepararSubidasImagenesInput): Promise<PrepararSubidasServiceResult>;
}
