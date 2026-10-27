"use server";

// FICHA 410 (design §11/§12, T3.9) — las tres operaciones del canal de push como Server Actions del
// propio proyecto, NO como rutas API internas (docs/architecture.md). Patron
// `lib/actions/notificaciones.ts`: resuelven el actor con la sesion, validan el borde con zod,
// envuelven con `withErrorHandler` y traducen con `toActionError`. `deps` inyectables para test sin
// DB ni cookies.
//
// ⚠️ EL USUARIO SALE DE LA SESION, NUNCA DE LA ENTRADA (R50). Es el requisito que decide la forma de
// este archivo: si el identificador viajara en el cuerpo, cualquiera podria suscribir un dispositivo
// a nombre de otra persona y recibir en SU telefono los avisos de un rol que no tiene. Los dos
// schemas son `strict()`, asi que un `usuarioId` inyectado no se ignora: da `validation_error`.
import {
  eliminarSuscripcionSchema,
  registrarSuscripcionSchema,
  type ClavePublicaPushResult,
  type SuscripcionPushResult,
} from "@/lib/types/push";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { IPushEndpointPlataformaRepository } from "@/lib/interfaces/repositories/IPushEndpointPlataformaRepository";
import type { IPushSuscripcionRepository } from "@/lib/interfaces/repositories/IPushSuscripcionRepository";
import type { IUsuarioPreferenciaRepository } from "@/lib/interfaces/repositories/IUsuarioPreferenciaRepository";
import { PushEndpointPlataformaRepository } from "@/lib/repositories/PushEndpointPlataformaRepository";
import { PushSuscripcionRepository } from "@/lib/repositories/PushSuscripcionRepository";
import { UsuarioPreferenciaRepository } from "@/lib/repositories/UsuarioPreferenciaRepository";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { clavePublicaPush } from "@/lib/config/push";
import { resolveActorFromSession } from "@/lib/auth/resolve-actor";
import { esPlataforma } from "@/lib/auth/plataforma";
import { withErrorHandler, isAppErrorShape, ForbiddenError, UnauthenticatedError } from "@/lib/errors";
import { toActionError } from "@/lib/actions/_shared/to-action-error";

export interface PushActionDeps {
  repo?: IPushSuscripcionRepository;
  /** SL-18 (R26) — suelta el endpoint de otra empresa antes del alta. Inyectable para test. */
  plataformaRepo?: IPushEndpointPlataformaRepository;
  /** FICHA 422 — el repositorio de la preferencia de LA PERSONA (R3/R7). Inyectable para test. */
  preferenciaRepo?: IUsuarioPreferenciaRepository;
  getActor?: () => Promise<Actor | null>;
  /** La clave publica, inyectable para el test. Por defecto la del entorno (R32). */
  clavePublica?: () => string | null;
}

function buildRepo(): IPushSuscripcionRepository {
  return new PushSuscripcionRepository(getPrismaClient());
}

function buildPlataformaRepo(): IPushEndpointPlataformaRepository {
  return new PushEndpointPlataformaRepository(getPrismaClient());
}

function buildPreferenciaRepo(): IUsuarioPreferenciaRepository {
  return new UsuarioPreferenciaRepository(getPrismaClient());
}

/** R50: sin sesion valida NO se lee ni se escribe NADA del canal. */
async function actorRequerido(deps: PushActionDeps): Promise<Actor> {
  const actor = await (deps.getActor ?? resolveActorFromSession)();
  if (!actor) throw new UnauthenticatedError();
  return actor;
}

/**
 * SL-32 (R6) — EL SUPERADMIN NO TIENE CANAL DE AVISOS. `push_suscripcion` y `usuario_preferencia`
 * son tablas de negocio: sin empresa en contexto, la extensión de SL-17 lanza `EmpresaNoResuelta` y
 * el control de la campana, la reactivación del portal y el cierre de sesión darían un 500. No se
 * abre `comoPlataforma`: el superadmin no recibe avisos de empresa, así que no hay nada que leer ni
 * escribir. Es lo mismo que el layout ya hace al no consultar `avisosPushDe` para él.
 */
function sinCanalDeEmpresa(actor: Actor): boolean {
  return esPlataforma(actor.rol);
}

/**
 * R32 — la clave PUBLICA con la que el navegador se suscribe, resuelta en TIEMPO DE EJECUCION.
 *
 * `clavePublica: null` no es un error: significa «este despliegue no tiene canal de push», y el
 * control de activacion sencillamente no se ofrece (R13/R30). La app no se entera de nada mas.
 *
 * NO devuelve, ni por asomo, la clave PRIVADA (R31): `clavePublicaPush()` solo lee la publica.
 *
 * Su superficie es `components/shared/PushOptIn.tsx` via `hooks/usePushSuscripcion.ts`, montado en
 * el panel de la campana (410/T5.3). La excepcion que las tres acciones llevaron anotada mientras
 * la tanda 5 no existia se retiro al montarlo, que es lo que la guardia `superficie-de-uso` exige.
 */
export async function obtenerClavePublicaPush(
  deps: PushActionDeps = {},
): Promise<ClavePublicaPushResult> {
  const r = await withErrorHandler(async () => {
    const actor = await actorRequerido(deps);
    // `null` es «aquí no hay canal»: el interruptor no se ofrece y nadie llega a registrar.
    if (sinCanalDeEmpresa(actor)) return { status: "ok" as const, clavePublica: null };
    return { status: "ok" as const, clavePublica: (deps.clavePublica ?? clavePublicaPush)() };
  });
  return isAppErrorShape(r) ? toActionError(r) : r;
}

/**
 * R16/R17/R18/R50 — registra (o REEMPLAZA) la suscripcion de ESTE dispositivo a nombre del usuario
 * de la sesion. La identidad es el `endpoint`: si el dispositivo ya estaba suscrito a otra persona,
 * la fila pasa a ser de quien acaba de iniciar sesion y la anterior deja de recibir ahi.
 *
 * La llaman `lib/pwa/alta-push.ts` (el alta del dispositivo, ficha 422/§4) y, por ella, el control
 * al activarse y la reactivacion silenciosa del portal.
 *
 * FICHA 422/R3 — REGISTRAR UNA SUSCRIPCION ES, POR DEFINICION, DECIR QUE SI. No hay ningun otro
 * camino en el arbol que cree una suscripcion, y llegar hasta aqui exige el gesto de la persona
 * sobre el interruptor y el permiso del navegador. Por eso este es el sitio donde la preferencia se
 * pone: asi no puede haber un alta que se olvide de anotarla. Es la misma regla que el backfill de
 * la migracion aplica a la historia.
 */
export async function registrarSuscripcionPush(
  input: unknown,
  deps: PushActionDeps = {},
): Promise<SuscripcionPushResult> {
  const r = await withErrorHandler(async () => {
    // El actor PRIMERO: sin sesion no se valida ni se escribe nada.
    const actor = await actorRequerido(deps);
    const data = registrarSuscripcionSchema.parse(input); // ZodError -> VALIDATION_ERROR
    // Un `ok` aquí haría creer al navegador que quedó registrado; con el rechazo, `alta-push`
    // deshace su suscripción, que es lo correcto para quien no tiene avisos que recibir.
    if (sinCanalDeEmpresa(actor)) throw new ForbiddenError();
    // SL-18 (design §7, R26–R28) — EL ÚLTIMO GANA. Si este navegador estaba suscrito con una cuenta
    // de OTRA empresa, esa fila se borra primero (en plataforma: desde aquí no se ve) y luego se
    // registra en la empresa de la sesión. Sin el primer paso, el upsert no vería la fila ajena,
    // chocaría con el único global del endpoint y la otra empresa seguiría enviando aquí. Son dos
    // contextos distintos y no comparten transacción: si el alta falla, el navegador se queda sin
    // suscripción y `alta-push` la deshace, pero nunca quedan dos dueños. Un actor sin empresa no
    // llega aquí (el superadmin sale arriba); si llegara, el repositorio rechaza el id vacío.
    await (deps.plataformaRepo ?? buildPlataformaRepo()).liberarDeOtrasEmpresas(
      data.endpoint,
      actor.organizacionId ?? "",
    );
    await (deps.repo ?? buildRepo()).registrar(actor.usuarioId, data);

    // ⚠️ LA SUSCRIPCION PRIMERO Y LA PREFERENCIA DESPUES, Y EL FALLO DE LA SEGUNDA NO SE PROPAGA.
    // No es descuido: es lo mismo que R12 pide para la baja, por el lado del alta, y aqui tiene
    // ademas una consecuencia MEDIBLE. Quien llama a esto (`lib/pwa/alta-push.ts`) deshace la
    // suscripcion del navegador cuando el registro no sale `ok` —una suscripcion viva que el
    // servidor no conoce es un dispositivo que cree que va a recibir y no va a recibir—. Si un
    // fallo al anotar la preferencia devolviera error, un dispositivo PERFECTAMENTE registrado se
    // quedaria sin avisos por una columna que no decide a donde sale un push (R6). El fallo no se
    // absorbe en silencio: queda registrado con su operacion y su causa (docs/conventions.md).
    try {
      await (deps.preferenciaRepo ?? buildPreferenciaRepo()).fijarAvisosPush(actor.usuarioId, true);
    } catch (error) {
      console.error("[push] anotar la preferencia de avisos fallo", error);
    }
    return { status: "ok" as const };
  });
  return isAppErrorShape(r) ? toActionError(r) : r;
}

/**
 * FICHA 422/R7 — LA PERSONA DIJO QUE NO: se borra su preferencia.
 *
 * ⚠️ SIN CUERPO, Y ES LA DECISION QUE HACE QUE ESTO FUNCIONE (design §3.4). La alternativa era
 * meter el motivo en `eliminarSuscripcionPush` y que el servidor decidiera —una sola ida y vuelta,
 * la decision del lado testeable— y **se rompe en R11**: esa accion necesita el `endpoint`, y el
 * caso «apague el interruptor y aqui ya no habia suscripcion» NO TIENE ENDPOINT QUE MANDAR. La
 * intencion no llegaria al servidor justo en el caso en que mas falta hace. Esta accion no depende
 * de que haya dispositivo del que darse de baja.
 *
 * El actor sale de la SESION (410/R50), asi que no hay nada que validar en el borde: no hay borde.
 *
 * NO toca ninguna suscripcion. Apagar el interruptor da de baja ESTE dispositivo (eso lo hace
 * `lib/pwa/baja-push.ts`) y borra la preferencia de la persona; las suscripciones de sus OTROS
 * dispositivos no se tocan, que es 410/R19 y sigue intacto.
 */
export async function olvidarPreferenciaDeAvisos(
  deps: PushActionDeps = {},
): Promise<SuscripcionPushResult> {
  const r = await withErrorHandler(async () => {
    const actor = await actorRequerido(deps);
    // No tiene preferencia guardada: «no» ya es su estado, y no hay nada que borrar.
    if (sinCanalDeEmpresa(actor)) return { status: "ok" as const };
    await (deps.preferenciaRepo ?? buildPreferenciaRepo()).fijarAvisosPush(actor.usuarioId, false);
    return { status: "ok" as const };
  });
  return isAppErrorShape(r) ? toActionError(r) : r;
}

/**
 * R15/R19 — baja de la suscripcion de ESTE dispositivo. Acotada al usuario de la sesion: una
 * persona solo retira lo suyo, aunque conozca el endpoint de otra.
 *
 * Que no hubiera nada que borrar NO es un error: desactivar dos veces, o cerrar sesion en un
 * dispositivo que nunca se suscribio, devuelve `ok`. Un `not_found` aqui obligaria al cierre de
 * sesion a decidir que hacer con el (R20), y la respuesta correcta es «seguir saliendo».
 *
 * La llaman el control al desactivar (410/T5.1) y el `LogoutButton` al cerrar sesion (410/T5.5),
 * los dos a traves de `lib/pwa/baja-push.ts`, que es donde vive la baja de ESTE dispositivo.
 */
export async function eliminarSuscripcionPush(
  input: unknown,
  deps: PushActionDeps = {},
): Promise<SuscripcionPushResult> {
  const r = await withErrorHandler(async () => {
    const actor = await actorRequerido(deps);
    const data = eliminarSuscripcionSchema.parse(input);
    // Ninguna suscripción es suya, y «nada que borrar» ya es `ok` (lo necesita el cierre de sesión).
    if (sinCanalDeEmpresa(actor)) return { status: "ok" as const };
    await (deps.repo ?? buildRepo()).eliminarDeUsuario(actor.usuarioId, data.endpoint);
    return { status: "ok" as const };
  });
  return isAppErrorShape(r) ? toActionError(r) : r;
}
