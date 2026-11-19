"use client";

import { useState } from "react";
import Link from "next/link";
import useSWR, { useSWRConfig } from "swr";

import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { Pagination } from "@/components/shared/Pagination";
import { SegmentedToggle } from "@/components/shared/SegmentedToggle";
import { filasDesdeResultado } from "@/components/shared/descarga-resultado";
import { ConciliacionAcciones } from "@/components/shared/conciliacion/ConciliacionAcciones";
import {
  CONCILIACION_ASIENTA_NOTA,
  CONCILIACION_ASIENTA_TITULO,
} from "@/components/shared/conciliacion/conciliacion-labels";
import {
  listarConsolidacionesSateliteAction,
} from "@/lib/actions/conciliacion-satelites";
import {
  CASCADA_CENTRAL_TITULO,
  GANA_BODEGA_SATELITE_LABEL,
  GANA_BODEGA_SATELITE_NOTA,
  GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO,
  PARA_LA_CENTRAL_NOTA,
  PARA_LA_CENTRAL_NOTA_MODELO_NUEVO,
} from "@/app/(app)/cierres-admin/_components/cierre-labels";
import { Cuenta } from "@/components/private/cierres/detalle/Cuenta";
import {
  cuentaConciliacion,
  metodosVisibles,
  type CuentaVista,
} from "@/components/private/cierres/detalle/detalle-cierre-vista";
import {
  DEBE_LLEGAR_A_LA_CENTRAL_LABEL,
  PAGO_A_MENSAJEROS_LABEL,
  RECAUDADO_LABEL,
} from "@/components/private/cierres/detalle/detalle-cierre-labels";
import { cierreBodegaConfig } from "@/lib/config/cierre-bodega";
import { hrefDetalleCierreBodega } from "@/lib/utils/cierre-enlace";
import type { ConsolidacionSateliteDTO } from "@/lib/types/conciliacion-satelites";

import {
  COLUMNAS_DESCARGA_CONSOLIDACIONES_SATELITE,
  filaDescargaConsolidacionSatelite,
} from "./consolidaciones-satelite-descarga-columnas";
import {
  CASCADA_CONSOLIDACION_NOMBRE,
  DESGLOSE_SATELITE,
  DESGLOSE_SATELITE_COLUMNAS,
  DESGLOSE_SATELITE_ERROR,
  DESGLOSE_SATELITE_FILTRO,
  DESGLOSE_SATELITE_NOMBRE,
  DESGLOSE_SATELITE_VACIO,
  ESTADO_CONCILIACION_LABEL,
  ESTADO_CONCILIACION_VARIANT,
  PESTANAS_ESTADO_CUENTA_BODEGA,
  SIN_DATO,
  diaCR,
  estadoConciliacionDe,
  money,
} from "./satelites-labels";
import { descargarDatos } from "@/components/shared/descarga-datos";

// ═════════════════════════════════════════════════════════════════════════════════════════════
// ⭑ FICHA 431 (T21, R22/R24/R25) — LA CONCILIACIÓN DE UNA BODEGA SATÉLITE.
// ═════════════════════════════════════════════════════════════════════════════════════════════
//
// FICHA 458-D (T D.4/T D.8, R31, D14) — hasta la 458-D esto era el DESGLOSE que se desplegaba en la
// fila de `SaldosSatelitesTable`. El desplegable se retira: la bodega tiene su ESTADO DE CUENTA
// (`/wallet/satelites/[zonaId]`), y esta tabla de consolidaciones con sus acciones de conciliación
// (marcar y desmarcar lo recibido) se muda a esa página, DEBAJO del extracto, con el MISMO efecto y
// los MISMOS textos (`ConciliacionAcciones`, `MarcarRecibidoDialog`, sin tocar). Lo único que cambia:
// el «Pendiente de llegar» llega del estado de cuenta (el mismo `saldoDe` que el listado, R22) y,
// tras marcar o desmarcar, se relee también el estado de cuenta de ESTA bodega (R30).
//
// ── MONEY-SAFE (R20): CERO `Number(`, CERO `parseFloat`, CERO restas.
// Los cinco importes de cada fila y el «Pendiente de llegar» de la cabecera llegan como STRING ya
// derivados del SERVIDOR y se pintan TAL CUAL con `money`. En particular `faltaPorRecibir` NO se
// calcula aquí: la identidad `declarado − recibido = falta` es exactamente la clase de resta que
// la ficha 359 encontró rota en 13 pantallas, y por eso este par entra en
// `tests/components/DineroIdentidadesEnPantalla.test.tsx`.
// SLT-73 (D3/R8): lo esperado deja de ser el efectivo y pasa a ser `paraLaCentral`; la cuenta
// completa de cada fila la lee `tests/components/ConciliacionSateliteCascada.test.tsx`.
//
// ── EL AVISO DE LA CABECERA NO ES DECORACIÓN
// Es la mitad que faltaba del control de seguimiento (Q7). Cuando la central marca por menos de lo
// declarado, la diferencia tiene que estar A LA VISTA de las dos partes; si sólo viviera en una
// columna de una tabla, la bodega la descubriría semanas después, cuando alguien se la reclame.

/**
 * Tamaño de página del desglose. Sale de la CONFIG DEL DOMINIO (`cierreBodegaConfig`), que es la
 * misma de la que comen los dos listados de `/cierres-admin`: son el mismo dominio y el mismo
 * borde, y su schema valida el `pageSize` contra ese tope. Un literal aquí sería el número que un
 * día deja de caber en lo que el servidor acepta, y el desglose respondería `validation_error`
 * en vez de filas.
 */
const DESGLOSE_PAGE_SIZE = cierreBodegaConfig.DEFAULT_PAGE_SIZE;

/** Prefijo de la clave SWR. Identifica esta lectura entre todas las de la app. */
const CLAVE_DESGLOSE = "wallet-satelites:conciliacion";

/** Los dos conjuntos que el conmutador ofrece. */
type FiltroDesglose = "sin_conciliar" | "todas";

/** Clave SWR de las consolidaciones de UNA bodega (página y filtro). */
export function claveConciliacionSatelite(
  zonaId: string,
  page: number = 1,
  filtro: FiltroDesglose = "sin_conciliar",
): readonly [string, string, number, string] {
  return [CLAVE_DESGLOSE, zonaId, page, filtro] as const;
}

/** Input del listado PAGINADO. `soloSinConciliar` sólo viaja cuando recorta: el schema es
 *  `.strict()` y un `false` explícito sería un filtro que no filtra. */
function buildInput(zonaId: string, page: number, filtro: FiltroDesglose) {
  return {
    zonaId,
    page,
    pageSize: DESGLOSE_PAGE_SIZE,
    ...(filtro === "sin_conciliar" ? { soloSinConciliar: true } : {}),
  };
}

/** Input del modo COMPLETO (la descarga): el MISMO filtro vigente, SIN paginación. Su schema es
 *  `.strict()`, así que colar `page` devolvería `validation_error` en vez de un archivo. */
function buildInputCompleto(zonaId: string, filtro: FiltroDesglose) {
  return {
    zonaId,
    ...(filtro === "sin_conciliar" ? { soloSinConciliar: true } : {}),
  };
}

interface PaginaDesglose {
  items: ConsolidacionSateliteDTO[];
  total: number;
}

/** Fetcher SWR: pide la página y traduce un status != ok a un throw (SWR lo marca error). */
async function leerDesglose(
  zonaId: string,
  page: number,
  filtro: FiltroDesglose,
): Promise<PaginaDesglose> {
  const res = await listarConsolidacionesSateliteAction(buildInput(zonaId, page, filtro));
  if (res.status !== "ok") throw new Error(res.status);
  return { items: res.items, total: res.total };
}

/** Quién marcó y cuándo, en una línea. Sin marca no hay nada que decir. */
function conciliadoPorTexto(c: ConsolidacionSateliteDTO): string {
  if (c.conciliadoPorNombre === null || c.conciliadoAt === null) return SIN_DATO;
  return `${c.conciliadoPorNombre} · ${diaCR(c.conciliadoAt)}`;
}

/**
 * SLT-114 (R235) — «Lo que va a la central» de UNA consolidación, con las líneas y los rótulos del
 * detalle único (D15, D20): los métodos que no valen cero (PA3), «Recaudado» como subtotal, lo que es de
 * la satélite restando y «Debe llegar a la central» como total. Todos los importes, STRING del servidor;
 * aquí solo se eligen orden, signo y rótulo.
 */
function cuentaCentralConsolidacion(c: ConsolidacionSateliteDTO): CuentaVista {
  const modeloNuevo = c.incluyeModeloNuevo === true;
  return {
    titulo: CASCADA_CENTRAL_TITULO,
    lineas: [
      ...metodosVisibles(c.totales).map((m) => ({
        label: m.label,
        monto: m.monto,
        signo: "neutro" as const,
        tipo: "partida" as const,
      })),
      { label: RECAUDADO_LABEL, monto: c.totales.general, signo: "neutro", tipo: "subtotal" },
      { label: PAGO_A_MENSAJEROS_LABEL, monto: c.pagoMensajero, signo: "resta", tipo: "partida" },
      {
        label: GANA_BODEGA_SATELITE_LABEL,
        monto: c.gananciaSatelite,
        signo: "resta",
        tipo: "partida",
        notas: [modeloNuevo ? GANA_BODEGA_SATELITE_NOTA_MODELO_NUEVO : GANA_BODEGA_SATELITE_NOTA],
      },
      {
        label: DEBE_LLEGAR_A_LA_CENTRAL_LABEL,
        monto: c.paraLaCentral,
        signo: "neutro",
        tipo: "total",
        notas: [modeloNuevo ? PARA_LA_CENTRAL_NOTA_MODELO_NUEVO : PARA_LA_CENTRAL_NOTA],
      },
    ],
  };
}

/**
 * SLT-114 (R235-R237) — la fila desplegada: las dos cuentas en cascada, una al lado de la otra, y el
 * enlace al detalle único del cierre de bodega al pie de «Conciliación». El id solo viaja en el `href`.
 */
function CuentasDeLaConsolidacion({ c }: Readonly<{ c: ConsolidacionSateliteDTO }>) {
  const fecha = diaCR(c.solicitadoAt);
  const central = cuentaCentralConsolidacion(c);
  const conciliacion = cuentaConciliacion(c);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Cuenta
        titulo={central.titulo}
        lineas={central.lineas}
        ariaLabel={CASCADA_CONSOLIDACION_NOMBRE.region(central.titulo, fecha)}
      />
      <Cuenta
        titulo={conciliacion.titulo}
        lineas={conciliacion.lineas}
        ariaLabel={CASCADA_CONSOLIDACION_NOMBRE.region(conciliacion.titulo, fecha)}
        pie={
          <Link
            href={hrefDetalleCierreBodega(c.cierreBodegaId)}
            className="mt-auto text-sm text-primary-strong underline-offset-4 hover:underline"
          >
            {PESTANAS_ESTADO_CUENTA_BODEGA.verCierreBodega}
          </Link>
        }
      />
    </div>
  );
}

/**
 * SLT-114 (R233) — el `total` del listado «Sin conciliar» de la bodega, para el conteo de su pestaña.
 * Misma clave y misma lectura que la página 1 de la conciliación: SWR las comparte, no hay lectura nueva.
 * `null` mientras no llega o si falló (la pestaña dice entonces solo su rótulo).
 */
export function useTotalSinConciliar(zonaId: string): number | null {
  const { data } = useSWR(claveConciliacionSatelite(zonaId, 1, "sin_conciliar"), () =>
    leerDesglose(zonaId, 1, "sin_conciliar"),
  );
  return data?.total ?? null;
}

export interface ConciliacionSateliteProps {
  /** La bodega. El nombre baja por props (lo trae el estado de cuenta); el id solo viaja. */
  bodega: { zonaId: string; zonaNombre: string };
  /**
   * El saldo actual del estado de cuenta de ESTA bodega, STRING del servidor (la misma resta que el
   * listado, R22): es el importe del aviso cuando hay varias incompletas. SLT-114 (PA1): ya no se pinta
   * como tarjeta «Pendiente de llegar»; esa cifra está en «Por entregar hoy».
   */
  pendiente: string;
  /**
   * Si el actor puede marcar y desmarcar. Lo decide el SERVIDOR (`esAccesoTotal`, el mismo
   * predicado con el que el servicio responde `forbidden`) y baja por props. **Default `false`:
   * falla cerrado.**
   */
  puedeConciliar?: boolean;
  /** R30 — tras marcar o desmarcar: relee el estado de cuenta de ESTA bodega. */
  onCambio?: () => Promise<void> | void;
}

export function ConciliacionSatelite({
  bodega,
  pendiente,
  puedeConciliar = false,
  onCambio,
}: Readonly<ConciliacionSateliteProps>) {
  const { zonaId, zonaNombre } = bodega;
  const { mutate } = useSWRConfig();
  const [page, setPage] = useState(1);
  // Arranca en «Sin conciliar» porque es la pregunta que trae a alguien a esta pantalla: qué
  // falta por llegar. Lo ya recibido es historia y está a un clic.
  const [filtro, setFiltro] = useState<FiltroDesglose>("sin_conciliar");

  const { data, error, isLoading } = useSWR(claveConciliacionSatelite(zonaId, page, filtro), () =>
    leerDesglose(zonaId, page, filtro),
  );

  const items = data?.items ?? [];
  const total = data?.total ?? 0;

  /**
   * Las consolidaciones de ESTA página que llegaron incompletas. Se usa SÓLO para decidir si el
   * aviso se enciende y para contarlas — **nunca para sumar dinero**: el importe del aviso es
   * `pendiente`, que el servidor ya cuadró sobre la bodega entera.
   */
  const incompletas = items.filter((c) => estadoConciliacionDe(c) === "incompleto");

  /** Refresco DIRIGIDO tras marcar o desmarcar: esta bodega (su tabla y su estado de cuenta), nada más. */
  async function refrescar() {
    await Promise.all([
      onCambio?.(),
      // Todas las páginas y filtros de ESTE desglose (la fila puede haberse movido de conjunto).
      mutate((clave) => Array.isArray(clave) && clave[0] === CLAVE_DESGLOSE && clave[1] === zonaId),
      // Y el listado de bodegas, cuyo «Pendiente» y cuyas tres tarjetas acaban de cambiar.
      mutate((clave) => Array.isArray(clave) && clave[0] === "wallet-satelites:saldos"),
    ]);
  }

  const COLUMNS: Column<ConsolidacionSateliteDTO>[] = [
    {
      id: "consolidada",
      value: DESGLOSE_SATELITE_COLUMNAS.consolidada,
      render: (c) => diaCR(c.solicitadoAt),
    },
    {
      id: "paraLaCentral",
      // SLT-73 (D3/R8): lo esperado es `paraLaCentral` —todos los métodos menos lo que es de la
      // satélite—, ya no el efectivo. SLT-114 (PA2): con el título corto del canvas.
      value: DESGLOSE_SATELITE_COLUMNAS.debeLlegar,
      render: (c) => <span className="tabular-nums">{money(c.paraLaCentral)}</span>,
    },
    {
      id: "recibido",
      value: DESGLOSE_SATELITE_COLUMNAS.recibido,
      // Sin marcar se pinta «—» y NO «₡0,00»: «nadie lo ha mirado» no es «llegaron cero colones».
      render: (c) =>
        c.montoRecibido === null ? (
          <span className="text-muted-foreground">{SIN_DATO}</span>
        ) : (
          <span
            className={`tabular-nums font-medium ${
              estadoConciliacionDe(c) === "incompleto" ? "text-warning-strong" : ""
            }`}
          >
            {money(c.montoRecibido)}
          </span>
        ),
    },
    {
      id: "faltaPorRecibir",
      value: DESGLOSE_SATELITE_COLUMNAS.falta,
      // R8: la cifra del servidor, tal cual. Aquí no se resta.
      render: (c) => <span className="tabular-nums">{money(c.faltaPorRecibir)}</span>,
    },
    {
      id: "estado",
      value: DESGLOSE_SATELITE_COLUMNAS.estado,
      render: (c) => {
        const estado = estadoConciliacionDe(c);
        return (
          <Badge variant={ESTADO_CONCILIACION_VARIANT[estado]}>
            {ESTADO_CONCILIACION_LABEL[estado]}
          </Badge>
        );
      },
    },
    {
      id: "conciliadoPor",
      value: DESGLOSE_SATELITE_COLUMNAS.conciliadoPor,
      render: (c) => (
        <div className="flex flex-col">
          <span className="text-muted-foreground">{conciliadoPorTexto(c)}</span>
          {/* La NOTA se ve: es lo que distingue una conciliación real de la retroactiva del
              backfill de la migración (R30). No baja a la descarga (texto libre). */}
          {c.nota ? <span className="text-xs text-muted-foreground">{c.nota}</span> : null}
        </div>
      ),
    },
    {
      id: "acciones",
      value: "",
      render: (c) => (
        <ConciliacionAcciones
          cierreBodegaId={c.cierreBodegaId}
          bodega={zonaNombre}
          fecha={diaCR(c.solicitadoAt)}
          declarado={c.paraLaCentral}
          marca={c}
          nota={c.nota}
          puedeConciliar={puedeConciliar}
          onCambio={refrescar}
        />
      ),
    },
  ];

  return (
    <section
      aria-label={DESGLOSE_SATELITE_NOMBRE.region(zonaNombre)}
      className="flex flex-col gap-4 rounded-lg bg-muted/40 p-4"
    >
      {/* SLT-114 (PA1): sin la tarjeta «Pendiente de llegar»; la cifra está en «Por entregar hoy». */}
      {/*
        Q7 — EL AVISO DE LA DIFERENCIA, explicado y no sólo señalado.
        `role="status"` y no `alert`: es información que hay que ver, no una alarma — nadie ha
        hecho nada mal, y teñir de rojo una conciliación parcial legítima la haría parecer un
        error. Tokens semánticos de `DESIGN.md`, cero hex.
      */}
      {incompletas.length > 0 ? (
        <div
          role="status"
          className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning-strong"
        >
          <span className="font-medium">
            {DESGLOSE_SATELITE.diferenciaTitulo(incompletas.length)}
          </span>
          <span className="text-[13px] leading-relaxed">
            {incompletas.length === 1
              ? DESGLOSE_SATELITE.diferenciaDetalle(
                  money(incompletas[0].paraLaCentral),
                  money(incompletas[0].montoRecibido),
                  money(incompletas[0].faltaPorRecibir),
                )
              : DESGLOSE_SATELITE.diferenciaDetalleVarias(money(pendiente))}
          </span>
        </div>
      ) : null}

      {/* El conmutador del desglose: la cola primero, la historia a un clic. */}
      <SegmentedToggle
        options={[
          { valor: "sin_conciliar", etiqueta: DESGLOSE_SATELITE_FILTRO.sinConciliar },
          { valor: "todas", etiqueta: DESGLOSE_SATELITE_FILTRO.todas },
        ]}
        valor={filtro}
        onChange={(v) => {
          setFiltro(v);
          setPage(1); // cambiar de conjunto vuelve a la primera página
        }}
        ariaLabel={DESGLOSE_SATELITE_NOMBRE.filtro(zonaNombre)}
      />

      <div className="overflow-x-auto">
        <DataTable
          columns={COLUMNS}
          data={items}
          rowKey="cierreBodegaId"
          ariaLabel={DESGLOSE_SATELITE_NOMBRE.tabla(zonaNombre)}
          // SLT-114 (R235-R237): dos cuentas en cascada por fila y el enlace al cierre de bodega.
          renderExpanded={(c) => <CuentasDeLaConsolidacion c={c} />}
          expandAriaLabel={(c) => CASCADA_CONSOLIDACION_NOMBRE.expandir(diaCR(c.solicitadoAt))}
          isLoading={isLoading}
          /* El fallo se cuenta DENTRO de esta fila; la tabla de saldos sigue en pie. */
          error={error ? DESGLOSE_SATELITE_ERROR : null}
          emptyMessage={DESGLOSE_SATELITE_VACIO}
          /**
           * R29 — descarga del CONJUNTO FILTRADO de esta bodega, no de la página visible. El
           * título lleva el nombre de la bodega para que el control tenga un nombre accesible
           * ÚNICO: pueden estar varias filas abiertas, y tres botones llamados «Descargar» no
           * identificarían nada. El tope de filas lo evalúa el SERVIDOR y `limite_excedido` viaja
           * sin filas, así que nunca sale un archivo al que le faltan filas sin avisar.
           */
          descarga={{
            titulo: DESGLOSE_SATELITE_NOMBRE.region(zonaNombre),
            columnas: COLUMNAS_DESCARGA_CONSOLIDACIONES_SATELITE,
            obtenerFilas: () =>
              filasDesdeResultado(
                descargarDatos("listarConsolidacionesSateliteCompleto", buildInputCompleto(zonaId, filtro)),
                filaDescargaConsolidacionSatelite,
              ),
          }}
        />
      </div>

      {/* Paginación SERVER-SIDE: el total es el del conjunto filtrado, no el de la página. */}
      <Pagination
        page={page}
        pageSize={DESGLOSE_PAGE_SIZE}
        total={total}
        onPageChange={setPage}
        disabled={isLoading}
        ariaLabel={DESGLOSE_SATELITE_NOMBRE.paginacion(zonaNombre)}
      />

      {/* SLT-73 (R35) — marcar recibido asienta el dinero; después se corrige, no se desmarca. Al pie y visible. */}
      <p role="note" className="text-xs leading-relaxed text-muted-foreground">
        <strong className="font-semibold text-foreground">
          {CONCILIACION_ASIENTA_TITULO}
        </strong>{" "}
        {CONCILIACION_ASIENTA_NOTA}
      </p>
    </section>
  );
}
