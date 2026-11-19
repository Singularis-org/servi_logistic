"use client";

import { useRef, useState } from "react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { IntentosDato, valorIntentos } from "@/components/shared/intentos-entrega";
import { Pagination } from "@/components/shared/Pagination";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/useToast";
import { listarRechazosSlaTiendaAction } from "@/lib/actions/rechazos-sla-tienda";
import type { RechazoSlaTiendaDTO } from "@/lib/types/rechazo-sla-tienda";
import { NOMBRE_ESTADO } from "@/lib/types/order-status";
import { BUSQUEDA_MAX_CHARS, BUSQUEDA_MIN_CHARS } from "@/lib/types/orden";
import { PLACEHOLDER_BUSQUEDA } from "@/app/(app)/ordenes/_components/ordenes-filtros-def";
import { LIMPIAR_BUSQUEDA, SIN_COINCIDENCIAS_TITULO } from "./NovedadesModule";

// Feature 102 (T12, design §6.2) — sección/pestaña de solo-lectura "Rechazadas por SLA" DENTRO
// de `/novedades` (Q3 default: pantalla que la tienda YA visita, sin ítem de menú nuevo). Es la
// continuación natural de la orden que "se graduó" de novedad a rechazo por vencimiento de SLA.
// Componente PRIVADO (datos sensibles de la tienda por props, arquitectura §private): el Server
// Component padre YA validó rol `adminTienda` y pre-fetch de la página 1 (R12/R13). Por cada orden
// muestra la guía (o placeholder si `null`, R14), la remisión y el destinatario. Al cambiar de
// página re-fetch por Server Action `listarRechazosSlaTiendaAction({ page })` (lectura interna, NO
// fetch a /api), patrón `NovedadesModule` (R14). Lista vacía → estado vacío legible.
//
// Feature 308 (2026-08-28) — ESTA LISTA YA NO PINTA NINGÚN IMPORTE, y no es una omisión: aquí se
// pintaba `RechazoSlaTiendaDTO.monto` en negrita y SIN ETIQUETA, y ese número NO ES DE LA TIENDA.
// Es el `ingreso_bodega_rechazo` de 56 (cadena medida: DTO → `RechazosSlaTiendaService.listar` →
// `OrdenRepository.findRechazadasSlaByTienda`, que lo lee de `gestion.ingresoBodegaRechazo`), o
// sea, lo que la BODEGA ingresa por el rechazo. A la tienda un rechazo le cuesta por OTRA vía
// (flete de retorno + IVA), así que el importe que leía como propio no era ni su ingreso ni su
// cargo. Se RETIRA (decisión del humano, 2026-08-28): no se etiqueta y no se sustituye por el
// cargo real de la tienda — eso sería backend y quedó fuera de alcance. Con el importe fuera cae
// también su badge de "pendiente de cierre": solo existía para explicar POR QUÉ ese mismo importe
// ajeno todavía no se podía pintar. El campo `monto` del DTO se deja intacto a propósito (retirarlo
// es backend). Si vuelve a hacer falta un número en esta pantalla, tiene que ser el de la tienda y
// tiene que llevar etiqueta.

// --- Etiquetas i18n-ready (texto separado de la lógica) ---
const GUIA_LABEL = "Guía";
const GUIA_SIN_ASIGNAR_LABEL = "sin asignar";
const REMISION_LABEL = "Remisión";
// FICHA 455 (2026-09-24): alineado con la pestaña («Devolución a origen por plazo vencido») y con
// los nombres vigentes de los estados, leídos de la fuente.
const LISTA_ARIA_LABEL = "Órdenes con devolución a origen por plazo vencido";
const VACIO_TITULO = "No tenés órdenes con devolución a origen por plazo vencido";
// Feature 308: la frase prometía "con su monto" y ese monto era el de la bodega. Sin importe en
// la lista, prometerlo además sería prometer algo que ya no ocurre.
const VACIO_DETALLE =
  `Cuando una de tus órdenes en ${NOMBRE_ESTADO.novedad} pase a ` +
  `${NOMBRE_ESTADO.devolucion_a_origen_por_rechazo} por vencerse el plazo, aparecerá acá.`;
const PAGINACION_ARIA_LABEL = "Paginación de órdenes con devolución a origen por plazo vencido";
/** SLT-194 (R949): nombre accesible del buscador de la pestaña. */
const BUSCADOR_LABEL = "Buscar entre las órdenes con devolución a origen por plazo vencido";

export interface RechazosSlaModuleProps {
  items: RechazoSlaTiendaDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export function RechazosSlaModule({
  items: initialItems,
  total: initialTotal,
  page: initialPage,
  pageSize,
}: RechazosSlaModuleProps) {
  const toast = useToast();

  const [items, setItems] = useState(initialItems);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(initialPage);
  const [loading, setLoading] = useState(false);
  // SLT-194 (R950, R951, D4): el término aplicado. No se lee de la URL: la página 1 la precarga el
  // servidor sin término (R957), y leerlo mostraría un término que no se aplicó.
  const [termino, setTermino] = useState("");
  // Remonta la barra al «Limpiar la búsqueda»: su campo es estado interno de `BuscadorFiltros`
  // (el mismo gesto que `NovedadesFiltrosBarra`).
  const [resetBarra, setResetBarra] = useState(0);
  // Solo vale la respuesta de la última petición: un término nuevo no puede verse pisado por la
  // respuesta tardía del anterior.
  const ultimaPeticion = useRef(0);

  /**
   * Re-fetch de la página pedida por Server Action, con el término puesto (R951). Errores → toast,
   * sin romper la vista.
   */
  async function cargar(nextPage: number, q: string) {
    const peticion = ++ultimaPeticion.current;
    setLoading(true);
    try {
      const res = await listarRechazosSlaTiendaAction(
        q === "" ? { page: nextPage } : { page: nextPage, q },
      );
      if (peticion !== ultimaPeticion.current) return;
      if (res.status !== "ok") {
        if (res.status === "forbidden") {
          toast.error("No tenés permiso para ver las órdenes con devolución a origen por plazo vencido.");
        } else if (res.status === "unauthenticated") {
          toast.error("Tu sesión expiró. Iniciá sesión de nuevo.");
        } else {
          toast.error("No se pudo cargar la página. Intentá de nuevo.");
        }
        return;
      }
      setItems(res.items);
      setTotal(res.total);
      setPage(res.page);
    } finally {
      if (peticion === ultimaPeticion.current) setLoading(false);
    }
  }

  function cambiarPagina(nextPage: number) {
    void cargar(nextPage, termino);
  }

  /** R950/R951: un término nuevo (o el campo vacío) pide la página 1. */
  function buscar(nuevo: string) {
    setTermino(nuevo);
    void cargar(1, nuevo);
  }

  function limpiarBusqueda() {
    setResetBarra((n) => n + 1);
    buscar("");
  }

  // R952: sin término y sin rechazos, el vacío de hoy, sin barra.
  if (items.length === 0 && termino === "") {
    // Estado vacío legible en vez de una lista sin filas.
    return (
      <div
        className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center"
        role="status"
      >
        <p className="text-base font-medium text-foreground">{VACIO_TITULO}</p>
        <p className="text-sm text-muted-foreground">{VACIO_DETALLE}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* SLT-194 (R949, DC1, D4): el MISMO buscador con `escaneo` de Devoluciones (B3), sin filtros. */}
      <BuscadorFiltros
        key={resetBarra}
        escaneo
        label={BUSCADOR_LABEL}
        placeholder={PLACEHOLDER_BUSQUEDA}
        minChars={BUSQUEDA_MIN_CHARS}
        maxLength={BUSQUEDA_MAX_CHARS}
        leerDeUrl={false}
        onChange={buscar}
      />

      {items.length === 0 ? (
        // R952: con término y sin coincidencias, se dice y se ofrece deshacerlo.
        <div
          className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-muted/20 p-10 text-center"
          role="status"
        >
          <p className="text-base font-medium text-foreground">{SIN_COINCIDENCIAS_TITULO}</p>
          <Button type="button" variant="outline" size="sm" onClick={limpiarBusqueda}>
            {LIMPIAR_BUSQUEDA}
          </Button>
        </div>
      ) : (
      <>
      <ul aria-label={LISTA_ARIA_LABEL} className="flex flex-col gap-3">
        {items.map((rechazo) => (
          <li
            key={rechazo.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex flex-col gap-1">
              <p className="text-sm font-medium text-foreground">
                {GUIA_LABEL}{" "}
                {rechazo.numGuia !== null ? (
                  rechazo.numGuia
                ) : (
                  <span className="text-muted-foreground">
                    {GUIA_SIN_ASIGNAR_LABEL}
                  </span>
                )}
              </p>
              <p className="text-sm text-muted-foreground">
                {REMISION_LABEL} {rechazo.numRemision}
              </p>
              <p className="text-sm text-foreground">{rechazo.destinatario}</p>
              {/* Feature 160 (R18/R19/R26): igual que la pestaña de novedades, esto es
                  una lista de cards y no un `DataTable` -> dato etiquetado con el
                  markup de sus líneas hermanas. Siempre visible, `0` incluido. */}
              <p className="text-sm text-muted-foreground">
                <IntentosDato intentos={valorIntentos(rechazo)} />
              </p>
            </div>
          </li>
        ))}
      </ul>

      <Pagination
        page={page}
        pageSize={pageSize}
        total={total}
        onPageChange={cambiarPagina}
        disabled={loading}
        ariaLabel={PAGINACION_ARIA_LABEL}
      />
      </>
      )}
    </div>
  );
}
