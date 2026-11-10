"use client";

import { useId, useRef, type KeyboardEvent } from "react";

import { CarruselCards } from "@/components/shared/CarruselCards";
import { IconoDelModulo } from "@/components/shared/planes/IconoDelModulo";
import {
  precioDeLaVista,
  TEXTOS_PLANES,
  textoDelCostoPorOrdenDelPlan,
  textoDelTope,
  usuariosDelPlan,
  type VistaDePrecio,
} from "@/components/shared/planes/planes-vista";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import type { PlanVista } from "@/lib/types/planes";
import { cn } from "@/lib/utils";

// SLT-99 (design §5; R5–R7, R9) — el carrusel de planes. Compartido y sin empresa: recibe por props los planes, el
// activo (opcional) y las acciones (opcionales), así lo monta igual «Mi plan» que la página pública de SLT-116.
// La tarjeta entera se toca (sin «Ver detalles»): el nombre es el botón y su área cubre la tarjeta.

export interface CarruselDePlanesProps {
  /** R5: los planes disponibles, en el orden del catálogo. */
  readonly planes: readonly PlanVista[];
  /** R6: la vista del precio; la controla quien monta, porque el detalle la usa también. */
  readonly vista: VistaDePrecio;
  readonly onCambiarVista: (vista: VistaDePrecio) => void;
  /** R5: la tarjeta con «Activo». Sin él (SLT-116), ninguna. */
  readonly activoId?: string | null;
  /** R7: el plan custom activo, que ocupa la tarjeta «Plan a la medida». */
  readonly customActivo?: PlanVista | null;
  /** La tarjeta cuyo detalle se ve. */
  readonly seleccionado?: string | null;
  readonly onSeleccionar: (planId: string) => void;
  /** R7 (P7): el envío de «Contáctanos» llega con SLT-117; sin él, el botón sale deshabilitado. */
  readonly onContactar?: () => void;
}

type Tarjeta = { clase: "plan"; plan: PlanVista } | { clase: "medida" };

const VISTAS: readonly VistaDePrecio[] = ["mensual", "anual"];

// @sin-superficie la monta CambioDePlan de «Mi plan» en la task T7 de SLT-99, que quita esta línea.
export function CarruselDePlanes({
  planes,
  vista,
  onCambiarVista,
  activoId = null,
  customActivo = null,
  seleccionado = null,
  onSeleccionar,
  onContactar,
}: CarruselDePlanesProps) {
  // R7: con un custom activo, la tarjeta «Plan a la medida» es su plan activo.
  const tarjetas: Tarjeta[] = [
    ...planes.map((plan) => ({ clase: "plan" as const, plan })),
    customActivo === null ? { clase: "medida" as const } : { clase: "plan" as const, plan: customActivo },
  ];
  const activo = customActivo?.id ?? activoId;

  return (
    <div className="flex flex-col gap-4">
      <SelectorDeVista vista={vista} onCambiar={onCambiarVista} />
      <CarruselCards
        items={tarjetas}
        getKey={(t) => (t.clase === "plan" ? t.plan.id : "plan-a-la-medida")}
        ariaLabel={TEXTOS_PLANES.planesDisponibles}
        singular={TEXTOS_PLANES.rangoSingular}
        plural={TEXTOS_PLANES.rangoPlural}
        renderItem={(t) =>
          t.clase === "plan" ? (
            <TarjetaDePlan
              plan={t.plan}
              vista={vista}
              esActivo={t.plan.id === activo}
              seleccionado={t.plan.id === seleccionado}
              onSeleccionar={() => onSeleccionar(t.plan.id)}
            />
          ) : (
            <TarjetaALaMedida onContactar={onContactar} />
          )
        }
      />
    </div>
  );
}

/** R6: «Mensual» / «Anual» como un grupo de radio (WAI-ARIA): flechas para moverse, una sola parada de tabulación. */
function SelectorDeVista({ vista, onCambiar }: { vista: VistaDePrecio; onCambiar: (v: VistaDePrecio) => void }) {
  const refs = useRef<Partial<Record<VistaDePrecio, HTMLButtonElement | null>>>({});

  function alTeclear(e: KeyboardEvent<HTMLDivElement>) {
    const paso = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (paso === 0) return;
    e.preventDefault();
    const siguiente = VISTAS[(VISTAS.indexOf(vista) + paso + VISTAS.length) % VISTAS.length];
    onCambiar(siguiente);
    refs.current[siguiente]?.focus();
  }

  return (
    <div
      role="radiogroup"
      aria-label={TEXTOS_PLANES.vistaDelPrecio}
      onKeyDown={alTeclear}
      className="inline-flex w-fit rounded-lg border border-border bg-muted p-0.5"
    >
      {VISTAS.map((v) => (
        <button
          key={v}
          ref={(el) => {
            refs.current[v] = el;
          }}
          type="button"
          role="radio"
          aria-checked={v === vista}
          tabIndex={v === vista ? 0 : -1}
          onClick={() => onCambiar(v)}
          className={cn(
            "rounded-md px-3 py-1 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring",
            v === vista ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {TEXTOS_PLANES.vistas[v]}
        </button>
      ))}
    </div>
  );
}

interface TarjetaDePlanProps {
  plan: PlanVista;
  vista: VistaDePrecio;
  esActivo: boolean;
  seleccionado: boolean;
  onSeleccionar: () => void;
}

function TarjetaDePlan({ plan, vista, esActivo, seleccionado, onSeleccionar }: TarjetaDePlanProps) {
  const precio = precioDeLaVista(plan.precio, vista);
  const usoDeLaPlataforma =
    precio.tipo === "monto"
      ? `${precio.monto} ${TEXTOS_PLANES.sufijoVista[vista]}`
      : precio.tipo === "sin_cuota"
        ? TEXTOS_PLANES.sinCuota
        : TEXTOS_PLANES.sinDato;
  return (
    <article
      data-plan={plan.id}
      data-activo={esActivo || undefined}
      className={cn(
        "relative flex h-full flex-col gap-3 rounded-xl border bg-card p-5 text-card-foreground",
        esActivo ? "border-2 border-success" : seleccionado ? "border-2 border-ring" : "border-border",
      )}
    >
      {precio.tipo === "monto" && precio.insignia !== null && <InsigniaAnual porcentaje={precio.insignia} />}
      <div className="flex flex-wrap items-center gap-2 pr-14">
        <h3 className="text-base font-semibold">
          {/* El área del botón cubre la tarjeta (`after:inset-0`): toda la tarjeta se toca, y el nombre accesible es el
              del plan. */}
          <button
            type="button"
            aria-pressed={seleccionado}
            onClick={onSeleccionar}
            className="text-left outline-none after:absolute after:inset-0 after:rounded-xl focus-visible:after:ring-2 focus-visible:after:ring-ring"
          >
            {plan.nombre}
          </button>
        </h3>
        {esActivo && <Badge variant="success">{TEXTOS_PLANES.activo}</Badge>}
      </div>

      {precio.tipo === "sin_cuota" ? (
        <p className="text-sm font-medium">{TEXTOS_PLANES.sinCuotaTarjeta}</p>
      ) : precio.tipo === "monto" ? (
        <p className="flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{precio.monto}</span>
          <span className="text-sm text-muted-foreground">{TEXTOS_PLANES.porVista[vista]}</span>
        </p>
      ) : null}

      <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-sm">
        <Dato termino={TEXTOS_PLANES.usoDeLaPlataforma} valor={usoDeLaPlataforma} />
        <Dato termino={TEXTOS_PLANES.costoPorOrden} valor={textoDelCostoPorOrdenDelPlan(plan)} />
        <Dato termino={TEXTOS_PLANES.usuarios} valor={textoDelTope(usuariosDelPlan(plan.topes))} />
        <Dato termino={TEXTOS_PLANES.apiKeys} valor={textoDelTope(plan.topes.apiKeys)} />
      </dl>

      <ListaDeModulos incluidos={plan.modulos} />
    </article>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{termino}</dt>
      <dd className="text-right font-medium">{valor}</dd>
    </>
  );
}

/** R3, R5: los módulos uno por uno, con ícono e «Incluido» o «No incluido». */
export function ListaDeModulos({ incluidos }: { readonly incluidos: readonly string[] }) {
  return (
    <ul aria-label={TEXTOS_PLANES.modulos} className="flex flex-col gap-1 text-sm">
      {ORDEN_MODULOS.map((m) => {
        const si = incluidos.includes(m);
        return (
          <li key={m} className={cn("flex items-center gap-2", si ? "text-foreground" : "text-muted-foreground")}>
            <IconoDelModulo modulo={m} />
            <span className="flex-1">{TEXTOS_PLANES.nombreDelModulo(m)}</span>
            <span className={si ? "font-semibold text-success-strong" : undefined}>
              {si ? TEXTOS_PLANES.incluido : TEXTOS_PLANES.noIncluido}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** R6: la insignia circular del descuento anual. El texto visible es corto; el lector oye la frase entera. */
function InsigniaAnual({ porcentaje }: { porcentaje: string }) {
  return (
    <span
      data-insignia
      className="absolute top-3 right-3 flex size-12 flex-col items-center justify-center rounded-full bg-primary text-primary-foreground"
    >
      <span aria-hidden="true" className="text-sm leading-none font-bold">
        {TEXTOS_PLANES.insignia(porcentaje)}
      </span>
      <span aria-hidden="true" className="text-[10px] leading-none">
        {TEXTOS_PLANES.insigniaAnual}
      </span>
      <span className="sr-only">{TEXTOS_PLANES.insigniaEtiqueta(porcentaje)}</span>
    </span>
  );
}

/** R7 (P7): «Plan a la medida» con «Contáctanos»; sin la acción, deshabilitado y con «Próximamente» debajo. */
function TarjetaALaMedida({ onContactar }: { onContactar?: () => void }) {
  const idProximamente = useId();
  return (
    <article className="flex h-full flex-col gap-3 rounded-xl border border-dashed border-border bg-card p-5 text-card-foreground">
      <h3 className="text-base font-semibold">{TEXTOS_PLANES.planALaMedida}</h3>
      <p className="text-sm text-muted-foreground">{TEXTOS_PLANES.planALaMedidaTexto}</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
        {TEXTOS_PLANES.planALaMedidaPuntos.map((p) => (
          <li key={p}>{p}</li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-1">
        <Button
          type="button"
          variant="outline"
          disabled={onContactar === undefined}
          onClick={onContactar}
          aria-describedby={onContactar === undefined ? idProximamente : undefined}
        >
          {TEXTOS_PLANES.contactanos}
        </Button>
        {onContactar === undefined && (
          <p id={idProximamente} className="text-center text-xs text-muted-foreground">
            {TEXTOS_PLANES.proximamente}
          </p>
        )}
      </div>
    </article>
  );
}
