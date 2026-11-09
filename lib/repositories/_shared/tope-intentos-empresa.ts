import type { PrismaClient } from "@prisma/client";

import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";

/**
 * SLT-77 (design §2.1, §2.2, R27) — el tope de intentos de la empresa en contexto. Unico archivo con el
 * SQL de lectura, y acepta tambien el `tx` de una transaccion.
 *
 * SQL a mano y no `prisma.organizacion.findFirst()`: sin contexto o en plataforma, ese corre como dueño y
 * devuelve la fila de CUALQUIER empresa, y se cobraria con el tope de otra. Este no encuentra fila y falla.
 * Tampoco `findUnique` por id: `contextoActual()` viene vacio en una peticion con sesion.
 *
 * Sin cache (R9): el valor rige desde que se guarda, y cuesta una consulta por ejecucion.
 */
export async function leerTopeIntentosDeLaEmpresa(cliente: Pick<PrismaClient, "$queryRaw">): Promise<number> {
  const filas = await cliente.$queryRaw<{ tope: number }[]>`
    SELECT "tope_intentos_entrega" AS "tope" FROM "organizacion"
     WHERE "id" = NULLIF(current_setting('app.organizacion_id', true), '')`;
  if (filas.length === 0) throw new EmpresaNoResuelta("organizacion", "leerTopeIntentos");
  return filas[0].tope;
}
