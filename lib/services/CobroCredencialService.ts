import { z } from "zod";

import { esPlataforma } from "@/lib/auth/plataforma";
import { CredencialIlegibleError } from "@/lib/crypto/boveda-integraciones";
import type { ContextoSecreto, ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { IFuenteAleatoria } from "@/lib/interfaces/external/IFuenteAleatoria";
import type { LeerCredencialesCobro, TrioCredencialCobro } from "@/lib/interfaces/external/IProveedorCobro";
import type { ICobroCredencialRepository } from "@/lib/interfaces/repositories/ICobroCredencialRepository";
import type {
  EstadoCredencialResult,
  GuardarCredencialResult,
  ICobroCredencialService,
} from "@/lib/interfaces/services/ICobroCredencialService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { ENTORNOS_COBRO, PROVEEDORES_COBRO, ProveedorCobroError } from "@/lib/types/cobro";

// SLT-227 (design §8) — las credenciales de los proveedores de cobro: guardarlas y consultarlas (solo el
// superadmin, R8–R10) y el lector que da los secretos descifrados al adaptador (R11).

/**
 * design §8.1 (R7): la «empresa» de los datos asociados de una credencial de plataforma. La bóveda no cambia: pide
 * tres textos no vacíos. Las empresas tienen ids `uuid`, y el `integracionId` es el id de la fila de
 * `cobro_proveedor_credencial`, así que un cifrado no se lee en otra fila, en otro campo ni en una integración.
 */
export const ORGANIZACION_PLATAFORMA_EN_BOVEDA = "plataforma";

function contexto(filaId: string, campo: string): ContextoSecreto {
  return { organizacionId: ORGANIZACION_PLATAFORMA_EN_BOVEDA, integracionId: filaId, campo };
}

/** R8: los campos de cada proveedor con adaptador, con la forma que da el proveedor. Wompi y Global66, en sus fichas. */
export const CAMPOS_POR_PROVEEDOR = {
  rebill: z
    .object({
      // Rebill rechaza las `pk_` en `x-api-key`: pegar la pública por error sale aquí. 500 es una red contra basura.
      apiKey: z.string().trim().startsWith("sk_").min(4).max(500),
      // El `signingSecret` completo, `whsec_` incluido: es la clave del HMAC (P4).
      secretoWebhook: z.string().trim().regex(/^whsec_[0-9a-f]{64}$/),
    })
    .strict(),
} as const;

export const guardarCredencialSchema = z.object({
  proveedor: z.enum(PROVEEDORES_COBRO),
  paisId: z.string().regex(/^[A-Z]{2}$/),
  entorno: z.enum(ENTORNOS_COBRO),
  secretos: z.record(z.string(), z.string()),
});

/** Los nombres de lo que falló. Una clave de más se nombra en genérico: la escribió quien llama y podría ser un valor. */
function camposConError(error: z.ZodError): string[] {
  const campos = new Set<string>();
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") campos.add("campo_no_reconocido");
    else campos.add(issue.path.map(String).join(".") || "entrada");
  }
  return [...campos];
}

export interface CobroCredencialDeps {
  repo: ICobroCredencialRepository;
  cifrador: ICifradorSecretos;
  fuente: Pick<IFuenteAleatoria, "nuevoId">;
  ahora: () => Date;
}

export class CobroCredencialService implements ICobroCredencialService {
  constructor(private readonly deps: CobroCredencialDeps) {}

  async guardar(actor: Actor, entrada: unknown): Promise<GuardarCredencialResult> {
    // R10: antes de leer nada.
    if (!esPlataforma(actor.rol)) return { estado: "forbidden" };

    const general = guardarCredencialSchema.safeParse(entrada);
    if (!general.success) return { estado: "validation_error", campos: camposConError(general.error) };
    const { proveedor, paisId, entorno } = general.data;
    if (!(proveedor in CAMPOS_POR_PROVEEDOR)) return { estado: "proveedor_no_disponible" };

    const campos = CAMPOS_POR_PROVEEDOR[proveedor as keyof typeof CAMPOS_POR_PROVEEDOR].safeParse(general.data.secretos);
    if (!campos.success) {
      return { estado: "validation_error", campos: camposConError(campos.error).map((c) => `secretos.${c}`) };
    }

    const trio: TrioCredencialCobro = { proveedor, paisId, entorno };
    // El id va en los datos asociados: si la fila ya existe se reusa el suyo, y si no, nace aquí (R7).
    const id = (await this.deps.repo.idDe(trio)) ?? this.deps.fuente.nuevoId();
    const secretos: Record<string, string> = {};
    for (const [campo, valor] of Object.entries(campos.data)) {
      secretos[campo] = await this.deps.cifrador.cifrar(valor, contexto(id, campo));
    }

    const r = await this.deps.repo.guardar({ id, trio, secretos, por: actor.usuarioId, ahora: this.deps.ahora() });
    return r === "ok" ? { estado: "ok", campos: Object.keys(secretos) } : { estado: r };
  }

  async estado(actor: Actor, trio: TrioCredencialCobro): Promise<EstadoCredencialResult> {
    if (!esPlataforma(actor.rol)) return { estado: "forbidden" };
    const guardada = await this.deps.repo.estado(trio);
    if (!guardada) return { estado: "ok", configurada: false };
    // Campo a campo y no con `...guardada`: si el repositorio un día trajera más, no sale (R9).
    return {
      estado: "ok",
      configurada: true,
      campos: guardada.campos,
      actualizadoAt: guardada.actualizadoAt,
      actualizadoPor: guardada.actualizadoPor,
    };
  }
}

/**
 * design §8.3 (R11) — la ÚNICA salida de un secreto descifrado. Sin actor: lo llama el adaptador en un job sin
 * sesión (SLT-228). La puerta es estructural: lo vigila la guardia `credenciales-cobro-solo-adaptador`.
 *
 * Un campo ilegible es `credencial_ilegible`, sin el campo ni el valor. `ConfiguracionBovedaError` (faltan las
 * variables del anillo) sale tal cual: es un fallo de despliegue, no del proveedor (design §4).
 */
export function crearLectorCredencialesCobro(deps: {
  repo: Pick<ICobroCredencialRepository, "secretosDe">;
  cifrador: Pick<ICifradorSecretos, "descifrar">;
}): LeerCredencialesCobro {
  return async (trio) => {
    const fila = await deps.repo.secretosDe(trio);
    if (!fila) return null;
    const claros: Record<string, string> = {};
    for (const [campo, guardado] of Object.entries(fila.secretos)) {
      try {
        claros[campo] = await deps.cifrador.descifrar(guardado, contexto(fila.id, campo));
      } catch (e) {
        if (e instanceof CredencialIlegibleError) throw new ProveedorCobroError("credencial_ilegible", trio.proveedor);
        throw e;
      }
    }
    return claros;
  };
}
