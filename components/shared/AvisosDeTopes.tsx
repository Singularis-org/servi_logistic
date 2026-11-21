import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatearConteo } from "@/lib/planes/consumo";
import { apiKeysYaPasadas, rolYaPasado } from "@/lib/planes/mensajes";
import type { TopeExcedido } from "@/lib/types/planes";

/**
 * SLT-58 R37/R42 — el texto de un tope que la empresa ya pasa con el plan. Lo comparten el modal de
 * primera asignación del detalle de empresa y el formulario del plan custom (ajuste planes-custom, D12
 * y D13). SLT-86 (R8): sin el aviso de órdenes, que ya no tienen tope, ni la fecha del siguiente ciclo
 * que solo servía a ese aviso.
 */
export function textoDelAvisoDeTope(aviso: TopeExcedido): string {
  const usados = formatearConteo(aviso.usados);
  const maximo = formatearConteo(aviso.maximo);
  if (aviso.tope === "api_keys") return apiKeysYaPasadas(usados, maximo);
  return rolYaPasado(usados, maximo, aviso.tope);
}

/** Los textos de varios avisos, en el orden en que llegan. */
export function textosDeLosAvisosDeTopes(avisos: readonly TopeExcedido[]): string[] {
  return avisos.map(textoDelAvisoDeTope);
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
