"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { COLUMNA_FIJA, TACTIL_MOVIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import { editarPremioAction } from "@/lib/actions/ranking";
import type { PremioRankingDTO } from "@/lib/types/ranking";
import { cn } from "@/lib/utils";

import { PREMIOS_FEEDBACK, PREMIOS_LABELS, money } from "./ranking-labels";

/**
 * SLT-162 «Ranking del mensajero en tarjetas en el móvil» (R752, R753) — en el teléfono la fila se
 * maqueta como TARJETA con CSS sobre el mismo DOM (en escritorio, la fila de hoy):
 *
 *   «{n}º · {ocupante}»                     (fila 1: el `th` y la celda del ocupante)
 *   descripción          Monto del premio   (fila 2, solo lectura: la descripción a la izquierda
 *                        {monto}             y el monto en columna fija a la derecha)
 *
 * Editable (DC24): el monto, la descripción y «Guardar» van cada uno en su línea, a todo el ancho y
 * a 44 px. Los rótulos visibles de la tarjeta son `aria-hidden`: el nombre accesible ya lo dan la
 * cabecera de la tabla (solo para lector en el teléfono) y el `aria-label` de cada campo.
 */
const FILA_TARJETA =
  "border-b max-md:grid max-md:grid-cols-[auto_minmax(0,1fr)_auto] max-md:gap-x-1 max-md:gap-y-3 max-md:rounded-lg max-md:border max-md:p-4";
const CELDA = "px-3 py-2 align-middle max-md:p-0";
/** Una línea entera de la tarjeta (campos y «Guardar» del editable). */
const LINEA_ENTERA = "max-md:col-span-3 max-md:col-start-1";
/** Rótulo que solo se ve en la tarjeta. */
const ROTULO_TARJETA = "block text-xs font-normal text-muted-foreground md:hidden";

// Feature 76 (T9) — fila de una posición del podio en la tabla de premios. Muestra el
// ocupante ELEGIBLE de esa posición (R14; `null` = posición sin ocupante, NO se inventa,
// R15) junto a su premio. Si `esEditable` (maestro, R16) ofrece DOS inputs abiertos
// —monto (vacío = sin premio, R9) y descripción (texto libre, vacío = sin descripción,
// R25)— y un botón que llama a `editarPremioAction` (Server Action, NUNCA fetch a /api).
// El mensajero (R17) ve todo en solo-lectura, incluida la descripción. Money-safe: el
// monto se muestra TAL CUAL con `money`, sin parseFloat/Number.

export interface PremioInputRowProps {
  premio: PremioRankingDTO;
  /** Nombre del mensajero que ocupa esta posición del podio; `null` si no hay ocupante (R15). */
  ocupanteNombre: string | null;
  /** Solo el maestro edita (R16); el mensajero recibe `false` → solo-lectura (R17). */
  esEditable: boolean;
}

export function PremioInputRow({
  premio,
  ocupanteNombre,
  esEditable,
}: PremioInputRowProps) {
  const router = useRouter();
  const toast = useToast();

  const [monto, setMonto] = useState(premio.monto ?? "");
  const [descripcion, setDescripcion] = useState(premio.descripcion ?? "");
  const [guardando, setGuardando] = useState(false);

  const ocupanteLabel = ocupanteNombre ?? PREMIOS_LABELS.sinOcupante;

  async function guardar() {
    setGuardando(true);
    try {
      // El borde (zod de la action) trata "" → null en ambos campos (R9/R25). No
      // pre-parseamos el monto en cliente: money-safe, el servidor valida con Decimal.
      const result = await editarPremioAction({
        posicion: premio.posicion,
        monto: monto.trim() === "" ? null : monto.trim(),
        descripcion: descripcion.trim() === "" ? null : descripcion.trim(),
      });

      if (result.status === "ok") {
        toast.success(PREMIOS_FEEDBACK.guardado);
        router.refresh(); // R10: refleja el cambio en la siguiente lectura
        return;
      }
      if (result.status === "invalid") {
        toast.error(result.message ?? PREMIOS_FEEDBACK.invalid);
        return;
      }
      if (result.status === "forbidden") {
        toast.error(PREMIOS_FEEDBACK.forbidden);
        return;
      }
      // unauthenticated
      toast.error(PREMIOS_FEEDBACK.unauthenticated);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <tr data-tarjeta-premio="" className={FILA_TARJETA}>
      <th
        scope="row"
        className={cn(
          CELDA,
          "font-medium max-md:col-start-1 max-md:row-start-1 max-md:whitespace-nowrap max-md:text-[15px] max-md:font-bold",
        )}
      >
        {premio.posicion}
        <span aria-hidden="true" className="md:hidden">
          º ·
        </span>
      </th>
      <td
        data-columna="ocupante"
        className={cn(
          CELDA,
          "max-md:col-span-2 max-md:col-start-2 max-md:row-start-1 max-md:text-[15px] max-md:font-bold",
          TEXTO_ENTERO,
        )}
      >
        {ocupanteLabel}
      </td>

      {esEditable ? (
        <>
          <td className={cn(CELDA, LINEA_ENTERA)}>
            <span aria-hidden="true" className={cn(ROTULO_TARJETA, "mb-1")}>
              {PREMIOS_LABELS.monto}
            </span>
            <Input
              className="max-md:h-11"
              inputMode="decimal"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              disabled={guardando}
              aria-label={`${PREMIOS_LABELS.monto} — posición ${premio.posicion}`}
              placeholder={PREMIOS_LABELS.montoPlaceholder}
            />
          </td>
          <td className={cn(CELDA, LINEA_ENTERA)}>
            <span aria-hidden="true" className={cn(ROTULO_TARJETA, "mb-1")}>
              {PREMIOS_LABELS.descripcionPremio}
            </span>
            <Input
              className="max-md:h-11"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              disabled={guardando}
              aria-label={`${PREMIOS_LABELS.descripcionPremio} — posición ${premio.posicion}`}
              placeholder={PREMIOS_LABELS.descripcionPlaceholder}
            />
          </td>
          <td className={cn(CELDA, LINEA_ENTERA)}>
            <Button
              type="button"
              size="sm"
              className={cn(TACTIL_MOVIL, "max-md:w-full")}
              disabled={guardando}
              onClick={() => void guardar()}
            >
              {guardando ? PREMIOS_LABELS.guardando : PREMIOS_LABELS.guardar}
            </Button>
          </td>
        </>
      ) : (
        <>
          {/* Solo-lectura (R17): monto (R9) y descripción (R25) sin inputs. */}
          <td
            data-columna="monto"
            className={cn(
              CELDA,
              "max-md:col-start-3 max-md:row-start-2 max-md:self-end max-md:pl-2 max-md:text-right",
            )}
          >
            <span aria-hidden="true" className={cn(ROTULO_TARJETA, "whitespace-nowrap")}>
              {PREMIOS_LABELS.monto}
            </span>
            {premio.monto === null ? (
              <span className={cn("block text-muted-foreground md:inline", TEXTO_ENTERO)}>
                {PREMIOS_LABELS.sinMonto}
              </span>
            ) : (
              <span className={cn("block max-md:text-xl max-md:font-bold md:inline", COLUMNA_FIJA)}>
                {money(premio.monto)}
              </span>
            )}
          </td>
          <td
            data-columna="descripcion"
            className={cn(
              CELDA,
              "max-md:col-span-2 max-md:col-start-1 max-md:row-start-2 max-md:self-end max-md:text-muted-foreground",
              TEXTO_ENTERO,
            )}
          >
            {premio.descripcion === null ? (
              <span className="text-muted-foreground">
                {PREMIOS_LABELS.sinDescripcion}
              </span>
            ) : (
              premio.descripcion
            )}
          </td>
        </>
      )}
    </tr>
  );
}
