// SLT-130 (design §10) — navegación del formulario de planes por pasos para los tests de componentes.
// `avanzarHasta` pulsa el botón del pie hasta que el paso actual es el pedido y falla con un mensaje claro si no
// llega (un error de validación que no deja avanzar, o un paso que no existe en este modo). `terminar`
// avanza hasta el último paso y pulsa el botón final.
//
// SLT-144 «Planes: formulario por pasos conectado al borrador y a la fecha de cada empresa» (design §11): el
// botón del pie es «Guardar y continuar», que guarda el paso en el borrador antes de avanzar, y el botón final
// confirma el borrador. `accionesFalsas(enviar)` son las cuatro actions del borrador con un borrador en memoria:
// guardan cada paso con su esquema (como el servidor) y, al confirmar, arman la petición de crear o editar de
// hoy con `peticionDeCrear` / `peticionDeEditar` y se la pasan a `enviar`, el doble de la action de hoy. Así los
// tests de SLT-58 a SLT-130 siguen midiendo la MISMA petición sobre su `enviar`.
import { screen, waitFor, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";
import { expect, vi, type Mock } from "vitest";

import type { AccionesDelBorrador, PlanFormProps } from "@/app/(app)/plataforma/planes/_components/PlanForm";
import type { PeticionDeGuardarPaso } from "@/app/(app)/plataforma/planes/_components/plan-form/usar-borrador";
import { TEXTOS_PLAN_FORM } from "@/app/(app)/plataforma/planes/_components/plan-form/textos";
import { TEXTOS_FORMULARIO_POR_PASOS } from "@/components/shared/FormularioPorPasos";
import { pasosQueFaltan, peticionDeCrear, peticionDeEditar } from "@/lib/planes/borrador";
import {
  ESQUEMAS_DE_CREAR,
  ESQUEMAS_DE_EDITAR,
  PASOS_DE_EDITAR,
  type IdPasoBorrador,
  type PasosDeCrear,
  type PasosDeEditar,
  type ValoresDelPaso,
} from "@/lib/types/plan-borrador";
import type { CrearPlanInput, EditarPlanInput, PlanResult, VistaPreviaCambioResult } from "@/lib/types/planes";

/**
 * Tope de vueltas: el formulario tiene a lo sumo 9 pasos. SLT-214 «Planes: beneficios de texto con ícono» (R7) añadió
 * «Beneficios» tras «Módulos». `accionesFalsas` lo guarda con su esquema como los demás, y `avanzarHasta` y
 * `terminar` pasan por él con la lista vacía, que es válida (R9): los tests que no lo tocan confirman sin beneficios.
 * SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (R7) añadió «Niveles» tras «Beneficios», igual: al
 * crear pasan por él con la lista vacía (R9) y al editar con los niveles del plan (R13).
 */
const MAX_PASOS = 10;

/** El id del borrador que abre el primer guardado. */
export const BORRADOR_FALSO = "1a2b3c4d-9999-4e5f-8a9b-0c1d2e3f4a5b";
const GUARDADO_AT = "2026-11-17T15:30:00.000Z";

// ── Las actions del borrador ─────────────────────────────────────────────────────────────────────────

/** La action de hoy que recibe la petición confirmada (la que llega a `PlanesService.crear` o `.editar`). */
export type Enviar = (input: never) => Promise<PlanResult>;

type Memoria = {
  modo: "crear" | "editar" | null;
  planId: string | null;
  pasos: Partial<Record<IdPasoBorrador, ValoresDelPaso>>;
};

/** Las cuatro actions como dobles de vitest, con el borrador en memoria para `peticionConfirmada`. */
export type AccionesFalsas = { [K in keyof AccionesDelBorrador]: Mock<AccionesDelBorrador[K]> } & {
  readonly memoria: Memoria;
};

/** Los errores de un esquema de paso con la clave de su campo, como los devuelve el servidor. */
function fieldErrorsDe(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Record<string, string[]> {
  const errores: Record<string, string[]> = {};
  for (const issue of issues) {
    const clave = issue.path.map(String).join(".");
    (errores[clave] ??= []).push(issue.message);
  }
  return errores;
}

function guardarEnMemoria(memoria: Memoria, input: PeticionDeGuardarPaso) {
  const esquema =
    input.modo === "crear"
      ? ESQUEMAS_DE_CREAR[input.paso as keyof typeof ESQUEMAS_DE_CREAR]
      : ESQUEMAS_DE_EDITAR[input.paso];
  const parsed = esquema.safeParse(input.valores);
  if (!parsed.success) return { estado: "validation_error" as const, fieldErrors: fieldErrorsDe(parsed.error.issues) };
  memoria.modo = input.modo;
  memoria.planId = input.modo === "editar" ? input.planId : null;
  memoria.pasos[input.paso] = parsed.data as ValoresDelPaso;
  return {
    estado: "ok" as const,
    borradorId: BORRADOR_FALSO,
    pasosGuardados: PASOS_DE_EDITAR.filter((p) => memoria.pasos[p] !== undefined),
    actualizadoAt: GUARDADO_AT,
  };
}

/**
 * Las actions del borrador sobre un borrador en memoria. Confirmar con todos los pasos guardados llama a
 * `enviar` con la petición de hoy y devuelve lo que responda (o lanza si `enviar` lanza).
 */
export function accionesFalsas(enviar: Enviar): AccionesFalsas {
  const memoria: Memoria = { modo: null, planId: null, pasos: {} };
  const acciones: AccionesFalsas = {
    memoria,
    guardarPaso: vi.fn<AccionesDelBorrador["guardarPaso"]>(async (input) => guardarEnMemoria(memoria, input)),
    leer: vi.fn<AccionesDelBorrador["leer"]>().mockResolvedValue({ estado: "ok", borrador: null }),
    descartar: vi.fn<AccionesDelBorrador["descartar"]>(async () => {
      memoria.pasos = {};
      return { estado: "ok" };
    }),
    confirmar: vi.fn<AccionesDelBorrador["confirmar"]>(async () => {
      if (memoria.modo === null) return { estado: "borrador_no_encontrado" };
      const faltan = pasosQueFaltan(memoria.modo, Object.keys(memoria.pasos) as IdPasoBorrador[]);
      if (faltan.length > 0) return { estado: "pasos_pendientes", pasos: faltan };
      return (enviar as (input: unknown) => Promise<PlanResult>)(peticionConfirmada(acciones));
    }),
  };
  return acciones;
}

/** La petición de crear o editar de hoy que arma el servidor al confirmar el borrador en memoria. */
export function peticionConfirmada(acciones: AccionesFalsas): CrearPlanInput | EditarPlanInput {
  const { modo, planId, pasos } = acciones.memoria;
  if (modo === "editar") return peticionDeEditar(planId ?? "", pasos as PasosDeEditar) as EditarPlanInput;
  return peticionDeCrear(pasos as PasosDeCrear) as CrearPlanInput;
}

/** SLT-144 (design §5): la fecha de cada empresa al editar; responde `ok` sin empresas ni avisos. */
export function previsualizarCambioFalso() {
  return vi.fn<Extract<PlanFormProps, { modo: "editar" }>["previsualizarCambio"]>(
    async (): Promise<VistaPreviaCambioResult> => ({ estado: "ok", empresas: [], avisos: [] }),
  );
}

/** Las props del borrador para montar `PlanForm` al crear, sin borrador previo. */
export function conBorrador(enviar: Enviar) {
  return { borrador: accionesFalsas(enviar), borradorInicial: null };
}

/** Las props del borrador para montar `PlanForm` al editar, sin borrador previo y con la fecha de cada empresa. */
export function conBorradorDeCambio(enviar: Enviar) {
  return { ...conBorrador(enviar), previsualizarCambio: previsualizarCambioFalso() };
}

// ── Navegación ───────────────────────────────────────────────────────────────────────────────────────

/** El título del paso actual: el botón de la lista con `aria-current="step"`. */
export function tituloDelPasoActual(): string {
  const nav = screen.getByRole("navigation", { name: TEXTOS_FORMULARIO_POR_PASOS.navegacion });
  return within(nav).getByRole("button", { current: "step" }).textContent?.replace(/^\d+/, "").trim() ?? "";
}

/**
 * El botón del paso `titulo` en la lista de pasos. SLT-144 (R6): un paso guardado se nombra «<título> (guardado)»;
 * se acepta con o sin la marca, porque lo que se busca es el paso, no su estado.
 */
export function botonDeLaLista(titulo: string): HTMLElement {
  const nav = screen.getByRole("navigation", { name: TEXTOS_FORMULARIO_POR_PASOS.navegacion });
  const exacto = titulo.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const guardado = TEXTOS_FORMULARIO_POR_PASOS.pasoGuardado(titulo).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return within(nav).getByRole("button", { name: new RegExp(`^(${exacto}|${guardado})$`) });
}

/** Lo que explica por qué «Guardar y continuar» no avanzó: los campos marcados y los avisos en pantalla. */
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

/** Pulsa «Guardar y continuar» y espera a que el guardado termine. Devuelve si cambió de paso. */
async function guardarYContinuar(user: UserEvent, boton: HTMLElement): Promise<boolean> {
  const actual = tituloDelPasoActual();
  await user.click(boton);
  // SLT-144 (R4): mientras el guardado está en vuelo, el botón del pie lleva `aria-busy`.
  await waitFor(() => expect(document.querySelector('button[aria-busy="true"]')).toBeNull());
  return tituloDelPasoActual() !== actual;
}

/** Pulsa «Guardar y continuar» hasta que el paso actual se titula `titulo`. */
export async function avanzarHasta(user: UserEvent, titulo: string): Promise<void> {
  for (let i = 0; i < MAX_PASOS; i++) {
    const actual = tituloDelPasoActual();
    if (actual === titulo) return;
    const boton = screen.queryByRole("button", { name: TEXTOS_PLAN_FORM.guardarYContinuar });
    if (boton === null) {
      throw new Error(`avanzarHasta: no hay paso «${titulo}»; el formulario terminó en «${actual}».`);
    }
    if (!(await guardarYContinuar(user, boton))) {
      throw new Error(
        `avanzarHasta: «Guardar y continuar» no avanzó desde «${actual}» hacia «${titulo}»; ${motivoDeNoAvanzar()}.`,
      );
    }
  }
  throw new Error(`avanzarHasta: no se llegó a «${titulo}» tras ${MAX_PASOS} pasos.`);
}

/** Avanza hasta el último paso y pulsa el botón final («Crear plan», «Guardar» o «Programar cambio»). */
export async function terminar(user: UserEvent): Promise<void> {
  for (let i = 0; i < MAX_PASOS; i++) {
    const boton = screen.queryByRole("button", { name: TEXTOS_PLAN_FORM.guardarYContinuar });
    if (boton === null) break;
    const actual = tituloDelPasoActual();
    if (!(await guardarYContinuar(user, boton))) {
      throw new Error(`terminar: «Guardar y continuar» no avanzó desde «${actual}»; ${motivoDeNoAvanzar()}.`);
    }
  }
  const final = screen.getByRole("button", {
    name: new RegExp(`^(${[TEXTOS_PLAN_FORM.crear, TEXTOS_PLAN_FORM.guardar, TEXTOS_PLAN_FORM.programar].join("|")})$`),
  });
  await user.click(final);
}
