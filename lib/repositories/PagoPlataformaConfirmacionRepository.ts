import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { esTopeDelPagoSuperado, traducirErrorDeConfirmacion } from "@/lib/db/errores-pago-plataforma";
import type {
  AnularConfirmadoRepoInput,
  AnularConfirmadoRepoResult,
  AplicacionAConfirmar,
  ConfirmarPagoRepoInput,
  ConfirmarPagoRepoResult,
  IPagoPlataformaConfirmacionRepository,
  RegistrarPorFueraRepoInput,
  RegistrarPorFueraRepoResult,
} from "@/lib/interfaces/repositories/IPagoPlataformaConfirmacionRepository";
import { recalcularCongelamiento } from "@/lib/planes/mora-recalcular";
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
//
// SLT-143 (design §4.2): `leer` gana los pagos confirmados vigentes, y `registrarPorFuera` y `anularConfirmado`
// llaman a `pago_plataforma_registrar_por_fuera` y `pago_plataforma_anular_confirmado`, también del dueño. El
// nombre de quien confirmó sale de `usuario` sin filtro de empresa: es el superadmin, que no tiene ninguna.
//
// `pagoDeLaEmpresa` (design §4.8) es la excepción: NO corre como plataforma. La llama el servicio dentro de
// `conEmpresa(organizacionId)`, así que la extensión baja a `servi_app` con esa empresa y la RLS esconde los
// pagos de las demás (R34).
//
// SLT-121 (design §5.2; R19, R21, R34): `confirmar`, `registrarPorFuera` y `anularConfirmado` envuelven su función
// en una transacción que, si el resultado es `ok`, llama a `recalcularCongelamiento`: si el pago deja a una
// empresa congelada sin facturas vencidas con saldo, se descongela en la misma transacción, con su historial y su
// correo. Las respuestas «ya hecho» y los rechazos no recalculan (no cambió el saldo). El contrato no cambia.

type PagoPlataformaConfirmacionPrismaClient = Pick<PrismaClient, "$queryRaw" | "$transaction" | "walletMovimiento">;

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

const confirmadosSchema = z.array(
  z.object({
    id: z.string(),
    monto: importeSchema,
    fecha: instanteUtcSchema,
    referencia: z.string().nullable(),
    registrado_por: z.string().nullable(),
    por_fuera: z.boolean(),
    confirmado_por: z.string().nullable(),
    confirmado_el: instanteUtcSchema,
    aplicaciones: z.array(z.object({ factura_id: z.string(), numero: z.int().min(1), monto: importeSchema })),
    tiene_comprobante: z.boolean(),
  }),
);

/** Los montos van como texto: la función los lleva a `numeric` sin pasar por `number`. */
const aplicacionesJson = (aplicaciones: readonly AplicacionAConfirmar[]): string =>
  JSON.stringify(aplicaciones.map((a) => ({ factura_id: a.facturaId, monto: a.monto })));

/** Según el driver, el `jsonb` llega ya parseado o como texto. */
const comoJson = (v: unknown): unknown => (typeof v === "string" ? (JSON.parse(v) as unknown) : v);

export class PagoPlataformaConfirmacionRepository implements IPagoPlataformaConfirmacionRepository {
  constructor(private readonly prisma: PagoPlataformaConfirmacionPrismaClient) {}

  leer(organizacionId: string): Promise<PagosDeEmpresa> {
    return comoPlataforma(FICHA, "SLT-60: leer los pagos por confirmar y las facturas con saldo de una empresa para el superadmin (R12, R14, R32)", async () => {
      // Una sola sentencia: una sola foto de los pagos y los saldos.
      const filas = await this.prisma.$queryRaw<{ pagos: unknown; facturas: unknown; confirmados: unknown }[]>`
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
          ), '[]'::jsonb) AS "facturas",
          -- SLT-143 (R16): los confirmados vigentes, sin contra-asiento ni anulación de la plataforma.
          COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                     'id', p."id", 'monto', p."monto"::text, 'fecha', p."fecha_movimiento",
                     'referencia', p."descripcion",
                     'registrado_por', CASE WHEN c."por_fuera" OR u."id" IS NULL THEN NULL
                                            ELSE ${Prisma.raw(nombreCompletoUsuarioSql("u"))} END,
                     'por_fuera', c."por_fuera",
                     'confirmado_por', CASE WHEN cu."id" IS NULL THEN NULL ELSE ${Prisma.raw(nombreCompletoUsuarioSql("cu"))} END,
                     'confirmado_el', c."confirmado_at",
                     'aplicaciones', COALESCE((
                       SELECT jsonb_agg(jsonb_build_object('factura_id', a."factura_id", 'numero', f."numero",
                                                           'monto', a."monto"::text) ORDER BY f."numero")
                         FROM "pago_plataforma_aplicacion" a
                         JOIN "factura_plataforma" f ON f."id" = a."factura_id" AND f."organizacion_id" = ${organizacionId}
                        WHERE a."organizacion_id" = ${organizacionId} AND a."confirmacion_id" = c."id"), '[]'::jsonb),
                     'tiene_comprobante', EXISTS (
                       SELECT 1 FROM "wallet_comprobante" wc
                        WHERE wc."organizacion_id" = ${organizacionId} AND wc."caja_movimiento_id" = p."id"))
                   ORDER BY c."confirmado_at" DESC, c."id")
              FROM "pago_plataforma_confirmacion" c
              JOIN "wallet_movimiento" p ON p."id" = c."pago_id" AND p."organizacion_id" = ${organizacionId}
              LEFT JOIN "usuario" u ON u."id" = p."registrado_por" AND u."organizacion_id" = ${organizacionId}
              LEFT JOIN "usuario" cu ON cu."id" = c."confirmado_por"
             WHERE c."organizacion_id" = ${organizacionId}
               AND NOT EXISTS (SELECT 1 FROM "pago_plataforma_anulacion" n
                                WHERE n."organizacion_id" = ${organizacionId} AND n."confirmacion_id" = c."id")
               AND NOT EXISTS (SELECT 1 FROM "wallet_movimiento" r
                                WHERE r."organizacion_id" = ${organizacionId} AND r."tipo" = 'ingreso'
                                  AND r."categoria" = 'ingreso_ajuste' AND r."origen_tipo" = 'gasto'
                                  AND r."origen_id" = p."id")
          ), '[]'::jsonb) AS "confirmados"`;
      const leida = lecturaSchema
        .extend({ confirmados: confirmadosSchema })
        .safeParse({
          pagos: comoJson(filas[0]?.pagos),
          facturas: comoJson(filas[0]?.facturas),
          confirmados: comoJson(filas[0]?.confirmados),
        });
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
        confirmados: leida.data.confirmados.map((c) => ({
          id: c.id,
          monto: c.monto,
          fecha: c.fecha,
          referencia: c.referencia,
          registradoPor: c.registrado_por,
          porFuera: c.por_fuera,
          confirmadoPor: c.confirmado_por,
          confirmadoEl: c.confirmado_el,
          aplicaciones: c.aplicaciones.map((a) => ({ facturaId: a.factura_id, numero: a.numero, monto: a.monto })),
          tieneComprobante: c.tiene_comprobante,
        })),
      };
    });
  }

  confirmar(input: ConfirmarPagoRepoInput): Promise<ConfirmarPagoRepoResult> {
    return comoPlataforma(FICHA, "SLT-60: el superadmin confirma un pago a la plataforma y lo reparte entre facturas cerradas (R16)", async () => {
      const aplicaciones = aplicacionesJson(input.aplicaciones);
      try {
        // SLT-121 (R19, R34): la confirmación y el recálculo del congelamiento, en una transacción. La función toma
        // el candado de los pagos de la empresa, así que se serializa con el registro, la anulación, otra
        // confirmación del mismo pago (R19, R21 de SLT-60) y el congelamiento de madrugada.
        return await this.prisma.$transaction(async (tx): Promise<ConfirmarPagoRepoResult> => {
          const [fila] = await tx.$queryRaw<{ resultado: string }[]>`
            SELECT pago_plataforma_confirmar(${input.organizacionId}, ${input.pagoId}, ${aplicaciones}::jsonb,
                                             ${input.por}, ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
          if (fila?.resultado === "ya_confirmado") return { estado: "ya_confirmado" };
          if (fila?.resultado !== "ok") {
            throw new Error(`pago_plataforma_confirmar devolvió un resultado inesperado: ${String(fila?.resultado)}`);
          }
          await recalcularCongelamiento(tx, input.organizacionId, input.ahora, { causa: "pago", actor: input.por });
          return { estado: "ok" };
        });
      } catch (e) {
        const error = traducirErrorDeConfirmacion(e);
        if (error !== null) return { estado: "rechazado", error };
        throw e;
      }
    });
  }

  registrarPorFuera(input: RegistrarPorFueraRepoInput): Promise<RegistrarPorFueraRepoResult> {
    return comoPlataforma(FICHA, "SLT-143: el superadmin registra un pago hecho por fuera, ya confirmado y repartido entre facturas cerradas (R1, R10, R11)", async () => {
      const fecha = input.fecha === null ? null : comoTimestamp(input.fecha);
      try {
        // El pago, el comprobante, la confirmación y las aplicaciones van en una sola sentencia (R5, R9 de
        // SLT-143); SLT-121 (R19, R34) la envuelve con el recálculo del congelamiento: todo o nada.
        return await this.prisma.$transaction(async (tx): Promise<RegistrarPorFueraRepoResult> => {
          const [fila] = await tx.$queryRaw<{ resultado: string }[]>`
            SELECT pago_plataforma_registrar_por_fuera(
                     ${input.organizacionId}, ${input.pagoId}, ${input.monto}::numeric, ${fecha}::timestamp,
                     ${input.referencia}, ${input.claveIdempotencia}, ${aplicacionesJson(input.aplicaciones)}::jsonb,
                     ${input.por}, ${comoTimestamp(input.ahora)}::timestamp,
                     ${input.comprobante?.storagePath ?? null}, ${input.comprobante?.contentType ?? null}) AS "resultado"`;
          if (fila?.resultado === "ya_registrado") return { estado: "ya_registrado" };
          if (fila?.resultado !== "ok") {
            throw new Error(`pago_plataforma_registrar_por_fuera devolvió un resultado inesperado: ${String(fila?.resultado)}`);
          }
          await recalcularCongelamiento(tx, input.organizacionId, input.ahora, { causa: "pago", actor: input.por });
          return { estado: "ok" };
        });
      } catch (e) {
        if (esTopeDelPagoSuperado(e)) return { estado: "tope_superado" };
        const error = traducirErrorDeConfirmacion(e);
        if (error !== null) return { estado: "rechazado", error };
        throw e;
      }
    });
  }

  anularConfirmado(input: AnularConfirmadoRepoInput): Promise<AnularConfirmadoRepoResult> {
    return comoPlataforma(FICHA, "SLT-143: el superadmin anula un pago confirmado a la plataforma y devuelve el monto a la caja de la empresa (R21, R24)", async () => {
      try {
        // SLT-121 (R21, R34): el recálculo nunca congela; con el saldo de vuelta, casi siempre es `sin_cambio`, y
        // la madrugada siguiente congela si hace falta.
        return await this.prisma.$transaction(async (tx): Promise<AnularConfirmadoRepoResult> => {
          const [fila] = await tx.$queryRaw<{ resultado: string }[]>`
            SELECT pago_plataforma_anular_confirmado(${input.organizacionId}, ${input.pagoId}, ${input.motivo},
                                                     ${input.por}, ${comoTimestamp(input.ahora)}::timestamp) AS "resultado"`;
          if (fila?.resultado === "ya_anulado") return { estado: "ya_anulado" };
          if (fila?.resultado !== "ok") {
            throw new Error(`pago_plataforma_anular_confirmado devolvió un resultado inesperado: ${String(fila?.resultado)}`);
          }
          await recalcularCongelamiento(tx, input.organizacionId, input.ahora, { causa: "pago", actor: input.por });
          return { estado: "ok" };
        });
      } catch (e) {
        const error = traducirErrorDeConfirmacion(e);
        if (error !== null) return { estado: "rechazado", error };
        throw e;
      }
    });
  }

  async pagoDeLaEmpresa(organizacionId: string, pagoId: string): Promise<{ id: string } | null> {
    // El filtro por empresa va escrito aunque la RLS ya acote a la del contexto: el aislamiento no depende
    // de con qué cliente se construyó el repositorio.
    return this.prisma.walletMovimiento.findFirst({
      where: { id: pagoId, organizacionId, tipo: "egreso", categoria: "egreso_pago_plataforma" },
      select: { id: true },
    });
  }
}
