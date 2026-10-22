import { randomUUID } from "node:crypto";
import { esAccesoTotal } from "@/lib/auth/acceso-total";
import { gestionConfig, type GestionMimeType } from "@/lib/config/gestion";
import type { IFileStorage } from "@/lib/interfaces/external/IFileStorage";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import {
  SinTransicionesError,
  type EvidenciaComprobanteSubida,
  type IDevolucionTiendaRepository,
  type OrdenParaReporte,
} from "@/lib/interfaces/repositories/IDevolucionTiendaRepository";
import type {
  ConfirmarEntregaTiendaInput,
  ConfirmarEntregaTiendaServiceResult,
  IDevolucionTiendaService,
  VerComprobanteDevolucionTiendaServiceResult,
} from "@/lib/interfaces/services/IDevolucionTiendaService";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import { compensarEvidencias } from "@/lib/services/evidencias-compensadas";
import {
  TOPE_ORDENES_POR_LOTE,
  rutaComprobanteDevolucionTienda,
  type DesenlaceOrden,
} from "@/lib/types/devolucion-tienda";
import { validarEvidencia } from "@/lib/types/gestion-orden";

const ESTADO_ORIGEN = "devolviendo_a_tienda";
const ESTADO_DESTINO = "devuelta_a_tienda";

export interface DevolucionTiendaConfig {
  maxFileBytes: number;
  maxEvidencias: number;
  signedUrlTtlSeconds: number;
}

const CONFIG_REAL: DevolucionTiendaConfig = {
  maxFileBytes: gestionConfig.MAX_FILE_BYTES,
  maxEvidencias: gestionConfig.MAX_EVIDENCIAS_POR_GESTION,
  signedUrlTtlSeconds: gestionConfig.SIGNED_URL_TTL_SECONDS,
};

/**
 * FICHA 419 (design D5) — la bodega CENTRAL confirma que la tienda recibio N ordenes, con un
 * comprobante obligatorio. Orden de operaciones:
 *   1. rol (maestro/admin) ANTES de leer o subir nada (R2);
 *   2. validacion de archivos y lote (R3/R4/R5) y tienda del lote;
 *   3. ids del catalogo;
 *   4. subida de los archivos ANTES de escribir; si una falla, se retiran las ya subidas (R12);
 *   5. el lote en una transaccion (repo); si no transiciona ninguna o la escritura falla, se
 *      retiran los archivos (R11/R13);
 *   6. desenlace por orden pedida (R7).
 * No conoce HTTP ni Prisma.
 */
export class DevolucionTiendaService implements IDevolucionTiendaService {
  constructor(
    private readonly repo: IDevolucionTiendaRepository,
    private readonly storage: IFileStorage,
    private readonly signedUrls: ISignedUrlProvider,
    private readonly config: DevolucionTiendaConfig = CONFIG_REAL,
    private readonly nuevoUuid: () => string = randomUUID,
  ) {}

  async confirmarEntrega(
    input: ConfirmarEntregaTiendaInput,
    actor: Actor,
  ): Promise<ConfirmarEntregaTiendaServiceResult> {
    // 1. R2: solo maestro/admin (D-H3 coincide exactamente con ROLES_ACCESO_TOTAL).
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" };

    // 2. R3/R4/R5: revalidacion en el servicio (el borde ya paso zod).
    const errores = this.validar(input);
    if (errores !== null) return { status: "validation_error", fieldErrors: errores };
    if (!(await this.repo.esTienda(input.tiendaId))) {
      return {
        status: "validation_error",
        fieldErrors: { tiendaId: ["la tienda del lote no existe"] },
      };
    }

    // 3. El catalogo debe tener los dos estados (patron RecepcionOrigenService, paso 6).
    const origenId = await this.repo.findEstatusIdByValue(ESTADO_ORIGEN);
    const destinoId = await this.repo.findEstatusIdByValue(ESTADO_DESTINO);
    if (origenId === null || destinoId === null) {
      return {
        status: "validation_error",
        fieldErrors: { estatus: [`el catalogo no tiene ${ESTADO_ORIGEN}/${ESTADO_DESTINO}`] },
      };
    }

    const ordenIds = Array.from(new Set(input.ordenIds));

    // 4. R12: subida secuencial; si una falla se retiran las ya subidas y no se escribe nada.
    //    Secuencial a proposito (como `subirEvidenciasCompensadas`): asi `subidas` contiene
    //    EXACTAMENTE lo subido hasta el fallo. La ruta no lleva ids de tienda/orden/usuario (R23).
    const subidas: EvidenciaComprobanteSubida[] = [];
    try {
      for (let i = 0; i < input.evidencias.length; i++) {
        const ev = input.evidencias[i];
        const path = rutaComprobanteDevolucionTienda(
          this.nuevoUuid(),
          ev.contentType as GestionMimeType,
        );
        const stored = await this.storage.upload({
          path,
          bytes: ev.bytes,
          contentType: ev.contentType,
        });
        subidas.push({ storagePath: stored, contentType: ev.contentType, indice: i });
      }
    } catch {
      await compensarEvidencias(this.storage, subidas.map((s) => s.storagePath));
      return { status: "comprobante_no_guardado" };
    }

    // 5. El lote, todo-o-nada en una transaccion.
    let transicionadas: string[];
    try {
      const r = await this.repo.confirmarEntregaLote({
        tiendaId: input.tiendaId,
        subidoPor: actor.usuarioId,
        ordenIds,
        origenEstatusId: origenId,
        destinoEstatusId: destinoId,
        evidencias: subidas,
      });
      transicionadas = r.transicionadas;
    } catch (error) {
      // R11 (ninguna elegible) y R13 (fallo de escritura): la tx revirtio; se retiran los archivos.
      await compensarEvidencias(this.storage, subidas.map((s) => s.storagePath));
      if (error instanceof SinTransicionesError) {
        const desenlaces = await this.clasificar(ordenIds, input.tiendaId, new Set());
        return { status: "ninguna_devuelta", desenlaces };
      }
      throw error;
    }

    // 6. R7: un desenlace por orden pedida. Informativo: la decision ya la tomo el WHERE.
    const desenlaces = await this.clasificar(ordenIds, input.tiendaId, new Set(transicionadas));
    return { status: "ok", devueltas: transicionadas.length, desenlaces };
  }

  async verComprobante(
    ordenId: string,
    actor: Actor,
  ): Promise<VerComprobanteDevolucionTiendaServiceResult> {
    // R22: un rol ajeno recibe lo MISMO que una orden sin comprobante (no revela existencia).
    if (!esAccesoTotal(actor.rol)) return { status: "no_encontrado" };
    const c = await this.repo.findComprobanteDeOrden(ordenId);
    if (c === null || c.evidencias.length === 0) return { status: "no_encontrado" };
    const paths = c.evidencias.map((e) => e.storagePath);
    const urls = await this.signedUrls.createSignedUrls(paths, this.config.signedUrlTtlSeconds);
    return {
      status: "ok",
      confirmadoAt: c.createdAt.toISOString(),
      confirmadoPor: c.subidoPorNombre,
      // R23: solo la URL firmada; la ruta interna no sale de aqui.
      archivos: c.evidencias.map((e) => ({
        url: urls[e.storagePath] ?? "",
        contentType: e.contentType,
        indice: e.indice,
      })),
    };
  }

  private validar(input: ConfirmarEntregaTiendaInput): Record<string, string[]> | null {
    const errores: Record<string, string[]> = {};
    if (input.evidencias.length === 0) {
      errores.evidencias = ["el comprobante es obligatorio"];
    } else if (input.evidencias.length > this.config.maxEvidencias) {
      errores.evidencias = [`maximo ${this.config.maxEvidencias} archivos de comprobante`];
    } else {
      for (const ev of input.evidencias) {
        const motivo = validarEvidencia(
          { type: ev.contentType, size: ev.bytes.byteLength },
          this.config.maxFileBytes,
        );
        if (motivo !== null) {
          errores.evidencias = [motivo];
          break;
        }
      }
    }
    if (input.ordenIds.length === 0) {
      errores.ordenIds = ["selecciona al menos una orden"];
    } else if (input.ordenIds.length > TOPE_ORDENES_POR_LOTE) {
      errores.ordenIds = [`maximo ${TOPE_ORDENES_POR_LOTE} ordenes por lote`];
    }
    if (input.tiendaId.trim() === "") errores.tiendaId = ["indica la tienda del lote"];
    return Object.keys(errores).length > 0 ? errores : null;
  }

  private async clasificar(
    ordenIds: string[],
    tiendaId: string,
    transicionadas: ReadonlySet<string>,
  ): Promise<DesenlaceOrden[]> {
    const filas = await this.repo.findOrdenesParaReporte(ordenIds);
    const porId = new Map(filas.map((f) => [f.id, f]));
    return ordenIds.map((id) => clasificarOrden(id, porId.get(id), tiendaId, transicionadas));
  }
}

/** R7: desenlace de UNA orden pedida. Pura. */
export function clasificarOrden(
  ordenId: string,
  fila: OrdenParaReporte | undefined,
  tiendaId: string,
  transicionadas: ReadonlySet<string>,
): DesenlaceOrden {
  if (fila === undefined || fila.deletedAt !== null) {
    return { ordenId, numGuia: null, desenlace: "no_encontrada" };
  }
  if (transicionadas.has(ordenId)) {
    return { ordenId, numGuia: fila.numGuia, desenlace: "devuelta_a_tienda" };
  }
  if (fila.tiendaId !== tiendaId) {
    return { ordenId, numGuia: fila.numGuia, desenlace: "tienda_distinta" };
  }
  if (fila.estatusValue === ESTADO_DESTINO) {
    return { ordenId, numGuia: fila.numGuia, desenlace: "ya_devuelta" };
  }
  return { ordenId, numGuia: fila.numGuia, desenlace: "estado_invalido", estado: fila.estatusValue };
}
