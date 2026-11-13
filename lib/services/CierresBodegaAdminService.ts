import { esAccesoTotal } from "@/lib/auth/acceso-total";
import type { FiltrosCierresBodega } from "@/lib/types/filtros-cierres";
import { cierreConfig } from "@/lib/config/cierre";
import { descargaConfig } from "@/lib/config/descarga";
import type { ISignedUrlProvider } from "@/lib/interfaces/external/ISignedUrlProvider";
import type { CierreBodegaResumenRow } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type {
  AlcanceLecturaBodega,
  ICierresBodegaAdminRepository,
} from "@/lib/interfaces/repositories/ICierresBodegaAdminRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import { filtrosParaRepo, zonaDeLaEmpresa, zonaPerezosa } from "@/lib/services/zona-de-la-empresa";
import { filtrosConLimites, type RangoDeFechasCierres } from "@/lib/types/filtros-cierres";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { CierreGrupos } from "@/lib/interfaces/services/ICierreDiaService";
import type {
  CierreBodegaDetalleCierre,
  CierreBodegaResumen,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type {
  AprobarCierreBodegaServiceResult,
  CierreBodegaDetalleServiceResult,
  ICierresBodegaAdminService,
  ListarCierresBodegaAdminServiceResult,
  ListarHistoricoCierresBodegaCompletoServiceResult,
  ListarHistoricoCierresBodegaServiceResult,
  ListarPendientesCierresBodegaCompletoServiceResult,
  ListarPendientesCierresBodegaServiceResult,
  RechazarCierreBodegaServiceResult,
} from "@/lib/interfaces/services/ICierresBodegaAdminService";
// Feature 230 (T7.2, R26): el union de la hoja fundida es UNO para los dos bordes.
import type { ListarGestionesDescargaServiceResult } from "@/lib/interfaces/services/ICierresAdminService";
import type { FiltrosDescargaGestiones } from "@/lib/types/filtros-cierres";
import { esColaSolicitado } from "@/lib/utils/colas-cierre";
import { rangoDePagina } from "@/lib/utils/rango-pagina";
import { rutasAFirmar } from "@/lib/utils/evidencias-gestion";
import { toDetalleDTO } from "@/lib/services/CierreDiaService";
// SLT-107 (R283, D-H110): la MISMA anulacion del fulfillment que el detalle de mensajeros.
import { ocultarFulfillmentSiNoCentral } from "@/lib/services/CierresAdminService";
import {
  cobradoSobreRecaudado,
  efectivoCubreDescuentos,
  ganaLaTienda,
  gananciaEmpresa,
  netoEmpresa,
  pagoTiendaEmpresa,
  paraLaCentral,
  partesPorTienda,
  totalesIngresoEmpresa,
} from "@/lib/utils/ingreso-empresa";
import { porcentajesReparto } from "@/lib/utils/porcentajes-reparto";
import { cifrasAgregadasBodega } from "@/lib/utils/cifras-cierre-bodega";
import type { ICifrasBodegaLoteLectura } from "@/lib/interfaces/repositories/ICifrasBodegaLoteLectura";
import {
  cierresBodegaModeloNuevo,
  cifrasBodegaDescarga,
  LecturaCifrasBodegaAusenteError,
  pagoEntregadoPorBodega,
  type LecturasPagoEntregadoBodega,
} from "@/lib/services/cifras-bodega-descarga";
import { facturadoSinIva, ivaFacturado } from "@/lib/utils/iva-cierre";

// Roles autorizados (R2): acceso total (maestro/admin, bodega central). El alcance es
// "todos los cierres de bodega" (van a la central), sin filtro de zona.

// Mensaje accionable cuando falta el motivo de rechazo (R17).
const MSG_MOTIVO_REQUERIDO = "El motivo de rechazo es obligatorio.";

/**
 * Feature 40 — logica de negocio de "Cierres de bodega" del maestro (aprobar /
 * rechazar). Espejo de CierresAdminService (38), aplicado a CierreBodega. Lista la cola
 * + historico, muestra el detalle agregado con evidencias firmadas (R12) y transiciona
 * `solicitado` -> aprobado/rechazado con guardia de estado (R18). No conoce HTTP ni
 * Prisma; testeable con dobles. Totales = snapshot, nunca recomputa (R13).
 */
export class CierresBodegaAdminService implements ICierresBodegaAdminService {
  constructor(
    private readonly repo: ICierresBodegaAdminRepository,
    private readonly signedUrls: ISignedUrlProvider,
    /**
     * SLT-42 (R22): la zona del pais de la empresa: los limites de los filtros de fecha y el dia de
     * cada gestion en los DTO.
     */
    private readonly reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
    /**
     * SLT-107 (R280): la zona del `adminSatelite`, leida de SU usuario en la base (la misma fuente
     * que `CierreBodegaService` y `CierresAdminService.resolveAlcance`). Ausente = la satelite no
     * tiene alcance: falla cerrado (`forbidden`).
     */
    private readonly zonaDelUsuario?: Pick<IOrdenRepository, "findUsuarioZonaId">,
    /**
     * SLT-141 (R389): la lectura en lote de los cierres del dia de los cierres de bodega NUEVOS de una
     * descarga. Opcional para no tocar los dobles de hoy; con un cierre nuevo y sin ella, lanza.
     */
    private readonly cifrasLote?: ICifrasBodegaLoteLectura,
    /**
     * SLT-141 (R388, PA1): las tres lecturas de lo pagado al mensajero, para «Pago entregado» (solo la
     * central). Opcional por el mismo motivo y ruidosa por el mismo motivo.
     */
    private readonly pagosEntregados?: LecturasPagoEntregadoBodega,
  ) {}

  /**
   * SLT-141 «Excel del modelo nuevo: hojas por cierre de bodega» (R384-R389) — la rama `ok` de los dos
   * `listar…Completo`: las filas de hoy y, SOLO si algun cierre de bodega del conjunto es del modelo
   * nuevo (`incluyeModeloNuevo`, D40), `cifrasModeloNuevo` (uno por cierre nuevo, en el orden de
   * `items`). Sin ninguno: ni la clave ni una lectura mas (R384). Con alguno: UNA lectura en lote con
   * el alcance de la central y las tres de pago, una vez cada una (R389).
   */
  private async completoConCifras(
    items: CierreBodegaResumen[],
    operacion: string,
  ): Promise<ListarHistoricoCierresBodegaCompletoServiceResult> {
    const total = items.length;
    const nuevos = cierresBodegaModeloNuevo(items);
    if (nuevos.length === 0) return { status: "ok", items, total }; // R384: cero lecturas mas
    if (this.cifrasLote === undefined || this.pagosEntregados === undefined) {
      throw new LecturaCifrasBodegaAusenteError(operacion);
    }
    const ids = nuevos.map((c) => c.cierreBodegaId);
    const filas = await this.cifrasLote.leerCierresDiaDeBodegas(
      ids,
      { lectura: "toda_la_empresa" },
      await zonaDeLaEmpresa(this.reglasPais, operacion),
    );
    const entregado = await pagoEntregadoPorBodega(ids, filas, this.pagosEntregados, operacion);
    return {
      status: "ok",
      items,
      total,
      cifrasModeloNuevo: cifrasBodegaDescarga(nuevos, filas).map((c) => ({
        ...c,
        pagoEntregado: entregado.get(c.cierreBodegaId) ?? null, // PA1: solo la central
      })),
    };
  }

  /**
   * SLT-107 (R280-R282): con que alcance lee `actor` el detalle de un cierre de bodega. `null` =
   * `forbidden` sin leer nada: ni acceso total ni `adminSatelite` (R282), o satelite sin zona (R281).
   */
  private async alcanceDeLecturaBodega(actor: Actor): Promise<AlcanceLecturaBodega | null> {
    if (esAccesoTotal(actor.rol)) return { lectura: "toda_la_empresa" };
    if (actor.rol !== "adminSatelite") return null; // R282
    const zonaId = (await this.zonaDelUsuario?.findUsuarioZonaId(actor.usuarioId)) ?? null;
    return zonaId === null ? null : { lectura: "zona", zonaId }; // R281: sin zona
  }

  /**
   * SLT-42 (R22, R23): los filtros con `desde`/`hasta` resueltos en la zona del pais de la empresa.
   * La zona solo se lee si el filtro trae rango.
   */
  private filtrosRepo<F extends RangoDeFechasCierres>(filtros: F | undefined) {
    return filtrosParaRepo(filtros, zonaPerezosa(this.reglasPais, "CierresBodegaAdminService"));
  }

  async listarCierresBodegaAdmin(
    actor: Actor,
  ): Promise<ListarCierresBodegaAdminServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R2

    // R23: SOLO lectura. R15: partir por estado (solicitado vs resuelto).
    const rows = await this.repo.findCierresBodega();
    const pendientes: CierreBodegaResumen[] = [];
    const historico: CierreBodegaResumen[] = [];
    for (const row of rows) {
      const resumen = toResumen(row); // R13: totales snapshot (string) sin recomputar
      // Feature 170 (T I.1): el corte sale de `ESTADOS_COLA_SOLICITADO`, el MISMO que el
      // repositorio escribe como WHERE al paginar el historico (R44).
      if (esColaSolicitado(row.estado)) pendientes.push(resumen);
      else historico.push(resumen);
    }
    return { status: "ok", pendientes, historico };
  }

  /**
   * Feature 170 — FASE 2 (T I.1, R40/R41/R44/R51/R54) — el HISTORICO, paginado en servidor.
   *
   * El guard de rol va PRIMERO, antes de tocar el repositorio: con el guard despues, las
   * cabeceras de todos los cierres de bodega —dinero agregado de toda la operacion— ya
   * habrian salido de la base aunque la respuesta fuera un error.
   *
   * UNA sola llamada al repositorio, igual que el listado sin paginar (R54): el conteo que
   * R41 exige viaja dentro de ella.
   */
  async listarHistoricoCierresBodegaPaginado(
    input: { page: number; pageSize: number; filtros?: FiltrosCierresBodega },
    actor: Actor,
  ): Promise<ListarHistoricoCierresBodegaServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R2

    // Pedido humano del 2026-08-16: el filtro RECORTA dentro del alcance del rol, no lo
    // sustituye — se compone con `AND` en el repositorio.
    const { items, total } = await this.repo.findHistoricoPaginado(
      rangoDePagina(input),
      await this.filtrosRepo(input.filtros),
    );

    return {
      status: "ok",
      items: items.map(toResumen), // R13: mismo mapper que el listado sin paginar
      page: input.page,
      pageSize: input.pageSize,
      total, // R41: el total del CONJUNTO, nunca `items.length`
    };
  }

  /**
   * Feature 170 — FASE 2 (T J.1, R40/R41/R44/R49/R51/R54) — la COLA de cierres de bodega
   * PENDIENTES, paginada en servidor.
   *
   * El guard de rol va PRIMERO, antes de tocar el repositorio, por el mismo motivo que en el
   * historico: la cabecera de un cierre de bodega ES dinero agregado de una zona entera, y con
   * el guard despues ya habria salido de la base aunque la respuesta fuera un error.
   *
   * R49: no se agrega nada aqui. Los montos de esta pantalla son el SNAPSHOT de cada cierre de
   * bodega (`toResumen` no recomputa) y la pantalla no deriva totales del array; el `total` que
   * viaja es el CONTADOR de cabecera (R42), un conteo de filas.
   */
  async listarPendientesCierresBodegaPaginado(
    input: { page: number; pageSize: number; filtros?: FiltrosCierresBodega },
    actor: Actor,
  ): Promise<ListarPendientesCierresBodegaServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R2

    const { items, total } = await this.repo.findColaPaginada(rangoDePagina(input), await this.filtrosRepo(input.filtros));

    return {
      status: "ok",
      items: items.map(toResumen), // R13: mismo mapper que el listado sin paginar
      page: input.page,
      pageSize: input.pageSize,
      total, // R41/R42: el total del CONJUNTO de la cola, nunca `items.length`
    };
  }

  /**
   * Feature 184 — Tanda E (T E.2, R1/R4/R6) — el HISTORICO ENTERO de cierres de bodega, sin
   * recorte, que es del que sale el archivo de «Cierres de bodega resueltos» (listado 5).
   *
   * **Lo que cierra.** Hasta hoy ese archivo se producia releyendo `listarCierresBodegaAdmin()`,
   * que trae TODOS los cierres de bodega —cola e historico— y los parte en memoria para que la
   * pantalla se quede con una de las dos mitades. Aqui se lee SOLO el historico, cortado en la
   * base por el mismo criterio que su pagina (R16). Las filas salen identicas; lo que cambia es
   * cuantas se leen para producirlas, y de eso hablan los dos `*-where.test.ts` y el contador de
   * filas leidas del test de servicio.
   *
   * **El guard va PRIMERO, antes de tocar el repositorio**, por el mismo motivo que en la
   * pagina: la cabecera de un cierre de bodega ES dinero agregado de una zona entera, y con el
   * guard despues ya habria salido de la base aunque la respuesta fuera un error.
   *
   * **No lleva `input`, y es deliberado.** Este listado no admite filtros: su schema de pagina
   * solo tenia `page`/`pageSize`, y quitarlos deja una lista blanca de CERO claves. El borde la
   * sigue aplicando entera —parsear ES la barrera (R17)— pero no hay nada que transportar hasta
   * aqui. Y tampoco hay zona que resolver: este listado es de acceso total y ve la operacion
   * completa; el alcance es el ROL, y sale del actor.
   *
   * **Mismo mapper que la pagina** (`toResumen`, R13): los totales son SNAPSHOT y ni el conjunto
   * ni la pagina recomputan nada. A diferencia de la tanda D, aqui no hay ningun enriquecido que
   * conservar o saltarse: el camino del archivo no firma URL, no agrega dinero y no consulta
   * ninguna otra tabla.
   *
   * **Excepcion declarada a R29 de la 170.** De R29 —feature `done`, requisito vivo— se cumple
   * la mitad del transporte: por encima del tope no sale ni una fila, solo los dos conteos del
   * aviso. NO se cumple la de materializar: `findHistoricoCompleto` es un `findMany` sin `take`
   * y el historico llega entero antes de que el tope lo mire. Y aqui el alcance es la operacion
   * COMPLETA —este listado no acota por zona, ve todas—, asi que el conjunto suma los cierres de
   * bodega resueltos de todas las zonas desde el primer dia: crece despacio, pero crece siempre
   * y nada lo corta.
   *
   * Se acepta porque cerrarlo exige pedir `limite + 1` y un `count` aparte para no perder el
   * total exacto del aviso (R6) —la segunda consulta que R15 de esta feature mide y prohibe—, y
   * eso duplicaria las consultas que esta misma migracion vino a reducir. Decision humana del
   * 2026-08-05, en el design §3.1. No es una forma de cumplir R29: es una excepcion con motivo.
   */
  async listarHistoricoCierresBodegaCompleto(
    actor: Actor,
    filtros?: FiltrosCierresBodega,
  ): Promise<ListarHistoricoCierresBodegaCompletoServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R4: antes del repo

    // Los MISMOS filtros que la pagina: el archivo es «esto que estoy viendo, entero».
    const conjunto = await this.repo.findHistoricoCompleto(await this.filtrosRepo(filtros));

    const limite = descargaConfig.MAX_FILAS;
    // R6: o van TODAS las filas del conjunto, o van solo los conteos. Nunca un archivo truncado.
    if (conjunto.length > limite) {
      return { status: "limite_excedido", total: conjunto.length, limite };
    }

    // SLT-141 (R384, R385): tras el tope, las cifras de los cierres nuevos (si los hay).
    return this.completoConCifras(
      conjunto.map(toResumen),
      "CierresBodegaAdminService.listarHistoricoCierresBodegaCompleto",
    );
  }

  /**
   * Feature 184 — Tanda E (T E.2, R1/R4/R6) — la COLA ENTERA de cierres de bodega pendientes,
   * sin recorte, para el archivo de «Cierres de bodega pendientes» (listado 4).
   *
   * Comparte con el de arriba la relectura que evita, y aqui se nota mas: la cola es la mitad
   * PEQUEÑA de la tabla (los cierres sin resolver), asi que producir su archivo arrastraba todo
   * el historico de la operacion —que crece sin tope con los dias— para descartarlo en memoria.
   *
   * Sin `input` y sin zona por el mismo motivo que su hermano: cero filtros, cero claves en la
   * lista blanca, alcance por ROL desde el actor.
   *
   * **Excepcion declarada a R29 de la 170, la mas benigna de las dos de este archivo.** Igual
   * que arriba: transporte cumplido, materializacion no —`findColaCompleta` tampoco lleva cota,
   * y la cola entra entera antes de medirse—. La diferencia es el conjunto: estos son los
   * cierres de bodega POR CONCILIAR (SLT-105: sin marca, mas los recibidos incompletos), y su
   * tamaño lo marca el retraso del maestro en conciliar y lo que sigue faltando por recibir, no
   * los dias operados; el historico de arriba se queda con todo lo que esta cola va soltando.
   * Misma decision del 2026-08-05 y mismo motivo de coste: acotar en base pide el `count` extra
   * que R15 de esta feature prohibe (design §3.1).
   */
  async listarPendientesCierresBodegaCompleto(
    actor: Actor,
    filtros?: FiltrosCierresBodega,
  ): Promise<ListarPendientesCierresBodegaCompletoServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R4: antes del repo

    const conjunto = await this.repo.findColaCompleta(await this.filtrosRepo(filtros)); // idem

    const limite = descargaConfig.MAX_FILAS;
    if (conjunto.length > limite) {
      return { status: "limite_excedido", total: conjunto.length, limite }; // R6
    }

    // SLT-141 (R384, R385): tras el tope, las cifras de los cierres nuevos (si los hay).
    return this.completoConCifras(
      conjunto.map(toResumen),
      "CierresBodegaAdminService.listarPendientesCierresBodegaCompleto",
    );
  }

  /**
   * Feature 230 — Tanda 7 (T7.2, R13/R21/R22/R24/R25/R26) — las GESTIONES de los cierres del dia
   * ya consolidados en un cierre de bodega, de las que sale la HOJA FUNDIDA de esta pantalla.
   *
   * Espejo exacto de `listarGestionesCierresAdminCompleto` con el acotamiento que corresponde a
   * ESTE listado: aqui no hay zona que resolver —es de acceso total—, asi que todo el
   * acotamiento por rol es `esAccesoTotal`, evaluado ANTES de tocar el repositorio (R25). No se
   * reimplementa ningun criterio: se reusa el guard que ya gobierna los cuatro listados de esta
   * pantalla (R16).
   *
   * `filtros` son RECORTES, nunca alcance (R15). Y **ni una llamada a `this.signedUrls`** (R22):
   * la hoja fundida no lleva columna de evidencia en absoluto.
   *
   * Los cierres que este camino devuelve son, por construccion, los de las bodegas SATELITE: un
   * cierre con destino `bodega_central` nunca se consolida en un cierre de bodega. La GAM sale
   * por el OTRO boton, sin un solo `if` que la nombre (R27).
   */
  async listarGestionesCierresBodegaCompleto(
    actor: Actor,
    filtros: FiltrosDescargaGestiones,
  ): Promise<ListarGestionesDescargaServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R25: antes del repo

    // SLT-42 (R22): la zona resuelve los limites del filtro y fecha cada gestion del archivo.
    const zona = await zonaDeLaEmpresa(
      this.reglasPais,
      "CierresBodegaAdminService.listarGestionesCierresBodegaCompleto",
    );
    // SLT-113: los MISMOS recortes para las gestiones y para los rechazos (un solo objeto).
    const filtrosRepo = filtrosConLimites(filtros, zona);
    const conjunto = await this.repo.findGestionesDeCierresBodegaCompleto(filtrosRepo, zona);

    const limite = descargaConfig.MAX_FILAS;
    // R21: o van TODAS las filas del conjunto, o van solo los conteos. Nunca un archivo truncado.
    if (conjunto.length > limite) {
      return { status: "limite_excedido", total: conjunto.length, limite };
    }

    // SLT-113 (R372): la hoja de rechazos solo si algun cierre del conjunto es del modelo nuevo; sin
    // ninguno, ni consulta ni clave. La bodega es solo de acceso total: el fulfillment va entero.
    if (!conjunto.some((fila) => fila.cierreModelo === "nuevo")) {
      return { status: "ok", items: conjunto, total: conjunto.length };
    }
    const rechazosDeTienda = await this.repo.findRechazosTiendaDeCierresBodegaModeloNuevoCompleto(
      filtrosRepo,
      zona,
    );
    return { status: "ok", items: conjunto, total: conjunto.length, rechazosDeTienda };
  }

  async verCierreBodegaDetalle(
    cierreBodegaId: string,
    actor: Actor,
  ): Promise<CierreBodegaDetalleServiceResult> {
    // R2 + SLT-107 (R280-R282): acceso total lee toda la empresa; la satelite, solo su zona.
    const alcance = await this.alcanceDeLecturaBodega(actor);
    if (alcance === null) return { status: "forbidden" };

    // SLT-42 (R22): la zona fecha las gestiones del detalle.
    const found = await this.repo.findCierreBodegaConDetalle(
      cierreBodegaId,
      await zonaDeLaEmpresa(this.reglasPais, "CierresBodegaAdminService.verCierreBodegaDetalle"),
      alcance,
    );
    // R19: para acceso total, «no existe» sigue siendo `no_encontrada`. SLT-107 (R281): con
    // alcance de zona, «no es de tu zona» y «no existe» no se distinguen: `forbidden`, sin firmar
    // ninguna evidencia.
    if (found === null) {
      return alcance.lectura === "zona" ? { status: "forbidden" } : { status: "no_encontrada" };
    }

    // R12: firma en LOTE las evidencias de TODAS las gestiones de todos los cierre_dia
    // (path crudo -> URL firmada de TTL acotado). Nunca se expone el storage_path.
    // Feature 486 (R2/R8): TODAS las fotos de todas las gestiones de todos los cierres_dia.
    const paths = found.cierresDia.flatMap((cd) => rutasAFirmar(cd.gestiones));
    const urlByPath =
      paths.length > 0
        ? await this.signedUrls.createSignedUrls(paths, cierreConfig.SIGNED_URL_TTL_SECONDS)
        : {};

    // R11: por cada cierre_dia, agrupa sus gestiones por resultado (5 claves siempre desde la
    // feature 158) con el mapper reuso 37. Totales = snapshot del cierre_dia (R13).
    const cierres: CierreBodegaDetalleCierre[] = found.cierresDia.map((cd) => {
      const grupos: CierreGrupos = {
        entregado: [],
        reprogramado: [],
        novedad: [],
        devolucion_a_origen_por_rechazo: [],
        incidente: [], // feature 158/R18
      };
      for (const g of cd.gestiones) {
        // SLT-107 (R283, D-H110): el fulfillment (con `fulfillmentCargadoAt`) es dato de la
        // central; quien no es acceso total lo recibe anulado, con la MISMA funcion que el detalle
        // de mensajeros. Para acceso total devuelve la fila tal cual.
        grupos[g.resultado].push(ocultarFulfillmentSiNoCentral(toDetalleDTO(g, urlByPath), actor));
      }
      const totalesIngreso = totalesIngresoEmpresa(cd.gestiones);
      // SL-39 (R21–R23): ganancia y neto de ESTE dia restan desde lo facturado SIN IVA.
      const sinIva = facturadoSinIva(totalesIngreso);
      return {
        cierreDiaId: cd.resumen.cierreDiaId,
        mensajeroId: cd.resumen.mensajeroId,
        mensajeroNombre: cd.resumen.mensajeroNombre,
        totales: cd.resumen.totales,
        totalPagoMensajero: cd.resumen.totalPagoMensajero, // R20: snapshot por cierre_dia, sin recomputar
        totalIngresoBodegaRechazos: cd.resumen.totalIngresoBodegaRechazos, // feature 56/R19: snapshot por cierre_dia, sin recomputar
        gestionesAjustadas: cd.resumen.gestionesAjustadas, // SLT-56 (R20): marca «Con ajustes»
        solicitadoAt: cd.resumen.solicitadoAt, // SLT-104 (PA3, R120): el de ESTE cierre_dia
        grupos,
        // Totales por concepto de ESTE cierre_dia, sumados desde el desglose por orden.
        totalesIngreso,
        // SL-39 (R21): el IVA de lo facturado de ESTE dia, en su propia linea.
        ivaFacturado: ivaFacturado(totalesIngreso),
        // Ganancia del dia de ESE mensajero: su ingreso sin IVA menos SU pago (snapshot).
        ganancia: gananciaEmpresa(sinIva, cd.resumen.totalPagoMensajero),
        // Pago a la tienda de ESTE cierre_dia: lo que recibio menos lo que se le facturo.
        pagoTienda: pagoTiendaEmpresa(
          cd.resumen.totales.general,
          totalesIngreso.fleteConIva,
          totalesIngreso.comisionConIva,
        ),
        // Feature 393 (R15): los cuatro derivados de ESTE cierre_dia salen de SUS PROPIOS
        // snapshots y de SU propio desglose. Ninguno se deriva de un agregado ni de otro
        // nivel: si el dia usara el pago AGREGADO, el neto del dia mentiria y la suma de los
        // dias dejaria de dar el agregado (R16).
        cobradoSobreRecaudado: cobradoSobreRecaudado(
          totalesIngreso.fleteConIva,
          totalesIngreso.comisionConIva,
        ),
        netoEmpresa: netoEmpresa(
          sinIva,
          cd.resumen.totalPagoMensajero,
          cd.resumen.totalIngresoBodegaRechazos,
        ),
        // 💰 FICHA 396 (D1) — LO QUE LA TIENDA GANA EN TOTAL con el dia de ESTE mensajero. Es la
        // ASIMETRIA que la 395 dejo abierta: puso `ganaLaTienda` solo en el detalle del cierre del
        // mensajero, asi que aqui el desglose de abajo sumaria hacia un total que no estaba en
        // ninguna pantalla. MISMA funcion que alli, sobre los datos de ESTE cierre_dia.
        //
        // NO es `pagoTienda` —dos lineas mas arriba—: aquel no resta el flete por rechazo, porque
        // ese flete nunca entro en lo recaudado y se le cobra aparte contra la wallet de la
        // tienda. La diferencia entre los dos es exactamente `fleteDevolucionConIva` de este dia.
        ganaLaTienda: ganaLaTienda(cd.resumen.totales.general, totalesIngreso.total),
        // 💰 FICHA 396 (R19) — DE QUIEN ES CADA PARTE, en el nivel del MENSAJERO.
        //
        // MISMO argumento y MISMO sitio que `totalesIngresoEmpresa(cd.gestiones)` de arriba: las
        // gestiones de ESTE cierre_dia y ninguna otra (R21). De ahi sale, sin `if` que lo diga,
        // que el umbral de presentacion de este nivel se evalue sobre las tiendas DE ESTE
        // MENSAJERO: la lista que llega aqui solo contiene las suyas. Derivarlo del agregado de la
        // bodega —o repartir el agregado entre los dias— ensenaria desglose en un mensajero que
        // solo llevo UNA tienda.
        //
        // Ni una formula de dinero nueva: `partesPorTienda` particiona por `tiendaId` congelado y
        // llama, sobre cada subconjunto, a las MISMAS funciones que produjeron los agregados de
        // esta misma vuelta del bucle.
        partesPorTienda: partesPorTienda(cd.gestiones),
        paraLaCentral: paraLaCentral(
          cd.resumen.totales.general,
          cd.resumen.totalPagoMensajero,
          cd.resumen.totalIngresoBodegaRechazos,
        ),
        efectivoCubreDescuentos: efectivoCubreDescuentos(
          cd.resumen.totales.efectivo,
          cd.resumen.totalPagoMensajero,
          cd.resumen.totalIngresoBodegaRechazos,
        ),
      };
    });

    // SLT-141 (R387): el agregado de toda la bodega sale de `cifrasAgregadasBodega`, la MISMA
    // funcion que usa el Excel: detalle y descarga no pueden divergir. Minuendos = snapshots
    // AGREGADOS del cierre de bodega (393, R13); facturado y reparto por tienda = las gestiones de
    // TODOS sus cierres del dia (396). La asimetria honesta entre las dos vias se queda a la vista.
    const resumen = toResumen(found.cierre);
    const agregado = cifrasAgregadasBodega(
      resumen,
      found.cierresDia.flatMap((cd) => cd.gestiones),
    );

    // R11/R13: cabecera con totales agregados snapshot.
    return {
      status: "ok",
      // SLT-107 (R283): solo la central puede desmarcar; para quien no es acceso total, `false`.
      cierre: esAccesoTotal(actor.rol) ? resumen : { ...resumen, desmarcable: false },
      cierres,
      totalesIngreso: agregado.totalesIngreso,
      ivaFacturado: agregado.ivaFacturado, // SL-39 (R21)
      ganancia: agregado.ganancia,
      pagoTienda: agregado.pagoTienda,
      cobradoSobreRecaudado: agregado.cobradoSobreRecaudado,
      netoEmpresa: agregado.netoEmpresa,
      // Ficha 396: la particion por tienda ya ORDENADA por el servidor (de mayor a menor pago).
      ganaLaTienda: agregado.ganaLaTienda,
      partesPorTienda: agregado.partesPorTienda,
      paraLaCentral: resumen.paraLaCentral,
      efectivoCubreDescuentos: resumen.efectivoCubreDescuentos,
      // SLT-111 (R264, R265): el reparto en % de lo recaudado AGREGADO, de los snapshots que ya
      // estan en `resumen`. Orden fijo: central, mensajeros, bodega satelite; base, el `general`.
      porcentajesReparto: porcentajesReparto(
        [resumen.paraLaCentral, resumen.totalPagoMensajero, resumen.totalIngresoBodegaRechazos],
        resumen.totales.general,
      ),
    };
  }

  async aprobarCierreBodega(
    cierreBodegaId: string,
    actor: Actor,
  ): Promise<AprobarCierreBodegaServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R2

    // R16/R18-R20: transicion guardada. Aprobar limpia motivoRechazo (null).
    // SLT-42 (R22, R28): el dia del cierre en el historial, con la zona del pais; sin zona, nada se escribe.
    const zonaHoraria = await zonaDeLaEmpresa(this.reglasPais, "CierresBodegaAdminService.aprobarCierreBodega");
    const res = await this.repo.resolverCierreBodega({
      id: cierreBodegaId,
      nuevoEstado: "aprobado",
      zonaHoraria,
      resueltoPor: actor.usuarioId, // R20
      motivoRechazo: null,
    });
    if (res === "updated") return { status: "ok", cierreBodegaId, estado: "aprobado" }; // R16
    if (res === "conflict") return { status: "conflict" }; // R18
    return { status: "no_encontrada" }; // fuera_de_alcance (R19)
  }

  async rechazarCierreBodega(
    cierreBodegaId: string,
    motivo: string,
    actor: Actor,
  ): Promise<RechazarCierreBodegaServiceResult> {
    if (!esAccesoTotal(actor.rol)) return { status: "forbidden" }; // R2

    // R17 (defensa): el borde ya valido con zod, pero el service re-exige motivo no
    // vacio antes de tocar el repo.
    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length === 0) {
      return { status: "validation_error", fieldErrors: { motivo: [MSG_MOTIVO_REQUERIDO] } };
    }

    // R17-R20: transicion guardada; persiste el motivo con el cierre.
    // SLT-42 (R22, R28): el dia del cierre en el historial, con la zona del pais; sin zona, nada se escribe.
    const zonaHoraria = await zonaDeLaEmpresa(this.reglasPais, "CierresBodegaAdminService.rechazarCierreBodega");
    const res = await this.repo.resolverCierreBodega({
      id: cierreBodegaId,
      nuevoEstado: "rechazado",
      zonaHoraria,
      resueltoPor: actor.usuarioId, // R20
      motivoRechazo: motivoLimpio,
    });
    if (res === "updated") return { status: "ok", cierreBodegaId, estado: "rechazado" }; // R17
    if (res === "conflict") return { status: "conflict" }; // R18
    return { status: "no_encontrada" }; // fuera_de_alcance (R19)
  }
}

// Row cruda -> resumen de dominio. La fila ya trae los totales como STRING (R13) y las
// marcas de tiempo en ISO; el service no recomputa nada (snapshot money-critical).
function toResumen(row: CierreBodegaResumenRow): CierreBodegaResumen {
  return {
    cierreBodegaId: row.cierreBodegaId,
    zonaId: row.zonaId,
    zonaNombre: row.zonaNombre,
    solicitadoPorId: row.solicitadoPorId,
    solicitadoPorNombre: row.solicitadoPorNombre,
    estado: row.estado,
    totales: row.totales,
    totalPagoMensajero: row.totalPagoMensajero, // R20: snapshot agregado, sin recomputar
    totalIngresoBodegaRechazos: row.totalIngresoBodegaRechazos, // feature 56/R19: snapshot agregado, sin recomputar
    cantidadCierres: row.cantidadCierres,
    solicitadoAt: row.solicitadoAt,
    resueltoAt: row.resueltoAt,
    motivoRechazo: row.motivoRechazo,
    // Feature 393 (R20/R38): los dos derivados llegan YA HECHOS del mapper del repositorio,
    // que es el mismo para las cuatro lecturas. Aqui NO se recalculan: si este mapper hiciera
    // su propia resta habria dos formulas para el mismo numero y la del adminSatelite —que
    // pasa por otro servicio— podria quedarse atras.
    paraLaCentral: row.paraLaCentral,
    efectivoCubreDescuentos: row.efectivoCubreDescuentos,
    // ⭑ FICHA 431 (R26/R28): la marca viaja TAL CUAL, por el mismo motivo que los dos de
    // arriba. `faltaPorRecibir` llega ya restado del mapper del repositorio; recomputarlo aqui
    // seria la segunda formula que un dia dice otra cosa que la de `/wallet/satelites`.
    conciliado: row.conciliado,
    desmarcable: row.desmarcable, // SLT-76 (R3/R4): derivado en el repositorio, tal cual
    montoRecibido: row.montoRecibido,
    faltaPorRecibir: row.faltaPorRecibir,
    conciliadoAt: row.conciliadoAt,
    conciliadoPorNombre: row.conciliadoPorNombre,
    conciliadoNota: row.conciliadoNota,
    incluyeModeloNuevo: row.incluyeModeloNuevo, // D40
  };
}
