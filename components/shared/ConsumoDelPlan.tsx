import { Ban, Infinity as InfinityIcon, TriangleAlert, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TEXTOS_TIPO_COBRO, textoDelPeriodo } from "@/components/shared/tipo-cobro";
import {
  lineasDelCosteoPorcentual,
  SIN_LINEAS_DE_CAMBIO,
  textoCambioProgramado,
  TITULO_LINEAS_DE_CAMBIO,
} from "@/lib/planes/mensajes";
import type {
  CobroDelPlan,
  CosteoDelCiclo,
  EstadoFila,
  FilaConsumo,
  PendienteDeEmpresa,
  PlanConConsumo,
  ReinicioDelCiclo,
} from "@/lib/types/consumo-plan";
import { formatearConteo } from "@/lib/planes/consumo";
import type { TipoCobro } from "@/lib/types/planes";
import { cn } from "@/lib/utils";

// SLT-83 (design §6.4; R23, R26): `CosteoDelCiclo` es una unión por `modo`. La rama fija es la de
// SLT-66 sin cambio de texto; la porcentual pinta las líneas de `lineasDelCosteoPorcentual`.
type CosteoFijo = Extract<CosteoDelCiclo, { modo: "fijo" }>;
type CosteoPorcentual = Extract<CosteoDelCiclo, { modo: "porcentual" }>;

/** Textos de la pieza, en un solo sitio para cuando llegue la i18n (design §6.5). */
const TEXTOS = {
  // Decisión del 2026-11-06 (R28): «período» en vez de «ciclo» en los textos; las claves no cambian.
  costoDelCiclo: "Costo del período",
  // SLT-86 (R12, R28; design §7.1): el costo base del período en curso (o de su tramo), con su tipo.
  costoBase: (tipo: TipoCobro, base: CosteoDelCiclo["base"]) =>
    TEXTOS_TIPO_COBRO.costoBase(tipo, base.tipo === "monto" ? base.periodo : null),
  costoPorOrden: (c: string) => `Costo por orden: ${c}`,
  estimado: "Estimado: el costo base no se cobra todavía; cada orden se cobra al crearla y se descuenta si se anula.",
  /** SLT-83 (texto aprobado 2026-11-04): la nota de la rama porcentual, donde la fija pinta `estimado`. */
  notaPorcentual:
    "Cada orden se cobra al llegar a un estado final, con el % de su monto a cobrar (o el mínimo si es mayor).",
  /** Ajuste planes-custom (D9): cómo paga la empresa su plan. Solo informativo (D8). */
  cobro: "Cobro del plan",
  tipoCobro: (tipo: CobroDelPlan["tipo"]) => `${TEXTOS_TIPO_COBRO.campo}: ${TEXTOS_TIPO_COBRO.tipo[tipo]}`,
  siguienteCobro: (fecha: string) => `Siguiente cobro: ${fecha}`,
  /** SLT-86 (R27; design §7.1): el anual se muestra como un pago al inicio y el siguiente. */
  pagoAnual: (fecha: string) => `Pago anual: ${fecha}`,
  siguientePago: (fecha: string) => `Siguiente pago: ${fecha}`,
  /** SLT-86 (R7, R8): el conteo del período, sin tope ni barra. */
  ordenesDelPeriodo: (n: string) => `Órdenes en el período: ${n}`,
  modulos: "Módulos incluidos",
  sinModulos: "Ninguno",
  consumo: "Consumo",
  cerca: "Cerca del tope",
  lleno: "Lleno",
  reinicio: ({ dias, fecha }: ReinicioDelCiclo) =>
    `Se reinicia en ${dias} ${dias === 1 ? "día" : "días"} (${fecha})`,
  cambioPendiente: textoCambioProgramado,
} as const;

export interface ConsumoDelPlanProps {
  /** El plan ya armado en el servidor; `null` = la empresa no tiene plan. */
  readonly plan: PlanConConsumo | null;
  /**
   * Qué decir sin plan. Lo pone cada pantalla porque no se dice igual a la empresa («Tu empresa no
   * tiene plan asignado…») que al superadmin («Sin plan…»).
   */
  readonly textoSinPlan: string;
  /**
   * SLT-86 (R26; decisión del 2026-11-05): sin plan, la primera asignación pendiente. Entonces, en lugar de
   * `textoSinPlan`, «Sin límites» y debajo «{Plan} empieza a regir el {fecha}».
   */
  readonly pendienteSinPlan?: PendienteDeEmpresa | null;
  /** Nivel del título de cada bloque, para encajar bajo el encabezado de quien lo monta. */
  readonly nivelDeTitulo?: 2 | 3;
}

/**
 * La marca va en texto y con icono además de en color (WCAG 1.4.1): `sin_limite` y `normal` no llevan
 * marca. Las barras usan los tonos `-strong` (>= 3:1 sobre la pista `bg-muted` en los dos temas,
 * WCAG 1.4.11), así que la alerta es lo que más pesa a la vista.
 */
const MARCA: Partial<
  Record<EstadoFila, { texto: string; variante: "warning" | "danger"; barra: string; icono: LucideIcon }>
> = {
  cerca: { texto: TEXTOS.cerca, variante: "warning", barra: "bg-warning-strong", icono: TriangleAlert },
  lleno: { texto: TEXTOS.lleno, variante: "danger", barra: "bg-danger-strong", icono: Ban },
};

/**
 * Barra de una fila sana: tono neutro en los dos temas. Nunca el amarillo de marca (`primary`), que
 * DESIGN.md reserva para acción y selección y que en oscuro se confundía con «cerca del tope».
 */
const BARRA_NORMAL = "bg-muted-foreground";

/**
 * SLT-58 (design §6.2; R1–R7, R19) — el plan de una empresa y su consumo, solo lectura. Presentacional
 * y sin directiva de cliente: todo llega por props desde un Server Component, así que lo montan igual
 * «Mi plan» y el detalle de empresa del superadmin.
 */
export function ConsumoDelPlan({
  plan,
  textoSinPlan,
  pendienteSinPlan = null,
  nivelDeTitulo = 2,
}: ConsumoDelPlanProps) {
  // R6: sin plan no hay precio, módulos, filas ni ciclo que mostrar; solo el aviso, como estado vacío.
  if (plan === null) {
    return pendienteSinPlan === null ? (
      <EmptyState icon={InfinityIcon} title={textoSinPlan} />
    ) : (
      <EmptyState
        icon={InfinityIcon}
        title={TEXTOS_TIPO_COBRO.sinLimites}
        description={TEXTOS_TIPO_COBRO.empiezaARegir(pendienteSinPlan)}
      />
    );
  }

  const titulo = { role: "heading", "aria-level": nivelDeTitulo } as const;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle {...titulo} className="text-lg font-semibold">
            {plan.nombre}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {plan.costeo.modo === "fijo" ? (
            <CostoDelCiclo tipo={plan.cobro.tipo} costeo={plan.costeo} />
          ) : (
            <CostoDelCicloPorcentual tipo={plan.cobro.tipo} costeo={plan.costeo} />
          )}
          <CobroDelPlanVista cobro={plan.cobro} />
          <p className="text-sm font-medium">{TEXTOS.modulos}</p>
          {plan.modulos.length === 0 ? (
            <p className="text-sm text-muted-foreground">{TEXTOS.sinModulos}</p>
          ) : (
            <ul aria-label={TEXTOS.modulos} className="flex flex-wrap gap-2">
              {plan.modulos.map((m) => (
                <li key={m.clave} className="rounded-md border border-border bg-muted px-2.5 py-1 text-sm">
                  {m.nombre}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle {...titulo}>{TEXTOS.consumo}</CardTitle>
        </CardHeader>
        <CardContent>
          <ul aria-label={TEXTOS.consumo} className="flex flex-col gap-4">
            {/* SLT-86 (R7, R8, R27): las órdenes del período, sin tope ni barra, y bajo ellas el reinicio:
                es lo único que vuelve a 0 con el período. */}
            <li className="flex flex-col gap-1.5">
              <span className="text-sm">{TEXTOS.ordenesDelPeriodo(formatearConteo(plan.ordenesDelPeriodo))}</span>
              <p className="text-sm text-muted-foreground">{TEXTOS.reinicio(plan.reinicio)}</p>
            </li>
            {plan.filas.map((f) => (
              <FilaDelConsumo key={f.clave} fila={f} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {plan.cambioPendiente && (
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle {...titulo}>{TEXTOS.cambioPendiente(plan.cambioPendiente.vigenteDesde)}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 text-sm">
            {plan.cambioPendiente.lineas.length === 0 ? (
              <p>{SIN_LINEAS_DE_CAMBIO}</p>
            ) : (
              <>
                <p>{TITULO_LINEAS_DE_CAMBIO}</p>
                <ul className="list-disc pl-5">
                  {plan.cambioPendiente.lineas.map((linea) => (
                    <li key={linea}>{linea}</li>
                  ))}
                </ul>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/**
 * SLT-66 (design §6.3; R18–R21, R10). Los importes llegan ya calculados como texto con dos decimales
 * (`costeoDelCiclo`, en el servidor): aquí no se suma ni se convierte nada, para no perder exactitud.
 * La aritmética no se importa en este componente porque lo monta también una pantalla de cliente.
 */
function CostoDelCiclo({ tipo, costeo }: { tipo: TipoCobro; costeo: CosteoFijo }) {
  // SLT-126 (R11): el costo por orden sale del plan o del global y se pinta sin nota en los dos casos.
  return (
    <div className="flex flex-col gap-2 pb-2">
      <p className="text-sm font-medium">{TEXTOS.costoDelCiclo}</p>
      <ul aria-label={TEXTOS.costoDelCiclo} className="flex flex-col gap-1 text-sm">
        <li>{TEXTOS.costoBase(tipo, costeo.base)}</li>
        <li>{TEXTOS.costoPorOrden(costeo.costoPorOrden)}</li>
        {/* SLT-99 (decisión del humano del 2026-11-10): sin «Órdenes del período: n × c = s» ni «Total
            estimado del período». `costeo.ordenes`, `subtotalOrdenes` y `total` siguen llegando del servidor. */}
      </ul>
      <p className="text-xs text-muted-foreground">{TEXTOS.estimado}</p>
    </div>
  );
}

/**
 * SLT-83 (design §4.4, §6.4; R23) — el costo del ciclo con un plan porcentual: costo base, porcentaje y
 * mínimo con su nota, lo cobrado en el ciclo, las órdenes sin estado final (solo el conteo) y el total
 * hasta hoy. Todo llega calculado del servidor y los textos salen de `lib/planes/mensajes.ts`: aquí no se
 * hace aritmética. Con la base por definir no hay total (SLT-66 R20). La nota «Estimado…» del modo fijo
 * no va: dice que cada orden se cobra al crearla, y la porcentual se cobra al llegar a un estado final; en
 * su sitio va `notaPorcentual` (texto aprobado el 2026-11-04).
 */
function CostoDelCicloPorcentual({ tipo, costeo }: { tipo: TipoCobro; costeo: CosteoPorcentual }) {
  const lineas = lineasDelCosteoPorcentual(costeo);
  return (
    <div className="flex flex-col gap-2 pb-2">
      <p className="text-sm font-medium">{TEXTOS.costoDelCiclo}</p>
      <ul aria-label={TEXTOS.costoDelCiclo} className="flex flex-col gap-1 text-sm">
        <li>{TEXTOS.costoBase(tipo, costeo.base)}</li>
        <li className="flex flex-col">
          <span>{lineas.costoPorOrden}</span>
          <span className="text-xs text-muted-foreground">{lineas.nota}</span>
        </li>
        <li>{lineas.cobrado}</li>
        <li>{lineas.pendientes}</li>
        {lineas.total !== null && (
          <li>
            <strong className="font-semibold">{lineas.total}</strong>
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">{TEXTOS.notaPorcentual}</p>
    </div>
  );
}

/**
 * Ajuste planes-custom (D9) y SLT-86 (R5, R27) — el tipo de cobro, el período en curso (marcado si es
 * tramo) y el siguiente cobro; con el anual, el pago del inicio del período y el siguiente. Llegan ya
 * calculados del servidor (`cobroDelPlan`): aquí solo se cuentan los días del tramo para el texto. El
 * costo del período va arriba, en el costo del ciclo.
 */
function CobroDelPlanVista({ cobro }: { cobro: CobroDelPlan }) {
  return (
    <div className="flex flex-col gap-2 pb-2">
      <p className="text-sm font-medium">{TEXTOS.cobro}</p>
      <ul aria-label={TEXTOS.cobro} className="flex flex-col gap-1 text-sm">
        <li>{TEXTOS.tipoCobro(cobro.tipo)}</li>
        <li>{textoDelPeriodo(cobro.tipo, cobro.periodo)}</li>
        {cobro.tipo === "anual" ? (
          <>
            <li>{TEXTOS.pagoAnual(cobro.periodo.desde)}</li>
            <li>{TEXTOS.siguientePago(cobro.siguienteCobro)}</li>
          </>
        ) : (
          <li>{TEXTOS.siguienteCobro(cobro.siguienteCobro)}</li>
        )}
      </ul>
    </div>
  );
}

function FilaDelConsumo({ fila }: { fila: FilaConsumo }) {
  const marca = MARCA[fila.estado];
  const Icono = marca?.icono;
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{fila.texto}</span>
        {marca && Icono && (
          <Badge variant={marca.variante}>
            <Icono aria-hidden="true" data-icon="inline-start" />
            {marca.texto}
          </Badge>
        )}
      </div>
      {fila.maximo !== null && <BarraDelTope fila={fila} maximo={fila.maximo} claseBarra={marca?.barra} />}
    </li>
  );
}

/**
 * `components/ui/` no trae una barra de progreso y no se instala una para esto (design §6.2): un
 * `meter` de ARIA. `aria-valuenow` se acota al máximo porque una empresa puede ir por encima del tope
 * tras una edición del plan; el uso real viaja entero en `aria-valuetext`.
 */
function BarraDelTope({ fila, maximo, claseBarra }: { fila: FilaConsumo; maximo: number; claseBarra?: string }) {
  // Un tope 0 está lleno desde el principio (R4): barra completa, sin dividir por cero.
  const porcentaje = maximo === 0 ? 100 : Math.min(100, Math.floor((fila.usados * 100) / maximo));
  return (
    <div
      role="meter"
      aria-label={fila.etiqueta}
      aria-valuemin={0}
      aria-valuemax={maximo}
      aria-valuenow={Math.min(fila.usados, maximo)}
      aria-valuetext={fila.texto}
      className="h-2 w-full overflow-hidden rounded-full bg-muted"
    >
      <div className={cn("h-full rounded-full", claseBarra ?? BARRA_NORMAL)} style={{ width: `${porcentaje}%` }} />
    </div>
  );
}
