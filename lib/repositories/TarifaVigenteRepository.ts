import type {
  ITarifaVigenteRepository,
  TarifaTxClient,
} from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import { resolverCobrosCon } from "@/lib/repositories/_shared/resolver-tarifas";
import type { TarifaTienda } from "@/lib/types/tarifa-flexible";
import { clavePar, type ParTarifa } from "@/lib/utils/cascada-tarifa";

/**
 * Feature 42 / 69 / 274 — resolver de la tarifa que se le cobra a la tienda por una orden.
 *
 * SLT-52 (design §5): es una FACHADA del resolver unico (`_shared/resolver-tarifas.ts`), que decide
 * el modelo de la empresa (R36/R37) y elige con la regla pura (`cascada-tarifa.ts` en el viejo,
 * `tarifas/precedencia.ts` en el nuevo). Por que fachada y no una interfaz nueva inyectada: el
 * constructor no cambia, asi que las 11 raices de composicion siguen igual y ninguna puede quedarse
 * resolviendo con otra regla con la suite en verde (design §10.6).
 *
 * Lo que la 274 decidio sigue valiendo en el modelo viejo: SIN `orderBy` (el UNIQUE NULLS NOT
 * DISTINCT deja una fila por nivel), `tarifas` borra en fisico, y `null` = ningun nivel tiene fila,
 * un gap que cada superficie trata a su manera (el listado pinta "0.00", el cierre congela NULL, las
 * APIs por key responden 409).
 */
export class TarifaVigenteRepository implements ITarifaVigenteRepository {
  constructor(private readonly prisma: TarifaTxClient) {}

  /**
   * Singular: el lote con UN par. No se hacen consultas propias porque serian dos implementaciones
   * de la misma regla que podrian divergir.
   */
  async resolveTarifa(
    tiendaId: string,
    zonaId: string | null,
    distritoId: string | null,
  ): Promise<TarifaTienda | null> {
    const par: ParTarifa = { tiendaId, zonaId, distritoId };
    const resueltas = await this.resolveTarifas([par]);
    return resueltas.get(clavePar(par)) ?? null;
  }

  async resolveTarifas(
    pares: readonly ParTarifa[],
    tx?: TarifaTxClient,
  ): Promise<Map<string, TarifaTienda | null>> {
    // `tx` cuando el llamador esta dentro de una `$transaction` (el cierre de dia); si no, el
    // cliente del repo.
    return resolverCobrosCon(tx ?? this.prisma, pares);
  }
}
