import type { ModuloApagable } from "@prisma/client";

// SL-23 (design §4.2, §5.4; R19, R20) — un job de un módulo apagado para su empresa. No es un fallo:
// el drenador lo marca `descartado` con este motivo, sin backoff ni reintento y sin contarlo como
// fallido. El handler no llegó a correr.

export class JobDescartado extends Error {
  readonly motivo: string;

  constructor(readonly modulo: ModuloApagable) {
    const motivo = `modulo_inactivo:${modulo}`;
    super(motivo);
    this.name = "JobDescartado";
    this.motivo = motivo;
  }
}
