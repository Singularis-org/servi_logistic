import type { ArranqueSuperadminResultado } from "@/lib/types/arranque-superadmin";

// SL-32 — contrato del repositorio del comando de arranque. Sin tipos de Prisma a proposito: el
// servicio se escribe y se prueba antes de que exista el valor `superadmin` del enum, asi que el
// rol lo resuelve la implementacion, no quien la llama.

/** Datos del superadmin a crear. Solo viaja el hash: la contrasena en claro no sale del servicio (R16). */
export type CrearSuperadminData = {
  email: string;
  passwordHash: string;
  nombre: string;
  telefono: string;
  documento: string;
  /** `tipo_identificacion.value` pedido por `SUPERADMIN_TIPO_DOCUMENTO`. */
  tipoDocumento: string;
};

/** Lo que puede pasar al escribir. La entrada invalida no llega aqui: la para el servicio. */
export type CrearSuperadminResultado = Exclude<
  ArranqueSuperadminResultado,
  { status: "entrada_invalida" }
>;

export interface IArranqueSuperadminRepository {
  /**
   * En una transaccion con cerrojo (R17): si ya hay un superadmin devuelve `ya_existe` sin escribir
   * (R14); si falta el rol o el tipo de documento, `catalogo_incompleto`; si el email o el
   * documento son de otro usuario, `conflicto` sin tocarlo (R15). Si no, crea el superadmin activo.
   */
  crearSiNoExiste(data: CrearSuperadminData): Promise<CrearSuperadminResultado>;
}
