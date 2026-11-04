import type { Prisma, PrismaClient } from "@prisma/client";
import type { TarifaVigente } from "@/lib/interfaces/repositories/ITarifaVigenteRepository";
import { esConceptoTienda } from "@/lib/tarifas/catalogo";
import type { ValoresTienda } from "@/lib/types/tarifa-flexible";

/**
 * Feature 69 (design §4.1/§4.2) — lectura COMPARTIDA del snapshot `cierre_detail` por los dos
 * feeds de wallet (42 caja principal y 43 ledger por tienda).
 *
 * Vive aqui, y no duplicado en cada feed, porque los dos derivan de EXACTAMENTE las mismas
 * entradas congeladas: si un dia divergieran, la caja y el ledger de la tienda liquidarian
 * distinto el mismo cierre y el descuadre seria invisible.
 *
 * Es solo lectura + proyeccion: la FORMULA sigue viviendo en `ingreso-empresa.ts` (R21, sin
 * cambios). Aqui no se calcula dinero, se recuerda.
 */

// Cliente de tx que necesitan los feeds tras la 69: el snapshot + las gestiones (que aportan
// el `resultado`/`montoRecibido`, que son de la GESTION, no de la orden). `orden`, `zona` y
// `tarifas` YA NO se consultan al aprobar (R12/R13): ese era el bug.
export type CierreDetalleTxClient = Pick<PrismaClient, "cierreDetail" | "gestionOrden">;

/**
 * SLT-52 (R40, R41) — el cobro a la tienda congelado por concepto (`cierre_detail_concepto`), lo
 * que `tarifaDe` lee cuando el detalle es del modelo nuevo. Va como relacion anidada del detalle:
 * la RLS de la tabla hija la acota a la empresa igual que al padre.
 */
export const CONCEPTO_CONGELADO_SELECT = {
  concepto: true,
  modo: true,
  valor: true,
  ivaPct: true,
  nivel: true,
  tarifaValorId: true,
} as const;

export type ConceptoCongeladoRow = Prisma.CierreDetailConceptoGetPayload<{
  select: typeof CONCEPTO_CONGELADO_SELECT;
}>;

/**
 * SLT-52 (design §7) — lo que `tarifaDe` reconstruye: el sobre del resolver con la tarifa vieja
 * reducida a la `TarifaVigente` (los campos de la formula; ni `tarifaId` ni lo que no liquida) o
 * los valores del nuevo tal como se congelaron. No es `TarifaTienda`: su rama vieja exige
 * `TarifaVigenteResuelta`, y esa lleva campos que el congelado no debe devolver (ficha 449).
 *
 * Es estructuralmente `ConModelo<TarifaVigente>` (`ingreso-empresa.ts`), escrito aqui y no importado:
 * este modulo entra en el arbol del panel del navegador y `ingreso-empresa` importa `Prisma` como
 * valor (`pagos-captura.guardia.test.ts`, R19). TypeScript los compara por forma.
 */
export type TarifaCongelada =
  | { modelo: "viejo"; tarifa: TarifaVigente }
  | { modelo: "nuevo"; valores: ValoresTienda };

// Proyeccion del snapshot: las entradas de la formula + la tarifa congelada.
export const DETALLE_SELECT = {
  ordenId: true,
  montoCobrar: true,
  cobraComision: true,
  esCentral: true,
  // La marca del DISTRITO congelada (2026-08-25): es lo que decide si el flete sale del pacto
  // especial o de la columna normal. Va junto a `esCentral` porque cumple el mismo papel.
  esZonaEspecial: true,
  tiendaId: true,
  tarifaId: true,
  tarifaValorFlete: true,
  tarifaValorFleteGam: true,
  tarifaValorFleteDevuelto: true,
  tarifaValorFleteDevueltoGam: true,
  tarifaComisionCod: true,
  tarifaIvaFlete: true,
  tarifaIvaComisionCod: true,
  tarifaEspecial: true,
  tarifaEspecialDevuelta: true,
  // SLT-52 (R41, R42): con que modelo se congelo y, en el nuevo, sus conceptos.
  tarifaModelo: true,
  conceptos: { select: CONCEPTO_CONGELADO_SELECT },
} as const;

export type CierreDetalleRow = Prisma.CierreDetailGetPayload<{ select: typeof DETALLE_SELECT }>;

/**
 * Las columnas de tarifa congelada, y nada mas: es todo lo que `tarifaDe` necesita. Al
 * pedir este subconjunto (y no la fila entera) la reconstruccion sirve tambien al detalle
 * del admin, que proyecta otras columnas de `cierre_detail` pero la MISMA tarifa.
 */
export type TarifaCongeladaRow = Pick<
  CierreDetalleRow,
  | "tarifaModelo"
  | "tarifaId"
  | "tarifaValorFlete"
  | "tarifaValorFleteGam"
  | "tarifaValorFleteDevuelto"
  | "tarifaValorFleteDevueltoGam"
  | "tarifaComisionCod"
  | "tarifaIvaFlete"
  | "tarifaIvaComisionCod"
  | "tarifaEspecial"
  | "tarifaEspecialDevuelta"
>;

/**
 * Feature 69/R14 — falta la fila de detalle congelado de una orden del cierre.
 *
 * Es un error DURO a proposito (decision (a)): NO hay fallback a datos vivos. El backfill de
 * la migracion (R26/R27) garantiza que todo cierre existente tiene su detalle, asi que esto
 * no deberia ocurrir; si ocurre, preferimos una aprobacion ABORTADA Y VISIBLE a un descuadre
 * silencioso en un libro append-only. Un fallback dejaria vivo para siempre el camino de
 * lectura que esta feature vino a matar, y ningun test podria demostrar que no se toma.
 */
export class CierreDetalleFaltanteError extends Error {
  constructor(
    readonly cierreId: string,
    readonly ordenId: string,
  ) {
    super(
      `cierre_detail: falta el detalle congelado de la orden ${ordenId} en el cierre ${cierreId}. ` +
        `La aprobacion se aborta: sin snapshot no se puede liquidar sin arriesgar un descuadre (feature 69/R14).`,
    );
    this.name = "CierreDetalleFaltanteError";
  }
}

/**
 * Reconstruye la `TarifaVigente` (los 7 campos que consume la formula) desde la fila
 * congelada. `null` si `tarifa_id IS NULL`: la tienda no tenia tarifa vigente al SOLICITAR
 * (gap R9, decision (c)) -> `derivarIngresoOrden` ya lo maneja devolviendo conceptos 0.00 sin
 * lanzar (`ingreso-empresa.ts:58`). El gap se PRESERVA tal cual: la 69 no lo abre ni lo cierra.
 * Money-safe: Decimal -> STRING escala 2, nunca number/parseFloat (R11).
 *
 * SLT-52 (design §7, R41, R42): sigue siendo la UNICA reconstruccion, ahora de los dos modelos.
 * - `tarifa_modelo = 'viejo'` (todo cierre anterior a SLT-52, R42): exactamente lo de antes,
 *   envuelto en `{ modelo: "viejo" }`; `conceptos` no se mira (el viejo no escribe ninguno).
 * - `'nuevo'`: los valores salen de las filas de `cierre_detail_concepto` de ESTE detalle, nunca de
 *   `tarifa_valor`: un valor o un grupo cambiado o borrado despues no mueve el cierre (R41). Nunca
 *   `null`: un concepto sin fila es «sin tarifa» y cuenta 0 (R23, R24).
 * Una fila que no trae `tarifaModelo` (proyeccion parcial) se lee como vieja: es lo que era antes.
 */
export function tarifaDe(
  d: TarifaCongeladaRow,
  conceptos: readonly ConceptoCongeladoRow[],
): TarifaCongelada | null {
  if (d.tarifaModelo === "nuevo") return { modelo: "nuevo", valores: valoresCongeladosDe(conceptos) };
  const tarifa = tarifaViejaDe(d);
  return tarifa === null ? null : { modelo: "viejo", tarifa };
}

/**
 * Las filas congeladas -> `ValoresTienda`, con la misma forma que da el resolver (texto escala 2).
 * `tarifaValorId` puede ser `null`: la FK es SET NULL y el valor de origen pudo borrarse despues
 * (R41); el importe no depende de el. El CHECK de la tabla ya impide un concepto que no sea de la
 * tienda; si llegara uno, se para en vez de cobrarlo a quien no toca.
 */
function valoresCongeladosDe(conceptos: readonly ConceptoCongeladoRow[]): ValoresTienda {
  const valores: ValoresTienda = {};
  for (const c of conceptos) {
    if (!esConceptoTienda(c.concepto)) {
      throw new Error(`cierre_detail_concepto: ${c.concepto} no es un cobro a la tienda`);
    }
    valores[c.concepto] = {
      concepto: c.concepto,
      modo: c.modo,
      valor: c.valor.toFixed(2),
      ivaPct: c.ivaPct.toFixed(2),
      nivel: c.nivel,
      tarifaValorId: c.tarifaValorId,
    };
  }
  return valores;
}

/** La rama vieja de `tarifaDe`, sin cambios desde la 69. */
function tarifaViejaDe(d: TarifaCongeladaRow): TarifaVigente | null {
  if (d.tarifaId === null) return null;
  // Las 8 columnas de tarifa se congelan todas o ninguna (R8), asi que con `tarifa_id`
  // presente el resto no puede ser null. El `"0.00"` de `dec2` no es una politica: es el
  // estrechamiento del tipo (Decimal | null) sin introducir un fallback silencioso.
  // `toFixed(2)`, no `toString()`: R11 pide escala 2 FIJA al cruzar la frontera y el resolver
  // de al lado (`TarifaVigenteRepository`) ya la emite asi. Con `toString()` un
  // Decimal("1000.00") salia "1000": mismo valor, distinto texto que el resolver para la misma
  // tarifa. No movia dinero (`derivarIngresoOrden` re-envuelve en Prisma.Decimal), pero dos
  // procedencias del MISMO dato con formato distinto es exactamente lo que esta feature existe
  // para eliminar.
  const dec2 = (v: Prisma.Decimal | null): string => (v === null ? "0.00" : v.toFixed(2));
  return {
    valorFlete: dec2(d.tarifaValorFlete),
    valorFleteGam: dec2(d.tarifaValorFleteGam),
    valorFleteDevuelto: dec2(d.tarifaValorFleteDevuelto),
    valorFleteDevueltoGam: dec2(d.tarifaValorFleteDevueltoGam),
    comisionCod: dec2(d.tarifaComisionCod),
    ivaFlete: dec2(d.tarifaIvaFlete),
    ivaComisionCod: dec2(d.tarifaIvaComisionCod),
    // EXCEPCION al "todas o ninguna" de arriba, y por eso NO pasan por `dec2`: estas dos son
    // nullables EN ORIGEN (`tarifas.tarifa_especial[_devuelta]`), asi que su `null` no es el
    // gap de la tarifa ausente sino el dato real "no se pacto nada". Mapearlas a "0.00" seria
    // inventar un pacto de cero colones y cobrarlo.
    // `== null` y no `=== null`: una fila que no proyecte la columna llega como `undefined`,
    // y eso significa lo mismo que `null` —no hay pacto—; ninguno de los dos puede reventar
    // en un camino de dinero.
    tarifaEspecial: d.tarifaEspecial == null ? null : d.tarifaEspecial.toFixed(2),
    tarifaEspecialDevuelta:
      d.tarifaEspecialDevuelta == null ? null : d.tarifaEspecialDevuelta.toFixed(2),
  };
}

/**
 * Lee el snapshot del cierre indexado por `ordenId`. Los feeds lo cruzan en memoria con las
 * gestiones: el GRANO se respeta — `cierre_detail` aporta lo de la ORDEN y `gestion_orden` el
 * `resultado` (que es de la GESTION). Una orden con 2 gestiones vigentes en el cierre aporta
 * 2 entradas que COMPARTEN la misma fila congelada; eso es justo lo que hace correcto el
 * grano ORDEN (design §4.1).
 */
export async function leerDetallePorOrden(
  cierreId: string,
  tx: CierreDetalleTxClient,
): Promise<Map<string, CierreDetalleRow>> {
  const filas = await tx.cierreDetail.findMany({
    where: { cierreId },
    select: DETALLE_SELECT,
  });
  return new Map(filas.map((d) => [d.ordenId, d]));
}

/** R14: la fila del detalle de esa orden, o error duro (sin fallback a datos vivos). */
export function detalleDe(
  byOrden: Map<string, CierreDetalleRow>,
  cierreId: string,
  ordenId: string,
): CierreDetalleRow {
  const d = byOrden.get(ordenId);
  if (d === undefined) throw new CierreDetalleFaltanteError(cierreId, ordenId);
  return d;
}
