"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Landmark, TriangleAlert } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  CajaResumenDTO,
  ModoComposicionCaja,
  WalletBalanceSigno,
} from "@/lib/types/wallet";
import type { DeudaPlataformaDTO } from "@/lib/interfaces/services/IDeudaPlataformaService";
import { cn } from "@/lib/utils";

import { BarraComposicionCaja } from "./BarraComposicionCaja";
import {
  CAJA_COMPOSICION_LABEL,
  CAJA_COMPOSICION_MENSAJE,
  CAJA_POR_COBRAR_SATELITES_LABEL,
  CAJA_POR_COBRAR_SATELITES_PISTA,
  CAJA_RESUMEN_AVISO_PERIODO,
  CAJA_RESUMEN_AVISO_TERCEROS,
  CAJA_RESUMEN_LABEL,
  CAJA_RESUMEN_NOTA_DIFERENCIA,
  CAJA_RESUMEN_TIENDAS_DEBEN,
  CAJA_TIENDAS_HREF,
  REGIONES_BOLSILLO_EMPRESA,
  avisoCifraNegativa,
  money,
  pistaCifraPrincipal,
  rotuloCifraPrincipal,
  textoDeRegion,
} from "./wallet-labels";

// Feature 173 (T G.1, design §8) — la tarjeta de la caja. Sustituye a la tarjeta de una sola
// cifra de la 42, y el renombrado del archivo es parte del encargo: mientras el archivo llevara
// esa palabra en el nombre, alguien volveria a ponerla en pantalla. Aqui no aparece: ni en un
// rotulo, ni en un `aria-label`, ni en un comentario.
//
// Lo que cambia respecto de la 42 no es como se pinta un numero: son DOS numeros donde habia uno,
// y se ven A LA VEZ (R58). Nada de pestanas ni de desplegables — el punto entero de la feature es
// que nadie confunda el dinero que pasa por la caja con lo que la empresa gana.
//
// Money-safe (R64 de la 173 / R12 de la 231 / R28 de la 459): los importes llegan ya derivados y
// serializados por el SERVIDOR y se pintan TAL CUAL con `money`. Aqui no se suma, no se resta y no
// se convierte a numero; los signos, el valor absoluto de «De las tiendas», el estado de la caja y
// el hecho de los filtros tambien los da el servidor.
//
// ── Feature 231 (T4.3, design §4.1) — LA CAJA PARTIDA EN DOS BOLSILLOS ──
//
// UNA tarjeta con tres bloques seguidos: la cifra grande (con «Entro», «Salio» y el conteo como
// datos SECUNDARIOS), la barra de composicion y los DOS bolsillos, hermanos.
//
// Tres detalles del arbol que NO son esteticos y que sostienen las aserciones vivas de la 173:
//
//  - las regiones son DISJUNTAS: la de la cifra principal no envuelve a la de «Ganancia de
//    la empresa», asi que ningun importe puede leerse bajo el rotulo del vecino;
//  - cada region tiene un PADRE ACOTADO que contiene su propio desglose y no el del otro;
//  - CERO elementos interactivos (R8): ni un `<button>`, ni `details/summary`, ni tooltip. La
//    barra es `role="img"`, no un `Progress` de Radix.
//
// ── Ficha 459 (T A.8, design §3.1) — LA TARJETA DICE LO QUE LA APP SABE ──
//
//  - La cifra principal se llama segun el ESTADO que decide el servidor (R14): «Flujo de dinero
//    registrado» sin saldo inicial (R15), «Dinero en caja» con uno vigente (R18) y «Movimiento
//    neto del periodo» con filtros (R20). En «flujo», «Dinero en caja» no aparece en ningun texto
//    ni nombre accesible de la tarjeta (R16).
//  - Si la cifra es negativa y no hay filtros, una linea lo explica (R17/R19).
//  - La barra y sus mensajes solo se pintan en «saldo» (R22): repartir «el dinero en caja» entre
//    dos bolsillos no tiene sentido cuando la app no sabe cuanto dinero hay.
//  - «De las tiendas» ES lo que la empresa les debe (R23); si es negativo se dice en palabras quien
//    le debe a quien y cuanto, con el ABSOLUTO que manda el servidor.
//  - El bolsillo de la empresa gana una region propia, «Saldo inicial y aportes» (R25). La ganancia
//    no cambia ni de rotulo ni de valor.
//  - La tarjeta NUNCA propone ni calcula un saldo inicial (R27): no hay control para eso aqui.
//
// ── SL-39 (T5, design §7.1) — EL IVA COBRADO, APARTE DE LA GANANCIA ──
//
//  - La ganancia ya llega sin IVA (R1). El IVA cobrado es una region propia del bolsillo de la
//    empresa, hermana de la ganancia y de «Saldo inicial y aportes» (R6).
//  - Las regiones secundarias se pintan recorriendo `REGIONES_BOLSILLO_EMPRESA` (R9): una region
//    nueva es una entrada en esa lista, no un bloque copiado aqui. Importe y signo, del servidor (R20).
//
// ── SL-40 (T7, design §9.2) — LO QUE LA EMPRESA DEBE A LA PLATAFORMA ──
//
//  - Es la ultima region de la lista. Llega aparte del resumen y no cambia ninguna cifra de la caja
//    (D10): no es dinero que haya salido.
//  - Va sin insignia y sin color de signo, y no se pinta si la pagina no la tiene.
//
// ── SL-45 (T8, design §7.2) — LA DEUDA DICE QUE HACER ──
//
//  - El rotulo y la pista los elige el `estado` del servidor («debe», «al dia», «a favor»), y el importe
//    es el `importe` en positivo (R1–R3, R14). Aqui no se compara nada.
//  - La region de la deuda puede llevar UNA accion, el boton «Registrar pago a la plataforma», que le
//    pasa el modulo (`accionDeudaPlataforma`) solo en «debe». Es la unica excepcion a «cero elementos
//    interactivos»: sin la prop, la tarjeta sigue sin ningun control.
//
// ── SLT-73 (D12–D14, design §2.9.8) — EL BOLSILLO «POR COBRAR A SATÉLITES» ──
//
//  - Lo que una satelite entrego de menos al conciliar y aun debe es un TERCER bloque, hermano de
//    los otros dos y FUERA del de la empresa: Carlos dijo que no es de la empresa (D12, R28).
//  - Se pinta SIEMPRE, tambien con importe cero y en los dos estados (D14).
//  - El importe es el STRING del servidor tal cual y la pista la elige su signo: aqui no se compara
//    ningun importe.

/**
 * Feature 200 (tanda 2) — las insignias de signo usan las variantes SEMANTICAS de la
 * primitiva. «Positivo» venia con `default`, que es el naranja de marca, y DESIGN.md lo
 * reserva para accion primaria y seleccion.
 */
const SIGNO_BADGE: Record<
  WalletBalanceSigno,
  { variant: "success" | "danger" | "secondary"; label: string }
> = {
  positivo: { variant: "success", label: "Positivo" },
  negativo: { variant: "danger", label: "Negativo" },
  cero: { variant: "secondary", label: "En cero" },
};

/** Color de una cifra segun su signo (verde/rojo/neutro), en el tono `-strong` de texto. */
const SIGNO_COLOR: Record<WalletBalanceSigno, string> = {
  positivo: "text-success-strong",
  negativo: "text-danger-strong",
  cero: "text-muted-foreground",
};

/** Superficie de cada bolsillo. Base comun; el color lo decide el caso. */
const BOLSILLO = "flex flex-col gap-2 rounded-xl border p-4";

/**
 * R5/R16 de la 231 — de que color va el bloque de LA EMPRESA en cada modo. `Record` TOTAL sobre los
 * cuatro: un modo nuevo rompe el build en vez de heredar en silencio el color de otro caso.
 *
 * Neutro salvo en el caso limite (`solo_tiendas`), que SI es un estado que avisar. Ficha 459: el
 * modo pertenece a la barra, asi que en estado «flujo» —sin barra— el bloque va siempre neutro.
 */
const SUPERFICIE_NEUTRA = "border-border bg-muted/40";

const TONO_INFORMATIVO = "text-muted-foreground";
const TONO_PELIGRO = "font-medium text-danger-strong";

type SuperficieEmpresa = { superficie: "neutra" | "peligro"; clase: string; tonoMensaje: string };

const EMPRESA_NEUTRO: SuperficieEmpresa = {
  superficie: "neutra",
  clase: SUPERFICIE_NEUTRA,
  tonoMensaje: TONO_INFORMATIVO,
};

const BOLSILLO_EMPRESA: Record<ModoComposicionCaja, SuperficieEmpresa> = {
  dos_bolsillos: EMPRESA_NEUTRO,
  solo_empresa: EMPRESA_NEUTRO,
  sin_reparto: EMPRESA_NEUTRO,
  // SLT-73 (design §2.9.8): con lo que debe una satelite la empresa no esta en peligro; ese dinero
  // tiene su propio bloque y su propio tramo.
  tres_tramos: EMPRESA_NEUTRO,
  solo_tiendas: {
    superficie: "peligro",
    clase: "border-danger/30 bg-danger-soft dark:bg-danger/15",
    tonoMensaje: TONO_PELIGRO,
  },
};

/** Tipografia de la cifra grande de la caja. */
const CIFRA_GRANDE = "text-3xl font-semibold tracking-tight tabular-nums";

/** Tipografia de la cifra de cada bolsillo: mismo peso para las dos, ninguna manda. */
const CIFRA_BOLSILLO = "text-2xl font-semibold tracking-tight tabular-nums";

/**
 * Un dato SECUNDARIO de la cifra grande (R6): rotulo pequeno, valor en rejilla y —si la tiene—
 * su pista.
 */
function DatoSecundario({
  rotulo,
  valor,
  pista,
  className,
}: {
  rotulo: string;
  valor: ReactNode;
  pista?: string;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-muted-foreground">{rotulo}</span>
      <span className={cn("text-lg font-medium tabular-nums", className)}>{valor}</span>
      {pista ? <span className="text-xs text-muted-foreground">{pista}</span> : null}
    </div>
  );
}

export interface CajaResumenCardProps {
  /** Las cifras (y el reparto y el estado) ya derivadas en el servidor, montos STRING. */
  resumen: CajaResumenDTO;
  /**
   * Feature 200: cuantos registros tiene el conjunto que se esta mirando. Es el `total` del
   * servidor, no el largo de la pagina pintada. Opcional: sin el, la fila queda de dos datos.
   */
  movimientos?: number;
  /**
   * SL-40 (R21, R23): lo que la empresa debe a la plataforma, de toda su historia y aparte del
   * resumen. Opcional porque los tests de la caja de fichas anteriores montan la tarjeta sin ella;
   * sin ella, o con `null`, la región no se pinta.
   */
  deudaPlataforma?: DeudaPlataformaDTO | null;
  /**
   * SL-45 (R1, R4): la acción que se pinta DENTRO de la región de la deuda (el botón que abre el
   * registro del pago). La decide el módulo con el `estado` del servidor; sin ella no hay acción.
   */
  accionDeudaPlataforma?: ReactNode;
}

export function CajaResumenCard({
  resumen,
  movimientos,
  deudaPlataforma = null,
  accionDeudaPlataforma,
}: CajaResumenCardProps) {
  // R14/R15/R18/R20 (y `[P7]` de la 173): los HECHOS los da el servidor; la MISMA funcion que
  // usan los KPIs de la analitica elige el nombre que no miente.
  const rotuloPrincipal = rotuloCifraPrincipal(resumen);
  const pistaPrincipal = pistaCifraPrincipal(resumen);
  const avisoNegativo = avisoCifraNegativa(resumen);
  // R22: la barra y sus mensajes existen SOLO con un saldo inicial vigente.
  const conBarra = resumen.estado === "saldo";

  const badgePrincipal = SIGNO_BADGE[resumen.signoEnCaja];
  const badgeGanancia = SIGNO_BADGE[resumen.signoGanancia];
  const badgeSatelites = SIGNO_BADGE[resumen.signoPorCobrarSatelites];
  const empresa = conBarra ? BOLSILLO_EMPRESA[resumen.modoComposicion] : EMPRESA_NEUTRO;
  // R16/R17/R18 de la 231: lo que hay que decir cuando la barra no se puede partir. Solo con barra.
  const mensajeModo = conBarra ? CAJA_COMPOSICION_MENSAJE[resumen.modoComposicion] : null;

  return (
    <Card>
      <CardContent className="flex flex-col gap-5">
        {/* 1 — la cifra grande y, HERMANOS suyos, sus datos secundarios (R6). */}
        <div className="flex flex-col gap-3">
          <section aria-label={rotuloPrincipal} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-md bg-muted p-2 text-muted-foreground">
                <Landmark className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-muted-foreground">{rotuloPrincipal}</span>
              <Badge variant={badgePrincipal.variant}>{badgePrincipal.label}</Badge>
            </div>
            <span className={cn(CIFRA_GRANDE, SIGNO_COLOR[resumen.signoEnCaja])}>
              {money(resumen.enCaja)}
            </span>
            {pistaPrincipal === null ? null : (
              <span className="text-xs text-muted-foreground">{pistaPrincipal}</span>
            )}
            {/* R17/R19: por que sale negativa. En «saldo» es una alarma (no puede serlo); en
                «flujo» es una explicacion. */}
            {avisoNegativo === null ? null : (
              <p
                role="note"
                data-aviso="negativo"
                className={cn(
                  "text-xs",
                  resumen.estado === "saldo" ? TONO_PELIGRO : TONO_INFORMATIVO,
                )}
              >
                {avisoNegativo}
              </p>
            )}
          </section>

          <div className="grid grid-cols-2 gap-4 border-t pt-3 sm:grid-cols-3">
            <DatoSecundario
              rotulo={CAJA_RESUMEN_LABEL.entradas}
              valor={money(resumen.entradas)}
              className="text-success-strong"
            />
            <DatoSecundario
              rotulo={CAJA_RESUMEN_LABEL.salidas}
              valor={money(resumen.salidas)}
              className="text-danger-strong"
            />
            {/* El conteo NO es dinero: color neutro, sin insignia de signo y sin desglose. */}
            {movimientos === undefined ? null : (
              <DatoSecundario
                rotulo={CAJA_RESUMEN_LABEL.movimientos}
                valor={movimientos}
                pista={CAJA_RESUMEN_LABEL.movimientosPista}
                className="text-foreground"
              />
            )}
          </div>
        </div>

        {/* 2 — la barra (R2 de la 231), SOLO en estado «saldo» (R22 de la 459). */}
        {conBarra ? <BarraComposicionCaja resumen={resumen} /> : null}

        {/* 3 — los bolsillos, hermanos y a la vez (R3). SLT-73: el de las satelites es el tercero. */}
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          <section
            aria-label={CAJA_RESUMEN_LABEL.deTerceros}
            data-bolsillo="tiendas"
            className={cn(BOLSILLO, "border-warning/30 bg-warning-soft dark:bg-warning/15")}
          >
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center justify-center rounded-md bg-warning/15 p-2 text-warning-strong">
                <TriangleAlert className="size-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-medium text-warning-strong">
                {CAJA_COMPOSICION_LABEL.tiendas}
              </span>
            </div>
            {/* Feature 208/210 — LA CIFRA va en `text-foreground`, no en el color de aviso. */}
            <span className={cn(CIFRA_BOLSILLO, "text-foreground")}>
              {money(resumen.deTerceros)}
            </span>
            <span className="text-sm font-medium text-warning-strong">
              {CAJA_RESUMEN_LABEL.deTerceros}
            </span>
            {/* R23: negativo = las tiendas le deben a la empresa, y cuanto. El ABSOLUTO lo manda
                el servidor: el navegador no le quita el signo a nada (R28). */}
            {resumen.signoDeTerceros === "negativo" ? (
              <p data-frase="tiendas-deben" className="text-sm font-medium text-foreground">
                {CAJA_RESUMEN_TIENDAS_DEBEN(money(resumen.deTercerosAbsoluto))}
              </p>
            ) : null}
            <p role="note" className="text-xs text-muted-foreground">
              {CAJA_RESUMEN_AVISO_TERCEROS}
            </p>
            <Link
              href={CAJA_TIENDAS_HREF}
              className="w-fit rounded-sm text-xs font-medium text-warning-strong underline underline-offset-2 transition-colors duration-200 hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
            >
              {CAJA_RESUMEN_LABEL.deTercerosEnlace}
            </Link>
          </section>

          {/* El bolsillo de la empresa: la ganancia y, HERMANAS suyas dentro del mismo padre
              acotado, las regiones secundarias (R25 de la 459, R6/R9 de SL-39). */}
          <div
            data-bolsillo="empresa"
            data-superficie={empresa.superficie}
            className={cn(BOLSILLO, empresa.clase)}
          >
            <section aria-label={CAJA_RESUMEN_LABEL.ganancia} className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-muted-foreground">
                  {CAJA_COMPOSICION_LABEL.empresa}
                </span>
                <Badge variant={badgeGanancia.variant}>{badgeGanancia.label}</Badge>
              </div>
              <span className={cn(CIFRA_BOLSILLO, SIGNO_COLOR[resumen.signoGanancia])}>
                {money(resumen.ganancia)}
              </span>
              <span className="text-sm font-medium text-foreground">
                {CAJA_RESUMEN_LABEL.ganancia}
              </span>
              <span className="text-xs text-muted-foreground">
                {CAJA_RESUMEN_LABEL.gananciaPista}
              </span>
            </section>

            <div className="grid grid-cols-2 gap-4 border-t pt-3">
              <DatoSecundario
                rotulo={CAJA_RESUMEN_LABEL.ingresosPropios}
                valor={money(resumen.ingresosPropios)}
                className="text-success-strong"
              />
              <DatoSecundario
                rotulo={CAJA_RESUMEN_LABEL.egresosPropios}
                valor={money(resumen.egresosPropios)}
                className="text-danger-strong"
              />
            </div>

            {/* R25 (ficha 459), SL-39 (R6/R9) y SL-40 (R21): las regiones secundarias —«IVA
                cobrado», «Saldo inicial y aportes» y la deuda con la plataforma, en ese orden—, cada
                una con su importe, su pista y, si tiene signo, su insignia. */}
            {REGIONES_BOLSILLO_EMPRESA.map((region) => {
              const datos = { resumen, deudaPlataforma };
              const valor = region.valor(datos);
              // SL-40: sin dato (la deuda con `null`) no hay región que pintar.
              if (valor === null) return null;
              const signo = region.signo(datos);
              const badge = signo === null ? null : SIGNO_BADGE[signo];
              const rotulo = textoDeRegion(region.rotulo, datos);
              const accion = region.id === "deuda_plataforma" ? accionDeudaPlataforma : undefined;
              return (
                <section
                  key={region.id}
                  aria-label={rotulo}
                  data-region={region.id}
                  className="flex flex-col gap-1 border-t pt-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-foreground">{rotulo}</span>
                    {badge === null ? null : <Badge variant={badge.variant}>{badge.label}</Badge>}
                  </div>
                  <span
                    className={cn(
                      "text-lg font-medium tabular-nums",
                      signo === null ? "text-foreground" : SIGNO_COLOR[signo],
                    )}
                  >
                    {money(valor)}
                  </span>
                  <span className="text-xs text-muted-foreground">{textoDeRegion(region.pista, datos)}</span>
                  {accion === undefined || accion === null ? null : <div className="pt-1">{accion}</div>}
                </section>
              );
            })}

            {mensajeModo === null ? null : (
              <p role="note" className={cn("text-xs", empresa.tonoMensaje)}>
                {mensajeModo}
              </p>
            )}
          </div>

          {/* SLT-73 (R28, D14): el bolsillo de lo que deben las satelites, siempre y fuera del de
              la empresa. */}
          <section
            aria-label={CAJA_POR_COBRAR_SATELITES_LABEL.rotulo}
            data-bolsillo="satelites"
            className={cn(BOLSILLO, SUPERFICIE_NEUTRA)}
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="size-2 shrink-0 rounded-full bg-danger" aria-hidden="true" />
              <span className="text-sm font-medium text-muted-foreground">
                {CAJA_POR_COBRAR_SATELITES_LABEL.rotulo}
              </span>
              <Badge variant={badgeSatelites.variant}>{badgeSatelites.label}</Badge>
            </div>
            <span className={cn(CIFRA_BOLSILLO, "text-foreground")}>
              {money(resumen.porCobrarSatelites)}
            </span>
            <p role="note" className="text-xs text-muted-foreground">
              {CAJA_POR_COBRAR_SATELITES_PISTA[resumen.signoPorCobrarSatelites]}
            </p>
          </section>
        </div>

        {/* R60 de la 173: en que se diferencian, junto a las cifras y no en otra pantalla. Se
            compone con el rotulo VIGENTE de la cifra principal (R16). */}
        <div className="flex flex-col gap-2">
          <p role="note" className="text-xs text-muted-foreground">
            {CAJA_RESUMEN_NOTA_DIFERENCIA(rotuloPrincipal)}
          </p>

          {/* `[P7]`: solo cuando hay un periodo elegido. */}
          {resumen.periodoFiltrado ? (
            <p role="note" className="text-xs text-muted-foreground">
              {CAJA_RESUMEN_AVISO_PERIODO}
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
