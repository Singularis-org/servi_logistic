"use client";

import { useId, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { EstadoConInfo } from "@/components/shared/EstadoInfo";
import { money } from "@/lib/config/moneda";
import { cn } from "@/lib/utils";
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
}

/** Ancho de cada columna (canvas: `70px 1.7fr 110px 1fr 1fr 1fr 1.3fr 40px`). */
const ANCHO: Record<ColumnaFila["id"], string> = {
  // La guía no se recorta (263): pista `auto` con un piso, igual en cabecera y fila.
  guia: "auto",
  destino: "minmax(0,1.7fr)",
  mensajero: "minmax(0,1.1fr)",
  resultado: "minmax(110px,1.2fr)",
  recibido: "minmax(0,1fr)",
  cobro: "minmax(0,1fr)",
  pago: "minmax(0,1fr)",
  ganancia: "minmax(0,1fr)",
  senales: "minmax(0,1.3fr)",
};

/** La plantilla de la rejilla, la MISMA para la cabecera y para cada fila (R10 de la 263). */
export function plantillaFila(columnas: readonly ColumnaFila[]): CSSProperties {
  return { gridTemplateColumns: `${columnas.map((c) => ANCHO[c.id]).join(" ")} auto` };
}
export const GUIA_CELDA = "min-w-[70px] whitespace-nowrap tabular-nums";

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
}: Readonly<FilaGestionProps>) {
  const [abierta, setAbierta] = useState(false);
  const [calculoAbierto, setCalculoAbierto] = useState(false);
  const idCalculo = useId();
  const columnas = columnasDe(audiencia, columnaMensajero);
  const ofrecidas = accionesDe(g, audiencia, acciones);
  const delaOrden = `de la orden ${g.numRemision} · ${g.destinatario}`;
  const senales = textoSenales(g, audiencia);

  function celda(c: ColumnaFila): ReactNode {
    switch (c.id) {
      case "guia":
        return <span className={cn("font-mono text-[13px]", GUIA_CELDA)}>{g.numGuia ?? "—"}</span>;
      case "destino":
        return (
          <span className="min-w-0 truncate">
            {g.destinatario} <span className="text-xs text-muted-foreground">· {g.tiendaNombre}</span>
          </span>
        );
      case "mensajero":
        return <span className="min-w-0 truncate">{mensajeroNombre ?? "—"}</span>;
      case "resultado":
        // Ficha 456: el nombre del resultado con su botón de información.
        return (
          <EstadoConInfo
            codigo={g.resultado}
            chipClassName={cn("rounded-full px-2 py-0.5 text-xs font-medium", TONO_RESULTADO[g.resultado])}
          />
        );
      case "senales":
        return <span className="pl-4 text-xs text-warning-strong">{senales}</span>;
      default:
        // R86: un importe nulo es «—», nunca ₡0.
        return <span className="text-right tabular-nums">{money(montoDeColumna(g, c.id))}</span>;
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
          className="text-[13px] text-info-strong hover:underline"
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

  return (
    // `break-inside-avoid` (feature 223): la fila no se parte entre dos páginas al imprimir.
    <div className="break-inside-avoid border-b border-border last:border-b-0" data-gestion={g.gestionId}>
      <div className="grid items-center gap-2 px-4 py-2.5 text-sm" style={plantillaFila(columnas)}>
        {columnas.map((c) => (
          <span key={c.id} className={cn("min-w-0", c.derecha && "text-right")}>
            {celda(c)}
          </span>
        ))}
        <span className="flex items-center justify-end gap-1.5">
          {ofrecidas.devolver ? (
            // R244 (feature 237): deshabilitado CON SU MOTIVO, no oculto — en `title` y al final del
            // nombre accesible, porque un botón `disabled` sale del orden de tabulación.
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
              disabled={ofrecidas.devolverDeshabilitado !== null || enVuelo === g.gestionId}
              onClick={() => acciones.devolver?.(g)}
            >
              {L.DEVOLVER_A_GESTION}
            </Button>
          ) : null}
          <button
            type="button"
            aria-expanded={abierta}
            // R89: el nombre de hoy, que leen los E2E (con snapshot, el del desglose).
            aria-label={g.ingresoEmpresa ? desgloseAriaLabel(g) : L.detalleOrdenAriaLabel(g.numRemision, g.destinatario)}
            onClick={() => setAbierta((v) => !v)}
            className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
          >
            <ChevronDown size={16} aria-hidden="true" className={cn("transition-transform", abierta && "rotate-180")} />
          </button>
        </span>
      </div>

      {abierta ? (
        <div className="flex flex-col gap-4 bg-muted/30 px-5 py-4">
          {/* Solo datos de la orden (canvas, PA6). */}
          <dl className="grid grid-cols-1 gap-x-8 gap-y-3 border-b border-border pb-4 sm:grid-cols-[140px_140px_minmax(0,1fr)]">
            <Dato label={L.DATO_ORDEN} value={g.numRemision} />
            <Dato label={L.DATO_PRODUCTO} value={g.producto} />
            <Dato label={L.DATO_DIRECCION} value={g.direccion ?? "—"} />
          </dl>

          <div className="grid items-stretch gap-4 sm:grid-cols-2">
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
            <div className="flex gap-2">
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
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Dato({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm">{value}</dd>
    </div>
  );
}
