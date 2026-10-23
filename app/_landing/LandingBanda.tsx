import Image from "next/image";

import { EnfasisOscuro } from "./primitivas";

/**
 * Cifra fija de la banda. «1–3» es un RANGO que la plataforma promete, no un conteo: no sale de
 * la base ni de ninguna empresa, así que sobrevive al retiro de los conteos públicos (R43).
 */
const DIAS_DE_ENTREGA = { valor: "1–3", etiqueta: "Días de entrega" } as const;

/**
 * La cifra de la banda. Iba junto a dos conteos de la base, que se retiraron (R43): sin una
 * empresa detrás, sumar los de todas sería publicar su negocio sin sesión. La rejilla de tres
 * columnas se va con ellos para que el rango no quede solo en un tercio con dos huecos al lado.
 */
function BandaCifra() {
  return (
    <dl>
      {/* `dt` antes que `dd` en el DOM, como pide `<dl>`, y el valor arriba en pantalla por el
          `flex-col-reverse`: un lector de pantalla oye la etiqueta y luego el rango. */}
      <div className="flex flex-col-reverse gap-1">
        <dt className="text-xs tracking-[0.04em] text-asfalto-2/70 uppercase">
          {DIAS_DE_ENTREGA.etiqueta}
        </dt>
        <dd className="font-mono text-[28px] font-semibold text-white tabular-nums">
          {DIAS_DE_ENTREGA.valor}
        </dd>
      </div>
    </dl>
  );
}

/**
 * Banda oscura entre servicios y «cómo funciona» (`.lp-imgband`), con la foto de
 * paquetes bajo el degradado navy, igual que el sitio.
 *
 * El degradado va de navy opaco a la izquierda —donde vive el texto— hasta dejar
 * ver la foto a la derecha: es exactamente lo que el sitio muestra en ese borde.
 * Foto decorativa (`alt=""`) y sin `priority`: está por debajo del pliegue y su
 * carga no debe competir con la del hero.
 */
export function LandingBanda() {
  return (
    <section className="relative overflow-hidden bg-navy-deep px-6 py-[72px] text-white md:px-12 md:py-[104px]">
      <Image
        src="/landing/paquetes.jpg"
        alt=""
        fill
        sizes="100vw"
        className="pointer-events-none object-cover"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-navy-deep via-navy-deep/92 to-navy-deep/55"
      />
      <div className="relative mx-auto max-w-[1200px]">
        <p className="mb-3.5 text-xs font-bold tracking-[0.12em] text-brand-light uppercase">
          Operación real de despacho
        </p>
        <h2 className="mb-7 max-w-[22ch] font-heading text-[clamp(26px,4.5vw,42px)] leading-[1.1] font-bold tracking-[-0.025em]">
          De la bodega a la puerta, <EnfasisOscuro>sin perder el rastro</EnfasisOscuro>.
        </h2>
        <BandaCifra />
      </div>
    </section>
  );
}
