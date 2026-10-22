import { cn } from "@/lib/utils";

/**
 * Primitivas compartidas por las secciones de la landing (`app/page.tsx`).
 *
 * Traducen a utilidades Tailwind + tokens de `globals.css` los estilos que el
 * diseño de origen definía en clases `lp-*`. Los pseudo-elementos del sitio
 * (`.lp-section-mark:before`, `.lp-hero-eyebrow:before`) se materializan aquí
 * como un `<span>` real, para no introducir CSS suelto.
 */

/**
 * Barrita de marca de 22×2 que precede a los rótulos de sección. El color lo pone el rótulo:
 * `bg-brand` es negro en la landing (tema claro fijo), así que sobre una banda oscura sería negro
 * sobre negro y lleva el acento fijo.
 */
function Barra({ color }: Readonly<{ color: "bg-brand" | "bg-brand-light" }>) {
  return (
    <span aria-hidden="true" className={cn("inline-block h-0.5 w-[22px] rounded-sm", color)} />
  );
}

/** Rótulo de sección sobre fondo claro (`.lp-section-mark`). */
export function RotuloSeccion({
  children,
  className,
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <Rotulo className={className} barra="bg-brand">
      {children}
    </Rotulo>
  );
}

function Rotulo({
  children,
  className,
  barra,
}: Readonly<{
  children: React.ReactNode;
  className?: string;
  barra: "bg-brand" | "bg-brand-light";
}>) {
  return (
    <p
      className={cn(
        "mb-3.5 inline-flex items-center gap-2.5 text-xs font-bold tracking-[0.12em] uppercase text-brand-dark",
        className,
      )}
    >
      <Barra color={barra} />
      {children}
    </p>
  );
}

/**
 * Variante del rótulo para las bandas oscuras (`.lp-pol-section .lp-section-mark`). Texto y barra
 * en el acento amarillo fijo: sólo sobre oscuro, nunca sobre el lienzo claro (`docs/marca.md`).
 */
export function RotuloSeccionOscuro({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <Rotulo className="text-brand-light" barra="bg-brand-light">
      {children}
    </Rotulo>
  );
}

/**
 * Título de sección (`.lp-section-title`). El énfasis de marca del sitio va en
 * `<em>` sin cursiva; aquí se expone como `<Enfasis>` para reutilizarlo.
 */
export function TituloSeccion({
  children,
  className,
}: Readonly<{ children: React.ReactNode; className?: string }>) {
  return (
    <h2
      className={cn(
        "mb-4 max-w-[28ch] font-heading text-[clamp(28px,5vw,46px)] leading-[1.08] font-bold tracking-[-0.025em] text-asfalto-9",
        className,
      )}
    >
      {children}
    </h2>
  );
}

/** El `<em>` no-cursivo en color de marca que usan los titulares sobre el lienzo claro. */
export function Enfasis({ children }: Readonly<{ children: React.ReactNode }>) {
  return <em className="text-brand not-italic">{children}</em>;
}

/**
 * El mismo énfasis en los titulares sobre fondo oscuro (héroe, banda, políticas). `text-brand`
 * es negro en la landing y ahí desaparecería; va el acento amarillo fijo, que sólo vale sobre
 * oscuro.
 */
export function EnfasisOscuro({ children }: Readonly<{ children: React.ReactNode }>) {
  return <em className="text-brand-light not-italic">{children}</em>;
}

/** Subtítulo de sección (`.lp-section-sub`). */
export function SubtituloSeccion({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <p className="max-w-[60ch] text-[15px] leading-relaxed text-asfalto-5">{children}</p>
  );
}

/** Contenedor de sección sobre lienzo claro (`.lp-section`). */
export function Seccion({
  id,
  children,
  className,
}: Readonly<{ id?: string; children: React.ReactNode; className?: string }>) {
  return (
    <section
      id={id}
      className={cn(
        "relative mx-auto max-w-[1200px] scroll-mt-16 px-6 py-16 md:px-12 md:py-[88px]",
        className,
      )}
    >
      {children}
    </section>
  );
}
