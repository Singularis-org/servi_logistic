"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearConteo } from "@/lib/planes/consumo";
import { textoDelPrecio } from "@/lib/planes/mensajes";
import type { CrearPlanInput, PlanDelCatalogo, PlanResult } from "@/lib/types/planes";

import { PlanForm } from "./PlanForm";
import { lineasDeTopes, TEXTOS_PLAN, textoDeVisibilidad } from "./plan-vista";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  nuevo: "Nuevo plan",
  tituloNuevo: "Nuevo plan",
  descripcionNuevo: "Los topes vacíos no tienen límite. El precio es informativo.",
  mostrarArchivados: "Mostrar archivados",
  columnaNombre: "Nombre",
  columnaVisibilidad: "Visibilidad",
  columnaPrecio: "Precio",
  columnaTopes: "Topes",
  columnaEmpresas: "Empresas",
  columnaCambio: "Cambio programado",
  sinCambio: "Ninguno",
  cambioDesde: (fecha: string) => `Desde ${fecha}`,
  verPlan: (nombre: string) => `Ver el plan ${nombre}`,
  creado: (nombre: string) => `Plan «${nombre}» creado.`,
  vacio: "Aún no hay planes.",
  vacioAyuda: "Crea el primero con «Nuevo plan».",
  vacioArchivados: "Todos los planes están archivados.",
  vacioArchivadosAyuda: "Marca «Mostrar archivados» para verlos.",
  sinCatalogo: "No se pudo cargar el catálogo de planes.",
  reintentar: "Reintentar",
} as const;

/** Columnas secundarias: por debajo de `md` se ocultan para que el nombre no quede lejos de sus datos. */
const SOLO_DESDE_MD = "hidden md:table-cell";

export interface PlanesModuleProps {
  /**
   * El catálogo no se pudo leer. Se pinta solo el aviso con «Reintentar»: ni la tabla ni el estado
   * vacío, que invitaría a crear planes que quizá ya existen.
   */
  errorDeCarga?: boolean;
  /** El catálogo entero, también los archivados, en el orden del servidor. */
  planes: PlanDelCatalogo[];
  /** Las empresas para un plan custom (`listarEmpresasPlataforma`). */
  empresas: { id: string; nombre: string }[] | null;
  /** `crearPlanAction`, inyectada desde la página para poder probarla. */
  crearPlan: (input: CrearPlanInput) => Promise<PlanResult>;
}

/**
 * SLT-58 (design §6.3; R13, R14) — el catálogo de planes del superadmin: una fila por plan con su
 * visibilidad, precio informativo (sin moneda), topes, cuántas empresas lo tienen y la fecha del cambio
 * programado. Los archivados se esconden por defecto y, al mostrarlos, llevan la marca «Archivado».
 * «Nuevo plan» abre el formulario en un panel lateral; tras crear, se relee la página.
 */
export function PlanesModule({ errorDeCarga = false, planes, empresas, crearPlan }: PlanesModuleProps) {
  const router = useRouter();
  const idArchivados = useId();
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const [creado, setCreado] = useState<string | null>(null);

  const visibles = mostrarArchivados ? planes : planes.filter((p) => !p.archivado);

  function alCrear(nombre: string) {
    setAbierto(false);
    setCreado(nombre);
    router.refresh();
  }

  if (errorDeCarga) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{TEXTOS.sinCatalogo}</AlertDescription>
        <div className="mt-2">
          <Button type="button" variant="outline" onClick={() => router.refresh()}>
            {TEXTOS.reintentar}
          </Button>
        </div>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex min-h-11 items-center gap-2 text-sm">
          <Checkbox
            id={idArchivados}
            checked={mostrarArchivados}
            onCheckedChange={(v) => setMostrarArchivados(v === true)}
          />
          <label htmlFor={idArchivados} className="cursor-pointer">
            {TEXTOS.mostrarArchivados}
          </label>
        </div>
        <Button
          type="button"
          onClick={() => {
            setCreado(null);
            setAbierto(true);
          }}
        >
          <Plus aria-hidden="true" />
          {TEXTOS.nuevo}
        </Button>
      </div>

      {creado !== null ? (
        <Alert role="status">
          <AlertDescription>{TEXTOS.creado(creado)}</AlertDescription>
        </Alert>
      ) : null}

      <Catalogo planes={visibles} hayArchivadosOcultos={!mostrarArchivados && planes.length > 0} />

      <Sheet open={abierto} onOpenChange={setAbierto}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{TEXTOS.tituloNuevo}</SheetTitle>
            <SheetDescription>{TEXTOS.descripcionNuevo}</SheetDescription>
          </SheetHeader>
          <div className="px-4 pb-4">
            <PlanForm
              modo="crear"
              empresas={empresas}
              enviar={crearPlan}
              onGuardado={(_r, nombre) => alCrear(nombre)}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Catalogo({ planes, hayArchivadosOcultos }: { planes: PlanDelCatalogo[]; hayArchivadosOcultos: boolean }) {
  if (planes.length === 0) {
    return (
      <div className="rounded-md border border-border">
        {hayArchivadosOcultos ? (
          <EmptyState title={TEXTOS.vacioArchivados} description={TEXTOS.vacioArchivadosAyuda} />
        ) : (
          <EmptyState title={TEXTOS.vacio} description={TEXTOS.vacioAyuda} />
        )}
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{TEXTOS.columnaNombre}</TableHead>
          <TableHead className={SOLO_DESDE_MD}>{TEXTOS.columnaVisibilidad}</TableHead>
          <TableHead>{TEXTOS.columnaPrecio}</TableHead>
          <TableHead>{TEXTOS.columnaTopes}</TableHead>
          <TableHead className="text-right">{TEXTOS.columnaEmpresas}</TableHead>
          <TableHead className={SOLO_DESDE_MD}>{TEXTOS.columnaCambio}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {planes.map((plan) => (
          <TableRow key={plan.id} data-archivado={plan.archivado || undefined}>
            <TableCell className="font-medium">
              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href={`/plataforma/planes/${plan.id}`}
                  aria-label={TEXTOS.verPlan(plan.nombre)}
                  className="rounded-sm text-primary-strong underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {plan.nombre}
                </Link>
                {plan.archivado ? <Badge variant="secondary">{TEXTOS_PLAN.archivado}</Badge> : null}
              </div>
            </TableCell>
            <TableCell className={SOLO_DESDE_MD}>{textoDeVisibilidad(plan.visibilidad, plan.empresaNombre)}</TableCell>
            <TableCell>{textoDelPrecio(plan.precio)}</TableCell>
            <TableCell>
              <ul className="flex flex-col gap-0.5">
                {lineasDeTopes(plan.topes, true).map((linea) => (
                  <li key={linea}>{linea}</li>
                ))}
              </ul>
            </TableCell>
            <TableCell className="text-right tabular-nums">{formatearConteo(plan.empresas)}</TableCell>
            <TableCell className={SOLO_DESDE_MD}>
              {plan.vigenteDesdePendiente === null ? TEXTOS.sinCambio : TEXTOS.cambioDesde(plan.vigenteDesdePendiente)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
