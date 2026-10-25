// SL-36 (design §5, R17) — prueba de Google Maps: una geocodificación de una dirección fija.
//
// Reutiliza `GoogleGeocodeClient` en vez de repetir su contrato zod: es el mismo cliente que
// usará el consumidor, así que lo que la prueba acepta es lo que el uso real acepta.
//
// La Geocoding API solo admite la clave como `?key=` en la URL. Por eso este archivo nunca
// escribe la URL en el log, ni la recibe de vuelta: clasifica el fallo con lo que observa el
// `fetch` envuelto (estado HTTP), no con el texto de un error.
import { GoogleGeocodeClient } from "@/lib/clients/google-geocode";
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
  type OpcionesResueltas,
} from "@/lib/clients/probadores/comun";

/**
 * Dirección conocida y estable en cualquier país: la prueba no depende del país de la empresa
 * (design §1, «Datos que dependen del país: ninguno»). Solo importa que la clave sea aceptada.
 */
export const DIRECCION_PRUEBA_MAPS = "1600 Amphitheatre Parkway, Mountain View, CA";

type Motivo = MotivoPruebaPorServicio["google_maps"];
type Resultado = ResultadoPrueba<"google_maps">;

export class GoogleMapsProbador implements IProbadorIntegracion<"google_maps"> {
  private readonly opts: OpcionesResueltas;

  constructor(opts: OpcionesProbador = {}) {
    this.opts = resolverOpciones(opts);
  }

  async probar(credencial: CredencialPorServicio["google_maps"]): Promise<Resultado> {
    const observado = fetchObservado(this.opts.fetchImpl);
    const cliente = new GoogleGeocodeClient({
      apiKey: credencial.clave_api,
      timeoutMs: this.opts.timeoutMs,
      fetchImpl: observado.fetchImpl,
    });

    let salida: Awaited<ReturnType<GoogleGeocodeClient["geocodificar"]>>;
    try {
      salida = await cliente.geocodificar(DIRECCION_PRUEBA_MAPS);
    } catch (error) {
      // El cliente lanza solo por respuesta con forma inesperada (`GeocodeRespuestaInvalidaError`).
      return this.fallo("respuesta_invalida", nombreDeError(error));
    }

    switch (salida.status) {
      case "ok":
      case "sin_resultados":
        // Sin resultados la clave ya fue aceptada: es lo único que esta prueba pregunta.
        return { ok: true, datosPublicos: {} };
      case "config_invalida":
        return this.fallo("credencial_rechazada", "REQUEST_DENIED");
      case "consulta_invalida":
        return this.fallo("proveedor", "INVALID_REQUEST");
      case "transitorio": {
        const visto = observado.visto();
        if (visto.tipo === "red" || visto.tipo === "tiempo_agotado") {
          return this.fallo("sin_respuesta", visto.tipo);
        }
        return this.fallo(
          "proveedor",
          visto.tipo === "respuesta" ? `HTTP ${visto.status}` : "transitorio",
        );
      }
    }
  }

  private fallo(motivo: Motivo, detalle: string): Extract<Resultado, { ok: false }> {
    registrarFallo(this.opts.logger, "google_maps", motivo, detalle);
    return { ok: false, motivo };
  }
}
