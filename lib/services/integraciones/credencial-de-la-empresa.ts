// SL-36 (design §9.1; R23, R28, R30) — piezas comunes a los consumidores de una integracion: de que
// empresa es la credencial que se va a usar, quien la lee y como se avisa de un rechazo del
// proveedor durante un uso real.
//
// Las comparten WhatsApp, Maps, rutas y el asistente para que ninguno resuelva la empresa a su
// manera: una sola regla (contexto explicito o, si no hay, la sesion) y un solo «falla cerrado» en
// plataforma.
import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import { contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import { IntegracionRepository } from "@/lib/repositories/IntegracionRepository";
import { CredencialesIntegracionService } from "@/lib/services/CredencialesIntegracionService";
import type { ServicioIntegracion } from "@/lib/types/integraciones";

/** El lector real de credenciales. Sin cache a proposito (R28): cada uso va a la base. */
export function credencialesIntegracionReales(): ICredencialesIntegracion {
  return new CredencialesIntegracionService({
    repo: new IntegracionRepository(getPrismaClient()),
    cifrador: new BovedaIntegraciones(),
  });
}

/**
 * La empresa en curso. En plataforma no hay empresa a la que pedirle la credencial, y prestar la de
 * otra es justo lo que SL-36 prohibe: falla cerrado, como cualquier operacion de negocio.
 */
export async function empresaEnCurso(
  servicio: ServicioIntegracion,
  empresaDeLaSesion: () => Promise<string | null> = empresaDeLaPeticion,
): Promise<string> {
  const contexto = contextoActual();
  if (contexto?.tipo === "empresa") return contexto.organizacionId;
  if (contexto?.tipo === "plataforma") throw new EmpresaNoResuelta("Integracion", servicio);
  const organizacionId = await empresaDeLaSesion();
  if (organizacionId === null) throw new EmpresaNoResuelta("Integracion", servicio);
  return organizacionId;
}

interface Registro {
  warn(mensaje: string): void;
}

/**
 * `fetch` que llama a `alRechazar` cuando la respuesta es la señal de rechazo del proveedor (R30,
 * design §5). La respuesta no cambia: el cliente la sigue clasificando como siempre. Un fallo al
 * marcar se avisa por su nombre y tampoco cambia nada: la marca es para la pantalla del maestro, no
 * para el uso en curso.
 */
export function fetchQueAvisaRechazo(
  base: typeof fetch,
  esRechazo: (respuesta: Response) => boolean,
  alRechazar: () => Promise<void>,
  etiqueta: string,
  log: Registro = console,
): typeof fetch {
  return async (input, init) => {
    const respuesta = await base(input, init);
    if (esRechazo(respuesta)) {
      try {
        await alRechazar();
      } catch (error) {
        log.warn(`[${etiqueta}] rechazo de credencial no anotado: ${error instanceof Error ? error.name : "error"}`);
      }
    }
    return respuesta;
  };
}
