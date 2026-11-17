import { randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import { datosDeOrganizacionDePrueba } from "./organizaciones";

// SL-20 (design §2.1, §9; R10, R39) — un país de prueba y su geografía mínima.
//
// Los códigos van del rango `XA`–`XZ`, el que ISO 3166-1 reserva al usuario: nunca chocan con un país
// real ni con `CR`, el único que traen las migraciones. Sin país explícito, una empresa o una provincia
// de test nace en Costa Rica por el `DEFAULT 'CR'` (R10): esta fábrica es para cuando el test necesita
// un SEGUNDO país.
//
// Pensada para el `tx` de un test que se revierte. Dos archivos que creen el mismo código en paralelo
// no chocan: el segundo espera a que el primero revierta (clave primaria), no falla.

type Letra = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H" | "I" | "J" | "K" | "L" | "M";
type Letra2 = "N" | "O" | "P" | "Q" | "R" | "S" | "T" | "U" | "V" | "W" | "X" | "Y" | "Z";
/** `XA`–`XZ`: el tipo impide que un test cree por error un país real. */
export type CodigoPaisDePrueba = `X${Letra | Letra2}`;

/**
 * Crea el país sin regla de código (R17: texto libre) y con nombres de nivel propios, distintos de
 * los de Costa Rica, para que un test de etiquetas no pase por casualidad.
 */
export async function crearPaisDePrueba(
  tx: Pick<Prisma.TransactionClient, "pais">,
  codigo: CodigoPaisDePrueba,
): Promise<{ id: string; nombre: string }> {
  return tx.pais.create({
    data: {
      id: codigo,
      nombre: `País de prueba ${codigo}`,
      nivel1Singular: "Región",
      nivel1Plural: "Regiones",
      nivel2Singular: "Comuna",
      nivel2Plural: "Comunas",
      nivel3Singular: "Barrio",
      nivel3Plural: "Barrios",
    },
    select: { id: true, nombre: true },
  });
}

export interface GeografiaDePrueba {
  provinciaId: string;
  cantonId: string;
  distritoId: string;
}

type ClienteDeSql = Pick<Prisma.TransactionClient, "$executeRawUnsafe" | "$queryRawUnsafe">;

/**
 * `true` si `provincia` es todavia una TABLA: una base sin SLT-48 (las idas y vueltas de migraciones
 * anteriores, o tras el `down.sql` de SLT-48 con `sin-slt48.ts`). Ahi no siempre existe
 * `nodo_geografico` (antes de SLT-43) y, si existe, la sincronia de entonces lo rellena desde la tabla.
 */
async function geografiaViejaEsTabla(tx: ClienteDeSql): Promise<boolean> {
  const filas = await tx.$queryRawUnsafe<{ relkind: string }[]>(
    `SELECT c.relkind::text AS relkind FROM pg_class c JOIN pg_namespace s ON s.oid = c.relnamespace
      WHERE s.nspname = current_schema() AND c.relname = 'provincia'`,
  );
  return filas[0]?.relkind === "r";
}

const TABLA_VIEJA = { 1: "provincia", 2: "canton", 3: "distrito" } as const;
const COLUMNA_PADRE = { 2: "provincia_id", 3: "canton_id" } as const;

/** El `create` de antes de SLT-48, en la tabla vieja: el pais de un hijo lo pone su trigger desde el padre. */
async function crearEnLaTablaVieja(
  tx: ClienteDeSql,
  profundidad: 1 | 2 | 3,
  id: string,
  n: NodoDeNivel,
): Promise<{ id: string }> {
  const columnas = ["id", "nombre", "codigo_dta", "activo"];
  const valores: unknown[] = [id, n.nombre, n.codigoDta ?? null, n.activo ?? true];
  if (profundidad === 1) {
    columnas.push("pais_id");
    valores.push(n.paisId ?? "CR");
  } else {
    columnas.push(COLUMNA_PADRE[profundidad]);
    valores.push(n.padreId);
  }
  await tx.$executeRawUnsafe(
    `INSERT INTO ${TABLA_VIEJA[profundidad]} (${columnas.join(", ")}) VALUES (${valores.map((_, i) => `$${i + 1}`).join(", ")})`,
    ...valores,
  );
  return { id };
}

/** Un nodo de los tres primeros niveles, con los campos que tenían `provincia`, `canton` y `distrito`. */
export interface NodoDeNivel {
  /** Sin `id`, uno nuevo (como el `@default(uuid())` de las tablas viejas). */
  id?: string;
  nombre: string;
  /** Solo cuenta en el nivel 1; sin él, `CR` (el `DEFAULT` de `provincia.pais_id`). */
  paisId?: string;
  /** El nodo padre; obligatorio en los niveles 2 y 3. */
  padreId?: string;
  codigoDta?: string | null;
  activo?: boolean;
}

/**
 * SLT-48 (design §9) — desde que `provincia`, `canton` y `distrito` son vistas de solo lectura, la
 * geografía de un test se escribe en `nodo_geografico`, que es lo que la vista enseña. Mismo contrato
 * que el `create` de antes: en los niveles 2 y 3 el país es el del padre (lo hacía
 * `geografia_pais_del_padre`) y el tipo es el `nivel_N` del país. Como dueño: `servi_app` no escribe
 * geografía. `nombre_normalizado` lo pone el trigger de invariantes.
 */
export async function crearNodoDeNivel(
  tx: ClienteDeSql,
  profundidad: 1 | 2 | 3,
  n: NodoDeNivel,
): Promise<{ id: string }> {
  if (profundidad > 1 && n.padreId === undefined) {
    throw new Error(`crearNodoDeNivel: un nodo de profundidad ${profundidad} necesita padre`);
  }
  const id = n.id ?? randomUUID();
  if (await geografiaViejaEsTabla(tx)) return crearEnLaTablaVieja(tx, profundidad, id, n);
  const filas = await tx.$executeRawUnsafe(
    `INSERT INTO nodo_geografico
         (id, pais_id, tipo_id, padre_id, profundidad, nombre, nombre_normalizado, codigo_oficial, activo)
       SELECT $1, p.pais_id, t.id, $3, $4::int, $5, '', $6, $7
         FROM (SELECT COALESCE((SELECT padre.pais_id FROM nodo_geografico padre WHERE padre.id = $3), $2) AS pais_id) p
         JOIN tipo_nivel_geografico t ON t.pais_id = p.pais_id AND t.clave = 'nivel_' || $4::text`,
    id,
    n.paisId ?? "CR",
    n.padreId ?? null,
    profundidad,
    n.nombre,
    n.codigoDta ?? null,
    n.activo ?? true,
  );
  if (filas !== 1) {
    throw new Error(`crearNodoDeNivel: el país del nodo «${n.nombre}» no tiene el tipo nivel_${profundidad}`);
  }
  return { id };
}

/**
 * Una provincia, un cantón y un distrito en `paisId`, con nombres únicos. El país del cantón y del
 * distrito no se pasa: es el de su padre, como en la app.
 */
export async function crearGeografiaDePrueba(
  tx: ClienteDeSql,
  paisId: string,
  o?: { codigos?: { provincia?: string; canton?: string; distrito?: string } },
): Promise<GeografiaDePrueba> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const provincia = await crearNodoDeNivel(tx, 1, {
    nombre: `Provincia ${sufijo}`,
    paisId,
    codigoDta: o?.codigos?.provincia ?? null,
  });
  const canton = await crearNodoDeNivel(tx, 2, {
    nombre: `Cantón ${sufijo}`,
    padreId: provincia.id,
    codigoDta: o?.codigos?.canton ?? null,
  });
  const distrito = await crearNodoDeNivel(tx, 3, {
    nombre: `Distrito ${sufijo}`,
    padreId: canton.id,
    codigoDta: o?.codigos?.distrito ?? null,
  });
  return { provinciaId: provincia.id, cantonId: canton.id, distritoId: distrito.id };
}

/** Una empresa de prueba en `paisId`. Sin esta fábrica, una empresa de test nace en `CR` (R10). */
export async function crearOrganizacionEnPais(
  tx: Pick<Prisma.TransactionClient, "organizacion">,
  paisId: string,
  o?: { nombre?: string },
): Promise<{ id: string }> {
  return tx.organizacion.create({
    data: { ...datosDeOrganizacionDePrueba(o?.nombre), paisId },
    select: { id: true },
  });
}
