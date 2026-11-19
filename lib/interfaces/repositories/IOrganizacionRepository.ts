import type { AltaEmpresaDatos, AltaEmpresaRepeticion, AltaEmpresaResultado } from "@/lib/types/organizacion";

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
   * Enmienda 2026-10-26 (R45): un alta NUEVA en un país con `disponible = false` es `invalida`
   * `paisId` sin escribir nada; la repetición de una empresa que ya existe no mira la disponibilidad.
   */
  altaEmpresa(datos: AltaEmpresaDatos): Promise<AltaEmpresaResultado>;
  /**
   * SLT-42 (decision del humano tras la tanda 2, punto 7): si el alta REPITE una empresa que ya
   * existe (mismo slug), su desenlace —`ya_existe`, o `conflicto` `slug`/`paisId`— con la MISMA
   * regla que `altaEmpresa`; `null` si el slug esta libre. Solo lee. El servicio lo consulta ANTES
   * de validar el pais y los datos del maestro, como SL-20 §13: repetir un alta siempre da
   * `ya_existe`, aunque el pais haya quedado incompleto despues.
   */
  repeticion(datos: AltaEmpresaRepeticion): Promise<AltaEmpresaResultado | null>;
}
