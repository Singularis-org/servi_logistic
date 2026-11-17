"use client";

import { AvisosDeTopes, textosDeLosAvisosDeTopes } from "@/components/shared/AvisosDeTopes";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { FechaDeEmpresa, TopeExcedido } from "@/lib/types/planes";

import { TEXTOS_PLAN_FORM } from "./textos";

/**
 * SLT-144 (design §5.1, §5.2) — la lectura de la fecha de cada empresa para la entrada que hay en pantalla. La
 * guarda `PlanForm`; `vigenteDesde` es la F con la que se pidió (`null`: «De inmediato»), porque R19 la pinta.
 */
export type FechasDelCambio =
  | { fase: "cargando" }
  | { fase: "fallo" }
  | { fase: "ok"; vigenteDesde: string | null; empresas: FechaDeEmpresa[]; avisos: TopeExcedido[] };

export type FechasPorEmpresaProps = {
  /** `null`: no hay entrada válida (F vacía o mal formada); no se pinta nada, el error sale al guardar el paso. */
  fechas: FechasDelCambio | null;
  onReintentar: () => void;
};

/** R18: los avisos agrupados por empresa, en el orden en que llegan, porque su texto no nombra a la empresa. */
function avisosPorEmpresa(avisos: readonly TopeExcedido[]): { id: string; empresa: string; avisos: TopeExcedido[] }[] {
  const grupos = new Map<string, { id: string; empresa: string; avisos: TopeExcedido[] }>();
  for (const a of avisos) {
    const grupo = grupos.get(a.organizacionId) ?? { id: a.organizacionId, empresa: a.empresa, avisos: [] };
    grupo.avisos.push(a);
    grupos.set(a.organizacionId, grupo);
  }
  return [...grupos.values()];
}

/**
 * SLT-144 (R17–R20) — en «Cuándo rige» y «Revisar y programar» al editar: cuándo recibe el cambio cada empresa
 * del plan y los topes que ya pasa. Es informativo: ni la carga ni el error bloquean el botón final (design §5.4).
 */
export function FechasPorEmpresa({ fechas, onReintentar }: FechasPorEmpresaProps) {
  if (fechas === null) return null;

  if (fechas.fase === "cargando") {
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {TEXTOS_PLAN_FORM.calculandoFechas}
      </p>
    );
  }

  if (fechas.fase === "fallo") {
    return (
      <Alert role="alert">
        <AlertDescription className="flex flex-wrap items-center gap-x-2">
          <span>{TEXTOS_PLAN_FORM.errorFechas}</span>
          <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={onReintentar}>
            {TEXTOS_PLAN_FORM.reintentar}
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  const { vigenteDesde, empresas, avisos } = fechas;
  return (
    <div className="flex flex-col gap-3">
      {vigenteDesde === null ? null : empresas.length === 0 ? (
        <p className="text-sm">{TEXTOS_PLAN_FORM.sinEmpresasDelPlan(vigenteDesde)}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead scope="col">{TEXTOS_PLAN_FORM.columnaEmpresa}</TableHead>
              <TableHead scope="col">{TEXTOS_PLAN_FORM.columnaPeriodo}</TableHead>
              <TableHead scope="col">{TEXTOS_PLAN_FORM.columnaRecibe}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {empresas.map((e) => (
              <TableRow key={e.empresaId} className="hover:bg-transparent">
                <TableCell className="whitespace-normal">{e.empresa}</TableCell>
                <TableCell>{TEXTOS_TIPO_COBRO.tipo[e.tipoCobro]}</TableCell>
                <TableCell>{e.recibeEl}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {avisosPorEmpresa(avisos).map((g) => (
        <section key={g.id} aria-label={g.empresa} className="flex flex-col gap-1">
          <p className="text-sm font-medium">{g.empresa}</p>
          <AvisosDeTopes avisos={textosDeLosAvisosDeTopes(g.avisos)} />
        </section>
      ))}
    </div>
  );
}
