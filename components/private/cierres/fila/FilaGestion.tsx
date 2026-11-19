"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EstadoConInfo } from "@/components/shared/EstadoInfo";
import { money } from "@/lib/config/moneda";
import { cn } from "@/lib/utils";
import { CLASE_INFO_TACTIL_MOVIL, COLUMNA_FIJA, TACTIL_MOVIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import type { CierreDetalleGestion, CierreResultado } from "@/lib/interfaces/services/ICierreDiaService";
import { BotonesEvidencia } from "@/app/(app)/cierres-admin/_components/botones-evidencia";
import { contextoEvidencia } from "@/components/private/cierres/dialogos/dialogos-labels";
import type { EvidenciaAbierta } from "@/components/private/cierres/dialogos/VisorEvidencia";
import { MarcaAjustado } from "@/app/(app)/cierres-admin/_components/MarcaAjustado";
import { desgloseAriaLabel } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { FILA_AJUSTAR_PAGO, ajustarPagoAriaLabel } from "@/app/(app)/cierres-admin/_components/cierre-labels";
import {
  FILA_CORREGIR_METODOS,
  FILA_CORREGIR_RESULTADO,
  FILA_VER_EVIDENCIA,
} from "@/app/(app)/cierres-admin/_components/cierre-factura";

import { Cuenta } from "../detalle/Cuenta";
import { CalculoCobro } from "./CalculoCobro";
import {
  accionesDe,
  calculoDe,
  columnasDe,
  montoDeColumna,
  tarjetasDe,
  textoSenales,
  type AccionesFila,
  type AudienciaFila,
  type ColumnaFila,
  type TarjetaFila,
} from "./fila-gestion-vista";
import * as L from "./fila-gestion-labels";

// SLT-101 «Fila de gestión única y lista con filtros» (T3.3; R22, R25-R30, R86, R89, R93-R98) — UNA
// gestión de un cierre, para las cuatro audiencias (D15: un componente, props distintas). Cerrada:
// la fila de la tabla con sus señales. Desplegada: los datos de la orden, las tarjetas de dinero en
// cascada (`Cuenta`, D16) y «Ver cómo se calculó». Qué se ve lo decide `fila-gestion-vista.ts`; aquí
// solo se pinta, con los strings del servidor por `money()` (R71).
//
// Fiel al canvas (`Fila2.dc.html`): la cabecera desplegada lleva SOLO Orden, Producto y Dirección
// (PA6), y la fila no pinta indemnización ni «Ingreso de bodega» por gestión (S3-2).

export interface FilaGestionProps {
  gestion: CierreDetalleGestion;
  mensajeroNombre?: string;
  audiencia: AudienciaFila;
  /** Fulfillment en «solo lectura» (R25, R30). */
  quienMiraEsCentral: boolean;
  /** `solicitadoAt` del cierre: la nota de R97. */
  congeladoAt: string | null;
  acciones: AccionesFila;
  /** Abre el visor único con TODAS las URL firmadas de la gestión y su contexto (SLT-103 R54). */
  onVerEvidencia?: (evidencia: EvidenciaAbierta) => void;
  /** Mismo `columnaMensajero` que la cabecera de la lista (R23). */
  columnaMensajero?: boolean;
  /**
   * SLT-109 (R244): el `gestionId` cuyo «Devolver a gestión» está en vuelo. Su botón se deshabilita
   * (anti doble envío en la UI; el servidor lo corta igual).
   */
  enVuelo?: string | null;
  /**
   * SLT-191 (R810-R814): la tarjeta del canvas para el propio mensajero en el teléfono (`/cierre-dia`,
   * < 768 px). Solo la pasa `GestionesCierre` con `esMovil && audiencia === "mensajero"`; ausente, el
   * DOM es el de hoy (escritorio y `/cierres-admin`).
   */
  tarjetaMensajero?: boolean;
}

/** Ancho de cada columna (canvas: `70px 1.7fr 110px 1fr 1fr 1fr 1.3fr 40px`). */
const ANCHO: Record<ColumnaFila["id"], string> = {
  // SLT-156 (R492): la guía es una columna fija del ancho de su texto, igual en cabecera y fila.
  guia: "max-content",
  // SLT-152 (D2): el 1.7fr de «Destinatario · tienda» se reparte entre las dos columnas. El texto
  // de estas pistas envuelve (`TEXTO_ENTERO`), no se recorta (SLT-156, R490-R491).
  destinatario: "minmax(0,1.2fr)",
  tienda: "minmax(0,1fr)",
  mensajero: "minmax(0,1.1fr)",
  resultado: "minmax(110px,1.2fr)",
  // SLT-156 (R492): un importe nunca baja de su ancho; así no se monta en la columna vecina (el
  // fallo que SLT-152 tapaba con el recorte).
  recibido: "minmax(max-content,1fr)",
  cobro: "minmax(max-content,1fr)",
  // SLT-154 (R474): ocupa el sitio de «Cobro a la tienda», con su mismo ancho.
  ganaBodega: "minmax(max-content,1fr)",
  pago: "minmax(max-content,1fr)",
  ganancia: "minmax(max-content,1fr)",
  senales: "minmax(0,1.3fr)",
};

/**
 * La plantilla de la rejilla, la MISMA para la cabecera y para cada fila (R10 de la 263). SLT-156
 * (R523, R524): va en la variable `--plantilla-fila` y solo la aplica `REJILLA_ESCRITORIO` (≥ 768 px);
 * por debajo, la misma rejilla es una tarjeta (`REJILLA_TARJETA`). Un `gridTemplateColumns` en línea
 * ganaría a la tarjeta en el teléfono.
 */
export function plantillaFila(columnas: readonly ColumnaFila[]): CSSProperties {
  return { "--plantilla-fila": `${columnas.map((c) => ANCHO[c.id]).join(" ")} auto` } as CSSProperties;
}
export const GUIA_CELDA = "min-w-[70px] whitespace-nowrap tabular-nums";

/** SLT-156 (R524): las columnas de hoy, solo desde 768 px. */
export const REJILLA_ESCRITORIO = "md:[grid-template-columns:var(--plantilla-fila)]";

/**
 * SLT-156 (R523, `design.md §10`): por debajo de 768 px la fila es una tarjeta con los MISMOS
 * elementos (un solo DOM, sin botones repetidos): destinatario; guía · tienda; resultado y acciones;
 * la Ganancia, dato principal, en la columna fija de la derecha; las señales debajo.
 */
export const REJILLA_TARJETA =
  "max-md:grid-cols-[max-content_minmax(0,1fr)_max-content] max-md:items-start max-md:gap-x-3 max-md:gap-y-1";
/** Las áreas de la tarjeta sin la columna «Mensajero» (p. ej. el cierre del propio mensajero). */
export const AREAS_TARJETA =
  "max-md:[grid-template-areas:'dest_dest_ganancia'_'guia_tienda_ganancia'_'resultado_resultado_acciones'_'senales_senales_senales']";
/**
 * SLT-165 (R491, B1 de la review): con la columna «Mensajero» (el detalle del cierre de bodega), la
 * tarjeta dice de quién es cada gestión en una línea propia, bajo «guía · tienda».
 */
export const AREAS_TARJETA_CON_MENSAJERO =
  "max-md:[grid-template-areas:'dest_dest_ganancia'_'guia_tienda_ganancia'_'mensajero_mensajero_mensajero'_'resultado_resultado_acciones'_'senales_senales_senales']";
/**
 * SLT-154 (R474) con SLT-165: quien no es la central ve «Gana bodega» en lugar del cobro, y en el
 * teléfono no hay tarjeta desplegada que lo diga (la del cobro no existe para ella): va en su línea,
 * bajo «guía · tienda» (y bajo «Mensajero» en el detalle de bodega). Nada se pierde en el móvil.
 */
export const AREAS_TARJETA_CON_GANA_BODEGA =
  "max-md:[grid-template-areas:'dest_dest_ganancia'_'guia_tienda_ganancia'_'ganabodega_ganabodega_ganabodega'_'resultado_resultado_acciones'_'senales_senales_senales']";
export const AREAS_TARJETA_CON_MENSAJERO_Y_GANA_BODEGA =
  "max-md:[grid-template-areas:'dest_dest_ganancia'_'guia_tienda_ganancia'_'mensajero_mensajero_mensajero'_'ganabodega_ganabodega_ganabodega'_'resultado_resultado_acciones'_'senales_senales_senales']";

/** Las áreas de la tarjeta según las columnas que lleva la fila (literales: Tailwind no las compone). */
export function areasTarjeta(columnas: readonly ColumnaFila[]): string {
  const conMensajero = columnas.some((c) => c.id === "mensajero");
  const conGanaBodega = columnas.some((c) => c.id === "ganaBodega");
  if (conMensajero) return conGanaBodega ? AREAS_TARJETA_CON_MENSAJERO_Y_GANA_BODEGA : AREAS_TARJETA_CON_MENSAJERO;
  return conGanaBodega ? AREAS_TARJETA_CON_GANA_BODEGA : AREAS_TARJETA;
}

/**
 * El sitio de cada celda en la tarjeta (`null` = no se pinta en la tarjeta). «Recibido» y «Cobro»
 * están en el detalle desplegado; el «Pago» de la administración ES la ganancia del mensajero
 * (`montoDeColumna`), así que ocupa su sitio. «Mensajero» va en su línea (R491).
 */
const AREA_TARJETA: Record<ColumnaFila["id"], string | null> = {
  guia: "max-md:[grid-area:guia]",
  destinatario: "max-md:[grid-area:dest] max-md:font-medium",
  tienda: "max-md:[grid-area:tienda] max-md:before:mr-1 max-md:before:content-['·']",
  // En la tarjeta no hay cabecera de columnas: el rótulo va delante, solo en el teléfono (pseudo-elemento:
  // el DOM y el texto de la celda en escritorio no cambian).
  mensajero:
    "max-md:[grid-area:mensajero] max-md:flex max-md:gap-1 max-md:text-muted-foreground max-md:before:shrink-0 max-md:before:content-['Mensajero:']",
  resultado: "max-md:[grid-area:resultado] max-md:mt-1",
  recibido: null,
  cobro: null,
  // SLT-154 (R474): con su rótulo delante, como «Mensajero» (en la tarjeta no hay cabecera).
  ganaBodega:
    "max-md:[grid-area:ganabodega] max-md:flex max-md:justify-between max-md:gap-1 max-md:text-muted-foreground max-md:before:shrink-0 max-md:before:content-['Gana_bodega:']",
  pago: "max-md:[grid-area:ganancia] max-md:text-base max-md:font-semibold",
  ganancia: "max-md:[grid-area:ganancia] max-md:text-base max-md:font-semibold",
  senales: "max-md:[grid-area:senales]",
};

/** La clase de la celda `id` en la tarjeta: su área, o `max-md:hidden` si la tarjeta no la pinta. */
export function areaTarjeta(id: ColumnaFila["id"]): string {
  return AREA_TARJETA[id] ?? "max-md:hidden";
}

/**
 * SLT-156 (R490, R491): el texto libre de una celda va ENTERO, en varias líneas si no cabe. Sustituye
 * al «…» con `title` de SLT-152, que en el móvil no se podía leer (no hay tooltip).
 */
function TextoCelda({ texto, className }: Readonly<{ texto: string; className?: string }>) {
  return <span className={cn("block", TEXTO_ENTERO, className)}>{texto}</span>;
}

const TONO_RESULTADO: Record<CierreResultado, string> = {
  entregado: "bg-success/15 text-success-strong",
  reprogramado: "bg-warning/15 text-warning-strong",
  novedad: "bg-muted text-muted-foreground",
  devolucion_a_origen_por_rechazo: "bg-muted text-muted-foreground",
  incidente: "bg-danger/15 text-danger-strong",
};

export function FilaGestion({
  gestion: g,
  mensajeroNombre,
  audiencia,
  quienMiraEsCentral,
  congeladoAt,
  acciones,
  onVerEvidencia,
  columnaMensajero = false,
  enVuelo = null,
  tarjetaMensajero = false,
}: Readonly<FilaGestionProps>) {
  const [abierta, setAbierta] = useState(false);
  const [calculoAbierto, setCalculoAbierto] = useState(false);
  const idCalculo = useId();
  const columnas = columnasDe(audiencia, columnaMensajero, quienMiraEsCentral);
  const ofrecidas = accionesDe(g, audiencia, acciones);
  const delaOrden = `de la orden ${g.numRemision} · ${g.destinatario}`;
  const senales = textoSenales(g, audiencia);

  function celda(c: ColumnaFila): ReactNode {
    switch (c.id) {
      case "guia":
        return <span className={cn("font-mono text-[13px]", GUIA_CELDA)}>{g.numGuia ?? "—"}</span>;
      case "destinatario":
        return <TextoCelda texto={g.destinatario} />;
      case "tienda":
        return <TextoCelda texto={g.tiendaNombre} className="text-muted-foreground" />;
      case "mensajero":
        // R445: sin nombre, «—».
        return <TextoCelda texto={mensajeroNombre ?? "—"} />;
      case "resultado":
        // Ficha 456: el nombre del resultado con su botón de información.
        return (
          <EstadoConInfo
            codigo={g.resultado}
            className={CLASE_INFO_TACTIL_MOVIL}
            chipClassName={cn("rounded-full px-2 py-1 text-xs font-medium", TONO_RESULTADO[g.resultado])}
          />
        );
      case "senales":
        return <span className="pl-4 text-xs text-warning-strong">{senales}</span>;
      default:
        // R86: un importe nulo es «—», nunca ₡0.
        return <span className={cn("block text-right", COLUMNA_FIJA)}>{money(montoDeColumna(g, c.id))}</span>;
    }
  }

  const tarjetas = tarjetasDe(g, audiencia, quienMiraEsCentral);
  const calculo = calculoDe(g, congeladoAt);

  function pieDe(t: TarjetaFila): ReactNode {
    if (t.id === "recibido" && ofrecidas.corregirMetodos) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          aria-label={`${FILA_CORREGIR_METODOS} ${delaOrden}`}
          onClick={() => acciones.corregirMetodos?.(g)}
        >
          {FILA_CORREGIR_METODOS}
        </Button>
      );
    }
    if (t.id === "cobro" && calculo !== null) {
      return (
        <button
          type="button"
          aria-expanded={calculoAbierto}
          aria-controls={calculoAbierto ? idCalculo : undefined}
          onClick={() => setCalculoAbierto((v) => !v)}
          className="text-left text-[13px] text-info-strong hover:underline max-md:min-h-11"
        >
          {calculoAbierto ? L.OCULTAR_CALCULO : L.VER_CALCULO}
        </button>
      );
    }
    if (t.id === "pago" && ofrecidas.ajustarPago) {
      return (
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="w-fit"
          aria-label={ajustarPagoAriaLabel(g.numRemision, g.destinatario)}
          onClick={() => acciones.ajustarPago?.(g)}
        >
          {FILA_AJUSTAR_PAGO}
        </Button>
      );
    }
    if (t.nota) return <p className="text-[13px] text-muted-foreground">{t.nota}</p>;
    return null;
  }

  // R89: el nombre de hoy del disparador, que leen los E2E (con snapshot, el del desglose). SLT-191
  // (DS4): la tarjeta del mensajero lo conserva.
  const nombreDisparador = g.ingresoEmpresa ? desgloseAriaLabel(g) : L.detalleOrdenAriaLabel(g.numRemision, g.destinatario);

  function botonDevolver(): ReactNode {
    if (!ofrecidas.devolver) return null;
    // R244 (feature 237): deshabilitado CON SU MOTIVO, no oculto — en `title` y al final del
    // nombre accesible, porque un botón `disabled` sale del orden de tabulación.
    return (
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={
          ofrecidas.devolverDeshabilitado
            ? L.devolverNoDisponibleAriaLabel(g.numRemision, g.destinatario, ofrecidas.devolverDeshabilitado)
            : L.devolverAriaLabel(g.numRemision, g.destinatario)
        }
        title={ofrecidas.devolverDeshabilitado ?? undefined}
        className={TACTIL_MOVIL}
        disabled={ofrecidas.devolverDeshabilitado !== null || enVuelo === g.gestionId}
        onClick={() => acciones.devolver?.(g)}
      >
        {L.DEVOLVER_A_GESTION}
      </Button>
    );
  }

  return (
    // `break-inside-avoid` (feature 223): la fila no se parte entre dos páginas al imprimir.
    <div className="break-inside-avoid border-b border-border last:border-b-0" data-gestion={g.gestionId}>
      {tarjetaMensajero ? (
        <TarjetaMensajero
          g={g}
          abierta={abierta}
          nombreDisparador={nombreDisparador}
          onAlternar={() => setAbierta((v) => !v)}
          senales={senales}
        />
      ) : (
        <div
          className={cn(
            "grid items-center gap-2 px-4 py-3 text-sm",
            REJILLA_ESCRITORIO,
            REJILLA_TARJETA,
            areasTarjeta(columnas),
          )}
          style={plantillaFila(columnas)}
        >
          {columnas.map((c) => (
            <span
              key={c.id}
              data-columna={c.id}
              className={cn(
                "min-w-0",
                c.derecha && "text-right",
                // Sin señales, la tarjeta no reserva su línea.
                c.id === "senales" && senales === "" ? "max-md:hidden" : areaTarjeta(c.id),
              )}
            >
              {celda(c)}
            </span>
          ))}
          <span className="flex items-center justify-end gap-2 max-md:[grid-area:acciones]">
            {botonDevolver()}
            <button
              type="button"
              aria-expanded={abierta}
              aria-label={nombreDisparador}
              onClick={() => setAbierta((v) => !v)}
              className={cn("flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted", TACTIL_MOVIL)}
            >
              <ChevronDown size={16} aria-hidden="true" className={cn("transition-transform", abierta && "rotate-180")} />
            </button>
          </span>
        </div>
      )}

      {abierta ? (
        <div className="flex flex-col gap-4 bg-muted/30 px-5 py-4">
          {/* Solo datos de la orden (canvas, PA6). SLT-156 (R525): una sola columna por debajo de 768 px. */}
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-b border-border pb-4 md:grid-cols-[140px_140px_minmax(0,1fr)]">
            <Dato label={L.DATO_ORDEN} value={g.numRemision} />
            <Dato label={L.DATO_PRODUCTO} value={g.producto} />
            <Dato label={L.DATO_DIRECCION} value={g.direccion ?? "—"} />
          </dl>

          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            {tarjetas.map((t) => (
              <Cuenta
                key={t.id}
                titulo={t.titulo}
                ariaLabel={`${t.titulo} ${delaOrden}`}
                lineas={t.lineas}
                vacio={t.vacio}
                aparte={t.aparte}
                notas={t.notas}
                tono={t.tono}
                insignia={t.ajustado && g.ajustesPago ? <MarcaAjustado ajustes={g.ajustesPago} /> : undefined}
                pie={pieDe(t)}
              />
            ))}
          </div>

          {calculo !== null && calculoAbierto ? (
            <div id={idCalculo}>
              <CalculoCobro calculo={calculo} sufijo={delaOrden} />
            </div>
          ) : null}

          <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-3">
            {/* SLT-156 (R493): «Ver evidencia» de 44 px en el teléfono. */}
            <div className="flex gap-2 max-md:[&_button]:min-h-11">
              {onVerEvidencia ? (
                <BotonesEvidencia
                  urls={g.evidenciaUrls}
                  onVer={(urls) =>
                    onVerEvidencia({ urls, contexto: contextoEvidencia(g.numRemision, g.destinatario) })
                  }
                  etiqueta={FILA_VER_EVIDENCIA}
                  ariaSufijo={delaOrden}
                />
              ) : null}
            </div>
            {ofrecidas.corregirResultado ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label={`${FILA_CORREGIR_RESULTADO} ${delaOrden}`}
                onClick={() => acciones.corregirResultado?.(g)}
              >
                {FILA_CORREGIR_RESULTADO}
              </Button>
            ) : null}
            {/* SLT-191 (R811): en la tarjeta del mensajero, «Devolver a gestión» va al pie del desplegado. */}
            {tarjetaMensajero ? botonDevolver() : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * SLT-191 (R810, R812, R813; DS2, DS3) — la tarjeta plegada del propio mensajero en el teléfono, como
 * el canvas (`GestionesVolumen`): a la izquierda guía (mono) → destinatario → tienda, cada uno en su
 * línea; a la derecha, en columna fija, el resultado con su información, «Ganancia» y el monto; las
 * señales debajo. Toda la tarjeta despliega: el disparador de hoy va ESTIRADO sobre ella (`absolute
 * inset-0`) y ENCIMA del contenido (`z-10`), así que en cualquier punto de la tarjeta el toque cae en
 * él; el contenido, además, no captura el toque (`pointer-events-none`). Solo el botón de información
 * del resultado queda por encima del disparador (`relative z-20`). La tarjeta es su propio contexto de
 * apilado (`isolate`): esos `z-` no compiten con la barra fija de arriba (`BARRA_FIJA`, `z-20`). No
 * se envuelve en un `<button>`: `EstadoConInfo` es un botón y un botón dentro de otro es HTML
 * inválido (y la guardia `estado-con-info` exige el chip en la fila).
 */
export const TARJETA_MENSAJERO =
  "relative isolate grid min-h-14 grid-cols-[minmax(0,1fr)_max-content] gap-x-3 gap-y-1 px-4 py-3 text-sm";
export const DISPARADOR_ESTIRADO =
  "absolute inset-0 z-10 min-h-11 w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset";
export const CONTENIDO_SIN_TOQUE = "pointer-events-none relative";
export const INFO_CON_TOQUE = "relative z-20 [&_button]:pointer-events-auto";

function TarjetaMensajero({
  g,
  abierta,
  nombreDisparador,
  onAlternar,
  senales,
}: Readonly<{
  g: CierreDetalleGestion;
  abierta: boolean;
  nombreDisparador: string;
  onAlternar: () => void;
  senales: string;
}>) {
  return (
    <div className={TARJETA_MENSAJERO} data-tarjeta-mensajero="">
      <button
        type="button"
        aria-expanded={abierta}
        aria-label={nombreDisparador}
        onClick={onAlternar}
        className={DISPARADOR_ESTIRADO}
      />
      <div className={cn(CONTENIDO_SIN_TOQUE, "flex min-w-0 flex-col gap-1")}>
        <span data-columna="guia" className="min-w-0">
          <span className={cn("font-mono text-[13px]", GUIA_CELDA)}>{g.numGuia ?? "—"}</span>
        </span>
        <span data-columna="destinatario" className="min-w-0 font-medium">
          <TextoCelda texto={g.destinatario} />
        </span>
        <span data-columna="tienda" className="min-w-0">
          <TextoCelda texto={g.tiendaNombre} className="text-muted-foreground" />
        </span>
      </div>
      <div className={cn(CONTENIDO_SIN_TOQUE, "flex flex-col items-end gap-1 text-right")}>
        <span data-columna="resultado" className={INFO_CON_TOQUE}>
          <EstadoConInfo
            codigo={g.resultado}
            className={CLASE_INFO_TACTIL_MOVIL}
            chipClassName={cn("rounded-full px-2 py-1 text-xs font-medium", TONO_RESULTADO[g.resultado])}
          />
        </span>
        <span className="text-xs text-muted-foreground">{L.COL_GANANCIA}</span>
        {/* R86: un importe nulo es «—», nunca ₡0. */}
        <span data-columna="ganancia" className={cn("text-base font-semibold", COLUMNA_FIJA)}>
          {money(montoDeColumna(g, "ganancia"))}
        </span>
      </div>
      {senales === "" ? null : (
        <span data-columna="senales" className={cn(CONTENIDO_SIN_TOQUE, "col-span-2 text-xs text-warning-strong")}>
          {senales}
        </span>
      )}
    </div>
  );
}

function Dato({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("m-0 text-sm", TEXTO_ENTERO)}>{value}</dd>
    </div>
  );
}
