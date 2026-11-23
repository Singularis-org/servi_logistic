"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import type { ZodError } from "zod";

import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import {
  agregarNivelPaisAction,
  renombrarTipoNivelAction,
  reordenarTiposAction,
} from "@/lib/actions/geografia-plataforma";
import { columnaNivel } from "@/lib/types/division-csv";
import type { TipoNivelDTO } from "@/lib/types/geografia-nodo";
import {
  agregarNivelPaisSchema,
  PAIS_NIVELES_MAX,
  PAIS_NOMBRE_MAX,
  renombrarTipoNivelSchema,
  reordenarTiposSchema,
} from "@/lib/types/pais";

import { ConfirmarCambio, type FilaDeCambio } from "./ConfirmarCambio";
import { ListaReordenable } from "./ListaReordenable";

// SLT-46 (design §2.4, §4.7, §6; R25, R26, R48–R50, R53, R55, R58, R59, R61) — EL PANEL «NIVELES DEL
// PAÍS» de un país ya creado, según la maqueta T0.2 (versión 7).
//
//   - Reordenar (R53, R55): el orden nuevo se ve en pantalla SIN guardarse. Mientras está sin guardar,
//     «Editar» y «Agregar» se deshabilitan: el modal del reordenar compara contra los nombres de hoy, y
//     editar o agregar a la vez dejaría ese «antes» viejo antes de confirmar.
//   - Con un formulario de edición o de alta abierto, la lista no se reordena, por la misma razón.
//   - Agregar va siempre al final (P3); con 10 tipos no se ofrece. No hay quitar (R50).
//
// Toda escritura corre antes el MISMO esquema zod que el servidor (R58); si no pasa, el error queda
// en su campo y no se abre el modal (R59). El cambio concurrente lo avisa `ConfirmarCambio` (R61).

type FieldErrors = Record<string, string[]>;

/** Lo que el modal lee del resultado de cualquiera de las tres actions. */
type Resultado = { status: string; motivo?: string; fieldErrors?: FieldErrors };

interface Nombres {
  singular: string;
  plural: string;
}

interface Formulario extends Nombres {
  errores: FieldErrors;
}

/** El tipo que se edita, con el valor que tenía al abrir (lo que el modal mostrará como «antes»). */
interface EdicionEnCurso extends Formulario {
  tipo: TipoNivelDTO;
  posicion: number;
}

type Pendiente =
  | { tipo: "reorden"; niveles: { tipoId: string; nombreSingular: string; nombrePlural: string }[] }
  | { tipo: "renombre"; tipoNivel: TipoNivelDTO; posicion: number; nuevo: Nombres }
  | { tipo: "agregar"; profundidad: number; nuevo: Nombres };

export interface TiposDeNivelPaisProps {
  paisId: string;
  /** Los tipos del país, uno por profundidad. Vacío solo si la lectura falló. */
  tipos: TipoNivelDTO[];
}

function porProfundidad(tipos: readonly TipoNivelDTO[]): TipoNivelDTO[] {
  return [...tipos].sort((a, b) => a.profundidad - b.profundidad);
}

function nombresDe(t: Pick<TipoNivelDTO, "nombreSingular" | "nombrePlural">): string {
  return `${t.nombreSingular} / ${t.nombrePlural}`;
}

function erroresDe(error: ZodError): FieldErrors {
  const salida: FieldErrors = {};
  const porCampo = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  for (const [campo, mensajes] of Object.entries(porCampo)) {
    if (mensajes !== undefined && mensajes.length > 0) salida[campo] = mensajes;
  }
  return salida;
}

/** Un mensaje por desenlace: quien lo lee sabe si corregir, recargar o pedir permisos. */
function mensajeDeDesenlace(status: string): string {
  switch (status) {
    case "validation_error":
      return "Revisa los campos: el formulario está incompleto.";
    case "unauthenticated":
      return "Tu sesión expiró.";
    case "forbidden":
      return "No tienes permiso para esta acción.";
    case "not_found":
      return "Ese nivel o su país ya no existe; recarga la página.";
    case "conflict":
      return "Otra persona cambió los niveles mientras tanto; revisa el valor actual.";
    default:
      return "No se pudo completar la acción.";
  }
}

/** Los errores que no son de un campo tecleado (p. ej. el tope de 10 en `paisId`). */
function erroresGenerales(errores: FieldErrors): string[] {
  return Object.entries(errores)
    .filter(([campo]) => campo !== "nombreSingular" && campo !== "nombrePlural")
    .flatMap(([, mensajes]) => mensajes);
}

export function TiposDeNivelPais({ paisId, tipos }: Readonly<TiposDeNivelPaisProps>) {
  const router = useRouter();
  const toast = useToast();
  const actuales = porProfundidad(tipos);
  const P = actuales.length;

  const [orden, setOrden] = useState<TipoNivelDTO[] | null>(null);
  const [edicion, setEdicion] = useState<EdicionEnCurso | null>(null);
  const [alta, setAlta] = useState<Formulario | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [errorDeOrden, setErrorDeOrden] = useState<string[]>([]);
  const origenDelFoco = useRef<HTMLElement | null>(null);

  // Tras el refresco (éxito o cambio concurrente) llegan tipos nuevos: un orden sin guardar armado
  // sobre los de antes ya no significa nada (patrón de ajustar estado cuando cambia una prop).
  const [tiposPrevios, setTiposPrevios] = useState(tipos);
  if (tipos !== tiposPrevios) {
    setTiposPrevios(tipos);
    setOrden(null);
    setErrorDeOrden([]);
  }

  if (P === 0) {
    // Un país siempre tiene al menos 2 tipos: vacío es que la lectura falló. El aviso con rol de
    // alerta ya lo da el panel «Lugares»; aquí solo se dice que no hay nada que mostrar.
    return (
      <section className="flex flex-col gap-3" aria-labelledby="geografia-tipos-titulo">
        <h2 id="geografia-tipos-titulo" className="text-base font-semibold">
          Niveles del país
        </h2>
        <p className="text-sm text-muted-foreground">No se pudieron leer los niveles del país. Recarga la página.</p>
      </section>
    );
  }

  const visibles = orden ?? actuales;
  const sinGuardar = orden !== null;
  const formularioAbierto = edicion !== null || alta !== null;

  function recordarOrigenDelFoco() {
    origenDelFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function devolverFoco() {
    const origen = origenDelFoco.current;
    origenDelFoco.current = null;
    if (origen?.isConnected) origen.focus();
  }

  // ── Reordenar (R53, R55, R57) ───────────────────────────────────────────────────────────────

  function alReordenar(nueva: TipoNivelDTO[]) {
    setErrorDeOrden([]);
    // Volver al orden de hoy a mano es lo mismo que descartar: no queda nada sin guardar.
    setOrden(nueva.every((t, i) => t.id === actuales[i]?.id) ? null : nueva);
  }

  function pedirReorden() {
    if (orden === null) return;
    // Los nombres viajan como el «antes»: la posición en la lista ES el cambio (§4.7).
    const parsed = reordenarTiposSchema.safeParse({
      paisId,
      niveles: orden.map((t) => ({ tipoId: t.id, nombreSingular: t.nombreSingular, nombrePlural: t.nombrePlural })),
    });
    if (!parsed.success) {
      setErrorDeOrden(parsed.error.issues.map((i) => i.message));
      return;
    }
    setErrorDeOrden([]);
    setPendiente({ tipo: "reorden", niveles: parsed.data.niveles });
  }

  // ── Editar (R25, R26) ───────────────────────────────────────────────────────────────────────

  function abrirEdicion(tipo: TipoNivelDTO, posicion: number) {
    recordarOrigenDelFoco();
    setAlta(null);
    setEdicion({ tipo, posicion, singular: tipo.nombreSingular, plural: tipo.nombrePlural, errores: {} });
  }

  function cerrarEdicion() {
    setEdicion(null);
    devolverFoco();
  }

  function pedirRenombre(e: FormEvent) {
    e.preventDefault();
    if (edicion === null) return;
    const parsed = renombrarTipoNivelSchema.safeParse({
      tipoId: edicion.tipo.id,
      nombreSingular: edicion.singular,
      nombrePlural: edicion.plural,
      anterior: { nombreSingular: edicion.tipo.nombreSingular, nombrePlural: edicion.tipo.nombrePlural },
    });
    if (!parsed.success) {
      setEdicion({ ...edicion, errores: erroresDe(parsed.error) });
      return;
    }
    setEdicion({ ...edicion, errores: {} });
    setPendiente({
      tipo: "renombre",
      tipoNivel: edicion.tipo,
      posicion: edicion.posicion,
      nuevo: { singular: parsed.data.nombreSingular, plural: parsed.data.nombrePlural },
    });
  }

  // ── Agregar al final (R48, R49) ─────────────────────────────────────────────────────────────

  function abrirAlta() {
    recordarOrigenDelFoco();
    setEdicion(null);
    setAlta({ singular: "", plural: "", errores: {} });
  }

  function cerrarAlta() {
    setAlta(null);
    devolverFoco();
  }

  function pedirAgregar(e: FormEvent) {
    e.preventDefault();
    if (alta === null) return;
    const parsed = agregarNivelPaisSchema.safeParse({
      paisId,
      nombreSingular: alta.singular,
      nombrePlural: alta.plural,
      profundidad: P + 1,
    });
    if (!parsed.success) {
      setAlta({ ...alta, errores: erroresDe(parsed.error) });
      return;
    }
    setAlta({ ...alta, errores: {} });
    setPendiente({
      tipo: "agregar",
      profundidad: parsed.data.profundidad,
      nuevo: { singular: parsed.data.nombreSingular, plural: parsed.data.nombrePlural },
    });
  }

  // ── Confirmación (R58, R61) ─────────────────────────────────────────────────────────────────

  function modalDe(p: Pendiente): { titulo: string; descripcion: string; filas: FilaDeCambio[]; confirmLabel: string } {
    if (p.tipo === "reorden") {
      return {
        titulo: "¿Guardar el nuevo orden de niveles?",
        descripcion:
          "Cada nivel toma el nombre que quedó en su posición. Los lugares no se mueven: siguen en su nivel.",
        filas: p.niveles.map((n, i) => ({
          etiqueta: `Nivel ${i + 1}`,
          antes: nombresDe(actuales[i]),
          despues: nombresDe(n),
        })),
        confirmLabel: "Sí, guardar",
      };
    }
    if (p.tipo === "renombre") {
      return {
        titulo: `¿Guardar el cambio del nivel ${p.posicion}?`,
        descripcion: "Cambia cómo se llama el nivel en todas las pantallas. Los lugares no cambian.",
        filas: [
          { etiqueta: "Singular", antes: p.tipoNivel.nombreSingular, despues: p.nuevo.singular },
          { etiqueta: "Plural", antes: p.tipoNivel.nombrePlural, despues: p.nuevo.plural },
        ],
        confirmLabel: "Sí, guardar",
      };
    }
    return {
      titulo: `¿Agregar el nivel ${p.profundidad}?`,
      descripcion: "El nivel nuevo va al final, debajo del más profundo. Un nivel no se puede quitar después.",
      filas: [
        ...actuales.map((t, i) => ({ etiqueta: `Nivel ${i + 1}`, antes: nombresDe(t), despues: nombresDe(t) })),
        {
          etiqueta: `Nivel ${p.profundidad}`,
          antes: null,
          despues: `${p.nuevo.singular} / ${p.nuevo.plural}`,
        },
      ],
      confirmLabel: "Sí, agregar",
    };
  }

  /** La escritura confirmada: se llama una sola vez, desde «Sí, …» del modal (R58). */
  function ejecutarPendiente(): Promise<Resultado> {
    const p = pendiente;
    if (p === null) return Promise.resolve({ status: "error" });
    if (p.tipo === "reorden") return reordenarTiposAction({ paisId, niveles: p.niveles });
    if (p.tipo === "renombre") {
      // R61: el «antes» que el modal mostró viaja para que el servidor detecte un cambio concurrente.
      return renombrarTipoNivelAction({
        tipoId: p.tipoNivel.id,
        nombreSingular: p.nuevo.singular,
        nombrePlural: p.nuevo.plural,
        anterior: { nombreSingular: p.tipoNivel.nombreSingular, nombrePlural: p.tipoNivel.nombrePlural },
      });
    }
    return agregarNivelPaisAction({
      paisId,
      nombreSingular: p.nuevo.singular,
      nombrePlural: p.nuevo.plural,
      profundidad: p.profundidad,
    });
  }

  function alConfirmarConExito() {
    const p = pendiente;
    if (p === null) return;
    if (p.tipo === "reorden") {
      setOrden(null);
      toast.success("Se guardó el nuevo orden de los niveles.");
    } else if (p.tipo === "renombre") {
      toast.success(`El nivel ${p.posicion} ahora se llama «${p.nuevo.singular}».`);
      cerrarEdicion();
    } else {
      toast.success(`Se agregó el nivel ${p.profundidad}, «${p.nuevo.singular}».`);
      cerrarAlta();
    }
  }

  /** `validation_error` va a su campo; lo demás, junto al formulario o al aviso del orden. */
  function alRechazar(res: Resultado) {
    const p = pendiente;
    const errores: FieldErrors =
      res.status === "validation_error" && res.fieldErrors !== undefined
        ? res.fieldErrors
        : { general: [mensajeDeDesenlace(res.status)] };
    if (p?.tipo === "reorden") setErrorDeOrden(Object.values(errores).flat());
    else if (p?.tipo === "renombre") setEdicion((e) => (e === null ? e : { ...e, errores }));
    else if (p?.tipo === "agregar") setAlta((a) => (a === null ? a : { ...a, errores }));
    toast.error(Object.values(errores).flat()[0] ?? mensajeDeDesenlace(res.status));
    // Lo que no es de un campo (no existe, conflicto) se arregla con el valor actual.
    if (res.status !== "validation_error") router.refresh();
  }

  const modal = pendiente === null ? null : modalDe(pendiente);

  return (
    <section className="flex flex-col gap-4" aria-labelledby="geografia-tipos-titulo">
      <div className="flex flex-col gap-1">
        <h2 id="geografia-tipos-titulo" className="text-base font-semibold">
          Niveles del país
        </h2>
        <p className="max-w-prose text-sm text-muted-foreground">
          El nivel 1 es el de más arriba. Arrastra por ⠿ para cambiar el orden: cada nivel toma el nombre
          que queda en su posición y los lugares no se mueven.
        </p>
      </div>

      <ListaReordenable<TipoNivelDTO>
        elementos={visibles}
        etiqueta="Niveles del país"
        nombreDe={(t) => t.nombreSingular}
        onReordenar={alReordenar}
        deshabilitado={formularioAbierto || pendiente !== null}
        pintarFila={(t, indice) => (
          <FilaDeTipo
            tipo={t}
            posicion={indice + 1}
            editable={!sinGuardar}
            onEditar={() => abrirEdicion(t, indice + 1)}
          />
        )}
      />

      {sinGuardar ? (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3" role="status">
          <p className="text-sm font-medium">Orden sin guardar</p>
          <p className="text-xs text-muted-foreground">Guarda o descarta el orden antes de editar o agregar un nivel.</p>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" className="min-h-11 sm:min-h-8" onClick={pedirReorden}>
              Guardar orden…
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11 sm:min-h-8"
              onClick={() => {
                setOrden(null);
                setErrorDeOrden([]);
              }}
            >
              Descartar
            </Button>
          </div>
        </div>
      ) : null}
      <FieldError messages={errorDeOrden} />

      {edicion !== null ? (
        <form
          key={`editar-${edicion.tipo.id}`}
          aria-labelledby="geografia-tipo-editar-titulo"
          noValidate
          onSubmit={pedirRenombre}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h3 id="geografia-tipo-editar-titulo" className="text-sm font-semibold">{`Editar nivel ${edicion.posicion}`}</h3>
          <FormField id="geografia-tipo-singular" label="Singular" error={edicion.errores.nombreSingular} required>
            <Input
              // Lo abre un gesto del usuario sobre la fila: sin foco aquí no se encuentra con teclado.
              autoFocus
              value={edicion.singular}
              maxLength={PAIS_NOMBRE_MAX}
              onChange={(e) => setEdicion({ ...edicion, singular: e.target.value })}
            />
          </FormField>
          <FormField id="geografia-tipo-plural" label="Plural" error={edicion.errores.nombrePlural} required>
            <Input
              value={edicion.plural}
              maxLength={PAIS_NOMBRE_MAX}
              onChange={(e) => setEdicion({ ...edicion, plural: e.target.value })}
            />
          </FormField>
          <FieldError messages={erroresGenerales(edicion.errores)} />
          <div className="flex items-center gap-2">
            <Button type="submit" className="min-h-11 sm:min-h-8">
              Guardar
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={cerrarEdicion}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {alta !== null ? (
        <form
          aria-labelledby="geografia-tipo-agregar-titulo"
          noValidate
          onSubmit={pedirAgregar}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h3 id="geografia-tipo-agregar-titulo" className="text-sm font-semibold">{`Nivel ${P + 1} (al final)`}</h3>
          <FormField id="geografia-tipo-nuevo-singular" label="Singular" error={alta.errores.nombreSingular} required>
            <Input
              autoFocus
              value={alta.singular}
              maxLength={PAIS_NOMBRE_MAX}
              onChange={(e) => setAlta({ ...alta, singular: e.target.value })}
            />
          </FormField>
          <FormField id="geografia-tipo-nuevo-plural" label="Plural" error={alta.errores.nombrePlural} required>
            <Input
              value={alta.plural}
              maxLength={PAIS_NOMBRE_MAX}
              onChange={(e) => setAlta({ ...alta, plural: e.target.value })}
            />
          </FormField>
          <FieldError messages={erroresGenerales(alta.errores)} />
          <div className="flex items-center gap-2">
            <Button type="submit" className="min-h-11 sm:min-h-8">
              Agregar
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={cerrarAlta}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {/* P3: solo al final y hasta 10; con 10 no se ofrece, en vez de ofrecer lo imposible. */}
      {P < PAIS_NIVELES_MAX && alta === null ? (
        <div>
          <Button
            type="button"
            variant="outline"
            className="min-h-11 sm:min-h-8"
            disabled={sinGuardar}
            onClick={abrirAlta}
          >
            <Plus aria-hidden="true" />
            Agregar nivel al final
          </Button>
        </div>
      ) : null}

      <ConfirmarCambio<Resultado>
        open={pendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPendiente(null);
        }}
        titulo={modal?.titulo ?? ""}
        descripcion={modal?.descripcion}
        filas={modal?.filas ?? []}
        confirmLabel={modal?.confirmLabel ?? "Sí, guardar"}
        accion={ejecutarPendiente}
        onExito={alConfirmarConExito}
        onRechazo={alRechazar}
      />
    </section>
  );
}

/** Una fila: número de nivel, singular, plural, su columna del CSV y «Editar». Sin quitar (R50). */
function FilaDeTipo({
  tipo,
  posicion,
  editable,
  onEditar,
}: Readonly<{ tipo: TipoNivelDTO; posicion: number; editable: boolean; onEditar: () => void }>) {
  return (
    <div className="flex items-center gap-3 py-1 pr-2">
      <span
        aria-hidden="true"
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold"
      >
        {posicion}
      </span>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium">
          <span className="sr-only">{`Nivel ${posicion}: `}</span>
          {tipo.nombreSingular}
        </span>
        <span className="text-xs text-muted-foreground">
          {`Plural: ${tipo.nombrePlural} · CSV: `}
          {/* R54: la columna es la de la POSICIÓN en pantalla, que es la profundidad tras guardar. */}
          <span className="font-mono">{columnaNivel(posicion)}</span>
        </span>
      </div>
      <Button
        type="button"
        variant="ghost"
        className="min-h-11 shrink-0 sm:min-h-8"
        aria-label={`Editar nivel ${posicion}, ${tipo.nombreSingular}`}
        disabled={!editable}
        onClick={onEditar}
      >
        Editar
      </Button>
    </div>
  );
}
