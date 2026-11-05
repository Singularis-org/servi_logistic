"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { TarifaActor, TarifaConcepto } from "@prisma/client";

import { FieldError } from "@/components/shared/FieldError";
import { Modal } from "@/components/shared/Modal";
import { MontoInput } from "@/components/shared/MontoInput";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/useToast";
import { guardarValoresTarifa, type GuardarValoresTarifaResult } from "@/lib/actions/tarifas";
import type { VehiculoDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import { CATALOGO_CONCEPTOS } from "@/lib/tarifas/catalogo";
import type { ReferenciaDeZona } from "@/lib/tarifas/referencia-vigente";
import type { ModoTarifa, TarifaValorDTO } from "@/lib/types/tarifa-flexible";
import { cn } from "@/lib/utils";

import {
  celdaDeGuardado,
  claveDeCelda,
  columnasDeNivel,
  erroresDeResultado,
  indiceDeValores,
  planDeGuardado,
  referenciaDe,
  valoresPorVehiculo,
  type Celda,
  type CeldaEditada,
  type Nivel,
} from "./tarifas-borrador";
import {
  conceptosDeActor,
  etiquetaConcepto,
  etiquetaModo,
  modoPorDefecto,
  PESTANAS,
  porcentajeParaVer,
  textoReferencia,
  textoValorSinIva,
  TEXTOS,
} from "./tarifas-textos";
import { TarifasVehiculo } from "./TarifasVehiculo";

const FOCO = "focus-visible:ring-3 focus-visible:ring-ring";

/** La pestaña de la maqueta: subrayada, sin el contorno de la `Tabs` del repo, y con 44 px de alto (R59). */
const PESTANA =
  "min-h-11 rounded-none border-0 border-b-3 border-transparent bg-transparent px-3.5 font-normal hover:bg-transparent aria-selected:border-foreground aria-selected:bg-transparent aria-selected:font-semibold aria-selected:shadow-none aria-selected:hover:bg-transparent focus-visible:ring-ring";

export interface TarifasValoresProps {
  zonaId: string;
  nivel: Nivel;
  /** Solo los de este nivel, ya filtrados. */
  valores: readonly TarifaValorDTO[];
  referencia: ReferenciaDeZona | null;
  vehiculos: readonly VehiculoDePantalla[];
  activada: boolean;
  puedeEscribir: boolean;
  actor: TarifaActor;
  onActor: (actor: TarifaActor) => void;
  onGuardado: () => Promise<void> | void;
  onSucioChange: (sucio: boolean) => void;
}

function placeholderDeNivel(nivel: Nivel): string {
  if (nivel.tipo === "zona") return TEXTOS.sinDefinir;
  return nivel.tipo === "grupo" ? TEXTOS.usaZona : TEXTOS.usaGeneral;
}

function notaDe(nivel: Nivel, actor: TarifaActor): string {
  const vacio =
    nivel.tipo === "zona" ? TEXTOS.vacioZona : nivel.tipo === "grupo" ? TEXTOS.vacioGrupo : TEXTOS.vacioTienda;
  if (actor === "tienda") return `${vacio} ${TEXTOS.ceroCobra}`;
  const previa = actor === "mensajero" ? TEXTOS.notaMensajero : TEXTOS.notaSatelite;
  return `${previa} ${vacio} ${TEXTOS.ceroPaga}`;
}

/**
 * R20, R33-R40, R47-R51: la edicion de un nivel. Lo digitado vive aqui hasta guardar y la referencia nunca
 * entra en el estado: solo se pinta al lado. El padre le da una `key` por zona y nivel, asi que cambiar de
 * nivel empieza limpio.
 */
export function TarifasValores({
  zonaId,
  nivel,
  valores,
  referencia,
  vehiculos,
  activada,
  puedeEscribir,
  actor,
  onActor,
  onGuardado,
  onSucioChange,
}: Readonly<TarifasValoresProps>) {
  const toast = useToast();
  const [borrador, setBorrador] = useState<Readonly<Record<string, Celda>>>({});
  const [errores, setErrores] = useState<Readonly<Record<string, string[]>>>({});
  const [guardando, setGuardando] = useState(false);
  const [modoElegido, setModoElegido] = useState<Partial<Record<TarifaConcepto, ModoTarifa>>>({});
  const [encendidoManual, setEncendidoManual] = useState<Partial<Record<TarifaActor, boolean>>>({});
  const [confirmarApagar, setConfirmarApagar] = useState(false);
  const enCurso = useRef(false);

  const guardados = useMemo(() => indiceDeValores(valores), [valores]);
  const columnasNivel = columnasDeNivel(nivel, zonaId);
  const esTienda = nivel.tipo === "tienda";
  const sinTienda = nivel.tipo === "tienda" && nivel.tiendaId === null;

  const celda = (concepto: TarifaConcepto, vehiculoId: string | null): Celda => {
    const clave = claveDeCelda(concepto, vehiculoId);
    return borrador[clave] ?? celdaDeGuardado(guardados.get(clave), modoDeFila(concepto));
  };

  function modoDeFila(concepto: TarifaConcepto): ModoTarifa {
    const elegido = modoElegido[concepto];
    if (elegido !== undefined) return elegido;
    const todos = guardados.get(claveDeCelda(concepto, null));
    if (todos !== undefined) return todos.modo;
    return valores.find((v) => v.concepto === concepto)?.modo ?? modoPorDefecto(concepto);
  }

  const editadas: CeldaEditada[] = Object.entries(borrador).flatMap(([clave, c]) => {
    const [concepto, vehiculo] = clave.split(":") as [TarifaConcepto, string];
    return [
      {
        clave,
        concepto,
        vehiculoId: vehiculo === "todos" ? null : vehiculo,
        guardado: guardados.get(clave),
        celda: c,
      },
    ];
  });
  const plan = planDeGuardado(editadas, columnasNivel);
  const haySinGuardar = plan.cambios.length > 0 || Object.keys(plan.errores).length > 0;

  useEffect(() => {
    onSucioChange(haySinGuardar);
  }, [haySinGuardar, onSucioChange]);

  function editar(concepto: TarifaConcepto, vehiculoId: string | null, cambio: Partial<Celda>) {
    const clave = claveDeCelda(concepto, vehiculoId);
    setBorrador((b) => {
      const actual = b[clave] ?? celdaDeGuardado(guardados.get(clave), modoDeFila(concepto));
      return { ...b, [clave]: { ...actual, ...cambio } };
    });
  }

  function cambiarModoDeFila(concepto: TarifaConcepto, modo: ModoTarifa, columnas: readonly (string | null)[]) {
    setModoElegido((m) => ({ ...m, [concepto]: modo }));
    for (const vehiculoId of columnas) {
      if (celda(concepto, vehiculoId).valor !== "") editar(concepto, vehiculoId, { modo });
    }
  }

  async function enviar(plano: readonly unknown[]): Promise<GuardarValoresTarifaResult | null> {
    try {
      return await guardarValoresTarifa({ cambios: plano });
    } catch {
      return null;
    }
  }

  async function guardar() {
    if (enCurso.current) return;
    const { cambios, errores: locales } = plan;
    if (cambios.length === 0) {
      setErrores(locales);
      return;
    }
    enCurso.current = true;
    setGuardando(true);
    try {
      const r = await enviar(cambios);
      if (r === null || r.status !== "ok") {
        toast.error(TEXTOS.errorGuardar);
        setErrores(locales);
        return;
      }
      const fallos: Record<string, string[]> = { ...locales };
      for (const resultado of r.resultados) {
        if (resultado.status !== "ok") fallos[resultado.clave] = erroresDeResultado(resultado);
      }
      // R38: lo que fallo conserva lo digitado; lo demas vuelve a leerse de lo guardado.
      setBorrador((b) => Object.fromEntries(Object.entries(b).filter(([clave]) => fallos[clave] !== undefined)));
      setErrores(fallos);
      if (Object.keys(fallos).length > 0) toast.warning(TEXTOS.guardadoParcial);
      else toast.success(activada ? TEXTOS.guardadoEnVigor : TEXTOS.guardadoBorrador);
      await onGuardado();
    } finally {
      enCurso.current = false;
      setGuardando(false);
    }
  }

  const conceptos = conceptosDeActor(actor);
  const guardadosPorVehiculo = valoresPorVehiculo([...valores], actor);
  const conValorEnEstaPestana = new Set(guardadosPorVehiculo.map((v) => v.vehiculoId));
  // R47, R51: los activos, mas el inactivo que ya tiene un valor en este nivel y esta pestaña.
  const columnasVehiculo = vehiculos.filter((v) => v.activo || conValorEnEstaPestana.has(v.id));
  const porVehiculo = guardadosPorVehiculo.length > 0 || encendidoManual[actor] === true;
  const pestanaDePago = actor !== "tienda";
  const interruptorDeshabilitado = columnasVehiculo.length === 0;

  function descartarBorradorDeVehiculos() {
    setBorrador((b) =>
      Object.fromEntries(
        Object.entries(b).filter(([clave]) => {
          const [concepto, vehiculo] = clave.split(":") as [TarifaConcepto, string];
          return vehiculo === "todos" || CATALOGO_CONCEPTOS[concepto].actor !== actor;
        }),
      ),
    );
  }

  function alternarPorVehiculo(encendido: boolean) {
    if (encendido) {
      setEncendidoManual((e) => ({ ...e, [actor]: true }));
      return;
    }
    // R50: con valores guardados se pregunta antes, y al cancelar nada cambia.
    if (guardadosPorVehiculo.length > 0) {
      setConfirmarApagar(true);
      return;
    }
    descartarBorradorDeVehiculos();
    setEncendidoManual((e) => ({ ...e, [actor]: false }));
  }

  async function apagarConValores(): Promise<void> {
    const r = await enviar(
      guardadosPorVehiculo.map((v) => ({
        accion: "quitar",
        clave: claveDeCelda(v.concepto, v.vehiculoId),
        id: v.id,
      })),
    );
    if (r === null || r.status !== "ok") {
      toast.error(TEXTOS.errorGuardar);
      return;
    }
    const fallos = Object.fromEntries(
      r.resultados.filter((x) => x.status !== "ok").map((x) => [x.clave, erroresDeResultado(x)]),
    );
    setErrores(fallos);
    if (Object.keys(fallos).length > 0) toast.warning(TEXTOS.guardadoParcial);
    else {
      descartarBorradorDeVehiculos();
      setEncendidoManual((e) => ({ ...e, [actor]: false }));
      toast.success(activada ? TEXTOS.guardadoEnVigor : TEXTOS.guardadoBorrador);
    }
    await onGuardado();
  }

  const placeholder = placeholderDeNivel(nivel);
  const conIva = actor === "tienda";
  const conHoy = !activada;

  return (
    <>
      <Tabs value={actor} onValueChange={(v) => onActor(v as TarifaActor)}>
        <TabsList aria-label="Actor" className="flex-wrap gap-1 rounded-none border-b border-border px-[18px] pt-3.5 pb-0">
          {PESTANAS.map((p) => (
            <TabsTrigger key={p.actor} value={p.actor} className={PESTANA}>
              {p.nombre}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value={actor} className="mt-0">
          {esTienda && actor !== "tienda" ? (
            <p className="px-[18px] py-6 text-sm text-muted-foreground">{TEXTOS.tiendaSoloCobro}</p>
          ) : sinTienda ? (
            <p className="px-[18px] py-6 text-sm text-muted-foreground">{TEXTOS.tiendaSinElegir}</p>
          ) : (
            <>
              {pestanaDePago ? (
                <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pt-3">
                  <p className="min-w-0 flex-[1_1_360px] text-[13px] text-muted-foreground">
                    {interruptorDeshabilitado ? TEXTOS.sinVehiculos : TEXTOS.porVehiculoNota}
                  </p>
                  {puedeEscribir ? (
                    <label className="flex min-h-11 items-center gap-2.5 text-sm font-medium">
                      <Checkbox
                        checked={porVehiculo}
                        disabled={interruptorDeshabilitado}
                        onCheckedChange={(v) => alternarPorVehiculo(v)}
                        className={cn("size-5", FOCO)}
                      />
                      {TEXTOS.porVehiculo}
                    </label>
                  ) : null}
                </div>
              ) : null}

              {pestanaDePago && porVehiculo ? (
                <TarifasVehiculo
                  conceptos={conceptos}
                  columnas={columnasVehiculo}
                  guardados={guardados}
                  celda={celda}
                  modoDeFila={modoDeFila}
                  onCelda={(concepto, vehiculoId, valor) =>
                    editar(concepto, vehiculoId, {
                      valor,
                      ...(guardados.has(claveDeCelda(concepto, vehiculoId)) ? {} : { modo: modoDeFila(concepto) }),
                    })
                  }
                  onModoDeFila={(concepto, modo) =>
                    cambiarModoDeFila(concepto, modo, [null, ...columnasVehiculo.map((v) => v.id)])
                  }
                  referencia={(concepto, vehiculoId) => (conHoy ? referenciaDe(referencia, nivel, concepto, vehiculoId) : null)}
                  errores={errores}
                  soloLectura={!puedeEscribir}
                  placeholderTodos={placeholder}
                />
              ) : (
                <div data-testid="tarifas-rejilla" className="px-[18px] pt-2 pb-1">
                  <Table className="min-w-[620px]">
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead scope="col" className="text-xs font-semibold text-muted-foreground">
                          {TEXTOS.colConcepto}
                        </TableHead>
                        <TableHead scope="col" className="text-xs font-semibold text-muted-foreground">
                          {TEXTOS.colModo}
                        </TableHead>
                        <TableHead scope="col" className="text-xs font-semibold text-muted-foreground">
                          {TEXTOS.colValor}
                        </TableHead>
                        {conIva ? (
                          <TableHead scope="col" className="text-xs font-semibold text-muted-foreground">
                            {TEXTOS.colIva}
                          </TableHead>
                        ) : null}
                        {conHoy ? (
                          <TableHead scope="col" className="text-xs font-semibold text-muted-foreground">
                            {TEXTOS.colHoy}
                          </TableHead>
                        ) : null}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {conceptos.map((concepto) => {
                        const nombre = etiquetaConcepto(concepto);
                        const clave = claveDeCelda(concepto, null);
                        const guardado = guardados.get(clave);
                        const actual = celda(concepto, null);
                        const hoy = conHoy ? referenciaDe(referencia, nivel, concepto, null) : null;
                        const fallos = errores[clave];
                        const idError = `error-${clave}`;
                        return (
                          <TableRow key={concepto} className="hover:bg-transparent">
                            <TableCell className="font-medium whitespace-normal">
                              {nombre}
                              <FieldError id={idError} messages={fallos} />
                            </TableCell>
                            {puedeEscribir ? (
                              <>
                                <TableCell>
                                  <Select
                                    aria-label={TEXTOS.modoDe(nombre)}
                                    value={actual.modo}
                                    onValueChange={(m) =>
                                      editar(concepto, null, { modo: m === "porcentaje" ? "porcentaje" : "monto" })
                                    }
                                    options={[
                                      { value: "monto", label: etiquetaModo("monto") },
                                      { value: "porcentaje", label: etiquetaModo("porcentaje") },
                                    ]}
                                    className={cn("h-auto min-h-10 max-lg:min-h-11 w-[110px]", FOCO)}
                                  />
                                </TableCell>
                                <TableCell>
                                  <MontoInput
                                    aria-label={TEXTOS.valorDe(nombre)}
                                    aria-invalid={fallos === undefined ? undefined : true}
                                    aria-describedby={fallos === undefined ? undefined : idError}
                                    value={actual.valor}
                                    placeholder={placeholder}
                                    onChange={(valor) => editar(concepto, null, { valor })}
                                    className={cn("h-auto min-h-10 max-lg:min-h-11 w-[110px] text-right text-sm", FOCO)}
                                  />
                                </TableCell>
                                {conIva ? (
                                  <TableCell>
                                    <Input
                                      aria-label={TEXTOS.ivaDe(nombre)}
                                      inputMode="decimal"
                                      value={actual.ivaPct}
                                      onChange={(ev) => editar(concepto, null, { ivaPct: ev.target.value })}
                                      className={cn("h-auto min-h-10 max-lg:min-h-11 w-[70px] text-right text-sm", FOCO)}
                                    />
                                  </TableCell>
                                ) : null}
                              </>
                            ) : (
                              <>
                                <TableCell>{guardado === undefined ? "—" : etiquetaModo(guardado.modo)}</TableCell>
                                <TableCell>{guardado === undefined ? placeholder : textoValorSinIva(guardado)}</TableCell>
                                {conIva ? (
                                  <TableCell>
                                    {guardado?.ivaPct == null ? "—" : `${porcentajeParaVer(guardado.ivaPct)} %`}
                                  </TableCell>
                                ) : null}
                              </>
                            )}
                            {conHoy ? (
                              <TableCell className="text-muted-foreground">
                                {hoy === null ? "—" : textoReferencia(hoy)}
                              </TableCell>
                            ) : null}
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pt-3 pb-4 text-[13px] text-muted-foreground">
                <span className="min-w-0 flex-[1_1_240px]">{notaDe(nivel, actor)}</span>
                {puedeEscribir ? (
                  <Button
                    type="button"
                    className="min-h-11 px-4 font-semibold"
                    disabled={!haySinGuardar}
                    loading={guardando}
                    onClick={guardar}
                  >
                    {activada ? TEXTOS.guardarCambios : TEXTOS.guardarBorrador}
                  </Button>
                ) : null}
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      <Modal
        open={confirmarApagar}
        onOpenChange={setConfirmarApagar}
        title={TEXTOS.apagarTitulo}
        description={TEXTOS.apagarDetalle(guardadosPorVehiculo.length)}
        confirmLabel={TEXTOS.apagarSi}
        cancelLabel={TEXTOS.apagarNo}
        confirmVariant="destructive"
        size="md"
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={apagarConValores}
      />
    </>
  );
}
