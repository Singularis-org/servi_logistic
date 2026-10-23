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

/*
 * Contrato de la action de alta de SL-17 (§7.7). Es PROVISIONAL: SL-17 aún no está en la rama.
 * T15 cambia estos dos tipos por el import de `lib/types/organizacion.ts`.
 */
export interface AltaEmpresaEntrada {
  nombre: string;
  slug: string;
  maestro: {
    nombre: string;
    email: string;
    telefono: string;
    documento: string;
    /** El `value` del catálogo `tipo_identificacion` (`cedula`, `ruc`, `pasaporte`). */
    tipoDocumento: string;
  };
}

export type AltaEmpresaRespuesta =
  | { estado: "creada"; organizacionId: string; maestroId: string }
  | { estado: "ya_existe"; organizacionId: string }
  | { estado: "conflicto"; campo: "slug" | "email" | "documento" }
  | { estado: "invalida"; campo: string };

export interface EmpresasModuleProps {
  /** Las empresas, ya ordenadas por el servidor: la pantalla no reordena. */
  empresas: EmpresaListada[];
  /** El catálogo de tipos de documento (`ListarTiposIdentificacionResult`). */
  tiposDocumento: { id: string; value: string }[];
  /** La action de alta de SL-17, inyectada para poder probarla. */
  altaEmpresa: (input: AltaEmpresaEntrada) => Promise<AltaEmpresaRespuesta>;
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
 * Traduce lo que devuelve la action a lo que pinta la pantalla. Lee `unknown` a propósito:
 * una respuesta fuera del contrato (p. ej. «no autorizado», cuya forma aún no se conoce) cae
 * en el genérico en vez de romper.
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

const FECHA_CORTA = new Intl.DateTimeFormat("es", { dateStyle: "short" });

/**
 * Pantalla «Empresas» del superadmin (SL-32, R29–R34, R37): el formulario «Crear empresa»,
 * siempre visible, y el listado. No valida en el cliente: valida la action, y la pantalla pinta
 * cada error junto a su campo. Nunca maneja contraseñas: el maestro pone la suya con
 * «¿Olvidaste tu contraseña?».
 *
 * @sin-superficie pantalla «Empresas» de SL-32 (T13) escrita antes que su página: la monta `app/(app)/plataforma/empresas/page.tsx` en T15, cuando SL-17 (esPlataforma, rol superadmin, altaEmpresaAction) esté en `dev`; entonces esta anotación sobra y la guardia exige quitarla.
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

    let desenlace: Desenlace;
    try {
      desenlace = desenlaceDe(
        await altaEmpresa({
          nombre: form.nombre,
          slug: form.slug,
          maestro: {
            nombre: form.maestroNombre,
            email: form.email,
            telefono: form.telefono,
            documento: form.documento,
            tipoDocumento: form.tipoDocumento,
          },
        }),
      );
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
