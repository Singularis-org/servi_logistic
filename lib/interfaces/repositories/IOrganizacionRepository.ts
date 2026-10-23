import type { AltaEmpresaDatos, AltaEmpresaResultado } from "@/lib/types/organizacion";

/** SL-17 (design §7.7) — persistencia del alta de empresa. */
export interface IOrganizacionRepository {
  /**
   * Una transacción con cerrojo por slug. Crea la organización y el maestro, o, si el slug ya
   * existe, decide entre idempotencia y conflicto sin escribir. Un email o documento ya usados
   * revierten todo: no queda ni la organización.
   */
  altaEmpresa(datos: AltaEmpresaDatos): Promise<AltaEmpresaResultado>;
}
