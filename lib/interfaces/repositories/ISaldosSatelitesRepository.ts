import type { PaginaRepositorio, RangoPagina } from "@/lib/utils/rango-pagina";
import type {
  ConsolidacionSateliteDTO,
  ResumenSatelitesDTO,
  SaldoSateliteDTO,
} from "@/lib/types/conciliacion-satelites";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 — EL SALDO SIN CONCILIAR DE LAS BODEGAS SATELITE. SOLO LECTURAS.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// ⚠️ ESTE REPOSITORIO NO ESCRIBE NADA, Y ES DELIBERADO. Las dos escrituras de la marca viven en
// `CierresBodegaAdminRepository`, que es donde ya viven TODAS las escrituras de `cierre_bodega`.
// Un segundo escritor de la misma tabla es como aparecen dos guardas que divergen.
//
// ⚠️ EL SALDO ES DERIVADO, NO ALMACENADO (R19). No hay columna ni tabla de saldo: se calcula en
// cada lectura a partir de `cierre_bodega`. Si las diferencias resultan ser el pan de cada dia, el
// ledger propio se anade despues SIN rehacer las pantallas, porque el DTO ya distingue total,
// recibido y diferencia.
//
// ⚠️ LA FORMULA (SLT-73, R4/R5; D3 reabrio la Q2 de la 431, que la ponia sobre el efectivo):
//
//     aporte(cierre_dia)      = total_general − total_pago_mensajero − total_ingreso_bodega_rechazos
//                               (`paraLaCentral`, con su signo, nunca recortado a cero)
//     saldoSinConciliar(zona) = Σ aporte de sus `cierre_dia` aprobados con destino satelite,
//                               consolidados o no
//                             − Σ COALESCE(monto_recibido, 0) de sus `cierre_bodega` no rechazadas
//
// Por consolidacion (R8): faltaPorRecibir = paraLaCentral(snapshot) − COALESCE(monto_recibido, 0).
// Los `rechazado` no restan su recibido porque el estado esta retirado de la pantalla (D2).
//
// Money-safe: la resta se hace con `Prisma.Decimal` dentro del repositorio y sale como `.toFixed(2)`.
// Ni `Number`, ni `parseFloat`, ni aritmetica en el navegador (R20).

export interface ISaldosSatelitesRepository {
  /**
   * R17/R21/R23 — UNA PAGINA de la tabla de saldos + el total del conjunto.
   *
   * El conjunto son las bodegas SATELITE (`zona.esCentral = false`), TODAS, tengan o no
   * consolidaciones: una bodega a cero es informacion («no debe nada»), no una fila que sobra.
   */
  findSaldosPaginado(rango: RangoPagina): Promise<PaginaRepositorio<SaldoSateliteDTO>>;
  /**
   * R29 — el MISMO conjunto sin recorte, para la descarga. Mismo criterio y mismo orden que la
   * pagina por construccion: la pagina N es el segmento N de este conjunto.
   */
  findSaldosCompleto(): Promise<SaldoSateliteDTO[]>;
  /**
   * R22/R24 — UNA PAGINA de las consolidaciones de UNA bodega + el total.
   *
   * `soloSinConciliar` recorta a la cola de lo pendiente; ausente o `false` devuelve las dos
   * poblaciones. Las `rechazado` NUNCA entran (D2: el estado se retira de la pantalla).
   */
  findConsolidacionesPaginado(
    zonaId: string,
    rango: RangoPagina,
    soloSinConciliar?: boolean,
  ): Promise<PaginaRepositorio<ConsolidacionSateliteDTO>>;
  /** R29 — el mismo conjunto de la bodega sin recorte, para la descarga. */
  findConsolidacionesCompleto(
    zonaId: string,
    soloSinConciliar?: boolean,
  ): Promise<ConsolidacionSateliteDTO[]>;
  /**
   * ⭑ R20/R23 — las TRES cifras de cabecera de `/wallet/satelites`, ya cuadradas.
   *
   * Existe porque la pantalla NO PUEDE sumarlas (R20: nada de aritmetica de dinero en el
   * navegador) y las tres son sumas sobre el conjunto entero de bodegas. Es la MISMA formula
   * (`saldoDe`) aplicada a tres poblaciones distintas, no tres reglas nuevas. SLT-73 (R7): el
   * pendiente es Σ de las deudas por zona y «bodegas con pendiente», las zonas con deuda ≠ 0.
   */
  findResumen(ahora?: Date): Promise<ResumenSatelitesDTO>;
}
