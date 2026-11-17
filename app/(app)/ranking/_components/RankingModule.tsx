"use client";

import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { filasLocales } from "@/components/shared/descarga-resultado";
import { COLUMNA_FIJA, DESCARGA_MOVIL, TEXTO_ENTERO } from "@/components/shared/texto-entero";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useIsMobile } from "@/hooks/use-mobile";
import type { PremioRankingDTO, RankingRowDTO } from "@/lib/types/ranking";
import { cn } from "@/lib/utils";
import {
  coincideBusquedaMensajero,
  normalizarBusquedaMensajero,
} from "@/lib/utils/cuentas-por-pagar-listado";

import { PremioInputRow } from "./PremioInputRow";
import { CHIP_TU } from "./RankingPodio";
import {
  COLUMNAS_DESCARGA_RANKING,
  filaDescargaRanking,
} from "./ranking-descarga-columnas";
import {
  BUSQUEDA_RANKING,
  PODIO_LABELS,
  PREMIOS_LABELS,
  RANKING_COLUMNAS,
  RANKING_LABELS,
  SIN_DATO,
  conteoCrudo,
  conteoTarjeta,
  porcentaje,
} from "./ranking-labels";

// Columnas de la tabla del ranking (R13/R6): posición, nombre, % del día y conteo crudo
// (entregadas/asignadas). El ORDEN de las filas ya viene resuelto del servidor (R4/R5); la
// tabla solo presenta. Vive fuera del componente porque no depende de props ni de estado.
const RANKING_COLUMNS: Column<RankingRowDTO>[] = [
  {
    id: "posicion",
    value: RANKING_COLUMNAS.posicion,
    render: (fila) => (
      <span className="font-medium">{fila.posicion ?? SIN_DATO}</span>
    ),
  },
  { id: "nombre", value: RANKING_COLUMNAS.mensajero, render: (fila) => fila.nombre },
  {
    id: "porcentaje",
    value: RANKING_COLUMNAS.porcentaje,
    render: (fila) => porcentaje(fila.pct),
  },
  {
    id: "conteo",
    value: RANKING_COLUMNAS.conteo,
    render: (fila) => (
      <span className="tabular-nums">
        {conteoCrudo(fila.entregadasHoy, fila.asignadasHoy)}
      </span>
    ),
  },
];

/**
 * SLT-162 (R750) — la tarjeta de «Ranking del día» en el teléfono: arriba «{posición} · {nombre}» y,
 * si es la fila del que mira, el chip «Tú»; abajo, «Entregados / asignados» con su conteo y, en
 * columna fija, «% del día» con el porcentaje. Los rótulos son los de las columnas de escritorio.
 */
function TarjetaRanking({ fila, esPropia }: Readonly<{ fila: RankingRowDTO; esPropia: boolean }>) {
  return (
    <div data-tarjeta-ranking="" className="flex min-w-0 flex-col gap-3 py-1">
      <div className="flex items-start justify-between gap-2">
        <span data-columna="nombre" className={cn("text-[15px] font-bold", TEXTO_ENTERO)}>
          {`${fila.posicion ?? SIN_DATO} · ${fila.nombre}`}
        </span>
        {esPropia ? <span className={CHIP_TU}>{PODIO_LABELS.vos}</span> : null}
      </div>
      <div className="flex items-end justify-between gap-3">
        <span data-columna="conteo" className={cn("text-muted-foreground", TEXTO_ENTERO)}>
          <span className="block">{RANKING_COLUMNAS.conteo}</span>
          <span className={cn("block font-medium text-foreground", COLUMNA_FIJA)}>
            {conteoTarjeta(fila.entregadasHoy, fila.asignadasHoy)}
          </span>
        </span>
        <span data-columna="porcentaje" className="flex shrink-0 flex-col items-end">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {RANKING_COLUMNAS.porcentaje}
          </span>
          <span className={cn("text-right text-xl font-bold", COLUMNA_FIJA)}>
            {porcentaje(fila.pct)}
          </span>
        </span>
      </div>
    </div>
  );
}

/**
 * SLT-162 (R750) — en el teléfono, UNA columna con la tarjeta entera sobre la MISMA `DataTable`
 * (patrón de SLT-165 «PWA del mensajero: Cierre del día en tarjetas»), con la cabecera solo para
 * lector: la tarjeta lleva sus propios rótulos.
 */
function columnasRankingMovil(mensajeroPropioId: string | null): Column<RankingRowDTO>[] {
  return [
    {
      id: "tarjeta",
      value: RANKING_COLUMNAS.mensajero,
      renderHeader: () => <span className="sr-only">{RANKING_COLUMNAS.mensajero}</span>,
      render: (fila) => (
        <TarjetaRanking
          fila={fila}
          esPropia={mensajeroPropioId !== null && fila.mensajeroId === mensajeroPropioId}
        />
      ),
    },
  ];
}

// Feature 76 (T9) — módulo cliente del ranking DIARIO. Recibe los datos YA serializados
// (STRING) + `esEditable` por props desde el Server Component `page.tsx` (que validó rol y
// pre-fetch; patrón /wallet). El cliente NUNCA recibe Prisma.Decimal ni recalcula montos/
// porcentajes. Dos secciones:
//  1. Tabla del ranking (R13/R6): posición, nombre, % del día, conteo crudo entregadas/
//     asignadas. El ORDEN ya viene resuelto del servidor (R4/R5) — se respeta tal cual.
//  2. Tabla de premios del podio (R8/R14/R15): una fila por posición 1-3, asociando el
//     premio al mensajero elegible de esa posición (o "sin ocupante" si no hay, R15).
//     Editable solo si `esEditable` (maestro, R16); el mensajero ve solo-lectura (R17).

/**
 * Feature 170 (T F.1) — nombre visible del listado: encabezado de la tarjeta, nombre de la
 * hoja, base del nombre de archivo (R12) y nombre accesible del control (R13). Un solo
 * literal para los cuatro usos, para que no puedan decir cosas distintas.
 */
const TITULO_DESCARGA = "Ranking del día";

export interface RankingModuleProps {
  ranking: RankingRowDTO[];
  premios: PremioRankingDTO[];
  esEditable: boolean;
  /**
   * SLT-162 (R750): `usuarioId` del mensajero que mira (el mismo que la página ya da al podio), para
   * el chip «Tú» de su tarjeta; `null` para maestro/admin.
   */
  mensajeroPropioId?: string | null;
}

export function RankingModule({
  ranking,
  premios,
  esEditable,
  mensajeroPropioId = null,
}: RankingModuleProps) {
  const esMovil = useIsMobile();

  // SLT-162 (R769, DC23): búsqueda por nombre SOBRE LO QUE YA LLEGÓ por props, sin pedir nada al
  // servidor. Solo filtra «Ranking del día» (y su descarga, R762): el podio y `ocupanteDe` de los
  // premios siguen leyendo `ranking` entero. El orden es el del servidor (`filter` no reordena).
  const [termino, setTermino] = useState("");
  const rankingVisible = useMemo(() => {
    const busqueda = normalizarBusquedaMensajero(termino);
    return busqueda === ""
      ? ranking
      : ranking.filter((fila) => coincideBusquedaMensajero(fila.nombre, busqueda));
  }, [ranking, termino]);
  const sinCoincidencias = ranking.length > 0 && rankingVisible.length === 0;

  // Premios ordenados por posición ascendente (1, 2, 3) para presentación estable.
  const premiosOrdenados = [...premios].sort((a, b) => a.posicion - b.posicion);

  // Ocupante ELEGIBLE de cada posición del podio (R14): la fila del ranking cuyo
  // `posicion` coincide. Si no existe, `null` → NO se inventa ocupante (R15).
  function ocupanteDe(posicion: number): string | null {
    const fila = ranking.find((r) => r.posicion === posicion);
    return fila ? fila.nombre : null;
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader className="border-b">
          <CardTitle>{TITULO_DESCARGA}</CardTitle>
          <CardDescription>
            Ordenado por porcentaje de entregas exitosas del día. El conteo crudo
            (entregados / asignados) hace el porcentaje auditable.
          </CardDescription>
        </CardHeader>
        {/* SLT-162 (R766): «Descargar» a todo el ancho y 44 px en el teléfono, encima de la lista. */}
        <CardContent className={DESCARGA_MOVIL}>
          <DataTable
            columns={esMovil ? columnasRankingMovil(mensajeroPropioId) : RANKING_COLUMNS}
            data={rankingVisible}
            rowKey="mensajeroId"
            ariaLabel={RANKING_LABELS.tablaAria}
            // R769: «ningún mensajero coincide» no es «todavía no hay mensajeros» (R763).
            emptyState={{
              icon: Trophy,
              title: sinCoincidencias ? BUSQUEDA_RANKING.sinResultados : RANKING_LABELS.vacio,
            }}
            filtros={
              <BuscadorFiltros
                label={BUSQUEDA_RANKING.label}
                placeholder={BUSQUEDA_RANKING.placeholder}
                debounceMs={0}
                leerDeUrl={false}
                tactil
                onChange={setTermino}
              />
            }
            /**
             * Feature 170 (T F.1, R1/R7/R11/R30/R32) — descarga de FAMILIA B: el ranking
             * NO pagina (Anexo IV: paginarlo dejaría al podio sin ocupante en la página 2),
             * así que el array de props ES el dataset completo y el archivo se proyecta de
             * lo que la tabla ya está pintando, sin releer nada del servidor.
             *
             * `filasLocales` aplica el MISMO tope de 5000 que el resto: por encima devuelve
             * un error accionable y NO produce archivo, nunca un xlsx al que le faltan
             * filas en silencio. Aquí el conjunto está acotado por el nº de mensajeros
             * activos, así que el tope es una red, no un límite operativo.
             *
             * Solo esta tabla lo lleva: la de PREMIOS del podio queda fuera de alcance
             * (P1 ratificada) y no monta control alguno.
             *
             * SLT-162 (R762): proyecta lo que la lista MUESTRA; con un término de búsqueda, solo
             * las filas que coinciden. Sin término es el ranking entero, como antes.
             */
            descarga={{
              titulo: TITULO_DESCARGA,
              columnas: COLUMNAS_DESCARGA_RANKING,
              obtenerFilas: () => filasLocales(rankingVisible, filaDescargaRanking),
            }}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <CardTitle>{PREMIOS_LABELS.titulo}</CardTitle>
          <CardDescription>{PREMIOS_LABELS.descripcion}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* SLT-162 (R752, R753): en el teléfono el MISMO `<table>` se maqueta como una lista de
              tarjetas (un solo DOM: los campos y «Guardar» no se duplican). La cabecera queda solo
              para lector y cada tarjeta lleva sus rótulos (`PremioInputRow`). */}
          <div className="w-full max-w-full overflow-x-auto">
            <table
              aria-label={RANKING_LABELS.premiosAria}
              className="w-full border-collapse text-left text-sm max-md:block"
            >
              <thead className="max-md:block">
                <tr className="border-b max-md:sr-only">
                  <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
                    {PREMIOS_LABELS.posicion}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
                    {PREMIOS_LABELS.ocupante}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
                    {PREMIOS_LABELS.monto}
                  </th>
                  <th scope="col" className="px-3 py-2 font-medium text-muted-foreground">
                    {PREMIOS_LABELS.descripcionPremio}
                  </th>
                  {esEditable ? (
                    <th
                      scope="col"
                      className="px-3 py-2 font-medium text-muted-foreground"
                    >
                      {PREMIOS_LABELS.acciones}
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody className="max-md:flex max-md:flex-col max-md:gap-3">
                {premiosOrdenados.map((premio) => (
                  <PremioInputRow
                    key={premio.posicion}
                    premio={premio}
                    ocupanteNombre={ocupanteDe(premio.posicion)}
                    esEditable={esEditable}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
