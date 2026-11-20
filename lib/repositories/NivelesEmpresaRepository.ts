import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { INivelesEmpresaRepository } from "@/lib/interfaces/repositories/INivelesEmpresaRepository";

// SLT-215 (design §3.5) — el cierre mensual de los niveles por volumen de todas las empresas. Corre como plataforma:
// las tablas de niveles están cerradas a `servi_app` para escribir y `plan_nivel_cerrar_meses` es del dueño con
// `REVOKE EXECUTE … FROM PUBLIC` (R36). `FichaJira` no admite `SLT` (deuda D29): lleva `SL-24`, la de los planes,
// como `FacturaPlataformaRepository`. No hay lectura para la empresa: «Mi plan» es de SLT-216.

// `$transaction` es opcional porque el cliente de una transacción (`Prisma.TransactionClient`) no lo declara; sin
// él, ya se está dentro de una.
type NivelesPrismaClient = Pick<PrismaClient, "$queryRaw"> & { $transaction?: PrismaClient["$transaction"] };
type ClienteDelCierre = Pick<PrismaClient, "$queryRaw">;

/** El instante como `TIMESTAMP` sin zona en UTC, como lo guarda la base (la forma de `PlanesRepository`). */
function comoTimestamp(instante: Date): string {
  return instante.toISOString().replace("T", " ").replace("Z", "");
}

async function cerrarMesesEn(c: ClienteDelCierre, organizacionId: string, ahora: Date): Promise<number> {
  // La función toma la empresa en FOR UPDATE: dos cierres, o un cierre y un recálculo, se serializan (R29).
  const [fila] = await c.$queryRaw<{ cerrados: number }[]>`
    SELECT plan_nivel_cerrar_meses(${organizacionId}, ${comoTimestamp(ahora)}::timestamp) AS "cerrados"`;
  return fila?.cerrados ?? 0;
}

export class NivelesEmpresaRepository implements INivelesEmpresaRepository {
  constructor(private readonly prisma: NivelesPrismaClient) {}

  empresasConMesPendiente(ahora: Date): Promise<string[]> {
    return comoPlataforma("SL-24", "SLT-215: listar las empresas con meses de niveles por cerrar (R29)", async () => {
      // El mes de la plataforma sale de la misma función que usa el cierre (R23): una sola definición de «mes».
      const filas = await this.prisma.$queryRaw<{ id: string }[]>`
        SELECT "organizacion_id" AS "id" FROM "plan_nivel_empresa"
         WHERE "cerrado_hasta_at" < plan_inicio_periodo_calendario('mensual', ${comoTimestamp(ahora)}::timestamp)
         ORDER BY "organizacion_id"`;
      return filas.map((f) => f.id);
    });
  }

  cerrarMeses(organizacionId: string, ahora: Date): Promise<number> {
    return comoPlataforma("SL-24", "SLT-215: cerrar los meses de los niveles por volumen de una empresa (R25–R29)", () =>
      this.prisma.$transaction === undefined
        ? cerrarMesesEn(this.prisma, organizacionId, ahora)
        : this.prisma.$transaction((tx) => cerrarMesesEn(tx, organizacionId, ahora)),
    );
  }
}
