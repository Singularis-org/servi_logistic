"use client";

import { useState, type Ref } from "react";
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
import type { GrupoDistritosDTO, TarifaValorDTO } from "@/lib/types/tarifa-flexible";

import { textoValor, textoValorSinIva, TEXTOS } from "./tarifas-textos";

export interface TarifasGruposProps {
  zona: { id: string; nombre: string };
  grupos: readonly GrupoDistritosDTO[];
  distritos: readonly DistritoDeSelector[];
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
  | { tipo: "distritos"; grupo: GrupoDistritosDTO }
  | { tipo: "borrar"; grupo: GrupoDistritosDTO };

const FOCO = "focus-visible:ring-3 focus-visible:ring-ring";

/** La maqueta `Vigente`: lo que define el grupo, o que cae a la zona. */
function resumenDeActor(propios: readonly TarifaValorDTO[], actor: TarifaActor): string {
  const delActor = propios.filter((v) => CATALOGO_CONCEPTOS[v.concepto].actor === actor);
  if (delActor.length === 0) return TEXTOS.usaElDeLaZona;
  const entregado = delActor.find((v) => CATALOGO_CONCEPTOS[v.concepto].resultado === "entregado" && v.vehiculoId === null);
  return entregado === undefined ? TEXTOS.valoresPropios(delActor.length) : textoValorSinIva(entregado);
}

/** R42-R46: los grupos de la zona. La zona especial es un grupo mas: aqui no tiene campo ni trato propio. */
export function TarifasGrupos({
  zona,
  grupos,
  distritos,
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
  const [nombre, setNombre] = useState("");
  const [elegidos, setElegidos] = useState<ReadonlySet<string>>(new Set());
  const [errorNombre, setErrorNombre] = useState<string[] | undefined>();
  const [errorDistritos, setErrorDistritos] = useState<string[] | undefined>();

  const nombreDeGrupo = new Map(grupos.map((g) => [g.id, g.nombre]));

  function abrir(siguiente: Dialogo) {
    setErrorNombre(undefined);
    setErrorDistritos(undefined);
    setNombre(siguiente.tipo === "crear" ? "" : siguiente.grupo.nombre);
    setElegidos(new Set(siguiente.tipo === "crear" ? [] : siguiente.grupo.distritos.map((d) => d.id)));
    setDialogo(siguiente);
  }

  function alternarDistrito(id: string, marcado: boolean) {
    setElegidos((actual) => {
      const nuevo = new Set(actual);
      if (marcado) nuevo.add(id);
      else nuevo.delete(id);
      return nuevo;
    });
  }

  async function guardar(): Promise<void> {
    if (dialogo === null || dialogo.tipo === "borrar") return;
    const distritoIds = [...elegidos];
    try {
      const r =
        dialogo.tipo === "crear"
          ? await crearGrupoDistritos({ zonaId: zona.id, nombre, distritoIds })
          : dialogo.tipo === "renombrar"
            ? await renombrarGrupoDistritos({ id: dialogo.grupo.id, nombre })
            : await cambiarDistritosDeGrupo({ id: dialogo.grupo.id, distritoIds });
      if (r.status === "ok") {
        toast.success(TEXTOS.grupoGuardado);
        setDialogo(null);
        await onCambio();
        return;
      }
      if (r.status === "validation_error") {
        // R42: el rechazo nombra el distrito, y se queda abierto para corregirlo.
        setErrorNombre(r.fieldErrors.nombre);
        setErrorDistritos(r.fieldErrors.distritoIds);
        return;
      }
      toast.error(TEXTOS.errorGrupo);
    } catch {
      toast.error(TEXTOS.errorGrupo);
    }
  }

  async function borrar(): Promise<void> {
    if (dialogo?.tipo !== "borrar") return;
    try {
      const r = await borrarGrupoDistritos({ id: dialogo.grupo.id });
      if (r.status === "ok") {
        toast.success(TEXTOS.grupoBorrado);
        setDialogo(null);
        await onCambio();
        return;
      }
      toast.error(TEXTOS.errorGrupo);
    } catch {
      toast.error(TEXTOS.errorGrupo);
    }
  }

  const tituloDialogo =
    dialogo?.tipo === "crear"
      ? TEXTOS.crearGrupo
      : dialogo?.tipo === "renombrar"
        ? TEXTOS.renombrarGrupo
        : `Cambiar ${distritoPlural}`;
  const hayMarcas = !activada && distritos.some((d) => d.zonaEspecial);

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
            return (
              <li
                key={grupo.id}
                className="flex flex-wrap items-start justify-between gap-[18px] border-b border-border px-[18px] py-4 last:border-b-0"
              >
                <div className="min-w-0 flex-[1_1_320px]">
                  <p className="text-[15px] font-semibold">{grupo.nombre}</p>
                  <p className="mt-[3px] mb-2.5 text-[13px] text-muted-foreground">
                    {`${grupo.distritos.length} ${grupo.distritos.length === 1 ? distritoSingular : distritoPlural}: ${grupo.distritos.map((d) => d.nombre).join(", ")}`}
                  </p>
                  {puedeEscribir ? (
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" className="min-h-11 px-3" aria-label={`Cambiar ${distritoPlural} de ${grupo.nombre}`} onClick={() => abrir({ tipo: "distritos", grupo })}>
                        {`Cambiar ${distritoPlural}`}
                      </Button>
                      <Button type="button" variant="outline" className="min-h-11 px-3" aria-label={`${TEXTOS.renombrar} ${grupo.nombre}`} onClick={() => abrir({ tipo: "renombrar", grupo })}>
                        {TEXTOS.renombrar}
                      </Button>
                      <Button type="button" variant="outline" className="min-h-11 px-3" aria-label={`${TEXTOS.borrar} ${grupo.nombre}`} onClick={() => abrir({ tipo: "borrar", grupo })}>
                        {TEXTOS.borrar}
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
        open={dialogo !== null && dialogo.tipo !== "borrar"}
        onOpenChange={(abierto) => {
          if (!abierto) setDialogo(null);
        }}
        title={tituloDialogo}
        confirmLabel={TEXTOS.guardarGrupo}
        cancelLabel={TEXTOS.cancelar}
        size="640px"
        closeOnConfirm={false}
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={guardar}
      >
        <div className="flex flex-col gap-4 p-1">
          {dialogo?.tipo === "distritos" ? null : (
            <FormField id="tarifas-grupo-nombre" label={TEXTOS.nombreGrupo} error={errorNombre} required>
              <Input
                value={nombre}
                maxLength={60}
                onChange={(ev) => setNombre(ev.target.value)}
                className={`h-auto min-h-10 max-lg:min-h-11 text-sm ${FOCO}`}
              />
            </FormField>
          )}

          {dialogo?.tipo === "renombrar" ? null : (
            <fieldset className="flex flex-col gap-1">
              <legend className="mb-1 text-sm font-medium">{etiquetas.distrito.plural}</legend>
              {hayMarcas ? <p className="mb-1 text-[13px] text-muted-foreground">{TEXTOS.marcaEspecialNota}</p> : null}
              {distritos.map((d) => {
                const grupoActual = dialogo?.tipo === "distritos" ? dialogo.grupo.id : null;
                const enOtro = d.grupoId !== null && d.grupoId !== grupoActual ? nombreDeGrupo.get(d.grupoId) : undefined;
                return (
                  <label key={d.id} className="flex min-h-11 flex-wrap items-center gap-2.5 text-sm">
                    <Checkbox
                      checked={elegidos.has(d.id)}
                      onCheckedChange={(v) => alternarDistrito(d.id, v)}
                      className={`size-5 ${FOCO}`}
                    />
                    <span>{d.nombre}</span>
                    {enOtro === undefined ? null : <Badge variant="outline">{TEXTOS.enOtroGrupo(enOtro)}</Badge>}
                    {!activada && d.zonaEspecial ? <Badge variant="warning">{TEXTOS.marcaEspecial}</Badge> : null}
                  </label>
                );
              })}
              <FieldError messages={errorDistritos} />
            </fieldset>
          )}
        </div>
      </Modal>

      <Modal
        open={dialogo?.tipo === "borrar"}
        onOpenChange={(abierto) => {
          if (!abierto) setDialogo(null);
        }}
        title={dialogo?.tipo === "borrar" ? TEXTOS.borrarGrupoTitulo(dialogo.grupo.nombre) : ""}
        description={
          dialogo?.tipo === "borrar"
            ? TEXTOS.borrarGrupoDetalle(valores.filter((v) => v.grupoId === dialogo.grupo.id).length)
            : undefined
        }
        confirmLabel={TEXTOS.borrar}
        cancelLabel={TEXTOS.cancelar}
        confirmVariant="destructive"
        size="md"
        closeOnConfirm={false}
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={borrar}
      />
    </section>
  );
}
