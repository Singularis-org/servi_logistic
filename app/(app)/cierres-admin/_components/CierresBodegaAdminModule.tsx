"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/Pagination";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import {
  CATALOGO_FILTROS_CIERRES_VACIO,
  type CatalogoFiltrosCierresDTO,
  type FiltrosCierresBodega,
} from "@/lib/types/filtros-cierres";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import { useToast } from "@/hooks/useToast";
import { cierreBodegaConfig } from "@/lib/config/cierre-bodega";
// ⭑ FICHA 431 (T17, R25): las DOS acciones de la conciliacion, el MISMO componente que monta el
// desglose de `/wallet/satelites`. Mismo boton para la misma fila: si esta pantalla tuviera su
// propia copia, las dos podrian acabar diciendo cosas distintas sobre si el dinero llego.
import { ConciliacionAcciones } from "@/components/shared/conciliacion/ConciliacionAcciones";
// ⭑ FICHA 431: la fecha de la consolidacion en el CALENDARIO DE COSTA RICA. `solicitadoAt` es un
// instante UTC y `slice(0, 10)` daria el dia siguiente para toda consolidacion hecha despues de
// las 18:00 — y esa fecha es lo que identifica el bulto en el dialogo.
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import {
  verCierreBodegaDetalle,
  // ⭑ FICHA 431 (T17, R16/D2): `aprobarCierreBodega` y `rechazarCierreBodega` YA NO SE
  // IMPORTAN AQUI. La aprobacion de nivel 2 dejo de ser una puerta: lo que queda es MARCAR que
  // el efectivo llego, y eso lo hace `ConciliacionAcciones` con las acciones de la conciliacion.
  // El camino viejo sigue en el arbol (Q4) y es IMPOSIBLE de escribir contra la base por el
  // `CHECK` de R15; lo que se retira aqui es la superficie, que era su unica boca.
  listarPendientesCierresBodegaPaginado,
} from "@/lib/actions/cierre-bodega";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
// SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — el detalle único de SLT-95
// con `tipo` bodega sustituye al `Modal` de antes y sus paneles (R40, R118).
import { DetalleCierre } from "@/components/private/cierres/detalle/DetalleCierre";
import { ConciliacionCierreBodega } from "@/components/private/cierres/detalle/ConciliacionCierreBodega";
import { MensajerosCierreBodega } from "@/components/private/cierres/detalle/MensajerosCierreBodega";
import { tituloDescargaGestiones } from "@/components/private/cierres/detalle/detalle-cierre-labels";
import {
  COLUMNAS_DESCARGA_DETALLE_BODEGA,
  filaDescargaDetalleBodega,
} from "@/components/private/cierres/detalle/detalle-cierre-descarga-columnas";
import {
  filasMensajeros,
  folioDe,
  gestionesDeBodega,
  modoBodegaDe,
  vistaBodegaDesdeAdmin,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
import { VisorEvidencia } from "./cierre-detalle-shared";
import { CierreBodegaFacturaResumen } from "./cierre-factura";
import {
  DescargarCierresButton,
  type DescargaResumenCierres,
} from "./DescargarCierresButton";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";
import { ListaComprobantes } from "./ListaComprobantes";
import { PanelConmutado } from "./PanelConmutado";
import {
  CierresBodegaResueltosLista,
  descargaBodegaResueltos,
  type CierresBodegaResueltosPagina,
} from "./CierresBodegaResueltosLista";
import { FiltrosCierresBarra } from "./FiltrosCierresBarra";
import {
  AMBITO_DESCARGA_BODEGA_PENDIENTES,
  COLUMNAS_DESCARGA_BODEGA_PENDIENTES,
  filaDescargaBodegaPendiente,
} from "./cierres-bodega-descarga-columnas";
import { descargarDatos } from "@/components/shared/descarga-datos";

/** Nombre visible de la cola: hoja, base del archivo y nombre del control (R12/R13). */
const TITULO_DESCARGA_PENDIENTES = "Cierres de bodega pendientes";
/** Nombre accesible del control de la COLA (R43). La pantalla monta varias tablas paginadas. */
export const PAGINACION_BODEGA_PENDIENTES_LABEL =
  "Paginación de los cierres de bodega pendientes";
const ERROR_CARGA_PENDIENTES = "No se pudieron cargar los cierres de bodega pendientes.";

/** `true` si el objeto no recorta nada: entonces la página pre-cargada del servidor sirve. */
function sinFiltrosBodega(filtros: FiltrosCierresBodega): boolean {
  return Object.values(filtros).every((v) => v === undefined);
}

// --- Pedido humano del 2026-08-16: las dos mitades de esta sección, en pestañas ---
const TAB_PENDIENTES = "pendientes";
const TAB_RESUELTOS = "resueltos";
type TabBodega = typeof TAB_PENDIENTES | typeof TAB_RESUELTOS;
const TAB_PENDIENTES_LABEL = "Pendientes";
const TAB_RESUELTOS_LABEL = "Resueltos";
/** Nombre accesible del conmutador. Propio: la pantalla anida varios segmentados. */
const TABS_BODEGA_LABEL = "Cierres de bodega por estado";

// R40: el tamaño sale de la config del dominio (T H.1), nunca de un literal de pantalla.
const PAGE_SIZE_OPTIONS = [10, 25, 50].filter(
  (s) => s <= cierreBodegaConfig.MAX_PAGE_SIZE,
);

/**
 * Feature 170 — FASE 2 (T J.2, R40/R41): una página de la cola. El alcance NO viaja en el
 * input —lo resuelve el servicio desde la sesión, igual que el listado sin paginar (R44)—;
 * aquí solo van el número de página y el tamaño.
 */
async function leerPendientes(
  page: number,
  pageSize: number,
  filtros: FiltrosCierresBodega,
): Promise<CierresBodegaColaPagina> {
  const res = await listarPendientesCierresBodegaPaginado({ page, pageSize, filtros });
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

// Feature 40 (T8) — módulo cliente de "Cierres de bodega satélite" del maestro (lado
// APROBAR/RECHAZAR, espejo de la 38 aplicado a CierreBodega). Recibe del Server
// Component padre la cola de `solicitado` (R15) y el histórico de resueltos, ya
// acotados server-side (R2). Al abrir un cierre pide el DETALLE AGREGADO por Server
// Action (totales snapshot R11/R13 + cada cierre_dia con sus 4 secciones por
// resultado y evidencias FIRMADAS R12). Las decisiones (aprobar/rechazar con motivo
// obligatorio R17) van por Server Action y refrescan la ruta. Money-safe (R13): los
// montos son STRING; se renderizan con `money()` sin `parseFloat`/`Number`.

/**
 * Feature 170 — FASE 2 (T J.2, R40/R41): la PÁGINA de la cola, tal como la devuelve el
 * servidor. `total` es el del CONJUNTO —de él sale el contador de cabecera (R42)— y nunca
 * `items.length`.
 */
export interface CierresBodegaColaPagina {
  items: CierreBodegaResumen[];
  total: number;
  pageSize: number;
}

export interface CierresBodegaAdminModuleProps {
  /**
   * Feature 170 — FASE 2 (T J.2, R40/R41): PÁGINA 1 de los cierres de bodega `solicitado`
   * (cola de decisión, R15), ya resuelta server-side, más el `total` del conjunto.
   */
  pendientes: CierresBodegaColaPagina;
  /**
   * Feature 170 — FASE 2 (T I.2, R40/R41): PÁGINA 1 de los resueltos (R15), ya resuelta
   * server-side, más el `total` del conjunto. Deja de ser el array entero.
   */
  historico: CierresBodegaResueltosPagina;
  /**
   * Opciones de los filtros (bodegas), resueltas por el Server Component. Opcional con default
   * VACIO: un montaje que se olvide de pasarla ofrece cero opciones —la pantalla sigue
   * funcionando sin filtrar— en vez de romperse.
   */
  catalogoFiltros?: CatalogoFiltrosCierresDTO;
  /**
   * ⭑ FICHA 431 (R25/R27) — si el actor puede MARCAR y DESMARCAR la conciliacion. Lo decide el
   * SERVIDOR con `esAccesoTotal`, el MISMO predicado con el que `ConciliacionSatelitesService`
   * responde `forbidden`: son las dos mitades del control, y esconder el boton no es una de
   * ellas por si sola.
   *
   * **Default `false`: falla cerrado.** Un montaje que se olvide de decidir el permiso no
   * ofrece conciliar nada, que es el unico defecto seguro en una pantalla de dinero.
   */
  puedeConciliar?: boolean;
  /**
   * FICHA 481 — para quién es el «Detalle» del Excel: `admin` (central) ve la hoja entera;
   * `satelite`, sin «Fulfillment». La resuelve el Server Component con `esAccesoTotal`. Default
   * `satelite`: falla cerrado, igual que `puedeConciliar`.
   */
  audiencia?: AudienciaDescargaGestionesFundida;
}

/**
 * Detalle abierto: el resultado `ok` de `verCierreBodegaDetalle` tal cual llega (cabecera, cierres del
 * día y derivados del servidor). SLT-104: la vista la arma `vistaBodegaDesdeAdmin`; la pantalla no
 * filtra, suma ni reordena nada (R71).
 */
type DetalleAbierto = Extract<CierreBodegaDetalleServiceResult, { status: "ok" }>;

/**
 * La configuración de descarga de la COLA de bodega, para la fila de las pestañas.
 *
 * Feature 170 (T J.2, R52) — el listado pinta UNA página; el archivo es la COLA COMPLETA.
 * Feature 184 — Tanda E (T E.3, R1/R2/R6): sale de la lectura DEDICADA, que corta por estado en
 * la base. El alcance no viaja en la llamada y no puede: es acceso total y lo decide el servicio
 * desde la sesión, así que descargar no amplía lo que el actor podía ver (R14/R44), y el tope de
 * filas se evalúa en el SERVIDOR (R6).
 *
 * Pedido humano del 2026-08-16 — con los mismos filtros que la página: el archivo es «esto que
 * estoy viendo, entero».
 */
function descargaColaBodega(filtros: FiltrosCierresBodega): DescargaResumenCierres {
  return {
    titulo: TITULO_DESCARGA_PENDIENTES,
    columnas: COLUMNAS_DESCARGA_BODEGA_PENDIENTES,
    // Ficha 314: enciende el selector de columnas de esta descarga (ámbito propio, R10).
    ambitoColumnas: AMBITO_DESCARGA_BODEGA_PENDIENTES,
    obtenerFilas: () =>
      filasDesdeResultado(
        descargarDatos("listarPendientesCierresBodegaCompleto", { filtros }),
        filaDescargaBodegaPendiente,
      ),
  };
}

export function CierresBodegaAdminModule({
  pendientes,
  historico,
  catalogoFiltros = CATALOGO_FILTROS_CIERRES_VACIO,
  puedeConciliar = false,
  audiencia = "satelite",
}: Readonly<CierresBodegaAdminModuleProps>) {
  const router = useRouter();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  // Detalle del cierre de bodega abierto (null = modal cerrado).
  const [detalle, setDetalle] = useState<DetalleAbierto | null>(null);
  // Evidencia (URL firmada, R12) en el visor; null = cerrado.
  const [evidencia, setEvidencia] = useState<string | null>(null);
  // Sub-modal de rechazo (R17): true = abierto.

  // Motivo del rechazo (obligatorio, R17) + su error de validación.

  // Feature 170 — FASE 2 (T J.2, R40/R42/R43): página visible de la COLA. El control vive
  // AQUÍ, en el módulo, junto al contador (decisión de Q-I6): así la guardia de T H.3 ve esta
  // pantalla como paginada y vigila de verdad que el número salga del `total` del servidor.
  //
  // R50: el estado de esta pantalla —el detalle abierto, el motivo tecleado— vive en los
  // `useState` de arriba, que la página no toca. Cambiar de página no los reinicia.
  /**
   * Pedido humano del 2026-08-16 — cola e histórico pasan a ser PESTAÑAS. Arranca en
   * «Pendientes», que es la que tiene decisiones esperando.
   */
  const [tab, setTab] = useState<TabBodega>(TAB_PENDIENTES);

  /**
   * Pedido humano del 2026-08-16 — «en la parte de bodega deja el mismo filtro solo omitiendo el
   * de mensajero». Misma barra, mismo catálogo de bodegas (GAM + las que tienen admin de zona) y
   * los mismos atajos de fecha que `/ordenes`; lo que no se ofrece es el mensajero, porque un
   * cierre de bodega consolida los de varios y el dato no existe.
   */
  const [filtros, setFiltros] = useState<FiltrosCierresBodega>({});

  /** Filtrar devuelve la cola a su página 1: pedir la 7 de un conjunto recién recortado da vacío. */
  function aplicarFiltros(next: FiltrosCierresBodega) {
    setFiltros(next);
    setPendientesPage(1);
  }

  const [pendientesPage, setPendientesPage] = useState(1);
  const [pendientesPageSize, setPendientesPageSize] = useState(pendientes.pageSize);
  const { data: pendientesData, error: pendientesError } = useSWR(
    ["cierres-bodega:pendientes", pendientesPage, pendientesPageSize, filtros],
    () => leerPendientes(pendientesPage, pendientesPageSize, filtros),
    {
      // El `fallbackData` del Server Component solo vale SIN filtros: con un filtro puesto, la
      // página 1 pre-cargada es la del conjunto sin filtrar, y servirla sería enseñar cierres
      // que el filtro excluye.
      fallbackData:
        pendientesPage === 1 &&
        pendientesPageSize === pendientes.pageSize &&
        sinFiltrosBodega(filtros)
          ? pendientes
          : undefined,
    },
  );
  const colaPendientes: CierresBodegaColaPagina = pendientesData ?? {
    items: [],
    total: 0,
    pageSize: pendientesPageSize,
  };
  // R44: el esqueleto sólo cuando NO hay nada que pintar. `isLoading` de SWR sigue en `true`
  // mientras revalida aunque haya `fallbackData`, y usarlo tal cual haría que la página 1 —la
  // que el Server Component ya resolvió— apareciera como esqueleto antes de enseñar sus filas.
  const pendientesCargando = pendientesData === undefined;

  /** R11-R13: abre el detalle agregado (pide totales + gestiones + evidencias firmadas). */
  async function abrirDetalle(cierreBodegaId: string) {
    const result = await verCierreBodegaDetalle({ cierreBodegaId });
    if (result.status === "ok") {
      setDetalle(result);
      return;
    }
    if (result.status === "no_encontrada") {
      toast.error("El cierre de bodega ya no está disponible. Actualizando la lista.");
      refrescarListas();
      return;
    }
    if (result.status === "forbidden") {
      toast.error("No tenés permiso para ver este cierre de bodega.");
      return;
    }
    if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Iniciá sesión de nuevo.");
      return;
    }
    // validation_error (id malformado) u otro → feedback genérico.
    toast.error("No se pudo abrir el detalle del cierre de bodega. Intentá de nuevo.");
  }

  function cerrarDetalle() {
    setDetalle(null);
  }

  /**
   * Pedido humano del 2026-08-19 — aprobar o rechazar tiene que dejarse ver en la cola.
   * `router.refresh()` sólo re-resuelve el Server Component, y su página llega acá como
   * `fallbackData`: SWR ya tiene datos y no la vuelve a mirar, así que el cierre resuelto
   * seguía en la lista. Se revalidan todas las páginas/filtros de la cola, no sólo la
   * visible: la fila resuelta puede estar en cualquiera de ellas.
   */
  function refrescarListas() {
    // SL-44 (destapado por el E2E `cierre-bodega-satelite`): también «Resueltos». Marcar mueve la
    // consolidación de una pestaña a la otra (y desmarcar, de vuelta), y las dos pestañas siguen
    // montadas con su caché: revalidando solo la cola, la marcada no aparecía en «Resueltos» (ni
    // la desmarcada salía de allí) hasta recargar. Mismo par que `CierresAdminModule`.
    void mutate(
      (clave) =>
        Array.isArray(clave) &&
        (clave[0] === "cierres-bodega:pendientes" || clave[0] === "cierres-bodega:resueltos"),
    );
    router.refresh();
  }

  // ⭑ FICHA 431 (T17, R16/D2) — AQUI VIVIAN `confirmarAprobacion`, `confirmarRechazo` y su
  // traductor de errores. Los tres se retiran de ESTA pantalla, que era su unica boca.
  //
  // QUE LOS SUSTITUYE: `ConciliacionAcciones`, el mismo componente que monta el desglose de
  // `/wallet/satelites`. Es la MISMA accion sobre la MISMA fila —marcar que el efectivo llego—,
  // y dos copias acabarian diciendo cosas distintas sobre si el dinero esta en la central.
  // Lleva su propio manejo de `conflict` / `no_encontrada` / `forbidden`, asi que el traductor
  // de aqui se iba con ellas: mantenerlo habria dejado dos vocabularios de error para la misma
  // operacion.
  //
  // «RECHAZAR» NO TIENE SUSTITUTO, Y ES EL PUNTO (R16): no se rechaza una consolidacion, se
  // marca si llego o no. Lo reversible es la MARCA, y eso lo hace «Desmarcar», que no es lo
  // mismo —desmarcar no manda a nadie a corregir nada, solo dice «esto todavia no ha llegado»—.
  // Las `rechazado` historicas se quedan en la base (cero en produccion) y dejan de tener
  // rotulo en pantalla.
  //
  // El refresco de las listas (`refrescarListas`) SI se conserva: la fila marcada se mueve de
  // pestaña igual que antes se movia al aprobar.

  /** SLT-104: la vista del detalle, una vez por detalle abierto (no en cada render). */
  const vista = useMemo(() => (detalle ? vistaBodegaDesdeAdmin(detalle) : null), [detalle]);

  return (
    // `gap-4`: la barra de filtros y las pestañas son una cabecera, no dos secciones.
    <section
      aria-label="Cierres de bodega satélite"
      className="flex flex-col gap-4"
    >
      {/* ---------- Pestañas: pendientes / resueltos (pedido humano del 2026-08-16) ----------
          Solo «Pendientes» lleva conteo, y la asimetría es deliberada: su `total` lo tiene ESTE
          módulo (viene del servidor, R42), mientras que el de los resueltos vive dentro de
          `CierresBodegaResueltosLista`, que pide su propia página. Antes que inventar aquí un
          número —o subir el estado de aquel listado solo para pintarlo— la pestaña se queda sin
          él: un conteo equivocado en una cola de dinero es peor que ninguno. */}
      <FiltrosCierresBarra
        catalogo={catalogoFiltros}
        onChange={aplicarFiltros}
        disabled={pendientesCargando}
        sinMensajero
      />

      {/* La descarga va ALINEADA con las pestañas, y es la de la pestaña ACTIVA. */}
      {/* `pb-1` (pedido humano del 2026-08-16): el grupo segmentado se estaba viendo cortado
          por abajo. Su borde y su anillo de foco se salen del alto nominal del botón, y sin
          este respiro el contenedor de la fila los recorta. */}
<div className="flex flex-wrap items-center justify-between gap-2 pb-1">
        <SegmentedToggle
          options={[
            {
              valor: TAB_PENDIENTES,
              etiqueta: TAB_PENDIENTES_LABEL,
              conteo: colaPendientes.total,
            },
            { valor: TAB_RESUELTOS, etiqueta: TAB_RESUELTOS_LABEL },
          ]}
          valor={tab}
          onChange={setTab}
          ariaLabel={TABS_BODEGA_LABEL}
        />
        <div className="flex flex-wrap items-center gap-2">
          {/* UN SOLO botón, el mismo control que monta `CierresAdminModule` y con la MISMA
              declaración de columnas para el detalle (R26); lo único que cambia es la Server
              Action, porque el conjunto es otro: acá salen las gestiones de los cierres del día
              ya CONSOLIDADOS en un cierre de bodega —las bodegas satélite—, que en la otra
              pantalla el maestro no ve (design §2.6).

              Los controles de descarga de los OTROS listados de esta pantalla no se tocan: no
              tienen equivalente detallado, así que no hay nada que unificar en ellos. */}
          <DescargarCierresButton
            resumen={
              tab === TAB_PENDIENTES
                ? descargaColaBodega(filtros)
                : descargaBodegaResueltos(filtros)
            }
            catalogo={catalogoFiltros}
            accion={(f) => descargarDatos("listarGestionesCierresBodegaCompleto", f)}
            disabled={pendientesCargando}
            audiencia={audiencia}
          />
        </div>
      </div>

      <PanelConmutado activo={tab === TAB_PENDIENTES} ariaLabel={TAB_PENDIENTES_LABEL}>
      {/* ---------- Cola de pendientes (R15) ---------- */}
      <section
        aria-label="Cierres de bodega pendientes"
        className="flex flex-col gap-3"
      >
        {/* SIN ENCABEZADO VISIBLE (pedido humano del 2026-08-16): la pestaña de arriba ya lo
            dice, y repetirlo dos centímetros más abajo no añade nada. El `aria-label` de la
            sección SÍ se queda: sigue haciendo falta un nombre para quien no ve la pantalla, y
            es por él por el que la localizan los tests y el E2E.

            EL CONTADOR NO SE PIERDE, se mudó a la pestaña, y sigue saliendo del TOTAL del
            servidor (R42) — lo vigila `contadores-cabecera.guardia.test.ts`. */}
        {/* Pedido humano del 2026-08-16: la cola se lee como COMPROBANTES. Cada cierre de
            bodega es la misma hoja compacta que el maestro ya usaba para los cierres del día,
            con las partes propias de una bodega (zona y quién solicitó) y, en su desglose,
            cuántos cierres del día consolida. */}
        <ListaComprobantes
          ariaLabel="Cierres de bodega pendientes"
          items={colaPendientes.items}
          clave={(c) => c.cierreBodegaId}
          isLoading={pendientesCargando}
          error={pendientesError ? ERROR_CARGA_PENDIENTES : null}
          emptyMessage="No hay cierres de bodega pendientes de decisión."
          render={(c) => (
            <CierreBodegaFacturaResumen
              cierre={c}
              acciones={
                <Button
                  type="button"
                  size="sm"
                  aria-label={`Ver / decidir el cierre de bodega de ${c.zonaNombre}`}
                  onClick={() => abrirDetalle(c.cierreBodegaId)}
                >
                  Ver / decidir
                </Button>
              }
            />
          )}
        />

        <Pagination
          page={pendientesPage}
          pageSize={pendientesPageSize}
          total={colaPendientes.total}
          disabled={pendientesCargando}
          showFirstLast
          siblingCount={1}
          ariaLabel={PAGINACION_BODEGA_PENDIENTES_LABEL}
          onPageChange={setPendientesPage}
          onPageSizeChange={(s) => {
            setPendientesPageSize(s);
            setPendientesPage(1);
          }}
          pageSizeOptions={PAGE_SIZE_OPTIONS}
        />
      </section>

      </PanelConmutado>

      <PanelConmutado activo={tab === TAB_RESUELTOS} ariaLabel={TAB_RESUELTOS_LABEL}>
        {/* ---------- Histórico (solo lectura, R15) ----------
            Feature 170 — FASE 2 (T I.2): el listado, su control de paginación y su descarga
            viven en su propio componente (ver la cabecera de `CierresBodegaResueltosLista`). */}
        <CierresBodegaResueltosLista initialData={historico} onAbrir={abrirDetalle} />
      </PanelConmutado>

      {/* ---------- Detalle del cierre de bodega (SLT-104: R40, R111-R119) ----------
          El detalle único de SLT-95 con `tipo` bodega, audiencia central y marco modal, en lugar del
          `Modal` de antes con sus paneles sueltos (R118). El modo sale de la marca de conciliación
          (`modoBodegaDe`); qué pinta el pie lo decide `accionesDe` con el nodo de la conciliación,
          que es `ConciliacionAcciones` tal cual (ficha 431: mismo botón para la misma fila; PA5).
          Lo de cada cierre del día (sus cascadas, su «Por tienda») vive en su propio detalle, al que
          lleva «Ver su cierre» (R42, R115). */}
      {detalle && vista ? (
        <DetalleCierre
          tipo="bodega"
          marco="modal"
          audiencia="central"
          detalle={vista}
          modo={modoBodegaDe(detalle.cierre)}
          pestanas={{
            // R31, R41, R113: la lista única, en «solo lectura» (sin corregir ni ajustar; evidencia
            // y, para la central, fulfillment), con la columna Mensajero. La fecha de la nota de
            // tarifas va por gestión, la de SU cierre del día (PA3, R120).
            gestiones: (
              <GestionesCierre
                gestiones={gestionesDeBodega(detalle.cierres)}
                audiencia="solo lectura"
                columnaMensajero
                // FICHA 481 — fulfillment SOLO para la central.
                quienMiraEsCentral={audiencia === "admin"}
                congeladoAt={null}
                acciones={{}}
                onVerEvidencia={setEvidencia}
                descargar={
                  <DescargarDatasetButton
                    titulo={tituloDescargaGestiones(folioDe(detalle.cierre.cierreBodegaId))}
                    columnas={COLUMNAS_DESCARGA_DETALLE_BODEGA}
                    obtenerFilas={async () => ({
                      status: "ok",
                      filas: gestionesDeBodega(detalle.cierres).map((i) =>
                        filaDescargaDetalleBodega(i.gestion, i.mensajeroNombre),
                      ),
                    })}
                  />
                }
              />
            ),
            mensajeros: (
              <MensajerosCierreBodega
                filas={filasMensajeros(detalle.cierres)}
                // R115: se cierra el detalle de bodega y se abre el del cierre del día por su enlace.
                onVerSuCierre={(href) => {
                  cerrarDetalle();
                  router.push(href);
                }}
              />
            ),
            conciliacion: <ConciliacionCierreBodega detalle={vista} />,
          }}
          acciones={{
            // R112 — sin permiso no se monta: el pie queda solo con «Cerrar».
            conciliacion: puedeConciliar ? (
              <ConciliacionAcciones
                cierreBodegaId={detalle.cierre.cierreBodegaId}
                bodega={detalle.cierre.zonaNombre}
                fecha={fechaCalendarioCR(new Date(detalle.cierre.solicitadoAt))}
                declarado={detalle.cierre.paraLaCentral}
                marca={detalle.cierre}
                nota={detalle.cierre.conciliadoNota}
                puedeConciliar={puedeConciliar}
                onCambio={() => {
                  cerrarDetalle();
                  refrescarListas();
                }}
              />
            ) : undefined,
          }}
          onCerrar={cerrarDetalle}
        />
      ) : null}

      {/* ---------- Visor de evidencia (URL firmada, R12) ---------- */}
      <VisorEvidencia url={evidencia} onClose={() => setEvidencia(null)} />
    </section>
  );
}
