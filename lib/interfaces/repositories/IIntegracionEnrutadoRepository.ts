// SL-36 (design §10, R22) — la única lectura en plataforma del webhook de WhatsApp: traducir un
// número o un resumen de token a su empresa, sin sesión. Devuelve solo los dos ids: nada de la
// credencial, del estado ni de los datos públicos sale de aquí.

export interface DestinoWebhook {
  organizacionId: string;
  integracionId: string;
}

export interface IIntegracionEnrutadoRepository {
  /** La integración de WhatsApp cuyo token de verificación tiene ese resumen (R19), o `null`. */
  porResumenVerificacion(resumen: string): Promise<DestinoWebhook | null>;

  /** Cada número conocido con su destino (R20); los desconocidos no aparecen en el mapa (R21). */
  porNumeros(numerosIds: readonly string[]): Promise<Map<string, DestinoWebhook>>;
}
