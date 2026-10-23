import { randomUUID } from "node:crypto";

import type { PrismaClient } from "@prisma/client";

import { fijarEmpresa } from "../tests/fabricas/organizaciones";
import { altaDeEmpresa, clienteDueno, prepararAcceso, type Empresa, type Letra } from "./_dos-empresas-fixture";

// SL-38 T9 (R14) — lo que la comprobación de Tarifas con dos maestros necesita antes de abrir el
// navegador. Reutiliza el alta y el primer acceso del humo de SL-17 (`_dos-empresas-fixture.ts`),
// con dos diferencias: el correo del maestro es `@example.test` generado por corrida (aquí no se
// envía ningún correo, así que no hace falta un buzón real) y cada empresa lleva UNA zona propia
// con un distrito, que es lo mínimo para que «Editar» abra el formulario con el árbol geográfico.

/** El teléfono SINPE de la zona sembrada: un número de prueba válido para el `CHECK` de `zona`. */
const SINPE_DE_PRUEBA = "80000000";

/** Un distrito del catálogo que el spec busca por nombre en el selector. */
export interface DistritoElegido {
  id: string;
  nombre: string;
}

export interface EmpresaDeTarifas {
  empresa: Empresa;
  zonaNombre: string;
}

/**
 * El cliente dueño, solo contra una base LOCAL. `clienteDueno` ya rechaza los proyectos remotos
 * conocidos; aquí además se exige que el host sea esta máquina. El mensaje nunca lleva la URL.
 */
export function clienteDuenoLocal(): PrismaClient {
  const url = process.env.DATABASE_URL ?? "";
  let host = "";
  try {
    host = new URL(url).hostname;
  } catch {
    throw new Error("SL-38 T9: DATABASE_URL no es una URL válida.");
  }
  if (!["localhost", "127.0.0.1", "::1", "[::1]"].includes(host)) {
    throw new Error("SL-38 T9: DATABASE_URL no apunta a una base local. Aborta antes de escribir.");
  }
  return clienteDueno();
}

/**
 * Cuatro distritos activos con nombre ASCII que no aparece dentro del nombre de ningún otro
 * distrito, cantón ni provincia, cada uno de un cantón distinto: buscar su nombre en el selector
 * deja una sola fila con un solo botón «Especial», y el conteo «Zonas especiales» de cada cantón
 * solo puede venir de ese distrito.
 */
export async function elegirDistritos(dueno: PrismaClient): Promise<DistritoElegido[]> {
  const filas = await dueno.$queryRaw<DistritoElegido[]>`
    WITH nombres AS (
      SELECT lower(nombre) AS n FROM distrito
      UNION ALL SELECT lower(nombre) FROM canton
      UNION ALL SELECT lower(nombre) FROM provincia
    ),
    candidatos AS (
      SELECT d.id, d.nombre, d.canton_id,
             row_number() OVER (PARTITION BY d.canton_id ORDER BY d.nombre) AS rn
      FROM distrito d
      JOIN canton c ON c.id = d.canton_id
      JOIN provincia p ON p.id = c.provincia_id
      WHERE d.activo AND c.activo AND p.activo
        AND d.nombre ~ '^[A-Za-z]{5,}$'
        AND (SELECT count(*) FROM nombres WHERE nombres.n LIKE '%' || lower(d.nombre) || '%') = 1
    )
    SELECT id, nombre FROM candidatos WHERE rn = 1 ORDER BY nombre LIMIT 4`;
  if (filas.length < 4) {
    throw new Error(`SL-38 T9: el catálogo no tiene 4 distritos buscables (hay ${filas.length}); ¿base sin migrar?`);
  }
  return filas;
}

/**
 * Alta de la empresa por el servicio (dentro de `comoPlataforma`), contraseña fijada con el hasher
 * del login y dispositivo confiado (sin OTP), y una zona central con un distrito, sembrada con la
 * empresa fijada. `sinpeRevisadoAt`: sin él, la pantalla abre «Confirmá el SINPE» y tapa los clics.
 */
export async function sembrarEmpresa(
  dueno: PrismaClient,
  letra: Letra,
  userAgent: string,
  distritoDeLaZona: DistritoElegido,
): Promise<EmpresaDeTarifas> {
  const email = `sl38-maestro-${letra.toLowerCase()}-${randomUUID().slice(0, 8)}@example.test`;
  const { empresa } = await altaDeEmpresa(letra, email);
  await prepararAcceso(dueno, empresa, userAgent);

  const zonaNombre = `Zona ${letra} ${randomUUID().slice(0, 8)}`;
  await dueno.$transaction(async (tx) => {
    await fijarEmpresa(tx, empresa.organizacionId);
    const zona = await tx.zona.create({
      data: {
        nombre: zonaNombre,
        sinpeNumero: SINPE_DE_PRUEBA,
        sinpeNombre: `Titular ${letra}`,
        esCentral: true,
        sinpeRevisadoAt: new Date(),
      },
      select: { id: true },
    });
    await tx.zonaDistrito.create({ data: { zonaId: zona.id, distritoId: distritoDeLaZona.id } });
  });
  return { empresa, zonaNombre };
}

/** Las marcas de zona especial de una empresa, leídas por detrás como dueño (sin RLS). */
export async function marcasDe(dueno: PrismaClient, organizacionId: string): Promise<string[]> {
  const filas = await dueno.distritoZonaEspecial.findMany({
    where: { organizacionId },
    select: { distritoId: true },
  });
  return filas.map((f) => f.distritoId).sort();
}
