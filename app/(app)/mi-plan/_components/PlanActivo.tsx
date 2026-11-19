import { ListaDeModulos } from "@/components/shared/planes/CarruselDePlanes";
import { TEXTOS_PLANES, usoDeLasFilas, usuariosDelPlan, usuariosEnUso } from "@/components/shared/planes/planes-vista";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatearConteo } from "@/lib/planes/consumo";
import { textoDelCostoPorOrden, textoDelCostoPorOrdenPorcentual } from "@/lib/planes/mensajes";
import type { PlanConConsumo } from "@/lib/types/consumo-plan";
import type { TopesPlan } from "@/lib/types/planes";

// SLT-99 (design §5; R3, R4) — el panel del plan activo en «Mi plan», sobre lo que ya arma `verMiPlan`
// (`PlanConConsumo`): el costo del período en curso, el costo por orden vigente, el período, la renovación, el uso de
// «Usuarios», «API keys» y «Órdenes» (esta sin tope) y los módulos. Server Component: todo llega calculado del servidor.

const TEXTOS = {
  planActivo: "Plan activo",
  porDefinir: "por definir",
  usoDeLaPlataforma: (tipo: string, costo: string) => `${tipo} · ${costo}`,
  periodo: (desde: string, hasta: string) => `${desde} – ${hasta}`,
} as const;

/** R4: «Usuarios» con los mismos topes y usos de las filas del consumo, sumados con la regla de `planes-vista`. */
function usuariosDeLasFilas(plan: PlanConConsumo): { usados: number; maximo: number | null } {
  const porRol: TopesPlan["porRol"] = {};
  for (const f of plan.filas) {
    if (f.clave !== "api_keys" && f.maximo !== null) porRol[f.clave] = f.maximo;
  }
  const uso = usoDeLasFilas(plan.filas, plan.ordenesDelPeriodo);
  return { usados: usuariosEnUso(uso.porRol), maximo: usuariosDelPlan({ porRol, apiKeys: null }) };
}

export function PlanActivo({ plan }: { readonly plan: PlanConConsumo }) {
  const { cobro, costeo } = plan;
  const costo = cobro.costo === null ? TEXTOS.porDefinir : cobro.costo === "0.00" ? TEXTOS_PLANES.sinCuota : cobro.costo;
  const costoPorOrden =
    costeo.modo === "fijo"
      ? textoDelCostoPorOrden(costeo.costoPorOrden)
      : textoDelCostoPorOrdenPorcentual({ porcentaje: costeo.porcentaje, minimo: costeo.minimo });
  const usuarios = usuariosDeLasFilas(plan);
  const apiKeys = plan.filas.find((f) => f.clave === "api_keys");

  return (
    <Card aria-label={TEXTOS.planActivo} role="region">
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle role="heading" aria-level={2} className="text-lg font-semibold">
            {plan.nombre}
          </CardTitle>
          <Badge variant="success">{TEXTOS_PLANES.activo}</Badge>
        </div>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
          <Dato termino={TEXTOS_PLANES.usoDeLaPlataforma} valor={TEXTOS.usoDeLaPlataforma(TEXTOS_TIPO_COBRO.tipo[cobro.tipo], costo)} />
          <Dato termino={TEXTOS_PLANES.costoPorOrden} valor={costoPorOrden} />
          <Dato termino={TEXTOS_PLANES.periodoActual} valor={TEXTOS.periodo(cobro.periodo.desde, cobro.periodo.hasta)} />
          <Dato termino={TEXTOS_PLANES.seRenuevaEl} valor={cobro.siguienteCobro} />
        </dl>
        <ul className="flex flex-col gap-4">
          <BarraDeUso etiqueta={TEXTOS_PLANES.usuarios} usados={usuarios.usados} maximo={usuarios.maximo} />
          <BarraDeUso etiqueta={TEXTOS_PLANES.apiKeys} usados={apiKeys?.usados ?? 0} maximo={apiKeys?.maximo ?? null} />
          {/* Decisión del humano del 2026-11-10: las órdenes del período en curso (`ordenesDelPeriodo`, ya en
              `PlanConConsumo`), sin tope (SLT-86 R8). */}
          <BarraDeUso etiqueta={TEXTOS_PLANES.ordenes} usados={plan.ordenesDelPeriodo} maximo={null} />
        </ul>
        <ListaDeModulos incluidos={plan.modulos.map((m) => m.clave)} />
      </CardContent>
    </Card>
  );
}

function Dato({ termino, valor }: { termino: string; valor: string }) {
  return (
    <>
      <dt className="text-muted-foreground">{termino}</dt>
      <dd className="font-medium">{valor}</dd>
    </>
  );
}

/**
 * R3: el uso con su barra, un `meter` de ARIA como el de `ConsumoDelPlan`. Sin tope no hay barra; por encima del
 * tope la barra se queda llena y el texto da el uso real.
 */
function BarraDeUso({ etiqueta, usados, maximo }: { etiqueta: string; usados: number; maximo: number | null }) {
  const texto =
    maximo === null
      ? TEXTOS_PLANES.usoSinTope(formatearConteo(usados))
      : TEXTOS_PLANES.usoDeTope(formatearConteo(usados), formatearConteo(maximo));
  const porcentaje = maximo === null ? 0 : maximo === 0 ? 100 : Math.min(100, Math.floor((usados * 100) / maximo));
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2 text-sm">
        <span className="text-muted-foreground">{etiqueta}</span>
        <span className="font-medium">{texto}</span>
      </div>
      {maximo !== null && (
        <div
          role="meter"
          aria-label={etiqueta}
          aria-valuemin={0}
          aria-valuemax={maximo}
          aria-valuenow={Math.min(usados, maximo)}
          aria-valuetext={texto}
          className="h-2 w-full overflow-hidden rounded-full bg-muted"
        >
          <div className="h-full rounded-full bg-muted-foreground" style={{ width: `${porcentaje}%` }} />
        </div>
      )}
    </li>
  );
}
