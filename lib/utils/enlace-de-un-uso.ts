import { randomBytes } from "node:crypto";

// SLT-221 (design §3.4): el enlace de un solo uso `<id>.<secreto>`, el formato de SL-41/SL-18. En la
// base solo va el hash del secreto; el enlace completo viaja solo en el fragmento `#enlace=` (R1632).
// `PasswordResetService` conserva su copia: migrarlo no entra en esta ficha.

/** 32 bytes = 256 bits; en base64url son 43 caracteres, por debajo de los 72 de bcrypt. */
const BYTES_SECRETO = 32;

export function generarSecretoEnlace(): string {
  return randomBytes(BYTES_SECRETO).toString("base64url");
}

export function componerEnlace(id: string, secreto: string): string {
  return `${id}.${secreto}`;
}

/** Separa `<id>.<secreto>`; `null` si falta alguna de las dos partes. */
export function partirEnlace(enlace: string): { id: string; secreto: string } | null {
  const punto = enlace.indexOf(".");
  if (punto <= 0 || punto === enlace.length - 1) return null;
  return { id: enlace.slice(0, punto), secreto: enlace.slice(punto + 1) };
}
