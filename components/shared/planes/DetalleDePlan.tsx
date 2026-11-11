"use client";

import { TriangleAlert } from "lucide-react";

import { IconoDelModulo } from "@/components/shared/planes/IconoDelModulo";
import {
  excedidosContra,
  filasDeComparacion,
  filasDePeriodos,
  TEXTOS_PLANES,
  type VistaDePrecio,
} from "@/components/shared/planes/planes-vista";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { lineaTopeSobra } from "@/lib/planes/mensajes";
import type { PeriodoDelCobro, UsoDelPlan } from "@/lib/types/consumo-plan";
import type { PlanVista, TipoCobro } from "@/lib/types/planes";
import { cn } from "@/lib/utils";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";

// SLT-99 (design §5; R8, R9, R13) — el detalle de un plan: la tabla de períodos, la comparación con el plan activo, el
// aviso previo de los topes que sobran y «Cambiar a {plan}». Compartido y sin empresa: sin `activo` ni `onCambiar`
// (SLT-116) no hay chip «Activo», ni columna de comparación, ni botón.

/** Lo que el detalle sabe del plan activo de quien mira. */
export interface ActivoDelDetalle {
  /** `null` si el activo no está entre los que se pueden mostrar: sin comparación. */
  readonly plan: PlanVista | null;
  readonly uso: UsoDelPlan;
  /** R8: la fila resaltada de la tabla de períodos y el período de la comparación. */
  readonly tipoCobro: TipoCobro;
  /** R8: en la tarjeta del plan activo, el período en curso y el próximo cobro. */
  readonly periodo?: PeriodoDelCobro;
  readonly siguienteCobro?: string;
  /** R8: «Activo desde» (`AAAA-MM-DD`, se muestra «1 sep 2026»); sin él, la línea no sale. */
  readonly activoDesde?: string | null;
}

export interface DetalleDePlanProps {
  readonly plan: PlanVista;
  readonly vista: VistaDePrecio;
  readonly activo?: ActivoDelDetalle | null;
  /** R8, R18: «Cambiar a {plan}»; sin él, no hay botón. */
  readonly onCambiar?: () => void;
}

export function DetalleDePlan({ plan, vista, activo = null, onCambiar }: DetalleDePlanProps) {
  const esElActivo = activo?.plan?.id === plan.id;
  const comparaCon = activo?.plan && !esElActivo ? activo.plan : null;
  const tipoDeLaComparacion: TipoCobro = activo?.tipoCobro ?? vista;
  const excedidos = activo !== null && !esElActivo ? excedidosContra(plan.topes, activo.uso) : [];

  return (
    <section aria-labelledby={`detalle-${plan.id}`} className="flex flex-col gap-5 rounded-xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 id={`detalle-${plan.id}`} className="text-lg font-semibold">
          {TEXTOS_PLANES.detallesDe(plan.nombre)}
        </h3>
        {esElActivo && <Badge variant="success">{TEXTOS_PLANES.activo}</Badge>}
      </div>

      {esElActivo && activo !== null && <DatosDelActivo activo={activo} />}

      <TablaDePeriodos plan={plan} resaltado={activo?.tipoCobro ?? null} />

      <TablaDeComparacion plan={plan} activo={comparaCon} tipo={tipoDeLaComparacion} />

      {excedidos.length > 0 && (
        // R13: el mismo texto que el rechazo del servicio, antes de confirmar.
        <Alert variant="destructive">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription>
            <ul className="flex flex-col gap-1">
              {excedidos.map((e) => (
                <li key={e.tope}>{lineaTopeSobra(plan.nombre, e)}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {onCambiar && !esElActivo && (
        <Button type="button" className="w-fit" onClick={onCambiar}>
          {TEXTOS_PLANES.cambiarA(plan.nombre)}
        </Button>
      )}
    </section>
  );
}

function DatosDelActivo({ activo }: { activo: ActivoDelDetalle }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
      {activo.activoDesde && (
        <>
          <dt className="text-muted-foreground">{TEXTOS_PLANES.activoDesde}</dt>
          {/* «1 sep 2026»: la fecha calendario va a medianoche UTC y se lee en UTC, sin cambio de día. */}
          <dd>{fechaCortaEnZona(new Date(`${activo.activoDesde}T00:00:00.000Z`), "UTC")}</dd>
        </>
      )}
      {activo.periodo && (
        <>
          <dt className="text-muted-foreground">{TEXTOS_PLANES.periodoEnCurso}</dt>
          <dd>{`${activo.periodo.desde} – ${activo.periodo.hasta}`}</dd>
        </>
      )}
      {activo.siguienteCobro && (
        <>
          <dt className="text-muted-foreground">{TEXTOS_PLANES.proximoCobro}</dt>
          <dd>{activo.siguienteCobro}</dd>
        </>
      )}
    </dl>
  );
}

/** R8, P1: los cuatro períodos; con un activo, su tipo de cobro resaltado (en color y en texto, WCAG 1.4.1). */
function TablaDePeriodos({ plan, resaltado }: { plan: PlanVista; resaltado: TipoCobro | null }) {
  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableCaption className="mt-0 mb-2 caption-top text-left text-sm font-medium text-foreground">
          {TEXTOS_PLANES.tablaDePeriodos}
        </TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{TEXTOS_PLANES.columnaPeriodo}</TableHead>
            <TableHead>{TEXTOS_PLANES.columnaDescuento}</TableHead>
            <TableHead className="text-right">{TEXTOS_PLANES.columnaPorPeriodo}</TableHead>
            <TableHead className="text-right">{TEXTOS_PLANES.columnaPorMes}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filasDePeriodos(plan.precio).map((f) => {
            const tuyo = f.tipo === resaltado;
            return (
              <TableRow key={f.tipo} data-resaltado={tuyo || undefined} className={cn(tuyo && "bg-info-soft font-semibold")}>
                <TableCell>
                  {f.periodo}
                  {tuyo && <span className="sr-only">{` (${TEXTOS_PLANES.tuPeriodo})`}</span>}
                </TableCell>
                <TableCell>{f.descuento}</TableCell>
                <TableCell className="text-right tabular-nums">{f.porPeriodo}</TableCell>
                <TableCell className="text-right tabular-nums">{f.porMes}</TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      {resaltado !== null && <p className="text-xs text-muted-foreground">{TEXTOS_PLANES.resaltado(resaltado)}</p>}
    </div>
  );
}

/** R8: concepto por concepto. Sin activo con que comparar (R9 o la tarjeta del propio activo), solo su columna. */
function TablaDeComparacion({ plan, activo, tipo }: { plan: PlanVista; activo: PlanVista | null; tipo: TipoCobro }) {
  return (
    <Table>
      <TableCaption className="mt-0 mb-2 caption-top text-left text-sm font-medium text-foreground">
        {activo === null ? TEXTOS_PLANES.queIncluye : TEXTOS_PLANES.comparacion}
      </TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>{TEXTOS_PLANES.concepto}</TableHead>
          <TableHead>{plan.nombre}</TableHead>
          {activo !== null && <TableHead>{`${TEXTOS_PLANES.tuPlan} (${activo.nombre})`}</TableHead>}
        </TableRow>
      </TableHeader>
      <TableBody>
        {filasDeComparacion(plan, activo, tipo).map((f) => (
          <TableRow key={f.concepto}>
            <TableCell>
              <span className="flex items-center gap-2">
                {f.modulo && <IconoDelModulo modulo={f.modulo} />}
                {f.concepto}
              </span>
            </TableCell>
            <TableCell>{f.plan}</TableCell>
            {activo !== null && <TableCell>{f.activo}</TableCell>}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
