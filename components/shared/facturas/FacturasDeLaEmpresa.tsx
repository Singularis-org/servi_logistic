"use client";

import { useId, useState } from "react";

import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/config/moneda";
import type { FacturaPlataformaDTO } from "@/lib/types/factura-plataforma";

import { DetalleDeFactura, type CargarDetalleFactura } from "./DetalleDeFactura";
import {
  FACTURAS_TEXTOS,
  esNoCerrada,
  estadoVisible,
  numeroVisible,
  periodoVisible,
  sumaDeCuotas,
} from "./facturas-vista";

// SLT-119 (design §6.1; R1, R2, R5, R16–R18) — la lista de facturas de UNA empresa, para la sección de «Mi plan»
// y la pestaña «Facturación» del detalle de empresa. Las facturas van por empresa, no por plan (decisión del
// humano, 2026-11-12): no se filtran ni se agrupan por plan y el plan es una columna más. Llegan ya ordenadas de la
// más reciente a la más antigua (el servicio). Solo lectura: el único botón de cada fila abre su detalle (R16).

export interface FacturasDeLaEmpresaProps {
  /** Las facturas de la empresa; `null` = no se pudieron leer (R17). */
  readonly facturas: FacturaPlataformaDTO[] | null;
  readonly cargarDetalle: CargarDetalleFactura;
}

const C = FACTURAS_TEXTOS.columnas;

export function FacturasDeLaEmpresa({ facturas, cargarDetalle }: FacturasDeLaEmpresaProps) {
  const tituloId = useId();
  const [abierta, setAbierta] = useState<FacturaPlataformaDTO | null>(null);
  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={tituloId} className="text-lg font-semibold">
          {FACTURAS_TEXTOS.titulo}
        </h2>
        <p className="text-sm text-muted-foreground">{FACTURAS_TEXTOS.ayuda}</p>
      </div>
      <Cuerpo facturas={facturas} onAbrir={setAbierta} />
      <DetalleDeFactura factura={abierta} onCerrar={() => setAbierta(null)} cargarDetalle={cargarDetalle} />
    </section>
  );
}

function Cuerpo({
  facturas,
  onAbrir,
}: {
  facturas: FacturaPlataformaDTO[] | null;
  onAbrir: (f: FacturaPlataformaDTO) => void;
}) {
  if (facturas === null) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {FACTURAS_TEXTOS.errorLista}
      </p>
    );
  }
  if (facturas.length === 0) {
    return <p className="text-sm text-muted-foreground">{FACTURAS_TEXTOS.vacio}</p>;
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{C.numero}</TableHead>
          <TableHead>{C.periodo}</TableHead>
          <TableHead>{C.plan}</TableHead>
          <TableHead className="text-right">{C.ordenes}</TableHead>
          <TableHead className="text-right">{C.cuotas}</TableHead>
          <TableHead className="text-right">{C.total}</TableHead>
          <TableHead>{C.estado}</TableHead>
          <TableHead>
            <span className="sr-only">{C.acciones}</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {facturas.map((f) => (
          <Fila key={f.id} factura={f} onAbrir={onAbrir} />
        ))}
      </TableBody>
    </Table>
  );
}

/** R1, R2, R5: una factura con los importes de la base y, si no está cerrada, sus cuotas como «prevista». */
function Fila({ factura, onAbrir }: { factura: FacturaPlataformaDTO; onAbrir: (f: FacturaPlataformaDTO) => void }) {
  const periodo = periodoVisible(factura.desde, factura.hasta);
  const cuotas = sumaDeCuotas(factura);
  return (
    <TableRow>
      <TableCell>{numeroVisible(factura) ?? FACTURAS_TEXTOS.sinNumero}</TableCell>
      <TableCell className="whitespace-nowrap">{periodo}</TableCell>
      <TableCell>{factura.plan?.planNombre ?? FACTURAS_TEXTOS.sinPlan}</TableCell>
      <TableCell className="text-right tabular-nums">{money(factura.totalOrdenes)}</TableCell>
      <TableCell className="text-right tabular-nums">
        {money(cuotas)}
        {cuotas !== null && esNoCerrada(factura) && (
          <span className="ml-1 text-muted-foreground">({FACTURAS_TEXTOS.prevista})</span>
        )}
      </TableCell>
      <TableCell className="text-right font-medium tabular-nums">{money(factura.total)}</TableCell>
      <TableCell>{estadoVisible(factura)}</TableCell>
      <TableCell>
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={FACTURAS_TEXTOS.verDetalleDe(periodo)}
          onClick={() => onAbrir(factura)}
        >
          {FACTURAS_TEXTOS.verDetalle}
        </Button>
      </TableCell>
    </TableRow>
  );
}
