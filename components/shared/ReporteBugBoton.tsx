"use client";

import { useEffect, useId, useReducer, useRef, useState, type ChangeEvent } from "react";
import { usePathname } from "next/navigation";
import { Bug, ImageOff, ImagePlus, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useBorradorReporteBug } from "@/hooks/useBorradorReporteBug";
import { enviarReporteBugAction, prepararSubidaImagenesReporteAction } from "@/lib/actions/reporte-bug";
import {
  DESCRIPCION_MAX,
  IMAGEN_BYTES_MAX,
  IMAGENES_MAX,
  TIPOS_IMAGEN,
  type TipoImagenReporte,
} from "@/lib/config/reporte-bug";
import { VENTANA_LADO_MAX, type EnviarReporteBugInput } from "@/lib/types/reporte-bug";
import { cn } from "@/lib/utils";

// SLT-87 (design §8.2; R1–R5, R9, R10) — el botón flotante «Reportar un problema» y su panel de un solo
// envío. Lo monta `app/(app)/layout.tsx` como hermano de la página, solo para usuarios de empresa (R2).
//
// SLT-98 (design §4.2, §9.1; R1–R8, R11) — las imágenes del reporte. Al elegirlas solo se muestran con una
// miniatura local (object URL) y se validan en el cliente; NO se suben (P1). Al pulsar «Enviar»: permisos
// en una llamada → un PUT directo por imagen → el reporte, solo si todas subieron. Las imágenes no van al
// borrador (R8): viven en el estado del componente mientras el layout siga montado.
//
// Los textos son constantes de este archivo porque el test los compara literalmente (design §8.4, §9.3).

export const TEXTOS_REPORTE_BUG = {
  titulo: "Reportar un problema",
  etiquetaDescripcion: "Describe el problema",
  cerrar: "Cerrar",
  enviar: "Enviar",
  descartar: "Descartar",
  gracias: "Gracias, recibimos tu reporte",
  fallo: "No pudimos enviar tu reporte. Inténtalo de nuevo.",
  // SLT-98 (design §9.3)
  imagenesRotulo: `Imágenes (opcional, máximo ${IMAGENES_MAX})`,
  agregarImagenes: "Agregar imágenes",
  // (propuesta) rótulo accesible del `input` de archivos, oculto: lo usa el E2E con `setInputFiles`.
  inputImagenes: "Elegir imágenes del reporte",
  ayudaImagenes: "PNG, JPG o WebP · hasta 5 MB cada una",
  quitar: "Quitar",
  reintentar: "Reintentar",
  subiendoImagenes: "Subiendo imágenes…",
  subiendo: "Subiendo…",
  errorTipo: "Solo PNG, JPG o WebP.",
  errorVacia: "El archivo está vacío.",
  errorTamano: "Pesa más de 5 MB.",
  errorSubida: "No se pudo subir.",
  noAceptada: "No pudimos aceptar esta imagen. Quítala para enviar.",
  bloqueo: "Quita o reintenta las imágenes marcadas para poder enviar.",
} as const;

/** R4: «{n}/500», sin espacios. */
export function textoContador(n: number): string {
  return `${n}/${DESCRIPCION_MAX}`;
}

/** SLT-98 R1: «{n}/5 imágenes». */
export function textoContadorImagenes(n: number): string {
  return `${n}/${IMAGENES_MAX} imágenes`;
}

/** SLT-98 R3: el aviso de las que no cupieron. */
export function textoSobrantes(m: number): string {
  return `Solo caben ${IMAGENES_MAX} imágenes: ${m} no se agregaron.`;
}

const textoQuitar = (n: number) => `Quitar imagen ${n}`;
const textoReintentar = (n: number) => `Reintentar imagen ${n}`;
const textoAltImagen = (n: number) => `Imagen ${n}`;

type Estado = "editando" | "enviando" | "gracias" | "error";

// ── Imágenes del panel (design §9.1) ──────────────────────────────────────────────────────────────

type EstadoImagen =
  | "pendiente"
  | "subiendo"
  | "subida"
  | "error_tipo"
  | "error_vacia"
  | "error_tamano"
  | "error_subida"
  // El estado de design §9.1 para «el servidor no la aceptó», con otro nombre: el de §9.1 es un código
  // antiguo de `order_status` y la guardia `censo-order-status-rename` lo veta en todo el árbol.
  | "no_aceptada";

interface ImagenPanel {
  clave: string;
  archivo: File;
  /** Object URL local; `null` si el tipo no es de imagen admitida y no hay nada que pintar. */
  vistaPrevia: string | null;
  estado: EstadoImagen;
  imagenId?: string;
  tipo: TipoImagenReporte | null;
}

const ESTADOS_CON_ERROR: ReadonlySet<EstadoImagen> = new Set([
  "error_tipo",
  "error_vacia",
  "error_tamano",
  "error_subida",
  "no_aceptada",
]);

const MOTIVO_POR_ESTADO: Partial<Record<EstadoImagen, string>> = {
  error_tipo: TEXTOS_REPORTE_BUG.errorTipo,
  error_vacia: TEXTOS_REPORTE_BUG.errorVacia,
  error_tamano: TEXTOS_REPORTE_BUG.errorTamano,
  error_subida: TEXTOS_REPORTE_BUG.errorSubida,
  no_aceptada: TEXTOS_REPORTE_BUG.noAceptada,
};

type AccionImagenes =
  | { accion: "agregar"; nuevas: ImagenPanel[] }
  | { accion: "quitar"; clave: string }
  | { accion: "vaciar" }
  | { accion: "estado"; claves: string[]; estado: EstadoImagen }
  | { accion: "subida"; clave: string; imagenId: string }
  | { accion: "rechazar"; imagenIds: string[] };

function reducirImagenes(lista: ImagenPanel[], a: AccionImagenes): ImagenPanel[] {
  switch (a.accion) {
    case "agregar":
      return [...lista, ...a.nuevas];
    case "quitar":
      return lista.filter((i) => i.clave !== a.clave);
    case "vaciar":
      return [];
    case "estado":
      return lista.map((i) => (a.claves.includes(i.clave) ? { ...i, estado: a.estado } : i));
    case "subida":
      return lista.map((i) => (i.clave === a.clave ? { ...i, estado: "subida", imagenId: a.imagenId } : i));
    case "rechazar":
      return lista.map((i) =>
        i.imagenId !== undefined && a.imagenIds.includes(i.imagenId) ? { ...i, estado: "no_aceptada" } : i,
      );
  }
}

function esTipoAdmitido(tipo: string): tipo is TipoImagenReporte {
  return (TIPOS_IMAGEN as readonly string[]).includes(tipo);
}

/** R5: la validación de cortesía en el cliente. La de verdad la hace el servidor al enviar (R10). */
function clasificar(archivo: File): ImagenPanel {
  const tipo = esTipoAdmitido(archivo.type) ? archivo.type : null;
  let estado: EstadoImagen = "pendiente";
  if (tipo === null) estado = "error_tipo";
  else if (archivo.size === 0) estado = "error_vacia";
  else if (archivo.size > IMAGEN_BYTES_MAX) estado = "error_tamano";
  return {
    clave: crypto.randomUUID(),
    archivo,
    vistaPrevia: tipo === null ? null : URL.createObjectURL(archivo),
    estado,
    tipo,
  };
}

function revocar(imagenes: readonly ImagenPanel[]) {
  for (const i of imagenes) if (i.vistaPrevia !== null) URL.revokeObjectURL(i.vistaPrevia);
}

/** Paso 2 de §4.2: lo bueno es un 2xx; la respuesta no se lee. */
async function subirImagen(url: string, archivo: File, tipo: TipoImagenReporte): Promise<boolean> {
  try {
    const r = await fetch(url, {
      method: "PUT",
      body: archivo,
      headers: { "content-type": tipo, "x-upsert": "false" },
    });
    return r.ok;
  } catch {
    // Fallo manejado: una caída de red deja la imagen en `error_subida` y el panel ofrece reintentar (R7).
    return false;
  }
}

// ── Contexto del navegador (SLT-87) ───────────────────────────────────────────────────────────────

/** R3: en `/mis-asignaciones` y sus subrutas el chat ocupa la esquina, y este botón va encima. */
function vaSobreElChat(ruta: string | null): boolean {
  return ruta === "/mis-asignaciones" || (ruta?.startsWith("/mis-asignaciones/") ?? false);
}

function ladoValido(lado: number): boolean {
  return Number.isInteger(lado) && lado >= 1 && lado <= VENTANA_LADO_MAX;
}

/**
 * El contexto que solo conoce el navegador (R13). La página es solo la ruta (Q2). Una ventana fuera del
 * rango que acepta el servidor no se manda: perderla es mejor que perder el reporte por validación.
 */
function contextoDelNavegador(): Omit<EnviarReporteBugInput, "descripcion" | "imagenes"> {
  const ancho = window.innerWidth;
  const alto = window.innerHeight;
  const standalone =
    typeof window.matchMedia === "function" && window.matchMedia("(display-mode: standalone)").matches;
  // `navigator.standalone` solo existe en Safari de iOS, donde no hay `display-mode`.
  const standaloneIos = (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
  return {
    pagina: window.location.pathname,
    ...(ladoValido(ancho) && ladoValido(alto) ? { ventana: { ancho, alto } } : {}),
    appInstalada: standalone || standaloneIos,
  };
}

export interface ReporteBugBotonProps {
  /** De la sesión, resuelta en el layout: separa el borrador de cada usuario (R7). */
  usuarioId: string;
}

export function ReporteBugBoton({ usuarioId }: ReporteBugBotonProps) {
  const ruta = usePathname();
  const sobreChat = vaSobreElChat(ruta);
  const { texto, cambiar, limpiar } = useBorradorReporteBug(usuarioId);
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>("editando");
  const [imagenes, despachar] = useReducer(reducirImagenes, []);
  const [subiendo, setSubiendo] = useState(false);
  const [sobrantes, setSobrantes] = useState(0);
  const botonRef = useRef<HTMLButtonElement>(null);
  const inputArchivosRef = useRef<HTMLInputElement>(null);
  const idPanel = useId();
  const idTitulo = useId();
  const idCampo = useId();
  const idContador = useId();
  const idImagenes = useId();
  const idAyudaImagenes = useId();

  const enviando = estado === "enviando";
  const vacia = texto.trim() === "";
  const hayErrorImagen = imagenes.some((i) => ESTADOS_CON_ERROR.has(i.estado));
  // (propuesta) «Reintentar» solo tiene sentido si lo único que bloquea son fallos de subida: con una
  // imagen que solo admite «Quitar» (R5, R11), el envío no podría terminar.
  const hayErrorSinReintento = imagenes.some((i) => ESTADOS_CON_ERROR.has(i.estado) && i.estado !== "error_subida");
  const llenas = imagenes.length >= IMAGENES_MAX;

  // Las vistas previas se revocan al desmontar (design §9.1). El ref sigue la lista sin re-suscribir.
  const imagenesRef = useRef<ImagenPanel[]>(imagenes);
  useEffect(() => {
    imagenesRef.current = imagenes;
  }, [imagenes]);
  useEffect(() => {
    const ref = imagenesRef;
    return () => revocar(ref.current);
  }, []);

  // M3 (review): al cerrar, el panel vuelve al formulario. El aviso de «Gracias» o de fallo es de esa
  // apertura y no reaparece al reabrir; el borrador no se toca. Un envío en curso se deja terminar.
  function cerrar() {
    setAbierto(false);
    setEstado((actual) => (actual === "enviando" ? actual : "editando"));
    botonRef.current?.focus();
  }

  function abrir() {
    // Un envío que terminó con el panel cerrado no deja su aviso para la siguiente apertura.
    setEstado((actual) => (actual === "enviando" ? actual : "editando"));
    setAbierto(true);
  }

  // M4 (review): Escape cierra el panel esté donde esté el foco. El listener vive solo mientras el panel
  // está abierto y respeta un Escape ya consumido por otro (un menú, un diálogo), igual que
  // `MultiSelectFilter`. No lo consume él: el panel no es modal. Si el foco estaba fuera del panel, se
  // queda donde estaba (propuesta): devolverlo al botón se lo robaría a lo que la persona estaba usando.
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!abierto) return;
    function alPulsarTecla(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const activo = document.activeElement;
      const focoDentro = activo === document.body || (activo !== null && !!panelRef.current?.contains(activo));
      setAbierto(false);
      setEstado((actual) => (actual === "enviando" ? actual : "editando"));
      if (focoDentro) botonRef.current?.focus();
    }
    document.addEventListener("keydown", alPulsarTecla);
    return () => document.removeEventListener("keydown", alPulsarTecla);
  }, [abierto]);

  function alEscribir(siguiente: string) {
    cambiar(siguiente);
    if (estado === "gracias") setEstado("editando");
  }

  function vaciarImagenes() {
    revocar(imagenes);
    despachar({ accion: "vaciar" });
    setSobrantes(0);
  }

  function descartar() {
    limpiar();
    vaciarImagenes();
    setEstado("editando");
  }

  /** R2, R3, R5: se añaden las que caben, cada una con su validación. No se llama al servidor (P1). */
  function alElegirArchivos(e: ChangeEvent<HTMLInputElement>) {
    const elegidos = Array.from(e.target.files ?? []);
    // Se vacía para poder volver a elegir el mismo archivo.
    e.target.value = "";
    if (elegidos.length === 0) return;
    const caben = Math.max(0, IMAGENES_MAX - imagenes.length);
    despachar({ accion: "agregar", nuevas: elegidos.slice(0, caben).map(clasificar) });
    setSobrantes(Math.max(0, elegidos.length - caben));
    if (estado === "gracias" || estado === "error") setEstado("editando");
  }

  function quitar(imagen: ImagenPanel) {
    revocar([imagen]);
    despachar({ accion: "quitar", clave: imagen.clave });
    setSobrantes(0);
  }

  /**
   * Pasos 1 y 2 de §4.2 sobre las imágenes que faltan por subir. Devuelve los `imagenId` nuevos por
   * clave, o `null` si alguna no subió (y entonces ya quedó marcada en `error_subida`).
   */
  async function subirPendientes(porSubir: ImagenPanel[]): Promise<Map<string, string> | null> {
    const claves = porSubir.map((i) => i.clave);
    despachar({ accion: "estado", claves, estado: "subiendo" });
    let permisos: { imagenId: string; url: string }[] | null = null;
    try {
      const r = await prepararSubidaImagenesReporteAction({
        imagenes: porSubir.map((i) => ({ tipo: i.tipo as TipoImagenReporte, tamano: i.archivo.size })),
      });
      if (r.status === "listas" && r.permisos.length === porSubir.length) permisos = r.permisos;
    } catch {
      // Fallo manejado: sin permisos no se sube nada y las imágenes quedan para reintentar (§4.2 paso 1).
      permisos = null;
    }
    if (permisos === null) {
      despachar({ accion: "estado", claves, estado: "error_subida" });
      return null;
    }
    const lista = permisos;
    const resultados = await Promise.all(
      porSubir.map((img, k) => subirImagen(lista[k].url, img.archivo, img.tipo as TipoImagenReporte)),
    );
    const ids = new Map<string, string>();
    porSubir.forEach((img, k) => {
      if (resultados[k]) {
        ids.set(img.clave, lista[k].imagenId);
        despachar({ accion: "subida", clave: img.clave, imagenId: lista[k].imagenId });
      } else {
        despachar({ accion: "estado", claves: [img.clave], estado: "error_subida" });
      }
    });
    return resultados.every(Boolean) ? ids : null;
  }

  /** «Enviar» y «Reintentar» (design §4.2, §9.1): los tres pasos, reutilizando las ya subidas. */
  async function enviar() {
    if (vacia || enviando || hayErrorSinReintento) return;
    const lista = imagenes;
    const porSubir = lista.filter((i) => i.estado === "pendiente" || i.estado === "error_subida");
    setEstado("enviando");

    let nuevos = new Map<string, string>();
    if (porSubir.length > 0) {
      setSubiendo(true);
      const subidas = await subirPendientes(porSubir);
      setSubiendo(false);
      if (subidas === null) {
        // R7: el reporte no se manda; el texto y las demás imágenes se quedan.
        setEstado("editando");
        return;
      }
      nuevos = subidas;
    }

    const adjuntas = lista.map((i) => ({ id: i.imagenId ?? nuevos.get(i.clave) ?? "", tipo: i.tipo as TipoImagenReporte }));
    let resultado: Estado = "error";
    try {
      const r = await enviarReporteBugAction({
        descripcion: texto,
        ...contextoDelNavegador(),
        // Sin imágenes, la entrada es la de SLT-87.
        ...(adjuntas.length > 0 ? { imagenes: adjuntas } : {}),
      });
      if (r.status === "enviado") resultado = "gracias";
      else if (r.status === "imagenes_invalidas") {
        // R11: se marcan; el aviso es el de bloqueo (R7), no el de fallo general.
        despachar({ accion: "rechazar", imagenIds: r.imagenes });
        resultado = "editando";
      }
    } catch {
      // Fallo manejado: una caída de red o del servidor se avisa en el panel igual que un rechazo (R10),
      // y el borrador se conserva para reintentar. Las imágenes ya subidas se reutilizan.
      resultado = "error";
    }
    if (resultado === "gracias") {
      limpiar();
      vaciarImagenes();
    }
    setEstado(resultado);
  }

  return (
    <>
      {abierto && (
        <Card
          id={idPanel}
          role="dialog"
          ref={panelRef}
          aria-labelledby={idTitulo}
          className={cn(
            // (propuesta) con 5 imágenes el panel crece: se limita al alto visible y se desplaza dentro.
            "fixed right-5 z-40 w-[min(22rem,calc(100vw-2.5rem))] gap-3 overflow-y-auto shadow-lg",
            sobreChat ? "bottom-40 max-h-[calc(100dvh-12rem)]" : "bottom-20 max-h-[calc(100dvh-7rem)]",
          )}
        >
          <div className="flex items-center justify-between gap-2 px-(--card-spacing)">
            <h2 id={idTitulo} className="font-heading text-base font-medium">
              {TEXTOS_REPORTE_BUG.titulo}
            </h2>
            <Button variant="ghost" size="icon-sm" aria-label={TEXTOS_REPORTE_BUG.cerrar} onClick={cerrar}>
              <X aria-hidden="true" />
            </Button>
          </div>
          <div className="flex flex-col gap-1.5 px-(--card-spacing)">
            <label htmlFor={idCampo} className="sr-only">
              {TEXTOS_REPORTE_BUG.etiquetaDescripcion}
            </label>
            <Textarea
              id={idCampo}
              autoFocus
              value={texto}
              maxLength={DESCRIPCION_MAX}
              disabled={enviando}
              aria-describedby={idContador}
              onChange={(e) => alEscribir(e.target.value)}
              className="max-h-60 min-h-28"
            />
            <p id={idContador} aria-live="polite" className="self-end text-xs text-muted-foreground tabular-nums">
              {textoContador(texto.length)}
            </p>
          </div>

          <section aria-labelledby={idImagenes} className="flex flex-col gap-2 px-(--card-spacing)">
            <h3 id={idImagenes} className="text-sm font-medium">
              {TEXTOS_REPORTE_BUG.imagenesRotulo}
            </h3>
            {imagenes.length > 0 && (
              <ul className="grid grid-cols-3 gap-2">
                {imagenes.map((imagen, k) => (
                  <MiniaturaImagen
                    key={imagen.clave}
                    imagen={imagen}
                    numero={k + 1}
                    deshabilitada={enviando}
                    reintentarDeshabilitado={enviando || vacia || hayErrorSinReintento}
                    alQuitar={() => quitar(imagen)}
                    alReintentar={() => void enviar()}
                  />
                ))}
              </ul>
            )}
            <div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={llenas || enviando}
                aria-describedby={idAyudaImagenes}
                onClick={() => inputArchivosRef.current?.click()}
              >
                <ImagePlus aria-hidden="true" />
                {TEXTOS_REPORTE_BUG.agregarImagenes}
              </Button>
            </div>
            <input
              ref={inputArchivosRef}
              type="file"
              accept={TIPOS_IMAGEN.join(",")}
              multiple
              hidden
              aria-label={TEXTOS_REPORTE_BUG.inputImagenes}
              aria-describedby={idAyudaImagenes}
              disabled={llenas || enviando}
              onChange={alElegirArchivos}
            />
            <p id={idAyudaImagenes} className="text-xs text-muted-foreground">
              <span aria-live="polite" className="tabular-nums">
                {textoContadorImagenes(imagenes.length)}
              </span>
              {` · ${TEXTOS_REPORTE_BUG.ayudaImagenes}`}
            </p>
            {sobrantes > 0 && (
              <p role="status" className="text-sm text-warning-strong">
                {textoSobrantes(sobrantes)}
              </p>
            )}
            {hayErrorImagen && !enviando && (
              <p role="alert" className="text-sm text-danger-strong">
                {TEXTOS_REPORTE_BUG.bloqueo}
              </p>
            )}
          </section>

          {(estado === "gracias" || estado === "error") && (
            <div className="px-(--card-spacing)">
              {estado === "gracias" && (
                <p role="status" className="text-sm text-success-strong">
                  {TEXTOS_REPORTE_BUG.gracias}
                </p>
              )}
              {estado === "error" && (
                <p role="alert" className="text-sm text-danger-strong">
                  {TEXTOS_REPORTE_BUG.fallo}
                </p>
              )}
            </div>
          )}
          <div className="flex justify-end gap-2 px-(--card-spacing)">
            <Button variant="outline" disabled={enviando} onClick={descartar}>
              {TEXTOS_REPORTE_BUG.descartar}
            </Button>
            <Button disabled={vacia || hayErrorImagen} loading={enviando} onClick={() => void enviar()}>
              {subiendo ? TEXTOS_REPORTE_BUG.subiendoImagenes : TEXTOS_REPORTE_BUG.enviar}
            </Button>
          </div>
        </Card>
      )}
      <button
        ref={botonRef}
        type="button"
        aria-label={TEXTOS_REPORTE_BUG.titulo}
        aria-expanded={abierto}
        aria-controls={abierto ? idPanel : undefined}
        data-posicion={sobreChat ? "sobre-chat" : "esquina"}
        onClick={() => (abierto ? cerrar() : abrir())}
        className={cn(
          "fixed right-5 z-40 flex size-12 items-center justify-center rounded-full border bg-card text-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 active:scale-95",
          sobreChat ? "bottom-24" : "bottom-5",
        )}
      >
        <Bug className="size-5" aria-hidden="true" />
      </button>
    </>
  );
}

interface MiniaturaImagenProps {
  imagen: ImagenPanel;
  numero: number;
  deshabilitada: boolean;
  reintentarDeshabilitado: boolean;
  alQuitar: () => void;
  alReintentar: () => void;
}

/** Una imagen del panel: miniatura, su estado en texto y sus acciones (design §9.1). */
function MiniaturaImagen({
  imagen,
  numero,
  deshabilitada,
  reintentarDeshabilitado,
  alQuitar,
  alReintentar,
}: MiniaturaImagenProps) {
  const motivo = MOTIVO_POR_ESTADO[imagen.estado];
  const conError = motivo !== undefined;
  return (
    <li className="flex min-w-0 flex-col gap-1">
      {imagen.vistaPrevia !== null ? (
        // Vista previa local de un object URL: next/image no aplica a un blob del cliente.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imagen.vistaPrevia}
          alt={textoAltImagen(numero)}
          className={cn(
            "aspect-square w-full rounded-md border object-cover",
            conError ? "border-danger" : "border-border",
          )}
        />
      ) : (
        <div
          role="img"
          aria-label={textoAltImagen(numero)}
          className="flex aspect-square w-full items-center justify-center rounded-md border border-danger bg-muted text-muted-foreground"
        >
          <ImageOff className="size-5" aria-hidden="true" />
        </div>
      )}
      {imagen.estado === "subiendo" && <p className="text-xs text-muted-foreground">{TEXTOS_REPORTE_BUG.subiendo}</p>}
      {conError && <p className="text-xs text-danger-strong">{motivo}</p>}
      <div className="flex flex-wrap gap-1">
        {imagen.estado === "error_subida" && (
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label={textoReintentar(numero)}
            disabled={reintentarDeshabilitado}
            onClick={alReintentar}
          >
            {TEXTOS_REPORTE_BUG.reintentar}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={textoQuitar(numero)}
          disabled={deshabilitada}
          onClick={alQuitar}
        >
          {TEXTOS_REPORTE_BUG.quitar}
        </Button>
      </div>
    </li>
  );
}
