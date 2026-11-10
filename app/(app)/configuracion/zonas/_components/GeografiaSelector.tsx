"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { ChevronRight, CornerDownRight } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ArbolDeZonasDTO, NodoDeZonasDTO } from "@/lib/types/geografia-nodo";
import { filtrarArbolDeNodos } from "@/app/(app)/configuracion/_shared/filtrar-arbol-geografico";
import { ESTADO_GEOGRAFICO_TEXTO } from "@/app/(app)/configuracion/_shared/geografia-estado-label";

import {
  alternarNodo,
  distritosBajo,
  estadoDeNodo,
  indexarArbol,
  PROFUNDIDAD_DE_DISTRITO,
  repartirPorProfundidad,
  type EstadoDeNodo,
  type Herencia,
  type NodosRepartidos,
} from "./seleccion-de-zona";

// ⭑ SLT-89 (R24–R27, design §8.1; maqueta aprobada el 2026-11-10) — EL SELECTOR DE N NIVELES.
//
// Fuente de verdad: el conjunto de nodos MARCADOS para esta zona, a cualquier profundidad. Marcar un
// cantón asigna el cantón (no sus distritos uno a uno, design §11.3): sus distritos lo heredan y los que
// están en otra zona quedan a la vista como excepciones. Lo que cada fila dice (heredado, excepción, en
// otra zona) se calcula con la selección EN CURSO, no con la de la base: es lo que va a quedar.
//
// La marca de zona especial ya no se ofrece aquí (R8; nadie la usaba desde SLT-51).
//
// FICHA 374 (R47) sigue valiendo: los nodos retirados se PINTAN, con su distintivo, y su casilla sigue
// operable. Esconderlos haría que el siguiente guardado los quitara de la zona sin que nadie lo viera.

export interface GeografiaSelectorProps {
  arbol: ArbolDeZonasDTO;
  /** Reporta la selección en cada cambio, repartida por profundidad (design §8.1). */
  onSelectedChange?: (seleccion: NodosRepartidos) => void;
  /** Nodos pre-marcados (edición): los asignados a la zona, retirados incluidos (R27). Se lee al montar. */
  initialSelected?: readonly string[];
  /**
   * SLT-75 (R15, R18): la zona que se edita. Sus nodos siguen marcables; los de cualquier otra zona
   * quedan bloqueados. Se omite al crear, y entonces todo nodo con zona queda bloqueado.
   */
  zonaEnEdicionId?: string;
  /** Nombre con el que se dice «hereda de <zona>» para la zona que se edita. */
  nombreZona?: string;
}

export function GeografiaSelector({
  arbol,
  onSelectedChange,
  initialSelected,
  zonaEnEdicionId,
  nombreZona = "",
}: Readonly<GeografiaSelectorProps>) {
  const [query, setQuery] = useState("");
  const idBase = useId();
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(initialSelected ?? []));
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());

  const indice = useMemo(() => indexarArbol(arbol), [arbol]);
  const tipoDe = useMemo(() => {
    const porProfundidad = new Map(arbol.tipos.map((t) => [t.profundidad, t]));
    return (profundidad: number) => porProfundidad.get(profundidad);
  }, [arbol.tipos]);

  // R27: la búsqueda a cualquier profundidad, con `normalizeName` (el filtro N-niveles de SLT-46). Sin
  // filtro de estado a propósito (FICHA 374): esconder un retirado lo quitaría de la zona al guardar.
  const filtradas = useMemo(
    () => filtrarArbolDeNodos(arbol.raices, { texto: query, estado: "todos" }),
    [arbol.raices, query],
  );
  const buscando = query.trim().length > 0;

  useEffect(() => {
    onSelectedChange?.(repartirPorProfundidad(marcados, indice));
    // onSelectedChange se toma fresco en cada corrida; dep solo en la selección.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marcados]);

  function alternarAbierto(id: string) {
    setAbiertos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const nivel = (profundidad: number) => tipoDe(profundidad)?.nombreSingular.toLowerCase() ?? "";
  const placeholder = arbol.tipos
    .slice(0, 3)
    .map((t) => t.nombreSingular.toLowerCase())
    .join(", ");

  function fila(
    nodo: NodoDeZonasDTO,
    herencia: Herencia | null,
    inactivoArriba: NodoDeZonasDTO | null,
  ) {
    const { estado, paraHijos } = estadoDeNodo(nodo, herencia, marcados, zonaEnEdicionId, nombreZona);
    const tieneHijos = nodo.hijos.length > 0;
    const abierto = buscando || abiertos.has(nodo.id);
    const bloqueado = estado.tipo === "otra_zona" || estado.tipo === "hereda_esta";
    const marcado = estado.tipo === "elegido" || estado.tipo === "hereda_esta";
    const etiquetaNivel = nivel(nodo.profundidad);
    const ariaLabel =
      estado.tipo === "otra_zona"
        ? `Seleccionar ${etiquetaNivel} ${nodo.nombre} (zona: ${estado.zona})`
        : `Seleccionar ${etiquetaNivel} ${nodo.nombre}`;
    const retiro = !nodo.activo
      ? ESTADO_GEOGRAFICO_TEXTO.inactivoPropio
      : inactivoArriba !== null
        ? `Inactivo por su ${nivel(inactivoArriba.profundidad)}`
        : null;
    const hijosVisibles = tieneHijos ? contarHijos(nodo, tipoDe) : null;

    return (
      <li key={nodo.id} className="flex flex-col">
        <div
          className="flex min-h-11 items-center gap-1.5 rounded px-1 py-1 hover:bg-accent"
          style={{ paddingLeft: `${(nodo.profundidad - 1) * 16}px` }}
        >
          {tieneHijos ? (
            <button
              type="button"
              aria-expanded={abierto}
              aria-label={`${abierto ? "Cerrar" : "Abrir"} ${nodo.nombre}`}
              onClick={() => alternarAbierto(nodo.id)}
              className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring"
            >
              <ChevronRight
                aria-hidden="true"
                className={cn("size-4 transition-transform duration-200", abierto && "rotate-90")}
              />
            </button>
          ) : (
            <span className="size-7 shrink-0" aria-hidden="true" />
          )}
          <label
            className={cn(
              "flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1 text-sm",
              bloqueado ? "cursor-not-allowed" : "cursor-pointer",
            )}
          >
            <Checkbox
              checked={marcado}
              disabled={bloqueado}
              onCheckedChange={() => setMarcados((prev) => alternarNodo(prev, nodo.id, indice))}
              aria-label={ariaLabel}
              // Review SLT-89 vuelta 1 (m1): el porqué del estado (hereda, excepción, otra zona) llega al
              // lector de pantalla como descripción de la casilla, no solo como texto de la fila.
              aria-describedby={tieneTextoDeEstado(estado) ? `${idBase}-${nodo.id}-estado` : undefined}
            />
            <span className={cn("font-medium", bloqueado && estado.tipo === "otra_zona" && "opacity-70")}>
              {nodo.nombre}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {tipoDe(nodo.profundidad)?.nombreSingular ?? ""}
              {hijosVisibles ? ` · ${hijosVisibles}` : ""}
            </span>
            <TextoDeEstado estado={estado} id={`${idBase}-${nodo.id}-estado`} />
          </label>
          {retiro !== null ? (
            <Badge variant={!nodo.activo ? "secondary" : "outline"}>{retiro}</Badge>
          ) : null}
        </div>
        {tieneHijos && abierto ? (
          <ul className="flex flex-col">
            {nodo.hijos.map((hijo) =>
              fila(hijo, paraHijos, inactivoArriba ?? (nodo.activo ? null : nodo)),
            )}
          </ul>
        ) : null}
      </li>
    );
  }

  // La búsqueda conserva la cadena desde la raíz (un padre sobrevive si un descendiente casa), así que
  // recorrer `filtradas` desde arriba da la misma herencia que el árbol entero.
  const resumen = resumenDeSeleccion(marcados, indice, tipoDe);

  return (
    <div className="flex flex-col gap-3">
      <Input
        type="search"
        placeholder={placeholder ? `Buscar ${placeholder}…` : "Buscar…"}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Buscar en el catálogo geográfico"
      />

      <p aria-live="polite" className="text-sm text-muted-foreground">
        {resumen}
      </p>

      <div className="rounded-md border border-border p-1">
        {filtradas.length === 0 ? (
          <p className="p-2 text-sm text-muted-foreground">Sin resultados.</p>
        ) : (
          <ul className="flex flex-col">{filtradas.map((raiz) => fila(raiz, null, null))}</ul>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Elegir un lugar incluye todo lo que cuelga de él. Un lugar que ya está en otra zona queda como
        excepción: gana lo más específico.
      </p>
    </div>
  );
}

/** «N <hijos>»: cuántos hijos directos tiene, con el nombre de su nivel (singular o plural). */
function contarHijos(
  nodo: NodoDeZonasDTO,
  tipoDe: (profundidad: number) => { nombreSingular: string; nombrePlural: string } | undefined,
): string | null {
  const tipo = tipoDe(nodo.profundidad + 1);
  if (tipo === undefined) return null;
  const n = nodo.hijos.length;
  return `${n} ${(n === 1 ? tipo.nombreSingular : tipo.nombrePlural).toLowerCase()}`;
}

/** El texto de la fila según cómo queda el nodo con la selección en curso (maqueta, R24). */
/** Si la fila pinta un texto de estado que describa la casilla. */
function tieneTextoDeEstado(estado: EstadoDeNodo): boolean {
  return estado.tipo !== "elegido" && estado.tipo !== "libre";
}

function TextoDeEstado({ estado, id }: Readonly<{ estado: EstadoDeNodo; id: string }>) {
  switch (estado.tipo) {
    case "hereda_esta":
    case "hereda_otra":
      return (
        <span id={id} className="inline-flex items-center gap-1 text-xs text-muted-foreground">
          <CornerDownRight aria-hidden="true" className="size-3" />
          {estado.tipo === "hereda_esta" && estado.zona === ""
            ? `hereda de ${estado.nodo}`
            : `hereda de ${estado.zona} por ${estado.nodo}`}
        </span>
      );
    case "otra_zona":
      return estado.excepcionDe !== null ? (
        <Badge id={id} variant="warning">{`Excepción · va a ${estado.zona}`}</Badge>
      ) : (
        <span id={id} className="text-xs text-muted-foreground">{`En ${estado.zona}`}</span>
      );
    default:
      return null;
  }
}

/** El resumen de la maqueta: cuántos lugares van marcados y cuáles. */
function resumenDeSeleccion(
  marcados: ReadonlySet<string>,
  indice: ReturnType<typeof indexarArbol>,
  tipoDe: (profundidad: number) => { nombreSingular: string; nombrePlural: string } | undefined,
): string {
  const distrito = tipoDe(PROFUNDIDAD_DE_DISTRITO);
  if (marcados.size === 0) {
    return "Ningún lugar elegido. Marca un lugar de cualquier nivel: lo que cuelga de él lo hereda.";
  }
  const nombres = [...marcados].map((id) => {
    const n = indice.get(id)?.nodo;
    if (n === undefined) return id;
    const tipo = tipoDe(n.profundidad)?.nombreSingular.toLowerCase();
    const k = distritosBajo(n);
    const extra =
      n.hijos.length > 0 && distrito !== undefined && k > 0
        ? `, ${k} ${(k === 1 ? distrito.nombreSingular : distrito.nombrePlural).toLowerCase()}`
        : "";
    return tipo ? `${n.nombre} (${tipo}${extra})` : n.nombre;
  });
  const cuantos = marcados.size === 1 ? "1 lugar elegido" : `${marcados.size} lugares elegidos`;
  return `${cuantos}: ${nombres.join(", ")}.`;
}
