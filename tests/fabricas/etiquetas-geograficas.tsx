import type { ReactNode } from "react";

import { EtiquetasGeograficasProvider } from "@/providers/EtiquetasGeograficasProvider";
import { etiquetasDePais, type EtiquetasGeograficas } from "@/lib/types/pais";

// SL-20 (design §7; R19) — los nombres de nivel para los tests de componentes.
//
// `ETIQUETAS_CR` son las de la fila `CR` que siembra `db/migrations/20261026120000_pais/migration.sql`:
// los tests de pantallas que ya existían afirman «Provincia», «Cantón» y «Distrito», que son las de
// Costa Rica, y ahora esos nombres llegan del país de la empresa. Sin proveedor, el hook da las neutras
// («Nivel 1»…), así que un test que pinte la pantalla sin envolverla no las verá.
//
// `ETIQUETAS_XA` son las de un país de prueba con nombres distintos de los de Costa Rica, para que un
// test de etiquetas no pase por casualidad.

export const ETIQUETAS_CR: EtiquetasGeograficas = etiquetasDePais({
  nivel1Singular: "Provincia",
  nivel1Plural: "Provincias",
  nivel2Singular: "Cantón",
  nivel2Plural: "Cantones",
  nivel3Singular: "Distrito",
  nivel3Plural: "Distritos",
});

export const ETIQUETAS_XA: EtiquetasGeograficas = etiquetasDePais({
  nivel1Singular: "Departamento",
  nivel1Plural: "Departamentos",
  nivel2Singular: "Municipio",
  nivel2Plural: "Municipios",
  nivel3Singular: "Aldea",
  nivel3Plural: "Aldeas",
});

/** `wrapper` de `render` con las etiquetas de Costa Rica. */
export function ConEtiquetasCR({ children }: Readonly<{ children: ReactNode }>) {
  return <EtiquetasGeograficasProvider etiquetas={ETIQUETAS_CR}>{children}</EtiquetasGeograficasProvider>;
}
