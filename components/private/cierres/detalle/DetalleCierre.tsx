"use client";

import { useEffect, useId, useMemo, useRef, type ReactNode, type RefObject } from "react";
import { ArrowLeft, TriangleAlert } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-mobile";
import { useImpuestoDelPais, useMonedaDelPais } from "@/hooks/use-moneda-del-pais";
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
  paresCabeceraBodega,
  paresCabeceraMensajero,
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
  type ParCabecera,
  type PaisDelCierre,
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
      /**
       * SLT-109 (R245): acciones que se ofrecen pero aún no se pueden pulsar, con su motivo. El botón
       * sale `disabled`, con el motivo en `title` y como descripción accesible.
       */
      deshabilitadas?: Partial<Record<AccionId, string>>;
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
      deshabilitadas?: Partial<Record<AccionId, string>>;
    };

/** Todo lo que la pantalla pinta, ya decidido. */
interface Modelo {
  prefijo: string;
  titulo: string;
  /** SLT-153 (R450-R455): los datos de la cabecera, cada uno con su rótulo. */
  pares: ParCabecera[];
  estado: ReactNode;
  retenidas: number;
  avisos: AvisoFranja[];
  cifras: Cifra[];
  totales: CierreTotales;
  pestanas: Pestana[];
  slots: Partial<Record<PestanaId, ReactNode>>;
  paquetesVuelven: number;
  pieTexto: string;
  /** Gestiones del cierre del mensajero (el contador de «Solicitar cierre del día»); `null` en bodega. */
  gestiones: number | null;
}

/** SLT-244 (R3, R6): `pais` (moneda e impuesto del país) llega de los hooks de `Cuerpo`. */
function modeloDe(props: DetalleCierreProps, pais: PaisDelCierre): Modelo {
  if (props.tipo === "bodega") {
    const d = props.detalle;
    const conciliacion = estadoConciliacionBodega(d);
    const dinero = lineasDinero("bodega", d, pais);
    return {
      prefijo: L.DETALLE_CIERRE_BODEGA_PREFIJO,
      titulo: L.tituloCierreBodega(d.zonaNombre),
      pares: paresCabeceraBodega(d),
      estado: (
        <Badge variant={ESTADO_CONCILIACION_VARIANT[conciliacion]}>
          {ESTADO_CONCILIACION_LABEL[conciliacion]}
        </Badge>
      ),
      retenidas: 0,
      avisos: avisosDe("bodega", props.audiencia, props.modo, d),
      cifras: cifrasDe("bodega", props.audiencia, d, pais),
      totales: d.totales,
      pestanas: pestanasDe("bodega", props.audiencia, props.modo, {
        gestiones: d.conteos.gestiones,
        // SLT-104 (PA2, R121): la pestaña cuenta sus filas (cierres del día); la cabecera, mensajeros.
        mensajeros: d.conteos.cierres,
      }),
      slots: {
        dinero: <DineroCierre dinero={dinero} />,
        gestiones: props.pestanas.gestiones,
        mensajeros: props.pestanas.mensajeros,
        conciliacion: props.pestanas.conciliacion,
      },
      paquetesVuelven: 0,
      pieTexto: pieTextoDe("bodega", props.audiencia, props.modo, d, pais),
      gestiones: null,
    };
  }
  const d = props.detalle;
  const dinero = props.audiencia === "mensajero" ? null : lineasDinero("mensajero", d, pais);
  return {
    prefijo: L.DETALLE_CIERRE_PREFIJO,
    titulo: props.audiencia === "mensajero" ? L.TU_CIERRE_TITULO : L.tituloCierreMensajero(d.mensajeroNombre),
    pares: paresCabeceraMensajero(d),
    estado:
      d.estado === null ? (
        <Badge variant="secondary">{L.SIN_SOLICITAR_LABEL}</Badge>
      ) : (
        <EstadoCierreBadge estado={d.estado} />
      ),
    retenidas: d.reprogramadasRetenidasHoy,
    avisos: avisosDe("mensajero", props.audiencia, props.modo, d),
    cifras: cifrasDe("mensajero", props.audiencia, d, pais),
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
    pieTexto: pieTextoDe("mensajero", props.audiencia, props.modo, d, pais, disponiblesDe(props)),
    gestiones: d.conteos.gestiones,
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
        "flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-sm",
        aviso.tono === "peligro" ? "bg-danger-soft text-danger-strong dark:bg-danger/15" : "bg-warning-soft text-warning-strong dark:bg-warning/15",
      )}
    >
      <TriangleAlert aria-hidden="true" className="size-4 shrink-0" />
      <strong className="font-semibold">{aviso.titulo}</strong>
      <span>{aviso.partes.join(" · ")}</span>
    </div>
  );
}

/**
 * Un botón del pie. SLT-109 (R245): con `motivo`, sale `disabled` con el motivo en `title` y como
 * descripción accesible (un `sr-only` enlazado por `aria-describedby`).
 */
function BotonPie({
  accion,
  motivo,
  motivoId,
  onPulsar,
  contador,
  desactivado = false,
  className,
}: Readonly<{
  accion: AccionPie;
  motivo: string | undefined;
  motivoId: string;
  onPulsar: () => void;
  /** SLT-156 (R531): «{n} gestiones», a la derecha DENTRO del botón. */
  contador?: string;
  /** SLT-156 (R531): sin gestiones, desactivado aunque nadie dé un motivo. */
  desactivado?: boolean;
  className?: string;
}>) {
  return (
    <>
      <Button
        type="button"
        variant={VARIANTE_BOTON[accion.variante]}
        disabled={motivo !== undefined || desactivado}
        title={motivo}
        aria-describedby={motivo !== undefined ? motivoId : undefined}
        onClick={onPulsar}
        className={cn(contador !== undefined && "justify-between gap-4", className)}
      >
        {contador === undefined ? (
          accion.label
        ) : (
          <>
            <span>{accion.label}</span>{" "}
            <span className="font-normal tabular-nums">{contador}</span>
          </>
        )}
      </Button>
      {motivo !== undefined ? (
        <span id={motivoId} className="sr-only">
          {motivo}
        </span>
      ) : null}
    </>
  );
}

/**
 * SLT-153 «Cabecera del detalle del cierre con rótulos y folio buscable» (D1, R455): cada dato con su
 * rótulo, como término y definición de un `<dl>`. Los pares ya vienen sin los vacíos (R451); se
 * reparten en columnas y saltan de línea en el teléfono.
 */
function DatosCabecera({ pares }: Readonly<{ pares: ParCabecera[] }>) {
  if (pares.length === 0) return null;
  return (
    <dl
      aria-label={L.DATOS_DEL_CIERRE_LABEL}
      className="m-0 flex flex-wrap gap-x-5 gap-y-2 text-sm"
    >
      {pares.map((p) => (
        <div key={p.rotulo} className="flex min-w-0 flex-col">
          <dt className="text-xs text-muted-foreground">{p.rotulo}</dt>
          <dd className={cn("m-0 text-foreground wrap-anywhere", p.mono && "font-mono")}>{p.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * SLT-156 (R531, R534): en el teléfono el pie del cierre de la página es una barra FIJA al borde
 * inferior de la ventana. Publica su alto en `--alto-barra-inferior` sobre `<html>` (los flotantes
 * suben por encima de ella y la página reserva ese hueco al final: nada queda tapado). Sin barra,
 * la variable no existe. Se limpia al desmontar o al dejar de ser fija.
 */
export const VARIABLE_ALTO_BARRA = "--alto-barra-inferior";

/** El panel de la pestaña en el marco página: sin scroll en el teléfono, de lado en tableta, entero desde `lg`. */
export const PANEL_PAGINA = "md:overflow-x-auto lg:overflow-auto";

/**
 * SLT-209 — el modal en el TELÉFONO desplaza entero, no solo el panel de la pestaña. Con cabecera,
 * cifras, pestañas y pie fijos, al panel le quedaban 124-204 px de un teléfono de 700-780 px, y la
 * barra fija de «Gestiones» (132 px) lo llenaba: la lista no se veía y la barra parecía flotar sobre
 * ella (medido en el E2E `pwa-mensajero-cierre-barra-fija`; en CI, con otras fuentes, la barra
 * quedaba recortada por debajo del panel). Así que en el teléfono:
 *  · `MARCO_MODAL` es el que desplaza, sin relleno arriba ni abajo: un `sticky` se pega al borde
 *    del CONTENIDO de quien desplaza, y con relleno la barra quedaría 16 px por debajo del borde
 *    visible con las tarjetas asomando por esa franja. El relleno lo ponen la cabecera y el pie;
 *  · las pestañas y el panel toman el alto de su contenido (`min-h-auto`, sin scroll propio);
 *  · el pie va pegado abajo (`sticky bottom-0`), con fondo: sus acciones siguen a la vista.
 * Desde `md`, el de siempre: el panel es el único scroll (R11) y no hay barra fija.
 */
export const PANEL_MODAL = "overflow-auto max-md:min-h-auto max-md:overflow-visible";
const TABS_MODAL = "max-md:min-h-auto";
const CABECERA_MODAL = "max-md:pt-4";
const PIE_MODAL = "max-md:sticky max-md:bottom-0 max-md:z-10 max-md:bg-background max-md:pb-4";

function usePublicarAltoBarra(ref: RefObject<HTMLElement | null>, activa: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!activa || !el) return;
    const raiz = document.documentElement;
    // `scroll-padding-bottom`: lo que se desplaza a la vista (un control enfocado con el teclado,
    // `scrollIntoView`) queda ENCIMA de la barra y no debajo de ella (la paginación lo sufría).
    const medir = () => {
      const alto = `${Math.ceil(el.getBoundingClientRect().height)}px`;
      raiz.style.setProperty(VARIABLE_ALTO_BARRA, alto);
      raiz.style.setProperty("scroll-padding-bottom", alto);
    };
    medir();
    const observador = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(medir);
    observador?.observe(el);
    return () => {
      observador?.disconnect();
      raiz.style.removeProperty(VARIABLE_ALTO_BARRA);
      raiz.style.removeProperty("scroll-padding-bottom");
    };
  }, [ref, activa]);
}

/**
 * SLT-156 (R531): el pie del marco página. Desde 768 px, pegado abajo como hoy (`sticky`); en el
 * teléfono, barra fija a todo el ancho, con fondo, borde superior, el texto encima y el botón negro
 * de 52 px debajo. El relleno inferior respeta la zona segura del iPhone (`style` en línea: sin
 * zona segura vale los mismos 12 px de antes).
 */
export const PIE_PAGINA =
  "z-10 bg-background pb-3 md:sticky md:bottom-0 " +
  "max-md:fixed max-md:inset-x-0 max-md:bottom-0 max-md:z-30 max-md:flex-col max-md:items-stretch max-md:gap-2 max-md:px-4";
const PIE_PAGINA_ESTILO = { paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" } as const;
/** El botón del pie en la barra del teléfono: 52 px a todo el ancho (canvas v35). */
export const BOTON_BARRA = "max-md:h-13 max-md:w-full";

function Cuerpo({
  props,
  tituloId,
  esMovil,
}: Readonly<{ props: DetalleCierreProps; tituloId: string; esMovil: boolean }>) {
  const moneda = useMonedaDelPais();
  const impuesto = useImpuestoDelPais();
  const pais = useMemo<PaisDelCierre>(() => ({ moneda, impuesto }), [moneda, impuesto]);
  const m = modeloDe(props, pais);
  const motivoId = useId();
  const pieRef = useRef<HTMLElement>(null);
  const enPagina = props.marco === "pagina";
  usePublicarAltoBarra(pieRef, enPagina && esMovil);
  const acciones = accionesDe(props.tipo, props.audiencia, props.modo, {
    disponibles: disponiblesDe(props),
    paquetesVuelven: m.paquetesVuelven,
  });
  // R531: «Solicitar cierre del día» lleva su contador; sin gestiones, desactivado y con su aviso.
  const conSolicitar = acciones.some((a) => a.id === "solicitar");
  const sinGestiones = conSolicitar && m.gestiones === 0;
  const titulo = (
    <>
      {/* El espacio va FUERA del `sr-only`: dentro, el cálculo del nombre accesible lo recorta. */}
      <span className="sr-only">{`${m.prefijo} ·`}</span> {m.titulo}
    </>
  );
  const claseTitulo = "m-0 text-lg font-semibold";
  // R537: en el teléfono, el modal es pantalla completa y se sale con «Volver» arriba, no con la X.
  const volverArriba = props.marco === "modal" && esMovil && props.onCerrar !== undefined;

  function alPulsar(id: AccionId) {
    if (id === "cerrar") props.onCerrar?.();
    else if (id !== "conciliacion") props.acciones[id]?.();
  }

  return (
    <>
      <header
        className={cn(
          "flex shrink-0 flex-col gap-2",
          props.marco === "modal" && !esMovil && "pr-10",
          props.marco === "modal" && CABECERA_MODAL,
        )}
      >
        {volverArriba ? (
          <Button type="button" variant="outline" size="touch" className="w-fit" onClick={props.onCerrar}>
            <ArrowLeft aria-hidden="true" />
            {L.ACCION_VOLVER}
          </Button>
        ) : null}
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
        <DatosCabecera pares={m.pares} />
      </header>

      {m.avisos.map((a) => (
        <Franja key={a.titulo} aviso={a} />
      ))}

      <CifrasCierre cifras={m.cifras} totales={m.totales} />

      <Tabs defaultValue={m.pestanas[0]?.id} className={cn("flex min-h-0 flex-1 flex-col", !enPagina && TABS_MODAL)}>
        {/* R530: en el teléfono las pestañas pasan a otra línea antes que desbordar. */}
        <TabsList
          aria-label={L.PESTANAS_LABEL}
          className="h-auto shrink-0 flex-wrap justify-start gap-x-6 gap-y-2 rounded-none border-b border-border p-0"
        >
          {m.pestanas.map((p) => (
            <TabsTrigger
              key={p.id}
              value={p.id}
              className="rounded-none border-0 border-b-2 border-transparent bg-transparent px-1 py-3 text-muted-foreground shadow-none hover:bg-transparent aria-selected:border-foreground aria-selected:bg-transparent aria-selected:text-foreground aria-selected:shadow-none aria-selected:hover:bg-transparent"
            >
              {p.label}
            </TabsTrigger>
          ))}
        </TabsList>
        {m.pestanas.map((p) => (
          // El panel es la única región con scroll del modal y del escritorio (R11). En la página, por
          // debajo de 768 px fluye con la ventana: así la barra de «Gestiones» puede quedar fija arriba
          // (R527) y no hay scroll lateral (m6 de la review de SLT-156 A). Entre 768 y 1023 px (tableta,
          // barra lateral abierta) la rejilla de escritorio puede no caber: ahí el panel se desplaza de
          // lado en vez de dejar que `SidebarInset` la recorte (B3 de la review de SLT-165).
          <TabsContent
            key={p.id}
            value={p.id}
            className={cn("mt-0 min-h-0 flex-1 pt-4", enPagina ? PANEL_PAGINA : PANEL_MODAL)}
          >
            {m.slots[p.id] ?? null}
          </TabsContent>
        ))}
      </Tabs>

      {/* SLT-109 (R254): en página, el pie se pega al borde inferior de la ventana mientras el detalle
          esté a la vista, así su botón se ve en un teléfono sin desplazar la página. SLT-156 (R531): en
          el teléfono es una barra fija. */}
      <footer
        ref={pieRef}
        className={cn(
          "flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border pt-3",
          enPagina ? PIE_PAGINA : PIE_MODAL,
        )}
        style={enPagina ? PIE_PAGINA_ESTILO : undefined}
      >
        <span className="text-sm text-muted-foreground">{sinGestiones ? L.SIN_GESTIONES_PENDIENTES : m.pieTexto}</span>
        <div className="flex flex-wrap gap-2">
          {acciones.map((a) =>
            a.id === "conciliacion" ? (
              <div key={a.id} className="flex flex-wrap gap-2">
                {props.acciones.conciliacion}
              </div>
            ) : (
              <BotonPie
                key={a.id}
                accion={a}
                motivo={props.deshabilitadas?.[a.id]}
                motivoId={`${motivoId}-${a.id}`}
                onPulsar={() => alPulsar(a.id)}
                contador={a.id === "solicitar" && m.gestiones !== null ? L.contadorGestiones(m.gestiones) : undefined}
                desactivado={a.id === "solicitar" && sinGestiones}
                className={enPagina ? BOTON_BARRA : undefined}
              />
            ),
          )}
        </div>
      </footer>
    </>
  );
}

/**
 * SLT-156 (R537): el marco modal. En el teléfono, pantalla completa sin esquinas ni la X (sale con
 * «Volver»); desde 768 px, el de hoy.
 */
export const MARCO_MODAL =
  "flex max-w-none flex-col gap-4 bg-background p-4 max-md:h-dvh max-md:w-screen max-md:rounded-none max-md:border-0 " +
  // SLT-209: en el teléfono desplaza el modal entero, sin relleno arriba ni abajo (ver `PANEL_MODAL`).
  "max-md:overflow-y-auto max-md:py-0 " +
  "md:h-[calc(100dvh-2rem)] md:w-[75vw] md:p-6";

export function DetalleCierre(props: Readonly<DetalleCierreProps>) {
  const tituloId = useId();
  const esMovil = useIsMobile();
  if (props.marco === "modal") {
    return (
      <Dialog
        open
        onOpenChange={(abierto) => {
          if (!abierto) props.onCerrar?.();
        }}
      >
        <DialogContent className={MARCO_MODAL} showCloseButton={!esMovil}>
          <Cuerpo props={props} tituloId={tituloId} esMovil={esMovil} />
        </DialogContent>
      </Dialog>
    );
  }
  // SLT-109 (R254): en escritorio el marco página tiene el alto de la ventana menos la cabecera de
  // `AppPage`, con un solo scroll en el panel de la pestaña; en el teléfono fluye con la página y el
  // pie va fijo abajo (SLT-156, R531). «Cierres solicitados» sigue debajo, en el scroll de la página.
  return (
    <section
      role="region"
      aria-labelledby={tituloId}
      className="flex min-h-0 flex-col gap-4 lg:h-[calc(100dvh-12rem)] lg:min-h-[28rem]"
    >
      <Cuerpo props={props} tituloId={tituloId} esMovil={esMovil} />
    </section>
  );
}
