import { describe, it, expect } from "vitest";

import { leerDocumentoAyuda } from "@/lib/ayuda/catalogo";
import { puedeLeerDocumento } from "@/lib/ayuda/documento";
import { CATALOGO_INTEGRACIONES, SERVICIOS_INTEGRACION } from "@/lib/types/integraciones";

// SL-36 · R35 — el enlace «guía paso a paso» de cada formulario de integraciones sale de
// `CATALOGO_INTEGRACIONES[s].guia`. Si esa ruta no tiene documento, el maestro pulsa el enlace
// y recibe un 404: nada más lo detecta, porque el catálogo y la carpeta `docs/ayuda` no se
// importan entre sí. Este test los cruza con el lector REAL del módulo de ayuda
// (`leerDocumentoAyuda`), el mismo que sirve `/ayuda/[...slug]`.
//
// Las rutas se escriben a mano a propósito: si alguien renombra un slug en el catálogo, el
// literal de abajo se pone rojo y obliga a mover también el archivo (y a la inversa).

const GUIAS_ESPERADAS = {
  whatsapp: "/ayuda/oficina/integracion-whatsapp",
  google_maps: "/ayuda/oficina/integracion-google-maps",
  optimizacion_rutas: "/ayuda/oficina/integracion-optimizacion-rutas",
  asistente: "/ayuda/oficina/integracion-asistente",
} as const;

const PREFIJO = "/ayuda/";

describe("R35 — cada guía del catálogo existe en docs/ayuda", () => {
  it("el catálogo enlaza las cuatro guías previstas en el design §8", () => {
    expect(
      Object.fromEntries(SERVICIOS_INTEGRACION.map((s) => [s, CATALOGO_INTEGRACIONES[s].guia])),
    ).toEqual(GUIAS_ESPERADAS);
  });

  it.each(SERVICIOS_INTEGRACION)("cada guía del catálogo existe en docs/ayuda: %s", async (servicio) => {
    const ruta = CATALOGO_INTEGRACIONES[servicio].guia;
    expect(ruta.startsWith(PREFIJO), ruta).toBe(true);

    const doc = await leerDocumentoAyuda(ruta.slice(PREFIJO.length));
    expect(doc, `no hay documento para ${ruta}`).not.toBeNull();

    // El maestro es quien abre el formulario: tiene que poder leer la guía, si no el enlace
    // da 404 aunque el archivo exista.
    expect(puedeLeerDocumento(doc!, "maestro"), ruta).toBe(true);
    expect(doc!.titulo).not.toBe(doc!.slug);

    // Lo que pide R35: dónde entrar, qué copiar y en qué campo pegarlo. Cada campo del
    // formulario se nombra en la guía con la misma etiqueta que en pantalla.
    for (const campo of CATALOGO_INTEGRACIONES[servicio].campos) {
      expect(doc!.cuerpo, `${ruta} no nombra el campo «${campo.etiqueta}»`).toContain(campo.etiqueta);
    }

    // Contrato del README de docs/ayuda: termina en «Lo que esta pantalla NO hace».
    expect(doc!.cuerpo).toMatch(/## Lo que esta pantalla NO hace\n[\s\S]*$/);
    const encabezados = doc!.cuerpo.match(/^## .*$/gm) ?? [];
    expect(encabezados.at(-1)).toBe("## Lo que esta pantalla NO hace");
  });

  it("la guía general de la pantalla existe, es el «?» de la ruta y nombra las cuatro guías", async () => {
    const doc = await leerDocumentoAyuda("oficina/configuracion-integraciones");
    expect(doc).not.toBeNull();
    expect(doc!.rutas).toEqual(["/configuracion/integraciones"]);
    // El renderizador de la ayuda no pinta enlaces Markdown (guardia
    // `ayuda-render-sin-filtracion`): la general nombra cada guía por su título exacto, que es
    // como aparece en el índice de Ayuda.
    for (const servicio of SERVICIOS_INTEGRACION) {
      const guia = await leerDocumentoAyuda(CATALOGO_INTEGRACIONES[servicio].guia.slice(PREFIJO.length));
      expect(doc!.cuerpo).toContain(`**${guia!.titulo}**`);
    }
  });
});
