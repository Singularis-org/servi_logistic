"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

import { AvisosDeTopes, textosDeLosAvisosDeTopes } from "@/components/shared/AvisosDeTopes";
import { EmptyState } from "@/components/shared/EmptyState";
import { ListaDeBeneficios } from "@/components/shared/planes/BeneficiosDelPlan";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatearConteo } from "@/lib/planes/consumo";
import { textoCambioProgramado } from "@/lib/planes/mensajes";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";
import type { BorradorResumen } from "@/lib/types/plan-borrador";
import type {
  PlanDelCatalogo,
  PlanResult,
  PrevisualizarCustomInput,
  VistaPreviaCustomResult,
} from "@/lib/types/planes";

import { BorradoresDePlanes } from "./BorradoresDePlanes";
import { ESTILO_SHEET_PLAN, type AccionesDelBorrador, type EmpresaParaCustom } from "./PlanForm";
import { AbrirPlanForm } from "./plan-form/AbrirPlanForm";
import { lineasDeCosto, lineasDeNiveles, lineasDeTopes, TEXTOS_PLAN, textoDeVisibilidad } from "./plan-vista";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  nuevo: "Nuevo plan",
  tituloNuevo: "Nuevo plan",
  descripcionNuevo: "Los topes vacíos no tienen límite. El costo base es informativo. El costo por orden fijo se cobra al crear cada orden; el porcentual, cuando la orden llega a un estado final.",
  mostrarArchivados: "Mostrar archivados",
  columnaNombre: "Nombre",
  columnaVisibilidad: "Visibilidad",
  // SLT-66 (design §6.2, R24): costo base y costo por orden.
  columnaCosto: "Costo",
  columnaTopes: "Topes",
  // SLT-214 (design §4.4; R20).
  columnaBeneficios: "Beneficios",
  sinBeneficios: "Sin beneficios",
  // SLT-215 (design §4.3; R21).
  columnaNiveles: "Niveles",
  columnaEmpresas: "Empresas",
  columnaCambio: "Cambio programado",
  sinCambio: "Ninguno",
  cambioDesde: (fecha: string) => `Desde ${fecha}`,
  verPlan: (nombre: string) => `Ver el plan ${nombre}`,
  creado: (nombre: string) => `Plan «${nombre}» creado.`,
  /** SLT-118 (R32, P11): el custom quedó pendiente; el texto único del cambio programado, con la fecha real. */
  programado: (fecha: string) => `${textoCambioProgramado(fecha)}.`,
  vacio: "Aún no hay planes.",
  vacioAyuda: "Crea el primero con «Nuevo plan».",
  vacioArchivados: "Todos los planes están archivados.",
  vacioArchivadosAyuda: "Marca «Mostrar archivados» para verlos.",
  sinCatalogo: "No se pudo cargar el catálogo de planes.",
  reintentar: "Reintentar",
  /** SLT-144 (R25): junto al nombre del plan que tiene un borrador de cambio. */
  cambioEnBorrador: "Cambio en borrador",
  /** SLT-144 (R13): al cerrar el panel con algún paso guardado y sin confirmar. */
  borradorQueda: "El borrador queda guardado. Puedes retomarlo luego.",
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
  /** Las empresas para un plan custom (`listarEmpresasPlataforma`), con si ya tienen plan (D4). */
  empresas: EmpresaParaCustom[] | null;
  /** Ajuste planes-custom (D5): «Inicio del ciclo» por defecto del custom, del reloj del servidor. */
  inicioCicloPorDefecto: string;
  /** SLT-58 (R30): el `min`/`max` de «Inicio del ciclo», del reloj del servidor. */
  rangoInicioCiclo: RangoDelInicioDelCiclo;
  /** SLT-86 (R16): el `min`/`max` de «Rige desde» de un custom para una empresa con plan. */
  rangoFechaDeEfecto: RangoDelInicioDelCiclo;
  /**
   * SLT-144 (design §3.3; R24, R25): los borradores de planes; `null` si no se pudieron leer (el catálogo
   * sigue).
   */
  borradores: BorradorResumen[] | null;
  /** SLT-144 (design §4.7): las actions de `lib/actions/plan-borrador.ts`, inyectadas desde la página. */
  borrador: AccionesDelBorrador;
  /** Ajuste planes-custom (D13): `previsualizarCustomAction`, inyectada desde la página. */
  previsualizarCustom: (input: PrevisualizarCustomInput) => Promise<VistaPreviaCustomResult>;
}

/**
 * SLT-58 (design §6.3; R13, R14) — el catálogo de planes del superadmin: una fila por plan con su
 * visibilidad, costo base y costo por orden (sin moneda; SLT-66), topes, cuántas empresas lo tienen y la fecha del cambio
 * programado. Los archivados se esconden por defecto y, al mostrarlos, llevan la marca «Archivado».
 * «Nuevo plan» abre el formulario en un panel lateral; tras crear, se relee la página.
 */
export function PlanesModule({
  errorDeCarga = false,
  planes,
  empresas,
  inicioCicloPorDefecto,
  rangoInicioCiclo,
  rangoFechaDeEfecto,
  borradores,
  borrador,
  previsualizarCustom,
}: PlanesModuleProps) {
  const router = useRouter();
  const idArchivados = useId();
  const [mostrarArchivados, setMostrarArchivados] = useState(false);
  const [abierto, setAbierto] = useState(false);
  /** SLT-144 (R26): el borrador de creación que se retoma en el panel; `null` en un «Nuevo plan». */
  const [retomado, setRetomado] = useState<string | null>(null);
  /** SLT-144 (R13): el panel abierto guardó algún paso; se vuelve a `false` al abrirlo y al confirmar. */
  const guardadoEnElPanel = useRef(false);
  /** SLT-144 (R13, R27): un aviso de la pantalla que no es el de un plan creado. */
  const [aviso, setAviso] = useState<string | null>(null);
  const [creado, setCreado] = useState<string | null>(null);
  /** SLT-118 (R32): la fecha real (`AAAA-MM-DD`) del custom que quedó pendiente; `null` si rige ya. */
  const [creadoDesde, setCreadoDesde] = useState<string | null>(null);
  /** Ajuste planes-custom (D12): los topes ya pasados del `ok` de un custom, con el texto del modal. */
  const [avisosCreado, setAvisosCreado] = useState<string[]>([]);

  const visibles = mostrarArchivados ? planes : planes.filter((p) => !p.archivado);

  function alCrear(r: Extract<PlanResult, { estado: "ok" }>, nombre: string) {
    guardadoEnElPanel.current = false;
    setAbierto(false);
    setCreado(nombre);
    setCreadoDesde(r.vigenteDesde);
    setAvisosCreado(textosDeLosAvisosDeTopes(r.avisos));
    router.refresh();
  }

  function abrirPanel(borradorId: string | null) {
    setCreado(null);
    setCreadoDesde(null);
    setAvisosCreado([]);
    setAviso(null);
    guardadoEnElPanel.current = false;
    setRetomado(borradorId);
    setAbierto(true);
  }

  function alCambiarPanel(siguiente: boolean) {
    setAbierto(siguiente);
    if (siguiente || !guardadoEnElPanel.current) return;
    guardadoEnElPanel.current = false;
    setAviso(TEXTOS.borradorQueda);
    // La sección «Borradores» debe traer el que se acaba de guardar para poder retomarlo (R24).
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
        <Button type="button" onClick={() => abrirPanel(null)}>
          <Plus aria-hidden="true" />
          {TEXTOS.nuevo}
        </Button>
      </div>

      {creado !== null ? (
        <Alert role="status">
          <AlertDescription>
            {TEXTOS.creado(creado)}
            {creadoDesde !== null ? ` ${TEXTOS.programado(creadoDesde)}` : null}
          </AlertDescription>
        </Alert>
      ) : null}
      {creado !== null && avisosCreado.length > 0 ? <AvisosDeTopes avisos={avisosCreado} /> : null}
      {aviso !== null ? (
        <Alert role="status">
          <AlertDescription>{aviso}</AlertDescription>
        </Alert>
      ) : null}

      <BorradoresDePlanes
        borradores={borradores}
        planes={planes}
        descartar={borrador.descartar}
        onRetomar={(borradorId) => abrirPanel(borradorId)}
        onDescartado={(texto) => {
          setCreado(null);
          setAviso(texto);
          router.refresh();
        }}
      />

      <Catalogo
        planes={visibles}
        hayArchivadosOcultos={!mostrarArchivados && planes.length > 0}
        conBorrador={new Set((borradores ?? []).flatMap((b) => (b.planId === null ? [] : [b.planId])))}
      />

      <Sheet open={abierto} onOpenChange={alCambiarPanel}>
        {/* SLT-130 (R6): el Sheet ancho; el scroll lo lleva el contenido del paso, no el panel entero. */}
        <SheetContent className="gap-0" style={ESTILO_SHEET_PLAN}>
          <SheetHeader>
            <SheetTitle>{TEXTOS.tituloNuevo}</SheetTitle>
            <SheetDescription>{TEXTOS.descripcionNuevo}</SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1">
            <AbrirPlanForm
              origen={retomado === null ? null : { borradorId: retomado }}
              onCerrar={() => alCambiarPanel(false)}
              modo="crear"
              empresas={empresas}
              inicioCicloPorDefecto={inicioCicloPorDefecto}
              rangoInicioCiclo={rangoInicioCiclo}
              rangoFechaDeEfecto={rangoFechaDeEfecto}
              borrador={borrador}
              previsualizar={previsualizarCustom}
              onGuardado={alCrear}
              onBorradorGuardado={() => {
                guardadoEnElPanel.current = true;
              }}
            />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Catalogo({
  planes,
  hayArchivadosOcultos,
  conBorrador,
}: {
  planes: PlanDelCatalogo[];
  hayArchivadosOcultos: boolean;
  /** SLT-144 (R25): los planes con un borrador de cambio. */
  conBorrador: ReadonlySet<string>;
}) {
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
          <TableHead>{TEXTOS.columnaCosto}</TableHead>
          <TableHead>{TEXTOS.columnaTopes}</TableHead>
          <TableHead className={SOLO_DESDE_MD}>{TEXTOS.columnaBeneficios}</TableHead>
          <TableHead className={SOLO_DESDE_MD}>{TEXTOS.columnaNiveles}</TableHead>
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
                {conBorrador.has(plan.id) ? <Badge variant="info">{TEXTOS.cambioEnBorrador}</Badge> : null}
              </div>
            </TableCell>
            <TableCell className={SOLO_DESDE_MD}>{textoDeVisibilidad(plan.visibilidad, plan.empresaNombre)}</TableCell>
            <TableCell>
              <ul className="flex flex-col gap-0.5">
                {lineasDeCosto(plan)
                  .slice(0, 2)
                  .map((linea) => (
                    <li key={linea}>{linea}</li>
                  ))}
              </ul>
            </TableCell>
            <TableCell>
              <ul className="flex flex-col gap-0.5">
                {lineasDeTopes(plan.topes, true).map((linea) => (
                  <li key={linea}>{linea}</li>
                ))}
              </ul>
            </TableCell>
            {/* SLT-214 (R20, R21): los 3 primeros; «Mostrar más» despliega el resto en esta fila sola. */}
            <TableCell className={SOLO_DESDE_MD}>
              <ListaDeBeneficios beneficios={plan.beneficios ?? []} plegable={3} vacio={TEXTOS.sinBeneficios} />
            </TableCell>
            {/* SLT-215 (R21): todos los niveles, uno por línea y en su orden; sin «Mostrar más» (son 10 como mucho). */}
            <TableCell className={SOLO_DESDE_MD}>
              <ul className="flex flex-col gap-0.5">
                {lineasDeNiveles(plan.niveles ?? []).map((linea) => (
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
