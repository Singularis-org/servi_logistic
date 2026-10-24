// SL-32 — tipos del listado de la pantalla «Empresas» del superadmin (R29, R35).

/**
 * Una empresa del listado. Solo lo que pinta la tabla: ni `password_hash`, ni telefono, ni
 * documento de sus maestros (`design.md > Ruta y piezas`).
 */
export type EmpresaListada = {
  id: string;
  nombre: string;
  slug: string;
  creadaEn: Date;
  /** Los usuarios de rol `maestro` de la empresa, por orden de alta. Puede venir vacio. */
  maestros: { nombre: string; email: string }[];
  /**
   * SL-40 (R10): la excepción del cobro por orden, con dos decimales, o `null` si la empresa usa el
   * valor global. La tarifa vigente la elige la pantalla entre textos ya derivados, sin aritmética.
   */
  cobroPorOrden: string | null;
};

/** `forbidden`: el actor no es de la plataforma (R35). No lleva datos de ninguna empresa. */
export type ListarEmpresasResultado =
  | { status: "ok"; empresas: EmpresaListada[] }
  | { status: "forbidden" };
