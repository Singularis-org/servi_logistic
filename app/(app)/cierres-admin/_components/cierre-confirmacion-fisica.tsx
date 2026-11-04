"use client";

import { PackageCheck } from "lucide-react";

import { EstadoConInfo } from "@/components/shared/EstadoInfo";
import { Badge } from "@/components/ui/badge";
import { EscanerGuiaCard } from "@/components/shared/EscanerGuiaCard";
import { extractNumGuiaFromScan } from "@/lib/utils/paquete-url";
import {
  RESULTADOS_QUE_VUELVEN,
  vuelveABodegaElPaquete,
} from "@/lib/types/gestion-retorno";
import { nombreDeEstado } from "@/lib/types/order-status";
import type {
  CierreDetalleGestion,
  CierreGrupos,
  CierreOrdenSinGestion,
  CierreResultado,
} from "@/lib/interfaces/services/ICierreDiaService";

import { RESULTADO_LABEL, RESULTADO_FILA_LABEL, tituloResultadoConCifra } from "./cierre-labels";

// Feature 238 (T4.2-T4.5, design §5.2/§5.3) — el CUERPO de la ventana de confirmación física:
// lo que bodega ve mientras confirma, guía a guía, que tiene delante cada paquete que vuelve.
//
// Vive fuera de `CierresAdminModule` por el mismo motivo por el que salieron `cierre-factura` y
// `cierre-detalle-shared`: el módulo ya orquesta cuatro modales, y aquí hay ~150 líneas de
// presentación que no deciden nada. **El estado no vive acá**: lo confirmado, el aviso de la
// última lectura y los errores del servidor son del módulo, porque tienen que sobrevivir a
// cerrar y reabrir la ventana (design §5.4) y morir con `cerrarDetalle`. Este componente es
// una función de sus props.
//
// Lo que NO se reinventa: la captura es `EscanerGuiaCard` con sus dos caminos (cámara y número
// tecleado) y el parseo del QR es `extractNumGuiaFromScan`, los mismos que usan las otras seis
// superficies de escaneo. Y **no** se usa `EscanerModal`: ese envoltorio trae su propio botón
// disparador y su propio diálogo, y esto ya vive dentro de uno.

/** Cómo llegó el texto que hay que interpretar: la cámara entrega una URL, el teclado un número. */
export type MedioDeCaptura = "camara" | "manual";

// --- Textos de la ventana (i18n-ready, separados de la lógica, como el resto del módulo) ---

export const CONFIRMACION_TITULO = "Confirmar los paquetes que vuelven";
export const CONFIRMACION_DETALLE =
  "Antes de aprobar, tené delante cada paquete que vuelve a bodega y confirmá su guía: escaneá el código o escribí el número.";
/** Queda un paso más (los montos de los incidentes), así que el botón no promete aprobar. */
export const CONFIRMACION_CONTINUAR = "Continuar";
export const CONFIRMACION_APROBAR = "Confirmar y aprobar";

const ESCANER_TITULO = "Confirmar paquete recibido";
const ESCANER_DESCRIPCION = "Escaneá el código de la guía o escribí su número";
const ESCANER_BOTON = "Confirmar";
const ESCANER_ERROR_CAMARA = "No se pudo abrir la cámara.";

const FILA_PENDIENTE = "Pendiente";
const FILA_CONFIRMADA = "Confirmada";
/**
 * R13, la mitad del cliente. La orden llegó a reparto sin número de guía: no hay nada que
 * escanear, así que ese cierre **no se va a poder aprobar** y bodega tiene que saberlo ANTES de
 * escanear las otras trece. El servidor bloquea igual y con su propio mensaje; esto sólo evita
 * el bloqueo mudo, que es lo que se lee como una app rota.
 *
 * El texto es propio y NO se importa del servicio: los seis mensajes de `CierresAdminService`
 * son constantes de módulo sin exportar, y traerse un módulo de servicio a un componente de
 * cliente arrastraría el servidor entero. Dicen lo mismo con palabras distintas a propósito —
 * si algún día divergieran, la que manda es la del servidor, que es la que decide.
 */
const FILA_SIN_GUIA =
  "Sin número de guía: no se puede confirmar. Avisá a un administrador.";

/**
 * Ficha 451 (R29/R30) — el estado al que el corte pasó las órdenes BARRIDAS. El spec (2026-09-21)
 * las rotula «Sin gestionar», pero la 455 (2026-09-24) retiró ese nombre y fijó uno solo por
 * estado: se nombra con el VIGENTE, leído de la fuente, igual que la sección de barridas del
 * detalle («Pasaron a …», `cierre-factura.tsx`). Así la fila y el detalle dicen lo mismo.
 */
const ESTADO_DE_LA_BARRIDA = "novedad_interna";
const NOMBRE_SECCION_BARRIDAS = nombreDeEstado(ESTADO_DE_LA_BARRIDA);

/** Ficha 451 (R30) — el rótulo de la sección de barridas, con su cifra, como los de las otras tres. */
function tituloBarridasConCifra(cuantas: number): string {
  return `${NOMBRE_SECCION_BARRIDAS} (${cuantas})`;
}

/**
 * Ficha 451 (R34) — la mitad del cliente del bloqueo por falta de guía, ARRIBA y antes de escanear.
 * La línea por fila de la 238 (`FILA_SIN_GUIA`) se conserva; esto la resume para que no dependa de
 * desplazar la lista hasta dar con ella. Cuenta los DOS orígenes: un aviso que contara uno solo
 * sería la divergencia que la lista unificada viene a impedir (design §8). La salida (rechazar el
 * cierre) ya la nombra `textoFaltan`, justo debajo.
 */
export function textoSinGuia(cuantos: number): string {
  return cuantos === 1
    ? "1 paquete de esta lista no tiene número de guía: no se puede confirmar, así que este cierre no se va a poder aprobar."
    : `${cuantos} paquetes de esta lista no tienen número de guía: no se pueden confirmar, así que este cierre no se va a poder aprobar.`;
}

/**
 * Dos filas, UN solo bulto. Se dice en la fila porque es lo que hace legible lo que si no parece
 * un error: al leer esa guía, dos filas cambian a «Confirmada» de golpe y el contador —que va en
 * paquetes— avanza sólo uno. Sin esta línea, quien escanea ve la misma guía repetida y busca el
 * segundo paquete que no existe, o cree que la app marcó de más.
 *
 * Siempre en plural («N filas»): `cuantasFilas` es 2 o más por construcción, así que no hay
 * concordancia que resolver.
 */
export function filaMismoPaquete(cuantasFilas: number): string {
  return `Este paquete aparece en ${cuantasFilas} filas de esta lista: una sola lectura las confirma todas.`;
}

// --- Los cuatro desenlaces de una guía leída (R29-R32) ---
// Son cuatro mensajes DISTINTOS a propósito: son cuatro correcciones distintas para quien está
// en el mostrador con el paquete en la mano. «No es de este cierre» manda a buscar en otra pila;
// «no vuelve a bodega» dice que ese paquete no existe o se quedó con el cliente; «ya está
// confirmada» evita que se escanee dos veces creyendo que la primera no entró.

/** R29 — lo leído no se puede interpretar como número de guía. */
const LECTURA_ILEGIBLE =
  "No se pudo leer un número de guía en ese código. Escaneá de nuevo o escribí el número.";
/** R30 (238) / R33 (451) — la guía no es de ninguna gestión ni de ninguna barrida de este cierre. */
const LECTURA_AJENA = "Esa guía no pertenece a este cierre.";
/** R32 — ya se confirmó en esta sesión. */
const LECTURA_YA_CONFIRMADA =
  "Esa guía ya está confirmada. No se cuenta dos veces.";

/** R31 — es de este cierre, pero ese paquete no vuelve a bodega. Se nombra POR QUÉ no vuelve. */
function lecturaNoVuelve(resultado: CierreResultado): string {
  return `Esa guía es de este cierre, pero ese paquete no vuelve a bodega. Resultado: ${RESULTADO_FILA_LABEL[resultado]}.`;
}

/**
 * R27 — el motivo del bloqueo, CON PALABRAS. Y nombra la salida: si un paquete no llegó, la
 * puerta es rechazar el cierre (D2, firmada: no hay «aprobar de todas formas»). Sin nombrarla,
 * quien está bloqueado busca una puerta trasera que no existe.
 */
export function textoFaltan(faltan: number): string {
  return faltan === 1
    ? "Falta 1 paquete por confirmar. Si no llegó, rechazá el cierre indicando cuál falta."
    : `Faltan ${faltan} paquetes por confirmar. Si alguno no llegó, rechazá el cierre indicando cuáles faltan.`;
}

/**
 * El progreso, siempre visible: con catorce filas, «cuántas van» no puede vivir al final.
 *
 * La frase pone el número DESPUÉS del sustantivo («1 de 3») y no antes («Confirmados 0 de 1
 * paquetes») para que no haya que concordar en número: con un solo paquete, la segunda forma
 * escribe «de 1 paquetes».
 */
export function textoProgreso(confirmadas: number, total: number): string {
  return `Paquetes confirmados: ${confirmadas} de ${total}.`;
}

/**
 * Ya están todos los paquetes delante. Lo que viene DEPENDE del cierre, y decirlo mal es la
 * clase de mentira que ninguna suite mira: con incidentes todavía queda teclear los montos
 * (R37), así que anunciar «ya se puede aprobar» junto a un botón que dice «Continuar» deja a
 * bodega buscando el botón de aprobar que no existe.
 */
export function textoCompleta(hayIncidentes: boolean): string {
  return hayIncidentes
    ? "Están todos. Queda indicar los montos de los incidentes."
    : "Están todos. Ya se puede aprobar el cierre.";
}

/**
 * R34 — los incidentes, NOMBRADOS como excluidos y con su razón. No es un detalle de cortesía:
 * medido el 2026-08-19, hay incidentes en 2 de 12 cierres y conviven con retornables, así que
 * esta línea se ve de verdad. Sin ella, bodega cuenta los paquetes del cierre, le salen más que
 * los de la lista y busca el que «falta».
 */
export function textoIncidentesExcluidos(cuantos: number): string {
  return cuantos === 1
    ? "1 incidente de este cierre no se escanea: ese paquete no vuelve a bodega, se indemniza."
    : `${cuantos} incidentes de este cierre no se escanean: esos paquetes no vuelven a bodega, se indemnizan.`;
}

/**
 * R2 — las gestiones del cierre cuyo paquete vuelve a bodega, sacadas del MISMO detalle que ya se
 * pidió al servidor y filtradas por el PUNTO ÚNICO (`RESULTADOS_QUE_VUELVEN`), no por una lista
 * escrita acá.
 *
 * Que salga del detalle ya cargado y no de una consulta aparte es lo que hace cierto que el
 * conjunto que la ventana pide confirmar sea exactamente el que el servicio exige cubrir. Es la
 * propiedad que la 158 declaró para los incidentes, aplicada al conjunto hermano.
 */
export function retornablesDelCierre(grupos: CierreGrupos): CierreDetalleGestion[] {
  return RESULTADOS_QUE_VUELVEN.flatMap((resultado) => grupos[resultado]);
}

/**
 * TODAS las gestiones del cierre, de los cinco resultados. Hace falta para poder distinguir
 * R30 («no es de este cierre») de R31 («es de este cierre y no vuelve»): con sólo las
 * retornables delante, las dos lecturas serían indistinguibles.
 */
export function gestionesDelCierre(grupos: CierreGrupos): CierreDetalleGestion[] {
  return Object.values(grupos).flat();
}

/**
 * Ficha 451 (design §6.3) — UNA fila de la ventana, venga de donde venga. Las funciones de abajo
 * operan sobre esta vista y no sobre `CierreDetalleGestion`: es lo que permite UN solo contador y
 * UN solo intérprete de lectura para las gestiones y las órdenes barridas.
 *
 * `clave` es el id con el que el servidor identifica la fila en su cobertura y en sus
 * `fieldErrors`: el `gestionId` de una gestión, el `ordenId` de una barrida. Son ids de tablas
 * distintas, así que no chocan entre sí.
 */
export type FilaAConfirmar =
  | {
      origen: "gestion";
      clave: string;
      numGuia: number | null;
      numRemision: string;
      destinatario: string;
      tiendaNombre: string;
      resultado: CierreResultado;
    }
  | {
      origen: "barrida";
      clave: string;
      numGuia: number | null;
      numRemision: string;
      destinatario: string;
      tiendaNombre: string;
    };

function filaDeGestion(g: CierreDetalleGestion): FilaAConfirmar {
  return {
    origen: "gestion",
    clave: g.gestionId,
    numGuia: g.numGuia,
    numRemision: g.numRemision,
    destinatario: g.destinatario,
    tiendaNombre: g.tiendaNombre,
    resultado: g.resultado,
  };
}

/** La guía de la barrida es la CONGELADA al barrer: la misma contra la que compara el servidor (Q2). */
function filaDeOrdenSinGestion(o: CierreOrdenSinGestion): FilaAConfirmar {
  return {
    origen: "barrida",
    clave: o.ordenId,
    numGuia: o.numGuia,
    numRemision: o.numRemision,
    destinatario: o.destinatario,
    tiendaNombre: o.tiendaNombre,
  };
}

/**
 * Ficha 451 (R5/R29-R31) — EL CONJUNTO ESPERADO tal como lo ve la pantalla: las gestiones que
 * vuelven, en el orden que deriva el punto único, y DESPUÉS las órdenes que el corte barrió en este
 * cierre (`detalle.ordenesSinGestion`, ya cargado: ni una consulta nueva en el cliente).
 *
 * Que las barridas vuelvan también lo decide el punto único (`vuelveABodegaElPaquete`), no esta
 * función: si la pantalla lo decidiera por su cuenta podría pedir un conjunto distinto del que el
 * servidor exige, y el botón se quedaría bloqueado sin explicación.
 */
export function filasAConfirmar(
  grupos: CierreGrupos,
  ordenesSinGestion: readonly CierreOrdenSinGestion[],
): FilaAConfirmar[] {
  return [
    ...retornablesDelCierre(grupos).map(filaDeGestion),
    ...ordenesSinGestion.map(filaDeOrdenSinGestion).filter(vuelveABodegaElPaquete),
  ];
}

/**
 * Ficha 451 (R33) — TODAS las filas del cierre: las cinco secciones de gestión más las barridas.
 * Es contra lo que se interpreta una lectura: una guía que no casa con NINGUNA de las dos fuentes
 * es «no pertenece a este cierre», y la de una gestión que no vuelve sigue siendo R31 de la 238.
 */
export function filasDelCierre(
  grupos: CierreGrupos,
  ordenesSinGestion: readonly CierreOrdenSinGestion[],
): FilaAConfirmar[] {
  return [
    ...gestionesDelCierre(grupos).map(filaDeGestion),
    ...ordenesSinGestion.map(filaDeOrdenSinGestion),
  ];
}

/**
 * Lo que produce interpretar una lectura: o marca filas, o dice qué pasó. Nunca las dos.
 *
 * `claves` es una LISTA y no una fila suelta a propósito: una guía puede tener **más de una fila
 * pendiente** en el mismo cierre (dos gestiones vivas de la misma orden), y hay UN solo paquete
 * físico detrás. Una lectura = «tengo este paquete delante» = todas sus filas cubiertas. Con una
 * sola fila por lectura, la segunda no se podía confirmar nunca (ver `interpretarLectura`).
 */
export type LecturaInterpretada =
  | { tipo: "confirma"; claves: readonly string[]; numGuia: number }
  | { tipo: "aviso"; mensaje: string };

/**
 * R29-R32 — de un texto leído a uno de los cuatro desenlaces. **Función pura**: no toca estado,
 * no llama a ninguna Server Action y no sabe pintar. Toda la resolución `numGuia -> fila` se hace
 * en el cliente contra el detalle YA cargado, que es el mismo conjunto que el servidor exige
 * cubrir (design §5.1): no hay una segunda consulta que pueda decir otra cosa.
 *
 * Se buscan TODAS las filas del cierre (`filasDelCierre`) y no sólo las que vuelven, porque
 * distinguir «no es de este cierre» de «es de este cierre y no vuelve» son dos correcciones
 * distintas (R30 vs R31) y sólo se pueden distinguir mirando las cinco secciones. Desde la 451
 * entran también las barridas, así que su guía confirma su fila (R32 de la 451) y una guía que no
 * casa con ninguna de las dos fuentes sigue siendo ajena (R33 de la 451).
 *
 * **Se buscan TODAS las filas de esa guía, no la primera.** Un cierre puede traer dos gestiones
 * vivas de la MISMA orden y, por tanto, con la misma guía: medido contra producción el
 * 2026-08-19, 1 de 48 pares (cierre, orden) vivos está en ese caso, y es justo del tipo que
 * bloquea. Con `find` pasaba esto: la primera lectura confirmaba la primera fila, la segunda
 * lectura volvía a caer en esa misma fila y respondía «ya está confirmada», y la segunda fila se
 * quedaba `Pendiente` PARA SIEMPRE — el contador clavado en `N-1 de N`, el botón apagado y el
 * cierre imposible de aprobar por ninguna vía. El servidor no tiene ese candado: dedupe por
 * clave (no por guía) y compara la guía contra la de CADA fila, así que dos entradas con la misma
 * `numGuia` y distinta clave le valen.
 *
 * ⚠️ **PREMISA DE LA QUE DEPENDE LA CORRECCIÓN DE TODO ESTO: `orden.numGuia` es `@unique`**
 * (`db/schema.prisma`, modelo `Orden`). Ésa —y sólo ésa— es la razón por la que «todas las filas
 * de esta guía» significa «un solo bulto». Una guía identifica UNA orden; una orden es UN paquete
 * físico; luego confirmar de golpe todas sus filas es atestiguar el bulto que se tiene delante, ni
 * uno más. **Si esa unicidad desapareciera, esto dejaría de ser una corrección y pasaría a ser un
 * agujero**: una sola lectura daría por confirmados paquetes DISTINTOS y bodega estaría firmando
 * que tiene delante algo que no tiene. Nada del código lo avisaría —ni el typecheck, ni la
 * pantalla, que seguiría comportándose igual—, así que la premisa se vigila donde se escribe: el
 * caso «PREMISA» de `tests/components/CierresAdminConfirmacionFisica.test.tsx` lee
 * `db/schema.prisma` y se pone rojo si el `@unique` de `numGuia` se cae. No se delega en la
 * guardia de la 229, que fija lo mismo por un motivo suyo y se iría con ella.
 *
 * La guía de una barrida es una COPIA sin `@unique` (`cierre_sin_gestion.num_guia`); la unicidad
 * la aporta la orden de la que se copió, y dos barridas del mismo cierre son dos órdenes distintas.
 */
export function interpretarLectura(
  texto: string,
  medio: MedioDeCaptura,
  filasDelCierreAbierto: readonly FilaAConfirmar[],
  yaConfirmadas: Readonly<Record<string, number>>,
): LecturaInterpretada {
  // La cámara entrega la URL del paquete (`<origin>/paquete/<numGuia>`) y hay que extraer el
  // número; lo tecleado ES el número. Es la ÚNICA diferencia entre los dos caminos, igual que
  // en `RecogerPaqueteCard`: de aquí en adelante los dos recorren exactamente el mismo camino.
  const numGuia =
    medio === "camara"
      ? extractNumGuiaFromScan(texto)
      : /^\d+$/.test(texto.trim())
        ? Number(texto.trim())
        : null;
  if (numGuia === null || !Number.isSafeInteger(numGuia) || numGuia <= 0) {
    return { tipo: "aviso", mensaje: LECTURA_ILEGIBLE }; // R29
  }

  // Las filas sin guía (`numGuia === null`) no casan nunca: `numGuia` ya es un número acá.
  const conEsaGuia = filasDelCierreAbierto.filter((f) => f.numGuia === numGuia);
  if (conEsaGuia.length === 0) return { tipo: "aviso", mensaje: LECTURA_AJENA }; // R30 (238) / R33 (451)

  // R31: `vuelveABodegaElPaquete` es el PUNTO ÚNICO, para los dos orígenes. La pantalla no decide
  // por su cuenta qué vuelve; si lo decidiera, podría pedir confirmar un conjunto distinto del que
  // el servidor exige y el botón se quedaría bloqueado sin explicación posible.
  //
  // El aviso sale sólo si NINGUNA de las filas de esa guía vuelve. Basta con que una vuelva para
  // que el paquete esté delante y haya algo que confirmar: mirar sólo la primera convertía una
  // `entregada` que comparte guía con una `devuelta` en el mismo bloqueo mudo de antes.
  const queVuelven = conEsaGuia.filter(vuelveABodegaElPaquete);
  if (queVuelven.length === 0) {
    // Se nombra el resultado de la primera gestión: son todas del mismo paquete, y lo que corrige
    // a quien está en el mostrador es SABER que ese bulto no se escanea, no cuál de las filas. Que
    // ninguna vuelva implica que todas son gestiones (el punto único hace volver SIEMPRE a la
    // barrida); el `?? LECTURA_AJENA` sólo existe para que el tipo no tenga un camino sin texto.
    const resultado = conEsaGuia.flatMap((f) => (f.origen === "gestion" ? [f.resultado] : []))[0];
    return {
      tipo: "aviso",
      mensaje: resultado === undefined ? LECTURA_AJENA : lecturaNoVuelve(resultado),
    };
  }

  const pendientes = queVuelven.filter((f) => yaConfirmadas[f.clave] === undefined);
  // R32, intacto y con su motivo: avisa cuando YA NO QUEDA NADA que cubrir con esa guía, que es
  // el caso en que la segunda lectura del mismo bulto no cuenta. Mientras quede una fila
  // pendiente sí hay algo que confirmar, y avisar ahí era el defecto.
  if (pendientes.length === 0) {
    return { tipo: "aviso", mensaje: LECTURA_YA_CONFIRMADA };
  }
  return { tipo: "confirma", claves: pendientes.map((f) => f.clave), numGuia };
}

/**
 * Ficha 451 (R17, T5.4) — una entrada de la lista que el borde del servidor exige, CON su origen.
 * Espejo del `confirmacionFisicaSchema` de `lib/types/cierres-admin.ts`; se declara acá y no se
 * importa de allí porque ese módulo trae `Prisma` como valor y esto es un componente de cliente.
 */
export type EntradaConfirmacionFisica =
  | { origen: "gestion"; gestionId: string; numGuia: number }
  | { origen: "barrida"; ordenId: string; numGuia: number };

/**
 * Ficha 451 (T5.4) — lo confirmado, en la forma que el borde espera: cada fila con SU origen y SU
 * clave. Sin el `origen`, el servidor rechaza la lista entera con `VALIDATION_ERROR`.
 */
export function entradasDeConfirmacion(
  filas: readonly FilaAConfirmar[],
  confirmadas: Readonly<Record<string, number>>,
): EntradaConfirmacionFisica[] {
  return filas.flatMap((f): EntradaConfirmacionFisica[] => {
    const numGuia = confirmadas[f.clave];
    if (numGuia === undefined) return [];
    return f.origen === "gestion"
      ? [{ origen: "gestion", gestionId: f.clave, numGuia }]
      : [{ origen: f.origen, ordenId: f.clave, numGuia }];
  });
}

/**
 * La CLAVE del paquete FÍSICO de una fila. Dos gestiones vivas de la misma orden llegan con la
 * misma guía y son **un solo bulto** en el estante: cuentan una vez.
 *
 * La guía sirve de clave del bulto **por la misma premisa que sostiene `interpretarLectura`:
 * `orden.numGuia` es `@unique`** (`db/schema.prisma`, modelo `Orden`). Si dos órdenes pudieran
 * compartir guía, `guia:<numGuia>` fundiría paquetes DISTINTOS en una sola entrada del contador:
 * el total saldría corto y bodega pondría delante menos bultos de los que debe. Ahí la premisa
 * no protege una confirmación de más, sino un total de menos — el mismo agujero por el otro lado.
 *
 * Sin guía no hay forma de saber si dos filas son el mismo bulto, así que cada una cuenta por su
 * cuenta. No es un detalle: colapsarlas rebajaría el total y, con él, el número de paquetes que
 * bodega tiene que poner delante — y esas filas además no se pueden confirmar nunca (R13), así
 * que el bloqueo tiene que seguir contándolas. El origen va en la clave porque la `clave` de una
 * gestión y la de una barrida salen de tablas distintas.
 */
function clavePaquete(f: FilaAConfirmar): string {
  return f.numGuia === null ? `sin-guia:${f.origen}:${f.clave}` : `guia:${f.numGuia}`;
}

/** Las filas del conjunto esperado, agrupadas por paquete físico (una guía, un bulto). */
export function agruparPorPaquete(filas: readonly FilaAConfirmar[]): FilaAConfirmar[][] {
  const porClave = new Map<string, FilaAConfirmar[]>();
  for (const f of filas) {
    const grupo = porClave.get(clavePaquete(f));
    if (grupo === undefined) porClave.set(clavePaquete(f), [f]);
    else grupo.push(f);
  }
  return [...porClave.values()];
}

/**
 * R27 — el progreso EN PAQUETES, que es lo que el rótulo dice y lo que bodega cuenta en el
 * estante. **No en filas**: en el cierre medido el 2026-08-19 eran doce filas para once bultos,
 * así que «Paquetes confirmados: X de 12» ya mentía antes de este arreglo; y desde el arreglo,
 * contar filas haría además que una sola lectura moviera el contador de dos en dos, que a los
 * ojos de quien escanea es un error de la app.
 *
 * `faltan` es el MISMO candado de antes: un paquete cuenta como hecho sólo si TODAS sus filas
 * están confirmadas, y una lectura confirma todas las pendientes de esa guía a la vez, así que
 * «faltan 0 paquetes» y «no queda ninguna fila pendiente» son la misma condición. Contarlo en
 * paquetes cambia el número que se DICE, no el que bloquea. Desde la 451 recibe la lista
 * unificada: las barridas entran en ESTE contador y no en uno aparte (R31 de la 451).
 */
export function progresoDePaquetes(
  filas: readonly FilaAConfirmar[],
  confirmadas: Readonly<Record<string, number>>,
): { total: number; hechas: number; faltan: number } {
  const paquetes = agruparPorPaquete(filas);
  const hechas = paquetes.filter((grupo) =>
    grupo.every((f) => confirmadas[f.clave] !== undefined),
  ).length;
  return { total: paquetes.length, hechas, faltan: paquetes.length - hechas };
}

type FilaDeGestion = Extract<FilaAConfirmar, { origen: "gestion" }>;
type FilaDeBarrida = Extract<FilaAConfirmar, { origen: "barrida" }>;

/**
 * R2/R33 — las gestiones que vuelven, AGRUPADAS por resultado y en el orden que declara el punto
 * único. El orden no se elige acá: se deriva de `RESULTADOS_QUE_VUELVEN`, para que añadir un
 * resultado retornable al `Record` lo haga aparecer en la ventana sin tocar este archivo. Las
 * barridas no tienen resultado y van en su propia sección, concatenada DESPUÉS (451, design §6.2).
 */
export function agruparRetornables(
  filas: readonly FilaAConfirmar[],
): { resultado: CierreResultado; filas: FilaDeGestion[] }[] {
  const deGestion = filas.filter((f): f is FilaDeGestion => f.origen === "gestion");
  return RESULTADOS_QUE_VUELVEN.map((resultado) => ({
    resultado,
    filas: deGestion.filter((f) => f.resultado === resultado),
  })).filter((grupo) => grupo.filas.length > 0);
}

export interface ConfirmacionFisicaCuerpoProps {
  /** El conjunto esperado: las gestiones que vuelven y las órdenes barridas (`filasAConfirmar`). */
  filas: readonly FilaAConfirmar[];
  /** R34: las `incidente` del mismo cierre, para nombrarlas como excluidas. */
  incidentes: readonly CierreDetalleGestion[];
  /** `clave -> numGuia leído`. Lo confirmado en esta sesión. */
  confirmadas: Readonly<Record<string, number>>;
  /** Errores del servidor por clave de fila (`fieldErrors`), pintados en su fila. */
  errores: Readonly<Record<string, string>>;
  /** R29-R32: qué pasó con la última lectura; `null` si no hay nada que decir. */
  aviso: string | null;
  /** Confirmación persistente del último acierto, bajo el formulario. */
  ultimaGuiaConfirmada: number | null;
  /** Interpreta y aplica una lectura. Devuelve `true` si marcó una fila (limpia el campo). */
  onLectura: (texto: string, medio: MedioDeCaptura) => boolean;
}

interface FilaConfirmacionProps {
  fila: FilaAConfirmar;
  confirmada: boolean;
  error: string | undefined;
  filasDelPaquete: number;
}

/**
 * Una fila del conjunto esperado. LA MISMA para los dos orígenes (R30 de la 451: mismo peso
 * visual): sólo cambia el chip del hueco de la izquierda — el resultado de la gestión, o el estado
 * al que el corte pasó la orden barrida —, que es lo que le dice a quien escanea por qué ese
 * paquete está ahí.
 */
function FilaConfirmacion({
  fila,
  confirmada,
  error,
  filasDelPaquete,
}: Readonly<FilaConfirmacionProps>) {
  // `data-gestion` se conserva tal cual para las gestiones (lo lee el test de la 238); la barrida
  // lleva el suyo porque su clave es un id de orden, no de gestión.
  const marca =
    fila.origen === "gestion" ? { "data-gestion": fila.clave } : { "data-barrida": fila.clave };
  return (
    <li {...marca} className="flex flex-col gap-1 rounded-lg border border-border p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium">{`Nº Guía ${fila.numGuia ?? "—"} · ${fila.numRemision}`}</p>
        <div className="flex items-center gap-1.5">
          {/* FICHA 456 (T3.4, R10): el chip de la fila con su botón de información. */}
          <EstadoConInfo
            codigo={fila.origen === "gestion" ? fila.resultado : ESTADO_DE_LA_BARRIDA}
            chip={(nombre) => <Badge variant="outline">{nombre}</Badge>}
          />
          <Badge variant={confirmada ? "success" : "warning"}>
            {confirmada ? FILA_CONFIRMADA : FILA_PENDIENTE}
          </Badge>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{`${fila.destinatario} · ${fila.tiendaNombre}`}</p>
      {fila.numGuia === null ? (
        <p role="alert" className="text-sm text-destructive">
          {FILA_SIN_GUIA}
        </p>
      ) : null}
      {/* Dos gestiones vivas de la misma orden = una guía, un bulto. Se nombra para que ver la
          misma guía dos veces no se lea como un error. Sin `role`: es contenido de la fila, no un
          aviso aparte — el `role="note"` de la barra de estado es el del BLOQUEO (R27) y tiene que
          seguir siendo el único, o dejaría de poder señalarse. */}
      {filasDelPaquete > 1 ? (
        <p className="text-xs text-muted-foreground">{filaMismoPaquete(filasDelPaquete)}</p>
      ) : null}
      {/* T4.7 (238) y R35 (451): el error del servidor de ESA fila, en SU fila. Espejo de lo que
          la 158 hace con los montos. */}
      {error ? (
        <p id={`confirmacion-${fila.clave}-error`} role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ConfirmacionFisicaCuerpo({
  filas,
  incidentes,
  confirmadas,
  errores,
  aviso,
  ultimaGuiaConfirmada,
  onLectura,
}: Readonly<ConfirmacionFisicaCuerpoProps>) {
  // El rótulo dice «paquetes», así que se cuentan PAQUETES: una guía repetida en dos filas es un
  // solo bulto en el estante (ver `progresoDePaquetes`).
  const { total, hechas, faltan } = progresoDePaquetes(filas, confirmadas);
  // Cuántas filas comparten bulto con otra, para poder decirlo en la fila.
  const filasPorPaquete = new Map<string, number>(
    agruparPorPaquete(filas).map((grupo) => [clavePaquete(grupo[0]), grupo.length]),
  );
  // Ficha 451 (R34): las filas que no se pueden confirmar nunca, de los dos orígenes.
  const sinGuia = filas.filter((f) => f.numGuia === null).length;
  const barridas = filas.filter((f): f is FilaDeBarrida => f.origen === "barrida");

  function pintarFila(f: FilaAConfirmar) {
    return (
      <FilaConfirmacion
        key={`${f.origen}:${f.clave}`}
        fila={f}
        confirmada={confirmadas[f.clave] !== undefined}
        error={errores[f.clave]}
        filasDelPaquete={filasPorPaquete.get(clavePaquete(f)) ?? 1}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- La barra de estado ----------
          VA ARRIBA Y PEGADA, y esa es la decisión de diseño de esta ventana. Medido contra
          producción el 2026-08-19: el techo de un cierre son CATORCE guías (media 2,7). Con
          catorce filas y bodega escaneando de pie, un progreso al final de la lista no existe:
          hay que soltar el paquete, desplazar y volver. Aquí hay dos candados para que no pase:
          (1) `sticky top-0` dentro del cuerpo del modal, que es el contenedor que desplaza; y
          (2) la LISTA tiene su propio desplazamiento acotado más abajo, así que en el caso
          normal el cuerpo del modal no desplaza en absoluto y esta barra ni se mueve.

          No va en la `description` del Modal —que también queda fija— porque eso es
          `Dialog.Description`: se anuncia UNA vez al abrir y un contador que cambia con cada
          escaneo no se volvería a anunciar. Acá es una región viva (`role="status"`). */}
      <div className="sticky top-0 z-10 flex flex-col gap-1.5 bg-background pb-3">
        <p role="status" className="text-sm font-medium">
          {textoProgreso(hechas, total)}
        </p>
        {/* Ficha 451 (R34): ANTES de la lista y antes de escanear. Sin `role`: el texto está
            desde que se abre la ventana (no cambia con las lecturas), y el `role="note"` de abajo
            tiene que seguir siendo el único (R27 de la 238). */}
        {sinGuia > 0 ? (
          <p className="text-sm font-medium text-destructive">{textoSinGuia(sinGuia)}</p>
        ) : null}
        {/* R27: el motivo del bloqueo con TEXTO, nunca sólo un botón apagado. */}
        {faltan > 0 ? (
          <p role="note" className="text-sm text-muted-foreground">
            {textoFaltan(faltan)}
          </p>
        ) : (
          <p role="note" className="text-sm font-medium text-success-strong">
            {textoCompleta(incidentes.length > 0)}
          </p>
        )}
        {/* R29-R32: qué pasó con la última lectura. Persistente y no un toast: el toast se va
            solo y quien está escaneando una tanda seguida necesita seguir viéndolo. */}
        {aviso ? (
          <p
            role="alert"
            className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {aviso}
          </p>
        ) : null}
      </div>

      {/* ---------- R34: los incidentes excluidos, nombrados ---------- */}
      {incidentes.length > 0 ? (
        <section
          aria-label="Incidentes excluidos de la confirmación"
          className="rounded-lg border border-info/40 bg-info-soft px-3 py-2 dark:bg-info/15"
        >
          <p className="text-sm font-medium text-info-strong">
            {textoIncidentesExcluidos(incidentes.length)}
          </p>
          <ul className="mt-1 flex flex-col gap-0.5">
            {incidentes.map((g) => (
              <li key={g.gestionId} className="text-xs text-info-strong">
                {`Nº Guía ${g.numGuia ?? "—"} · ${g.numRemision} · ${g.destinatario}`}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {/* La tarjeta de captura, con sus DOS caminos (R28). `max-w-none` porque la tarjeta nace
            con el ancho de una pantalla de teléfono y acá vive en una columna del modal. */}
        <EscanerGuiaCard
          className="max-w-none"
          ariaLabel="Confirmar por número de guía o escaneo"
          titulo={ESCANER_TITULO}
          descripcion={ESCANER_DESCRIPCION}
          icono={PackageCheck}
          onDecoded={(texto) => {
            onLectura(texto, "camara");
          }}
          mensajeErrorCamara={ESCANER_ERROR_CAMARA}
          manual={{
            onSubmit: (valor) => onLectura(valor, "manual"),
            submitLabel: ESCANER_BOTON,
          }}
          exito={
            ultimaGuiaConfirmada === null ? undefined : (
              <>
                Guía{" "}
                <span className="font-semibold">{ultimaGuiaConfirmada}</span>{" "}
                confirmada.
              </>
            )
          }
        />

        {/* ---------- La lista del conjunto esperado (R33) ----------
            Con su PROPIO desplazamiento acotado: catorce filas caben en un modal alto, pero
            desplazar la lista entera arrastraría también la barra de estado y la tarjeta de
            captura, que son justo lo que hay que tener a la vista mientras se escanea. Las
            barridas (451) van DENTRO de este mismo contenedor, como cuarta sección: en una caja
            aparte se leerían como opcionales (design §6.2). */}
        <div className="max-h-[45vh] overflow-y-auto pr-1">
          <div className="flex flex-col gap-4">
            {agruparRetornables(filas).map(({ resultado, filas: filasDelResultado }) => (
              <section key={resultado} aria-label={RESULTADO_LABEL[resultado]}>
                <h3 className="mb-1.5 text-sm font-semibold">
                  {tituloResultadoConCifra(resultado, filasDelResultado.length)}
                </h3>
                <ul className="flex flex-col gap-2">{filasDelResultado.map(pintarFila)}</ul>
              </section>
            ))}
            {barridas.length > 0 ? (
              <section aria-label={NOMBRE_SECCION_BARRIDAS}>
                <h3 className="mb-1.5 text-sm font-semibold">
                  {tituloBarridasConCifra(barridas.length)}
                </h3>
                <ul className="flex flex-col gap-2">{barridas.map(pintarFila)}</ul>
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
