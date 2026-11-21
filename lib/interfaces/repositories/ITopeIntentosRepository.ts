/** `cambio: false`: ya regia ese valor, y no se escribio nada (R11). */
export type GuardarTopeResultado = { cambio: boolean };

/**
 * SLT-77 (design §2.3) — escribir el tope de intentos de la empresa del contexto. La empresa no viaja en
 * ningun metodo (R3, R7).
 */
export interface ITopeIntentosRepository {
  /** En una transaccion, el valor y su historial (R10). Sin empresa en contexto, lanza (R27). */
  guardar(tope: number, actorUsuarioId: string): Promise<GuardarTopeResultado>;
}
