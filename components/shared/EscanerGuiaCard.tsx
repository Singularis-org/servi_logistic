"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Barcode, CheckCircle2, Package, type LucideIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { QrScanner } from "@/components/shared/QrScanner";
import {
  useEntradaEscaneo,
  usePunteroFino,
  type ResultadoLectura,
} from "@/hooks/useEntradaEscaneo";
import { prepararAudio, reproducirTonoLectura } from "@/lib/audio/tono-notificacion";
import { leerPreferenciaSonido } from "@/lib/audio/preferencia-sonido";
import { cn } from "@/lib/utils";

export type { ResultadoLectura } from "@/hooks/useEntradaEscaneo";

/**
 * Selector del campo de la guía (`data-escaner-campo` en el `<input>`). `EscanerModal` lo
 * busca para dejar ahí el foco al abrir (R571) sin que la tarjeta y el modal se pasen refs.
 */
export const SELECTOR_CAMPO_ESCANER = "[data-escaner-campo]";

/** Entrada manual del número de guía, para las superficies que la ofrecen. */
export interface EscanerGuiaManual {
  /**
   * Recibe el texto tecleado o leído por la pistola (ya sin espacios) y devuelve si la lectura
   * acertó o falló, con el motivo (SLT-158, D4). El campo ya está vacío cuando se llama: se
   * vacía siempre al enviar (R575). Si llega otra lectura mientras esta se procesa, la tarjeta
   * la guarda y la envía al terminar (R574): la superficie NO necesita su propio
   * `if (procesando) return`, y si lo tiene, pierde lecturas.
   */
  onSubmit: (valor: string) => ResultadoLectura | Promise<ResultadoLectura>;
  /** Texto del botón de confirmación ("Recibir", "Recoger"…). */
  submitLabel: string;
  label?: string;
  placeholder?: string;
}

export interface EscanerGuiaCardProps {
  /** Título de la tarjeta ("Recibir paquete"). */
  titulo: string;
  /** Una línea que dice qué hacer ("Escanea o ingresa el número de guía"). */
  descripcion: string;
  /**
   * Texto decodificado por la cámara. El significado lo pone el consumidor, que devuelve el
   * resultado igual que `manual.onSubmit` (SLT-158, D4). Comparte la cola con el campo.
   */
  onDecoded: (texto: string) => ResultadoLectura | Promise<ResultadoLectura>;
  mensajeErrorCamara?: string;
  /** Ausente = solo cámara (la superficie no acepta el número tecleado). */
  manual?: EscanerGuiaManual;
  /** Confirmación del último acierto, bajo el formulario. */
  exito?: ReactNode;
  /**
   * `false` cuando la superficie YA pinta el motivo de la lectura fallida en su propio aviso
   * persistente (`role="alert"`) y la línea de la tarjeta lo repetiría. Por defecto, `true`.
   */
  lineaDeError?: boolean;
  /** Icono del encabezado. */
  icono?: LucideIcon;
  /** Nombre accesible de la tarjeta como region. Por defecto, el título. */
  ariaLabel?: string;
  className?: string;
}

/** Motivo si la superficie lanza en vez de devolver un resultado (p. ej., sin red). */
const MOTIVO_FALLO_INESPERADO = "No se pudo procesar la lectura. Intenta de nuevo.";

/** Tono de acierto o de error, si la preferencia de sonido del dispositivo lo permite (R577). */
function sonarResultado(resultado: ResultadoLectura) {
  if (!leerPreferenciaSonido()) return;
  reproducirTonoLectura(resultado.tipo);
}

/**
 * Tarjeta de captura de una guía: **cámara, número tecleado o pistola**, los caminos que
 * toda superficie de escaneo del producto ofrece (recepción en satélite, en tienda,
 * en bodega central, recogida del mensajero).
 *
 * Es solo la CARCASA: la cámara sigue siendo `QrScanner` (html5-qrcode, un único
 * ciclo de vida en todo el repo) y el significado del texto decodificado —a qué
 * Server Action va, qué toast sale— lo pone cada consumidor. Esta tarjeta no sabe
 * qué es una orden: solo sabe si la lectura acertó o falló, porque se lo devuelve.
 *
 * SLT-158: la entrada (cola, limpieza, último error, marca, foco) es `useEntradaEscaneo`. El
 * orden depende del PUNTERO (D1): con puntero fino (escritorio, pistola) el campo va arriba
 * y la cámara debajo; con táctil (teléfono), la cámara arriba.
 *
 * Sin `manual` se degrada a solo cámara, sin separador ni formulario: la superficie
 * que no acepta el número tecleado no lo insinúa.
 */
export function EscanerGuiaCard({
  titulo,
  descripcion,
  onDecoded,
  mensajeErrorCamara,
  manual,
  exito,
  lineaDeError = true,
  icono: Icono = Package,
  ariaLabel,
  className,
}: Readonly<EscanerGuiaCardProps>) {
  const inputId = useId();
  const campoRef = useRef<HTMLInputElement>(null);
  const punteroFino = usePunteroFino();
  const [campoEnfocado, setCampoEnfocado] = useState(false);

  const entrada = useEntradaEscaneo({
    procesar: (texto, origen) =>
      origen === "campo" && manual ? manual.onSubmit(texto) : onDecoded(texto),
    campoRef,
    enfocarTrasLectura: punteroFino,
    alTerminar: sonarResultado,
    motivoFalloInesperado: MOTIVO_FALLO_INESPERADO,
  });

  // La política de autoplay hace nacer el audio suspendido: se desbloquea en el primer gesto.
  useEffect(() => {
    prepararAudio();
  }, []);

  const camara = (
    <QrScanner
      onDecoded={(texto) => entrada.recibirLectura(texto, "camara")}
      mensajeErrorCamara={mensajeErrorCamara}
    />
  );

  const separador = (
    <div className="my-6 flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">o</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  );

  const formulario = manual ? (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        entrada.enviarCampo();
      }}
    >
      <div className="space-y-1.5">
        <label htmlFor={inputId} className="text-sm font-medium text-card-foreground">
          {manual.label ?? "Número de guía"}
        </label>
        {/* Botón SIEMPRE debajo del input, en cualquier ancho. En fila
            (`sm:flex-row`) el input no bajaba de su ancho intrínseco y el botón
            no encoge (`shrink-0` + `whitespace-nowrap` de la primitiva), así que
            una etiqueta larga —"Confirmar recolección"— se salía de la tarjeta
            (`max-w-md`, 384px interiores). Apilado no depende del largo de la
            etiqueta: no lo vuelvas a poner en fila por consumidor. */}
        <div className="flex flex-col gap-3">
          <div className="relative">
            <Barcode
              className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden="true"
            />
            {/* Sin `type="number"` a proposito: dispararia la validacion nativa
                del form y se tragaria el corte limpio del consumidor ("Código
                inválido") antes de que este lo pueda reportar.
                SLT-158 (R573): NUNCA `disabled`. Deshabilitado soltaba el foco y la
                segunda lectura de la pistola se perdía; el envío repetido lo ordena la
                cola de `useEntradaEscaneo`. */}
            <input
              ref={campoRef}
              id={inputId}
              data-escaner-campo=""
              inputMode="numeric"
              autoComplete="off"
              value={entrada.valor}
              onChange={(e) => entrada.cambiarValor(e.target.value)}
              onFocus={() => setCampoEnfocado(true)}
              onBlur={() => setCampoEnfocado(false)}
              placeholder={manual.placeholder ?? "Ej. 1024"}
              data-resultado={entrada.marca ?? undefined}
              className={cn(
                "h-11 w-full rounded-lg border border-input bg-background pl-10 font-mono text-base text-foreground transition-colors placeholder:text-muted-foreground focus:border-2 focus:border-foreground focus:outline-none",
                campoEnfocado ? "pr-44" : "pr-3.5",
                // R578: el resultado se marca un momento y el campo vuelve a su estado normal.
                "data-[resultado=acierto]:border-success data-[resultado=acierto]:ring-2 data-[resultado=acierto]:ring-success/40",
                "data-[resultado=error]:border-destructive data-[resultado=error]:ring-2 data-[resultado=error]:ring-destructive/40",
              )}
            />
            {campoEnfocado ? (
              <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-success-soft px-2.5 py-0.5 text-xs font-medium text-success-strong">
                Lista para la pistola
              </span>
            ) : null}
          </div>
          <Button type="submit" size="lg" disabled={entrada.valor.trim() === ""} className="h-11 w-full">
            {manual.submitLabel}
          </Button>
          {punteroFino ? null : (
            <p className="text-xs text-muted-foreground">
              Lee el QR o el código de barras de la etiqueta.
            </p>
          )}
        </div>
      </div>
    </form>
  ) : null;

  return (
    <section
      aria-label={ariaLabel ?? titulo}
      aria-busy={entrada.procesando || undefined}
      className={cn(
        "w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icono className="size-5" aria-hidden="true" />
        </div>
        <div>
          <h2 className="text-lg leading-tight font-semibold text-balance text-card-foreground">
            {titulo}
          </h2>
          <p className="text-sm text-muted-foreground">{descripcion}</p>
        </div>
      </div>

      <div className="mt-6">
        {!formulario ? (
          camara
        ) : punteroFino ? (
          <>
            {formulario}
            {separador}
            {camara}
          </>
        ) : (
          <>
            {camara}
            {separador}
            {formulario}
          </>
        )}
      </div>

      {lineaDeError && entrada.ultimoError ? (
        <p
          role="alert"
          className="mt-4 rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
        >
          <span className="font-mono font-semibold">{entrada.ultimoError.lectura}</span>{" "}
          {entrada.ultimoError.motivo}
        </p>
      ) : null}

      {exito ? (
        <p className="mt-4 flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3.5 py-2.5 text-sm text-card-foreground">
          <CheckCircle2 className="size-4 shrink-0 text-primary" aria-hidden="true" />
          <span>{exito}</span>
        </p>
      ) : null}
    </section>
  );
}
