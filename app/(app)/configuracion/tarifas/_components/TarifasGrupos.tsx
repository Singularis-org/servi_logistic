"use client";

import { useMemo, useState, type ReactNode, type Ref } from "react";
import type { TarifaActor } from "@prisma/client";

import { EmptyState } from "@/components/shared/EmptyState";
import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import { useToast } from "@/hooks/useToast";
import {
  borrarGrupoDistritos,
  cambiarDistritosDeGrupo,
  crearGrupoDistritos,
  renombrarGrupoDistritos,
} from "@/lib/actions/tarifas";
import type { DistritoDeSelector } from "@/lib/interfaces/services/ITarifasPantallaService";
import { CATALOGO_CONCEPTOS } from "@/lib/tarifas/catalogo";
import type { ArbolCubiertoDTO, NodoCubiertoDTO } from "@/lib/types/geografia-nodo";
import {
  crearGrupoSchema,
  fijarDistritosSchema,
  renombrarGrupoSchema,
  type GrupoDistritosDTO,
  type TarifaValorDTO,
} from "@/lib/types/tarifa-flexible";

import { textoValor, textoValorSinIva, TEXTOS } from "./tarifas-textos";

export interface TarifasGruposProps {
  zona: { id: string; nombre: string };
  grupos: readonly GrupoDistritosDTO[];
  distritos: readonly DistritoDeSelector[];
  /**
   * SLT-89 (R23, design §4.4): el sub-árbol que la zona cubre, a todas sus profundidades. Ausente si la
   * zona solo cubre sus distritos asignados: entonces los posibles miembros son `distritos`, como hoy.
   */
  nodos?: ArbolCubiertoDTO;
  /** Los de la zona: tambien los de tienda en un grupo, que caen con el. */
  valores: readonly TarifaValorDTO[];
  activada: boolean;
  puedeEscribir: boolean;
  onCambio: () => Promise<void> | void;
  seccionRef?: Ref<HTMLElement>;
}

type Dialogo =
  | { tipo: "crear" }
  | { tipo: "renombrar"; grupo: GrupoDistritosDTO }
  | { tipo: "miembros"; grupo: GrupoDistritosDTO }
  | { tipo: "borrar"; grupo: GrupoDistritosDTO };

/** Lo que el modal pinta para un lugar: nombre, nivel y padre (R22). */
interface Lugar {
  id: string;
  nombre: string;
  profundidad: number;
  padre: string | null;
}

const PROFUNDIDAD_DE_DISTRITO = 3;
const FOCO = "focus-visible:ring-3 focus-visible:ring-ring";

/** La maqueta `Vigente`: lo que define el grupo, o que cae a la zona. */
function resumenDeActor(propios: readonly TarifaValorDTO[], actor: TarifaActor): string {
  const delActor = propios.filter((v) => CATALOGO_CONCEPTOS[v.concepto].actor === actor);
  if (delActor.length === 0) return TEXTOS.usaElDeLaZona;
  const entregado = delActor.find((v) => CATALOGO_CONCEPTOS[v.concepto].resultado === "entregado" && v.vehiculoId === null);
  return entregado === undefined ? TEXTOS.valoresPropios(delActor.length) : textoValorSinIva(entregado);
}

function idsDeMiembros(grupo: GrupoDistritosDTO): { distritoIds: string[]; nodoIds: string[] } {
  return { distritoIds: grupo.distritos.map((d) => d.id), nodoIds: (grupo.nodos ?? []).map((n) => n.id) };
}

/**
 * R42-R46 de SLT-54: los grupos de la zona. La zona especial es un grupo mas: aqui no tiene campo ni trato
 * propio.
 *
 * SLT-89 (R17, R22, R23, R43–R47; design §8.3; maqueta aprobada el 2026-11-10): un miembro puede ser un
 * lugar de cualquier nivel que la zona cubra, y las cuatro escrituras pasan por el MISMO modal: primero se
 * edita (nombre y/o lugares) y se valida con el esquema del servidor —inválido: error en su campo, sin
 * llamar a nada—; luego el antes → después, y solo «Sí, guardar» / «Sí, borrar» escriben, con el «antes»
 * que el modal mostró. Un `cambio_concurrente` cierra, avisa en una región `aria-live` y recarga la zona.
 */
export function TarifasGrupos({
  zona,
  grupos,
  distritos,
  nodos,
  valores,
  activada,
  puedeEscribir,
  onCambio,
  seccionRef,
}: Readonly<TarifasGruposProps>) {
  const toast = useToast();
  const etiquetas = useEtiquetasGeograficas();
  const distritoPlural = etiquetas.distrito.plural.toLowerCase();
  const distritoSingular = etiquetas.distrito.singular.toLowerCase();

  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [nombre, setNombre] = useState("");
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [errorNombre, setErrorNombre] = useState<string[] | undefined>();
  const [errorDistritos, setErrorDistritos] = useState<string[] | undefined>();
  const [aviso, setAviso] = useState<string | null>(null);

  // Los nombres de nivel: del árbol cubierto si lo hay; si no, los del país (R61 de SLT-54).
  const nivelDe = useMemo(() => {
    const porProfundidad = new Map<number, string>([
      [1, etiquetas.provincia.singular],
      [2, etiquetas.canton.singular],
      [3, etiquetas.distrito.singular],
    ]);
    for (const t of nodos?.tipos ?? []) porProfundidad.set(t.profundidad, t.nombreSingular);
    return (profundidad: number) => (porProfundidad.get(profundidad) ?? "").toLowerCase();
  }, [etiquetas, nodos]);

  // Cada lugar conocido, con su nivel y su padre: del árbol cubierto, de los distritos de la zona y de los
  // miembros de los grupos (un miembro que ya no está cubierto sigue teniendo nombre).
  const lugares = useMemo(() => {
    const m = new Map<string, Lugar>();
    const recorrer = (lista: readonly NodoCubiertoDTO[], padre: string | null) => {
      for (const n of lista) {
        m.set(n.id, { id: n.id, nombre: n.nombre, profundidad: n.profundidad, padre });
        recorrer(n.hijos, n.nombre);
      }
    };
    recorrer(nodos?.raices ?? [], null);
    for (const d of distritos) {
      if (!m.has(d.id)) m.set(d.id, { id: d.id, nombre: d.nombre, profundidad: PROFUNDIDAD_DE_DISTRITO, padre: null });
    }
    for (const g of grupos) {
      for (const d of g.distritos) {
        if (!m.has(d.id)) m.set(d.id, { id: d.id, nombre: d.nombre, profundidad: PROFUNDIDAD_DE_DISTRITO, padre: null });
      }
      for (const n of g.nodos ?? []) if (!m.has(n.id)) m.set(n.id, { ...n, padre: null });
    }
    return m;
  }, [nodos, distritos, grupos]);

  // El grupo de cada lugar que ya es miembro (distritos y demás nodos).
  const grupoDeLugar = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of grupos) {
      for (const d of g.distritos) m.set(d.id, g.id);
      for (const n of g.nodos ?? []) m.set(n.id, g.id);
    }
    for (const d of distritos) if (d.grupoId !== null && !m.has(d.id)) m.set(d.id, d.grupoId);
    return m;
  }, [grupos, distritos]);
  const nombreDeGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));
  const marcaDe = new Map(distritos.map((d) => [d.id, d.zonaEspecial]));

  function abrir(siguiente: Dialogo) {
    setAviso(null);
    setErrorNombre(undefined);
    setErrorDistritos(undefined);
    setNombre(siguiente.tipo === "crear" ? "" : siguiente.grupo.nombre);
    if (siguiente.tipo === "crear") setElegidos(new Set());
    else {
      const { distritoIds, nodoIds } = idsDeMiembros(siguiente.grupo);
      setElegidos(new Set([...distritoIds, ...nodoIds]));
    }
    // Borrar no tiene nada que editar: entra directo al antes → después.
    setConfirmando(siguiente.tipo === "borrar");
    setDialogo(siguiente);
  }

  function cerrar() {
    setDialogo(null);
    setConfirmando(false);
  }

  function alternar(id: string, marcado: boolean) {
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (marcado) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  }

  /** Lo elegido, repartido como lo pide el contrato (design §6): distritos y demás lugares. */
  function repartidos(): { distritoIds: string[]; nodoIds: string[] } {
    const distritoIds: string[] = [];
    const nodoIds: string[] = [];
    for (const id of elegidos) {
      const p = lugares.get(id)?.profundidad ?? PROFUNDIDAD_DE_DISTRITO;
      if (p === PROFUNDIDAD_DE_DISTRITO) distritoIds.push(id);
      else nodoIds.push(id);
    }
    return { distritoIds, nodoIds };
  }

  /** R22: la misma validación que el servidor. Inválido → error en su campo, sin modal y sin llamada. */
  function validar(): boolean {
    if (dialogo === null || dialogo.tipo === "borrar") return true;
    const { distritoIds, nodoIds } = repartidos();
    const r =
      dialogo.tipo === "crear"
        ? crearGrupoSchema.safeParse({ zonaId: zona.id, nombre, distritoIds, nodoIds })
        : dialogo.tipo === "renombrar"
          ? renombrarGrupoSchema.safeParse({ nombre, nombreAnterior: dialogo.grupo.nombre })
          : fijarDistritosSchema.safeParse({ distritoIds, nodoIds, antes: idsDeMiembros(dialogo.grupo) });
    if (r.success) return true;
    const campos = r.error.flatten().fieldErrors as Record<string, string[] | undefined>;
    setErrorNombre(campos.nombre);
    setErrorDistritos([...(campos.distritoIds ?? []), ...(campos.nodoIds ?? [])]);
    return false;
  }

  async function escribir(): Promise<void> {
    if (dialogo === null) return;
    const { distritoIds, nodoIds } = repartidos();
    // `nodoIds` solo viaja si hay alguno: un grupo de solo distritos manda lo de siempre (R38).
    const conNodos = nodoIds.length > 0 ? { nodoIds } : {};
    try {
      const r =
        dialogo.tipo === "crear"
          ? await crearGrupoDistritos({ zonaId: zona.id, nombre, distritoIds, ...conNodos })
          : dialogo.tipo === "renombrar"
            ? await renombrarGrupoDistritos({ id: dialogo.grupo.id, nombre, nombreAnterior: dialogo.grupo.nombre })
            : dialogo.tipo === "miembros"
              ? await cambiarDistritosDeGrupo({
                  id: dialogo.grupo.id,
                  distritoIds,
                  ...conNodos,
                  antes: idsDeMiembros(dialogo.grupo),
                })
              : await borrarGrupoDistritos({
                  id: dialogo.grupo.id,
                  antes: { nombre: dialogo.grupo.nombre, ...idsDeMiembros(dialogo.grupo), valores: valoresDe(dialogo.grupo) },
                });
      if (r.status === "ok") {
        toast.success(dialogo.tipo === "borrar" ? TEXTOS.grupoBorrado : TEXTOS.grupoGuardado);
        cerrar();
        await onCambio();
        return;
      }
      // R47: lo que el modal mostró ya no es lo que hay. No se escribió nada: se cierra, se avisa fuera del
      // modal y se recargan los grupos y valores de la zona.
      if (r.status === "conflict") {
        cerrar();
        setAviso(TEXTOS.cambioConcurrente);
        await onCambio();
        return;
      }
      if (r.status === "validation_error" && dialogo.tipo !== "borrar") {
        // R42 de SLT-54: el rechazo nombra el lugar; se vuelve a la edición para corregirlo.
        setErrorNombre(r.fieldErrors.nombre);
        setErrorDistritos([...(r.fieldErrors.distritoIds ?? []), ...(r.fieldErrors.nodoIds ?? [])]);
        setConfirmando(false);
        return;
      }
      toast.error(TEXTOS.errorGrupo);
    } catch {
      toast.error(TEXTOS.errorGrupo);
    }
  }

  async function confirmar(): Promise<void> {
    if (!confirmando) {
      if (validar()) {
        setErrorNombre(undefined);
        setErrorDistritos(undefined);
        setConfirmando(true);
      }
      return;
    }
    await escribir();
  }

  function valoresDe(grupo: GrupoDistritosDTO): number {
    return valores.filter((v) => v.grupoId === grupo.id).length;
  }

  function lineaDe(id: string): { nombre: string; detalle: string } {
    const l = lugares.get(id);
    if (l === undefined) return { nombre: id, detalle: "" };
    const nivel = nivelDe(l.profundidad);
    return { nombre: l.nombre, detalle: l.padre ? `${nivel} de ${l.padre}` : nivel };
  }

  const tituloEdicion =
    dialogo?.tipo === "crear"
      ? TEXTOS.crearGrupo
      : dialogo?.tipo === "renombrar"
        ? TEXTOS.renombrarGrupo
        : TEXTOS.tituloEditarLugares;
  const tituloConfirmacion =
    dialogo === null
      ? ""
      : dialogo.tipo === "crear"
        ? TEXTOS.crearGrupoConfirmar(nombre.trim())
        : dialogo.tipo === "renombrar"
          ? TEXTOS.renombrarGrupoConfirmar(dialogo.grupo.nombre)
          : dialogo.tipo === "miembros"
            ? TEXTOS.lugaresGrupoConfirmar(dialogo.grupo.nombre)
            : TEXTOS.borrarGrupoTitulo(dialogo.grupo.nombre);
  const hayMarcas = !activada && distritos.some((d) => d.zonaEspecial);
  const grupoActual = dialogo !== null && dialogo.tipo !== "crear" ? dialogo.grupo.id : null;

  function casilla(id: string, nombreLugar: string, extra: string | null) {
    const otro = grupoDeLugar.get(id);
    const enOtro = otro !== undefined && otro !== grupoActual ? nombreDeGrupo.get(otro) : undefined;
    return (
      <label key={id} className="flex min-h-11 flex-wrap items-center gap-2.5 text-sm">
        <Checkbox
          checked={elegidos.has(id)}
          // R18: un lugar de otro grupo de la zona no se ofrece; dice en cuál está.
          disabled={enOtro !== undefined}
          onCheckedChange={(v) => alternar(id, v)}
          className={`size-5 ${FOCO}`}
        />
        <span>{nombreLugar}</span>
        {extra ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{extra}</span> : null}
        {enOtro === undefined ? null : <Badge variant="outline">{TEXTOS.enOtroGrupo(enOtro)}</Badge>}
        {!activada && marcaDe.get(id) ? <Badge variant="warning">{TEXTOS.marcaEspecial}</Badge> : null}
      </label>
    );
  }

  function arbolDeMiembros(lista: readonly NodoCubiertoDTO[]) {
    return (
      <ul className="flex flex-col">
        {lista.map((n) => (
          <li key={n.id} style={{ paddingLeft: `${(n.profundidad - 1) * 16}px` }}>
            {casilla(n.id, n.nombre, nivelDe(n.profundidad))}
            {n.hijos.length > 0 ? arbolDeMiembros(n.hijos) : null}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <section
      ref={seccionRef}
      tabIndex={-1}
      aria-label={`Grupos de ${distritoPlural} de la zona`}
      className="scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card outline-none"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-[18px] py-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold">{`${zona.nombre}: grupos de ${distritoPlural}`}</h2>
          <p className="mt-[3px] text-[13px] text-muted-foreground">
            {TEXTOS.gruposUnicidad(distritoSingular)} {TEXTOS.gruposNota}
          </p>
        </div>
        {puedeEscribir ? (
          <Button type="button" variant="outline" className="min-h-11 px-4 font-semibold" onClick={() => abrir({ tipo: "crear" })}>
            {TEXTOS.crearGrupo}
          </Button>
        ) : null}
      </div>

      {/* R47: el aviso vive fuera del modal, que se cierra. */}
      <p role="status" aria-live="polite" className="px-[18px] text-sm font-medium text-warning-strong empty:hidden">
        {aviso ?? ""}
      </p>

      {grupos.length === 0 ? (
        <EmptyState title={TEXTOS.sinGruposTitulo} description={puedeEscribir ? TEXTOS.sinGruposDetalle : undefined} className="py-8" />
      ) : (
        <ul>
          {grupos.map((grupo) => {
            const propios = valores.filter((v) => v.grupoId === grupo.id && v.tiendaId === null);
            const flete = (concepto: TarifaValorDTO["concepto"]) => {
              const v = propios.find((p) => p.concepto === concepto);
              return v === undefined ? TEXTOS.usaElDeLaZona : textoValor(v);
            };
            const otros = grupo.nodos ?? [];
            return (
              <li
                key={grupo.id}
                className="flex flex-wrap items-start justify-between gap-[18px] border-b border-border px-[18px] py-4 last:border-b-0"
              >
                <div className="min-w-0 flex-[1_1_320px]">
                  <p className="text-[15px] font-semibold">{grupo.nombre}</p>
                  <p className="mt-[3px] text-[13px] text-muted-foreground">
                    {`${grupo.distritos.length} ${grupo.distritos.length === 1 ? distritoSingular : distritoPlural}: ${grupo.distritos.map((d) => d.nombre).join(", ")}`}
                  </p>
                  {otros.length > 0 ? (
                    <p className="text-[13px] text-muted-foreground">
                      {`${TEXTOS.otrosLugares}: ${otros.map((n) => `${n.nombre} (${nivelDe(n.profundidad)})`).join(", ")}`}
                    </p>
                  ) : null}
                  {puedeEscribir ? (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="min-h-11 px-3" aria-label={`${TEXTOS.renombrar} ${grupo.nombre}`} onClick={() => abrir({ tipo: "renombrar", grupo })}>
                        {`${TEXTOS.renombrar}…`}
                      </Button>
                      <Button type="button" variant="outline" className="min-h-11 px-3" aria-label={TEXTOS.editarLugaresDe(grupo.nombre)} onClick={() => abrir({ tipo: "miembros", grupo })}>
                        {TEXTOS.editarLugares}
                      </Button>
                      <Button type="button" variant="outline" className="min-h-11 px-3 text-danger-strong" aria-label={`${TEXTOS.borrar} ${grupo.nombre}`} onClick={() => abrir({ tipo: "borrar", grupo })}>
                        {`${TEXTOS.borrar}…`}
                      </Button>
                    </div>
                  ) : null}
                </div>
                <dl className="m-0 grid min-w-0 flex-[1_1_320px] grid-cols-2 gap-x-4 gap-y-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Flete por entregado</dt>
                    <dd className="mt-0.5 font-semibold">{flete("tienda_flete_entregado")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Flete por devolución a origen</dt>
                    <dd className="mt-0.5 font-semibold">{flete("tienda_flete_rechazo")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{TEXTOS.pagoMensajero}</dt>
                    <dd className="mt-0.5 font-semibold">{resumenDeActor(propios, "mensajero")}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">{TEXTOS.pagoSatelite}</dt>
                    <dd className="mt-0.5 font-semibold">{resumenDeActor(propios, "satelite")}</dd>
                  </div>
                </dl>
              </li>
            );
          })}
        </ul>
      )}

      <Modal
        open={dialogo !== null}
        onOpenChange={(abierto) => {
          if (abierto) return;
          // «Volver» desde el antes → después regresa a la edición; borrar no tiene edición: cierra.
          if (confirmando && dialogo !== null && dialogo.tipo !== "borrar") setConfirmando(false);
          else cerrar();
        }}
        title={confirmando ? tituloConfirmacion : tituloEdicion}
        description={confirmando ? TEXTOS.avisoAntesDeConfirmar : undefined}
        confirmLabel={!confirmando ? TEXTOS.guardarGrupo : dialogo?.tipo === "borrar" ? TEXTOS.siBorrar : TEXTOS.siGuardar}
        cancelLabel={confirmando ? TEXTOS.volver : TEXTOS.cancelar}
        confirmVariant={confirmando && dialogo?.tipo === "borrar" ? "destructive" : "default"}
        size="640px"
        closeOnConfirm={false}
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={confirmar}
      >
        {dialogo === null ? null : confirmando ? (
          <AntesDespues
            dialogo={dialogo}
            nombre={nombre.trim()}
            elegidos={[...elegidos]}
            valores={dialogo.tipo === "borrar" ? valoresDe(dialogo.grupo) : 0}
            lineaDe={lineaDe}
          />
        ) : (
          <div className="flex flex-col gap-4 p-1">
            {dialogo.tipo === "miembros" ? null : (
              <FormField id="tarifas-grupo-nombre" label={TEXTOS.nombreGrupo} error={errorNombre} required>
                <Input
                  value={nombre}
                  maxLength={60}
                  onChange={(ev) => setNombre(ev.target.value)}
                  className={`h-auto min-h-10 max-lg:min-h-11 text-sm ${FOCO}`}
                />
              </FormField>
            )}

            {dialogo.tipo === "renombrar" ? null : (
              <fieldset className="flex flex-col gap-1">
                <legend className="mb-1 text-sm font-medium">{nodos ? TEXTOS.lugares : etiquetas.distrito.plural}</legend>
                {hayMarcas ? <p className="mb-1 text-[13px] text-muted-foreground">{TEXTOS.marcaEspecialNota}</p> : null}
                {nodos ? arbolDeMiembros(nodos.raices) : distritos.map((d) => casilla(d.id, d.nombre, null))}
                <FieldError messages={errorDistritos} />
              </fieldset>
            )}
          </div>
        )}
      </Modal>
    </section>
  );
}

/** R22: el antes → después de cada escritura, con cada lugar en su nivel y con su padre. */
function AntesDespues({
  dialogo,
  nombre,
  elegidos,
  valores,
  lineaDe,
}: Readonly<{
  dialogo: Dialogo;
  nombre: string;
  elegidos: readonly string[];
  valores: number;
  lineaDe: (id: string) => { nombre: string; detalle: string };
}>) {
  const lista = (ids: readonly string[]) =>
    ids.length === 0 ? (
      <p className="text-sm text-muted-foreground">{TEXTOS.ninguno}</p>
    ) : (
      <ul className="flex flex-col gap-1 text-sm">
        {ids.map((id) => {
          const { nombre: n, detalle } = lineaDe(id);
          return (
            <li key={id}>
              {n}
              {detalle ? <span className="text-muted-foreground">{` · ${detalle}`}</span> : null}
            </li>
          );
        })}
      </ul>
    );

  const columna = (titulo: string, contenido: ReactNode) => (
    <section aria-label={titulo} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{titulo}</p>
      {contenido}
    </section>
  );

  if (dialogo.tipo === "crear") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columna(TEXTOS.antes, <p className="text-sm text-muted-foreground">{TEXTOS.sinGrupo}</p>)}
        {columna(
          TEXTOS.despues,
          <>
            <p className="text-sm font-medium">{nombre}</p>
            {lista(elegidos)}
          </>,
        )}
      </div>
    );
  }
  if (dialogo.tipo === "renombrar") {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columna(TEXTOS.antes, <p className="text-sm">{dialogo.grupo.nombre}</p>)}
        {columna(TEXTOS.despues, <p className="text-sm font-medium">{nombre}</p>)}
      </div>
    );
  }
  const actuales = [...idsDeMiembros(dialogo.grupo).distritoIds, ...idsDeMiembros(dialogo.grupo).nodoIds];
  if (dialogo.tipo === "miembros") {
    const antes = new Set(actuales);
    const despues = new Set(elegidos);
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columna(TEXTOS.entran, lista(elegidos.filter((id) => !antes.has(id))))}
        {columna(TEXTOS.salen, lista(actuales.filter((id) => !despues.has(id))))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {columna(
          TEXTOS.antes,
          <>
            <p className="text-sm font-medium">{`${dialogo.grupo.nombre} · ${TEXTOS.cuantosLugares(actuales.length)}`}</p>
            {lista(actuales)}
          </>,
        )}
        {columna(TEXTOS.despues, <p className="text-sm">{TEXTOS.sinGrupo}</p>)}
      </div>
      {/* SLT-54 R43: cuántos valores caen con el grupo (los de tienda incluidos), con su texto de siempre. */}
      <p className="text-sm text-muted-foreground">{TEXTOS.borrarGrupoDetalle(valores)}</p>
    </div>
  );
}
