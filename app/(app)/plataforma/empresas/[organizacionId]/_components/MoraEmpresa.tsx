"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { money } from "@/lib/config/moneda";
import { GRACIA_MAX, GRACIA_MIN, MORA_TEXTOS, MOTIVO_MAX, fechaLegible } from "@/lib/planes/mora";
import { ACCION_LABELS } from "@/lib/types/historial-accion";
import type {
  DarPlazoResult,
  EstadoMora,
  FijarGraciaResult,
  FilaHistorialMora,
  MoraEmpresaVista,
} from "@/lib/types/mora";
import { fechaCortaEnZona } from "@/lib/utils/fecha-corta";
import { ZONA_CR } from "@/lib/utils/fecha-cr";

// SLT-121 (design §7.2; R3, R22, R31, R32) — la sección «Plazo de pago y mora» del detalle de una empresa en
// Plataforma > Empresas: la gracia vigente con su campo para cambiarla o volver a la global, el estado de la mora
// con las facturas vencidas, «Descongelar» (solo si está congelada) y el historial de la mora. Los datos llegan
// por props desde `page.tsx` (Server Component); las dos actions, ya ligadas a la empresa de la URL. El servidor
// vuelve a decidir todo: lo que se comprueba aquí solo evita mandar lo que ya se sabe que caerá.

const T = MORA_TEXTOS.plataforma;

/** Textos propios de la pantalla (los del dominio viven en `MORA_TEXTOS.plataforma`), para cuando llegue la i18n. */
const TEXTOS = {
  ayuda: "Días que tiene la empresa para pagar cada factura cerrada antes de que se congele su operación.",
  graciaVigente: "Gracia vigente",
  graciaCampo: "Días de gracia propios",
  graciaAyuda: `Un número entero de ${GRACIA_MIN} a ${GRACIA_MAX}.`,
  guardar: "Guardar",
  usarGlobal: "Usar la global",
  estado: "Estado",
  enPlazo: (fecha: string) => `En plazo · fecha límite ${fecha}`,
  congeladaDesde: (fecha: string) => `Congelada desde el ${fecha}`,
  descongeladaHasta: (fecha: string) => `Descongelada a mano hasta el ${fecha}`,
  saldoVencido: (monto: string) => `Saldo vencido: ${monto}`,
  facturasVencidas: "Facturas vencidas",
  sinVencidas: "No hay facturas vencidas",
  columnas: { numero: "Factura", fechaLimite: "Fecha límite", saldo: "Saldo" },
  numero: (n: number) => `N.º ${n}`,
  historial: "Historial de la mora",
  sinHistorial: "Sin movimientos de mora",
  columnasHistorial: { fecha: "Fecha", accion: "Acción", quien: "Quién", detalle: "Detalle" },
  sistema: "Sistema",
  cambio: (antes: string, despues: string) => `${antes} → ${despues}`,
  descongelar: "Descongelar…",
  tituloDescongelar: "Descongelar la operación",
  avisoDescongelar: "La empresa vuelve a operar hasta la fecha indicada. Si sigue con facturas vencidas, se congela la madrugada siguiente.",
  motivo: "Motivo",
  hasta: "Habilitada hasta",
  confirmarDescongelar: "Descongelar",
  fallo: "No se pudo guardar ahora",
} as const;

/** Lo que se pinta en una celda sin dato (la misma raya larga que `money`). */
const SIN_DATO = "—";

/** «5 oct 2026» en la zona de la plataforma (como sus vecinas: `ZONA_CR` hasta SLT-90). */
function fecha(instante: Date): string {
  return fechaCortaEnZona(instante, ZONA_CR);
}

/** El estado, con su fecha cuando la tiene (R32). */
function textoDelEstado(estado: EstadoMora): string {
  switch (estado.estado) {
    case "en_plazo":
      return TEXTOS.enPlazo(fechaLegible(estado.fechaLimite));
    case "congelada":
      return TEXTOS.congeladaDesde(fecha(estado.desde));
    case "con_plazo":
      return TEXTOS.descongeladaHasta(fechaLegible(estado.hasta));
    case "al_dia":
    case "vencida":
      return T.estado[estado.estado];
  }
}

/** El mensaje de un rechazo que no es de un campo. */
function mensajeDeRechazo(estado: "forbidden" | "not_found"): string {
  return estado === "forbidden" ? T.errores.sinPermiso : T.errores.noEncontrada;
}

/** El error de un campo; un texto vacío (campo ya corregido) no es error. */
function errorDe(errores: Record<string, string>, campo: string): string | undefined {
  const error = errores[campo];
  return error === undefined || error === "" ? undefined : error;
}

export interface MoraEmpresaProps {
  /** La lectura de la página; `null` = falló (design §7.2: lectura aislada). */
  datos: MoraEmpresaVista | null;
  /** `fijarGraciaEmpresaAction` ligada a la empresa de la URL (R3). */
  fijarGracia: (input: { dias: number | null }) => Promise<FijarGraciaResult>;
  /** `darPlazoEmpresaAction` ligada a la empresa de la URL (R22; SLT-255 R2). */
  descongelar: (input: { motivo: string; hasta: string }) => Promise<DarPlazoResult>;
}

export function MoraEmpresa({ datos, fijarGracia, descongelar }: Readonly<MoraEmpresaProps>) {
  const tituloId = useId();
  const ayudaId = useId();

  return (
    <section aria-labelledby={tituloId} aria-describedby={ayudaId} className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id={tituloId} className="text-base font-semibold">
          {T.titulo}
        </h2>
        <p id={ayudaId} className="text-sm text-muted-foreground">
          {TEXTOS.ayuda}
        </p>
      </div>

      {datos === null ? (
        <Alert variant="destructive">
          <AlertDescription>{T.sinCargar}</AlertDescription>
        </Alert>
      ) : (
        <ContenidoMora datos={datos} fijarGracia={fijarGracia} descongelar={descongelar} />
      )}
    </section>
  );
}

function ContenidoMora({
  datos,
  fijarGracia,
  descongelar,
}: {
  datos: MoraEmpresaVista;
  fijarGracia: MoraEmpresaProps["fijarGracia"];
  descongelar: MoraEmpresaProps["descongelar"];
}) {
  const [descongelando, setDescongelando] = useState(false);
  const { gracia, estado } = datos;
  const saldoVencido = estado.estado === "vencida" || estado.estado === "congelada" ? estado.saldoVencido : null;

  return (
    <div className="flex flex-col gap-4">
      <dl className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">{TEXTOS.graciaVigente}</dt>
        <dd className="font-medium">
          {gracia.origen === "propia" ? T.graciaPropia(gracia.dias) : T.graciaGlobal(gracia.dias)}
        </dd>
        <dt className="text-muted-foreground">{TEXTOS.estado}</dt>
        <dd className="font-medium" data-estado-mora={estado.estado}>
          {textoDelEstado(estado)}
        </dd>
      </dl>

      <FormularioGracia key={String(gracia.propia)} propia={gracia.propia} fijarGracia={fijarGracia} />

      {estado.estado === "congelada" ? (
        <div>
          <Button type="button" size="sm" variant="destructive" onClick={() => setDescongelando(true)}>
            {TEXTOS.descongelar}
          </Button>
        </div>
      ) : null}

      <FacturasVencidas facturas={datos.facturasVencidas} saldoVencido={saldoVencido} />

      <HistorialMora filas={datos.historial} />

      {descongelando ? (
        <DialogoDescongelar
          rango={datos.plazo}
          descongelar={descongelar}
          onCerrar={() => setDescongelando(false)}
        />
      ) : null}
    </div>
  );
}

/** R3: el campo de 1 a 60 con «Guardar» y, si hay gracia propia, «Usar la global». */
function FormularioGracia({
  propia,
  fijarGracia,
}: {
  propia: number | null;
  fijarGracia: MoraEmpresaProps["fijarGracia"];
}) {
  const router = useRouter();
  const [dias, setDias] = useState(propia === null ? "" : String(propia));
  const [error, setError] = useState<string | undefined>(undefined);
  const [fallo, setFallo] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(valor: number | null) {
    setError(undefined);
    setFallo(null);
    setEnviando(true);
    let r: FijarGraciaResult;
    try {
      r = await fijarGracia({ dias: valor });
    } catch (e) {
      console.error("[MoraEmpresa] fijarGracia lanzó", e);
      setFallo(TEXTOS.fallo);
      setEnviando(false);
      return;
    }
    setEnviando(false);
    switch (r.estado) {
      case "ok":
      case "sin_cambio":
        router.refresh();
        return;
      case "validation_error":
        setError(errorDe(r.errores, "dias") ?? Object.values(r.errores)[0] ?? T.errores.dias);
        return;
      case "forbidden":
      case "not_found":
        setFallo(mensajeDeRechazo(r.estado));
        return;
    }
  }

  function guardar() {
    const texto = dias.trim();
    // Un entero escrito tal cual: «7.5», «-3» o «1e1» no llegan al servidor.
    const n = Number.parseInt(texto, 10);
    if (String(n) !== texto || n < GRACIA_MIN || n > GRACIA_MAX) {
      setFallo(null);
      setError(T.errores.dias);
      return;
    }
    void enviar(n);
  }

  return (
    <form
      // El error lo pinta `FormField` (con `aria-invalid`), no la burbuja nativa de `min`/`max`.
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        guardar();
      }}
    >
      <div className="flex flex-wrap items-end gap-2">
        <FormField id="mora-gracia-dias" label={TEXTOS.graciaCampo} hint={TEXTOS.graciaAyuda} error={error}>
          {(control) => (
            <Input
              {...control}
              type="number"
              inputMode="numeric"
              min={GRACIA_MIN}
              max={GRACIA_MAX}
              step={1}
              className="w-28"
              value={dias}
              onChange={(e) => {
                setDias(e.target.value);
                setError(undefined);
                setFallo(null);
              }}
            />
          )}
        </FormField>
        <Button type="submit" size="sm" disabled={enviando}>
          {TEXTOS.guardar}
        </Button>
        {propia === null ? null : (
          <Button type="button" size="sm" variant="outline" disabled={enviando} onClick={() => void enviar(null)}>
            {TEXTOS.usarGlobal}
          </Button>
        )}
      </div>
      {fallo === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {fallo}
        </p>
      )}
    </form>
  );
}

/** R32: las facturas vencidas con su número, su fecha límite y su saldo. */
function FacturasVencidas({
  facturas,
  saldoVencido,
}: {
  facturas: MoraEmpresaVista["facturasVencidas"];
  saldoVencido: string | null;
}) {
  const tituloId = useId();
  return (
    <div className="flex flex-col gap-2">
      <h3 id={tituloId} className="text-sm font-semibold">
        {TEXTOS.facturasVencidas}
      </h3>
      {facturas.length === 0 ? (
        <EmptyState title={TEXTOS.sinVencidas} />
      ) : (
        <>
          <Table aria-labelledby={tituloId}>
            <TableHeader>
              <TableRow>
                <TableHead>{TEXTOS.columnas.numero}</TableHead>
                <TableHead>{TEXTOS.columnas.fechaLimite}</TableHead>
                <TableHead className="text-right">{TEXTOS.columnas.saldo}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facturas.map((f) => (
                <TableRow key={f.facturaId} data-factura-id={f.facturaId}>
                  <TableCell>{TEXTOS.numero(f.numero)}</TableCell>
                  <TableCell className="whitespace-nowrap">{fechaLegible(f.fechaLimite)}</TableCell>
                  <TableCell className="text-right font-medium whitespace-nowrap tabular-nums">{money(f.saldo)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {saldoVencido === null ? null : (
            <p className="text-sm font-medium">{TEXTOS.saldoVencido(money(saldoVencido))}</p>
          )}
        </>
      )}
    </div>
  );
}

/** El detalle de una fila del historial: el cambio (antes → después) o el valor nuevo, y el monto si lo hay. */
function detalleDeFila(fila: FilaHistorialMora): string {
  const partes: string[] = [];
  if (fila.valorAnterior !== null && fila.valorNuevo !== null) {
    partes.push(TEXTOS.cambio(fila.valorAnterior, fila.valorNuevo));
  } else if (fila.valorNuevo !== null) {
    partes.push(fila.valorNuevo);
  }
  if (fila.monto !== null) partes.push(money(fila.monto));
  return partes.length === 0 ? SIN_DATO : partes.join(" · ");
}

/** R31: el historial de la mora de la empresa, del más reciente al más viejo (el orden lo trae el repositorio). */
function HistorialMora({ filas }: { filas: readonly FilaHistorialMora[] }) {
  const tituloId = useId();
  return (
    <div className="flex flex-col gap-2">
      <h3 id={tituloId} className="text-sm font-semibold">
        {TEXTOS.historial}
      </h3>
      {filas.length === 0 ? (
        <EmptyState title={TEXTOS.sinHistorial} />
      ) : (
        <Table aria-labelledby={tituloId}>
          <TableHeader>
            <TableRow>
              <TableHead>{TEXTOS.columnasHistorial.fecha}</TableHead>
              <TableHead>{TEXTOS.columnasHistorial.accion}</TableHead>
              <TableHead>{TEXTOS.columnasHistorial.quien}</TableHead>
              <TableHead>{TEXTOS.columnasHistorial.detalle}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((fila) => (
              <TableRow key={fila.id}>
                <TableCell className="whitespace-nowrap">{fecha(fila.createdAt)}</TableCell>
                <TableCell>{ACCION_LABELS[fila.accion]}</TableCell>
                <TableCell>{fila.actorNombre ?? TEXTOS.sistema}</TableCell>
                <TableCell>{detalleDeFila(fila)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

/** R22: el diálogo con el motivo (máximo 200) y la fecha hasta (hoy … hoy + 60; por defecto hoy + 7). */
function DialogoDescongelar({
  rango,
  descongelar,
  onCerrar,
}: {
  rango: MoraEmpresaVista["plazo"];
  descongelar: MoraEmpresaProps["descongelar"];
  onCerrar: () => void;
}) {
  const router = useRouter();
  const [motivo, setMotivo] = useState("");
  const [hasta, setHasta] = useState(rango.porDefecto);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [fallo, setFallo] = useState<string | null>(null);

  function erroresDelCliente(): Record<string, string> {
    const nuevos: Record<string, string> = {};
    const recortado = motivo.trim();
    if (recortado === "" || recortado.length > MOTIVO_MAX) nuevos.motivo = T.errores.motivo;
    // `AAAA-MM-DD` se compara como texto.
    if (hasta === "" || hasta < rango.desde || hasta > rango.hasta) nuevos.hasta = T.errores.hasta;
    return nuevos;
  }

  async function enviar() {
    setFallo(null);
    const delCliente = erroresDelCliente();
    if (Object.keys(delCliente).length > 0) {
      setErrores(delCliente);
      return;
    }
    let r: DarPlazoResult;
    try {
      r = await descongelar({ motivo: motivo.trim(), hasta });
    } catch (e) {
      console.error("[MoraEmpresa] descongelar lanzó", e);
      setFallo(TEXTOS.fallo);
      return;
    }
    switch (r.estado) {
      case "descongelada":
      case "prorroga":
      case "sin_cambio":
        onCerrar();
        router.refresh();
        return;
      case "validation_error":
        setErrores(r.errores);
        if (errorDe(r.errores, "motivo") === undefined && errorDe(r.errores, "hasta") === undefined) {
          setFallo(Object.values(r.errores)[0] ?? TEXTOS.fallo);
        }
        return;
      case "forbidden":
      case "not_found":
        setFallo(mensajeDeRechazo(r.estado));
        return;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={TEXTOS.tituloDescongelar}
      confirmLabel={TEXTOS.confirmarDescongelar}
      closeOnConfirm={false}
      onConfirm={enviar}
    >
      <div className="flex flex-col gap-4">
        <p className="text-sm">{TEXTOS.avisoDescongelar}</p>
        <FormField id="mora-descongelar-motivo" label={TEXTOS.motivo} error={errorDe(errores, "motivo")} required>
          {(control) => (
            <Textarea
              {...control}
              rows={3}
              maxLength={MOTIVO_MAX}
              value={motivo}
              onChange={(e) => {
                setMotivo(e.target.value);
                setErrores((x) => ({ ...x, motivo: "" }));
                setFallo(null);
              }}
            />
          )}
        </FormField>
        <FormField id="mora-descongelar-hasta" label={TEXTOS.hasta} error={errorDe(errores, "hasta")} required>
          {(control) => (
            <Input
              {...control}
              type="date"
              min={rango.desde}
              max={rango.hasta}
              value={hasta}
              onChange={(e) => {
                setHasta(e.target.value);
                setErrores((x) => ({ ...x, hasta: "" }));
                setFallo(null);
              }}
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
