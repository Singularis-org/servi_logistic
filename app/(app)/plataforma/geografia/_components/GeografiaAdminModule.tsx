"use client";

import { useMemo, useRef, useState } from "react";
import { ChevronRight, Plus } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/useToast";
import {
  arbolDePaisAction,
  cambiarActivacionNodoAction,
  contarOrdenesSinEntregarAction,
  crearNodoAction,
  renombrarNodoAction,
} from "@/lib/actions/geografia-plataforma";
import {
  GEO_NOMBRE_MAX,
  normalizarNombreGeografico,
  type NivelGeografico,
  type ProvinciaPlataformaDTO,
} from "@/lib/types/geografia-nodo";
import type { EtiquetasGeograficas } from "@/lib/types/pais";
import {
  filtrarArbolGeografico,
  type FiltroEstadoGeografico,
} from "@/app/(app)/configuracion/_shared/filtrar-arbol-geografico";
import {
  estadoGeografico,
  type EstadoGeografico,
} from "@/app/(app)/configuracion/_shared/geografia-estado-label";

// FICHA 374/375 → SL-20 (design §8) — EL ÁRBOL EDITABLE DE LA GEOGRAFÍA DE UN PAÍS, del superadmin.
//
// Movido desde `/configuracion/geografia` y adaptado:
//   - trabaja UN país (`paisId`) y nombra los niveles con SUS nombres (`etiquetas`, R20): ningún
//     texto da por hecho Costa Rica;
//   - el alta lleva un código opcional (R29);
//   - SIN zonas: son de cada empresa, y en plataforma esa lectura mezclaría las de todas. Sale la
//     marca «sin zona» y el aviso de zonas que se quedarían sin distritos;
//   - el retiro pide el conteo de órdenes sin entregar de TODAS las empresas (R31): si falla, lo dice
//     y deja retirar igual.
//
// QUITAR NO ES BORRAR: retirar un nodo apaga SU flag, sin tocar a sus descendientes, y reactivarlo
// devuelve el árbol como estaba (R30). Renombrar no toca el código, que es la identidad del nodo.

type FieldErrors = Record<string, string[]>;

/** El formulario de alta, con su padre YA fijado por la fila desde la que se abrió. */
interface AltaEnCurso {
  nivel: NivelGeografico;
  /** `null` solo en el primer nivel, que cuelga del país. */
  padreId: string | null;
  padreNombre: string | null;
}

/** El nodo que se renombra o cuya retirada se confirma. */
interface NodoObjetivo {
  nivel: NivelGeografico;
  id: string;
  nombre: string;
}

/** El conteo de órdenes sin entregar de la confirmación (R31). */
type EstadoConteo = { estado: "cargando" } | { estado: "ok"; ordenes: number } | { estado: "error" };

const OPCIONES_ESTADO: readonly { valor: FiltroEstadoGeografico; etiqueta: string }[] = [
  { valor: "todos", etiqueta: "Todos" },
  { valor: "activos", etiqueta: "Activos" },
  { valor: "retirados", etiqueta: "Inactivos" },
];

const HIJO: Record<NivelGeografico, NivelGeografico | null> = {
  provincia: "canton",
  canton: "distrito",
  distrito: null,
};

export interface GeografiaAdminModuleProps {
  paisId: string;
  paisNombre: string;
  /** Los nombres de nivel DEL PAÍS (R20). */
  etiquetas: EtiquetasGeograficas;
  initialProvincias: ProvinciaPlataformaDTO[];
  /** La primera lectura del árbol falló: `initialProvincias` viene vacío por el fallo, no por el país. */
  cargaErrorInicial?: boolean;
}

/** Minúscula para el interior de una frase: «Añadir departamento». */
function enFrase(texto: string): string {
  return texto.toLocaleLowerCase("es");
}

export function GeografiaAdminModule({
  paisId,
  paisNombre,
  etiquetas,
  initialProvincias,
  cargaErrorInicial = false,
}: Readonly<GeografiaAdminModuleProps>) {
  const toast = useToast();
  const singular = (nivel: NivelGeografico) => etiquetas[nivel].singular;

  const [provincias, setProvincias] = useState<ProvinciaPlataformaDTO[]>(initialProvincias);
  const [cargaError, setCargaError] = useState(cargaErrorInicial);
  // El formulario de alta o de renombrado se abre lejos de la fila (arriba de la sección): el foco
  // salta a él y, al cerrarlo, vuelve al botón que lo abrió. Sin esto, con teclado o lector de
  // pantalla, el formulario aparecía sin aviso y al cerrarlo el foco caía al `body`.
  const origenDelFoco = useRef<HTMLElement | null>(null);

  const [texto, setTexto] = useState("");
  const [estado, setEstado] = useState<FiltroEstadoGeografico>("todos");
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());

  const [alta, setAlta] = useState<AltaEnCurso | null>(null);
  const [nombre, setNombre] = useState("");
  const [codigo, setCodigo] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [guardando, setGuardando] = useState(false);

  const [renombrado, setRenombrado] = useState<NodoObjetivo | null>(null);
  const [nombreNuevo, setNombreNuevo] = useState("");
  const [erroresRenombrado, setErroresRenombrado] = useState<FieldErrors>({});
  const [renombrando, setRenombrando] = useState(false);

  const [alternando, setAlternando] = useState<string | null>(null);
  const [objetivo, setObjetivo] = useState<NodoObjetivo | null>(null);
  const [conteo, setConteo] = useState<EstadoConteo>({ estado: "cargando" });
  const peticionDeConteo = useRef(0);

  /** Toda operación termina releyendo el árbol: el árbol es la única verdad. */
  async function refetch() {
    try {
      const res = await arbolDePaisAction({ paisId });
      if (res.status === "ok") {
        setProvincias(res.provincias);
        setCargaError(false);
      } else {
        setCargaError(true);
      }
    } catch {
      setCargaError(true);
    }
  }

  const filtradas = useMemo(
    () => filtrarArbolGeografico(provincias, { texto, estado }),
    [provincias, texto, estado],
  );

  // Con un filtro puesto el árbol ya viene recortado: se abre entero.
  const filtrando = texto.trim() !== "" || estado !== "todos";
  const abierto = (id: string) => filtrando || expandidos.has(id);

  function alternarExpansion(id: string) {
    setExpandidos((previos) => {
      const siguiente = new Set(previos);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });
  }

  /**
   * R31 — abre la confirmación Y pide el conteo en el mismo gesto. El testigo descarta la respuesta
   * de una confirmación ya cerrada o sustituida.
   */
  function abrirConfirmacion(nodo: NodoObjetivo) {
    setObjetivo(nodo);
    setConteo({ estado: "cargando" });
    peticionDeConteo.current += 1;
    const testigo = peticionDeConteo.current;
    void (async () => {
      try {
        const res = await contarOrdenesSinEntregarAction({ nivel: nodo.nivel, id: nodo.id });
        if (testigo !== peticionDeConteo.current) return;
        // Cualquier desenlace que no sea `ok` es «no se pudo contar», y NO bloquea (R31).
        setConteo(res.status === "ok" ? { estado: "ok", ordenes: res.ordenes } : { estado: "error" });
      } catch {
        if (testigo === peticionDeConteo.current) setConteo({ estado: "error" });
      }
    })();
  }

  function cerrarConfirmacion() {
    peticionDeConteo.current += 1;
    setObjetivo(null);
  }

  function recordarOrigenDelFoco() {
    origenDelFoco.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }

  function devolverFoco() {
    const origen = origenDelFoco.current;
    origenDelFoco.current = null;
    if (origen?.isConnected) origen.focus();
  }

  function cerrarAlta() {
    setAlta(null);
    devolverFoco();
  }

  function cerrarRenombrado() {
    setRenombrado(null);
    devolverFoco();
  }

  function abrirAlta(nivel: NivelGeografico, padre: { id: string; nombre: string } | null) {
    recordarOrigenDelFoco();
    setAlta({ nivel, padreId: padre?.id ?? null, padreNombre: padre?.nombre ?? null });
    setNombre("");
    setCodigo("");
    setErrors({});
    setRenombrado(null);
  }

  function abrirRenombrado(nodo: NodoObjetivo) {
    recordarOrigenDelFoco();
    setRenombrado(nodo);
    setNombreNuevo(nodo.nombre);
    setErroresRenombrado({});
    setAlta(null);
  }

  /** Cada nivel manda EXACTAMENTE las claves de su schema (`.strict()`). */
  function cuerpoDelAlta(enCurso: AltaEnCurso, nombreLimpio: string) {
    const codigoLimpio = codigo.trim() === "" ? {} : { codigo: codigo.trim() };
    if (enCurso.nivel === "provincia") {
      return { nivel: "provincia" as const, nombre: nombreLimpio, paisId, ...codigoLimpio };
    }
    if (enCurso.nivel === "canton") {
      return { nivel: "canton" as const, nombre: nombreLimpio, provinciaId: enCurso.padreId ?? "", ...codigoLimpio };
    }
    return { nivel: "distrito" as const, nombre: nombreLimpio, cantonId: enCurso.padreId ?? "", ...codigoLimpio };
  }

  async function guardarAlta() {
    if (alta === null) return;
    const limpio = normalizarNombreGeografico(nombre);
    if (limpio === "") {
      setErrors({ nombre: ["Este campo es obligatorio."] });
      return;
    }

    setGuardando(true);
    try {
      const res = await crearNodoAction(cuerpoDelAlta(alta, limpio));
      if (res.status === "ok") {
        // Decisión 15: forma neutra. «dado de alta» concordaba con el nodo, y una aldea no es «dado».
        toast.success(`Se dio de alta «${limpio}» (${singular(alta.nivel)}).`);
        cerrarAlta();
        await refetch();
        return;
      }
      if (res.status === "validation_error") {
        setErrors(res.fieldErrors);
        toast.error(mensajeDeValidacion(res.fieldErrors));
        return;
      }
      if (res.status === "conflict") {
        setErrors({ nombre: [mensajeDeDesenlace("conflict")] });
      }
      toast.error(mensajeDeDesenlace(res.status));
      await refetch();
    } catch {
      toast.error(mensajeDeDesenlace("error"));
    } finally {
      setGuardando(false);
    }
  }

  /** Renombrar no pide confirmación: es reversible con otro renombrado (ficha 375). */
  async function guardarRenombrado() {
    if (renombrado === null) return;
    const limpio = normalizarNombreGeografico(nombreNuevo);
    if (limpio === "") {
      setErroresRenombrado({ nombre: ["Este campo es obligatorio."] });
      return;
    }

    setRenombrando(true);
    try {
      const res = await renombrarNodoAction({ nivel: renombrado.nivel, id: renombrado.id, nombre: limpio });
      if (res.status === "ok") {
        toast.success(`«${renombrado.nombre}» ahora es «${limpio}».`);
        cerrarRenombrado();
        await refetch();
        return;
      }
      if (res.status === "validation_error") {
        setErroresRenombrado(res.fieldErrors);
        toast.error(mensajeDeValidacion(res.fieldErrors));
        return;
      }
      if (res.status === "conflict") {
        setErroresRenombrado({ nombre: [mensajeDeDesenlace("conflict")] });
      }
      toast.error(mensajeDeDesenlace(res.status));
      await refetch();
    } catch {
      toast.error(mensajeDeDesenlace("error"));
    } finally {
      setRenombrando(false);
    }
  }

  /** Activar no pide confirmación: es aditivo. */
  async function activar(nodo: NodoObjetivo) {
    setAlternando(nodo.id);
    try {
      const res = await cambiarActivacionNodoAction({ nivel: nodo.nivel, id: nodo.id, activo: true });
      if (res.status === "ok") toast.success(`Se activó «${nodo.nombre}».`);
      else toast.error(mensajeDeDesenlace(res.status));
      await refetch();
    } catch {
      toast.error(mensajeDeDesenlace("error"));
    } finally {
      setAlternando(null);
    }
  }

  async function confirmarRetirada() {
    if (objetivo === null) return;
    const res = await cambiarActivacionNodoAction({ nivel: objetivo.nivel, id: objetivo.id, activo: false });
    if (res.status === "ok") {
      toast.success(`Se desactivó «${objetivo.nombre}».`);
      cerrarConfirmacion();
    } else {
      toast.error(mensajeDeDesenlace(res.status));
    }
    await refetch();
  }

  /** Las acciones de una fila, comunes a los tres niveles. */
  function accionesDe(nodo: NodoObjetivo) {
    return {
      alternando: alternando === nodo.id,
      onActivar: () => void activar(nodo),
      onRetirar: () => abrirConfirmacion(nodo),
      onRenombrar: () => abrirRenombrado(nodo),
    };
  }

  /** El botón «Añadir <hijo>» de una fila, si su nivel tiene hijos. */
  function altaDeHijo(nodo: NodoObjetivo) {
    const hijo = HIJO[nodo.nivel];
    if (hijo === null) return {};
    const texto = `Añadir ${enFrase(singular(hijo))}`;
    return {
      onAgregarHijo: () => abrirAlta(hijo, { id: nodo.id, nombre: nodo.nombre }),
      etiquetaAgregarHijo: `${texto} a ${nodo.nombre}`,
      textoAgregarHijo: texto,
    };
  }

  /** «3 cantones» con los nombres del país. */
  function cuantos(n: number, nivel: NivelGeografico): string {
    return `${n} ${enFrase(n === 1 ? etiquetas[nivel].singular : etiquetas[nivel].plural)}`;
  }

  /** Los textos de estado con los nombres del país. */
  function textosDeEstado(e: EstadoGeografico): { insignia: string | null; motivo: string | null } {
    if (e.tipo === "activo") return { insignia: null, motivo: null };
    if (e.tipo === "inactivo_propio") return { insignia: "Inactivo", motivo: null };
    const ascendiente = enFrase(singular(e.ascendiente));
    return {
      insignia: `Inactivo por su ${ascendiente}`,
      motivo: `Primero hay que activar su ${ascendiente}.`,
    };
  }

  const nivel1 = enFrase(singular("provincia"));

  return (
    <section className="flex flex-col gap-4" aria-labelledby="geografia-arbol-titulo">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="geografia-arbol-titulo" className="text-base font-semibold">
            {`División de ${paisNombre}`}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">
            Los tres niveles que la app ofrece al cargar y al corregir órdenes. Desactivar un nodo no
            lo borra: deja de ofrecerse y se puede volver a activar cuando haga falta.
          </p>
        </div>
        <Button type="button" onClick={() => abrirAlta("provincia", null)}>
          <Plus aria-hidden="true" />
          {`Añadir ${nivel1}`}
        </Button>
      </div>

      {cargaError ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudo cargar la división del país.</AlertDescription>
        </Alert>
      ) : null}

      {/* Un `<form>` con nombre: Enter guarda y el lector de pantalla lo anuncia como región. La
          `key` lo vuelve a montar al abrirlo desde otra fila, para que el foco salte otra vez. */}
      {alta !== null ? (
        <form
          key={`alta-${alta.nivel}-${alta.padreId ?? paisId}`}
          aria-labelledby="geografia-alta-titulo"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardarAlta();
          }}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h3 id="geografia-alta-titulo" className="text-sm font-semibold">{`Alta: ${singular(alta.nivel)}`}</h3>
          <p className="text-sm text-muted-foreground">
            {alta.padreNombre !== null ? `Dentro de ${alta.padreNombre}.` : `En ${paisNombre}.`}
          </p>

          <FormField id="geografia-nombre" label="Nombre" error={errors.nombre} required>
            <Input
              // Lo abre un gesto del usuario, lejos de la fila: sin foco aquí el formulario no se
              // encuentra con teclado.
              autoFocus
              value={nombre}
              maxLength={GEO_NOMBRE_MAX}
              onChange={(e) => setNombre(e.target.value)}
            />
          </FormField>

          <FormField
            id="geografia-codigo"
            label="Código oficial"
            hint="Opcional. El que le da la división oficial del país."
            error={errors.codigo}
          >
            <Input value={codigo} onChange={(e) => setCodigo(e.target.value)} />
          </FormField>

          <div className="flex items-center gap-2">
            <Button type="submit" loading={guardando}>
              {guardando ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="outline" onClick={cerrarAlta} disabled={guardando}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {renombrado !== null ? (
        <form
          key={`renombrar-${renombrado.id}`}
          aria-labelledby="geografia-renombrar-titulo"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void guardarRenombrado();
          }}
          className="flex flex-col gap-4 rounded-md border border-border p-4"
        >
          <h3 id="geografia-renombrar-titulo" className="text-sm font-semibold">{`Renombrar: ${singular(renombrado.nivel)}`}</h3>
          <p className="text-sm text-muted-foreground">
            {`Se llama «${renombrado.nombre}». Cambiar el nombre no lo mueve, no lo desactiva ni cambia su código: las órdenes que ya lo tienen siguen apuntando al mismo lugar.`}
          </p>

          <FormField id="geografia-nombre-nuevo" label="Nombre" error={erroresRenombrado.nombre} required>
            <Input
              // Mismo motivo que en el alta.
              autoFocus
              value={nombreNuevo}
              maxLength={GEO_NOMBRE_MAX}
              onChange={(e) => setNombreNuevo(e.target.value)}
            />
          </FormField>

          <div className="flex items-center gap-2">
            <Button type="submit" loading={renombrando}>
              {renombrando ? "Guardando…" : "Guardar"}
            </Button>
            <Button type="button" variant="outline" onClick={cerrarRenombrado} disabled={renombrando}>
              Cancelar
            </Button>
          </div>
        </form>
      ) : null}

      {/* Sin división no hay nada que buscar ni filtrar: la barra solo sale con algo debajo. */}
      {provincias.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3">
          <Input
            type="search"
            className="max-w-xs"
            placeholder="Buscar por nombre…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label={`Buscar en la división de ${paisNombre}`}
          />
          <SegmentedToggle options={OPCIONES_ESTADO} valor={estado} onChange={setEstado} ariaLabel="Filtrar por estado" />
        </div>
      ) : null}

      {/* Si la lectura falló y no hay nada leído, solo queda el aviso de arriba: pintar además
          «aún no tiene división» sería disfrazar el fallo de estado vacío. */}
      {cargaError && provincias.length === 0 ? null : filtradas.length === 0 ? (
        <div className="rounded-md border border-border">
          {provincias.length === 0 ? (
            <EmptyState
              title="Este país aún no tiene división cargada."
              // El botón por su rótulo, y no «el primer <nivel>»: el nombre del nivel puede ser
              // femenino y la frase no se concuerda (decisión 15).
              description={`Carga un CSV con toda la división o usa «Añadir ${nivel1}» para ir a mano.`}
            />
          ) : (
            <EmptyState title="Sin resultados." description="Prueba con otro nombre o cambia el filtro de estado." />
          )}
        </div>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {filtradas.map((provincia) => {
            const nodoP: NodoObjetivo = { nivel: "provincia", id: provincia.id, nombre: provincia.nombre };
            return (
              <li key={provincia.id} className="px-2 py-1">
                <FilaNodo
                  nodo={nodoP}
                  codigo={provincia.codigo}
                  textos={textosDeEstado(estadoGeografico({ provincia: provincia.activo }))}
                  disponible={estadoGeografico({ provincia: provincia.activo }).tipo === "activo"}
                  detalle={cuantos(provincia.cantones.length, "canton")}
                  expandido={abierto(provincia.id)}
                  onExpandir={() => alternarExpansion(provincia.id)}
                  {...accionesDe(nodoP)}
                  {...altaDeHijo(nodoP)}
                />

                {abierto(provincia.id) ? (
                  <ul className="ml-5 flex flex-col border-l border-border pl-2">
                    {provincia.cantones.map((canton) => {
                      const nodoC: NodoObjetivo = { nivel: "canton", id: canton.id, nombre: canton.nombre };
                      const estadoC = estadoGeografico({ provincia: provincia.activo, canton: canton.activo });
                      return (
                        <li key={canton.id}>
                          <FilaNodo
                            nodo={nodoC}
                            codigo={canton.codigo}
                            textos={textosDeEstado(estadoC)}
                            disponible={estadoC.tipo === "activo"}
                            detalle={cuantos(canton.distritos.length, "distrito")}
                            expandido={abierto(canton.id)}
                            onExpandir={() => alternarExpansion(canton.id)}
                            {...accionesDe(nodoC)}
                            {...altaDeHijo(nodoC)}
                          />

                          {abierto(canton.id) ? (
                            <ul className="ml-5 flex flex-col border-l border-border pl-2">
                              {canton.distritos.map((distrito) => {
                                const nodoD: NodoObjetivo = { nivel: "distrito", id: distrito.id, nombre: distrito.nombre };
                                const estadoD = estadoGeografico({
                                  provincia: provincia.activo,
                                  canton: canton.activo,
                                  distrito: distrito.activo,
                                });
                                return (
                                  <li key={distrito.id}>
                                    <FilaNodo
                                      nodo={nodoD}
                                      codigo={distrito.codigo}
                                      textos={textosDeEstado(estadoD)}
                                      disponible={estadoD.tipo === "activo"}
                                      {...accionesDe(nodoD)}
                                    />
                                  </li>
                                );
                              })}
                            </ul>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {/* La ventana la cierra el desenlace, no el clic (`closeOnConfirm={false}`). */}
      <Modal
        open={objetivo !== null}
        onOpenChange={(abierta) => {
          if (!abierta) cerrarConfirmacion();
        }}
        title="Desactivar"
        confirmLabel="Desactivar"
        cancelLabel="Cancelar"
        confirmVariant="destructive"
        closeOnConfirm={false}
        // R31: mientras el conteo está en vuelo no se confirma; en cuanto se resuelve, ok o error, sí.
        confirmDisabled={conteo.estado === "cargando"}
        onConfirm={confirmarRetirada}
        onError={() => toast.error(mensajeDeDesenlace("error"))}
      >
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm">
          <li>{objetivo === null ? "" : `Vas a desactivar «${objetivo.nombre}» (${singular(objetivo.nivel)}).`}</li>
          <li>{textoDelConteo(conteo)}</li>
        </ul>
      </Modal>
    </section>
  );
}

/** Una fila del árbol: nombre, código, estado y sus acciones. */
function FilaNodo({
  nodo,
  codigo,
  textos,
  disponible,
  detalle,
  expandido,
  alternando = false,
  onExpandir,
  onActivar,
  onRetirar,
  onRenombrar,
  onAgregarHijo,
  etiquetaAgregarHijo,
  textoAgregarHijo,
}: Readonly<{
  nodo: NodoObjetivo;
  codigo: string | null;
  textos: { insignia: string | null; motivo: string | null };
  disponible: boolean;
  detalle?: string;
  /** `undefined` en una hoja: no se pliega. */
  expandido?: boolean;
  alternando?: boolean;
  onExpandir?: () => void;
  onActivar: () => void;
  onRetirar: () => void;
  onRenombrar: () => void;
  onAgregarHijo?: () => void;
  etiquetaAgregarHijo?: string;
  textoAgregarHijo?: string;
}>) {
  const { nombre } = nodo;
  const { insignia, motivo } = textos;

  return (
    <div
      data-nodo={`${nodo.nivel}:${nodo.id}`}
      className="flex flex-wrap items-center gap-2 rounded px-1.5 py-1 text-sm hover:bg-accent"
    >
      {expandido === undefined ? (
        <span aria-hidden="true" className="inline-block w-6" />
      ) : (
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-expanded={expandido}
          aria-label={`${expandido ? "Contraer" : "Expandir"} ${nombre}`}
          onClick={onExpandir}
        >
          <ChevronRight
            aria-hidden="true"
            className={`transition-transform motion-reduce:transition-none ${expandido ? "rotate-90" : ""}`}
          />
        </Button>
      )}

      <span className={disponible ? "font-medium" : "font-medium text-muted-foreground"}>{nombre}</span>

      {codigo === null ? null : <span className="font-mono text-xs text-muted-foreground">{codigo}</span>}

      {detalle === undefined ? null : <span className="text-xs text-muted-foreground">({detalle})</span>}

      {insignia === null ? null : (
        <Badge variant={motivo === null ? "secondary" : "outline"}>{insignia}</Badge>
      )}

      <div className="ml-auto flex items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="xs"
          aria-label={`Renombrar ${nombre}`}
          disabled={alternando}
          onClick={onRenombrar}
        >
          Renombrar
        </Button>

        {onAgregarHijo === undefined ? null : (
          <Button type="button" variant="outline" size="xs" aria-label={etiquetaAgregarHijo} onClick={onAgregarHijo}>
            <Plus aria-hidden="true" />
            {textoAgregarHijo}
          </Button>
        )}

        {disponible ? (
          <Button
            type="button"
            variant="ghost"
            size="xs"
            aria-label={`Desactivar ${nombre}`}
            disabled={alternando}
            onClick={onRetirar}
          >
            Desactivar
          </Button>
        ) : (
          // En el heredado, «Activar» va apagado con el motivo en el nombre accesible y en el `title`.
          // `outline` y no `default`: con varios nodos retirados la lista se llenaba de botones
          // primarios que competían con el único primario de la sección, «Añadir <nivel 1>».
          <Button
            type="button"
            variant="outline"
            size="xs"
            aria-label={motivo === null ? `Activar ${nombre}` : `Activar ${nombre}. ${motivo}`}
            title={motivo ?? undefined}
            disabled={motivo !== null || alternando}
            onClick={onActivar}
          >
            Activar
          </Button>
        )}
      </div>
    </div>
  );
}

/** La línea del conteo en la confirmación (R31), en sus tres estados. */
function textoDelConteo(conteo: EstadoConteo): string {
  if (conteo.estado === "cargando") return "Contando las órdenes sin entregar de este nodo, de todas las empresas…";
  if (conteo.estado === "error") {
    return "No se pudo contar las órdenes sin entregar de este nodo. Puedes desactivarlo igual.";
  }
  return `Órdenes sin entregar en este nodo, de todas las empresas: ${conteo.ordenes}.`;
}

/** Un mensaje por desenlace: quien lo lee sabe si corregir, recargar o pedir permisos. */
function mensajeDeDesenlace(status: string): string {
  switch (status) {
    case "validation_error":
      return "Revisa los campos: el formulario está incompleto.";
    case "unauthenticated":
      return "Tu sesión expiró.";
    case "forbidden":
      return "No tienes permiso para esta acción.";
    case "not_found":
      return "Ese nodo ya no está en el catálogo.";
    case "conflict":
      return "Ya existe un nodo con ese nombre o ese código.";
    default:
      return "No se pudo completar la acción.";
  }
}

/** El motivo del servidor tal cual (ficha 392): el del nombre, o el del código. */
function mensajeDeValidacion(fieldErrors: FieldErrors): string {
  return fieldErrors.nombre?.[0] ?? fieldErrors.codigo?.[0] ?? mensajeDeDesenlace("validation_error");
}
