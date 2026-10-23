import { z } from "zod";

// SL-17 (design §7.7, D18 revisada) — la entrada y los desenlaces del alta de empresa.
//
// `maestro` lleva `telefono`, `documento` y `tipoDocumento` además de `nombre` y `email` porque
// `usuario` los exige NOT NULL (pregunta abierta 1 de requirements.md): sin ellos no se puede
// insertar, y rellenarlos con valores inventados chocaría con el único global de `cedula` en la
// segunda empresa. Si Carlos decide otra cosa, cambia este schema y nada más arriba.

/** Formato del slug (design §3, M1): minúsculas, dígitos y guiones sueltos entre bloques. */
export const SLUG_ORGANIZACION = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MIN = 3;
export const SLUG_MAX = 63;

const obligatorio = z.string().trim().min(1);

export const altaEmpresaInputSchema = z
  .object({
    nombre: obligatorio,
    slug: z.string().min(SLUG_MIN).max(SLUG_MAX).regex(SLUG_ORGANIZACION),
    maestro: z
      .object({
        nombre: obligatorio,
        email: z.string().trim().pipe(z.email()),
        telefono: obligatorio,
        documento: obligatorio,
        /** `value` del catálogo `tipo_identificacion` (p. ej. "cedula"). */
        tipoDocumento: obligatorio,
      })
      .strict(),
  })
  .strict();

export type AltaEmpresaInput = z.infer<typeof altaEmpresaInputSchema>;

/** Lo que el repositorio recibe: la entrada ya validada y el hash no utilizable del maestro. */
export type AltaEmpresaDatos = Omit<AltaEmpresaInput, "maestro"> & {
  maestro: AltaEmpresaInput["maestro"] & { passwordHash: string };
};

export type CampoEnConflicto = "slug" | "email" | "documento";

export type AltaEmpresaResultado =
  | { estado: "creada"; organizacionId: string; maestroId: string }
  | { estado: "ya_existe"; organizacionId: string }
  | { estado: "conflicto"; campo: CampoEnConflicto }
  /** `campo` es la ruta del dato rechazado: `slug`, `maestro.email`, `maestro.tipoDocumento`… */
  | { estado: "invalida"; campo: string };
