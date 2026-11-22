import type { TrioCredencialCobro } from "@/lib/interfaces/external/IProveedorCobro";
import type {
  IIntegracionRecifradoRepository,
  SecretosGuardados,
} from "@/lib/interfaces/repositories/IIntegracionRecifradoRepository";

// SLT-227 (design §8.2) — `cobro_proveedor_credencial`, de plataforma. Los secretos entran y salen CIFRADOS: aquí
// nunca hay un valor en claro. Implementa también el recifrado (design §9.2, R13) sobre esta tabla.

export interface GuardarCredencialRepoInput {
  /** El id de la fila: va en los datos asociados de cada secreto (design §8.1, R7). */
  id: string;
  trio: TrioCredencialCobro;
  /** `{ campo: "v<n>:…" }`, ya cifrados. */
  secretos: Readonly<Record<string, string>>;
  /** El usuario que guarda. Opaco y sin FK (design §1). */
  por: string | null;
  ahora: Date;
}

/**
 * - `ok`: la fila del trío quedó con estos secretos (nueva o reemplazada, R8);
 * - `conflicto`: otra escritura creó el trío con otro id entre `idDe` y el `INSERT`;
 * - `pais_no_existe`: la FK a `pais` lo rechazó (R8).
 */
export type GuardarCredencialRepoResult = "ok" | "conflicto" | "pais_no_existe";

/** Lo que se puede decir de un trío sin tocar un secreto (R9): los nombres de los campos, nunca los valores. */
export interface EstadoCredencialGuardada {
  campos: string[];
  actualizadoAt: Date;
  actualizadoPor: string | null;
}

export interface ICobroCredencialRepository extends IIntegracionRecifradoRepository {
  idDe(trio: TrioCredencialCobro): Promise<string | null>;
  guardar(input: GuardarCredencialRepoInput): Promise<GuardarCredencialRepoResult>;
  estado(trio: TrioCredencialCobro): Promise<EstadoCredencialGuardada | null>;
  /** Los secretos cifrados del trío. Solo lo llama el lector de credenciales (design §8.3, R11). */
  secretosDe(trio: TrioCredencialCobro): Promise<SecretosGuardados | null>;
  /** El id del único superadmin, o `null`. Solo lo usa el comando de carga (design §9.1, R12). */
  idSuperadmin(): Promise<string | null>;
}
