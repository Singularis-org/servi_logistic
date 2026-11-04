import { Ban, Infinity as InfinityIcon, TriangleAlert, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SIN_LINEAS_DE_CAMBIO, textoCambioProgramado, TITULO_LINEAS_DE_CAMBIO } from "@/lib/planes/mensajes";
import type {
  CosteoDelCiclo,
  EstadoFila,
  FilaConsumo,
  PlanConConsumo,
  ReinicioDelCiclo,
} from "@/lib/types/consumo-plan";
import { cn } from "@/lib/utils";

/** Textos de la pieza, en un solo sitio para cuando llegue la i18n (design §6.5). */
const TEXTOS = {
  costoDelCiclo: "Costo del ciclo",
  costoBase: (base: CosteoDelCiclo["base"]) =>
    `Costo base: ${base.tipo === "monto" ? `${base.mensual} al mes` : "por definir"}`,
  costoPorOrden: (c: string) => `Costo por orden: ${c}`,
  ordenesDelCiclo: ({ ordenes, costoPorOrden, subtotalOrdenes }: CosteoDelCiclo) =>
    `Órdenes del ciclo: ${ordenes} × ${costoPorOrden} = ${subtotalOrdenes}`,
  total: (t: string) => `Total estimado del ciclo: ${t}`,
  excepcion: "precio acordado para tu empresa",
  anualNoAplica: "El pago anual no cambia el costo por orden.",
  estimado: "Estimado: el costo base no se cobra todavía; cada orden se cobra al crearla y se descuenta si se anula.",
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
  /** Nivel del título de cada bloque, para encajar bajo el encabezado de quien lo monta. */
  readonly nivelDeTitulo?: 2 | 3;
  /**
   * SLT-66 (P1): la nota del costo por orden cuando sale de la excepción de la empresa. La empresa lee
   * «precio acordado para tu empresa» (el valor por defecto); el superadmin, «excepción de la empresa».
   */
  readonly textoExcepcion?: string;
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
  nivelDeTitulo = 2,
  textoExcepcion = TEXTOS.excepcion,
}: ConsumoDelPlanProps) {
  // R6: sin plan no hay precio, módulos, filas ni ciclo que mostrar; solo el aviso, como estado vacío.
  if (plan === null) {
    return <EmptyState icon={InfinityIcon} title={textoSinPlan} />;
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
          <CostoDelCiclo costeo={plan.costeo} textoExcepcion={textoExcepcion} />
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
            {/* El reinicio va bajo la fila de órdenes: es lo único que se reinicia con el ciclo. */}
            {plan.filas.map((f) => (
              <FilaDelConsumo
                key={f.clave}
                fila={f}
                nota={f.clave === "ordenes" ? TEXTOS.reinicio(plan.reinicio) : undefined}
              />
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
function CostoDelCiclo({ costeo, textoExcepcion }: { costeo: CosteoDelCiclo; textoExcepcion: string }) {
  // P1: solo la excepción lleva nota; el plan y el global se pintan con su importe y nada más.
  const nota = costeo.fuente === "empresa" ? textoExcepcion : null;
  return (
    <div className="flex flex-col gap-2 pb-2">
      <p className="text-sm font-medium">{TEXTOS.costoDelCiclo}</p>
      <ul aria-label={TEXTOS.costoDelCiclo} className="flex flex-col gap-1 text-sm">
        <li>{TEXTOS.costoBase(costeo.base)}</li>
        <li className="flex flex-col">
          <span>{TEXTOS.costoPorOrden(costeo.costoPorOrden)}</span>
          {nota && <span className="text-xs text-muted-foreground">{nota}</span>}
          {costeo.anualNoAplicaAlCosto && (
            <span className="text-xs text-muted-foreground">{TEXTOS.anualNoAplica}</span>
          )}
        </li>
        <li>{TEXTOS.ordenesDelCiclo(costeo)}</li>
        {/* R20: con la base por definir no hay total; sumar solo las órdenes daría una cifra engañosa. */}
        {costeo.total !== null && (
          <li>
            <strong className="font-semibold">{TEXTOS.total(costeo.total)}</strong>
          </li>
        )}
      </ul>
      <p className="text-xs text-muted-foreground">{TEXTOS.estimado}</p>
    </div>
  );
}

function FilaDelConsumo({ fila, nota }: { fila: FilaConsumo; nota?: string }) {
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
      {nota && <p className="text-sm text-muted-foreground">{nota}</p>}
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
