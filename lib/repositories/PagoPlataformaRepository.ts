import { Prisma, type PrismaClient } from "@prisma/client";

import type {
  IPagoPlataformaRepository,
  PagoPlataformaCliente,
  PagoPlataformaTxCandado,
  PagoPlataformaTxDisponible,
} from "@/lib/interfaces/repositories/IPagoPlataformaRepository";

// SL-45 (design §3, §6) — la clave de idempotencia del pago y el candado del tope.
// SLT-60 (design §4.1): la suma de los pagos confirmados (Prisma, por empresa) y lo disponible para
// registrar, que es una función de la base (`pago_plataforma_disponible`, con control de empresa).

export class PagoPlataformaRepository implements IPagoPlataformaRepository {
  constructor(private readonly prisma: PagoPlataformaCliente) {}

  async sumaPagosConfirmados(
    organizacionId: string,
    cliente?: Pick<PrismaClient, "pagoPlataformaAplicacion">,
  ): Promise<string> {
    // El filtro por empresa va escrito aunque la extensión y la RLS ya acoten a la empresa de la sesión
    // (R25): el aislamiento del dinero no depende de con qué cliente se construyó el repositorio.
    const r = await (cliente ?? this.prisma).pagoPlataformaAplicacion.aggregate({
      where: { organizacionId },
      _sum: { monto: true },
    });
    return new Prisma.Decimal(r._sum.monto ?? 0).toFixed(2);
  }

  async disponibleParaRegistrar(organizacionId: string, tx: PagoPlataformaTxDisponible): Promise<string> {
    // `::text` para no pasar por `number`: el importe llega como texto exacto y se normaliza a 2 decimales.
    const filas = await tx.$queryRaw<{ d: string | null }[]>`SELECT pago_plataforma_disponible(${organizacionId})::text AS d`;
    return new Prisma.Decimal(filas[0]?.d ?? 0).toFixed(2);
  }

  async claveYaRegistrada(
    organizacionId: string,
    claveIdempotencia: string,
    cliente?: Pick<PrismaClient, "walletMovimiento">,
  ): Promise<boolean> {
    // El único es `(organizacion_id, clave_idempotencia)`: con la empresa en el `where`, a lo sumo una.
    const fila = await (cliente ?? this.prisma).walletMovimiento.findFirst({
      where: { organizacionId, claveIdempotencia },
      select: { id: true },
    });
    return fila !== null;
  }

  async bloquear(tx: PagoPlataformaTxCandado): Promise<void> {
    // La clave sale de la empresa que la transacción ya fijó para la RLS: dos empresas no comparten
    // candado, y sin empresa fijada `current_setting` falla en vez de bloquear a todas.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('pago_plataforma:' || current_setting('app.organizacion_id')))`;
  }
}
