import type { Prisma } from "@prisma/client";

import { diasDeGraciaGlobal } from "@/lib/config/factura-gracia";
import { dedupeAvisoMora, encolarAvisosDeMora } from "@/lib/repositories/_shared/encolar-aviso-mora";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

// SLT-121 (design §5.2, R34) — «recalcular congelamiento de la empresa»: la única operación de dominio que
// descongela por pago o por gracia. La llaman, dentro de SU transacción y después de cambiar el saldo o la
// gracia, `PagoPlataformaConfirmacionRepository` (confirmar, registrar por fuera, anular: R19, R21),
// `MoraEmpresaRepository.fijarGracia` (R5) y, en su rama, el cobro en línea de SLT-226 (frontera, design §9).
//
// Recibe la transacción y no puede abrir otra: el descongelamiento, su fila del historial y su correo se
// confirman o se pierden con el cambio que lo provocó (R19, R30). NUNCA congela (R21): eso solo pasa de
// madrugada. La transacción tiene que ser del dueño: `organizacion_mora_descongelar_si_pagada` no la puede
// ejecutar `servi_app`.

export type CausaRecalculo = { causa: "pago" | "gracia"; actor: string | null };

type TxDeRecalculo = Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw" | "historialAccion" | "usuario">;

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base. */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

const ACCION_POR_CAUSA = {
  pago: "empresa_descongelada_por_pago",
  gracia: "empresa_descongelada_por_gracia",
} as const;

/**
 * Descongela `org` si está congelada y ya no tiene facturas vencidas con saldo, con su fila del historial
 * (actor: quien pagó o confirmó; `null` es el sistema) y el correo «activa de nuevo» (R28). `gracia` es la
 * global; por defecto, la del entorno.
 */
export async function recalcularCongelamiento(
  tx: TxDeRecalculo,
  org: string,
  ahora: Date,
  causa: CausaRecalculo,
  gracia?: number,
): Promise<"descongelada" | "sin_cambio"> {
  // Sin bloquear nada si no está congelada, que es casi siempre. La función toma la empresa en FOR NO KEY UPDATE
  // (design §2): no choca con el FOR KEY SHARE de las escrituras de la empresa que esperan el candado de los pagos
  // que esta transacción ya tiene; con FOR UPDATE eso era un deadlock (el «anular y confirmar a la vez» de SLT-60).
  // La lectura es segura: con el candado tomado nadie congela a la vez (congelar lo pide antes), y un
  // descongelamiento concurrente solo podría dejarla en «no congelada».
  const [estado] = await tx.$queryRaw<{ congelada: boolean }[]>`
    SELECT ("congelada_at" IS NOT NULL) AS "congelada" FROM "organizacion" WHERE "id" = ${org}`;
  if (estado?.congelada !== true) return "sin_cambio";

  const graciaGlobal = gracia ?? diasDeGraciaGlobal();
  const [fila] = await tx.$queryRaw<{ r: string }[]>`
    SELECT organizacion_mora_descongelar_si_pagada(${org}, ${comoTimestamp(ahora)}::timestamp, ${graciaGlobal}::int) AS "r"`;
  if (fila?.r === "sin_cambio") return "sin_cambio";
  if (fila?.r !== "descongelada") {
    throw new Error(`organizacion_mora_descongelar_si_pagada devolvió un resultado inesperado: ${String(fila?.r)}`);
  }

  const actor = await resolverActorCongelado(tx, causa.actor);
  await appendAccion(tx, [
    {
      accion: ACCION_POR_CAUSA[causa.causa],
      entidadTipo: "organizacion",
      entidadId: org,
      entidadEtiqueta: etiquetaDeEntidad("organizacion", { asunto: "mora" }),
      ...actor,
      // En plataforma el DEFAULT de la columna sale NULL: la empresa va escrita.
      organizacionId: org,
    },
  ]);
  await encolarAvisosDeMora(tx, org, [
    { payload: { tipo: "descongelada", motivo: causa.causa }, dedupeKey: dedupeAvisoMora.descongelada(org, ahora) },
  ]);
  return "descongelada";
}
