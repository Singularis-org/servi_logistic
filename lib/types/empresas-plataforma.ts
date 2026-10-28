// SL-32 — tipos del listado de la pantalla «Empresas» del superadmin (R29, R35).

import type { DeudaPlataformaDTO } from "@/lib/types/cobro-plataforma";
import type { EstadoVisibleIntegracion, ServicioIntegracion } from "@/lib/types/integraciones";

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
  /**
   * SL-45 (R28, design §9): la deuda vigente de la empresa con la plataforma, con la regla de R13
   * (cargos − reversos − pagos vigentes). Es el mismo DTO que pinta la wallet: la pantalla elige
   * «Debe», «Al día» o «A favor» por `estado` y pinta `importe`, sin comparar ni restar.
   */
  deudaPlataforma: DeudaPlataformaDTO;
  /**
   * SL-45 (R28, ampliación de Carlos del 2026-10-24): lo que la empresa ha pagado a la plataforma, Σ
   * de sus pagos vigentes (un pago anulado no cuenta), con dos decimales. "0.00" si no ha pagado.
   */
  pagadoPlataforma: string;
  /** SL-20 (R9): el país de la empresa, fijado en el alta. Toda empresa tiene uno (NOT NULL). */
  pais: { id: string; nombre: string };
};

/** `forbidden`: el actor no es de la plataforma (R35). No lleva datos de ninguna empresa. */
export type ListarEmpresasResultado =
  | { status: "ok"; empresas: EmpresaListada[] }
  | { status: "forbidden" };

/**
 * SL-36 (design §11, R37) — el estado de UNA integración de UNA empresa, para el panel de SL-26.
 * Solo el estado: ni credenciales, ni datos públicos, ni el texto del último error.
 */
export type EstadoIntegracionDeEmpresa = {
  organizacionId: string;
  servicio: ServicioIntegracion;
  estado: EstadoVisibleIntegracion;
};

/** `forbidden`: el actor no es de la plataforma (R37, R6). No lleva datos de ninguna empresa. */
export type EstadoIntegracionesResultado =
  | { status: "ok"; estados: EstadoIntegracionDeEmpresa[] }
  | { status: "forbidden" };
