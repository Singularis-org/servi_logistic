"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera } from "lucide-react";

import { AppPage } from "@/components/shared/AppPage";
import { ContadoresEscaneo, LecturasEscaneo } from "@/components/shared/EscaneoContinuo";
import { QrScanner } from "@/components/shared/QrScanner";
import { Button } from "@/components/ui/button";
import {
  useEntradaEscaneo,
  usePunteroFino,
  type ResultadoLectura,
} from "@/hooks/useEntradaEscaneo";
import { useSesionEscaneo } from "@/hooks/useSesionEscaneo";
import { prepararAudio, reproducirTonoLectura } from "@/lib/audio/tono-notificacion";
import { leerPreferenciaSonido } from "@/lib/audio/preferencia-sonido";
import {
  lineaDeEstado,
  ultimaRespondida,
  type DesenlaceRecepcion,
  type EstadoFila,
} from "@/lib/utils/sesion-escaneo";
import { cn } from "@/lib/utils";

// SLT-159 «Escaneo continuo en recepciones y recogidas» (DC5, R610-R613, R615) — la página
// «Recibir paquetes» de escritorio (canvas: Main). Campo para la pistola arriba con su línea de
// estado, cámara continua a demanda, contadores a la derecha y la tabla de lecturas debajo.
// No sabe de dominio: la superficie le pasa su `recibir` ya traducido a desenlace. La sesión
// vive en el estado del componente: salir de la página por cualquier camino la descarta (R591).

const MOTIVO_FALLO_INESPERADO = "No se pudo procesar la lectura. Intenta de nuevo.";

const COLOR_LINEA: Partial<Record<EstadoFila["tipo"], string>> = {
  recibida: "bg-success-soft text-success-strong dark:bg-success/15",
  no_encontrada: "bg-warning-soft text-warning-strong dark:bg-warning/15",
  no_se_pudo: "bg-danger-soft text-danger-strong dark:bg-danger/15",
  codigo_invalido: "bg-danger-soft text-danger-strong dark:bg-danger/15",
};

function sonarResultado(resultado: ResultadoLectura) {
  if (leerPreferenciaSonido()) reproducirTonoLectura(resultado.tipo);
}

export interface RecepcionContinuaPaginaProps {
  recibir: (numGuia: number) => Promise<DesenlaceRecepcion>;
  /** La pantalla a la que vuelve «Terminar recepción» (R613). */
  volverA: string;
  /** «Bodega central», «Tienda» o «Bodega satélite», bajo el título (R610). */
  nombreRecepcion: string;
}

export function RecepcionContinuaPagina({
  recibir,
  volverA,
  nombreRecepcion,
}: Readonly<RecepcionContinuaPaginaProps>) {
  const router = useRouter();
  const inputId = useId();
  const campoRef = useRef<HTMLInputElement>(null);
  const punteroFino = usePunteroFino();
  const [camaraAbierta, setCamaraAbierta] = useState(false);
  const sesion = useSesionEscaneo(recibir);
  const entrada = useEntradaEscaneo({
    procesar: sesion.procesar,
    alLlegar: sesion.registrar,
    campoRef,
    enfocarTrasLectura: punteroFino,
    alTerminar: sonarResultado,
    motivoFalloInesperado: MOTIVO_FALLO_INESPERADO,
  });

  // La pistola escribe donde está el foco: con puntero fino, el campo nace enfocado.
  useEffect(() => {
    prepararAudio();
    if (punteroFino) campoRef.current?.focus();
  }, [punteroFino]);

  const ultima = ultimaRespondida(sesion.filas);
  const recibidas = sesion.contadores.recibidas;

  return (
    <AppPage
      title="Recibir paquetes"
      description={nombreRecepcion}
    >
      <div className="grid gap-4 lg:grid-cols-3">
        <section
          aria-label="Escanear"
          className="flex flex-col gap-3 rounded-lg border-2 border-foreground bg-card p-6 lg:col-span-2"
        >
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              entrada.enviarCampo();
            }}
          >
            <label htmlFor={inputId} className="text-sm font-semibold">
              Escanea la guía con la pistola
            </label>
            {/* Nunca `disabled` (SLT-158, R573): la segunda lectura de la pistola se perdería. */}
            <input
              ref={campoRef}
              id={inputId}
              autoComplete="off"
              value={entrada.valor}
              onChange={(e) => entrada.cambiarValor(e.target.value)}
              placeholder="Listo para leer…"
              data-resultado={entrada.marca ?? undefined}
              className={cn(
                "min-h-16 w-full rounded-lg border border-input bg-muted/40 px-4 font-mono text-2xl focus:border-2 focus:border-foreground focus:outline-none",
                "data-[resultado=acierto]:ring-2 data-[resultado=acierto]:ring-success/40",
                "data-[resultado=error]:ring-2 data-[resultado=error]:ring-destructive/40",
              )}
            />
          </form>
          <div
            role="status"
            className={cn(
              "rounded-lg px-3.5 py-3 text-sm font-semibold empty:hidden",
              ultima ? (COLOR_LINEA[ultima.estado.tipo] ?? "bg-muted") : undefined,
            )}
          >
            {ultima ? lineaDeEstado(ultima) : null}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">
              El campo vuelve a estar listo después de cada lectura. También acepta el QR de la
              etiqueta.
            </span>
            {camaraAbierta ? null : (
              <Button type="button" variant="outline" size="touch" onClick={() => setCamaraAbierta(true)}>
                <Camera aria-hidden="true" />
                Escanear con cámara
              </Button>
            )}
          </div>
          {camaraAbierta ? (
            <QrScanner
              continuo
              encendidaAlMontar
              onDecoded={(texto) => entrada.recibirLectura(texto, "camara")}
              mensajeErrorCamara="No se pudo abrir la cámara."
              alCerrar={() => setCamaraAbierta(false)}
            />
          ) : null}
        </section>
        {/* SLT-209 (Carlos, 2026-11-18): «Terminar recepción (n)» va DEBAJO de los contadores, a todo
            el ancho de la columna derecha, y no en el encabezado. En el móvil queda al final del
            resumen. 32 px desde `md` (el tamaño de escritorio de la app) y 44 px en el móvil. */}
        <div data-columna-resumen className="flex flex-col gap-3">
          <ContadoresEscaneo contadores={sesion.contadores} apilado />
          <Button
            type="button"
            className="w-full max-md:h-11"
            onClick={() => {
              router.push(volverA);
              router.refresh();
            }}
          >
            Terminar recepción ({recibidas})
          </Button>
        </div>
      </div>
      <LecturasEscaneo variante="tabla" filas={sesion.filas} onReintentar={sesion.reintentar} />
    </AppPage>
  );
}
