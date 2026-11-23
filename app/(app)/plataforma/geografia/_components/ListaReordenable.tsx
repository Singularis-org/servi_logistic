"use client";

import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { cn } from "@/lib/utils";

/**
 * R53: reordenar filas arrastrando por la manija (ratón o dedo) o, con la manija enfocada, con
 * ArrowUp/ArrowDown. Arrastre con @dnd-kit (decisión humana P13 del 2026-11-09, desvío aprobado
 * sobre el arrastre nativo de design §6: los eventos `drag*` nativos no funcionan con el dedo).
 *
 * Teclado: NO se usa el KeyboardSensor de dnd-kit. Su modelo es «espacio para levantar, flechas
 * para llevar, espacio para soltar», y R53 pide que la flecha mueva la fila una posición al
 * instante; con los dos activos, la misma tecla tendría dos significados según el estado del
 * arrastre. Un manejador propio en la manija lo resuelve sin estados intermedios.
 */

export interface TextosListaReordenable {
  /** aria-label de la manija. */
  manija: (nombre: string, posicion: number, total: number) => string;
  /** Lo que lee la región aria-live tras mover una fila. */
  anuncio: (nombre: string, posicion: number, total: number) => string;
  /** Instrucciones que dnd-kit asocia al arrastre para lectores de pantalla. */
  instrucciones: string;
}

const TEXTOS_POR_DEFECTO: TextosListaReordenable = {
  manija: (nombre, posicion, total) => `Mover ${nombre}, posición ${posicion} de ${total}`,
  anuncio: (nombre, posicion, total) => `${nombre}: posición ${posicion} de ${total}`,
  instrucciones:
    "Arrastre la manija para mover la fila, o use las flechas arriba y abajo con la manija enfocada.",
};

export interface ListaReordenableProps<T extends { id: UniqueIdentifier }> {
  elementos: readonly T[];
  /** Nombre legible de la fila: entra en el aria-label de la manija y en el anuncio. */
  nombreDe: (elemento: T) => string;
  pintarFila: (elemento: T, indice: number) => ReactNode;
  onReordenar: (nuevaLista: T[]) => void;
  deshabilitado?: boolean;
  /** Nombre accesible de la lista. */
  etiqueta?: string;
  textos?: Partial<TextosListaReordenable>;
  className?: string;
}

// El arrastre solo tiene sentido en vertical; @dnd-kit/modifiers no está aprobada y este
// modificador de una línea no la justifica.
const soloEjeVertical: Modifier = ({ transform }) => ({ ...transform, x: 0 });

// Las announcements por defecto de dnd-kit van en inglés; el anuncio útil (la posición final) lo
// hace la región aria-live propia al soltar.
const SIN_ANUNCIOS_DE_DNDKIT = {
  onDragStart: () => undefined,
  onDragOver: () => undefined,
  onDragEnd: () => undefined,
  onDragCancel: () => undefined,
};

export function ListaReordenable<T extends { id: UniqueIdentifier }>({
  elementos,
  nombreDe,
  pintarFila,
  onReordenar,
  deshabilitado = false,
  etiqueta,
  textos,
  className,
}: ListaReordenableProps<T>) {
  const t = { ...TEXTOS_POR_DEFECTO, ...textos };
  const idContexto = useId();
  const [anuncio, setAnuncio] = useState("");
  const manijas = useRef(new Map<UniqueIdentifier, HTMLButtonElement>());
  const enfocarTrasMover = useRef<UniqueIdentifier | null>(null);

  const sensores = useSensors(
    // Una distancia mínima evita que un clic sobre la manija cuente como arrastre.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    // El retardo deja hacer scroll de la página con el dedo sin levantar la fila por error.
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
  );

  // React mueve el nodo de la fila en el DOM al reordenar y el navegador le quita el foco; se
  // devuelve a la manija de la fila movida cuando el padre ya pintó el nuevo orden.
  useLayoutEffect(() => {
    const id = enfocarTrasMover.current;
    if (id === null) return;
    enfocarTrasMover.current = null;
    manijas.current.get(id)?.focus();
  }, [elementos]);

  const mover = (desde: number, hasta: number, enfocar: boolean) => {
    // En los extremos la flecha no hace nada: envolver al otro lado sorprendería al usuario.
    if (deshabilitado || desde === hasta) return;
    if (hasta < 0 || hasta >= elementos.length) return;
    const nueva = arrayMove([...elementos], desde, hasta);
    const movido = nueva[hasta];
    if (enfocar) enfocarTrasMover.current = movido.id;
    setAnuncio(t.anuncio(nombreDe(movido), hasta + 1, nueva.length));
    onReordenar(nueva);
  };

  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const desde = elementos.findIndex((e) => e.id === active.id);
    const hasta = elementos.findIndex((e) => e.id === over.id);
    if (desde < 0 || hasta < 0) return;
    mover(desde, hasta, false);
  };

  const registrarManija = (id: UniqueIdentifier, nodo: HTMLButtonElement | null) => {
    if (nodo) manijas.current.set(id, nodo);
    else manijas.current.delete(id);
  };

  return (
    <DndContext
      id={idContexto}
      sensors={sensores}
      collisionDetection={closestCenter}
      modifiers={[soloEjeVertical]}
      onDragEnd={alSoltar}
      accessibility={{
        announcements: SIN_ANUNCIOS_DE_DNDKIT,
        screenReaderInstructions: { draggable: t.instrucciones },
      }}
    >
      <SortableContext items={elementos.map((e) => e.id)} strategy={verticalListSortingStrategy}>
        <ul aria-label={etiqueta} className={cn("flex flex-col gap-2", className)}>
          {elementos.map((elemento, indice) => (
            <FilaReordenable
              key={elemento.id}
              id={elemento.id}
              etiquetaManija={t.manija(nombreDe(elemento), indice + 1, elementos.length)}
              deshabilitado={deshabilitado}
              registrarManija={registrarManija}
              onFlecha={(delta) => mover(indice, indice + delta, true)}
            >
              {pintarFila(elemento, indice)}
            </FilaReordenable>
          ))}
        </ul>
      </SortableContext>
      <div role="status" aria-live="polite" className="sr-only">
        {anuncio}
      </div>
    </DndContext>
  );
}

interface FilaReordenableProps {
  id: UniqueIdentifier;
  etiquetaManija: string;
  deshabilitado: boolean;
  registrarManija: (id: UniqueIdentifier, nodo: HTMLButtonElement | null) => void;
  onFlecha: (delta: -1 | 1) => void;
  children: ReactNode;
}

function FilaReordenable({
  id,
  etiquetaManija,
  deshabilitado,
  registrarManija,
  onFlecha,
  children,
}: FilaReordenableProps) {
  const {
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: deshabilitado });

  const alPulsarTecla = (evento: KeyboardEvent<HTMLButtonElement>) => {
    if (evento.key !== "ArrowUp" && evento.key !== "ArrowDown") return;
    // Sin preventDefault la flecha también desplazaría la página.
    evento.preventDefault();
    if (deshabilitado) return;
    onFlecha(evento.key === "ArrowUp" ? -1 : 1);
  };

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "flex items-center gap-2 rounded-lg border border-border bg-background",
        isDragging && "relative z-10 shadow-md",
      )}
    >
      {/* Los `attributes` de useSortable no se esparcen: ponen role/tabIndex/aria-* pensados para
          un div y un KeyboardSensor que aquí no existe; el <button> nativo ya da todo eso. */}
      <button
        type="button"
        ref={(nodo) => {
          setActivatorNodeRef(nodo);
          registrarManija(id, nodo);
        }}
        aria-label={etiquetaManija}
        aria-disabled={deshabilitado || undefined}
        {...listeners}
        onKeyDown={alPulsarTecla}
        className={cn(
          "inline-flex size-11 shrink-0 touch-none items-center justify-center rounded-md text-lg text-foreground outline-none select-none focus-visible:ring-3 focus-visible:ring-ring",
          deshabilitado ? "cursor-not-allowed opacity-50" : "cursor-grab active:cursor-grabbing",
        )}
      >
        <span aria-hidden="true">⠿</span>
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
