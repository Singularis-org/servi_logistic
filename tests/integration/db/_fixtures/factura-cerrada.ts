import type { PrismaClient } from "@prisma/client";

import { bajoLockDeEscrituraReal } from "../_postgres-real";

// SLT-60 (design §8) — cerrar la factura en curso de una empresa de prueba, COMMITEADO, para que tenga algo que
// pagar: desde SLT-60 solo se paga lo facturado en facturas cerradas (R3), así que todo test que registra un
// pago a la plataforma necesita una antes.
//
// ARTIFICIO ACEPTADO (el de SLT-119 §9): como dueño, `factura_plataforma_cerrar(org, fin_natural_at + 6 min)`
// con el `fin_natural_at` de la en curso. El reloj se adelanta solo para esa empresa desechable, y el margen de
// 5 minutos del cierre queda atrás. Si la empresa aún no tiene factura en curso, un cierre con la hora de la
// base la abre primero (sin cerrar nada: su fin natural está en el futuro).
//
// Lo que cae en la factura son los cargos y reversos de la empresa con `ocurrido_at` en su intervalo; sin plan,
// no lleva cuota y su total es cargos − reversos. Quien llama lee el total de la fila devuelta, no lo escribe a
// mano. Después del cierre la empresa tiene una en curso nueva, que empieza donde terminó la cerrada: un cargo
// escrito con la hora real queda ANTES de ella y no cae en ninguna factura.
//
// No es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.

export interface FacturaCerrada {
  id: string;
  numero: number;
  /** Texto con dos decimales, con signo. */
  total: string;
  desdeAt: Date;
  hastaAt: Date;
}

/** La factura en curso de la empresa, abriéndola si no tiene; la lee el dueño. */
export async function facturaEnCurso(base: PrismaClient, organizacionId: string): Promise<{ id: string; desdeAt: Date; finNaturalAt: Date }> {
  return bajoLockDeEscrituraReal(async () => {
    await base.$queryRaw`SELECT factura_plataforma_cerrar(${organizacionId}, (now() AT TIME ZONE 'UTC')::timestamp)`;
    const f = await base.facturaPlataforma.findFirst({
      where: { organizacionId, estado: "en_curso" },
      select: { id: true, desdeAt: true, finNaturalAt: true },
    });
    if (f === null) throw new Error(`la empresa ${organizacionId} no tiene factura en curso tras abrirla`);
    return f;
  });
}

/** Cierra la factura en curso de la empresa y devuelve la cerrada. Lanza si no cerró exactamente una. */
export async function cerrarFacturaEnCurso(base: PrismaClient, organizacionId: string): Promise<FacturaCerrada> {
  const enCurso = await facturaEnCurso(base, organizacionId);
  return bajoLockDeEscrituraReal(async () => {
    const [{ n }] = await base.$queryRaw<{ n: number }[]>`
      SELECT factura_plataforma_cerrar(f."organizacion_id", f."fin_natural_at" + interval '6 minutes')::int AS n
        FROM "factura_plataforma" f
       WHERE f."id" = ${enCurso.id}`;
    if (n !== 1) throw new Error(`el cierre de la factura ${enCurso.id} cerró ${n}, no 1`);
    const f = await base.facturaPlataforma.findUniqueOrThrow({
      where: { id: enCurso.id },
      select: { id: true, estado: true, numero: true, total: true, desdeAt: true, hastaAt: true },
    });
    if (f.estado !== "cerrada" || f.numero === null || f.total === null || f.hastaAt === null) {
      throw new Error(`la factura ${f.id} no quedó cerrada: ${JSON.stringify(f)}`);
    }
    return { id: f.id, numero: f.numero, total: f.total.toFixed(2), desdeAt: f.desdeAt, hastaAt: f.hastaAt };
  });
}

/** Lo que se aplica de un pago a una factura cerrada: texto con dos decimales. */
export interface AplicacionDePrueba {
  facturaId: string;
  monto: string;
}

/**
 * SLT-60 (design §8.1): confirma un pago como dueño con `pago_plataforma_confirmar`, para los tests de SL-45 y
 * SLT-118 que solo necesitan que la deuda baje (desde SLT-60, al confirmar y no al registrar). La autorización
 * del superadmin y la traducción de los errores las prueba `pago-plataforma-confirmacion.test.ts` por la action;
 * aquí `porUsuarioId` es cualquier usuario de la misma empresa (la base solo exige eso a `confirmado_por`).
 *
 * No toma el lock de escritura real: lo toma quien commitea (`bajoLockDeEscrituraReal`); dentro de una
 * transacción revertida no hace falta. Lanza si la base no responde `ok`.
 */
export async function confirmarComoDueno(
  cliente: Pick<PrismaClient, "$queryRawUnsafe">,
  organizacionId: string,
  pagoId: string,
  aplicaciones: AplicacionDePrueba[],
  porUsuarioId: string,
): Promise<void> {
  const filas = await cliente.$queryRawUnsafe<{ r: string }[]>(
    `SELECT pago_plataforma_confirmar($1, $2, $3::jsonb, $4, (now() AT TIME ZONE 'UTC')::timestamp) AS r`,
    organizacionId,
    pagoId,
    JSON.stringify(aplicaciones.map((a) => ({ factura_id: a.facturaId, monto: a.monto }))),
    porUsuarioId,
  );
  if (filas[0]?.r !== "ok") throw new Error(`la confirmación del pago ${pagoId} respondió ${JSON.stringify(filas)}`);
}
