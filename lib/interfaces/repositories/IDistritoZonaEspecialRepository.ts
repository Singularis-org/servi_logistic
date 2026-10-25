import type { CambiosZonaEspecial } from "@/lib/types/distrito-zona-especial";

// SL-38 (design §3) — la escritura de la marca de zona especial de la EMPRESA de la transaccion.
//
// La empresa no es un argumento: la ponen la extension (`organizacion_id` en el `where` y en los
// datos) y la RLS. Un parametro `organizacionId` aqui seria una segunda fuente de la empresa que un
// llamador podria rellenar mal.

export type AplicarCambiosZonaEspecialResult =
  /** Cambios EFECTIVOS: una marca que ya estaba no cuenta en `creadas`, ni una que no estaba en `borradas`. */
  | { estado: "ok"; creadas: number; borradas: number }
  /** Algun id de `marcar` no es un distrito. Nada del lote queda escrito (R13). */
  | { estado: "distrito_inexistente" };

export interface IDistritoZonaEspecialRepository {
  /** Borra las marcas de `desmarcar` y crea las de `marcar` en UNA transaccion (R9). */
  aplicarCambios(cambios: CambiosZonaEspecial): Promise<AplicarCambiosZonaEspecialResult>;
}
