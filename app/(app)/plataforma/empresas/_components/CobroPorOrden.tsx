"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/shared/FormField";
import { money } from "@/lib/config/moneda";
import { textoDelCobroVigente } from "@/lib/planes/mensajes";
import type { CostoVigente, FuenteDelCosto } from "@/lib/types/consumo-plan";
import {
  MENSAJE_MONTO_COBRO_INVALIDO,
  montoCobroSchema,
  type CobroGlobalDTO,
  type FijarCobroGlobalInput,
  type FijarCobroResult,
} from "@/lib/types/cobro-plataforma";

// SL-40 (design §9.1, R9–R11) — el cobro por orden en «Empresas»: el bloque del valor global y la
// celda de cada fila (solo lectura desde SLT-126). Los importes llegan como TEXTO con dos decimales y
// se pintan con `money`, sin pasar nunca por `Number` (R26 de la ficha: perderían céntimos).

export type FijarCobroGlobal = (input: FijarCobroGlobalInput) => Promise<FijarCobroResult>;

/** Textos del cobro, en un solo sitio para cuando llegue la i18n. */
export const TEXTOS_COBRO = {
  titulo: "Cobro por orden",
  valorGlobal: "Valor global",
  sinConfigurar: "Sin configurar (0,00)",
  noSeLeyo: "No se pudo leer el valor global.",
  ayudaGlobal:
    "Se aplica a cada orden de las empresas cuyo plan no fija un cobro por orden. Las órdenes ya creadas conservan su importe.",
  guardar: "Guardar",
  guardado: "Cobro guardado.",
  delPlan: "del plan",
  global: "global",
  errorMonto: MENSAJE_MONTO_COBRO_INVALIDO,
  errorGenerico: "No se pudo guardar el cobro. Inténtalo de nuevo.",
} as const;

type Fallo = { tipo: "campo" } | { tipo: "mensaje"; mensaje: string };

/**
 * Traduce la respuesta de la action. Lee `unknown` a propósito: cruza la red, y una fuera del
 * contrato (o un `forbidden`) cae en el genérico sin detalle en vez de romper (R11).
 */
function falloDe(respuesta: unknown): Fallo | null {
  const estado =
    typeof respuesta === "object" && respuesta !== null
      ? (respuesta as { status?: unknown }).status
      : undefined;
  if (estado === "ok") return null;
  if (estado === "validation_error") return { tipo: "campo" };
  return { tipo: "mensaje", mensaje: TEXTOS_COBRO.errorGenerico };
}

/**
 * Llama a la action y devuelve el fallo, o `null` si guardó. Un importe que no pasa el MISMO schema
 * del servidor se marca sin ida y vuelta; el servidor sigue siendo la autoridad (R4).
 */
async function guardarCobro(
  monto: string,
  llamar: (monto: string) => Promise<FijarCobroResult>,
): Promise<Fallo | null> {
  if (!montoCobroSchema.safeParse(monto).success) return { tipo: "campo" };
  try {
    return falloDe(await llamar(monto));
  } catch {
    return { tipo: "mensaje", mensaje: TEXTOS_COBRO.errorGenerico };
  }
}

function Aviso({ texto }: { texto: string }) {
  return (
    <Alert role="status">
      <AlertDescription>{texto}</AlertDescription>
    </Alert>
  );
}

function AvisoError({ texto }: { texto: string }) {
  return (
    <Alert variant="destructive">
      <AlertDescription>{texto}</AlertDescription>
    </Alert>
  );
}

export interface BloqueCobroGlobalProps {
  /** El valor global; `monto: null` = sin configurar. `null` = no se pudo leer. */
  cobroGlobal: CobroGlobalDTO | null;
  fijarCobroGlobal: FijarCobroGlobal;
}

/** El valor global vigente y su formulario (R9). Tras guardar, la página se refresca (R11). */
export function BloqueCobroGlobal({ cobroGlobal, fijarCobroGlobal }: BloqueCobroGlobalProps) {
  const router = useRouter();
  const base = useId();
  const [texto, setTexto] = useState("");
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setFallo(null);
    setGuardado(false);
    const resultado = await guardarCobro(texto.trim(), (monto) => fijarCobroGlobal({ monto }));
    if (resultado === null) {
      setTexto("");
      setGuardado(true);
      router.refresh();
    } else {
      // Lo escrito se conserva: el superadmin corrige en vez de volver a teclear (R11).
      setFallo(resultado);
    }
    setEnviando(false);
  }

  const idTitulo = `${base}-titulo`;
  const vigente =
    cobroGlobal === null
      ? TEXTOS_COBRO.noSeLeyo
      : cobroGlobal.monto === null
        ? TEXTOS_COBRO.sinConfigurar
        : money(cobroGlobal.monto);

  return (
    <section aria-labelledby={idTitulo} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <h2 id={idTitulo} className="text-sm font-medium">
        {TEXTOS_COBRO.titulo}
      </h2>
      <p className="text-sm">
        {TEXTOS_COBRO.valorGlobal}: <span className="font-medium tabular-nums">{vigente}</span>
      </p>

      {guardado ? <Aviso texto={TEXTOS_COBRO.guardado} /> : null}

      <form noValidate aria-label={TEXTOS_COBRO.valorGlobal} onSubmit={enviar} className="flex flex-col gap-3">
        <FormField
          id={`${base}-monto`}
          label={TEXTOS_COBRO.valorGlobal}
          hint={TEXTOS_COBRO.ayudaGlobal}
          error={fallo?.tipo === "campo" ? TEXTOS_COBRO.errorMonto : undefined}
        >
          <Input
            inputMode="decimal"
            autoComplete="off"
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setGuardado(false);
            }}
          />
        </FormField>
        {fallo?.tipo === "mensaje" ? <AvisoError texto={fallo.mensaje} /> : null}
        <div>
          <Button type="submit" loading={enviando}>
            {TEXTOS_COBRO.guardar}
          </Button>
        </div>
      </form>
    </section>
  );
}

export interface CeldaCobroEmpresaProps {
  /** SLT-66 (R31), SLT-83 (R22): lo que se cobraría hoy por una orden nueva, y de dónde sale. */
  cobroVigente: CostoVigente;
}

/**
 * SLT-66 (R31): la etiqueta de cada fuente. `Record` total: una fuente nueva no compila sin la suya.
 * «Sin configurar» se rotula «global» porque es el global vacío, que cobra 0,00. SLT-126 (R3): sin
 * fuente «propio»; el cobro sale solo del plan o del global.
 */
const ORIGEN: Record<FuenteDelCosto, string> = {
  plan: TEXTOS_COBRO.delPlan,
  global: TEXTOS_COBRO.global,
  sin_configurar: TEXTOS_COBRO.global,
};

/**
 * La tarifa vigente de una empresa y de dónde sale (R10). Solo lectura: SLT-126 (R1) quitó el editor
 * de la fila. SLT-66 (R31): el importe y la fuente llegan del servidor, que usa la misma función que
 * el cargo; derivarlos aquí desde el global se saltaría el costo del plan.
 */
export function CeldaCobroEmpresa({ cobroVigente }: CeldaCobroEmpresaProps) {
  return (
    <div>
      {/* SLT-83 (R22): el fijo con `money`, como desde SL-40; el porcentual, «{p} % (mín. {m})» o «{p} %». */}
      <span className="tabular-nums">{textoDelCobroVigente(cobroVigente)}</span>
      <span className="block text-xs text-muted-foreground">{ORIGEN[cobroVigente.fuente]}</span>
    </div>
  );
}
