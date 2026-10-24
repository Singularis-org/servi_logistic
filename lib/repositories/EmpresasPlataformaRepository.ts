import type { PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type { IEmpresasPlataformaRepository } from "@/lib/interfaces/repositories/IEmpresasPlataformaRepository";
import type { EmpresaListada } from "@/lib/types/empresas-plataforma";

/**
 * SL-32 (R29) — el listado de la pantalla «Empresas» del superadmin.
 *
 * Es una lectura de TODAS las empresas, asi que corre en contexto de plataforma: ahi la extension
 * del cliente no filtra por empresa. Quien decide que el actor puede verla es el servicio (R35);
 * aqui solo se elige que sale, y sale lo minimo que pinta la tabla.
 */
export class EmpresasPlataformaRepository implements IEmpresasPlataformaRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "organizacion">) {}

  listar(): Promise<EmpresaListada[]> {
    return comoPlataforma("SL-32", "listado de empresas del superadmin", async () => {
      const filas = await this.prisma.organizacion.findMany({
        // El `slug` (unico) desempata dos altas con la misma fecha: el orden no depende del plan.
        orderBy: [{ createdAt: "desc" }, { slug: "asc" }],
        select: {
          id: true,
          nombre: true,
          slug: true,
          createdAt: true,
          cobroPlataformaPorOrden: true,
          // Solo nombre y email: ni `password_hash`, ni telefono, ni documento salen de la base.
          usuarios: {
            where: { rol: { value: "maestro" } },
            orderBy: [{ createdAt: "asc" }, { email: "asc" }],
            select: { nombre: true, email: true },
          },
        },
      });
      return filas.map((f) => ({
        id: f.id,
        nombre: f.nombre,
        slug: f.slug,
        creadaEn: f.createdAt,
        maestros: f.usuarios,
        cobroPorOrden: f.cobroPlataformaPorOrden === null ? null : f.cobroPlataformaPorOrden.toFixed(2),
      }));
    });
  }
}
