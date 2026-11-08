"use client";

import { useMemo, useState } from "react";
import type { TarifaConcepto } from "@prisma/client";

import { FieldError } from "@/components/shared/FieldError";
import { Modal } from "@/components/shared/Modal";
import { MontoInput } from "@/components/shared/MontoInput";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import { guardarValoresTarifa, type GuardarValoresTarifaResult } from "@/lib/actions/tarifas";
import type { MensajeroDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import { cn } from "@/lib/utils";

import {
  celdaDeGuardado,
  claveDeCelda,
  erroresDeResultado,
  indiceDeValores,
  planDeGuardado,
  type Celda,
  type CeldaEditada,
} from "./tarifas-borrador";
import { conceptosDeActor, etiquetaConcepto, etiquetaModo, modoPorDefecto, TEXTOS } from "./tarifas-textos";
import type { FilaMensajero } from "./TarifasMensajeros";

const CAMPO = "h-auto min-h-11 w-[110px] max-sm:w-full focus-visible:ring-3 focus-visible:ring-ring";
const ROTULO_APILADO = "mb-1 block text-xs font-semibold text-muted-foreground sm:hidden";

export interface TarifaMensajeroDialogoProps {
  filas: readonly FilaMensajero[];
  /** R31: elegibles y sin valor propio. */
  disponibles: readonly MensajeroDePantalla[];
  /** `null`: se está añadiendo. */
  mensajeroInicialId: string | null;
  activada: boolean;
  onCerrar: () => void;
  onCambio: () => Promise<void> | void;
}

async function enviar(cambios: readonly unknown[]): Promise<GuardarValoresTarifaResult | null> {
  try {
    return await guardarValoresTarifa({ cambios });
  } catch {
    return null;
  }
}

/**
 * R28-R32: los valores de un mensajero. Sin IVA ni «Hoy rige» (el modelo viejo no tiene valor por mensajero).
 * Lo digitado vive aquí y cerrar lo descarta. Se monta al abrir: su estado no sobrevive a un cierre.
 */
export function TarifaMensajeroDialogo({
  filas,
  disponibles,
  mensajeroInicialId,
  activada,
  onCerrar,
  onCambio,
}: Readonly<TarifaMensajeroDialogoProps>) {
  const toast = useToast();
  const [elegido, setElegido] = useState(mensajeroInicialId ?? "");
  // Tras guardar algo, el elegido gana valores y sale de `disponibles`; además, cambiarlo aquí dejaría atrás lo ya
  // guardado sin decirlo. Por eso el selector desaparece.
  const [fijado, setFijado] = useState(mensajeroInicialId !== null);
  const [borrador, setBorrador] = useState<Readonly<Record<string, Celda>>>({});
  const [errores, setErrores] = useState<Readonly<Record<string, string[]>>>({});

  const fila = filas.find((f) => f.mensajeroId === elegido);
  const guardados = useMemo(() => indiceDeValores(fila?.valores ?? []), [fila]);
  const nombre = fila?.nombre ?? disponibles.find((m) => m.id === elegido)?.nombre ?? "";
  const inactivo = fila?.inactivo === true;

  const editadas: CeldaEditada[] = Object.entries(borrador).map(([clave, celda]) => {
    const [concepto] = clave.split(":") as [TarifaConcepto, string];
    return { clave, concepto, vehiculoId: null, guardado: guardados.get(clave), celda };
  });
  const plan = planDeGuardado(editadas, { zonaId: null, grupoId: null, tiendaId: null, mensajeroId: elegido });

  function celdaDe(concepto: TarifaConcepto): Celda {
    const clave = claveDeCelda(concepto, null);
    return borrador[clave] ?? celdaDeGuardado(guardados.get(clave), modoPorDefecto(concepto));
  }

  function editar(concepto: TarifaConcepto, cambio: Partial<Celda>) {
    const clave = claveDeCelda(concepto, null);
    const actual = celdaDe(concepto);
    setBorrador((b) => ({ ...b, [clave]: { ...(b[clave] ?? actual), ...cambio } }));
  }

  async function guardar(): Promise<void> {
    const { cambios } = plan;
    const r = await enviar(cambios);
    if (r === null || r.status !== "ok") {
      toast.error(TEXTOS.errorGuardar);
      return;
    }
    const fallos: Record<string, string[]> = {};
    for (const resultado of r.resultados) {
      if (resultado.status !== "ok") fallos[resultado.clave] = erroresDeResultado(resultado);
    }
    if (Object.keys(fallos).length === 0) {
      toast.success(activada ? TEXTOS.guardadoEnVigor : TEXTOS.guardadoBorrador);
      onCerrar();
      await onCambio();
      return;
    }
    // R30: lo que falló conserva lo digitado; lo demás vuelve a leerse de lo guardado.
    setBorrador((b) => Object.fromEntries(Object.entries(b).filter(([clave]) => fallos[clave] !== undefined)));
    setErrores(fallos);
    if (r.resultados.some((resultado) => resultado.status === "ok")) {
      setFijado(true);
      toast.warning(TEXTOS.guardadoParcial);
    } else {
      // Nada de este intento se guardó. No se llama a `setFijado(false)`: si un intento anterior guardó algo, sigue fijo.
      toast.error(TEXTOS.guardadoNinguno);
    }
    await onCambio();
  }

  function elegir(mensajeroId: string) {
    setElegido(mensajeroId);
    // Un error puede venir del mensajero anterior (p. ej. dado de baja): no se le atribuye al nuevo.
    setErrores({});
  }

  const sinOpciones = !fijado && disponibles.length === 0;
  const nota = `${TEXTOS.sinIva} ${TEXTOS.vacioGrupo} ${TEXTOS.ceroPaga} ${TEXTOS.mensajerosBase}`;
  const titulo = mensajeroInicialId === null ? TEXTOS.anadirMensajeroTitulo : TEXTOS.editarMensajeroTitulo(nombre);

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={titulo}
      description={sinOpciones ? undefined : nota}
      confirmLabel={activada ? TEXTOS.guardarCambios : TEXTOS.guardarBorrador}
      cancelLabel={sinOpciones ? TEXTOS.cerrar : TEXTOS.cancelar}
      hideConfirm={sinOpciones}
      confirmDisabled={elegido === "" || plan.cambios.length === 0}
      closeOnConfirm={false}
      size="lg"
      className="[&_button[data-slot=button]]:min-h-11"
      onConfirm={guardar}
    >
      {sinOpciones ? (
        <p className="text-sm text-muted-foreground">{TEXTOS.sinMensajeros}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {fijado ? (
            <p className="inline-flex flex-wrap items-center gap-1.5 text-sm font-medium">
              {nombre}
              {inactivo ? <Badge variant="warning">{TEXTOS.inactivo}</Badge> : null}
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="tarifa-mensajero" className="font-normal text-muted-foreground">
                {TEXTOS.colMensajero}
              </Label>
              <Select
                id="tarifa-mensajero"
                value={elegido}
                placeholder={TEXTOS.elegirMensajero}
                onValueChange={elegir}
                options={disponibles.map((m) => ({ value: m.id, label: m.nombre }))}
                className="h-auto min-h-11 w-auto min-w-[200px] focus-visible:ring-3 focus-visible:ring-ring"
              />
            </div>
          )}
          {inactivo ? <p className="text-[13px] text-muted-foreground">{TEXTOS.mensajeroInactivoNota}</p> : null}

          {/* En un teléfono los dos campos no caben junto al concepto y un importe se vería cortado: cada fila se apila.
              `display` le quita la semántica de tabla a la fila en algunos navegadores; los `role` la conservan. */}
          <Table role="table" className="max-sm:block">
            <TableHeader role="rowgroup" className="max-sm:sr-only">
              <TableRow role="row" className="hover:bg-transparent">
                <TableHead role="columnheader" scope="col" className="text-xs font-semibold text-muted-foreground">
                  {TEXTOS.colConcepto}
                </TableHead>
                <TableHead role="columnheader" scope="col" className="text-xs font-semibold text-muted-foreground">
                  {TEXTOS.colModo}
                </TableHead>
                <TableHead role="columnheader" scope="col" className="text-xs font-semibold text-muted-foreground">
                  {TEXTOS.colValor}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody role="rowgroup" className="max-sm:block">
              {conceptosDeActor("mensajero").map((concepto) => {
                const etiqueta = etiquetaConcepto(concepto);
                const clave = claveDeCelda(concepto, null);
                const actual = celdaDe(concepto);
                const fallos = errores[clave];
                const idError = `error-mensajero-${clave}`;
                // R32: a un dado de baja se le puede cambiar lo que tiene, pero no sumarle un valor nuevo.
                const deshabilitada = inactivo && !guardados.has(clave);
                return (
                  <TableRow
                    key={concepto}
                    role="row"
                    // `px-1`: el contenedor recorta, y sin este margen se comería el anillo de foco de los campos.
                    className="hover:bg-transparent max-sm:grid max-sm:grid-cols-2 max-sm:gap-x-2 max-sm:gap-y-1.5 max-sm:px-1 max-sm:py-3"
                  >
                    <TableCell role="cell" className="font-medium whitespace-normal max-sm:col-span-2 max-sm:p-0">
                      {etiqueta}
                      <FieldError id={idError} messages={fallos} />
                    </TableCell>
                    <TableCell role="cell" className="max-sm:p-0">
                      <span aria-hidden="true" className={ROTULO_APILADO}>
                        {TEXTOS.colModo}
                      </span>
                      <Select
                        aria-label={TEXTOS.modoDe(etiqueta)}
                        value={actual.modo}
                        disabled={deshabilitada}
                        onValueChange={(m) => editar(concepto, { modo: m === "porcentaje" ? "porcentaje" : "monto" })}
                        options={[
                          { value: "monto", label: etiquetaModo("monto") },
                          { value: "porcentaje", label: etiquetaModo("porcentaje") },
                        ]}
                        className={CAMPO}
                      />
                    </TableCell>
                    <TableCell role="cell" className="max-sm:p-0">
                      <span aria-hidden="true" className={ROTULO_APILADO}>
                        {TEXTOS.colValor}
                      </span>
                      <MontoInput
                        aria-label={TEXTOS.valorDe(etiqueta)}
                        aria-invalid={fallos === undefined ? undefined : true}
                        aria-describedby={fallos === undefined ? undefined : idError}
                        value={actual.valor}
                        disabled={deshabilitada}
                        placeholder={TEXTOS.usaZona}
                        onChange={(valor) => editar(concepto, { valor })}
                        className={cn(CAMPO, "text-right text-sm")}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </Modal>
  );
}
