"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import useSWR, { useSWRConfig } from "swr";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/shared/Modal";
import {
  VisorEvidencia,
  type EvidenciaAbierta,
} from "@/components/private/cierres/dialogos/VisorEvidencia";
import { Pagination } from "@/components/shared/Pagination";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import { useToast } from "@/hooks/useToast";
import { cierreConfig } from "@/lib/config/cierre";
import {
  verCierreDetalle,
  aprobarCierre,
  rechazarCierre,
  forzarSolicitudVencido,
  listarHistoricoCierresAdminPaginado,
  listarPendientesCierresAdminPaginado,
} from "@/lib/actions/cierres-admin";
import type { CierreAdminResumen } from "@/lib/interfaces/services/ICierresAdminService";
// FICHA 396: el desglose por tienda viaja YA DERIVADO y YA ORDENADO en el detalle. El tipo se
// pide donde vive la identidad que particiona, igual que hace `ICierresAdminService`.
import type { ParteDeTienda } from "@/lib/utils/ingreso-empresa";
import type {
  CatalogoFiltrosCierresDTO,
  FiltrosCierres,
} from "@/lib/types/filtros-cierres";
import {
  CATALOGO_FILTROS_CIERRES_VACIO,
  sinFiltros,
} from "@/lib/types/filtros-cierres";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreOrdenSinGestion,
  CierreRechazoDeTienda,
  TotalesIngresoEmpresa,
} from "@/lib/interfaces/services/ICierreDiaService";
import { montoValido } from "@/app/(app)/wallet/_components/wallet-labels";
// Feature 158 (m5 del review): el tope del monto se IMPORTA del borde del servidor, no se
// reescribe. Sale de la precisión de la columna (`DECIMAL(12,2)` → 9999999999.99); si algún
// día cambia, un literal duplicado aquí se quedaría desalineado en silencio y volvería el
// mismo callejón: el cliente habilitando un monto que la transacción no puede escribir.
import { INDEMNIZACION_MONTO_MAX } from "@/lib/types/cierres-admin";
// Feature 158/R34: la etiqueta visible de la causa sale del catálogo derivado del SEED (mismo
// módulo que usa el panel del mensajero para capturarla). El admin decide el monto MIRANDO la
// causa: no puede ser un slug crudo ni, peor, no estar.
import { CAUSA_INCIDENTE_LABEL } from "@/app/(app)/mis-asignaciones/_components/causa-incidente-options";
// Feature 238 (T4.1, design §5.1): la ventana de confirmación física. El CUERPO vive en su
// propio archivo (es presentación); el estado y la decisión de cuándo se abre viven acá, que
// es donde ya viven los otros tres modales de esta pantalla.
import {
  ConfirmacionFisicaCuerpo,
  interpretarLectura,
  progresoDePaquetes,
  filasAConfirmar,
  filasDelCierre,
  entradasDeConfirmacion,
  CONFIRMACION_TITULO,
  CONFIRMACION_DETALLE,
  CONFIRMACION_CONTINUAR,
  CONFIRMACION_APROBAR,
  type EntradaConfirmacionFisica,
  type FilaAConfirmar,
  type MedioDeCaptura,
} from "./cierre-confirmacion-fisica";
// `moneyTope` lo usan los mensajes de la indemnizacion (feature 230 de `dev`); los tres
// simbolos de tabla que `dev` importaba aqui se fueron con la tira de comprobantes.
import { moneyTope } from "./cierre-detalle-shared";
// SLT-100 «Detalle de cierre único en /cierres-admin (mensajeros)» (R38): el detalle del cierre es
// el componente único de SLT-95 (S1). Sustituye al modal que montaba `CascadasCierreMensajero` +
// `CierreFacturaDetalle`; de la hoja de hoy se reutilizan tal cual la lista de gestiones y la
// sección de órdenes sin gestionar. SLT-101: la lista de gestiones es la de `fila/` (R90).
import { SeccionSinGestion, type CierreFacturaAudiencia } from "./cierre-factura";
import { GestionesCierre } from "@/components/private/cierres/fila/GestionesCierre";
import { gestionesEnOrden } from "@/components/private/cierres/fila/fila-gestion-vista";
import type { AudienciaFila } from "@/components/private/cierres/fila/fila-gestion-vista";
import { DetalleCierre } from "@/components/private/cierres/detalle/DetalleCierre";
import { RechazosDeTiendaCierre } from "@/components/private/cierres/detalle/RechazosDeTiendaCierre";
import {
  folioDe,
  modoAdminDe,
  vistaMensajeroDesdeAdmin,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import { tituloDescargaGestiones } from "@/components/private/cierres/detalle/detalle-cierre-labels";
import {
  COLUMNAS_DESCARGA_DETALLE_CIERRE,
  filaDescargaDetalleCierre,
} from "@/components/private/cierres/detalle/detalle-cierre-descarga-columnas";
import { DescargarDatasetButton } from "@/components/shared/DescargarDatasetButton";
import {
  DescargarCierresButton,
  type DescargaResumenCierres,
} from "./DescargarCierresButton";
import { FiltrosCierresBarra } from "./FiltrosCierresBarra";
// SLT-102 «Cola de cierres única: mensajeros (central y satélite)» (R107): la cola única sustituye a
// los comprobantes, al conmutador segmentado y a los dos paneles.
import { ColaCierres } from "@/components/private/cierres/cola/ColaCierres";
import type { PestanaCola } from "@/components/private/cierres/cola/cola-cierres-vista";
import {
  PIE_PENDIENTES,
  descripcionCola,
} from "@/components/private/cierres/cola/cola-cierres-labels";
// FICHA 386: los nombres de las dos pestañas salieron a `cierre-labels` (módulo puro) porque
// `FiltrosCierresBarra` también los necesita —agrupa los estados del filtro por la lista en la que
// aparecen— y las dos superficies tienen que decir LA MISMA palabra.
import {
  TAB_PENDIENTES_LABEL,
  TAB_RESUELTOS_LABEL,
} from "./cierre-labels";
// Feature 205 (T6.1): el nombre del parámetro que hace direccionable un cierre. Sale del
// módulo compartido y no de un literal acá, porque quien construye el enlace vive en OTRA
// pantalla (`/wallet/mensajeros`) y renombrarlo en un solo lado dejaría el enlace mudo.
import { PARAM_CIERRE } from "./cierre-enlace";
import {
  ERROR_CARGA_HISTORICO,
  PAGINACION_HISTORICO_LABEL,
  VACIO_HISTORICO,
  descargaHistoricoCierres,
  type CierresAdminHistoricoPagina,
} from "./CierresAdminHistoricoLista";
import {
  AMBITO_DESCARGA_CIERRES_PENDIENTES,
  COLUMNAS_DESCARGA_CIERRES_PENDIENTES,
  filaDescargaCierrePendiente,
} from "./cierres-admin-descarga-columnas";
import type { AudienciaDescargaGestionesFundida } from "./cierres-gestiones-fundida-descarga-columnas";
import { obtenerResumenCierres } from "./cierres-resumen-modelo-nuevo-descarga";
// Feature 172 (TANDA E): el pago al mensajero. Tres piezas, ninguna con lógica de dominio
// propia — el pendiente lo deriva el servidor (T C.2) y el rol lo decide el servicio (R1/R6).
import { hayPendienteDeLiquidar } from "./PendienteLiquidarBadge";
import {
  PagoMensajeroSeccion,
  clavePagosDeCierre,
} from "./PagoMensajeroSeccion";
import { RegistrarPagoMensajeroDialog } from "./RegistrarPagoMensajeroDialog";
import { CorregirPagosDialog } from "./CorregirPagosDialog";
import { CorregirResultadoDialog } from "./CorregirResultadoDialog";
import {
  AjustarPagoMensajeroDialog,
  type AjustePagoAplicado,
} from "./AjustarPagoMensajeroDialog";
import { descargarDatos } from "@/components/shared/descarga-datos";

// Feature 38 (T13, R3-R11): módulo cliente de "Cierres del día" del admin. Recibe
// del Server Component padre los cierres del alcance ya resueltos (pendientes de
// decisión + histórico de solo lectura) y `sinZona`. Al abrir un cierre pide el
// detalle por Server Action (evidencias firmadas, R7) y muestra los totales
// snapshot (R8) + las 4 secciones por resultado (reuso del render de la 37, R6).
// Las decisiones (aprobar/rechazar) van por Server Action y refrescan la ruta. Los
// montos llegan como STRING (money-safe, R9): se renderizan tal cual, sin
// `parseFloat`/`Number`. Los helpers de detalle (money/columnas/etiquetas) viven en
// `cierre-detalle-shared` (compartidos con los módulos de cierre de bodega, feat 40).

/**
 * Feature 170 — FASE 2 (T J.2, R40/R41): la PÁGINA de la cola de pendientes, tal como la
 * devuelve el servidor. `total` es el del CONJUNTO —de él sale el contador de cabecera (R42)—
 * y nunca `items.length`.
 */
export interface CierresAdminColaPagina {
  items: CierreAdminResumen[];
  total: number;
  pageSize: number;
}

export interface CierresAdminModuleProps {
  /**
   * Feature 170 — FASE 2 (T J.2, R40/R41): PÁGINA 1 de los cierres `solicitado` del alcance
   * (cola de decisión, R4), ya resuelta server-side, más el `total` del conjunto.
   */
  pendientes: CierresAdminColaPagina;
  /**
   * Feature 170 — FASE 2 (T I.2, R40/R41): PÁGINA 1 del histórico de resueltos (R5), ya
   * resuelta server-side, más el `total` del conjunto. Deja de ser el array entero: ese es
   * justo el que crecía sin techo (design §11.3).
   */
  historico: CierresAdminHistoricoPagina;
  /** `true` si el adminSatelite no tiene zona asignada (R3). */
  sinZona: boolean;
  /**
   * Feature 172 (T E.1/T E.2, [P3]/R6) — `true` si el actor puede REGISTRAR pagos. Lo resuelve
   * el Server Component padre con el MISMO predicado (`esAccesoTotal`) que usa
   * `LiquidacionService` para responder `forbidden`: son las dos mitades del control de
   * acceso, y ninguna basta sola.
   *
   * Existe porque en esta pantalla **aprobar y pagar no son el mismo permiso**: un
   * `adminSatelite` aprueba los cierres de su zona y NO mueve dinero (respuesta P3 del humano).
   * Sin esta prop, la pantalla que aprueba sería la que paga.
   *
   * Opcional y con default `false` — FALLA CERRADO: un montaje que se olvide de pasarla no
   * ofrece pagar a nadie, en vez de ofrecérselo a todos.
   */
  puedeRegistrarPago?: boolean;
  /**
   * Pedido humano (2026-08-19) — permiso de CORREGIR el desglose de pago de una gestión de un
   * cierre abierto. Se resuelve server-side con el MISMO predicado que el servicio
   * (`esAccesoTotal`): maestro y admin, y nadie más.
   *
   * Es otra prop y no `puedeRegistrarPago` aunque hoy coincida el predicado: pagar un cierre
   * aprobado y corregir lo que un mensajero declaró son dos permisos distintos, y fundirlos
   * aquí haría que separarlos mañana exigiera desenredar la pantalla. Opcional y con default
   * `false` — FALLA CERRADO, igual que su vecina.
   */
  puedeCorregirPagos?: boolean;
  /**
   * FICHA 398 (R16) — permiso de CORREGIR EL RESULTADO de una gestión de un cierre abierto (una
   * entrega que nunca ocurrió pasa a rechazo). Lo resuelve el Server Component padre con el MISMO
   * predicado que exige el servicio (`esAccesoTotal`): maestro y admin, y nadie más. El mensajero
   * NUNCA, y menos éste: mueve dinero y quien se equivocó fue él.
   *
   * Es una TERCERA prop y no `puedeCorregirPagos`, siguiendo el argumento que ya dejó escrito su
   * vecina: repartir entre métodos un dinero que sí entró y borrar un cobro que no existió son
   * dos permisos distintos, y fundirlos aquí obligaría a desenredar la pantalla el día que se
   * separen. Opcional y con default `false` — FALLA CERRADO: un montaje que se olvide de pasarla
   * no se lo ofrece a nadie.
   */
  puedeCorregirResultado?: boolean;
  /**
   * SLT-56 (design §5; R1/R2/R21) — permiso de AJUSTAR el pago al mensajero de una gestión de un
   * cierre abierto. Lo calcula el Server Component padre como
   * `esAccesoTotal(rol) || rol === "adminSatelite"`: a diferencia de sus vecinas, el adminSatelite
   * SÍ ajusta (los cierres de su bodega; el alcance lo impone el servidor). Por eso es otra prop y
   * no `puedeCorregirPagos`. Opcional con default `false` — FALLA CERRADO.
   */
  puedeAjustarPagoMensajero?: boolean;
  /**
   * Pedido humano del 2026-08-16 — opciones de los filtros (bodegas destino y mensajeros), ya
   * acotadas al alcance del actor y resueltas por el Server Component: es una lectura de solo
   * catalogo, no depende del filtro aplicado y no tiene por que costar un viaje del cliente.
   *
   * Opcional con default VACIO: un montaje que se olvide de pasarla ofrece cero opciones —la
   * pantalla sigue funcionando sin filtrar— en vez de romperse.
   */
  catalogoFiltros?: CatalogoFiltrosCierresDTO;
  /**
   * FICHA 481 — para quién se pinta el comprobante del detalle: `admin` es la central (maestro y
   * admin), `satelite` el `adminSatelite`. Hoy solo cambia una cosa: el fulfillment de la fila
   * desplegada, que es dato de la central. Lo resuelve el Server Component padre con
   * `esAccesoTotal`. Default `satelite` — FALLA CERRADO: un montaje que se olvide de pasarla no
   * enseña el fulfillment a nadie.
   */
  audiencia?: Exclude<CierreFacturaAudiencia, "mensajero">;
  /**
   * SLT-102 (R106, PA3) — el nombre de la zona de quien mira, para la descripción de la cola
   * («Bodega satélite · Limón. …»). `null` u omitido = sin nombre («Bodega central. …»).
   */
  zonaNombre?: string | null;
}

/**
 * Feature 172 (T E.1, §8) — el diálogo de pago abierto. Guarda los tres datos que el diálogo
 * necesita porque, tras aprobar, el detalle ya se cerró cuando se abre: el cierre aprobado
 * desaparece de la cola y `detalle` vuelve a `null`.
 *
 * SLT-102 (R103): se abre también desde la fila de Resueltos («Registrar pago»), con
 * `trasAprobar: false` — sin «Ahora no», porque ahí no hay aprobación que separar del pago.
 *
 * Es estado EFÍMERO de pantalla, no un estado del cierre (R18): cerrarlo no persiste nada; el
 * pendiente se vuelve a derivar cada vez que alguien mira el cierre.
 */
interface PagoAbierto {
  cierreId: string;
  mensajeroNombre: string;
  /** El pendiente del servidor (de `aprobarCierre` o de la fila), STRING tal cual (R14). */
  pendiente: string;
  trasAprobar: boolean;
}

// --- Pedido humano del 2026-08-16: las dos mitades, en pestañas ---
const TAB_PENDIENTES = "pendientes";
const TAB_RESUELTOS = "resueltos";
type TabCierresAdmin = typeof TAB_PENDIENTES | typeof TAB_RESUELTOS;
// `TAB_PENDIENTES_LABEL` y `TAB_RESUELTOS_LABEL` se importan de `./cierre-labels` (ficha 386).
// El nombre del `tablist` («Cierres del día por estado») vive en `ColaCierres` (SLT-102).

/** Nombre visible de la cola: hoja, base del archivo y nombre del control (R12/R13). */
const TITULO_DESCARGA_PENDIENTES = "Cierres pendientes de decisión";
/** Nombre accesible del control de la COLA (R43). La pantalla monta varias tablas paginadas. */
export const PAGINACION_PENDIENTES_LABEL =
  "Paginación de los cierres del día pendientes";
const ERROR_CARGA_PENDIENTES = "No se pudieron cargar los cierres pendientes.";
const VACIO_PENDIENTES = "No hay cierres pendientes de decisión.";
/** Nombres de las regiones de cada pestaña (R104): los de hoy, por los que se localizan. */
const REGION_PENDIENTES = "Pendientes de decisión";
const REGION_HISTORICO = "Histórico";

// R40: el tamaño sale de la config del dominio (T H.1), nunca de un literal de pantalla, y
// las opciones nunca superan el máximo que el borde acepta.
const PAGE_SIZE_OPTIONS = [10, 25, 50].filter((s) => s <= cierreConfig.MAX_PAGE_SIZE);

/**
 * La configuración de descarga de la COLA, para que la monte la fila de las pestañas.
 *
 * Feature 170 (T J.2, R52) — el listado pinta UNA página; el archivo sigue siendo la COLA
 * COMPLETA del alcance del actor, y ese acotamiento lo pone el SERVIDOR desde la sesión: un
 * `adminSatelite` sigue descargando solo los cierres de su zona (R14/R44). Feature 184 — Tanda D
 * (T D.3, R1): sale de la lectura DEDICADA, que corta por estado en la base con el mismo
 * criterio y el mismo orden que la página, y cuyo tope de filas evalúa el servidor (R6).
 *
 * Pedido humano del 2026-08-16 — el archivo sale del MISMO conjunto que el listado enseña,
 * filtros incluidos: «descargar» significa «esto que estoy viendo, entero».
 *
 * El título no repite el del otro listado: dos controles en la misma pantalla necesitan nombres
 * accesibles distintos (R13).
 */
export function descargaColaCierres(
  filtros: FiltrosCierres,
  audiencia: AudienciaDescargaGestionesFundida,
): DescargaResumenCierres {
  return {
    titulo: TITULO_DESCARGA_PENDIENTES,
    columnas: COLUMNAS_DESCARGA_CIERRES_PENDIENTES,
    // Ficha 314: enciende el selector de columnas de esta descarga. Es un IDENTIFICADOR de
    // ámbito y nada más — aquí no se lee ni se escribe almacenamiento; de eso se encarga el
    // control común, que es quien conoce la clave.
    ambitoColumnas: AMBITO_DESCARGA_CIERRES_PENDIENTES,
    obtenerFilas: () =>
      filasDesdeResultado(
        descargarDatos("listarPendientesCierresAdminCompleto", { filtros }),
        filaDescargaCierrePendiente,
      ),
    // SLT-140 (R377/R378): con cierres del modelo nuevo, el libro «Cierres» + «Por tienda» (+ la hoja
    // de hoy como «Cierres modelo anterior» si es mixto); sin ellos, el archivo de hoy tal cual.
    obtenerFilasConColumnas: (columnasMarcadas) =>
      obtenerResumenCierres(
        () => descargarDatos("listarPendientesCierresAdminCompleto", { filtros }),
        filaDescargaCierrePendiente,
        columnasMarcadas,
        audiencia,
      ),
  };
}

/**
 * Feature 170 — FASE 2 (T I.2, R40/R41): una página del histórico. El alcance NO viaja en el
 * input —lo resuelve el servicio desde la sesión, igual que el listado sin paginar (R44)—;
 * aquí solo van el número de página, el tamaño y —desde el pedido humano del 2026-08-16— los
 * FILTROS, que recortan DENTRO de ese alcance y nunca lo ensanchan.
 */
async function leerHistorico(
  page: number,
  pageSize: number,
  filtros: FiltrosCierres,
): Promise<CierresAdminHistoricoPagina> {
  const res = await listarHistoricoCierresAdminPaginado({ page, pageSize, filtros });
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

/** Feature 170 — FASE 2 (T J.2): una página de la COLA, con el mismo criterio que el histórico. */
async function leerPendientes(
  page: number,
  pageSize: number,
  filtros: FiltrosCierres,
): Promise<CierresAdminColaPagina> {
  const res = await listarPendientesCierresAdminPaginado({ page, pageSize, filtros });
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total, pageSize: res.pageSize };
}

// --- Feature 158 (R19/R34): captura del monto de indemnización al aprobar. Textos
// separados de la lógica (i18n-ready), como el resto del módulo. ---
const INDEMNIZACION_TITULO = "Indemnizar los incidentes del cierre";
const INDEMNIZACION_DETALLE =
  "Este cierre trae paquetes dañados, perdidos o robados. Indica cuánto se indemniza por cada uno: al aprobar, la suma sale de la caja principal como un solo egreso.";
const INDEMNIZACION_CONFIRMAR = "Aprobar e indemnizar";
const INDEMNIZACION_MONTO_LABEL = "Monto de la indemnización";
/**
 * Feature 158 (m5 del review) — mensajes POR FILA del monto inválido. Dicen QUÉ corregir, no
 * sólo que está mal: un «monto inválido» deja al admin adivinando si sobra un dígito, si el
 * problema es la coma o si el tope es otro. El máximo se interpola del contrato, no se teclea.
 */
// El tope se pinta agrupado (feature 201) porque es justo lo que el mensaje intenta
// explicar: «no puede superar ₡9.999.999.999» se lee de un vistazo y `₡9999999999.99` hay
// que contarlo con el dedo. El EJEMPLO de entrada (`12500.00`) se queda crudo a propósito:
// eso es lo que hay que teclear en el campo, que no admite separador de miles.
//
// Feature 230: el tope va por `moneyTope` y NO por `money`. Redondear un importe está bien;
// redondear un LÍMITE al alza lo invalida: `money("9999999999.99")` da `₡10.000.000.000`, que
// es lo que el validador de esta misma pantalla rechaza y un dígito más de los «10 dígitos»
// que la frase promete. `moneyTope` descarta la cola y el mensaje queda más estricto que la
// realidad, que es el lado seguro.
const INDEMNIZACION_MONTO_EXCEDE = `El monto no puede superar ${moneyTope(INDEMNIZACION_MONTO_MAX)} (10 dígitos y 2 decimales). Revisa si sobra un dígito.`;
const INDEMNIZACION_MONTO_FORMATO =
  "Escribe un monto mayor que 0, con punto decimal y sin separador de miles (por ejemplo 12500.00).";
/** R34: rótulo de la causa en la fila del incidente (el dato que justifica el monto). */
const INDEMNIZACION_CAUSA_LABEL = "Causa";
/** Causa ausente: no debería pasar (el borde la exige, R9), pero no se inventa un valor. */
const INDEMNIZACION_CAUSA_DESCONOCIDA = "Sin causa registrada";
const INDEMNIZACION_MONTO_AYUDA = `Mayor que 0 y hasta ${moneyTope(INDEMNIZACION_MONTO_MAX)}, con hasta 2 decimales (por ejemplo 12500.00).`;
const INDEMNIZACION_FALTAN =
  "Falta el monto de al menos un incidente, o alguno no es válido. No se puede aprobar así.";

/** Detalle abierto: la cabecera del cierre + sus gestiones agrupadas por resultado. */
interface DetalleAbierto {
  cierre: CierreAdminResumen;
  grupos: CierreGrupos;
  /** Ingreso de la empresa del cierre por concepto (derivado del snapshot, money-safe). */
  totalesIngreso: TotalesIngresoEmpresa;
  /**
   * Feature 102/R8/R10: desglose del ingreso de bodega por rechazos particionado por origen
   * (SLA del cron 99 / manual del mensajero). `total` = snapshot leído; `sla + manual === total`
   * (server-side). Llega igual al alcance satélite por el mismo camino (`verCierreDetalle`).
   */
  desgloseIngresoBodegaRechazos: { sla: string; manual: string; total: string };
  /**
   * SL-39 (R21) — el IVA facturado del cierre, derivado server-side. Va a la cascada «Lo que le
   * queda a la empresa» como línea propia (R24).
   */
  ivaFacturado: string;
  /** Ingreso sin IVA menos el pago al mensajero, derivado server-side (SL-39, R22; puede ser negativo). */
  ganancia: string;
  /** Total general menos flete + IVA y comisión + IVA, derivado server-side (puede ser negativo). */
  pagoTienda: string;
  /**
   * FICHA 395 — los cuatro derivados de las tres cascadas, tal como los emite el servidor. Los
   * tres importes son STRING con su signo y NINGUNO se recorta a cero.
   *
   * `ganancia` y `pagoTienda` siguen aquí arriba, intactos y con el mismo significado: nadie los
   * absorbió. `netoEmpresa` NO es `ganancia` (resta ADEMÁS el ingreso de bodega) y `ganaLaTienda`
   * NO es `pagoTienda` (aquel no descuenta el flete por rechazo, que nunca entró en lo
   * recaudado). Los cuatro se pasan tal cual a `CascadasCierreMensajero`: aquí no se deriva nada.
   */
  cobradoSobreRecaudado: string;
  netoEmpresa: string;
  ganaLaTienda: string;
  fleteRechazoYaCobradoATienda: boolean;
  /**
   * FICHA 396 — de qué tienda es cada parte de `pagoTienda` y de `ganaLaTienda`: una entrada por
   * tienda del cierre, con sus tres cifras ya derivadas y **ya ordenadas por el servidor**.
   *
   * Llega SIEMPRE, también con una sola tienda; el umbral de enseñarlo —dos o más— lo evalúa
   * `CascadasCierreMensajero`. Aquí no se ordena, no se filtra y no se suma nada.
   */
  partesPorTienda: ParteDeTienda[];
  /**
   * Feature 264 (R7/R13) — las órdenes que el corte del día barrió a `sin_gestionar` al crear
   * ESTE cierre. Sin un solo campo de dinero: no tienen gestión, así que no hay nada que sumar.
   */
  ordenesSinGestion: CierreOrdenSinGestion[];
  /**
   * Feature 264 (R27/R28) — viaja SIEMPRE junto a la lista. `[]` con `true` es «no hubo
   * ninguna»; `[]` con `false` es «este cierre es anterior al registro y no lo sabemos».
   */
  sinGestionRegistrado: boolean;
  /**
   * FICHA 425 (R14) — los rechazos de tienda que este cierre pone delante de quien lo aprueba, tal
   * como llegan del servidor (ya ordenados). Sin marca de registro: aquí «ninguno» y «no consta»
   * son lo mismo, porque ningún cierre anterior a la ficha pudo llevarse uno.
   */
  rechazosDeTienda: CierreRechazoDeTienda[];
  /** SLT-100 (R80): quién lo resolvió, para la cabecera del detalle. Solo aprobado/rechazado. */
  resueltoPorNombre?: string | null;
  /** SLT-111 (R267): el reparto en % ya derivado en el servidor; `null` o ausente = sin barra. */
  porcentajesReparto?: number[] | null;
}

/**
 * Feature 205 (T6.1, design §4.1, R39/R40) — abre el detalle del cierre que nombra la URL.
 *
 * **No lee ninguna fila de ninguna tabla**: llama al `abrirDetalle` que ya existía, y ese pide
 * `verCierreDetalle({ cierreId })` POR ID. Es lo que hace que el enlace funcione igual para un
 * cierre de la página 7 del histórico, para uno filtrado fuera de la vista o para uno que ni
 * siquiera está en la página cargada (R40), y es lo que hizo barata esta feature: los tres
 * desenlaces de error —el cierre que no existe o está fuera de alcance, la sesión caída y el
 * fallo genérico— ya estaban escritos ahí (R41).
 *
 * Va en un componente propio, y renderiza `null`, por un motivo mecánico: el efecto tiene que
 * poder depender de `abrirDetalle`, que se declara DESPUÉS del `return` temprano de `sinZona`
 * y por tanto no puede ser dependencia de un hook del módulo. Acá la dependencia es explícita
 * y el disparo queda medido por el `ref`, no por la identidad de la función.
 *
 * **Una vez por navegación** (R40/R45): el `ref` recuerda qué id ya se abrió, así que los
 * re-renders que provoca abrirlo no lo vuelven a abrir. Y cuando el parámetro desaparece —al
 * cerrar el detalle, que lo retira de la URL (R45)— la memoria se borra: volver a navegar al
 * MISMO cierre lo abre de nuevo, que es lo que espera quien pulsa el enlace por segunda vez.
 */
function AbrirCierreDeLaUrl({
  cierreId,
  onAbrir,
}: Readonly<{ cierreId: string | null; onAbrir: (cierreId: string) => void }>) {
  const abiertoPorUrl = useRef<string | null>(null);

  useEffect(() => {
    if (cierreId === null) {
      abiertoPorUrl.current = null;
      return;
    }
    if (abiertoPorUrl.current === cierreId) return;
    abiertoPorUrl.current = cierreId;
    onAbrir(cierreId);
  }, [cierreId, onAbrir]);

  return null;
}

export function CierresAdminModule({
  pendientes,
  historico,
  sinZona,
  puedeRegistrarPago = false,
  puedeCorregirPagos = false,
  puedeCorregirResultado = false,
  puedeAjustarPagoMensajero = false,
  catalogoFiltros = CATALOGO_FILTROS_CIERRES_VACIO,
  audiencia = "satelite",
  zonaNombre = null,
}: Readonly<CierresAdminModuleProps>) {
  const router = useRouter();
  const pathname = usePathname();
  // Feature 205 (T6.1, R39/R40): `?cierre=<uuid>` abre el detalle de ESE cierre. Se lee la
  // URL y no un estado propio, que es lo que hace la dirección compartible y recargable.
  const searchParams = useSearchParams();
  const toast = useToast();
  const { mutate } = useSWRConfig();

  // Detalle del cierre abierto (null = modal cerrado).
  const [detalle, setDetalle] = useState<DetalleAbierto | null>(null);
  // Evidencia (URL firmada, R7) en el visor; null = cerrado.
  const [evidencia, setEvidencia] = useState<EvidenciaAbierta | null>(null);
  // Pedido humano (2026-08-19): la gestión cuyo desglose se está corrigiendo; `null` = diálogo
  // cerrado. Va aquí, con el resto de los hooks, y no junto al bloque que lo usa: los hooks se
  // llaman todos, siempre y en el mismo orden.
  const [corrigiendo, setCorrigiendo] = useState<CierreDetalleGestion | null>(null);
  // FICHA 398 (R16): la gestión cuyo RESULTADO se está corrigiendo; `null` = diálogo cerrado.
  // Estado propio y no compartido con el de arriba: son dos diálogos distintos y abrir uno no
  // puede abrir el otro.
  const [corrigiendoResultado, setCorrigiendoResultado] =
    useState<CierreDetalleGestion | null>(null);
  // SLT-56 (R21): la gestión cuyo pago al mensajero se está ajustando; `null` = diálogo cerrado.
  const [ajustandoPago, setAjustandoPago] = useState<CierreDetalleGestion | null>(null);
  // Sub-modal de rechazo (R11): true = abierto.
  const [rechazando, setRechazando] = useState(false);
  // Motivo del rechazo (obligatorio, R11) + su error de validación.
  const [motivo, setMotivo] = useState("");
  const [motivoError, setMotivoError] = useState<string | null>(null);
  // Feature 111/R16 (VÁLVULA DE ESCAPE): cierre `vencido` pendiente de confirmar el
  // destrabe; null = modal cerrado. Acción de EXCEPCIÓN, separada de aprobar/rechazar.
  const [destrabar, setDestrabar] = useState<CierreAdminResumen | null>(null);
  // Feature 158/R34: sub-modal de captura de los montos de indemnización; true = abierto.
  // Sólo se abre si el cierre TIENE incidentes; sin ellos se aprueba directo (R36).
  const [indemnizando, setIndemnizando] = useState(false);
  // Monto por `gestionId`, tal cual lo teclea el admin: STRING de extremo a extremo
  // (money-safe, R24). NUNCA se parsea a number acá; el borde y el repo lo tratan como
  // texto/Decimal.
  const [montos, setMontos] = useState<Record<string, string>>({});
  // Errores por gestión que devuelve el SERVIDOR (`fieldErrors` con clave = gestionId,
  // `CierresAdminService.validarCoberturaIndemnizaciones`). Se pintan por fila.
  const [montoErrores, setMontoErrores] = useState<Record<string, string>>({});
  // --- Feature 238 (T4.1/T4.2, R7/R35/R36): la ventana de CONFIRMACIÓN FÍSICA ---
  // Sólo se abre si el cierre TIENE paquetes que vuelven a bodega (gestiones o, desde la 451,
  // órdenes barridas); sin ellos la aprobación sigue siendo el gesto de hoy (R16). No es un
  // `else` de cortesía: medido el 2026-08-19, es 3 de cada 12 cierres.
  const [confirmando, setConfirmando] = useState(false);
  // Lo confirmado en esta sesión: `clave -> numGuia leído`, donde la clave es el `gestionId` o,
  // en una barrida (451), el `ordenId`. Vive acá, y no dentro de la ventana, para que cerrarla sin completar (R35) no obligue a re-escanear lo ya leído; se
  // descarta en `cerrarDetalle`, junto a los montos. Mismo criterio que la 158.
  const [confirmadas, setConfirmadas] = useState<Record<string, number>>({});
  // R29-R32: qué pasó con la ÚLTIMA lectura. Persistente y no un toast, que se va solo.
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  // Confirmación persistente del último acierto (patrón de `RecogerPaqueteCard`).
  const [ultimaGuiaConfirmada, setUltimaGuiaConfirmada] = useState<number | null>(null);
  // Errores del servidor de la confirmación física, por clave de fila. Conjunto de claves DISJUNTO
  // del de `montoErrores` por construcción: un `incidente` no vuelve a bodega, así que ninguna
  // gestión puede estar en los dos (el servicio lo afirma con un test, no lo razona), y una
  // barrida no es una gestión.
  const [confirmacionErrores, setConfirmacionErrores] = useState<Record<string, string>>({});
  // Feature 172/T E.1 (§8) + SLT-102 (R103): el diálogo de pago, tras aprobar o desde la fila de
  // Resueltos; null = cerrado.
  const [pagoAbierto, setPagoAbierto] = useState<PagoAbierto | null>(null);

  /**
   * Pedido humano del 2026-08-16 — los filtros de la pantalla (fecha, bodega destino,
   * mensajero). UNO para los DOS listados: ver la cabecera de `FiltrosCierresBarra`.
   *
   * Va en la CLAVE de los dos `useSWR`, no en un `useEffect` que revalide: así cada
   * combinación (página, tamaño, filtros) es su propia entrada de caché y volver a un filtro ya
   * visto no dispara una lectura. Y por eso mismo el `fallbackData` del Server Component sólo
   * se usa SIN filtros: con un filtro puesto, la página 1 pre-cargada es la del conjunto SIN
   * filtrar, y servirla sería enseñar cierres que el filtro excluye.
   */
  const [filtros, setFiltros] = useState<FiltrosCierres>({});

  /**
   * Pedido humano del 2026-08-16 — las dos mitades de esta pantalla (la cola de decisión y el
   * histórico) pasan a ser PESTAÑAS en vez de dos secciones apiladas. Arranca en «Pendientes»:
   * es la que tiene trabajo que hacer; el histórico se consulta, no se atiende.
   */
  const [tab, setTab] = useState<TabCierresAdmin>(TAB_PENDIENTES);

  /**
   * Cambiar un filtro devuelve LOS DOS listados a su página 1. Sin esto, quien estuviera en la
   * página 7 pediría la página 7 de un conjunto recién recortado —que casi siempre no existe— y
   * vería un listado vacío con el contador diciendo que hay filas.
   */
  function aplicarFiltros(next: FiltrosCierres) {
    setFiltros(next);
    setHistoricoPage(1);
    setPendientesPage(1);
  }

  // Feature 170 — FASE 2 (T I.2, R40/R43): página visible del histórico. Vive AQUÍ y no en
  // `CierresAdminHistoricoLista` por el motivo de Q-I3: la página se pide UNA vez y quien la
  // pinta la recibe. Hasta el 2026-08-16 eran dos lecturas de los mismos cierres —la tabla y la
  // «Vista tipo factura»— y pedirla dos veces las habría dejado enseñando cosas distintas; hoy
  // la lectura es una sola, y el reparto se conserva porque es también el que mantiene el
  // contador de la cola fuera del archivo que pagina (guardia de T H.3).
  // `fallbackData` es la página que ya resolvió el Server Component: al entrar no hay
  // segunda lectura, y los comprobantes son EXACTAMENTE los de antes (R44).
  const [historicoPage, setHistoricoPage] = useState(1);
  const [historicoPageSize, setHistoricoPageSize] = useState(historico.pageSize);
  const { data: historicoData, error: historicoError } = useSWR(
    ["cierres-admin:historico", historicoPage, historicoPageSize, filtros],
    () => leerHistorico(historicoPage, historicoPageSize, filtros),
    {
      fallbackData:
        historicoPage === 1 &&
        historicoPageSize === historico.pageSize &&
        sinFiltros(filtros)
          ? historico
          : undefined,
    },
  );
  const historicoPagina: CierresAdminHistoricoPagina = historicoData ?? {
    items: [],
    total: 0,
    pageSize: historicoPageSize,
  };

  // R44: el esqueleto de carga se muestra sólo cuando NO hay nada que pintar. `isLoading` de
  // SWR sigue siendo `true` mientras revalida aunque haya `fallbackData`, y usarlo tal cual
  // haría que la página 1 —la que el Server Component ya resolvió— apareciera como esqueleto
  // antes de enseñar las filas que el usuario veía antes de paginar.
  const historicoCargando = historicoData === undefined;

  // Feature 170 — FASE 2 (T J.2, R40/R42/R43): página visible de la COLA. Vive AQUÍ, en el
  // módulo, y no en un componente hijo: es la decisión de Q-I6 que T I.2 dejó abierta y T J.1
  // recomendó medida. Con el control en este archivo, la guardia de T H.3 ve la pantalla como
  // paginada y se pone roja mientras el contador de abajo salga de un array; con el control en
  // un hijo, la guardia deja de mirar hacia arriba y el contador podría quedarse mintiendo.
  const [pendientesPage, setPendientesPage] = useState(1);
  const [pendientesPageSize, setPendientesPageSize] = useState(pendientes.pageSize);
  const { data: pendientesData, error: pendientesError } = useSWR(
    ["cierres-admin:pendientes", pendientesPage, pendientesPageSize, filtros],
    () => leerPendientes(pendientesPage, pendientesPageSize, filtros),
    {
      fallbackData:
        pendientesPage === 1 &&
        pendientesPageSize === pendientes.pageSize &&
        sinFiltros(filtros)
          ? pendientes
          : undefined,
    },
  );
  const colaPendientes: CierresAdminColaPagina = pendientesData ?? {
    items: [],
    total: 0,
    pageSize: pendientesPageSize,
  };
  const pendientesCargando = pendientesData === undefined;

  // R3: adminSatelite sin zona → aviso accionable, sin tablas de acción.
  if (sinZona) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
      >
        No tienes una zona asignada; contacta a tu administrador.
      </p>
    );
  }

  // Feature 158/R19/R34: las gestiones `incidente` del cierre abierto. Salen del MISMO
  // detalle que ya se pidió al servidor (`grupos.incidente`), no de una consulta aparte:
  // el conjunto que la UI pide indemnizar es exactamente el que el service exige cubrir.
  const incidentes: CierreDetalleGestion[] = detalle?.grupos.incidente ?? [];
  // Feature 238/R2/R7 + ficha 451 (R5/R29-R31): el CONJUNTO ESPERADO — las gestiones del cierre
  // cuyo paquete vuelve a bodega Y las órdenes que el corte barrió en este cierre. Sale del MISMO
  // detalle ya cargado (`grupos` y `ordenesSinGestion`), filtrado por el punto único: la pantalla
  // no decide por su cuenta qué vuelve, porque decidirlo dos veces es cómo se llega a que bodega
  // escanee todo lo que ve y el botón siga bloqueado.
  const conjuntoEsperado: FilaAConfirmar[] = detalle
    ? filasAConfirmar(detalle.grupos, detalle.ordenesSinGestion)
    : [];
  // R30/R31 (238) y R33 (451): las cinco secciones más las barridas, para poder distinguir la
  // guía ajena de la que sí es del cierre pero no vuelve.
  const filasDelCierreAbierto: FilaAConfirmar[] = detalle
    ? filasDelCierre(detalle.grupos, detalle.ordenesSinGestion)
    : [];
  // R27: cuántos paquetes faltan por tener delante. Es el número que bloquea y el que se dice, y
  // por eso sale del MISMO cálculo que pinta la ventana (`progresoDePaquetes`): son PAQUETES,
  // no filas — dos gestiones vivas de la misma orden comparten guía y son un solo bulto. El
  // candado no se ablanda: un paquete cuenta como hecho sólo si todas sus filas están
  // confirmadas, así que «faltan 0» sigue queriendo decir «no queda ninguna fila pendiente».
  const faltanPorConfirmar = progresoDePaquetes(conjuntoEsperado, confirmadas).faltan;
  // R34: no se puede confirmar mientras falte o sea inválido algún monto. Mismo criterio
  // que el servidor (`montoValido` de la wallet: > 0, hasta 2 decimales, sin `parseFloat`) —
  // incluido el TOPE (m5): sin él la UI habilitaba «Confirmar» con un monto de 11 dígitos que
  // el servidor rechaza después, y ese rechazo llega bajo la clave `indemnizaciones` (no por
  // gestión), así que no se pintaba en ninguna celda: el admin veía que algo falló y no dónde.
  const todosLosMontosValidos =
    incidentes.length > 0 &&
    incidentes.every((g) => montoValido(montos[g.gestionId] ?? "", INDEMNIZACION_MONTO_MAX));

  /**
   * Mensaje accionable de un monto tecleado que NO pasa la validación de cliente. `undefined`
   * si el campo está vacío (ahí el aviso general del sub-modal ya dice que falta) o si es
   * válido. Distingue el tope del formato: son dos correcciones distintas.
   */
  function errorDeMonto(valor: string): string | undefined {
    const limpio = valor.trim();
    if (limpio === "" || montoValido(limpio, INDEMNIZACION_MONTO_MAX)) return undefined;
    // Bien formado pero por encima del tope → el problema es el tamaño, no la sintaxis.
    return montoValido(limpio) ? INDEMNIZACION_MONTO_EXCEDE : INDEMNIZACION_MONTO_FORMATO;
  }

  /** Abre el detalle de un cierre (pide las gestiones + evidencias firmadas). */
  async function abrirDetalle(cierreId: string) {
    // Un fallo INESPERADO de la action (que lanza ante un `AppErrorCode` que no sabe
    // traducir) rechazaba esta promesa sin que nadie la escuchara: el modal no abria y no
    // aparecia ningun mensaje, que es como se ve "el boton no funciona". El toast no
    // arregla la causa, pero convierte el silencio en algo que se puede reportar.
    let result: Awaited<ReturnType<typeof verCierreDetalle>>;
    try {
      result = await verCierreDetalle({ cierreId });
    } catch {
      toast.error("No se pudo abrir el detalle del cierre. Inténtalo de nuevo.");
      return;
    }
    if (result.status === "ok") {
      setDetalle({
        cierre: result.cierre,
        grupos: result.grupos,
        totalesIngreso: result.totalesIngreso,
        desgloseIngresoBodegaRechazos: result.desgloseIngresoBodegaRechazos,
        ivaFacturado: result.ivaFacturado,
        ganancia: result.ganancia,
        pagoTienda: result.pagoTienda,
        // FICHA 395: los cuatro llegan DERIVADOS del servidor y se guardan tal cual. Ni una
        // resta aquí: el navegador no hace aritmética de dinero.
        cobradoSobreRecaudado: result.cobradoSobreRecaudado,
        netoEmpresa: result.netoEmpresa,
        ganaLaTienda: result.ganaLaTienda,
        fleteRechazoYaCobradoATienda: result.fleteRechazoYaCobradoATienda,
        // FICHA 396: el desglose por tienda, tal cual llega. Ya viene ordenado por el servidor
        // (R8) y con las tres cifras derivadas: aquí no se reordena ni se recalcula nada.
        partesPorTienda: result.partesPorTienda,
        // Feature 264 (R30): los dos campos viajan JUNTOS desde el servicio hasta la hoja. No
        // se derivan ni se rellenan aquí: `[]` y `false` significan cosas distintas y sólo el
        // servidor sabe cuál es cuál.
        ordenesSinGestion: result.ordenesSinGestion,
        sinGestionRegistrado: result.sinGestionRegistrado,
        // FICHA 425 (R14): tal cual llega, sin filtrar ni reordenar. Es la misma lista que recibe
        // el mensajero en su comprobante: las dos pantallas pintan lo mismo para el mismo cierre.
        rechazosDeTienda: result.rechazosDeTienda,
        resueltoPorNombre: result.resueltoPorNombre ?? null,
        // SLT-111 (R267): tal cual llega; aquí no se redondea ni se reordena.
        porcentajesReparto: result.porcentajesReparto ?? null,
      });
      return;
    }
    if (result.status === "no_encontrada") {
      toast.error("El cierre ya no está disponible. Actualizando la lista.");
      refrescarListas();
      return;
    }
    if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
      return;
    }
    toast.error("No se pudo abrir el detalle del cierre. Inténtalo de nuevo.");
  }

  /**
   * Feature 205 (T6.1, R45) — saca `?cierre=` de la dirección, conservando el resto de
   * parámetros. Sin esto, recargar la pantalla volvería a abrir el detalle que se acaba de
   * cerrar, y el usuario no tendría forma de salir de él salvo editando la URL a mano.
   *
   * `replace` y no `push`: cerrar un modal no es un paso de navegación que el botón «atrás»
   * deba deshacer. Y no se hace nada si el parámetro no está: el detalle abierto desde la
   * tabla no toca la URL, así que cerrarlo tampoco.
   */
  function limpiarCierreDeLaUrl() {
    if (searchParams.get(PARAM_CIERRE) === null) return;
    const parametros = new URLSearchParams(
      [...searchParams.entries()].filter(([clave]) => clave !== PARAM_CIERRE),
    );
    const cadena = parametros.toString();
    router.replace(cadena ? `${pathname}?${cadena}` : pathname, { scroll: false });
  }

  function cerrarDetalle() {
    limpiarCierreDeLaUrl();
    setDetalle(null);
    setRechazando(false);
    setMotivo("");
    setMotivoError(null);
    // Feature 158: cerrar el detalle descarta también la captura en curso; el siguiente
    // cierre que se abra arranca con sus propias filas y sin montos heredados.
    setIndemnizando(false);
    setMontos({});
    setMontoErrores({});
    // Feature 238/R35: lo mismo con la confirmación física. Nada de esto está persistido en
    // ningún sitio —no existe una confirmación a medias en el servidor—, así que descartarlo es
    // literalmente olvidarlo; el siguiente cierre arranca con sus propias filas.
    setConfirmando(false);
    setConfirmadas({});
    setConfirmacionErrores({});
    setAvisoLectura(null);
    setUltimaGuiaConfirmada(null);
  }

  /**
   * Pedido humano del 2026-08-19 — tras aceptar / rechazar / destrabar, LA LISTA tiene que
   * enterarse. `router.refresh()` a secas no bastaba: sólo vuelve a resolver el Server
   * Component, y sus páginas entran acá como `fallbackData`, que SWR usa una vez y nunca
   * vuelve a mirar. Con datos ya en caché, el cierre resuelto seguía sentado en la cola hasta
   * recargar a mano.
   *
   * Se revalidan TODAS las claves de los dos listados —cualquier página, cualquier
   * combinación de filtros—, no sólo la visible: una decisión mueve la fila de la cola al
   * histórico y recorre la paginación de ambos, así que dejar el resto de páginas en caché
   * sería volver a la misma mentira una página más allá.
   */
  function refrescarListas() {
    void mutate(
      (clave) =>
        Array.isArray(clave) &&
        (clave[0] === "cierres-admin:pendientes" ||
          clave[0] === "cierres-admin:historico"),
    );
    router.refresh();
  }

  /** Traduce un resultado de dominio de error a feedback accionable + refresco. */
  function manejarErrorDecision(
    status:
      | "conflict"
      | "no_encontrada"
      | "forbidden"
      | "unauthenticated"
      | "validation_error",
  ) {
    if (status === "conflict") {
      toast.error("Este cierre ya fue resuelto por otro administrador.");
    } else if (status === "no_encontrada") {
      toast.error("El cierre ya no está disponible.");
    } else if (status === "forbidden") {
      toast.error("No tienes permiso para resolver este cierre.");
    } else if (status === "unauthenticated") {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
    } else {
      toast.error("No se pudo resolver el cierre. Inténtalo de nuevo.");
    }
    cerrarDetalle();
    refrescarListas();
  }

  /**
   * R10 + feature 158/R22/R36 + feature 238/R16: aprueba el cierre abierto.
   *
   * Cada lista viaja SÓLO si su rama existe: `indemnizaciones` cuando el cierre tiene
   * incidentes, `confirmacionFisica` cuando tiene paquetes que vuelven. Un cierre sin ninguna
   * de las dos cosas manda el MISMO payload de la 38 (`{ cierreId }`, ni una clave más), que es
   * lo que hace que ese camino —3 de cada 12 cierres, medido— no cambie ni un byte.
   */
  async function confirmarAprobacion(
    indemnizaciones?: { gestionId: string; monto: string }[],
    confirmacionFisica?: EntradaConfirmacionFisica[],
  ) {
    if (!detalle) return;
    const result = await aprobarCierre({
      cierreId: detalle.cierre.cierreId,
      ...(indemnizaciones === undefined ? {} : { indemnizaciones }),
      ...(confirmacionFisica === undefined ? {} : { confirmacionFisica }),
    });
    if (result.status === "ok") {
      // El cierre YA está aprobado y el mensajero, libre (feature 111): esta rama solo puede
      // AÑADIR cosas, nunca condicionar lo anterior (R17/R18). Se declara el éxito, se cierra
      // el detalle y se refresca la ruta EXACTAMENTE como antes de la 172; lo del pago va
      // después y es aparte.
      const { cierreId, mensajeroNombre } = detalle.cierre;
      // Feature 172 (T C.2): el pendiente lo derivó el SERVIDOR al aprobar. La pantalla no lo
      // calcula (R14) y no lo guarda en ningún sitio: si no se paga, se vuelve a derivar.
      const pendiente = result.pendientePagoMensajero;

      toast.success("Cierre aprobado correctamente.");
      cerrarDetalle();
      refrescarListas();

      // R16 — se OFRECE registrar el pago si queda algo pendiente y el actor puede pagar.
      // [P3]/R6: un `adminSatelite` aprueba y aquí no ve nada; el flujo termina como hoy y la
      // deuda queda abierta y visible para quien tiene la caja (R26).
      if (puedeRegistrarPago && hayPendienteDeLiquidar(pendiente)) {
        setPagoAbierto({ cierreId, mensajeroNombre, pendiente, trasAprobar: true });
      }
      return;
    }
    // Feature 158/R19-R21 y feature 238/T4.7: el servidor valida las DOS coberturas exactas y
    // devuelve sus errores POR GESTIÓN. Se pintan en su fila y la ventana SIGUE ABIERTA:
    // cerrarla obligaría a recapturar —o a re-escanear— todo.
    if (result.status === "validation_error") {
      repartirErroresDelServidor(result.fieldErrors);
      return;
    }
    manejarErrorDecision(result.status);
  }

  /**
   * Feature 238 (T4.7) — reparte los `fieldErrors` del servidor entre las DOS ventanas.
   *
   * Las claves son ids de gestión en los montos, y en la confirmación física el id de gestión o,
   * desde la 451, el `ordenId` de una barrida (R35). Los conjuntos son disjuntos por construcción
   * (un `incidente` no vuelve a bodega, y una barrida no es una gestión), así que basta preguntar
   * si la clave está en el conjunto esperado. Y la ventana que se abre es la que TIENE el error: si el
   * servidor discute la confirmación física, teclear montos no arregla nada.
   *
   * Una clave que no case con ninguna de las dos ramas cae en el bolsón de los montos, que es
   * exactamente donde caía antes de esta feature: no se pierde ni cambia de sitio.
   */
  function repartirErroresDelServidor(fieldErrors: Record<string, string[]>) {
    const clavesAConfirmar = new Set(conjuntoEsperado.map((f) => f.clave));
    const deConfirmacion: Record<string, string> = {};
    const deMontos: Record<string, string> = {};
    for (const [campo, mensajes] of Object.entries(fieldErrors)) {
      const mensaje = mensajes[0] ?? INDEMNIZACION_FALTAN;
      if (clavesAConfirmar.has(campo)) deConfirmacion[campo] = mensaje;
      else deMontos[campo] = mensaje;
    }
    setConfirmacionErrores(deConfirmacion);
    setMontoErrores(deMontos);
    if (Object.keys(deConfirmacion).length > 0) {
      setIndemnizando(false);
      setConfirmando(true);
    }
  }

  /**
   * Feature 158/R34 + feature 238/R7/R37: pulsa "Aprobar" en el detalle. TRES caminos de igual
   * rango, no uno con dos excepciones:
   *
   *   - con paquetes que vuelven  -> la ventana de confirmación física (y los montos después,
   *     R37: si falta un paquete no se llega a teclear dinero que se va a descartar). Desde la 451
   *     cuentan también las órdenes barridas: un cierre SÓLO con barridas abre la ventana en vez de
   *     aprobarse de un click contra un servidor que ahora lo rechaza;
   *   - sin ellos y con incidentes -> el sub-modal de montos, como hasta hoy;
   *   - sin ninguna de las dos cosas -> se aprueba directo, byte a byte como hasta hoy (R16).
   */
  function pedirAprobacion() {
    if (conjuntoEsperado.length > 0) {
      setConfirmacionErrores({});
      setAvisoLectura(null);
      setConfirmando(true);
      return;
    }
    if (incidentes.length === 0) {
      void confirmarAprobacion();
      return;
    }
    setMontoErrores({});
    setIndemnizando(true);
  }

  /**
   * Feature 238 (R29-R32) — una guía leída, por cámara o tecleada. Devuelve `true` sólo si
   * marcó una fila; con `false` el campo conserva lo escrito para poder corregirlo (patrón de
   * `RecogerPaqueteCard`).
   *
   * Ninguno de los cuatro desenlaces manda nada al servidor: la resolución es local contra el
   * detalle ya cargado, y el envío ocurre una sola vez, al confirmar la ventana.
   */
  function leerGuia(texto: string, medio: MedioDeCaptura): boolean {
    const lectura = interpretarLectura(
      texto,
      medio,
      filasDelCierreAbierto,
      confirmadas,
    );
    if (lectura.tipo === "aviso") {
      setAvisoLectura(lectura.mensaje);
      return false;
    }
    // Una lectura puede cubrir MÁS DE UNA fila: hay un solo paquete físico, y si dos gestiones
    // vivas de la misma orden comparten guía, las dos quedan cubiertas por ese único gesto.
    // Pedir dos escaneos de la misma caja sería pedir que se atestigüe dos veces un solo acto —
    // y con `find` la segunda fila no había forma de confirmarla nunca.
    setConfirmadas((prev) => {
      const siguiente = { ...prev };
      for (const clave of lectura.claves) siguiente[clave] = lectura.numGuia;
      return siguiente;
    });
    setUltimaGuiaConfirmada(lectura.numGuia);
    setAvisoLectura(null);
    // Confirmar limpia el error del servidor de LAS FILAS CONFIRMADAS (no el de las otras),
    // igual que teclear limpia el del monto en el sub-modal de la 158.
    setConfirmacionErrores((prev) => {
      if (!lectura.claves.some((clave) => prev[clave])) return prev;
      const resto = { ...prev };
      for (const clave of lectura.claves) delete resto[clave];
      return resto;
    });
    return true;
  }

  /**
   * Feature 238/R7 + ficha 451 (T5.4): lo confirmado, en la forma que el borde del servidor espera:
   * cada entrada CON su `origen`. Sin él, el borde rechaza la lista entera.
   */
  function listaConfirmacionFisica(): EntradaConfirmacionFisica[] {
    return entradasDeConfirmacion(conjuntoEsperado, confirmadas);
  }

  /**
   * Feature 238 (R37) — se completó la confirmación física. Si el cierre además trae
   * incidentes, queda el paso de los montos; si no, se aprueba con la lista confirmada.
   */
  async function continuarTrasConfirmacion() {
    if (faltanPorConfirmar > 0) return; // R27: el botón ya está deshabilitado; doble candado.
    if (incidentes.length > 0) {
      setConfirmando(false);
      setMontoErrores({});
      setIndemnizando(true);
      return;
    }
    await confirmarAprobacion(undefined, listaConfirmacionFisica());
  }

  /** Feature 158/R34: confirma la aprobación CON los montos capturados. */
  async function confirmarAprobacionConMontos() {
    if (!todosLosMontosValidos) return; // R34: el botón ya está deshabilitado; doble candado.
    await confirmarAprobacion(
      incidentes.map((g) => ({ gestionId: g.gestionId, monto: montos[g.gestionId].trim() })),
      // Feature 238/R16: sin nada que devolver, la clave NO viaja y el payload de la 158 queda
      // exactamente como estaba.
      conjuntoEsperado.length > 0 ? listaConfirmacionFisica() : undefined,
    );
  }

  /** R11: rechaza el cierre abierto con motivo obligatorio. */
  async function confirmarRechazo() {
    if (!detalle) return;
    const motivoLimpio = motivo.trim();
    if (motivoLimpio.length === 0) {
      setMotivoError("El motivo de rechazo es obligatorio.");
      return; // R11: sin motivo NO se envía
    }
    const result = await rechazarCierre({
      cierreId: detalle.cierre.cierreId,
      motivo: motivoLimpio,
    });
    if (result.status === "ok") {
      toast.success("Cierre rechazado correctamente.");
      cerrarDetalle();
      refrescarListas();
      return;
    }
    if (result.status === "validation_error") {
      const primero = Object.values(result.fieldErrors)[0]?.[0];
      setMotivoError(primero ?? "El motivo de rechazo es obligatorio.");
      return;
    }
    manejarErrorDecision(result.status);
  }

  /**
   * Feature 111/R16 (VÁLVULA DE ESCAPE, emergencia): destraba un `vencido` ABANDONADO
   * transicionándolo `vencido → solicitado` en nombre del mensajero. Es la EXCEPCIÓN al
   * flujo normal (para cuando el mensajero nunca lo solicita y quedan bloqueados él y su
   * bodega). Tras destrabar, el cierre queda `solicitado` y se resuelve por la vía normal
   * (aprobar/rechazar), que registra la auditoría (R17). NO recalcula montos (R21).
   */
  async function confirmarDestrabar() {
    const cierre = destrabar;
    if (!cierre) return;
    const result = await forzarSolicitudVencido({ cierreId: cierre.cierreId });
    if (result.status === "ok") {
      toast.success(
        "Cierre vencido destrabado; quedó como solicitado para aprobación.",
      );
      setDestrabar(null);
      refrescarListas();
      // SLT-100 (R83): destrabado desde el pie del detalle, el detalle se vuelve a leer del
      // servidor y queda en modo decidir. Desde la cola (detalle cerrado) no se abre nada.
      if (detalle?.cierre.cierreId === cierre.cierreId) await abrirDetalle(cierre.cierreId);
      return;
    }
    if (result.status === "conflict") {
      toast.error("El cierre ya no está vencido (otro proceso lo resolvió).");
    } else if (result.status === "no_encontrada") {
      toast.error("El cierre ya no está disponible.");
    } else if (result.status === "forbidden") {
      toast.error("No tienes permiso para destrabar este cierre.");
    } else if (result.status === "unauthenticated") {
      toast.error("Tu sesión expiró. Inicia sesión de nuevo.");
    } else {
      toast.error("No se pudo destrabar el cierre. Inténtalo de nuevo.");
    }
    setDestrabar(null);
    refrescarListas();
  }

  const cierreAbierto = detalle?.cierre ?? null;
  /**
   * SLT-104 «Detalle de cierre de bodega en el detalle único (central)» (PA1, R116): la central abre
   * un cierre del día de una bodega SATÉLITE (desde «Ver su cierre» del detalle de bodega) SOLO PARA
   * MIRARLO: solo lectura, filas «solo lectura», sin pago, decisión, destrabe, corrección ni ajuste.
   * Ocultar no es la defensa: las Server Actions de escritura siguen con su alcance `bodega_central`
   * y responden `no_encontrada` sobre ese cierre (T1); esto solo decide qué se OFRECE.
   */
  const soloLecturaSatelite = audiencia === "admin" && cierreAbierto?.destinoTipo === "bodega_satelite";
  // Feature 172 (T E.2, R19/R28): la sección «Pago al mensajero» solo existe en un cierre
  // APROBADO y solo para quien puede pagar ([P3]/R6). En cualquier otro estado no se muestra
  // ni se ofrece nada relativo al pago — y, como el componente ni se monta, tampoco se pide su
  // lista de comprobantes.
  const ofrecerPagoEnDetalle =
    !soloLecturaSatelite && puedeRegistrarPago && cierreAbierto?.estado === "aprobado";
  // Feature 111/R15 (Q1-B): la vía NORMAL aprobar/rechazar aplica SOLO a `solicitado`.
  // Un `vencido` YA NO es resoluble por la vía normal (revierte la 41 R20): su único
  // camino normal es que el mensajero lo solicite (→ `solicitado`); la excepción es la
  // válvula de escape del admin (R16). El histórico sigue siendo solo lectura.
  const esResoluble = !soloLecturaSatelite && cierreAbierto?.estado === "solicitado";
  /**
   * Pedido humano (2026-08-19): el desglose se corrige mientras el cierre está ABIERTO — la
   * plata todavía no está aprobada—. NO es `esResoluble`: un `vencido` es un cierre abierto que
   * el mensajero nunca solicitó, y su desglose es tan corregible como el de un `solicitado`.
   * El servidor exige lo mismo; esto solo decide si se ofrece.
   */
  const ofrecerCorreccionPagos =
    !soloLecturaSatelite &&
    puedeCorregirPagos &&
    (cierreAbierto?.estado === "solicitado" || cierreAbierto?.estado === "vencido");
  /**
   * FICHA 398 (R16): el RESULTADO se corrige únicamente desde el detalle de un cierre ABIERTO
   * —`solicitado` o `vencido`—, que es el mismo par que exige el servicio.
   *
   * Ese par cubre por construcción el «no consolidado» y no hace falta preguntarlo aparte: la
   * consolidación en un `cierre_bodega` sólo toma cierres `aprobado`, así que un cierre abierto
   * no puede estar consolidado. Un `aprobado` o un `rechazado` no entran por aquí, y si el cierre
   * cambia de estado mientras el diálogo está abierto, el servidor responde `conflict` y no
   * escribe nada: esto sólo decide si se OFRECE.
   */
  const ofrecerCorreccionResultado =
    !soloLecturaSatelite &&
    puedeCorregirResultado &&
    (cierreAbierto?.estado === "solicitado" || cierreAbierto?.estado === "vencido");
  /**
   * SLT-56 (R21): el pago al mensajero se ajusta mientras el cierre está ABIERTO —el mismo par
   * que exige el servidor—. Aprobado, queda fijo (se usa premio o descuento en la wallet).
   */
  const ofrecerAjustePago =
    !soloLecturaSatelite &&
    puedeAjustarPagoMensajero &&
    (cierreAbierto?.estado === "solicitado" || cierreAbierto?.estado === "vencido");
  /** SLT-101 (R22, R90): la audiencia de la fila única; la central es el `admin` de acceso total. */
  // SLT-104 (R116): un cierre de satélite abierto por la central, filas «solo lectura».
  const audienciaFila: AudienciaFila = soloLecturaSatelite
    ? "solo lectura"
    : audiencia === "admin"
      ? "central"
      : "satelite";

  /**
   * SLT-56 (R11) — aplica en la pantalla, SIN recargar, lo que devolvió el servidor: el pago nuevo
   * de la gestión, su ajuste al final del historial y el total de pago al mensajero del cierre.
   * Ni una suma aquí: las tres cifras llegan hechas. Lo que DERIVA del total (lo que le queda a la
   * empresa, la ganancia) también es del servidor, y por eso después se relee el detalle.
   */
  function aplicarAjusteLocal(r: AjustePagoAplicado) {
    setDetalle((prev) => {
      if (!prev) return prev;
      const grupos = Object.fromEntries(
        Object.entries(prev.grupos).map(([resultado, lista]) => [
          resultado,
          lista.map((g) =>
            g.gestionId === r.gestionId
              ? {
                  ...g,
                  pagoMensajero: r.pagoMensajero,
                  ajustesPago: [...(g.ajustesPago ?? []), r.ajuste],
                }
              : g,
          ),
        ]),
      ) as CierreGrupos;
      return {
        ...prev,
        cierre: { ...prev.cierre, totalPagoMensajero: r.totalPagoMensajero },
        grupos,
      };
    });
  }

  // SLT-102 (R107): el rol de la cola sale del MISMO predicado que la audiencia del detalle
  // (`audiencia === "admin"` ⇔ `esAccesoTotal`, resuelto en `page.tsx`).
  const rolCola = audiencia === "admin" ? "central" : "satelite";

  return (
    <div className="flex flex-col gap-4">
      {/* Feature 205 (T6.1, R39/R40): el cierre que nombra la URL se abre al llegar. No pinta
          nada; solo dispara la MISMA lectura por id que usa la tabla. */}
      <AbrirCierreDeLaUrl
        cierreId={searchParams.get(PARAM_CIERRE)}
        onAbrir={abrirDetalle}
      />

      {/* ---------- La cola única (SLT-102, R107) ----------
          `ColaCierres` pinta la descripción del rol, las pestañas con conteo, UNA barra para las
          dos listas con «Descargar» a su derecha, la tabla de la pestaña activa y el pie. El
          estado sigue aquí: filtros, pestaña, página y tamaño de cada lista, y las dos lecturas.

          LOS CONTEOS salen del `total` del SERVIDOR (R42, R99), nunca de `items.length`: con
          `items.length` diría «25» habiendo 300 cierres esperando decisión, y no fallaría nada.
          Lo vigila `tests/unit/descarga/contadores-cabecera.guardia.test.ts`.

          La barra se deshabilita mientras alguna de las dos páginas está en vuelo: cambiar un
          filtro a mitad de una lectura dispararía una segunda con la primera todavía viva. */}
      <ColaCierres
        tipo="mensajero"
        rol={rolCola}
        descripcion={descripcionCola(rolCola, zonaNombre)}
        pestanas={[
          { id: TAB_PENDIENTES, label: TAB_PENDIENTES_LABEL, conteo: colaPendientes.total },
          { id: TAB_RESUELTOS, label: TAB_RESUELTOS_LABEL, conteo: historicoPagina.total },
        ]}
        pestanaActiva={tab}
        onPestana={(id: PestanaCola) => setTab(id)}
        barra={
          <FiltrosCierresBarra
            catalogo={catalogoFiltros}
            onChange={aplicarFiltros}
            disabled={pendientesCargando || historicoCargando}
            // FICHA 386 — ÉSTA es la única pantalla que puede ofrecerlo: `estados` vive en
            // `filtrosCierresSchema` (los cierres del DÍA). Las dos de bodega usan
            // `filtrosCierresBodegaSchema`, que no lo declara y es `.strict()`.
            conEstado
            // SLT-102 (R100, enmienda de Carlos 2026-11-10): sin «Bodega», como el canvas.
            sinBodega
          />
        }
        descargar={
          // UN SOLO botón (pedido humano del 2026-09-05), de la pestaña ACTIVA: «Resumen» es una
          // fila por CIERRE y sale de lo que la pestaña enseña, filtros incluidos; «Detalle» es
          // una fila por GESTIÓN y su conjunto lo redacta el diálogo de mensajeros y rango, sin
          // heredar nada de la barra (D11, R34/R35). Por eso al detalle NO se le pasan `filtros`.
          //
          // Desde aquí se cubre la GAM: en esta pantalla el maestro solo ve los cierres con
          // destino `bodega_central`, y los de las bodegas satélite le llegan únicamente
          // consolidados, por el control gemelo de `CierresBodegaAdminModule`. Los dos
          // conjuntos son DISJUNTOS y su unión es el total (design §2.6).
          <DescargarCierresButton
            resumen={
              tab === TAB_PENDIENTES
                ? descargaColaCierres(filtros, audiencia)
                : descargaHistoricoCierres(filtros, audiencia)
            }
            catalogo={catalogoFiltros}
            accion={(f) => descargarDatos("listarGestionesCierresAdminCompleto", f)}
            disabled={pendientesCargando || historicoCargando}
            audiencia={audiencia}
          />
        }
        filas={tab === TAB_PENDIENTES ? colaPendientes.items : historicoPagina.items}
        cargando={tab === TAB_PENDIENTES ? pendientesCargando : historicoCargando}
        error={
          tab === TAB_PENDIENTES
            ? pendientesError
              ? ERROR_CARGA_PENDIENTES
              : null
            : historicoError
              ? ERROR_CARGA_HISTORICO
              : null
        }
        vacio={tab === TAB_PENDIENTES ? VACIO_PENDIENTES : VACIO_HISTORICO}
        // Los nombres de hoy de las dos regiones: por ellos localizan la lista los tests y los
        // E2E (R104).
        region={tab === TAB_PENDIENTES ? REGION_PENDIENTES : REGION_HISTORICO}
        acciones={{
          abrir: abrirDetalle,
          destrabar: setDestrabar,
          // R34/R103: solo se ofrece a quien puede pagar (`esAccesoTotal`, resuelto en el
          // servidor). La Server Action responde `forbidden` a cualquier otro igualmente.
          ...(puedeRegistrarPago && rolCola === "central"
            ? {
                registrarPago: (c: CierreAdminResumen, pendiente: string) =>
                  setPagoAbierto({
                    cierreId: c.cierreId,
                    mensajeroNombre: c.mensajeroNombre,
                    pendiente,
                    trasAprobar: false,
                  }),
              }
            : {}),
        }}
        pie={tab === TAB_PENDIENTES ? PIE_PENDIENTES : undefined}
        paginacion={
          tab === TAB_PENDIENTES ? (
            <Pagination
              page={pendientesPage}
              pageSize={pendientesPageSize}
              total={colaPendientes.total}
              disabled={pendientesCargando}
              showFirstLast
              siblingCount={1}
              ariaLabel={PAGINACION_PENDIENTES_LABEL}
              onPageChange={setPendientesPage}
              onPageSizeChange={(s) => {
                setPendientesPageSize(s);
                setPendientesPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          ) : (
            // Feature 170 (T I.2): la paginación del histórico vivía en
            // `CierresAdminHistoricoLista`; con la cola única se monta aquí, con su mismo nombre.
            <Pagination
              page={historicoPage}
              pageSize={historicoPagina.pageSize}
              total={historicoPagina.total}
              disabled={historicoCargando}
              showFirstLast
              siblingCount={1}
              ariaLabel={PAGINACION_HISTORICO_LABEL}
              onPageChange={setHistoricoPage}
              onPageSizeChange={(s) => {
                setHistoricoPageSize(s);
                setHistoricoPage(1);
              }}
              pageSizeOptions={PAGE_SIZE_OPTIONS}
            />
          )
        }
      />

      {/* Los modales viven FUERA de los dos paneles: el detalle se abre desde cualquiera de las
          dos pestañas y no puede quedar escondido con la que no se está mirando. */}
      {/* ---------- Detalle del cierre (SLT-100: R38, R79) ----------
          El detalle único de SLT-95, con `tipo` mensajero y `marco` modal. El modo sale del estado
          (`modoAdminDe`); qué botón pinta el pie lo decide `accionesDe` con los callbacks que se
          pasan, y estos siguen saliendo de los `ofrecer*`/`esResoluble` de hoy. La impresión
          desaparece (D12): quien la necesite usa «Descargar» en «Gestiones» (R21). */}
      {detalle && cierreAbierto ? (
        <DetalleCierre
          tipo="mensajero"
          marco="modal"
          detalle={vistaMensajeroDesdeAdmin(detalle)}
          audiencia={audiencia === "admin" ? "central" : "satelite"}
          // SLT-104 (R116): un cierre de satélite abierto por la central, siempre en solo lectura.
          modo={soloLecturaSatelite ? "solo lectura" : modoAdminDe(cierreAbierto.estado)}
          pestanas={{
            gestiones: (
              <div className="flex flex-col gap-4">
                {/* SLT-101 (R90): la lista y la fila únicas con la audiencia del actor; «Descargar»
                    en la fila de los filtros. Los callbacks son los de hoy. */}
                <GestionesCierre
                  gestiones={gestionesEnOrden(detalle.grupos).map((gestion) => ({ gestion }))}
                  audiencia={audienciaFila}
                  // FICHA 481 — fulfillment SOLO para la central.
                  quienMiraEsCentral={audiencia === "admin"}
                  congeladoAt={cierreAbierto.solicitadoAt}
                  onVerEvidencia={setEvidencia}
                  // Ausentes cuando no se puede corregir o ajustar (pedido 2026-08-19, 398, SLT-56).
                  acciones={{
                    corregirMetodos: ofrecerCorreccionPagos ? setCorrigiendo : undefined,
                    corregirResultado: ofrecerCorreccionResultado ? setCorrigiendoResultado : undefined,
                    ajustarPago: ofrecerAjustePago ? setAjustandoPago : undefined,
                  }}
                  descargar={
                    // R21/R82/R91: las gestiones del detalle ya leído, todas, sea cual sea el filtro.
                    <DescargarDatasetButton
                      titulo={tituloDescargaGestiones(folioDe(cierreAbierto.cierreId))}
                      columnas={COLUMNAS_DESCARGA_DETALLE_CIERRE}
                      obtenerFilas={async () => ({
                        status: "ok",
                        filas: Object.values(detalle.grupos)
                          .flat()
                          .map((g) => filaDescargaDetalleCierre(g, audienciaFila)),
                      })}
                    />
                  }
                />
                {/* R19 — las órdenes que el corte pasó a «Novedad interna» (264), con su marca. */}
                <SeccionSinGestion
                  ordenes={detalle.ordenesSinGestion}
                  registrado={detalle.sinGestionRegistrado}
                />
              </div>
            ),
            // R17 — siempre visible, también con 0 (D11, D27).
            rechazos: <RechazosDeTiendaCierre rechazos={detalle.rechazosDeTienda} />,
            // R18 — Feature 172 (T E.2): solo aprobado y con permiso de pagar. Tras registrar o
            // anular, el pendiente se vuelve a LEER del servidor; no se recalcula en el cliente.
            pago: ofrecerPagoEnDetalle ? (
              <PagoMensajeroSeccion
                cierreId={cierreAbierto.cierreId}
                mensajeroNombre={cierreAbierto.mensajeroNombre}
                pendiente={cierreAbierto.pendientePagoMensajero}
                puedeAnular={puedeRegistrarPago}
                onRegistrado={async () => {
                  await abrirDetalle(cierreAbierto.cierreId);
                  refrescarListas();
                }}
              />
            ) : undefined,
          }}
          acciones={{
            // R39 — los flujos de hoy: el sub-modal de motivo y `pedirAprobacion`, que encadena
            // la confirmación física y la indemnización. Solo en un `solicitado` (111/R15).
            rechazar: esResoluble
              ? () => {
                  setMotivo("");
                  setMotivoError(null);
                  setRechazando(true);
                }
              : undefined,
            aprobar: esResoluble ? pedirAprobacion : undefined,
            // R83 — el mismo diálogo y la misma `confirmarDestrabar` que la cola.
            destrabar:
              !soloLecturaSatelite && cierreAbierto.estado === "vencido"
                ? () => setDestrabar(cierreAbierto)
                : undefined,
          }}
          onCerrar={cerrarDetalle}
        />
      ) : null}

      {/* Pedido humano (2026-08-19): el editor del desglose, el MISMO que usa el mensajero. Tras
          corregir se RELEE el detalle del servidor —los totales del cierre los recalculó él en la
          misma transacción— y se refrescan las listas. SLT-100: hermano del detalle, no hijo. */}
      <CorregirPagosDialog
        gestion={corrigiendo}
        onOpenChange={(open) => {
          if (!open) setCorrigiendo(null);
        }}
        onCorregido={async () => {
          if (cierreAbierto) await abrirDetalle(cierreAbierto.cierreId);
          refrescarListas();
        }}
      />

      {/* FICHA 398 (T4.2, R16): la corrección del RESULTADO de una entrega que nunca ocurrió. Mismo
          trato que su hermano de arriba: tras corregir se RELEE el detalle y se refrescan las
          listas. */}
      <CorregirResultadoDialog
        gestion={corrigiendoResultado}
        onOpenChange={(open) => {
          if (!open) setCorrigiendoResultado(null);
        }}
        onCorregido={async () => {
          if (cierreAbierto) await abrirDetalle(cierreAbierto.cierreId);
          refrescarListas();
        }}
      />

      {/* SLT-56 (R11/R21): el ajuste del pago al mensajero. Al volver `ok` se pinta YA lo que
          devolvió el servidor y después se relee el detalle —lo que deriva del total lo recalcula
          él— y se refrescan las listas. */}
      <AjustarPagoMensajeroDialog
        gestion={ajustandoPago}
        onOpenChange={(open) => {
          if (!open) setAjustandoPago(null);
        }}
        onAjustado={(r) => {
          aplicarAjusteLocal(r);
          // Sin `await`: lo que el usuario necesita ver ya está pintado; la relectura llega
          // detrás y no deja el botón del diálogo esperando.
          if (cierreAbierto) void abrirDetalle(cierreAbierto.cierreId);
          refrescarListas();
        }}
      />

      {/* ---------- Sub-modal de rechazo con motivo obligatorio (R11) ---------- */}
      <Modal
        open={rechazando}
        onOpenChange={(next) => {
          if (!next) {
            setRechazando(false);
            setMotivoError(null);
          }
        }}
        title="Rechazar cierre"
        description="Indica el motivo del rechazo. El mensajero lo verá para corregir."
        confirmLabel="Rechazar cierre"
        confirmVariant="destructive"
        onConfirm={confirmarRechazo}
        closeOnConfirm={false}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor="motivo-rechazo" className="text-sm font-medium">
            Motivo del rechazo
          </label>
          <textarea
            id="motivo-rechazo"
            value={motivo}
            onChange={(e) => {
              setMotivo(e.target.value);
              if (motivoError) setMotivoError(null);
            }}
            rows={4}
            aria-required="true"
            aria-invalid={motivoError !== null}
            aria-describedby={motivoError ? "motivo-rechazo-error" : undefined}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          />
          {motivoError ? (
            <p
              id="motivo-rechazo-error"
              role="alert"
              className="text-sm text-destructive"
            >
              {motivoError}
            </p>
          ) : null}
        </div>
      </Modal>

      {/* ---------- Ventana de CONFIRMACIÓN FÍSICA (feature 238/R7/R27/R33-R37) ----------
          Va ANTES del sub-modal de montos en el archivo y en el flujo (R37): si falta un
          paquete, no se llega a teclear dinero que se va a descartar.

          `closeOnConfirm={false}`: la confirmación puede volver del servidor con errores por
          fila, y cerrarla obligaría a re-escanear catorce guías.

          `confirmDisabled` MÁS el texto de la barra de estado (R27): el motivo del bloqueo se
          dice con palabras y nombra la salida —rechazar el cierre—, porque no hay ninguna otra
          (D2, firmada: un solo paquete perdido devuelve el cierre entero, y es deliberado). */}
      <Modal
        open={confirmando}
        onOpenChange={(next) => {
          // R35: cerrar sin completar no envía nada y no persiste nada; el cierre sigue
          // `solicitado`. Lo ya escaneado se conserva mientras el detalle siga abierto.
          if (!next) {
            setConfirmando(false);
            setAvisoLectura(null);
          }
        }}
        title={CONFIRMACION_TITULO}
        description={CONFIRMACION_DETALLE}
        confirmLabel={
          incidentes.length > 0 ? CONFIRMACION_CONTINUAR : CONFIRMACION_APROBAR
        }
        confirmDisabled={faltanPorConfirmar > 0}
        onConfirm={continuarTrasConfirmacion}
        closeOnConfirm={false}
      >
        {/* R36: la tarjeta de escaneo —y con ella `QrScanner`— se MONTA con la ventana y se
            desmonta al cerrarla; no se esconde por CSS. Así la cámara apagada no depende de lo
            que la primitiva de diálogo haga con su contenido, y se puede afirmar con un test. */}
        {confirmando ? (
          <ConfirmacionFisicaCuerpo
            filas={conjuntoEsperado}
            incidentes={incidentes}
            confirmadas={confirmadas}
            errores={confirmacionErrores}
            aviso={avisoLectura}
            ultimaGuiaConfirmada={ultimaGuiaConfirmada}
            onLectura={leerGuia}
          />
        ) : null}
      </Modal>

      {/* ---------- Sub-modal de captura de indemnizaciones (feature 158/R19/R34) ----------
          Espejo del sub-modal de rechazo: se abre DESDE el detalle, con un dato extra
          obligatorio antes de confirmar. Una fila por incidente; el confirmar queda
          deshabilitado mientras falte o sea inválido algún monto, con el mismo criterio
          (`montoValido`) que revalida el servidor. Los montos son STRING de punta a punta. */}
      <Modal
        open={indemnizando}
        onOpenChange={(next) => {
          if (!next) {
            setIndemnizando(false);
            setMontoErrores({});
          }
        }}
        title={INDEMNIZACION_TITULO}
        description={INDEMNIZACION_DETALLE}
        confirmLabel={INDEMNIZACION_CONFIRMAR}
        confirmDisabled={!todosLosMontosValidos}
        onConfirm={confirmarAprobacionConMontos}
        closeOnConfirm={false}
      >
        <div className="flex flex-col gap-4">
          {incidentes.map((g) => {
            const inputId = `indemnizacion-${g.gestionId}`;
            // El error del servidor manda (llegó de una decisión real); si no lo hay, se pinta
            // el del cliente, que es el que caza el tope ANTES de intentar aprobar.
            const error = montoErrores[g.gestionId] ?? errorDeMonto(montos[g.gestionId] ?? "");
            return (
              <div
                key={g.gestionId}
                className="flex flex-col gap-1.5 rounded-lg border border-border p-3"
              >
                <p className="text-sm font-medium">
                  {g.numRemision} · {g.destinatario}
                </p>
                <p className="text-xs text-muted-foreground">
                  {`Nº Guía ${g.numGuia ?? "—"} · ${g.tiendaNombre}`}
                  {g.motivo ? ` · ${g.motivo}` : ""}
                </p>
                {/* R34: la CAUSA, destacada y no escondida en la línea de contexto. Es el dato
                    que justifica el monto: no es lo mismo indemnizar un paquete raspado que uno
                    robado, y el admin lo decide mirando esto. */}
                <p className="text-sm">
                  <span className="text-muted-foreground">{INDEMNIZACION_CAUSA_LABEL}: </span>
                  <span className="font-medium">
                    {g.causaIncidente
                      ? CAUSA_INCIDENTE_LABEL[g.causaIncidente]
                      : INDEMNIZACION_CAUSA_DESCONOCIDA}
                  </span>
                </p>
                <Label htmlFor={inputId}>{INDEMNIZACION_MONTO_LABEL}</Label>
                <Input
                  id={inputId}
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="0.00"
                  value={montos[g.gestionId] ?? ""}
                  aria-invalid={error ? true : undefined}
                  aria-describedby={error ? `${inputId}-error` : `${inputId}-ayuda`}
                  onChange={(e) => {
                    const valor = e.target.value;
                    setMontos((prev) => ({ ...prev, [g.gestionId]: valor }));
                    // Teclear limpia el error del servidor de ESA fila (no el de las otras).
                    setMontoErrores((prev) => {
                      if (!prev[g.gestionId]) return prev;
                      const rest = { ...prev };
                      delete rest[g.gestionId];
                      return rest;
                    });
                  }}
                />
                {error ? (
                  <p id={`${inputId}-error`} role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                ) : (
                  <p id={`${inputId}-ayuda`} className="text-xs text-muted-foreground">
                    {INDEMNIZACION_MONTO_AYUDA}
                  </p>
                )}
              </div>
            );
          })}
          {/* El motivo del bloqueo se dice con TEXTO, no sólo con un botón apagado. */}
          {todosLosMontosValidos ? null : (
            <p role="note" className="text-sm text-muted-foreground">
              {INDEMNIZACION_FALTAN}
            </p>
          )}
        </div>
      </Modal>

      {/* ---------- Confirmación de la VÁLVULA DE ESCAPE (feature 111/R16) ----------
          Acción de EXCEPCIÓN, diferenciada de aprobar/rechazar: destraba un `vencido`
          abandonado en nombre del mensajero. El copy lo deja claro. */}
      <Modal
        open={destrabar !== null}
        onOpenChange={(next) => {
          if (!next) setDestrabar(null);
        }}
        title="Destrabar cierre vencido abandonado"
        description={
          destrabar
            ? `Acción de excepción. Enviarás a aprobación el cierre vencido de ${destrabar.mensajeroNombre} en su nombre, porque no lo solicitó. Después deberás aprobarlo o rechazarlo por la vía normal. No se recalculan los montos ya registrados.`
            : undefined
        }
        confirmLabel="Destrabar (excepción)"
        confirmVariant="destructive"
        onConfirm={confirmarDestrabar}
        closeOnConfirm={false}
      />

      {/* ---------- Feature 172 (T E.1, §8/R16/R17/R18): se pregunta AL APROBAR ----------
          Se monta cuando `aprobarCierre` respondió `ok` con pendiente > 0 y el actor puede
          pagar. Va FUERA del modal de detalle a propósito: cuando aparece, el cierre ya está
          aprobado y su detalle cerrado.

          LO QUE ESTE BLOQUE NO HACE, y es lo que decide si la tanda vale algo: no puede
          revertir la aprobación. No hay una sola llamada aquí que toque el cierre — ni al
          cerrarse con «Ahora no» (se descarta el estado local y ya), ni cuando el pago falla
          (el diálogo se queda abierto con su clave y el aviso dice que el cierre sigue
          aprobado). Si el pago pudiera tumbar la aprobación, el cierre volvería a
          `solicitado`, que BLOQUEA al mensajero (feature 111): se quedaría sin trabajar al día
          siguiente por un trámite administrativo ajeno a él. */}
      {/* SLT-102 (R103): el mismo diálogo se abre desde «Registrar pago» de la fila, sin
          `trasAprobar` (sin «Ahora no»), y tras registrar relee las listas igual. */}
      {pagoAbierto ? (
        <RegistrarPagoMensajeroDialog
          open
          onOpenChange={(next) => {
            // R17: cerrar —con «Ahora no», con Escape o con el overlay— no persiste nada.
            if (!next) setPagoAbierto(null);
          }}
          cierreId={pagoAbierto.cierreId}
          mensajeroNombre={pagoAbierto.mensajeroNombre}
          pendiente={pagoAbierto.pendiente}
          trasAprobar={pagoAbierto.trasAprobar}
          onRegistrado={async () => {
            // Refresco DIRIGIDO de los comprobantes de ESE cierre (R33) + la ruta, para que
            // el listado vuelva a traer el pendiente derivado por el servidor (R26).
            await mutate(clavePagosDeCierre(pagoAbierto.cierreId));
            refrescarListas();
          }}
        />
      ) : null}

      {/* ---------- Visor de evidencia (URL firmada, R7; visor único SLT-103 R137) ---------- */}
      <VisorEvidencia evidencia={evidencia} onClose={() => setEvidencia(null)} />
    </div>
  );
}
