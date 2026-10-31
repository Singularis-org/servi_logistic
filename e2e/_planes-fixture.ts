import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { ORDENES_BULK_FIELDS } from "../app/(app)/ordenes/_components/carga-masiva-fields";
import { ORDEN_MODULOS } from "../lib/modulos/catalogo";
import { PlanesRepository } from "../lib/repositories/PlanesRepository";
import { crearPlanSchema } from "../lib/types/planes";
import { fijarEmpresa } from "../tests/fabricas/organizaciones";

import { SUPERADMIN_DE_PRUEBA } from "./_superadmin-fixture";

// SL-24 T9 (design §11.1, R33) — lo que el caso del tope del plan del humo de dos empresas necesita
// antes de abrir el navegador: un plan custom con tope de órdenes asignado por el repositorio real,
// órdenes creadas por detrás como dueño y el distrito de la plantilla enlazado a la zona de cada
// empresa, para que la fila del archivo resuelva su zona. No va en `tests/fabricas/` (SL-43 está en
// vuelo sobre ese directorio, design §14).

/** Lo que hace falta de una empresa del humo para crear órdenes suyas por detrás. */
export interface EmpresaConZona {
  organizacionId: string;
  tiendaId: string;
  zonaId: string;
}

/** El superadmin de prueba es el actor del plan: `PlanesRepository` congela su nombre en el rastro. */
async function idDelSuperadmin(dueno: PrismaClient): Promise<string> {
  const sa = await dueno.usuario.findFirst({
    where: { email: SUPERADMIN_DE_PRUEBA.SUPERADMIN_EMAIL, rol: { value: "superadmin" } },
    select: { id: true },
  });
  if (!sa) throw new Error("SL-24 T9: no está el superadmin de prueba (lo crea `asegurarSuperadmin` en el beforeAll del humo).");
  return sa.id;
}

/**
 * Crea un plan custom de la empresa con tope de `n` órdenes por ciclo y los módulos apagables
 * (todos: asignarlo no apaga ninguno de los que el humo ya recorrió) y se lo asigna, las dos cosas
 * con `PlanesRepository` real sobre el cliente dueño, como lo hace el superadmin. Devuelve el id.
 */
export async function asignarPlanConTope(dueno: PrismaClient, organizacionId: string, n: number): Promise<string> {
  const actor = await idDelSuperadmin(dueno);
  const repo = new PlanesRepository(dueno);
  const entrada = crearPlanSchema.parse({
    nombre: `Plan humo ${randomUUID().slice(0, 8)}`,
    visibilidad: "custom",
    organizacionId,
    topes: { ordenesPorCiclo: n, porRol: {}, apiKeys: null },
    modulos: [...ORDEN_MODULOS],
    precio: { tipo: "sin_precio" },
    // SLT-66 R8: `costoPorOrden` es obligatorio y `null` es vacío (como `entradaDePlan` de los tests de
    // integración). Sigue sin precio: R28 vive en el servicio y aquí se asigna con el repositorio real.
    costoPorOrden: null,
  });
  const planId = await repo.crear(entrada, actor);
  const asignado = await repo.asignar(organizacionId, planId, actor);
  if (asignado.estado !== "ok" || !asignado.cambio) {
    throw new Error(`SL-24 T9: asignar el plan no lo dejó asignado: ${JSON.stringify(asignado)}`);
  }
  return planId;
}

/**
 * Las órdenes vivas de la empresa en el ciclo de su plan, contadas por detrás. La frontera es el ancla
 * que fijó la asignación: el ciclo recién empieza, así que el inicio es el ancla misma.
 */
export async function ordenesDelCiclo(dueno: PrismaClient, organizacionId: string): Promise<number> {
  const [fila] = await dueno.$queryRaw<{ n: number }[]>`
    SELECT count(*)::int AS n FROM "orden" o JOIN "organizacion" g ON g."id" = o."organizacion_id"
     WHERE o."organizacion_id" = ${organizacionId} AND o."deleted_at" IS NULL
       AND g."plan_ciclo_ancla_at" IS NOT NULL AND o."created_at" >= g."plan_ciclo_ancla_at"`;
  return fila?.n ?? 0;
}

/** `n` órdenes de la tienda y la zona de la empresa, como dueño y con la empresa fijada. */
export async function crearOrdenesDirectas(dueno: PrismaClient, e: EmpresaConZona, n: number): Promise<string[]> {
  return dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    const estatus = await tx.orderStatus.findUnique({ where: { value: "en_preparacion" }, select: { id: true } });
    const canton = await tx.canton.findFirst({
      where: { nombre: "Cartago", provincia: { nombre: "Cartago" } },
      select: { id: true, provinciaId: true },
    });
    if (!estatus || !canton) throw new Error("SL-24 T9: faltan catálogos o geografía (¿base sin `pnpm run db:seed`?)");
    const ids: string[] = [];
    for (let i = 0; i < n; i += 1) {
      const [{ guia }] = await tx.$queryRaw<{ guia: bigint }[]>`SELECT nextval('orden_num_guia_seq') AS guia`;
      const { id } = await tx.orden.create({
        data: {
          numGuia: Number(guia),
          numRemision: `SL24-DIR-${randomUUID().slice(0, 8)}`,
          estatusId: estatus.id,
          destinatario: "Destinatario plan humo",
          telefonoDest: "88881111",
          tiendaId: e.tiendaId,
          zonaId: e.zonaId,
          provinciaId: canton.provinciaId,
          cantonId: canton.id,
          producto: "Producto plan humo",
          montoCobrar: 15000,
        },
        select: { id: true },
      });
      ids.push(id);
    }
    return ids;
  });
}

/** Las columnas de la plantilla, con los valores de su ejemplo salvo los que se pidan. */
function filaDeLaPlantilla(cambios: Record<string, string>): Record<string, string> {
  return Object.fromEntries(ORDENES_BULK_FIELDS.map((f) => [f.key, cambios[f.key] ?? String(f.example ?? "")]));
}

/** La provincia y el «cantón (distrito)» del ejemplo de la plantilla, que la fila del archivo usa. */
function geografiaDelEjemplo(): { provincia: string; canton: string; distrito: string } {
  const fila = filaDeLaPlantilla({});
  const m = /^(.+?) \((.+)\)$/.exec(fila.canton_distrito);
  if (!m) throw new Error(`SL-24 T9: el ejemplo de canton_distrito cambió de forma: «${fila.canton_distrito}»`);
  return { provincia: fila.provincia, canton: m[1], distrito: m[2] };
}

/**
 * Enlaza el distrito del ejemplo de la plantilla a la zona de la empresa (`zona_distrito`), con la
 * empresa fijada: sin eso la fila sale «no tiene zona asignada» y el humo no llegaría al tope.
 */
export async function enlazarDistritoDeLaPlantilla(dueno: PrismaClient, e: EmpresaConZona): Promise<void> {
  const geo = geografiaDelEjemplo();
  const distrito = await dueno.distrito.findFirst({
    where: { nombre: geo.distrito, canton: { nombre: geo.canton, provincia: { nombre: geo.provincia } } },
    select: { id: true },
  });
  if (!distrito) throw new Error(`SL-24 T9: no está el distrito ${JSON.stringify(geo)} (¿base sin \`pnpm run db:seed\`?)`);
  await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, e.organizacionId);
    await tx.zonaDistrito.create({ data: { zonaId: e.zonaId, distritoId: distrito.id } });
  });
}

/** La fila de la carga, con su remisión, en el formato que el navegador manda al endpoint de chunk. */
export function filaDeCarga(numRemision: string): Record<string, string> {
  return filaDeLaPlantilla({
    destinatario: "Destinatario carga humo",
    telefono: "88887777",
    monto_cobrar: "15000",
    num_remision: numRemision,
  });
}

/** El mismo contenido como `.csv` de una fila, para el `<input type="file">` de la carga masiva. */
export function csvDeUnaFila(numRemision: string): Buffer {
  const fila = filaDeCarga(numRemision);
  const claves = ORDENES_BULK_FIELDS.map((f) => f.key);
  const celda = (v: string): string => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return Buffer.from(`${claves.join(",")}\n${claves.map((k) => celda(fila[k])).join(",")}\n`, "utf8");
}
