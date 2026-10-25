// SL-36 (design §3) — lo aleatorio de las integraciones, detras de una interfaz para que los tests
// del service fijen el id y el token.

export interface IFuenteAleatoria {
  /** UUID de la fila nueva. Lo genera la app, no la base: va en los datos asociados (QC inv. 3). */
  nuevoId(): string;
  /** 32 bytes aleatorios en base64url: el token de verificacion del webhook (R18). */
  nuevoTokenVerificacion(): string;
}
