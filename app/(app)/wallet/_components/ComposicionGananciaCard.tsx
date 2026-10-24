"use client";

import { EMPRESA } from "@/lib/config/marca";
import {
  ArrowRightLeft,
  HandCoins,
  Percent,
  Scale,
  Store,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  CajaResumenDTO,
  ComposicionGananciaDTO,
  DesgloseEgresosDTO,
  WalletBalanceSigno,
  WalletCategoriaIva,
  WalletIngresoGanancia,
} from "@/lib/types/wallet";
import { WALLET_INGRESO_GANANCIA_SEED, WALLET_IVA_SEED } from "@/lib/types/wallet";
import { cn } from "@/lib/utils";

import { DesgloseEgresosLista } from "./DesgloseEgresosLista";
import { FilaComposicion } from "./FilaComposicion";
import type { WalletFiltrosValue } from "./wallet-filtros-input";
import {
  CATEGORIA_LABEL,
  COMPOSICION_IVA_LABEL,
  IMPUESTO_ROTULO,
  money,
} from "./wallet-labels";

// Feature 231 (T6.2, design §4.3) — «Cómo se compone la ganancia de la empresa».
//
// La tarjeta que abre la cifra de la ganancia CONCEPTO POR CONCEPTO: los ingresos propios a un
// lado, los egresos propios al otro y la ganancia resultante en el pie. Es la respuesta a la
// pregunta que la tarjeta de la caja deja abierta —«¿y de dónde sale ese número?»— sin que haya
// que abrir nada ni cambiar de pantalla.
//
// Card HERMANA de la de la caja, nunca anidada (`DESIGN.md`). Por eso la columna de egresos usa
// `DesgloseEgresosLista` —el `<dl>` extraído de la tarjeta «Egresos» de la 45/158— en vez de
// meter aquella tarjeta entera aquí dentro. Esa tarjeta queda ABSORBIDA por ésta (D2, firmada):
// enseñaba los mismos cuatro conceptos y su total, y verlos dos veces en la misma pantalla es
// justo lo que hace dudar de cuál de los dos números es el bueno.
//
// Money-safe (R12): los once importes llegan como STRING del servidor y se pintan TAL CUAL con
// `money`. Aquí no se suma, no se resta y no se convierte a número — ni siquiera para el pie:
// `ganancia` y su signo los manda el servidor ya derivados (R27).
//
// El ORDEN de las dos columnas es el DECLARADO en el código (R28), no el de magnitud: ordenar
// por importe cambiaría el sitio de cada concepto en cada recarga —y obligaría a comparar montos
// en el navegador—. El de ingresos es `WALLET_INGRESO_GANANCIA_SEED`, que es el mismo con el que el
// servidor construye el desglose: una fila nueva del catálogo entra por los dos sitios a la vez.
//
// SL-39 (T5, design §7.2, R7/R8) — el IVA cobrado NO es ganancia. Sale de «Ingresos» (y su reverso, de
// «Egresos») y se pinta en un bloque propio, «IVA cobrado (aparte de la ganancia)», entre las dos
// columnas y el pie: una fila por categoría de `WALLET_IVA_SEED`, cada una se abre como cualquier
// otra, y su total es `composicion.totalIva`, que deriva el servidor. Así el total de «Ingresos» es
// «Ingresos de la empresa», el de «Egresos» es «Gastos de la empresa» y el pie, la ganancia sin IVA.

// --- Textos i18n-ready (separados de la lógica, docs/conventions) ---
const TITULO = `Cómo se compone la ganancia de ${EMPRESA.enFrase}`;

/**
 * R29 (copy heredado de la 158) — qué entra y, sobre todo, qué NO entra. La 158 escribió «no
 * incluye los pagos a tiendas ni a mensajeros» sobre la tarjeta de egresos; en ÉSTA el pago a
 * los mensajeros SÍ entra, por «Otros gastos de la empresa» (consecuencia firmada en D2). Lo que de
 * verdad queda fuera de la ganancia es el dinero de las tiendas, y eso es lo que dice ahora.
 *
 * Y por eso la enumeración NOMBRA el pago a mensajeros. La primera versión de este texto listaba
 * «fletes, comisiones, impuestos, gastos, sueldos e indemnizaciones» y se lo callaba: una lista
 * parcial de lo que entra, con el concepto más grande de los que D2 metió dentro fuera de ella
 * (940 de 3 940,50 en el libro de no-regresión), induce a error sobre dinero. O se nombra todo o
 * no se enumera; se nombra.
 *
 * Ficha 339 (T5.5, R41) — la enumeración gana los AJUSTES, y es la continuación literal de esa
 * misma corrección. Con `egreso_ajuste` e `ingreso_ajuste` teniendo cada uno su fila con nombre,
 * un texto que siguiera callándoselos volvería a ser una lista parcial de lo que entra. R42: lo
 * que queda fuera —el dinero de las tiendas— se dice igual que hasta hoy.
 */
//
// SL-39 (R10, design §7.2): los «impuestos» salen de la enumeración, porque ya no entran en la
// ganancia, y la descripción dice dónde están.
const DESCRIPCION =
  "Ingresos y gastos propios del conjunto filtrado, concepto por concepto: fletes, comisiones, " +
  "gastos, sueldos, indemnizaciones, pagos a mensajeros y ajustes. " +
  `El ${IMPUESTO_ROTULO} cobrado a las tiendas no es ganancia: se muestra aparte. No incluye el ` +
  `dinero de las tiendas: el contra-entrega cobrado no es de ${EMPRESA.enFrase} y por eso no está en la ` +
  "ganancia.";

const INGRESOS_TITULO = "Ingresos";
const EGRESOS_TITULO = "Egresos";
const INGRESOS_GRUPO_ARIA = "Desglose de ingresos";
const INGRESOS_TOTAL_LABEL = "Total de ingresos";
const GANANCIA_LABEL = `Ganancia de ${EMPRESA.enFrase}`;

/**
 * Icono de cada concepto de ingreso. `Record` TOTAL sobre los ingresos que son ganancia: una
 * categoría nueva rompe el build hasta que alguien decida cómo se dibuja. SL-39: las tres de IVA
 * salen de aquí y van al bloque del IVA, con su icono (`IVA_ICONO`).
 */
const INGRESO_ICONO: Record<WalletIngresoGanancia, LucideIcon> = {
  ingreso_flete: Truck,
  ingreso_flete_devolucion: ArrowRightLeft,
  ingreso_comision_cod: HandCoins,
  ingreso_ajuste: Scale,
  // Ficha 461 (design §4, R27): el cobro de la empresa a una tienda, octavo ingreso propio. `Store`
  // —la tienda— porque es lo que lo distingue de los seis cargos del cierre: no nace de una
  // entrega ni de una tarifa, sino de algo que la empresa le cobra a esa tienda a mano. Decoracion
  // (`aria-hidden`); el rotulo «la empresa le cobra a una tienda» ya lo dice.
  ingreso_cobro_tienda: Store,
};

/**
 * SL-39 (design §7.2) — el bloque del IVA. Las cuatro filas comparten icono a propósito: son la misma
 * clase de dinero. El tono es el de su dirección: las tres de ingreso en verde y el reverso en rojo,
 * en positivo como toda fila de egreso. `Record` TOTAL: una categoría de IVA nueva rompe el build.
 */
const IVA_ICONO: LucideIcon = Percent;
const IVA_TONO: Record<WalletCategoriaIva, "ingreso" | "egreso"> = {
  ingreso_iva_flete: "ingreso",
  ingreso_iva_flete_devolucion: "ingreso",
  ingreso_iva_comision_cod: "ingreso",
  egreso_reverso_iva_flete_devolucion: "egreso",
};

/** Insignia del signo de la ganancia. Las mismas variantes semánticas que la tarjeta de la caja. */
const SIGNO_BADGE: Record<
  WalletBalanceSigno,
  { variant: "success" | "danger" | "secondary"; label: string }
> = {
  positivo: { variant: "success", label: "Positivo" },
  negativo: { variant: "danger", label: "Negativo" },
  cero: { variant: "secondary", label: "En cero" },
};

const SIGNO_COLOR: Record<WalletBalanceSigno, string> = {
  positivo: "text-success-strong",
  negativo: "text-danger-strong",
  cero: "text-muted-foreground",
};

/**
 * Rótulo VISIBLE de una de las dos columnas. No es un encabezado del documento: la tarjeta vive
 * dentro de una página cuyo único `h1` es el título, y colgar aquí un `h3` sin `h2` por encima
 * rompería el orden por el que navega un lector de pantalla. El nombre accesible de cada columna
 * lo da el `aria-label` del grupo que envuelve su `<dl>` (458, O5), que dice lo mismo con más palabras.
 */
function TituloColumna({ children }: { children: string }) {
  return <span className="px-4 text-sm font-medium text-foreground">{children}</span>;
}

export interface ComposicionGananciaCardProps {
  /** El desglose de ingresos propios y los totales, ya derivados en el servidor. */
  composicion: ComposicionGananciaDTO;
  /** Los cuatro conceptos de egreso que la 45/158 ya abría. Su forma NO cambia. */
  desglose: DesgloseEgresosDTO;
  /** De aquí salen `ganancia` y `signoGanancia` del pie (R27). */
  resumen: CajaResumenDTO;
  /**
   * Ficha 339 (T5.5/T5.6, R20) — los filtros VIGENTES de la wallet, que bajan hasta el detalle
   * de cada fila. La tarjeta no los lee ni los interpreta: los transporta, para que el
   * desplegable de una fila y el importe de esa fila hablen SIEMPRE del mismo conjunto.
   */
  filtros: WalletFiltrosValue;
}

export function ComposicionGananciaCard({
  composicion,
  desglose,
  resumen,
  filtros,
}: ComposicionGananciaCardProps) {
  const badge = SIGNO_BADGE[resumen.signoGanancia];

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{TITULO}</CardTitle>
        <CardDescription>{DESCRIPCION}</CardDescription>
        <CardAction>
          <span className="inline-flex items-center justify-center rounded-md bg-muted p-2 text-muted-foreground">
            <Wallet className="size-4" aria-hidden="true" />
          </span>
        </CardAction>
      </CardHeader>

      {/* Las dos columnas, apiladas en móvil. `items-start` para que la más corta no se estire
          hasta la altura de la otra y deje su cierre flotando a media tarjeta. */}
      <CardContent className="grid grid-cols-1 items-start gap-6 px-0 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <TituloColumna>{INGRESOS_TITULO}</TituloColumna>
          {/* 458 (O5 del recorrido final) — el `role="group"` va en un envoltorio y NO en la `<dl>`:
              sobre la lista le quitaba su semántica y axe marcaba los `<dt>/<dd>` huérfanos
              («dlitem»). El grupo conserva su nombre accesible; la lista, su estructura. */}
          <div role="group" aria-label={INGRESOS_GRUPO_ARIA}>
            <dl className="flex flex-col gap-0.5">
              {/* Ficha 339 (Q1, decisión cerrada): «cada fila se puede abrir» es CADA fila. Las
                  siete de ingreso también, y por el mismo mecanismo: una asimetría nueva entre
                  las dos columnas sería exactamente el defecto que la 343 vino a cerrar. */}
              {WALLET_INGRESO_GANANCIA_SEED.map((categoria) => (
                <FilaComposicion
                  key={categoria}
                  fila={categoria}
                  // R25: la etiqueta legible que ya existe, nunca el valor del enum.
                  label={CATEGORIA_LABEL[categoria]}
                  valor={composicion.ingresos[categoria]}
                  icono={INGRESO_ICONO[categoria]}
                  tono="ingreso"
                  filtros={filtros}
                />
              ))}

              <div className="mt-3 flex items-center justify-between gap-4 border-t bg-muted/50 px-4 py-3">
                <dt className="text-sm font-medium">{INGRESOS_TOTAL_LABEL}</dt>
                <dd className="text-base font-semibold tabular-nums text-success-strong">
                  {money(composicion.totalIngresos)}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <TituloColumna>{EGRESOS_TITULO}</TituloColumna>
          {/* R26 (231): los cuatro conceptos de siempre MÁS lo que no tiene fila, para que el
              total de esta columna sea exactamente `egresosPropios`.

              Ficha 339 (R1/R2/R7/R8): los pagos a mensajeros y los ajustes dejan de ser «lo que
              no tiene fila» y pasan a tener la suya; «Otros gastos de la empresa» se pinta SOLO si
              el servidor dice que ahí queda dinero. El total no se mueve ni un céntimo: lo que
              cambia es de qué cubeta sale cada importe, no la suma. */}
          <DesgloseEgresosLista
            desglose={desglose}
            egresos={composicion.egresos}
            otrosEgresos={composicion.otrosEgresos}
            hayOtrosEgresos={composicion.hayOtrosEgresos}
            total={composicion.totalEgresos}
            filtros={filtros}
          />
        </div>
      </CardContent>

      {/* SL-39 (R7): el IVA cobrado, a todo el ancho y aparte de las dos columnas. Mismo patrón que
          ellas —título visible, grupo con nombre accesible y `<dl>`— para que se lea igual. */}
      <CardContent className="flex flex-col gap-2 border-t px-0 pt-4" data-bloque="iva">
        <TituloColumna>{COMPOSICION_IVA_LABEL.titulo}</TituloColumna>
        <div role="group" aria-label={COMPOSICION_IVA_LABEL.grupo}>
          <dl className="flex flex-col gap-0.5">
            {WALLET_IVA_SEED.map((categoria) => (
              <FilaComposicion
                key={categoria}
                fila={categoria}
                label={CATEGORIA_LABEL[categoria]}
                valor={composicion.iva[categoria]}
                icono={IVA_ICONO}
                tono={IVA_TONO[categoria]}
                filtros={filtros}
              />
            ))}

            <div className="mt-3 flex items-center justify-between gap-4 border-t bg-muted/50 px-4 py-3">
              <dt className="text-sm font-medium">{COMPOSICION_IVA_LABEL.total}</dt>
              <dd className="text-base font-semibold tabular-nums text-foreground">
                {money(composicion.totalIva)}
              </dd>
            </div>
          </dl>
        </div>
      </CardContent>

      {/* El pie: la resta, con el signo que manda el servidor (R27). */}
      <CardFooter className="flex-wrap justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium">{GANANCIA_LABEL}</span>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <span
          className={cn(
            "text-xl font-semibold tabular-nums",
            SIGNO_COLOR[resumen.signoGanancia],
          )}
        >
          {money(resumen.ganancia)}
        </span>
      </CardFooter>
    </Card>
  );
}
