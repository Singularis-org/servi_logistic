"use client";

import { useId, useState } from "react";
import { ChevronDown, MapPin, Navigation } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { CLASE_INFO_TACTIL, COLUMNA_FIJA, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import { IntentosDato, valorIntentos } from "@/components/shared/intentos-entrega";
import {
  avisoReservaParaOtroDia,
  ETIQUETA_PARA_MANANA,
} from "@/lib/utils/dia-reparto-textos";

import { UbicacionTrigger } from "../UbicacionTrigger";
import { useMonedaDelPais } from "@/hooks/use-moneda-del-pais";
import { formatMonto, lineaUbicacion } from "./pos-format";
import { CLASE_NOTA_AYUDA, claseChipEstado, marcasDeTarjeta, textoParada } from "./pos-estado";
import { textoMensajero } from "./pos-mensajero";
import { posSeleccionHandlers } from "./pos-seleccion";
import { seccionesVisibles } from "./pos-secciones";
import { EstadoConInfo, NotaAyudaConInfo } from "@/components/shared/EstadoInfo";
import type { PosOrderCardProps } from "./PosOrderCard";

// POS card · vista DETALLE en FILA (rama ux, pedido humano): una línea por orden con la
// acción de navegar a la izquierda (target grande, lo primero que necesita el mensajero
// en la calle), los datos de identificación al centro y el monto a cobrar a la derecha.
// Componente NUEVO y hermano de `PosOrderCard` (que se conserva intacta) y de
// `PosOrderCardMosaico`: comparten interfaz de props, así que son intercambiables.
//
// El botón de navegar es un ENLACE real a Google Maps (mismo criterio que `PosNavBlock`:
// ruta directa, pestaña nueva, sin forzar permisos de GPS), no un botón decorativo. Al ser
// un control interno, pulsarlo NO selecciona la orden de rebote (ver `pos-seleccion`).

/** SLT-190 (B1): el (i) de la fila plegada de Recolección (vive en `texto-entero`; su test lo importa de aquí). */
export { CLASE_INFO_TACTIL };

export function PosOrderCardDetalle({
  orden,
  total,
  esActiva = false,
  esDetalle = false,
  bloqueado = false,
  onGestionar,
  nota,
  notaAyuda = false,
  mostrarRuta = true,
  secciones,
  acciones,
  mensajero,
  compacta = false,
  filaReparto,
  posicion,
  filaRecoleccion,
}: PosOrderCardProps) {
  // SLT-156 (R508): estado del despliegue de la vista compacta. Va arriba, antes de cualquier
  // retorno, por la regla de los hooks; la vista de siempre no lo lee.
  const [abierta, setAbierta] = useState(false);
  const idDespliegue = useId();
  // SLT-235 (R11): el monto en la moneda del país de la empresa.
  const moneda = useMonedaDelPais();
  // FICHA 455 (R7/R8): el chip es el estado de la orden; activa/detalle/nota van en marcas aparte.
  const marcas = marcasDeTarjeta(esActiva, esDetalle, nota);
  // Feature 196: las mismas compuertas que las otras dos vistas, con el mismo default.
  // `detalle` no tiene nada que apagar AQUÍ: esta vista es una fila y nunca llevó el
  // desplegable "Ver detalle completo" (lo dice el encabezado del componente).
  const {
    navegacion: verNavegacion,
    cobro: verCobro,
    intentos: verIntentos,
  } = seccionesVisibles(secciones);
  const { seleccionable, onClick, onKeyDown } = posSeleccionHandlers({
    onGestionar,
    bloqueado,
  });


  // Ubicación en una línea: cantón · distrito — dirección (lo que falta se omite).
  const ubicacion = lineaUbicacion(orden);

  const nombreAccesible = onGestionar
    ? `Gestionar orden ${orden.numRemision} · ${orden.destinatario}`
    : `Orden ${orden.numRemision} · ${orden.destinatario}`;

  const parada = mostrarRuta ? (
    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-navy text-[10px] font-black text-white">
      <span className="sr-only">
        {orden.secuenciaRuta === null
          ? "Sin posición en la ruta"
          : `Parada ${orden.secuenciaRuta} de ${total}`}
      </span>
      <span aria-hidden="true">{textoParada(orden)}</span>
    </span>
  ) : posicion !== undefined ? (
    // SLT-190 (R855, R856, DS3): la posición en la lista visible, que no es una parada.
    <span className="flex size-5 shrink-0 items-center justify-center rounded-md bg-navy text-[10px] font-black text-white">
      <span className="sr-only">{`Orden ${posicion} de ${total}`}</span>
      <span aria-hidden="true">{posicion}</span>
    </span>
  ) : null;

  // El chip de estado, las marcas de la card y las de EXCEPCIÓN. Las dos vistas pintan lo mismo;
  // la compacta lo lleva al despliegue (el chip trae su propio botón de información, y un botón
  // no puede ir dentro del botón de la fila).
  const chipsYMarcas = (
    <>
      {/* FICHA 456 (T3.6, R9): el chip con su botón de información (nombre calculado dentro). */}
      <EstadoConInfo
        botonFlotante
        codigo={orden.estatusValue}
        chipClassName={`rounded-full px-2 py-1 text-[9px] font-bold tracking-wide ${claseChipEstado(orden.estatusValue)}`}
      />
      {marcas.map((m) => (
        <span key={m.texto} className={`rounded-full px-2 py-1 text-[9px] font-bold tracking-wide ${m.clase}`}>
          {m.texto}
        </span>
      ))}
      {notaAyuda ? (
        <NotaAyudaConInfo
          className={CLASE_INFO_TACTIL}
          chipClassName={`rounded-full px-2 py-1 text-[9px] font-bold tracking-wide ${CLASE_NOTA_AYUDA}`}
        />
      ) : null}
      {/* Marcas de EXCEPCIÓN (R28 / feature 115/R18 / feature 246/R22), solo si aplican. */}
      {mostrarRuta && orden.secuenciaRuta === null ? (
        <Badge variant="outline">Pendiente de optimizar</Badge>
      ) : null}
      {/* Feature 246 (T5.2, R22): orden RESERVADA para el día siguiente, dicha con palabras.
          El dato lo deriva el servidor (`esParaManana`, R26) y deja de ser cierto solo, al
          llegar el día (R25).
          ⏳ FEATURE 261 (2026-08-21): la decisión D5 quedó REVERTIDA — la reserva ya no
          protege sólo del corte, también del mensajero: la orden no se puede recoger ni
          gestionar hasta su día, y el bloqueo vive en el servidor. R23 sigue en pie: la marca
          **no oculta** la orden y la card sigue entera. Ver `specs/261-dia-reparto-protege`. */}
      {orden.esParaManana ? (
        <Badge variant="info">{ETIQUETA_PARA_MANANA}</Badge>
      ) : null}
      {orden.marcarLuego ? (
        <Badge variant="warning">Gestionar más tarde</Badge>
      ) : null}
    </>
  );

  // Las líneas de datos bajo el destinatario, compartidas por las dos vistas.
  const lineasDeDatos = (
    <>
      {/* Feature 160/R19: intentos siempre visibles, `0` incluido, en las superficies que
          los tienen; la 196 permite apagarlos donde no existen. */}
      {verIntentos ? (
        <p className="text-[11px] font-semibold text-muted-foreground">
          <IntentosDato intentos={valorIntentos(orden)} />
        </p>
      ) : null}
      {/* FICHA 296 — quién lleva esta orden. Va en la columna central, con los demás datos de
          la fila y NO entre las marcas de excepción de arriba: es un dato, no una excepción.
          La compuerta es la PRESENCIA de la prop; el portal del mensajero no la pasa. */}
      {mensajero !== undefined ? (
        <p className={`text-[11px] font-semibold text-muted-foreground ${TEXTO_ENTERO}`}>
          {textoMensajero(mensajero)}
        </p>
      ) : null}
      {/* Feature 261 (F2, R11): el badge dice QUÉ es la orden; esta línea dice POR QUÉ todavía
          no se puede trabajar y DESDE QUÉ DÍA se podrá. El literal NO se escribe aquí: sale de
          la fuente única (`avisoReservaParaOtroDia`, R15), la misma frase que devuelve el
          servidor al rechazar y la misma que lee la tienda. La fecha llega YA RESUELTA en
          `fechaRepartoISO` (R14): aquí no se construye ningún `Date`. */}
      {orden.esParaManana ? (
        <p role="note" className="text-[11px] font-semibold text-muted-foreground">
          {avisoReservaParaOtroDia(orden.fechaRepartoISO)}
        </p>
      ) : null}
    </>
  );

  const navegar = verNavegacion ? (
    <UbicacionTrigger
      orden={orden}
      ariaLabel={`Ver en el mapa la ubicación de ${orden.destinatario}`}
      className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-brand text-brand-foreground transition-transform hover:scale-105 active:scale-95 motion-reduce:transition-none motion-reduce:hover:scale-100"
    >
      <Navigation className="size-5" aria-hidden="true" />
    </UbicacionTrigger>
  ) : null;

  const borde = esDetalle ? "border-brand ring-1 ring-brand" : "border-border";

  // SLT-189 (R790-R792, R800): en Reparto la fila lleva la GUÍA (si no hay, la remisión, R791) y
  // «destinatario · dirección|tienda»; sin el segundo dato, el nombre solo, sin « · ».
  const segundoDato =
    filaReparto === "direccion"
      ? orden.direccion
      : filaReparto === "tienda"
        ? orden.tiendaNombre
        : null;
  const lineaArriba = filaReparto ? (orden.numGuia ?? orden.numRemision) : orden.numRemision;
  const lineaAbajo = segundoDato ? `${orden.destinatario} · ${segundoDato}` : orden.destinatario;

  if (compacta) {
    // SLT-156 (R508, canvas v35: RepartoDetalle) — UNA fila por orden: lo que el mensajero
    // necesita para reconocer el paquete (parada, guía, destinatario) y lo que va a cobrar, en
    // columna fija a la derecha. Toda la fila es el disparador; el resto —dirección completa,
    // estado, marcas, intentos y las acciones— se despliega al tocarla. Nada se esconde: queda a
    // un toque, y entero (R490).
    return (
      <article
        aria-label={nombreAccesible}
        className={`flex flex-col rounded-xl border bg-card shadow-sm transition-all ${borde}`}
      >
        <button
          type="button"
          aria-expanded={abierta}
          aria-controls={abierta ? idDespliegue : undefined}
          onClick={() => setAbierta((previo) => !previo)}
          className="flex w-full items-start gap-3 rounded-xl p-3 max-md:min-h-11 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        >
          {parada}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className={`font-mono text-xs font-bold text-foreground ${TEXTO_ENTERO}`}>
              {lineaArriba}
            </span>
            <span className={`text-sm font-bold text-foreground ${TEXTO_ENTERO}`}>
              {lineaAbajo}
            </span>
            {filaRecoleccion ? (
              <>
                {/* SLT-190 (R862, R863, P3): la tienda (solo su nombre: su dirección no viaja) y,
                    en «Recogidos en tienda hoy», « · Recogido a las {hora}». */}
                {orden.tiendaNombre || filaRecoleccion.sufijo ? (
                  <span className={`text-xs text-muted-foreground ${TEXTO_ENTERO}`}>
                    {orden.tiendaNombre}
                    {orden.tiendaNombre && filaRecoleccion.sufijo ? " · " : null}
                    {filaRecoleccion.sufijo}
                  </span>
                ) : null}
              </>
            ) : null}
          </span>
          {verCobro ? (
            <span className={`flex flex-col items-end ${COLUMNA_FIJA}`}>
              <span className="text-[10px] font-semibold text-muted-foreground">
                Valor a cobrar
              </span>
              <span className={`text-right font-mono text-sm font-bold text-foreground ${COLUMNA_FIJA}`}>
                {formatMonto(orden.montoCobrar, moneda)}
              </span>
            </span>
          ) : null}
          <ChevronDown
            className={`mt-1 size-4 shrink-0 text-muted-foreground transition-transform ${abierta ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>

        {filaRecoleccion ? (
          // SLT-190 (R862, R864; decisión de Carlos sobre B1, 2026-11-17): el nombre VIGENTE del
          // estado, en texto, con su botón de información (456 R18) como HERMANO de la fila, igual
          // que en la fila del chat: un botón no anida otro, así que estado e (i) van FUERA del
          // botón de la fila, debajo, alineados con su columna de texto. Tocar el (i) no despliega
          // la tarjeta (no está dentro del disparador). Área táctil de 44 × 44: el pseudo-elemento
          // del botón crece de 24 a 44 px sin ocupar caja (se aparta del canvas en ese icono).
          <div className={`-mt-2 flex items-center pr-3 max-md:min-h-11 ${parada ? "pl-11" : "pl-3"}`}>
            <EstadoConInfo
              codigo={orden.estatusValue}
              chipClassName="text-[11px] font-semibold text-muted-foreground"
              className={CLASE_INFO_TACTIL}
            />
          </div>
        ) : null}

        {abierta ? (
          <div
            id={idDespliegue}
            className="flex flex-col gap-2 border-t border-dashed border-border px-3 pt-2 pb-3"
          >
            <div className="flex flex-wrap items-center gap-2">{chipsYMarcas}</div>
            {verNavegacion ? (
              <div className="flex items-start gap-3">
                {navegar}
                <p className="flex min-w-0 flex-1 items-start gap-1 text-xs text-muted-foreground">
                  <MapPin className="size-3 shrink-0" aria-hidden="true" />
                  <span className={TEXTO_ENTERO}>{ubicacion || "Sin dirección"}</span>
                </p>
              </div>
            ) : null}
            {lineasDeDatos}
            {acciones ? <div className="pt-1">{acciones}</div> : null}
          </div>
        ) : null}
      </article>
    );
  }

  return (
    <article
      onClick={onClick}
      onKeyDown={onKeyDown}
      tabIndex={seleccionable ? 0 : undefined}
      // Mismo criterio que en la vista mosaico: la card conserva su nombre accesible aunque
      // ya no seleccione al tocarla (rama ux).
      aria-label={nombreAccesible}
      className={`flex flex-col gap-2 rounded-xl border bg-card p-3 shadow-sm transition-all ${borde} ${
        seleccionable
          ? "cursor-pointer hover:border-brand/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          : ""
      }`}
    >
      <div className="flex items-center gap-3">
      {navegar}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          {parada}
          <span className="font-mono text-[11px] font-bold text-foreground">
            {orden.numRemision}
          </span>
          {chipsYMarcas}
        </div>
        {/* SLT-156 (R490): el destinatario entero, en varias líneas si no cabe (sin «…»). */}
        <p className={`text-sm font-bold text-foreground ${TEXTO_ENTERO}`}>
          {orden.destinatario}
        </p>
        {/* La línea de ubicación es parte de la NAVEGACIÓN, no del identificador: sin ella
            el "Sin dirección" del fallback afirmaría un hueco donde no hay dato que dar. */}
        {verNavegacion ? (
          <p className="flex min-w-0 items-start gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden="true" />
            <span className={TEXTO_ENTERO}>{ubicacion || "Sin dirección"}</span>
          </p>
        ) : null}
        {lineasDeDatos}
      </div>

      {verCobro ? (
        <div className="flex shrink-0 flex-col items-end">
          <span className="text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
            Cobrar
          </span>
          <span className={`text-right font-mono text-sm font-bold text-foreground ${COLUMNA_FIJA}`}>
            {formatMonto(orden.montoCobrar, moneda)}
          </span>
        </div>
      ) : null}
      </div>

      {/* Controles del consumidor al pie, DENTRO de la card (p. ej. el toggle
          "gestionar más tarde", feature 115/R5/R6). */}
      {acciones ? (
        <div className="border-t border-dashed border-border pt-2">{acciones}</div>
      ) : null}
    </article>
  );
}
