// Feature 32 — Orquesta "Etiqueta de guia": READ derivado que arma el payload de
// etiqueta (QR + codigo de barras + datos) por cada orden con `num_guia`. Sin
// tabla ni migracion nueva. Servicio dedicado, separado de OrdenService (CRUD):
// ensambla nombres de geografia/tienda y decide QR/barcode en un solo lugar, algo
// que no encaja en el `obtener`/`listar` generico (design.md §3, alternativa C
// descartada). No conoce HTTP ni Prisma directamente (DI por constructor).
import type { EtiquetaRow, IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type {
  EtiquetaPorGuiaServiceResult,
  GenerarEtiquetasInput,
  GenerarEtiquetasServiceResult,
  IEtiquetaGuiaService,
} from "@/lib/interfaces/services/IEtiquetaGuiaService";
import type { EtiquetaGuiaDTO, EtiquetaOmitidaDTO } from "@/lib/types/etiqueta-guia";
import {
  resolverAlcanceEtiquetasOrden,
  type AlcanceEtiquetasOrden,
} from "@/lib/services/alcance-etiquetas-orden";

function distinct(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Dueño que el repositorio pone en el `where` para este alcance: `ownerId` si el actor solo ve
 * lo suyo, `null` si no hay frontera de tienda (SLT-49, design §3.2).
 */
function tiendaIdDelAlcance(alcance: AlcanceEtiquetasOrden): string | null {
  return alcance.alcance === "propias" ? alcance.ownerId : null;
}

/**
 * SEGUNDA CAPA (SLT-49): ¿puede este alcance ver la etiqueta de esta fila?
 *
 * La FRONTERA vive en el `where` del repositorio (`tiendaIdDelAlcance`): una orden de otra tienda
 * no se lee de la base. Este `if` es la red: si una fila ajena llegara igual (un repo mal mutado,
 * un doble que ignore el filtro), sigue saliendo como `no_encontrada`. Mismo doble cinturon que
 * el borrado (FICHA 358).
 *
 * El alcance sale de `resolverAlcanceEtiquetasOrden`, la regla unica (R14): `adminTienda` y
 * `apiKey` ven solo lo suyo (`actor.usuarioId` es el `tienda_id` de sus ordenes; para la key, el
 * dueño resuelto por `ApiKeyAuthService`, features 136 y 302); maestro/admin ven todo (R11) y
 * mensajero/adminSatelite conservan el comportamiento previo, sin filtro por dueño, hasta SLT-50
 * (R12).
 */
function esVisiblePara(row: EtiquetaRow, alcance: AlcanceEtiquetasOrden): boolean {
  if (alcance.alcance === "todas") return true;
  return row.tiendaId === alcance.ownerId;
}

export class EtiquetaGuiaService implements IEtiquetaGuiaService {
  constructor(private readonly repo: IOrdenRepository) {}

  async generarEtiquetas(
    input: GenerarEtiquetasInput,
    actor: Actor,
  ): Promise<GenerarEtiquetasServiceResult> {
    // Autorizacion: la etiqueta es un READ derivado (feature 32) sin `forbidden` por rol; la
    // sesion ya se exige en el borde (Server Action -> `unauthenticated`). Lo que SI se acota es
    // el DUEÑO: `adminTienda` (SLT-49) y `apiKey` (feature 136) solo leen las etiquetas de su
    // tienda; el resto segun `resolverAlcanceEtiquetasOrden` (R14). La orden ajena se reporta
    // como `no_encontrada`, igual que una inexistente, y no aborta el lote (R7).
    const alcance = resolverAlcanceEtiquetasOrden(actor);
    const ordenIds = distinct(input.ordenIds);
    if (ordenIds.length === 0) return { status: "ok", etiquetas: [], omitidas: [] };

    // R1/R3: filas ya sin borradas (el repo filtra deletedAt: null). SLT-49/R10: con alcance
    // `propias`, el dueño va en el `where`: la fila de otra tienda ni se lee.
    const rows = await this.repo.findEtiquetasByIds(ordenIds, tiendaIdDelAlcance(alcance));
    const rowById = new Map<string, EtiquetaRow>(rows.map((r) => [r.id, r]));

    const etiquetas: EtiquetaGuiaDTO[] = [];
    const omitidas: EtiquetaOmitidaDTO[] = [];

    // Se recorre la SELECCION solicitada (no las filas) para reportar tambien las
    // que no vinieron de la query. Una orden invalida NO aborta el lote (R3).
    for (const ordenId of ordenIds) {
      const row = rowById.get(ordenId);
      if (!row || !esVisiblePara(row, alcance)) {
        // No existe, esta borrada (el repo la excluyo por deletedAt) o es de otra
        // tienda y el actor solo ve lo suyo (apiKey 136, adminTienda SLT-49; el repo
        // ya la excluyo y la segunda capa lo repite). En todos los casos se reporta
        // igual: `no_encontrada` NO revela la existencia de la orden ajena.
        omitidas.push({ ordenId, motivo: "no_encontrada" });
        continue;
      }
      if (row.numGuia === null) {
        // Existe pero aun sin guia asignada: no tiene QR/etiqueta disponible (R2).
        omitidas.push({ ordenId, motivo: "sin_guia" });
        continue;
      }
      etiquetas.push(this.toEtiquetaDTO(row, row.numGuia));
    }

    return { status: "ok", etiquetas, omitidas };
  }

  async obtenerEtiquetaPorGuia(
    numGuia: number,
    actor: Actor,
  ): Promise<EtiquetaPorGuiaServiceResult> {
    // Misma autorizacion que `generarEtiquetas`: sin `forbidden` por rol, con el dueño
    // acotado por `resolverAlcanceEtiquetasOrden`. SLT-49/R9: la guia de otra tienda
    // para un `adminTienda` sale `no_encontrada` (la pagina `/paquete` la mapea a 404).
    const alcance = resolverAlcanceEtiquetasOrden(actor);
    // Ya filtra borradas (R3) y, con alcance `propias`, el dueño en el `where` (R10).
    const row = await this.repo.findEtiquetaByNumGuia(numGuia, tiendaIdDelAlcance(alcance));
    if (!row || row.numGuia === null || !esVisiblePara(row, alcance)) {
      return { status: "no_encontrada" };
    }
    return { status: "ok", etiqueta: this.toEtiquetaDTO(row, row.numGuia) };
  }

  // R1/R4/R5/R6/R7/R8: arma el DTO de una orden con guia. `numGuia` se recibe ya
  // estrechado a `number` (el llamador descarto el caso null, R2). montoCobrar es
  // number|null sin moneda (R5); distritoNombre null si no hay (R4); qrValue =
  // String(numGuia) (R7, la UI construye la URL del paquete `/paquete/<numGuia>`);
  // barcodeValue = String(numGuia) (R8): QR y barcode codifican el MISMO valor.
  // No expone deletedAt (R6): la fila ni siquiera lo trae.
  private toEtiquetaDTO(row: EtiquetaRow, numGuia: number): EtiquetaGuiaDTO {
    return {
      ordenId: row.id,
      numGuia,
      numRemision: row.numRemision,
      destinatario: row.destinatario,
      telefonoDest: row.telefonoDest,
      direccion: row.direccion,
      producto: row.producto,
      montoCobrar: row.montoCobrar,
      tiendaNombre: row.tiendaNombre,
      zonaNombre: row.zonaNombre,
      provinciaNombre: row.provinciaNombre,
      cantonNombre: row.cantonNombre,
      distritoNombre: row.distritoNombre,
      // Feature 295: la fecha viaja TAL CUAL desde la fila (ya es `YYYY-MM-DD` de
      // Costa Rica). El service no la formatea ni la recalcula: derivar el dia dos
      // veces, en dos capas, es como se acaban imprimiendo dos dias distintos.
      fechaCreacion: row.fechaCreacion,
      qrValue: String(numGuia), // R7: QR codifica num_guia (UNIQUE en orden)
      barcodeValue: String(numGuia), // R8: barcode codifica num_guia
    };
  }
}
