import type { FilaZonaErrada } from "@/lib/types/actualizacion-zonas";

/** Lo que devuelve la escritura: cuantas se actualizaron y las que siguen con zona errada. */
export interface ResultadoActualizacionRepo {
  actualizadas: number;
  restantes: FilaZonaErrada[];
}

/**
 * SLT-224 (design §3b.2-§3b.3) — el acceso a datos del boton «Actualizar zonas».
 *
 * Las dos operaciones acotan a la empresa en contexto: la lectura con un filtro explicito por
 * `organizacion_id` en su SQL, y las dos, ademas, por la RLS de la transaccion de empresa.
 */
export interface IActualizacionZonasRepository {
  /**
   * Las ordenes NO borradas de la empresa cuya zona no es la de su distrito, SIN filtro de estado ni
   * de corte de dinero (el servicio decide cuales se saltan y por que). Solo lectura.
   */
  leerZonaErrada(): Promise<FilaZonaErrada[]>;

  /**
   * En UNA transaccion: relee las ordenes con zona errada, reconcilia con la regla compartida
   * (excluyendo ademas las devoluciones) y vuelve a leer. La regla decide en ese instante, no la
   * vista previa (R1717). Devuelve cuantas se actualizaron y las que siguen con zona errada.
   */
  actualizar(actorUsuarioId: string): Promise<ResultadoActualizacionRepo>;
}
