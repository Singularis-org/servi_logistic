"use client";

// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (T3.1) — la cola única de cierres
// (`design.md > ColaCierres`), fiel a `ColaCierres.dc.html` (rama mensajero): descripción por rol,
// pestañas subrayadas con conteo, la barra de hoy con «Descargar» a la derecha, una tabla con una fila
// por cierre y un pie. No pide datos: todo llega por props del módulo que la monta.

import { Fragment, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { money } from "@/lib/config/moneda";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
import { EstadoCierreBadge } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import { PAGO_MENSAJERO_TEXTO } from "@/app/(app)/cierres-admin/_components/pago-mensajero-labels";

import * as L from "./cola-cierres-labels";
import {
  accionesFilaDe,
  columnasCola,
  fechaCola,
  folioCola,
  pagoEntregadoDe,
  senalesDe,
  type ColumnaColaId,
  type PestanaCola,
  type RolCola,
  type TipoCola,
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

export interface ColaCierresProps {
  tipo: TipoCola;
  rol: RolCola;
  descripcion: string;
  pestanas: readonly PestanaColaProps[];
  pestanaActiva: PestanaCola;
  onPestana: (id: PestanaCola) => void;
  /** La barra de filtros de hoy, tal cual (R100). */
  barra: ReactNode;
  /** «Descargar» de la pestaña activa (R100). */
  descargar: ReactNode;
  /** La página de la pestaña activa. */
  filas: readonly CierreAdminResumen[];
  cargando: boolean;
  /** Texto del error ya redactado (R104). */
  error: string | null;
  /** Texto del vacío (R104). */
  vacio: string;
  /** Nombre de la región y de la tabla (R104). */
  region: string;
  acciones: AccionesCola;
  pie?: string;
  paginacion: ReactNode;
}

// Pestañas subrayadas: las mismas clases que el detalle único (`DetalleCierre.tsx`).
const TABS_LIST = "shrink-0 justify-start gap-6 rounded-none border-b border-border p-0";
const TAB_TRIGGER =
  "rounded-none border-0 border-b-2 border-transparent bg-transparent px-0.5 py-2.5 text-muted-foreground shadow-none hover:bg-transparent aria-selected:border-foreground aria-selected:bg-transparent aria-selected:text-foreground aria-selected:shadow-none aria-selected:hover:bg-transparent";
// Botones de la fila (canvas: 32 px de alto, 13 px, 12 px de relleno).
const BOTON_FILA = "px-3 text-[13px]";
/** El nombre del `tablist` de hoy; lo localizan los tests y los E2E (R99). */
export const TABS_COLA_LABEL = "Cierres del día por estado";

export function ColaCierres({
  tipo,
  rol,
  descripcion,
  pestanas,
  pestanaActiva,
  onPestana,
  barra,
  descargar,
  filas,
  cargando,
  error,
  vacio,
  region,
  acciones,
  pie,
  paginacion,
}: Readonly<ColaCierresProps>) {
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
    }
  }

  const columns: Column<CierreAdminResumen>[] = columnasCola(tipo, rol, pestanaActiva).map(
    (col) => ({
      id: col.id,
      value: col.label,
      align: col.align,
      renderHeader: col.soloLector
        ? () => <span className="sr-only">{col.label}</span>
        : undefined,
      render: (c: CierreAdminResumen) => celda(col.id, c),
    }),
  );

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{descripcion}</p>

      <Tabs
        value={pestanaActiva}
        onValueChange={(v) => onPestana(v as PestanaCola)}
        className="flex flex-col gap-4"
      >
        <TabsList aria-label={TABS_COLA_LABEL} className={TABS_LIST}>
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
          <section aria-label={region}>
            <DataTable
              ariaLabel={region}
              columns={columns}
              data={[...filas]}
              rowKey="cierreId"
              isLoading={cargando}
              error={error}
              emptyMessage={vacio}
            />
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
