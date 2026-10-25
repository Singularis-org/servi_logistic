import type { PrismaClient } from "@prisma/client";

import type {
  IBienvenidaMaestroRepository,
  MaestroParaBienvenida,
} from "@/lib/interfaces/repositories/IBienvenidaMaestroRepository";

/**
 * El criterio de «primer maestro», compartido por las dos lecturas: si una eligiera a uno y la otra
 * a otro, el boton «Reenviar» se ocultaria por la contrasena de alguien que no recibe el correo.
 * El `id` desempata dos altas en el mismo milisegundo, para que el elegido no dependa del plan.
 */
const ORDEN_PRIMER_MAESTRO = [{ createdAt: "asc" as const }, { id: "asc" as const }];

/**
 * SL-41 (design §6.2 y §16.2). No abre `comoPlataforma`: lo abre la action, que es quien figura en
 * `EXCEPCIONES_DE_PLATAFORMA`. Por eso `organizacionId` va escrito en el `where` y no se deja a la
 * extension, que en contexto de plataforma no filtra.
 */
export class BienvenidaMaestroRepository implements IBienvenidaMaestroRepository {
  constructor(private readonly prisma: Pick<PrismaClient, "usuario">) {}

  async maestroParaBienvenida(organizacionId: string): Promise<MaestroParaBienvenida | null> {
    const fila = await this.prisma.usuario.findFirst({
      where: { organizacionId, rol: { value: "maestro" } },
      orderBy: ORDEN_PRIMER_MAESTRO,
      // Solo lo que el correo necesita: ni hash, ni telefono, ni documento salen de la base.
      select: { id: true, nombre: true, email: true, organizacion: { select: { nombre: true } } },
    });
    if (!fila || !fila.organizacion) return null;
    return {
      usuarioId: fila.id,
      nombre: fila.nombre,
      email: fila.email,
      empresaNombre: fila.organizacion.nombre,
    };
  }

  async organizacionesConBienvenidaPendiente(): Promise<string[]> {
    // Se traen TODOS los maestros con empresa y se elige el primero de cada una aqui. Filtrar
    // `contrasena_definida_at IS NULL` en el `where` estaria mal: si el primero ya la fijo, el
    // segundo pasaria a ser «el primero pendiente» y la empresa saldria. Son pocas filas (un
    // puñado de maestros por empresa) y es la pantalla del superadmin, no un camino caliente.
    const maestros = await this.prisma.usuario.findMany({
      where: { organizacionId: { not: null }, rol: { value: "maestro" } },
      orderBy: ORDEN_PRIMER_MAESTRO,
      select: { organizacionId: true, contrasenaDefinidaAt: true },
    });
    const vistas = new Set<string>();
    const pendientes: string[] = [];
    for (const m of maestros) {
      if (m.organizacionId === null || vistas.has(m.organizacionId)) continue;
      vistas.add(m.organizacionId);
      if (m.contrasenaDefinidaAt === null) pendientes.push(m.organizacionId);
    }
    return pendientes;
  }
}
