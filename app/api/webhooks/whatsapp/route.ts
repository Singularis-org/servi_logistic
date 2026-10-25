// Feature 109 (design §2.1, R1-R12) — Route Handler del WEBHOOK de entrada de WhatsApp.
// Capa Controller: solo HTTP. La verificacion (handshake GET / firma HMAC POST), la empresa de
// cada evento y la ingesta viven en `WebhookWhatsappService` (SL-36, design §10).
//
// INVARIANTE DE SEGURIDAD (R11): NUNCA se loguea el token de verificacion, el App Secret,
// la firma, ni el numero del cliente ni otro dato personal, en NINGUNA rama.
//
// El endpoint NO usa cookie de sesion: su autenticacion es la firma HMAC (POST) y el token
// de verificacion (GET). Excluido del guard de sesion en `middleware.ts` (R10).
//
// SL-36 (R20-R22): una sola URL para todas las empresas. La empresa sale del numero del evento
// (`metadata.phone_number_id`) y el App Secret con que se verifica es el de ESA empresa. Este
// archivo ya no abre el contexto de plataforma: la unica traduccion sin sesion vive en
// `IntegracionEnrutadoRepository` (excepcion con ficha), y desaparece `repartirPorEmpresa`, que
// leia ordenes, hilos y entregas de todas las empresas para adivinar el dueno de cada evento.
import { NextResponse } from "next/server";
import type { PrismaClient } from "@prisma/client";
import { BovedaIntegraciones, ResumenSecretoSha256 } from "@/lib/crypto/boveda-integraciones";
import { getPrismaClient } from "@/lib/db/prisma-client";
import type { ICifradorSecretos } from "@/lib/interfaces/external/ICifradorSecretos";
import type { IWebhookWhatsappService } from "@/lib/interfaces/services/IWebhookWhatsappService";
import { ChatConversacionRepository } from "@/lib/repositories/ChatConversacionRepository";
import { ChatMensajeRepository } from "@/lib/repositories/ChatMensajeRepository";
import { IntegracionEnrutadoRepository } from "@/lib/repositories/IntegracionEnrutadoRepository";
import { IntegracionRepository } from "@/lib/repositories/IntegracionRepository";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { WhatsappEjecucionRepository } from "@/lib/repositories/WhatsappEjecucionRepository";
import { ChatWhatsappService, type ChatLogger } from "@/lib/services/ChatWhatsappService";
import { CredencialesIntegracionService } from "@/lib/services/CredencialesIntegracionService";
import { EntregaEstadoService } from "@/lib/services/EntregaEstadoService";
import { crearEncolarReintentoChatEnvio } from "@/lib/services/jobs/whatsapp-chat-envio-encolado";
import { consoleLogger } from "@/lib/services/whatsapp/chat-logger";
import { WebhookWhatsappService } from "@/lib/services/WebhookWhatsappService";

// El runtime de Node es OBLIGATORIO: `node:crypto` (HMAC) y Prisma no corren en edge.
export const runtime = "nodejs";

const SIGNATURE_HEADER = "x-hub-signature-256";

export interface WebhookDeps {
  /** El service del webhook (inyectable en tests). Por defecto, el real. */
  service?: IWebhookWhatsappService;
}

export interface WebhookComposicion {
  /** El cliente de la base. Por defecto el de la app; los tests de base real pasan su transaccion. */
  prisma?: PrismaClient;
  /** La boveda. Por defecto la del entorno; los tests de base real pasan un anillo de prueba. */
  cifrador?: ICifradorSecretos;
  logger?: ChatLogger;
}

/**
 * El composition root del webhook. Todas las piezas se construyen sobre el MISMO cliente: el App
 * Secret, la anotacion del ultimo contacto y la ingesta corren en la empresa del numero (el service
 * abre `conEmpresa`), y la credencial se lee con `CredencialesIntegracionService`, que no conoce
 * otra empresa que la del contexto.
 */
export function buildWebhookWhatsappService(opciones: WebhookComposicion = {}): WebhookWhatsappService {
  const prisma = opciones.prisma ?? getPrismaClient();
  const logger = opciones.logger ?? consoleLogger;
  const integraciones = new IntegracionRepository(prisma);
  const credenciales = new CredencialesIntegracionService({
    repo: integraciones,
    cifrador: opciones.cifrador ?? new BovedaIntegraciones(),
  });
  return new WebhookWhatsappService({
    enrutado: new IntegracionEnrutadoRepository(prisma),
    resumidor: new ResumenSecretoSha256(),
    // El App Secret de la integracion que corresponde al numero. Si la integracion de la empresa ya
    // no es esa (desconectada y vuelta a conectar entre la traduccion y la lectura), no se usa un
    // secreto de otra integracion: el evento se descarta.
    leerAppSecret: async (integracionId) => {
      const lectura = await credenciales.leer("whatsapp");
      return lectura.estado === "lista" && lectura.integracionId === integracionId ? lectura.credencial.app_secret : null;
    },
    anotarWebhook: (integracionId, at) => integraciones.anotarWebhook(integracionId, at),
    ingesta: new ChatWhatsappService({
      conversacionRepo: new ChatConversacionRepository(prisma),
      mensajeRepo: new ChatMensajeRepository(prisma),
      // El webhook solo INGIERE: no envia. Sin cliente de envio (la ingesta no lo usa).
      encolarReintento: crearEncolarReintentoChatEnvio(new JobRepository(prisma)),
      // Diagnostico de los `failed`: codigo/motivo de Meta al log, sin PII (R11).
      logger,
    }),
    // Ficha 474 (R38): estados de las entregas de los envios automaticos.
    entregaEstado: () => new EntregaEstadoService(new WhatsappEjecucionRepository(prisma)),
    logger,
  });
}

/**
 * GET — handshake de verificacion de Meta (R19). Responde el `challenge` como texto plano SOLO si
 * el token es el de alguna integracion de WhatsApp; en cualquier otro caso, 403 sin challenge.
 */
export async function handleGet(req: Request, deps: WebhookDeps = {}): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const service = deps.service ?? buildWebhookWhatsappService();
  const r = await service.verificar({
    mode: params.get("hub.mode"),
    token: params.get("hub.verify_token"),
    challenge: params.get("hub.challenge"),
  });
  if (r.status === "ok") {
    return new Response(r.challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return new Response("forbidden", { status: 403 });
}

/**
 * POST — ingesta firmada (R20, R21). El cuerpo se lee CRUDO, que es lo que Meta firma; el service
 * verifica la firma con el App Secret de la empresa de cada numero antes de cualquier efecto.
 * Ninguna empresa valida -> 401 sin efectos; alguna -> 200 con conteos agregados (sin PII).
 */
export async function handlePost(req: Request, deps: WebhookDeps = {}): Promise<Response> {
  const cuerpoCrudo = await req.text();
  const service = deps.service ?? buildWebhookWhatsappService();
  const r = await service.recibir({ cuerpoCrudo, firma: req.headers.get(SIGNATURE_HEADER) });
  if (r.status === "unauthorized") return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return NextResponse.json({ ok: true, ...r.resumen }, { status: 200 });
}

export async function GET(req: Request): Promise<Response> {
  return handleGet(req);
}

export async function POST(req: Request): Promise<Response> {
  return handlePost(req);
}
