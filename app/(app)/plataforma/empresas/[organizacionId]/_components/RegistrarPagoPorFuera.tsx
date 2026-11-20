"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { ComprobanteCampo } from "@/components/shared/wallet/ComprobanteCampo";
import { Input } from "@/components/ui/input";
import { DESCRIPCION_EGRESO_PLACEHOLDER } from "@/app/(app)/wallet/_components/wallet-labels";
import {
  claveDeFactura,
  montoPagoPorFueraSchema,
  type FacturaConSaldoDTO,
  type RegistrarPagoPorFueraResult,
} from "@/lib/types/pago-plataforma";
import { primerDiaMovimientoAdmisible, problemaDeFechaMovimiento } from "@/lib/types/wallet";
import { fechaCalendario } from "@/lib/utils/calendario-zona";
import { proponerReparto, resumenDelReparto } from "@/lib/utils/reparto-pago-plataforma";

import { RepartoEntreFacturas } from "./RepartoEntreFacturas";

// SLT-143 (design §6.3; R4, R5, R7, R8, R10, R17, R19) — el diálogo «Registrar pago hecho por fuera» del
// superadmin. Monto, fecha, referencia, comprobante opcional y el reparto entre las facturas cerradas, que se
// propone de nuevo cada vez que cambia el monto (R4). El servidor vuelve a decidir todo; esto solo evita mandar
// lo que ya se sabe que caerá. Ni `Number(` ni `parseFloat`: las cuentas van en céntimos `bigint`.
//
// La ventana de días de la fecha se calcula en la zona del país de la EMPRESA, la misma con la que valida el
// servidor (decisión P5 del leader). Si la página no pudo leerla (`zona = null`), el campo va sin ventana ni
// valor inicial, y la fecha la decide el servidor (vacía = hoy).

/** Textos del diálogo, en un solo sitio para cuando llegue la i18n. Forma impersonal (design §6.3). */
const TEXTOS = {
  titulo: "Registrar pago hecho por fuera",
  registrar: "Registrar pago",
  monto: "Monto",
  fecha: "Fecha",
  fechaAyuda: "El día en que la empresa hizo el pago.",
  referencia: "Referencia del pago",
  referenciaVacia: "La referencia del pago es obligatoria.",
  sinFacturas: "La empresa no tiene facturas cerradas con saldo",
  comprobanteNoGuardado: "No se pudo guardar el comprobante. El pago no se registró.",
  falloRegistrar: "No se pudo registrar ahora",
} as const;

/** Lo que tiene el monto escrito: su error de formato, o `null` si vale (o si aún está vacío). */
function problemaDelMonto(monto: string): string | null {
  if (monto.trim() === "") return null;
  const r = montoPagoPorFueraSchema.safeParse(monto);
  return r.success ? null : (r.error.issues[0]?.message ?? null);
}

export interface RegistrarPagoPorFueraProps {
  /** Las facturas cerradas con saldo, de la más vieja a la más nueva. */
  facturas: readonly FacturaConSaldoDTO[];
  /** `registrarPagoPorFueraAction` ligada a la empresa en el servidor. */
  registrar: (formData: FormData) => Promise<RegistrarPagoPorFueraResult>;
  /** La zona horaria del país de la empresa, o `null` si no se pudo leer. */
  zona: string | null;
  onCerrar: () => void;
}

/**
 * Se monta una vez por apertura: la clave de idempotencia nace con el diálogo y se repite en cada envío de la
 * misma apertura (R10), y la ventana de la fecha se congela al abrir.
 */
export function RegistrarPagoPorFuera({ facturas, registrar, zona, onCerrar }: Readonly<RegistrarPagoPorFueraProps>) {
  const router = useRouter();
  const [clave] = useState(() => crypto.randomUUID());
  const [ventana] = useState(() =>
    zona === null ? null : { min: primerDiaMovimientoAdmisible(zona), max: fechaCalendario(new Date(), zona) },
  );
  const [monto, setMonto] = useState("");
  const [fecha, setFecha] = useState(ventana?.max ?? "");
  const [referencia, setReferencia] = useState("");
  const [comprobante, setComprobante] = useState<File | null>(null);
  const [montos, setMontos] = useState<Record<string, string>>({});
  // Los errores de cada campo: los del cliente al enviar y los que devolvió el servidor.
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [fallo, setFallo] = useState<string | null>(null);
  const sinFacturas = facturas.length === 0;

  const errorMonto = problemaDelMonto(monto);
  const montoListo = monto.trim() !== "" && errorMonto === null ? monto.trim() : null;
  const resumen = useMemo(
    () => (montoListo === null ? null : resumenDelReparto(montoListo, facturas, montos)),
    [montoListo, facturas, montos],
  );

  function quitarErrores(...claves: string[]) {
    setFallo(null);
    setErrores((e) => {
      const resto = { ...e };
      for (const c of claves) delete resto[c];
      return resto;
    });
  }

  function cambiarMonto(valor: string) {
    setMonto(valor);
    quitarErrores("monto", "aplicaciones", ...facturas.map((f) => claveDeFactura(f.id)));
    // R4: cada monto nuevo propone el reparto otra vez.
    const listo = valor.trim() !== "" && problemaDelMonto(valor) === null ? valor.trim() : null;
    setMontos(listo === null ? {} : proponerReparto(listo, facturas));
  }

  function cambiarAplicado(facturaId: string, valor: string) {
    quitarErrores("aplicaciones", ...facturas.map((f) => claveDeFactura(f.id)));
    setMontos((m) => ({ ...m, [facturaId]: valor }));
  }

  function erroresDelCliente(): Record<string, string> {
    const nuevos: Record<string, string> = {};
    if (referencia.trim() === "") nuevos.referencia = TEXTOS.referenciaVacia;
    if (zona !== null && fecha !== "") {
      const problema = problemaDeFechaMovimiento(fecha, zona);
      if (problema !== null) nuevos.fecha = problema;
    }
    return nuevos;
  }

  function formulario(listo: string): FormData {
    const fd = new FormData();
    fd.set("claveIdempotencia", clave);
    fd.set("monto", listo);
    fd.set("fecha", fecha);
    fd.set("referencia", referencia.trim());
    const aplicaciones = facturas
      .map((f) => ({ facturaId: f.id, monto: (montos[f.id] ?? "").trim() }))
      .filter((a) => a.monto !== "");
    fd.set("aplicaciones", JSON.stringify(aplicaciones));
    if (comprobante !== null) fd.set("comprobante", comprobante);
    return fd;
  }

  async function enviar() {
    setFallo(null);
    if (montoListo === null) return;
    const delCliente = erroresDelCliente();
    if (Object.keys(delCliente).length > 0) {
      setErrores(delCliente);
      return;
    }
    let r: RegistrarPagoPorFueraResult;
    try {
      r = await registrar(formulario(montoListo));
    } catch (e) {
      console.error("[RegistrarPagoPorFuera] registrar lanzó", e);
      setFallo(TEXTOS.falloRegistrar);
      return;
    }
    switch (r.estado) {
      case "ok":
      case "ya_registrado":
        onCerrar();
        router.refresh();
        return;
      case "validation_error":
        setErrores(r.errores);
        return;
      case "comprobante_no_guardado":
        setFallo(TEXTOS.comprobanteNoGuardado);
        return;
      case "forbidden":
        setFallo(TEXTOS.falloRegistrar);
        return;
    }
  }

  return (
    <Modal
      open
      onOpenChange={(abierto) => {
        if (!abierto) onCerrar();
      }}
      title={TEXTOS.titulo}
      size="xl"
      confirmLabel={TEXTOS.registrar}
      hideConfirm={sinFacturas}
      confirmDisabled={resumen === null || !resumen.valido}
      closeOnConfirm={false}
      onConfirm={enviar}
    >
      {sinFacturas ? (
        <p className="text-sm">{TEXTOS.sinFacturas}</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="pago-por-fuera-monto" label={TEXTOS.monto} error={errores.monto ?? errorMonto ?? undefined} required>
              {(control) => (
                <Input
                  {...control}
                  inputMode="decimal"
                  placeholder="0.00"
                  value={monto}
                  onChange={(e) => cambiarMonto(e.target.value)}
                />
              )}
            </FormField>

            <FormField
              id="pago-por-fuera-fecha"
              label={TEXTOS.fecha}
              error={errores.fecha}
              hint={TEXTOS.fechaAyuda}
            >
              {(control) => (
                <Input
                  {...control}
                  type="date"
                  value={fecha}
                  min={ventana?.min}
                  max={ventana?.max}
                  onChange={(e) => {
                    setFecha(e.target.value);
                    quitarErrores("fecha");
                  }}
                />
              )}
            </FormField>
          </div>

          <FormField id="pago-por-fuera-referencia" label={TEXTOS.referencia} error={errores.referencia} required>
            {(control) => (
              <Input
                {...control}
                value={referencia}
                placeholder={DESCRIPCION_EGRESO_PLACEHOLDER.pago_plataforma}
                onChange={(e) => {
                  setReferencia(e.target.value);
                  quitarErrores("referencia");
                }}
              />
            )}
          </FormField>

          <ComprobanteCampo
            id="pago-por-fuera-comprobante"
            archivo={comprobante}
            onCambiar={(archivo) => {
              setComprobante(archivo);
              setFallo(null);
            }}
            error={errores.comprobante}
            onError={(mensaje) =>
              setErrores((e) => {
                const resto = { ...e };
                if (mensaje === undefined) delete resto.comprobante;
                else resto.comprobante = mensaje;
                return resto;
              })
            }
          />

          {montoListo === null || resumen === null ? null : (
            <RepartoEntreFacturas
              monto={montoListo}
              facturas={facturas}
              montos={montos}
              onCambio={cambiarAplicado}
              errores={{ ...resumen.errores, ...errores }}
            />
          )}

          {fallo === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {fallo}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
