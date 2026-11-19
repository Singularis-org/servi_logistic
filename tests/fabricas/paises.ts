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
 * SLT-42: datos de teléfono y hora del país de prueba. Sin ellos el país nace incompleto (NULL), como
 * uno dado de alta por la pantalla de SL-20: es el caso de R6 y R28.
 */
export interface DatosTelefonoYHoraDePrueba {
  prefijoTelefonico?: string | null;
  telefonoDigitosNacionales?: number | null;
  zonaHoraria?: string | null;
}

/**
 * Crea el país sin regla de código (R17: texto libre) y con nombres de nivel propios, distintos de
 * los de Costa Rica, para que un test de etiquetas no pase por casualidad.
 */
export async function crearPaisDePrueba(
  tx: Pick<Prisma.TransactionClient, "pais">,
  codigo: CodigoPaisDePrueba,
  o?: DatosTelefonoYHoraDePrueba,
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
      prefijoTelefonico: o?.prefijoTelefonico ?? null,
      telefonoDigitosNacionales: o?.telefonoDigitosNacionales ?? null,
      zonaHoraria: o?.zonaHoraria ?? null,
    },
    select: { id: true, nombre: true },
  });
}

/**
 * SLT-42 — un tipo de documento de prueba en `paisId`. El `value` sigue la regla de los tipos de
 * países nuevos (`<PAIS>_<clave>`, design §2.2): es único global y no choca con los de CR.
 */
export async function crearTipoDocumentoDePrueba(
  tx: Pick<Prisma.TransactionClient, "tipoIdentificacion">,
  paisId: string,
  o: {
    clave: string;
    nombre?: string;
    caracteres?: "digitos" | "alfanumerico";
    largoMin?: number;
    largoMax?: number;
    orden?: number;
    activo?: boolean;
  },
): Promise<{ id: string; value: string; clave: string }> {
  return tx.tipoIdentificacion.create({
    data: {
      value: `${paisId}_${o.clave}`,
      paisId,
      clave: o.clave,
      nombre: o.nombre ?? `Documento ${o.clave}`,
      caracteres: o.caracteres ?? "digitos",
      largoMin: o.largoMin ?? 8,
      largoMax: o.largoMax ?? 8,
      orden: o.orden ?? 1,
      activo: o.activo ?? true,
    },
    select: { id: true, value: true, clave: true },
  });
}

export interface GeografiaDePrueba {
  provinciaId: string;
  cantonId: string;
  distritoId: string;
}

/**
 * Una provincia, un cantón y un distrito en `paisId`, con nombres únicos. El país del cantón y del
 * distrito no se pasa: lo pone el trigger `geografia_pais_del_padre`, como en la app.
 */
export async function crearGeografiaDePrueba(
  tx: Pick<Prisma.TransactionClient, "provincia" | "canton" | "distrito">,
  paisId: string,
  o?: { codigos?: { provincia?: string; canton?: string; distrito?: string } },
): Promise<GeografiaDePrueba> {
  const sufijo = randomUUID().replace(/-/g, "").slice(0, 10);
  const provincia = await tx.provincia.create({
    data: { nombre: `Provincia ${sufijo}`, paisId, codigoDta: o?.codigos?.provincia ?? null },
    select: { id: true },
  });
  const canton = await tx.canton.create({
    data: { nombre: `Cantón ${sufijo}`, provinciaId: provincia.id, codigoDta: o?.codigos?.canton ?? null },
    select: { id: true },
  });
  const distrito = await tx.distrito.create({
    data: { nombre: `Distrito ${sufijo}`, cantonId: canton.id, codigoDta: o?.codigos?.distrito ?? null },
    select: { id: true },
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
