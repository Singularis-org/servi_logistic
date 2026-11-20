"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { FormularioPorPasos, pasosElegibles } from "@/components/shared/FormularioPorPasos";
import { Modal } from "@/components/shared/Modal";
import { primerPeriodoDelCambio, TEXTOS_TIPO_COBRO, textoDelPeriodo } from "@/components/shared/tipo-cobro";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { cambiaElPrecio, diferenciasDelPlan } from "@/lib/planes/rastro";
import type { BorradorVista, DescartarBorradorResult } from "@/lib/types/plan-borrador";
import {
  crearPlanSchema,
  editarPlanSchema,
  precioPlanSchema,
  previsualizarCambioSchema,
  previsualizarCustomSchema,
  type PlanDTO,
  type PlanResult,
  type PrevisualizarCustomInput,
  type TopeExcedido,
  type VistaPreviaCambioResult,
  type VistaPreviaCustomResult,
} from "@/lib/types/planes";
import { esFechaCalendarioValida, mananaCalendarioCR } from "@/lib/utils/fecha-cr";
import type { z } from "zod";

import { fechaHora, formDelBorrador, pasoInicial, valoresDelPaso } from "./plan-form/borrador";
import {
  camposEnOrden,
  erroresDeZod,
  inicial,
  PASOS_QUE_SE_GUARDAN,
  pasoDeLaClave,
  pasosDe,
  precioDe,
  versionDe,
  type CamposVisibles,
  type EmpresaParaCustom,
  type Errores,
  type Formulario,
  type IdPaso,
  type IdPasoGuardable,
  type ModoDelPlanForm,
  type PropsDelPaso,
} from "./plan-form/estado";
import { PasoBeneficios } from "./plan-form/PasoBeneficios";
import { PasoNiveles } from "./plan-form/PasoNiveles";
import { PasoCobroPorOrden } from "./plan-form/PasoCobroPorOrden";
import type { FechasDelCambio } from "./plan-form/FechasPorEmpresa";
import { PasoCuandoRigeConFechas } from "./plan-form/PasoCuandoRige";
import { PasoGeneral } from "./plan-form/PasoGeneral";
import { PasoModulos } from "./plan-form/PasoModulos";
import { PasoPrecio } from "./plan-form/PasoPrecio";
import { PasoRevisar } from "./plan-form/PasoRevisar";
import { PasoTopes } from "./plan-form/PasoTopes";
import { extrasDeGeneral, filaDeCuandoRige } from "./plan-form/revision";
import { TEXTOS_PLAN_FORM } from "./plan-form/textos";
import {
  SIN_BORRADOR,
  useBorrador,
  type AccionesDelBorrador,
  type EstadoDelBorrador,
  type RechazoDeGuardar,
} from "./plan-form/usar-borrador";

// SLT-130 (design §2): `PlanDetalle.tsx`, `PlanesModule.tsx` y `PlanEmpresa.tsx` siguen importando de aquí.
export { TEXTOS_PLAN_FORM };
export type { AccionesDelBorrador, EmpresaParaCustom };

/** SLT-144 (design §3.1, §5): la entrada de la fecha de cada empresa (`FechasPorEmpresa`). */
export type PrevisualizarCambioInput = z.infer<typeof previsualizarCambioSchema>;

/**
 * SLT-130 (R6; design §7): el ancho del Sheet que monta el formulario, el de la maqueta. Va en `style`
 * por lo mismo que `configuracion/plantillas/_components/FormSheet.tsx`: el `style` inline gana al
 * `w-3/4` de la clase base, y sin `maxWidth: "none"` el `data-[side=right]:sm:max-w-sm` lo recortaría.
 */
export const ESTILO_SHEET_PLAN: CSSProperties = { width: "min(920px, 100vw)", maxWidth: "none" };

/**
 * Ajuste planes-custom (D13): cuánto se espera tras la última tecla antes de leer la vista previa, para
 * no llamar al servidor con cada dígito de un tope.
 */
export const ESPERA_VISTA_PREVIA_MS = 300;

/**
 * Ajuste planes-custom (D13): la vista previa de uso contra topes (SLT-58 R37) del custom, atada a la
 * entrada que la produjo (`clave`): si el formulario cambió, la lectura vieja no se pinta.
 */
type VistaPreviaCustom =
  | { clave: string; fase: "cargando" }
  | { clave: string; fase: "ok"; avisos: TopeExcedido[] }
  | { clave: string; fase: "fallo"; motivo: string[] | null };

/** Rechazos de las actions de planes (design §6.5). `validation_error` va junto a su campo. */
const RECHAZOS = {
  forbidden: "No tienes permiso para esto.",
  not_found: "El plan o la empresa ya no existe.",
  archivado: "El plan está archivado.",
  custom_de_otra_empresa: "Ese plan es de otra empresa.",
  sin_cambio_programado: "El plan ya no tiene un cambio pendiente.",
  // SLT-135 (R8): editar ya no lo devuelve (SLT-128 R16 retirado); si llegara, el genérico.
  cambio_a_medias: "No se pudo guardar. Inténtalo de nuevo.",
  /** Ajuste planes-custom (D3): al crear un custom, el `not_found` es la empresa elegida. */
  empresa_no_existe: "Esa empresa ya no existe.",
  generico: "No se pudo guardar. Inténtalo de nuevo.",
} as const;

/**
 * SLT-58 (R18) — el texto de un rechazo de una action de planes. `null` si fue `ok` o un
 * `validation_error` (ese se pinta junto a cada campo). Lo comparten el formulario y el detalle.
 */
export function mensajeDelRechazo(r: PlanResult): string | null {
  switch (r.estado) {
    case "ok":
    case "validation_error":
      return null;
    case "tope_excedido":
      return r.mensaje;
    default:
      return RECHAZOS[r.estado];
  }
}

export const RECHAZO_GENERICO = RECHAZOS.generico;

/** SLT-144 (R3, R11): el texto de un rechazo al guardar un paso, para el aviso del paso. `null`: la llamada lanzó. */
function textoDelRechazoDeGuardar(r: RechazoDeGuardar | null): string {
  if (r === null) return TEXTOS_PLAN_FORM.noSeGuardoElPaso;
  if (r.estado === "borrador_no_encontrado") return TEXTOS_PLAN_FORM.borradorYaNoExiste;
  return RECHAZOS[r.estado];
}

/** SLT-144 (R16): el texto de un descarte que falló, para el diálogo. `null`: la llamada lanzó. */
function textoDelRechazoDeDescartar(r: DescartarBorradorResult | null): string {
  return r?.estado === "forbidden" ? RECHAZOS.forbidden : TEXTOS_PLAN_FORM.noSeDescarto;
}

type PropsComunes = {
  /** Tras confirmar con `ok`: quien monta el formulario cierra el panel, relee y avisa. `nombre`, el confirmado. */
  onGuardado: (resultado: Extract<PlanResult, { estado: "ok" }>, nombre: string) => void;
  /** SLT-144 (design §4.7): las actions del borrador, inyectadas desde la página. */
  borrador: AccionesDelBorrador;
  /** SLT-144 (R15): el borrador que se retoma, ya leído por `AbrirPlanForm`; `null` sin borrador. */
  borradorInicial: BorradorVista | null;
  /** SLT-144 (design §4.6; R13): en el primer guardado `ok`, para avisar al cerrar que el borrador queda. */
  onBorradorGuardado?: () => void;
};

export type PlanFormProps = PropsComunes &
  (
    | {
        modo: "crear";
        /**
         * Las empresas para un plan custom (`listarEmpresasPlataforma`); `null` si no se pudieron leer.
         * `tienePlan` decide si se pide el inicio del ciclo (ajuste planes-custom, D4).
         */
        empresas: EmpresaParaCustom[] | null;
        /**
         * Ajuste planes-custom (D5): la fecha que propone «Inicio del ciclo» (mañana en la hora de la
         * plataforma), calculada en el servidor con `inicioDelCicloPorDefecto`.
         */
        inicioCicloPorDefecto: string;
        /** SLT-58 (R30): el `min`/`max` de «Inicio del ciclo», del reloj del servidor. */
        rangoInicioCiclo: RangoDelInicioDelCiclo;
        /** SLT-86 (R16): el `min`/`max` de «Rige desde» para una empresa con plan, del reloj del servidor. */
        rangoFechaDeEfecto: RangoDelInicioDelCiclo;
        /**
         * Ajuste planes-custom (D13): `previsualizarCustomAction`, inyectada desde la página. Se llama
         * con la empresa sin plan, la fecha y los topes que se están escribiendo.
         */
        previsualizar: (input: PrevisualizarCustomInput) => Promise<VistaPreviaCustomResult>;
      }
    | {
        modo: "editar";
        plan: PlanDTO;
        /**
         * SLT-86 (R23): «Rige desde» por defecto de un cambio de precio: mañana en la hora de la plataforma.
         * Sin él se calcula con el reloj del navegador; el campo solo aparece tras tocar el precio.
         */
        precioDesdePorDefecto?: string;
        /**
         * SLT-144 (design §4.7, §5): `previsualizarCambioPlanAction`, inyectada desde la página; la fecha en que
         * cada empresa recibiría el cambio. La pinta `FechasPorEmpresa`.
         */
        previsualizarCambio: (input: PrevisualizarCambioInput) => Promise<VistaPreviaCambioResult>;
      }
  );

/** SLT-144 (R14, R16): los valores del formulario sin borrador: los del plan al editar, vacíos al crear. */
function formBase(props: PlanFormProps): Formulario {
  return inicial(
    props.modo === "editar" ? props.plan : null,
    props.modo === "crear" ? props.inicioCicloPorDefecto : "",
    props.modo === "editar" ? (props.precioDesdePorDefecto ?? mananaCalendarioCR()) : "",
  );
}

/**
 * Qué campos condicionales hay en pantalla con estos valores. Ajuste planes-custom (D4): «Inicio del ciclo»
 * solo para un custom cuya empresa elegida NO tiene plan; si ya lo tiene, la asignación conserva el ancla.
 * SLT-86 (R16, R25): un custom para una empresa que ya tiene plan pide su fecha de efecto. SLT-86 (R22, R23):
 * al editar, cambiar el costo base o un descuento pide «Rige desde»; se compara en forma canónica, como el rastro.
 */
function visiblesDe(
  props: PlanFormProps,
  form: Formulario,
): { visibles: CamposVisibles; empresaElegida: EmpresaParaCustom | undefined } {
  const empresaElegida =
    props.modo === "crear" && form.visibilidad === "custom"
      ? (props.empresas ?? []).find((e) => e.id === form.organizacionId)
      : undefined;
  const cambiaPrecio =
    props.modo === "editar" &&
    cambiaElPrecio(diferenciasDelPlan(props.plan, { ...props.plan, precio: precioDe(form) }));
  return {
    visibles: {
      pideInicioCiclo: empresaElegida !== undefined && !empresaElegida.tienePlan,
      pideFechaDeEfecto: empresaElegida !== undefined && empresaElegida.tienePlan,
      cambiaPrecio,
    },
    empresaElegida,
  };
}

/** SLT-144 (R6): la huella de los valores de un paso; si deja de ser la del guardado, el paso queda «Sin guardar». */
function instantaneaDe(modo: ModoDelPlanForm, paso: IdPasoGuardable, form: Formulario, visibles: CamposVisibles) {
  return JSON.stringify(valoresDelPaso(modo, paso, form, visibles));
}

/** SLT-144 (R6, R12, R15): las instantáneas de unos pasos con los valores que ya están en `form`. */
function instantaneasDe(
  props: PlanFormProps,
  form: Formulario,
  pasos: Iterable<IdPasoGuardable>,
): Partial<Record<IdPasoGuardable, string>> {
  const { visibles } = visiblesDe(props, form);
  return Object.fromEntries([...pasos].map((p) => [p, instantaneaDe(props.modo, p, form, visibles)]));
}

/**
 * SLT-144 (R15; design §4.5): con un borrador, sus pasos guardados encima de la base, con ✓ y en el primer
 * paso sin guardar. Sin borrador, el formulario de hoy en General.
 */
function arranqueDe(props: PlanFormProps): { form: Formulario; borrador: EstadoDelBorrador; paso: IdPaso } {
  const base = formBase(props);
  const b = props.borradorInicial;
  if (b === null) return { form: base, borrador: SIN_BORRADOR, paso: "general" };
  const form = formDelBorrador(base, b.pasos);
  const guardados = new Set<IdPasoGuardable>(b.pasosGuardados);
  return {
    form,
    borrador: {
      borradorId: b.id,
      guardados,
      instantaneas: instantaneasDe(props, form, guardados),
      actualizadoAt: b.actualizadoAt,
      aviso: null,
      retomado: { iniciadoPor: b.iniciadoPor, actualizadoAt: b.actualizadoAt },
    },
    paso: pasoInicial(props.modo, guardados),
  };
}

/**
 * SLT-58 (design §6.3; R14, R15, R18) — crear o editar un plan. SLT-130 (design §4): por pasos, con el
 * mismo componente de pasos y los mismos pasos en los dos modos; este componente solo orquesta (estado,
 * navegación, guardar y la vista previa del custom).
 * SLT-144 (design §4): cada paso se guarda en el borrador del servidor con «Guardar y continuar», que antes
 * valida con el MISMO esquema que la action, solo los campos del paso. El botón final confirma el borrador y
 * solo se habilita con todos los pasos guardados. Mientras un guardado o la confirmación están en vuelo no se
 * puede pulsar nada más (R4).
 */
export function PlanForm(props: PlanFormProps) {
  const base = useId();
  const [arranque] = useState(() => arranqueDe(props));
  const [form, setForm] = useState<Formulario>(arranque.form);
  const [errores, setErrores] = useState<Errores>({});
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [paso, setPaso] = useState<IdPaso>(arranque.paso);
  const [confirmandoDescarte, setConfirmandoDescarte] = useState(false);
  const [errorDescarte, setErrorDescarte] = useState<string | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  /**
   * Adónde llevar el foco tras pintar los errores: la clave del primer campo con error o `null` para el
   * aviso general. Se aplica en un efecto tras pintar los errores, porque el campo y su error tienen que
   * estar ya en el DOM.
   */
  const focoPendiente = useRef<{ clave: string | null } | null>(null);

  const borrador = useBorrador({
    modo: props.modo,
    planId: props.modo === "editar" ? props.plan.id : null,
    acciones: props.borrador,
    inicial: () => arranque.borrador,
    onPrimerGuardado: props.onBorradorGuardado,
  });
  const { guardados, instantaneas } = borrador.estado;
  const enVuelo = borrador.enVuelo;

  const pasos = pasosDe(props.modo);
  const indice = pasos.findIndex((p) => p.id === paso);
  const esUltimo = indice === pasos.length - 1;

  const idDe = (clave: string) => `${base}-${clave.replaceAll(".", "-")}`;
  const errorDe = (clave: string) => errores[clave];
  const { visibles, empresaElegida } = visiblesDe(props, form);
  const { pideInicioCiclo, pideFechaDeEfecto, cambiaPrecio } = visibles;
  // SLT-135 (R16): al editar, la fecha que viaja es siempre la del campo que se ve en «Cuándo rige».
  const fechaDelCambio = cambiaPrecio ? form.precioDesde : form.vigenteDesde;

  // SLT-144 (R6, R8): un paso guardado cuyos valores ya no son los guardados queda «Sin guardar»; sin todos
  // guardados y al día no se confirma.
  const guardables = PASOS_QUE_SE_GUARDAN(props.modo);
  const sinGuardar = new Set<IdPasoGuardable>(
    guardables.filter((p) => guardados.has(p) && instantaneas[p] !== instantaneaDe(props.modo, p, form, visibles)),
  );
  const faltan = guardables.filter((p) => !guardados.has(p) || sinGuardar.has(p));
  const tituloDe = (id: IdPaso) => pasos.find((p) => p.id === id)?.titulo ?? id;

  /**
   * Ajuste planes-custom (D13): la entrada de la vista previa, solo con empresa sin plan, fecha y topes
   * válidos (el mismo esquema que la action). Con algo inválido no se lee: el error sale al guardar.
   */
  const entradaPrevia = (() => {
    if (props.modo !== "crear" || !pideInicioCiclo || form.inicioCiclo === "") return null;
    const v = previsualizarCustomSchema.safeParse({
      organizacionId: form.organizacionId,
      inicioCiclo: form.inicioCiclo,
      topes: versionDe(form).topes,
    });
    return v.success ? v.data : null;
  })();
  const clavePrevia = entradaPrevia === null ? null : JSON.stringify(entradaPrevia);
  const previsualizar = props.modo === "crear" ? props.previsualizar : null;
  const [vistaPrevia, setVistaPrevia] = useState<VistaPreviaCustom | null>(null);
  /** La entrada vigente: una respuesta de otra entrada ya no se pinta. */
  const claveVigente = useRef<string | null>(null);
  const lecturaEnVuelo = useRef<{ clave: string; promesa: Promise<boolean> } | null>(null);
  const esperaPrevia = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * D13: lee la vista previa de esa entrada y la pinta si sigue vigente. Devuelve si se pudo leer: sin
   * ella no se crea (D17). SLT-86 (R8): ya no trae el siguiente ciclo, que solo servía al aviso de órdenes.
   */
  const leerVistaPrevia = useCallback(
    (entrada: PrevisualizarCustomInput, clave: string): Promise<boolean> => {
      if (previsualizar === null) return Promise.resolve(false);
      if (lecturaEnVuelo.current?.clave === clave) return lecturaEnVuelo.current.promesa;
      setVistaPrevia({ clave, fase: "cargando" });
      const promesa = (async () => {
        try {
          const r = await previsualizar(entrada);
          if (claveVigente.current === clave) {
            setVistaPrevia(
              r.estado === "ok"
                ? { clave, fase: "ok", avisos: r.avisos }
                : {
                    clave,
                    fase: "fallo",
                    motivo: r.estado === "validation_error" ? (r.fieldErrors.inicioCiclo ?? null) : null,
                  },
            );
          }
          return r.estado === "ok";
        } catch (error) {
          console.error("[PlanForm] previsualizar lanzó", error);
          if (claveVigente.current === clave) setVistaPrevia({ clave, fase: "fallo", motivo: null });
          return false;
        }
      })();
      const lectura = { clave, promesa };
      lecturaEnVuelo.current = lectura;
      void promesa.finally(() => {
        if (lecturaEnVuelo.current === lectura) lecturaEnVuelo.current = null;
      });
      return promesa;
    },
    [previsualizar],
  );

  // D13: cada cambio de empresa, fecha o topes relee la vista previa, tras una pausa corta al escribir.
  useEffect(() => {
    claveVigente.current = clavePrevia;
    if (clavePrevia === null) return;
    const entrada = JSON.parse(clavePrevia) as PrevisualizarCustomInput;
    const espera = setTimeout(() => {
      esperaPrevia.current = null;
      void leerVistaPrevia(entrada, clavePrevia);
    }, ESPERA_VISTA_PREVIA_MS);
    esperaPrevia.current = espera;
    return () => {
      clearTimeout(espera);
      if (esperaPrevia.current === espera) esperaPrevia.current = null;
    };
  }, [clavePrevia, leerVistaPrevia]);

  const vistaPreviaVigente = vistaPrevia !== null && vistaPrevia.clave === clavePrevia ? vistaPrevia : null;
  /**
   * D17 (como el modal, SLT-58 P11): sin la vista previa de esta entrada no se crea. Mientras se lee o si
   * falló, «Crear plan» queda deshabilitado; si falló, el aviso ofrece «Reintentar».
   */
  const creacionBloqueada = vistaPreviaVigente?.fase === "cargando" || vistaPreviaVigente?.fase === "fallo";

  /** D17: relee la vista previa de la entrada vigente (botón «Reintentar»). */
  function reintentarVistaPrevia() {
    if (entradaPrevia === null || clavePrevia === null) return;
    void leerVistaPrevia(entradaPrevia, clavePrevia);
  }

  /**
   * D12, D17: antes de crear un custom con fecha, la vista previa de esta entrada tiene que estar leída.
   * Se reutiliza la ya leída; si no la hay (se guardó durante la pausa), se lee ahora: después de crear,
   * la empresa ya tiene plan y la vista previa la rechazaría (R31). Sin entrada no hace falta: `true`.
   */
  async function vistaPreviaLista(): Promise<boolean> {
    if (entradaPrevia === null || clavePrevia === null) return true;
    if (vistaPreviaVigente?.fase === "ok") return true;
    if (esperaPrevia.current !== null) {
      clearTimeout(esperaPrevia.current);
      esperaPrevia.current = null;
    }
    return leerVistaPrevia(entradaPrevia, clavePrevia);
  }

  /**
   * SLT-144 (design §5.1): al editar, en «Cuándo rige» y «Revisar», la entrada de la fecha de cada empresa: la F
   * que se programaría (la de `erroresDelFormulario`) y los topes en pantalla. Inválida, no se lee: el error sale
   * al guardar el paso.
   */
  const entradaFechas = (() => {
    if (props.modo !== "editar" || (paso !== "vigencia" && paso !== "revisar")) return null;
    const v = previsualizarCambioSchema.safeParse({
      planId: props.plan.id,
      vigenteDesde: fechaDelCambio,
      topes: versionDe(form).topes,
    });
    return v.success ? v.data : null;
  })();
  const claveFechas = entradaFechas === null ? null : JSON.stringify(entradaFechas);
  const previsualizarCambio = props.modo === "editar" ? props.previsualizarCambio : null;
  const [fechas, setFechas] = useState<(FechasDelCambio & { clave: string }) | null>(null);
  /** R20: la entrada vigente de las fechas; la respuesta de una F o unos topes que ya no están no se pinta. */
  const claveFechasVigente = useRef<string | null>(null);
  const lecturaDeFechas = useRef<string | null>(null);

  /** R17, R18, R20: lee la fecha de cada empresa y los topes pasados de esa entrada, como la vista previa del custom. */
  const leerFechas = useCallback(
    (entrada: PrevisualizarCambioInput, clave: string) => {
      if (previsualizarCambio === null || lecturaDeFechas.current === clave) return;
      lecturaDeFechas.current = clave;
      setFechas({ clave, fase: "cargando" });
      void (async () => {
        let nuevas: FechasDelCambio;
        try {
          const r = await previsualizarCambio(entrada);
          nuevas =
            r.estado === "ok"
              ? { fase: "ok", vigenteDesde: entrada.vigenteDesde, empresas: r.empresas, avisos: r.avisos }
              : { fase: "fallo" };
        } catch (error) {
          console.error("[PlanForm] previsualizarCambio lanzó", error);
          nuevas = { fase: "fallo" };
        }
        if (lecturaDeFechas.current === clave) lecturaDeFechas.current = null;
        if (claveFechasVigente.current === clave) setFechas({ clave, ...nuevas });
      })();
    },
    [previsualizarCambio],
  );

  // Design §5.1: cada cambio de F o de topes relee las fechas tras la misma pausa que la vista previa del custom.
  useEffect(() => {
    claveFechasVigente.current = claveFechas;
    if (claveFechas === null) return;
    const entrada = JSON.parse(claveFechas) as PrevisualizarCambioInput;
    const espera = setTimeout(() => leerFechas(entrada, claveFechas), ESPERA_VISTA_PREVIA_MS);
    return () => clearTimeout(espera);
  }, [claveFechas, leerFechas]);

  // Hasta que llega la primera lectura de esta entrada (la pausa incluida) se dice que se calcula (R20).
  const fechasVigentes: FechasDelCambio | null =
    claveFechas === null ? null : fechas !== null && fechas.clave === claveFechas ? fechas : { fase: "cargando" };

  /** R20: «Reintentar» relee la entrada vigente. */
  function reintentarFechas() {
    if (entradaFechas === null || claveFechas === null) return;
    leerFechas(entradaFechas, claveFechas);
  }

  /**
   * R21: al cambiar de paso, el foco va al título del paso nuevo. No en el primer render (no se roba el
   * foco al abrir el panel) ni si hay un foco pendiente de errores (R25: manda el campo con error). Se
   * declara antes del efecto de los errores para ver `focoPendiente` antes de que ese lo consuma.
   */
  const pasoEnfocado = useRef<IdPaso>(paso);
  useEffect(() => {
    if (pasoEnfocado.current === paso) return;
    pasoEnfocado.current = paso;
    if (focoPendiente.current !== null) return;
    tituloRef.current?.focus();
  }, [paso]);

  useEffect(() => {
    const foco = focoPendiente.current;
    if (foco === null) return;
    focoPendiente.current = null;
    const destino =
      foco.clave === null
        ? avisoRef.current
        : enfocableDentro(document.getElementById(`${base}-${foco.clave.replaceAll(".", "-")}`));
    if (!destino) return;
    // En un panel largo el error suele quedar fuera de la vista. `scrollIntoView` no existe en jsdom.
    destino.scrollIntoView?.({ block: "center" });
    destino.focus({ preventScroll: true });
  }, [errores, rechazo, base]);

  /** SLT-144: cambiar de paso deja atrás el aviso del paso anterior. */
  function irA(destino: IdPaso) {
    setRechazo(null);
    setPaso(destino);
  }

  /**
   * Pinta los errores y lleva el foco al primero en el orden del formulario, en su paso (R25). Si ninguno
   * tiene un campo visible (solo errores sueltos o un rechazo), al aviso de `sinCampo`: el general de
   * «Revisar» (R26) o, al guardar un paso, el de ese paso (SLT-144 R3).
   */
  function mostrarErrores(nuevos: Errores, nuevoRechazo: string | null = null, sinCampo: IdPaso = "revisar") {
    const primera = camposEnOrden(props.modo, form, visibles).find((clave) => (nuevos[clave]?.length ?? 0) > 0);
    focoPendiente.current = { clave: primera ?? null };
    setPaso((primera === undefined ? null : pasoDeLaClave(primera, props.modo)) ?? sinCampo);
    setErrores(nuevos);
    setRechazo(nuevoRechazo);
  }

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  /** Design §5: una línea de descuento que cambia de período o se quita se lleva sus errores pendientes. */
  function descartarErrores(prefijo: string) {
    setErrores((e) => {
      const quedan = Object.entries(e).filter(([clave]) => clave !== prefijo && !clave.startsWith(`${prefijo}.`));
      return quedan.length === Object.keys(e).length ? e : Object.fromEntries(quedan);
    });
  }

  /**
   * Valida con el esquema completo de la action de crear o editar y devuelve los errores de campo. El esquema
   * se importa, no se copia: las dos validaciones no pueden divergir.
   */
  function erroresDelFormulario(): Errores {
    const version = versionDe(form);
    if (props.modo === "crear") {
      const custom = form.visibilidad === "custom";
      const v = crearPlanSchema.safeParse({
        ...version,
        visibilidad: form.visibilidad,
        organizacionId: custom ? form.organizacionId : null,
        // D2, D4, D6: un custom se asigna al crearlo; la fecha, solo si la empresa aún no tiene plan.
        ...(custom ? { tipoCobro: form.tipoCobro } : {}),
        ...(custom && pideInicioCiclo ? { inicioCiclo: form.inicioCiclo } : {}),
        // SLT-86 (R16): a una empresa con plan, la fecha de efecto del cambio.
        ...(custom && pideFechaDeEfecto ? { vigenteDesde: form.vigenteDesde } : {}),
      });
      return v.success ? {} : erroresDeZod(v.error.issues);
    }
    const v = editarPlanSchema.safeParse({
      ...version,
      planId: props.plan.id,
      // SLT-86 (R22), SLT-135 (R16, R17): «Rige desde» si cambia el precio; si no, «A partir de». Vacía o
      // inválida, el esquema marca el campo.
      vigenteDesde: fechaDelCambio,
    });
    return v.success ? {} : erroresDeZod(v.error.issues);
  }

  /** SLT-130 (R18): los errores de los campos visibles de ESTE paso, con el esquema completo de la action. */
  function erroresDelPaso(): Errores {
    const conCampo = new Set(camposEnOrden(props.modo, form, visibles));
    return Object.fromEntries(
      Object.entries(erroresDelFormulario()).filter(
        ([clave]) => conCampo.has(clave) && pasoDeLaClave(clave, props.modo) === paso,
      ),
    );
  }

  /**
   * SLT-144 (R1, R3, R10–R12): valida el paso como hoy y, sin errores, lo guarda en el borrador con una sola
   * llamada. Con `ok`, carga los pasos que guardó otra pantalla y pasa al siguiente.
   */
  async function guardarYContinuar() {
    if (paso === "revisar" || borrador.enVueloRef.current) return;
    const delPaso = erroresDelPaso();
    if (Object.keys(delPaso).length > 0) {
      mostrarErrores(delPaso, null, paso);
      return;
    }
    setErrores({});
    setRechazo(null);
    const valores = valoresDelPaso(props.modo, paso, form, visibles);
    const res = await borrador.guardar(paso, valores, JSON.stringify(valores));
    switch (res.tipo) {
      case "ocupado":
        return;
      case "errores": {
        // R3: cada error junto a su campo; el que no tiene campo visible (`paso`…), en el aviso del paso.
        const conCampo = new Set(camposEnOrden(props.modo, form, visibles));
        const deCampo = Object.fromEntries(Object.entries(res.fieldErrors).filter(([c]) => conCampo.has(c)));
        const sueltos = Object.entries(res.fieldErrors)
          .filter(([c]) => !conCampo.has(c))
          .flatMap(([, m]) => m);
        mostrarErrores(deCampo, sueltos.length > 0 ? sueltos.join(" ") : null, paso);
        return;
      }
      case "rechazo":
        mostrarErrores({}, textoDelRechazoDeGuardar(res.r), paso);
        return;
      case "ok": {
        const { ajenos } = res;
        if (ajenos !== null) {
          // R12: solo los pasos ajenos toman los valores del servidor; lo escrito en los demás se queda.
          const deOtros = Object.fromEntries(ajenos.pasos.map((p) => [p, ajenos.borrador.pasos[p]]));
          setForm((f) => formDelBorrador(f, deOtros));
          borrador.anotarInstantaneas(instantaneasDe(props, formDelBorrador(form, deOtros), ajenos.pasos));
        }
        const destino = pasos[indice + 1];
        if (destino !== undefined) irA(destino.id);
      }
    }
  }

  /** R20: «Anterior» y la lista de pasos cambian de paso sin validar ni guardar (SLT-144 R5). */
  function anterior() {
    if (borrador.enVueloRef.current) return;
    const destino = pasos[indice - 1];
    if (destino !== undefined) irA(destino.id);
  }

  const elegibles = pasosElegibles(pasos, guardados);

  function alElegirPaso(id: string) {
    if (borrador.enVueloRef.current) return;
    const destino = pasos.find((p) => p.id === id);
    if (destino !== undefined && (destino.id === paso || elegibles.has(destino.id))) irA(destino.id);
  }

  /** R19, R24: el formulario es uno solo; Enter o el botón del pie guardan el paso, y solo el último confirma. */
  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // SLT-144 (R4): con un guardado o la confirmación en vuelo, Enter no hace nada.
    if (borrador.enVueloRef.current) return;
    if (esUltimo) void confirmar();
    else void guardarYContinuar();
  }

  /**
   * SLT-144 (R8, R9): confirma el borrador una sola vez. El resultado es el `PlanResult` de crear o editar y se
   * trata como antes al guardar; además, `pasos_pendientes` lleva al primero que falta y
   * `borrador_no_encontrado` avisa en «Revisar».
   */
  async function confirmar() {
    if (!puedeConfirmar) return;
    setErrores({});
    setRechazo(null);
    // D17: si la vista previa del custom no cargó, no se confirma: el aviso con «Reintentar» ya está en pantalla.
    const res = await borrador.confirmar(vistaPreviaLista);
    if (res.tipo === "cancelado") return;
    if (res.tipo === "fallo") {
      // Un fallo de red o del servidor no da el cambio por hecho (R18): se avisa y el formulario sigue.
      mostrarErrores({}, RECHAZOS.generico);
      return;
    }
    const r = res.r;
    if (r.estado === "ok") {
      props.onGuardado(r, form.nombre.trim());
    } else if (r.estado === "pasos_pendientes") {
      irA(guardables.find((p) => r.pasos.includes(p)) ?? "general");
    } else if (r.estado === "borrador_no_encontrado") {
      mostrarErrores({}, TEXTOS_PLAN_FORM.borradorYaNoExiste);
    } else if (r.estado === "validation_error") {
      mostrarErrores(r.fieldErrors);
    } else {
      // D3: el rechazo junto a su campo cuando lo tiene; el formulario sigue abierto con lo escrito.
      const deCampo = props.modo === "crear" ? rechazoConCampo(r, form) : null;
      if (deCampo !== null) mostrarErrores(deCampo);
      else mostrarErrores({}, mensajeDelRechazo(r));
    }
  }

  /**
   * SLT-144 (R16): descarta el borrador tras confirmarlo en el diálogo. Con éxito, el formulario vuelve a
   * General con los valores de la base, sin pasos guardados ni aviso; si falla, el mensaje queda en el diálogo.
   */
  async function descartarYEmpezar() {
    setErrorDescarte(null);
    const res = await borrador.descartar();
    if (res !== "descartado") {
      setErrorDescarte(textoDelRechazoDeDescartar(res.r));
      return;
    }
    setConfirmandoDescarte(false);
    setForm(formBase(props));
    setErrores({});
    irA("general");
  }

  // Los errores que no tienen un campo VISIBLE donde ir (`_`, `planId`…) se pintan en «Revisar».
  const conCampo = new Set(camposEnOrden(props.modo, form, visibles));
  const sueltos = Object.entries(errores)
    .filter(([clave]) => !conCampo.has(clave))
    .flatMap(([, mensajes]) => mensajes);

  // SLT-135 (R16): al editar, siempre «Programar cambio».
  const textoEnviar = props.modo === "crear" ? TEXTOS_PLAN_FORM.crear : TEXTOS_PLAN_FORM.programar;
  /** SLT-86 (R25): el primer período o tramo que abre el custom y su costo base, si hay fecha y precio válidos. */
  const fechaDelCustom = pideInicioCiclo ? form.inicioCiclo : pideFechaDeEfecto ? form.vigenteDesde : "";
  const precioValido = precioPlanSchema.safeParse(precioDe(form));
  const primerPeriodo =
    props.modo === "crear" && fechaDelCustom !== "" && precioValido.success && esFechaCalendarioValida(fechaDelCustom)
      ? primerPeriodoDelCambio(precioValido.data, form.tipoCobro, fechaDelCustom)
      : null;
  const lineasDelPrimerPeriodo =
    primerPeriodo === null
      ? []
      : [
          TEXTOS_TIPO_COBRO.costoBase(form.tipoCobro, primerPeriodo.costo),
          textoDelPeriodo(form.tipoCobro, primerPeriodo.periodo),
        ];
  const extras =
    props.modo === "crear"
      ? extrasDeGeneral({
          visibilidad: form.visibilidad,
          empresaNombre: empresaElegida?.nombre ?? null,
          tipoCobro: form.tipoCobro,
          fecha: pideInicioCiclo
            ? { campo: "inicioCiclo", valor: form.inicioCiclo }
            : pideFechaDeEfecto
              ? { campo: "rigeDesde", valor: form.vigenteDesde }
              : null,
        })
      : [
          filaDeCuandoRige({
            cambiaPrecio,
            precioDesde: form.precioDesde,
            vigenteDesde: form.vigenteDesde,
          }),
        ];
  const idMotivo = idDe("motivo-bloqueo");
  const idFaltan = idDe("motivo-faltan");
  const puedeConfirmar = faltan.length === 0 && !enVuelo && !creacionBloqueada;
  const motivosDelFinal = [faltan.length > 0 ? idFaltan : null, creacionBloqueada ? idMotivo : null].filter(
    (id) => id !== null,
  );

  const delPaso: PropsDelPaso = {
    modo: props.modo,
    form,
    cambiar,
    setForm,
    idDe,
    errorDe,
    plan: props.modo === "editar" ? props.plan : null,
  };

  function contenido() {
    switch (paso) {
      case "general":
        return (
          <PasoGeneral
            {...delPaso}
            empresas={props.modo === "crear" ? props.empresas : []}
            rangos={
              props.modo === "crear"
                ? { inicioCiclo: props.rangoInicioCiclo, fechaDeEfecto: props.rangoFechaDeEfecto }
                : null
            }
            pideInicioCiclo={pideInicioCiclo}
            pideFechaDeEfecto={pideFechaDeEfecto}
            lineasDelPrimerPeriodo={lineasDelPrimerPeriodo}
          />
        );
      case "precio":
        return <PasoPrecio {...delPaso} descartarErrores={descartarErrores} />;
      case "orden":
        return <PasoCobroPorOrden {...delPaso} />;
      case "topes":
        return (
          <PasoTopes
            {...delPaso}
            vistaPrevia={pideInicioCiclo ? vistaPreviaVigente : undefined}
            onReintentar={reintentarVistaPrevia}
          />
        );
      case "modulos":
        return <PasoModulos {...delPaso} />;
      case "beneficios":
        // SLT-214 (R8–R10): los errores de un beneficio van por su posición; mover o quitar los descarta.
        return <PasoBeneficios {...delPaso} descartarErrores={descartarErrores} />;
      case "niveles":
        // SLT-215 (R8–R10): los errores de un nivel van por su posición; quitarlo los descarta.
        return <PasoNiveles {...delPaso} descartarErrores={descartarErrores} />;
      case "vigencia":
        return (
          <PasoCuandoRigeConFechas
            {...delPaso}
            cambiaPrecio={cambiaPrecio}
            fechas={fechasVigentes}
            onReintentarFechas={reintentarFechas}
          />
        );
      case "revisar":
        return (
          <PasoRevisar
            {...delPaso}
            extras={extras}
            lineasDelPrimerPeriodo={lineasDelPrimerPeriodo}
            textoEnviar={textoEnviar}
            rechazo={rechazo}
            sueltos={sueltos}
            avisoRef={avisoRef}
            bloqueo={creacionBloqueada && vistaPreviaVigente !== null ? (vistaPreviaVigente.fase === "fallo" ? "fallo" : "cargando") : null}
            idMotivo={idMotivo}
            onIrATopes={() => irA("topes")}
            faltan={faltan.map(tituloDe)}
            idFaltan={idFaltan}
            onIrAlPrimeroQueFalta={() => {
              const primero = faltan[0];
              if (primero !== undefined) irA(primero);
            }}
            fechas={fechasVigentes}
            onReintentarFechas={reintentarFechas}
          />
        );
    }
  }

  /** SLT-144 (R3, R7): en los pasos que se guardan, el aviso de borrador y, si lo hay, el rechazo del guardado. */
  function avisosDelPaso() {
    if (paso === "revisar") return null;
    return (
      <div className="mb-4 flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{TEXTOS_PLAN_FORM.avisoBorrador}</p>
        {rechazo !== null ? (
          <Alert
            ref={avisoRef}
            tabIndex={-1}
            variant="destructive"
            className="focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
          >
            <AlertDescription>
              <p>{rechazo}</p>
            </AlertDescription>
          </Alert>
        ) : null}
      </div>
    );
  }

  const { borradorId, actualizadoAt, aviso, retomado } = borrador.estado;

  // «Guardar y continuar» es `submit` para que Enter dentro de un paso intermedio guarde y avance (R19): sin
  // un botón de envío, el navegador no envía el formulario con Enter cuando hay más de un campo. `alEnviar`
  // decide por el paso, así que solo el último confirma. Las `key` distintas impiden que el botón final
  // reutilice el nodo de «Guardar y continuar».
  const pie = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-3">
        {indice > 0 ? (
          <Button type="button" variant="outline" onClick={anterior} disabled={enVuelo}>
            {TEXTOS_PLAN_FORM.anterior}
          </Button>
        ) : null}
        {/* SLT-144 (R7): la hora del último guardado que respondió el servidor. */}
        <span role="status" className="text-xs text-muted-foreground">
          {actualizadoAt === null ? TEXTOS_PLAN_FORM.sinGuardarAun : TEXTOS_PLAN_FORM.guardadoEl(fechaHora(actualizadoAt))}
        </span>
      </div>
      {esUltimo ? (
        <Button
          key="final"
          type="submit"
          loading={enVuelo}
          disabled={!puedeConfirmar}
          aria-describedby={motivosDelFinal.length > 0 ? motivosDelFinal.join(" ") : undefined}
        >
          {textoEnviar}
        </Button>
      ) : (
        <Button key="guardar-y-continuar" type="submit" loading={enVuelo}>
          {TEXTOS_PLAN_FORM.guardarYContinuar}
        </Button>
      )}
    </div>
  );

  return (
    <form
      noValidate
      aria-label={props.modo === "crear" ? TEXTOS_PLAN_FORM.crear : TEXTOS_PLAN_FORM.guardar}
      onSubmit={alEnviar}
      className="flex min-h-0 flex-1 flex-col"
    >
      {/* SLT-144 (R7, R10, R12, R15): el estado del borrador, de quién es y lo que pasó al guardar. */}
      <div className="flex flex-none flex-col gap-2 border-b border-border px-4 py-2">
        <p className="text-sm font-medium">{TEXTOS_PLAN_FORM.estadoBorrador(guardados.size, guardables.length)}</p>
        {borradorId !== null && (retomado !== null || aviso !== null) ? (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <div role="status" className="flex flex-col">
              {retomado !== null ? (
                <span>{TEXTOS_PLAN_FORM.borradorDe(retomado.iniciadoPor, fechaHora(retomado.actualizadoAt))}</span>
              ) : null}
              {aviso !== null ? <span>{aviso}</span> : null}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={enVuelo}
              onClick={() => {
                setErrorDescarte(null);
                setConfirmandoDescarte(true);
              }}
            >
              {TEXTOS_PLAN_FORM.descartarYEmpezar}
            </Button>
          </div>
        ) : null}
      </div>
      <FormularioPorPasos
        pasos={pasos}
        actual={paso}
        elegibles={elegibles}
        guardados={guardados}
        sinGuardar={sinGuardar}
        deshabilitado={enVuelo}
        onIr={alElegirPaso}
        pie={pie}
        tituloRef={tituloRef}
      >
        {avisosDelPaso()}
        {contenido()}
      </FormularioPorPasos>
      <Modal
        open={confirmandoDescarte}
        onOpenChange={setConfirmandoDescarte}
        title={TEXTOS_PLAN_FORM.descartarYEmpezar}
        description={TEXTOS_PLAN_FORM.confirmarDescarte}
        confirmLabel={TEXTOS_PLAN_FORM.descartar}
        cancelLabel={TEXTOS_PLAN_FORM.cancelar}
        confirmVariant="destructive"
        closeOnConfirm={false}
        size="md"
        onConfirm={descartarYEmpezar}
      >
        {errorDescarte !== null ? (
          <p role="alert" className="text-sm text-danger-strong">
            {errorDescarte}
          </p>
        ) : null}
      </Modal>
    </form>
  );
}

/**
 * Ajuste planes-custom (D3) — al crear un custom, los rechazos de la asignación que tienen un campo
 * natural se pintan junto a él: `not_found` en la empresa (SLT-99, decisión del 2026-11-10: ya no hay
 * `plan_sin_costo`, que iba en el costo que faltaba). Sin
 * campo (`tope_excedido`, `forbidden`…), `null`: van al aviso general.
 */
function rechazoConCampo(r: PlanResult, f: Formulario): Errores | null {
  if (f.visibilidad !== "custom") return null;
  if (r.estado === "not_found") return { organizacionId: [RECHAZOS.empresa_no_existe] };
  return null;
}

/**
 * El control enfocable de un campo: el propio elemento si lo es (un `input`, el disparador del
 * `Select`) o, en un grupo (radios, casillas), la opción que tiene el tab-stop o la primera.
 */
function enfocableDentro(el: HTMLElement | null): HTMLElement | null {
  if (!el) return null;
  if (el.matches("input, button, select, textarea")) return el;
  return (
    el.querySelector<HTMLElement>('[role="radio"][tabindex="0"]') ??
    el.querySelector<HTMLElement>('[role="radio"], [role="checkbox"], input:not([type="hidden"]), button')
  );
}
