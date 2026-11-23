import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { z } from "zod";

import {
  pedirIdempotente,
  pedirUnaVez,
  traducirFalla,
  type RespuestaCruda,
  type TransporteDeps,
} from "@/lib/clients/cobro/http-proveedor";
import { CredencialIlegibleError } from "@/lib/crypto/boveda-integraciones";
import type {
  AvisoFirmado,
  CrearEnlaceEntrada,
  DevolucionDelProveedor,
  DevolverEntrada,
  EnlaceDelProveedor,
  EstadoDevolucion,
  EstadoPagoProveedor,
  IProveedorCobro,
  LeerCredencialesCobro,
  PagoDelProveedor,
} from "@/lib/interfaces/external/IProveedorCobro";
import {
  ProveedorCobroError,
  type CodigoErrorProveedor,
  type EntornoCobro,
  type MetodoCobro,
  type OperacionProveedor,
} from "@/lib/types/cobro";

// SLT-227 (design §6) — el adaptador de Rebill, por su API REST v3 con `x-api-key` y sin SDK (R15). Todo lo que
// depende de la forma de la API de Rebill vive aquí y en su doble (`e2e/_rebill-falso/servidor.mjs`). No escribe
// logs: toda la información sale en el `ProveedorCobroError`, que nunca lleva un secreto ni un cuerpo (R25).

export interface RebillProveedorCobroDeps {
  paisId: string;
  /** Elige la fila de credenciales que se lee (R4); la URL es la misma en los dos entornos (P5). */
  entorno: EntornoCobro;
  urlBase: string;
  leerCredenciales: LeerCredencialesCobro;
  transporte: TransporteDeps;
}

/** Hasta 10 cifras enteras y siempre 2 decimales: además, un literal numérico JSON válido (design §6.2). */
const FORMA_MONTO = /^\d{1,10}\.\d{2}$/;
const FORMA_MONEDA = /^[A-Z]{3}$/;
const FORMA_FIRMA = /^[0-9a-f]{64}$/;
const CABECERA_FIRMA = "x-rebill-signature";
/** Por debajo de 10¹⁰, un `double` redondeado a 2 decimales da el decimal original (design §6.3). */
const TOPE_MONTO_LEIDO = 1e10;

/** `null`: un enlace `instant` no cobra suscripciones; el cobro recurrente es de SLT-232. */
const METODO_DE_ENLACE: Readonly<Record<MetodoCobro, string | null>> = {
  tarjeta: "card",
  transferencia: "bank_transfer",
  recurrente: null,
};

/** R17. `partially_refunded` sigue aprobado (P7) y `cancelled` es rechazo (P8). Un estado sin entrada no se traduce. */
export const ESTADO_REBILL_A_PROVEEDOR: Readonly<Record<string, EstadoPagoProveedor>> = {
  pending: "pendiente",
  approved: "aprobado",
  rejected: "rechazado",
  refunded: "devuelto",
  chargeback: "contracargo",
  partially_refunded: "aprobado",
  cancelled: "rechazado",
};

/** R19 (design §6.4). `approved` es una devolución asíncrona que todavía no terminó, según la doc. */
export const ESTADO_DEVOLUCION_REBILL: Readonly<Record<string, EstadoDevolucion>> = {
  refunded: "aprobada",
  partially_refunded: "aprobada",
  approved: "pendiente",
  cancelled: "denegada",
};

/** Un mapa leído con `Object.hasOwn`: `status: "constructor"` no debe dar una función del prototipo. */
function traducir<T>(mapa: Readonly<Record<string, T>>, clave: string): T | null {
  return Object.hasOwn(mapa, clave) ? (mapa[clave] as T) : null;
}

const rebillEnlaceSchema = z.object({
  id: z.string().regex(/^(pl_|test_)/),
  url: z.string().startsWith("https://"),
  expirationDate: z.string().nullish(),
});

const rebillPagoSchema = z.object({
  id: z.string().min(1),
  amount: z.number(),
  currency: z.string().regex(FORMA_MONEDA),
  status: z.string(),
  // Es como el aviso `payment.updated` ata el pago a su enlace. La doc lo muestra en el aviso y no en el `GET`:
  // si el `GET` no lo trae, el pago sale `respuesta_invalida` (riesgo aceptado, design §6.3; lo contrasta T4.5).
  metadata: z.object({ paymentLinkId: z.string().min(1) }),
});

const rebillDevolucionSchema = z.object({ status: z.string() });

/** Un monto que `cuerpoJsonConMontos` escribe como número JSON sin pasar por `Number`. */
export class MontoJson {
  constructor(readonly texto: string) {}
}

/**
 * `JSON.stringify` con cada `MontoJson` escrito como el literal numérico de su texto (design §6.2): primero va como
 * una ficha `"__monto_<uuid>_<n>__"`, con un `uuid` nuevo por llamada que un texto del usuario no puede imitar, y
 * después cada ficha, con sus comillas, se cambia por el literal. Una ficha que no aparece una sola vez es un error
 * de programación.
 */
export function cuerpoJsonConMontos(objeto: unknown): string {
  const sello = randomUUID().replaceAll("-", "");
  const montos: string[] = [];
  const json = JSON.stringify(objeto, (_clave, valor: unknown) => {
    if (!(valor instanceof MontoJson)) return valor;
    if (!FORMA_MONTO.test(valor.texto)) throw new Error("cuerpoJsonConMontos: un monto sin la forma ^\\d{1,10}\\.\\d{2}$");
    montos.push(valor.texto);
    return `__monto_${sello}_${montos.length - 1}__`;
  });
  return montos.reduce((parcial, texto, n) => {
    const partes = parcial.split(`"__monto_${sello}_${n}__"`);
    if (partes.length !== 2) throw new Error("cuerpoJsonConMontos: una ficha de monto no aparece exactamente una vez");
    return partes[0] + texto + partes[1];
  }, json);
}

/** Mayor que cero, mirado sobre la cadena: una cifra distinta de 0 (design §6.2). */
function esMontoPositivo(monto: string): boolean {
  return FORMA_MONTO.test(monto) && /[1-9]/.test(monto);
}

/**
 * La única lectura de un monto a través de `number` (design §6.3): `JSON.parse` ya lo convirtió. Acotado bajo 10¹⁰,
 * `toFixed(2)` da el decimal exacto; si al volver no es el mismo número, Rebill mandó más de 2 decimales.
 */
function montoDeRebill(amount: number): string | null {
  if (!Number.isFinite(amount) || amount < 0 || amount >= TOPE_MONTO_LEIDO) return null;
  const texto = amount.toFixed(2);
  return Number(texto) === amount ? texto : null;
}

export class RebillProveedorCobro implements IProveedorCobro {
  readonly proveedor = "rebill";

  constructor(private readonly deps: RebillProveedorCobroDeps) {}

  get paisId(): string {
    return this.deps.paisId;
  }

  get entorno(): EntornoCobro {
    return this.deps.entorno;
  }

  /** R16. Nunca se reintenta (R22). */
  async crearEnlace(entrada: CrearEnlaceEntrada): Promise<EnlaceDelProveedor> {
    const operacion = "crearEnlace";
    const metodo = METODO_DE_ENLACE[entrada.metodo];
    if (metodo === undefined) throw this.falla("solicitud_invalida", operacion);
    if (metodo === null) throw this.falla("metodo_no_soportado", operacion);
    this.exigirMontoYMoneda(entrada.monto, entrada.moneda, operacion);
    if (!entrada.descripcion.trim() || !entrada.intentoId || !entrada.facturaId) {
      throw this.falla("solicitud_invalida", operacion);
    }
    const apiKey = await this.secreto("apiKey", operacion);
    const cuerpo = cuerpoJsonConMontos({
      title: [{ text: entrada.descripcion, language: "es" }],
      prices: [{ amount: new MontoJson(entrada.monto), currency: entrada.moneda, isDefault: true }],
      paymentMethods: [{ methods: [metodo], currency: entrada.moneda }],
      metadata: { facturaId: entrada.facturaId, intentoId: entrada.intentoId },
      isSingleUse: true,
    });
    const respuesta = await pedirUnaVez(this.deps.transporte, "rebill", operacion, this.url("/v3/payment-links"), {
      method: "POST",
      headers: this.cabeceras(apiKey),
      body: cuerpo,
    });
    const enlace = rebillEnlaceSchema.safeParse(respuesta.cuerpo);
    if (!enlace.success) throw this.respuestaInvalida(operacion, respuesta);
    const venceAt = enlace.data.expirationDate ? new Date(enlace.data.expirationDate) : null;
    if (venceAt !== null && Number.isNaN(venceAt.getTime())) throw this.respuestaInvalida(operacion, respuesta);
    return { idExterno: enlace.data.id, url: enlace.data.url, venceAt };
  }

  /** R17 y el contrato de SLT-226: `null` si Rebill no conoce el pago. Es lo único que se reintenta (R21). */
  async consultarPago(pagoProveedorId: string): Promise<PagoDelProveedor | null> {
    const operacion = "consultarPago";
    if (!pagoProveedorId.trim()) throw this.falla("solicitud_invalida", operacion);
    const apiKey = await this.secreto("apiKey", operacion);
    let respuesta: RespuestaCruda;
    try {
      respuesta = await pedirIdempotente(
        this.deps.transporte,
        "rebill",
        operacion,
        this.url(`/v3/payments/${encodeURIComponent(pagoProveedorId)}`),
        { method: "GET", headers: this.cabeceras(apiKey) },
      );
    } catch (error) {
      if (error instanceof ProveedorCobroError && error.codigo === "no_encontrado") return null;
      throw error;
    }
    const pago = rebillPagoSchema.safeParse(respuesta.cuerpo);
    if (!pago.success || pago.data.id !== pagoProveedorId) throw this.respuestaInvalida(operacion, respuesta);
    const estado = traducir(ESTADO_REBILL_A_PROVEEDOR, pago.data.status);
    const monto = montoDeRebill(pago.data.amount);
    if (estado === null || monto === null) throw this.respuestaInvalida(operacion, respuesta);
    return {
      pagoProveedorId,
      idExterno: pago.data.metadata.paymentLinkId,
      estado,
      monto,
      moneda: pago.data.currency,
    };
  }

  /**
   * R18 (design §6.5): HMAC-SHA256 en hex del cuerpo crudo, con el `signingSecret` completo (`whsec_` incluido) como
   * clave, comparado en tiempo constante. Sin red. La regex garantiza 32 bytes, así que `timingSafeEqual` no lanza.
   */
  async verificarFirma(aviso: AvisoFirmado): Promise<boolean> {
    const secreto = await this.secreto("secretoWebhook", "verificarFirma");
    const cabecera = aviso.cabeceras[CABECERA_FIRMA]?.toLowerCase();
    if (cabecera === undefined || !FORMA_FIRMA.test(cabecera)) return false;
    const esperada = createHmac("sha256", secreto).update(aviso.cuerpoCrudo, "utf8").digest();
    return timingSafeEqual(esperada, Buffer.from(cabecera, "hex"));
  }

  /**
   * R19 (design §6.4). Siempre manda el monto: devolver «lo que quede» sin decir cuánto es de SLT-233. No consulta
   * antes si se puede: lo decide Rebill (`400` ⇒ `solicitud_rechazada`). Nunca se reintenta (R22).
   */
  async devolver(entrada: DevolverEntrada): Promise<DevolucionDelProveedor> {
    const operacion = "devolver";
    this.exigirMontoYMoneda(entrada.monto, entrada.moneda, operacion);
    if (!entrada.pagoProveedorId.trim()) throw this.falla("solicitud_invalida", operacion);
    const apiKey = await this.secreto("apiKey", operacion);
    const respuesta = await pedirUnaVez(
      this.deps.transporte,
      "rebill",
      operacion,
      this.url(`/v3/refunds/${encodeURIComponent(entrada.pagoProveedorId)}`),
      { method: "POST", headers: this.cabeceras(apiKey), body: cuerpoJsonConMontos({ amount: new MontoJson(entrada.monto) }) },
    );
    const devolucion = rebillDevolucionSchema.safeParse(respuesta.cuerpo);
    const estado = devolucion.success ? traducir(ESTADO_DEVOLUCION_REBILL, devolucion.data.status) : null;
    if (estado === null) throw this.respuestaInvalida(operacion, respuesta);
    return { estado };
  }

  private exigirMontoYMoneda(monto: string, moneda: string, operacion: OperacionProveedor): void {
    if (!esMontoPositivo(monto) || !FORMA_MONEDA.test(moneda)) throw this.falla("solicitud_invalida", operacion);
  }

  /**
   * Las credenciales del trío del adaptador (R4), leídas en cada operación y sin caché: un cambio rige en la
   * siguiente llamada y nada derivado de una credencial queda en memoria (SL-36 R28).
   */
  private async secreto(campo: "apiKey" | "secretoWebhook", operacion: OperacionProveedor): Promise<string> {
    let secretos: Readonly<Record<string, string>> | null;
    try {
      secretos = await this.deps.leerCredenciales({
        proveedor: "rebill",
        paisId: this.deps.paisId,
        entorno: this.deps.entorno,
      });
    } catch (error) {
      const ilegible =
        error instanceof CredencialIlegibleError ||
        (error instanceof ProveedorCobroError && error.codigo === "credencial_ilegible");
      if (ilegible) throw this.falla("credencial_ilegible", operacion);
      throw error;
    }
    const valor = secretos?.[campo];
    if (!valor) throw this.falla("sin_configuracion", operacion);
    return valor;
  }

  private cabeceras(apiKey: string): Record<string, string> {
    return { "x-api-key": apiKey, "content-type": "application/json", accept: "application/json" };
  }

  private url(ruta: string): string {
    return `${this.deps.urlBase.replace(/\/+$/, "")}${ruta}`;
  }

  private falla(codigo: CodigoErrorProveedor, operacion: OperacionProveedor): ProveedorCobroError {
    return new ProveedorCobroError(codigo, "rebill", { operacion });
  }

  private respuestaInvalida(operacion: OperacionProveedor, respuesta: RespuestaCruda): ProveedorCobroError {
    return traducirFalla("rebill", operacion, { tipo: "respuesta_invalida", estadoHttp: respuesta.estado });
  }
}
