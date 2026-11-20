// Ficha 474 (design §6.5, R42) — enmascarado del telefono de un destinatario.
//
// SLT-42 (R20): la validez del telefono (`telefonoValido`, que solo conocia el `506` de Costa Rica)
// se retiro a favor de `telefonoSirveParaEnvio` (`lib/utils/telefono-pais.ts`), que la decide con
// el prefijo y los digitos del pais de la empresa. El enmascarado no depende del pais y se queda.

/**
 * `•••• 7777`: solo los 4 ultimos digitos (R42). Lo aplica la capa de datos al leer el historial:
 * el telefono completo no sale hacia la UI. Menos de 4 digitos → solo los puntos.
 */
export function enmascararTelefono(n: string): string {
  const digitos = n.replace(/\D/g, "");
  if (digitos.length < 4) return "••••";
  return `•••• ${digitos.slice(-4)}`;
}
