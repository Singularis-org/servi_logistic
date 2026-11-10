"use client";

import { useContext } from "react";
import { PaisDeLaEmpresaContexto } from "@/providers/PaisDeLaEmpresaProvider";
import type { TelefonoDelPais } from "@/lib/types/pais";

/**
 * SLT-81 (design §7.1) — prefijo y dígitos nacionales del país de la empresa de la sesión.
 *
 * Sin proveedor devuelve `null`, como un país sin prefijo (R23): los formularios se montan sueltos en
 * los tests, y dar el prefijo de un país por defecto escondería un país implícito.
 */
export function useTelefonoDelPais(): TelefonoDelPais | null {
  return useContext(PaisDeLaEmpresaContexto);
}
