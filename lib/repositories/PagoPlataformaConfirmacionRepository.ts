import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { traducirErrorDeConfirmacion } from "@/lib/db/errores-pago-plataforma";
import type {
  ConfirmarPagoRepoInput,
  ConfirmarPagoRepoResult,
  IPagoPlataformaConfirmacionRepository,
} from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import type { PagosDeEmpresa } from "@/lib/types/pago-plataforma";
import { nombreCompletoUsuarioSql } from "@/lib/utils/nombre-usuario";

// SLT-60 (design §4.3) — la confirmación del pago a la plataforma por el superadmin. Las tres funciones que
// llama (`pago_plataforma_por_confirmar`, `factura_plataforma_saldos` y `pago_plataforma_confirmar`) son del
// dueño con `REVOKE EXECUTE … FROM PUBLIC`: `servi_app` no puede ejecutarlas. Por eso corre como plataforma,
// el molde de `FacturaPlataformaRepository.cerrar`. `FichaJira` no admite `SLT` (deuda D29): lleva `SL-45`, la
// ficha del pago. Ningún método escribe en `factura_plataforma`: el saldo vive en las aplicaciones.
//
// Las funciones filtran por la empresa que reciben; los JOIN a tablas de negocio llevan además su
// `organizacion_id` escrito, porque como dueño no hay RLS que lo ponga.

type PagoPlataformaConfirmacionPrismaClient = Pick<PrismaClient, "$queryRaw">;

const FICHA = "SL-45";

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base (la forma de `FacturaPlataformaRepository`). */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

/* -------------------------------------------------------------------------- */
/* El borde jsonb de la lectura                                                */
/* -------------------------------------------------------------------------- */

/** `TIMESTAMP` sin zona, que el `jsonb` serializa sin sufijo: sus números son UTC. */
const instanteUtcSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/)
  .transform((s) => new Date(`${s}Z`));

/** Un `numeric` en texto, normalizado a dos decimales sin pasar por `number`. */
const importeSchema = z
  .string()
  .regex(/^-?\d+(\.\d+)?$/)
  .transform((s) => new Prisma.Decimal(s).toFixed(2));

const lecturaSchema = z.object({
  pagos: z.array(
    z.object({
      id: z.string(),
      monto: importeSchema,
      fecha: instanteUtcSchema,
      referencia: z.string().nullable(),
      registrado_por: z.string().nullable(),
      tiene_comprobante: z.boolean(),
    }),
  ),
  facturas: z.array(
    z.object({
      id: z.string(),
      numero: z.int().min(1),
      desde: instanteUtcSchema,
      hasta: instanteUtcSchema,
      total: importeSchema,
      saldo: importeSchema,
    }),
  ),
});

/** Según el driver, el `jsonb` llega ya parseado o como texto. */
const comoJson = (v: unknown): unknown => (typeof v === "string" ? (JSON.parse(v) as unknown) : v);

export class PagoPlataformaConfirmacionRepository implements IPagoPlataformaConfirmacionRepository {
  constructor(private readonly prisma: PagoPlataformaConfirmacionPrismaClient) {}

  leer(organizacionId: string): Promise<PagosDeEmpresa> {
    return comoPlataforma(FICHA, "SLT-60: leer los pagos por confirmar y las facturas con saldo de una empresa para el superadmin (R12, R14, R32)", async () => {
      // Una sola sentencia: una sola foto de los pagos y los saldos.
      const filas = await this.prisma.$queryRaw<{ pagos: unknown; facturas: unknown }[]>`
        SELECT
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'id', p."id", 'monto', p."monto"::text, 'fecha', p."fecha_movimiento",
                     'referencia', p."descripcion",
                     'registrado_por', CASE WHEN u."id" IS NULL THEN NULL ELSE ${Prisma.raw(nombreCompletoUsuarioSql("u"))} END,
                     'tiene_comprobante', EXISTS (
                       SELECT 1 FROM "wallet_comprobante" c
                        WHERE c."organizacion_id" = ${organizacionId} AND c."caja_movimiento_id" = p."id"))
                   ORDER BY p."created_at", p."id")
              FROM pago_plataforma_por_confirmar(${organizacionId}) p
              LEFT JOIN "usuario" u ON u."id" = p."registrado_por" AND u."organizacion_id" = ${organizacionId}
          ), '[]'::jsonb) AS "pagos",
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'id', s."factura_id", 'numero', s."numero", 'desde', s."desde_at", 'hasta', s."hasta_at",
                     'total', s."total"::text, 'saldo', s."saldo"::text)
                   ORDER BY s."desde_at")
              FROM factura_plataforma_saldos(${organizacionId}) s
             WHERE s."saldo" > 0
          ), '[]'::jsonb) AS "facturas"`;
      const leida = lecturaSchema.safeParse({ pagos: comoJson(filas[0]?.pagos), facturas: comoJson(filas[0]?.facturas) });
      if (!leida.success) {
        throw new Error(`PagoPlataformaConfirmacionRepository.leer: la base devolvió una forma inesperada: ${leida.error.message}`);
      }
      return {
        pagos: leida.data.pagos.map((p) => ({
          id: p.id,
          monto: p.monto,
          fecha: p.fecha,
          referencia: p.referencia,
          registradoPor: p.registrado_por,
          tieneComprobante: p.tiene_comprobante,
        })),
        facturas: leida.data.facturas,
      };
    });
  }

  confirmar(input: ConfirmarPagoRepoInput): Promise<ConfirmarPagoRepoResult> {
    return comoPlataforma(FICHA, "SLT-60: el superadmin confirma un pago a la plataforma y lo reparte entre facturas cerradas (R16)", async () => {
      // Los montos van como texto: la función los lleva a `numeric` sin pasar por `number`.
      const aplicaciones = JSON.stringify(input.aplicaciones.map((a) => ({ factura_id: a.facturaId, monto: a.monto })));
      try {
        // Una sola sentencia: su propia transacción. La función toma el candado de los pagos de la empresa,
        // así que se serializa con el registro, la anulación y otra confirmación del mismo pago (R19, R21).
        const [fila] = await this.prisma.$queryRaw<{ resultado: string }[]>`
          SELECT pago_plataforma_confirmar(${input.organizacionId}, ${input.pagoId}, ${aplicaciones}::jsonb,
                                           ${input.por}, ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
        if (fila?.resultado === "ok") return { estado: "ok" };
        if (fila?.resultado === "ya_confirmado") return { estado: "ya_confirmado" };
        throw new Error(`pago_plataforma_confirmar devolvió un resultado inesperado: ${String(fila?.resultado)}`);
      } catch (e) {
        const error = traducirErrorDeConfirmacion(e);
        if (error !== null) return { estado: "rechazado", error };
        throw e;
      }
    });
  }
}
