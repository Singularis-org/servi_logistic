"use server";

import { z } from "zod";

import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { exigirSuperadmin } from "@/lib/auth/exigir-superadmin";
import {
  buildPasswordResetService,
  requestContextFromHeaders,
  type RequestContext,
} from "@/lib/actions/_shared/contexto-peticion";
import { baseUrlDeLaApp } from "@/lib/config/app-url";
import { emailContacto, emailSmtpConfigurado } from "@/lib/config/email";
import { comoPlataforma } from "@/lib/db/contexto-empresa";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { IBienvenidaMaestroRepository } from "@/lib/interfaces/repositories/IBienvenidaMaestroRepository";
import type {
  EnviarBienvenidaResultado,
  EstadoBienvenida,
  IBienvenidaMaestroService,
} from "@/lib/interfaces/services/IBienvenidaMaestroService";
import type { IOrganizacionService } from "@/lib/interfaces/services/IOrganizacionService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { BienvenidaMaestroRepository } from "@/lib/repositories/BienvenidaMaestroRepository";
import { OrganizacionRepository } from "@/lib/repositories/OrganizacionRepository";
import { BienvenidaMaestroService } from "@/lib/services/BienvenidaMaestroService";
import { crearEmailSender } from "@/lib/services/EmailProvider";
import { OrganizacionService } from "@/lib/services/OrganizacionService";
import type { AltaEmpresaResultado } from "@/lib/types/organizacion";

// SL-17 (design §7.7, R44–R48) — el borde del alta de empresa. La pantalla «Empresas» que la
// llama es de SL-32; aquí solo se decide QUIÉN puede y en qué contexto corre.
// SL-41 (design §7.2, §16.2) — y, tras un alta buena, la bienvenida del maestro y su reenvío.

/**
 * `creada` lleva además el estado de la bienvenida (R23, R24). Nunca el enlace: esta respuesta
 * viaja al navegador del superadmin (R28).
 */
export type AltaEmpresaActionResultado =
  | Exclude<AltaEmpresaResultado, { estado: "creada" }>
  | (Extract<AltaEmpresaResultado, { estado: "creada" }> & { bienvenida: EstadoBienvenida })
  | { estado: "no_autorizado" };

/** R30–R33: el resultado del botón «Reenviar bienvenida». */
export type ReenviarBienvenidaResultado =
  | EnviarBienvenidaResultado
  | { estado: "invalida" }
  | { estado: "no_autorizado" };

/** R38 (design §16.2): las empresas cuyo primer maestro aún no fijó su contraseña. */
export type BienvenidasPendientesResultado =
  | { estado: "ok"; organizacionIds: string[] }
  | { estado: "no_autorizado" }
  | { estado: "error" };

export interface OrganizacionesDeps {
  getActor?: () => Promise<Actor | null>;
  service?: IOrganizacionService;
  bienvenida?: IBienvenidaMaestroService;
  bienvenidaRepo?: IBienvenidaMaestroRepository;
  getContext?: () => Promise<RequestContext>;
}

const reenviarSchema = z.object({ organizacionId: z.uuid() });

/** El composition root: el servicio con su repositorio real sobre el cliente de la app. */
function construirServicio(): IOrganizacionService {
  return new OrganizacionService(new OrganizacionRepository(getPrismaClient()));
}

/**
 * El composition root de la bienvenida. La recuperación se arma con el mismo
 * `buildPasswordResetService` que «recuperar contraseña», para que el enlace salga del mismo
 * limitador y del mismo repositorio de desafíos (D3). La URL, el SMTP y el contacto se leen aquí, en
 * cada llamada, y no al importar: el entorno manda.
 */
function construirBienvenida(): IBienvenidaMaestroService {
  return new BienvenidaMaestroService(
    new BienvenidaMaestroRepository(getPrismaClient()),
    buildPasswordResetService(),
    crearEmailSender(),
    baseUrlDeLaApp(),
    emailSmtpConfigurado(),
    emailContacto(),
  );
}

/** Solo el nombre del error, como en el servicio: el `message` puede llevar un email (R34). */
function causaDe(error: unknown): string {
  return error instanceof Error ? error.name : "desconocido";
}

/**
 * La bienvenida, ya en plataforma: el superadmin no tiene empresa, y el maestro es de la que se
 * acaba de crear. El servicio no lanza, pero armarlo (cliente, cabeceras) sí podría; cualquier
 * fallo aquí se queda en `no_enviada` para que el alta, ya confirmada, siga en pie (D4).
 */
async function enviarBienvenida(
  organizacionId: string,
  motivo: string,
  deps: OrganizacionesDeps,
): Promise<EnviarBienvenidaResultado> {
  try {
    const { ipAddress } = await (deps.getContext ?? requestContextFromHeaders)();
    const bienvenida = deps.bienvenida ?? construirBienvenida();
    return await comoPlataforma("SL-41", motivo, () => bienvenida.enviar({ organizacionId, ipAddress }));
  } catch (error) {
    console.error(`[bienvenida] no se envio organizacion=${organizacionId} causa=${causaDe(error)}`);
    return { estado: "no_enviada", email: null };
  }
}

/**
 * R48: solo el superadmin. Cualquier otro actor, o ninguno, recibe «no autorizado» ANTES de
 * construir o llamar al servicio. Si pasa, el alta corre en plataforma porque la empresa todavía
 * no existe: no hay ninguna que fijar. La monta la pantalla «Empresas» de SL-32.
 *
 * SL-41: con `creada`, la bienvenida corre DESPUÉS y fuera de la transacción del alta, que ya se
 * confirmó; nada de lo que pase con el correo la revierte (R23). Con cualquier otro resultado no
 * hay maestro nuevo al que escribir, y no se emite nada (R27).
 */
export async function altaEmpresaAction(
  input: unknown,
  deps: OrganizacionesDeps = {},
): Promise<AltaEmpresaActionResultado> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!exigirSuperadmin(actor)) return { estado: "no_autorizado" };

  const servicio = deps.service ?? construirServicio();
  const r = await comoPlataforma("SL-17", "alta de empresa por el superadmin", () => servicio.altaEmpresa(input));
  if (r.estado !== "creada") return r;

  const b = await enviarBienvenida(r.organizacionId, "bienvenida del maestro", deps);
  // Una empresa recién creada tiene maestro; si la lectura no lo encuentra, el correo no salió.
  const bienvenida: EstadoBienvenida = b.estado === "sin_maestro" ? "no_enviada" : b.estado;
  return { ...r, bienvenida };
}

/**
 * R30–R33. La autorización va ANTES de validar o leer nada (R32): a quien no es superadmin no se le
 * dice ni si el identificador tenía buena forma.
 */
export async function reenviarBienvenidaAction(
  input: unknown,
  deps: OrganizacionesDeps = {},
): Promise<ReenviarBienvenidaResultado> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!exigirSuperadmin(actor)) return { estado: "no_autorizado" };

  const parsed = reenviarSchema.safeParse(input);
  if (!parsed.success) return { estado: "invalida" };

  return enviarBienvenida(parsed.data.organizacionId, "reenvio de bienvenida", deps);
}

/**
 * R38 (design §16.2): qué filas de «Empresas» siguen mostrando «Reenviar bienvenida». Si la lectura
 * falla, `error` sin el mensaje: la pantalla vuelve a R29 (el botón en toda fila con maestros).
 */
export async function bienvenidasPendientesAction(
  deps: OrganizacionesDeps = {},
): Promise<BienvenidasPendientesResultado> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!exigirSuperadmin(actor)) return { estado: "no_autorizado" };

  try {
    const repo = deps.bienvenidaRepo ?? new BienvenidaMaestroRepository(getPrismaClient());
    const organizacionIds = await comoPlataforma("SL-41", "bienvenidas pendientes de la pantalla Empresas", () =>
      repo.organizacionesConBienvenidaPendiente(),
    );
    return { estado: "ok", organizacionIds };
  } catch (error) {
    console.error(`[bienvenida] no se leyeron las pendientes causa=${causaDe(error)}`);
    return { estado: "error" };
  }
}
