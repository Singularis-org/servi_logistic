"use client";

import { useState, type MouseEvent } from "react";

import { Modal } from "@/components/shared/Modal";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/useToast";
import { activarTarifasNuevas } from "@/lib/actions/tarifas";
import type { FaltantesPorZona } from "@/lib/interfaces/services/ITarifaActivacionService";
import type { AvisoGrupo } from "@/lib/tarifas/faltantes";

import { enumerar, nombreEsencial, TEXTOS } from "./tarifas-textos";

export interface TarifasActivarDialogProps {
  faltantes: readonly FaltantesPorZona[];
  onCerrar: () => void;
  onCompletar: (zonaId: string) => void;
  onActivada: () => void;
}

/** R16: un grupo con varios esenciales cae a la zona en una sola linea. */
function porGrupo(avisos: readonly AvisoGrupo[]): { grupo: string; conceptos: string[] }[] {
  const grupos = new Map<string, { grupo: string; conceptos: string[] }>();
  for (const aviso of avisos) {
    const entrada = grupos.get(aviso.grupoId) ?? { grupo: aviso.grupoNombre, conceptos: [] };
    entrada.conceptos.push(nombreEsencial(aviso.concepto));
    grupos.set(aviso.grupoId, entrada);
  }
  return [...grupos.values()];
}

/**
 * R18, R19: el dialogo de activar. La casilla solo existe si hay faltantes, y sin ella marcada no se puede
 * activar. Lo que manda es el servidor (R6): si responde con otra lista, se pinta esa y se vuelve a pedir la
 * confirmacion, porque el maestro confirmo una lista que ya no es.
 */
export function TarifasActivarDialog({ faltantes, onCerrar, onCompletar, onActivada }: Readonly<TarifasActivarDialogProps>) {
  const toast = useToast();
  const [lista, setLista] = useState(faltantes);
  const [confirmado, setConfirmado] = useState(false);

  const conAviso = lista.filter((z) => z.faltantes.length > 0 || z.usaZona.length > 0);
  const zonasConFaltantes = lista.filter((z) => z.faltantes.length > 0).length;
  const hayFaltantes = zonasConFaltantes > 0;

  async function activar(): Promise<void> {
    try {
      const r = await activarTarifasNuevas({ confirmaFaltantes: hayFaltantes && confirmado });
      if (r.status === "ok" || r.status === "ya_activada") {
        if (r.status === "ok") toast.success(TEXTOS.activadas);
        else toast.info(TEXTOS.yaActivadas);
        onActivada();
        onCerrar();
        return;
      }
      if (r.status === "confirmacion_requerida") {
        setLista(r.faltantes);
        setConfirmado(false);
        toast.warning(TEXTOS.listaCambio);
        return;
      }
      toast.error(r.status === "forbidden" ? TEXTOS.activarSinPermiso : TEXTOS.errorActivar);
    } catch {
      toast.error(TEXTOS.errorActivar);
    }
  }

  function completar(ev: MouseEvent<HTMLAnchorElement>, zonaId: string) {
    ev.preventDefault();
    onCerrar();
    onCompletar(zonaId);
  }

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={<span className="text-xl font-bold">{TEXTOS.activar}</span>}
      description={TEXTOS.dialogoEfecto}
      size="640px"
      className="[&_button[data-slot=button]]:min-h-11"
      cancelLabel={TEXTOS.seguirDigitando}
      confirmLabel={hayFaltantes ? TEXTOS.activarConFaltantes : TEXTOS.activar}
      confirmDisabled={hayFaltantes && !confirmado}
      closeOnConfirm={false}
      onConfirm={activar}
    >
      {conAviso.length === 0 ? null : (
        <div className="flex flex-col gap-[18px]">
          {hayFaltantes ? (
            <div className="rounded-[10px] border border-warning bg-warning-soft px-4 py-3.5 text-warning-strong dark:bg-warning/15">
              <p className="text-sm font-bold">{TEXTOS.faltaEnZonas(zonasConFaltantes)}</p>
              <p className="mt-[3px] text-[13px]">{TEXTOS.avisoFaltantes}</p>
            </div>
          ) : null}

          <ul aria-label={TEXTOS.zonas} className="overflow-hidden rounded-[10px] border border-border">
            {conAviso.map((z) => (
              <li
                key={z.zonaId}
                className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border px-3.5 py-3 last:border-b-0"
              >
                <div className="min-w-[220px] flex-1">
                  <p className="text-sm font-semibold">{z.zonaNombre}</p>
                  {z.faltantes.length > 0 ? (
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      {enumerar(z.faltantes.map((f, i) => `${i === 0 ? "Sin" : "sin"} ${nombreEsencial(f.concepto)}`))}
                    </p>
                  ) : null}
                  {porGrupo(z.usaZona).map(({ grupo, conceptos }) => (
                    <p key={grupo} className="mt-0.5 text-[13px] text-muted-foreground">
                      {TEXTOS.usaValorZona(grupo, enumerar(conceptos))}
                    </p>
                  ))}
                </div>
                {z.faltantes.length > 0 ? (
                  <a
                    href={`?zona=${encodeURIComponent(z.zonaId)}`}
                    onClick={(ev) => completar(ev, z.zonaId)}
                    className="inline-flex min-h-11 items-center rounded-md text-sm font-semibold text-foreground underline underline-offset-4 outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    {TEXTOS.completar}
                  </a>
                ) : null}
              </li>
            ))}
          </ul>

          {hayFaltantes ? (
            <label className="flex min-h-11 items-start gap-2.5 text-sm leading-[1.4]">
              <Checkbox
                checked={confirmado}
                onCheckedChange={(v) => setConfirmado(v)}
                className="mt-px size-5 focus-visible:ring-3 focus-visible:ring-ring"
              />
              <span>{TEXTOS.casilla}</span>
            </label>
          ) : null}
        </div>
      )}
    </Modal>
  );
}
