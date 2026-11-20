"use client";

import { useId, useMemo } from "react";

import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/config/moneda";
import { claveDeFactura, type FacturaConSaldoDTO } from "@/lib/types/pago-plataforma";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { resumenDelReparto } from "@/lib/utils/reparto-pago-plataforma";

// SLT-143 (design §6.1) — la tabla del reparto de un pago entre las facturas cerradas, sacada de
// `PagosPorConfirmar.tsx` (SLT-60 R14, R17) para que la use también el registro por fuera (R4, R5). Pinta lo
// que le dan: los montos y los errores son de quien la usa. El pie («Repartido … de …», «Falta …») sale de
// `resumenDelReparto`, en céntimos `bigint`. Ni `Number(` ni `parseFloat`.

/** Textos de la tabla, en un solo sitio para cuando llegue la i18n. Forma impersonal. */
const TEXTOS = {
  factura: (numero: number) => `N.º ${numero}`,
  columnas: {
    factura: "Factura",
    periodo: "Período",
    total: "Total",
    saldo: "Saldo",
    aplicar: "Aplicar",
  },
  repartido: (suma: string, monto: string) => `Repartido ${suma} de ${monto}`,
  falta: (falta: string) => `Falta ${falta}`,
} as const;

/** «5 oct 2026» en la zona de la plataforma (SLT-60 design §7: `ZONA_CR` hasta SLT-90). */
function fecha(instante: Date): string {
  return fechaCortaEnZona(instante, ZONA_CR);
}

/** El período de una factura: `hasta` es exclusivo, así que el último día es `hasta` − 1 ms. */
function periodo(f: FacturaConSaldoDTO): string {
  return `${fecha(f.desde)} – ${fecha(new Date(f.hasta.getTime() - 1))}`;
}

export interface RepartoEntreFacturasProps {
  /** El monto del pago, texto con dos decimales (ya válido). */
  monto: string;
  /** Las facturas cerradas con saldo, de la más vieja a la más nueva. */
  facturas: readonly FacturaConSaldoDTO[];
  /** Lo que se aplica a cada factura, por id. */
  montos: Readonly<Record<string, string>>;
  onCambio: (facturaId: string, valor: string) => void;
  /** `aplicaciones.<facturaId>` bajo su fila y `aplicaciones` en el pie. */
  errores: Readonly<Record<string, string>>;
}

export function RepartoEntreFacturas({ monto, facturas, montos, onCambio, errores }: Readonly<RepartoEntreFacturasProps>) {
  const resumen = useMemo(() => resumenDelReparto(monto, facturas, montos), [monto, facturas, montos]);
  const errorGeneral = errores.aplicaciones;

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{TEXTOS.columnas.factura}</TableHead>
            <TableHead>{TEXTOS.columnas.periodo}</TableHead>
            <TableHead className="text-right">{TEXTOS.columnas.total}</TableHead>
            <TableHead className="text-right">{TEXTOS.columnas.saldo}</TableHead>
            <TableHead>{TEXTOS.columnas.aplicar}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {facturas.map((f) => (
            <FilaDeFactura
              key={f.id}
              factura={f}
              valor={montos[f.id] ?? ""}
              error={errores[claveDeFactura(f.id)]}
              onCambiar={(v) => onCambio(f.id, v)}
            />
          ))}
        </TableBody>
      </Table>

      <div className="flex flex-col gap-1 text-sm tabular-nums" aria-live="polite">
        <span>{TEXTOS.repartido(money(resumen.suma), money(monto))}</span>
        <span>{TEXTOS.falta(money(resumen.falta))}</span>
        {errorGeneral === undefined ? null : <span className="text-destructive">{errorGeneral}</span>}
      </div>
    </>
  );
}

function FilaDeFactura({
  factura,
  valor,
  error,
  onCambiar,
}: {
  factura: FacturaConSaldoDTO;
  valor: string;
  error: string | undefined;
  onCambiar: (valor: string) => void;
}) {
  const errorId = useId();
  const nombre = TEXTOS.factura(factura.numero);
  return (
    <TableRow data-factura-id={factura.id}>
      <TableCell className="whitespace-nowrap">{nombre}</TableCell>
      <TableCell className="whitespace-nowrap">{periodo(factura)}</TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(factura.total)}</TableCell>
      <TableCell className="text-right whitespace-nowrap tabular-nums">{money(factura.saldo)}</TableCell>
      <TableCell className="min-w-32 align-top">
        <Input
          inputMode="decimal"
          aria-label={`${TEXTOS.columnas.aplicar} · ${nombre}`}
          aria-invalid={error === undefined ? undefined : true}
          aria-describedby={error === undefined ? undefined : errorId}
          value={valor}
          onChange={(e) => onCambiar(e.target.value)}
        />
        {error === undefined ? null : (
          <p id={errorId} className="mt-1 text-xs text-destructive">
            {error}
          </p>
        )}
      </TableCell>
    </TableRow>
  );
}
