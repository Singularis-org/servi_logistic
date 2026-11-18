"use client";

import { useRef, useState } from "react";

import type {
  BorradorVista,
  ConfirmarBorradorInput,
  ConfirmarBorradorResult,
  DescartarBorradorInput,
  DescartarBorradorResult,
  GuardarPasoResult,
  LeerBorradorInput,
  LeerBorradorResult,
  ValoresDelPaso,
} from "@/lib/types/plan-borrador";

import type { IdPasoGuardable, ModoDelPlanForm } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

// SLT-144 (design §4.3, §4.4; R1, R3, R4, R8–R12, R16): el estado del borrador del servidor en el formulario y
// las llamadas a sus actions. No conoce el formulario: `PlanForm` le pasa los valores de cada paso y aplica lo
// que vuelve. Hay un solo «en vuelo» para guardar y confirmar (R4): así esta pantalla nunca manda un guardado
// detrás de su propia confirmación, que abriría un borrador nuevo (review m4 de SLT-129).

/** Lo que manda `PlanForm` al guardar un paso. Las actions validan la forma de `valores` con el esquema del paso. */
export type PeticionDeGuardarPaso =
  | { modo: "crear"; borradorId: string | null; paso: IdPasoGuardable; valores: ValoresDelPaso }
  | { modo: "editar"; planId: string; paso: IdPasoGuardable; valores: ValoresDelPaso };

/** Las cuatro actions de `lib/actions/plan-borrador.ts`, inyectadas desde la página para poder probarlas. */
export type AccionesDelBorrador = {
  guardarPaso: (input: PeticionDeGuardarPaso) => Promise<GuardarPasoResult>;
  leer: (input: LeerBorradorInput) => Promise<LeerBorradorResult>;
  descartar: (input: DescartarBorradorInput) => Promise<DescartarBorradorResult>;
  confirmar: (input: ConfirmarBorradorInput) => Promise<ConfirmarBorradorResult>;
};

export type EstadoDelBorrador = {
  borradorId: string | null;
  /** Los pasos que el servidor confirmó como guardados. */
  guardados: ReadonlySet<IdPasoGuardable>;
  /**
   * JSON de los valores de cada paso al guardarlo, para «Sin guardar» (R6). Un paso guardado sin instantánea
   * cuenta como «Sin guardar»: sus valores del servidor no están en pantalla.
   */
  instantaneas: Partial<Record<IdPasoGuardable, string>>;
  /** El `actualizadoAt` del último guardado que respondió el servidor (R7). */
  actualizadoAt: string | null;
  /** El aviso del último guardado (R10, R12); un guardado sin novedades lo quita. */
  aviso: string | null;
  /** R15: quién empezó el borrador retomado y cuándo se guardó; se va al descartarlo. */
  retomado: { iniciadoPor: string; actualizadoAt: string } | null;
};

export const SIN_BORRADOR: EstadoDelBorrador = {
  borradorId: null,
  guardados: new Set(),
  instantaneas: {},
  actualizadoAt: null,
  aviso: null,
  retomado: null,
};

export type RechazoDeGuardar = Exclude<GuardarPasoResult, { estado: "ok" } | { estado: "validation_error" }>;

export type ResultadoDeGuardar =
  /** `ajenos`: pasos que guardó otra pantalla, ya leídos, para que `PlanForm` cargue sus valores (R12). */
  | { tipo: "ok"; ajenos: { pasos: IdPasoGuardable[]; borrador: BorradorVista } | null }
  | { tipo: "errores"; fieldErrors: Record<string, string[]> }
  /** R3, R11: el rechazo del servidor, o `null` si la llamada lanzó. `PlanForm` pone el texto. */
  | { tipo: "rechazo"; r: RechazoDeGuardar | null }
  /** Otra llamada estaba en vuelo: no se llamó a nada (R4). */
  | { tipo: "ocupado" };

export type ResultadoDeConfirmar =
  | { tipo: "respuesta"; r: ConfirmarBorradorResult }
  /** La llamada lanzó: el formulario sigue, con el aviso genérico. */
  | { tipo: "fallo" }
  /** No se llamó: otra en vuelo, sin borrador, o `antes` dijo que no. */
  | { tipo: "cancelado" };

type Opciones = {
  modo: ModoDelPlanForm;
  /** El plan que se edita; `null` al crear. */
  planId: string | null;
  acciones: AccionesDelBorrador;
  inicial: () => EstadoDelBorrador;
  /** Design §4.6: se llama una vez, en el primer guardado `ok`, para que quien monta avise al cerrar (R13). */
  onPrimerGuardado?: () => void;
};

export function useBorrador({ modo, planId, acciones, inicial, onPrimerGuardado }: Opciones) {
  const [estado, setEstado] = useState<EstadoDelBorrador>(inicial);
  // Espejo síncrono: las respuestas llegan tras un `await` y deben partir del estado de ese momento.
  const estadoRef = useRef(estado);
  const [enVuelo, setEnVuelo] = useState(false);
  const enVueloRef = useRef(false);
  const avisado = useRef(false);

  function actualizar(cambio: (e: EstadoDelBorrador) => EstadoDelBorrador) {
    estadoRef.current = cambio(estadoRef.current);
    setEstado(estadoRef.current);
  }

  function marcarVuelo(valor: boolean) {
    enVueloRef.current = valor;
    setEnVuelo(valor);
  }

  /** R1, R3, R10–R12: guarda los valores de un paso; `instantanea` es su JSON, para «Sin guardar». */
  async function guardar(paso: IdPasoGuardable, valores: ValoresDelPaso, instantanea: string): Promise<ResultadoDeGuardar> {
    if (enVueloRef.current) return { tipo: "ocupado" };
    marcarVuelo(true);
    try {
      const antes = estadoRef.current;
      const peticion: PeticionDeGuardarPaso =
        modo === "crear"
          ? { modo, borradorId: antes.borradorId, paso, valores }
          : { modo, planId: planId ?? "", paso, valores };
      let r: GuardarPasoResult;
      try {
        r = await acciones.guardarPaso(peticion);
      } catch (error) {
        console.error("[PlanForm] guardar el paso del borrador lanzó", error);
        return { tipo: "rechazo", r: null };
      }
      if (r.estado === "validation_error") return { tipo: "errores", fieldErrors: r.fieldErrors };
      // R11: al crear, `borrador_no_encontrado` no abre otro borrador, y la pantalla tampoco lo hace por su cuenta.
      if (r.estado !== "ok") return { tipo: "rechazo", r };

      // R10: el borrador abierto ya no existe y el servidor abrió otro con este paso. Se sigue con el nuevo y
      // solo con lo que trae la respuesta, para no confirmar por error un cambio a medias.
      const idNuevo = antes.borradorId !== null && r.borradorId !== antes.borradorId;
      const guardados = new Set<IdPasoGuardable>(r.pasosGuardados);
      const conservadas = idNuevo
        ? {}
        : Object.fromEntries(Object.entries(antes.instantaneas).filter(([p]) => guardados.has(p as IdPasoGuardable)));
      // R12: pasos guardados que esta pantalla no tenía como suyos.
      const ajenos = r.pasosGuardados.filter(
        (p) => p !== paso && (idNuevo || !antes.guardados.has(p)),
      );
      const leidos = ajenos.length > 0 ? await leerAjenos(r.borradorId) : null;
      const avisos = [idNuevo ? TEXTOS_PLAN_FORM.borradorNuevo : null, leidos ? TEXTOS_PLAN_FORM.pasosAjenos : null];
      actualizar((e) => ({
        ...e,
        borradorId: r.borradorId,
        guardados,
        instantaneas: { ...conservadas, [paso]: instantanea },
        actualizadoAt: r.actualizadoAt,
        aviso: avisos.filter((a) => a !== null).join(" ") || null,
      }));
      if (!avisado.current) {
        avisado.current = true;
        onPrimerGuardado?.();
      }
      return { tipo: "ok", ajenos: leidos === null ? null : { pasos: ajenos, borrador: leidos } };
    } finally {
      marcarVuelo(false);
    }
  }

  /**
   * R12: lee el borrador para cargar los pasos ajenos. Si no se puede, esos pasos quedan guardados sin
   * instantánea, o sea «Sin guardar»: hay que volver a guardarlos antes de confirmar.
   */
  async function leerAjenos(borradorId: string): Promise<BorradorVista | null> {
    try {
      const r = await acciones.leer({ borradorId });
      return r.estado === "ok" ? r.borrador : null;
    } catch (error) {
      console.error("[PlanForm] leer el borrador lanzó", error);
      return null;
    }
  }

  /** R12: las instantáneas de los pasos ajenos, ya cargados en el formulario. */
  function anotarInstantaneas(nuevas: Partial<Record<IdPasoGuardable, string>>) {
    actualizar((e) => ({ ...e, instantaneas: { ...e.instantaneas, ...nuevas } }));
  }

  /**
   * R8, R9: confirma el borrador una sola vez. `antes` corre dentro del mismo vuelo (la vista previa del custom,
   * D17). Con `pasos_pendientes`, esos pasos dejan de estar guardados. Tras un `ok` el vuelo no se suelta: el
   * panel se cierra, y mientras tanto ningún guardado puede abrir un borrador nuevo (review m4 de SLT-129).
   */
  async function confirmar(antes?: () => Promise<boolean>): Promise<ResultadoDeConfirmar> {
    const borradorId = estadoRef.current.borradorId;
    if (enVueloRef.current || borradorId === null) return { tipo: "cancelado" };
    marcarVuelo(true);
    let terminado = false;
    try {
      if (antes !== undefined && !(await antes())) return { tipo: "cancelado" };
      let r: ConfirmarBorradorResult;
      try {
        r = await acciones.confirmar({ borradorId });
      } catch (error) {
        console.error("[PlanForm] confirmar el borrador lanzó", error);
        return { tipo: "fallo" };
      }
      if (r.estado === "ok") terminado = true;
      if (r.estado === "pasos_pendientes") {
        const pendientes = new Set<string>(r.pasos);
        actualizar((e) => ({
          ...e,
          guardados: new Set([...e.guardados].filter((p) => !pendientes.has(p))),
          instantaneas: Object.fromEntries(Object.entries(e.instantaneas).filter(([p]) => !pendientes.has(p))),
        }));
      }
      return { tipo: "respuesta", r };
    } finally {
      if (!terminado) marcarVuelo(false);
    }
  }

  /**
   * R16: descarta el borrador. Con `ok` o `borrador_no_encontrado` vuelve a no tener borrador y devuelve
   * `"descartado"`; si no, el rechazo (o `null` si lanzó) para el diálogo, y el borrador sigue como estaba.
   */
  async function descartar(): Promise<"descartado" | { r: DescartarBorradorResult | null }> {
    const borradorId = estadoRef.current.borradorId;
    if (borradorId !== null) {
      let r: DescartarBorradorResult;
      try {
        r = await acciones.descartar({ borradorId });
      } catch (error) {
        console.error("[PlanForm] descartar el borrador lanzó", error);
        return { r: null };
      }
      if (r.estado !== "ok" && r.estado !== "borrador_no_encontrado") return { r };
    }
    avisado.current = false;
    actualizar(() => SIN_BORRADOR);
    return "descartado";
  }

  return { estado, enVuelo, enVueloRef, guardar, anotarInstantaneas, confirmar, descartar };
}
