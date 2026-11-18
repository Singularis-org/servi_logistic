"use client";

import { useState } from "react";

import { descargarBlob } from "@/components/shared/descargar-blob";
import { Button } from "@/components/ui/button";
import { MARCA_FACTURA } from "@/lib/config/marca";
import { nombreArchivoFactura, resumirFactura } from "@/lib/facturas-plataforma/resumen";
import type { DescargaFacturaResult } from "@/lib/types/factura-plataforma";
import { XLSX_MIME } from "@/lib/utils/xlsx-template";

import { FACTURAS_TEXTOS } from "./facturas-vista";

// SLT-136 (design §6; R14, R15, R19, R20) — los dos botones de descarga de una factura cerrada, dentro del panel de
// detalle. El archivo nace en el navegador: se piden los datos con la función que pasa la pantalla (la action del
// maestro o la del superadmin ya ligada a su empresa), se comprueba su cuadre (`resumirFactura`, R15) y se arma el
// PDF o el Excel. jsPDF y exceljs entran con `import()` dinámico: no pesan en la carga de la pantalla.

/** La lectura de la descarga: la action de «Mi plan» o la del detalle de empresa, ya ligada. */
export type DescargarFacturaFn = (input: { facturaId: string }) => Promise<DescargaFacturaResult>;

export interface DescargarFacturaProps {
  readonly facturaId: string;
  readonly descargar: DescargarFacturaFn;
}

type Formato = "pdf" | "xlsx";

const T = FACTURAS_TEXTOS.descarga;
const MIME_PDF = "application/pdf";

/** R14: los bytes del logo configurado, o `null` si no se pudo cargar (el PDF sale con «Singularis» en texto). */
async function cargarLogo(): Promise<Uint8Array | null> {
  try {
    const respuesta = await fetch(MARCA_FACTURA.logo.ruta);
    if (!respuesta.ok) return null;
    return new Uint8Array(await respuesta.arrayBuffer());
  } catch {
    return null;
  }
}

/** Lee, comprueba y entrega el archivo. Lanza si la lectura no es `ok` o si la generación falla (R15, R20). */
async function generar(facturaId: string, descargar: DescargarFacturaFn, formato: Formato): Promise<void> {
  const r = await descargar({ facturaId });
  if (r.estado !== "ok") throw new Error(`la lectura de la descarga respondió ${r.estado}`);
  const { datos } = r;
  const numero = datos.factura.numero;
  if (numero === null) throw new Error("la factura no está cerrada (no tiene número)");
  // R15: un descuadre con la base lanza aquí, antes de construir ningún archivo.
  const resumen = resumirFactura(datos);
  if (formato === "pdf") {
    const logo = await cargarLogo();
    const { construirPdfFactura } = await import("@/lib/facturas-plataforma/pdf");
    const bytes = construirPdfFactura(datos, resumen, logo);
    descargarBlob(bytes, MIME_PDF, nombreArchivoFactura(numero, datos.empresaNombre, "pdf"));
    return;
  }
  const { construirExcelFactura } = await import("@/lib/facturas-plataforma/excel");
  const bytes = await construirExcelFactura(datos);
  descargarBlob(bytes, XLSX_MIME, nombreArchivoFactura(numero, datos.empresaNombre, "xlsx"));
}

export function DescargarFactura({ facturaId, descargar }: DescargarFacturaProps) {
  const [enCurso, setEnCurso] = useState<Formato | null>(null);
  const [fallo, setFallo] = useState(false);

  async function pulsar(formato: Formato) {
    // R20: los dos botones quedan deshabilitados hasta que termine; un segundo clic no lanza otra descarga.
    if (enCurso !== null) return;
    setEnCurso(formato);
    setFallo(false);
    try {
      await generar(facturaId, descargar, formato);
    } catch (error) {
      console.error("[DescargarFactura] la descarga falló", error);
      setFallo(true);
    } finally {
      setEnCurso(null);
    }
  }

  const ocupado = enCurso !== null;
  return (
    <div role="group" aria-label={T.etiqueta} aria-busy={ocupado} className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => void pulsar("pdf")}>
          {T.pdf}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={ocupado} onClick={() => void pulsar("xlsx")}>
          {T.excel}
        </Button>
      </div>
      {fallo && (
        <p role="alert" className="text-sm text-destructive">
          {T.error}
        </p>
      )}
    </div>
  );
}
