import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import { conEmpresa } from "@/lib/db/contexto-empresa";
import type { IResumenSecreto } from "@/lib/interfaces/external/IResumenSecreto";
import type {
  DestinoWebhook,
  IIntegracionEnrutadoRepository,
} from "@/lib/interfaces/repositories/IIntegracionEnrutadoRepository";
import type {
  EventoWebhook,
  IWebhookWhatsappService,
  ResultadoEventoWebhook,
  ResultadoVerificacionWebhook,
  VerificacionWebhook,
} from "@/lib/interfaces/services/IWebhookWhatsappService";
import type { ChatLogger, IngestaResumen } from "@/lib/services/ChatWhatsappService";
import type { IEntregaEstadoService } from "@/lib/services/EntregaEstadoService";
import { volcarStatusesFallidos } from "@/lib/services/whatsapp/chat-logger";
import { parseWebhookEventos, type WebhookEventos } from "@/lib/types/whatsapp-webhook";

// SL-36 (design §10; R19-R22) — el webhook de WhatsApp: una URL para todas las empresas.
//
// Meta no manda la empresa, pero SI el numero (`metadata.phone_number_id`) y el resumen del token
// de verificacion, y los dos son unicos en la base. Por eso la empresa ya no se infiere de ordenes y
// mensajes como en SL-17 (`repartirPorEmpresa`): se traduce con `IIntegracionEnrutadoRepository`,
// la unica lectura en plataforma (R22), y TODO lo demas corre en `conEmpresa`.
//
// INVARIANTE (feature 109/R11 y SL-36 R21): nada de lo que llega antes de validar la firma produce
// efectos ni se imprime. Al log solo van conteos: nunca el token, el App Secret, la firma, el numero
// ni el cuerpo.

const PREFIJO_FIRMA = "sha256=";
const FIRMA_HEX = /^[0-9a-f]{64}$/i;

/**
 * Lo unico que se lee del cuerpo antes de verificar la firma: de que numero es cada `change`. Se
 * valida por `change` y sin strip: un `change` sin `metadata` se descarta solo, sin tumbar el resto,
 * y lo demas del objeto se conserva tal cual para el parser de siempre.
 */
const changeConNumero = z.looseObject({
  value: z.looseObject({ metadata: z.looseObject({ phone_number_id: z.string().min(1) }) }),
});
const cuerpoConEntradas = z.looseObject({
  entry: z.array(z.looseObject({ changes: z.array(z.unknown()) })),
});

type CuerpoWebhook = z.infer<typeof cuerpoConEntradas>;

/** Los `changes` de una empresa, en la forma de Meta, para pasarlos al parser de siempre. */
interface LoteDeEmpresa {
  destino: DestinoWebhook;
  cuerpo: CuerpoWebhook;
}

export interface WebhookWhatsappDeps {
  enrutado: IIntegracionEnrutadoRepository;
  resumidor: Pick<IResumenSecreto, "resumen">;
  /**
   * El App Secret de la integracion de WhatsApp de la empresa EN CURSO, o `null` si no esta lista
   * (sin configurar o ilegible). Se llama ya dentro de `conEmpresa`. T6.2 lo cablea sobre
   * `ICredencialesIntegracion.leer("whatsapp")`.
   */
  leerAppSecret: (integracionId: string) => Promise<string | null>;
  /** La hora del ultimo contacto valido del webhook (R19, R20), en la empresa en curso. */
  anotarWebhook: (integracionId: string, at: Date) => Promise<void>;
  /** La ingesta de siempre (`ChatWhatsappService`), en la empresa en curso. */
  ingesta: { ingerirEventos(eventos: WebhookEventos): Promise<IngestaResumen> };
  /**
   * Ficha 474 (R38): los estados de las entregas automaticas. Una fabrica y no la instancia: como en
   * el route, un fallo AL CONSTRUIRLA tampoco puede cambiar el 200 ni la ingesta del chat.
   */
  entregaEstado: () => IEntregaEstadoService;
  /** Diagnostico de los `failed` y conteos de descartes. Sin PII. */
  logger: ChatLogger;
  /** Volcado de depuracion de los tipos no soportados (ver `volcarTiposNoSoportados`). */
  depuracion?: (mensaje: string, detalle: string) => void;
  reloj?: () => Date;
}

/**
 * HMAC-SHA256 del cuerpo crudo contra `sha256=<hex>`, en tiempo constante (R20). Mal formada o de
 * otro largo -> `false` sin comparar: `timingSafeEqual` lanza con largos distintos.
 */
export function firmaValida(cuerpoCrudo: string, firma: string, appSecret: string): boolean {
  if (!firma.startsWith(PREFIJO_FIRMA)) return false;
  const hex = firma.slice(PREFIJO_FIRMA.length);
  if (!FIRMA_HEX.test(hex)) return false;
  const esperado = createHmac("sha256", appSecret).update(cuerpoCrudo, "utf8").digest();
  return timingSafeEqual(Buffer.from(hex, "hex"), esperado);
}

function resumenVacio(): IngestaResumen {
  return { mensajesRegistrados: 0, statusesAplicados: 0, sinResolver: 0, hilosMigrados: 0 };
}

function sumar(total: IngestaResumen, parcial: IngestaResumen): void {
  total.mensajesRegistrados += parcial.mensajesRegistrados;
  total.statusesAplicados += parcial.statusesAplicados;
  total.sinResolver += parcial.sinResolver;
  total.hilosMigrados += parcial.hilosMigrados;
}

function nombreDelError(error: unknown): string {
  return error instanceof Error ? error.name : "error";
}

/** El cuerpo como JSON con `entry[].changes[]`, o `null`. Aun sin firmar: solo se lee. */
function cuerpoDe(cuerpoCrudo: string): CuerpoWebhook | null {
  let json: unknown;
  try {
    json = JSON.parse(cuerpoCrudo);
  } catch {
    // Sin JSON no hay numero, asi que no hay App Secret con que verificar: se descarta (R21).
    return null;
  }
  const r = cuerpoConEntradas.safeParse(json);
  return r.success ? r.data : null;
}

/** Cada numero del cuerpo, en el orden en que aparece; los `change` sin numero no aportan ninguno. */
function numerosDe(cuerpo: CuerpoWebhook): string[] {
  const numeros: string[] = [];
  for (const entry of cuerpo.entry) {
    for (const change of entry.changes) {
      const r = changeConNumero.safeParse(change);
      if (r.success) numeros.push(r.data.value.metadata.phone_number_id);
    }
  }
  return numeros;
}

/**
 * Reparte los `changes` por empresa. Un `change` de un numero desconocido no entra en ningun lote
 * (R21): no se procesa en la empresa de otro `change` del mismo POST.
 */
function lotesPorEmpresa(cuerpo: CuerpoWebhook, destinos: Map<string, DestinoWebhook>): LoteDeEmpresa[] {
  const lotes = new Map<string, LoteDeEmpresa>();
  for (const entry of cuerpo.entry) {
    const porEmpresa = new Map<string, unknown[]>();
    for (const change of entry.changes) {
      const r = changeConNumero.safeParse(change);
      const destino = r.success ? destinos.get(r.data.value.metadata.phone_number_id) : undefined;
      if (destino === undefined) continue;
      let lote = lotes.get(destino.organizacionId);
      if (lote === undefined) {
        lote = { destino, cuerpo: { ...cuerpo, entry: [] } };
        lotes.set(destino.organizacionId, lote);
      }
      let changes = porEmpresa.get(destino.organizacionId);
      if (changes === undefined) {
        changes = [];
        porEmpresa.set(destino.organizacionId, changes);
        lote.cuerpo.entry.push({ ...entry, changes });
      }
      changes.push(change);
    }
  }
  return [...lotes.values()];
}

export class WebhookWhatsappService implements IWebhookWhatsappService {
  private readonly reloj: () => Date;

  constructor(private readonly deps: WebhookWhatsappDeps) {
    this.reloj = deps.reloj ?? (() => new Date());
  }

  async verificar(entrada: VerificacionWebhook): Promise<ResultadoVerificacionWebhook> {
    const { mode, token, challenge } = entrada;
    // Sin token no se consulta la base: un GET vacio no cuesta una lectura en plataforma.
    if (mode !== "subscribe" || token === null || token === "" || challenge === null) {
      return { status: "forbidden" };
    }
    // Comparar por resumen sin sal es seguro porque el token es aleatorio de 32 bytes (QC inv. 16).
    const destino = await this.deps.enrutado.porResumenVerificacion(this.deps.resumidor.resumen(token));
    if (destino === null) return { status: "forbidden" };
    await this.anotarSinRomper(destino);
    return { status: "ok", challenge };
  }

  async recibir(evento: EventoWebhook): Promise<ResultadoEventoWebhook> {
    const { cuerpoCrudo, firma } = evento;
    // Sin firma ninguna empresa puede validarla: se rechaza sin leer la base.
    if (firma === null || !firma.startsWith(PREFIJO_FIRMA)) return { status: "unauthorized" };

    const cuerpo = cuerpoDe(cuerpoCrudo);
    if (cuerpo === null) return { status: "unauthorized" };
    const numeros = numerosDe(cuerpo);
    if (numeros.length === 0) return { status: "unauthorized" };

    const destinos = await this.deps.enrutado.porNumeros(numeros);
    const lotes = lotesPorEmpresa(cuerpo, destinos);

    const resumen = resumenVacio();
    let validas = 0;
    let firmasInvalidas = 0;
    for (const lote of lotes) {
      const valida = await conEmpresa(lote.destino.organizacionId, () =>
        this.procesarSiFirmaValida(lote, cuerpoCrudo, firma, resumen),
      );
      if (valida) validas += 1;
      else firmasInvalidas += 1;
    }

    const numerosDesconocidos = new Set(numeros.filter((n) => !destinos.has(n))).size;
    if (firmasInvalidas > 0 || numerosDesconocidos > 0) {
      // Solo conteos (design §10.6): una firma mala no se distingue de un secreto mal pegado y no
      // cambia el estado de la integracion.
      this.deps.logger.warn(
        `[webhook-whatsapp] descartado: ${firmasInvalidas} empresa(s) con firma invalida, ${numerosDesconocidos} numero(s) desconocido(s)`,
      );
    }
    return validas === 0 ? { status: "unauthorized" } : { status: "ok", resumen };
  }

  /**
   * Ya en la empresa del lote: su App Secret, la firma y, solo si valida, la ingesta. Devuelve si
   * la firma valido. Nada antes de `firmaValida` escribe ni imprime.
   */
  private async procesarSiFirmaValida(
    lote: LoteDeEmpresa,
    cuerpoCrudo: string,
    firma: string,
    resumen: IngestaResumen,
  ): Promise<boolean> {
    const appSecret = await this.deps.leerAppSecret(lote.destino.integracionId);
    // La firma cubre el cuerpo ENTERO: es lo que Meta firmo con el App Secret de su app.
    if (appSecret === null || !firmaValida(cuerpoCrudo, firma, appSecret)) return false;

    let eventos: WebhookEventos;
    try {
      eventos = parseWebhookEventos(lote.cuerpo);
    } catch (error) {
      // Firmado pero con una forma que el parser no acepta: no es accionable y Meta no debe
      // reintentarlo (feature 109/R9). Se vuelca para depurar, como hacia el route.
      this.volcar("WP - type other (error)", error instanceof Error ? error.message : String(error));
      this.volcar("WP - type other (crudo)", JSON.stringify(lote.cuerpo));
      await this.anotarSinRomper(lote.destino);
      return true;
    }
    this.volcarTiposNoSoportados(eventos, lote.cuerpo);
    // Antes de ingerir: si la ingesta fallara, el motivo del `failed` ya quedo en el log.
    volcarStatusesFallidos(lote.cuerpo, this.deps.logger);

    sumar(resumen, await this.deps.ingesta.ingerirEventos(eventos));
    if (eventos.statuses.length > 0) await this.aplicarEntregas(eventos);
    await this.anotarSinRomper(lote.destino);
    return true;
  }

  /** Ficha 474 (R38): despues de la ingesta y aislado; un fallo aqui no cambia el 200. */
  private async aplicarEntregas(eventos: WebhookEventos): Promise<void> {
    try {
      await this.deps.entregaEstado().aplicar(eventos.statuses);
    } catch (error) {
      this.deps.logger.warn(`[envios-whatsapp] estados de entregas no aplicados: ${nombreDelError(error)}`);
    }
  }

  /**
   * El ultimo contacto es un dato para la pantalla, no parte del contrato con Meta: si no se puede
   * anotar, el challenge o la ingesta ya hechos no se deshacen ni se convierten en un error.
   */
  private async anotarSinRomper(destino: DestinoWebhook): Promise<void> {
    try {
      await conEmpresa(destino.organizacionId, () => this.deps.anotarWebhook(destino.integracionId, this.reloj()));
    } catch (error) {
      this.deps.logger.warn(`[webhook-whatsapp] ultimo webhook no anotado: ${nombreDelError(error)}`);
    }
  }

  /**
   * Feature de depuracion del route: si un entrante no mapea a un tipo conocido (`otro`), el borde
   * tipado lo descarta y solo el JSON entero muestra que mando Meta. Como texto y no como objeto:
   * `console.log` de un objeto lo recorta a profundidad 2 y `changes` es justo lo que se quiere ver.
   * Excepcion consciente a R11, heredada; ahora solo con la firma ya validada.
   */
  private volcarTiposNoSoportados(eventos: WebhookEventos, cuerpo: CuerpoWebhook): void {
    if (eventos.mensajes.some((m) => m.tipo === "otro")) this.volcar("WP - type other (crudo)", JSON.stringify(cuerpo));
  }

  private volcar(mensaje: string, detalle: string): void {
    (this.deps.depuracion ?? ((m: string, d: string) => console.log(m, d)))(mensaje, detalle);
  }
}
