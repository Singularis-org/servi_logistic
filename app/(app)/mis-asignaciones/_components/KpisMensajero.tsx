import { HandCoins, PackageCheck, Truck, Wallet, type LucideIcon } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import type { MisAsignacionesKpis } from "@/lib/interfaces/services/IMisAsignacionesService";

import { NOMBRE_ESTADO } from "@/lib/types/order-status";

import { KpiValorAnimado } from "./KpiValorAnimado";

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
}

const TILES: Tile[] = [
  {
    label: "Pendientes",
    Icono: Truck,
    render: (k) => <KpiValorAnimado value={k.pendientes} />,
  },
  {
    // FICHA 455 (2026-09-24, R5): el KPI cuenta UN resultado, así que lleva su nombre exacto.
    label: NOMBRE_ESTADO.entregado,
    Icono: PackageCheck,
    render: (k) => <KpiValorAnimado value={k.entregadas} />,
  },
  {
    label: "Por cobrar",
    Icono: HandCoins,
    render: (k) => <KpiValorAnimado value={k.porCobrar} moneda />,
  },
  {
    label: "Total a cobrar",
    Icono: Wallet,
    render: (k) => <KpiValorAnimado value={k.totalACobrar} moneda />,
  },
];

export function KpisMensajero({ kpis }: Readonly<KpisMensajeroProps>) {
  return (
    <section
      aria-label="Indicadores de mis asignaciones"
      className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
    >
      {TILES.map((tile) => (
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
          className="relative overflow-hidden shadow-xl transition-shadow duration-300 hover:shadow-lg before:pointer-events-none before:absolute before:inset-0 before:bg-linear-to-br before:from-brand-soft before:to-white before:opacity-0 before:transition-opacity before:duration-300 before:content-[''] hover:before:opacity-100 dark:before:from-white/10 dark:before:to-transparent"
        >
          <CardContent className="relative flex items-center gap-3 py-4">
            {/* `size-14` conserva el hueco de 56 px del icono anterior: la tarjeta no cambia de alto.
                Fondo y trazo son tokens que giran con el tema (`--accent` / `--accent-foreground`). */}
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground"
            >
              <tile.Icono className="size-7" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-muted-foreground">
                {tile.label}
              </span>
              {/* Feature 208: era `text-navy` fijo. Estos KPIs son DINERO ("Por
                  cobrar", "Total a cobrar") sobre una `Card`, que sí gira con el
                  tema: en oscuro la cifra medía 1.06:1, o sea no se veía. */}
              <span className="text-2xl font-semibold text-foreground">
                {tile.render(kpis)}
              </span>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
