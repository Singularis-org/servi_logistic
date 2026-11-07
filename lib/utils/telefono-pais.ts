// SLT-42 (R18, R19, R20) — normalizacion del telefono para WhatsApp con el prefijo y los digitos
// nacionales del pais de la empresa. Modulo PURO: sin DB, sin `process.env`.
//
// Es la forma de la CLAVE del hilo de chat y del destino de un envio, no una validacion: valida
// libphonenumber (`lib/validacion/telefono.ts`), que no se usa aqui porque el gemelo SQL no puede
// llamarla y cambiaria claves que hoy casan (design §9, alternativa 4). Las cuatro reglas son las
// de antes de esta ficha, con el prefijo y el largo como datos, y EN ESTE ORDEN:
//   1. `+` inicial -> prefijo internacional explicito: solo los digitos, sin anteponer nada.
//   2. Ya empieza por el prefijo del pais -> los digitos tal cual (no se duplica el prefijo).
//   3. Exactamente los digitos nacionales -> el prefijo delante.
//   4. Cualquier otro largo -> los digitos tal cual, sin inventar prefijo.

export interface ReglasTelefono {
  /** Prefijo internacional sin `+`, solo digitos. */
  prefijo: string;
  /** Cuantos digitos tiene un numero nacional del pais. */
  digitosNacionales: number;
}

/** Forma canonica (solo digitos) del telefono para keyear y comparar en WhatsApp (R18). */
export function normalizarTelefono(raw: string, r: ReglasTelefono): string {
  const digitos = raw.replace(/[^\d]/g, "");
  if (raw.trim().startsWith("+")) return digitos;
  if (digitos.startsWith(r.prefijo)) return digitos;
  if (digitos.length === r.digitosNacionales) return `${r.prefijo}${digitos}`;
  return digitos;
}

/**
 * `true` si el telefono sirve como destino de un envio de WhatsApp (R20): normalizado, de 10 a 15
 * digitos y, si empieza por el prefijo del pais, exactamente prefijo mas digitos nacionales. Se
 * descarta aqui porque un numero imposible gasta un intento en Meta y vuelve como rechazo opaco.
 */
export function telefonoSirveParaEnvio(
  raw: string | null | undefined,
  r: ReglasTelefono,
): boolean {
  if (raw === null || raw === undefined) return false;
  const n = normalizarTelefono(raw, r);
  if (!/^\d{10,15}$/.test(n)) return false;
  if (n.startsWith(r.prefijo) && n.length !== r.prefijo.length + r.digitosNacionales) return false;
  return true;
}

/**
 * Expresion SQL que normaliza `columna` igual que `normalizarTelefono` (R19). `p` y `n` son los
 * NUMEROS de los parametros (`$p`, `$n`) que llevan el prefijo y los digitos nacionales: viajan como
 * parametros, nunca interpolados.
 *
 * `columna` es un IDENTIFICADOR SQL y se interpola sin escapar: los llamantes DEBEN pasar un literal
 * del codigo (`"o.telefono_dest"`), nunca algo que venga de una request.
 */
export function sqlNormalizarTelefono(columna: string, p: number, n: number): string {
  const digitos = `regexp_replace(${columna}, '[^0-9]', '', 'g')`;
  return `CASE WHEN ltrim(${columna}) LIKE '+%' THEN ${digitos} WHEN starts_with(${digitos}, $${p}::text) THEN ${digitos} WHEN length(${digitos}) = $${n}::int THEN $${p}::text || ${digitos} ELSE ${digitos} END`;
}
