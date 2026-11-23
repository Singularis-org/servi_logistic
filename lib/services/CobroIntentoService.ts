import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { esPlataforma } from "@/lib/auth/plataforma";
import type { IConsultaPagoProveedor, PagoDelProveedor } from "@/lib/interfaces/external/IProveedorCobro";
import type { ICobroIntentoRepository } from "@/lib/interfaces/repositories/ICobroIntentoRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  ICobroIntentoService,
  ObtenerOCrearIntentoInput,
  RegistrarEnlaceInput,
} from "@/lib/interfaces/services/ICobroIntentoService";
import {
  eventoProveedorSchema,
  marcarPagadoManualSchema,
  type EventoProveedor,
  type IntentosDeFacturaResult,
  type MarcarPagadoManualInput,
  type MarcarPagadoManualResult,
  type ObtenerIntentoResult,
  type ProcesarEventoResult,
  type ProveedorCobroId,
  type RegistrarEnlaceResult,
  type ResultadoDelEvento,
} from "@/lib/types/cobro";

// SLT-226 (design §4.4) — el cobro en línea. Las reglas de dinero (el saldo, la clave, el candado, la idempotencia
// del pago) las decide la base, en las funciones del dueño; aquí se orquesta el evento y se autoriza la lectura.
//
// El adaptador se elige por el `proveedor` del evento, por mapa: cada proveedor (R30) enchufa el suyo en el
// composition root sin tocar el servicio. El proveedor y el método de un intento los elige quien lo pide (R31).

type Intento = { resultado: ResultadoDelEvento; intentoId: string | null };

export class CobroIntentoService implements ICobroIntentoService {
  constructor(
    private readonly repo: ICobroIntentoRepository,
    private readonly proveedores: ReadonlyMap<ProveedorCobroId, IConsultaPagoProveedor>,
    private readonly ahora: () => Date,
    /** La moneda local (`monedaConfig.currency` en el composition root): el intento cobra en ella (R1). */
    private readonly monedaLocal: string,
  ) {}

  async obtenerOCrearIntento(input: ObtenerOCrearIntentoInput): Promise<ObtenerIntentoResult> {
    const r = await this.repo.obtenerOCrear({
      organizacionId: input.organizacionId,
      facturaId: input.facturaId,
      proveedor: input.proveedor,
      metodo: input.metodo,
      monedaLocal: this.monedaLocal,
      por: input.actorUsuarioId,
      ahora: this.ahora(),
    });
    if (r.estado === "factura_no_valida" || r.estado === "sin_saldo") return { estado: r.estado };
    return { estado: "ok", intento: r.intento, nuevo: r.estado === "creado" };
  }

  async registrarEnlace(input: RegistrarEnlaceInput): Promise<RegistrarEnlaceResult> {
    return { estado: await this.repo.registrarEnlace({ ...input, ahora: this.ahora() }) };
  }

  async procesarEvento(entrada: unknown): Promise<ProcesarEventoResult> {
    const parsed = eventoProveedorSchema.safeParse(entrada);
    if (!parsed.success) {
      throw new Error(`CobroIntentoService.procesarEvento: el evento no tiene la forma esperada: ${parsed.error.message}`);
    }
    const evento = parsed.data;
    const proveedor = this.proveedores.get(evento.proveedor);
    if (proveedor === undefined) {
      throw new Error(`CobroIntentoService.procesarEvento: no hay adaptador para el proveedor ${evento.proveedor}`);
    }

    // R13: un evento ya procesado se ignora sin consultar ni escribir; uno que llegó y no terminó se procesa otra vez.
    const llegada = await this.repo.registrarEvento({ ...evento, ahora: this.ahora() });
    if (llegada === "repetido") return { estado: "ignorado" };

    const pago = await this.consultar(proveedor, evento);
    const { resultado, intentoId } = pago === null ? { resultado: "sin_intento" as const, intentoId: null } : await this.aplicar(evento.proveedor, pago);

    const cierre = await this.repo.cerrarEvento({
      proveedor: evento.proveedor,
      logId: evento.logId,
      resultado,
      intentoId,
      ahora: this.ahora(),
    });
    if (cierre === "sin_evento") {
      throw new Error(`CobroIntentoService.procesarEvento: el evento ${evento.logId} no está para cerrarlo`);
    }
    // `ya_cerrado`: otra llegada del mismo evento lo cerró a la vez; lo aplicado es idempotente (design §3.8).
    return { estado: "procesado", resultado };
  }

  async intentosDeFactura(actor: Actor, facturaId: string): Promise<IntentosDeFacturaResult> {
    // R27: la autorización va antes de leer nada.
    if (esPlataforma(actor.rol)) {
      return { estado: "ok", intentos: await this.repo.intentosDeFactura({ tipo: "plataforma" }, facturaId) };
    }
    const organizacionId = actor.organizacionId ?? null;
    if (!esAccesoTotal(actor.rol) || organizacionId === null) return { estado: "forbidden" };
    return { estado: "ok", intentos: await this.repo.intentosDeFactura({ tipo: "empresa", organizacionId }, facturaId) };
  }

  async marcarPagadoManual(actor: Actor, entrada: MarcarPagadoManualInput): Promise<MarcarPagadoManualResult> {
    // R39: la función de la base confía en `por`; la única puerta es esta, antes de validar o leer nada.
    if (!esPlataforma(actor.rol)) return { estado: "forbidden" };

    const parsed = marcarPagadoManualSchema.safeParse(entrada);
    if (!parsed.success) {
      // R38: una referencia en blanco es un caso del negocio; cualquier otro fallo de forma es de programación.
      const soloReferenciaVacia = parsed.error.issues.every((i) => i.path[0] === "referencia" && i.code === "too_small");
      if (soloReferenciaVacia) return { estado: "referencia_vacia" };
      throw new Error(`CobroIntentoService.marcarPagadoManual: la entrada no tiene la forma esperada: ${parsed.error.message}`);
    }

    const estado = await this.repo.marcarPagadoManual({
      intentoId: parsed.data.intentoId,
      referencia: parsed.data.referencia,
      por: actor.usuarioId,
      ahora: this.ahora(),
    });
    return { estado };
  }

  /** R14, R16: el estado sale del proveedor, no del evento. Si la consulta falla, el evento queda sin cerrar. */
  private async consultar(proveedor: IConsultaPagoProveedor, evento: EventoProveedor): Promise<PagoDelProveedor | null> {
    try {
      return await proveedor.consultarPago(evento.pagoProveedorId);
    } catch (e) {
      // Sin datos del pago en el mensaje: solo la operación, el proveedor y el evento.
      throw new Error(
        `CobroIntentoService.procesarEvento: falló la consulta del pago a ${evento.proveedor} (logId ${evento.logId})`,
        { cause: e },
      );
    }
  }

  private async aplicar(proveedor: ProveedorCobroId, pago: PagoDelProveedor): Promise<Intento> {
    const ahora = this.ahora();
    if (pago.estado === "aprobado") {
      const r = await this.repo.registrarPagoAprobado({
        proveedor,
        pagoProveedorId: pago.pagoProveedorId,
        idExterno: pago.idExterno,
        monto: pago.monto,
        moneda: pago.moneda,
        ahora,
      });
      // R20: el mismo pago registrado otra vez cuenta como aplicado, sin escribir nada.
      const resultado = r.resultado === "ok" || r.resultado === "ya_registrado" ? "aplicado" : r.resultado;
      return { resultado, intentoId: r.intentoId };
    }
    const r = await this.repo.avanzar({ proveedor, idExterno: pago.idExterno, destino: pago.estado, ahora });
    // R15: ya alcanzado, detrás o inalcanzable: el intento no cambia y el evento queda «sin cambio».
    const resultado = r.resultado === "ok" ? "aplicado" : r.resultado === "sin_intento" ? "sin_intento" : "sin_cambio";
    return { resultado, intentoId: r.intentoId };
  }
}
