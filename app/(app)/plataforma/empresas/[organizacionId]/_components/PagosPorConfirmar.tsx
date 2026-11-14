"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/EmptyState";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/config/moneda";
import {
  claveDeFactura,
  type ConfirmarPagoInput,
  type ConfirmarPagoResult,
  type FacturaConSaldoDTO,
  type PagoPorConfirmarDTO,
  type PagosDeEmpresa,
  type VerComprobantePagoResult,
} from "@/lib/types/pago-plataforma";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";
import { ZONA_CR } from "@/lib/utils/fecha-cr";
import { proponerReparto, resumenDelReparto } from "@/lib/utils/reparto-pago-plataforma";

// SLT-60 (design §6.1; R12–R14, R17, R23, R32, R33) — la sección «Pagos por confirmar» del detalle de una
// empresa para el superadmin. Los datos llegan por props desde `page.tsx` (Server Component): este
// componente no lee nada por su cuenta. Las cifras son texto con dos decimales; las cuentas del reparto las
// hace `lib/utils/reparto-pago-plataforma.ts` en céntimos `bigint`, y quien decide si el reparto vale es la
// base al confirmar. Ni `Number(` ni `parseFloat`.

/** Textos de la sección, en un solo sitio para cuando llegue la i18n. Forma impersonal (design §6.1). */
const TEXTOS = {
  titulo: "Pagos por confirmar",
  ayuda: "Pagos que la empresa registró en su wallet. Al confirmarlos se aplican a sus facturas cerradas y baja su deuda.",
  vacio: "No hay pagos por confirmar",
  falloLectura: "No se pudieron cargar los pagos por confirmar",
  columnas: {
    fecha: "Fecha",
    monto: "Monto",
    referencia: "Referencia",
    registradoPor: "Registrado por",
    comprobante: "Comprobante",
  },
  verComprobante: "Ver comprobante",
  sinComprobante: "Sin comprobante",
  falloComprobante: "No se pudo abrir el comprobante",
  confirmar: "Confirmar…",
  tituloDialogo: (monto: string) => `Confirmar pago de ${monto}`,
  confirmarPago: "Confirmar pago",
  sinFacturas: "La empresa no tiene facturas cerradas con saldo",
  factura: (numero: number) => `N.º ${numero}`,
  dialogoColumnas: {
    factura: "Factura",
    periodo: "Período",
    total: "Total",
    saldo: "Saldo",
    aplicar: "Aplicar",
  },
  repartido: (suma: string, monto: string) => `Repartido ${suma} de ${monto}`,
  falta: (falta: string) => `Falta ${falta}`,
  yaConfirmado: "Este pago ya estaba confirmado",
  noEncontrado: "El pago ya no está por confirmar",
  falloConfirmar: "No se pudo confirmar ahora",
} as const;

/** Lo que se pinta en una celda sin dato (la misma raya larga que `money`). */
const SIN_DATO = "—";

/** «5 oct 2026» en la zona de la plataforma (design §7: `ZONA_CR` hasta SLT-90). */
function fecha(instante: Date): string {
  return fechaCortaEnZona(instante, ZONA_CR);
}

/** El período de una factura: `hasta` es exclusivo, así que el último día es `hasta` − 1 ms. */
function periodo(f: FacturaConSaldoDTO): string {
  return `${fecha(f.desde)} – ${fecha(new Date(f.hasta.getTime() - 1))}`;
}

export interface PagosPorConfirmarProps {
  /** Los pagos y las facturas con saldo; `null` = la lectura falló (R13). */
  datos: PagosDeEmpresa | null;
  organizacionId: string;
  /** `confirmarPagoPlataformaAction` (R16, R23). */
  confirmar: (input: ConfirmarPagoInput) => Promise<ConfirmarPagoResult>;
  /** `verComprobantePagoPlataformaAction` ligada con la empresa en el servidor: solo viaja el pago (R33). */
  verComprobante: (pagoId: string) => Promise<VerComprobantePagoResult>;
}

export function PagosPorConfirmar({ datos, organizacionId, confirmar, verComprobante }: Readonly<PagosPorConfirmarProps>) {
  const tituloId = useId();
  const ayudaId = useId();
  const [enConfirmacion, setEnConfirmacion] = useState<PagoPorConfirmarDTO | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <section aria-labelledby={tituloId} aria-describedby={ayudaId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={tituloId} className="text-base font-semibold">
          {TEXTOS.titulo}
        </h2>
        <p id={ayudaId} className="text-sm text-muted-foreground">
          {TEXTOS.ayuda}
        </p>
      </div>

      {aviso === null ? null : (
        <p role="status" className="text-sm">
          {aviso}
        </p>
      )}

      {datos === null ? (
        <Alert variant="destructive">
          <AlertDescription>{TEXTOS.falloLectura}</AlertDescription>
        </Alert>
      ) : datos.pagos.length === 0 ? (
        <EmptyState title={TEXTOS.vacio} />
      ) : (
        <Table aria-labelledby={tituloId}>
          <TableHeader>
            <TableRow>
              <TableHead>{TEXTOS.columnas.fecha}</TableHead>
              <TableHead className="text-right">{TEXTOS.columnas.monto}</TableHead>
              <TableHead>{TEXTOS.columnas.referencia}</TableHead>
              <TableHead>{TEXTOS.columnas.registradoPor}</TableHead>
              <TableHead>{TEXTOS.columnas.comprobante}</TableHead>
              <TableHead>
                <span className="sr-only">{TEXTOS.confirmarPago}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.pagos.map((pago) => (
              <FilaDePago
                key={pago.id}
                pago={pago}
                verComprobante={verComprobante}
                onConfirmar={() => {
                  setAviso(null);
                  setEnConfirmacion(pago);
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {datos !== null && enConfirmacion !== null ? (
        <DialogoConfirmar
          // Una instancia por pago: el reparto propuesto se recalcula al abrir otro.
          key={enConfirmacion.id}
          pago={enConfirmacion}
          facturas={datos.facturas}
          organizacionId={organizacionId}
          confirmar={confirmar}
          verComprobante={verComprobante}
          onCerrar={() => setEnConfirmacion(null)}
          onAviso={setAviso}
        />
      ) : null}
    </section>
  );
}

function FilaDePago({
  pago,
  verComprobante,
  onConfirmar,
}: {
  pago: PagoPorConfirmarDTO;
  verComprobante: PagosPorConfirmarProps["verComprobante"];
  onConfirmar: () => void;
}) {
  const montoId = useId();
  return (
    <TableRow data-pago-id={pago.id}>
      <TableCell className="whitespace-nowrap">{fecha(pago.fecha)}</TableCell>
      <TableCell id={montoId} className="text-right font-medium whitespace-nowrap tabular-nums">
        {money(pago.monto)}
      </TableCell>
      <TableCell>{pago.referencia ?? SIN_DATO}</TableCell>
      <TableCell>{pago.registradoPor ?? SIN_DATO}</TableCell>
      <TableCell>
        <Comprobante pago={pago} verComprobante={verComprobante} describedBy={montoId} />
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" aria-describedby={montoId} onClick={onConfirmar}>
          {TEXTOS.confirmar}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/**
 * R32, R33: «Ver comprobante» abre el enlace temporal en una pestaña nueva; la ruta del archivo no llega al
 * navegador. Cualquier respuesta distinta de `ok`, o un fallo, dice «No se pudo abrir el comprobante» aquí
 * mismo. Sin comprobante, solo el texto.
 */
function Comprobante({
  pago,
  verComprobante,
  describedBy,
}: {
  pago: PagoPorConfirmarDTO;
  verComprobante: PagosPorConfirmarProps["verComprobante"];
  describedBy?: string;
}) {
  const [fallo, setFallo] = useState(false);

  if (!pago.tieneComprobante) {
    return <span className="text-sm text-muted-foreground">{TEXTOS.sinComprobante}</span>;
  }

  async function ver() {
    // La pestaña se abre ANTES de esperar al servidor: tras un `await` el navegador la bloquea.
    const pestana = window.open("", "_blank");
    setFallo(false);
    let r: VerComprobantePagoResult;
    try {
      r = await verComprobante(pago.id);
    } catch (error) {
      console.error("[PagosPorConfirmar] verComprobante lanzó", error);
      pestana?.close();
      setFallo(true);
      return;
    }
    if (r.estado !== "ok") {
      pestana?.close();
      setFallo(true);
      return;
    }
    if (pestana) {
      pestana.opener = null;
      pestana.location.href = r.url;
    } else {
      window.open(r.url, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="link"
        size="sm"
        className="h-auto px-0"
        aria-describedby={describedBy}
        onClick={() => void ver()}
      >
        {TEXTOS.verComprobante}
      </Button>
      {fallo ? (
        <p role="status" className="text-xs text-destructive">
          {TEXTOS.falloComprobante}
        </p>
      ) : null}
    </div>
  );
}

/**
 * R14, R17, R23: el diálogo con el reparto propuesto (las facturas más viejas primero). «Confirmar pago» se
 * deshabilita mientras la ayuda en pantalla ve el reparto inválido; el servidor vuelve a decidir.
 */
function DialogoConfirmar({
  pago,
  facturas,
  organizacionId,
  confirmar,
  verComprobante,
  onCerrar,
  onAviso,
}: {
  pago: PagoPorConfirmarDTO;
  facturas: FacturaConSaldoDTO[];
  organizacionId: string;
  confirmar: PagosPorConfirmarProps["confirmar"];
  verComprobante: PagosPorConfirmarProps["verComprobante"];
  onCerrar: () => void;
  onAviso: (aviso: string | null) => void;
}) {
  const router = useRouter();
  const montoId = useId();
  const [montos, setMontos] = useState<Record<string, string>>(() => proponerReparto(pago.monto, facturas));
  // Los errores que devolvió el servidor; se olvidan en cuanto se edita un monto.
  const [erroresServidor, setErroresServidor] = useState<Record<string, string>>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const resumen = useMemo(() => resumenDelReparto(pago.monto, facturas, montos), [pago.monto, facturas, montos]);
  const sinFacturas = facturas.length === 0;

  function error(clave: string): string | undefined {
    return erroresServidor[clave] ?? resumen.errores[clave];
  }

  function cambiar(facturaId: string, valor: string) {
    setErroresServidor({});
    setFallo(null);
    setMontos((m) => ({ ...m, [facturaId]: valor }));
  }

  async function enviar() {
    setFallo(null);
    const aplicaciones = facturas
      .map((f) => ({ facturaId: f.id, monto: (montos[f.id] ?? "").trim() }))
      .filter((a) => a.monto !== "");
    let r: ConfirmarPagoResult;
    try {
      r = await confirmar({ organizacionId, pagoId: pago.id, aplicaciones });
    } catch (e) {
      console.error("[PagosPorConfirmar] confirmar lanzó", e);
      setFallo(TEXTOS.falloConfirmar);
      return;
    }
    switch (r.estado) {
      case "ok":
        onCerrar();
        router.refresh();
        return;
      case "ya_confirmado":
        onAviso(TEXTOS.yaConfirmado);
        onCerrar();
        router.refresh();
        return;
      case "not_found":
        onAviso(TEXTOS.noEncontrado);
        onCerrar();
        router.refresh();
        return;
      case "validation_error":
        setErroresServidor(r.errores);
        return;
      case "forbidden":
        setFallo(TEXTOS.falloConfirmar);
        return;
    }
  }

  const errorGeneral = error("aplicaciones");

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={TEXTOS.tituloDialogo(money(pago.monto))}
      size="xl"
      confirmLabel={TEXTOS.confirmarPago}
      hideConfirm={sinFacturas}
      confirmDisabled={!resumen.valido}
      closeOnConfirm={false}
      onConfirm={enviar}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
          <span id={montoId} className="font-medium tabular-nums">
            {money(pago.monto)}
          </span>
          <span>{fecha(pago.fecha)}</span>
          <Comprobante pago={pago} verComprobante={verComprobante} describedBy={montoId} />
        </div>

        {sinFacturas ? (
          <p className="text-sm">{TEXTOS.sinFacturas}</p>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{TEXTOS.dialogoColumnas.factura}</TableHead>
                  <TableHead>{TEXTOS.dialogoColumnas.periodo}</TableHead>
                  <TableHead className="text-right">{TEXTOS.dialogoColumnas.total}</TableHead>
                  <TableHead className="text-right">{TEXTOS.dialogoColumnas.saldo}</TableHead>
                  <TableHead>{TEXTOS.dialogoColumnas.aplicar}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {facturas.map((f) => (
                  <FilaDeFactura
                    key={f.id}
                    factura={f}
                    valor={montos[f.id] ?? ""}
                    error={error(claveDeFactura(f.id))}
                    onCambiar={(v) => cambiar(f.id, v)}
                  />
                ))}
              </TableBody>
            </Table>

            <div className="flex flex-col gap-1 text-sm tabular-nums" aria-live="polite">
              <span>{TEXTOS.repartido(money(resumen.suma), money(pago.monto))}</span>
              <span>{TEXTOS.falta(money(resumen.falta))}</span>
              {errorGeneral === undefined ? null : <span className="text-destructive">{errorGeneral}</span>}
            </div>
          </>
        )}

        {fallo === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {fallo}
          </p>
        )}
      </div>
    </Modal>
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
          aria-label={`${TEXTOS.dialogoColumnas.aplicar} · ${nombre}`}
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
