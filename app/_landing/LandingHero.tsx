import Image from "next/image";

import { EnfasisOscuro } from "./primitivas";

/**
 * Hero de la landing (`.lp-hero`): rótulo, titular y subtítulo, sobre la foto de
 * bodega que el sitio pinta de fondo bajo un degradado navy.
 *
 * Sin cifras (R43): la landing es de la plataforma y no hay una empresa a la que
 * atribuirle un conteo, y sumar las de todas sería publicar el negocio de cada una
 * sin sesión. Se quita la rejilla entera en vez de dejarla con números fijos,
 * porque esos ya se retiraron una vez por inventados.
 *
 * La foto es DECORATIVA (`alt=""`): todo lo que comunica ya está en el titular y
 * el subtítulo, así que anunciarla en un lector de pantalla solo añadiría ruido.
 * El `bg-navy-deep` de la sección es el color de respaldo mientras carga o si
 * nunca llega.
 *
 * `priority` porque es el LCP de la página: diferirla dejaría el hero en navy
 * sólido durante la primera pintada.
 */
export function LandingHero() {
  return (
    <section className="relative overflow-hidden bg-navy-deep py-7 lg:py-24">
      <Image
        src="/landing/hero-bodega.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        className="pointer-events-none object-cover"
      />
      {/*
        Dos capas sobre la foto, en este orden: el degradado navy que la apaga lo
        suficiente para que el texto blanco conserve contraste AA, y encima el halo
        amarillo radial que ya usaban las páginas públicas de la app.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-navy-deep via-navy-deep/90 to-navy-deep/70"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_15%,rgba(255,208,0,0.16),transparent_55%)]"
      />

      <div className="relative mx-auto grid max-w-[1180px] items-center gap-9 px-6 md:px-10 lg:gap-14 lg:px-12">
        {/* Rótulo, titular y subtítulo */}
        <div className="min-w-0 text-white">
          <p className="mb-4 inline-flex items-center gap-2.5 text-xs font-bold tracking-[0.12em] text-brand-light uppercase">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-[22px] rounded-sm bg-brand-light"
            />
            Plataforma de despacho
          </p>

          <h1 className="mb-5 font-heading text-[clamp(30px,8vw,64px)] leading-[1.02] font-bold tracking-[-0.035em] text-white">
            Envíos <EnfasisOscuro>rápidos</EnfasisOscuro> y confiables en Costa Rica.
          </h1>

          <p className="max-w-[46ch] text-base leading-relaxed text-asfalto-2/90">
            Cubrimos el Gran Área Metropolitana con trazabilidad en tiempo real, fletes
            transparentes y entrega garantizada. Expandiéndonos pronto a todo el país.
          </p>
        </div>

      </div>
    </section>
  );
}
