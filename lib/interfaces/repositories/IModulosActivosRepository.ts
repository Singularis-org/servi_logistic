import type { ModuloApagable } from "@prisma/client";

// SL-23 (design §5.1) — los módulos encendidos de la EMPRESA EN CURSO.
//
// La empresa no es un argumento: la ponen la extensión y la RLS (R7, R25). Un `organizacionId` aquí
// sería una segunda fuente de la empresa que un llamador podría rellenar con la de otra.

export interface IModulosActivosRepository {
  /** Las claves con fila en `organizacion_modulo`. Sin empresa en contexto, `EmpresaNoResuelta`. */
  activos(): Promise<ModuloApagable[]>;
}
