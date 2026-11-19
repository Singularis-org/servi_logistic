"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { BugReportStatus } from "@prisma/client";

import { EmptyState } from "@/components/shared/EmptyState";
import { Pagination } from "@/components/shared/Pagination";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ROL_LABELS } from "@/lib/auth/rol-label";
import { REPORTES_POR_PAGINA, type ReporteFilaDTO } from "@/lib/types/reporte-bug";

import {
  ETIQUETA_ESTADO,
  fechaUtc,
  OPCIONES_FILTRO_ESTADO,
  TEXTOS_REPORTES,
  textoEnlaceFila,
} from "./reportes-textos";

const RUTA = "/plataforma/reportes";
const ESTADO_POR_DEFECTO = "pendientes";
const DIA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Los filtros tal como se pintan. Son texto, no el tipo del zod, porque con un `validation_error` la
 * página los recibe sin validar y la barra tiene que seguir mostrándolos para que se corrijan (R9).
 * `""` es «sin filtro».
 */
export interface FiltrosVista {
  estado: string;
  empresa: string;
  desde: string;
  hasta: string;
  /** La efectiva: ya recortada por el servicio (R11). */
  pagina: number;
}

export type ResultadoListado =
  | { status: "ok"; items: ReporteFilaDTO[]; total: number }
  | { status: "validation_error" }
  | { status: "error" };

export interface ReportesModuleProps {
  filtros: FiltrosVista;
  resultado: ResultadoListado;
  /** Por nombre; `[]` si no se pudieron leer, y el filtro queda con solo «Todas las empresas». */
  empresas: { id: string; nombre: string }[];
}

/** R12: el vacío de «sin pendientes» solo sale con los filtros con los que abre el listado. */
export function esFiltroPorDefecto(f: FiltrosVista): boolean {
  return f.estado === ESTADO_POR_DEFECTO && f.empresa === "" && f.desde === "" && f.hasta === "";
}

/**
 * R10: los valores por defecto no van en la dirección, y la página 1 tampoco, así que el listado por
 * defecto vive en la URL limpia.
 */
export function urlDelListado(f: Omit<FiltrosVista, "pagina">, pagina = 1): string {
  const params = new URLSearchParams();
  if (f.estado !== "" && f.estado !== ESTADO_POR_DEFECTO) params.set("estado", f.estado);
  if (f.empresa !== "") params.set("empresa", f.empresa);
  if (f.desde !== "") params.set("desde", f.desde);
  if (f.hasta !== "") params.set("hasta", f.hasta);
  if (pagina > 1) params.set("pagina", String(pagina));
  const query = params.toString();
  return query === "" ? RUTA : `${RUTA}?${query}`;
}

// (propuesta) el color de cada estado: los pendientes en tonos de aviso y los cerrados apagados.
const VARIANTE_ESTADO: Readonly<Record<BugReportStatus, "info" | "warning" | "success" | "secondary">> = {
  new: "info",
  in_review: "warning",
  resolved: "success",
  dismissed: "secondary",
};

export function EstadoBadge({ estado }: { estado: BugReportStatus }) {
  return <Badge variant={VARIANTE_ESTADO[estado]}>{ETIQUETA_ESTADO[estado]}</Badge>;
}

/**
 * SLT-97 (design §8.2; R5–R12) — el listado de reportes del superadmin. No guarda los filtros en
 * estado propio: cada cambio navega y la página vuelve a leer, así que la dirección es la única
 * fuente (R10). Las fechas sí llevan estado local mientras se escriben: un día a medio teclear no se
 * manda.
 */
export function ReportesModule({ filtros, resultado, empresas }: ReportesModuleProps) {
  const router = useRouter();
  const ids = { estado: useId(), empresa: useId(), desde: useId(), hasta: useId() };
  const [desde, setDesde] = useState(filtros.desde);
  const [hasta, setHasta] = useState(filtros.hasta);

  // R10: cambiar un filtro vuelve a la página 1.
  function aplicar(cambio: Partial<Omit<FiltrosVista, "pagina">>) {
    router.push(urlDelListado({ ...filtros, ...cambio }));
  }

  function alCambiarFecha(campo: "desde" | "hasta", valor: string) {
    (campo === "desde" ? setDesde : setHasta)(valor);
    if (valor === "" || DIA.test(valor)) aplicar({ [campo]: valor });
  }

  const opcionesEmpresa = [
    { value: "", label: TEXTOS_REPORTES.todasLasEmpresas },
    ...empresas.map((e) => ({ value: e.id, label: e.nombre })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto] lg:items-end">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.estado}>{TEXTOS_REPORTES.filtroEstado}</Label>
          <Select
            id={ids.estado}
            aria-label={TEXTOS_REPORTES.filtroEstado}
            value={filtros.estado}
            options={[...OPCIONES_FILTRO_ESTADO]}
            onValueChange={(v) => aplicar({ estado: v === "" ? ESTADO_POR_DEFECTO : v })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.empresa}>{TEXTOS_REPORTES.filtroEmpresa}</Label>
          <Select
            id={ids.empresa}
            aria-label={TEXTOS_REPORTES.filtroEmpresa}
            value={filtros.empresa}
            placeholder={TEXTOS_REPORTES.todasLasEmpresas}
            options={opcionesEmpresa}
            onValueChange={(v) => aplicar({ empresa: v })}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.desde}>{TEXTOS_REPORTES.desde}</Label>
          <Input
            id={ids.desde}
            type="date"
            value={desde}
            aria-invalid={resultado.status === "validation_error" || undefined}
            onChange={(e) => alCambiarFecha("desde", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ids.hasta}>{TEXTOS_REPORTES.hasta}</Label>
          <Input
            id={ids.hasta}
            type="date"
            value={hasta}
            aria-invalid={resultado.status === "validation_error" || undefined}
            onChange={(e) => alCambiarFecha("hasta", e.target.value)}
          />
        </div>
        <Button type="button" variant="outline" onClick={() => router.push(RUTA)}>
          {TEXTOS_REPORTES.limpiarFiltros}
        </Button>
      </div>

      <Listado filtros={filtros} resultado={resultado} alCambiarPagina={(p) => router.push(urlDelListado(filtros, p))} />
    </div>
  );
}

function Listado({
  filtros,
  resultado,
  alCambiarPagina,
}: {
  filtros: FiltrosVista;
  resultado: ResultadoListado;
  alCambiarPagina: (pagina: number) => void;
}) {
  // R9: unas fechas inválidas no pintan filas; R12: un fallo de carga no se pinta como vacío.
  if (resultado.status !== "ok") {
    return (
      <Alert variant="destructive">
        <AlertDescription>
          {resultado.status === "validation_error" ? TEXTOS_REPORTES.fechasInvalidas : TEXTOS_REPORTES.cargaError}
        </AlertDescription>
      </Alert>
    );
  }

  if (resultado.items.length === 0) {
    return (
      <div className="rounded-md border border-border">
        <EmptyState
          title={esFiltroPorDefecto(filtros) ? TEXTOS_REPORTES.vacioPendientes : TEXTOS_REPORTES.vacioFiltros}
        />
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{TEXTOS_REPORTES.columnaFecha}</TableHead>
            <TableHead>{TEXTOS_REPORTES.columnaEmpresa}</TableHead>
            <TableHead>{TEXTOS_REPORTES.columnaUsuario}</TableHead>
            <TableHead>{TEXTOS_REPORTES.columnaRol}</TableHead>
            <TableHead>{TEXTOS_REPORTES.columnaDescripcion}</TableHead>
            <TableHead>{TEXTOS_REPORTES.columnaEstado}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {resultado.items.map((r) => (
            // La fila entera lleva al detalle (R6): el enlace de la primera celda la cubre con su `after`.
            <TableRow key={r.id} className="relative cursor-pointer">
              <TableCell className="whitespace-nowrap tabular-nums">
                <Link
                  href={`${RUTA}/${r.id}`}
                  aria-label={textoEnlaceFila(r.empresa, r.creadoEn)}
                  className="rounded-sm text-primary-strong underline-offset-4 after:absolute after:inset-0 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {fechaUtc(r.creadoEn)}
                </Link>
              </TableCell>
              <TableCell>{r.empresa}</TableCell>
              <TableCell>{r.usuario}</TableCell>
              <TableCell>{ROL_LABELS[r.rol]}</TableCell>
              <TableCell className="min-w-64 whitespace-normal break-words">{r.resumen}</TableCell>
              <TableCell>
                <EstadoBadge estado={r.estado} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <Pagination
        page={filtros.pagina}
        pageSize={REPORTES_POR_PAGINA}
        total={resultado.total}
        ariaLabel={TEXTOS_REPORTES.paginacion}
        onPageChange={alCambiarPagina}
      />
    </>
  );
}
