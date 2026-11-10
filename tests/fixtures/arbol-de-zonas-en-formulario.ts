import { expect } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import type userEvent from "@testing-library/user-event";

import type { ArbolDeZonasDTO, NodoDeZonasDTO, ProvinciaArbolDTO } from "@/lib/types/geografia-nodo";

/**
 * SLT-89 (T7.2) — LA NUEVA ENTRADA DEL FORMULARIO DE ZONA, PARA LOS TESTS QUE YA LO MONTABAN.
 *
 * El formulario pasó a recibir el árbol de zonas de N niveles (`ArbolDeZonasDTO`, design §4.2) y a
 * guardar a través de un modal único (design §8.2). Los tests de componente que existían antes de
 * SLT-89 se adaptan SOLO en su entrada y en cómo llegan al botón (autorizado en tasks T7.2); lo que
 * afirman no cambia. Este ayudante mantiene sus fixtures de 3 niveles tal cual y los convierte.
 */

/** Los nombres de nivel con los que se convierten los fixtures de 3 niveles. */
export const TIPOS_DE_PRUEBA: ArbolDeZonasDTO["tipos"] = [
  { profundidad: 1, nombreSingular: "Provincia", nombrePlural: "Provincias" },
  { profundidad: 2, nombreSingular: "Cantón", nombrePlural: "Cantones" },
  { profundidad: 3, nombreSingular: "Distrito", nombrePlural: "Distritos" },
];

/**
 * El árbol de 3 niveles de antes, como árbol de zonas: la asignación directa de un distrito es su
 * única zona (con más de una, la primera: el índice único de SLT-75 ya no permite dos).
 */
export function arbolDeZonas(provincias: readonly ProvinciaArbolDTO[]): ArbolDeZonasDTO {
  const hoja = (d: ProvinciaArbolDTO["cantones"][number]["distritos"][number]): NodoDeZonasDTO => ({
    id: d.id,
    nombre: d.nombre,
    profundidad: 3,
    activo: d.activo,
    asignadaA: d.zonas[0] ?? null,
    heredaDe: null,
    hijos: [],
  });
  return {
    tipos: TIPOS_DE_PRUEBA,
    raices: provincias.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      profundidad: 1,
      activo: p.activo,
      asignadaA: null,
      heredaDe: null,
      hijos: p.cantones.map((c) => ({
        id: c.id,
        nombre: c.nombre,
        profundidad: 2,
        activo: c.activo,
        asignadaA: null,
        heredaDe: null,
        hijos: c.distritos.map(hoja),
      })),
    })),
  };
}

/** El botón que abre el modal de guardado (maqueta: «Guardar zona…»). */
export const botonGuardarZona = () => screen.getByRole("button", { name: "Guardar zona…" });

/** El botón de confirmar del modal único (maqueta: «Sí, guardar»). */
export const botonConfirmarGuardado = () => screen.getByRole("button", { name: "Sí, guardar" });

/**
 * Guardar como antes, ahora en dos pasos: abre el modal, espera a que «Sí, guardar» se habilite (las
 * cifras de R13 o el impacto de la marca central) y confirma.
 */
export async function guardarYConfirmar(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(botonGuardarZona());
  await waitFor(() => expect(botonConfirmarGuardado()).toBeEnabled());
  await user.click(botonConfirmarGuardado());
}

/** Lo que devuelve un aviso de impacto sin órdenes afectadas (los tests de antes no miden cifras). */
export const IMPACTO_VACIO = {
  status: "ok" as const,
  impacto: {
    cambianDeZona: 0,
    cambianDeTarifa: 0,
    noSeMueven: { enBodegaSatelite: 0, conGestionFinal: 0, enCierre: 0 },
  },
};
