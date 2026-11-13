"use client";

import { useEffect, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { money } from "@/lib/config/moneda";
import type {
  CuotaDeLaFactura,
  DetalleDeFactura as DetalleDeFacturaDTO,
  DetalleFacturaResult,
  FacturaPlataformaDTO,
  PaginaDeLineas,
} from "@/lib/types/factura-plataforma";

import {
  FACTURAS_TEXTOS,
  diasVisibles,
  esNoCerrada,
  estadoVisible,
  instanteVisible,
  numeroVisible,
  paginasDe,
  periodoVisible,
} from "./facturas-vista";

// SLT-119 (design §6.1; R6–R11, R16, R17) — el detalle de una factura en un panel lateral de la misma pantalla
// (P4), sin ruta nueva. Lo pide al abrirse y al paginar con la función que le pasa la pantalla: la action del
// maestro o la del superadmin ligada a su empresa. Solo lectura: los únicos botones son cerrar y paginar (R16).

/** La lectura del detalle: la action de «Mi plan» o la del detalle de empresa, ya ligada. */
export type CargarDetalleFactura = (input: { facturaId: string; pagina: number }) => Promise<DetalleFacturaResult>;

export interface DetalleDeFacturaProps {
  /** La fila elegida en la lista; `null` = panel cerrado. */
  readonly factura: FacturaPlataformaDTO | null;
  readonly onCerrar: () => void;
  readonly cargarDetalle: CargarDetalleFactura;
}

const T = FACTURAS_TEXTOS.detalle;

export function DetalleDeFactura({ factura, onCerrar, cargarDetalle }: DetalleDeFacturaProps) {
  return (
    <Sheet open={factura !== null} onOpenChange={(abierto) => !abierto && onCerrar()}>
      {factura !== null && (
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl data-[side=right]:sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>
              {FACTURAS_TEXTOS.tituloDetalle(numeroVisible(factura), periodoVisible(factura.desde, factura.hasta))}
            </SheetTitle>
            <SheetDescription>{FACTURAS_TEXTOS.descripcionDetalle}</SheetDescription>
          </SheetHeader>
          {/* `key`: otra factura empieza en la página 1 y sin la respuesta de la anterior. */}
          <CuerpoDelDetalle key={factura.id} facturaId={factura.id} cargarDetalle={cargarDetalle} />
        </SheetContent>
      )}
    </Sheet>
  );
}

/** La respuesta de una página: el detalle o el fallo (un throw o un estado distinto de `ok`, R17). */
type Respuesta = { pagina: number; detalle: DetalleDeFacturaDTO | null };

function CuerpoDelDetalle({ facturaId, cargarDetalle }: { facturaId: string; cargarDetalle: CargarDetalleFactura }) {
  const [pagina, setPagina] = useState(1);
  const [respuesta, setRespuesta] = useState<Respuesta | null>(null);

  useEffect(() => {
    let vigente = true;
    cargarDetalle({ facturaId, pagina }).then(
      (r) => {
        if (vigente) setRespuesta({ pagina, detalle: r.estado === "ok" ? r.detalle : null });
      },
      (error: unknown) => {
        console.error("[DetalleDeFactura] cargarDetalle lanzó", error);
        if (vigente) setRespuesta({ pagina, detalle: null });
      },
    );
    return () => {
      vigente = false;
    };
  }, [cargarDetalle, facturaId, pagina]);

  // La respuesta de otra página es vieja: mientras llega la de esta, se está cargando.
  if (respuesta === null || respuesta.pagina !== pagina) {
    return (
      <p role="status" className="px-4 text-sm text-muted-foreground">
        {FACTURAS_TEXTOS.cargando}
      </p>
    );
  }
  if (respuesta.detalle === null) {
    return (
      <p role="alert" className="px-4 text-sm text-destructive">
        {FACTURAS_TEXTOS.errorDetalle}
      </p>
    );
  }
  const { factura, lineas } = respuesta.detalle;
  return (
    <div className="flex flex-col gap-6 px-4 pb-6">
      <Cabecera factura={factura} />
      <Cuotas factura={factura} />
      <Resumen factura={factura} />
      <Lineas lineas={lineas} onPagina={setPagina} />
    </div>
  );
}

function Dato({ nombre, children }: { nombre: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[minmax(8rem,auto)_1fr] gap-x-3 py-1.5">
      <dt className="text-sm text-muted-foreground">{nombre}</dt>
      <dd className="min-w-0 text-sm">{children}</dd>
    </div>
  );
}

/** R6: número (si es cerrada), período, estado, plan de las órdenes y su periodicidad. */
function Cabecera({ factura }: { factura: FacturaPlataformaDTO }) {
  const numero = numeroVisible(factura);
  return (
    <dl className="divide-y divide-border">
      {numero !== null && <Dato nombre={T.numero}>{numero}</Dato>}
      <Dato nombre={T.periodo}>{periodoVisible(factura.desde, factura.hasta)}</Dato>
      <Dato nombre={T.estado}>{estadoVisible(factura)}</Dato>
      <Dato nombre={T.plan}>{factura.plan?.planNombre ?? FACTURAS_TEXTOS.sinPlan}</Dato>
      <Dato nombre={T.periodicidad}>{FACTURAS_TEXTOS.periodicidad[factura.periodicidad]}</Dato>
    </dl>
  );
}

/** R2, R6: cada cuota, emitida o prevista, con su plan, tipo de cobro, tramo e importe. */
function Cuotas({ factura }: { factura: FacturaPlataformaDTO }) {
  const cuotas: [string, CuotaDeLaFactura][] = [];
  if (factura.cuota !== null) cuotas.push([T.cuotaEmision, factura.cuota]);
  if (factura.primeraCuota !== null) cuotas.push([T.primeraCuota, factura.primeraCuota]);
  const prevista = esNoCerrada(factura);
  return (
    <section aria-label={T.cuotas} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{T.cuotas}</h3>
      {cuotas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{T.sinCuotas}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{T.cuotas}</TableHead>
              <TableHead>{FACTURAS_TEXTOS.columnas.plan}</TableHead>
              <TableHead>{T.tipoCobro}</TableHead>
              <TableHead>{T.tramo}</TableHead>
              <TableHead className="text-right">{T.importe}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cuotas.map(([nombre, c]) => {
              const dias = diasVisibles(c);
              return (
                <TableRow key={nombre}>
                  <TableCell>
                    {nombre}
                    {prevista && <span className="ml-1 text-muted-foreground">({FACTURAS_TEXTOS.prevista})</span>}
                  </TableCell>
                  <TableCell>{c.planNombre}</TableCell>
                  <TableCell>{FACTURAS_TEXTOS.tipoCobro[c.tipoCobro]}</TableCell>
                  <TableCell>
                    {periodoVisible(c.desde, c.hasta)}
                    {dias !== null && <span className="block text-muted-foreground">{dias}</span>}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{money(c.cuota)}</TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </section>
  );
}

/** R6, R10: los totales de la factura entera, como los da la base (R5), no los de la página. */
function Resumen({ factura }: { factura: FacturaPlataformaDTO }) {
  return (
    <section aria-label={T.resumen} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{T.resumen}</h3>
      <dl className="divide-y divide-border">
        <Dato nombre={T.cargos}>
          <span className="tabular-nums">{money(factura.cargos)}</span>
        </Dato>
        <Dato nombre={T.reversos}>
          <span className="tabular-nums">{money(factura.reversos)}</span>
        </Dato>
        <Dato nombre={T.movimientos}>
          <span className="tabular-nums">{factura.movimientos}</span>
        </Dato>
        <Dato nombre={T.totalOrdenes}>
          <span className="tabular-nums">{money(factura.totalOrdenes)}</span>
        </Dato>
        <Dato nombre={T.total}>
          <span className="font-semibold tabular-nums">{money(factura.total)}</span>
        </Dato>
      </dl>
    </section>
  );
}

/** R7, R9, R10: una página de cargos y reversos, con «—» sin guía y el valor con su signo. */
function Lineas({ lineas, onPagina }: { lineas: PaginaDeLineas; onPagina: (pagina: number) => void }) {
  const L = FACTURAS_TEXTOS.lineas;
  const P = FACTURAS_TEXTOS.paginacion;
  const paginas = paginasDe(lineas.total, lineas.porPagina);
  return (
    <section aria-label={T.lineas} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{T.lineas}</h3>
      {lineas.lineas.length === 0 ? (
        <p className="text-sm text-muted-foreground">{T.sinLineas}</p>
      ) : (
        <Table>
          <TableCaption className="sr-only">{T.lineas}</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>{L.instante}</TableHead>
              <TableHead>{L.guia}</TableHead>
              <TableHead>{L.tipo}</TableHead>
              <TableHead className="text-right">{L.valor}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lineas.lineas.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="whitespace-nowrap">{instanteVisible(l.instante)}</TableCell>
                <TableCell>{l.numGuia ?? FACTURAS_TEXTOS.sinGuia}</TableCell>
                <TableCell>{L.tipos[l.tipo]}</TableCell>
                <TableCell className="text-right tabular-nums">{money(l.valor)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <nav aria-label={P.etiqueta} className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          {P.total(lineas.total)} · {P.pagina(lineas.pagina, paginas)}
        </p>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lineas.pagina <= 1}
            onClick={() => onPagina(lineas.pagina - 1)}
          >
            {P.anterior}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={lineas.pagina >= paginas}
            onClick={() => onPagina(lineas.pagina + 1)}
          >
            {P.siguiente}
          </Button>
        </div>
      </nav>
    </section>
  );
}
