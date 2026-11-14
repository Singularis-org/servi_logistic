"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

// SLT-158 «Entrada de escaneo para pistola» — la mecánica de la entrada de `EscanerGuiaCard`,
// separada de su pintura para que SLT-159 (escaneo continuo) la reutilice.
//
// Una pistola 2D es un teclado que escribe muy rápido y pulsa Enter. Para que ninguna lectura
// se pierda ni se junte con la siguiente, la entrada cumple cuatro cosas:
// - el campo NUNCA se deshabilita (R573): deshabilitarlo le quitaba el foco y la segunda
//   lectura se escribía al vacío;
// - las lecturas que llegan mientras otra se procesa esperan en una COLA y salen en orden, una
//   a la vez (R574, D3): lo que se bloquea es el envío repetido, no el campo;
// - el campo se vacía al enviar, acierte o falle (R575, D2): si se quedaba el texto, la
//   lectura siguiente se concatenaba ("10241025");
// - el último error queda escrito (R576) y el resultado se marca un momento (R578).
//
// No sabe de dominio: quién procesa la lectura y qué significa lo decide la superficie, que
// devuelve si acertó o falló (D4).

/** Lo que la superficie devuelve de cada lectura (contrato de T1, D4). */
export type ResultadoLectura =
  | { tipo: "acierto" }
  | { tipo: "error"; motivo: string };

function esResultadoLectura(valor: unknown): valor is ResultadoLectura {
  if (typeof valor !== "object" || valor === null) return false;
  const r = valor as { tipo?: unknown; motivo?: unknown };
  return r.tipo === "acierto" || (r.tipo === "error" && typeof r.motivo === "string");
}

/** Por dónde llegó la lectura: el campo (tecleo o pistola) o la cámara. */
export type OrigenLectura = "campo" | "camara";

export type ProcesarLectura = (
  texto: string,
  origen: OrigenLectura,
) => ResultadoLectura | Promise<ResultadoLectura>;

/** Una lectura fallida, con lo leído y el motivo que dio la superficie (R576). */
export interface ErrorDeLectura {
  lectura: string;
  motivo: string;
}

/** Cuánto dura la marca de resultado en el campo antes de volver a su estado normal (R578). */
export const DURACION_MARCA_MS = 900;

// ---------------------------------------------------------------------------------------
// Puntero (D1): «escritorio» y «móvil» se distinguen por el PUNTERO, no por el ancho. En un
// teléfono el autoenfoque abriría el teclado y taparía el visor; un portátil estrecho sigue
// teniendo pistola.
// ---------------------------------------------------------------------------------------

const CONSULTA_PUNTERO_FINO = "(pointer: fine)";

function suscribirPuntero(alCambiar: () => void) {
  const mql = window.matchMedia(CONSULTA_PUNTERO_FINO);
  mql.addEventListener("change", alCambiar);
  return () => mql.removeEventListener("change", alCambiar);
}

function leerPunteroFino() {
  return window.matchMedia(CONSULTA_PUNTERO_FINO).matches;
}

/** En el servidor no hay puntero: se asume táctil, que es el orden de siempre (cámara arriba). */
function leerPunteroFinoEnServidor() {
  return false;
}

/** `true` si el dispositivo tiene un puntero fino (ratón, trackpad): campo arriba y autoenfoque. */
export function usePunteroFino(): boolean {
  return useSyncExternalStore(
    suscribirPuntero,
    leerPunteroFino,
    leerPunteroFinoEnServidor,
  );
}

// ---------------------------------------------------------------------------------------

export interface OpcionesEntradaEscaneo {
  /** Procesa una lectura. Se lee al momento de enviarla: siempre la versión más reciente. */
  procesar: ProcesarLectura;
  /** El campo al que vuelve el foco tras cada lectura. */
  campoRef: RefObject<HTMLInputElement | null>;
  /** Devolver el foco al campo tras cada lectura (solo con puntero fino, R579). */
  enfocarTrasLectura: boolean;
  /** Se llama al terminar cada lectura (el tono, R577). */
  alTerminar?: (resultado: ResultadoLectura) => void;
  /** Motivo a mostrar si `procesar` lanza en vez de devolver un resultado. */
  motivoFalloInesperado: string;
}

export interface UseEntradaEscaneo {
  valor: string;
  cambiarValor: (valor: string) => void;
  /** Envía lo escrito en el campo (sin espacios) y lo vacía en ese momento (R575). */
  enviarCampo: () => void;
  /** Encola una lectura que no viene del campo (la cámara). */
  recibirLectura: (texto: string, origen: OrigenLectura) => void;
  /** `true` mientras hay una lectura en curso o en cola. */
  procesando: boolean;
  /** La última lectura fallida, hasta que otra acierte (R576). */
  ultimoError: ErrorDeLectura | null;
  /** Resultado de la última lectura, durante `DURACION_MARCA_MS` (R578). */
  marca: ResultadoLectura["tipo"] | null;
}

interface Pendiente {
  texto: string;
  origen: OrigenLectura;
}

export function useEntradaEscaneo({
  procesar,
  campoRef,
  enfocarTrasLectura,
  alTerminar,
  motivoFalloInesperado,
}: OpcionesEntradaEscaneo): UseEntradaEscaneo {
  const [valor, setValor] = useState("");
  const [procesando, setProcesando] = useState(false);
  const [ultimoError, setUltimoError] = useState<ErrorDeLectura | null>(null);
  const [marca, setMarca] = useState<ResultadoLectura["tipo"] | null>(null);

  // La cola y su pestillo viven en refs, no en estado: el bucle que la vacía es una sola
  // clausura asíncrona y tiene que ver cada lectura nueva sin esperar a un render.
  const cola = useRef<Pendiente[]>([]);
  const drenando = useRef(false);
  const temporizadorMarca = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Lo que pone la superficie se lee al momento de usarlo: una lectura en cola se procesa
  // con el `procesar` del último render, no con el del render en que llegó.
  const opciones = useRef({ procesar, enfocarTrasLectura, alTerminar, motivoFalloInesperado });
  useEffect(() => {
    opciones.current = { procesar, enfocarTrasLectura, alTerminar, motivoFalloInesperado };
  });

  useEffect(
    () => () => {
      if (temporizadorMarca.current) clearTimeout(temporizadorMarca.current);
    },
    [],
  );

  const terminar = useCallback(
    (texto: string, resultado: ResultadoLectura) => {
      setUltimoError(
        resultado.tipo === "error"
          ? { lectura: texto, motivo: resultado.motivo }
          : null,
      );
      setMarca(resultado.tipo);
      if (temporizadorMarca.current) clearTimeout(temporizadorMarca.current);
      temporizadorMarca.current = setTimeout(() => setMarca(null), DURACION_MARCA_MS);
      opciones.current.alTerminar?.(resultado);
      if (opciones.current.enfocarTrasLectura) campoRef.current?.focus();
    },
    [campoRef],
  );

  const drenar = useCallback(async () => {
    if (drenando.current) return;
    drenando.current = true;
    setProcesando(true);
    try {
      for (;;) {
        const siguiente = cola.current.shift();
        if (!siguiente) break;
        const fallo: ResultadoLectura = {
          tipo: "error",
          motivo: opciones.current.motivoFalloInesperado,
        };
        let resultado: ResultadoLectura;
        try {
          const devuelto: unknown = await opciones.current.procesar(
            siguiente.texto,
            siguiente.origen,
          );
          // Una superficie que devuelve otra cosa (p. ej. `undefined` de un `switch` que ganó
          // un estado sin `return`) cuenta como fallo: la cola no se detiene por ella.
          resultado = esResultadoLectura(devuelto) ? devuelto : fallo;
        } catch {
          resultado = fallo;
        }
        try {
          terminar(siguiente.texto, resultado);
        } catch {
          // Si falla el tono o el foco, la lectura ya quedó marcada: la cola sigue con la
          // siguiente en vez de quedarse esperando y dejar una promesa rechazada sin manejar.
        }
      }
    } finally {
      drenando.current = false;
      setProcesando(false);
    }
  }, [terminar]);

  const recibirLectura = useCallback(
    (texto: string, origen: OrigenLectura) => {
      cola.current.push({ texto, origen });
      void drenar();
    },
    [drenar],
  );

  const enviarCampo = useCallback(() => {
    const texto = valor.trim();
    if (texto === "") return;
    setValor("");
    recibirLectura(texto, "campo");
  }, [valor, recibirLectura]);

  return {
    valor,
    cambiarValor: setValor,
    enviarCampo,
    recibirLectura,
    procesando,
    ultimoError,
    marca,
  };
}
