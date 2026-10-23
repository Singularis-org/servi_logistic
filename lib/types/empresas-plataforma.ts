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
};

/** `forbidden`: el actor no es de la plataforma (R35). No lleva datos de ninguna empresa. */
export type ListarEmpresasResultado =
  | { status: "ok"; empresas: EmpresaListada[] }
  | { status: "forbidden" };
