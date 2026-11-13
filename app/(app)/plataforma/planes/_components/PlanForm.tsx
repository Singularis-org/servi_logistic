"use client";

import { useCallback, useEffect, useId, useRef, useState, type CSSProperties, type FormEvent } from "react";

import { FormularioPorPasos } from "@/components/shared/FormularioPorPasos";
import { primerPeriodoDelCambio, TEXTOS_TIPO_COBRO, textoDelPeriodo } from "@/components/shared/tipo-cobro";
import { Button } from "@/components/ui/button";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { MENSAJE_EDITAR_CAMBIO_A_MEDIAS } from "@/lib/planes/mensajes";
import { cambiaElPrecio, diferenciasDelPlan } from "@/lib/planes/rastro";
import {
  crearPlanSchema,
  editarPlanSchema,
  precioPlanSchema,
  previsualizarCustomSchema,
  type CrearPlanInput,
  type EditarPlanInput,
  type PlanDTO,
  type PlanResult,
  type PrevisualizarCustomInput,
  type TopeExcedido,
  type VistaPreviaCustomResult,
} from "@/lib/types/planes";
import { esFechaCalendarioValida, mananaCalendarioCR } from "@/lib/utils/fecha-cr";

import {
  camposEnOrden,
  erroresDeZod,
  inicial,
  pasoDeLaClave,
  pasosDe,
  precioDe,
  versionDe,
  type CamposVisibles,
  type EmpresaParaCustom,
  type Errores,
  type Formulario,
  type IdPaso,
  type PropsDelPaso,
} from "./plan-form/estado";
import { PasoCobroPorOrden } from "./plan-form/PasoCobroPorOrden";
import { PasoCuandoRige } from "./plan-form/PasoCuandoRige";
import { PasoGeneral } from "./plan-form/PasoGeneral";
import { PasoModulos } from "./plan-form/PasoModulos";
import { PasoPrecio } from "./plan-form/PasoPrecio";
import { PasoRevisar } from "./plan-form/PasoRevisar";
import { PasoTopes } from "./plan-form/PasoTopes";
import { extrasDeGeneral, filaDeCuandoRige } from "./plan-form/revision";
import { TEXTOS_PLAN_FORM } from "./plan-form/textos";

// SLT-130 (design §2): `PlanDetalle.tsx`, `PlanesModule.tsx` y `PlanEmpresa.tsx` siguen importando de aquí.
export { TEXTOS_PLAN_FORM };
export type { EmpresaParaCustom };

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
  // SLT-128 (R16): el texto del formulario de edición. El detalle del plan pinta el de R14 o R15 según la acción.
  cambio_a_medias: MENSAJE_EDITAR_CAMBIO_A_MEDIAS,
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

type PropsComunes = {
  /** Tras un `ok`: quien monta el formulario cierra el panel, relee y avisa. `nombre`, el guardado. */
  onGuardado: (resultado: Extract<PlanResult, { estado: "ok" }>, nombre: string) => void;
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
        /** `crearPlanAction`, inyectada desde la página. */
        enviar: (input: CrearPlanInput) => Promise<PlanResult>;
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
        /** `editarPlanAction`, inyectada desde la página. */
        enviar: (input: EditarPlanInput) => Promise<PlanResult>;
      }
  );

/**
 * SLT-58 (design §6.3; R14, R15, R18) — crear o editar un plan. SLT-130 (design §4): por pasos, con el
 * mismo componente de pasos y los mismos pasos en los dos modos; este componente solo orquesta (estado,
 * navegación, guardar y la vista previa del custom). «Siguiente» valida con el MISMO esquema que la
 * action, solo los campos del paso actual; el botón final valida todo, llama a la action una sola vez y,
 * si hay errores, lleva al paso del primero. «Guardar» se deshabilita mientras la petición está en vuelo.
 */
export function PlanForm(props: PlanFormProps) {
  const base = useId();
  const [form, setForm] = useState<Formulario>(() =>
    inicial(
      props.modo === "editar" ? props.plan : null,
      props.modo === "crear" ? props.inicioCicloPorDefecto : "",
      props.modo === "editar" ? (props.precioDesdePorDefecto ?? mananaCalendarioCR()) : "",
    ),
  );
  const [errores, setErrores] = useState<Errores>({});
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [paso, setPaso] = useState<IdPaso>("general");
  const [visitados, setVisitados] = useState<ReadonlySet<IdPaso>>(() => new Set<IdPaso>(["general"]));
  const enVuelo = useRef(false);
  const avisoRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  /**
   * Adónde llevar el foco tras pintar los errores: la clave del primer campo con error o `null` para el
   * aviso general. Se aplica en un efecto tras pintar los errores, porque el campo y su error tienen que
   * estar ya en el DOM.
   */
  const focoPendiente = useRef<{ clave: string | null } | null>(null);

  const pasos = pasosDe(props.modo);
  const indice = pasos.findIndex((p) => p.id === paso);
  const esUltimo = indice === pasos.length - 1;

  const idDe = (clave: string) => `${base}-${clave.replaceAll(".", "-")}`;
  const errorDe = (clave: string) => errores[clave];
  /**
   * Ajuste planes-custom (D4): «Inicio del ciclo» solo para un custom cuya empresa elegida NO tiene
   * plan. Si ya lo tiene, el campo no aparece y la asignación conserva el ancla, como un cambio de plan.
   */
  const empresaElegida =
    props.modo === "crear" && form.visibilidad === "custom"
      ? (props.empresas ?? []).find((e) => e.id === form.organizacionId)
      : undefined;
  const pideInicioCiclo = empresaElegida !== undefined && !empresaElegida.tienePlan;
  /** SLT-86 (R16, R25): un custom para una empresa que ya tiene plan pide su fecha de efecto. */
  const pideFechaDeEfecto = empresaElegida !== undefined && empresaElegida.tienePlan;
  /**
   * SLT-86 (R22, R23): al editar, cambiar el costo base o un descuento pide «Rige desde» en lugar de
   * «Aplicar»: el precio ya no se edita de inmediato. Se compara en forma canónica, como el rastro.
   */
  const cambiaPrecio =
    props.modo === "editar" &&
    cambiaElPrecio(diferenciasDelPlan(props.plan, { ...props.plan, precio: precioDe(form) }));
  const visibles: CamposVisibles = { pideInicioCiclo, pideFechaDeEfecto, cambiaPrecio };

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

  function irA(destino: IdPaso) {
    setPaso(destino);
    setVisitados((v) => (v.has(destino) ? v : new Set(v).add(destino)));
  }

  /**
   * Pinta los errores y lleva el foco al primero en el orden del formulario, en su paso (R25). Si ninguno
   * tiene un campo visible (solo errores sueltos o un rechazo), al aviso general de «Revisar» (R26).
   */
  function mostrarErrores(nuevos: Errores, nuevoRechazo: string | null = null) {
    setErrores(nuevos);
    setRechazo(nuevoRechazo);
    const primera = camposEnOrden(props.modo, form, visibles).find((clave) => (nuevos[clave]?.length ?? 0) > 0);
    focoPendiente.current = { clave: primera ?? null };
    irA((primera === undefined ? null : pasoDeLaClave(primera, props.modo)) ?? "revisar");
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
   * Valida con el esquema de la action y devuelve la llamada lista para hacer, o los errores de
   * campo si no pasa. El esquema se importa, no se copia: las dos validaciones no pueden divergir.
   */
  function peticion(): { llamar: () => Promise<PlanResult> } | { errores: Errores } {
    const version = versionDe(form);
    if (props.modo === "crear") {
      const { enviar } = props;
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
      return v.success ? { llamar: () => enviar(v.data) } : { errores: erroresDeZod(v.error.issues) };
    }
    const { enviar, plan } = props;
    const v = editarPlanSchema.safeParse({
      ...version,
      planId: plan.id,
      // SLT-86 (R22): un cambio de precio va siempre con su «Rige desde»; lo demás, como SLT-58.
      vigenteDesde: cambiaPrecio ? form.precioDesde : form.aplicar === "inmediato" ? null : form.vigenteDesde,
    });
    return v.success ? { llamar: () => enviar(v.data) } : { errores: erroresDeZod(v.error.issues) };
  }

  /**
   * R18: valida con el esquema completo de la action y se queda solo con los errores de los campos
   * visibles de ESTE paso. Con alguno, no avanza; sin ninguno, limpia los errores y pasa al siguiente.
   * No llama a ninguna action.
   */
  function siguiente() {
    const p = peticion();
    const conCampo = new Set(camposEnOrden(props.modo, form, visibles));
    const delPaso =
      "errores" in p
        ? Object.fromEntries(
            Object.entries(p.errores).filter(([clave]) => conCampo.has(clave) && pasoDeLaClave(clave, props.modo) === paso),
          )
        : {};
    if (Object.keys(delPaso).length > 0) {
      mostrarErrores(delPaso, rechazo);
      return;
    }
    setErrores({});
    const destino = pasos[indice + 1];
    if (destino !== undefined) irA(destino.id);
  }

  /** R20: «Anterior» y la lista de pasos cambian de paso sin validar; lo escrito vive en `form`. */
  function anterior() {
    const destino = pasos[indice - 1];
    if (destino !== undefined) setPaso(destino.id);
  }

  function alElegirPaso(id: string) {
    const destino = pasos.find((p) => p.id === id);
    if (destino !== undefined && visitados.has(destino.id)) setPaso(destino.id);
  }

  /** R19, R24: el formulario es uno solo; Enter o el botón del pie avanzan, y solo el último paso guarda. */
  function alEnviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (esUltimo) void guardar();
    else siguiente();
  }

  async function guardar() {
    if (enVuelo.current || creacionBloqueada) return;
    setErrores({});
    setRechazo(null);

    const p = peticion();
    if ("errores" in p) {
      mostrarErrores(p.errores);
      return;
    }

    enVuelo.current = true;
    setEnviando(true);
    let r: PlanResult | null;
    try {
      // D17: si la vista previa que se leyó al guardar (en la pausa) no cargó, no se crea: el aviso con
      // «Reintentar» ya está en pantalla.
      if (!(await vistaPreviaLista())) {
        enVuelo.current = false;
        setEnviando(false);
        return;
      }
      r = await p.llamar();
    } catch (error) {
      // Un fallo de red o del servidor no da el cambio por hecho (R18): se avisa y el formulario sigue.
      console.error("[PlanForm] la action de guardar lanzó", error);
      r = null;
    }
    enVuelo.current = false;
    setEnviando(false);

    if (r === null) {
      mostrarErrores({}, RECHAZOS.generico);
    } else if (r.estado === "ok") {
      props.onGuardado(r, form.nombre.trim());
    } else if (r.estado === "validation_error") {
      mostrarErrores(r.fieldErrors);
    } else {
      // D3: el rechazo junto a su campo cuando lo tiene; el formulario sigue abierto con lo escrito.
      const deCampo = props.modo === "crear" ? rechazoConCampo(r, form) : null;
      if (deCampo !== null) mostrarErrores(deCampo);
      else mostrarErrores({}, mensajeDelRechazo(r));
    }
  }

  // Los errores que no tienen un campo VISIBLE donde ir (`_`, `planId`…) se pintan en «Revisar».
  const conCampo = new Set(camposEnOrden(props.modo, form, visibles));
  const sueltos = Object.entries(errores)
    .filter(([clave]) => !conCampo.has(clave))
    .flatMap(([, mensajes]) => mensajes);

  const textoEnviar =
    props.modo === "crear"
      ? TEXTOS_PLAN_FORM.crear
      : !cambiaPrecio && form.aplicar === "programado"
        ? TEXTOS_PLAN_FORM.programar
        : TEXTOS_PLAN_FORM.guardar;
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
            aplicar: form.aplicar,
            precioDesde: form.precioDesde,
            vigenteDesde: form.vigenteDesde,
          }),
        ];
  const idMotivo = idDe("motivo-bloqueo");

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
      case "vigencia":
        return <PasoCuandoRige {...delPaso} cambiaPrecio={cambiaPrecio} />;
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
          />
        );
    }
  }

  // «Siguiente» es `submit` para que Enter dentro de un paso intermedio avance (R19): sin un botón de
  // envío, el navegador no envía el formulario con Enter cuando hay más de un campo. `alEnviar` decide
  // por el paso, así que solo el último guarda. Las `key` distintas impiden que el botón final reutilice
  // el nodo de «Siguiente».
  const pie = (
    <div className="flex items-center justify-between gap-2">
      {indice > 0 ? (
        <Button type="button" variant="outline" onClick={anterior}>
          {TEXTOS_PLAN_FORM.anterior}
        </Button>
      ) : (
        <span />
      )}
      {esUltimo ? (
        <Button
          key="final"
          type="submit"
          loading={enviando}
          disabled={creacionBloqueada}
          aria-describedby={creacionBloqueada ? idMotivo : undefined}
        >
          {textoEnviar}
        </Button>
      ) : (
        <Button key="siguiente" type="submit">
          {TEXTOS_PLAN_FORM.siguiente}
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
      <FormularioPorPasos
        pasos={pasos}
        actual={paso}
        visitados={visitados}
        onIr={alElegirPaso}
        pie={pie}
        tituloRef={tituloRef}
      >
        {contenido()}
      </FormularioPorPasos>
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
