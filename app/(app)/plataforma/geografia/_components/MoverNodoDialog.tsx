"use client";

import { useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { RadioGroup, type RadioGroupOption } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import {
  moverNodoAction,
  vistaPreviaMoverNodoAction,
  type MoverNodoActionResult,
  type VistaPreviaMoverNodoActionResult,
} from "@/lib/actions/geografia-plataforma";
import {
  MENSAJE_DE_MOTIVO_DE_MOVER,
  type BloqueoDeMoverDTO,
  type DescendientesDeNivelDTO,
  type MotivoDeNoMover,
  type NodoArbolPlataformaDTO,
  type TipoNivelDTO,
  type VistaPreviaMoverNodoDTO,
} from "@/lib/types/geografia-nodo";
import { normalizeName } from "@/lib/utils/normalize";

// SLT-48 (design §7.3; R34–R37, R40, P1, P4; maqueta T0.2 §1) — mover un nodo a otro padre, en dos pasos
// dentro del MISMO diálogo:
//   1. elegir el padre nuevo entre los nodos de la profundidad del padre actual, de todo el país;
//   2. el antes → después que devuelve la vista previa del servidor, que ya corrió las validaciones de
//      R35 (R36: al abrir, no solo al guardar). Si la vista previa trae un bloqueo (P1), «Sí, mover» queda
//      apagado y el modal dice cuántas órdenes y de qué empresas.
// Un solo diálogo y no `ConfirmarCambio`: el paso 2 a veces no tiene tabla (el rechazo de la maqueta) y
// siempre puede quedar apagado, y «Volver» regresa al paso 1 en vez de cerrar.
//
// R37: al confirmar viaja el padre que mostró el modal; si ya es otro, el servidor responde
// `cambio_concurrente`, el diálogo se cierra sin escribir, el aviso de siempre queda en la pantalla y la
// página se refresca, como en las demás escrituras de esta pantalla (SLT-46 R61).
//
// Ningún nivel se nombra con un literal (R47): el tipo sale de `tipos`. Los tipos no traen género, así que
// los textos evitan el artículo concordado («el lugar», «otro destino»).

/** El nodo que se mueve, tal como lo da la fila del árbol. */
export interface NodoAMover {
  id: string;
  nombre: string;
  profundidad: number;
}

/** Los textos del diálogo, sobreescribibles para i18n. Provisionales: los de la maqueta. */
export interface TextosMoverNodo {
  tituloElegir: (nodo: string) => string;
  descripcionElegir: (tipoPadrePlural: string, pais: string) => string;
  etiquetaDestino: (tipoPadre: string) => string;
  buscar: string;
  sinResultados: string;
  padreActual: string;
  retirado: string;
  cancelar: string;
  verCambio: string;
  tituloVista: (nodo: string, destino: string) => string;
  descripcionVista: string;
  encabezadoDato: string;
  encabezadoAntes: string;
  encabezadoDespues: string;
  filaUbicacion: string;
  descendientes: (total: number, desglose: string) => string;
  ordenesQueCambianDeNombre: (ordenes: number) => string;
  bloqueoTitulo: string;
  bloqueoConteo: (ordenes: number, empresas: number) => string;
  bloqueoEmpresa: (nombre: string, ordenes: number) => string;
  bloqueoCuando: string;
  rechazoTitulo: string;
  motivoRetirado: (destino: string) => string;
  motivoPadreActual: (destino: string, tipoPadre: string) => string;
  motivoNoExiste: string;
  motivoConflicto: (destino: string, nodo: string) => string;
  volver: string;
  confirmar: string;
  exito: (nodo: string, destino: string) => string;
  avisoConcurrente: string;
  avisoOcupado: string;
  errorSesion: string;
  errorPermiso: string;
  errorGenerico: string;
}

export const TEXTOS_MOVER_NODO: TextosMoverNodo = {
  tituloElegir: (nodo) => `Mover «${nodo}»`,
  descripcionElegir: (plural, pais) => `Elige el lugar al que pasa. Solo se ofrecen ${plural} de ${pais}.`,
  etiquetaDestino: (tipoPadre) => (tipoPadre === "" ? "Destino" : `${tipoPadre} de destino`),
  buscar: "Buscar por nombre…",
  sinResultados: "Sin resultados. Prueba con otro nombre.",
  padreActual: "Padre actual",
  retirado: "Retirado",
  cancelar: "Cancelar",
  verCambio: "Ver el cambio",
  tituloVista: (nodo, destino) => `¿Mover «${nodo}» a ${destino}?`,
  descripcionVista:
    "Sus órdenes ya creadas solo cambian el nombre del lugar: conservan su zona y su precio. Las nuevas usan la zona y el precio de la posición nueva.",
  encabezadoDato: "Dato",
  encabezadoAntes: "Antes",
  encabezadoDespues: "Después",
  // Regla 6 del humano (T0): la fila del camino se llama «Ubicación», no «Ruta».
  filaUbicacion: "Ubicación",
  descendientes: (total, desglose) =>
    total === 0 ? "Lugares que cuelgan de él: 0." : `Lugares que cuelgan de él: ${total} (${desglose}).`,
  ordenesQueCambianDeNombre: (ordenes) =>
    `Órdenes que cambian el nombre del lugar que muestran, de todas las empresas: ${ordenes}.`,
  bloqueoTitulo:
    "No se puede mover mientras haya órdenes abiertas a las que les cambiaría el grupo de tarifas o la marca de zona especial.",
  bloqueoConteo: (ordenes, empresas) =>
    `${ordenes} ${ordenes === 1 ? "orden abierta" : "órdenes abiertas"}, de ${empresas} ${empresas === 1 ? "empresa" : "empresas"}:`,
  bloqueoEmpresa: (nombre, ordenes) => `${nombre}: ${ordenes}`,
  bloqueoCuando: "Se podrá mover cuando esas órdenes entren en un cierre.",
  rechazoTitulo: "No se puede mover aquí.",
  motivoRetirado: (destino) => `${destino} está retirado. Reactívalo o elige otro destino.`,
  motivoPadreActual: (destino, tipoPadre) =>
    tipoPadre === "" ? `«${destino}» ya es su padre.` : `«${destino}» ya es su ${tipoPadre}.`,
  motivoNoExiste: "El lugar de destino ya no existe.",
  motivoConflicto: (destino, nodo) => `«${destino}» ya tiene un lugar llamado «${nodo}».`,
  volver: "Volver",
  confirmar: "Sí, mover",
  exito: (nodo, destino) => `Se movió «${nodo}» a ${destino}.`,
  avisoConcurrente: "Este dato cambió mientras tanto; revisa el valor actual.",
  // Review vuelta 2: `mover` cede ante las órdenes que se están guardando en ese lugar.
  avisoOcupado: "Se están guardando órdenes en ese lugar. Intenta de nuevo en unos segundos.",
  errorSesion: "Tu sesión expiró.",
  errorPermiso: "No tienes permiso para esta acción.",
  errorGenerico: "No se pudo completar la acción.",
};

/** Un padre posible: un nodo de la profundidad del padre actual, con su cadena y su disponibilidad. */
export interface DestinoPosible {
  id: string;
  nombre: string;
  /** Los nombres de sus ascendientes, de la raíz a su padre. */
  ascendientes: string[];
  /** Ni él ni ningún ascendiente retirado (P4: la vista previa lo rechaza). */
  disponible: boolean;
}

/**
 * Los destinos de `nodo`: todos los nodos del país en la profundidad de su padre, en el orden del árbol,
 * y el id del padre actual. Puro, para probarlo sin pintar.
 */
export function destinosDe(
  raices: readonly NodoArbolPlataformaDTO[],
  nodo: Pick<NodoAMover, "id" | "profundidad">,
): { destinos: DestinoPosible[]; padreActualId: string | null } {
  const profundidadDelPadre = nodo.profundidad - 1;
  const destinos: DestinoPosible[] = [];
  let padreActualId: string | null = null;
  const recorrer = (nodos: readonly NodoArbolPlataformaDTO[], ascendientes: string[], disponible: boolean) => {
    for (const n of nodos) {
      const activo = disponible && n.activo;
      if (n.profundidad === profundidadDelPadre) {
        destinos.push({ id: n.id, nombre: n.nombre, ascendientes, disponible: activo });
        if (n.hijos.some((h) => h.id === nodo.id)) padreActualId = n.id;
        continue;
      }
      if (n.profundidad < profundidadDelPadre) recorrer(n.hijos, [...ascendientes, n.nombre], activo);
    }
  };
  if (profundidadDelPadre >= 1) recorrer(raices, [], true);
  return { destinos, padreActualId };
}

/** Regla 1 del humano (T0): «6 manzanas y 32 lotes», de arriba abajo, con el tipo del país. */
export function desgloseDeDescendientes(porNivel: readonly DescendientesDeNivelDTO[]): string {
  const partes = porNivel
    .filter((d) => d.cantidad > 0)
    .map((d) => `${d.cantidad} ${(d.cantidad === 1 ? d.tipoSingular : d.tipoPlural).toLocaleLowerCase("es")}`);
  return new Intl.ListFormat("es", { style: "long", type: "conjunction" }).format(partes);
}

/** El motivo de R35 detrás de un mensaje del servidor; `null` si no es uno de ellos. */
function motivoDeMensaje(mensaje: string | undefined): MotivoDeNoMover | null {
  if (mensaje === undefined) return null;
  const par = Object.entries(MENSAJE_DE_MOTIVO_DE_MOVER).find(([, m]) => m === mensaje);
  return par === undefined ? null : (par[0] as MotivoDeNoMover);
}

type Paso =
  | { paso: "elegir" }
  | { paso: "vista"; destino: DestinoPosible; vista: VistaPreviaMoverNodoDTO }
  | { paso: "rechazo"; destino: DestinoPosible; motivo: string };

type Rechazable = { status: string; fieldErrors?: Record<string, string[]>; motivo?: string };

export interface MoverNodoDialogProps {
  /** El nodo que se mueve; `null` con el diálogo cerrado. */
  nodo: NodoAMover | null;
  /** Se cierra el diálogo (cancelar, Escape, éxito o cambio concurrente). */
  onCerrar: () => void;
  paisNombre: string;
  /** Los tipos de nivel del país, uno por profundidad. */
  tipos: readonly TipoNivelDTO[];
  /** El árbol del país: de aquí salen los destinos. */
  raices: readonly NodoArbolPlataformaDTO[];
  textos?: Partial<TextosMoverNodo>;
}

export function MoverNodoDialog({
  nodo,
  onCerrar,
  paisNombre,
  tipos,
  raices,
  textos: textosPropios,
}: Readonly<MoverNodoDialogProps>) {
  const t = { ...TEXTOS_MOVER_NODO, ...textosPropios };
  const router = useRouter();
  const toast = useToast();
  const etiquetaId = useId();

  const [paso, setPaso] = useState<Paso>({ paso: "elegir" });
  const [seleccion, setSeleccion] = useState("");
  const [busqueda, setBusqueda] = useState("");
  const [concurrente, setConcurrente] = useState(false);
  // «Volver» del paso 2 regresa al paso 1; el Modal lo cuenta como cierre, así que se marca antes.
  const volviendo = useRef(false);

  // Abrir con otro nodo empieza de cero y olvida el aviso concurrente (ajuste de estado por prop).
  const [nodoPrevio, setNodoPrevio] = useState<string | null>(nodo?.id ?? null);
  const idActual = nodo?.id ?? null;
  if (idActual !== nodoPrevio) {
    setNodoPrevio(idActual);
    if (idActual !== null) {
      setPaso({ paso: "elegir" });
      setSeleccion("");
      setBusqueda("");
      setConcurrente(false);
    }
  }

  const tipoPadre = nodo === null ? undefined : tipos.find((x) => x.profundidad === nodo.profundidad - 1);
  const tipoPadreSingular = tipoPadre?.nombreSingular ?? "";
  const tipoPadrePlural = tipoPadre?.nombrePlural ?? "";

  const { destinos, padreActualId } = useMemo(
    () => (nodo === null ? { destinos: [], padreActualId: null } : destinosDe(raices, nodo)),
    [raices, nodo],
  );

  const visibles = useMemo(() => {
    const q = normalizeName(busqueda);
    return q === "" ? destinos : destinos.filter((d) => normalizeName(d.nombre).includes(q));
  }, [destinos, busqueda]);

  const opciones: RadioGroupOption[] = visibles.map((d) => ({
    value: d.id,
    label: d.nombre,
    detalle: (
      <span className="inline-flex flex-wrap items-center justify-end gap-1.5">
        {d.ascendientes.length > 0 ? <span>{`· ${d.ascendientes.join(" › ")}`}</span> : null}
        {d.id === padreActualId ? <Badge variant="secondary">{t.padreActual}</Badge> : null}
        {d.disponible ? null : <Badge variant="secondary">{t.retirado}</Badge>}
      </span>
    ),
  }));

  function cerrar() {
    setPaso({ paso: "elegir" });
    onCerrar();
  }

  function errorDeSesion(status: string): string {
    if (status === "unauthenticated") return t.errorSesion;
    if (status === "forbidden") return t.errorPermiso;
    return t.errorGenerico;
  }

  /** Un rechazo de R35 (o `conflict` o `not_found`) se pinta en el paso 2; lo demás, aviso y cierre. */
  function motivoDeRechazo(res: Rechazable, destino: DestinoPosible): string | null {
    if (nodo === null) return null;
    if (res.status === "not_found") return t.motivoNoExiste;
    if (res.status === "conflict") return t.motivoConflicto(destino.nombre, nodo.nombre);
    if (res.status !== "validation_error") return null;
    const mensaje = res.fieldErrors?.padreIdNuevo?.[0] ?? res.fieldErrors?.id?.[0];
    switch (motivoDeMensaje(mensaje)) {
      case "destino_retirado":
        return t.motivoRetirado(destino.nombre);
      case "destino_es_el_padre_actual":
        return t.motivoPadreActual(destino.nombre, tipoPadreSingular.toLocaleLowerCase("es"));
      case "destino_no_existe":
        return t.motivoNoExiste;
      default:
        return mensaje ?? t.errorGenerico;
    }
  }

  /** Paso 1 → 2: la vista previa corre las validaciones de R35 (R36). */
  async function pedirVista() {
    if (nodo === null) return;
    const destino = destinos.find((d) => d.id === seleccion);
    if (destino === undefined) return;
    let res: VistaPreviaMoverNodoActionResult;
    try {
      res = await vistaPreviaMoverNodoAction({ id: nodo.id, padreIdNuevo: destino.id });
    } catch {
      res = { status: "error" };
    }
    if (res.status === "ok") {
      setPaso({ paso: "vista", destino, vista: res.vista });
      return;
    }
    const motivo = motivoDeRechazo(res, destino);
    if (motivo !== null) {
      setPaso({ paso: "rechazo", destino, motivo });
      return;
    }
    toast.error(errorDeSesion(res.status));
    cerrar();
  }

  /** Paso 2: mover, con el padre que mostró el modal (R37). */
  async function confirmar() {
    if (nodo === null || paso.paso !== "vista") return;
    const { destino, vista } = paso;
    let res: MoverNodoActionResult;
    try {
      res = await moverNodoAction({ id: nodo.id, padreIdNuevo: destino.id, padreIdAnterior: vista.padreIdAnterior });
    } catch {
      res = { status: "error" };
    }
    if (res.status === "ok") {
      toast.success(t.exito(nodo.nombre, destino.nombre));
      cerrar();
      router.refresh();
      return;
    }
    if (res.status === "conflict" && "motivo" in res && res.motivo === "cambio_concurrente") {
      setConcurrente(true);
      cerrar();
      router.refresh();
      return;
    }
    // Review vuelta 2: `mover` cedió ante escrituras de una empresa y no escribió nada. El modal sigue
    // en el paso 2 para que «Sí, mover» se pueda pulsar otra vez.
    if (res.status === "conflict" && "motivo" in res && res.motivo === "ocupado") {
      toast.error(t.avisoOcupado);
      return;
    }
    // P1 en carrera: el bloqueo apareció entre la vista previa y el «Sí»; el modal lo enseña y se apaga.
    if (res.status === "validation_error" && "bloqueo" in res && res.bloqueo !== undefined) {
      setPaso({ paso: "vista", destino, vista: { ...vista, bloqueo: res.bloqueo } });
      return;
    }
    const motivo = motivoDeRechazo(res, destino);
    if (motivo !== null) {
      setPaso({ paso: "rechazo", destino, motivo });
      return;
    }
    toast.error(errorDeSesion(res.status));
    cerrar();
  }

  function alCambiarApertura(abierta: boolean) {
    if (abierta) return;
    if (volviendo.current) {
      volviendo.current = false;
      setPaso({ paso: "elegir" });
      return;
    }
    cerrar();
  }

  const enPaso1 = paso.paso === "elegir";
  const titulo =
    nodo === null ? "" : enPaso1 ? t.tituloElegir(nodo.nombre) : t.tituloVista(nodo.nombre, paso.destino.nombre);
  const descripcion = enPaso1
    ? t.descripcionElegir(tipoPadrePlural.toLocaleLowerCase("es"), paisNombre)
    : paso.paso === "vista" && paso.vista.bloqueo === null
      ? t.descripcionVista
      : undefined;
  const etiquetaDestino = t.etiquetaDestino(tipoPadreSingular);

  let cuerpo: ReactNode;
  if (paso.paso === "elegir") {
    cuerpo = (
      <div className="flex flex-col gap-3">
        <p id={etiquetaId} className="text-sm font-medium">
          {etiquetaDestino}
        </p>
        <Input
          type="search"
          value={busqueda}
          placeholder={t.buscar}
          aria-label={t.buscar}
          onChange={(e) => setBusqueda(e.target.value)}
        />
        {opciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.sinResultados}</p>
        ) : (
          <div className="max-h-72 overflow-y-auto pr-1">
            <RadioGroup aria-label={etiquetaDestino} value={seleccion} onValueChange={setSeleccion} options={opciones} />
          </div>
        )}
      </div>
    );
  } else if (paso.paso === "vista") {
    cuerpo = (
      <VistaAntesDespues
        vista={paso.vista}
        tipoPadre={tipoPadreSingular}
        textos={t}
      />
    );
  } else {
    cuerpo = (
      <Alert variant="destructive">
        <AlertTitle>{t.rechazoTitulo}</AlertTitle>
        <AlertDescription>{paso.motivo}</AlertDescription>
      </Alert>
    );
  }

  const confirmDisabled = enPaso1
    ? seleccion === "" || seleccion === padreActualId
    : paso.paso === "rechazo" || paso.vista.bloqueo !== null;

  return (
    <>
      {concurrente ? (
        <Alert>
          <AlertDescription>{t.avisoConcurrente}</AlertDescription>
        </Alert>
      ) : null}
      <Modal
        open={nodo !== null}
        onOpenChange={alCambiarApertura}
        title={titulo}
        description={descripcion}
        confirmLabel={enPaso1 ? t.verCambio : t.confirmar}
        cancelLabel={enPaso1 ? t.cancelar : t.volver}
        onCancel={() => {
          if (!enPaso1) volviendo.current = true;
        }}
        confirmDisabled={confirmDisabled}
        closeOnConfirm={false}
        onConfirm={enPaso1 ? pedirVista : confirmar}
        size="lg"
        // Objetivo táctil de 44px para los botones del pie, como `ConfirmarCambio`.
        className="[&_[data-slot=button]]:min-h-11"
      >
        {cuerpo}
      </Modal>
    </>
  );
}

/** El antes → después (R36) y, si lo hay, el bloqueo de P1 (R40). */
function VistaAntesDespues({
  vista,
  tipoPadre,
  textos: t,
}: Readonly<{ vista: VistaPreviaMoverNodoDTO; tipoPadre: string; textos: TextosMoverNodo }>) {
  const padreAntes = vista.rutaActual.at(-2)?.nombre ?? "";
  const padreDespues = vista.rutaNueva.at(-2)?.nombre ?? "";
  const filas: { etiqueta: string; antes: string; despues: string }[] = [
    {
      etiqueta: t.filaUbicacion,
      antes: vista.rutaActual.map((p) => p.nombre).join(" › "),
      despues: vista.rutaNueva.map((p) => p.nombre).join(" › "),
    },
  ];
  if (tipoPadre !== "") filas.push({ etiqueta: tipoPadre, antes: padreAntes, despues: padreDespues });

  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead scope="col">{t.encabezadoDato}</TableHead>
            <TableHead scope="col">{t.encabezadoAntes}</TableHead>
            <TableHead scope="col">{t.encabezadoDespues}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((f) => (
            <TableRow key={f.etiqueta}>
              <TableHead scope="row" className="text-muted-foreground">
                {f.etiqueta}
              </TableHead>
              {/* Una ruta de 10 niveles se parte en varias líneas: la tabla no se desliza (maqueta). */}
              <TableCell className="whitespace-normal">{f.antes}</TableCell>
              <TableCell className="font-medium whitespace-normal">{f.despues}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <ul className="list-disc pl-5 text-sm">
        <li>{t.descendientes(vista.descendientes.total, desgloseDeDescendientes(vista.descendientes.porNivel))}</li>
        <li>{t.ordenesQueCambianDeNombre(vista.ordenesQueCambianDeNombre)}</li>
      </ul>
      {vista.bloqueo === null ? null : <AvisoDeBloqueo bloqueo={vista.bloqueo} textos={t} />}
    </div>
  );
}

/** P1: cuántas órdenes abiertas impiden mover y de qué empresas. */
function AvisoDeBloqueo({ bloqueo, textos: t }: Readonly<{ bloqueo: BloqueoDeMoverDTO; textos: TextosMoverNodo }>) {
  return (
    <Alert variant="destructive">
      <AlertTitle className="whitespace-normal">{t.bloqueoTitulo}</AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        <span>{t.bloqueoConteo(bloqueo.ordenes, bloqueo.empresas.length)}</span>
        <ul className="list-disc pl-5">
          {bloqueo.empresas.map((e) => (
            <li key={e.id}>{t.bloqueoEmpresa(e.nombre, e.ordenes)}</li>
          ))}
        </ul>
        <span>{t.bloqueoCuando}</span>
      </AlertDescription>
    </Alert>
  );
}
