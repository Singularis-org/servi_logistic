import type { AltaEmpresaDatos, AltaEmpresaResultado } from "@/lib/types/organizacion";

/** SL-17 (design §7.7) — persistencia del alta de empresa. */
export interface IOrganizacionRepository {
  /**
   * Una transacción con cerrojo por slug. Crea la organización, el maestro y las 3 filas del
   * podio del ranking (SL-17 T3.9), o, si el slug ya
   * existe, decide entre idempotencia y conflicto sin escribir. Un email o documento ya usados
   * revierten todo: no queda ni la organización.
   *
   * SL-20: la organización nace en `datos.paisId`. Un país inexistente es `invalida` `paisId`
   * (R6); repetir el alta (mismo slug y maestro) con otro país es `conflicto` `paisId` (R8).
   */
  altaEmpresa(datos: AltaEmpresaDatos): Promise<AltaEmpresaResultado>;
}
