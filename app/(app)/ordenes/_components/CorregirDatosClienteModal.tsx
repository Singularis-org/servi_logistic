"use client";

import { useEffect, useId, useState } from "react";
import useSWR from "swr";

import { Modal } from "@/components/shared/Modal";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/useToast";
import { useNivelesGeograficos } from "@/hooks/use-niveles-geograficos";
import type { CorregirDatosClienteActionResult } from "@/lib/actions/corregir-datos-cliente";
import { obtenerUbicacionOrden } from "@/lib/actions/corregir-datos-cliente";
import { obtenerCatalogoFiltrosOrdenes } from "@/lib/actions/filtros-ordenes";
import type { AvisoCambioUbicacion } from "@/lib/interfaces/services/ICorregirDatosClienteService";
import {
  corregirDatosClienteSchema,
  type CorregirDatosClienteEntrada,
} from "@/lib/types/correccion-datos-cliente";

import { corregirDatosClienteErrorMessage } from "./corregir-datos-cliente-error-messages";
import { CorregirUbicacionAviso } from "./CorregirUbicacionAviso";
import {
  elegirEnNivel,
  estadosDeNiveles,
  hojaElegida,
  lugarDeRuta,
  nivelQueFalta,
  rutaDeSeleccion,
  type ArbolDeCorreccion,
  type EstadoDeNivel,
} from "./corregir-ubicacion-arbol";

// =================================================================================================
// FICHA 312 (E1) + FICHA 327 (E2) — LA VENTANA CON LA QUE SE CORRIGEN LOS DATOS DE UNA ORDEN.
// =================================================================================================
//
// **Que problema cierra.** La carga masiva entra con el destinatario, el telefono o LA DIRECCION mal
// escritos y hasta la 312 la aplicacion no ofrecia NINGUNA superficie para arreglarlo: la unica via
// era un `UPDATE` a mano contra produccion.
//
// **La comparten LAS DOS superficies** (312/design §9.3): el modulo de ordenes (`maestro`/`admin`,
// por su disparador de fila) y las cards de `/novedades` (`adminTienda`, en los DOS grupos). Vive
// aqui —donde nace y donde esta su consumidor principal— y `/novedades` la IMPORTA, igual que
// `/recepcion-satelite` importa `ReportarIncidenteAccion`. Una sola implementacion sirve a las dos,
// que es literalmente 327/R32.
//
// **NUEVE CAMPOS** (312/D1 + 327/D1): `destinatario`, `telefonoDest`, `producto`, `notas` —los
// cuatro de la 312— mas `direccion`, el lugar (`nodoId` desde SLT-48; antes la terna provincia,
// canton y distrito) y `peso`. La direccion
// habia quedado fuera A SABIENDAS de que era el error de carga mas caro (312/D1) y el humano reabrio
// esa decision el 2026-08-28. Siguen fuera `montoCobrar`, `numRemision`, `cobraComision`,
// `estatusId`, `mensajeroAsignadoId`, `tiendaId` y `numGuia` (327/D2).
//
// ⚠️ **NO HAY SELECTOR DE ZONA, Y NO PUEDE HABERLO** (327/R5). La zona la DERIVA EL SERVIDOR del
// distrito recibido; el `.strict()` del schema rechaza a quien mande `zonaId`. Ofrecer aqui un
// desplegable de zonas seria abrir a mano la puerta que la ficha cierra por tipo.
//
// 💰 **ESTA VENTANA MUEVE DINERO, Y POR ESO TIENE DOS FASES** (327/D5, design §4.1). Cambiar el
// distrito recalcula la zona, y la zona decide la tarifa. Al pulsar «Guardar cambios» se envia
// SIEMPRE `confirmaCambioDeUbicacion: false`; si el distrito cambio, el servidor NO ESCRIBE NADA y
// responde `confirmacion_requerida` con la zona actual, la propuesta y los importes de cada una.
// Solo entonces se monta `CorregirUbicacionAviso`, y solo SU boton reenvia confirmando.
//
// **Por que el gate vive en el servidor y no aqui.** Porque asi es IMPOSIBLE guardar sin que el
// servidor haya enseñado los importes: el gate y el aviso son la misma respuesta, de la misma
// peticion. Una previsualizacion que esta pantalla pidiera al elegir el distrito seria un adorno que
// un cliente hecho a mano se salta, y volveria a dejar el dinero cambiando en silencio — que es
// literalmente lo que D5 vino a impedir. Si algun dia alguien mueve la decision al cliente, ha
// reabierto D5 y eso va a la puerta de aprobacion humana.
//
// ⚠️ **SIN RASTRO** (312/D4, RATIFICADO por 327/D3). Corregir NO publica nota en el hilo, NO escribe
// historial y NO deja auditoria: el unico rastro es el `updated_at` de la fila. Por eso NINGUN texto
// de esta ventana promete un registro («se guardara quien lo cambio» y similares estan prohibidos):
// no se registra, y una promesa falsa en la pantalla es peor que el silencio (327/R35).
//
// ⚠️ **NI UN `console` EN ESTE ARCHIVO** (R26), y no es estilo: el destinatario, el telefono, el
// producto, las notas y la direccion son datos de una persona real. Una guardia lo vigila
// (`tests/unit/guards/corregir-datos-sin-rastro.guardia.test.ts`).
//
// **NO OFRECE REIMPRIMIR LA ETIQUETA** (312/P4): R36 AVISA y nada mas. La reimpresion ya existe como
// gesto propio en la fila del listado (`EtiquetaOrdenAccion`) y esta ficha no lo duplica aqui dentro.

/**
 * Forma MINIMA que la ventana necesita de una orden. La cumplen POR ESTRUCTURA tanto
 * `OrdenListItemDTO` (listado de `/ordenes`) como `NovedadDTO` (cards de `/novedades`), asi que las
 * dos superficies comparten un solo cuerpo sin arrastrar ninguno de los dos DTO completos. Mismo
 * patron que `ReportarIncidenteOrdenUI` y `EliminarOrdenUI`.
 *
 * ⚠️ **LA UBICACION NO ESTA AQUI Y ES DELIBERADO** (327/design §9.3). `/ordenes` tiene los ids de
 * geografia pero `/novedades` solo tiene los NOMBRES, y ese DTO lo comparte el portal del mensajero:
 * ampliarlo obligaria a emitir tres ids en dos listas donde nadie los lee. La ventana pide los nueve
 * valores actuales al abrirse, con una lectura propia que sirve IGUAL a las dos superficies.
 */
export interface CorregirDatosClienteOrdenUI {
  id: string;
  numRemision: string;
  numGuia?: number | null;
  destinatario: string;
  telefonoDest: string;
  producto: string;
  notas?: string | null;
  /** El estado decide si la accion se OFRECE (312/R22-R24). Lo mira el disparador, no esta ventana. */
  estatusValue?: string | null;
}

/**
 * Como se dispara la correccion. **La ventana no importa la Server Action de ESCRITURA: se la pasa
 * la superficie que la monta**, y las dos pasan LA MISMA (`corregirDatosCliente`).
 *
 * ⚠️ Esto NO es una preferencia de estilo y conviene no «simplificarlo» de vuelta. `/novedades`
 * tiene una guardia propia —`novedad-acciones-sin-maqueta.guardia.test.ts`, nacida de ocho dias de
 * un boton que avisaba por toast sin mutar nada— que exige que **algun archivo de
 * `app/(app)/novedades/` importe Y LLAME** a la operacion que su fila declara en
 * `PRODUCTOR_POR_ACCION`. Con la llamada escondida aqui dentro, en otra carpeta, esa guardia veria
 * un boton sin cable y estaria en lo cierto: el cable se ve en la pantalla que ofrece el boton.
 *
 * La LECTURA de precarga (`obtenerUbicacionOrden`) SI se importa aqui dentro, y no contradice lo
 * anterior: no es la operacion de ningun boton de fila —es lo que esta ventana necesita para
 * abrirse—, y ese mismo censo inverso obliga a que no viaje por `/novedades` (ver `geografiaFetcher`).
 */
export type EnviarCorreccion = (
  entrada: CorregirDatosClienteEntrada,
) => Promise<CorregirDatosClienteActionResult>;

export interface CorregirDatosClienteModalProps {
  open: boolean;
  /** Orden UNA, nunca un lote: los nueve campos son propios de cada orden (312/design §8/F). */
  orden: CorregirDatosClienteOrdenUI;
  onOpenChange: (open: boolean) => void;
  /** El disparo real. Ver `EnviarCorreccion`. */
  corregir: EnviarCorreccion;
  /** Exito: el padre cierra y RELEE el estado DEL SERVIDOR (312/R29). Nada de optimismo local. */
  onSuccess: () => void;
}

// --- Textos visibles (separados de la logica, i18n-ready, como el resto del modulo) --------------

export const CORREGIR_TITULO = "Corregir los datos del cliente";
export const CORREGIR_CONFIRMAR = "Guardar cambios";

/**
 * 327/D2 dicho en la ventana: lo que NO se corrige aqui, para que nadie lo busque. Y la regla de la
 * zona, que explica por que no hay un desplegable de zonas (R5).
 *
 * ⚠️ CAMBIA LITERALMENTE RESPECTO DE LA 312, y ese cambio es el corazon de esta ficha: aquel texto
 * decia «la direccion, la zona y el monto a cobrar no se tocan desde aqui». La direccion SI se toca
 * desde hoy, asi que dejarlo habria sido una pantalla mintiendo sobre su propio alcance.
 */
export const CORREGIR_ALCANCE =
  "El monto a cobrar, el estado, la tienda y el mensajero asignado no se cambian desde aquí. La zona se calcula a partir del lugar.";

export const CORREGIR_DESTINATARIO_LABEL = "Destinatario";
export const CORREGIR_TELEFONO_LABEL = "Teléfono del destinatario";
export const CORREGIR_PRODUCTO_LABEL = "Producto";
export const CORREGIR_NOTAS_LABEL = "Notas";
export const CORREGIR_NOTAS_AYUDA = "Se puede dejar vacío.";

// --- Ficha 327 — la ubicacion --------------------------------------------------------------------

export const CORREGIR_DIRECCION_LABEL = "Dirección";
export const CORREGIR_PESO_LABEL = "Peso (kg)";

/**
 * SLT-48 (R43, R47) — los textos de cada selector de nivel. El nivel sale del país de la empresa, no de
 * un literal; por eso van sin artículo («Elige barrio»): el tipo no trae su género. Textos de la maqueta.
 */
export function corregirElegirNivel(tipoSingular: string): string {
  return `Elige ${tipoSingular.toLocaleLowerCase("es")}`;
}

/** SLT-48 (R43, P2) — el selector justo debajo de una hoja: ese lugar no tiene hijos activos. */
export function corregirSinNivel(tipoPlural: string): string {
  return `Sin ${tipoPlural.toLocaleLowerCase("es")}`;
}

/** SLT-48 (regla 2 de la maqueta) — los selectores que sobran tras la hoja se ven apagados, no ocultos. */
export const CORREGIR_NIVEL_SOBRANTE = "—";

/** Rótulo del grupo de selectores, para quien navega con lector de pantalla. */
export const CORREGIR_UBICACION_GRUPO = "Lugar de entrega";

/** Mientras la lectura de precarga esta en vuelo, los controles de ubicacion van deshabilitados. */
export const CORREGIR_UBICACION_CARGANDO = "Cargando la ubicación actual de la orden…";

/**
 * DEGRADACION, NO PANTALLA MUERTA (design §10.1). Si la precarga falla, la ventana sigue
 * permitiendo corregir los cuatro campos de la 312 — y lo DICE, porque unos controles vacios y
 * apagados sin explicacion se leen como «esta orden no tiene direccion», que es otra cosa.
 */
export const CORREGIR_UBICACION_FALLO =
  "No se pudo cargar la ubicación de esta orden, así que ahora no se puede corregir. El resto de los datos sí. Cierra y vuelve a abrir esta ventana para reintentarlo.";

/** El catalogo geografico no llego: sin el no hay opciones que ofrecer en los tres desplegables. */
export const CORREGIR_GEOGRAFIA_FALLO = "No se pudo cargar el catálogo de lugares.";

/**
 * R36 — EL AVISO DE LA ETIQUETA, solo cuando la orden YA tiene guia. El papel pegado al paquete se
 * imprimio con los datos viejos y ninguna correccion lo cambia: quien esta delante de la pantalla
 * tiene que saberlo ANTES de confirmar, no despues.
 *
 * ⚠️ **NOMBRA LA DIRECCION EXPRESAMENTE** desde la 327, y no es un adorno del texto: la etiqueta
 * lleva la direccion IMPRESA, y la direccion es justo lo que esta ficha permite corregir. Decir
 * «los datos anteriores» a secas dejaba al lector adivinando si el papel se queda viejo en lo que
 * mas importa para entregar el paquete.
 *
 * Nombra la guia concreta porque es el dato con el que se busca ese paquete en la bodega.
 */
export function corregirAvisoEtiqueta(numGuia: number): string {
  return `Esta orden ya tiene la guía ${numGuia} impresa: la etiqueta pegada al paquete seguirá mostrando la dirección y los datos anteriores.`;
}

/**
 * 312/R28 — EL AVISO DE WHATSAPP, solo cuando el telefono cambio respecto del precargado. La
 * conversacion anterior se queda donde esta, intacta: si el numero estaba mal escrito, ese hilo es
 * una conversacion con OTRA persona y no sirve de nada, asi que no se migra ni se fusiona.
 */
export const CORREGIR_AVISO_WHATSAPP =
  "Los mensajes nuevos irán al número corregido. La conversación anterior se conserva, pero no se traslada.";

/** 312/R6-R30 — el bloqueo, con PALABRAS. Un botón apagado dice QUE no se puede, no POR QUÉ. */
export const CORREGIR_FALTAN_CAMPOS_PREFIJO = "Falta completar:";
export const CORREGIR_FALTA_DESTINATARIO = "el destinatario";
export const CORREGIR_FALTA_TELEFONO = "el teléfono";
export const CORREGIR_FALTA_PRODUCTO = "el producto";
export const CORREGIR_FALTA_DIRECCION = "la dirección";
/** SLT-48 (R43) — el nivel que falta para llegar a una hoja, con el nombre del país («barrio»). */
export function corregirFaltaNivel(tipoSingular: string): string {
  return tipoSingular.toLocaleLowerCase("es");
}
export const CORREGIR_FALTA_PESO = "el peso (mayor que cero)";

/**
 * SLT-48 (decisión del humano 2026-11-18, maqueta «no se llegó a la hoja») — el lugar elegido tiene
 * hijos: se dice ANTES de guardar, junto al selector que falta, y «Guardar cambios» sigue apagado. El
 * rechazo del servidor (R17, design §4.1) queda como red de seguridad. Nombra el lugar y el plural del
 * nivel de debajo con los nombres del país (R47).
 */
export function corregirUbicacionIncompleta(lugar: string, tipoPluralDebajo: string): string {
  return `Ubicación incompleta: «${lugar}» tiene ${tipoPluralDebajo.toLocaleLowerCase("es")} debajo; elige el último nivel.`;
}

export const CORREGIR_EXITO = "Datos corregidos.";
/** 312/R4 — el servidor no escribió nada porque no había nada que cambiar. No es un error. */
export const CORREGIR_SIN_CAMBIOS = "No había nada que cambiar: los datos ya eran esos.";

// --- La geografia, pedida desde el cliente y cacheada --------------------------------------------

/**
 * FICHA 327 — CLAVE SWR DEL CATALOGO GEOGRAFICO. Compartida por las dos superficies a proposito: es
 * el MISMO catalogo, es de solo lectura y no depende de la orden, asi que abrir la ventana por
 * segunda vez no vuelve a pedirlo.
 */
export const CLAVE_GEOGRAFIA_CORRECCION = "correccion:geografia";

/**
 * SLT-48 (design §8) — los niveles del pais y sus lugares a cualquier profundidad (`niveles` y
 * `lugares` del catalogo, SLT-47), no las listas planas de tres niveles. Se piden desde EL CLIENTE —igual que
 * la barra de `/dashboard` (`FiltrosEntregas`) y la de analitica— y NO por props desde cada pagina,
 * y hay una razon MEDIDA para ello (2026-08-29):
 *
 * `/novedades` no tiene el catalogo, y hacer que su `page.tsx` importara
 * `obtenerCatalogoFiltrosOrdenes` pone ROJA la guardia `novedad-acciones-sin-maqueta` (su frente 4,
 * el censo inverso): esa guardia exige que TODA Server Action importada por un archivo de
 * `app/(app)/novedades/**` este declarada como accion de fila o exceptuada a mano. Medido: un solo
 * import deja el hallazgo `obtenerCatalogoFiltrosOrdenes (lo dispara app/(app)/novedades/page.tsx)`.
 * Pedirlo desde AQUI —que vive en `app/(app)/ordenes/_components/`— sirve a las dos superficies con
 * UNA implementacion, sin tocar ninguna guardia y sin ensanchar el contrato de dos paginas.
 *
 * `null` cuando no se pudo cargar: los desplegables quedan deshabilitados y la ventana lo dice. No
 * lanza — un catalogo caido no puede tumbar la correccion de los otros campos.
 */
async function geografiaFetcher(): Promise<ArbolDeCorreccion | null> {
  try {
    const res = await obtenerCatalogoFiltrosOrdenes();
    if (res.status !== "ok") return null;
    return { niveles: res.catalogo.niveles ?? [], lugares: res.catalogo.lugares ?? [] };
  } catch {
    return null;
  }
}

/** Estado de la lectura de precarga (R31). */
type EstadoPrecarga = "cargando" | "listo" | "fallo";

/**
 * SLT-48 (R43, P2; regla 2 de la maqueta) — el texto vacío de un selector de nivel: «Elige <tipo>»
 * mientras se puede elegir, «Sin <plural>» justo debajo de una hoja y «—» en los que sobran.
 *
 * ⚠️ FICHA 374 (R29) — las opciones ya llegan sin lo retirado (`hijosOfrecibles`): corregir una
 * ubicacion es un ALTA ENCUBIERTA y un nodo que ya no se puede usar no se ofrece. El servidor lo
 * rechaza igual (R30): el filtro es comodidad, no la puerta.
 */
function placeholderDeNivel(estado: EstadoDeNivel): string {
  if (estado.modo !== "tras-la-hoja") return corregirElegirNivel(estado.nivel.singular);
  return estado.primeroTrasLaHoja ? corregirSinNivel(estado.nivel.plural) : CORREGIR_NIVEL_SOBRANTE;
}

/** Primer mensaje del campo, si el borde marcó ese campo. */
function primerError(
  errores: Record<string, string[]>,
  campo: string,
): string | undefined {
  return errores[campo]?.[0];
}

/**
 * El peso tecleado como numero, o `null` si lo escrito no es un peso utilizable.
 *
 * `null` BLOQUEA el boton en vez de enviarse como «no lo toques»: mandar `undefined` ante un texto
 * invalido guardaria los otros ocho campos y dejaria el peso viejo EN SILENCIO, que es justo la
 * clase de fallo mudo que no rompe nada y nadie nota. R9 pide `> 0`, igual que el schema.
 */
function pesoNumerico(texto: string): number | null {
  const limpio = texto.trim();
  if (limpio === "") return null;
  const valor = Number(limpio);
  if (!Number.isFinite(valor) || valor <= 0) return null;
  return valor;
}

/**
 * Ventana de correccion de los datos y la ubicacion de UNA orden.
 *
 * - **Nueve campos precargados** con los valores actuales (312/R26 + 327/R31). Los cuatro de la 312
 *   vienen en la prop `orden`; los cinco de la 327 los trae una lectura propia al abrir.
 * - **Valida en cliente con EL MISMO** `corregirDatosClienteSchema` que el servidor revalida en el
 *   borde: el cliente no tiene reglas propias que puedan divergir. En particular **no impone un
 *   largo maximo propio** a ningun campo (312/R6): un tope que la carga masiva no tiene produciria
 *   el caso absurdo «se pudo cargar pero no se puede corregir».
 * - **El servidor sigue siendo la guardia real** (327/R28): revalida rol, pertenencia y estado en
 *   CADA peticion —tanto la de la precarga como la que escribe—, con independencia de lo que esta
 *   ventana haya ofrecido.
 * - **Ante un rechazo, el borrador NO se limpia** (327/R34): lo tecleado sigue ahi y el motivo se
 *   pinta dentro de la ventana, que es donde esta la decision.
 */
export function CorregirDatosClienteModal({
  open,
  orden,
  onOpenChange,
  corregir,
  onSuccess,
}: Readonly<CorregirDatosClienteModalProps>) {
  const toast = useToast();
  // SLT-48 (R43): un selector por nivel del país, rotulado con su tipo. Los niveles llegan con el
  // catálogo; mientras tanto, los del país de la sesión (`layout.tsx`).
  const nivelesDeLaSesion = useNivelesGeograficos();
  const destinatarioId = useId();
  const telefonoId = useId();
  const productoId = useId();
  const notasId = useId();
  const direccionId = useId();
  const nivelSelectId = useId();
  const pesoId = useId();

  // 312/R26 — LOS CUATRO CAMPOS PRECARGADOS con los valores actuales de ESTA orden.
  const [destinatario, setDestinatario] = useState(orden.destinatario);
  const [telefono, setTelefono] = useState(orden.telefonoDest);
  const [producto, setProducto] = useState(orden.producto);
  const [notas, setNotas] = useState(orden.notas ?? "");

  // 327/R31 — LOS CINCO DE LA UBICACION, que llegan de la lectura de precarga.
  const [direccion, setDireccion] = useState("");
  // SLT-48 (R43): lo elegido en cada nivel, de la raíz hacia abajo, y la ruta que trajo la precarga.
  const [seleccion, setSeleccion] = useState<readonly string[]>([]);
  const [rutaPrecargada, setRutaPrecargada] = useState<readonly { id: string; nombre: string }[]>([]);
  const [peso, setPeso] = useState("");
  const [estadoPrecarga, setEstadoPrecarga] = useState<EstadoPrecarga>("cargando");
  const [guiaPrecargada, setGuiaPrecargada] = useState<number | null>(null);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const [motivoRechazo, setMotivoRechazo] = useState<string | undefined>(undefined);
  const [enviando, setEnviando] = useState(false);

  // 💰 327/R11 — el aviso que devuelve el SERVIDOR cuando el distrito cambia y no llega la
  // confirmacion. `undefined` = todavia no hay nada que confirmar. NUNCA se rellena con datos
  // calculados aqui: sale tal cual de la respuesta que se acaba de recibir.
  const [aviso, setAviso] = useState<AvisoCambioUbicacion | undefined>(undefined);

  // El catalogo geografico. Solo se pide con la ventana ABIERTA: `null` como key deja el fetch sin
  // disparar, que es como SWR expresa «todavia no».
  const { data: geografia } = useSWR(
    open ? CLAVE_GEOGRAFIA_CORRECCION : null,
    geografiaFetcher,
    { revalidateOnFocus: false },
  );

  // Cada apertura arranca del dato de la orden, no del borrador de la anterior. Patron «ajustar
  // estado durante el render» (el de `ReportarIncidenteModal`): en un efecto, este `setState`
  // encadenaria un render extra con los valores viejos ya visibles.
  //
  // ⚠️ Se reinicia SOLO al ABRIR. Un rechazo del servidor deja la ventana abierta y el borrador
  // intacto, que es literalmente 327/R34.
  const [abiertoPrevio, setAbiertoPrevio] = useState(open);
  if (open !== abiertoPrevio) {
    setAbiertoPrevio(open);
    if (open) {
      setDestinatario(orden.destinatario);
      setTelefono(orden.telefonoDest);
      setProducto(orden.producto);
      setNotas(orden.notas ?? "");
      setDireccion("");
      setSeleccion([]);
      setRutaPrecargada([]);
      setPeso("");
      setEstadoPrecarga("cargando");
      setGuiaPrecargada(null);
      setFieldErrors({});
      setMotivoRechazo(undefined);
      setAviso(undefined);
      setEnviando(false);
    }
  }

  // 327/R31 — LA PRECARGA. Se pide al ABRIR y no al montar: la ventana vive en el arbol junto a la
  // fila, y pedir la ubicacion de cada orden del listado seria una peticion por fila.
  //
  // ⚠️ El `try` NO ESCONDE UN FALLO: lo convierte en el estado `fallo`, que la ventana PINTA. Y no
  // hay `console` en el `catch` (R26): un `console.error("fallo", input)` volcaria la direccion
  // entera al log del navegador y de la plataforma.
  // ⚠️ EL `"cargando"` INICIAL NO SE PONE AQUI, y no es un olvido: lo pone el bloque de reinicio de
  // arriba, durante el render de la apertura. Un `setState` SINCRONO dentro de un efecto encadena
  // un render extra —el compilador de React lo marca como error, no como aviso— y ademas dejaria un
  // instante con los controles habilitados y vacios antes de deshabilitarlos.
  useEffect(() => {
    if (!open) return;
    let vigente = true;
    void (async () => {
      try {
        const res = await obtenerUbicacionOrden({ ordenId: orden.id });
        if (!vigente) return;
        if (res.status !== "ok") {
          setEstadoPrecarga("fallo");
          return;
        }
        setDireccion(res.orden.direccion ?? "");
        setSeleccion(res.orden.ruta.map((paso) => paso.id));
        setRutaPrecargada(res.orden.ruta);
        setPeso(res.orden.peso === null ? "" : String(res.orden.peso));
        setGuiaPrecargada(res.orden.numGuia);
        setEstadoPrecarga("listo");
      } catch {
        if (vigente) setEstadoPrecarga("fallo");
      }
    })();
    // Una respuesta que llega despues de cerrar (o de cambiar de orden) NO pisa el borrador vivo.
    return () => {
      vigente = false;
    };
  }, [open, orden.id]);

  const ubicacionEditable = estadoPrecarga === "listo";
  const pesoValor = pesoNumerico(peso);

  // SLT-48 (R43): el árbol del país. Sin catálogo (`null`) no se puede elegir otro lugar: viaja el de
  // la precarga tal cual (el servidor no ve cambio), como hoy viajaba la terna precargada.
  const arbol: ArbolDeCorreccion = geografia ?? { niveles: nivelesDeLaSesion, lugares: [] };
  const catalogoCargando = geografia === undefined;
  const niveles = estadosDeNiveles(arbol, seleccion);
  const nodoElegido = geografia ? hojaElegida(arbol, seleccion) : (seleccion.at(-1) ?? null);
  const nivelFaltante = geografia ? nivelQueFalta(arbol, seleccion) : null;
  // SLT-48 (maqueta, «no se llegó a la hoja»): ya se eligió un lugar y tiene hijos. Sin nada elegido
  // no hay lugar que nombrar: basta «Falta completar».
  const lugarAMedias = nivelFaltante !== null && seleccion.length > 0
    ? (arbol.lugares.find((l) => l.id === seleccion.at(-1))?.nombre ?? null)
    : null;
  const ubicacionIncompleta =
    ubicacionEditable && lugarAMedias !== null && nivelFaltante !== null
      ? corregirUbicacionIncompleta(lugarAMedias, nivelFaltante.plural)
      : null;

  // Lo que falta para poder enviar, en el orden del formulario. `trim()` porque una linea de
  // espacios no es un destinatario, y porque es lo mismo que hace el servidor antes de comparar:
  // dos reglas distintas sobre el mismo campo dejarian un boton encendido que la accion rechaza.
  //
  // `notas` NO entra: vaciarlo es una correccion valida («notas vacia es ausencia», y el servidor
  // guarda `null`).
  //
  // Los cinco de la ubicacion solo entran cuando la precarga funciono: si no, no viajan en la
  // peticion y exigirlos dejaria la ventana bloqueada para siempre por un fallo de LECTURA.
  const faltantes: string[] = [];
  if (destinatario.trim() === "") faltantes.push(CORREGIR_FALTA_DESTINATARIO);
  if (telefono.trim() === "") faltantes.push(CORREGIR_FALTA_TELEFONO);
  if (producto.trim() === "") faltantes.push(CORREGIR_FALTA_PRODUCTO);
  if (ubicacionEditable) {
    if (direccion.trim() === "") faltantes.push(CORREGIR_FALTA_DIRECCION);
    if (nivelFaltante !== null) faltantes.push(corregirFaltaNivel(nivelFaltante.singular));
    if (pesoValor === null) faltantes.push(CORREGIR_FALTA_PESO);
  }
  const completo = faltantes.length === 0;

  // 312/R28 — ¿el telefono cambio respecto del precargado? Se compara recortado, con el mismo
  // criterio con el que el servidor decide si hay cambio: asi el aviso no aparece por un espacio.
  const telefonoTocado = telefono.trim() !== orden.telefonoDest.trim();

  // R36 — la orden ya tiene papel impreso. La precarga manda cuando ya llego (es la lectura fresca);
  // hasta entonces vale lo que trajo la fila. `null` = sin guia = sin aviso.
  const guiaImpresa = guiaPrecargada ?? orden.numGuia ?? null;

  // SLT-48 (R43): el lugar actual y el propuesto, para la fila del lugar del aviso del importe.
  const lugaresDelAviso = {
    actual: lugarDeRuta(arbol.lugares, rutaPrecargada),
    propuesta: lugarDeRuta(arbol.lugares, rutaDeSeleccion(arbol.lugares, seleccion)),
  };

  /**
   * Tocar la ubicacion INVALIDA el aviso que hubiera en pantalla. Sin esto, alguien podria leer los
   * importes del distrito A, cambiar al distrito B y pulsar «Confirmar el cambio» — confirmando
   * unos numeros que ya no son los de lo que va a guardar. El servidor volveria a pedir
   * confirmacion igualmente (el gate es suyo), pero la pantalla habria mentido en el intervalo.
   */
  function alCambiarUbicacion(aplicar: () => void) {
    setAviso(undefined);
    aplicar();
  }

  /**
   * 💰 EL ENVIO, con el gate del dinero como unico parametro.
   *
   * `confirma` es `false` para «Guardar cambios» —SIEMPRE, sin excepciones— y `true` solo para el
   * boton de `CorregirUbicacionAviso`. Que el boton normal no pueda mandar `true` es la mitad de
   * pantalla de R33; la otra mitad es del servidor, que rechaza igual a quien lo intente por fuera
   * (R28).
   */
  async function enviar(confirma: boolean) {
    // Guarda redundante con `confirmDisabled`: el handler no debe depender del bloqueo visual para
    // no llamar a la accion con un campo vacio (patron `ReportarIncidenteModal`).
    if (!completo || enviando) return;

    // Validacion de borde en cliente con EL MISMO schema del servidor (312/R6: sin tope propio).
    const parsed = corregirDatosClienteSchema.safeParse({
      ordenId: orden.id,
      destinatario,
      telefonoDest: telefono,
      producto,
      // "" es «vaciar las notas»: el servidor lo normaliza a `null`, igual que la carga masiva.
      notas,
      // SLT-48 (R16, R43): el lugar es UN nodo, la hoja elegida. Con la precarga caida no viaja
      // ninguno de los de la ubicacion, y el servidor los deja como estaban.
      ...(ubicacionEditable
        ? {
            direccion,
            nodoId: nodoElegido ?? undefined,
            peso: pesoValor ?? undefined,
          }
        : {}),
      confirmaCambioDeUbicacion: confirma,
    });
    if (!parsed.success) {
      setFieldErrors(parsed.error.flatten().fieldErrors as Record<string, string[]>);
      return;
    }
    setFieldErrors({});
    setMotivoRechazo(undefined);
    setEnviando(true);

    // Se envian los nueve campos y el SERVIDOR hace el diff (312/R4): la pantalla no decide que
    // cambio, porque su idea de «igual» y la del servidor —que compara tras normalizar— podrian no
    // coincidir. `cambios: []` es un desenlace legitimo, no un error.
    let resultado: CorregirDatosClienteActionResult;
    try {
      resultado = await corregir(parsed.data);
    } catch {
      setEnviando(false);
      setMotivoRechazo(corregirDatosClienteErrorMessage(undefined));
      return;
    }
    setEnviando(false);

    if (resultado.status === "ok") {
      toast.success(resultado.cambios.length === 0 ? CORREGIR_SIN_CAMBIOS : CORREGIR_EXITO);
      // 312/R29 — el padre cierra y RELEE del servidor. Esta ventana no pinta nada optimista.
      onSuccess();
      return;
    }

    // 💰 327/R11-R33 — NO SE ESCRIBIO NADA. El servidor devuelve la comparacion y la ventana la
    // monta; confirmar es un gesto aparte, del boton de ese panel.
    if (resultado.status === "confirmacion_requerida") {
      setAviso(resultado.aviso);
      return;
    }

    if (resultado.status === "validation_error") {
      // Se pinta junto a cada campo y la ventana NO se cierra: lo tecleado sigue ahi (R34).
      setFieldErrors(resultado.fieldErrors);
      setAviso(undefined);
      return;
    }

    // R34 — motivo accionable, DENTRO de la ventana (junto al borrador que se conserva) y sin
    // exponer ningun identificador ni el detalle del rechazo opaco (R30).
    setAviso(undefined);
    setMotivoRechazo(corregirDatosClienteErrorMessage(resultado));
  }

  const destinatarioError = primerError(fieldErrors, "destinatario");
  const telefonoError = primerError(fieldErrors, "telefonoDest");
  const productoError = primerError(fieldErrors, "producto");
  const notasError = primerError(fieldErrors, "notas");
  const direccionError = primerError(fieldErrors, "direccion");
  // SLT-48: los rechazos de ubicacion del servidor siguen colgados de `distritoId` (design §9.2 de la
  // 327); el schema del borde los cuelga de `nodoId`. Los dos se pintan junto al selector del lugar.
  const lugarError = primerError(fieldErrors, "nodoId") ?? primerError(fieldErrors, "distritoId");
  // El selector que recibe el error: el del lugar elegido más hondo, o el primero que falta.
  const nivelConError = Math.min(
    nodoElegido === null ? seleccion.length : seleccion.length - 1,
    niveles.length - 1,
  );
  const pesoError = primerError(fieldErrors, "peso");
  const ordenIdError = primerError(fieldErrors, "ordenId");

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={CORREGIR_TITULO}
      description={`Orden ${orden.numRemision}`}
      confirmLabel={CORREGIR_CONFIRMAR}
      confirmDisabled={!completo || enviando || estadoPrecarga === "cargando" || catalogoCargando}
      // ⚠️ SIEMPRE sin confirmar (design §4.1). Este boton NO puede saltarse el aviso del importe.
      onConfirm={() => enviar(false)}
      // No se cierra al confirmar: lo hace el padre cuando el servidor dijo `ok` (312/R29-R30).
      closeOnConfirm={false}
      size="lg"
    >
      <div className="flex flex-col gap-4">
        <p role="note" className="text-sm text-muted-foreground">
          {CORREGIR_ALCANCE}
        </p>

        {/* R36 — el papel ya impreso. Va ARRIBA y siempre visible: es una condicion de la accion,
            no la consecuencia de un error, asi que `role="note"` y no `alert`. Y NO lleva boton de
            reimprimir (312/P4): esa accion ya vive en la fila del listado. */}
        {guiaImpresa !== null ? (
          <p
            role="note"
            className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-foreground"
          >
            {corregirAvisoEtiqueta(guiaImpresa)}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={destinatarioId}>{CORREGIR_DESTINATARIO_LABEL}</Label>
          <Input
            id={destinatarioId}
            value={destinatario}
            onChange={(event) => setDestinatario(event.target.value)}
            required
            aria-invalid={destinatarioError ? true : undefined}
          />
          {destinatarioError ? (
            <p role="alert" className="text-sm text-destructive">
              {destinatarioError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={telefonoId}>{CORREGIR_TELEFONO_LABEL}</Label>
          <Input
            id={telefonoId}
            type="tel"
            value={telefono}
            onChange={(event) => setTelefono(event.target.value)}
            required
            aria-invalid={telefonoError ? true : undefined}
          />
          {telefonoError ? (
            <p role="alert" className="text-sm text-destructive">
              {telefonoError}
            </p>
          ) : null}
          {/* 312/R28 — solo cuando el numero cambio de verdad. */}
          {telefonoTocado ? (
            <p role="note" className="text-sm text-muted-foreground">
              {CORREGIR_AVISO_WHATSAPP}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={productoId}>{CORREGIR_PRODUCTO_LABEL}</Label>
          {/* 312/R6 — SIN `maxLength`. La carga masiva no tiene tope para este campo y la
              correccion tampoco: un tope propio aqui produciria el caso «se pudo cargar pero no se
              puede corregir» que 312/P3 descarto. */}
          <Input
            id={productoId}
            value={producto}
            onChange={(event) => setProducto(event.target.value)}
            required
            aria-invalid={productoError ? true : undefined}
          />
          {productoError ? (
            <p role="alert" className="text-sm text-destructive">
              {productoError}
            </p>
          ) : null}
        </div>

        {/* ── FICHA 327 — LA UBICACION ────────────────────────────────────────────────────────── */}

        {estadoPrecarga === "cargando" || catalogoCargando ? (
          <p role="status" className="text-sm text-muted-foreground">
            {CORREGIR_UBICACION_CARGANDO}
          </p>
        ) : null}

        {estadoPrecarga === "fallo" ? (
          <p
            role="note"
            className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground"
          >
            {CORREGIR_UBICACION_FALLO}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={direccionId}>{CORREGIR_DIRECCION_LABEL}</Label>
          {/* R8 — SIN `maxLength`, por el mismo motivo que `producto`: la carga masiva no lo tiene. */}
          <Input
            id={direccionId}
            value={direccion}
            onChange={(event) => alCambiarUbicacion(() => setDireccion(event.target.value))}
            disabled={!ubicacionEditable}
            required
            aria-invalid={direccionError ? true : undefined}
          />
          {direccionError ? (
            <p role="alert" className="text-sm text-destructive">
              {direccionError}
            </p>
          ) : null}
        </div>

        {/* SLT-48 (R43) — UN SELECTOR POR NIVEL DEL PAÍS, encadenados por `padreId` (design §8). Elegir
            un lugar limpia todo lo de debajo: dejar colgado un lugar de otra rama guardaría una
            ubicación que el árbol no tiene. Los que sobran tras la hoja se ven apagados, no ocultos
            (regla 2 de la maqueta): el formulario no salta al cambiar de rama. */}
        <fieldset className="grid gap-3 sm:grid-cols-3">
          <legend className="sr-only">
            {CORREGIR_UBICACION_GRUPO}
          </legend>
          {niveles.map((estado, i) => {
            const selectId = `${nivelSelectId}-${i}`;
            const conError = lugarError !== undefined && i === nivelConError;
            // El aviso previo va en el selector que falta; si el servidor ya rechazó, manda su texto.
            const conIncompleta = !conError && ubicacionIncompleta !== null && i === seleccion.length;
            const incompletaId = `${selectId}-incompleta`;
            return (
              <div key={estado.nivel.profundidad} className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor={selectId}>{estado.nivel.singular}</Label>
                <Select
                  id={selectId}
                  aria-label={estado.nivel.singular}
                  value={estado.valor}
                  options={estado.opciones.map((l) => ({ value: l.id, label: l.nombre }))}
                  placeholder={placeholderDeNivel(estado)}
                  disabled={
                    !ubicacionEditable ||
                    geografia == null ||
                    estado.modo !== "abierto" ||
                    estado.opciones.length === 0
                  }
                  aria-invalid={conError || conIncompleta ? true : undefined}
                  aria-describedby={conIncompleta ? incompletaId : undefined}
                  onValueChange={(next) =>
                    alCambiarUbicacion(() => setSeleccion((previa) => elegirEnNivel(previa, i, next)))
                  }
                />
                {conError ? (
                  <p role="alert" className="text-sm text-destructive">
                    {lugarError}
                  </p>
                ) : null}
                {conIncompleta ? (
                  <p id={incompletaId} className="text-sm text-destructive">
                    {ubicacionIncompleta}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>

        {ubicacionEditable && geografia === null ? (
          <p role="note" className="text-sm text-muted-foreground">
            {CORREGIR_GEOGRAFIA_FALLO}
          </p>
        ) : null}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={pesoId}>{CORREGIR_PESO_LABEL}</Label>
          {/* R9 — estrictamente mayor que cero, y no se puede dejar sin peso desde esta ventana. */}
          <Input
            id={pesoId}
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={peso}
            onChange={(event) => alCambiarUbicacion(() => setPeso(event.target.value))}
            disabled={!ubicacionEditable}
            required
            aria-invalid={pesoError ? true : undefined}
          />
          {pesoError ? (
            <p role="alert" className="text-sm text-destructive">
              {pesoError}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={notasId}>{CORREGIR_NOTAS_LABEL}</Label>
          <p id={`${notasId}-ayuda`} className="text-xs text-muted-foreground">
            {CORREGIR_NOTAS_AYUDA}
          </p>
          {/* 312/R6 — sin `maxLength`, por el mismo motivo que `producto`. */}
          <Textarea
            id={notasId}
            value={notas}
            onChange={(event) => setNotas(event.target.value)}
            rows={3}
            aria-describedby={`${notasId}-ayuda`}
            aria-invalid={notasError ? true : undefined}
          />
          {notasError ? (
            <p role="alert" className="text-sm text-destructive">
              {notasError}
            </p>
          ) : null}
        </div>

        {ordenIdError ? (
          <p role="alert" className="text-sm text-destructive">
            {ordenIdError}
          </p>
        ) : null}

        {/* 💰 327/R33 — LA SEGUNDA FASE. Se monta SOLO con la respuesta del servidor en la mano, y
            su boton es el UNICO que reenvia confirmando. */}
        {aviso ? (
          <CorregirUbicacionAviso
            aviso={aviso}
            niveles={arbol.niveles}
            lugares={lugaresDelAviso}
            enviando={enviando}
            onConfirmar={() => void enviar(true)}
          />
        ) : null}

        {/* R34 — el rechazo del servidor, junto al borrador que se conserva. */}
        {motivoRechazo ? (
          <p
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {motivoRechazo}
          </p>
        ) : null}

        {completo ? null : (
          <p role="note" className="text-sm text-muted-foreground">
            {`${CORREGIR_FALTAN_CAMPOS_PREFIJO} ${faltantes.join(", ")}.`}
          </p>
        )}
      </div>
    </Modal>
  );
}
