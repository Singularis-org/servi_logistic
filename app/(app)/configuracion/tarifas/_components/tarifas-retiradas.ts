import type {
  ActualizarTarifaResult,
  BorrarTarifaResult,
  CrearTarifaResult,
  ListarTarifasResult,
} from "@/lib/types/tarifa";

/**
 * SLT-54 (R26), solo hasta la tanda D: las actions de `tarifas` ya no existen y `TiendasModule` y
 * `CrearTiendaForm` salen en T4.1, junto con este archivo. Mientras tanto la pantalla vieja compila y no
 * escribe ni lee precios: todo responde `forbidden`. La epica sale completa, asi que esto no llega a
 * produccion.
 */
const RETIRADA = { status: "forbidden" } as const;

export const listarTarifas: (input: unknown) => Promise<ListarTarifasResult> = async () => RETIRADA;

export const crearTarifa: (input: unknown) => Promise<CrearTarifaResult> = async () => RETIRADA;

export const actualizarTarifa: (id: unknown, input: unknown) => Promise<ActualizarTarifaResult> = async () => RETIRADA;

export const borrarTarifa: (id: unknown) => Promise<BorrarTarifaResult> = async () => RETIRADA;
