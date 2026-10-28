// SL-36 (design §3, R1-R4, R38) — el cifrador de las credenciales de las integraciones.

/**
 * A que fila y campo pertenece un valor cifrado. Va como datos asociados del AEAD: un cifrado
 * copiado a otra empresa, otra integracion u otro campo no se descifra (QC inv. 1).
 */
export type ContextoSecreto = {
  readonly organizacionId: string;
  readonly integracionId: string;
  readonly campo: string;
};

/**
 * Asincrono a proposito: si un dia la clave sale a un KMS, la firma no cambia y ningun service se
 * toca.
 */
export interface ICifradorSecretos {
  /** `v<n>:<iv>:<tag>:<cifrado>` con la version ACTIVA del anillo. */
  cifrar(texto: string, ctx: ContextoSecreto): Promise<string>;
  /** Falla con un unico «credencial ilegible» si el valor no se puede leer con ese contexto (R3). */
  descifrar(guardado: string, ctx: ContextoSecreto): Promise<string>;
  /** La version de un valor guardado, sin descifrarlo; `null` si no tiene la forma. Para el recifrado. */
  versionDe(guardado: string): string | null;
}
