import type { ModuloApagable } from "@prisma/client";

import { ForbiddenError } from "@/lib/errors/app-error";
import { nombreDelModulo } from "@/lib/modulos/catalogo";

// SL-23 (design §5.1, §5.5; R17, R18, R33) — una action, un endpoint o un job tocan un módulo apagado
// para su empresa. Es un `ForbiddenError` (403, `code: "FORBIDDEN"`): el código propio viaja en
// `details.codigo` para no ampliar el `AppErrorCode` cerrado de la feature 10, ni su `switch`
// exhaustivo en `toActionError` (decisión aprobada el 2026-10-26).

export const CODIGO_MODULO_INACTIVO = "modulo_inactivo";

export class ModuloInactivoError extends ForbiddenError {
  readonly modulo: ModuloApagable;

  constructor(modulo: ModuloApagable) {
    super(`El módulo ${nombreDelModulo(modulo)} no está activo para esta empresa.`, {
      codigo: CODIGO_MODULO_INACTIVO,
      modulo,
    });
    this.name = "ModuloInactivoError";
    this.modulo = modulo;
  }
}
