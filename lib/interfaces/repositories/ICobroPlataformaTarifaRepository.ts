// SL-40 (design §5) — el valor global del cobro por orden y la excepción de cada empresa. Los
// importes son texto con dos decimales: el repositorio no convierte a número. La implementación
// corre en `comoPlataforma`, porque el superadmin no tiene empresa; quien decide que el actor puede
// es el servicio (R6).

export interface ICobroPlataformaTarifaRepository {
  /** El valor global con dos decimales, o `null` si nunca se fijó (sin configurar, R3). */
  leerGlobal(): Promise<string | null>;
  /** Crea o reemplaza la fila única del valor global (R1). */
  fijarGlobal(monto: string): Promise<void>;
  existeEmpresa(organizacionId: string): Promise<boolean>;
  /**
   * Fija la excepción de UNA empresa, o la quita con `null` (R2, R5). Devuelve `false` si la
   * empresa no existe, sin escribir nada (R7).
   */
  fijarDeEmpresa(organizacionId: string, monto: string | null): Promise<boolean>;
}
