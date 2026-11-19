import type { FiltrosCierresBodega } from "@/lib/types/filtros-cierres";
import type { ICierreBodegaRepository } from "@/lib/interfaces/repositories/ICierreBodegaRepository";
import type { IOrdenRepository } from "@/lib/interfaces/repositories/IOrdenRepository";
import type { ICifrasBodegaLoteLectura } from "@/lib/interfaces/repositories/ICifrasBodegaLoteLectura";
import type { IReglasPaisEmpresa } from "@/lib/interfaces/services/IReglasPaisEmpresa";
import type { Actor } from "@/lib/interfaces/services/IOrdenService";
import type { ListarCierresBodegaSolicitadosCompletoServiceResult } from "@/lib/interfaces/services/ICierreBodegaService";
import type { ICierresBodegaSateliteDescargaService } from "@/lib/interfaces/services/ICierresBodegaSateliteDescargaService";
import { descargaConfig } from "@/lib/config/descarga";
import { filtrosParaRepo, zonaDeLaEmpresa, zonaPerezosa } from "@/lib/services/zona-de-la-empresa";
import {
  cierresBodegaModeloNuevo,
  cifrasBodegaDescarga,
  CLASE_CIFRAS_BODEGA_DESCARGA,
  LecturaCifrasBodegaAusenteError,
} from "@/lib/services/cifras-bodega-descarga";
// SLT-161 (R480): el recorte de SLT-154, con el criterio de F481 en un solo sitio.
import { anularEmpresaSiNoCentral } from "@/lib/services/CierresAdminService";

// Solo el rol autorizado (R1): el adminSatelite, SIEMPRE acotado a SU zona (el filtro
// por zona vive en el repo, en el WHERE).
const ROL_AUTORIZADO = "adminSatelite";

const OPERACION = "CierresBodegaSateliteDescargaService.listarCierresBodegaSolicitadosCompleto";

/**
 * SLT-176 (R696, R697) — la descarga de «Cierres de bodega solicitados» de la satelite, sacada de
 * `CierreBodegaService`. Ese servicio escribe dinero y, por este unico metodo, llegaba por import a
 * las cifras de presentacion (`cifras-bodega-descarga` y `CierresAdminService` → `cifras-cierre`),
 * que la guardia R631 le prohibe. Aqui solo se LEE: el constructor recibe puertos de lectura
 * (`Pick`), y el archivo no importa repositorios, Prisma ni servicios de dinero.
 */
export class CierresBodegaSateliteDescargaService implements ICierresBodegaSateliteDescargaService {
  constructor(
    private readonly repo: Pick<ICierreBodegaRepository, "findCierresBodegaByZona">,
    private readonly ordenRepo: Pick<IOrdenRepository, "findUsuarioZonaId">,
    /** SLT-42 (R22): la zona del pais de la empresa, con la que se resuelven los filtros de fecha. */
    private readonly reglasPais?: Pick<IReglasPaisEmpresa, "zonaHoraria">,
    /**
     * SLT-141 (R389): la lectura en lote de los cierres del dia de los cierres de bodega NUEVOS de la
     * descarga. Opcional como antes (R694): con un cierre nuevo y sin ella, lanza. Sin lecturas de
     * pago: la satelite no recibe «Pago entregado» (F481, R386).
     */
    private readonly cifrasLote?: ICifrasBodegaLoteLectura,
  ) {}

  /**
   * Feature 184 — Tanda B (R1/R4/R6/R10) — el CONJUNTO de «Cierres de bodega solicitados» de la
   * zona, sin recorte, que es del que sale el archivo.
   *
   * **Lo que cierra.** Hasta hoy ese archivo se producia releyendo `listarConsolidacion()`, que
   * es el listado COMPUESTO de la otra pantalla: cuatro consultas (la zona, los consolidables,
   * el contador de pendientes y este historico), los cinco agregados de dinero y el reparto del
   * efectivo entre todos los pagos individuales ordenados. De todo eso, el archivo usaba UN
   * campo. Aqui son DOS consultas —la zona y el listado— y ni un calculo de dinero (R10).
   *
   * **No lleva `input`, y es deliberado.** Este listado no admite filtros: su schema de pagina
   * solo tenia `page`/`pageSize`, y quitarlos deja una lista blanca de CERO claves. El borde la
   * sigue aplicando —una clave colada, `zonaId` incluida, muere alli con `validation_error`
   * (R17)— pero no hay nada que transportar hasta aqui. El alcance sale del actor, como en la
   * pagina.
   *
   * Sin zona -> conjunto vacio, no `forbidden`: el rol tiene acceso al modulo, lo que no tiene
   * es alcance. Es lo mismo que devuelve hoy `listarConsolidacion` (`cierresBodegaPasados: []`).
   *
   * **Excepcion declarada a R29 de la 170.** R29 —feature `done`, requisito vivo— pide dos cosas
   * y aqui se cumple una: por encima del tope no se transporta ni una fila (van el total y el
   * tope, nada mas), pero el conjunto SI se materializa entero —`findCierresBodegaByZona` es un
   * `findMany` sin `take`— y el tope lo mide este servicio despues. El conjunto es el historico
   * de cierres de bodega de UNA zona: acotado por el alcance, que es lo que lo hace mas llevadero
   * que su gemelo de `CierresBodegaAdminService` —aquel ve todas las zonas—, pero acumulativo,
   * uno por dia operado y sin purga.
   *
   * Se acepta por el coste de la alternativa: pedir `limite + 1` obliga a un `count` aparte para
   * conservar el total exacto del aviso (R6), que es la segunda consulta que R15 de esta feature
   * mide y prohibe. Decision humana del 2026-08-05, anotada en el design §3.1; es una excepcion
   * declarada, no un cumplimiento de R29.
   */
  async listarCierresBodegaSolicitadosCompleto(
    actor: Actor,
    filtros?: FiltrosCierresBodega,
  ): Promise<ListarCierresBodegaSolicitadosCompletoServiceResult> {
    if (actor.rol !== ROL_AUTORIZADO) return { status: "forbidden" }; // R4: antes del repo

    const zonaId = await this.ordenRepo.findUsuarioZonaId(actor.usuarioId); // R4
    if (zonaId === null) return { status: "ok", items: [], total: 0 };

    // El MISMO metodo del que la pagina saca su recorte: mismo where, mismo orden y —lo que en
    // una pantalla de dinero no es estilo— el MISMO mapper de totales.
    // Los MISMOS filtros que la pagina: el archivo es «esto que estoy viendo, entero».
    // SLT-42 (R22, R23): la zona del pais solo se lee si el filtro trae rango. SLT-153 (R457): un
    // folio imposible da `vacio`.
    const resueltos = await filtrosParaRepo(filtros, zonaPerezosa(this.reglasPais, OPERACION));
    if (resueltos.tipo === "vacio") return { status: "ok", items: [], total: 0 }; // SLT-153 (R457, R459)
    const conjunto = await this.repo.findCierresBodegaByZona(zonaId, resueltos.filtros);

    const limite = descargaConfig.MAX_FILAS;
    // R6: o van TODAS las filas del conjunto, o van solo los conteos. Nunca un archivo truncado.
    if (conjunto.length > limite) {
      return { status: "limite_excedido", total: conjunto.length, limite };
    }

    // SLT-141 (R384): sin cierres nuevos, la respuesta de hoy y ni una lectura mas.
    const nuevos = cierresBodegaModeloNuevo(conjunto);
    if (nuevos.length === 0) return { status: "ok", items: conjunto, total: conjunto.length };
    if (this.cifrasLote === undefined) throw new LecturaCifrasBodegaAusenteError(OPERACION);
    // R389: el alcance de la satelite (su zona) va DENTRO de la lectura en lote.
    const filas = await this.cifrasLote.leerCierresDiaDeBodegas(
      nuevos.map((c) => c.cierreBodegaId),
      { lectura: "zona", zonaId },
      await zonaDeLaEmpresa(this.reglasPais, OPERACION),
    );
    // R386 (F481): las cifras SIN `pagoEntregado`; la clave no existe en el DTO de la satelite.
    // SLT-161 (R480): y las de la empresa en `null`. El rol ya es el de la satelite (R4), pero el
    // corte pregunta lo mismo que en las demas lecturas («no es acceso total»): un solo criterio.
    return {
      status: "ok",
      items: conjunto,
      total: conjunto.length,
      cifrasModeloNuevo: cifrasBodegaDescarga(nuevos, filas).map((c) =>
        anularEmpresaSiNoCentral(c, CLASE_CIFRAS_BODEGA_DESCARGA, actor),
      ),
    };
  }
}
