import type { Prisma, PrismaClient } from "@prisma/client";

import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import type {
  IIntegracionRecifradoRepository,
  SecretosGuardados,
} from "@/lib/interfaces/repositories/IIntegracionRecifradoRepository";

// SL-36 (design §12; R39, R40) — acceso a `integracion` para el recifrado. Corre dentro de
// `paraCadaEmpresa`, asi que cada empresa va en su contexto, con la RLS de siempre y sin ninguna
// excepcion de plataforma nueva.
//
// La empresa del contexto va TAMBIEN en el `where`, como en `IntegracionRepository`: si un dia la
// extension no envolviera este camino, una empresa no recifraria (ni contaria) filas de otra. Lo
// mide `tests/integration/db/recifrado-integraciones.test.ts`.

type RecifradoPrismaClient = Pick<PrismaClient, "integracion">;

function empresaEnCurso(operacion: string): string {
  const contexto = contextoActual();
  if (contexto?.tipo !== "empresa") throw new EmpresaNoResuelta("Integracion", operacion);
  return contexto.organizacionId;
}

/** Los secretos como `{ campo: texto }`; un valor que no es texto no se puede recifrar ni contar. */
function comoTextos(secretos: Prisma.JsonValue): Record<string, string> {
  const salida: Record<string, string> = {};
  if (secretos === null || typeof secretos !== "object" || Array.isArray(secretos)) return salida;
  for (const [campo, valor] of Object.entries(secretos)) {
    if (typeof valor === "string") salida[campo] = valor;
  }
  return salida;
}

export class IntegracionRecifradoRepository implements IIntegracionRecifradoRepository {
  constructor(private readonly prisma: RecifradoPrismaClient) {}

  async listarSecretos(): Promise<SecretosGuardados[]> {
    const organizacionId = empresaEnCurso("findMany");
    const filas = await this.prisma.integracion.findMany({
      where: { organizacionId },
      select: { id: true, secretos: true },
      orderBy: { id: "asc" },
    });
    return filas.map((fila) => ({ id: fila.id, secretos: comoTextos(fila.secretos) }));
  }

  async reemplazarSecretos(
    id: string,
    anteriores: Readonly<Record<string, string>>,
    nuevos: Readonly<Record<string, string>>,
  ): Promise<boolean> {
    const organizacionId = empresaEnCurso("updateMany");
    // Una sola sentencia por fila: es atomica sin abrir transaccion, y el `equals` sobre el JSON
    // entero es lo que evita pisar una edicion concurrente del maestro con un valor viejo.
    const { count } = await this.prisma.integracion.updateMany({
      where: { id, organizacionId, secretos: { equals: anteriores } },
      data: { secretos: nuevos },
    });
    return count === 1;
  }
}
