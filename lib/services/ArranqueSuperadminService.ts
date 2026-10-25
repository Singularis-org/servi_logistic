import type { z } from "zod";
import type {
  CrearSuperadminResultado,
  IArranqueSuperadminRepository,
} from "@/lib/interfaces/repositories/IArranqueSuperadminRepository";
import type {
  EntornoArranque,
  IArranqueSuperadminService,
} from "@/lib/interfaces/services/IArranqueSuperadminService";
import {
  arranqueSuperadminEnvSchema,
  REGLA_OBLIGATORIA,
  VARIABLES_ARRANQUE_SUPERADMIN,
  type ArranqueSuperadminResultado,
  type VariableArranqueSuperadmin,
  type VariableInvalida,
} from "@/lib/types/arranque-superadmin";
import { hashPassword } from "@/lib/utils/password";

const VARIABLES = new Set<string>(VARIABLES_ARRANQUE_SUPERADMIN);

function esVariable(clave: PropertyKey | undefined): clave is VariableArranqueSuperadmin {
  return typeof clave === "string" && VARIABLES.has(clave);
}

/**
 * R13: una entrada por cada regla incumplida, con el nombre de la variable y la regla. La regla
 * sale de los mensajes fijos del schema; un tipo invalido (la variable no esta) se reescribe a
 * `REGLA_OBLIGATORIA` para no depender de como describa zod lo que recibio.
 */
function variablesInvalidas(error: z.ZodError): VariableInvalida[] {
  const vistas = new Set<string>();
  const variables: VariableInvalida[] = [];
  for (const issue of error.issues) {
    const nombre = issue.path[0];
    if (!esVariable(nombre)) continue;
    const regla = issue.code === "invalid_type" ? REGLA_OBLIGATORIA : issue.message;
    const clave = `${nombre}\u0000${regla}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    variables.push({ nombre, regla });
  }
  return variables;
}

/**
 * Reconstruye el desenlace del repositorio campo a campo. Si una implementacion devolviera algo
 * de mas (la fila, el email), no llegaria a quien imprime el resultado (R16).
 */
function traducir(resultado: CrearSuperadminResultado): ArranqueSuperadminResultado {
  switch (resultado.status) {
    case "creado":
      return { status: "creado" };
    case "ya_existe":
      return { status: "ya_existe" };
    case "conflicto":
      return { status: "conflicto", campo: resultado.campo };
    case "catalogo_incompleto":
      return { status: "catalogo_incompleto", falta: resultado.falta };
  }
}

export class ArranqueSuperadminService implements IArranqueSuperadminService {
  constructor(private readonly repo: IArranqueSuperadminRepository) {}

  async arrancar(entorno: EntornoArranque): Promise<ArranqueSuperadminResultado> {
    const parsed = arranqueSuperadminEnvSchema.safeParse(entorno);
    if (!parsed.success) {
      return { status: "entrada_invalida", variables: variablesInvalidas(parsed.error) };
    }
    const { password, ...datos } = parsed.data;

    // El hash va antes de llamar al repositorio: asi el cerrojo de su transaccion no espera al
    // bcrypt, y la contrasena en claro no sale de este metodo (R16).
    const passwordHash = await hashPassword(password);

    const resultado = await this.repo.crearSiNoExiste({ ...datos, passwordHash });
    return traducir(resultado);
  }
}
