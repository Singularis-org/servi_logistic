"use client";

import { type ReactNode, useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { BugReportStatus } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { CambiarEstadoReporteBugActionResult } from "@/lib/actions/reportes-bug-plataforma";
import { ROL_LABELS } from "@/lib/auth/rol-label";
import { NOTA_MAX, type CambioEstadoDTO, type ReporteDetalleDTO } from "@/lib/types/reporte-bug";

import { EstadoBadge } from "../../_components/ReportesModule";
import {
  ETIQUETA_ESTADO,
  fechaUtc,
  textoAbrirImagenReporte,
  textoAltImagenReporte,
  textoAutoria,
  textoContadorNota,
  textoDispositivo,
  textoTransicion,
  textoTransicionInvalida,
  TEXTOS_REPORTE_DETALLE as T,
} from "../../_components/reportes-textos";

type Destino = Exclude<BugReportStatus, "new">;

export interface ReporteDetalleProps {
  reporte: ReporteDetalleDTO;
  historial: CambioEstadoDTO[];
  /** `cambiarEstadoReporteBugAction`, inyectada desde la página para poder probarla. */
  cambiarEstado: (input: { reporteId: string; estado: Destino; nota: string }) => Promise<CambiarEstadoReporteBugActionResult>;
}

type Aviso = { tipo: "exito"; texto: string } | { tipo: "error"; texto: string };

/**
 * SLT-97 (design §8.3; R14, R17–R20, R22, R23) — el detalle de un reporte: descripción, contexto,
 * estado con su formulario de cambio e historial. Solo lee lo que trae la página; tras un cambio pide
 * `router.refresh()` y el servidor trae el estado y el historial nuevos.
 */
export function ReporteDetalle({ reporte, historial, cambiarEstado }: ReporteDetalleProps) {
  const contexto: Array<[string, string]> = [
    [T.empresa, reporte.empresa],
    [T.usuario, reporte.usuario],
    [T.correo, reporte.correo],
    [T.rol, ROL_LABELS[reporte.rol]],
    [T.pagina, reporte.pagina],
    [T.navegador, reporte.navegador],
    [T.dispositivo, textoDispositivo(reporte.ventana, reporte.appInstalada)],
    [T.fecha, fechaUtc(reporte.creadoEn)],
    [T.reporte, reporte.id],
  ];

  return (
    <div className="flex flex-col gap-4">
      <Bloque titulo={T.bloqueDescripcion}>
        {/* React escapa el texto; `pre-wrap` conserva los saltos de línea de quien reportó (R14). */}
        <p className="whitespace-pre-wrap break-words">{reporte.descripcion}</p>
      </Bloque>

      <Bloque titulo={T.bloqueContexto}>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-[max-content_1fr]">
          {contexto.map(([rotulo, valor]) => (
            <div key={rotulo} className="contents">
              <dt className="text-muted-foreground">{rotulo}</dt>
              <dd className="min-w-0 break-words">{valor}</dd>
            </div>
          ))}
        </dl>
      </Bloque>

      <Bloque titulo={T.bloqueImagenes}>
        <Imagenes imagenes={reporte.imagenes} />
      </Bloque>

      <Bloque titulo={T.bloqueEstado}>
        <FormularioEstado reporte={reporte} cambiarEstado={cambiarEstado} />
      </Bloque>

      <Bloque titulo={T.bloqueHistorial}>
        <Historial entradas={historial} />
      </Bloque>
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <Card aria-labelledby={id} role="region">
      <CardHeader>
        <h2 id={id} className="font-heading text-base leading-snug font-medium">
          {titulo}
        </h2>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function FormularioEstado({
  reporte,
  cambiarEstado,
}: {
  reporte: ReporteDetalleDTO;
  cambiarEstado: ReporteDetalleProps["cambiarEstado"];
}) {
  const router = useRouter();
  const idDestino = useId();
  const idNota = useId();
  const idContador = useId();
  const [destino, setDestino] = useState<Destino | "">("");
  const [nota, setNota] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<Aviso | null>(null);

  const cerrado = reporte.destinosPermitidos.length === 0;

  async function enviar() {
    if (destino === "") return;
    setEnviando(true);
    setAviso(null);
    try {
      const r = await cambiarEstado({ reporteId: reporte.id, estado: destino, nota });
      if (r.status === "ok") {
        setAviso({ tipo: "exito", texto: T.exito });
        setNota("");
        setDestino("");
        router.refresh();
      } else if (r.status === "transicion_invalida") {
        // R18: el reporte ya no está donde se veía; el aviso dice dónde está y la página se relee.
        setAviso({ tipo: "error", texto: textoTransicionInvalida(r.actual) });
        setDestino("");
        router.refresh();
      } else {
        setAviso({ tipo: "error", texto: T.otroFallo });
      }
    } catch {
      // La action no lanza; si lo hace es la red o el servidor caído, y se dice igual que un `error`.
      setAviso({ tipo: "error", texto: T.otroFallo });
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <EstadoBadge estado={reporte.estado} />
      </div>

      {cerrado ? (
        <p className="text-muted-foreground">{T.cerrado}</p>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void enviar();
          }}
        >
          <div className="flex flex-col gap-1.5 sm:max-w-xs">
            <Label htmlFor={idDestino}>{T.nuevoEstado}</Label>
            <Select
              id={idDestino}
              aria-label={T.nuevoEstado}
              placeholder={T.nuevoEstado}
              value={destino}
              disabled={enviando}
              options={reporte.destinosPermitidos.map((e) => ({ value: e, label: ETIQUETA_ESTADO[e] }))}
              onValueChange={(v) => setDestino(v as Destino | "")}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={idNota}>{T.nota}</Label>
            <Textarea
              id={idNota}
              value={nota}
              maxLength={NOTA_MAX}
              disabled={enviando}
              aria-describedby={idContador}
              onChange={(e) => setNota(e.target.value)}
              className="min-h-24"
            />
            <p id={idContador} aria-live="polite" className="self-end text-xs text-muted-foreground tabular-nums">
              {textoContadorNota(nota.length, NOTA_MAX)}
            </p>
          </div>
          <div>
            <Button type="submit" disabled={destino === ""} loading={enviando}>
              {T.cambiarEstado}
            </Button>
          </div>
        </form>
      )}

      {aviso?.tipo === "exito" ? (
        <p role="status" className="text-sm text-success-strong">
          {aviso.texto}
        </p>
      ) : null}
      {aviso?.tipo === "error" ? (
        <p role="alert" className="text-sm text-danger-strong">
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}

/**
 * SLT-98 (design §9.2; R22, R23): las imágenes en el orden en que llegan (el servidor las manda por
 * `position`). Cada una abre su enlace firmado en otra pestaña; si no se pudo firmar, su lugar dice que
 * no se pudo cargar y el resto del detalle se pinta igual. `<img>` y no `next/image`: el enlace es de
 * Supabase Storage y `next/image` exigiría declarar el dominio en `next.config`.
 */
function Imagenes({ imagenes }: { imagenes: ReporteDetalleDTO["imagenes"] }) {
  if (imagenes.length === 0) return <p className="text-muted-foreground">{T.sinImagenes}</p>;

  return (
    <ul className="flex flex-wrap gap-3">
      {imagenes.map((img, i) => {
        const n = i + 1;
        return (
          <li key={img.id} className="size-32">
            {img.url === null ? (
              <p className="flex size-full items-center justify-center rounded-md border border-dashed border-border p-2 text-center text-xs text-muted-foreground">
                {T.imagenSinEnlace}
              </p>
            ) : (
              <a
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={textoAbrirImagenReporte(n)}
                className="block size-full overflow-hidden rounded-md border border-border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- enlace firmado de Storage, ver arriba */}
                <img src={img.url} alt={textoAltImagenReporte(n)} loading="lazy" className="size-full object-cover" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** R22, R23: del más reciente al más antiguo, y sin nada que edite ni borre una entrada. */
function Historial({ entradas }: { entradas: CambioEstadoDTO[] }) {
  if (entradas.length === 0) return <p className="text-muted-foreground">{T.historialVacio}</p>;

  // El servidor ya las manda así; se ordena de nuevo para que el orden no dependa de quién las arme.
  const ordenadas = [...entradas].sort((a, b) => Date.parse(b.creadoEn) - Date.parse(a.creadoEn));

  return (
    <ol className="flex flex-col gap-3">
      {ordenadas.map((c) => (
        <li key={c.id} className="flex flex-col gap-0.5 border-l-2 border-border pl-3">
          <p className="font-medium">{textoTransicion(c.desde, c.hacia)}</p>
          <p className="text-xs text-muted-foreground">{textoAutoria(c.actor, c.creadoEn)}</p>
          {c.nota === null ? (
            <p className="text-muted-foreground">{T.sinNota}</p>
          ) : (
            <p className="whitespace-pre-wrap break-words">{c.nota}</p>
          )}
        </li>
      ))}
    </ol>
  );
}
