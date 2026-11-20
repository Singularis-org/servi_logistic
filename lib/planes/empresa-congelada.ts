import { EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { llevaSqlstate } from "@/lib/db/sqlstate";
import { ForbiddenError } from "@/lib/errors/app-error";
import { MENSAJE_EMPRESA_CONGELADA } from "@/lib/planes/mora";

// SLT-121 (design §6.1, §6.2; R13, R14, R16) — la empresa congelada por mora, vista desde la app.
//
// La base rechaza toda escritura de `servi_app` sin permiso con SQLSTATE `SL121` (trigger
// `bloqueo_por_mora`). Aqui se convierte en un `ForbiddenError` (403, `code: "FORBIDDEN"`) con
// `details.codigo = "empresa_congelada"`, igual que `modulo_inactivo` (SL-23) y `tope_plan` (SL-24): el
// `AppErrorCode` es un conjunto cerrado y ampliarlo cambia el `switch` exhaustivo de `toActionError`.
//
// Este modulo lo importa `lib/db/extension-empresa.ts`, que a su vez importa `prisma-client.ts`: por eso
// aqui no se importan arriba ni el cliente ni el repositorio (seria un ciclo), sino en la lectura, como hace
// el propio `prisma-client.ts` con su resolutor. El texto del error vive en `mora.ts` (puro), con los demas
// textos de la mora.

export { MENSAJE_EMPRESA_CONGELADA };
export const SQLSTATE_EMPRESA_CONGELADA = "SL121";
export const CODIGO_EMPRESA_CONGELADA = "empresa_congelada";

export class EmpresaCongelada extends ForbiddenError {
  constructor(opciones?: { cause?: unknown }) {
    super(MENSAJE_EMPRESA_CONGELADA, { codigo: CODIGO_EMPRESA_CONGELADA });
    this.name = "EmpresaCongelada";
    if (opciones && "cause" in opciones) this.cause = opciones.cause;
  }
}

/**
 * Convierte un error con SQLSTATE `SL121` en `EmpresaCongelada` (con el original en `cause`); cualquier
 * otro error se devuelve tal cual. Pensado para `throw traducirErrorDeMora(e)`.
 */
export function traducirErrorDeMora(e: unknown): unknown {
  if (e instanceof EmpresaCongelada || !llevaSqlstate(e, SQLSTATE_EMPRESA_CONGELADA)) return e;
  return new EmpresaCongelada({ cause: e });
}

/** Lo que la puerta necesita saber de la empresa del contexto. */
export type LectorCongelamiento = { estaCongelada(): Promise<boolean> };

/**
 * La lectura por defecto: `MoraEmpresaRepository.estaCongelada()` (design §5.1), sobre la empresa que fija la
 * envoltura (`app.organizacion_id`), no sobre un id que pase el llamador. Sin empresa lanza `EmpresaNoResuelta`.
 */
const lectorPorDefecto: LectorCongelamiento = {
  async estaCongelada() {
    const [{ getPrismaClient }, { MoraEmpresaRepository }] = await Promise.all([
      import("@/lib/db/prisma-client"),
      import("@/lib/repositories/MoraEmpresaRepository"),
    ]);
    return new MoraEmpresaRepository(getPrismaClient()).estaCongelada();
  },
};

/**
 * Para la API por key y la carga masiva (design §6.2): con la empresa del contexto congelada lanza
 * `EmpresaCongelada` (403) antes de leer el cuerpo. Una consulta por peticion, sin memoria entre
 * peticiones: un descongelamiento vale desde la siguiente.
 *
 * Sin empresa no aplica (como `exigirModuloActivo`): sin empresa no se escribe ningun dato de negocio, asi
 * que la puerta no abre nada.
 */
export async function exigirEmpresaOperativa(lector: LectorCongelamiento = lectorPorDefecto): Promise<void> {
  let congelada: boolean;
  try {
    congelada = await lector.estaCongelada();
  } catch (e) {
    // Solo «sin empresa». Cualquier otro fallo se propaga: tragarlo abriria la puerta.
    if (e instanceof EmpresaNoResuelta) return;
    throw e;
  }
  if (congelada) throw new EmpresaCongelada();
}
