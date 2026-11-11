import type { Prisma } from "@prisma/client";

import type { ZonaAsignada } from "@/lib/services/geografia-dominio";

// SLT-89 (design §4.1; R9) — LAS ASIGNACIONES DE ZONA A NODOS QUE NO SON DISTRITOS.
//
// POR QUE VIVE APARTE DEL CARGADOR. Las asignaciones a distritos se leen de `zona_distrito.distrito_id`
// y NUNCA de su `nodo_geografico_id` (SLT-44 R12): asi no dependen del backfill de SLT-43, y lo vigila
// `geografia-lecturas-sin-nodo-fk.guardia` sobre `CatalogoGeograficoRepository`. `zona_nodo` es otra
// tabla: nacio con SLT-89, su unica columna de lugar ES `nodo_geografico_id` (NOT NULL, sin backfill
// posible que faltar) y R9 manda leerla de ahi. Aislarla en este archivo deja el cargador sin nombrar
// la columna y la regla de la guardia intacta para las tablas viejas.
//
// Lo mismo para `grupo_distritos_nodo` (design §2.2): las lecturas y escrituras que el guardado de
// zona (`ZonaRepository`, barrido entero por esa guardia) hace sobre los miembros de grupo que no son
// distritos asignados pasan por aqui y le llegan con el nodo como `nodoId`.

/** El cliente minimo para leer `zona_nodo`. */
export type ClienteDeZonaNodo = Pick<Prisma.TransactionClient, "zonaNodo">;

/** El cliente minimo para leer y escribir `grupo_distritos_nodo`. */
export type ClienteDeGrupoNodo = Pick<Prisma.TransactionClient, "grupoDistritosNodo">;

/**
 * Las filas de `zona_nodo` de la empresa de la transaccion (la ponen la extension y la RLS), en el
 * orden de su id, con la forma que `crearAsignaciones` espera.
 */
export async function leerAsignacionesANodos(
  tx: ClienteDeZonaNodo,
): Promise<{ nodoId: string; zona: ZonaAsignada }[]> {
  const filas = await tx.zonaNodo.findMany({
    select: { nodoGeograficoId: true, zona: { select: { id: true, nombre: true, esCentral: true } } },
    orderBy: { id: "asc" },
  });
  return filas.map((f) => ({ nodoId: f.nodoGeograficoId, zona: f.zona }));
}

/** SLT-89 (design §5.1 paso 2): los nodos que la zona tiene hoy en `zona_nodo`. */
export async function leerNodosDeZona(tx: ClienteDeZonaNodo, zonaId: string): Promise<string[]> {
  const filas = await tx.zonaNodo.findMany({ where: { zonaId }, select: { nodoGeograficoId: true } });
  return filas.map((f) => f.nodoGeograficoId);
}

/**
 * SLT-89 (R2, design §5.1 paso 3) — los nodos pedidos que ya estan en OTRA zona de la empresa, con la
 * misma forma que `leerDistritosEnOtraZona` (nombre del lugar y de la zona). `zonaIdPropia` excluye la
 * zona que se guarda; `null` al crear.
 */
export async function leerNodosEnOtraZona(
  tx: ClienteDeZonaNodo,
  nodoIds: readonly string[],
  zonaIdPropia: string | null,
): Promise<{ distritoNombre: string; zonaNombre: string }[]> {
  if (nodoIds.length === 0) return [];
  const filas = await tx.zonaNodo.findMany({
    where: {
      nodoGeograficoId: { in: [...nodoIds] },
      ...(zonaIdPropia ? { zonaId: { not: zonaIdPropia } } : {}),
    },
    select: { nodoGeografico: { select: { nombre: true } }, zona: { select: { nombre: true } } },
  });
  return filas.map((f) => ({ distritoNombre: f.nodoGeografico.nombre, zonaNombre: f.zona.nombre }));
}

/**
 * SLT-89 (R1, design §5.1 paso 7) — `zona_nodo` por diferencia: borra los que salen y crea los que
 * entran; los que se quedan no se tocan. Con las dos listas vacias no ejecuta nada.
 */
export async function reemplazarNodosDeZona(
  tx: ClienteDeZonaNodo,
  zonaId: string,
  salen: readonly string[],
  entran: readonly string[],
): Promise<void> {
  if (salen.length > 0) {
    await tx.zonaNodo.deleteMany({ where: { zonaId, nodoGeograficoId: { in: [...salen] } } });
  }
  if (entran.length > 0) {
    await tx.zonaNodo.createMany({ data: entran.map((nodoGeograficoId) => ({ zonaId, nodoGeograficoId })) });
  }
}

/** Una fila de `grupo_distritos_nodo`, con el nodo como `nodoId`. */
export interface MiembroNodo {
  id: string;
  grupoId: string;
  zonaId: string;
  nodoId: string;
}

/**
 * SLT-89 (design §5.1 paso 7) — los miembros de grupo que no son distritos asignados. Sin `zonaIds`,
 * los de toda la empresa de la transaccion (la tabla es pequeña: solo lo que no cabe en la vieja).
 */
export async function leerMiembrosNodo(
  tx: ClienteDeGrupoNodo,
  filtro: { zonaIds?: readonly string[]; grupoId?: string } = {},
): Promise<MiembroNodo[]> {
  const filas = await tx.grupoDistritosNodo.findMany({
    where: {
      ...(filtro.zonaIds ? { zonaId: { in: [...filtro.zonaIds] } } : {}),
      ...(filtro.grupoId ? { grupoId: filtro.grupoId } : {}),
    },
    select: { id: true, grupoId: true, zonaId: true, nodoGeograficoId: true },
    orderBy: { id: "asc" },
  });
  return filas.map((f) => ({ id: f.id, grupoId: f.grupoId, zonaId: f.zonaId, nodoId: f.nodoGeograficoId }));
}

/** SLT-89 (design §5.1 paso 7a, §5.2): crea miembros en `grupo_distritos_nodo`. */
export async function crearMiembrosNodo(
  tx: ClienteDeGrupoNodo,
  filas: readonly { grupoId: string; zonaId: string; nodoId: string }[],
): Promise<void> {
  if (filas.length === 0) return;
  await tx.grupoDistritosNodo.createMany({
    data: filas.map((f) => ({ grupoId: f.grupoId, zonaId: f.zonaId, nodoGeograficoId: f.nodoId })),
  });
}

/** SLT-89 (design §5.2): saca de un grupo los nodos pedidos de `grupo_distritos_nodo`. */
export async function borrarMiembrosNodoDeGrupo(
  tx: ClienteDeGrupoNodo,
  grupoId: string,
  nodoIds: readonly string[],
): Promise<void> {
  if (nodoIds.length === 0) return;
  await tx.grupoDistritosNodo.deleteMany({ where: { grupoId, nodoGeograficoId: { in: [...nodoIds] } } });
}

/**
 * SLT-89 (R18, design §5.2) — de `nodoIds`, los que ya son miembros de `grupo_distritos_nodo` en OTRO
 * grupo de la zona, con el nombre del nodo y el del grupo (la misma forma que la lectura de la tabla
 * vieja, para el mismo mensaje).
 */
export async function leerMiembrosNodoEnOtroGrupo(
  tx: ClienteDeGrupoNodo,
  zonaId: string,
  nodoIds: readonly string[],
  exceptoGrupoId: string | null,
): Promise<{ distritoId: string; distritoNombre: string; grupoNombre: string }[]> {
  if (nodoIds.length === 0) return [];
  const filas = await tx.grupoDistritosNodo.findMany({
    where: {
      zonaId,
      nodoGeograficoId: { in: [...nodoIds] },
      ...(exceptoGrupoId === null ? {} : { grupoId: { not: exceptoGrupoId } }),
    },
    select: {
      nodoGeograficoId: true,
      grupo: { select: { nombre: true } },
      nodoGeografico: { select: { nombre: true } },
    },
  });
  return filas.map((f) => ({
    distritoId: f.nodoGeograficoId,
    distritoNombre: f.nodoGeografico.nombre,
    grupoNombre: f.grupo.nombre,
  }));
}
