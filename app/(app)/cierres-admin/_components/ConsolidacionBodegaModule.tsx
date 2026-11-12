"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Modal } from "@/components/shared/Modal";
import { Pagination } from "@/components/shared/Pagination";
import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import { ColaCierres } from "@/components/private/cierres/cola/ColaCierres";
import * as L from "@/components/private/cierres/cola/cola-cierres-labels";
import {
  piePorConsolidar,
  tarjetasAConsolidar,
  type PestanaConsolidar,
} from "@/components/private/cierres/cola/cola-cierres-vista";
import { RESUMEN_SOLICITUD_BODEGA_TEXTO } from "@/components/private/cierres/dialogos/dialogos-labels";
import { money } from "@/lib/config/moneda";
import type { DataTableDescarga } from "@/components/shared/DataTable";
import {
  CATALOGO_FILTROS_CIERRES_VACIO,
  type CatalogoFiltrosCierresDTO,
  type FiltrosCierresBodega,
} from "@/lib/types/filtros-cierres";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import { useToast } from "@/hooks/useToast";
import { cierreConfig } from "@/lib/config/cierre";
import {
  solicitarCierreBodega,
  listarConsolidablesPaginado,
} from "@/lib/actions/cierre-bodega";
import type {
  BloqueoConsolidacion,
  CierreConsolidableCola,
} from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreTotales } from "@/lib/interfaces/services/ICierreDiaService";
import { hrefDetalleCierre } from "./cierre-enlace";
import {
  CierresBodegaSolicitadosLista,
  descargaBodegaSolicitados,
  type CierresBodegaSolicitadosPagina,
} from "./CierresBodegaSolicitadosLista";
import { FiltrosCierresBarra } from "./FiltrosCierresBarra";
import {
  AMBITO_DESCARGA_CONSOLIDABLES,
  COLUMNAS_DESCARGA_CONSOLIDABLES,
  filaDescargaConsolidable,
} from "./cierres-bodega-descarga-columnas";
import { descargarDatos } from "@/components/shared/descarga-datos";

/** Nombre visible del listado de consolidables: hoja, archivo y control (R12/R13). */
const TITULO_DESCARGA_CONSOLIDABLES = "Cierres del día a consolidar";
/** Nombre accesible del control (R43). Propio: la pantalla monta dos listados paginados. */
export const PAGINACION_CONSOLIDABLES_LABEL =
  "Paginación de los cierres del día a consolidar";

/** `true` si el objeto no recorta nada: entonces la página pre-cargada del servidor sirve. */
function sinFiltrosBodega(filtros: FiltrosCierresBodega): boolean {
  return Object.values(filtros).every((v) => v === undefined);
}

// --- Pedido humano del 2026-08-16: las dos mitades de esta sección, en pestañas ---
//
// LOS NOMBRES NO SON «Pendientes/Resueltos», y es una decisión, no un descuido. En las otras
// dos secciones esa pareja es exacta —hay una cola de decisión y un histórico de resueltos—;
// aquí las dos mitades son OTRA COSA: lo que todavía no se ha consolidado (cierres del día
// `aprobado` de la zona) y los cierres de BODEGA que esta zona ya solicitó, que incluyen los
// que siguen esperando decisión del maestro. Llamar «Resueltos» a un conjunto que contiene
// solicitudes sin resolver sería una etiqueta falsa en una pantalla de dinero.
// SLT-106: son las pestañas de la cola única (`PestanaConsolidar`); sus textos, en la cola.
const TAB_CONSOLIDAR = "aConsolidar";
const TAB_SOLICITADOS = "solicitados";

// R40: el tamaño sale de la config del dominio (T H.1), nunca de un literal de pantalla.
// Es `cierreConfig` y no `cierreBodegaConfig` porque los comprobantes de este listado son `cierre_dia`
// (T J.1, decisión 9): con la config de bodega, ajustar el tamaño de página de los cierres de
// bodega movería también el de una tabla de cierres del día.
const PAGE_SIZE_OPTIONS = [10, 25, 50].filter((s) => s <= cierreConfig.MAX_PAGE_SIZE);

/**
 * Feature 170 — FASE 2 (T J.2, R40/R41): la PÁGINA de los consolidables. `total` es el del
 * CONJUNTO —de él sale el contador de cabecera (R42)— y nunca `items.length`.
 */
export interface ConsolidablesPagina {
  /** SLT-106 (R192): la fila de la cola, con «A la central», «Aprobado» y las gestiones ajustadas. */
  items: CierreConsolidableCola[];
  total: number;
  pageSize: number;
}

/**
 * Feature 170 — FASE 2 (T J.2): una página de consolidables. La zona NO viaja en el input: la
 * resuelve el servicio desde la sesión, igual que el listado sin paginar (R44).
 */
async function leerConsolidables(
  page: number,
  pageSize: number,
  filtros: FiltrosCierresBodega,
): Promise<ConsolidablesPagina> {
  const res = await listarConsolidablesPaginado({ page, pageSize, filtros });
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

// Feature 40 (T8) — módulo cliente del "Cierre de bodega" del adminSatelite (lado
// SOLICITAR, espejo de la 37 un nivel arriba). Recibe del Server Component padre los
// cierre_dia aprobados consolidables de SU zona (R5), los totales agregados (R10),
// el gate `puedesSolicitar`/`motivoBloqueo` (R6/R7) y su histórico propio (F1.4-h),
// todo ya acotado server-side (R1/R3). La única mutación (Solicitar cierre de
// bodega) va por Server Action y refresca la ruta. Money-safe (R13): los montos son
// STRING; se renderizan con `money()` sin `parseFloat`/`Number`.

export interface ConsolidacionBodegaModuleProps {
  /**
   * Feature 170 — FASE 2 (T J.2, R40/R41): PÁGINA 1 de los cierre_dia `aprobado` sin cierre
   * de bodega de la zona (R5), ya resuelta server-side, más el `total` del conjunto.
   */
  consolidables: ConsolidablesPagina;
  /**
   * Suma snapshot de los consolidables (R10).
   *
   * Feature 170 — FASE 2 (T J.2, R49/R50): los CINCO agregados de dinero de esta pantalla
   * siguen llegando por props, calculados sobre el CONJUNTO COMPLETO en `listarConsolidacion`.
   * NO se derivan de la página, y no es disciplina: dos de ellos —`totalNetoAgregado` y
   * `totalCentralDebeAgregado`— salen de repartir el efectivo entre los pagos INDIVIDUALES
   * ordenados de menor a mayor, y eso no lo produce ni una página ni un `SUM`. Sobre la página
   * visible la pantalla podría decir que la central no debe nada cuando debe 500, y sobre ese
   * número se decide si se cierra la bodega. Como no dependen de la página, R50 sale gratis:
   * cambiar de página no los toca.
   */
  totalesAgregados: CierreTotales;
  /** Feature 39/R18: suma snapshot del pago a mensajeros (STRING), separado de los totales. */
  totalPagoMensajeroAgregado: string;
  /** Feature 56/R17: suma snapshot del ingreso de bodega por rechazos (STRING), separado. */
  totalIngresoBodegaRechazosAgregado: string;
  /**
   * SLT-54 (R71): alguno de los consolidables del CONJUNTO COMPLETO incluye el modelo nuevo. Nombra el
   * total de arriba, así que tampoco se deriva de la página (R49). Obligatorio para que el compilador
   * no deje a la página sin pasarlo.
   */
  incluyeModeloNuevoAgregado: boolean;
  /**
   * Pago a mensajeros que el efectivo NO cubrió (STRING, DERIVADO server-side); lo debe la
   * central. `"0.00"` si el efectivo alcanzó para todos.
   */
  totalCentralDebeAgregado: string;
  /** Gate de "Solicitar cierre de bodega" (R6/R7). */
  puedesSolicitar: boolean;
  /** Texto accionable del bloqueo si `!puedesSolicitar`. */
  motivoBloqueo: string | null;
  /**
   * SLT-106 (R67): «Debe llegar a la central» del CONJUNTO completo, derivado en el servidor con
   * `paraLaCentral()`. Acá no se resta (R71).
   */
  paraLaCentralAgregado: string;
  /** SLT-106 (R195): cierres del conjunto completo, para el texto del pie (R197). */
  cierresAConsolidar: number;
  /** SLT-106 (R195): mensajeros distintos del conjunto, para la nota de «Pago a mensajeros». */
  mensajerosAConsolidar: number;
  /** SLT-106 (R195): por qué no se puede solicitar; `null` = se puede. Elige el texto del pie. */
  bloqueo: BloqueoConsolidacion | null;
  /** SLT-106 (R203): el nombre de la zona para la descripción; `null` si no llega. */
  zonaNombre: string | null;
  /**
   * Feature 170 — FASE 2 (T I.2, R40/R41): PÁGINA 1 del histórico de cierres de bodega de la
   * zona (solo lectura, F1.4-h), ya resuelta server-side, más el `total` del conjunto.
   */
  cierresBodegaPasados: CierresBodegaSolicitadosPagina;
  /** `true` si el adminSatelite no tiene zona asignada (R4). */
  sinZona: boolean;
  /** Opciones de los filtros (bodegas), resueltas por el Server Component. */
  catalogoFiltros?: CatalogoFiltrosCierresDTO;
}

/**
 * La configuración de descarga de «Cierres del día a consolidar», para la fila de las pestañas.
 *
 * Feature 170 (T J.2, R52) — el listado pinta UNA página; el archivo es el CONJUNTO COMPLETO de
 * consolidables de SU zona, y esa zona la resuelve el servidor desde la sesión: descargar no
 * amplía el alcance ni una fila (R14/R44). Feature 184 — Tanda B (T B.2, R1/R6/R10): lo entrega
 * una lectura DEDICADA, que cuesta una consulta y cero aritmética de dinero. Los cinco agregados
 * de la cabecera siguen llegando por props desde `listarConsolidacion` (R49/R50 de la 170).
 *
 * Pedido humano del 2026-08-16 — con los mismos filtros que la página.
 */
function descargaConsolidables(filtros: FiltrosCierresBodega): DataTableDescarga {
  return {
    titulo: TITULO_DESCARGA_CONSOLIDABLES,
    columnas: COLUMNAS_DESCARGA_CONSOLIDABLES,
    // Ficha 314: enciende el selector de columnas de esta descarga (ámbito propio, R10).
    ambitoColumnas: AMBITO_DESCARGA_CONSOLIDABLES,
    obtenerFilas: () =>
      filasDesdeResultado(
        descargarDatos("listarConsolidablesCompleto", { filtros }),
        filaDescargaConsolidable,
      ),
  };
}

export function ConsolidacionBodegaModule({
  consolidables,
  totalesAgregados,
  totalPagoMensajeroAgregado,
  totalIngresoBodegaRechazosAgregado,
  incluyeModeloNuevoAgregado,
  totalCentralDebeAgregado,
  puedesSolicitar,
  motivoBloqueo,
  paraLaCentralAgregado,
  cierresAConsolidar,
  mensajerosAConsolidar,
  bloqueo,
  zonaNombre,
  cierresBodegaPasados,
  sinZona,
  catalogoFiltros = CATALOGO_FILTROS_CIERRES_VACIO,
}: ConsolidacionBodegaModuleProps) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  // Confirmación de "Solicitar cierre de bodega"; true = modal abierto.
  const [confirmar, setConfirmar] = useState(false);

  // Feature 170 — FASE 2 (T J.2, R40/R42/R43): página visible de los consolidables. El control
  // vive AQUÍ, junto al contador (decisión de Q-I6): así la guardia de T H.3 ve esta pantalla
  // como paginada y vigila que el número salga del `total` del servidor.
  //
  // R49/R50: los cinco agregados de dinero NO se tocan. Siguen siendo las props que calculó
  // `listarConsolidacion` sobre el conjunto completo; esta lectura solo recorta lo que la
  // tabla PINTA.
  /**
   * Pedido humano del 2026-08-16 — las dos mitades pasan a ser PESTAÑAS. Arranca en «A
   * consolidar»: es la que tiene trabajo (y de la que salen los cinco agregados de dinero y el
   * botón de solicitar).
   */
  const [tab, setTab] = useState<PestanaConsolidar>(TAB_CONSOLIDAR);

  /**
   * Pedido humano del 2026-08-16 — la misma barra que la mitad del maestro, sin el filtro de
   * mensajero. En esta pantalla el de bodega es casi siempre trivial (el actor tiene UNA zona),
   * pero se ofrece igual: la barra es la misma y lo que ofrece hace lo que dice.
   */
  const [filtros, setFiltros] = useState<FiltrosCierresBodega>({});

  /** Filtrar devuelve el listado a su página 1. */
  function aplicarFiltros(next: FiltrosCierresBodega) {
    setFiltros(next);
    setPage(1);
  }

  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(consolidables.pageSize);
  const { data, error } = useSWR(
    ["cierre-bodega:consolidables", page, pageSize, filtros],
    () => leerConsolidables(page, pageSize, filtros),
    {
      // Con un filtro puesto la página 1 pre-cargada es la del conjunto SIN filtrar: servirla
      // sería enseñar cierres que el filtro excluye.
      fallbackData:
        page === 1 && pageSize === consolidables.pageSize && sinFiltrosBodega(filtros)
          ? consolidables
          : undefined,
    },
  );
  const pagina: ConsolidablesPagina = data ?? { items: [], total: 0, pageSize };
  // R44: el esqueleto sólo cuando NO hay nada que pintar (`isLoading` de SWR sigue en `true`
  // mientras revalida aunque haya `fallbackData`).
  const cargando = data === undefined;

  /** R6-R10: crea la solicitud de cierre de bodega de la zona. */
  async function confirmarSolicitud() {
    const result = await solicitarCierreBodega();
    if (result.status === "ok") {
      toast.success("Cierre de bodega solicitado correctamente.");
      setConfirmar(false);
      // SL-44 (destapado por el E2E `cierre-bodega-satelite`): `router.refresh()` a secas no
      // basta. Las dos listas son `useSWR` con la página del Server Component como
      // `fallbackData`, que SWR usa una sola vez: con datos ya en caché, la consolidación recién
      // creada no salía en «Solicitados» y los cierres consolidados seguían en «A consolidar»
      // hasta recargar. Mismo arreglo que `CierreDiaModule` y `CierresAdminModule`: revalidar
      // todas las páginas de las dos listas.
      void mutate(
        (clave) =>
          Array.isArray(clave) &&
          (clave[0] === "cierre-bodega:consolidables" || clave[0] === "cierres-bodega:solicitados"),
      );
      router.refresh();
      return;
    }
    // conflict (R6 pendientes / R7 vacío / R8 duplicado) → motivo accionable.
    if (result.status === "conflict") {
      toast.error(result.motivo);
    } else if (result.status === "validation_error") {
      // R4: sin zona.
      const primero = Object.values(result.fieldErrors)[0]?.[0];
      toast.error(primero ?? "No se pudo solicitar el cierre de bodega.");
    } else if (result.status === "forbidden") {
      toast.error("No tenés permiso para solicitar el cierre de bodega.");
    } else if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Iniciá sesión de nuevo.");
    } else {
      toast.error("No se pudo solicitar el cierre de bodega. Intentá de nuevo.");
    }
    setConfirmar(false);
    router.refresh();
  }

  // R196: las tarjetas pintan el CONJUNTO completo (las props de `listarConsolidacion`), nunca la
  // página: cambiar de página o de filtro no las toca (R49/R50 de la 170).
  const tarjetas = tarjetasAConsolidar({
    totales: totalesAgregados,
    pagoMensajeros: totalPagoMensajeroAgregado,
    ganaBodega: totalIngresoBodegaRechazosAgregado,
    paraLaCentral: paraLaCentralAgregado,
    centralDebe: totalCentralDebeAgregado,
    mensajeros: mensajerosAConsolidar,
    incluyeModeloNuevo: incluyeModeloNuevoAgregado,
  });
  const enConsolidar = tab === TAB_CONSOLIDAR;

  return (
    <section aria-label="Cierre de bodega" className="flex flex-col gap-4">
      {/* R4: adminSatelite sin zona → aviso accionable, sin tablas de acción. */}
      {sinZona ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          No tenés una zona asignada; contactá a tu administrador.
        </p>
      ) : (
        /* ---------- La cola única (SLT-106, R32, R204) ----------
           `ColaCierres` con `tipo` bodega y `rol` satélite: descripción, pestañas con conteo, UNA
           barra con «Descargar» de la pestaña activa, y en «A consolidar» aviso, tarjetas, tabla y
           pie con el botón. «Solicitados» sigue siendo la lista de hoy hasta SLT-107 (R201).

           LOS CONTEOS salen del `total` del SERVIDOR (R42, R190), nunca de `items.length`. Lo
           vigila `tests/unit/descarga/contadores-cabecera.guardia.test.ts`. El de «Solicitados»
           es el de la zona sin filtros (PA2): la lista de hoy tampoco los aplica. */
        <ColaCierres
          tipo="bodega"
          rol="satelite"
          descripcion={L.descripcionColaSatelite(zonaNombre)}
          pestanas={[
            { id: TAB_CONSOLIDAR, label: L.PESTANA_A_CONSOLIDAR, conteo: pagina.total },
            { id: TAB_SOLICITADOS, label: L.PESTANA_SOLICITADOS, conteo: cierresBodegaPasados.total },
          ]}
          pestanaActiva={tab}
          onPestana={setTab}
          barra={
            <FiltrosCierresBarra
              catalogo={catalogoFiltros}
              onChange={aplicarFiltros}
              disabled={cargando}
              sinMensajero
            />
          }
          descargar={
            <DescargarDatasetButton
              {...(enConsolidar ? descargaConsolidables(filtros) : descargaBodegaSolicitados(filtros))}
            />
          }
          filas={pagina.items}
          cargando={cargando}
          error={error ? L.ERROR_A_CONSOLIDAR : null}
          vacio={L.VACIO_A_CONSOLIDAR}
          region={L.REGION_A_CONSOLIDAR}
          acciones={{
            // R193: el mismo camino que el enlace del detalle (`?cierre=`), como SLT-104.
            verSuCierre: (cierreDiaId) => router.push(hrefDetalleCierre(cierreDiaId)),
          }}
          tarjetas={tarjetas}
          totales={totalesAgregados}
          aviso={puedesSolicitar ? null : motivoBloqueo}
          botonPie={{ deshabilitado: !puedesSolicitar, onClick: () => setConfirmar(true) }}
          pie={enConsolidar ? piePorConsolidar(bloqueo, cierresAConsolidar) : undefined}
          paginacion={
            enConsolidar ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={pagina.total}
                disabled={cargando}
                showFirstLast
                siblingCount={1}
                ariaLabel={PAGINACION_CONSOLIDABLES_LABEL}
                onPageChange={setPage}
                onPageSizeChange={(s) => {
                  setPageSize(s);
                  setPage(1);
                }}
                pageSizeOptions={PAGE_SIZE_OPTIONS}
              />
            ) : null
          }
          solicitados={<CierresBodegaSolicitadosLista initialData={cierresBodegaPasados} />}
        />
      )}

      {/* SIN ZONA (R4, R202) el histórico se sigue enseñando, fuera de la cola: es lo único que
          este actor puede mirar, y esconderlo tras unas pestañas que no puede usar dejaría la
          pantalla en blanco detrás de un aviso. */}
      {sinZona ? <CierresBodegaSolicitadosLista initialData={cierresBodegaPasados} /> : null}

      {/* Confirmación de "Solicitar cierre de bodega". R48/R207: el resumen con las MISMAS
          props que las tarjetas, formateadas con `money()`. */}
      <Modal
        open={confirmar}
        onOpenChange={setConfirmar}
        title="Solicitar cierre de bodega"
        description="Se consolidarán todos los cierres del día aprobados de tu zona en una solicitud a la bodega central. Esta acción no se puede deshacer."
        confirmLabel="Solicitar cierre de bodega"
        onConfirm={confirmarSolicitud}
        closeOnConfirm={false}
      >
        <dl
          aria-label={RESUMEN_SOLICITUD_BODEGA_TEXTO.region}
          className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm"
        >
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.recaudado}</dt>
          <dd className="text-right font-medium tabular-nums">{money(totalesAgregados.general)}</dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.pagoMensajeros}</dt>
          <dd className="text-right font-medium tabular-nums">
            {money(totalPagoMensajeroAgregado)}
          </dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.ganaBodega}</dt>
          <dd className="text-right font-medium tabular-nums">
            {money(totalIngresoBodegaRechazosAgregado)}
          </dd>
          <dt className="text-muted-foreground">{RESUMEN_SOLICITUD_BODEGA_TEXTO.debeLlegar}</dt>
          <dd className="text-right font-semibold tabular-nums">{money(paraLaCentralAgregado)}</dd>
        </dl>
      </Modal>
    </section>
  );
}
