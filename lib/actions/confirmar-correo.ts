"use server";

import {
  confirmarCambioCorreoSchema,
  type ConfirmarCambioCorreoResult,
} from "@/lib/types/usuario";
import type { IConfirmarCorreoService } from "@/lib/interfaces/services/IConfirmarCorreoService";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { UserRepository } from "@/lib/repositories/UserRepository";
import { ConfirmarCorreoService } from "@/lib/services/ConfirmarCorreoService";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";
import {
  requestContextFromHeaders,
  type RequestContext,
} from "@/lib/actions/_shared/contexto-peticion";

// SLT-221 (design §3.3): en un archivo "use server" toda función EXPORTADA es un endpoint; el
// composition root y el limitador no se exportan. El limitador vive en el módulo para que cuente
// entre peticiones (R1629), como el de `contexto-peticion`.
const limitador = new ResetRateLimiter();

function buildConfirmarCorreoService(): IConfirmarCorreoService {
  return new ConfirmarCorreoService(new UserRepository(getPrismaClient()), limitador);
}

export interface ConfirmarCorreoDeps {
  service?: IConfirmarCorreoService;
  getContext?: () => Promise<RequestContext>;
}

/**
 * SLT-221 (design §4.3; R1622-R1629): la persona confirma su correo nuevo con el enlace, sin sesión
 * y sin contraseña. Abrir la página no llama a esto (R1626): solo el botón.
 *
 * @sin-superficie SLT-221 en curso: la monta el botón «Confirmar correo» de `/recuperar-contrasena/confirmar-correo` (tarea T3.2, pantalla, tras el canvas de T2.0); al montarlo esta anotacion caduca y se quita.
 */
export async function confirmarCambioCorreo(
  input: unknown,
  deps: ConfirmarCorreoDeps = {},
): Promise<ConfirmarCambioCorreoResult> {
  const parsed = confirmarCambioCorreoSchema.safeParse(input);
  if (!parsed.success) return { status: "validation_error" };

  const service = deps.service ?? buildConfirmarCorreoService();
  const { ipAddress } = await (deps.getContext ?? requestContextFromHeaders)();
  const entrada = { enlace: parsed.data.enlace, ipAddress };

  // Sin sesión ni empresa: lo único que se lee así es la empresa del pendiente, por el id del enlace.
  const organizacionId = await comoPlataforma(
    "SL-18",
    "confirmar cambio de correo: el enlace lleva a su empresa",
    () => service.empresaDelEnlace(entrada),
  );
  if (organizacionId === null) return { status: "invalid_or_expired" }; // R1623

  // El canje corre bajo la RLS de esa empresa: el UPDATE y la fila del Histórico.
  return conEmpresa(organizacionId, () => service.confirmar(entrada));
}
