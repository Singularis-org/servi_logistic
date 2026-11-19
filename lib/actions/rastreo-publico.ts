"use server";

import { headers } from "next/headers";

import { loadRastreoPublicoConfig } from "@/lib/config/rastreo-publico";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { PaisSinZonaHoraria } from "@/lib/db/errores-pais";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { defaultLogger, type ErrorLogger } from "@/lib/errors/logger";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { IRastreoPublicoService } from "@/lib/interfaces/services/IRastreoPublicoService";
import { RastreoPublicoRepository } from "@/lib/repositories/RastreoPublicoRepository";
import { RastreoPublicoService } from "@/lib/services/RastreoPublicoService";
import { construirReglasPaisEmpresa } from "@/lib/services/ReglasPaisEmpresaService";
import {
  consultaRastreoSchema,
  type ResultadoRastreoPublico,
} from "@/lib/types/rastreo-publico";
import { ResetRateLimiter } from "@/lib/utils/reset-rate-limit";

// Feature 229 — Server Action PUBLICA del rastreo del envio (design §2.3).
//
// ⛔ NO RESUELVE ACTOR NI COMPRUEBA ROL, Y ES DELIBERADO (R13, decision humana del
// 2026-08-15): es publica. La ausencia
// de `resolveActorFromSession` NO es un olvido. Se postea a `/`, que el middleware deja
// pasar sin cookie por coincidencia EXACTA (`middleware.ts:62-65`) — por eso esta feature
// no toca el middleware ni crea ruta.
//
// Acepta DOS parametros (guia + segundo factor), y cada parametro de un borde sin sesion es una
// palanca para convertirlo en un oraculo del negocio; por eso necesita:
//
//   1. un segundo factor (los 4 ultimos digitos del telefono del destinatario, G1), y
//   2. un limite de intentos por IP, que es la defensa REAL contra el barrido: `num_guia`
//      es incremental y contiguo (`db/schema.prisma:483`), asi que sin limite un bucle de
//      enteros recorreria la base de envios entera.
//
// ⚠ RIESGO ACEPTADO Y FIRMADO (design §5.bis): `ResetRateLimiter` guarda la ventana EN
// MEMORIA DEL PROCESO. En serverless cada instancia tiene su contador y cada despliegue los
// resetea: acota al torpe, no al decidido. Un limite persistido es FICHA APARTE (exige
// migracion, que esta feature excluye). No es un bug pendiente.

/** Instancia a nivel de MODULO para que la ventana deslizante sobreviva entre invocaciones. */
const rastreoLimiter = new ResetRateLimiter();

/**
 * G4 — la clave es SOLO la IP, y no es un detalle de estilo: con `ip|guia` el atacante
 * estrenaria cubo en cada intento (cambia de guia cada vez) y el limite no frenaria nada.
 * La guia NO entra aqui jamas.
 */
function buildRateKey(ip: string): string {
  return `rastreo:${ip}`;
}

export interface RequestContext {
  ipAddress: string;
}

async function requestContextFromHeaders(): Promise<RequestContext> {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for");
  const ipAddress = forwardedFor
    ? forwardedFor.split(",")[0].trim()
    : (requestHeaders.get("x-real-ip") ?? "unknown");
  return { ipAddress };
}

/**
 * SLT-42 (decision del humano tras T5.6) — lo que se deja para soporte cuando el pais de la empresa
 * duena de la orden no tiene con que atender el rastreo: solo la empresa, el pais y que le falta.
 * Ni la guia, ni el segundo factor, ni nada del destinatario (R12 de la 229).
 */
function avisoPaisIncompleto(
  organizacionId: string,
  paisId: string,
  falta: "telefono" | "zona_horaria",
): Record<string, string> {
  return {
    evento: "rastreo_publico_pais_incompleto",
    organizacionId,
    paisId,
    falta,
  };
}

/**
 * SL-17 (design §7) — quien rastrea no tiene sesion, asi que la empresa sale de la propia guia.
 *
 * En plataforma se lee SOLO `organizacion_id`, por `num_guia`, que es unico global hasta SL-18:
 * esa ficha tiene que conservar un camino de rastreo cuando deje de serlo. Todo lo demas —la fila,
 * el segundo factor y el historial— corre en `conEmpresa`, con el filtro y la RLS de siempre.
 *
 * Una guia inexistente responde `no_encontrado` sin pasar por el service: es el mismo resultado de
 * hoy y no hay empresa en la que leer. Cuesta una consulta menos que una guia existente con el
 * factor errado; el limite por IP sigue siendo la defensa contra el barrido (G4).
 *
 * SLT-42 (R27): el pais —prefijo del telefono y zona horaria— es el de esa misma empresa. El puerto
 * lo lee del contexto `conEmpresa`, asi que una guia inexistente sigue sin tocarlo.
 */
function buildService(logger: ErrorLogger): IRastreoPublicoService {
  const prisma = getPrismaClient();
  const repo = new RastreoPublicoRepository(prisma);
  const config = loadRastreoPublicoConfig();
  const reglas = construirReglasPaisEmpresa(prisma);
  return {
    async consultar(numGuia, factor) {
      const orden = await comoPlataforma(
        "SL-17",
        "rastreo público: empresa por número de guía",
        () => prisma.orden.findUnique({ where: { numGuia }, select: { organizacionId: true } }),
      );
      if (orden === null) return { estado: "no_encontrado" };
      const { organizacionId } = orden;

      // SLT-42 (decision del humano tras T5.6) — un pais incompleto responde `no_encontrado`, como una
      // guia inexistente, y deja para soporte la empresa afectada. Sin prefijo o digitos el servicio
      // ya responde `no_encontrado` (la orden no es consultable); aqui solo se anota cual fue el pais.
      // Sin zona, el puerto lanza `PaisSinZonaHoraria` cuando el factor ya coincidio; aqui se traduce.
      const visto: { paisSinTelefono: string | null } = { paisSinTelefono: null };
      const vigiladas: Pick<IReglasPaisEmpresa, "deLaEmpresa" | "zonaHoraria"> = {
        async deLaEmpresa() {
          const pais = await reglas.deLaEmpresa();
          if (pais.telefono === null) visto.paisSinTelefono = pais.paisId;
          return pais;
        },
        zonaHoraria: () => reglas.zonaHoraria(),
      };
      const real = new RastreoPublicoService(repo, config, vigiladas);

      try {
        const resultado = await conEmpresa(organizacionId, () => real.consultar(numGuia, factor));
        if (visto.paisSinTelefono !== null) {
          logger.logError(avisoPaisIncompleto(organizacionId, visto.paisSinTelefono, "telefono"));
        }
        return resultado;
      } catch (error) {
        if (!(error instanceof PaisSinZonaHoraria)) throw error;
        logger.logError(avisoPaisIncompleto(organizacionId, error.paisId, "zona_horaria"));
        return { estado: "no_encontrado" };
      }
    },
  };
}

export interface RastreoPublicoDeps {
  service?: IRastreoPublicoService;
  /** SLT-42: donde queda el aviso de un pais incompleto. Sin el, `console.error` (`defaultLogger`). */
  logger?: ErrorLogger;
  getContext?: () => Promise<RequestContext>;
  limiter?: ResetRateLimiter;
}

/**
 * Consulta publica de un envio por guia + segundo factor. Sin sesion y sin actor (R2/R13).
 *
 * Orden de operaciones (R8 lo testea): zod -> IP -> limite -> registrar -> service. Ni la
 * validacion ni el limite tocan datos, y ninguna rama revela si la guia existia (R7/R9).
 * Nunca lanza: toda salida es un resultado discriminado (R32).
 *
 * Su superficie es `app/_landing/RastreoDialog.tsx` (T3.1), montado por la nav de la landing
 * (T3.3). La anotacion de excepcion que llevaba mientras el modal no existia se retiro al
 * montarlo: una excepcion que sobrevive a su motivo pone roja la guardia de superficie.
 */
export async function consultarRastreoPublico(
  entrada: unknown,
  deps: RastreoPublicoDeps = {},
): Promise<ResultadoRastreoPublico> {
  // 1. Borde: zod. R12 — los mensajes son literales fijos del schema, sin interpolar la
  //    guia ni el factor.
  const parsed = consultaRastreoSchema.safeParse(entrada);
  if (!parsed.success) {
    const campos: Record<string, string> = {};
    for (const [campo, errores] of Object.entries(parsed.error.flatten().fieldErrors)) {
      const primero = errores?.[0];
      if (primero !== undefined) campos[campo] = primero;
    }
    return { estado: "validation_error", campos };
  }

  // 2. IP (patron `postulacion-mensajero.ts:38-45`).
  const config = loadRastreoPublicoConfig();
  const limiter = deps.limiter ?? rastreoLimiter;
  const context = await (deps.getContext ?? requestContextFromHeaders)();
  const rateKey = buildRateKey(context.ipAddress);

  // 3. Limite de intentos: se rechaza SIN tocar datos, y el rechazo es el mismo con guias
  //    existentes y con inexistentes (R9).
  if (limiter.superaLimite(rateKey, config.RATE_MAX, config.RATE_WINDOW_MINUTES * 60_000)) {
    return { estado: "demasiados_intentos" };
  }

  // 4. El intento se registra SIEMPRE, acierte o no: contar solo los fallos dejaria barrer
  //    con aciertos y volveria el limite inutil contra quien ya tiene un factor valido.
  limiter.registrar(rateKey);

  // 5. Proyeccion. El service no corta antes de comparar el segundo factor (R8).
  const service = deps.service ?? buildService(deps.logger ?? defaultLogger);
  return service.consultar(parsed.data.numGuia, parsed.data.factor);
}
