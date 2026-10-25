// SL-36 (design §9.1; R23, R24, R29, R30) — la credencial de WhatsApp de la empresa EN CURSO, lista
// para construir los clientes de Meta. Es el unico camino por el que un consumidor (jobs, actions,
// cron, chat, plantillas) obtiene un token: la plataforma ya no presta el suyo.
//
// La empresa sale del contexto explicito (job, cron, webhook: ya corren en `conEmpresa`) o, en una
// action o un route con sesion, de la cookie, igual que hace la extension del cliente. La lectura y
// la marca de rechazo se hacen en `conEmpresa` de ESA empresa: la credencial que se descifra y la
// fila que se marca no pueden ser de otra.
import { empresaDeLaPeticion } from "@/lib/auth/empresa-de-la-peticion";
import { fetchQueVigilaRechazo } from "@/lib/clients/whatsapp-rechazo-credencial";
import { whatsappConfigDe, WhatsappNoConfiguradoError, type WhatsappConfig } from "@/lib/config/whatsapp";
import { BovedaIntegraciones } from "@/lib/crypto/boveda-integraciones";
import { conEmpresa, contextoActual, EmpresaNoResuelta } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { ICredencialesIntegracion } from "@/lib/interfaces/services/ICredencialesIntegracion";
import { IntegracionRepository } from "@/lib/repositories/IntegracionRepository";
import { CredencialesIntegracionService } from "@/lib/services/CredencialesIntegracionService";

/** Todo lo que un cliente de Meta necesita de la empresa. */
export interface WhatsappDeLaEmpresa {
  organizacionId: string;
  integracionId: string;
  config: WhatsappConfig;
  /**
   * El `fetch` con que se construyen TODOS los clientes de Meta de esta empresa: avisa a la
   * integracion si Meta rechaza el token (R30). Un cliente construido con el `fetch` global no
   * dejaria la marca.
   */
  fetchImpl: typeof fetch;
}

export interface WhatsappDeLaEmpresaDeps {
  credenciales?: ICredencialesIntegracion;
  /** La empresa de la sesion cuando no hay contexto explicito. Inyectable en tests. */
  empresaDeLaSesion?: () => Promise<string | null>;
  fetchBase?: typeof fetch;
  log?: { warn(mensaje: string): void };
}

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
export async function empresaEnCurso(empresaDeLaSesion: () => Promise<string | null> = empresaDeLaPeticion): Promise<string> {
  const contexto = contextoActual();
  if (contexto?.tipo === "empresa") return contexto.organizacionId;
  if (contexto?.tipo === "plataforma") throw new EmpresaNoResuelta("Integracion", "whatsapp");
  const organizacionId = await empresaDeLaSesion();
  if (organizacionId === null) throw new EmpresaNoResuelta("Integracion", "whatsapp");
  return organizacionId;
}

/**
 * Lanza `WhatsappNoConfiguradoError` si la empresa no tiene WhatsApp o su credencial no se lee (R24,
 * R29), ANTES de construir ningun cliente: sin credencial no sale ninguna llamada a Meta.
 */
export async function whatsappDeLaEmpresa(deps: WhatsappDeLaEmpresaDeps = {}): Promise<WhatsappDeLaEmpresa> {
  const organizacionId = await empresaEnCurso(deps.empresaDeLaSesion);
  const credenciales = deps.credenciales ?? credencialesIntegracionReales();
  const lectura = await conEmpresa(organizacionId, () => credenciales.leer("whatsapp"));
  if (lectura.estado !== "lista") throw new WhatsappNoConfiguradoError(lectura.estado);

  const marcarRechazo = () =>
    conEmpresa(organizacionId, () => credenciales.marcarRechazo("whatsapp", "whatsapp.credencial_rechazada"));
  return {
    organizacionId,
    integracionId: lectura.integracionId,
    config: whatsappConfigDe(lectura.credencial, lectura.datosPublicos),
    fetchImpl: fetchQueVigilaRechazo(deps.fetchBase ?? fetch, marcarRechazo, deps.log),
  };
}

/**
 * Para los composition roots que degradan en vez de fallar (actions con `no_configurado`, el CRUD
 * local de plantillas): `null` sin WhatsApp. Sin empresa (el superadmin) tampoco hay WhatsApp que
 * usar, y la operacion de negocio ya falla cerrado por su cuenta; responder aqui con un error
 * cambiaria su `forbidden` por un `unexpected`. Cualquier otro error (base caida, boveda sin
 * configurar) se propaga: no es «no configurado» y esconderlo seria mentir en la pantalla.
 */
export async function whatsappDeLaEmpresaOpcional(
  deps: WhatsappDeLaEmpresaDeps = {},
): Promise<WhatsappDeLaEmpresa | null> {
  try {
    return await whatsappDeLaEmpresa(deps);
  } catch (error) {
    if (error instanceof WhatsappNoConfiguradoError || error instanceof EmpresaNoResuelta) return null;
    throw error;
  }
}
