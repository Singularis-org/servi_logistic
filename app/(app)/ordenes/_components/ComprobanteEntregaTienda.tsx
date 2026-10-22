"use client";

import { useState } from "react";
import { FileImage } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { VerComprobanteDevolucionTiendaResult } from "@/lib/types/devolucion-tienda";

// FICHA 419 (F3, R22) — «Ver comprobante de entrega» dentro del historial de una orden
// `devuelta_a_tienda`. Lo monta `HistorialOrdenSheet` SOLO para maestro/admin (decide la página);
// el servidor revalida el rol y responde `no_encontrado` igual a un rol ajeno que a una orden sin
// comprobante (p. ej. la que la tienda recibió con su escáner), así que aquí no se distingue.
//
// Los archivos llegan como URLs FIRMADAS y temporales: se piden al pulsar, no al abrir el drawer
// (una URL firmada caduca; pedirla antes de que alguien la quiera ver es desperdiciarla).

export type VerComprobanteFn = (
  ordenId: string,
) => Promise<VerComprobanteDevolucionTiendaResult>;

/** Import PEREZOSO de la Server Action, mismo criterio que el historial (no arrastra el borde). */
const verComprobantePorDefecto: VerComprobanteFn = async (ordenId) => {
  const mod = await import("@/lib/actions/devolucion-tienda");
  return mod.verComprobanteDevolucionTienda({ ordenId });
};

const FECHA_HORA = new Intl.DateTimeFormat("es-CR", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Costa_Rica",
});

export const VER_COMPROBANTE_ENTREGA = "Ver comprobante de entrega";

type Estado =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error" }
  | VerComprobanteDevolucionTiendaResult;

export function ComprobanteEntregaTienda({
  ordenId,
  verComprobante = verComprobantePorDefecto,
}: Readonly<{ ordenId: string; verComprobante?: VerComprobanteFn }>) {
  const [estado, setEstado] = useState<Estado>({ status: "idle" });

  async function cargar() {
    setEstado({ status: "loading" });
    try {
      setEstado(await verComprobante(ordenId));
    } catch {
      setEstado({ status: "error" });
    }
  }

  return (
    <section aria-label="Comprobante de entrega a la tienda" className="flex flex-col gap-2">
      {estado.status === "idle" || estado.status === "loading" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="self-start"
          onClick={cargar}
          disabled={estado.status === "loading"}
        >
          <FileImage aria-hidden="true" />
          {estado.status === "loading" ? "Cargando comprobante…" : VER_COMPROBANTE_ENTREGA}
        </Button>
      ) : null}
      <CuerpoComprobante estado={estado} onReintentar={cargar} />
    </section>
  );
}

function CuerpoComprobante({
  estado,
  onReintentar,
}: Readonly<{ estado: Estado; onReintentar: () => void }>) {
  switch (estado.status) {
    case "idle":
    case "loading":
      return null;
    case "ok":
      return (
        <div className="flex flex-col gap-2 rounded-lg border border-border p-3">
          <p className="text-sm">
            {`Entrega confirmada por ${estado.confirmadoPor} el ${FECHA_HORA.format(new Date(estado.confirmadoAt))}.`}
          </p>
          <ul aria-label="Archivos del comprobante" className="flex flex-wrap gap-2">
            {estado.archivos.map((a) => (
              <li key={a.indice}>
                <a
                  href={a.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block"
                  aria-label={`Abrir foto ${a.indice + 1} del comprobante`}
                >
                  {/* URL firmada de un bucket privado: next/image no aplica (dominio dinámico). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={a.url}
                    alt={`Foto ${a.indice + 1} del comprobante`}
                    className="size-24 rounded-md border border-border object-cover"
                  />
                </a>
              </li>
            ))}
          </ul>
        </div>
      );
    case "no_encontrado":
      return (
        <p role="status" className="text-sm text-muted-foreground">
          Esta orden no tiene comprobante de entrega. Puede que la tienda la haya recibido con su
          escáner.
        </p>
      );
    case "unauthenticated":
      return (
        <p role="alert" className="text-sm text-muted-foreground">
          Tu sesión expiró. Vuelve a iniciar sesión para ver el comprobante.
        </p>
      );
    case "validation_error":
    case "error":
    default:
      return (
        <div role="alert" className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>No se pudo cargar el comprobante.</span>
          <Button type="button" variant="link" size="sm" onClick={onReintentar}>
            Reintentar
          </Button>
        </div>
      );
  }
}
