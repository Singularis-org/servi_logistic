import { randomUUID } from "node:crypto";

import type { ModuloApagable, PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  EmpresaDeModulos,
  IModulosEmpresaRepository,
} from "@/lib/interfaces/repositories/IModulosEmpresaRepository";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";

export type ModulosEmpresaPrismaClient = Pick<PrismaClient, "organizacion" | "organizacionModulo" | "$transaction">;

// SL-23 (design §5.2; R7, R9–R13) — la ÚNICA escritura de `organizacion_modulo`. La hace el
// superadmin, que no tiene empresa, así que todo corre en `comoPlataforma`: como dueño, sin el filtro
// de la extensión ni el REVOKE de `servi_app`. Por eso `organizacion_id` se escribe explícito, en la
// fila y en el historial: en plataforma el DEFAULT de la columna sale NULL.
//
// Cada cambio REAL deja su fila en `historial_accion` de esa empresa, en la misma transacción (R12);
// uno repetido no escribe ni registra nada (R13).

function entradaDelCambio(
  accion: "modulo_activado" | "modulo_desactivado",
  organizacionId: string,
  filaId: string,
  modulo: ModuloApagable,
) {
  return {
    accion,
    entidadTipo: "organizacion_modulo" as const,
    // El id de la fila creada o borrada: opaco y sin FK, sobrevive al borrado al apagar.
    entidadId: filaId,
    entidadEtiqueta: etiquetaDeEntidad("organizacion_modulo", { moduloNombre: nombreDelModulo(modulo) }),
    valorNuevo: modulo,
    organizacionId,
  };
}

export class ModulosEmpresaRepository implements IModulosEmpresaRepository {
  constructor(private readonly prisma: ModulosEmpresaPrismaClient) {}

  empresa(organizacionId: string): Promise<EmpresaDeModulos | null> {
    return comoPlataforma("SL-23", "leer la empresa cuyos módulos gestiona el superadmin", () =>
      this.prisma.organizacion.findUnique({ where: { id: organizacionId }, select: { id: true, nombre: true } }),
    );
  }

  activos(organizacionId: string): Promise<ModuloApagable[]> {
    return comoPlataforma("SL-23", "leer los módulos de una empresa para el superadmin", async () => {
      const filas = await this.prisma.organizacionModulo.findMany({
        where: { organizacionId },
        select: { modulo: true },
      });
      return filas.map((f) => f.modulo);
    });
  }

  async encender(organizacionId: string, modulo: ModuloApagable, actorUsuarioId: string): Promise<boolean> {
    return comoPlataforma("SL-23", "encender un módulo de una empresa (superadmin)", () =>
      this.prisma.$transaction(async (tx) => {
        const id = randomUUID();
        // `skipDuplicates` es `ON CONFLICT DO NOTHING` sobre el único (empresa, módulo): encender lo
        // encendido cuenta 0 y no se registra (R13).
        const { count } = await tx.organizacionModulo.createMany({
          data: [{ id, organizacionId, modulo }],
          skipDuplicates: true,
        });
        if (count === 0) return false;
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [{ ...entradaDelCambio("modulo_activado", organizacionId, id, modulo), ...actor }]);
        return true;
      }),
    );
  }

  async apagar(organizacionId: string, modulo: ModuloApagable, actorUsuarioId: string): Promise<boolean> {
    return comoPlataforma("SL-23", "apagar un módulo de una empresa (superadmin)", () =>
      this.prisma.$transaction(async (tx) => {
        const fila = await tx.organizacionModulo.findFirst({
          where: { organizacionId, modulo },
          select: { id: true },
        });
        if (fila === null) return false;
        // Contado y por id: si otra petición la borró entre la lectura y aquí, no se registra nada.
        const { count } = await tx.organizacionModulo.deleteMany({ where: { id: fila.id } });
        if (count === 0) return false;
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [{ ...entradaDelCambio("modulo_desactivado", organizacionId, fila.id, modulo), ...actor }]);
        return true;
      }),
    );
  }
}
