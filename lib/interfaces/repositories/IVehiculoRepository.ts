import type { VehiculoDTO } from "@/lib/types/vehiculos";

// Contrato de acceso a datos del catalogo vehiculos. Solo queries Prisma, sin logica de negocio
// (esa vive en VehiculoService).
//
// SL-42 (design §2, §4.2): el catalogo es de la plataforma. Las escrituras son del superadmin y cada
// una que ESCRIBE deja su fila en `vehiculo_rastro` en la misma `$transaction` (R21). El borrado se
// retiro (P1, R8): desactivar lo sustituye, asi que no hay `delete` ni conteo de usos.
export interface IVehiculoRepository {
  /**
   * Las filas del catalogo, ordenadas por name. `soloActivos` es para las elecciones nuevas de
   * las empresas (R18); sin el, activos e inactivos (la pantalla del superadmin, R2).
   */
  findMany(opciones?: { soloActivos?: boolean }): Promise<VehiculoDTO[]>;
  /** La fila por id; `null` si no existe. */
  findById(id: string): Promise<VehiculoDTO | null>;
  /**
   * La fila cuyo `name` coincide EXACTAMENTE; `null` si no hay. Sirve para dar el
   * `conflict` como resultado de dominio en vez de dejar escapar la violacion del
   * UNIQUE como error crudo de Postgres.
   */
  findByName(name: string): Promise<VehiculoDTO | null>;
  /** Alta, activa, con su rastro `vehiculo_creado` (R4, R21). */
  create(name: string, actorUsuarioId: string): Promise<VehiculoDTO>;
  /**
   * Renombra con su rastro `vehiculo_renombrado` (anterior y nuevo). `null` si la fila no existe.
   * Si ya tiene ese nombre la devuelve sin escribir ni dejar rastro (R5, R21).
   */
  rename(id: string, name: string, actorUsuarioId: string): Promise<VehiculoDTO | null>;
  /**
   * Activa o desactiva con su rastro. `null` si la fila no existe. Si ya esta en ese estado la
   * devuelve sin escribir ni dejar rastro (R6, R21). No toca a quien lo referencia (R6).
   */
  setActivo(id: string, activo: boolean, actorUsuarioId: string): Promise<VehiculoDTO | null>;
}
