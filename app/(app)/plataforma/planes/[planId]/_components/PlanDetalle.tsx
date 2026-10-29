"use client";

import { useId, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ModuloApagable, PlanRastroAccion } from "@prisma/client";
import { TriangleAlert } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { nombreDelModulo } from "@/lib/modulos/catalogo";
import {
  lineasDeCambioDelPlan,
  mensajeTopesPasados,
  SIN_LINEAS_DE_CAMBIO,
  textoDelPrecio,
  TITULO_LINEAS_DE_CAMBIO,
} from "@/lib/planes/mensajes";
import type {
  ArchivarPlanInput,
  CancelarCambioPlanInput,
  DetallePlan,
  EditarPlanInput,
  FilaRastro,
  PlanResult,
  PrecioPlan,
  TopeExcedido,
  TopesPlan,
} from "@/lib/types/planes";
import { fechaCalendarioCR } from "@/lib/utils/fecha-cr";
import { horaCostaRica } from "@/lib/utils/hora-cr";

import { mensajeDelRechazo, PlanForm, RECHAZO_GENERICO } from "../../_components/PlanForm";
import { lineasDeTopes, TEXTOS_PLAN, textoDeVisibilidad } from "../../_components/plan-vista";

/** Textos de la pantalla, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  volver: "Volver a Planes",
  editar: "Editar",
  archivar: "Archivar",
  archivadoAviso: "Plan archivado: no se puede editar ni asignar. Las empresas que ya lo tienen lo conservan.",
  vigente: "Versión vigente",
  visibilidad: "Visibilidad",
  precio: "Precio informativo",
  topes: "Topes",
  modulos: "Módulos incluidos",
  sinModulos: "Ninguno",
  pendiente: "Cambio programado",
  pendienteDesde: (fecha: string) => `Cambio programado desde ${fecha}`,
  sinPendiente: "No hay ningún cambio programado.",
  cancelarCambio: "Cancelar cambio",
  empresas: "Empresas con este plan",
  sinEmpresas: "Ninguna empresa tiene este plan.",
  rastro: "Historial del plan",
  sinRastro: "Este plan aún no tiene movimientos.",
  columnaFecha: "Fecha",
  columnaActor: "Quién",
  columnaAccion: "Acción",
  columnaCambios: "Qué cambió",
  tituloEditar: "Editar plan",
  descripcionEditar: "Los topes vacíos no tienen límite. El precio es informativo.",
  confirmarArchivo: "¿Archivar este plan?",
  confirmarArchivoTexto:
    "Deja de ofrecerse para asignar y no se podrá editar. Las empresas que ya lo tienen lo conservan con sus topes.",
  confirmarArchivoPendiente: (fecha: string) => `También se cancela el cambio programado desde ${fecha}.`,
  confirmarArchivoBoton: "Archivar plan",
  confirmarCancelar: "¿Cancelar el cambio programado?",
  confirmarCancelarTexto: (fecha: string) => `El cambio previsto para ${fecha} no se aplicará; el plan sigue igual.`,
  confirmarCancelarBoton: "Cancelar cambio",
  volverAtras: "Volver",
  guardadoInmediato: "Cambios guardados.",
  guardadoProgramado: (fecha: string) => `Cambio programado desde ${fecha}.`,
  sinCambios: "No había nada que cambiar.",
  archivado: "Plan archivado.",
  cancelado: "Cambio programado cancelado.",
  avisosTitulo: "Estas empresas ya pasan un tope del plan guardado:",
  creadoCon: "Alta del plan",
  rigeDesde: (fecha: string) => `Rige desde ${fecha}`,
  reemplaza: (antes: string, despues: string) => `Reemplaza al previsto para ${antes}; rige desde ${despues}`,
  cancelaPrevisto: (fecha: string) => `Se cancela el previsto para ${fecha}`,
  nombreDelPlan: (nombre: string) => `Nombre del plan: ${nombre}`,
  precioDelPlan: (precio: string) => `Precio: ${precio}`,
  modulosDelPlan: (modulos: string) => `Módulos: ${modulos}`,
} as const;

/** La acción del rastro, traducida. `Record` total: una acción nueva no compila sin su texto. */
const ACCIONES: Record<PlanRastroAccion, string> = {
  creado: "Creado",
  editado: "Editado",
  archivado: "Archivado",
  cambio_programado: "Cambio programado",
  cambio_reemplazado: "Cambio reemplazado",
  cambio_cancelado: "Cambio cancelado",
  cambio_aplicado: "Cambio aplicado",
};

export interface PlanDetalleProps {
  detalle: DetallePlan;
  /** Las actions de SL-24, inyectadas desde la página para poder probarlas. */
  editarPlan: (input: EditarPlanInput) => Promise<PlanResult>;
  archivarPlan: (input: ArchivarPlanInput) => Promise<PlanResult>;
  cancelarCambio: (input: CancelarCambioPlanInput) => Promise<PlanResult>;
}

/** Lo último que pasó en la pantalla: un aviso de éxito (con los topes pasados, R15) o un rechazo (R18). */
type Desenlace =
  | { tipo: "ok"; mensaje: string; avisos: TopeExcedido[] }
  | { tipo: "rechazo"; mensaje: string };

/**
 * SLT-58 (design §6.3; R15–R18) — el detalle de un plan para el superadmin: la versión vigente, el
 * cambio programado con «Cancelar cambio», «Editar» y «Archivar», las empresas que lo tienen y su
 * rastro de plataforma. Cancelar y archivar piden confirmación antes de llamar a la action (R17). Un
 * plan archivado no ofrece editar, archivar ni cancelar. Tras un `ok` se relee la página; un rechazo
 * se explica y la pantalla no da el cambio por hecho (R18).
 */
export function PlanDetalle({ detalle, editarPlan, archivarPlan, cancelarCambio }: PlanDetalleProps) {
  const router = useRouter();
  const { plan, pendiente } = detalle;
  const [editando, setEditando] = useState(false);
  const [confirmar, setConfirmar] = useState<"archivar" | "cancelar" | null>(null);
  const [desenlace, setDesenlace] = useState<Desenlace | null>(null);

  /** Llama a una action de confirmación; un throw cuenta como rechazo genérico. */
  async function ejecutar(llamada: () => Promise<PlanResult>, exito: string) {
    let r: PlanResult | null;
    try {
      r = await llamada();
    } catch (error) {
      console.error("[PlanDetalle] la action lanzó", error);
      r = null;
    }
    if (r === null) {
      setDesenlace({ tipo: "rechazo", mensaje: RECHAZO_GENERICO });
    } else if (r.estado === "ok") {
      setDesenlace({ tipo: "ok", mensaje: exito, avisos: [] });
      router.refresh();
    } else {
      setDesenlace({ tipo: "rechazo", mensaje: mensajeDelRechazo(r) ?? RECHAZO_GENERICO });
    }
  }

  function alEditar(r: Extract<PlanResult, { estado: "ok" }>) {
    setEditando(false);
    const mensaje =
      r.vigenteDesde !== null
        ? TEXTOS.guardadoProgramado(r.vigenteDesde)
        : r.cambio
          ? TEXTOS.guardadoInmediato
          : TEXTOS.sinCambios;
    setDesenlace({ tipo: "ok", mensaje, avisos: r.avisos });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Link
          href="/plataforma/planes"
          className="w-fit rounded-sm text-sm text-primary-strong underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
        >
          {TEXTOS.volver}
        </Link>
        {plan.archivado ? null : (
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() => {
                setDesenlace(null);
                setEditando(true);
              }}
            >
              {TEXTOS.editar}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setDesenlace(null);
                setConfirmar("archivar");
              }}
            >
              {TEXTOS.archivar}
            </Button>
          </div>
        )}
      </div>

      {plan.archivado ? (
        // Un estado fijo de la pantalla, no un aviso que llega: `note` y no el `alert` de la primitiva.
        <Alert role="note">
          <AlertDescription className="flex flex-wrap items-center gap-2">
            <Badge variant="warning">{TEXTOS_PLAN.archivado}</Badge>
            <span>{TEXTOS.archivadoAviso}</span>
          </AlertDescription>
        </Alert>
      ) : null}

      {desenlace !== null ? <AvisoDesenlace desenlace={desenlace} /> : null}

      <Seccion titulo={TEXTOS.vigente}>
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[max-content_1fr]">
          <Dato termino={TEXTOS.visibilidad}>{textoDeVisibilidad(plan.visibilidad, detalle.empresaNombre)}</Dato>
          <Dato termino={TEXTOS.precio}>{textoDelPrecio(plan.precio)}</Dato>
          <Dato termino={TEXTOS.topes}>
            <ul className="flex flex-col gap-0.5">
              {lineasDeTopes(plan.topes).map((linea) => (
                <li key={linea}>{linea}</li>
              ))}
            </ul>
          </Dato>
          <Dato termino={TEXTOS.modulos}>
            {plan.modulos.length === 0 ? TEXTOS.sinModulos : plan.modulos.map(nombreDelModulo).join(", ")}
          </Dato>
        </dl>
      </Seccion>

      <Seccion titulo={TEXTOS.pendiente}>
        {pendiente === null ? (
          <p className="text-sm text-muted-foreground">{TEXTOS.sinPendiente}</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <p className="font-medium">{TEXTOS.pendienteDesde(pendiente.vigenteDesde)}</p>
            {pendiente.lineas.length === 0 ? (
              <p>{SIN_LINEAS_DE_CAMBIO}</p>
            ) : (
              <>
                <p>{TITULO_LINEAS_DE_CAMBIO}</p>
                <ul className="flex list-disc flex-col gap-0.5 pl-5">
                  {pendiente.lineas.map((linea) => (
                    <li key={linea}>{linea}</li>
                  ))}
                </ul>
              </>
            )}
            {plan.archivado ? null : (
              <div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setDesenlace(null);
                    setConfirmar("cancelar");
                  }}
                >
                  {TEXTOS.cancelarCambio}
                </Button>
              </div>
            )}
          </div>
        )}
      </Seccion>

      <Seccion titulo={TEXTOS.empresas}>
        {detalle.empresas.length === 0 ? (
          <p className="text-sm text-muted-foreground">{TEXTOS.sinEmpresas}</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {detalle.empresas.map((e) => (
              <li key={e.id}>
                <Link
                  href={`/plataforma/empresas/${e.id}`}
                  className="rounded-sm text-primary-strong underline-offset-4 hover:underline focus-visible:ring-3 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {e.nombre}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Seccion>

      <Seccion titulo={TEXTOS.rastro}>
        <Rastro filas={detalle.rastro} />
      </Seccion>

      {plan.archivado ? null : (
        <>
          <Sheet open={editando} onOpenChange={setEditando}>
            <SheetContent className="w-full overflow-y-auto sm:max-w-lg data-[side=right]:sm:max-w-lg">
              <SheetHeader>
                <SheetTitle>{TEXTOS.tituloEditar}</SheetTitle>
                <SheetDescription>{TEXTOS.descripcionEditar}</SheetDescription>
              </SheetHeader>
              <div className="px-4 pb-4">
                <PlanForm modo="editar" plan={plan} enviar={editarPlan} onGuardado={(r) => alEditar(r)} />
              </div>
            </SheetContent>
          </Sheet>

          <Modal
            open={confirmar === "archivar"}
            onOpenChange={(abierto) => setConfirmar(abierto ? "archivar" : null)}
            title={TEXTOS.confirmarArchivo}
            description={TEXTOS.confirmarArchivoTexto}
            confirmLabel={TEXTOS.confirmarArchivoBoton}
            cancelLabel={TEXTOS.volverAtras}
            confirmVariant="destructive"
            size="md"
            onConfirm={() => ejecutar(() => archivarPlan({ planId: plan.id }), TEXTOS.archivado)}
          >
            {pendiente !== null ? (
              <p className="text-sm">{TEXTOS.confirmarArchivoPendiente(pendiente.vigenteDesde)}</p>
            ) : null}
          </Modal>

          {pendiente !== null ? (
            <Modal
              open={confirmar === "cancelar"}
              onOpenChange={(abierto) => setConfirmar(abierto ? "cancelar" : null)}
              title={TEXTOS.confirmarCancelar}
              description={TEXTOS.confirmarCancelarTexto(pendiente.vigenteDesde)}
              confirmLabel={TEXTOS.confirmarCancelarBoton}
              cancelLabel={TEXTOS.volverAtras}
              confirmVariant="destructive"
              size="md"
              onConfirm={() => ejecutar(() => cancelarCambio({ planId: plan.id }), TEXTOS.cancelado)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h2 id={id} className="text-base font-semibold">
        {titulo}
      </h2>
      {children}
    </section>
  );
}

function Dato({ termino, children }: { termino: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-muted-foreground">{termino}</dt>
      <dd>{children}</dd>
    </>
  );
}

/**
 * El aviso de lo último que pasó. Los topes pasados de una edición (R15) van como advertencia, una
 * línea por empresa y tope: quién, cuánto usa y cuánto permite el plan nuevo.
 */
function AvisoDesenlace({ desenlace }: { desenlace: Desenlace }) {
  if (desenlace.tipo === "rechazo") {
    return (
      <Alert variant="destructive">
        <AlertDescription>{desenlace.mensaje}</AlertDescription>
      </Alert>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <Alert role="status">
        <AlertDescription>{desenlace.mensaje}</AlertDescription>
      </Alert>
      {desenlace.avisos.length > 0 ? (
        <Alert className="border-warning/40 text-warning-strong">
          <TriangleAlert aria-hidden="true" />
          <AlertDescription className="text-warning-strong">
            <p>{TEXTOS.avisosTitulo}</p>
            <ul className="flex list-disc flex-col gap-0.5 pl-5">
              {mensajeTopesPasados(desenlace.avisos)
                .split("\n")
                .map((linea) => (
                  <li key={linea}>{linea}</li>
                ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
    </div>
  );
}

/** «AAAA-MM-DD HH:mm» de un instante, en la hora de la plataforma (design §7). */
function fechaHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${fechaCalendarioCR(d)} ${horaCostaRica(iso)}`;
}

/** El día (`AAAA-MM-DD`, hora de la plataforma) de un `vigenteDesde` guardado como instante. */
function diaDe(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : fechaCalendarioCR(d);
}

type Par = { antes: unknown; despues: unknown };

/**
 * Las líneas de «qué cambió» de una fila del rastro. Los campos con `antes` (una edición, un cambio
 * programado o aplicado) salen con `lineasDeCambioDelPlan`, el mismo texto que los correos; los de un
 * alta (`antes: null`) dicen el valor con que nació el plan. `vigenteDesde` dice desde cuándo rige o
 * qué cambio se canceló. `cambios` lo escribió el repositorio de SL-24 con `diferenciasDelPlan`, así
 * que cada campo trae la forma canónica del plan.
 */
function lineasDelRastro(fila: FilaRastro): string[] {
  const c = fila.cambios as Record<string, Par | undefined>;
  const lineas: string[] = [];
  /** El campo de un alta (`antes: null`), o `null` si no vino o es una edición. */
  const deAlta = (p: Par | undefined): Par | null => (p !== undefined && p.antes === null ? p : null);
  /** El campo de una edición (con `antes`), o `null` si no vino o es un alta. */
  const deEdicion = (p: Par | undefined): Par | null => (p !== undefined && p.antes !== null ? p : null);

  const nombreAlta = deAlta(c.nombre);
  const precioAlta = deAlta(c.precio);
  const topesAlta = deAlta(c.topes);
  const modulosAlta = deAlta(c.modulos);
  if (nombreAlta) lineas.push(TEXTOS.nombreDelPlan(String(nombreAlta.despues)));
  if (precioAlta) lineas.push(TEXTOS.precioDelPlan(textoDelPrecio(precioAlta.despues as PrecioPlan)));
  if (topesAlta) lineas.push(...lineasDeTopes(topesAlta.despues as TopesPlan));
  if (modulosAlta) {
    const modulos = modulosAlta.despues as ModuloApagable[];
    lineas.push(TEXTOS.modulosDelPlan(modulos.length === 0 ? TEXTOS.sinModulos : modulos.map(nombreDelModulo).join(", ")));
  }

  const nombre = deEdicion(c.nombre);
  const topes = deEdicion(c.topes);
  const modulos = deEdicion(c.modulos);
  const precio = deEdicion(c.precio);
  lineas.push(
    ...lineasDeCambioDelPlan({
      nombre: nombre ? { antes: String(nombre.antes), despues: String(nombre.despues) } : undefined,
      topes: topes ? { antes: topes.antes as TopesPlan, despues: topes.despues as TopesPlan } : undefined,
      modulos: modulos
        ? { antes: modulos.antes as ModuloApagable[], despues: modulos.despues as ModuloApagable[] }
        : undefined,
      precio: precio ? { antes: precio.antes as PrecioPlan, despues: precio.despues as PrecioPlan } : undefined,
    }),
  );

  const vigencia = c.vigenteDesde;
  if (vigencia) {
    const antes = diaDe(vigencia.antes);
    const despues = diaDe(vigencia.despues);
    if (antes !== null && despues !== null) lineas.push(TEXTOS.reemplaza(antes, despues));
    else if (despues !== null) lineas.push(TEXTOS.rigeDesde(despues));
    else if (antes !== null) lineas.push(TEXTOS.cancelaPrevisto(antes));
  }
  return lineas;
}

function Rastro({ filas }: { filas: FilaRastro[] }) {
  if (filas.length === 0) {
    return (
      <div className="rounded-md border border-border">
        <EmptyState title={TEXTOS.sinRastro} />
      </div>
    );
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{TEXTOS.columnaFecha}</TableHead>
          <TableHead>{TEXTOS.columnaActor}</TableHead>
          <TableHead>{TEXTOS.columnaAccion}</TableHead>
          <TableHead>{TEXTOS.columnaCambios}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => {
          const lineas = lineasDelRastro(fila);
          return (
            <TableRow key={fila.id}>
              <TableCell className="whitespace-nowrap tabular-nums">{fechaHora(fila.creadoAt)}</TableCell>
              <TableCell>{fila.actorNombre}</TableCell>
              <TableCell>{ACCIONES[fila.accion]}</TableCell>
              <TableCell>
                {lineas.length === 0 ? (
                  "—"
                ) : (
                  <ul className="flex flex-col gap-0.5">
                    {lineas.map((linea, i) => (
                      <li key={i}>{linea}</li>
                    ))}
                  </ul>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
