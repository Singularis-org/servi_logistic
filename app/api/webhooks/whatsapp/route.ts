// Feature 109 (design §2.1, R1-R12) — Route Handler del WEBHOOK de entrada de WhatsApp.
// Capa Controller: solo HTTP + verificacion (handshake GET / firma HMAC POST); delega TODA
// la ingesta en `ChatWhatsappService`. Sin logica de negocio aqui; las unicas queries son las
// de `repartirPorEmpresa` (SL-17, abajo), que se van con SL-36.
//
// INVARIANTE DE SEGURIDAD (R11): NUNCA se loguea el token de verificacion, el App Secret,
// la firma, ni el numero del cliente ni otro dato personal, en NINGUNA rama.
//
// El endpoint NO usa cookie de sesion: su autenticacion es la firma HMAC (POST) y el token
// de verificacion (GET). Excluido del guard de sesion en `middleware.ts` (R10).
//
// SL-17 (design §7, D14, R15) — Meta no dice de que empresa es un evento: las credenciales son
// globales hasta SL-36. Por eso el webhook es una excepcion de plataforma, pero ACOTADA: en
// plataforma solo se averigua la empresa de cada evento (`repartirPorEmpresa`, unicas lecturas
// de este archivo, que leen solo `organizacion_id`), y la ingesta corre en `conEmpresa`, con el
// filtro y la RLS de siempre. Un evento sin empresa no escribe nada y el 200 se mantiene.
import { NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { loadWhatsappWebhookConfig } from "@/lib/config/whatsapp";
import type { WhatsappWebhookConfig } from "@/lib/config/whatsapp";
import { parseWebhookEventos, type WebhookEventos } from "@/lib/types/whatsapp-webhook";
import { ChatWhatsappService } from "@/lib/services/ChatWhatsappService";
import type { ChatLogger, IngestaResumen } from "@/lib/services/ChatWhatsappService";
import { ChatConversacionRepository } from "@/lib/repositories/ChatConversacionRepository";
import { ChatMensajeRepository } from "@/lib/repositories/ChatMensajeRepository";
import { crearEncolarReintentoChatEnvio } from "@/lib/services/jobs/whatsapp-chat-envio-encolado";
import { JobRepository } from "@/lib/repositories/JobRepository";
import { consoleLogger, volcarStatusesFallidos } from "@/lib/services/whatsapp/chat-logger";
import { getPrismaClient } from "@/lib/db/prisma-client";
import { EntregaEstadoService, type IEntregaEstadoService } from "@/lib/services/EntregaEstadoService";
import { WhatsappEjecucionRepository } from "@/lib/repositories/WhatsappEjecucionRepository";
import { comoPlataforma, conEmpresa } from "@/lib/db/contexto-empresa";
import { normalizarTelefonoWa } from "@/lib/utils/whatsapp-telefono";

// El runtime de Node es OBLIGATORIO: `node:crypto` (HMAC) y Prisma no corren en edge.
export const runtime = "nodejs";

const SIGNATURE_HEADER = "x-hub-signature-256";
const SIGNATURE_PREFIX = "sha256=";

export interface WebhookDeps {
  /** Config del webhook (verifyToken + appSecret). Lanza si falta un env (R12). */
  getConfig?: () => WhatsappWebhookConfig;
  /** Service de ingesta (inyectable en tests). Por defecto construye las deps reales. */
  buildService?: () => ChatWhatsappService;
  /** Logger del volcado de diagnostico (inyectable en tests). Default `console.warn`. */
  logger?: ChatLogger;
  /**
   * Ficha 474 (R38): aplica los estados de Meta a las ENTREGAS de los envios automaticos, DESPUES
   * de la ingesta del chat. Inyectable en tests; por defecto el real.
   */
  buildEntregaEstado?: () => IEntregaEstadoService;
  /** SL-17: reparte el lote por empresa. Inyectable en tests; por defecto lee la base. */
  repartir?: (eventos: WebhookEventos) => Promise<RepartoPorEmpresa>;
}

/** SL-17: los eventos de un lote agrupados por la empresa a la que pertenecen. */
export interface RepartoPorEmpresa {
  lotes: { organizacionId: string; eventos: WebhookEventos }[];
  /** Entrantes de los que no se pudo saber la empresa: cuentan como `sinResolver`. */
  mensajesSinEmpresa: number;
}

/**
 * Los servicios inyectados por los tests de antes de SL-17 no tocan la base: el lote entero va
 * sin repartir y sin contexto explicito. Cualquier escritura de negocio fallaria cerrado (R11).
 */
async function sinRepartir(eventos: WebhookEventos): Promise<RepartoPorEmpresa> {
  return { lotes: [{ organizacionId: "", eventos }], mensajesSinEmpresa: 0 };
}

/**
 * La empresa de cada evento, leida en plataforma porque es justo lo que todavia no se sabe.
 *
 * - Entrante: la de la orden con la que lo casa la ingesta (`resolverOrdenActivaPorNumero`, la
 *   misma consulta, asi que dentro de `conEmpresa` vuelve a casar con la misma orden). Si es un
 *   cambio de numero, tambien las empresas que tienen hilos con el numero anterior: la ingesta
 *   los migra antes de resolver orden, y sin esto el cambio se perderia cuando no hay orden viva.
 * - Estado: la del saliente del chat o la de la entrega automatica con ese `wa_message_id`.
 *
 * Un estado sin fila en ninguna empresa no tenia nada que actualizar tampoco antes de SL-17.
 */
export async function repartirPorEmpresa(eventos: WebhookEventos): Promise<RepartoPorEmpresa> {
  const prisma = getPrismaClient();
  const conversaciones = new ChatConversacionRepository(prisma);
  return comoPlataforma("SL-36", "webhook de WhatsApp: credenciales globales hasta SL-36", async () => {
    const porEmpresa = new Map<string, WebhookEventos>();
    const loteDe = (organizacionId: string): WebhookEventos => {
      let lote = porEmpresa.get(organizacionId);
      if (lote === undefined) {
        lote = { mensajes: [], statuses: [] };
        porEmpresa.set(organizacionId, lote);
      }
      return lote;
    };
    let mensajesSinEmpresa = 0;

    for (const mensaje of eventos.mensajes) {
      const empresas = new Set<string>();
      const resolucion = await conversaciones.resolverOrdenActivaPorNumero(
        normalizarTelefonoWa(mensaje.telefonoE164),
      );
      if (resolucion !== null) {
        const orden = await prisma.orden.findUnique({
          where: { id: resolucion.ordenId },
          select: { organizacionId: true },
        });
        if (orden !== null) empresas.add(orden.organizacionId);
      }
      const anterior = mensaje.sistema?.telefonoAnterior ?? null;
      if (anterior !== null) {
        const hilos = await prisma.chatConversacion.findMany({
          where: { telefonoE164: normalizarTelefonoWa(anterior) },
          select: { organizacionId: true },
          distinct: ["organizacionId"],
        });
        for (const hilo of hilos) empresas.add(hilo.organizacionId);
      }
      if (empresas.size === 0) mensajesSinEmpresa += 1;
      for (const organizacionId of empresas) loteDe(organizacionId).mensajes.push(mensaje);
    }

    for (const status of eventos.statuses) {
      const empresas = new Set<string>();
      const saliente = await prisma.chatMensaje.findFirst({
        where: { waMessageId: status.waMessageId },
        select: { organizacionId: true },
      });
      if (saliente !== null) empresas.add(saliente.organizacionId);
      const entrega = await prisma.whatsappEnvioEntrega.findFirst({
        where: { waMessageId: status.waMessageId },
        select: { organizacionId: true },
      });
      if (entrega !== null) empresas.add(entrega.organizacionId);
      for (const organizacionId of empresas) loteDe(organizacionId).statuses.push(status);
    }

    return {
      lotes: [...porEmpresa].map(([organizacionId, lote]) => ({ organizacionId, eventos: lote })),
      mensajesSinEmpresa,
    };
  });
}

/** Ejecuta `fn` con la empresa del lote; el id vacio es solo el de `sinRepartir`. */
function enLaEmpresa<T>(organizacionId: string, fn: () => Promise<T>): Promise<T> {
  return organizacionId === "" ? fn() : conEmpresa(organizacionId, fn);
}

/** Ficha 474 (R38): service real de estados de entregas. */
function buildEntregaEstadoService(): IEntregaEstadoService {
  return new EntregaEstadoService(new WhatsappEjecucionRepository(getPrismaClient()));
}

/** Construye el service de ingesta con las deps reales (repos + encolador del reintento). */
function buildIngestaService(): ChatWhatsappService {
  const prisma = getPrismaClient();
  return new ChatWhatsappService({
    conversacionRepo: new ChatConversacionRepository(prisma),
    mensajeRepo: new ChatMensajeRepository(prisma),
    // El webhook solo INGIERE: no envia. Sin cliente de envio (la ingesta no lo usa).
    encolarReintento: crearEncolarReintentoChatEnvio(new JobRepository(prisma)),
    // Diagnostico de los `failed`: codigo/motivo de Meta al log, sin PII (R11).
    logger: consoleLogger,
  });
}

/**
 * GET — handshake de verificacion de Meta (R1/R2). Sin tocar la DB. Responde el `challenge`
 * como texto plano SOLO si `mode==="subscribe"` y el token coincide; en cualquier otro caso
 * (o si el webhook no esta configurado) responde 403 y NUNCA devuelve el challenge.
 */
export async function handleGet(req: Request, deps: WebhookDeps = {}): Promise<Response> {
  let config: WhatsappWebhookConfig;
  try {
    config = (deps.getConfig ?? loadWhatsappWebhookConfig)();
  } catch {
    // Sin token configurado no se puede verificar; se rechaza sin filtrar el nombre al cliente.
    return new Response("forbidden", { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const mode = params.get("hub.mode");
  const token = params.get("hub.verify_token");
  const challenge = params.get("hub.challenge");

  if (mode === "subscribe" && token !== null && challenge !== null && token === config.verifyToken) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }
  return new Response("forbidden", { status: 403 });
}

/**
 * POST — ingesta firmada (R3-R9/R11). Lee el cuerpo CRUDO ANTES de parsear; verifica la
 * firma `X-Hub-Signature-256` en tiempo constante (R3/R4). Firma invalida/ausente -> 401
 * sin efectos. Firma valida -> zod strip (R5) -> delega en el service (R6/R7/R8) -> 200,
 * aunque un evento no mapee a hilo (R9). Nunca loguea secretos ni PII (R11).
 */
export async function handlePost(req: Request, deps: WebhookDeps = {}): Promise<Response> {
  let config: WhatsappWebhookConfig;
  try {
    config = (deps.getConfig ?? loadWhatsappWebhookConfig)();
  } catch {
    // Sin App Secret no hay como verificar la firma: se rechaza como no autorizado.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // R3/R4: la firma se valida SOBRE EL CUERPO CRUDO, ANTES de cualquier parseo.
  const raw = await req.text();
  const provided = req.headers.get(SIGNATURE_HEADER);
  if (!firmaValida(raw, provided, config.appSecret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  // R5: parseo + zod strip. Un cuerpo mal formado no rompe el 200 (evento no accionable, R9).
  let eventos;
  try {
    eventos = parseWebhookEventos(JSON.parse(raw));
  } catch (error) {
    // Depuracion de tipos no soportados: el cuerpo no parsea, asi que se vuelca el error
    // COMPLETO junto con el crudo tal como llego. Excepcion consciente a R11.
    console.log("WP - type other (error)", error instanceof Error ? error.message : String(error));
    console.log("WP - type other (crudo)", raw);
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Depuracion: cuando el lote trae al menos un entrante que NO mapea a un tipo conocido
  // (`otro`: image, audio, sticker, interactive, ...), se imprime la data entrante ENTERA
  // para poder ver que manda Meta —el borde tipado hace zod strip y la descarta—.
  //
  // Se vuelca `raw` TAL CUAL, como TEXTO. Volcarlo como OBJETO no servia: `console.log` de un
  // objeto lo inspecciona a profundidad 2, asi que el payload de Meta se imprimia recortado
  // —`entry: [ { id: '...', changes: [Array] } ]`— y `changes` es exactamente donde vive el
  // mensaje que se queria ver. Como string no hay recorte por profundidad y ademas es
  // literalmente el cuerpo que se firmo, sin ninguna transformacion intermedia.
  if (eventos.mensajes.some((m) => m.tipo === "otro")) {
    console.log("WP - type other (crudo)", raw);
  }

  // Volcado de diagnostico ANTES de ingerir: si la ingesta fallara, el motivo del `failed`
  // ya quedo en el log. Solo actua sobre statuses `failed` y redacta al destinatario.
  volcarStatusesFallidos(JSON.parse(raw), deps.logger ?? consoleLogger);

  const service = deps.buildService ? deps.buildService() : buildIngestaService();
  const repartir = deps.repartir ?? (deps.buildService ? sinRepartir : repartirPorEmpresa);
  const reparto = await repartir(eventos);
  const resumen: IngestaResumen = {
    mensajesRegistrados: 0,
    statusesAplicados: 0,
    sinResolver: reparto.mensajesSinEmpresa,
    hilosMigrados: 0,
  };

  // Un lote por empresa, cada uno en su contexto: la ingesta y las entregas de una empresa no
  // pueden leer ni escribir filas de otra aunque Meta las mande en el mismo POST.
  for (const lote of reparto.lotes) {
    await enLaEmpresa(lote.organizacionId, async () => {
      const parcial = await service.ingerirEventos(lote.eventos);
      resumen.mensajesRegistrados += parcial.mensajesRegistrados;
      resumen.statusesAplicados += parcial.statusesAplicados;
      resumen.sinResolver += parcial.sinResolver;
      resumen.hilosMigrados += parcial.hilosMigrados;

      // Ficha 474 (R38): estados de las entregas de los envios automaticos. DESPUES de la ingesta
      // y aislado: un fallo aqui (incluido construir el service) NO cambia el 200 ni la ingesta
      // del chat. `aplicar` ya no lanza; el try cubre la construccion. Sin PII en el log.
      if (lote.eventos.statuses.length > 0) {
        try {
          await (deps.buildEntregaEstado ?? buildEntregaEstadoService)().aplicar(lote.eventos.statuses);
        } catch (error) {
          console.warn(`[envios-whatsapp] estados de entregas no aplicados: ${error instanceof Error ? error.name : "error"}`);
        }
      }
    });
  }

  // R9: 200 con conteos agregados (sin PII). Meta no reintenta.
  return NextResponse.json({ ok: true, ...resumen }, { status: 200 });
}

/**
 * Verifica el HMAC-SHA256 del cuerpo crudo contra la cabecera `X-Hub-Signature-256`
 * (`sha256=<hex>`) en tiempo constante (`timingSafeEqual`). Ausente/mal formada/longitud
 * distinta -> false, sin lanzar (R4).
 */
function firmaValida(raw: string, provided: string | null, appSecret: string): boolean {
  if (provided === null || !provided.startsWith(SIGNATURE_PREFIX)) return false;
  const esperado = createHmac("sha256", appSecret).update(raw, "utf8").digest();
  let recibido: Buffer;
  try {
    recibido = Buffer.from(provided.slice(SIGNATURE_PREFIX.length), "hex");
  } catch {
    return false;
  }
  if (recibido.length !== esperado.length) return false;
  return timingSafeEqual(recibido, esperado);
}

export async function GET(req: Request): Promise<Response> {
  return handleGet(req);
}

export async function POST(req: Request): Promise<Response> {
  return handlePost(req);
}
