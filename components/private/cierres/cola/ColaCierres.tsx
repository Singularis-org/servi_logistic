"use client";

// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T3.1) — la cola única de cierres
// (`design.md > ColaCierres`), fiel a `ColaCierres.dc.html` (rama mensajero): descripción por rol,
// pestañas subrayadas con conteo, la barra de hoy con «Descargar» a la derecha, una tabla con una fila
// por cierre y un pie. No pide datos: todo llega por props del módulo que la monta.
//
// SLT-127 «Cola de bodega de la central con la cola única»: `tipo` bodega (rol central). Las props
// son una unión discriminada por `tipo` (filas y acciones de un tipo no pasan con las del otro); el
// esqueleto es común y cada tipo pinta su tabla (`TablaColaMensajero`, `TablaColaBodega`).
//
// SLT-106 «Bodega satélite: A consolidar con la cola única»: `tipo` bodega con `rol` satélite. Su
// pestaña «A consolidar» añade aviso, tarjetas y el botón del pie (`PanelAConsolidar`,
// `PieConsolidar`).
//
// SLT-107 «Bodega satélite: Solicitados y su cierre de bodega en lectura»: la pestaña «Solicitados»
// deja de pintar la lista de comprobantes y pinta sus tarjetas y su tabla (`PanelSolicitados`), con
// las mismas celdas que la cola de bodega de la central (`celdaBodega`) y un único «Ver».

import { Fragment, type ReactNode } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { money } from "@/lib/config/moneda";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import type {
  CierreBodegaResumen,
  CierreConsolidableCola,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierrePasadoDTO, CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import { CifrasCierre } from "@/components/private/cierres/detalle/CifrasCierre";
import type { Cifra } from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { cn } from "@/lib/utils";
import {
  EstadoCierreBadge,
  esMontoNegativo,
} from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
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
  aprobadoCola,
  columnasCola,
  faltaResaltada,
  fechaCola,
  folioBodegaCola,
  folioCola,
  folioConsolidable,
  pagoEntregadoDe,
  recibidoCola,
  senalesConsolidable,
  senalesDe,
  tablistCola,
  type ColumnaCola,
  type ColumnaColaId,
  type PestanaCola,
  type PestanaConsolidar,
  type RolCola,
} from "./cola-cierres-vista";
import { CIFRAS_GANANCIA_LABEL, TABLIST_PROPIA } from "./cola-propia-vista";
import { columnasTablaPropia, type AccionesColaPropia } from "./TablaColaPropia";

export type { AccionesColaPropia } from "./TablaColaPropia";

export interface AccionesCola {
  /** «Ver / decidir» y «Ver» (R36): el modo del detalle lo decide quien lo abre. */
  abrir: (cierreId: string) => void;
  /** «Destrabar» de un vencido (R105). */
  destrabar: (c: CierreAdminResumen) => void;
  /** «Registrar pago» (R34, R103). Ausente = no se ofrece (satélite o sin permiso). */
  registrarPago?: (c: CierreAdminResumen, pendiente: string) => void;
}

export interface PestanaColaProps<P extends string = PestanaCola> {
  id: P;
  label: string;
  /** El `total` del servidor para esa lista con los filtros puestos (R99). */
  conteo: number;
}

/** SLT-127 (R130): las tres acciones de la fila de bodega abren el detalle único (R40). */
export interface AccionesColaBodega {
  abrir: (cierreBodegaId: string) => void;
}

/** SLT-106 (R193): «Ver su cierre» abre el detalle único del cierre del día. */
export interface AccionesColaConsolidar {
  verSuCierre: (cierreDiaId: string) => void;
}

/** SLT-107 (R288): «Ver» abre el detalle de bodega en lectura; la satélite no concilia. */
export interface AccionesColaSolicitados {
  ver: (cierreBodegaId: string) => void;
}

/** SLT-107 (R286-R289): lo que pinta la pestaña «Solicitados» de la satélite. */
export interface PanelSolicitadosProps {
  /** De `tarjetasSolicitados(resumen)`: no dependen de filtros ni páginas (R68). */
  tarjetas: readonly Cifra[];
  /** La página de «Solicitados» con los filtros puestos. */
  filas: readonly CierreBodegaResumen[];
  acciones: AccionesColaSolicitados;
  cargando: boolean;
  /** Texto del error ya redactado; `null` sin error. */
  error: string | null;
  /** La paginación de «Solicitados», con su nombre de hoy; va en el pie. */
  paginacion: ReactNode;
}

/** Lo común a todos los tipos de cola: el esqueleto. */
interface ColaComun<P extends string = PestanaCola> {
  rol: RolCola;
  descripcion: string;
  pestanas: readonly PestanaColaProps<P>[];
  pestanaActiva: P;
  onPestana: (id: P) => void;
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
  rol: "central";
  /** La página de la pestaña activa. */
  filas: readonly CierreBodegaResumen[];
  acciones: AccionesColaBodega;
}

/** La cola de bodega de la satélite (SLT-106). */
export interface ColaCierresConsolidarProps extends ColaComun<PestanaConsolidar> {
  tipo: "bodega";
  rol: "satelite";
  /** La página de «A consolidar». */
  filas: readonly CierreConsolidableCola[];
  acciones: AccionesColaConsolidar;
  /** Las cifras del conjunto completo, de `tarjetasAConsolidar()` (R196). */
  tarjetas: readonly Cifra[];
  /** Los métodos de pago de «Recaudado» (D4). */
  totales: CierreTotales;
  /** El motivo por el que no se puede solicitar; `null` si se puede (R46, R198). */
  aviso: string | null;
  botonPie: { deshabilitado: boolean; onClick: () => void };
  /** SLT-107 (R286-R289): tarjetas, filas, «Ver», estados y paginación de «Solicitados». */
  solicitados: PanelSolicitadosProps;
}

/** SLT-137: «Cierres solicitados» del propio mensajero en /cierre-dia (una pestaña). */
export interface ColaCierresPropiosProps extends Omit<ColaComun, "rol"> {
  tipo: "propios";
  rol: "mensajero";
  filas: readonly CierrePasadoDTO[];
  acciones: AccionesColaPropia;
  /**
   * SLT-112 (R358): las tarjetas de la ganancia, de `tarjetasGanancia()`. Ausentes (el servidor no
   * emitió las cifras) = sin tarjetas, ni ceros en su lugar (R357, R158).
   */
  tarjetas?: readonly Cifra[];
}

type ColaCierresTodasProps =
  | ColaCierresProps
  | ColaCierresBodegaProps
  | ColaCierresConsolidarProps
  | ColaCierresPropiosProps;

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

export function ColaCierres(props: Readonly<ColaCierresTodasProps>) {
  const { descripcion, pestanas, pestanaActiva, barra, descargar, pie, paginacion } = props;
  const comun: TablaComun = {
    region: props.region,
    cargando: props.cargando,
    error: props.error,
    vacio: props.vacio,
  };
  // Cada variante tipa sus ids; `Tabs` solo devuelve el `value` de una de sus pestañas.
  const onPestana = props.onPestana as (id: string) => void;

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{descripcion}</p>

      <Tabs
        value={pestanaActiva}
        onValueChange={(v) => onPestana(String(v))}
        className="flex flex-col gap-4"
      >
        <TabsList
          aria-label={props.tipo === "propios" ? TABLIST_PROPIA : tablistCola(props.tipo, props.rol)}
          className={TABS_LIST}
        >
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

        {props.tipo === "bodega" && props.rol === "satelite" ? (
          <>
            <TabsContent value="aConsolidar" className="mt-0">
              <PanelAConsolidar {...props} comun={comun} />
            </TabsContent>
            {/* Se queda montada (oculta) como con el conmutador de antes; la página y los filtros
                viven en el módulo, así que volver a la pestaña no los pierde (R291). */}
            <TabsContent value="solicitados" keepMounted className="mt-0">
              <PanelSolicitados {...props.solicitados} />
            </TabsContent>
          </>
        ) : (
          <TabsContent value={pestanaActiva} className="mt-0 flex flex-col gap-4">
            {/* SLT-112 (R358): las tarjetas van entre la barra y la tabla; no dependen de la página
                ni de los filtros (R354), así que paginar o filtrar no las toca. */}
            {props.tipo === "propios" && props.tarjetas && props.tarjetas.length > 0 ? (
              <CifrasCierre cifras={props.tarjetas} ariaLabel={CIFRAS_GANANCIA_LABEL} />
            ) : null}
            <section aria-label={comun.region}>
              {props.tipo === "propios" ? (
                <TablaCola
                  {...comun}
                  filas={props.filas}
                  columns={columnasTablaPropia(props.acciones)}
                  rowKey="cierreId"
                />
              ) : props.tipo === "bodega" ? (
                <TablaColaBodega {...comun} filas={props.filas} acciones={props.acciones} />
              ) : (
                <TablaColaMensajero
                  {...comun}
                  rol={props.rol}
                  pestanaActiva={props.pestanaActiva}
                  filas={props.filas}
                  acciones={props.acciones}
                />
              )}
            </section>
          </TabsContent>
        )}
      </Tabs>

      {props.tipo === "bodega" && props.rol === "satelite" ? (
        <PieConsolidar {...props} />
      ) : (
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
          {pie ? <span className="text-[13px] text-muted-foreground">{pie}</span> : null}
          {paginacion}
        </footer>
      )}
    </div>
  );
}

// ═══ Bodega · satélite (SLT-106) ═══════════════════════════════════════════════════════════════

/** El id del aviso, que refiere el botón deshabilitado del pie (R198). La pantalla monta una cola. */
const ID_AVISO_CONSOLIDAR = "aviso-consolidar-bodega";

/**
 * «A consolidar»: aviso (entre la barra y las tarjetas, R198), tarjetas del conjunto (R196) y la
 * tabla de la página. Solo vive en su panel: «Solicitados» no tiene nada de esto (R201).
 */
function PanelAConsolidar({
  comun,
  aviso,
  tarjetas,
  totales,
  filas,
  acciones,
}: Readonly<ColaCierresConsolidarProps & { comun: TablaComun }>) {
  return (
    <div className="flex flex-col gap-4">
      {aviso ? (
        <div
          role="status"
          id={ID_AVISO_CONSOLIDAR}
          className="rounded-lg border border-warning/60 bg-warning-soft px-4 py-3 text-sm text-warning-strong"
        >
          {aviso}
        </div>
      ) : null}
      <CifrasCierre cifras={tarjetas} totales={totales} ariaLabel={L.CIFRAS_A_CONSOLIDAR_LABEL} />
      <section aria-label={comun.region}>
        <TablaColaConsolidar {...comun} filas={filas} acciones={acciones} />
      </section>
    </div>
  );
}

/**
 * R197: texto, paginación y «Solicitar cierre de bodega», solo en «A consolidar». En «Solicitados»
 * (R289): su texto y su paginación, sin botón.
 */
function PieConsolidar({
  pestanaActiva,
  pie,
  paginacion,
  aviso,
  botonPie,
  solicitados,
}: Readonly<ColaCierresConsolidarProps>) {
  if (pestanaActiva === "solicitados") {
    return (
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-[13px] text-muted-foreground">{L.PIE_SOLICITADOS}</span>
        {solicitados.paginacion}
      </footer>
    );
  }
  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
      {pie ? <span className="text-[13px] text-muted-foreground">{pie}</span> : null}
      {paginacion}
      <Button
        type="button"
        onClick={botonPie.onClick}
        disabled={botonPie.deshabilitado}
        title={botonPie.deshabilitado ? (aviso ?? undefined) : undefined}
        aria-describedby={botonPie.deshabilitado && aviso ? ID_AVISO_CONSOLIDAR : undefined}
      >
        {L.BOTON_SOLICITAR_BODEGA}
      </Button>
    </footer>
  );
}

/**
 * «Solicitados» (R286, R289): las tres tarjetas, siempre (PA2), y la tabla de la página en su región.
 * Sin aviso: el aviso y el botón son solo de «A consolidar» (R32).
 */
function PanelSolicitados({
  tarjetas,
  filas,
  acciones,
  cargando,
  error,
}: Readonly<PanelSolicitadosProps>) {
  return (
    <div className="flex flex-col gap-4">
      <CifrasCierre cifras={tarjetas} ariaLabel={L.CIFRAS_SOLICITADOS_LABEL} />
      <section aria-label={L.REGION_SOLICITADOS}>
        <TablaCola
          region={L.REGION_SOLICITADOS}
          cargando={cargando}
          error={error}
          vacio={L.VACIO_SOLICITADOS}
          filas={filas}
          columns={columnasTabla(
            columnasCola("bodega", "satelite", "solicitados"),
            (id, c: CierreBodegaResumen) => celdaSolicitado(id, c, acciones),
          )}
          rowKey="cierreBodegaId"
        />
      </section>
    </div>
  );
}

/** R288: las celdas de bodega de la central, más Recaudado y un único «Ver». */
function celdaSolicitado(
  id: ColumnaColaId,
  c: CierreBodegaResumen,
  acciones: AccionesColaSolicitados,
): ReactNode {
  if (id === "recaudado") return <span className="tabular-nums">{money(c.totales.general)}</span>;
  if (id === "acciones") {
    return (
      <span className="flex justify-end gap-1.5">
        <Button
          type="button"
          variant="outline"
          className={BOTON_FILA}
          aria-label={L.nombreVerCierreBodega(folioBodegaCola(c))}
          onClick={() => acciones.ver(c.cierreBodegaId)}
        >
          {L.ACCION_VER}
        </Button>
      </span>
    );
  }
  return celdaBodega(id, c);
}

/**
 * La tabla de «A consolidar» (R192): pinta los strings del servidor sin derivar nada; `money()` es
 * el único que toca un importe (R71) y «A la central» es el `paraLaCentral` de la fila (R67).
 */
function TablaColaConsolidar({
  region,
  cargando,
  error,
  vacio,
  filas,
  acciones,
}: Readonly<
  TablaComun & { filas: readonly CierreConsolidableCola[]; acciones: AccionesColaConsolidar }
>) {
  function celda(id: ColumnaColaId, c: CierreConsolidableCola): ReactNode {
    switch (id) {
      case "folio":
        return <span className="font-mono text-[13px]">{folioConsolidable(c)}</span>;
      case "mensajero":
        return <span className="text-foreground">{c.mensajeroNombre}</span>;
      case "aprobado":
        return <span className="text-muted-foreground">{aprobadoCola(c)}</span>;
      case "recaudado":
        return <span className="tabular-nums">{money(c.totales.general)}</span>;
      case "pago":
        return <span className="tabular-nums">{money(c.totalPagoMensajero)}</span>;
      case "ganaBodega":
        return <span className="tabular-nums">{money(c.totalIngresoBodegaRechazos)}</span>;
      case "aLaCentral":
        return (
          <span
            className={cn(
              "font-semibold tabular-nums",
              esMontoNegativo(c.paraLaCentral) && "text-danger-strong",
            )}
          >
            {money(c.paraLaCentral)}
          </span>
        );
      case "senales": {
        const senal = senalesConsolidable(c);
        return senal ? <span className="pl-4 text-xs text-warning-strong">{senal}</span> : null;
      }
      case "acciones":
        return (
          <span className="flex justify-end gap-1.5">
            <Button
              type="button"
              variant="outline"
              className={BOTON_FILA}
              aria-label={L.nombreVerSuCierre(c.mensajeroNombre)}
              onClick={() => acciones.verSuCierre(c.cierreDiaId)}
            >
              {L.ACCION_VER_SU_CIERRE}
            </Button>
          </span>
        );
      default:
        return null;
    }
  }

  return (
    <TablaCola
      {...{ region, cargando, error, vacio, filas }}
      columns={columnasTabla(columnasCola("bodega", "satelite", "aConsolidar"), celda)}
      rowKey="cierreDiaId"
    />
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
    if (id === "acciones") return <AccionBodegaCelda cierre={c} abrir={acciones.abrir} />;
    return celdaBodega(id, c);
  }

  return (
    <TablaCola
      {...{ region, cargando, error, vacio, filas }}
      columns={columnasTabla(columnasCola("bodega", "central", "pendientes"), celda)}
      rowKey="cierreBodegaId"
    />
  );
}

/**
 * Las celdas de una fila de bodega que comparten la central (SLT-127) y «Solicitados» de la satélite
 * (SLT-107, R288). Pintan los strings del servidor; `money()` es el único que toca un importe (R71).
 */
function celdaBodega(id: ColumnaColaId, c: CierreBodegaResumen): ReactNode {
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
    default:
      return null;
  }
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
