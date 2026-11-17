import type { ResumenRecepcion } from "@/lib/interfaces/repositories/IOrdenRepository";
import { leerGuia } from "@/lib/utils/paquete-url";

// SLT-159 «Escaneo continuo en recepciones y recogidas» — la sesión de lecturas de un escaneo
// continuo, sin React: cada lectura es una fila que nace al llegar (R581-R582) y pasa al
// desenlace de su propia guía (R587). La lista vive en memoria mientras el modal o la página
// están montados (R591). Genérica a propósito: SLT-168 la reutiliza en las recogidas.

export type EstadoFila =
  | { tipo: "recibiendo" }
  | { tipo: "recibida"; resumen?: ResumenRecepcion }
  | { tipo: "ya_recibida"; resumen?: ResumenRecepcion }
  /** R585: la guía ya estaba en la sesión; no se llamó a la acción. Se pinta «Ya recibida». */
  | { tipo: "repetida_en_sesion"; resumen?: ResumenRecepcion }
  | { tipo: "no_encontrada" }
  | { tipo: "no_se_pudo"; motivo: string }
  | { tipo: "codigo_invalido" };

export interface FilaLectura {
  id: number;
  hora: Date;
  /** Lo leído tal cual: es lo que se pinta en «Guía» si no es una guía (R581). */
  leido: string;
  numGuia: number | null;
  estado: EstadoFila;
}

/** Lo que cada superficie traduce desde la respuesta de su acción. */
export type DesenlaceRecepcion =
  | { tipo: "recibida"; resumen?: ResumenRecepcion }
  | { tipo: "ya_recibida"; resumen?: ResumenRecepcion }
  | { tipo: "no_encontrada" }
  | { tipo: "no_se_pudo"; motivo: string };

export interface ContadoresSesion {
  recibidas: number;
  repetidas: number;
  noEncontradas: number;
}

export interface SesionEscaneo {
  /** La más reciente primero (R581). */
  filas: readonly FilaLectura[];
  siguienteId: number;
}

export type AccionSesion =
  | { tipo: "llegar"; texto: string; hora: Date }
  | { tipo: "resolver"; id: number; desenlace: DesenlaceRecepcion }
  | { tipo: "reintentar"; id: number };

export const SESION_VACIA: SesionEscaneo = { filas: [], siguienteId: 1 };

/** Estados que frenan una relectura de la misma guía (R585); un error no la frena. */
const FRENAN_RELECTURA: ReadonlySet<EstadoFila["tipo"]> = new Set([
  "recibiendo",
  "recibida",
  "ya_recibida",
  "repetida_en_sesion",
]);

function resumenDe(estado: EstadoFila): ResumenRecepcion | undefined {
  return "resumen" in estado ? estado.resumen : undefined;
}

/** Clasifica una lectura al llegar: inválida (R584), repetida en la sesión (R585) o a recibir. */
function estadoAlLlegar(filas: readonly FilaLectura[], numGuia: number | null): EstadoFila {
  if (numGuia === null) return { tipo: "codigo_invalido" };
  const anterior = filas.find(
    (f) => f.numGuia === numGuia && FRENAN_RELECTURA.has(f.estado.tipo),
  );
  if (!anterior) return { tipo: "recibiendo" };
  return { tipo: "repetida_en_sesion", resumen: resumenDe(anterior.estado) };
}

export function reducirSesion(sesion: SesionEscaneo, accion: AccionSesion): SesionEscaneo {
  switch (accion.tipo) {
    case "llegar": {
      const numGuia = leerGuia(accion.texto);
      const fila: FilaLectura = {
        id: sesion.siguienteId,
        hora: accion.hora,
        leido: accion.texto,
        numGuia,
        estado: estadoAlLlegar(sesion.filas, numGuia),
      };
      return { filas: [fila, ...sesion.filas], siguienteId: sesion.siguienteId + 1 };
    }
    case "resolver":
      return {
        ...sesion,
        filas: sesion.filas.map((f) =>
          f.id === accion.id ? { ...f, estado: accion.desenlace } : f,
        ),
      };
    case "reintentar":
      return {
        ...sesion,
        filas: sesion.filas.map((f) =>
          f.id === accion.id && f.estado.tipo === "no_se_pudo"
            ? { ...f, estado: { tipo: "recibiendo" } }
            : f,
        ),
      };
  }
}

/** R586: «Código inválido» y «No se pudo recibir» no suman a ningún contador (DC6). */
export function contadores(filas: readonly FilaLectura[]): ContadoresSesion {
  const cuenta: ContadoresSesion = { recibidas: 0, repetidas: 0, noEncontradas: 0 };
  for (const { estado } of filas) {
    if (estado.tipo === "recibida") cuenta.recibidas += 1;
    else if (estado.tipo === "ya_recibida" || estado.tipo === "repetida_en_sesion") {
      cuenta.repetidas += 1;
    } else if (estado.tipo === "no_encontrada") cuenta.noEncontradas += 1;
  }
  return cuenta;
}

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** «HH:mm:ss», 24 h, con el reloj del dispositivo que lee (R581). */
export function horaLectura(d: Date): string {
  return `${dosCifras(d.getHours())}:${dosCifras(d.getMinutes())}:${dosCifras(d.getSeconds())}`;
}

/** Texto de la columna «Estado» (R582-R585). El motivo de «No se pudo recibir» va aparte. */
export function textoEstado(estado: EstadoFila): string {
  switch (estado.tipo) {
    case "recibiendo":
      return "Recibiendo…";
    case "recibida":
      return "Recibida";
    case "ya_recibida":
    case "repetida_en_sesion":
      return "Ya recibida";
    case "no_encontrada":
      return "No encontrada";
    case "no_se_pudo":
      return "No se pudo recibir";
    case "codigo_invalido":
      return "Código inválido";
  }
}

/** «Destinatario» y «Tienda» solo en recibida / ya recibida con `resumen`; si no, «—» (R581). */
export function resumenVisible(estado: EstadoFila): ResumenRecepcion | undefined {
  return estado.tipo === "recibida" ||
    estado.tipo === "ya_recibida" ||
    estado.tipo === "repetida_en_sesion"
    ? estado.resumen
    : undefined;
}

/** Línea de estado de la página (R615), con los textos aprobados por Carlos el 2026-11-16. */
export function lineaDeEstado(fila: FilaLectura): string {
  const guia = `Guía ${fila.numGuia ?? fila.leido}`;
  const { estado } = fila;
  switch (estado.tipo) {
    case "recibida":
      return estado.resumen
        ? `${guia} recibida · ${estado.resumen.destinatario}`
        : `${guia} recibida`;
    case "codigo_invalido":
      return `${fila.leido} · Código inválido`;
    case "no_se_pudo":
      return `${guia} · No se pudo recibir: ${estado.motivo}`;
    default:
      return `${guia} · ${textoEstado(estado)}`;
  }
}

/** La lectura más reciente que ya respondió: la que dice la línea de estado (R615). */
export function ultimaRespondida(filas: readonly FilaLectura[]): FilaLectura | undefined {
  return filas.find((f) => f.estado.tipo !== "recibiendo");
}
