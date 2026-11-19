import { randomUUID } from "node:crypto";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { PRISMA_OMIT } from "@/lib/db/prisma-client";
import { CREAR_TABLA_DE_CONTROL, aplicarMigracionesHasta, conectar, urlDe, type Conexion } from "./ida-y-vuelta-32";

// SLT-43 (design §7; review m1) — base PROPIA y desechable para los tests de SLT-43 que apagan
// triggers (`ALTER TABLE … DISABLE TRIGGER`). Ese DDL toma AccessExclusiveLock sobre `orden` y las
// zonas hasta el final de la transacción del caso: en la base compartida bloquearía a los archivos que
// corren a la vez. Mismo método que `migracion-slt43-ida-y-vuelta` y `geo-trigger-orden-rendimiento`:
// `CREATE DATABASE slt43_<etiqueta>_<aleatorio>`, todas las migraciones de `db/migrations` sentencia a
// sentencia y, al terminar, `DROP DATABASE … WITH (FORCE)`. Los datos los siembra cada caso con el
// fixture `geo-43.ts` dentro de su transacción revertida, como antes.

/** Ordena después de cualquier carpeta de `db/migrations`: aplica todas. */
const TODAS = "99999999";

export interface BasePropia43 {
  /** `slt43_<etiqueta>_<12 hex>`: si un fallo la deja viva, se reconoce de quién es. */
  nombre: string;
  /** URL de la base propia (la de `DATABASE_URL` con otro nombre de base). */
  url: string;
  /** Cliente de la base propia, con el mismo `omit` que `crearPrismaDeTest`. */
  prisma: PrismaClient;
  /** Cierra el cliente y suelta la base. Idempotente. */
  cerrar(): Promise<void>;
}

/**
 * Crea la base, le aplica todas las migraciones y abre su cliente. Si algo falla a medias, suelta la
 * base antes de propagar el error: no deja huérfanas.
 */
export async function crearBasePropia43(etiqueta: string): Promise<BasePropia43> {
  const nombre = `slt43_${etiqueta}_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const url = urlDe(nombre);
  const admin: Conexion = await conectar(urlDe("postgres"));
  let db: Conexion | undefined;
  let prisma: PrismaClient | undefined;
  let cerrada = false;

  const cerrar = async (): Promise<void> => {
    if (cerrada) return;
    cerrada = true;
    await prisma?.$disconnect();
    await db?.end();
    try {
      await admin.query(`DROP DATABASE IF EXISTS "${nombre}" WITH (FORCE)`);
    } finally {
      await admin.end();
    }
  };

  try {
    await admin.query(`CREATE DATABASE "${nombre}"`);
    db = await conectar(url);
    await db.query(CREAR_TABLA_DE_CONTROL);
    await aplicarMigracionesHasta(db, TODAS);
    await db.end();
    db = undefined;
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: url, max: 2 }),
      omit: PRISMA_OMIT,
    }) as unknown as PrismaClient;
    return { nombre, url, prisma, cerrar };
  } catch (error) {
    await cerrar().catch(() => undefined);
    throw error;
  }
}
