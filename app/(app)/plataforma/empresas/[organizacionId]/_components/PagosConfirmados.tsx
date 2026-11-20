"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { money } from "@/lib/config/moneda";
import {
  TEXTOS_CONFIRMACION,
  type AnularPagoConfirmadoResult,
  type PagoConfirmadoDTO,
  type PagosDeEmpresa,
  type RegistrarPagoPorFueraResult,
  type VerComprobantePagoResult,
} from "@/lib/types/pago-plataforma";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

import { Comprobante } from "./PagosPorConfirmar";
import { RegistrarPagoPorFuera } from "./RegistrarPagoPorFuera";

// SLT-143 (design §6.2; R16–R20) — la sección «Pagos confirmados» del detalle de una empresa para el
// superadmin: los pagos confirmados vigentes, «Anular…» por fila y «Registrar pago hecho por fuera…» en la
// cabecera. Los datos llegan por props desde `page.tsx` (Server Component), la misma lectura que «Pagos por
// confirmar»; las tres actions llegan ya ligadas a la empresa en el servidor.

/** Textos de la sección, en un solo sitio para cuando llegue la i18n. Forma impersonal (design §6.2). */
const TEXTOS = {
  titulo: "Pagos confirmados",
  ayuda: "Pagos ya aplicados a las facturas cerradas de la empresa. Anularlos devuelve el dinero a su caja y sube su deuda.",
  registrarPorFuera: "Registrar pago hecho por fuera…",
  vacio: "No hay pagos confirmados",
  falloLectura: "No se pudieron cargar los pagos confirmados",
  columnas: {
    fecha: "Fecha",
    monto: "Monto",
    referencia: "Referencia",
    registradoPor: "Registrado por",
    confirmado: "Confirmado",
    facturas: "Facturas",
    comprobante: "Comprobante",
  },
  registradoPorLaPlataforma: "Registrado por la plataforma",
  confirmado: (quien: string, cuando: string) => `${quien} · ${cuando}`,
  aplicacion: (numero: number, monto: string) => `N.º ${numero}: ${monto}`,
  anular: "Anular…",
  tituloDialogo: (monto: string) => `Anular pago de ${monto}`,
  motivo: "Motivo",
  avisoAnular: "El dinero vuelve a la caja de la empresa, la deuda sube y las facturas recuperan su saldo.",
  anularPago: "Anular pago",
  yaAnulado: "Este pago ya estaba anulado",
  yaNoConfirmado: "El pago ya no está confirmado",
  falloAnular: "No se pudo anular ahora",
} as const;

/** Lo que se pinta en una celda sin dato (la misma raya larga que `money`). */
const SIN_DATO = "—";

/** «5 oct 2026» en la zona de la plataforma (SLT-60 design §7: `ZONA_CR` hasta SLT-90). */
function fecha(instante: Date): string {
  return fechaCortaEnZona(instante, ZONA_CR);
}

export interface PagosConfirmadosProps {
  /** La misma lectura que «Pagos por confirmar»; `null` = falló (R18). */
  datos: PagosDeEmpresa | null;
  /** `registrarPagoPorFueraAction` ligada a la empresa (R17). */
  registrarPorFuera: (formData: FormData) => Promise<RegistrarPagoPorFueraResult>;
  /** `anularPagoConfirmadoAction` ligada a la empresa (R21). */
  anular: (input: { pagoId: string; motivo: string }) => Promise<AnularPagoConfirmadoResult>;
  /** `verComprobantePagoPlataformaAction` ligada a la empresa (R20). */
  verComprobante: (pagoId: string) => Promise<VerComprobantePagoResult>;
  /** La zona del país de la empresa, para la ventana de la fecha; `null` si no se pudo leer. */
  zona: string | null;
}

export function PagosConfirmados({ datos, registrarPorFuera, anular, verComprobante, zona }: Readonly<PagosConfirmadosProps>) {
  const tituloId = useId();
  const ayudaId = useId();
  const [registrando, setRegistrando] = useState(false);
  const [enAnulacion, setEnAnulacion] = useState<PagoConfirmadoDTO | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  return (
    <section aria-labelledby={tituloId} aria-describedby={ayudaId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 id={tituloId} className="text-base font-semibold">
            {TEXTOS.titulo}
          </h2>
          <p id={ayudaId} className="text-sm text-muted-foreground">
            {TEXTOS.ayuda}
          </p>
        </div>
        {datos === null ? null : (
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setAviso(null);
              setRegistrando(true);
            }}
          >
            {TEXTOS.registrarPorFuera}
          </Button>
        )}
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
      ) : datos.confirmados.length === 0 ? (
        <EmptyState title={TEXTOS.vacio} />
      ) : (
        <Table aria-labelledby={tituloId}>
          <TableHeader>
            <TableRow>
              <TableHead>{TEXTOS.columnas.fecha}</TableHead>
              <TableHead className="text-right">{TEXTOS.columnas.monto}</TableHead>
              <TableHead>{TEXTOS.columnas.referencia}</TableHead>
              <TableHead>{TEXTOS.columnas.registradoPor}</TableHead>
              <TableHead>{TEXTOS.columnas.confirmado}</TableHead>
              <TableHead>{TEXTOS.columnas.facturas}</TableHead>
              <TableHead>{TEXTOS.columnas.comprobante}</TableHead>
              <TableHead>
                <span className="sr-only">{TEXTOS.anularPago}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {datos.confirmados.map((pago) => (
              <FilaDePago
                key={pago.id}
                pago={pago}
                verComprobante={verComprobante}
                onAnular={() => {
                  setAviso(null);
                  setEnAnulacion(pago);
                }}
              />
            ))}
          </TableBody>
        </Table>
      )}

      {datos !== null && registrando ? (
        <RegistrarPagoPorFuera
          facturas={datos.facturas}
          registrar={registrarPorFuera}
          zona={zona}
          onCerrar={() => setRegistrando(false)}
        />
      ) : null}

      {enAnulacion === null ? null : (
        <DialogoAnular
          key={enAnulacion.id}
          pago={enAnulacion}
          anular={anular}
          onCerrar={() => setEnAnulacion(null)}
          onAviso={setAviso}
        />
      )}
    </section>
  );
}

function FilaDePago({
  pago,
  verComprobante,
  onAnular,
}: {
  pago: PagoConfirmadoDTO;
  verComprobante: PagosConfirmadosProps["verComprobante"];
  onAnular: () => void;
}) {
  const montoId = useId();
  return (
    <TableRow data-pago-id={pago.id}>
      <TableCell className="whitespace-nowrap">{fecha(pago.fecha)}</TableCell>
      <TableCell id={montoId} className="text-right font-medium whitespace-nowrap tabular-nums">
        {money(pago.monto)}
      </TableCell>
      <TableCell>{pago.referencia ?? SIN_DATO}</TableCell>
      <TableCell>{pago.porFuera ? TEXTOS.registradoPorLaPlataforma : (pago.registradoPor ?? SIN_DATO)}</TableCell>
      <TableCell className="whitespace-nowrap">
        {TEXTOS.confirmado(pago.confirmadoPor ?? SIN_DATO, fecha(pago.confirmadoEl))}
      </TableCell>
      <TableCell>
        <ul className="flex flex-col tabular-nums">
          {pago.aplicaciones.map((a) => (
            <li key={a.facturaId} className="whitespace-nowrap">
              {TEXTOS.aplicacion(a.numero, money(a.monto))}
            </li>
          ))}
        </ul>
      </TableCell>
      <TableCell>
        <Comprobante pago={pago} verComprobante={verComprobante} describedBy={montoId} />
      </TableCell>
      <TableCell className="text-right">
        <Button type="button" size="sm" variant="outline" aria-describedby={montoId} onClick={onAnular}>
          {TEXTOS.anular}
        </Button>
      </TableCell>
    </TableRow>
  );
}

/** R21, R23–R25: el diálogo con el motivo obligatorio. El servidor vuelve a decidir. */
function DialogoAnular({
  pago,
  anular,
  onCerrar,
  onAviso,
}: {
  pago: PagoConfirmadoDTO;
  anular: PagosConfirmadosProps["anular"];
  onCerrar: () => void;
  onAviso: (aviso: string | null) => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [errorMotivo, setErrorMotivo] = useState<string | undefined>(undefined);
  const [fallo, setFallo] = useState<string | null>(null);

  function cerrarYRefrescar(aviso: string | null) {
    onAviso(aviso);
    onCerrar();
    router.refresh();
  }

  async function enviar() {
    setFallo(null);
    if (motivo.trim() === "") {
      setErrorMotivo(TEXTOS_CONFIRMACION.motivo_vacio);
      return;
    }
    let r: AnularPagoConfirmadoResult;
    try {
      r = await anular({ pagoId: pago.id, motivo: motivo.trim() });
    } catch (e) {
      console.error("[PagosConfirmados] anular lanzó", e);
      setFallo(TEXTOS.falloAnular);
      return;
    }
    switch (r.estado) {
      case "ok":
        cerrarYRefrescar(null);
        return;
      case "ya_anulado":
        cerrarYRefrescar(TEXTOS.yaAnulado);
        return;
      case "not_found":
      case "no_confirmado":
        cerrarYRefrescar(TEXTOS.yaNoConfirmado);
        return;
      case "validation_error":
        setErrorMotivo(r.errores.motivo ?? Object.values(r.errores)[0]);
        return;
      case "forbidden":
        setFallo(TEXTOS.falloAnular);
        return;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={TEXTOS.tituloDialogo(money(pago.monto))}
      confirmLabel={TEXTOS.anularPago}
      confirmVariant="destructive"
      closeOnConfirm={false}
      onConfirm={enviar}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">{TEXTOS.avisoAnular}</p>
        <FormField id="anular-pago-motivo" label={TEXTOS.motivo} error={errorMotivo} required>
          {(control) => (
            <textarea
              {...control}
              rows={3}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErrorMotivo(undefined);
                setFallo(null);
              }}
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-3 focus-visible:ring-ring"
            />
          )}
        </FormField>
        {fallo === null ? null : (
          <p role="alert" className="text-sm text-destructive">
            {fallo}
          </p>
        )}
      </div>
    </Modal>
  );
}
