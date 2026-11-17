"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Store } from "lucide-react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import {
  ESCANER_LABEL_GUIA,
  EscanerModal,
} from "@/components/shared/EscanerModal";
import { TarjetaEscaneoContinuo } from "@/components/shared/EscaneoContinuo";
// Feature 111/R12 + 167/R9 -> FEATURE 271 (T9.1/T9.2): el aviso del bloqueo dejó de ser una
// constante y pasó a ser un FORMATEADOR que CUENTA (cuántos cierres arrastra el mensajero y cuál
// toca resolver primero, R43). El MISMO de los otros tres portales; `conCta: true` porque desde
// aquí hay que decirle a dónde ir (R52).
import { avisoBloqueo } from "@/lib/constants/bloqueo-mensajero";
import { SIN_BLOQUEO, type BloqueoDetalle } from "@/lib/utils/bloqueo-cierre";
import { TEXTOS_RECOLECCION } from "@/lib/utils/sesion-escaneo";
import type {
  RecolectadaHoyDTO,
  RecoleccionOrdenDTO,
} from "@/lib/types/recoleccion-tienda";

import { CarruselCards } from "@/components/shared/CarruselCards";
import { PosOrderCardDetalle } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardDetalle";
import { PosOrderCardMosaico } from "@/app/(app)/mis-asignaciones/_components/pos-card/PosOrderCardMosaico";
import {
  VistaCardsToggle,
  type VistaCards,
} from "@/app/(app)/mis-asignaciones/_components/VistaCardsToggle";
import { FiltroTienda } from "@/app/(app)/mis-asignaciones/_components/FiltroTienda";
import {
  ETIQUETA_FILTRO_TIENDA,
  FILTRO_TIENDA,
  filtrarPorTienda,
  opcionesTienda,
} from "@/app/(app)/mis-asignaciones/_components/filtro-tienda";
import {
  CLASE_FASE,
  useTransicionVista,
} from "@/app/(app)/mis-asignaciones/_components/useTransicionVista";
import {
  BUSCADOR_GUIAS_LABEL,
  BUSCADOR_GUIAS_PLACEHOLDER,
  filtrarAsignaciones,
} from "@/app/(app)/mis-asignaciones/_components/mis-asignaciones-buscador";

import {
  RecolectadasHoyLista,
  SIN_RESULTADOS_BUSQUEDA,
} from "./RecolectadasHoyLista";
import { useRecolectarPorGuia } from "./useRecolectarPorGuia";

// Feature 157 (R13-R24) + 167 — apartado PROPIO del mensajero para lo que va a recoger EN LA
// TIENDA. Nació dentro de Entregas; la 167 lo sacó a su página (`/recoleccion`) porque allí
// el mensajero no lo encontraba, y le dio la vuelta a su regla de fondo:
//
//   ANTES: sin lista no había apartado (`if (porRecolectar.length === 0) return null`), así
//          que el bloque de escaneo desaparecía justo cuando el mensajero lo buscaba.
//   AHORA: el ESCÁNER es el contenido principal y su acceso está SIEMPRE ahí (R7); la lista
//          es su contexto. Lo único que lo apaga es el bloqueo por cierre pendiente (R9).
//
// 2026-07-31 (decisión del humano): R7 cambia de FORMA, no de fondo. El escáner pasa de
// estar "siempre montado" a estar "siempre accesible": vive tras `EscanerModal` —desde el
// 2026-08-10, en modal—, cerrado de entrada como en toda la app. Nunca desaparece —el
// disparador no depende de la lista— y a cambio la cámara deja de estar encendida detrás de
// la pantalla.
//
// Sigue sin haber ACCIONES de gestión: aquí no se entrega, ni se cobra, ni se adjunta
// evidencia, ni se elige causa ni resultado (R22). Recolectar es un acto físico de un paso
// —el paquete pasa de la tienda a la ruta hacia la bodega central— y la pantalla no ofrece
// otro control que el escáner.
//
// 2026-08-11 (decisión del humano): lo que SÍ cambió es la INFORMACIÓN. El apartado muestra la
// misma card que «Por recoger», entera: ubicación, cobro, detalle completo e intentos. El DTO
// dejó de ser pobre a propósito (`RecoleccionOrdenDTO` extiende `MiAsignacionDTO`), lo que
// retira el recorte de R38 (167): era la única razón por la que las dos pantallas hermanas del
// portal se veían distintas, y el mensajero necesita ver de la orden lo mismo en ambas.
//
// El bloque de acción es UNO para todo el apartado, no un botón por tarjeta: en la tienda se
// recogen decenas de paquetes seguidos y la acción natural es escanear en tanda (decisión del
// humano). Las tarjetas son la referencia de QUÉ hay que recoger, no controles.

const TITULO = "Por recolectar en tienda";

/** R8: el vacío se EXPLICA y el escáner se queda — es la causa raíz que la 167 vino a arreglar. */
const VACIO = "No tienes órdenes por recolectar en tienda ahora mismo.";

/**
 * La segunda mitad del vacío: la promesa de que escanear SIGUE valiendo. Sólo es cierta cuando el
 * escáner está en pantalla.
 *
 * ⚠️ SE PINTABA SIEMPRE, Y BLOQUEADO ERA FALSA POR PARTIDA DOBLE (encontrado mirando la app el
 * 2026-08-23, aprobado por el humano): bloqueado no hay ni disparador de escaneo —lo apaga el
 * mismo `bloqueado` de abajo— y, aunque lo hubiera, el servidor rechaza la recolección (R25/R31,
 * Q1). Le prometía un camino inexistente justo cuando el aviso de arriba le dice que no puede
 * recibir trabajo nuevo: dos frases seguidas que se contradicen.
 *
 * NO se sustituye por otro texto: el aviso de bloqueo YA dice qué pasa y qué hacer. Aquí basta con
 * no prometer.
 */
const VACIO_PUEDES_ESCANEAR =
  "Puedes escanear igual: si el maestro acaba de asignarte una, se confirmará aquí.";

/** Conteo del banner. En singular/plural, sin jerga: el mensajero lee "3 paquetes". */
function textoConteo(n: number): string {
  return n === 1
    ? "1 paquete por recolectar en tienda."
    : `${n} paquetes por recolectar en tienda.`;
}

export interface RecoleccionModuleProps {
  /** Órdenes en `recolectando` asignadas al actor (R21). Puede venir VACÍA: el apartado se
   *  monta igual (R7/R8). */
  porRecolectar: RecoleccionOrdenDTO[];
  /** R24/R28: lo ya recolectado hoy por el propio actor, de lo más reciente a lo más antiguo. */
  recolectadasHoy: RecolectadaHoyDTO[];
  /** R31: hoy hay más recolecciones de las que trae `recolectadasHoy`. */
  recolectadasHoyRecortada?: boolean;
  /**
   * Feature 111/R14 + 167/R9 -> FEATURE 271 (T9.1): el DETALLE del bloqueo, no un booleano.
   * Bloqueado, el mensajero NO mueve guías: las dos listas siguen visibles
   * (solo-visualización, R23) pero el bloque de acción no se renderiza y en su lugar va el aviso,
   * que ahora dice además CUÁNTOS cierres arrastra y CUÁL toca primero (R43).
   *
   * ⚠️ Y RECOLECTAR EN TIENDA ES COBRAR: desde el 2026-08-23 (Q1) esta superficie se bloquea
   * igual que las de reparto, sin excepción — el servidor la rechaza (R25/R31).
   */
  bloqueo?: BloqueoDetalle;
}

export function RecoleccionModule({
  porRecolectar,
  recolectadasHoy,
  recolectadasHoyRecortada = false,
  bloqueo = SIN_BLOQUEO,
}: Readonly<RecoleccionModuleProps>) {
  // FEATURE 271 (T9.1): el veredicto sale del detalle, no se re-deriva aquí.
  const bloqueado = bloqueo.bloqueado;
  const router = useRouter();
  // SLT-168 (R832): las dos listas cargadas solo dan destinatario y tienda a la fila; de quién
  // es la guía lo sigue decidiendo el servidor (167/R12).
  const conocidas = useMemo(
    () => [...porRecolectar, ...recolectadasHoy],
    [porRecolectar, recolectadasHoy],
  );
  const { recolectar } = useRecolectarPorGuia(conocidas);

  // Feature 196: mismo conmutador y misma transicion que Entregas/Por recoger, sobre las
  // MISMAS piezas. Estado de UI efimero de un solo consumidor: no sube a la URL.
  const {
    vista: vistaCards,
    vistaPedida: vistaCardsPedida,
    fase: faseVista,
    cambiarVista,
  } = useTransicionVista<VistaCards>("mosaico");

  // SLT-156 (R520): UN término para las dos listas, con la misma función que Recoger y Reparto.
  // Filtra lo que se ve; los conteos de las cabeceras siguen contando lo que el mensajero tiene.
  const [query, setQuery] = useState("");

  // SLT-190 (R850-R854, DS1, DS2): el filtro «Tienda», tratado como el término: filtra las DOS
  // listas, no toca los contadores de las cabeceras ni lo que acepta el escáner (`conocidas`, la
  // lista completa) y cuenta como búsqueda activa para el vacío.
  const [tienda, setTienda] = useState("");
  const [filtrosPuestos, setFiltrosPuestos] = useState<string[]>([]);
  const tiendas = useMemo(
    () => opcionesTienda(porRecolectar, recolectadasHoy),
    [porRecolectar, recolectadasHoy],
  );
  const filtrosOfrecidos = [{ key: FILTRO_TIENDA, label: ETIQUETA_FILTRO_TIENDA }];
  // Quitar el filtro de «Filtros» vacía su valor: un filtro que ya no se ve no puede seguir filtrando.
  function cambiarFiltrosPuestos(siguientes: string[]) {
    if (!siguientes.includes(FILTRO_TIENDA)) setTienda("");
    setFiltrosPuestos(siguientes);
  }
  // «Limpiar todo»: la barra vacía su campo y emite `""`; aquí se quita el filtro.
  function limpiarTodo() {
    setTienda("");
    setFiltrosPuestos([]);
  }

  const buscando = query.trim() !== "" || tienda !== "";
  const porRecolectarVisibles = useMemo(
    () => filtrarPorTienda(filtrarAsignaciones(porRecolectar, query), tienda),
    [porRecolectar, query, tienda],
  );
  const recolectadasHoyVisibles = useMemo(
    () => filtrarPorTienda(filtrarAsignaciones(recolectadasHoy, query), tienda),
    [recolectadasHoy, query, tienda],
  );

  /**
   * Una card «por recolectar». Extraida para que el CARRUSEL (mosaico) y la LISTA (detalle)
   * rendericen la MISMA card: el conmutador solo cambia el envoltorio.
   *
   * 2026-08-11 (decision del humano): la card es EXACTAMENTE la de «Por recoger», sin
   * compuertas. Ya no hay adaptador ni `secciones`: el DTO trae los mismos campos, asi que la
   * orden se pasa tal cual y navegacion, cobro, detalle e intentos se pintan con datos reales.
   *
   * Lo unico que sigue difiriendo de «Por recoger» son las dos props que describen ESTA
   * pantalla: sin `onGestionar` (aqui no se gestiona nada, asi que la card no es clickeable ni
   * enfocable) y `mostrarRuta={false}`, porque estas ordenes no son paradas de la ruta
   * optimizada. FICHA 455 (R7): el chip dice el ESTADO de la orden (`nombreDeEstado`), no un
   * rótulo fijo de la pantalla.
   */
  function renderCardRecoleccion(
    orden: RecoleccionOrdenDTO,
    total: number,
    vista: VistaCards,
    posicion: number,
  ) {
    // SLT-156 (R517): en Detalle, la misma tarjeta compacta de Reparto (sin acciones).
    // SLT-190 (R855, R857, R862): numerada en la lista visible y, en Detalle, con la fila de
    // Recolección (tienda y estado plegados).
    return vista === "mosaico" ? (
      <PosOrderCardMosaico
        orden={orden}
        total={total}
        mostrarRuta={false}
        posicion={posicion}
      />
    ) : (
      <PosOrderCardDetalle
        orden={orden}
        total={total}
        mostrarRuta={false}
        posicion={posicion}
        filaRecoleccion={{}}
        compacta
      />
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* R9: bloqueado por cierre pendiente -> las listas se ven, pero no hay cómo mover
          nada, y el apartado dice POR QUÉ por sí mismo. Cuando vivía dentro de Entregas el
          aviso lo ponía el módulo de al lado y aquí no quedaría ninguno; el texto es el
          MISMO (constante compartida) para que los dos portales no puedan divergir. */}
      {bloqueado ? (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
        >
          {avisoBloqueo(bloqueo, { conCta: true })}
        </p>
      ) : (
        /* R7 en su forma vigente (decisión del humano del 2026-07-31): el acceso al
           escaneo está SIEMPRE —el disparador no depende de la lista, que era la causa
           raíz—, pero la tarjeta vive tras él (en modal desde el 2026-08-10), igual que
           en el resto de la app. Lo que se gana: la cámara no queda encendida todo el
           rato que el mensajero tiene la pantalla abierta, que es lo que pasaba con la
           tarjeta desnuda. SLT-156 (R500, R519): el disparador único de las pantallas del
           mensajero, de 44 px y a todo el ancho; el título «Recolectar en tienda» lo pinta la
           barra del diálogo (SLT-190, DS7), no la tarjeta de dentro. */
        <EscanerModal label={ESCANER_LABEL_GUIA} titulo="Recolectar en tienda" tactil>
          {/* SLT-168 (R595, R833): la sesión continua de SLT-159. La lectura (`leerGuia`, R11) la
             hace la sesión; cada guía es una fila y la cámara sigue abierta. R14/R598: las dos
             listas las resuelve el servidor y se releen UNA vez al cerrar, no por lectura. */}
          {/* SLT-190 (R868-R870, DS7): «Recolectar en tienda» va en la barra del diálogo, con un
             solo «Cerrar» de 44 px, y la tarjeta se monta sin su encabezado. */}
          <TarjetaEscaneoContinuo
            sinEncabezado
            recibir={recolectar}
            alCerrarConRecepcion={() => router.refresh()}
            textos={TEXTOS_RECOLECCION}
            icono={Store}
            ariaLabel="Recolectar por número de guía o escaneo"
            titulo="Recolectar en tienda"
            descripcion="Escanea o ingresa el número de guía"
            submitLabel="Confirmar recolección"
          />
        </EscanerModal>
      )}

      {/* SLT-156 (R495, R496, R506, R519, R520): UNA barra para las dos listas, pegada arriba
          mientras se desplazan. Hija directa del contenedor: `sticky` se pega dentro de su padre,
          que llega hasta el final de «Recogidos en tienda hoy». Filtro puro de cliente, sin URL ni
          debounce; se queda aunque el mensajero esté bloqueado (las listas siguen visibles). */}
      <BuscadorFiltros
        label={BUSCADOR_GUIAS_LABEL}
        placeholder={BUSCADOR_GUIAS_PLACEHOLDER}
        onChange={setQuery}
        debounceMs={0}
        leerDeUrl={false}
        // SLT-190 (R850-R852): el filtro «Tienda» con el selector de siempre (P2).
        filtros={filtrosOfrecidos}
        activos={filtrosPuestos}
        onActivosChange={cambiarFiltrosPuestos}
        onLimpiarTodo={limpiarTodo}
        hayFiltrosAplicados={tienda !== "" || filtrosPuestos.length > 0}
        fija
        tactil
        // SLT-194 (R940-R944, D2): la pistola (Enter) y la cámara del buscador SOLO filtran las dos
        // listas; recolectar sigue siendo «Escanear o escribir guía». Va también bloqueado: no mueve nada.
        escaneo
        // SLT-190 (R860, DS4): el ÚNICO conmutador del apartado, en la barra tras «Filtros» y
        // siempre visible (también con «Por recolectar» vacía); gobierna las dos listas.
        trasFiltros={
          <VistaCardsToggle vista={vistaCardsPedida} onVistaChange={cambiarVista} />
        }
      >
        {filtrosPuestos.includes(FILTRO_TIENDA) ? (
          <FiltroTienda tienda={tienda} tiendas={tiendas} onTiendaChange={setTienda} />
        ) : null}
      </BuscadorFiltros>

      <section aria-label={TITULO} className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">{TITULO}</h2>
          {/* SLT-190 (R860): la cabecera ya no lleva conmutador; el único está en la barra. */}
          {porRecolectar.length > 0 ? (
            <p role="status" className="text-sm text-muted-foreground">
              {textoConteo(porRecolectar.length)}
            </p>
          ) : null}
        </div>

        {/* R8: sin nada asignado se DICE, en vez de dejar una pantalla muda bajo el escáner.
            La promesa de escanear se AÑADE sólo si el escáner está —bloqueado no lo está—: ver
            `VACIO_PUEDES_ESCANEAR`. */}
        {porRecolectar.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {bloqueado ? VACIO : `${VACIO} ${VACIO_PUEDES_ESCANEAR}`}
          </p>
        ) : buscando && porRecolectarVisibles.length === 0 ? (
          /* SLT-156 (R521): hay órdenes, pero el término no deja ninguna. */
          <p className="text-sm text-muted-foreground">
            {SIN_RESULTADOS_BUSQUEDA}
          </p>
        ) : vistaCards === "mosaico" ? (
          /* 2026-08-11 (decisión del humano): las cards van SUELTAS, en un carrusel único, igual
             que en «Por recoger». Antes iban dentro de una caja por tienda (la agrupación de
             R17), con un carrusel por grupo; esa caja se retira y con ella la cabecera de tienda
             y sus botones de contacto. La tienda de cada orden sigue estando en la card, dentro
             del detalle completo. */
          <div className={CLASE_FASE[faseVista]}>
            <CarruselCards
              items={porRecolectarVisibles}
              getKey={(orden) => orden.id}
              ariaLabel="Órdenes por recolectar"
              singular="Orden"
              plural="Órdenes"
              renderItem={(orden) =>
                renderCardRecoleccion(
                  orden,
                  porRecolectarVisibles.length,
                  "mosaico",
                  porRecolectarVisibles.indexOf(orden) + 1,
                )
              }
            />
          </div>
        ) : (
          <ul className={`flex flex-col gap-3 ${CLASE_FASE[faseVista]}`}>
            {porRecolectarVisibles.map((orden, i) => (
              <li key={orden.id}>
                {renderCardRecoleccion(orden, porRecolectarVisibles.length, "detalle", i + 1)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* R24: el trabajo del día, que sale del HISTORIAL y por tanto sobrevive a que la
          bodega central ya haya recibido el paquete (R26). SLT-156 (R520): recibe también lo
          que deja el término; su cabecera sigue contando el día entero. */}
      <RecolectadasHoyLista
        recolectadasHoy={recolectadasHoy}
        visibles={recolectadasHoyVisibles}
        buscando={buscando}
        recortada={recolectadasHoyRecortada}
        vista={vistaCards}
        fase={faseVista}
      />
    </div>
  );
}
