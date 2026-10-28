// SL-36 (design §12; R39, R40) — lo que el recifrado lee y escribe de `integracion`, en la empresa
// en curso. Aparte de `IIntegracionRepository` a proposito: recifrar no es una accion del maestro
// (no deja historial, no cambia el estado) y no debe poder confundirse con `actualizar`.

/** Solo el id (va en los datos asociados) y los secretos CIFRADOS. */
export interface SecretosGuardados {
  id: string;
  secretos: Readonly<Record<string, string>>;
}

export interface IIntegracionRecifradoRepository {
  /** Las integraciones de la empresa en curso; sin contexto de empresa falla `EmpresaNoResuelta`. */
  listarSecretos(): Promise<SecretosGuardados[]>;

  /**
   * Cambia los secretos de UNA fila de la empresa en curso, solo si siguen siendo `anteriores`: si
   * el maestro edito la integracion mientras corria el recifrado, su valor nuevo gana. `false` si la
   * fila ya no esta o cambio.
   */
  reemplazarSecretos(
    id: string,
    anteriores: Readonly<Record<string, string>>,
    nuevos: Readonly<Record<string, string>>,
  ): Promise<boolean>;
}
