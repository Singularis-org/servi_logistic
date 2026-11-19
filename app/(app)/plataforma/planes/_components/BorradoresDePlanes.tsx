"use client";

import { useId, useState } from "react";
import Link from "next/link";

import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { BorradorResumen, DescartarBorradorResult } from "@/lib/types/plan-borrador";
import type { PlanDelCatalogo } from "@/lib/types/planes";
import { cn } from "@/lib/utils";

import { fechaHora } from "./plan-form/borrador";
import type { AccionesDelBorrador } from "./plan-form/usar-borrador";

/** Textos de la sección, en un solo sitio para cuando llegue la i18n (design §9). */
export const TEXTOS_BORRADORES = {
  titulo: "Borradores",
  sinNombre: "Sin nombre",
  planNuevo: "Plan nuevo",
  cambioDe: (plan: string) => `Cambio de ${plan}`,
  columnaNombre: "Nombre",
  columnaTipo: "Tipo",
  columnaEmpezadoPor: "Empezado por",
  columnaEmpezadoEl: "Empezado el",
  columnaGuardadoEl: "Guardado el",
  columnaAcciones: "Acciones",
  retomar: "Retomar",
  descartar: "Descartar",
  cancelar: "Cancelar",
  tituloDescartar: "Descartar el borrador",
  confirmarDescarte: (nombre: string) =>
    `¿Descartar el borrador «${nombre}»? Se borran todos sus pasos guardados. No se puede deshacer.`,
  descartado: "Borrador descartado.",
  yaNoExiste: "Ese borrador ya no existe.",
  noSeDescarto: "No se pudo descartar el borrador. Inténtalo de nuevo.",
  sinPermiso: "No tienes permiso para esto.",
  errorDeCarga: "No se pudieron cargar los borradores.",
} as const;

export interface BorradoresDePlanesProps {
  /** `null`: la página no pudo leerlos (R24); se avisa y el catálogo sigue. */
  borradores: BorradorResumen[] | null;
  /** El catálogo, para el nombre del plan de un borrador de cambio. */
  planes: PlanDelCatalogo[];
  descartar: AccionesDelBorrador["descartar"];
  /** R26: retomar una creación abre el panel de quien monta con ese borrador. */
  onRetomar: (borradorId: string) => void;
  /** R27: tras descartar (o si ya no existía), quien monta relee la página y pinta el aviso. */
  onDescartado: (aviso: string) => void;
}

/**
 * SLT-144 (design §6; R24, R26, R27) — la sección «Borradores» sobre el catálogo: una fila por borrador, con
 * «Retomar» y «Descartar». Sin borradores no se pinta; si no se pudieron leer, solo el aviso.
 */
export function BorradoresDePlanes({ borradores, planes, descartar, onRetomar, onDescartado }: BorradoresDePlanesProps) {
  const [aDescartar, setADescartar] = useState<BorradorResumen | null>(null);
  const [error, setError] = useState<string | null>(null);
  const idTitulo = useId();

  if (borradores !== null && borradores.length === 0) return null;

  const nombreDe = (b: BorradorResumen) => b.nombre ?? TEXTOS_BORRADORES.sinNombre;
  const tipoDe = (b: BorradorResumen) => {
    if (b.modo === "crear" || b.planId === null) return TEXTOS_BORRADORES.planNuevo;
    const plan = planes.find((p) => p.id === b.planId);
    return TEXTOS_BORRADORES.cambioDe(plan?.nombre ?? nombreDe(b));
  };

  async function confirmarDescarte(b: BorradorResumen) {
    let r: DescartarBorradorResult | null;
    try {
      r = await descartar({ borradorId: b.id });
    } catch (e) {
      console.error("[BorradoresDePlanes] descartar lanzó", e);
      r = null;
    }
    if (r?.estado === "ok" || r?.estado === "borrador_no_encontrado") {
      setADescartar(null);
      onDescartado(r.estado === "ok" ? TEXTOS_BORRADORES.descartado : TEXTOS_BORRADORES.yaNoExiste);
      return;
    }
    // R27: el mensaje se queda en el diálogo y la fila sigue.
    setError(r?.estado === "forbidden" ? TEXTOS_BORRADORES.sinPermiso : TEXTOS_BORRADORES.noSeDescarto);
  }


  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-3">
      <h2 id={idTitulo} className="text-base font-semibold">
        {TEXTOS_BORRADORES.titulo}
      </h2>
      {borradores === null ? (
        <Alert variant="destructive">
          <AlertDescription>{TEXTOS_BORRADORES.errorDeCarga}</AlertDescription>
        </Alert>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{TEXTOS_BORRADORES.columnaNombre}</TableHead>
              <TableHead>{TEXTOS_BORRADORES.columnaTipo}</TableHead>
              <TableHead className="hidden md:table-cell">{TEXTOS_BORRADORES.columnaEmpezadoPor}</TableHead>
              <TableHead className="hidden md:table-cell">{TEXTOS_BORRADORES.columnaEmpezadoEl}</TableHead>
              <TableHead>{TEXTOS_BORRADORES.columnaGuardadoEl}</TableHead>
              <TableHead>
                <span className="sr-only">{TEXTOS_BORRADORES.columnaAcciones}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {borradores.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{nombreDe(b)}</TableCell>
                <TableCell>{tipoDe(b)}</TableCell>
                <TableCell className="hidden md:table-cell">{b.iniciadoPor}</TableCell>
                <TableCell className="hidden md:table-cell tabular-nums">{fechaHora(b.iniciadoAt)}</TableCell>
                <TableCell className="tabular-nums">{fechaHora(b.actualizadoAt)}</TableCell>
                <TableCell>
                  <div className="flex flex-wrap justify-end gap-2">
                    {b.modo === "editar" && b.planId !== null ? (
                      // R26: el cambio se retoma en el detalle de su plan, con el formulario de editar ya abierto.
                      <Link
                        href={`/plataforma/planes/${b.planId}?editar=1`}
                        className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
                      >
                        {TEXTOS_BORRADORES.retomar}
                      </Link>
                    ) : (
                      <Button type="button" variant="outline" size="sm" onClick={() => onRetomar(b.id)}>
                        {TEXTOS_BORRADORES.retomar}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setError(null);
                        setADescartar(b);
                      }}
                    >
                      {TEXTOS_BORRADORES.descartar}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {aDescartar !== null ? (
        <Modal
          open
          onOpenChange={(abierto) => {
            if (!abierto) setADescartar(null);
          }}
          title={TEXTOS_BORRADORES.tituloDescartar}
          description={TEXTOS_BORRADORES.confirmarDescarte(nombreDe(aDescartar))}
          confirmLabel={TEXTOS_BORRADORES.descartar}
          cancelLabel={TEXTOS_BORRADORES.cancelar}
          confirmVariant="destructive"
          size="md"
          // El cierre lo decide el resultado: con un fallo el mensaje se queda en el diálogo (R27).
          closeOnConfirm={false}
          onConfirm={() => confirmarDescarte(aDescartar)}
        >
          {error !== null ? (
            <p role="alert" className="text-sm text-danger-strong">
              {error}
            </p>
          ) : null}
        </Modal>
      ) : null}
    </section>
  );
}
