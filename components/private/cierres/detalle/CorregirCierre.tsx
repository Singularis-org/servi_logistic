import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TACTIL_MOVIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import type { OrdenEnCorreccionDTO } from "@/lib/interfaces/services/ICierreDiaService";

import {
  COMO_CORREGIR_TITULO,
  CORRECCION_AVISO_CORTE,
  CORRECCION_EXPLICACION,
  CORRECCION_IR_ENTREGAS,
  CORRECCION_ORDENES_TITULO,
  CORRECCION_PENDIENTE,
  CORRECCION_REGESTIONADA,
  OBLIGATORIA_GESTIONADA,
  OBLIGATORIA_PENDIENTE,
  OBLIGATORIAS_EXPLICACION,
  OBLIGATORIAS_TITULO,
  RUTA_ENTREGAS,
} from "./detalle-cierre-labels";

// SLT-109 «/cierre-dia: el cierre de hoy, rechazado o vencido como página» (R248) — la pestaña
// «Corregir» del detalle único de un cierre rechazado. Sustituye al panel suelto «Corregir el cierre
// rechazado» de la ficha 477. Solo pinta: el «Devolver a gestión» vive en la fila de «Gestiones»
// (canvas), no aquí, y el motivo del rechazo lo dice la franja del detalle.
//
// SLT-247 «Cierre rechazado: el mensajero gestiona las órdenes que pasaron a Novedad interna antes de
// reenviarlo» (R1795): las órdenes `obligatoria` (las que el corte barrió y el rechazo devolvió) van
// en su propia sección, ANTES de las deshechas de la 477, con su explicación y sus estados.

export interface CorregirCierreProps {
  /** Las órdenes en corrección de ESTE cierre (`listarCierreDia.correcciones`): deshechas y obligatorias. */
  ordenesEnCorreccion: readonly OrdenEnCorreccionDTO[];
}

/** Una lista de órdenes con su estado y, en la que falta, «Ir a Entregas». */
function ListaOrdenes({
  titulo,
  explicacion,
  ordenes,
  hecha,
  pendiente,
}: Readonly<{
  titulo: string;
  explicacion?: string;
  ordenes: readonly OrdenEnCorreccionDTO[];
  hecha: string;
  pendiente: string;
}>) {
  if (ordenes.length === 0) return null;
  return (
    <section aria-label={titulo} className="flex flex-col gap-2">
      <h3 className="m-0 text-sm font-semibold">{titulo}</h3>
      {explicacion ? <p className="m-0 text-sm text-muted-foreground">{explicacion}</p> : null}
      <ul className="m-0 flex list-none flex-col divide-y rounded-md border p-0">
        {ordenes.map((o) => (
          <li key={o.ordenId} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
            <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
              <span className="font-semibold">{o.numGuia ?? "—"}</span>
              <span>{o.numRemision}</span>
              {/* SLT-156 (R490): el destinatario entero, aunque sea largo. */}
              <span className={cn("text-muted-foreground", TEXTO_ENTERO)}>· {o.destinatario}</span>
            </span>
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant={o.regestionada ? "success" : "warning"}>{o.regestionada ? hecha : pendiente}</Badge>
              {o.regestionada ? null : (
                <Link href={RUTA_ENTREGAS} className={cn(buttonVariants({ variant: "outline", size: "sm" }), TACTIL_MOVIL)}>
                  {CORRECCION_IR_ENTREGAS}
                </Link>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function CorregirCierre({ ordenesEnCorreccion }: Readonly<CorregirCierreProps>) {
  const obligatorias = ordenesEnCorreccion.filter((o) => o.obligatoria);
  const deshechas = ordenesEnCorreccion.filter((o) => !o.obligatoria);
  return (
    <div className="flex flex-col gap-5">
      <section aria-label={COMO_CORREGIR_TITULO} className="flex flex-col gap-2">
        <h3 className="m-0 text-sm font-semibold">{COMO_CORREGIR_TITULO}</h3>
        <p className="m-0 text-sm text-muted-foreground">{CORRECCION_EXPLICACION}</p>
        <p role="note" className="m-0 text-sm text-muted-foreground">
          {CORRECCION_AVISO_CORTE}
        </p>
      </section>

      <ListaOrdenes
        titulo={OBLIGATORIAS_TITULO}
        explicacion={OBLIGATORIAS_EXPLICACION}
        ordenes={obligatorias}
        hecha={OBLIGATORIA_GESTIONADA}
        pendiente={OBLIGATORIA_PENDIENTE}
      />
      <ListaOrdenes
        titulo={CORRECCION_ORDENES_TITULO}
        ordenes={deshechas}
        hecha={CORRECCION_REGESTIONADA}
        pendiente={CORRECCION_PENDIENTE}
      />
    </div>
  );
}
