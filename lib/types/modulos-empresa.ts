import type { ModuloApagable } from "@prisma/client";
import { z } from "zod";

import { ORDEN_MODULOS } from "@/lib/modulos/catalogo";

// SL-23 (design §5.2; R2, R11) — el borde de la gestión de módulos por el superadmin. La clave del
// módulo se valida contra el catálogo cerrado: un nombre del núcleo («Cierres», «Inicio») o una clave
// retirada no es un módulo y no llega al repositorio.

export const verModulosEmpresaSchema = z.object({
  organizacionId: z.uuid(),
});

export const fijarModuloEmpresaSchema = z.object({
  organizacionId: z.uuid(),
  modulo: z.enum(ORDEN_MODULOS),
  activo: z.boolean(),
});

export type VerModulosEmpresaInput = z.infer<typeof verModulosEmpresaSchema>;
export type FijarModuloEmpresaInput = z.infer<typeof fijarModuloEmpresaSchema>;

export interface ModuloDeEmpresa {
  clave: ModuloApagable;
  nombre: string;
  activo: boolean;
}

/** Lo que pinta el detalle de una empresa: sus módulos en el orden de pantalla. */
export interface ModulosDeEmpresa {
  organizacionId: string;
  nombre: string;
  modulos: ModuloDeEmpresa[];
}

type Rechazo = { estado: "forbidden" } | { estado: "validation_error" } | { estado: "not_found" };

export type VerModulosEmpresaResult = { estado: "ok"; empresa: ModulosDeEmpresa } | Rechazo;

/** `cambio: false` = ya estaba así (R13): no se escribió nada ni se registró ninguna acción. */
export type FijarModuloEmpresaResult = { estado: "ok"; cambio: boolean } | Rechazo;
