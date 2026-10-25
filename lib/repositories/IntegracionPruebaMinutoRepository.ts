import type { PrismaClient } from "@prisma/client";

import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type {
  ConteoPruebaMinuto,
  IIntegracionPruebaMinutoRepository,
} from "@/lib/interfaces/repositories/IIntegracionPruebaMinutoRepository";

// SL-36 (design §6, R16) — el contador del límite de pruebas. Solo la consulta: el límite y el
// «vuelve en N segundos» los decide el service.

type PruebaMinutoPrismaClient = Pick<PrismaClient, "$queryRaw">;

export class IntegracionPruebaMinutoRepository implements IIntegracionPruebaMinutoRepository {
  constructor(private readonly prisma: PruebaMinutoPrismaClient) {}

  /**
   * SQL a mano y no `upsert` de Prisma, como `AsistenteUsoRepository`: el `upsert` solo se traduce a
   * un `ON CONFLICT` nativo bajo condiciones que no controla este repo y, si no se cumplen, degrada
   * a leer-y-escribir sin avisar. Aquí la atomicidad es el requisito: con dos pruebas a la vez, las
   * dos tienen que contar.
   *
   * La empresa va ESCRITA en el `INSERT` y en el `WHERE` del `DO UPDATE`, sacada del contexto. La
   * RLS acotaría igual, pero un cliente sin la envoltura (owner, sin `set_config`) contaría en otra
   * fila o fallaría por el `NOT NULL`: el valor explícito es lo que el test de dos empresas mide.
   *
   * El minuto lo pone la base (`date_trunc('minute', now())`) y no el reloj de la instancia: dos
   * instancias con relojes desfasados contarían en minutos distintos.
   */
  async sumarPrueba(): Promise<ConteoPruebaMinuto> {
    const contexto = contextoActual();
    if (contexto?.tipo !== "empresa") throw new EmpresaNoResuelta("IntegracionPruebaMinuto", "$queryRaw");
    const organizacionId = contexto.organizacionId;

    const filas = await this.prisma.$queryRaw<{ intentos: number; minuto: Date }[]>`
      INSERT INTO "integracion_prueba_minuto" ("id", "organizacion_id", "minuto", "intentos")
      VALUES (gen_random_uuid()::text, ${organizacionId}, date_trunc('minute', now()), 1)
      ON CONFLICT ("organizacion_id", "minuto") DO UPDATE
        SET "intentos" = "integracion_prueba_minuto"."intentos" + 1
        WHERE "integracion_prueba_minuto"."organizacion_id" = ${organizacionId}
      RETURNING "intentos", "minuto"
    `;
    const fila = filas[0];
    // Sin fila solo si el `WHERE` no casó, y eso solo pasa si la fila del conflicto es de otra
    // empresa: imposible con el único (organizacion_id, minuto). Se falla cerrado: sin conteo no se
    // prueba.
    if (fila === undefined) throw new Error("integracion_prueba_minuto: el conteo no devolvio fila");
    return { intentos: Number(fila.intentos), minuto: fila.minuto };
  }
}
