// SL-40 (design §5) — el valor global del cobro por orden. Los importes son texto con dos decimales:
// el repositorio no convierte a número. La implementación corre en `comoPlataforma`, porque el
// superadmin no tiene empresa; quien decide que el actor puede es el servicio (R6). SLT-126 (R2): ya
// no hay cobro por orden propio de cada empresa.

export interface ICobroPlataformaTarifaRepository {
  /** El valor global con dos decimales, o `null` si nunca se fijó (sin configurar, R3). */
  leerGlobal(): Promise<string | null>;
  /** Crea o reemplaza la fila única del valor global (R1). */
  fijarGlobal(monto: string): Promise<void>;
}
