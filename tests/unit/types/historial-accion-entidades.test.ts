import { describe, it, expect } from "vitest";

import {
  CLAVE_ENTIDAD,
  ENTIDADES_SIN_ESCRITOR,
  construirFiltrosHistorialAcciones,
} from "@/app/(app)/historico/acciones/_components/historial-acciones-filtros-def";
import { etiquetaDeEntidad } from "@/lib/types/historial-accion-etiquetas";
import {
  ENTIDAD_LABELS,
  HISTORIAL_ACCION_ENTIDADES,
  filtroHistorialAccionSchema,
} from "@/lib/types/historial-accion";

// SLT-43 (R23, design §2.5) — `nodo_geografico` entra en el enum de entidades del historial sin
// cambiar lo que muestra `/historico/acciones`. El enum de la base lo prueba la ida y vuelta de
// SLT-43; aquí, el lado TypeScript: el contrato lo conoce, la pantalla no lo ofrece.

const AHORA = new Date("2026-10-29T15:00:00.000Z");

function opcionesDeEntidad(): string[] {
  const def = construirFiltrosHistorialAcciones([], { ahora: AHORA }).find(
    (f) => f.key === CLAVE_ENTIDAD,
  );
  return (def?.options ?? []).map((o) => o.value);
}

describe("SLT-43 R23 — la entidad nodo_geografico", () => {
  it("el contrato la conoce, con etiqueta legible", () => {
    expect(HISTORIAL_ACCION_ENTIDADES).toContain("nodo_geografico");
    expect(ENTIDAD_LABELS.nodo_geografico).toBe("Nodo geográfico");
    // El borde del listado la acepta: una URL vieja o futura con ese valor no rompe la página.
    expect(
      filtroHistorialAccionSchema.safeParse({ entidadTipo: ["nodo_geografico"] }).success,
    ).toBe(true);
  });

  it("el filtro de /historico/acciones NO la ofrece mientras nada la escribe", () => {
    expect(ENTIDADES_SIN_ESCRITOR).toEqual(["nodo_geografico"]);
    expect(opcionesDeEntidad()).not.toContain("nodo_geografico");
  });

  it("el filtro sigue ofreciendo exactamente las entidades de antes de SLT-43", () => {
    const antes = HISTORIAL_ACCION_ENTIDADES.filter((e) => e !== "nodo_geografico");
    expect(opcionesDeEntidad()).toEqual(antes);
  });

  it("la etiqueta es la cadena de la hoja a la raíz, con el criterio de la 374", () => {
    expect(
      etiquetaDeEntidad("nodo_geografico", { nombres: ["Cabagra", "Buenos Aires", "Puntarenas"] }),
    ).toBe("Cabagra · Buenos Aires · Puntarenas");
    expect(etiquetaDeEntidad("nodo_geografico", { nombres: ["Puntarenas"] })).toBe("Puntarenas");
    // Sin nombres no queda vacía: el respaldo de siempre.
    expect(etiquetaDeEntidad("nodo_geografico", { nombres: [] })).toBe(
      etiquetaDeEntidad("provincia", { nombre: "" }),
    );
  });
});
