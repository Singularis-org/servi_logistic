import { ROLES_MI_PLAN } from "@/lib/auth/menu-visibility";
import type {
  CambioProgramadoLeido,
  IMiPlanRepository,
  PlanDeLaEmpresaLeido,
} from "@/lib/interfaces/repositories/IMiPlanRepository";
import type { IMiPlanService } from "@/lib/interfaces/services/IMiPlanService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import { filasDeConsumo, reinicioDelCiclo } from "@/lib/planes/consumo";
import { lineasDeCambioDelPlan, textoDelPrecio, type CambioDelPlanParaCorreo } from "@/lib/planes/mensajes";
import { diferenciasDelPlan } from "@/lib/planes/rastro";
import type { CambioPendienteVista, MiPlanResult, PlanConConsumo } from "@/lib/types/consumo-plan";
import type { PlanDTO, VersionPlan } from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";

// SLT-58 (design §3.1) — primero quién (R8) y solo después la base: ningún rol fuera de
// `ROLES_MI_PLAN`, ni el superadmin, ni una petición sin sesión llega al repositorio.

const FORBIDDEN: MiPlanResult = { estado: "forbidden" };

function puedeVerMiPlan(actor: Actor | null): actor is Actor {
  return actor !== null && (ROLES_MI_PLAN as readonly string[]).includes(actor.rol);
}

/**
 * `diferenciasDelPlan` compara `PlanDTO` enteros. La función de la base no devuelve id, visibilidad,
 * empresa ni archivado porque la empresa no los necesita; las dos versiones comparten este relleno,
 * así que nunca aparecen como un cambio.
 */
function comoPlanDTO(version: VersionPlan): PlanDTO {
  return { id: "", visibilidad: "publico", organizacionId: null, archivado: false, ...version };
}

/** R7: las mismas líneas que el correo de SL-24, comparando la versión vigente con la pendiente. */
function cambioPendienteDe(vigente: VersionPlan, cambio: CambioProgramadoLeido): CambioPendienteVista {
  const antes = comoPlanDTO(vigente);
  const diferencias = diferenciasDelPlan(antes, { ...antes, ...cambio.version });
  return {
    vigenteDesde: fechaCalendarioCR(cambio.vigenteDesde),
    // Mismo molde que el job del correo: `diferenciasDelPlan` deja `{ antes, despues }` como `unknown`.
    lineas: lineasDeCambioDelPlan(diferencias as CambioDelPlanParaCorreo),
  };
}

function planConConsumo(leido: PlanDeLaEmpresaLeido, ahora: Date): PlanConConsumo {
  const { vigente } = leido;
  return {
    nombre: vigente.nombre,
    precioTexto: textoDelPrecio(vigente.precio),
    modulos: ORDEN_MODULOS.filter((m) => vigente.modulos.includes(m)).map((clave) => ({
      clave,
      nombre: nombreDelModulo(clave),
    })),
    filas: filasDeConsumo(vigente.topes, leido.uso),
    reinicio: reinicioDelCiclo(leido.ancla, ahora),
    cambioPendiente: leido.cambio === null ? null : cambioPendienteDe(vigente, leido.cambio),
  };
}

export class MiPlanService implements IMiPlanService {
  constructor(
    private readonly repo: IMiPlanRepository,
    private readonly ahora: () => Date = () => new Date(),
  ) {}

  async ver(actor: Actor | null): Promise<MiPlanResult> {
    if (!puedeVerMiPlan(actor)) return FORBIDDEN;
    const leido = await this.repo.planDeLaEmpresa();
    return { estado: "ok", plan: leido === null ? null : planConConsumo(leido, this.ahora()) };
  }
}
