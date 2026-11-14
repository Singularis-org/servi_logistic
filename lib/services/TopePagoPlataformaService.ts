import { Prisma } from "@prisma/client";

import type { IPagoPlataformaRepository } from "@/lib/interfaces/repositories/IPagoPlataformaRepository";
import type {
  ComprobarTopeInput,
  ITopePagoPlataforma,
  ResultadoTopePagoPlataforma,
  TopePagoPlataformaTx,
} from "@/lib/interfaces/services/ITopePagoPlataformaService";

// SL-45 (design §6) — el tope del pago a la plataforma. El molde del candado es
// `AporteCapitalService` con `bloquearSaldoInicial`: candado primero, lectura después, todo con `tx`.
// SLT-60 (design §4.2): compara con lo disponible para registrar. La cifra la calcula la base
// (`pago_plataforma_disponible`), la misma definición que usa el trigger del tope: si el servicio la
// derivara por su cuenta, la pantalla y el trigger podrían discrepar en el borde.

export class TopePagoPlataformaService implements ITopePagoPlataforma {
  constructor(private readonly pagos: IPagoPlataformaRepository) {}

  async comprobar(tx: TopePagoPlataformaTx, input: ComprobarTopeInput): Promise<ResultadoTopePagoPlataforma> {
    // R5: el candado ANTES de leer. El segundo pago espera aquí al COMMIT del primero, y entonces
    // lee lo disponible con el primero ya descontado.
    await this.pagos.bloquear(tx);
    // R11 de SL-45: la clave se mira DESPUÉS del candado. Si se mirara antes, un reenvío simultáneo al
    // original pasaría la mirada, esperaría el candado y chocaría con el tope en vez de responder
    // `ya_registrado`.
    if (await this.pagos.claveYaRegistrada(input.organizacionId, input.claveIdempotencia, tx)) return "reenvio";

    const disponible = new Prisma.Decimal(await this.pagos.disponibleParaRegistrar(input.organizacionId, tx));
    // R3: sin nada disponible no se paga. R2: nunca más de lo disponible; igual, cabe.
    if (disponible.lte(0)) return "supera";
    return new Prisma.Decimal(input.monto).lte(disponible) ? "cabe" : "supera";
  }
}
