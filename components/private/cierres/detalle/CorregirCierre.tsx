import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { OrdenEnCorreccionDTO } from "@/lib/interfaces/services/ICierreDiaService";

import {
  COMO_CORREGIR_TITULO,
  CORRECCION_AVISO_CORTE,
  CORRECCION_EXPLICACION,
  CORRECCION_IR_ENTREGAS,
  CORRECCION_ORDENES_TITULO,
  CORRECCION_PENDIENTE,
  CORRECCION_REGESTIONADA,
  RUTA_ENTREGAS,
} from "./detalle-cierre-labels";

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R248) — la pestaña
// «Corregir» del detalle único de un cierre rechazado. Sustituye al panel suelto «Corregir el cierre
// rechazado» de la ficha 477. Solo pinta: el «Devolver a gestión» vive en la fila de «Gestiones»
// (canvas), no aquí, y el motivo del rechazo lo dice la franja del detalle.

export interface CorregirCierreProps {
  /** Las órdenes que el mensajero deshizo de ESTE cierre (`listarCierreDia.correcciones`). */
  ordenesEnCorreccion: readonly OrdenEnCorreccionDTO[];
}

export function CorregirCierre({ ordenesEnCorreccion }: Readonly<CorregirCierreProps>) {
  return (
    <div className="flex flex-col gap-5">
      <section aria-label={COMO_CORREGIR_TITULO} className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">{COMO_CORREGIR_TITULO}</h3>
        <p className="m-0 text-sm text-muted-foreground">{CORRECCION_EXPLICACION}</p>
        <p role="note" className="m-0 text-sm text-muted-foreground">
          {CORRECCION_AVISO_CORTE}
        </p>
      </section>

      {ordenesEnCorreccion.length > 0 ? (
        <section aria-label={CORRECCION_ORDENES_TITULO} className="flex flex-col gap-2">
          <h3 className="m-0 text-sm font-semibold">{CORRECCION_ORDENES_TITULO}</h3>
          <ul className="m-0 flex list-none flex-col divide-y rounded-md border p-0">
            {ordenesEnCorreccion.map((o) => (
              <li key={o.ordenId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="inline-flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{o.numGuia ?? "—"}</span>
                  <span>{o.numRemision}</span>
                  <span className="text-muted-foreground">· {o.destinatario}</span>
                </span>
                <span className="inline-flex flex-wrap items-center gap-2">
                  <Badge variant={o.regestionada ? "success" : "warning"}>
                    {o.regestionada ? CORRECCION_REGESTIONADA : CORRECCION_PENDIENTE}
                  </Badge>
                  {o.regestionada ? null : (
                    <Link href={RUTA_ENTREGAS} className={cn(buttonVariants({ variant: "outline", size: "sm" }))}>
                      {CORRECCION_IR_ENTREGAS}
                    </Link>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
