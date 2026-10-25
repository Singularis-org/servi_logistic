// SL-36 (design §5, §7.2, R17) — prueba de la optimización de rutas: el intercambio JWT-bearer de
// la clave de la cuenta de servicio por un token en `oauth2.googleapis.com/token`.
//
// Reutiliza `GoogleServiceAccountToken` (feature 92) para que la prueba firme la assertion igual
// que el uso real. Ese cliente solo lanza `RutaTokenError` con un texto; el motivo se clasifica
// con lo que vio el `fetch` envuelto, no parseando el mensaje.
//
// Lo que esta prueba NO verifica (design §5): que el proyecto tenga habilitada Route Optimization
// y que la cuenta tenga el rol. Eso aparece en el primer uso real como 403.
import { z } from "zod";
import { GoogleServiceAccountToken } from "@/lib/auth/google-sa-token";
import type {
  CredencialPorServicio,
  IProbadorIntegracion,
  MotivoPruebaPorServicio,
  ResultadoPrueba,
} from "@/lib/interfaces/external/IProbadorIntegracion";
import {
  fetchObservado,
  nombreDeError,
  registrarFallo,
  resolverOpciones,
  type OpcionesProbador,
  type Observado,
  type OpcionesResueltas,
} from "@/lib/clients/probadores/comun";

/**
 * Contrato mínimo del archivo JSON de clave que descarga Google Cloud (design §7.2). Strip por
 * defecto: el resto de campos (`private_key_id`, `client_id`…) no se usa.
 */
export const claveCuentaServicioSchema = z.object({
  type: z.literal("service_account"),
  project_id: z.string().min(1),
  client_email: z.string().min(1),
  private_key: z.string().min(1),
});

export type ClaveCuentaServicio = z.infer<typeof claveCuentaServicioSchema>;

/** Parsea el texto pegado por el maestro; `null` si no es el JSON de una cuenta de servicio. */
export function leerClaveCuentaServicio(texto: string): ClaveCuentaServicio | null {
  let json: unknown;
  try {
    json = JSON.parse(texto);
  } catch {
    return null;
  }
  const parsed = claveCuentaServicioSchema.safeParse(json);
  return parsed.success ? parsed.data : null;
}

type Motivo = MotivoPruebaPorServicio["optimizacion_rutas"];
type Resultado = ResultadoPrueba<"optimizacion_rutas">;

export class OptimizacionRutasProbador implements IProbadorIntegracion<"optimizacion_rutas"> {
  private readonly opts: OpcionesResueltas;

  constructor(opts: OpcionesProbador = {}) {
    this.opts = resolverOpciones(opts);
  }

  async probar(credencial: CredencialPorServicio["optimizacion_rutas"]): Promise<Resultado> {
    const clave = leerClaveCuentaServicio(credencial.clave_cuenta_servicio);
    // Sin red: un JSON que no es una clave no merece una llamada a Google.
    if (clave === null) return this.fallo("clave_mal_formada", "JSON sin forma de clave");

    const observado = fetchObservado(this.opts.fetchImpl);
    // Una instancia por prueba: su caché de token no debe sobrevivir a la prueba (R28).
    const token = new GoogleServiceAccountToken(
      { email: clave.client_email, privateKey: clave.private_key },
      { fetchImpl: observado.fetchImpl, timeoutMs: this.opts.timeoutMs },
    );

    try {
      await token.obtener();
    } catch (error) {
      const motivo = clasificar(observado.visto());
      return this.fallo(motivo, `${nombreDeError(error)}, ${describir(observado.visto())}`);
    }
    return {
      ok: true,
      datosPublicos: { proyectoId: clave.project_id, cuentaServicio: clave.client_email },
    };
  }

  private fallo(motivo: Motivo, detalle: string): Extract<Resultado, { ok: false }> {
    registrarFallo(this.opts.logger, "optimizacion_rutas", motivo, detalle);
    return { ok: false, motivo };
  }
}

function clasificar(visto: Observado): Motivo {
  switch (visto.tipo) {
    // No llegó a llamar: falló la firma, es decir la clave privada no es una PEM válida.
    case "sin_llamar":
      return "clave_mal_formada";
    case "red":
    case "tiempo_agotado":
      return "sin_respuesta";
    case "respuesta":
      // Google responde 400 `invalid_grant` a una clave revocada y 401 a un cliente inválido:
      // son las mismas señales de rechazo que usa R30 (design §5).
      if (visto.status === 400 || visto.status === 401) return "credencial_rechazada";
      if (visto.status >= 200 && visto.status < 300) return "respuesta_invalida";
      return "proveedor";
  }
}

function describir(visto: Observado): string {
  return visto.tipo === "respuesta" ? `HTTP ${visto.status}` : visto.tipo;
}
