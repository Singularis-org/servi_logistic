import { Prisma, type HistorialAccionTipo, type PrismaClient } from "@prisma/client";
import { z } from "zod";

import { comoPlataforma, conEmpresa, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type {
  FilaHistorialMora,
  IMoraEmpresaRepository,
  MoraLeida,
  MoraParaPlataforma,
  ResultadoCongelar,
} from "@/lib/interfaces/repositories/IMoraEmpresaRepository";
import { inicioDelDiaPlataforma, fechaCalendarioPlataforma, mananaCalendarioPlataforma } from "@/lib/planes/ciclo";
import { MOTIVO_MAX } from "@/lib/planes/mora";
import { recalcularCongelamiento } from "@/lib/planes/mora-recalcular";
import { dedupeAvisoMora, encolarAvisosDeMora } from "@/lib/repositories/_shared/encolar-aviso-mora";
import { ACTOR_SISTEMA, appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { CATEGORIA_POR_ACCION, HISTORIAL_ACCION_TIPOS } from "@/lib/types/historial-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

// SLT-121 (design §5.1) — la mora de una empresa.
//
// Dos caminos, como `FacturaPlataformaRepository`:
//   - las LECTURAS (`moraDeLaEmpresa`, `estaCongelada` y `moraParaPlataforma`) corren con la empresa fijada: la
//     extensión baja a `servi_app` y `factura_plataforma_mora` solo devuelve la del contexto (R33). El superadmin,
//     que no tiene empresa, la fija con `conEmpresa`, como `deEmpresaParaPlataforma` de SLT-119;
//   - las ESCRITURAS y la corrida corren en `comoPlataforma`: `organizacion_mora_*` son del dueño y `servi_app` no
//     puede ejecutarlas ni escribir las columnas de la mora (así la empresa no se descongela a sí misma).
// `FichaJira` no admite `SLT` (deuda D29): lleva `SL-24`, la ficha de los planes.
//
// Cada escritura deja su fila del historial (`appendAccion`) y su correo (outbox) en la MISMA transacción que
// el cambio (R29, R30). Las filas llevan la empresa escrita: en plataforma el DEFAULT de la columna sale NULL.

type MoraEmpresaPrismaClient = Pick<PrismaClient, "$transaction" | "$queryRaw" | "historialAccion">;

const FICHA = "SL-24";

/** Los cinco tipos de la mora (design §1.2): la categoría `mora` del catálogo. */
const TIPOS_MORA: HistorialAccionTipo[] = HISTORIAL_ACCION_TIPOS.filter((t) => CATEGORIA_POR_ACCION[t] === "mora");

/** Las 50 filas más recientes del historial de la mora en la sección del superadmin (R31). */
const HISTORIAL_MAX = 50;

/** La hora de la plataforma a la que sale el recordatorio (design §4.1, §13.3). */
const HORA_DEL_RECORDATORIO_MS = 8 * 60 * 60 * 1000;

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base. */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

/** «15» o «7 (global)»: la gracia vigente tal como queda en el historial (design §5.1). */
function textoDeGracia(propia: number | null, global: number): string {
  return propia === null ? `${global} (global)` : String(propia);
}

/* -------------------------------------------------------------------------- */
/* El borde de la base                                                         */
/* -------------------------------------------------------------------------- */

const instanteSchema = z.string().transform((s) => new Date(s));
const importeSchema = z.string().regex(/^-?\d+\.\d{2}$/);
const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const lecturaSchema = z.object({
  congelada_at: instanteSchema.nullable(),
  descongelada_hasta: fechaSchema.nullable(),
  gracia_propia: z.int().nullable(),
  facturas: z.array(
    z.object({
      factura_id: z.string(),
      numero: z.int(),
      hasta_at: instanteSchema,
      saldo: importeSchema,
      fecha_limite: fechaSchema,
      vence_at: instanteSchema,
      vencida: z.boolean(),
    }),
  ),
});

const congelarSchema = z.discriminatedUnion("resultado", [
  z.object({ resultado: z.enum(["fuera_de_franja", "ya_congelada", "descongelada_a_mano", "al_dia"]) }),
  z.object({
    resultado: z.literal("congelada"),
    facturas: z.array(z.object({ id: z.string(), numero: z.int(), saldo: z.string() })),
    saldo_vencido: z.string(),
  }),
]);

/** Según el driver, el `jsonb` llega ya parseado o como texto. */
const comoJson = (v: unknown): unknown => (typeof v === "string" ? (JSON.parse(v) as unknown) : v);

/** Los instantes en texto ISO con `Z`: un `TIMESTAMP` sin zona guarda números UTC. */
const ISO = `'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'`;

export class MoraEmpresaRepository implements IMoraEmpresaRepository {
  constructor(private readonly prisma: MoraEmpresaPrismaClient) {}

  /**
   * Una sola sentencia sobre la empresa del contexto: sus columnas y sus facturas con saldo, de la misma foto.
   * Sin empresa, la extensión ni la ejecuta; con otra, `factura_plataforma_mora` lanza `42501` (R33).
   */
  private async leerDelContexto(ahora: Date, gracia: number, operacion: string) {
    const filas = await this.prisma.$queryRaw<unknown[]>`
      SELECT to_char(o."congelada_at", ${Prisma.raw(ISO)}) AS "congelada_at",
             o."descongelada_hasta"::text AS "descongelada_hasta",
             o."factura_dias_gracia" AS "gracia_propia",
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'factura_id', m."factura_id", 'numero', m."numero",
                        'hasta_at', to_char(m."hasta_at", ${Prisma.raw(ISO)}), 'saldo', m."saldo"::numeric(14, 2)::text,
                        'fecha_limite', m."fecha_limite"::text, 'vence_at', to_char(m."vence_at", ${Prisma.raw(ISO)}),
                        'vencida', m."vencida")
                      ORDER BY m."fecha_limite", m."numero")
                 FROM factura_plataforma_mora(o."id", ${comoTimestamp(ahora)}::timestamp, ${gracia}::int) m
             ), '[]'::jsonb) AS "facturas"
        FROM "organizacion" o
       WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')`;
    if (filas.length === 0) throw new EmpresaNoResuelta("organizacion", operacion);
    const fila = filas[0] as Record<string, unknown>;
    const leida = lecturaSchema.safeParse({ ...fila, facturas: comoJson(fila.facturas) });
    if (!leida.success) {
      throw new Error(`MoraEmpresaRepository.${operacion}: la base devolvió una forma inesperada: ${leida.error.message}`);
    }
    const d = leida.data;
    const mora: MoraLeida = {
      congeladaAt: d.congelada_at,
      descongeladaHasta: d.descongelada_hasta,
      facturas: d.facturas.map((f) => ({
        facturaId: f.factura_id,
        numero: f.numero,
        hastaAt: f.hasta_at,
        saldo: f.saldo,
        fechaLimite: f.fecha_limite,
        venceAt: f.vence_at,
        vencida: f.vencida,
      })),
    };
    return { mora, graciaPropia: d.gracia_propia };
  }

  async moraDeLaEmpresa(ahora: Date, gracia: number): Promise<MoraLeida> {
    return (await this.leerDelContexto(ahora, gracia, "moraDeLaEmpresa")).mora;
  }

  async graciaDeLaEmpresa(gracia: number): Promise<number> {
    const filas = await this.prisma.$queryRaw<{ dias: number | null }[]>`
      SELECT o."factura_dias_gracia" AS "dias"
        FROM "organizacion" o
       WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')`;
    if (filas.length === 0) throw new EmpresaNoResuelta("organizacion", "graciaDeLaEmpresa");
    return filas[0].dias ?? gracia;
  }

  async estaCongelada(): Promise<boolean> {
    const filas = await this.prisma.$queryRaw<{ congelada: boolean }[]>`
      SELECT (o."congelada_at" IS NOT NULL) AS "congelada"
        FROM "organizacion" o
       WHERE o."id" = NULLIF(current_setting('app.organizacion_id', true), '')`;
    if (filas.length === 0) throw new EmpresaNoResuelta("organizacion", "estaCongelada");
    return filas[0].congelada;
  }

  async moraParaPlataforma(organizacionId: string, ahora: Date, gracia: number): Promise<MoraParaPlataforma> {
    // El camino de `deEmpresaParaPlataforma`: `servi_app` con esa empresa fijada, sin `comoPlataforma`.
    return conEmpresa(organizacionId, async () => {
      const { mora, graciaPropia } = await this.leerDelContexto(ahora, gracia, "moraParaPlataforma");
      // El filtro por empresa va escrito aunque la extensión ya lo ponga.
      const filas = await this.prisma.historialAccion.findMany({
        where: { organizacionId, accion: { in: TIPOS_MORA } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: HISTORIAL_MAX,
        select: {
          id: true,
          accion: true,
          createdAt: true,
          actorNombre: true,
          actorRol: true,
          monto: true,
          valorAnterior: true,
          valorNuevo: true,
        },
      });
      const historial: FilaHistorialMora[] = filas.map((f) => ({
        ...f,
        monto: f.monto === null ? null : f.monto.toFixed(2),
      }));
      return { ...mora, graciaPropia, historial };
    });
  }

  async fijarGracia(
    organizacionId: string,
    dias: number | null,
    actorUsuarioId: string,
    ahora: Date,
    gracia: number,
  ): Promise<"ok" | "sin_cambio"> {
    return comoPlataforma(FICHA, "SLT-121: el superadmin fija o quita la gracia propia de una empresa (R3, R5)", () =>
      this.prisma.$transaction(async (tx) => {
        // Dos cambios de la misma empresa se serializan, así el «anterior» del historial es cierto. `NO KEY` para no
        // frenar las FK a `organizacion` de las escrituras de la empresa, que toman `FOR KEY SHARE`.
        const filas = await tx.$queryRaw<{ dias: number | null }[]>`
          SELECT "factura_dias_gracia" AS "dias" FROM "organizacion" WHERE "id" = ${organizacionId} FOR NO KEY UPDATE`;
        if (filas.length === 0) throw new Error(`MoraEmpresaRepository.fijarGracia: no existe la empresa ${organizacionId}`);
        const anterior = filas[0].dias;
        if (anterior === dias) return "sin_cambio";

        await tx.$executeRaw`
          UPDATE "organizacion" SET "factura_dias_gracia" = ${dias}::int, "updated_at" = now()
           WHERE "id" = ${organizacionId}`;
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [
          {
            accion: "factura_dias_gracia_cambiada",
            entidadTipo: "organizacion",
            entidadId: organizacionId,
            entidadEtiqueta: etiquetaDeEntidad("organizacion", { asunto: "mora" }),
            ...actor,
            valorAnterior: textoDeGracia(anterior, gracia),
            valorNuevo: textoDeGracia(dias, gracia),
            organizacionId,
          },
        ]);
        // R5: la fecha límite se deriva de la gracia vigente, así que ya cambió en todas las cerradas; si con el
        // plazo nuevo no quedan vencidas, se descongela en el acto (nunca congela).
        await recalcularCongelamiento(tx, organizacionId, ahora, { causa: "gracia", actor: actorUsuarioId }, gracia);
        return "ok";
      }),
    );
  }

  async descongelarAMano(
    organizacionId: string,
    hasta: string,
    motivo: string,
    actorUsuarioId: string,
    ahora: Date,
  ): Promise<"ok" | "no_congelada"> {
    return comoPlataforma(FICHA, "SLT-121: el superadmin descongela a mano una empresa congelada por mora (R22)", () =>
      this.prisma.$transaction(async (tx) => {
        const [fila] = await tx.$queryRaw<{ r: string }[]>`
          SELECT organizacion_mora_descongelar_a_mano(${organizacionId}, ${hasta}::date, ${comoTimestamp(ahora)}::timestamp) AS "r"`;
        if (fila?.r === "no_congelada") return "no_congelada";
        if (fila?.r !== "ok") {
          throw new Error(`organizacion_mora_descongelar_a_mano devolvió un resultado inesperado: ${String(fila?.r)}`);
        }
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        // Decisión P5: el motivo entra en la fila, recortado a 200 (excepción declarada en
        // `historial-accion-sin-datos-cliente.guardia`). La base no lo guarda en otro sitio.
        await appendAccion(tx, [
          {
            accion: "empresa_descongelada_a_mano",
            entidadTipo: "organizacion",
            entidadId: organizacionId,
            entidadEtiqueta: etiquetaDeEntidad("organizacion", { asunto: "mora" }),
            ...actor,
            valorNuevo: `hasta ${hasta} — ${motivo.trim().slice(0, MOTIVO_MAX)}`,
            organizacionId,
          },
        ]);
        await encolarAvisosDeMora(tx, organizacionId, [
          {
            payload: { tipo: "descongelada", motivo: "a_mano", hasta },
            dedupeKey: dedupeAvisoMora.descongelada(organizacionId, ahora),
          },
        ]);
        return "ok";
      }),
    );
  }

  async existeEmpresa(organizacionId: string): Promise<boolean> {
    // De plataforma: con `servi_app` la RLS de `organizacion` solo deja ver la propia, y el superadmin no tiene.
    return comoPlataforma(FICHA, "SLT-121: el superadmin comprueba que la empresa existe antes de cambiar su mora (R32)", async () => {
      const filas = await this.prisma.$queryRaw<{ existe: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM "organizacion" WHERE "id" = ${organizacionId}) AS "existe"`;
      return filas[0]?.existe === true;
    });
  }

  async empresasConMora(): Promise<string[]> {
    return comoPlataforma(FICHA, "SLT-121: la corrida de madrugada lista las empresas con facturas con saldo o congeladas (R7)", async () => {
      const filas = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT o."id" FROM "organizacion" o
         WHERE o."congelada_at" IS NOT NULL
            OR EXISTS (SELECT 1 FROM factura_plataforma_saldos(o."id") s WHERE s."saldo" > 0)
         ORDER BY o."created_at", o."id"`;
      return filas.map((f) => f.id);
    });
  }

  async congelarSiVencida(organizacionId: string, ahora: Date, gracia: number): Promise<ResultadoCongelar> {
    return comoPlataforma(FICHA, "SLT-121: la corrida de madrugada congela una empresa con facturas vencidas (R7, R8, R9)", () =>
      this.prisma.$transaction(async (tx) => {
        const [fila] = await tx.$queryRaw<{ r: unknown }[]>`
          SELECT organizacion_mora_congelar(${organizacionId}, ${comoTimestamp(ahora)}::timestamp, ${gracia}::int) AS "r"`;
        const leido = congelarSchema.safeParse(comoJson(fila?.r));
        if (!leido.success) {
          throw new Error(`organizacion_mora_congelar devolvió una forma inesperada: ${leido.error.message}`);
        }
        const r = leido.data;
        if (r.resultado !== "congelada") return { resultado: r.resultado };

        // R30: congelada, con sus facturas vencidas y el saldo vencido; el actor es el sistema.
        await appendAccion(tx, [
          {
            accion: "empresa_congelada",
            entidadTipo: "organizacion",
            entidadId: organizacionId,
            entidadEtiqueta: etiquetaDeEntidad("organizacion", { asunto: "mora" }),
            ...ACTOR_SISTEMA,
            monto: new Prisma.Decimal(r.saldo_vencido),
            valorNuevo: r.facturas.map((f) => `N.º ${f.numero}`).join(", ").slice(0, 254),
            organizacionId,
          },
        ]);
        // R9: la dedupe lleva el instante del congelamiento; otra corrida de la misma madrugada ya no llega aquí.
        await encolarAvisosDeMora(tx, organizacionId, [
          {
            payload: { tipo: "congelada", congeladaAt: ahora.toISOString() },
            dedupeKey: dedupeAvisoMora.congelada(organizacionId, ahora),
          },
        ]);
        return {
          resultado: "congelada",
          facturas: r.facturas.map((f) => ({ facturaId: f.id, numero: f.numero, saldo: f.saldo })),
          saldoVencido: r.saldo_vencido,
        };
      }),
    );
  }

  async encolarRecordatorios(organizacionId: string, ahora: Date, gracia: number): Promise<number> {
    const manana = mananaCalendarioPlataforma(ahora);
    // A las 08:00 de hoy de la plataforma, no a la hora de la corrida (design §13.3).
    const aLasOcho = new Date(inicioDelDiaPlataforma(fechaCalendarioPlataforma(ahora)).getTime() + HORA_DEL_RECORDATORIO_MS);
    return comoPlataforma(FICHA, "SLT-121: la corrida de madrugada encola el recordatorio de las facturas que vencen mañana (R26)", () =>
      this.prisma.$transaction(async (tx) => {
        const facturas = await tx.$queryRaw<{ id: string }[]>`
          SELECT m."factura_id" AS "id"
            FROM factura_plataforma_mora(${organizacionId}, ${comoTimestamp(ahora)}::timestamp, ${gracia}::int) m
           WHERE m."fecha_limite" = ${manana}::date
           ORDER BY m."numero"`;
        // La dedupe lleva la fecha límite: si la gracia cambia, el recordatorio vuelve a salir con la nueva.
        return encolarAvisosDeMora(
          tx,
          organizacionId,
          facturas.map((f) => ({
            payload: { tipo: "recordatorio", facturaId: f.id },
            dedupeKey: dedupeAvisoMora.recordatorio(f.id, manana),
            runAfter: aLasOcho,
          })),
        );
      }),
    );
  }
}
