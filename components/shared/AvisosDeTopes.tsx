import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatearConteo } from "@/lib/planes/consumo";
import { apiKeysYaPasadas, ordenesYaPasadas, rolYaPasado } from "@/lib/planes/mensajes";
import type { TopeExcedido } from "@/lib/types/planes";

/**
 * Ajuste planes-custom (D12): si no se pudo leer el día del siguiente ciclo, el aviso de órdenes dice
 * «hasta el inicio del siguiente ciclo» en vez de inventar una fecha (el ciclo lo calcula el servidor).
 */
const SIN_FECHA_DEL_SIGUIENTE_CICLO = "el inicio del siguiente ciclo";

/**
 * SLT-58 R37/R42 — el texto de un tope que la empresa ya pasa con el plan. `siguienteCiclo` es la fecha
 * de P10 (`AAAA-MM-DD`), la que devuelve la vista previa. Lo comparten el modal de primera asignación
 * del detalle de empresa y el formulario del plan custom (ajuste planes-custom, D12 y D13).
 */
export function textoDelAvisoDeTope(aviso: TopeExcedido, siguienteCiclo: string | null): string {
  const usados = formatearConteo(aviso.usados);
  const maximo = formatearConteo(aviso.maximo);
  if (aviso.tope === "ordenes") {
    return ordenesYaPasadas(usados, maximo, siguienteCiclo ?? SIN_FECHA_DEL_SIGUIENTE_CICLO);
  }
  if (aviso.tope === "api_keys") return apiKeysYaPasadas(usados, maximo);
  return rolYaPasado(usados, maximo, aviso.tope);
}

/** Los textos de varios avisos, en el orden en que llegan. */
export function textosDeLosAvisosDeTopes(avisos: readonly TopeExcedido[], siguienteCiclo: string | null): string[] {
  return avisos.map((a) => textoDelAvisoDeTope(a, siguienteCiclo));
}

/**
 * R37/R42: los topes que la empresa ya pasa con el plan. No es un error (el plan se asigna igual), así
 * que va en el `Alert` normal; uno por tope, con el mismo texto antes y después de confirmar.
 */
export function AvisosDeTopes({ avisos }: { avisos: string[] }) {
  return (
    <Alert>
      <AlertDescription>
        <ul className="flex list-disc flex-col gap-1 pl-5">
          {avisos.map((aviso) => (
            <li key={aviso}>{aviso}</li>
          ))}
        </ul>
      </AlertDescription>
    </Alert>
  );
}
