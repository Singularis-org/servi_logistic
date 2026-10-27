import type { ModuloApagable } from "@prisma/client";

// SL-23 (design §5.2; R9–R13) — los módulos de UNA empresa vistos y cambiados por el superadmin, que
// no tiene empresa: aquí la empresa SÍ es un argumento, porque la elige quien administra la plataforma.

export interface EmpresaDeModulos {
  id: string;
  nombre: string;
}

export interface IModulosEmpresaRepository {
  /** La empresa, o `null` si no existe (R11). */
  empresa(organizacionId: string): Promise<EmpresaDeModulos | null>;
  /** Sus módulos encendidos. */
  activos(organizacionId: string): Promise<ModuloApagable[]>;
  /**
   * Enciende el módulo y registra `modulo_activado` en la misma transacción (R12). `false` si ya
   * estaba encendido: no escribe ni registra nada (R13).
   */
  encender(organizacionId: string, modulo: ModuloApagable, actorUsuarioId: string): Promise<boolean>;
  /** Apaga el módulo y registra `modulo_desactivado` en la misma transacción. `false` si ya estaba apagado. */
  apagar(organizacionId: string, modulo: ModuloApagable, actorUsuarioId: string): Promise<boolean>;
}
