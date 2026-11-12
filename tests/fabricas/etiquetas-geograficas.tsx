import type { ReactNode } from "react";

import { EtiquetasGeograficasProvider } from "@/providers/EtiquetasGeograficasProvider";
import { etiquetasDePais, type EtiquetasGeograficas } from "@/lib/types/pais";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";

// SL-20 (design §7; R19) — los nombres de nivel para los tests de componentes.
//
// `ETIQUETAS_CR` son las de la fila `CR` que siembra `db/migrations/20261026130000_pais/migration.sql`:
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

/**
 * SLT-47 (design §5.4) — los niveles del país para los tests de mis-asignaciones y novedades, que los
 * leen con `useNivelesGeograficos()`. Los de Costa Rica son los tipos que siembra SLT-44 con los mismos
 * nombres que `ETIQUETAS_CR`.
 */
export const NIVELES_CR: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Provincia", plural: "Provincias" },
  { profundidad: 2, singular: "Cantón", plural: "Cantones" },
  { profundidad: 3, singular: "Distrito", plural: "Distritos" },
];

/** Un país de prueba de 4 niveles, con nombres distintos de los de Costa Rica. */
export const NIVELES_XA: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Región", plural: "Regiones" },
  { profundidad: 2, singular: "Provincia", plural: "Provincias" },
  { profundidad: 3, singular: "Comuna", plural: "Comunas" },
  { profundidad: 4, singular: "Barrio", plural: "Barrios" },
];

/**
 * SLT-47 (tanda 2; R1) — los niveles del país de prueba de `ETIQUETAS_XA`, con sus mismos nombres: las
 * barras rotulan sus listas de lugar solo con los niveles del país, no con las etiquetas.
 */
export const NIVELES_XA_3: NivelDeFiltroDTO[] = [
  { profundidad: 1, singular: "Departamento", plural: "Departamentos" },
  { profundidad: 2, singular: "Municipio", plural: "Municipios" },
  { profundidad: 3, singular: "Aldea", plural: "Aldeas" },
];
