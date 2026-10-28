"use server";

import { randomUUID } from "node:crypto";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";

import { construirIntegracionesService, urlWebhookWhatsapp } from "@/lib/actions/_shared/integraciones";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { baseUrlDeLaApp } from "@/lib/config/app-url";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type {
  Actor,
  AltaIntegracionResultado,
  DesconectarIntegracionResultado,
  EditarIntegracionResultado,
  IIntegracionesService,
  ListarIntegracionesResultado,
  ProbarIntegracionResultado,
  RegenerarTokenResultado,
} from "@/lib/interfaces/services/IIntegracionesService";
import {
  TEXTOS_ERROR_INTEGRACION,
  type ResultadoInesperadoIntegracion,
  type ServicioIntegracion,
} from "@/lib/types/integraciones";

// SL-36 (design §1, §4, §10; R6, R7, R12-R18, R31-R33) — las Server Actions de
// `/configuracion/integraciones`.
//
// La action no decide nada: resuelve el actor de la SESIÓN (R7: nunca de la entrada) y se lo pasa al
// service, que rechaza a quien no es maestro de una empresa (R6) y valida los campos. Sin sesión el
// actor es `null` y el service responde `forbidden`: la pantalla no distingue «sin sesión» de «sin
// permiso», y no hace falta (el middleware ya manda a iniciar sesión).
//
// Lo que el service LANZA (base caída, bóveda sin configurar) sale como `unexpected` con una
// referencia. Al log van la operación, la referencia, el NOMBRE del error y su código: el mensaje
// no, porque el de Prisma cita los argumentos de la consulta, y en un alta son los secretos cifrados.
//
// El token de verificación (R18) viaja solo en el resultado del alta de WhatsApp y de regenerar. Por
// eso regenerar NO revalida la página: no cambia nada visible, y lo único nuevo es el token, que no
// debe acabar en ningún dato que la página vuelva a pintar.

const RUTA_PANTALLA = "/configuracion/integraciones";

export type ListarIntegracionesAccion = ListarIntegracionesResultado | ResultadoInesperadoIntegracion;
export type AltaIntegracionAccion = AltaIntegracionResultado | ResultadoInesperadoIntegracion;
export type EditarIntegracionAccion = EditarIntegracionResultado | ResultadoInesperadoIntegracion;
export type ProbarIntegracionAccion = ProbarIntegracionResultado | ResultadoInesperadoIntegracion;
export type RegenerarTokenIntegracionAccion = RegenerarTokenResultado | ResultadoInesperadoIntegracion;
export type DesconectarIntegracionAccion = DesconectarIntegracionResultado | ResultadoInesperadoIntegracion;

export interface IntegracionesActionDeps {
  integracionesService?: IIntegracionesService;
  getActor?: () => Promise<Actor | null>;
  /** Canal del log de `unexpected`; por defecto `console.error`. Solo recibe datos sin secretos. */
  log?: (mensaje: string, datos: Readonly<Record<string, string>>) => void;
}

/* -------------------------------------------------------------------------- */
/* Borde                                                                        */
/* -------------------------------------------------------------------------- */

// Solo la CÁSCARA de la entrada: los campos de cada servicio los valida el service, que es quien
// conoce su esquema. Una cáscara mal formada no se rechaza aquí con otro texto: se pasa un valor que
// el service trata como inválido (`servicio` vacío → `invalid_input`; `id` vacío → `no_encontrada`,
// el mismo de R9 para un id inexistente o de otra empresa).
const entradaAlta = z.object({ servicio: z.string(), campos: z.unknown() });
const entradaConId = z.object({ id: z.string() });
const entradaEdicion = entradaConId.extend({ campos: z.unknown() });

function idDe(input: unknown): string {
  const r = entradaConId.safeParse(input);
  return r.success ? r.data.id : "";
}

function logPorDefecto(mensaje: string, datos: Readonly<Record<string, string>>): void {
  console.error(mensaje, datos);
}

function inesperado(operacion: string, error: unknown, deps: IntegracionesActionDeps): ResultadoInesperadoIntegracion {
  const referencia = randomUUID();
  const codigo = (error as { code?: unknown } | null)?.code;
  (deps.log ?? logPorDefecto)(`[integraciones] ${operacion} falló`, {
    referencia,
    error: error instanceof Error ? error.name : typeof error,
    ...(typeof codigo === "string" ? { codigo } : {}),
  });
  return { status: "unexpected", referencia, texto: TEXTOS_ERROR_INTEGRACION.unexpected };
}

/**
 * Origen de la petición en curso, para la URL del webhook cuando falta `NEXT_PUBLIC_APP_URL`. Solo
 * llega al maestro que hizo la petición: una cabecera falsa solo engaña a quien la mandó.
 */
async function origenDeLaPeticion(): Promise<string | null> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  const protocolo = h.get("x-forwarded-proto") ?? "https";
  return `${protocolo}://${host}`;
}

async function servicio(deps: IntegracionesActionDeps): Promise<IIntegracionesService> {
  if (deps.integracionesService) return deps.integracionesService;
  const base = baseUrlDeLaApp();
  return construirIntegracionesService({
    prisma: getPrismaClient(),
    env: process.env,
    urlWebhook: urlWebhookWhatsapp(base, base === null ? await origenDeLaPeticion() : null),
  });
}

/** Actor de la sesión + service + captura. `revalidar` dice con qué resultados cambia la página. */
async function ejecutar<R extends { status: string }>(
  operacion: string,
  deps: IntegracionesActionDeps,
  fn: (s: IIntegracionesService, actor: Actor | null) => Promise<R>,
  revalidar: (r: R) => boolean = () => false,
): Promise<R | ResultadoInesperadoIntegracion> {
  let resultado: R;
  try {
    const actor = await (deps.getActor ?? resolveActorFromSession)();
    resultado = await fn(await servicio(deps), actor);
  } catch (error) {
    return inesperado(operacion, error, deps);
  }
  if (revalidar(resultado)) revalidatePath(RUTA_PANTALLA);
  return resultado;
}

/* -------------------------------------------------------------------------- */
/* Actions                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * R5, R34: los cuatro servicios de la empresa del maestro, en el orden de la pantalla. La usa el
 * Server Component de la página; nunca trae secretos ni el token (los quita el service).
 */
export async function listarIntegraciones(deps: IntegracionesActionDeps = {}): Promise<ListarIntegracionesAccion> {
  return ejecutar("listar", deps, (s, actor) => s.listar(actor));
}

/**
 * R12, R13, R16, R18: alta con prueba previa. Entrada `{ servicio, campos }`.
 */
export async function altaIntegracion(input: unknown, deps: IntegracionesActionDeps = {}): Promise<AltaIntegracionAccion> {
  const r = entradaAlta.safeParse(input);
  const servicioPedido = (r.success ? r.data.servicio : "") as ServicioIntegracion;
  const campos = r.success ? r.data.campos : undefined;
  return ejecutar(
    "alta",
    deps,
    (s, actor) => s.alta(actor, servicioPedido, campos),
    (res) => res.status === "creada",
  );
}

/**
 * R13, R14, R16: edición; un secreto vacío conserva el guardado. Entrada `{ id, campos }`.
 */
export async function editarIntegracion(input: unknown, deps: IntegracionesActionDeps = {}): Promise<EditarIntegracionAccion> {
  const r = entradaEdicion.safeParse(input);
  const id = r.success ? r.data.id : "";
  const campos = r.success ? r.data.campos : undefined;
  return ejecutar(
    "editar",
    deps,
    (s, actor) => s.editar(actor, id, campos),
    (res) => res.status === "guardada",
  );
}

/**
 * R15, R16: «Probar conexión». Revalida también si sale mal: la prueba escribe el estado (design §4).
 */
export async function probarIntegracion(input: unknown, deps: IntegracionesActionDeps = {}): Promise<ProbarIntegracionAccion> {
  const id = idDe(input);
  return ejecutar(
    "probar",
    deps,
    (s, actor) => s.probar(actor, id),
    (res) => res.status === "probada",
  );
}

/**
 * R18: token nuevo, devuelto una sola vez con la URL del webhook. Sin revalidar (ver cabecera).
 */
export async function regenerarTokenIntegracion(
  input: unknown,
  deps: IntegracionesActionDeps = {},
): Promise<RegenerarTokenIntegracionAccion> {
  const id = idDe(input);
  return ejecutar("regenerarToken", deps, (s, actor) => s.regenerarToken(actor, id));
}

/**
 * R32: borra la integración y sus credenciales. La confirmación con el aviso de R31 es de la UI.
 */
export async function desconectarIntegracion(
  input: unknown,
  deps: IntegracionesActionDeps = {},
): Promise<DesconectarIntegracionAccion> {
  const id = idDe(input);
  return ejecutar(
    "desconectar",
    deps,
    (s, actor) => s.desconectar(actor, id),
    (res) => res.status === "desconectada",
  );
}
