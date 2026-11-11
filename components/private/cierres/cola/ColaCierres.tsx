"use client";

// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T3.1) — la cola única de cierres
// (`design.md > ColaCierres`), fiel a `ColaCierres.dc.html` (rama mensajero): descripción por rol,
// pestañas subrayadas con conteo, la barra de hoy con «Descargar» a la derecha, una tabla con una fila
// por cierre y un pie. No pide datos: todo llega por props del módulo que la monta.
//
// SLT-127 «Cola de bodega de la central con la cola única»: `tipo` bodega (rol central). Las props
// son una unión discriminada por `tipo` (filas y acciones de un tipo no pasan con las del otro); el
// esqueleto es común y cada tipo pinta su tabla (`TablaColaMensajero`, `TablaColaBodega`).

import { Fragment, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { money } from "@/lib/config/moneda";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import { EstadoCierreBadge } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import {
  ESTADO_CONCILIACION_LABEL,
  ESTADO_CONCILIACION_VARIANT,
  estadoConciliacionDe,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import { PAGO_MENSAJERO_TEXTO } from "@/app/(app)/cierres-admin/_components/pago-mensajero-labels";

import * as L from "./cola-cierres-labels";
import {
  accionBodegaDe,
  accionesFilaDe,
  columnasCola,
  faltaResaltada,
  fechaCola,
  folioBodegaCola,
  folioCola,
  pagoEntregadoDe,
  recibidoCola,
  senalesDe,
  tablistCola,
  type ColumnaCola,
  type ColumnaColaId,
  type PestanaCola,
  type RolCola,
} from "./cola-cierres-vista";

export interface AccionesCola {
  /** «Ver / decidir» y «Ver» (R36): el modo del detalle lo decide quien lo abre. */
  abrir: (cierreId: string) => void;
  /** «Destrabar» de un vencido (R105). */
  destrabar: (c: CierreAdminResumen) => void;
  /** «Registrar pago» (R34, R103). Ausente = no se ofrece (satélite o sin permiso). */
  registrarPago?: (c: CierreAdminResumen, pendiente: string) => void;
}

export interface PestanaColaProps {
  id: PestanaCola;
  label: string;
  /** El `total` del servidor para esa lista con los filtros puestos (R99). */
  conteo: number;
}

/** SLT-127 (R130): las tres acciones de la fila de bodega abren el detalle único (R40). */
export interface AccionesColaBodega {
  abrir: (cierreBodegaId: string) => void;
}

/** Lo común a todos los tipos de cola: el esqueleto. */
interface ColaComun {
  rol: RolCola;
  descripcion: string;
  pestanas: readonly PestanaColaProps[];
  pestanaActiva: PestanaCola;
  onPestana: (id: PestanaCola) => void;
  /** La barra de filtros de hoy, tal cual (R100). */
  barra: ReactNode;
  /** «Descargar» de la pestaña activa (R100). */
  descargar: ReactNode;
  cargando: boolean;
  /** Texto del error ya redactado (R104). */
  error: string | null;
  /** Texto del vacío (R104). */
  vacio: string;
  /** Nombre de la región y de la tabla (R104). */
  region: string;
  pie?: string;
  paginacion: ReactNode;
}

/**
 * La cola de mensajeros (SLT-102). Conserva el nombre `ColaCierresProps`: es el contrato que ya
 * usan su módulo y sus tests (R135).
 */
export interface ColaCierresProps extends ColaComun {
  tipo: "mensajero";
  /** La página de la pestaña activa. */
  filas: readonly CierreAdminResumen[];
  acciones: AccionesCola;
}

/** La cola de bodega de la central (SLT-127). */
export interface ColaCierresBodegaProps extends ColaComun {
  tipo: "bodega";
  /** La página de la pestaña activa. */
  filas: readonly CierreBodegaResumen[];
  acciones: AccionesColaBodega;
}

// Pestañas subrayadas: las mismas clases que el detalle único (`DetalleCierre.tsx`).
const TABS_LIST = "shrink-0 justify-start gap-6 rounded-none border-b border-border p-0";
const TAB_TRIGGER =
  "rounded-none border-0 border-b-2 border-transparent bg-transparent px-0.5 py-2.5 text-muted-foreground shadow-none hover:bg-transparent aria-selected:border-foreground aria-selected:bg-transparent aria-selected:text-foreground aria-selected:shadow-none aria-selected:hover:bg-transparent";
// Botones de la fila (canvas: 32 px de alto, 13 px, 12 px de relleno).
const BOTON_FILA = "px-3 text-[13px]";
/** El nombre del `tablist` de hoy; lo localizan los tests y los E2E (R99). */
export const TABS_COLA_LABEL = L.TABS_COLA_MENSAJERO_LABEL;

/** Las cabeceras de la tabla: las de solo lector llevan nombre pero no se ven. */
function columnasTabla<T>(
  cols: readonly ColumnaCola[],
  celda: (id: ColumnaColaId, fila: T) => ReactNode,
): Column<T>[] {
  return cols.map((col) => ({
    id: col.id,
    value: col.label,
    align: col.align,
    renderHeader: col.soloLector ? () => <span className="sr-only">{col.label}</span> : undefined,
    render: (fila: T) => celda(col.id, fila),
  }));
}

/** Lo que la tabla de cualquier tipo necesita del esqueleto. */
interface TablaComun {
  region: string;
  cargando: boolean;
  error: string | null;
  vacio: string;
}

/** La ÚNICA tabla de la cola (una sola en el censo), genérica en el tipo de fila. */
function TablaCola<T>({
  region,
  cargando,
  error,
  vacio,
  columns,
  filas,
  rowKey,
}: Readonly<TablaComun & { columns: Column<T>[]; filas: readonly T[]; rowKey: keyof T }>) {
  return (
    <DataTable
      ariaLabel={region}
      columns={columns}
      data={[...filas]}
      rowKey={rowKey}
      isLoading={cargando}
      error={error}
      emptyMessage={vacio}
    />
  );
}

export function ColaCierres(props: Readonly<ColaCierresProps | ColaCierresBodegaProps>) {
  const { descripcion, pestanas, pestanaActiva, onPestana, barra, descargar, pie, paginacion } =
    props;
  const comun: TablaComun = {
    region: props.region,
    cargando: props.cargando,
    error: props.error,
    vacio: props.vacio,
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{descripcion}</p>

      <Tabs
        value={pestanaActiva}
        onValueChange={(v) => onPestana(v as PestanaCola)}
        className="flex flex-col gap-4"
      >
        <TabsList aria-label={tablistCola(props.tipo)} className={TABS_LIST}>
          {pestanas.map((p) => (
            <TabsTrigger key={p.id} value={p.id} className={TAB_TRIGGER}>
              {`${p.label} ${p.conteo}`}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* La barra va FUERA de los paneles: cambiar de pestaña no la desmonta (R99, R100). */}
        <div className="flex flex-wrap items-start gap-2">
          <div className="min-w-[min(100%,18rem)] flex-1">{barra}</div>
          <div className="shrink-0">{descargar}</div>
        </div>

        <TabsContent value={pestanaActiva} className="mt-0">
          <section aria-label={comun.region}>
            {props.tipo === "bodega" ? (
              <TablaColaBodega {...comun} filas={props.filas} acciones={props.acciones} />
            ) : (
              <TablaColaMensajero
                {...comun}
                rol={props.rol}
                pestanaActiva={pestanaActiva}
                filas={props.filas}
                acciones={props.acciones}
              />
            )}
          </section>
        </TabsContent>
      </Tabs>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        {pie ? <span className="text-[13px] text-muted-foreground">{pie}</span> : null}
        {paginacion}
      </footer>
    </div>
  );
}

/** La tabla de la cola de mensajeros (SLT-102), movida sin cambios de comportamiento (R135). */
function TablaColaMensajero({
  region,
  cargando,
  error,
  vacio,
  rol,
  pestanaActiva,
  filas,
  acciones,
}: Readonly<
  TablaComun & {
    rol: RolCola;
    pestanaActiva: PestanaCola;
    filas: readonly CierreAdminResumen[];
    acciones: AccionesCola;
  }
>) {
  function celda(id: ColumnaColaId, c: CierreAdminResumen): ReactNode {
    switch (id) {
      case "folio":
        return <span className="font-mono text-[13px]">{folioCola(c)}</span>;
      case "mensajero":
        return <span className="text-foreground">{c.mensajeroNombre}</span>;
      case "fecha":
        return <span className="text-muted-foreground">{fechaCola(c, pestanaActiva)}</span>;
      case "estado":
        return <EstadoCierreBadge estado={c.estado} />;
      case "recaudado":
        return <span className="tabular-nums">{money(c.totales.general)}</span>;
      case "pago":
        return <span className="tabular-nums">{money(c.totalPagoMensajero)}</span>;
      case "pagoEntregado":
        return <PagoEntregadoCelda pendiente={c.pendientePagoMensajero} />;
      case "senales":
        return <SenalesCelda cierre={c} />;
      case "acciones":
        return (
          <AccionesCelda cierre={c} rol={rol} pestanaActiva={pestanaActiva} acciones={acciones} />
        );
      default:
        return null;
    }
  }

  return (
    <TablaCola
      {...{ region, cargando, error, vacio, filas }}
      columns={columnasTabla(columnasCola("mensajero", rol, pestanaActiva), celda)}
      rowKey="cierreId"
    />
  );
}

/**
 * La tabla de la cola de bodega de la central (SLT-127: R44, R129, R130, R134). Pinta lo que manda
 * el servidor sin derivar importes: `money()` es el único que toca un string de dinero (R71).
 */
function TablaColaBodega({
  region,
  cargando,
  error,
  vacio,
  filas,
  acciones,
}: Readonly<
  TablaComun & { filas: readonly CierreBodegaResumen[]; acciones: AccionesColaBodega }
>) {
  function celda(id: ColumnaColaId, c: CierreBodegaResumen): ReactNode {
    switch (id) {
      case "folio":
        return <span className="font-mono text-[13px]">{folioBodegaCola(c)}</span>;
      case "bodega":
        return <span className="text-foreground">{c.zonaNombre}</span>;
      case "solicito":
        return <span className="text-muted-foreground">{c.solicitadoPorNombre}</span>;
      case "fecha":
        return <span className="text-muted-foreground">{fechaCola(c, "pendientes")}</span>;
      case "cierres":
        return <span className="tabular-nums">{c.cantidadCierres}</span>;
      case "debeLlegar":
        return <span className="font-semibold tabular-nums">{money(c.paraLaCentral)}</span>;
      case "recibido": {
        const r = recibidoCola(c);
        return r.tipo === "nulo" ? (
          <span className="text-muted-foreground">—</span>
        ) : (
          <span className="tabular-nums">{money(r.monto)}</span>
        );
      }
      case "falta":
        return (
          <span
            className={
              faltaResaltada(c)
                ? "font-semibold tabular-nums text-warning-strong"
                : "tabular-nums text-muted-foreground"
            }
          >
            {money(c.faltaPorRecibir)}
          </span>
        );
      case "conciliacion": {
        const estado = estadoConciliacionDe(c);
        return (
          <Badge variant={ESTADO_CONCILIACION_VARIANT[estado]}>
            {ESTADO_CONCILIACION_LABEL[estado]}
          </Badge>
        );
      }
      case "acciones":
        return <AccionBodegaCelda cierre={c} abrir={acciones.abrir} />;
      default:
        return null;
    }
  }

  return (
    <TablaCola
      {...{ region, cargando, error, vacio, filas }}
      columns={columnasTabla(columnasCola("bodega", "central", "pendientes"), celda)}
      rowKey="cierreBodegaId"
    />
  );
}

const TEXTO_ACCION_BODEGA = {
  verConciliar: L.ACCION_VER_CONCILIAR,
  verCorregir: L.ACCION_VER_CORREGIR,
  ver: L.ACCION_VER,
} as const;

/** R130: una acción por fila según la conciliación; las tres abren el detalle de bodega. */
function AccionBodegaCelda({
  cierre,
  abrir,
}: Readonly<{ cierre: CierreBodegaResumen; abrir: (cierreBodegaId: string) => void }>) {
  const accion = accionBodegaDe(cierre);
  return (
    <span className="flex justify-end gap-1.5">
      <Button
        type="button"
        // «Ver / conciliar» y «Ver / corregir», principales; «Ver», secundaria (canvas).
        variant={accion === "ver" ? "outline" : "default"}
        className={BOTON_FILA}
        aria-label={L.nombreAccionBodega(accion, cierre.zonaNombre)}
        onClick={() => abrir(cierre.cierreBodegaId)}
      >
        {TEXTO_ACCION_BODEGA[accion]}
      </Button>
    </span>
  );
}

function PagoEntregadoCelda({ pendiente }: Readonly<{ pendiente: string | null }>) {
  const pago = pagoEntregadoDe(pendiente);
  if (pago.tipo === "nulo") return <span className="pl-4 text-muted-foreground">—</span>;
  if (pago.tipo === "liquidado") {
    return <span className="pl-4">{PAGO_MENSAJERO_TEXTO.sinPendiente}</span>;
  }
  return (
    <span className="pl-4 tabular-nums">
      {L.PENDIENTE_PREFIJO}
      {money(pago.monto)}
    </span>
  );
}

function SenalesCelda({ cierre }: Readonly<{ cierre: CierreAdminResumen }>) {
  const senales = senalesDe(cierre);
  if (senales.length === 0) return null;
  return (
    <span className="pl-4 text-xs text-warning-strong">
      {senales.map((s, i) => (
        <Fragment key={s.texto}>
          {i > 0 ? " · " : null}
          {s.nota ? (
            <span title={s.nota} aria-label={s.nota}>
              {s.texto}
            </span>
          ) : (
            <span>{s.texto}</span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

function AccionesCelda({
  cierre,
  rol,
  pestanaActiva,
  acciones,
}: Readonly<{
  cierre: CierreAdminResumen;
  rol: RolCola;
  pestanaActiva: PestanaCola;
  acciones: AccionesCola;
}>) {
  const puedeRegistrarPago = acciones.registrarPago !== undefined;
  const ofrecidas = accionesFilaDe(cierre, rol, pestanaActiva, puedeRegistrarPago);
  const m = cierre.mensajeroNombre;
  return (
    <span className="flex justify-end gap-1.5">
      {ofrecidas.map((a) => {
        switch (a) {
          case "verDecidir":
            return (
              <Button
                key={a}
                type="button"
                className={BOTON_FILA}
                onClick={() => acciones.abrir(cierre.cierreId)}
              >
                {L.ACCION_VER_DECIDIR}
              </Button>
            );
          case "ver":
            return (
              <Button
                key={a}
                type="button"
                variant="outline"
                className={BOTON_FILA}
                aria-label={
                  pestanaActiva === "resueltos" ? L.nombreVerResuelto(m) : L.nombreVerVencido(m)
                }
                onClick={() => acciones.abrir(cierre.cierreId)}
              >
                {L.ACCION_VER}
              </Button>
            );
          case "destrabar":
            return (
              <Button
                key={a}
                type="button"
                variant="outline"
                className={BOTON_FILA}
                aria-label={L.nombreDestrabar(m)}
                onClick={() => acciones.destrabar(cierre)}
              >
                {L.ACCION_DESTRABAR}
              </Button>
            );
          case "registrarPago": {
            const pago = pagoEntregadoDe(cierre.pendientePagoMensajero);
            if (pago.tipo !== "pendiente" || !acciones.registrarPago) return null;
            const registrar = acciones.registrarPago;
            return (
              <Button
                key={a}
                type="button"
                className={BOTON_FILA}
                aria-label={L.nombreRegistrarPago(m)}
                onClick={() => registrar(cierre, pago.monto)}
              >
                {PAGO_MENSAJERO_TEXTO.registrar}
              </Button>
            );
          }
        }
      })}
    </span>
  );
}
