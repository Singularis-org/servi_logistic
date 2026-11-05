"use client";

import type { TarifaConcepto } from "@prisma/client";

import { FieldError } from "@/components/shared/FieldError";
import { MontoInput } from "@/components/shared/MontoInput";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { monedaConfig } from "@/lib/config/moneda";
import type { VehiculoDePantalla } from "@/lib/interfaces/repositories/ITarifasPantallaRepository";
import type { Referencia } from "@/lib/tarifas/referencia-vigente";
import type { ModoTarifa, TarifaValorDTO } from "@/lib/types/tarifa-flexible";
import { cn } from "@/lib/utils";

import { claveDeCelda, type Celda } from "./tarifas-borrador";
import { etiquetaConcepto, etiquetaModo, textoReferencia, textoValorSinIva, TEXTOS } from "./tarifas-textos";

/** Design §9: el ancho que conserva cada campo; con muchos vehiculos desplaza el contenedor, no la pagina (R54). */
export const ANCHO_CONCEPTO_PX = 200;
export const ANCHO_COLUMNA_PX = 136;

export interface TarifasVehiculoProps {
  conceptos: readonly TarifaConcepto[];
  columnas: readonly VehiculoDePantalla[];
  guardados: ReadonlyMap<string, TarifaValorDTO>;
  celda: (concepto: TarifaConcepto, vehiculoId: string | null) => Celda;
  modoDeFila: (concepto: TarifaConcepto) => ModoTarifa;
  onCelda: (concepto: TarifaConcepto, vehiculoId: string | null, valor: string) => void;
  onModoDeFila: (concepto: TarifaConcepto, modo: ModoTarifa) => void;
  referencia: (concepto: TarifaConcepto, vehiculoId: string | null) => Referencia | null;
  errores: Readonly<Record<string, string[]>>;
  soloLectura: boolean;
  /** R39: lo que significa vacio en «Todos los vehiculos», segun el nivel. */
  placeholderTodos: string;
}

const FOCO = "focus-visible:ring-3 focus-visible:ring-ring";

/** R47-R51, R54, y la maqueta `Vehiculo`. Las columnas llegan calculadas: aqui ningun vehiculo esta escrito. */
export function TarifasVehiculo({
  conceptos,
  columnas,
  guardados,
  celda,
  modoDeFila,
  onCelda,
  onModoDeFila,
  referencia,
  errores,
  soloLectura,
  placeholderTodos,
}: Readonly<TarifasVehiculoProps>) {
  const anchoMinimo = ANCHO_CONCEPTO_PX + ANCHO_COLUMNA_PX * (columnas.length + 1);
  const columnasConTodos: readonly (VehiculoDePantalla | null)[] = [null, ...columnas];

  return (
    <div data-testid="tarifas-vehiculo" className="px-2.5 py-1">
      <Table style={{ minWidth: anchoMinimo }}>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead scope="col" className="sticky left-0 z-10 w-[200px] bg-card text-xs font-semibold text-muted-foreground">
              {TEXTOS.colConcepto}
            </TableHead>
            {columnasConTodos.map((v) => (
              <TableHead key={v?.id ?? "todos"} scope="col" className="text-right text-xs font-semibold text-muted-foreground">
                <span className="inline-flex items-center gap-1.5">
                  {v?.nombre ?? TEXTOS.todosLosVehiculos}
                  {v !== null && !v.activo ? <Badge variant="warning">{TEXTOS.inactivo}</Badge> : null}
                </span>
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {conceptos.map((concepto) => {
            const nombre = etiquetaConcepto(concepto);
            return (
              <TableRow key={concepto} className="hover:bg-transparent">
                <TableCell className="sticky left-0 z-10 w-[200px] bg-card align-top font-medium whitespace-normal">
                  <span className="block">{nombre}</span>
                  {soloLectura ? null : (
                    <Select
                      aria-label={TEXTOS.modoDe(nombre)}
                      value={modoDeFila(concepto)}
                      onValueChange={(m) => onModoDeFila(concepto, m === "porcentaje" ? "porcentaje" : "monto")}
                      options={[
                        { value: "monto", label: etiquetaModo("monto") },
                        { value: "porcentaje", label: etiquetaModo("porcentaje") },
                      ]}
                      className={cn("mt-1 h-auto min-h-10 max-lg:min-h-11 w-[110px] font-normal", FOCO)}
                    />
                  )}
                </TableCell>
                {columnasConTodos.map((v) => {
                  const vehiculoId = v?.id ?? null;
                  const clave = claveDeCelda(concepto, vehiculoId);
                  const guardado = guardados.get(clave);
                  const actual = celda(concepto, vehiculoId);
                  const columna = v?.nombre ?? TEXTOS.todosLosVehiculos;
                  const hoy = referencia(concepto, vehiculoId);
                  const fallos = errores[clave];
                  const idError = `error-${clave}`;
                  // R51: en un inactivo, lo guardado se edita y se quita; un valor nuevo no.
                  const bloqueada = v !== null && !v.activo && guardado === undefined;
                  const otroModo = actual.valor !== "" && actual.modo !== modoDeFila(concepto);
                  return (
                    <TableCell key={clave} className="text-right align-top whitespace-normal">
                      {soloLectura ? (
                        <span>{guardado === undefined ? v === null ? placeholderTodos : TEXTOS.usaGeneral : textoValorSinIva(guardado)}</span>
                      ) : (
                        <MontoInput
                          aria-label={TEXTOS.celdaDe(nombre, columna)}
                          aria-invalid={fallos === undefined ? undefined : true}
                          aria-describedby={fallos === undefined ? undefined : idError}
                          value={actual.valor}
                          disabled={bloqueada}
                          placeholder={v === null ? placeholderTodos : TEXTOS.usaGeneral}
                          onChange={(valor) => onCelda(concepto, vehiculoId, valor)}
                          className={cn("ml-auto h-auto min-h-10 max-lg:min-h-11 w-[120px] text-right text-sm", FOCO)}
                        />
                      )}
                      {otroModo && !soloLectura ? (
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {actual.modo === "porcentaje" ? TEXTOS.enPorcentaje : TEXTOS.enMonto(monedaConfig.simbolo)}
                        </span>
                      ) : null}
                      {hoy === null ? null : (
                        <span className="mt-1 block text-xs text-muted-foreground">{TEXTOS.hoy(textoReferencia(hoy))}</span>
                      )}
                      <FieldError id={idError} messages={fallos} />
                    </TableCell>
                  );
                })}
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
