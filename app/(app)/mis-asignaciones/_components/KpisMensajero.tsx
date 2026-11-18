import { HandCoins, PackageCheck, Truck, Wallet, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { MisAsignacionesKpis } from "@/lib/interfaces/services/IMisAsignacionesService";

import { NOMBRE_ESTADO } from "@/lib/types/order-status";
import { formatMonto, monedaConfig } from "@/lib/config/moneda";

import { KpiValorAnimado } from "./KpiValorAnimado";

import { COLUMNA_FIJA } from "@/components/shared/texto-entero";
import { cn } from "@/lib/utils";

/**
 * SLT-163 (R492, R501, R502): la cifra de un KPI. Un importe no se parte en líneas: va en columna fija
 * (`COLUMNA_FIJA`, una sola línea). Desde `md`, 24 px como siempre. Lo que puede saltar de línea es
 * el rótulo, no el número.
 *
 * SLT-200: en el móvil la cifra vuelve a los 20 px del canvas (D8); SLT-163 la había bajado a 14 px.
 * Medido con Archivo 600 a 20 px: «₡12.345.678» ocupa 119 px y la tarjeta de 360 px deja 126 de
 * contenido. Solo una cifra de más de 11 caracteres (nueve dígitos o con decimales) se achica, por
 * escalones y nunca por debajo de 14 px.
 */
export const CIFRA_KPI = `${COLUMNA_FIJA} md:text-2xl`;

/** Tamaño de la cifra en el móvil según su largo (ver `CIFRA_KPI`). */
export function tamanoCifraKpi(texto: string): string {
  if (texto.length <= 11) return "text-xl";
  if (texto.length === 12) return "text-lg";
  if (texto.length <= 14) return "text-base";
  return "text-sm";
}

/**
 * SLT-200 (canvas D8): caracteres que caben a 20 px AL LADO del icono en el móvil. A 360 px quedan
 * ~82 px junto al icono de 36 px; «₡99.999» (7) mide 78. Con más, la cifra baja a la fila de abajo, a
 * todo el ancho.
 */
export const MAX_CARACTERES_AL_LADO = 7;

const FORMATO_CONTEO = new Intl.NumberFormat(monedaConfig.locale, {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

// Feature 61 — fila de KPIs del portal del mensajero, sobre la lista de sus
// asignaciones. Los 3 indicadores vienen ya calculados server-side (autoritativos):
// `pendientes` = órdenes en reparto (en camino), `entregadas` = entregadas del
// mensajero, `porCobrar` = COD por recaudar de las órdenes en reparto. Componente
// de presentación puro (server-compatible), sin lógica ni fetch.

export interface KpisMensajeroProps {
  kpis: MisAsignacionesKpis;
}

interface Tile {
  label: string;
  /**
   * Icono de línea de `lucide-react`, no un PNG: hereda el color del círculo por `currentColor`,
   * así que gira con el tema sin una segunda versión del dibujo.
   */
  Icono: LucideIcon;
  render: (kpis: MisAsignacionesKpis) => React.ReactNode;
  /**
   * SLT-200: el texto FINAL de la cifra, el mismo que pinta el contador al aterrizar. Decide el
   * tamaño y si cabe al lado del icono con el valor final, no con el de cada fotograma: así la
   * tarjeta no salta de disposición mientras la cifra cuenta.
   */
  texto: (kpis: MisAsignacionesKpis) => string;
}

const TILES: Tile[] = [
  {
    label: "Pendientes",
    Icono: Truck,
    render: (k) => <KpiValorAnimado value={k.pendientes} />,
    texto: (k) => FORMATO_CONTEO.format(k.pendientes),
  },
  {
    // FICHA 455 (2026-09-24, R5): el KPI cuenta UN resultado, así que lleva su nombre exacto.
    label: NOMBRE_ESTADO.entregado,
    Icono: PackageCheck,
    render: (k) => <KpiValorAnimado value={k.entregadas} />,
    texto: (k) => FORMATO_CONTEO.format(k.entregadas),
  },
  {
    label: "Por cobrar",
    Icono: HandCoins,
    render: (k) => <KpiValorAnimado value={k.porCobrar} moneda />,
    texto: (k) => formatMonto(k.porCobrar),
  },
  {
    label: "Total a cobrar",
    Icono: Wallet,
    render: (k) => <KpiValorAnimado value={k.totalACobrar} moneda />,
    texto: (k) => formatMonto(k.totalACobrar),
  },
];

/** Columnas de la rejilla en el móvil (R502: 2 × 2). Las tarjetas de una fila deciden juntas. */
const COLUMNAS_MOVIL = 2;

/**
 * SLT-200: por tarjeta, si su cifra va al lado del icono en el móvil. Lo deciden las dos tarjetas de
 * cada fila juntas: si una no cabe, las dos bajan la cifra, y sus cifras quedan a la misma altura.
 */
function alLadoPorTarjeta(textos: string[]): boolean[] {
  return textos.map((_, i) => {
    const inicio = i - (i % COLUMNAS_MOVIL);
    const fila = textos.slice(inicio, inicio + COLUMNAS_MOVIL);
    return fila.every((t) => t.length <= MAX_CARACTERES_AL_LADO);
  });
}

export function KpisMensajero({ kpis }: Readonly<KpisMensajeroProps>) {
  const textos = TILES.map((tile) => tile.texto(kpis));
  const alLado = alLadoPorTarjeta(textos);
  return (
    <section
      aria-label="Indicadores de mis asignaciones"
      // SLT-156 (R502): 2 × 2 desde el teléfono; en una columna los cuatro KPI empujaban la
      // lista fuera de la primera pantalla. 12 px entre tarjetas en el móvil (canvas v35).
      className="grid grid-cols-2 gap-3 md:gap-6 lg:grid-cols-4"
    >
      {TILES.map((tile, i) => (
        <Card
          key={tile.label}
          // Sombra permanente + degradado amarillo pálido de la marca (`brand-soft`) → blanco al
          // pasar el cursor. background-image no interpola, así que el degradado vive siempre en
          // un ::before y lo que se anima es su opacidad. `brand-soft` es un tono FIJO, el mismo
          // en los dos temas: en claro el rótulo (`text-muted-foreground`) y la cifra
          // (`text-foreground`) quedan por encima de 4.5:1 sobre él.
          //
          // El tema oscuro NO cambia, y es a propósito. `brand-soft` y `white` son dos colores
          // CLAROS a opacidad 100: si llegaran al oscuro, la lámina taparía el texto —que ahí es
          // claro— y la tarjeta se volvería ilegible al pasar por encima. Es el defecto que la
          // feature 208 ya arregló para el tono anterior, y por eso `dark:before:from-white/10
          // dark:before:to-transparent` pisa el degradado claro: blanco al 10% desvaneciéndose,
          // que sobre la tarjeta compone un reflejo sin blanquear el fondo y deja el
          // `text-foreground` legible. La metáfora —un reflejo que cruza la tarjeta— es la misma.
          className="relative shadow-xl transition-shadow duration-300 hover:shadow-lg before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-br before:from-brand-soft before:to-white before:opacity-0 before:transition-opacity before:duration-300 before:content-[''] hover:before:opacity-100 dark:before:from-white/10 dark:before:to-transparent"
        >
          {/* SLT-156 (R502, canvas v35): UNA rejilla para los dos anchos. SLT-200 (canvas D8): en
              el teléfono el icono abarca las dos filas y la cifra va a su derecha, bajo el rótulo,
              si cabe (`alLado`). Si no —un importe de ocho cifras—, el icono y el rótulo comparten
              la primera fila y la cifra ocupa sola la segunda, a todo el ancho. Desde `md`, el icono
              abarca las dos filas siempre. */}
          <CardContent
            data-disposicion={alLado[i] ? "al-lado" : "apilada"}
            className="relative grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1 py-4 max-md:px-3 md:gap-x-3"
          >
            {/* `size-14` conserva el hueco de 56 px del icono anterior: la tarjeta no cambia de alto.
                Fondo y trazo son tokens que giran con el tema (`--accent` / `--accent-foreground`). */}
            <span
              aria-hidden="true"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground md:row-span-2 md:size-14",
                alLado[i] && "row-span-2",
              )}
            >
              <tile.Icono className="size-5 md:size-7" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <span
              className={cn(
                "min-w-0 text-xs font-medium text-muted-foreground",
                alLado[i] ? "self-end" : "self-center md:self-end",
              )}
            >
              {tile.label}
            </span>
            {/* Feature 208: era `text-navy` fijo. Estos KPIs son DINERO ("Por
                cobrar", "Total a cobrar") sobre una `Card`, que sí gira con el
                tema: en oscuro la cifra medía 1.06:1, o sea no se veía. */}
            <span
              data-kpi-cifra=""
              className={cn(
                CIFRA_KPI,
                tamanoCifraKpi(textos[i]!),
                "self-start font-semibold text-foreground",
                alLado[i] ? "col-start-2" : "col-span-2 md:col-span-1 md:col-start-2",
              )}
            >
              {tile.render(kpis)}
            </span>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
