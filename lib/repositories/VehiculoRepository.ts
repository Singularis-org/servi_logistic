import type { Prisma, PrismaClient, Vehiculo } from "@prisma/client";
import type { VehiculoDTO } from "@/lib/types/vehiculos";
import type { IVehiculoRepository } from "@/lib/interfaces/repositories/IVehiculoRepository";
import { resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { appendRastroVehiculo } from "@/lib/repositories/registrar-rastro-vehiculo";

// SL-42 (design §2.2, §4.2): cada escritura y su rastro van en la MISMA `$transaction`. `usuario`
// entra en el `Pick` porque el rastro congela el nombre del actor, y `usuario` es de negocio: el
// borde corre esto dentro de `comoPlataforma` (design §3, enmienda 2026-11-04).
type VehiculoPrismaClient = Pick<PrismaClient, "vehiculo" | "usuario" | "vehiculoRastro" | "$transaction">;

type Tx = Prisma.TransactionClient;

function toDTO(row: Vehiculo): VehiculoDTO {
  return { id: row.id, name: row.name, activo: row.activo };
}

/**
 * El actor congelado del rastro. `actor_nombre` es NOT NULL: un id que no resuelve queda en ''
 * (mismo criterio que `plan_rastro`), en vez de tumbar la accion que registra.
 */
async function actorDelRastro(tx: Tx, actorUsuarioId: string) {
  const { actorNombre } = await resolverActorCongelado(tx, actorUsuarioId);
  return { actorUsuarioId, actorNombre: actorNombre ?? "" };
}

export class VehiculoRepository implements IVehiculoRepository {
  constructor(private readonly prisma: VehiculoPrismaClient) {}

  async findMany(opciones: { soloActivos?: boolean } = {}): Promise<VehiculoDTO[]> {
    const rows = await this.prisma.vehiculo.findMany({
      where: opciones.soloActivos ? { activo: true } : undefined,
      orderBy: { name: "asc" },
    });
    return rows.map(toDTO);
  }

  async findById(id: string): Promise<VehiculoDTO | null> {
    const row = await this.prisma.vehiculo.findUnique({ where: { id } });
    return row ? toDTO(row) : null;
  }

  async findByName(name: string): Promise<VehiculoDTO | null> {
    const row = await this.prisma.vehiculo.findUnique({ where: { name } });
    return row ? toDTO(row) : null;
  }

  async create(name: string, actorUsuarioId: string): Promise<VehiculoDTO> {
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.vehiculo.create({ data: { name, activo: true } });
      await appendRastroVehiculo(tx, {
        accion: "vehiculo_creado",
        vehiculoId: row.id,
        vehiculoNombre: row.name,
        ...(await actorDelRastro(tx, actorUsuarioId)),
      });
      return toDTO(row);
    });
  }

  async rename(id: string, name: string, actorUsuarioId: string): Promise<VehiculoDTO | null> {
    return this.prisma.$transaction(async (tx) => {
      const previo = await tx.vehiculo.findUnique({ where: { id } });
      if (!previo) return null;
      // El no-op se decide aqui otra vez, dentro de la tx: el servicio ya lo filtra, pero solo el
      // valor leido junto a la escritura garantiza que no quede un rastro de un cambio que no hubo.
      if (previo.name === name) return toDTO(previo);

      // updateMany y no update: si la fila desaparece entre la lectura y la escritura, count 0 en
      // vez de P2025, y sin rastro.
      const res = await tx.vehiculo.updateMany({ where: { id }, data: { name } });
      if (res.count === 0) return null;
      await appendRastroVehiculo(tx, {
        accion: "vehiculo_renombrado",
        vehiculoId: id,
        vehiculoNombre: name,
        valorAnterior: previo.name,
        valorNuevo: name,
        ...(await actorDelRastro(tx, actorUsuarioId)),
      });
      return toDTO({ ...previo, name });
    });
  }

  async setActivo(id: string, activo: boolean, actorUsuarioId: string): Promise<VehiculoDTO | null> {
    return this.prisma.$transaction(async (tx) => {
      const previo = await tx.vehiculo.findUnique({ where: { id } });
      if (!previo) return null;
      if (previo.activo === activo) return toDTO(previo);

      // Solo la columna `activo`: ni `usuario.vehiculo_id` ni `tarifa_zona_mensajero` se tocan (R6).
      const res = await tx.vehiculo.updateMany({ where: { id }, data: { activo } });
      if (res.count === 0) return null;
      await appendRastroVehiculo(tx, {
        accion: activo ? "vehiculo_activado" : "vehiculo_desactivado",
        vehiculoId: id,
        vehiculoNombre: previo.name,
        ...(await actorDelRastro(tx, actorUsuarioId)),
      });
      return toDTO({ ...previo, activo });
    });
  }
}
