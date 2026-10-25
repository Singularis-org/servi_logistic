// SL-36 (design §5, R17) — contrato de la prueba de solo lectura de cada integración.
//
// Los tipos de servicio viven en el catálogo (`lib/types/integraciones.ts`, T5.5), que es su única
// fuente; aquí se reexportan para que los probadores sigan importando de su contrato.
//
// Por qué el resultado nunca lleva texto del proveedor: la pantalla muestra el texto propio del
// catálogo para `prueba_fallida.<servicio>.<motivo>` (R13, D3). El detalle técnico (HTTP, código
// de Graph) lo escribe el probador en el log, sin la credencial ni la URL.
import type {
  CredencialPorServicio,
  DatosPruebaPorServicio,
  DatosPublicosPorServicio,
  MotivoPruebaPorServicio,
  ServicioIntegracion,
} from "@/lib/types/integraciones";

export type {
  CredencialPorServicio,
  DatosPruebaPorServicio,
  DatosPublicosPorServicio,
  MotivoPruebaComun,
  MotivoPruebaPorServicio,
  ServicioIntegracion,
} from "@/lib/types/integraciones";

export type ResultadoPrueba<S extends ServicioIntegracion> =
  | { ok: true; datosPublicos: DatosPublicosPorServicio[S] }
  | { ok: false; motivo: MotivoPruebaPorServicio[S] };

export interface IProbadorIntegracion<S extends ServicioIntegracion> {
  /** Nunca lanza: red, timeout o proveedor caído son un `{ ok: false }` (QC inv. 18). */
  probar(
    credencial: CredencialPorServicio[S],
    datos: DatosPruebaPorServicio[S],
  ): Promise<ResultadoPrueba<S>>;
}

export type ProbadoresPorServicio = { [S in ServicioIntegracion]: IProbadorIntegracion<S> };
