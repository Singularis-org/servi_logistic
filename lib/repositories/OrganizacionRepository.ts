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

/** Las posiciones que admite el CHECK de `premio_ranking` (R8 de la feature 76). */
const POSICIONES_DEL_PODIO = [1, 2, 3] as const;

async function altaEnTransaccion(
  tx: Prisma.TransactionClient,
  datos: AltaEmpresaDatos,
): Promise<AltaEmpresaResultado> {
  // Dos altas del mismo slug a la vez se ponen en fila: la segunda ve la organización de la
  // primera y decide idempotencia o conflicto en vez de chocar con el único.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${datos.slug}))`;

  const existente = await tx.organizacion.findUnique({
    where: { slug: datos.slug },
    select: { id: true, paisId: true },
  });
  if (existente) return decidirSobreExistente(tx, existente, datos);

  // SL-20 (R6): el país tiene que existir. Se mira antes de escribir nada para no depender del
  // rechazo de la FK, que llegaría con la transacción ya abortada.
  // Enmienda 2026-10-26, decisión 6 (R45): y tener cobertura. Solo frena el alta NUEVA: la repetición
  // de una empresa que ya existe se decidió arriba, antes de mirar el país (R46, design §13).
  const pais = await tx.pais.findUnique({ where: { id: datos.paisId }, select: { disponible: true } });
  if (!pais || !pais.disponible) return { estado: "invalida", campo: "paisId" };

  const tipoIdentificacion = await tx.tipoIdentificacion.findUnique({
    where: { value: datos.maestro.tipoDocumento },
    select: { id: true },
  });
  if (!tipoIdentificacion) return { estado: "invalida", campo: "maestro.tipoDocumento" };

  const rol = await tx.rol.findUnique({ where: { value: "maestro" }, select: { id: true } });
  if (!rol) throw new Error("alta de empresa: falta el rol 'maestro' en el catálogo `rol`");

  const organizacion = await tx.organizacion.create({
    data: { nombre: datos.nombre, slug: datos.slug, paisId: datos.paisId },
    select: { id: true },
  });
  await tx.$executeRaw`SELECT set_config('app.organizacion_id', ${organizacion.id}, true)`;

  // SL-17 T3.9: el podio del ranking es configuracion de cada empresa (una fila por posicion, monto
  // NULL = sin premio) y su repositorio solo actualiza: sin estas filas, el maestro no podria fijar
  // ningun premio. Va antes del maestro y en la misma transaccion: si el email o el documento
  // chocan, el rollback se lleva tambien el podio.
  await tx.premioRanking.createMany({
    data: POSICIONES_DEL_PODIO.map((posicion) => ({ posicion, organizacionId: organizacion.id })),
  });

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

/**
 * R45: el mismo slug con el mismo maestro es la misma alta; con otro, es otra empresa.
 * SL-20 (R8): la misma alta con otro país no es idempotente: el país no cambia nunca (R7), así que
 * responder `ya_existe` diría que quedó en un país en el que no está.
 */
async function decidirSobreExistente(
  tx: Prisma.TransactionClient,
  existente: { id: string; paisId: string },
  datos: AltaEmpresaDatos,
): Promise<AltaEmpresaResultado> {
  const mismoMaestro = await tx.usuario.findFirst({
    where: { organizacionId: existente.id, email: datos.maestro.email, rol: { value: "maestro" } },
    select: { id: true },
  });
  if (!mismoMaestro) return { estado: "conflicto", campo: "slug" };
  if (existente.paisId !== datos.paisId) return { estado: "conflicto", campo: "paisId" };
  return { estado: "ya_existe", organizacionId: existente.id };
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
