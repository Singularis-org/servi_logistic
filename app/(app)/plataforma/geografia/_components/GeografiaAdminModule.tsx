"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Plus } from "lucide-react";
import type { ZodError } from "zod";

import { EmptyState } from "@/components/shared/EmptyState";
import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import {
  cambiarActivacionNodoAction,
  contarOrdenesSinEntregarAction,
  crearNodoAction,
  renombrarNodoAction,
} from "@/lib/actions/geografia-plataforma";
import {
  cambiarActivacionGeograficaSchema,
  crearNodoGeograficoSchema,
  GEO_NOMBRE_MAX,
  normalizarNombreGeografico,
  renombrarNodoGeograficoSchema,
  type NodoArbolPlataformaDTO,
  type TipoNivelDTO,
} from "@/lib/types/geografia-nodo";
import { activoEnCascada } from "@/lib/repositories/_shared/geografia-activa";
import {
  filtrarArbolDeNodos,
  type FiltroEstadoGeografico,
} from "@/app/(app)/configuracion/_shared/filtrar-arbol-geografico";

import { ConfirmarCambio, type FilaDeCambio } from "./ConfirmarCambio";

// SL-20 (design §8) → SLT-46 (design §6; R14, R20–R22, R52, R58, R59, R61) — EL PANEL «LUGARES»
// DEL SUPERADMIN: el árbol de un país a cualquier profundidad, según la maqueta T0.2 (versión 7).
//
//   - Cada fila dice su nombre, el singular del tipo de su profundidad, su código y si está retirada.
//   - «+ <tipo siguiente>» solo si el país tiene tipo para la profundidad siguiente y el lugar no está
//     retirado (R21). El tipo del lugar nuevo es el de su profundidad: no se elige (R14).
//   - No hay control para mover un lugar a otro padre (R22).
//   - SIN zonas: son de cada empresa, y en plataforma esa lectura mezclaría las de todas.
//
// CONFIRMACIÓN ANTES DE ESCRIBIR (decisión del 2026-11-09, design §6). Toda escritura —alta,
// renombre, retiro y reactivación— corre primero el MISMO esquema zod que el servidor (R58); si no
// pasa, el error queda en su campo y el modal no se abre (R59). Si pasa, `ConfirmarCambio` enseña el
// antes → después y la action solo se llama al confirmar; el desenlace `ok` refresca la página (el
// árbol llega otra vez por props) y el cambio concurrente del renombre lo avisa el propio modal
// (R61). Pedir el estado que el lugar ya tiene es `ok` y también refresca (P12).
//
// QUITAR NO ES BORRAR: retirar un lugar apaga SU flag, sin tocar a sus descendientes, y reactivarlo
// devuelve el árbol como estaba. Renombrar no toca el código, que es la identidad del lugar.

type FieldErrors = Record<string, string[]>;

/** Lo que el modal necesita leer del resultado de cualquiera de las cuatro actions. */
type Resultado = { status: string; motivo?: string; fieldErrors?: FieldErrors };

/** El formulario de alta, con su padre YA fijado por la fila desde la que se abrió. */
interface AltaEnCurso {
  /** La profundidad del lugar nuevo: la de su padre + 1, o 1 en la raíz. */
  profundidad: number;
  /** `null` solo en la raíz, que cuelga del país. */
  padreId: string | null;
  /** Los nombres de la cadena del padre, de la raíz al padre; vacía en la raíz. */
  cadena: string[];
}

/** El lugar que se renombra, se retira o se reactiva. */
interface NodoObjetivo {
  id: string;
  nombre: string;
  profundidad: number;
}

/** El conteo de órdenes sin entregar del retiro (R20). */
type EstadoConteo = { estado: "cargando" } | { estado: "ok"; ordenes: number } | { estado: "error" };

/** La escritura que espera confirmación en el modal, ya validada. */
type Pendiente =
  | {
      tipo: "alta";
      entrada: { paisId: string } | { padreId: string };
      nombre: string;
      codigo: string | null;
      profundidad: number;
      cadena: string[];
    }
  | { tipo: "renombre"; nodo: NodoObjetivo; nombre: string }
  | { tipo: "retiro"; nodo: NodoObjetivo }
  | { tipo: "reactivacion"; nodo: NodoObjetivo };

const OPCIONES_ESTADO: readonly { valor: FiltroEstadoGeografico; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "activos", etiqueta: "Activos" },
  { valor: "retirados", etiqueta: "Retirados" },
];

export interface GeografiaAdminModuleProps {
  paisId: string;
  paisNombre: string;
  /** Los tipos de nivel DEL PAÍS, uno por profundidad (`nivel_1`…`nivel_P`). */
  tipos: TipoNivelDTO[];
  /** Las raíces del árbol del país, con sus descendientes a cualquier profundidad. */
  raices: NodoArbolPlataformaDTO[];
  /** La lectura del árbol falló: `raices` viene vacío por el fallo, no por el país. */
  cargaErrorInicial?: boolean;
}

/** Minúscula para el interior de una frase: «Añadir departamento». */
function enFrase(texto: string): string {
  return texto.toLocaleLowerCase("es");
}

/** Los errores por campo de un esquema que no pasó, con la misma forma que el `validation_error`. */
function erroresDe(error: ZodError): FieldErrors {
  const salida: FieldErrors = {};
  const porCampo = error.flatten().fieldErrors as Record<string, string[] | undefined>;
  for (const [campo, mensajes] of Object.entries(porCampo)) {
    if (mensajes !== undefined && mensajes.length > 0) salida[campo] = mensajes;
  }
  return salida;
}

/** Cada id del árbol con los nombres de su cadena, de la raíz a él (para el «dentro de» del alta). */
function cadenasDe(raices: readonly NodoArbolPlataformaDTO[]): Map<string, string[]> {
  const cadenas = new Map<string, string[]>();
  const recorrer = (nodos: readonly NodoArbolPlataformaDTO[], previa: string[]) => {
    for (const nodo of nodos) {
      const cadena = [...previa, nodo.nombre];
      cadenas.set(nodo.id, cadena);
      recorrer(nodo.hijos, cadena);
    }
  };
  recorrer(raices, []);
  return cadenas;
}

export function GeografiaAdminModule({
  paisId,
  paisNombre,
  tipos,
  raices,
  cargaErrorInicial = false,
}: Readonly<GeografiaAdminModuleProps>) {
  const toast = useToast();
  const router = useRouter();

  const tipoDe = useMemo(() => new Map(tipos.map((t) => [t.profundidad, t])), [tipos]);
  const cadenas = useMemo(() => cadenasDe(raices), [raices]);
  const tipoRaiz = tipoDe.get(1) ?? null;

  // El formulario de alta o de renombre se abre lejos de la fila (arriba del panel): el foco salta a
  // él y, al cerrarlo, vuelve al botón que lo abrió.
  const origenDelFoco = useRef<HTMLElement | null>(null);

  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<FiltroEstadoGeografico>("todos");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const [alta, setAlta] = useState<AltaEnCurso | null>(null);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});

  const [renombrado, setRenombrado] = useState<NodoObjetivo | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [erroresRenombrado, setErroresRenombrado] = useState<FieldErrors>({});

  /** El error de una fila cuyo retiro o reactivación no pasó la validación (R59). */
  const [errorDeFila, setErrorDeFila] = useState<{ id: string; mensaje: string } | null>(null);

  // El contenido del modal se conserva al cerrarlo para que no se vacíe durante la salida.
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [conteo, setConteo] = useState<EstadoConteo>({ estado: "cargando" });
  const peticionDeConteo = useRef(0);

  const filtradas = useMemo(() => filtrarArbolDeNodos(raices, { texto, estado }), [raices, texto, estado]);

  // Con un filtro puesto el árbol ya viene recortado: se abre entero.
  const filtrando = texto.trim() !== "" || estado !== "todos";
  const abierto = (id: string) => filtrando || expandidos.has(id);

  function singular(profundidad: number): string {
    return tipoDe.get(profundidad)?.nombreSingular ?? "";
  }

  function alternarExpansion(id: string) {
    setExpandidos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  function recordarOrigenDelFoco() {
    origenDelFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function devolverFoco() {
    const origen = origenDelFoco.current;
    origenDelFoco.current = null;
    if (origen?.isConnected) origen.focus();
  }

  function cerrarAlta() {
    setAlta(null);
    devolverFoco();
  }

  function cerrarRenombrado() {
    setRenombrado(null);
    devolverFoco();
  }

  function abrirAlta(profundidad: number, padre: { id: string } | null) {
    recordarOrigenDelFoco();
    setAlta({
      profundidad,
      padreId: padre?.id ?? null,
      cadena: padre === null ? [] : (cadenas.get(padre.id) ?? []),
    });
    setNombre("");
    setCodigo("");
    setErrors({});
    setRenombrado(null);
  }

  function abrirRenombrado(nodo: NodoObjetivo) {
    recordarOrigenDelFoco();
    setRenombrado(nodo);
    setNombreNuevo(nodo.nombre);
    setErroresRenombrado({});
    setAlta(null);
  }

  function abrirModal(siguiente: Pendiente) {
    setPendiente(siguiente);
    setModalAbierto(true);
  }

  function cerrarModal() {
    peticionDeConteo.current += 1;
    setModalAbierto(false);
  }

  /** R58, R59: el alta pasa por `crearNodoGeograficoSchema` antes de abrir el modal. */
  function pedirAlta() {
    if (alta === null) return;
    const limpio = normalizarNombreGeografico(nombre);
    if (limpio === "") {
      setErrors({ nombre: ["Este campo es obligatorio."] });
      return;
    }
    const codigoLimpio = codigo.trim();
    const destino = alta.padreId === null ? { paisId } : { padreId: alta.padreId };
    const entrada = { ...destino, nombre: limpio, ...(codigoLimpio === "" ? {} : { codigo: codigoLimpio }) };
    const parsed = crearNodoGeograficoSchema.safeParse(entrada);
    if (!parsed.success) {
      setErrors(erroresDe(parsed.error));
      return;
    }
    setErrors({});
    abrirModal({
      tipo: "alta",
      entrada: destino,
      nombre: limpio,
      codigo: codigoLimpio === "" ? null : codigoLimpio,
      profundidad: alta.profundidad,
      cadena: alta.cadena,
    });
  }

  /** R58, R59, R61: el renombre lleva el nombre que el modal mostró como «antes». */
  function pedirRenombrado() {
    if (renombrado === null) return;
    const limpio = normalizarNombreGeografico(nombreNuevo);
    if (limpio === "") {
      setErroresRenombrado({ nombre: ["Este campo es obligatorio."] });
      return;
    }
    const parsed = renombrarNodoGeograficoSchema.safeParse({
      id: renombrado.id,
      nombre: limpio,
      nombreAnterior: renombrado.nombre,
    });
    if (!parsed.success) {
      setErroresRenombrado(erroresDe(parsed.error));
      return;
    }
    setErroresRenombrado({});
    abrirModal({ tipo: "renombre", nodo: renombrado, nombre: limpio });
  }

  /** R58, R59 para el retiro y la reactivación; el retiro pide además el conteo de R20. */
  function pedirActivacion(nodo: NodoObjetivo, activo: boolean) {
    const parsed = cambiarActivacionGeograficaSchema.safeParse({ id: nodo.id, activo });
    if (!parsed.success) {
      setErrorDeFila({ id: nodo.id, mensaje: "Este lugar no tiene un identificador válido; recarga la página." });
      return;
    }
    setErrorDeFila(null);
    if (activo) {
      abrirModal({ tipo: "reactivacion", nodo });
      return;
    }
    abrirModal({ tipo: "retiro", nodo });
    pedirConteo(nodo.id);
  }

  /**
   * R20 — el conteo se pide al abrir el retiro y no lo bloquea. El testigo descarta la respuesta de
   * una confirmación ya cerrada o sustituida.
   */
  function pedirConteo(id: string) {
    setConteo({ estado: "cargando" });
    peticionDeConteo.current += 1;
    const testigo = peticionDeConteo.current;
    void (async () => {
      try {
        const res = await contarOrdenesSinEntregarAction({ id });
        if (testigo !== peticionDeConteo.current) return;
        setConteo(res.status === "ok" ? { estado: "ok", ordenes: res.ordenes } : { estado: "error" });
      } catch {
        if (testigo === peticionDeConteo.current) setConteo({ estado: "error" });
      }
    })();
  }

  /** Lo que el modal pinta según la escritura pendiente (tabla antes → después de design §6). */
  function modalDe(p: Pendiente): {
    titulo: string;
    descripcion: string;
    filas: FilaDeCambio[];
    confirmLabel: string;
    destructivo: boolean;
    children?: ReactNode;
  } {
    if (p.tipo === "alta") {
      const tipo = singular(p.profundidad);
      return {
        titulo: `Alta: ${tipo}`,
        descripcion: `Dentro de ${[paisNombre, ...p.cadena].join(" › ")}.`,
        filas: [
          { etiqueta: "Nombre", antes: null, despues: p.nombre },
          { etiqueta: "Código", antes: null, despues: p.codigo ?? "Sin código" },
          { etiqueta: "Tipo", antes: null, despues: tipo },
        ],
        confirmLabel: "Sí, crear",
        destructivo: false,
      };
    }
    if (p.tipo === "renombre") {
      return {
        titulo: `Renombrar: ${singular(p.nodo.profundidad)}`,
        descripcion:
          "Cambiar el nombre no lo mueve, no lo retira ni cambia su código: las órdenes que ya lo tienen siguen apuntando al mismo lugar.",
        filas: [{ etiqueta: "Nombre", antes: p.nodo.nombre, despues: p.nombre }],
        confirmLabel: "Sí, renombrar",
        destructivo: false,
      };
    }
    const retiro = p.tipo === "retiro";
    return {
      titulo: `${retiro ? "Retirar" : "Reactivar"} «${p.nodo.nombre}»`,
      descripcion: retiro
        ? `${singular(p.nodo.profundidad)}. Retirarlo no lo borra ni toca a lo que cuelga de él: deja de ofrecerse y se puede reactivar.`
        : `${singular(p.nodo.profundidad)}. Vuelve a ofrecerse con lo que cuelga de él.`,
      filas: [
        {
          etiqueta: "Estado",
          antes: retiro ? "Activo" : "Retirado",
          despues: retiro ? "Retirado" : "Activo",
        },
      ],
      confirmLabel: retiro ? "Sí, retirar" : "Sí, reactivar",
      destructivo: retiro,
      children: retiro ? <p className="text-sm">{textoDelConteo(conteo)}</p> : undefined,
    };
  }

  /** La escritura confirmada: se llama una sola vez, desde «Sí, …» del modal (R58). */
  function ejecutarPendiente(): Promise<Resultado> {
    const p = pendiente;
    if (p === null) return Promise.resolve({ status: "error" });
    if (p.tipo === "alta") {
      return crearNodoAction({ ...p.entrada, nombre: p.nombre, ...(p.codigo === null ? {} : { codigo: p.codigo }) });
    }
    if (p.tipo === "renombre") {
      // R61: el «antes» que el modal mostró viaja para que el servidor detecte un cambio concurrente.
      return renombrarNodoAction({ id: p.nodo.id, nombre: p.nombre, nombreAnterior: p.nodo.nombre });
    }
    return cambiarActivacionNodoAction({ id: p.nodo.id, activo: p.tipo === "reactivacion" });
  }

  /** `ok`: el modal ya se cerró y la página se refresca (también si ya estaba así, P12). */
  function alConfirmarConExito() {
    const p = pendiente;
    if (p === null) return;
    if (p.tipo === "alta") {
      // Decisión 15: forma neutra. «dado de alta» concordaba con el lugar, y una aldea no es «dado».
      toast.success(`Se dio de alta «${p.nombre}» (${singular(p.profundidad)}).`);
      cerrarAlta();
    } else if (p.tipo === "renombre") {
      toast.success(`«${p.nodo.nombre}» ahora es «${p.nombre}».`);
      cerrarRenombrado();
    } else {
      toast.success(`Se ${p.tipo === "retiro" ? "retiró" : "reactivó"} «${p.nodo.nombre}».`);
    }
  }

  /** `validation_error` y `conflict` por nombre van al campo, como antes; lo demás, a un aviso. */
  function alRechazar(res: Resultado) {
    const p = pendiente;
    const ponerErrores =
      p?.tipo === "alta" ? setErrors : p?.tipo === "renombre" ? setErroresRenombrado : null;
    if (res.status === "validation_error" && res.fieldErrors !== undefined) {
      ponerErrores?.(res.fieldErrors);
      toast.error(mensajeDeValidacion(res.fieldErrors));
      return;
    }
    if (res.status === "conflict") ponerErrores?.({ nombre: [mensajeDeDesenlace("conflict")] });
    toast.error(mensajeDeDesenlace(res.status));
    router.refresh();
  }

  /** Una rama del árbol, a cualquier profundidad. `cadena` son los flags de sus ascendientes. */
  function rama(nodos: readonly NodoArbolPlataformaDTO[], cadena: readonly boolean[]): ReactNode {
    return nodos.map((n) => {
      const nodo: NodoObjetivo = { id: n.id, nombre: n.nombre, profundidad: n.profundidad };
      const tipoHijo = tipoDe.get(n.profundidad + 1) ?? null;
      const flags = [...cadena, n.activo];
      const tieneHijos = n.hijos.length > 0;
      const expandido = tieneHijos ? abierto(n.id) : undefined;
      return (
        <li key={n.id} className={n.profundidad === 1 ? "px-2 py-1" : undefined}>
          <FilaNodo
            nodo={n}
            tipo={singular(n.profundidad)}
            disponible={activoEnCascada(flags)}
            detalle={
              tipoHijo === null || !tieneHijos
                ? undefined
                : `${n.hijos.length} ${enFrase(n.hijos.length === 1 ? tipoHijo.nombreSingular : tipoHijo.nombrePlural)}`
            }
            expandido={expandido}
            onExpandir={() => alternarExpansion(n.id)}
            onRenombrar={() => abrirRenombrado(nodo)}
            onRetirar={() => pedirActivacion(nodo, false)}
            onReactivar={() => pedirActivacion(nodo, true)}
            agregarHijo={
              tipoHijo === null || !n.activo
                ? null
                : {
                    texto: tipoHijo.nombreSingular,
                    etiqueta: `Añadir ${enFrase(tipoHijo.nombreSingular)} a ${n.nombre}`,
                    onClick: () => abrirAlta(n.profundidad + 1, { id: n.id }),
                  }
            }
          />
          {errorDeFila?.id === n.id ? <FieldError>{errorDeFila.mensaje}</FieldError> : null}
          {tieneHijos && expandido ? (
            <ul className="ml-5 flex flex-col border-l border-border pl-2">{rama(n.hijos, flags)}</ul>
          ) : null}
        </li>
      );
    });
  }

  const modal = pendiente === null ? null : modalDe(pendiente);
  const textoRaiz = tipoRaiz === null ? null : `Añadir ${enFrase(tipoRaiz.nombreSingular)}`;

  return (
    <section className="flex flex-col gap-4" aria-labelledby="geografia-arbol-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="geografia-arbol-titulo" className="text-base font-semibold">
            Lugares
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            {`La división de ${paisNombre} que la app ofrece al cargar y al corregir órdenes. Retirar un lugar no lo borra: deja de ofrecerse y se puede reactivar cuando haga falta.`}
          </p>
        </div>
        {tipoRaiz === null ? null : (
          <Button
            type="button"
            className="min-h-11 sm:min-h-8"
            aria-label={textoRaiz ?? undefined}
            onClick={() => abrirAlta(1, null)}
          >
            <Plus aria-hidden="true" />
            {tipoRaiz.nombreSingular}
          </Button>
        )}
      </div>

      {cargaErrorInicial ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar la división del país.</AlertDescription>
        </Alert>
      ) : null}

      {/* Un `<form>` con nombre: Enter pide guardar y el lector de pantalla lo anuncia como región.
          La `key` lo vuelve a montar al abrirlo desde otra fila, para que el foco salte otra vez. */}
      {alta !== null ? (
        <form
          key={`alta-${alta.padreId ?? paisId}`}
          aria-labelledby="geografia-alta-titulo"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            pedirAlta();
          }}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h3 id="geografia-alta-titulo" className="text-sm font-semibold">{`Alta: ${singular(alta.profundidad)}`}</h3>
          <p className="text-sm text-muted-foreground">
            {alta.cadena.length > 0 ? `Dentro de ${alta.cadena.join(" › ")}.` : `En ${paisNombre}.`}
          </p>

          <FormField id="geografia-nombre" label="Nombre" error={errors.nombre} required>
            <Input
              // Lo abre un gesto del usuario, lejos de la fila: sin foco aquí el formulario no se
              // encuentra con teclado.
              autoFocus
              value={nombre}
              maxLength={GEO_NOMBRE_MAX}
              onChange={(e) => setNombre(e.target.value)}
            />
          </FormField>

          <FormField
            id="geografia-codigo"
            label="Código oficial"
            hint="Opcional. El que le da la división oficial del país."
            error={errors.codigo}
          >
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </FormField>

          {/* Un error de forma (país o padre) no es de ningún campo tecleado. */}
          <FieldError messages={errors.formato ?? errors.paisId ?? errors.padreId} />

          <div className="flex items-center gap-2">
            <Button type="submit" className="min-h-11 sm:min-h-8">
              Guardar
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={cerrarAlta}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {renombrado !== null ? (
        <form
          key={`renombrar-${renombrado.id}`}
          aria-labelledby="geografia-renombrar-titulo"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            pedirRenombrado();
          }}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h3 id="geografia-renombrar-titulo" className="text-sm font-semibold">{`Renombrar: ${singular(renombrado.profundidad)}`}</h3>
          <p className="text-sm text-muted-foreground">
            {`Se llama «${renombrado.nombre}». Cambiar el nombre no lo mueve, no lo retira ni cambia su código: las órdenes que ya lo tienen siguen apuntando al mismo lugar.`}
          </p>

          <FormField id="geografia-nombre-nuevo" label="Nombre" error={erroresRenombrado.nombre} required>
            <Input
              // Mismo motivo que en el alta.
              autoFocus
              value={nombreNuevo}
              maxLength={GEO_NOMBRE_MAX}
              onChange={(e) => setNombreNuevo(e.target.value)}
            />
          </FormField>

          <div className="flex items-center gap-2">
            <Button type="submit" className="min-h-11 sm:min-h-8">
              Guardar
            </Button>
            <Button type="button" variant="outline" className="min-h-11 sm:min-h-8" onClick={cerrarRenombrado}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {/* Sin división no hay nada que buscar ni filtrar: la barra solo sale con algo debajo. */}
      {raices.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            className="max-w-xs"
            placeholder="Buscar por nombre…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label={`Buscar en la división de ${paisNombre}`}
          />
          <SegmentedToggle options={OPCIONES_ESTADO} valor={estado} onChange={setEstado} ariaLabel="Filtrar por estado" />
        </div>
      ) : null}

      {/* Si la lectura falló y no hay nada leído, solo queda el aviso de arriba: pintar además
          «aún no tiene división» sería disfrazar el fallo de estado vacío. */}
      {cargaErrorInicial && raices.length === 0 ? null : filtradas.length === 0 ? (
        <div className="rounded-md border border-border">
          {raices.length === 0 ? (
            <EmptyState
              title="Este país aún no tiene división cargada."
              // El botón por su rótulo, y no «el primer <nivel>»: el nombre del nivel puede ser
              // femenino y la frase no se concuerda (decisión 15).
              description={
                tipoRaiz === null
                  ? "Carga un CSV con toda la división."
                  : `Carga un CSV con toda la división o usa «+ ${tipoRaiz.nombreSingular}» para ir a mano.`
              }
            />
          ) : (
            <EmptyState title="Sin resultados." description="Prueba con otro nombre o cambia el filtro de estado." />
          )}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">{rama(filtradas, [])}</ul>
      )}

      {modal === null ? null : (
        <ConfirmarCambio<Resultado>
          open={modalAbierto}
          onOpenChange={(abierta) => {
            if (!abierta) cerrarModal();
          }}
          titulo={modal.titulo}
          descripcion={modal.descripcion}
          filas={modal.filas}
          confirmLabel={modal.confirmLabel}
          destructivo={modal.destructivo}
          accion={ejecutarPendiente}
          onExito={alConfirmarConExito}
          onRechazo={alRechazar}
        >
          {modal.children}
        </ConfirmarCambio>
      )}
    </section>
  );
}

/** Una fila del árbol: nombre, tipo, código, estado y sus acciones. Sin «mover» (R22). */
function FilaNodo({
  nodo,
  tipo,
  disponible,
  detalle,
  expandido,
  onExpandir,
  onRenombrar,
  onRetirar,
  onReactivar,
  agregarHijo,
}: Readonly<{
  nodo: NodoArbolPlataformaDTO;
  /** El singular del tipo de su profundidad (R21). */
  tipo: string;
  /** Disponibilidad efectiva: ni él ni ningún ascendiente retirado. */
  disponible: boolean;
  detalle?: string;
  /** `undefined` en un lugar sin hijos: no se pliega. */
  expandido?: boolean;
  onExpandir: () => void;
  onRenombrar: () => void;
  onRetirar: () => void;
  onReactivar: () => void;
  agregarHijo: { texto: string; etiqueta: string; onClick: () => void } | null;
}>) {
  const { nombre } = nodo;
  // Objetivo táctil de 44px en móvil; en escritorio, la altura compacta del árbol.
  const tactil = "min-h-11 sm:min-h-7";

  return (
    <div
      data-nodo={nodo.id}
      className="flex flex-wrap items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
    >
      {expandido === undefined ? (
        <span aria-hidden="true" className="inline-block w-11 sm:w-7" />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="size-11 sm:size-7"
          aria-expanded={expandido}
          aria-label={`${expandido ? "Contraer" : "Expandir"} ${nombre}`}
          onClick={onExpandir}
        >
          <ChevronRight
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${expandido ? "rotate-90" : ""}`}
          />
        </Button>
      )}

      <span className={disponible ? "font-medium" : "font-medium text-muted-foreground"}>{nombre}</span>

      {tipo === "" ? null : <Badge variant="outline">{tipo}</Badge>}

      {nodo.codigo === null ? null : <span className="font-mono text-xs text-muted-foreground">{nodo.codigo}</span>}

      {detalle === undefined ? null : <span className="text-xs text-muted-foreground">({detalle})</span>}

      {nodo.activo ? null : <Badge variant="secondary">Retirado</Badge>}

      <div className="ml-auto flex flex-wrap items-center gap-2">
        {agregarHijo === null ? null : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={tactil}
            aria-label={agregarHijo.etiqueta}
            onClick={agregarHijo.onClick}
          >
            <Plus aria-hidden="true" />
            {agregarHijo.texto}
          </Button>
        )}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={tactil}
          aria-label={`Renombrar ${nombre}`}
          onClick={onRenombrar}
        >
          Renombrar
        </Button>

        {nodo.activo ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className={tactil}
            aria-label={`Retirar ${nombre}`}
            onClick={onRetirar}
          >
            Retirar
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={tactil}
            aria-label={`Reactivar ${nombre}`}
            onClick={onReactivar}
          >
            Reactivar
          </Button>
        )}
      </div>
    </div>
  );
}

/** La línea del conteo en el retiro (R20), en sus tres estados. No bloquea el retiro. */
function textoDelConteo(conteo: EstadoConteo): string {
  if (conteo.estado === "cargando") return "Contando las órdenes sin entregar de este nodo, de todas las empresas…";
  if (conteo.estado === "error") {
    return "No se pudo contar las órdenes sin entregar de este nodo. Puedes retirarlo igual.";
  }
  return `Órdenes sin entregar en este nodo, de todas las empresas: ${conteo.ordenes}.`;
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
      return "Ese nodo ya no está en el catálogo.";
    case "conflict":
      return "Ya existe un nodo con ese nombre o ese código.";
    default:
      return "No se pudo completar la acción.";
  }
}

/** El motivo del servidor tal cual (ficha 392): el del nombre, o el del código. */
function mensajeDeValidacion(fieldErrors: FieldErrors): string {
  return fieldErrors.nombre?.[0] ?? fieldErrors.codigo?.[0] ?? mensajeDeDesenlace("validation_error");
}
