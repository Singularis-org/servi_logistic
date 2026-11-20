"use client";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import type { BorradorVista } from "@/lib/types/plan-borrador";

import { PlanForm, type PlanFormProps } from "../PlanForm";
import { TEXTOS_PLAN_FORM } from "./textos";

/** `Omit` sobre cada variante de la unión: el `Omit` normal la aplana y pierde el `modo` discriminante. */
type SinBorradorInicial<T> = T extends unknown ? Omit<T, "borradorInicial"> : never;

export type AbrirPlanFormProps = SinBorradorInicial<PlanFormProps> & {
  /**
   * Qué borrador leer: el de cambio del plan al editar (`{ planId }`), uno de creación al retomarlo
   * (`{ borradorId }`), o ninguno en un «Nuevo plan» (`null`).
   */
  origen: { planId: string } | { borradorId: string } | null;
  /** «Cerrar» cuando el borrador de creación que se retomaba ya no existe: quien monta cierra el panel. */
  onCerrar: () => void;
};

type Lectura = { fase: "cargando" } | { fase: "error" } | { fase: "ok"; borrador: BorradorVista | null };

/**
 * SLT-144 (design §4.5; R14, R15) — lee el borrador antes de montar el formulario. Al editar, el del cambio del
 * plan; al retomar una creación, ese por su id. Con borrador, el formulario arranca de él sin diálogo previo,
 * aunque lo haya empezado otro superadmin (R15). Al editar sin borrador, el formulario de hoy.
 */
export function AbrirPlanForm({ origen, onCerrar, ...props }: AbrirPlanFormProps) {
  if (origen === null) return <PlanForm {...(props as PlanFormProps)} borradorInicial={null} />;
  return <ConBorrador origen={origen} onCerrar={onCerrar} props={props as PlanFormProps} />;
}

function ConBorrador({
  origen,
  onCerrar,
  props,
}: {
  origen: { planId: string } | { borradorId: string };
  onCerrar: () => void;
  props: PlanFormProps;
}) {
  const [lectura, setLectura] = useState<Lectura>({ fase: "cargando" });
  /** Cada «Reintentar» sube el intento y vuelve a leer. */
  const [intento, setIntento] = useState(0);
  const leer = props.borrador.leer;
  // Los ids y no el objeto: quien monta puede pasar uno nuevo en cada render con los mismos datos.
  const planId = "planId" in origen ? origen.planId : null;
  const borradorId = "borradorId" in origen ? origen.borradorId : null;

  useEffect(() => {
    let vigente = true;
    const entrada = planId !== null ? { planId } : { borradorId: borradorId ?? "" };
    leer(entrada)
      .then((r) => {
        if (vigente) setLectura(r.estado === "ok" ? { fase: "ok", borrador: r.borrador } : { fase: "error" });
      })
      .catch((error: unknown) => {
        console.error("[AbrirPlanForm] leer el borrador lanzó", error);
        if (vigente) setLectura({ fase: "error" });
      });
    return () => {
      vigente = false;
    };
  }, [planId, borradorId, leer, intento]);

  if (lectura.fase === "cargando") {
    return (
      <p role="status" className="p-4 text-sm text-muted-foreground">
        {TEXTOS_PLAN_FORM.cargandoBorrador}
      </p>
    );
  }
  if (lectura.fase === "error") {
    return (
      <div role="alert" className="flex flex-col items-start gap-2 p-4 text-sm">
        <p>{TEXTOS_PLAN_FORM.errorBorrador}</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            setLectura({ fase: "cargando" });
            setIntento((i) => i + 1);
          }}
        >
          {TEXTOS_PLAN_FORM.reintentar}
        </Button>
      </div>
    );
  }
  // Retomar una creación que se confirmó o descartó en otra pantalla: no hay nada que abrir.
  if (lectura.borrador === null && "borradorId" in origen) {
    return (
      <div className="flex flex-col items-start gap-2 p-4 text-sm">
        <p role="status">{TEXTOS_PLAN_FORM.borradorNoExiste}</p>
        <Button type="button" variant="outline" size="sm" onClick={onCerrar}>
          {TEXTOS_PLAN_FORM.cerrar}
        </Button>
      </div>
    );
  }
  return <PlanForm {...props} borradorInicial={lectura.borrador} />;
}
