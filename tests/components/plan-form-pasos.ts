// SLT-130 (design §10) — navegación del formulario de planes por pasos para los tests de componentes.
// `avanzarHasta` pulsa «Siguiente» hasta que el paso actual es el pedido y falla con un mensaje claro si no
// llega (un error de validación que no deja avanzar, o un paso que no existe en este modo). `terminar`
// avanza hasta el último paso y pulsa el botón final.
import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

import { TEXTOS_PLAN_FORM } from "@/app/(app)/plataforma/planes/_components/plan-form/textos";
import { TEXTOS_FORMULARIO_POR_PASOS } from "@/components/shared/FormularioPorPasos";

/** Tope de vueltas: el formulario tiene a lo sumo 7 pasos. */
const MAX_PASOS = 10;

/** El título del paso actual: el botón de la lista con `aria-current="step"`. */
export function tituloDelPasoActual(): string {
  const nav = screen.getByRole("navigation", { name: TEXTOS_FORMULARIO_POR_PASOS.navegacion });
  return within(nav).getByRole("button", { current: "step" }).textContent?.replace(/^\d+/, "").trim() ?? "";
}

/** Lo que explica por qué «Siguiente» no avanzó: los campos marcados y los avisos en pantalla. */
function motivoDeNoAvanzar(): string {
  const invalidos = Array.from(document.querySelectorAll<HTMLElement>('[aria-invalid="true"]')).map(
    (el) => el.getAttribute("aria-label") ?? el.getAttribute("name") ?? el.id,
  );
  const avisos = screen.queryAllByRole("alert").map((el) => el.textContent?.trim() ?? "");
  const mensajes = Array.from(document.querySelectorAll<HTMLElement>('[data-slot="field-error"], [id$="-error"]')).map(
    (el) => el.textContent?.trim() ?? "",
  );
  return `campos inválidos: [${invalidos.join(", ")}]; avisos: [${[...avisos, ...mensajes].filter(Boolean).join(" | ")}]`;
}

/** Pulsa «Siguiente» hasta que el paso actual se titula `titulo`. */
export async function avanzarHasta(user: UserEvent, titulo: string): Promise<void> {
  for (let i = 0; i < MAX_PASOS; i++) {
    const actual = tituloDelPasoActual();
    if (actual === titulo) return;
    const siguiente = screen.queryByRole("button", { name: TEXTOS_PLAN_FORM.siguiente });
    if (siguiente === null) {
      throw new Error(`avanzarHasta: no hay paso «${titulo}»; el formulario terminó en «${actual}».`);
    }
    await user.click(siguiente);
    if (tituloDelPasoActual() === actual) {
      throw new Error(`avanzarHasta: «Siguiente» no avanzó desde «${actual}» hacia «${titulo}»; ${motivoDeNoAvanzar()}.`);
    }
  }
  throw new Error(`avanzarHasta: no se llegó a «${titulo}» tras ${MAX_PASOS} pasos.`);
}

/** Avanza hasta el último paso y pulsa el botón final («Crear plan», «Guardar» o «Programar cambio»). */
export async function terminar(user: UserEvent): Promise<void> {
  for (let i = 0; i < MAX_PASOS; i++) {
    const siguiente = screen.queryByRole("button", { name: TEXTOS_PLAN_FORM.siguiente });
    if (siguiente === null) break;
    const actual = tituloDelPasoActual();
    await user.click(siguiente);
    if (tituloDelPasoActual() === actual) {
      throw new Error(`terminar: «Siguiente» no avanzó desde «${actual}»; ${motivoDeNoAvanzar()}.`);
    }
  }
  const final = screen.getByRole("button", {
    name: new RegExp(`^(${[TEXTOS_PLAN_FORM.crear, TEXTOS_PLAN_FORM.guardar, TEXTOS_PLAN_FORM.programar].join("|")})$`),
  });
  await user.click(final);
}
