"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, type SelectOption } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { FormField } from "@/components/shared/FormField";
import { EmptyState } from "@/components/shared/EmptyState";
import type { EmpresaListada } from "@/lib/types/empresas-plataforma";
import { altaEmpresaInputSchema, type AltaEmpresaInput } from "@/lib/types/organizacion";
import type { AltaEmpresaActionResultado } from "@/lib/actions/organizaciones";

export interface EmpresasModuleProps {
  /** Las empresas, ya ordenadas por el servidor: la pantalla no reordena. */
  empresas: EmpresaListada[];
  /** El catálogo de tipos de documento (`ListarTiposIdentificacionResult`). */
  tiposDocumento: { id: string; value: string }[];
  /**
   * La action de alta de SL-17 (`altaEmpresaAction`), inyectada para poder probarla. Su
   * `no_autorizado` cae en el genérico, como cualquier respuesta que no sea de un campo.
   */
  altaEmpresa: (input: AltaEmpresaInput) => Promise<AltaEmpresaActionResultado>;
}

type Campo =
  | "nombre"
  | "slug"
  | "maestroNombre"
  | "email"
  | "telefono"
  | "tipoDocumento"
  | "documento";

type Formulario = Record<Campo, string>;
type Errores = Partial<Record<Campo, string>>;

const VACIO: Formulario = {
  nombre: "",
  slug: "",
  maestroNombre: "",
  email: "",
  telefono: "",
  tipoDocumento: "",
  documento: "",
};

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  avisoCreada:
    "Empresa creada. El maestro entra con «¿Olvidaste tu contraseña?» y su email.",
  tituloFormulario: "Crear empresa",
  grupoEmpresa: "Empresa",
  grupoMaestro: "Primer maestro",
  nombre: "Nombre",
  slug: "Slug",
  slugAyuda: "minúsculas, números y guiones",
  email: "Email",
  telefono: "Teléfono",
  tipoDocumento: "Tipo de documento",
  documento: "Documento",
  boton: "Crear empresa",
  errorGenerico: "No se pudo crear la empresa. Inténtalo de nuevo.",
  errorSlug: "Ya hay una empresa con ese slug.",
  errorEmail: "Ese email ya pertenece a otro usuario.",
  errorDocumento: "Ese documento ya pertenece a otro usuario.",
  errorCampo: "Revisa este campo.",
  columnaNombre: "Nombre",
  columnaSlug: "Slug",
  columnaAlta: "Alta",
  columnaMaestros: "Maestros",
  sinMaestros: "—",
  vacio: "Aún no hay empresas. Crea la primera con el formulario.",
} as const;

/** El `campo` de `invalida` que manda la action, con y sin el prefijo `maestro.`. */
const CAMPO_DE_LA_ACTION: Record<string, Campo> = {
  nombre: "nombre",
  slug: "slug",
  "maestro.nombre": "maestroNombre",
  "maestro.email": "email",
  "maestro.telefono": "telefono",
  "maestro.documento": "documento",
  "maestro.tipoDocumento": "tipoDocumento",
  email: "email",
  telefono: "telefono",
  documento: "documento",
  tipoDocumento: "tipoDocumento",
};

type Desenlace =
  | { tipo: "creada" }
  | { tipo: "campo"; campo: Campo; mensaje: string }
  | { tipo: "generico" };

/**
 * Traduce lo que devuelve la action a lo que pinta la pantalla. Lee `unknown` a propósito: la
 * respuesta cruza la red, y una fuera del contrato cae en el genérico en vez de romper.
 */
function desenlaceDe(respuesta: unknown): Desenlace {
  if (typeof respuesta !== "object" || respuesta === null) return { tipo: "generico" };
  const r = respuesta as { estado?: unknown; campo?: unknown };
  if (r.estado === "creada") return { tipo: "creada" };
  if (r.estado === "ya_existe") {
    return { tipo: "campo", campo: "slug", mensaje: TEXTOS.errorSlug };
  }
  if (r.estado === "conflicto") {
    if (r.campo === "slug") return { tipo: "campo", campo: "slug", mensaje: TEXTOS.errorSlug };
    if (r.campo === "email") return { tipo: "campo", campo: "email", mensaje: TEXTOS.errorEmail };
    if (r.campo === "documento") {
      return { tipo: "campo", campo: "documento", mensaje: TEXTOS.errorDocumento };
    }
    return { tipo: "generico" };
  }
  if (r.estado === "invalida" && typeof r.campo === "string") {
    const campo = Object.hasOwn(CAMPO_DE_LA_ACTION, r.campo)
      ? CAMPO_DE_LA_ACTION[r.campo]
      : undefined;
    return campo ? { tipo: "campo", campo, mensaje: TEXTOS.errorCampo } : { tipo: "generico" };
  }
  return { tipo: "generico" };
}

/**
 * Valida con el MISMO schema que la action (`lib/types/organizacion.ts`), importado y no copiado
 * (`design.md > Contrato con la action de SL-17`): así el error se ve sin ida y vuelta, y las
 * dos validaciones no pueden divergir. Marca todos los campos rechazados, no solo el primero.
 */
function erroresDeCliente(entrada: AltaEmpresaInput): Errores | null {
  const r = altaEmpresaInputSchema.safeParse(entrada);
  if (r.success) return null;
  const errores: Errores = {};
  for (const issue of r.error.issues) {
    const ruta = issue.path.join(".");
    const campo = Object.hasOwn(CAMPO_DE_LA_ACTION, ruta) ? CAMPO_DE_LA_ACTION[ruta] : undefined;
    if (campo) errores[campo] = TEXTOS.errorCampo;
  }
  // Un rechazo que no se puede señalar en ningún campo lo decide la action, que es la autoridad.
  return Object.keys(errores).length > 0 ? errores : null;
}

const FECHA_CORTA = new Intl.DateTimeFormat("es", { dateStyle: "short" });

/**
 * Pantalla «Empresas» del superadmin (SL-32, R29–R34, R37): el formulario «Crear empresa»,
 * siempre visible, y el listado. Valida con el schema de la action antes de llamarla, y pinta
 * cada error junto a su campo. Nunca maneja contraseñas: el maestro pone la suya con
 * «¿Olvidaste tu contraseña?».
 */
export function EmpresasModule({ empresas, tiposDocumento, altaEmpresa }: EmpresasModuleProps) {
  const router = useRouter();
  const base = useId();
  const [form, setForm] = useState<Formulario>(VACIO);
  const [errores, setErrores] = useState<Errores>({});
  const [errorGenerico, setErrorGenerico] = useState(false);
  const [creada, setCreada] = useState(false);
  const [enviando, setEnviando] = useState(false);

  const opcionesTipo: SelectOption[] = tiposDocumento.map((t) => ({
    value: t.value,
    label: t.value,
  }));

  const idDe = (campo: Campo) => `${base}-${campo}`;

  function cambiar(campo: Campo, valor: string) {
    setForm((f) => ({ ...f, [campo]: valor }));
    // El aviso de la empresa anterior se cierra al empezar a escribir otra (R37).
    setCreada(false);
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErrores({});
    setErrorGenerico(false);
    setCreada(false);

    const entrada: AltaEmpresaInput = {
      nombre: form.nombre,
      slug: form.slug,
      maestro: {
        nombre: form.maestroNombre,
        email: form.email,
        telefono: form.telefono,
        documento: form.documento,
        tipoDocumento: form.tipoDocumento,
      },
    };

    const deCliente = erroresDeCliente(entrada);
    if (deCliente) {
      setErrores(deCliente);
      setEnviando(false);
      return;
    }

    let desenlace: Desenlace;
    try {
      desenlace = desenlaceDe(await altaEmpresa(entrada));
    } catch {
      desenlace = { tipo: "generico" };
    }

    if (desenlace.tipo === "creada") {
      setForm(VACIO);
      setCreada(true);
      router.refresh();
    } else if (desenlace.tipo === "campo") {
      setErrores({ [desenlace.campo]: desenlace.mensaje });
    } else {
      setErrorGenerico(true);
    }
    setEnviando(false);
  }

  const campoTexto = (campo: Campo, label: string, extra?: { type?: string; hint?: string }) => (
    <FormField id={idDe(campo)} label={label} error={errores[campo]} hint={extra?.hint}>
      <Input
        type={extra?.type ?? "text"}
        value={form[campo]}
        onChange={(e) => cambiar(campo, e.target.value)}
      />
    </FormField>
  );

  const idGrupoEmpresa = `${base}-grupo-empresa`;
  const idGrupoMaestro = `${base}-grupo-maestro`;

  return (
    <div className="flex flex-col gap-6">
      {creada ? (
        <Alert role="status">
          <AlertDescription>{TEXTOS.avisoCreada}</AlertDescription>
        </Alert>
      ) : null}

      <form
        noValidate
        aria-label={TEXTOS.tituloFormulario}
        onSubmit={enviar}
        className="flex flex-col gap-6 rounded-md border border-border p-4"
      >
        <fieldset aria-labelledby={idGrupoEmpresa} className="flex flex-col gap-4">
          <h2 id={idGrupoEmpresa} className="text-sm font-medium">
            {TEXTOS.grupoEmpresa}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {campoTexto("nombre", TEXTOS.nombre)}
            {campoTexto("slug", TEXTOS.slug, { hint: TEXTOS.slugAyuda })}
          </div>
        </fieldset>

        <fieldset aria-labelledby={idGrupoMaestro} className="flex flex-col gap-4">
          <h2 id={idGrupoMaestro} className="text-sm font-medium">
            {TEXTOS.grupoMaestro}
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            {campoTexto("maestroNombre", TEXTOS.nombre)}
            {campoTexto("email", TEXTOS.email, { type: "email" })}
            {campoTexto("telefono", TEXTOS.telefono, { type: "tel" })}
            <FormField
              id={idDe("tipoDocumento")}
              label={TEXTOS.tipoDocumento}
              error={errores.tipoDocumento}
            >
              {({ id, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy }) => (
                <Select
                  id={id}
                  aria-label={TEXTOS.tipoDocumento}
                  value={form.tipoDocumento}
                  options={opcionesTipo}
                  onValueChange={(v) => cambiar("tipoDocumento", v)}
                  aria-invalid={ariaInvalid}
                  aria-describedby={ariaDescribedBy}
                />
              )}
            </FormField>
            {campoTexto("documento", TEXTOS.documento)}
          </div>
        </fieldset>

        {errorGenerico ? (
          <Alert variant="destructive">
            <AlertDescription>{TEXTOS.errorGenerico}</AlertDescription>
          </Alert>
        ) : null}

        <div>
          <Button type="submit" loading={enviando}>
            {TEXTOS.boton}
          </Button>
        </div>
      </form>

      <ListadoEmpresas empresas={empresas} />
    </div>
  );
}

/** La tabla del listado (R29), o el estado vacío si aún no hay empresas. */
function ListadoEmpresas({ empresas }: { empresas: EmpresaListada[] }) {
  if (empresas.length === 0) {
    return (
      <div className="rounded-md border border-border">
        <EmptyState title={TEXTOS.vacio} />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{TEXTOS.columnaNombre}</TableHead>
          <TableHead>{TEXTOS.columnaSlug}</TableHead>
          <TableHead>{TEXTOS.columnaAlta}</TableHead>
          <TableHead>{TEXTOS.columnaMaestros}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {empresas.map((empresa) => (
          <TableRow key={empresa.id}>
            <TableCell className="font-medium">{empresa.nombre}</TableCell>
            <TableCell>{empresa.slug}</TableCell>
            <TableCell>{FECHA_CORTA.format(empresa.creadaEn)}</TableCell>
            <TableCell>
              {empresa.maestros.length === 0 ? (
                TEXTOS.sinMaestros
              ) : (
                <ul className="flex flex-col gap-0.5">
                  {empresa.maestros.map((m) => (
                    <li key={m.email}>
                      {m.nombre} · {m.email}
                    </li>
                  ))}
                </ul>
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
