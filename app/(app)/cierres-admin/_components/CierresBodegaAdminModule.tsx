"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Pagination } from "@/components/shared/Pagination";
import {
  CATALOGO_FILTROS_CIERRES_VACIO,
  type CatalogoFiltrosCierresDTO,
  type FiltrosCierresBodega,
} from "@/lib/types/filtros-cierres";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
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
  listarHistoricoCierresBodegaPaginado,
} from "@/lib/actions/cierre-bodega";
import type { CierreBodegaResumen } from "@/lib/interfaces/services/ICierreBodegaService";
import type { CierreBodegaDetalleServiceResult } from "@/lib/interfaces/services/ICierresBodegaAdminService";
// SLT-104 «Detalle de cierre de bodega en el detalle único (central)» — el detalle único de SLT-95
// con `tipo` bodega sustituye al `Modal` de antes y sus paneles (R40, R118). SLT-107: su montaje es
// común con la satélite (R295).
import { DetalleCierreBodegaAbierto } from "@/components/private/cierres/detalle/DetalleCierreBodegaAbierto";
// SLT-127 «Cola de bodega de la central con la cola única»: la misma cola que mensajeros (R133).
import { ColaCierres } from "@/components/private/cierres/cola/ColaCierres";
import * as L from "@/components/private/cierres/cola/cola-cierres-labels";
import {
  VisorEvidencia,
  type EvidenciaAbierta,
} from "@/components/private/cierres/dialogos/VisorEvidencia";
import {
  DescargarCierresButton,
  type DescargaResumenCierres,
} from "./DescargarCierresButton";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";
import {
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
import { PARAM_CIERRE_BODEGA } from "./cierre-enlace";
import { obtenerResumenCierresBodega } from "./cierres-bodega-modelo-nuevo-descarga";

/** Nombre visible de la cola: hoja, base del archivo y nombre del control (R12/R13). */
const TITULO_DESCARGA_PENDIENTES = "Cierres de bodega pendientes";
/**
 * Nombres accesibles de los dos controles de paginación (R43). SLT-127 (PA-P): dicen lo mismo que
 * su pestaña y su región.
 */
export const PAGINACION_POR_CONCILIAR_LABEL = "Paginación de los cierres de bodega por conciliar";
export const PAGINACION_CONCILIADOS_LABEL = "Paginación de los cierres de bodega conciliados";

/** `true` si el objeto no recorta nada: entonces la página pre-cargada del servidor sirve. */
function sinFiltrosBodega(filtros: FiltrosCierresBodega): boolean {
  return Object.values(filtros).every((v) => v === undefined);
}

// --- Las dos pestañas de la cola (SLT-127, R127): ids internos de `ColaCierres` ---
const TAB_PENDIENTES = "pendientes";
const TAB_RESUELTOS = "resueltos";
type TabBodega = typeof TAB_PENDIENTES | typeof TAB_RESUELTOS;

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

/** SLT-127 (R127, R128): una página de «Conciliados», con los mismos filtros que la cola. */
async function leerConciliados(
  page: number,
  pageSize: number,
  filtros: FiltrosCierresBodega,
): Promise<CierresBodegaResueltosPagina> {
  const res = await listarHistoricoCierresBodegaPaginado({ page, pageSize, filtros });
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
export function descargaColaBodega(
  filtros: FiltrosCierresBodega,
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaResumenCierres {
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
    // SLT-141 (R384, R385): con cierres de bodega del modelo nuevo, el libro «Cierres» + «Por tienda»
    // (+ la hoja de hoy como «Cierres modelo anterior» si es mixto); sin ellos, el archivo de hoy.
    obtenerFilasConColumnas: (columnasMarcadas) =>
      obtenerResumenCierresBodega(
        () => descargarDatos("listarPendientesCierresBodegaCompleto", { filtros }),
        filaDescargaBodegaPendiente,
        columnasMarcadas,
        audiencia,
      ),
  };
}

/**
 * SLT-114 (R238) — abre el detalle del cierre de bodega que nombra `?cierreBodega=`, el gemelo de
 * `AbrirCierreDeLaUrl` de `CierresAdminModule`. No lee filas: llama al MISMO `abrirDetalle` de la
 * cola, así que la lectura, el montaje y los avisos de error son los de «Ver / decidir».
 *
 * Una vez por navegación: el `ref` recuerda el id ya abierto para que los re-renders que provoca
 * abrirlo no lo vuelvan a abrir, y se borra cuando el parámetro desaparece (al cerrar).
 */
function AbrirCierreBodegaDeLaUrl({
  cierreBodegaId,
  onAbrir,
}: Readonly<{ cierreBodegaId: string | null; onAbrir: (cierreBodegaId: string) => void }>) {
  const abiertoPorUrl = useRef<string | null>(null);

  useEffect(() => {
    if (cierreBodegaId === null) {
      abiertoPorUrl.current = null;
      return;
    }
    if (abiertoPorUrl.current === cierreBodegaId) return;
    abiertoPorUrl.current = cierreBodegaId;
    onAbrir(cierreBodegaId);
  }, [cierreBodegaId, onAbrir]);

  return null;
}

export function CierresBodegaAdminModule({
  pendientes,
  historico,
  catalogoFiltros = CATALOGO_FILTROS_CIERRES_VACIO,
  puedeConciliar = false,
  audiencia = "satelite",
}: Readonly<CierresBodegaAdminModuleProps>) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  // Detalle del cierre de bodega abierto (null = modal cerrado).
  const [detalle, setDetalle] = useState<DetalleAbierto | null>(null);
  // Evidencia (URL firmada, R12) en el visor; null = cerrado.
  const [evidencia, setEvidencia] = useState<EvidenciaAbierta | null>(null);
  // Sub-modal de rechazo (R17): true = abierto.

  // Motivo del rechazo (obligatorio, R17) + su error de validación.

  // Feature 170 — FASE 2 (T J.2, R40/R42/R43): página visible de la COLA. El control vive
  // AQUÍ, en el módulo, junto al contador (decisión de Q-I6): así la guardia de T H.3 ve esta
  // pantalla como paginada y vigila de verdad que el número salga del `total` del servidor.
  //
  // R50: el estado de esta pantalla —el detalle abierto, el motivo tecleado— vive en los
  // `useState` de arriba, que la página no toca. Cambiar de página no los reinicia.
  /**
   * Pedido humano del 2026-08-16 — cola e histórico pasan a ser PESTAÑAS. SLT-127 (R127): arranca
   * en «Por conciliar», la que tiene dinero esperando. Cambiar de pestaña no toca filtros ni páginas.
   */
  const [tab, setTab] = useState<TabBodega>(TAB_PENDIENTES);

  /**
   * Pedido humano del 2026-08-16 — «en la parte de bodega deja el mismo filtro solo omitiendo el
   * de mensajero». Misma barra, mismo catálogo de bodegas (GAM + las que tienen admin de zona) y
   * los mismos atajos de fecha que `/ordenes`; lo que no se ofrece es el mensajero, porque un
   * cierre de bodega consolida los de varios y el dato no existe.
   */
  const [filtros, setFiltros] = useState<FiltrosCierresBodega>({});

  /**
   * Filtrar devuelve LAS DOS listas a su página 1 (R128): pedir la 7 de un conjunto recién
   * recortado da vacío.
   */
  function aplicarFiltros(next: FiltrosCierresBodega) {
    setFiltros(next);
    setPendientesPage(1);
    setConciliadosPage(1);
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

  // SLT-127 (R127, R128): la página de «Conciliados» sube al módulo, con los filtros de la barra,
  // para que la pestaña cuente con su `total`. La clave conserva el prefijo
  // `cierres-bodega:resueltos`: es la que revalida `refrescarListas` (SL-44).
  const [conciliadosPage, setConciliadosPage] = useState(1);
  const [conciliadosPageSize, setConciliadosPageSize] = useState(historico.pageSize);
  const { data: conciliadosData, error: conciliadosError } = useSWR(
    ["cierres-bodega:resueltos", conciliadosPage, conciliadosPageSize, filtros],
    () => leerConciliados(conciliadosPage, conciliadosPageSize, filtros),
    {
      // Igual que la cola: la página pre-cargada solo vale sin filtros.
      fallbackData:
        conciliadosPage === 1 &&
        conciliadosPageSize === historico.pageSize &&
        sinFiltrosBodega(filtros)
          ? historico
          : undefined,
    },
  );
  const conciliadosPagina: CierresBodegaResueltosPagina = conciliadosData ?? {
    items: [],
    total: 0,
    pageSize: conciliadosPageSize,
  };
  const conciliadosCargando = conciliadosData === undefined;
  const porConciliar = tab === TAB_PENDIENTES;

  /**
   * R11-R13: abre el detalle agregado (pide totales + gestiones + evidencias firmadas). Devuelve si
   * se abrió: el enlace `?cierreBodega=` lo necesita para limpiar la dirección cuando falla.
   */
  async function abrirDetalle(cierreBodegaId: string): Promise<boolean> {
    const result = await verCierreBodegaDetalle({ cierreBodegaId });
    if (result.status === "ok") {
      setDetalle(result);
      return true;
    }
    if (result.status === "no_encontrada") {
      toast.error("El cierre de bodega ya no está disponible. Actualizando la lista.");
      refrescarListas();
      return false;
    }
    if (result.status === "forbidden") {
      toast.error("No tienes permiso para ver este cierre de bodega.");
      return false;
    }
    if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
      return false;
    }
    // validation_error (id malformado) u otro → feedback genérico.
    toast.error("No se pudo abrir el detalle del cierre de bodega. Inténtalo de nuevo.");
    return false;
  }

  /**
   * SLT-114 (R238, review 1) — el detalle que pide `?cierreBodega=`. Si la lectura falla, el
   * parámetro también sale de la dirección: si no, recargar repetiría el mismo aviso de error.
   */
  async function abrirDetalleDeLaUrl(cierreBodegaId: string) {
    const abierto = await abrirDetalle(cierreBodegaId);
    if (!abierto) limpiarCierreBodegaDeLaUrl();
  }

  /**
   * SLT-114 (R238) — saca `?cierreBodega=` de la dirección al cerrar, con `replace` y conservando el
   * resto: si no, recargar volvería a abrir el detalle recién cerrado. El detalle abierto desde la
   * cola no toca la URL, así que cerrarlo tampoco.
   */
  function limpiarCierreBodegaDeLaUrl() {
    if (searchParams.get(PARAM_CIERRE_BODEGA) === null) return;
    const parametros = new URLSearchParams(
      [...searchParams.entries()].filter(([clave]) => clave !== PARAM_CIERRE_BODEGA),
    );
    const cadena = parametros.toString();
    router.replace(cadena ? `${pathname}?${cadena}` : pathname, { scroll: false });
  }

  function cerrarDetalle() {
    limpiarCierreBodegaDeLaUrl();
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

  return (
    // `gap-4`: la barra de filtros y las pestañas son una cabecera, no dos secciones.
    <section
      aria-label="Cierres de bodega satélite"
      className="flex flex-col gap-4"
    >
      <AbrirCierreBodegaDeLaUrl
        cierreBodegaId={searchParams.get(PARAM_CIERRE_BODEGA)}
        onAbrir={(id) => void abrirDetalleDeLaUrl(id)}
      />

      {/* ---------- La cola única (SLT-127, R133) ----------
          `ColaCierres` con `tipo` bodega: descripción, pestañas «Por conciliar» / «Conciliados» con
          conteo, UNA barra para las dos listas con «Descargar» a su derecha, la tabla de la pestaña
          activa y el pie. El estado sigue aquí: filtros, pestaña, página y tamaño de cada lista.

          LOS CONTEOS salen del `total` del SERVIDOR (R42, R127), nunca de `items.length`. Lo
          vigila `tests/unit/descarga/contadores-cabecera.guardia.test.ts`. */}
      <ColaCierres
        tipo="bodega"
        rol="central"
        descripcion={L.DESCRIPCION_BODEGA_CENTRAL}
        pestanas={[
          { id: TAB_PENDIENTES, label: L.PESTANA_POR_CONCILIAR, conteo: colaPendientes.total },
          { id: TAB_RESUELTOS, label: L.PESTANA_CONCILIADOS, conteo: conciliadosPagina.total },
        ]}
        pestanaActiva={tab}
        onPestana={setTab}
        barra={
          // Sin mensajero (pedido humano del 2026-08-16): un cierre de bodega consolida varios.
          <FiltrosCierresBarra
            catalogo={catalogoFiltros}
            onChange={aplicarFiltros}
            disabled={pendientesCargando || conciliadosCargando}
            sinMensajero
          />
        }
        descargar={
          // UN SOLO botón, el mismo control que monta `CierresAdminModule` y con la MISMA
          // declaración de columnas para el detalle (R26); el «Resumen» es el de la pestaña activa.
          // Lo que cambia es la Server Action: aquí salen las gestiones de los cierres del día ya
          // CONSOLIDADOS en un cierre de bodega (design §2.6).
          <DescargarCierresButton
            resumen={
              porConciliar
                ? descargaColaBodega(filtros, audiencia)
                : descargaBodegaResueltos(filtros, audiencia)
            }
            catalogo={catalogoFiltros}
            accion={(f) => descargarDatos("listarGestionesCierresBodegaCompleto", f)}
            disabled={pendientesCargando || conciliadosCargando}
            audiencia={audiencia}
          />
        }
        filas={porConciliar ? colaPendientes.items : conciliadosPagina.items}
        cargando={porConciliar ? pendientesCargando : conciliadosCargando}
        error={
          porConciliar
            ? pendientesError
              ? L.ERROR_POR_CONCILIAR
              : null
            : conciliadosError
              ? L.ERROR_CONCILIADOS
              : null
        }
        vacio={porConciliar ? L.VACIO_POR_CONCILIAR : L.VACIO_CONCILIADOS}
        region={porConciliar ? L.REGION_POR_CONCILIAR : L.REGION_CONCILIADOS}
        acciones={{ abrir: abrirDetalle }}
        pie={porConciliar ? L.PIE_POR_CONCILIAR : undefined}
        paginacion={
          porConciliar ? (
            <Pagination
              page={pendientesPage}
              pageSize={pendientesPageSize}
              total={colaPendientes.total}
              disabled={pendientesCargando}
              showFirstLast
              siblingCount={1}
              ariaLabel={PAGINACION_POR_CONCILIAR_LABEL}
              onPageChange={setPendientesPage}
              onPageSizeChange={(s) => {
                setPendientesPageSize(s);
                setPendientesPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          ) : (
            <Pagination
              page={conciliadosPage}
              pageSize={conciliadosPageSize}
              total={conciliadosPagina.total}
              disabled={conciliadosCargando}
              showFirstLast
              siblingCount={1}
              ariaLabel={PAGINACION_CONCILIADOS_LABEL}
              onPageChange={setConciliadosPage}
              onPageSizeChange={(s) => {
                setConciliadosPageSize(s);
                setConciliadosPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )
        }
      />

      {/* ---------- Detalle del cierre de bodega (SLT-104: R40, R111-R119) ----------
          El detalle único de SLT-95 con `tipo` bodega, audiencia central y marco modal, en lugar del
          `Modal` de antes con sus paneles sueltos (R118). El modo sale de la marca de conciliación
          (`modoBodegaDe`); qué pinta el pie lo decide `accionesDe` con el nodo de la conciliación,
          que es `ConciliacionAcciones` tal cual (ficha 431: mismo botón para la misma fila; PA5).
          Lo de cada cierre del día (sus cascadas, su «Por tienda») vive en su propio detalle, al que
          lleva «Ver su cierre» (R42, R115). */}
      {detalle ? (
        // SLT-107 (R295): el montaje es el común con la satélite; la central le pasa su audiencia
        // y, con permiso, `ConciliacionAcciones` tal cual (ficha 431: mismo botón para la misma fila).
        <DetalleCierreBodegaAbierto
          detalle={detalle}
          // M1 (ficha 431/481): la audiencia la decide el servidor (`esAccesoTotal`) y entra por
          // prop; un literal le abriría a un no-admin lo que es solo de la central (Fulfillment).
          audiencia={audiencia === "admin" ? "central" : "satelite"}
          conciliacion={
            // R112 — sin permiso no se monta: el pie queda solo con «Cerrar».
            puedeConciliar ? (
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
            ) : undefined
          }
          onCerrar={cerrarDetalle}
          // R115: se cierra el detalle de bodega y se abre el del cierre del día por su enlace.
          onVerSuCierre={(href) => {
            cerrarDetalle();
            router.push(href);
          }}
          onVerEvidencia={setEvidencia}
        />
      ) : null}

      {/* ---------- Visor de evidencia (URL firmada, R12) ---------- */}
      <VisorEvidencia evidencia={evidencia} onClose={() => setEvidencia(null)} />
    </section>
  );
}
