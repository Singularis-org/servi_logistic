"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/useToast";
import { guardarTopeIntentos } from "@/lib/actions/tarifas";
import { TOPE_INTENTOS_MAXIMO, TOPE_INTENTOS_MINIMO } from "@/lib/types/tarifa-flexible";

import { TEXTOS } from "./tarifas-textos";

export interface TarifasTopeIntentosProps {
  tope: number;
  puedeEscribir: boolean;
}

const ID_AVISO = "tope-intentos-aviso";

const OPCIONES = Array.from({ length: TOPE_INTENTOS_MAXIMO - TOPE_INTENTOS_MINIMO + 1 }, (_, i) => {
  const texto = String(TOPE_INTENTOS_MINIMO + i);
  return { value: texto, label: texto };
});

/**
 * SLT-77 (design §4.2, R12-R17): cuantos intentos de entrega hace la empresa. El maestro lo elige; el admin lo ve.
 * Quien puede que lo decide el servidor: `puedeEscribir` solo elige que se pinta, y la action vuelve a autorizar.
 */
export function TarifasTopeIntentos({ tope, puedeEscribir }: Readonly<TarifasTopeIntentosProps>) {
  const router = useRouter();
  const toast = useToast();
  const [leido, setLeido] = useState(tope);
  const [guardado, setGuardado] = useState(tope);
  const [elegido, setElegido] = useState(tope);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Una recarga trae el valor del servidor, y el aviso compara contra él. Lo elegido sin guardar se conserva.
  if (tope !== leido) {
    setLeido(tope);
    setGuardado(tope);
    if (elegido === guardado) setElegido(tope);
  }

  const baja = elegido < guardado;

  async function guardar(): Promise<void> {
    setGuardando(true);
    setError(null);
    try {
      const r = await guardarTopeIntentos({ tope: elegido });
      if (r.status === "ok") {
        setGuardado(r.tope);
        setElegido(r.tope);
        toast.success(TEXTOS.topeGuardado);
        router.refresh();
      } else {
        setError(r.status === "forbidden" ? TEXTOS.filaSinPermiso : TEXTOS.errorGuardar);
      }
    } catch {
      setError(TEXTOS.errorGuardar);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <section aria-label={TEXTOS.topeTitulo} className="overflow-hidden rounded-xl border border-border bg-card px-[18px] py-4">
      <h2 className="text-lg font-bold">{TEXTOS.topeTitulo}</h2>
      <p className="mt-[3px] text-[13px] text-muted-foreground">{TEXTOS.topeAyuda}</p>

      {puedeEscribir ? (
        <div className="mt-3 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <Select
              aria-label={TEXTOS.topeTitulo}
              value={String(elegido)}
              onValueChange={(v) => {
                setElegido(Number(v));
                setError(null);
              }}
              options={OPCIONES}
              disabled={guardando}
              className="h-auto min-h-11 w-[110px] focus-visible:ring-3 focus-visible:ring-ring"
            />
            <Button
              type="button"
              className="min-h-11 px-4 font-semibold"
              disabled={elegido === guardado}
              loading={guardando}
              aria-describedby={baja ? ID_AVISO : undefined}
              onClick={() => void guardar()}
            >
              {TEXTOS.topeGuardar}
            </Button>
          </div>
          {baja ? (
            <Alert id={ID_AVISO} className="border-warning bg-warning-soft text-warning-strong dark:bg-warning/15">
              <AlertDescription className="text-warning-strong">{TEXTOS.topeAvisoAlBajar}</AlertDescription>
            </Alert>
          ) : null}
          {error === null ? null : (
            <Alert variant="destructive">
              <AlertDescription className="text-destructive">{error}</AlertDescription>
            </Alert>
          )}
        </div>
      ) : (
        <div className="mt-3">
          <p className="text-2xl font-bold">
            <span className="sr-only">{`${TEXTOS.topeTitulo}: `}</span>
            {guardado}
          </p>
          <p className="mt-[3px] text-[13px] text-muted-foreground">{TEXTOS.topeSoloLectura}</p>
        </div>
      )}
    </section>
  );
}
