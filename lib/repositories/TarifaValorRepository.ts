import { Prisma, type PrismaClient } from "@prisma/client";

import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { nivelDeValor } from "@/lib/tarifas/niveles";
import {
  etiquetaDeEntidad,
  etiquetaDePersona,
  valorDeCatalogo,
} from "@/lib/types/historial-accion-etiquetas";
import { ROLES_TARIFABLES } from "@/lib/types/tarifa";
import type { TarifaValorDTO } from "@/lib/types/tarifa-flexible";
import type {
  FijarValorDatos,
  FijarValorResultado,
  ITarifaValorRepository,
} from "@/lib/interfaces/repositories/ITarifaValorRepository";

/**
 * SLT-52 (design §8) — `tarifa_valor`. Sin `organizacion_id` en ningun `where`: lo pone la extension
 * del cliente y la politica RLS `tarifa_valor_por_empresa` lo respalda (R15). Nada de SQL a mano.
 *
 * El historial va DENTRO de la transaccion de cada escritura (R14) con `appendAccion`, el punto unico
 * del registro: el service no conoce Prisma y no tiene transaccion que compartir.
 */
type TarifaValorPrismaClient = Pick<
  PrismaClient,
  "tarifaValor" | "zona" | "grupoDistritos" | "usuario" | "vehiculo" | "$transaction" | "historialAccion"
>;

type TxValor = Pick<Prisma.TransactionClient, "tarifaValor">;

/** El importe tal como se guarda, para el antes/despues del historial (cabe en `varchar(60)`). */
function textoDelValor(v: {
  modo: string;
  valor: Prisma.Decimal | string;
  ivaPct: Prisma.Decimal | string | null;
}): string {
  const valor = new Prisma.Decimal(v.valor).toFixed(2);
  const iva = v.ivaPct === null ? "" : ` IVA ${new Prisma.Decimal(v.ivaPct).toFixed(2)}`;
  return valorDeCatalogo(`${v.modo} ${valor}${iva}`);
}

/**
 * La etiqueta CONGELADA del valor: su concepto y los nombres de su nivel. Se lee dentro de la
 * transaccion y, al quitar, ANTES del `DELETE` (despues no hay a quien preguntar).
 */
async function etiquetaDelValor(tx: TxValor, id: string): Promise<string> {
  const fila = await tx.tarifaValor.findUnique({
    where: { id },
    select: {
      concepto: true,
      zona: { select: { nombre: true } },
      grupo: { select: { nombre: true } },
      tienda: { select: { nombre: true, primerApellido: true } },
      vehiculo: { select: { name: true } },
    },
  });
  const partes = [
    fila?.zona?.nombre,
    fila?.grupo?.nombre,
    fila?.tienda == null ? null : etiquetaDePersona(fila.tienda),
    fila?.vehiculo?.name,
  ].filter((p): p is string => p != null && p !== "");
  return etiquetaDeEntidad("tarifa_valor", {
    concepto: fila?.concepto ?? "",
    nivel: partes.length === 0 ? null : partes.join(" · "),
  });
}

const SELECT_DTO = {
  id: true,
  concepto: true,
  modo: true,
  valor: true,
  ivaPct: true,
  zonaId: true,
  grupoId: true,
  tiendaId: true,
  mensajeroId: true,
  vehiculoId: true,
  updatedAt: true,
} as const satisfies Prisma.TarifaValorSelect;

type FilaDTO = Prisma.TarifaValorGetPayload<{ select: typeof SELECT_DTO }>;

function toDTO(f: FilaDTO): TarifaValorDTO {
  const nivel = nivelDeValor(f.concepto, f);
  // Los CHECK `tarifa_valor_niveles_*` hacen imposible una fila sin nivel valido; si aparece, la
  // base y `nivelDeValor` dejaron de decir lo mismo y callarlo pintaria un nivel inventado.
  if (!nivel.ok) {
    throw new Error(`tarifa_valor ${f.id} con un nivel que no es de su actor (${nivel.campo})`);
  }
  return {
    id: f.id,
    concepto: f.concepto,
    modo: f.modo,
    valor: f.valor.toFixed(2),
    ivaPct: f.ivaPct === null ? null : f.ivaPct.toFixed(2),
    nivel: nivel.nivel,
    zonaId: f.zonaId,
    grupoId: f.grupoId,
    tiendaId: f.tiendaId,
    mensajeroId: f.mensajeroId,
    vehiculoId: f.vehiculoId,
    updatedAt: f.updatedAt,
  };
}

export class TarifaValorRepository implements ITarifaValorRepository {
  constructor(private readonly prisma: TarifaValorPrismaClient) {}

  async existeZona(zonaId: string): Promise<boolean> {
    const fila = await this.prisma.zona.findFirst({ where: { id: zonaId }, select: { id: true } });
    return fila !== null;
  }

  async grupoEnZona(grupoId: string, zonaId: string): Promise<boolean> {
    const fila = await this.prisma.grupoDistritos.findFirst({
      where: { id: grupoId, zonaId },
      select: { id: true },
    });
    return fila !== null;
  }

  async esTiendaTarifable(tiendaId: string): Promise<boolean> {
    const fila = await this.prisma.usuario.findFirst({
      where: { id: tiendaId, rol: { value: { in: [...ROLES_TARIFABLES] } } },
      select: { id: true },
    });
    return fila !== null;
  }

  async existeVehiculo(vehiculoId: string): Promise<boolean> {
    const fila = await this.prisma.vehiculo.findFirst({ where: { id: vehiculoId }, select: { id: true } });
    return fila !== null;
  }

  /**
   * R8 — upsert por la clave natural. No es `upsert` de Prisma: el unico es NULLS NOT DISTINCT y
   * Prisma no admite `null` en un `where` de unico compuesto. Se busca la fila del nivel exacto
   * (`null` en el `where` es `IS NULL`) y se actualiza o se crea, dentro de la transaccion.
   *
   * Dos fijaciones simultaneas del mismo nivel nuevo chocan en `tarifa_valor_nivel_key` y la
   * segunda sale como error: la base no deja dos filas, que es lo que R8 pide.
   */
  async fijar(datos: FijarValorDatos, actorUsuarioId: string | null): Promise<FijarValorResultado> {
    return this.prisma.$transaction(async (tx) => {
      const nivel = {
        concepto: datos.concepto,
        zonaId: datos.zonaId,
        grupoId: datos.grupoId,
        tiendaId: datos.tiendaId,
        mensajeroId: null,
        vehiculoId: datos.vehiculoId,
      };
      const anterior = await tx.tarifaValor.findFirst({
        where: nivel,
        select: { id: true, modo: true, valor: true, ivaPct: true },
      });
      const importe = {
        modo: datos.modo,
        valor: new Prisma.Decimal(datos.valor),
        ivaPct: datos.ivaPct === null ? null : new Prisma.Decimal(datos.ivaPct),
        actualizadoPor: actorUsuarioId,
      };
      const fila =
        anterior === null
          ? await tx.tarifaValor.create({ data: { ...nivel, ...importe }, select: { id: true } })
          : await tx.tarifaValor.update({ where: { id: anterior.id }, data: importe, select: { id: true } });

      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "tarifa_valor_fijado",
          entidadTipo: "tarifa_valor",
          entidadId: fila.id,
          entidadEtiqueta: await etiquetaDelValor(tx, fila.id),
          ...actor,
          valorAnterior: anterior === null ? null : textoDelValor(anterior),
          valorNuevo: textoDelValor(datos),
        },
      ]);
      return { id: fila.id, reemplazo: anterior !== null };
    });
  }

  /**
   * R9 — borrado fisico. Lo congelado que apuntaba aqui queda con `tarifa_valor_id` NULL (FK SET
   * NULL) y conserva su importe. La etiqueta y el antes se leen ANTES del `DELETE`.
   */
  async quitar(id: string, actorUsuarioId: string | null): Promise<"ok" | "not_found"> {
    return this.prisma.$transaction(async (tx) => {
      const anterior = await tx.tarifaValor.findFirst({
        where: { id },
        select: { id: true, modo: true, valor: true, ivaPct: true },
      });
      if (anterior === null) return "not_found" as const;

      const etiqueta = await etiquetaDelValor(tx, id);
      const borradas = await tx.tarifaValor.deleteMany({ where: { id } });
      // Carrera: otro lo borro entre la lectura y aqui. Sin fila borrada no hay nada que registrar.
      if (borradas.count === 0) return "not_found" as const;

      const actor = await resolverActorCongelado(tx, actorUsuarioId);
      await appendAccion(tx, [
        {
          accion: "tarifa_valor_quitado",
          entidadTipo: "tarifa_valor",
          entidadId: id,
          entidadEtiqueta: etiqueta,
          ...actor,
          valorAnterior: textoDelValor(anterior),
          valorNuevo: null,
        },
      ]);
      return "ok" as const;
    });
  }

  async listar(filtro: { zonaId?: string }): Promise<TarifaValorDTO[]> {
    const filas = await this.prisma.tarifaValor.findMany({
      where: filtro.zonaId === undefined ? {} : { zonaId: filtro.zonaId },
      select: SELECT_DTO,
      orderBy: [{ concepto: "asc" }, { createdAt: "asc" }],
    });
    return filas.map(toDTO);
  }
}
