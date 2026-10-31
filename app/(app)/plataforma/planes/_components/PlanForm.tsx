"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import type { ModuloApagable } from "@prisma/client";

import { FormField } from "@/components/shared/FormField";
import { FieldError } from "@/components/shared/FieldError";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select, type SelectOption } from "@/components/ui/select";
import { ROL_LABELS } from "@/lib/auth/rol-label";
import { nombreDelModulo, ORDEN_MODULOS } from "@/lib/modulos/catalogo";
import {
  crearPlanSchema,
  editarPlanSchema,
  ROLES_CON_TOPE,
  type CrearPlanInput,
  type EditarPlanInput,
  type PlanDTO,
  type PlanResult,
  type PrecioPlan,
  type RolConTope,
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
  precio: "Precio informativo",
  sinPrecio: "Sin precio",
  negociable: "Negociable",
  monto: "Con monto",
  mensual: "Monto mensual",
  anual: "Pago anual",
  anualNinguno: "Sin precio anual",
  anualFijo: "Monto anual fijo",
  anualDescuento: "Descuento sobre el anual",
  montoAnual: "Monto anual",
  porcentaje: "Porcentaje de descuento",
  aplicar: "Aplicar",
  inmediato: "De inmediato",
  programado: "A partir de",
  fecha: "Fecha",
  fechaAyuda: "Rige desde las 00:00 de ese día, hora de la plataforma.",
  guardar: "Guardar",
  programar: "Programar cambio",
  crear: "Crear plan",
  revisa: "Revisa los campos marcados.",
} as const;

/** Rechazos de las actions de planes (design §6.5). `validation_error` va junto a su campo. */
const RECHAZOS = {
  forbidden: "No tienes permiso para esto.",
  not_found: "El plan o la empresa ya no existe.",
  archivado: "El plan está archivado.",
  custom_de_otra_empresa: "Ese plan es de otra empresa.",
  sin_cambio_programado: "El plan ya no tiene un cambio pendiente.",
  plan_sin_costo: "Ese plan no tiene costo base y costo por orden concretos: crea un custom con sus precios para asignarlo.",
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
  aplicar: Accion;
  vigenteDesde: string;
};

/** Errores por ruta de zod (`topes.porRol.mensajero`, `precio.mensual`…), como los manda la action. */
type Errores = Record<string, string[]>;

const texto = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n));

function inicial(plan: PlanDTO | null): Formulario {
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
    mensual: precio.tipo === "monto" ? precio.mensual : "",
    anual: anual === null ? "ninguno" : anual.tipo,
    montoAnual: anual?.tipo === "fijo" ? anual.monto : "",
    porcentaje: anual?.tipo === "descuento" ? anual.porcentaje : "",
    aplicar: "inmediato",
    vigenteDesde: "",
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

type PropsComunes = {
  /** Tras un `ok`: quien monta el formulario cierra el panel, relee y avisa. `nombre`, el guardado. */
  onGuardado: (resultado: Extract<PlanResult, { estado: "ok" }>, nombre: string) => void;
};

export type PlanFormProps = PropsComunes &
  (
    | {
        modo: "crear";
        /** Las empresas para un plan custom (`listarEmpresasPlataforma`); `null` si no se pudieron leer. */
        empresas: { id: string; nombre: string }[] | null;
        /** `crearPlanAction`, inyectada desde la página. */
        enviar: (input: CrearPlanInput) => Promise<PlanResult>;
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
  const [form, setForm] = useState<Formulario>(() => inicial(props.modo === "editar" ? props.plan : null));
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
    const primera = camposEnOrden(props.modo, form).find((clave) => (nuevos[clave]?.length ?? 0) > 0);
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
      const v = crearPlanSchema.safeParse({
        ...version,
        visibilidad: form.visibilidad,
        organizacionId: form.visibilidad === "custom" ? form.organizacionId : null,
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
    if (enVuelo.current) return;
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
      mostrarErrores({}, mensajeDelRechazo(r));
    }
  }

  // Los errores que no tienen un campo VISIBLE donde ir (`_`, `planId`…) se pintan arriba del botón.
  const conCampo = new Set(camposEnOrden(props.modo, form));
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
            onValueChange={(v) => cambiar("precio", v === "monto" || v === "negociable" ? v : "sin_precio")}
            options={[
              { value: "sin_precio", label: TEXTOS_PLAN_FORM.sinPrecio },
              { value: "negociable", label: TEXTOS_PLAN_FORM.negociable },
              { value: "monto", label: TEXTOS_PLAN_FORM.monto },
            ]}
          />
        </div>
        <FieldError id={`${idDe("precio")}-error`} messages={errorDe("precio")} />
        {form.precio === "monto" ? (
          <div className="flex flex-col gap-4">
            <FormField id={idDe("precio.mensual")} label={TEXTOS_PLAN_FORM.mensual} error={errorDe("precio.mensual")}>
              <Input inputMode="decimal" value={form.mensual} onChange={(ev) => cambiar("mensual", ev.target.value)} />
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
                <Input
                  inputMode="decimal"
                  value={form.montoAnual}
                  onChange={(ev) => cambiar("montoAnual", ev.target.value)}
                />
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
        <Button type="submit" loading={enviando}>
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
function camposEnOrden(modo: PlanFormProps["modo"], f: Formulario): string[] {
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
  if (modo === "editar" && f.aplicar === "programado") claves.push("vigenteDesde");
  return claves;
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
