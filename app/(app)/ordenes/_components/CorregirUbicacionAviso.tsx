"use client";

import { useId } from "react";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import type { NivelDeFiltroDTO } from "@/lib/types/filtros-ordenes";

import { Button } from "@/components/ui/button";
import { money } from "@/lib/config/moneda";
import type {
  AvisoCambioUbicacion,
  UbicacionConCostos,
} from "@/lib/interfaces/services/ICorregirDatosClienteService";

import type { LugarDelAviso } from "./corregir-ubicacion-arbol";

// =================================================================================================
// FICHA 327 (E1, design §4 y §10.1) — EL AVISO DEL IMPORTE, ANTES DE GUARDAR.
// =================================================================================================
//
// **Que problema cierra.** Corregir el distrito de una orden RECALCULA SU ZONA, y la zona decide la
// tarifa: es la unica correccion de esta familia que MUEVE DINERO. Y lo mueve sin dejar rastro,
// porque la 312/D4 —ratificada por la 327/D3— decidio que corregir un dato no escribe historial ni
// auditoria. Un cambio de importe silencioso y sin rastro es exactamente lo que D5 vino a impedir:
// el servidor rechaza la primera peticion, devuelve las dos ubicaciones con sus importes, y ESTE
// PANEL es donde se leen antes de confirmar.
//
// ⚠️ **NI UN CALCULO EN ESTE ARCHIVO** (R12). El componente PINTA lo que le llega y nada mas. Los
// importes salen de `resolveTarifa` + `costosListadoOrden` en el SERVIDOR, que delega en
// `derivarIngresoOrden(..., "entregada")` — la misma funcion que factura el cierre del dia. Si
// aparece la necesidad de pintar un importe que el servidor no mando, se para: multiplicar en el
// navegador costo 14 de 66 ordenes con un centimo de desviacion en la feature 204.
//
// ⚠️ **SE RAMIFICA POR EL DISCRIMINANTE `tarifa`, JAMAS POR EL IMPORTE** (R13). Cuando el par
// (tienda, zona) no tiene tarifa configurada, `costosListadoOrden` devuelve `"0.00"` — y `"0.00"`
// NO significa «gratis», significa «nadie configuro esa tarifa». Un `if (importe === "0.00")` aqui
// pintaria un precio de cero donde tiene que decir «sin tarifa configurada», y nadie lo notaria
// hasta que alguien se preguntara por que la empresa no factura esa zona.
//
// ⚠️ **NI UN `console`** (R26): este panel recibe la ubicacion y los importes de una orden real.
// Lo vigila `tests/unit/guards/corregir-datos-sin-rastro.guardia.test.ts`, que censa este archivo.
//
// ⚠️ **NINGUN TEXTO PROMETE UN RASTRO** (R35): confirmar el cambio no registra quien lo hizo ni cual
// era la zona anterior. El unico rastro es el `updated_at` de la fila.

// --- Textos visibles (separados de la logica, i18n-ready, como el resto del modulo) --------------

export const AVISO_TITULO = "Confirma el cambio de ubicación";

/**
 * Por que aparece este panel. Dice lo que va a pasar —la zona se recalcula y con ella el importe—
 * sin afirmar que el importe SUBE ni que BAJA: eso lo dicen las dos columnas de abajo, que es donde
 * se puede comprobar.
 */
export const AVISO_EXPLICACION =
  "Al cambiar el lugar, la orden pasa a la zona que le corresponde y con ella cambia lo que se factura. Compara las dos columnas antes de confirmar.";

export const AVISO_TABLA_CAPTION =
  "Comparación entre la ubicación actual de la orden y la propuesta, con sus importes";
export const AVISO_COL_CONCEPTO = "Concepto";
export const AVISO_COL_ACTUAL = "Ahora";
export const AVISO_COL_PROPUESTA = "Con el cambio";

export const AVISO_FILA_ZONA = "Zona";
export const AVISO_FILA_FLETE = "Flete + IVA";
export const AVISO_FILA_COMISION = "Comisión + IVA";

/**
 * SLT-48 (regla 3 de la maqueta) — la orden quedó a medias (su lugar tiene hijos activos) o no tiene
 * lugar: «Sin <nivel que falta>». Solo puede pasar en la columna «Ahora». El nivel sale del país (R47).
 */
export function avisoSinNivel(tipoSingular: string): string {
  return `Sin ${tipoSingular.toLocaleLowerCase("es")}`;
}

/**
 * SLT-48 (regla 3 de la maqueta) — la hoja está más arriba que el último nivel del país: se pinta con
 * su tipo («Barrio: Las Acacias»), porque la fila se rotula con el tipo del último nivel.
 */
export function avisoLugarConTipo(tipoSingular: string, nombre: string): string {
  return `${tipoSingular}: ${nombre}`;
}

/**
 * R13 — LO QUE SE PINTA EN LUGAR DE UN IMPORTE cuando el par (tienda, zona) no tiene tarifa.
 *
 * No bloquea (P1, decision humana del 2026-08-28: se avisa y se deja guardar, como ya hace el
 * resto del sistema con una tarifa ausente desde la feature 274). El riesgo queda dicho en voz
 * alta: la orden puede quedar en una zona por la que no se facturara nada hasta que alguien
 * configure esa tarifa.
 */
export const AVISO_SIN_TARIFA = "Sin tarifa configurada";

/**
 * R14 — la procedencia del flete cuando el distrito esta marcado como especial pero NO tiene monto
 * pactado. El importe es IDENTICO al de una orden corriente, asi que sin esta linea no hay forma de
 * distinguir «cobra la normal porque le toca» de «cobra la normal porque falta configurar el pacto».
 */
export function avisoEspecialSinPacto(columna: string): string {
  return `${columna}: el lugar está marcado como especial pero no tiene monto pactado, así que se cobra la tarifa normal.`;
}

/**
 * R16 — la orden ya tiene al menos un detalle congelado en un cierre. AVISA, NO BLOQUEA: la fila de
 * `cierre_detail` es inmutable (hay una guardia estructural que lo impone), asi que lo ya facturado
 * no cambia; lo que cambia es lo que se facture de la proxima gestion en adelante.
 */
export const AVISO_YA_EN_UN_CIERRE =
  "Esta orden ya entró en un cierre: lo que se facturó allí no cambia. El importe nuevo rige a partir de ahora.";

export const AVISO_CONFIRMAR = "Confirmar el cambio";

export interface CorregirUbicacionAvisoProps {
  /** Las dos ubicaciones con sus importes, tal como las emitió el servidor. */
  aviso: AvisoCambioUbicacion;
  /** `true` mientras la confirmación está en vuelo: bloquea el botón. */
  enviando?: boolean;
  /** Reenvía la corrección con la confirmación explícita del cambio de ubicación. */
  onConfirmar: () => void;
  /**
   * SLT-48 (R43) — los niveles del país (1 a P). La fila del lugar se rotula con el tipo del último.
   * Sin niveles (montaje suelto), se rotula con la etiqueta del nivel 3 y pinta `distritoNombre`.
   */
  niveles?: readonly NivelDeFiltroDTO[];
  /** SLT-48 (R43) — el lugar actual y el propuesto, con su profundidad y si son hoja. */
  lugares?: { actual: LugarDelAviso; propuesta: LugarDelAviso };
}

/**
 * El importe de una ubicación, o el texto de «sin tarifa».
 *
 * ⚠️ LA RAMA ES `u.tarifa`, NO EL VALOR DEL IMPORTE. Ver la cabecera: con `"sin_tarifa"` el importe
 * también llega `"0.00"`, así que decidir por el número pintaría `₡0` donde debe decir que nadie
 * configuró la tarifa.
 */
function importe(u: UbicacionConCostos, campo: "fleteConIva" | "comisionConIva"): string {
  if (u.tarifa === "sin_tarifa") return AVISO_SIN_TARIFA;
  return money(u[campo]);
}

/**
 * SLT-48 (R43, regla 3 de la maqueta) — la celda del lugar:
 * - la hoja en el último nivel: su nombre, como hoy;
 * - la hoja más arriba: con su tipo («Barrio: Las Acacias»);
 * - a medias (el lugar tiene hijos activos) o sin lugar: «Sin <nivel que falta>».
 */
function celdaDeLugar(lugar: LugarDelAviso, niveles: readonly NivelDeFiltroDTO[]): string {
  const ultimo = niveles.at(-1);
  if (ultimo === undefined) return lugar?.nombre ?? "";
  if (lugar === null) return avisoSinNivel(niveles[0]?.singular ?? ultimo.singular);
  if (!lugar.hoja) return avisoSinNivel(niveles[lugar.profundidad]?.singular ?? ultimo.singular);
  if (lugar.profundidad >= niveles.length) return lugar.nombre;
  return avisoLugarConTipo(niveles[lugar.profundidad - 1]?.singular ?? "", lugar.nombre);
}

/**
 * FICHA 327 (R11/R13/R14/R16/R33) — la comparación que el servidor devuelve al rechazar la primera
 * petición, con el botón que la confirma.
 *
 * **Se monta SOLO cuando el servidor respondió `confirmacion_requerida`**, y esa es la garantía
 * entera de R33: no hay pantalla previa que adivine el importe, y no puede haberla — el gate y el
 * aviso son la misma respuesta, del mismo servidor, en la misma petición. Los números que se leen
 * aquí son los de la llamada que se acaba de rechazar, así que no existe la carrera «vi un importe,
 * guardé otro».
 *
 * **El botón de guardar normal no puede saltárselo**: reenvía sin confirmación y el servidor lo
 * rechaza igual (R28). Este botón es el único que confirma.
 */
export function CorregirUbicacionAviso({
  aviso,
  enviando = false,
  onConfirmar,
  niveles = [],
  lugares,
}: Readonly<CorregirUbicacionAvisoProps>) {
  const tituloId = useId();
  // SL-20 (design §7; R19): la fila del lugar se rotula con el nombre del país de la empresa
  // (antes `AVISO_FILA_DISTRITO`, con el de Costa Rica). SLT-48 (R43): con los niveles del país, la
  // rotula el tipo del último nivel («Distrito» en Costa Rica, «Lote» en un país de 10).
  const etiquetas = useEtiquetasGeograficas();
  const conNiveles = niveles.length > 0 && lugares !== undefined;
  const rotuloLugar = conNiveles ? (niveles.at(-1)?.singular ?? "") : etiquetas.distrito.singular;
  const lugar = (columna: "actual" | "propuesta"): string =>
    conNiveles
      ? celdaDeLugar(lugares[columna], niveles)
      : (aviso[columna].distritoNombre ?? avisoSinNivel(etiquetas.distrito.singular));

  return (
    <section
      aria-labelledby={tituloId}
      // El panel aparece DESPUÉS de una respuesta del servidor y sin mover el foco: sin región
      // viva, quien navega con lector de pantalla se quedaría delante de un formulario que
      // aparentemente no hizo nada.
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-3"
    >
      <h3 id={tituloId} className="text-sm font-semibold text-foreground">
        {AVISO_TITULO}
      </h3>
      <p className="text-sm text-muted-foreground">{AVISO_EXPLICACION}</p>

      <table className="w-full border-collapse text-sm">
        <caption className="sr-only">{AVISO_TABLA_CAPTION}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className="py-1 text-left font-medium text-muted-foreground">
              {AVISO_COL_CONCEPTO}
            </th>
            <th scope="col" className="py-1 text-left font-medium text-muted-foreground">
              {AVISO_COL_ACTUAL}
            </th>
            <th scope="col" className="py-1 text-left font-medium text-muted-foreground">
              {AVISO_COL_PROPUESTA}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
              {AVISO_FILA_ZONA}
            </th>
            <td className="py-1">{aviso.actual.zonaNombre}</td>
            <td className="py-1 font-medium">{aviso.propuesta.zonaNombre}</td>
          </tr>
          <tr>
            <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
              {rotuloLugar}
            </th>
            <td className="py-1 break-words">{lugar("actual")}</td>
            <td className="py-1 break-words font-medium">{lugar("propuesta")}</td>
          </tr>
          <tr>
            <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
              {AVISO_FILA_FLETE}
            </th>
            <td className="py-1">{importe(aviso.actual, "fleteConIva")}</td>
            <td className="py-1 font-medium">{importe(aviso.propuesta, "fleteConIva")}</td>
          </tr>
          <tr>
            <th scope="row" className="py-1 text-left font-normal text-muted-foreground">
              {AVISO_FILA_COMISION}
            </th>
            <td className="py-1">{importe(aviso.actual, "comisionConIva")}</td>
            <td className="py-1 font-medium">{importe(aviso.propuesta, "comisionConIva")}</td>
          </tr>
        </tbody>
      </table>

      {/* R14 — una línea por columna afectada, nombrando CUÁL de las dos: el importe es el mismo
          que el de una orden corriente, así que la procedencia es lo único que las distingue. */}
      {aviso.actual.fleteOrigen === "especial_sin_pacto" ? (
        <p className="text-xs text-muted-foreground">
          {avisoEspecialSinPacto(AVISO_COL_ACTUAL)}
        </p>
      ) : null}
      {aviso.propuesta.fleteOrigen === "especial_sin_pacto" ? (
        <p className="text-xs text-muted-foreground">
          {avisoEspecialSinPacto(AVISO_COL_PROPUESTA)}
        </p>
      ) : null}

      {/* R16 — solo si la orden YA entró en un cierre. Un aviso que sale siempre no es un aviso. */}
      {aviso.yaEnUnCierre ? (
        <p role="note" className="text-sm text-foreground">
          {AVISO_YA_EN_UN_CIERRE}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="button" onClick={onConfirmar} disabled={enviando}>
          {AVISO_CONFIRMAR}
        </Button>
      </div>
    </section>
  );
}
