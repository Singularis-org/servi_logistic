"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ModuloApagable } from "@prisma/client";

import { AvisosDeTopes, textosDeLosAvisosDeTopes } from "@/components/shared/AvisosDeTopes";
import { FormField } from "@/components/shared/FormField";
import { FieldError } from "@/components/shared/FieldError";
import { MontoInput } from "@/components/shared/MontoInput";
import { TipoCobroCampo } from "@/components/shared/TipoCobroCampo";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select, type SelectOption } from "@/components/ui/select";
import { ROL_LABELS } from "@/lib/auth/rol-label";
import { montoParaCampo } from "@/lib/config/moneda";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import {
  crearPlanSchema,
  editarPlanSchema,
  previsualizarCustomSchema,
  ROLES_CON_TOPE,
  type CrearPlanInput,
  type EditarPlanInput,
  type PlanDTO,
  type PlanResult,
  type PrecioPlan,
  type PrevisualizarCustomInput,
  type RolConTope,
  type TipoCobro,
  type TopeExcedido,
  type VistaPreviaCustomResult,
} from "@/lib/types/planes";

import { TEXTOS_PLAN } from "./plan-vista";

/** Textos del formulario, en un solo sitio para cuando llegue la i18n. */
export const TEXTOS_PLAN_FORM = {
  nombre: "Nombre",
  visibilidad: "Visibilidad",
  publico: "Público",
  custom: "Custom",
  empresa: "Empresa",
  empresaPlaceholder: "Elige la empresa",
  sinEmpresas: "No se pudieron cargar las empresas.",
  topes: "Topes",
  topesAyuda: "Vacío = sin límite.",
  topeVacio: "Sin límite",
  ordenes: "Órdenes por ciclo",
  rol: (rol: RolConTope) => TEXTOS_PLAN.rol(ROL_LABELS[rol]),
  apiKeys: "API keys activas",
  modulos: "Módulos incluidos",
  // SLT-66 (R9): el precio informativo de SL-24 se llama «costo base».
  precio: "Costo base",
  sinPrecio: "Sin precio",
  monto: "Con monto",
  mensual: "Costo base mensual",
  anual: "Pago anual",
  anualNinguno: "Sin precio anual",
  anualFijo: "Monto anual fijo",
  anualDescuento: "Descuento sobre el anual",
  montoAnual: "Monto anual",
  porcentaje: "Porcentaje de descuento",
  costoPorOrden: "Costo por orden",
  costoPorOrdenAyuda: "Vacío: se aplica el valor global de la plataforma.",
  /** SLT-83 (design §6.1; R20): el modo del costo por orden. */
  cobroPorOrden: "Cobro por orden",
  cobroFijo: "Fijo",
  cobroPorcentual: "Porcentual",
  porcentajePorOrden: "Porcentaje",
  sufijoPorcentaje: "%",
  minimoPorOrden: "Mínimo",
  aplicar: "Aplicar",
  inmediato: "De inmediato",
  programado: "A partir de",
  fecha: "Fecha",
  fechaAyuda: "Rige desde las 00:00 de ese día, hora de la plataforma.",
  guardar: "Guardar",
  programar: "Programar cambio",
  crear: "Crear plan",
  /** Ajuste planes-custom (D4): solo si la empresa elegida todavía no tiene plan. */
  inicioCiclo: "Inicio del ciclo de órdenes",
  inicioCicloAyuda: "El ciclo de órdenes de la empresa empieza ese día, hora de la plataforma.",
  revisa: "Revisa los campos marcados.",
  /** Ajuste planes-custom (D13): el mismo texto que el modal de primera asignación (SLT-58 P11). */
  vistaPreviaNoCargo: "No se pudo comprobar el consumo de la empresa",
  /** Ajuste planes-custom (D17): el mismo texto que el modal de primera asignación (SLT-58 P11). */
  reintentar: "Reintentar",
} as const;

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
  | { clave: string; fase: "ok"; avisos: TopeExcedido[]; siguienteCiclo: string }
  | { clave: string; fase: "fallo"; motivo: string[] | null };

/** Rechazos de las actions de planes (design §6.5). `validation_error` va junto a su campo. */
const RECHAZOS = {
  forbidden: "No tienes permiso para esto.",
  not_found: "El plan o la empresa ya no existe.",
  archivado: "El plan está archivado.",
  custom_de_otra_empresa: "Ese plan es de otra empresa.",
  sin_cambio_programado: "El plan ya no tiene un cambio pendiente.",
  plan_sin_costo: "Ese plan no tiene costo base y costo por orden concretos: crea un custom con sus precios para asignarlo.",
  /** Ajuste planes-custom (D3): al crear un custom, el rechazo `plan_sin_costo` va junto a su campo. */
  custom_sin_costo: "Para asignarlo a la empresa, el plan necesita costo base con monto y costo por orden.",
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

type Accion = "inmediato" | "programado";
type AnualForma = "ninguno" | "fijo" | "descuento";
/** SLT-83 (R20): el modo del costo por orden; al abrir un plan sale de `costoPorOrdenPorcentual !== null`. */
type ModoCostoPorOrden = "fijo" | "porcentual";

type Formulario = {
  nombre: string;
  visibilidad: "publico" | "custom";
  organizacionId: string;
  ordenes: string;
  porRol: Record<RolConTope, string>;
  apiKeys: string;
  modulos: ModuloApagable[];
  precio: PrecioPlan["tipo"];
  mensual: string;
  anual: AnualForma;
  montoAnual: string;
  porcentaje: string;
  /** SLT-66 (R7, R23): vacío = sin costo por orden del plan (se aplica el global). */
  costoPorOrden: string;
  /**
   * SLT-83 (design §6.1; R20): el modo elegido. Los campos del otro modo se conservan mientras no se
   * envía (cambiar de modo no borra lo escrito); al enviar, el modo no elegido viaja como `null`.
   */
  modoCosto: ModoCostoPorOrden;
  /** SLT-83 (R20): obligatorio en modo porcentual; lo valida el esquema. */
  porcentajePorOrden: string;
  /** SLT-83 (R20): vacío = sin mínimo. */
  minimoPorOrden: string;
  aplicar: Accion;
  vigenteDesde: string;
  /** Ajuste planes-custom (D6): solo viaja en un custom (se asigna a su empresa al crearlo). */
  tipoCobro: TipoCobro;
  /** Ajuste planes-custom (D4, D5): solo viaja si la empresa elegida no tiene plan. */
  inicioCiclo: string;
};

/** Errores por ruta de zod (`topes.porRol.mensajero`, `precio.mensual`…), como los manda la action. */
type Errores = Record<string, string[]>;

const texto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function inicial(plan: PlanDTO | null, inicioCiclo: string): Formulario {
  const precio = plan?.precio ?? { tipo: "sin_precio" };
  const anual = precio.tipo === "monto" ? precio.anual : null;
  return {
    nombre: plan?.nombre ?? "",
    visibilidad: plan?.visibilidad ?? "publico",
    organizacionId: plan?.organizacionId ?? "",
    ordenes: texto(plan?.topes.ordenesPorCiclo),
    porRol: Object.fromEntries(ROLES_CON_TOPE.map((r) => [r, texto(plan?.topes.porRol[r])])) as Record<
      RolConTope,
      string
    >,
    apiKeys: texto(plan?.topes.apiKeys),
    modulos: plan?.modulos ?? [],
    precio: precio.tipo,
    mensual: precio.tipo === "monto" ? montoParaCampo(precio.mensual) : "",
    anual: anual === null ? "ninguno" : anual.tipo,
    montoAnual: anual?.tipo === "fijo" ? montoParaCampo(anual.monto) : "",
    porcentaje: anual?.tipo === "descuento" ? anual.porcentaje : "",
    costoPorOrden: plan?.costoPorOrden == null ? "" : montoParaCampo(plan.costoPorOrden),
    modoCosto: plan?.costoPorOrdenPorcentual == null ? "fijo" : "porcentual",
    porcentajePorOrden: plan?.costoPorOrdenPorcentual?.porcentaje ?? "",
    minimoPorOrden:
      plan?.costoPorOrdenPorcentual?.minimo == null ? "" : montoParaCampo(plan.costoPorOrdenPorcentual.minimo),
    aplicar: "inmediato",
    vigenteDesde: "",
    tipoCobro: "mensual",
    inicioCiclo,
  };
}

/** Un tope del formulario: vacío = sin límite (`null`); lo demás lo valida el esquema. */
function tope(valor: string): number | null {
  return valor.trim() === "" ? null : Number(valor.trim());
}

function precioDe(f: Formulario): PrecioPlan {
  if (f.precio !== "monto") return { tipo: f.precio };
  const anual =
    f.anual === "ninguno"
      ? null
      : f.anual === "fijo"
        ? { tipo: "fijo" as const, monto: f.montoAnual.trim() }
        : { tipo: "descuento" as const, porcentaje: f.porcentaje.trim() };
  return { tipo: "monto", mensual: f.mensual.trim(), anual };
}

function versionDe(f: Formulario) {
  const porRol: Partial<Record<RolConTope, number>> = {};
  for (const rol of ROLES_CON_TOPE) {
    const maximo = tope(f.porRol[rol]);
    if (maximo !== null) porRol[rol] = maximo;
  }
  return {
    nombre: f.nombre,
    topes: { ordenesPorCiclo: tope(f.ordenes), porRol, apiKeys: tope(f.apiKeys) },
    // En el orden de pantalla, sea cual sea el orden en que se marcaron.
    modulos: ORDEN_MODULOS.filter((m) => f.modulos.includes(m)),
    precio: precioDe(f),
    // SLT-83 (R20): solo viajan los datos del modo elegido; el otro, `null`.
    costoPorOrden: f.modoCosto === "fijo" && f.costoPorOrden.trim() !== "" ? f.costoPorOrden.trim() : null,
    costoPorOrdenPorcentual:
      f.modoCosto === "porcentual"
        ? {
            porcentaje: f.porcentajePorOrden.trim(),
            minimo: f.minimoPorOrden.trim() === "" ? null : f.minimoPorOrden.trim(),
          }
        : null,
  };
}

/** Los errores de zod en el cliente, con las mismas rutas que los `fieldErrors` de la action. */
function erroresDeZod(issues: readonly { path: readonly PropertyKey[]; message: string }[]): Errores {
  const errores: Errores = {};
  for (const issue of issues) {
    const clave = issue.path.length > 0 ? issue.path.map(String).join(".") : "_";
    (errores[clave] ??= []).push(issue.message);
  }
  return errores;
}

/** Una empresa del selector del plan custom (ajuste planes-custom, D4). */
export type EmpresaParaCustom = { id: string; nombre: string; tienePlan: boolean };

type PropsComunes = {
  /**
   * Tras un `ok`: quien monta el formulario cierra el panel, relee y avisa. `nombre`, el guardado.
   * `siguienteCiclo` (ajuste planes-custom, D12): al crear un custom con fecha, el día del siguiente
   * ciclo que dio la vista previa, para redactar los `avisos` como el modal; `null` si no se leyó.
   */
  onGuardado: (resultado: Extract<PlanResult, { estado: "ok" }>, nombre: string, siguienteCiclo: string | null) => void;
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
        /** `editarPlanAction`, inyectada desde la página. */
        enviar: (input: EditarPlanInput) => Promise<PlanResult>;
      }
  );

/**
 * SLT-58 (design §6.3; R14, R15, R18) — crear o editar un plan. Al crear pide la visibilidad (solo
 * «Público» o «Custom»: no hay un tipo «enterprise») y, si es custom, la empresa. Al editar, en vez
 * de la visibilidad (que no se edita, SL-24 R2) pide cuándo aplicar: de inmediato o a partir de una
 * fecha. Valida con el MISMO esquema que la action antes de llamarla y pinta cada error junto a su
 * campo, venga del cliente o de la action. «Guardar» se deshabilita mientras la petición está en vuelo.
 */
export function PlanForm(props: PlanFormProps) {
  const base = useId();
  const [form, setForm] = useState<Formulario>(() =>
    inicial(props.modo === "editar" ? props.plan : null, props.modo === "crear" ? props.inicioCicloPorDefecto : ""),
  );
  const [errores, setErrores] = useState<Errores>({});
  const [rechazo, setRechazo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const enVuelo = useRef(false);
  const avisoRef = useRef<HTMLDivElement>(null);
  /**
   * Adónde llevar el foco tras pintar los errores: la clave del primer campo con error o `null` para el
   * aviso general. Se aplica en un efecto tras pintar los errores, porque el campo y su error tienen que
   * estar ya en el DOM.
   */
  const focoPendiente = useRef<{ clave: string | null } | null>(null);

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
  const lecturaEnVuelo = useRef<{ clave: string; promesa: Promise<string | null> } | null>(null);
  const esperaPrevia = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * D13: lee la vista previa de esa entrada y la pinta si sigue vigente. Devuelve el día del siguiente
   * ciclo (o `null` si no se pudo leer) para redactar los avisos del `ok` al crear (D12).
   */
  const leerVistaPrevia = useCallback(
    (entrada: PrevisualizarCustomInput, clave: string): Promise<string | null> => {
      if (previsualizar === null) return Promise.resolve(null);
      if (lecturaEnVuelo.current?.clave === clave) return lecturaEnVuelo.current.promesa;
      setVistaPrevia({ clave, fase: "cargando" });
      const promesa = (async () => {
        try {
          const r = await previsualizar(entrada);
          if (claveVigente.current === clave) {
            setVistaPrevia(
              r.estado === "ok"
                ? { clave, fase: "ok", avisos: r.avisos, siguienteCiclo: r.siguienteCiclo }
                : {
                    clave,
                    fase: "fallo",
                    motivo: r.estado === "validation_error" ? (r.fieldErrors.inicioCiclo ?? null) : null,
                  },
            );
          }
          return r.estado === "ok" ? r.siguienteCiclo : null;
        } catch (error) {
          console.error("[PlanForm] previsualizar lanzó", error);
          if (claveVigente.current === clave) setVistaPrevia({ clave, fase: "fallo", motivo: null });
          return null;
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
   * D12: el día del siguiente ciclo para los avisos del `ok` de un custom con fecha. Se reutiliza la
   * vista previa ya leída de esta entrada; si no la hay (se guardó durante la pausa), se lee ahora:
   * después de crear, la empresa ya tiene plan y la vista previa la rechazaría (R31).
   */
  async function siguienteCicloParaGuardar(): Promise<string | null> {
    if (entradaPrevia === null || clavePrevia === null) return null;
    if (vistaPreviaVigente?.fase === "ok") return vistaPreviaVigente.siguienteCiclo;
    if (esperaPrevia.current !== null) {
      clearTimeout(esperaPrevia.current);
      esperaPrevia.current = null;
    }
    return leerVistaPrevia(entradaPrevia, clavePrevia);
  }

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

  /**
   * Pinta los errores y lleva el foco al primero en el orden del formulario. Si ninguno tiene un campo
   * visible (solo errores sueltos o un rechazo), al aviso general.
   */
  function mostrarErrores(nuevos: Errores, nuevoRechazo: string | null = null) {
    setErrores(nuevos);
    setRechazo(nuevoRechazo);
    const primera = camposEnOrden(props.modo, form, pideInicioCiclo).find((clave) => (nuevos[clave]?.length ?? 0) > 0);
    focoPendiente.current = { clave: primera ?? null };
  }

  function cambiar<K extends keyof Formulario>(campo: K, valor: Formulario[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  function alternarModulo(modulo: ModuloApagable, marcado: boolean) {
    setForm((f) => ({
      ...f,
      modulos: marcado ? [...f.modulos, modulo] : f.modulos.filter((m) => m !== modulo),
    }));
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
      });
      return v.success ? { llamar: () => enviar(v.data) } : { errores: erroresDeZod(v.error.issues) };
    }
    const { enviar, plan } = props;
    const v = editarPlanSchema.safeParse({
      ...version,
      planId: plan.id,
      vigenteDesde: form.aplicar === "inmediato" ? null : form.vigenteDesde,
    });
    return v.success ? { llamar: () => enviar(v.data) } : { errores: erroresDeZod(v.error.issues) };
  }

  async function guardar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
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
    let siguienteCiclo: string | null = null;
    try {
      siguienteCiclo = await siguienteCicloParaGuardar();
      // D17: si la vista previa que se leyó al guardar (en la pausa) no cargó, no se crea: el aviso con
      // «Reintentar» ya está en pantalla.
      if (entradaPrevia !== null && siguienteCiclo === null) {
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
      props.onGuardado(r, form.nombre.trim(), siguienteCiclo);
    } else if (r.estado === "validation_error") {
      mostrarErrores(r.fieldErrors);
    } else {
      // D3: el rechazo junto a su campo cuando lo tiene; el formulario sigue abierto con lo escrito.
      const deCampo = props.modo === "crear" ? rechazoConCampo(r, form) : null;
      if (deCampo !== null) mostrarErrores(deCampo);
      else mostrarErrores({}, mensajeDelRechazo(r));
    }
  }

  // Los errores que no tienen un campo VISIBLE donde ir (`_`, `planId`…) se pintan arriba del botón.
  const conCampo = new Set(camposEnOrden(props.modo, form, pideInicioCiclo));
  const sueltos = Object.entries(errores)
    .filter(([clave]) => !conCampo.has(clave))
    .flatMap(([, mensajes]) => mensajes);

  const idAyudaTopes = idDe("topes-ayuda");
  // Cada tope enlaza la ayuda «Vacío = sin límite» (además del placeholder): el lector de pantalla la
  // oye en el propio campo, no solo al pasar por el párrafo.
  const campoTope = (clave: string, label: ReactNode, valor: string, onCambio: (v: string) => void) => (
    <FormField id={idDe(clave)} label={label} error={errorDe(clave)}>
      <Input
        inputMode="numeric"
        placeholder={TEXTOS_PLAN_FORM.topeVacio}
        aria-describedby={idAyudaTopes}
        value={valor}
        onChange={(ev) => onCambio(ev.target.value)}
      />
    </FormField>
  );

  const empresas = props.modo === "crear" ? props.empresas : [];
  const opcionesEmpresa: SelectOption[] = (empresas ?? []).map((e) => ({ value: e.id, label: e.nombre }));
  const idSinEmpresas = idDe("sin-empresas");
  const textoEnviar =
    props.modo === "crear"
      ? TEXTOS_PLAN_FORM.crear
      : form.aplicar === "programado"
        ? TEXTOS_PLAN_FORM.programar
        : TEXTOS_PLAN_FORM.guardar;

  return (
    <form
      noValidate
      aria-label={props.modo === "crear" ? TEXTOS_PLAN_FORM.crear : TEXTOS_PLAN_FORM.guardar}
      onSubmit={(ev) => void guardar(ev)}
      className="flex flex-col gap-6"
    >
      <FormField id={idDe("nombre")} label={TEXTOS_PLAN_FORM.nombre} error={errorDe("nombre")} required>
        <Input value={form.nombre} onChange={(ev) => cambiar("nombre", ev.target.value)} maxLength={80} />
      </FormField>

      {props.modo === "crear" ? (
        <div className="flex flex-col gap-4">
          <FormField id={idDe("visibilidad")} label={TEXTOS_PLAN_FORM.visibilidad} error={errorDe("visibilidad")}>
            {(control) => (
              // El `id` va en el contenedor para poder llevar el foco al grupo si tiene error.
              <div id={control.id}>
                <RadioGroup
                  aria-label={TEXTOS_PLAN_FORM.visibilidad}
                  aria-invalid={control["aria-invalid"]}
                  aria-describedby={control["aria-describedby"]}
                  value={form.visibilidad}
                  onValueChange={(v) => cambiar("visibilidad", v === "custom" ? "custom" : "publico")}
                  options={[
                    { value: "publico", label: TEXTOS_PLAN_FORM.publico },
                    { value: "custom", label: TEXTOS_PLAN_FORM.custom },
                  ]}
                />
              </div>
            )}
          </FormField>
          {form.visibilidad === "custom" ? (
            <FormField id={idDe("organizacionId")} label={TEXTOS_PLAN_FORM.empresa} error={errorDe("organizacionId")}>
              {(control) => (
                <>
                  <Select
                    id={control.id}
                    aria-label={TEXTOS_PLAN_FORM.empresa}
                    aria-invalid={control["aria-invalid"]}
                    aria-describedby={
                      [control["aria-describedby"], empresas === null ? idSinEmpresas : undefined]
                        .filter(Boolean)
                        .join(" ") || undefined
                    }
                    value={form.organizacionId}
                    options={opcionesEmpresa}
                    placeholder={TEXTOS_PLAN_FORM.empresaPlaceholder}
                    onValueChange={(v) => cambiar("organizacionId", v)}
                  />
                  {empresas === null ? (
                    <p id={idSinEmpresas} className="text-sm text-danger-strong">
                      {TEXTOS_PLAN_FORM.sinEmpresas}
                    </p>
                  ) : null}
                </>
              )}
            </FormField>
          ) : null}
        </div>
      ) : null}

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.topes}</legend>
        <p id={idAyudaTopes} className="text-sm text-muted-foreground">
          {TEXTOS_PLAN_FORM.topesAyuda}
        </p>
        {/* Una sola columna: en el panel (~480 px) dos columnas parten las etiquetas de rol en varias líneas. */}
        <div className="flex flex-col gap-4">
          {campoTope("topes.ordenesPorCiclo", TEXTOS_PLAN_FORM.ordenes, form.ordenes, (v) => cambiar("ordenes", v))}
          {ROLES_CON_TOPE.map((rol) => (
            <div key={rol}>
              {campoTope(`topes.porRol.${rol}`, TEXTOS_PLAN_FORM.rol(rol), form.porRol[rol], (v) =>
                setForm((f) => ({ ...f, porRol: { ...f.porRol, [rol]: v } })),
              )}
            </div>
          ))}
          {campoTope("topes.apiKeys", TEXTOS_PLAN_FORM.apiKeys, form.apiKeys, (v) => cambiar("apiKeys", v))}
        </div>
      </fieldset>

      <fieldset
        id={idDe("modulos")}
        className="flex flex-col gap-3"
        aria-describedby={errorDe("modulos") ? `${idDe("modulos")}-error` : undefined}
      >
        <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.modulos}</legend>
        <ul className="flex flex-col gap-2">
          {ORDEN_MODULOS.map((modulo) => {
            const id = idDe(`modulo-${modulo}`);
            return (
              <li key={modulo} className="flex min-h-11 items-center gap-2 text-sm">
                <Checkbox
                  id={id}
                  checked={form.modulos.includes(modulo)}
                  onCheckedChange={(marcado) => alternarModulo(modulo, marcado === true)}
                />
                <label htmlFor={id} className="cursor-pointer">
                  {nombreDelModulo(modulo)}
                </label>
              </li>
            );
          })}
        </ul>
        <FieldError id={`${idDe("modulos")}-error`} messages={errorDe("modulos")} />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.precio}</legend>
        <div id={idDe("precio")}>
          <RadioGroup
            aria-label={TEXTOS_PLAN_FORM.precio}
            aria-invalid={Boolean(errorDe("precio"))}
            aria-describedby={errorDe("precio") ? `${idDe("precio")}-error` : undefined}
            value={form.precio}
            onValueChange={(v) => cambiar("precio", v === "monto" ? "monto" : "sin_precio")}
            options={[
              { value: "sin_precio", label: TEXTOS_PLAN_FORM.sinPrecio },
              { value: "monto", label: TEXTOS_PLAN_FORM.monto },
            ]}
          />
        </div>
        <FieldError id={`${idDe("precio")}-error`} messages={errorDe("precio")} />
        {form.precio === "monto" ? (
          <div className="flex flex-col gap-4">
            <FormField id={idDe("precio.mensual")} label={TEXTOS_PLAN_FORM.mensual} error={errorDe("precio.mensual")}>
              <MontoInput value={form.mensual} onChange={(v) => cambiar("mensual", v)} />
            </FormField>
            {/* Título visible: sin él, los tres radios aparecen sin contexto bajo «Monto mensual». */}
            <fieldset id={idDe("precio.anual")} className="flex flex-col gap-2">
              <legend className="mb-2 text-sm font-medium">{TEXTOS_PLAN_FORM.anual}</legend>
              <RadioGroup
                aria-label={TEXTOS_PLAN_FORM.anual}
                aria-invalid={Boolean(errorDe("precio.anual"))}
                aria-describedby={errorDe("precio.anual") ? `${idDe("precio.anual")}-error` : undefined}
                value={form.anual}
                onValueChange={(v) => cambiar("anual", v === "fijo" || v === "descuento" ? v : "ninguno")}
                options={[
                  { value: "ninguno", label: TEXTOS_PLAN_FORM.anualNinguno },
                  { value: "fijo", label: TEXTOS_PLAN_FORM.anualFijo },
                  { value: "descuento", label: TEXTOS_PLAN_FORM.anualDescuento },
                ]}
              />
              <FieldError id={`${idDe("precio.anual")}-error`} messages={errorDe("precio.anual")} />
            </fieldset>
            {form.anual === "fijo" ? (
              <FormField
                id={idDe("precio.anual.monto")}
                label={TEXTOS_PLAN_FORM.montoAnual}
                error={errorDe("precio.anual.monto")}
              >
                <MontoInput value={form.montoAnual} onChange={(v) => cambiar("montoAnual", v)} />
              </FormField>
            ) : null}
            {form.anual === "descuento" ? (
              <FormField
                id={idDe("precio.anual.porcentaje")}
                label={TEXTOS_PLAN_FORM.porcentaje}
                error={errorDe("precio.anual.porcentaje")}
              >
                <Input
                  inputMode="decimal"
                  value={form.porcentaje}
                  onChange={(ev) => cambiar("porcentaje", ev.target.value)}
                />
              </FormField>
            ) : null}
          </div>
        ) : null}
      </fieldset>

      {/* SLT-66 (R7, R23): fuera del grupo «Costo base», porque no depende de su forma. SLT-83 (R20): con
          su modo, «Fijo» o «Porcentual». */}
      <fieldset className="flex flex-col gap-4">
        <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.cobroPorOrden}</legend>
        <RadioGroup
          aria-label={TEXTOS_PLAN_FORM.cobroPorOrden}
          value={form.modoCosto}
          onValueChange={(v) => cambiar("modoCosto", v === "porcentual" ? "porcentual" : "fijo")}
          options={[
            { value: "fijo", label: TEXTOS_PLAN_FORM.cobroFijo },
            { value: "porcentual", label: TEXTOS_PLAN_FORM.cobroPorcentual },
          ]}
        />
        {form.modoCosto === "fijo" ? (
          <FormField
            id={idDe("costoPorOrden")}
            label={TEXTOS_PLAN_FORM.costoPorOrden}
            hint={TEXTOS_PLAN_FORM.costoPorOrdenAyuda}
            error={errorDe("costoPorOrden")}
          >
            <MontoInput value={form.costoPorOrden} onChange={(v) => cambiar("costoPorOrden", v)} />
          </FormField>
        ) : (
          <div className="flex flex-col gap-4">
            <FormField
              id={idDe("costoPorOrdenPorcentual.porcentaje")}
              label={TEXTOS_PLAN_FORM.porcentajePorOrden}
              error={errorDe("costoPorOrdenPorcentual.porcentaje")}
              required
            >
              {(control) => (
                <div className="flex items-center gap-2">
                  <Input
                    {...control}
                    inputMode="decimal"
                    value={form.porcentajePorOrden}
                    onChange={(ev) => cambiar("porcentajePorOrden", ev.target.value)}
                  />
                  {/* El sufijo es visual: la etiqueta ya dice «Porcentaje». */}
                  <span aria-hidden="true" className="text-sm text-muted-foreground">
                    {TEXTOS_PLAN_FORM.sufijoPorcentaje}
                  </span>
                </div>
              )}
            </FormField>
            <FormField
              id={idDe("costoPorOrdenPorcentual.minimo")}
              label={TEXTOS_PLAN_FORM.minimoPorOrden}
              error={errorDe("costoPorOrdenPorcentual.minimo")}
            >
              <MontoInput value={form.minimoPorOrden} onChange={(v) => cambiar("minimoPorOrden", v)} />
            </FormField>
          </div>
        )}
      </fieldset>

      {/* Ajuste planes-custom (D2, D4–D6): el custom se asigna a su empresa al crearlo. */}
      {props.modo === "crear" && form.visibilidad === "custom" ? (
        <div className="flex flex-col gap-4">
          <TipoCobroCampo
            id={idDe("tipoCobro")}
            value={form.tipoCobro}
            onValueChange={(t) => cambiar("tipoCobro", t)}
            error={errorDe("tipoCobro")}
          />
          {pideInicioCiclo ? (
            <FormField
              id={idDe("inicioCiclo")}
              label={TEXTOS_PLAN_FORM.inicioCiclo}
              hint={TEXTOS_PLAN_FORM.inicioCicloAyuda}
              error={errorDe("inicioCiclo")}
            >
              <Input
                type="date"
                value={form.inicioCiclo}
                min={props.rangoInicioCiclo.min}
                max={props.rangoInicioCiclo.max}
                onChange={(ev) => cambiar("inicioCiclo", ev.target.value)}
              />
            </FormField>
          ) : null}
          {/* D13: la vista previa de SLT-58 R37 con los topes del formulario. D17: si no carga, bloquea
              «Crear plan» y ofrece «Reintentar», como el modal de primera asignación (P11). */}
          {pideInicioCiclo ? (
            <div aria-live="polite" aria-busy={vistaPreviaVigente?.fase === "cargando"}>
              {vistaPreviaVigente?.fase === "ok" && vistaPreviaVigente.avisos.length > 0 ? (
                <AvisosDeTopes
                  avisos={textosDeLosAvisosDeTopes(vistaPreviaVigente.avisos, vistaPreviaVigente.siguienteCiclo)}
                />
              ) : vistaPreviaVigente?.fase === "fallo" ? (
                <Alert variant="destructive">
                  <AlertDescription>
                    <p>{TEXTOS_PLAN_FORM.vistaPreviaNoCargo}</p>
                    {(vistaPreviaVigente.motivo ?? []).map((m) => (
                      <p key={m}>{m}</p>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="mt-2" onClick={reintentarVistaPrevia}>
                      {TEXTOS_PLAN_FORM.reintentar}
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      {props.modo === "editar" ? (
        <fieldset className="flex flex-col gap-4">
          <legend className="text-sm font-medium">{TEXTOS_PLAN_FORM.aplicar}</legend>
          <RadioGroup
            aria-label={TEXTOS_PLAN_FORM.aplicar}
            value={form.aplicar}
            onValueChange={(v) => cambiar("aplicar", v === "programado" ? "programado" : "inmediato")}
            options={[
              { value: "inmediato", label: TEXTOS_PLAN_FORM.inmediato },
              { value: "programado", label: TEXTOS_PLAN_FORM.programado },
            ]}
          />
          {form.aplicar === "programado" ? (
            <FormField
              id={idDe("vigenteDesde")}
              label={TEXTOS_PLAN_FORM.fecha}
              hint={TEXTOS_PLAN_FORM.fechaAyuda}
              error={errorDe("vigenteDesde")}
            >
              <Input type="date" value={form.vigenteDesde} onChange={(ev) => cambiar("vigenteDesde", ev.target.value)} />
            </FormField>
          ) : null}
        </fieldset>
      ) : null}

      {rechazo !== null || sueltos.length > 0 ? (
        <Alert
          ref={avisoRef}
          tabIndex={-1}
          variant="destructive"
          className="focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          <AlertDescription>
            {rechazo !== null ? <p>{rechazo}</p> : null}
            {sueltos.map((m, i) => (
              <p key={i}>{m}</p>
            ))}
          </AlertDescription>
        </Alert>
      ) : null}

      {/* Pie fijo al fondo del panel: en móvil no hay que bajar todo el formulario para enviar. El margen
          negativo cubre el `px-4 pb-4` del contenedor del `Sheet` para que el fondo tape lo que pasa debajo. */}
      <div className="sticky bottom-0 -mx-4 -mb-4 border-t border-border bg-popover px-4 py-4">
        <Button type="submit" loading={enviando} disabled={creacionBloqueada}>
          {textoEnviar}
        </Button>
      </div>
    </form>
  );
}

/**
 * Las rutas de error que tienen un campo propio y visible ahora mismo, EN EL ORDEN DE PANTALLA (el foco
 * va al primero con error). El resto va al aviso general, para que ningún rechazo se quede sin pintar
 * por caer en un campo oculto.
 */
function camposEnOrden(modo: PlanFormProps["modo"], f: Formulario, pideInicioCiclo: boolean): string[] {
  const claves = ["nombre"];
  if (modo === "crear") claves.push("visibilidad");
  if (modo === "crear" && f.visibilidad === "custom") claves.push("organizacionId");
  claves.push(
    "topes.ordenesPorCiclo",
    ...ROLES_CON_TOPE.map((r) => `topes.porRol.${r}`),
    "topes.apiKeys",
    "modulos",
    "precio",
  );
  if (f.precio === "monto") claves.push("precio.mensual", "precio.anual");
  if (f.precio === "monto" && f.anual === "fijo") claves.push("precio.anual.monto");
  if (f.precio === "monto" && f.anual === "descuento") claves.push("precio.anual.porcentaje");
  if (f.modoCosto === "fijo") claves.push("costoPorOrden");
  else claves.push("costoPorOrdenPorcentual.porcentaje", "costoPorOrdenPorcentual.minimo");
  if (modo === "crear" && f.visibilidad === "custom") claves.push("tipoCobro");
  if (modo === "crear" && pideInicioCiclo) claves.push("inicioCiclo");
  if (modo === "editar" && f.aplicar === "programado") claves.push("vigenteDesde");
  return claves;
}

/**
 * Ajuste planes-custom (D3) — al crear un custom, los rechazos de la asignación que tienen un campo
 * natural se pintan junto a él: `plan_sin_costo` en el costo que falta, `not_found` en la empresa. Sin
 * campo (`tope_excedido`, `forbidden`…), `null`: van al aviso general.
 */
function rechazoConCampo(r: PlanResult, f: Formulario): Errores | null {
  if (f.visibilidad !== "custom") return null;
  if (r.estado === "not_found") return { organizacionId: [RECHAZOS.empresa_no_existe] };
  if (r.estado === "plan_sin_costo") {
    // SLT-83: en modo porcentual el porcentaje es obligatorio, así que lo que falta es la base.
    const clave =
      f.precio !== "monto"
        ? "precio"
        : f.modoCosto === "fijo" && f.costoPorOrden.trim() === ""
          ? "costoPorOrden"
          : null;
    return clave === null ? null : { [clave]: [RECHAZOS.custom_sin_costo] };
  }
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
