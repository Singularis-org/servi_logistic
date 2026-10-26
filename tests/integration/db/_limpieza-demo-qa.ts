import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { serializarEscriturasReales, urlDeBaseDeDatos } from "./_postgres-real";

// SL-43 — limpieza de EMERGENCIA de las empresas demo, para los dos archivos de la demo
// (`demo-qa.test.ts` y `demo-qa-borrado.test.ts`).
//
// NO es un archivo de test (no acaba en `.test.ts`): vitest no lo recoge.
//
// POR QUÉ EXISTE. En el run 40271163801 (CI, Postgres 17) `borrarEmpresasDemo` abortó y el `afterAll`
// de `demo-qa.test.ts` dejó 3 empresas demo vivas, con todas sus filas. Eso tumbó dos archivos más
// que no tenían nada roto: `demo-qa-borrado.test.ts` (exige 0 empresas demo al empezar) y
// `notificacion-evento-gasto-fijo-migration` (su `down` recorre la tabla `notificacion` entera).
// Un fallo del borrado tiene que ser rojo en SU archivo, no en los de al lado.
//
// POR QUÉ NO USA `borrarEmpresasDemo`. Es lo que se prueba y lo que puede haber fallado: limpiar con
// el mismo camino es no limpiar. Esto va por otro camino que no puede chocar con lo que lo hizo caer:
// una transacción con `session_replication_role = replica`, que apaga los triggers (el blindaje de
// SL-40/SL-45, la misma empresa) y las comprobaciones de FK, así que el orden de las tablas da igual.
// Requiere superusuario: lo es la base de CI (`postgres`) y la local de test. Si no lo es, falla
// ruidosamente; no hay un tercer camino silencioso.
//
// QUÉ ALCANZA. Solo las empresas con `es_demo` (las que la demo pone como dueño), sus usuarios y lo
// que cuelga de ellos. Con el turno exclusivo de `_exclusion-demo-qa.ts` tomado, ninguna empresa demo
// de la base es de otro archivo vivo: si hay, son restos de una corrida que ya cayó.
//
// LOCK DE ESCRITURA REAL. Borra usuarios y empresas commiteando: lo toma (de transacción) antes de
// leer nada, como todo lo que escribe en la base compartida. Quien la llame NO puede tenerlo tomado
// por otra conexión (`bajoLockDeEscrituraReal`): se colgaría.

/** Tablas de plataforma con un usuario y SIN FK hacia `usuario` (la sesión de login). */
const COLUMNAS_DE_USUARIO_SIN_FK = [{ tabla: "Session", columna: "userId" }] as const;

const comillas = (nombre: string) => `"${nombre.replace(/"/g, '""')}"`;

/**
 * Borra toda empresa con `es_demo` y lo suyo, sin triggers ni FK. Devuelve cuántas había. No toca
 * Storage: en los tests es el doble en memoria, que muere con el archivo.
 */
export async function borrarEmpresasDemoDeEmergencia(): Promise<number> {
  const cliente = new PrismaClient({
    adapter: new PrismaPg({ connectionString: urlDeBaseDeDatos(), max: 1 }),
  });
  try {
    return await cliente.$transaction(
      async (tx) => {
        await serializarEscriturasReales(tx);
        const empresas = (
          await tx.$queryRawUnsafe<{ id: string }[]>(`SELECT "id" FROM "organizacion" WHERE "es_demo"`)
        ).map((f) => f.id);
        if (empresas.length === 0) return 0;
        await tx.$executeRawUnsafe(`SET LOCAL session_replication_role = replica`);

        const usuarios = (
          await tx.$queryRawUnsafe<{ id: string }[]>(
            `SELECT "id" FROM "usuario" WHERE "organizacion_id" = ANY($1::text[])`,
            empresas,
          )
        ).map((f) => f.id);

        const deUsuario = await tx.$queryRawUnsafe<{ tabla: string; columna: string }[]>(
          `SELECT DISTINCT cl.relname AS "tabla", a.attname AS "columna"
             FROM pg_constraint co
             JOIN pg_class cl ON cl.oid = co.conrelid
             JOIN pg_namespace n ON n.oid = cl.relnamespace
             JOIN pg_attribute a ON a.attrelid = co.conrelid AND a.attnum = ANY(co.conkey)
            WHERE co.contype = 'f' AND co.confrelid = 'public.usuario'::regclass AND n.nspname = 'public'
              AND cl.relname <> 'usuario'`,
        );
        const existentes = new Set(
          (
            await tx.$queryRawUnsafe<{ t: string }[]>(
              `SELECT table_name::text AS t FROM information_schema.tables WHERE table_schema = 'public'`,
            )
          ).map((f) => f.t),
        );
        if (usuarios.length > 0) {
          for (const c of [...deUsuario, ...COLUMNAS_DE_USUARIO_SIN_FK.filter((c) => existentes.has(c.tabla))]) {
            await tx.$executeRawUnsafe(
              `DELETE FROM ${comillas(c.tabla)} WHERE ${comillas(c.columna)} = ANY($1::text[])`,
              usuarios,
            );
          }
        }

        const deEmpresa = await tx.$queryRawUnsafe<{ t: string }[]>(
          `SELECT c.table_name::text AS t
             FROM information_schema.columns c
             JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
            WHERE c.table_schema = 'public' AND c.column_name = 'organizacion_id' AND t.table_type = 'BASE TABLE'
              AND c.table_name <> 'organizacion'`,
        );
        for (const { t } of deEmpresa) {
          await tx.$executeRawUnsafe(`DELETE FROM ${comillas(t)} WHERE "organizacion_id" = ANY($1::text[])`, empresas);
        }
        await tx.$executeRawUnsafe(`DELETE FROM "organizacion" WHERE "id" = ANY($1::text[]) AND "es_demo"`, empresas);
        return empresas.length;
      },
      { timeout: 120_000, maxWait: 15_000 },
    );
  } finally {
    await cliente.$disconnect();
  }
}
