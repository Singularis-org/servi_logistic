"use client";

// SL-20 (T5.7, design §8; R42) — primitiva de AUTOCOMPLETADO sobre `@base-ui/react/combobox` 1.6.
// La versión instalada trae `Combobox` (Root/Input/Portal/Positioner/Popup/List/Item/Empty), así que
// no hace falta dependencia nueva ni armarlo con `Popover` + `Input`. Mismo contrato mínimo que
// `select.tsx`: valor controlado, opciones por props y los textos visibles los pone quien la usa.
//
// Base UI aporta el rol `combobox` del input, `aria-expanded`, el `listbox` con sus `option`, la
// navegación por teclado y el foco.

import type { ReactNode } from "react";
import { Combobox as ComboboxPrimitive } from "@base-ui/react/combobox";

import { cn } from "@/lib/utils";

export interface ComboboxProps<Item> {
  /** Las opciones, completas: el filtro lo aplica el propio control al escribir. */
  items: readonly Item[];
  /** La opción elegida, o `null` sin elegir. */
  value: Item | null;
  /** Emite la opción elegida; `null` si se borra la elección. */
  onValueChange: (item: Item | null) => void;
  /** Texto de la opción en la lista y en el input una vez elegida. */
  itemToLabel: (item: Item) => string;
  /** Clave estable de la opción (`key` de React e igualdad entre opciones). */
  itemKey: (item: Item) => string;
  /** Si casa la opción con lo escrito. Sin él, Base UI compara con `itemToLabel`. */
  filter?: (item: Item, query: string) => boolean;
  /** Texto cuando lo escrito no casa con ninguna opción. */
  emptyText: ReactNode;
  placeholder?: string;
  disabled?: boolean;
  /** Id del input, para casar con un `Label htmlFor` (patrón `FormField`). */
  id?: string;
  "aria-label"?: string;
  "aria-invalid"?: true | boolean;
  "aria-describedby"?: string;
  "aria-required"?: true | boolean;
  className?: string;
}

export function Combobox<Item>({
  items,
  value,
  onValueChange,
  itemToLabel,
  itemKey,
  filter,
  emptyText,
  placeholder,
  disabled = false,
  id,
  className,
  ...aria
}: Readonly<ComboboxProps<Item>>) {
  return (
    <ComboboxPrimitive.Root<Item>
      items={items}
      value={value}
      onValueChange={(next) => onValueChange((next as Item | null | undefined) ?? null)}
      itemToStringLabel={itemToLabel}
      isItemEqualToValue={(a, b) => itemKey(a) === itemKey(b)}
      filter={filter === undefined ? undefined : (item: Item, query: string) => filter(item, query)}
      disabled={disabled}
    >
      <ComboboxPrimitive.Input
        data-slot="combobox-input"
        id={id}
        placeholder={placeholder}
        aria-label={aria["aria-label"]}
        aria-invalid={aria["aria-invalid"]}
        aria-describedby={aria["aria-describedby"]}
        aria-required={aria["aria-required"]}
        className={cn(
          "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30",
          className,
        )}
      />
      <ComboboxPrimitive.Portal>
        <ComboboxPrimitive.Positioner sideOffset={4} className="isolate z-50">
          <ComboboxPrimitive.Popup
            data-slot="combobox-content"
            className="max-h-64 w-(--anchor-width) overflow-auto rounded-lg border border-border bg-background p-1 shadow-lg outline-none"
          >
            <ComboboxPrimitive.Empty className="px-2 py-1.5 text-sm text-muted-foreground empty:hidden">
              {emptyText}
            </ComboboxPrimitive.Empty>
            <ComboboxPrimitive.List>
              {(item: Item) => (
                <ComboboxPrimitive.Item
                  key={itemKey(item)}
                  value={item}
                  className="cursor-default rounded-md px-2 py-1.5 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  {itemToLabel(item)}
                </ComboboxPrimitive.Item>
              )}
            </ComboboxPrimitive.List>
          </ComboboxPrimitive.Popup>
        </ComboboxPrimitive.Positioner>
      </ComboboxPrimitive.Portal>
    </ComboboxPrimitive.Root>
  );
}
