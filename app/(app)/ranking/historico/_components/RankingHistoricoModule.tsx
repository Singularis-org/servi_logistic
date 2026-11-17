"use client";

// Feature 196 (T4.4/T5.2, design §6/§7) — módulo cliente del ranking CONGELADO.
//
// Recibe TODO por props desde el Server Component `page.tsx`, que ya resolvió el rol y
// pre-obtuvo el snapshot con la Server Action. Aquí no se fetchea nada: el cliente jamás
// recibe un `Prisma.Decimal` ni recalcula un monto o un porcentaje (R31) — llegan como
// STRING ya redondeado y solo se les antepone el símbolo.
//
// ⛔ **El orden de `filas` NO se toca** (R25). Lo congeló el cron en la columna `puesto` y la
// lectura lo devuelve con `ORDER BY puesto`. Ni un `sort`, ni un `map` que recalcule el
// puesto: el histórico existe precisamente para que el orden de un martes no dependa del
// comparador del viernes.
//
// Los TRES estados de R26 son visiblemente distintos y esa distinción es el producto:
//  - `snapshot` con filas          → la tabla;
//  - `snapshot` con `filas: []`    → «ese día no hubo actividad» (el cron corrió, no hubo qué);
//  - `snapshot === null`           → «no se generó el snapshot de esta fecha» (el cron no corrió).
// Fundir los dos últimos en un «no hay datos» haría indistinguible un día tranquilo de un
// cron caído, que es justo lo que el alternativa F del design descartó a nivel de esquema.

import { useRouter } from "next/navigation";
import { Trophy } from "lucide-react";

import { BuscadorFiltros } from "@/components/shared/BuscadorFiltros";
import { DataTable, type Column } from "@/components/shared/DataTable";
import { filasLocales } from "@/components/shared/descarga-resultado";
import {
  COLUMNA_FIJA,
  DESCARGA_MOVIL,
  DESPLEGABLE_TACTIL,
  TEXTO_ENTERO,
} from "@/components/shared/texto-entero";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useIsMobile } from "@/hooks/use-mobile";
import type { RankingSnapshotData, RankingSnapshotFilaDTO } from "@/lib/types/ranking-snapshot";
import { cn } from "@/lib/utils";

import {
  PREMIOS_LABELS,
  SIN_DATO,
  money,
  ordinal,
  porcentaje,
} from "../../_components/ranking-labels";
import {
  COLUMNAS_DESCARGA_RANKING_HISTORICO,
  filaDescargaRankingHistorico,
} from "./ranking-historico-descarga-columnas";
import {
  RANKING_HISTORICO_COLUMNAS,
  RANKING_HISTORICO_LABELS,
  RANKING_HISTORICO_TARJETA,
  instanteGeneracion,
  tituloRankingHistorico,
} from "./ranking-historico-labels";

/** Ruta de la propia pantalla: el selector de fecha navega a ella con el nuevo `?fecha`. */
const RUTA_HISTORICO = "/ranking/historico";

/** `id` del `<input type="date">`, compartido con su `<Label htmlFor>` (nombre accesible). */
const ID_SELECTOR_FECHA = "ranking-historico-fecha";

/**
 * Columnas de la tabla (design §6/§7). Viven fuera del componente porque no dependen de
 * props ni de estado, igual que en `RankingModule`. Los rótulos salen de
 * `RANKING_HISTORICO_COLUMNAS`, el mismo objeto que encabeza el archivo descargado.
 */
const COLUMNAS: Column<RankingSnapshotFilaDTO>[] = [
  {
    id: "puesto",
    value: RANKING_HISTORICO_COLUMNAS.puesto,
    render: (fila) => <span className="font-medium tabular-nums">{fila.puesto}</span>,
  },
  {
    id: "posicion",
    value: RANKING_HISTORICO_COLUMNAS.posicion,
    render: (fila) => <span className="tabular-nums">{fila.posicion ?? SIN_DATO}</span>,
  },
  {
    id: "mensajero",
    value: RANKING_HISTORICO_COLUMNAS.mensajero,
    render: (fila) => fila.nombre,
  },
  {
    id: "porcentaje",
    value: RANKING_HISTORICO_COLUMNAS.porcentaje,
    render: (fila) => porcentaje(fila.pct),
  },
  {
    id: "entregadas",
    value: RANKING_HISTORICO_COLUMNAS.entregadas,
    render: (fila) => <span className="tabular-nums">{fila.entregadas}</span>,
  },
  {
    id: "asignadas",
    value: RANKING_HISTORICO_COLUMNAS.asignadas,
    render: (fila) => <span className="tabular-nums">{fila.asignadas}</span>,
  },
  {
    id: "premio",
    value: RANKING_HISTORICO_COLUMNAS.premio,
    render: (fila) => (
      <span className="flex flex-col">
        <span className="tabular-nums">{money(fila.premioMonto)}</span>
        {fila.premioDescripcion ? (
          <span className="text-xs text-muted-foreground">{fila.premioDescripcion}</span>
        ) : null}
      </span>
    ),
  },
];

/**
 * SLT-162 «Ranking del mensajero en tarjetas en el móvil» (R755) — la tarjeta del Histórico en el
 * teléfono: arriba «{posición}º · {nombre}» («— · {nombre}» sin podio); abajo, «Premio» con
 * «{monto} · {descripción}» (o solo el monto, o «Sin premio asignado») y, en columna fija, «% del
 * día». Lo demás (Puesto, Entregado, Asignados) va al desplegar (`detalleHistoricoMovil`).
 */
function TarjetaHistorico({ fila }: Readonly<{ fila: RankingSnapshotFilaDTO }>) {
  const encabezado =
    fila.posicion === null
      ? `${SIN_DATO} · ${fila.nombre}`
      : `${ordinal(fila.posicion)} · ${fila.nombre}`;
  return (
    <div data-tarjeta-historico="" className="flex min-w-0 flex-col gap-3 py-1">
      <span data-columna="nombre" className={cn("text-[15px] font-bold", TEXTO_ENTERO)}>
        {encabezado}
      </span>
      <div className="flex items-end justify-between gap-3">
        <span data-columna="premio" className={cn("text-muted-foreground", TEXTO_ENTERO)}>
          <span className="block">{RANKING_HISTORICO_TARJETA.premio}</span>
          <span data-premio="" className="block text-foreground">
            {fila.premioMonto === null ? (
              PREMIOS_LABELS.sinMonto
            ) : (
              <>
                <span className={COLUMNA_FIJA}>{money(fila.premioMonto)}</span>
                {fila.premioDescripcion ? ` · ${fila.premioDescripcion}` : null}
              </>
            )}
          </span>
        </span>
        <span data-columna="porcentaje" className="flex shrink-0 flex-col items-end">
          <span className="whitespace-nowrap text-xs text-muted-foreground">
            {RANKING_HISTORICO_COLUMNAS.porcentaje}
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
 * SLT-162 (R755) — en el teléfono, UNA columna con la tarjeta sobre la MISMA `DataTable` (patrón de
 * SLT-165), con la cabecera solo para lector.
 */
const COLUMNAS_MOVIL: Column<RankingSnapshotFilaDTO>[] = [
  {
    id: "tarjeta",
    value: RANKING_HISTORICO_COLUMNAS.mensajero,
    renderHeader: () => <span className="sr-only">{RANKING_HISTORICO_COLUMNAS.mensajero}</span>,
    render: (fila) => <TarjetaHistorico fila={fila} />,
  },
];

/** SLT-162 (R755): al desplegar la tarjeta, Puesto, Entregado y Asignados. */
function detalleHistoricoMovil(fila: RankingSnapshotFilaDTO) {
  return (
    <dl className="m-0 grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm">
      <dt className="text-muted-foreground">{RANKING_HISTORICO_COLUMNAS.puesto}</dt>
      <dd className={cn("m-0", COLUMNA_FIJA)}>{fila.puesto}</dd>
      <dt className="text-muted-foreground">{RANKING_HISTORICO_COLUMNAS.entregadas}</dt>
      <dd className={cn("m-0", COLUMNA_FIJA)}>{fila.entregadas}</dd>
      <dt className="text-muted-foreground">{RANKING_HISTORICO_COLUMNAS.asignadas}</dt>
      <dd className={cn("m-0", COLUMNA_FIJA)}>{fila.asignadas}</dd>
    </dl>
  );
}

/** SLT-162 (R760): el nombre del control de desplegar dice lo que hará. */
function nombreDesplegar(_fila: RankingSnapshotFilaDTO, abierta: boolean): string {
  return abierta ? RANKING_HISTORICO_TARJETA.ocultarDetalle : RANKING_HISTORICO_TARJETA.verDetalle;
}

/**
 * SLT-162 (R755): el control de desplegar a la DERECHA de la tarjeta, sin tocar la `DataTable` (que
 * lo pone en la primera columna): en el teléfono la tabla se escribe de derecha a izquierda —la
 * primera columna queda a la derecha— y cada celda vuelve a izquierda a derecha por dentro. Las
 * celdas se alinean arriba, como el canvas (el control junto a la primera línea).
 */
const DESPLEGAR_A_LA_DERECHA =
  "max-md:[&_table]:[direction:rtl] max-md:[&_th]:[direction:ltr] max-md:[&_td]:[direction:ltr] max-md:[&_td]:align-top";

/**
 * SLT-162 (R757, DC23): la fecha es el único filtro de la barra y no hay campo de búsqueda
 * (`buscador={false}`), así que la barra nunca emite un término. Se declara porque la prop es
 * obligatoria.
 */
function sinTermino(): void {}

export interface RankingHistoricoModuleProps {
  /** Fecha CONSULTADA (`YYYY-MM-DD`), la que pinta el título y la que lleva el archivo (R35). */
  fecha: string;
  /**
   * El snapshot ya serializado, o `null` si esa fecha NO tiene cabecera. `null` y
   * `{ filas: [] }` significan cosas distintas y se pintan distinto (R26).
   */
  snapshot: RankingSnapshotData | null;
}

export function RankingHistoricoModule({ fecha, snapshot }: RankingHistoricoModuleProps) {
  const router = useRouter();
  const esMovil = useIsMobile();
  const titulo = tituloRankingHistorico(fecha);

  // El estado de la fecha vive en la URL y no en un `useState` (design §6): así la vista es
  // enlazable y compartible, y recargar no la pierde. `push` y no `replace`: cambiar de día
  // es navegación, y el usuario espera poder volver con «atrás».
  function irAFecha(valor: string) {
    if (!valor) return; // el `<input type="date">` emite "" al vaciarse; no se navega a nada
    router.push(`${RUTA_HISTORICO}?fecha=${valor}`);
  }

  return (
    <Card>
      <CardHeader className="border-b">
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>
          {snapshot
            ? RANKING_HISTORICO_LABELS.generadoEl(instanteGeneracion(snapshot.generadoAt))
            : RANKING_HISTORICO_LABELS.pageDescripcion}
        </CardDescription>
        {/* SLT-162 (R757, DC23): la fecha vive como el filtro de UN `BuscadorFiltros` tal cual, sin
            campo de búsqueda y siempre montado (como control puesto, no detrás de «Filtros»). No
            lee la URL: la página ya lee `?fecha`. En el teléfono, a todo el ancho y 44 px. */}
        <BuscadorFiltros
          buscador={false}
          leerDeUrl={false}
          tactil
          onChange={sinTermino}
          className="pt-2"
        >
          <div className="flex w-full flex-col gap-2 md:w-auto">
            <Label htmlFor={ID_SELECTOR_FECHA}>
              {RANKING_HISTORICO_LABELS.selectorFecha}
            </Label>
            <Input
              id={ID_SELECTOR_FECHA}
              type="date"
              value={fecha}
              onChange={(evento) => irAFecha(evento.target.value)}
              className="w-44 max-md:h-11 max-md:w-full"
            />
          </div>
        </BuscadorFiltros>
      </CardHeader>
      {/* SLT-162 (R755, R760, R766): desplegar a 44 px y a la derecha, «Descargar» a todo el ancho. */}
      <CardContent className={cn(DESPLEGABLE_TACTIL, DESCARGA_MOVIL, DESPLEGAR_A_LA_DERECHA)}>
        {snapshot === null ? (
          // R26 (sin cabecera): NO se monta la tabla ni el control de descarga. No hay nada
          // que descargar y un archivo vacío afirmaría un día sin actividad que nadie midió.
          <div role="status" className="flex flex-col gap-1 py-6 text-center">
            <p className="text-sm font-medium">{RANKING_HISTORICO_LABELS.sinSnapshot}</p>
            <p className="text-sm text-muted-foreground">
              {RANKING_HISTORICO_LABELS.sinSnapshotDetalle}
            </p>
          </div>
        ) : (
          <DataTable
            columns={esMovil ? COLUMNAS_MOVIL : COLUMNAS}
            data={snapshot.filas}
            rowKey="mensajeroId"
            ariaLabel={RANKING_HISTORICO_LABELS.tablaAria}
            renderExpanded={esMovil ? detalleHistoricoMovil : undefined}
            expandAriaLabel={esMovil ? nombreDesplegar : undefined}
            // R26 (cabecera con filas = 0): el cron SÍ corrió ese día. Es un mensaje propio,
            // distinto del de arriba.
            emptyState={{
              icon: Trophy,
              title: RANKING_HISTORICO_LABELS.sinActividad,
            }}
            /**
             * T5.2 — descarga de FAMILIA B (R32/R33/R35): el histórico no pagina, así que el
             * array de props ES el dataset completo y el archivo se proyecta de lo que la
             * tabla ya está pintando, sin releer nada del servidor y sin generador nuevo.
             *
             * `filasLocales` aplica el tope común: por encima NO produce archivo y devuelve
             * el mensaje accionable con total y tope. Aquí es una red —el conjunto está
             * acotado por el nº de mensajeros con actividad ese día—, no un límite operativo.
             *
             * El `titulo` lleva la fecha consultada dentro, que es lo que hace que
             * `nombreArchivoDescarga` produzca `ranking-del-dia-<fecha>-<hoy>.xlsx` (R35).
             */
            descarga={{
              titulo,
              columnas: COLUMNAS_DESCARGA_RANKING_HISTORICO,
              obtenerFilas: () =>
                filasLocales(snapshot.filas, filaDescargaRankingHistorico),
            }}
          />
        )}
      </CardContent>
    </Card>
  );
}
