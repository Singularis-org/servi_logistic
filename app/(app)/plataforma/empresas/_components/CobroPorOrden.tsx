"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { FormField } from "@/components/shared/FormField";
import { money } from "@/lib/config/moneda";
import {
  MENSAJE_MONTO_COBRO_INVALIDO,
  montoCobroSchema,
  type CobroGlobalDTO,
  type FijarCobroEmpresaInput,
  type FijarCobroGlobalInput,
  type FijarCobroResult,
} from "@/lib/types/cobro-plataforma";

// SL-40 (design §9.1, R9–R11) — el cobro por orden en «Empresas»: el bloque del valor global y la
// celda de cada fila. Los importes llegan como TEXTO con dos decimales y se pintan con `money`, sin
// pasar nunca por `Number` (R26 de la ficha: perderían céntimos).

export type FijarCobroGlobal = (input: FijarCobroGlobalInput) => Promise<FijarCobroResult>;
export type FijarCobroEmpresa = (input: FijarCobroEmpresaInput) => Promise<FijarCobroResult>;

/** Textos del cobro, en un solo sitio para cuando llegue la i18n. */
export const TEXTOS_COBRO = {
  titulo: "Cobro por orden",
  valorGlobal: "Valor global",
  sinConfigurar: "Sin configurar (0,00)",
  noSeLeyo: "No se pudo leer el valor global.",
  ayudaGlobal:
    "Se aplica a cada orden que creen las empresas sin valor propio. Las órdenes ya creadas conservan su importe.",
  guardar: "Guardar",
  guardado: "Cobro guardado.",
  propio: "propio",
  global: "global",
  cambiar: "Cambiar",
  cancelar: "Cancelar",
  usarGlobal: "Usar el global",
  errorMonto: MENSAJE_MONTO_COBRO_INVALIDO,
  errorNoExiste: "Esa empresa ya no existe.",
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
  if (estado === "not_found") return { tipo: "mensaje", mensaje: TEXTOS_COBRO.errorNoExiste };
  return { tipo: "mensaje", mensaje: TEXTOS_COBRO.errorGenerico };
}

/**
 * Llama a la action y devuelve el fallo, o `null` si guardó. Un importe que no pasa el MISMO schema
 * del servidor se marca sin ida y vuelta; el servidor sigue siendo la autoridad (R4).
 */
async function guardarCobro(
  monto: string | null,
  llamar: (monto: string | null) => Promise<FijarCobroResult>,
): Promise<Fallo | null> {
  if (monto !== null && !montoCobroSchema.safeParse(monto).success) return { tipo: "campo" };
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
    const resultado = await guardarCobro(texto.trim(), (monto) =>
      fijarCobroGlobal({ monto: monto ?? "" }),
    );
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
  organizacionId: string;
  /** Para los nombres accesibles: en una tabla hay un «Cambiar» por fila. */
  nombreEmpresa: string;
  /** La excepción de la empresa, o `null` si usa el valor global. */
  cobroPorOrden: string | null;
  /** El valor global; `null` si no está configurado o no se pudo leer. */
  montoGlobal: string | null;
  fijarCobroEmpresa: FijarCobroEmpresa;
}

/**
 * La tarifa vigente de una empresa y de dónde sale (R10), con su editor en la misma fila. La regla
 * de R3 solo ELIGE qué texto pintar entre importes ya derivados: no hay aritmética.
 */
export function CeldaCobroEmpresa({
  organizacionId,
  nombreEmpresa,
  cobroPorOrden,
  montoGlobal,
  fijarCobroEmpresa,
}: CeldaCobroEmpresaProps) {
  const router = useRouter();
  const base = useId();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const [fallo, setFallo] = useState<Fallo | null>(null);
  const [guardado, setGuardado] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const vigente = cobroPorOrden ?? montoGlobal ?? "0.00";
  const origen = cobroPorOrden === null ? TEXTOS_COBRO.global : TEXTOS_COBRO.propio;

  function abrir() {
    setTexto(cobroPorOrden ?? "");
    setFallo(null);
    setGuardado(false);
    setAbierto(true);
  }

  async function guardar(monto: string | null) {
    setEnviando(true);
    setFallo(null);
    const resultado = await guardarCobro(monto, (m) => fijarCobroEmpresa({ organizacionId, monto: m }));
    if (resultado === null) {
      setAbierto(false);
      setGuardado(true);
      router.refresh();
    } else {
      setFallo(resultado);
    }
    setEnviando(false);
  }

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void guardar(texto.trim());
  }

  return (
    <div className="flex flex-col gap-2">
      <div>
        <span className="tabular-nums">{money(vigente)}</span>
        <span className="block text-xs text-muted-foreground">{origen}</span>
      </div>

      {guardado ? <Aviso texto={TEXTOS_COBRO.guardado} /> : null}

      {abierto ? (
        <form
          noValidate
          aria-label={`${TEXTOS_COBRO.titulo} · ${nombreEmpresa}`}
          onSubmit={enviar}
          className="flex flex-col gap-2"
        >
          <FormField
            id={`${base}-monto`}
            label={`${TEXTOS_COBRO.titulo} · ${nombreEmpresa}`}
            labelClassName="sr-only"
            error={fallo?.tipo === "campo" ? TEXTOS_COBRO.errorMonto : undefined}
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              className="min-w-28"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
            />
          </FormField>
          {fallo?.tipo === "mensaje" ? <AvisoError texto={fallo.mensaje} /> : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" size="sm" loading={enviando}>
              {TEXTOS_COBRO.guardar}
            </Button>
            {cobroPorOrden !== null ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={enviando}
                onClick={() => void guardar(null)}
              >
                {TEXTOS_COBRO.usarGlobal}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={enviando}
              onClick={() => setAbierto(false)}
            >
              {TEXTOS_COBRO.cancelar}
            </Button>
          </div>
        </form>
      ) : (
        <div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            aria-label={`${TEXTOS_COBRO.cambiar} · ${nombreEmpresa}`}
            onClick={abrir}
          >
            {TEXTOS_COBRO.cambiar}
          </Button>
        </div>
      )}
    </div>
  );
}
