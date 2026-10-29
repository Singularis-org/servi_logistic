import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SIN_LINEAS_DE_CAMBIO, TITULO_LINEAS_DE_CAMBIO } from "@/lib/planes/mensajes";
import type { EstadoFila, FilaConsumo, PlanConConsumo, ReinicioDelCiclo } from "@/lib/types/consumo-plan";
import { cn } from "@/lib/utils";

/** Textos de la pieza, en un solo sitio para cuando llegue la i18n (design §6.5). */
const TEXTOS = {
  precio: "Precio informativo",
  modulos: "Módulos incluidos",
  sinModulos: "Ninguno",
  consumo: "Consumo",
  cerca: "Cerca del tope",
  lleno: "Lleno",
  reinicio: ({ dias, fecha }: ReinicioDelCiclo) =>
    `Se reinicia en ${dias} ${dias === 1 ? "día" : "días"} (${fecha})`,
  cambioPendiente: (fecha: string) => `Cambio programado desde ${fecha}`,
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
}

/** La marca va en texto además de en color (WCAG 1.4.1): `sin_limite` y `normal` no llevan marca. */
const MARCA: Partial<Record<EstadoFila, { texto: string; variante: "warning" | "danger"; barra: string }>> = {
  cerca: { texto: TEXTOS.cerca, variante: "warning", barra: "bg-warning" },
  lleno: { texto: TEXTOS.lleno, variante: "danger", barra: "bg-danger" },
};

/**
 * SLT-58 (design §6.2; R1–R7, R19) — el plan de una empresa y su consumo, solo lectura. Presentacional
 * y sin directiva de cliente: todo llega por props desde un Server Component, así que lo montan igual
 * «Mi plan» y el detalle de empresa del superadmin.
 */
export function ConsumoDelPlan({ plan, textoSinPlan, nivelDeTitulo = 2 }: ConsumoDelPlanProps) {
  // R6: sin plan no hay precio, módulos, filas ni ciclo que mostrar; solo el aviso.
  if (plan === null) {
    return <p className="text-sm text-muted-foreground">{textoSinPlan}</p>;
  }

  const titulo = { role: "heading", "aria-level": nivelDeTitulo } as const;

  return (
    <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle {...titulo} className="text-lg font-semibold">
            {plan.nombre}
          </CardTitle>
          <CardDescription>
            {TEXTOS.precio}: <span className="text-foreground">{plan.precioTexto}</span>
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
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
          <CardDescription>{TEXTOS.reinicio(plan.reinicio)}</CardDescription>
        </CardHeader>
        <CardContent>
          <ul aria-label={TEXTOS.consumo} className="flex flex-col gap-4">
            {plan.filas.map((f) => (
              <FilaDelConsumo key={f.clave} fila={f} />
            ))}
          </ul>
        </CardContent>
      </Card>

      {plan.cambioPendiente && (
        <Card className="md:col-span-2">
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

function FilaDelConsumo({ fila }: { fila: FilaConsumo }) {
  const marca = MARCA[fila.estado];
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm">{fila.texto}</span>
        {marca && <Badge variant={marca.variante}>{marca.texto}</Badge>}
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
      <div className={cn("h-full rounded-full", claseBarra ?? "bg-primary")} style={{ width: `${porcentaje}%` }} />
    </div>
  );
}
