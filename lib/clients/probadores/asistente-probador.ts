// SL-36 (design §5, §18, R17) — prueba del asistente: el listado de modelos de Anthropic.
//
// `GET /v1/models` es de solo lectura y no consume tokens: probar con `/v1/messages` costaría
// dinero a la empresa en cada «Probar conexión». La clave va en `x-api-key`, nunca en la URL.
// Endpoint y cabeceras confirmados por el implementer (T4.4): 200 = válida, 401 = clave no aceptada.
import { z } from "zod";
import type {
  CredencialPorServicio,
  IProbadorIntegracion,
  MotivoPruebaPorServicio,
  ResultadoPrueba,
} from "@/lib/interfaces/external/IProbadorIntegracion";
import {
  jsonSinLanzar,
  llamar,
  nombreDeError,
  registrarFallo,
  resolverOpciones,
  type OpcionesProbador,
  type OpcionesResueltas,
} from "@/lib/clients/probadores/comun";

export const URL_MODELOS_ANTHROPIC = "https://api.anthropic.com/v1/models";
/** La misma versión de API que fija `lib/clients/anthropic-asistente.ts`. */
const ANTHROPIC_VERSION = "2023-06-01";

const listadoSchema = z.object({ data: z.array(z.unknown()) });

type Motivo = MotivoPruebaPorServicio["asistente"];
type Resultado = ResultadoPrueba<"asistente">;

export class AsistenteProbador implements IProbadorIntegracion<"asistente"> {
  private readonly opts: OpcionesResueltas;

  constructor(opts: OpcionesProbador = {}) {
    this.opts = resolverOpciones(opts);
  }

  async probar(credencial: CredencialPorServicio["asistente"]): Promise<Resultado> {
    try {
      return await this.probarSinProteger(credencial.clave_api);
    } catch (error) {
      return this.fallo("proveedor", `error inesperado ${nombreDeError(error)}`);
    }
  }

  private async probarSinProteger(clave: string): Promise<Resultado> {
    const llamada = await llamar(this.opts, URL_MODELOS_ANTHROPIC, {
      method: "GET",
      headers: { "x-api-key": clave, "anthropic-version": ANTHROPIC_VERSION },
    });
    if (llamada.tipo !== "respuesta") return this.fallo("sin_respuesta", llamada.tipo);

    const { respuesta } = llamada;
    if (!respuesta.ok) {
      // 403 es una clave válida sin permiso para la organización: para el maestro, la misma
      // corrección que una clave mala (pegar otra).
      const motivo: Motivo =
        respuesta.status === 401 || respuesta.status === 403 ? "credencial_rechazada" : "proveedor";
      return this.fallo(motivo, `HTTP ${respuesta.status}`);
    }

    const parsed = listadoSchema.safeParse(await jsonSinLanzar(respuesta));
    if (!parsed.success) return this.fallo("respuesta_invalida", "listado sin forma esperada");
    return { ok: true, datosPublicos: {} };
  }

  private fallo(motivo: Motivo, detalle: string): Extract<Resultado, { ok: false }> {
    registrarFallo(this.opts.logger, "asistente", motivo, detalle);
    return { ok: false, motivo };
  }
}
