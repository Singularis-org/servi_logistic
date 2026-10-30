import type { ModuloApagable, PrismaClient } from "@prisma/client";

import { comoPlataforma } from "@/lib/db/contexto-empresa";
import type {
  EmpresaDeModulos,
  IModulosEmpresaRepository,
} from "@/lib/interfaces/repositories/IModulosEmpresaRepository";
import { apagarEnTx, encenderEnTx, entradaDelCambio } from "@/lib/repositories/_shared/modulos-en-tx";
import { appendAccion, resolverActorCongelado } from "@/lib/repositories/registrar-accion";

export type ModulosEmpresaPrismaClient = Pick<PrismaClient, "organizacion" | "organizacionModulo" | "$transaction">;

// SL-23 (design §5.2; R7, R9–R13) — el interruptor de `organizacion_modulo` del superadmin. La hace el
// superadmin, que no tiene empresa, así que todo corre en `comoPlataforma`: como dueño, sin el filtro
// de la extensión ni el REVOKE de `servi_app`. Por eso `organizacion_id` se escribe explícito, en la
// fila y en el historial: en plataforma el DEFAULT de la columna sale NULL.
//
// Cada cambio REAL deja su fila en `historial_accion` de esa empresa, en la misma transacción (R12);
// uno repetido no escribe ni registra nada (R13). El cambio de la fila vive en `_shared/modulos-en-tx`
// desde SL-24, que lo reutiliza dentro de la transacción de asignar o editar un plan (design §7.1).

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
        const { cambio, filaId } = await encenderEnTx(tx, organizacionId, modulo);
        if (!cambio) return false;
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [{ ...entradaDelCambio("modulo_activado", organizacionId, filaId, modulo), ...actor }]);
        return true;
      }),
    );
  }

  async apagar(organizacionId: string, modulo: ModuloApagable, actorUsuarioId: string): Promise<boolean> {
    return comoPlataforma("SL-23", "apagar un módulo de una empresa (superadmin)", () =>
      this.prisma.$transaction(async (tx) => {
        const { cambio, filaId } = await apagarEnTx(tx, organizacionId, modulo);
        if (!cambio) return false;
        const actor = await resolverActorCongelado(tx, actorUsuarioId);
        await appendAccion(tx, [{ ...entradaDelCambio("modulo_desactivado", organizacionId, filaId, modulo), ...actor }]);
        return true;
      }),
    );
  }
}
