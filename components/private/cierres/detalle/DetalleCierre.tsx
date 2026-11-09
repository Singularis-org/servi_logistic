"use client";

import { useId, type ReactNode } from "react";
import { TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import { EstadoCierreBadge } from "@/app/(app)/cierres-admin/_components/cierre-detalle-shared";
import {
  ESTADO_CONCILIACION_LABEL,
  ESTADO_CONCILIACION_VARIANT,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import { RetieneReprogramadasBadge } from "@/app/(app)/cierres-admin/_components/RetieneReprogramadasBadge";

import { CifrasCierre } from "./CifrasCierre";
import { DineroCierre } from "./DineroCierre";
import * as L from "./detalle-cierre-labels";
import {
  accionesDe,
  avisosDe,
  cifrasDe,
  estadoConciliacionBodega,
  fechasBodega,
  fechasMensajero,
  lineasDinero,
  pestanasDe,
  pieTextoDe,
  type AccionId,
  type AccionPie,
  type Audiencia,
  type AvisoFranja,
  type Cifra,
  type DetalleBodegaVista,
  type DetalleMensajeroVista,
  type Modo,
  type Pestana,
  type PestanaId,
} from "./detalle-cierre-vista";

// SLT-95 «Rediseño del detalle de cierre (mensajero y bodega)», S1 (T2.3) — EL detalle de cierre
// del módulo (D1, D15, R1): un solo componente para el cierre de mensajero y el de bodega, visto por
// la central, la satélite o el mensajero, en modal o en página. Lo que cambia entre esas pantallas
// son las props; qué cifra, aviso, pestaña o acción va lo deciden las funciones puras de
// `detalle-cierre-vista.ts`.
//
// La rejilla tiene UN solo scroll (R11): cabecera, franja, cifras, pestañas y pie son `shrink-0`; el
// panel de la pestaña activa es la única región con `overflow-auto`. Los flujos (aprobar, rechazar,
// destrabar, conciliar, solicitar) NO viven aquí: el detalle llama al callback de quien lo monta.

/** Ausente = no se ofrece (R12). */
export type AccionesPie = Partial<
  Record<"rechazar" | "aprobar" | "destrabar" | "solicitar" | "solicitarRechazado" | "solicitarVencido", () => void>
> & { conciliacion?: ReactNode };

/** Cuerpos de pestaña que no son «Dinero»: los monta quien usa el detalle (S2, S3, S6, S11). */
export interface SlotsMensajero {
  gestiones: ReactNode;
  rechazos: ReactNode;
  /** Solo con el cierre aprobado y permiso de pagar (R10, R18). */
  pago?: ReactNode;
  corregir?: ReactNode;
}

export interface SlotsBodega {
  gestiones: ReactNode;
  mensajeros: ReactNode;
  conciliacion: ReactNode;
}

export type DetalleCierreProps =
  | {
      tipo: "mensajero";
      detalle: DetalleMensajeroVista;
      audiencia: Audiencia;
      modo: Modo;
      marco: "modal" | "pagina";
      pestanas: SlotsMensajero;
      acciones: AccionesPie;
      onCerrar?: () => void;
    }
  | {
      tipo: "bodega";
      detalle: DetalleBodegaVista;
      audiencia: Exclude<Audiencia, "mensajero">;
      modo: "decidir" | "solo lectura";
      marco: "modal";
      pestanas: SlotsBodega;
      acciones: AccionesPie;
      onCerrar: () => void;
    };

/** Todo lo que la pantalla pinta, ya decidido. */
interface Modelo {
  prefijo: string;
  titulo: string;
  sub: string;
  folio: string;
  fechas: string;
  estado: ReactNode;
  retenidas: number;
  avisos: AvisoFranja[];
  cifras: Cifra[];
  totales: CierreTotales;
  pestanas: Pestana[];
  slots: Partial<Record<PestanaId, ReactNode>>;
  paquetesVuelven: number;
  pieTexto: string;
}

function modeloDe(props: DetalleCierreProps): Modelo {
  if (props.tipo === "bodega") {
    const d = props.detalle;
    const conciliacion = estadoConciliacionBodega(d);
    const dinero = lineasDinero("bodega", d);
    return {
      prefijo: L.DETALLE_CIERRE_BODEGA_PREFIJO,
      titulo: L.tituloCierreBodega(d.zonaNombre),
      sub: L.subtituloCierreBodega(d.solicitadoPorNombre, d.conteos.mensajeros),
      folio: d.folio,
      fechas: fechasBodega(d),
      estado: (
        <Badge variant={ESTADO_CONCILIACION_VARIANT[conciliacion]}>
          {ESTADO_CONCILIACION_LABEL[conciliacion]}
        </Badge>
      ),
      retenidas: 0,
      avisos: avisosDe("bodega", props.audiencia, props.modo, d),
      cifras: cifrasDe("bodega", props.audiencia, d),
      totales: d.totales,
      pestanas: pestanasDe("bodega", props.audiencia, props.modo, {
        gestiones: d.conteos.gestiones,
        mensajeros: d.conteos.mensajeros,
      }),
      slots: {
        dinero: <DineroCierre dinero={dinero} />,
        gestiones: props.pestanas.gestiones,
        mensajeros: props.pestanas.mensajeros,
        conciliacion: props.pestanas.conciliacion,
      },
      paquetesVuelven: 0,
      pieTexto: pieTextoDe("bodega", props.audiencia, props.modo, d),
    };
  }
  const d = props.detalle;
  const dinero = props.audiencia === "mensajero" ? null : lineasDinero("mensajero", d);
  return {
    prefijo: L.DETALLE_CIERRE_PREFIJO,
    titulo: props.audiencia === "mensajero" ? L.TU_CIERRE_TITULO : L.tituloCierreMensajero(d.mensajeroNombre),
    sub: d.destino,
    folio: d.folio ?? L.FOLIO_NUEVO_LABEL,
    fechas: fechasMensajero(d),
    estado:
      d.estado === null ? (
        <Badge variant="secondary">{L.SIN_SOLICITAR_LABEL}</Badge>
      ) : (
        <EstadoCierreBadge estado={d.estado} />
      ),
    retenidas: d.reprogramadasRetenidasHoy,
    avisos: avisosDe("mensajero", props.audiencia, props.modo, d),
    cifras: cifrasDe("mensajero", props.audiencia, d),
    totales: d.totales,
    pestanas: pestanasDe("mensajero", props.audiencia, props.modo, {
      gestiones: d.conteos.gestiones,
      rechazos: d.conteos.rechazosDeTienda,
      conPago: d.estado === "aprobado" && props.pestanas.pago !== undefined,
    }),
    slots: {
      dinero: dinero ? <DineroCierre dinero={dinero} /> : null,
      gestiones: props.pestanas.gestiones,
      rechazos: props.pestanas.rechazos,
      pago: props.pestanas.pago,
      corregir: props.pestanas.corregir,
    },
    paquetesVuelven: d.conteos.paquetesVuelven,
    pieTexto: pieTextoDe("mensajero", props.audiencia, props.modo, d),
  };
}

/** Las acciones que quien monta ofrece: las que trae su callback (o su nodo) y «Cerrar» con `onCerrar`. */
function disponiblesDe(props: DetalleCierreProps): Set<AccionId> {
  const ids = new Set<AccionId>();
  for (const [id, valor] of Object.entries(props.acciones)) {
    if (valor !== undefined && valor !== null) ids.add(id as AccionId);
  }
  if (props.onCerrar) ids.add("cerrar");
  return ids;
}

const VARIANTE_BOTON: Record<AccionPie["variante"], "default" | "outline" | "destructive"> = {
  principal: "default",
  secundaria: "outline",
  peligro: "destructive",
};

function Franja({ aviso }: Readonly<{ aviso: AvisoFranja }>) {
  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 flex-wrap items-center gap-x-2.5 gap-y-1 rounded-lg px-3.5 py-2.5 text-sm",
        aviso.tono === "peligro" ? "bg-danger-soft text-danger-strong" : "bg-warning-soft text-warning-strong",
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <strong className="font-semibold">{aviso.titulo}</strong>
      <span>{aviso.partes.join(" · ")}</span>
    </div>
  );
}

function Cuerpo({ props, tituloId }: Readonly<{ props: DetalleCierreProps; tituloId: string }>) {
  const m = modeloDe(props);
  const acciones = accionesDe(props.tipo, props.audiencia, props.modo, {
    disponibles: disponiblesDe(props),
    paquetesVuelven: m.paquetesVuelven,
  });
  const titulo = (
    <>
      {/* El espacio va FUERA del `sr-only`: dentro, el cálculo del nombre accesible lo recorta. */}
      <span className="sr-only">{`${m.prefijo} ·`}</span> {m.titulo}
    </>
  );
  const claseTitulo = "m-0 text-lg font-semibold";

  function alPulsar(id: AccionId) {
    if (id === "cerrar") props.onCerrar?.();
    else if (id !== "conciliacion") props.acciones[id]?.();
  }

  return (
    <>
      <header className={cn("flex shrink-0 flex-col gap-1.5", props.marco === "modal" && "pr-10")}>
        <div className="flex flex-wrap items-center gap-2">
          {props.marco === "modal" ? (
            <DialogTitle className={claseTitulo}>{titulo}</DialogTitle>
          ) : (
            <h2 id={tituloId} className={claseTitulo}>
              {titulo}
            </h2>
          )}
          {m.estado}
          <RetieneReprogramadasBadge cuantas={m.retenidas} />
        </div>
        <p className="m-0 text-sm text-muted-foreground">
          {m.sub} · <span className="font-mono text-xs">{m.folio}</span> · {m.fechas}
        </p>
      </header>

      {m.avisos.map((a) => (
        <Franja key={a.titulo} aviso={a} />
      ))}

      <CifrasCierre cifras={m.cifras} totales={m.totales} />

      <Tabs defaultValue={m.pestanas[0]?.id} className="flex min-h-0 flex-1 flex-col">
        <TabsList
          aria-label={L.PESTANAS_LABEL}
          className="shrink-0 justify-start gap-6 rounded-none border-b border-border p-0"
        >
          {m.pestanas.map((p) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-0.5 py-2.5 text-muted-foreground shadow-none hover:bg-transparent aria-selected:border-foreground aria-selected:bg-transparent aria-selected:text-foreground aria-selected:shadow-none aria-selected:hover:bg-transparent"
            >
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {m.pestanas.map((p) => (
          <TabsContent key={p.id} value={p.id} className="mt-0 min-h-0 flex-1 overflow-auto pt-4">
            {m.slots[p.id] ?? null}
          </TabsContent>
        ))}
      </Tabs>

      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-3">
        <span className="text-sm text-muted-foreground">{m.pieTexto}</span>
        <div className="flex flex-wrap gap-2">
          {acciones.map((a) =>
            a.id === "conciliacion" ? (
              <div key={a.id} className="flex flex-wrap gap-2">
                {props.acciones.conciliacion}
              </div>
            ) : (
              <Button key={a.id} type="button" variant={VARIANTE_BOTON[a.variante]} onClick={() => alPulsar(a.id)}>
                {a.label}
              </Button>
            ),
          )}
        </div>
      </footer>
    </>
  );
}

/**
 * @sin-superficie S1 de SLT-95 es el componente base sin montar; lo monta S2 (SLT-100) en /cierres-admin
 */
export function DetalleCierre(props: Readonly<DetalleCierreProps>) {
  const tituloId = useId();
  if (props.marco === "modal") {
    return (
      <Dialog
        open
        onOpenChange={(abierto) => {
          if (!abierto) props.onCerrar?.();
        }}
      >
        <DialogContent className="flex h-[calc(100dvh-2rem)] w-[calc(100vw-1rem)] max-w-none flex-col gap-4 bg-background p-4 sm:w-[75vw] sm:max-w-none sm:p-6">
          <Cuerpo props={props} tituloId={tituloId} />
        </DialogContent>
      </Dialog>
    );
  }
  return (
    <section role="region" aria-labelledby={tituloId} className="flex h-full min-h-0 flex-col gap-4">
      <Cuerpo props={props} tituloId={tituloId} />
    </section>
  );
}
