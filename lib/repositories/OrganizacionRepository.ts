import type { Prisma, PrismaClient } from "@prisma/client";

import type { IOrganizacionRepository } from "@/lib/interfaces/repositories/IOrganizacionRepository";
import type { AltaEmpresaDatos, AltaEmpresaResultado } from "@/lib/types/organizacion";
import { textoConstraintP2002 } from "@/lib/repositories/_shared/prisma-unique";

/**
 * SL-17 (design §7.7) — el alta de empresa en una sola transacción.
 *
 * Corre en contexto de plataforma (lo pone `altaEmpresaAction`): ahí la extensión del cliente no
 * filtra ni envuelve, y solo exige que el usuario lleve la empresa escrita (R35). Por eso el
 * `organizacionId` del maestro va explícito, y la empresa se fija además en la transacción para
 * que cualquier `DEFAULT` o trigger que lea `app.organizacion_id` vea la misma.
 */
export class OrganizacionRepository implements IOrganizacionRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "$transaction">) {}

  async altaEmpresa(datos: AltaEmpresaDatos): Promise<AltaEmpresaResultado> {
    try {
      return await this.prisma.$transaction((tx) => altaEnTransaccion(tx, datos));
    } catch (error) {
      // El rechazo ya revirtió la transacción entera: la organización tampoco queda (R46).
      const campo = campoDuplicado(error);
      if (campo) return { estado: "conflicto", campo };
      throw error;
    }
  }
}

async function altaEnTransaccion(
  tx: Prisma.TransactionClient,
  datos: AltaEmpresaDatos,
): Promise<AltaEmpresaResultado> {
  // Dos altas del mismo slug a la vez se ponen en fila: la segunda ve la organización de la
  // primera y decide idempotencia o conflicto en vez de chocar con el único.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datos.slug}))`;

  const existente = await tx.organizacion.findUnique({
    where: { slug: datos.slug },
    select: { id: true },
  });
  if (existente) return decidirSobreExistente(tx, existente.id, datos.maestro.email);

  const tipoIdentificacion = await tx.tipoIdentificacion.findUnique({
    where: { value: datos.maestro.tipoDocumento },
    select: { id: true },
  });
  if (!tipoIdentificacion) return { estado: "invalida", campo: "maestro.tipoDocumento" };

  const rol = await tx.rol.findUnique({ where: { value: "maestro" }, select: { id: true } });
  if (!rol) throw new Error("alta de empresa: falta el rol 'maestro' en el catálogo `rol`");

  const organizacion = await tx.organizacion.create({
    data: { nombre: datos.nombre, slug: datos.slug },
    select: { id: true },
  });
  await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${organizacion.id}, true)`;

  const maestro = await tx.usuario.create({
    data: {
      nombre: datos.maestro.nombre,
      email: datos.maestro.email,
      telefono: datos.maestro.telefono,
      cedula: datos.maestro.documento,
      tipoIdentificacionId: tipoIdentificacion.id,
      rolId: rol.id,
      passwordHash: datos.maestro.passwordHash,
      estado: "activo",
      organizacionId: organizacion.id,
    },
    select: { id: true },
  });

  return { estado: "creada", organizacionId: organizacion.id, maestroId: maestro.id };
}

/** R45: el mismo slug con el mismo maestro es la misma alta; con otro, es otra empresa. */
async function decidirSobreExistente(
  tx: Prisma.TransactionClient,
  organizacionId: string,
  email: string,
): Promise<AltaEmpresaResultado> {
  const mismoMaestro = await tx.usuario.findFirst({
    where: { organizacionId, email, rol: { value: "maestro" } },
    select: { id: true },
  });
  return mismoMaestro
    ? { estado: "ya_existe", organizacionId }
    : { estado: "conflicto", campo: "slug" };
}

/**
 * El campo de un P2002, por el nombre de la restricción (`usuario_email_key`,
 * `usuario_cedula_key`, `organizacion_slug_key`). Bajo el driver adapter el nombre viene en el
 * mensaje original, no en `meta.target`: de eso se encarga `textoConstraintP2002`.
 */
function campoDuplicado(error: unknown): "email" | "documento" | "slug" | null {
  const texto = textoConstraintP2002(error);
  if (!texto) return null;
  if (texto.includes("email")) return "email";
  if (texto.includes("cedula")) return "documento";
  if (texto.includes("slug")) return "slug";
  return null;
}
