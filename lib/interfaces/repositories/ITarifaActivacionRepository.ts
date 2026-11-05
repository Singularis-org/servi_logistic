/** SLT-54 (design §2.1) — la activacion de la empresa del contexto, tal como la lee la pantalla. */
export interface TarifaActivacionDTO {
  activadaAt: Date;
  /** `null`: la activo la migracion, o el usuario que la activo ya no existe (FK SET NULL). */
  activadaPor: string | null;
}

/** `creada: false`: otra sesion gano la carrera; la fila y el historial son los de esa sesion (R7). */
export type ActivarResultado = { creada: boolean; activadaAt: Date };

/**
 * SLT-54 (design §4) — `tarifa_activacion`. La empresa sale del contexto, nunca de un parametro: solo
 * se puede leer y crear la activacion de la empresa activa (R12).
 */
export interface ITarifaActivacionRepository {
  leer(): Promise<TarifaActivacionDTO | null>;
  /** En una transaccion, la fila y su historial (R4). `totalFaltantes` queda en el historial. */
  activar(actorUsuarioId: string, totalFaltantes: number): Promise<ActivarResultado>;
}
