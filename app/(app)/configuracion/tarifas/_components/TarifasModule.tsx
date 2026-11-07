"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { TarifaActor } from "@prisma/client";
import { MapPin } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useEtiquetasGeograficas } from "@/hooks/use-etiquetas-geograficas";
import { cargarZonaTarifas, type CargarZonaTarifasResult } from "@/lib/actions/tarifas";
import type {
  CargarPantallaResult,
  CargarZonaResult,
  GrupoDeZonaResumen,
} from "@/lib/interfaces/services/ITarifasPantallaService";
import { zonasCompletas } from "@/lib/tarifas/faltantes";
import { cn } from "@/lib/utils";

import { valoresDelNivel, type AlcanceTienda, type Nivel } from "./tarifas-borrador";
import { TEXTOS } from "./tarifas-textos";
import { TarifasActivarDialog } from "./TarifasActivarDialog";
import { TarifasEstado } from "./TarifasEstado";
import { TarifasGrupos } from "./TarifasGrupos";
import { filasDeMensajeros, TarifasMensajeros } from "./TarifasMensajeros";
import { filasDePrecios, TarifasTiendas, type FilaPrecioTienda } from "./TarifasTiendas";
import { TarifasTopeIntentos } from "./TarifasTopeIntentos";
import { TarifasValores } from "./TarifasValores";
import { TarifasZonas } from "./TarifasZonas";

export type PantallaOk = Extract<CargarPantallaResult, { status: "ok" }>;
type ZonaOk = Extract<CargarZonaResult, { status: "ok" }>;
type EstadoZona = { tipo: "cargando" } | { tipo: "error" } | { tipo: "ok"; datos: ZonaOk };

export interface TarifasModuleProps {
  pantalla: PantallaOk;
  zonaInicialId: string | null;
  /** Lo que la pagina ya leyo de esa zona: la primera pintura no pasa por el esqueleto. */
  zonaInicial: CargarZonaTarifasResult | null;
  /** `cargarPantallaTarifas` no trae los nombres de grupo de otras zonas, y la lista de tiendas los enseña. */
  nombresDeGrupo: Readonly<Record<string, string>>;
}

const NIVEL_ZONA = "zona";
const NIVEL_TIENDA = "tienda";

function resumenDeGrupos(grupos: ZonaOk["grupos"]): GrupoDeZonaResumen[] {
  return grupos.map(({ nombre, distritos }) => {
    const cuantos = distritos.length;
    return { nombre, distritos: cuantos };
  });
}

function estadoDe(r: CargarZonaTarifasResult | null): EstadoZona {
  return r !== null && r.status === "ok" ? { tipo: "ok", datos: r } : { tipo: "error" };
}

function alcanceComoTexto(alcance: AlcanceTienda): string {
  return alcance.tipo === "grupo" ? `grupo:${alcance.grupoId}` : alcance.tipo;
}

function alcanceDeTexto(texto: string): AlcanceTienda {
  if (texto === "todas" || texto === "zona") return { tipo: texto };
  return { tipo: "grupo", grupoId: texto.slice("grupo:".length) };
}

/** R33, R55, R57, R58: el marco. Page → este modulo → actions; los hijos reciben todo por props. */
export function TarifasModule({ pantalla, zonaInicialId, zonaInicial, nombresDeGrupo }: Readonly<TarifasModuleProps>) {
  const router = useRouter();
  const etiquetas = useEtiquetasGeograficas();
  const distritoPlural = etiquetas.distrito.plural.toLowerCase();
  const distritoSingular = etiquetas.distrito.singular.toLowerCase();

  const { activacion, zonas, vehiculos, tiendas, preciosTienda, mensajeros, valoresMensajero, topeIntentos, puedeEscribir } = pantalla;
  const activada = activacion !== null;

  const [zonaId, setZonaId] = useState<string | null>(zonaInicialId);
  const [estado, setEstado] = useState<EstadoZona>(() => estadoDe(zonaInicial));
  const [nivel, setNivel] = useState<Nivel>({ tipo: "zona" });
  const [actor, setActor] = useState<TarifaActor>("tienda");
  const [activarAbierto, setActivarAbierto] = useState(false);
  const [pendiente, setPendiente] = useState<(() => void) | null>(null);
  const [gruposPorZona, setGruposPorZona] = useState<Readonly<Record<string, readonly GrupoDeZonaResumen[]>>>(() =>
    zonaInicialId !== null && zonaInicial?.status === "ok" ? { [zonaInicialId]: resumenDeGrupos(zonaInicial.grupos) } : {},
  );

  const sucio = useRef(false);
  const peticion = useRef(0);
  const panelRef = useRef<HTMLElement>(null);
  const gruposRef = useRef<HTMLElement>(null);

  const zona = zonas.find((z) => z.id === zonaId) ?? null;

  /** Solo pinta la ultima pedida: una respuesta lenta de otra zona no puede pisar a la que se esta viendo. */
  const cargar = useCallback(
    async (id: string, tiendaId: string | null, silencioso: boolean): Promise<void> => {
      const numero = ++peticion.current;
      if (!silencioso) setEstado({ tipo: "cargando" });
      let r: CargarZonaTarifasResult | null = null;
      try {
        r = await cargarZonaTarifas(tiendaId === null ? { zonaId: id } : { zonaId: id, tiendaId });
      } catch {
        r = null;
      }
      if (numero !== peticion.current) return;
      // Una recarga tras guardar que falla no se lleva por delante lo que se esta editando.
      if (silencioso && (r === null || r.status !== "ok")) return;
      setEstado(estadoDe(r));
      if (r?.status === "ok") {
        const grupos = resumenDeGrupos(r.grupos);
        setGruposPorZona((g) => ({ ...g, [id]: grupos }));
      }
    },
    [],
  );

  const tiendaDelNivel = nivel.tipo === "tienda" ? nivel.tiendaId : null;

  const recargar = useCallback(async () => {
    router.refresh();
    if (zonaId !== null) await cargar(zonaId, tiendaDelNivel, true);
  }, [router, cargar, zonaId, tiendaDelNivel]);

  const alSucio = useCallback((s: boolean) => {
    sucio.current = s;
  }, []);

  /** Cambiar de zona o de nivel descarta lo digitado: se pregunta antes de hacerlo en silencio. */
  function protegido(accion: () => void) {
    if (sucio.current) {
      setPendiente(() => accion);
      return;
    }
    accion();
  }

  function irAZona(id: string, siguiente: Nivel = { tipo: "zona" }) {
    sucio.current = false;
    setZonaId(id);
    setNivel(siguiente);
    void cargar(id, siguiente.tipo === "tienda" ? siguiente.tiendaId : null, false);
  }

  function irANivel(siguiente: Nivel) {
    sucio.current = false;
    setNivel(siguiente);
    // La referencia de una tienda se pide al elegirla (design §7): sin ella, cada zona leeria todas.
    const tienda = siguiente.tipo === "tienda" ? siguiente.tiendaId : null;
    if (tienda !== null && zonaId !== null && tienda !== tiendaDelNivel) void cargar(zonaId, tienda, false);
  }

  function elegirNivel(valor: string) {
    protegido(() => {
      if (valor === NIVEL_ZONA) irANivel({ tipo: "zona" });
      else if (valor === NIVEL_TIENDA) {
        setActor("tienda");
        irANivel({ tipo: "tienda", tiendaId: null, alcance: { tipo: "zona" } });
      } else irANivel({ tipo: "grupo", grupoId: valor });
    });
  }

  function verPanel() {
    panelRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }

  function anadirPrecio() {
    protegido(() => {
      setActor("tienda");
      irANivel({ tipo: "tienda", tiendaId: null, alcance: { tipo: "zona" } });
      verPanel();
    });
  }

  function editarPrecio(fila: FilaPrecioTienda) {
    protegido(() => {
      const alcance: AlcanceTienda =
        fila.zonaId === null
          ? { tipo: "todas" }
          : fila.grupoId === null
            ? { tipo: "zona" }
            : { tipo: "grupo", grupoId: fila.grupoId };
      const siguiente: Nivel = { tipo: "tienda", tiendaId: fila.tiendaId, alcance };
      setActor("tienda");
      if (fila.zonaId !== null && fila.zonaId !== zonaId) irAZona(fila.zonaId, siguiente);
      else irANivel(siguiente);
      verPanel();
    });
  }

  const datos = estado.tipo === "ok" ? estado.datos : null;
  const grupos = useMemo(() => datos?.grupos ?? [], [datos]);

  // Un grupo borrado desde el bloque de abajo no puede quedarse como nivel elegido.
  const nivelVigente: Nivel =
    (nivel.tipo === "grupo" && datos !== null && !grupos.some((g) => g.id === nivel.grupoId)) ||
    (nivel.tipo === "tienda" &&
      nivel.alcance.tipo === "grupo" &&
      datos !== null &&
      !grupos.some((g) => nivel.alcance.tipo === "grupo" && g.id === nivel.alcance.grupoId))
      ? { tipo: "zona" }
      : nivel;

  const faltantes = useMemo(
    () =>
      zonas.map((z) => ({ zonaId: z.id, zonaNombre: z.nombre, faltantes: z.faltantes, usaZona: z.usaZona })),
    [zonas],
  );
  const filasTienda = useMemo(
    () => filasDePrecios(preciosTienda, tiendas, zonas, nombresDeGrupo),
    [preciosTienda, tiendas, zonas, nombresDeGrupo],
  );
  const filasMensajero = useMemo(() => filasDeMensajeros(valoresMensajero, mensajeros), [valoresMensajero, mensajeros]);

  const estadoBanda = (
    <TarifasEstado
      activada={activada}
      completas={zonasCompletas(zonas)}
      total={zonas.length}
      puedeEscribir={puedeEscribir}
      onActivar={() => setActivarAbierto(true)}
    />
  );

  const dialogoActivar =
    activarAbierto && !activada ? (
      <TarifasActivarDialog
        faltantes={faltantes}
        onCerrar={() => setActivarAbierto(false)}
        onCompletar={(id) => protegido(() => irAZona(id))}
        onActivada={() => void recargar()}
      />
    ) : null;

  // SLT-77 R12: el tope no depende de las zonas; una empresa recien creada, sin ninguna, tambien lo ve.
  const seccionTope = <TarifasTopeIntentos tope={topeIntentos} puedeEscribir={puedeEscribir} />;

  if (zona === null && zonas[0] !== undefined) {
    // La zona abierta ya no existe (se borro en otra sesion): no es «no hay zonas».
    const primera = zonas[0];
    return (
      <div className="flex flex-col gap-6">
        {estadoBanda}
        <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
          <AlertDescription className="text-destructive">{TEXTOS.errorZona}</AlertDescription>
          <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => irAZona(primera.id)}>
            {TEXTOS.reintentar}
          </Button>
        </Alert>
        {seccionTope}
      </div>
    );
  }

  if (zona === null) {
    return (
      <div className="flex flex-col gap-6">
        {estadoBanda}
        <EmptyState
          icon={MapPin}
          title={TEXTOS.sinZonasTitulo}
          description={TEXTOS.sinZonasDetalle}
          action={
            puedeEscribir ? (
              <Link href="/configuracion/zonas" className={cn(buttonVariants({ variant: "outline" }), "min-h-11 px-4")}>
                {TEXTOS.sinZonasAccion}
              </Link>
            ) : undefined
          }
          className="rounded-xl border border-border bg-card"
        />
        {seccionTope}
        {dialogoActivar}
      </div>
    );
  }

  const opcionesNivel = [
    { value: NIVEL_ZONA, label: TEXTOS.nivelZona },
    ...grupos.map((g) => ({
      value: g.id,
      label: TEXTOS.nivelGrupo(
        g.nombre,
        `${g.distritos.length} ${g.distritos.length === 1 ? distritoSingular : distritoPlural}`,
      ),
    })),
    { value: NIVEL_TIENDA, label: TEXTOS.nivelTienda },
  ];
  const valorNivel =
    nivelVigente.tipo === "zona" ? NIVEL_ZONA : nivelVigente.tipo === "grupo" ? nivelVigente.grupoId : NIVEL_TIENDA;
  const claveValores = `${zona.id}|${JSON.stringify(nivelVigente)}`;

  return (
    <div className="flex flex-col gap-6">
      {estadoBanda}

      <div className="flex flex-wrap items-start gap-6">
        <TarifasZonas
          zonas={zonas}
          seleccionada={zona.id}
          gruposPorZona={gruposPorZona}
          onElegir={(id) => protegido(() => irAZona(id))}
        />

        <section
          ref={panelRef}
          aria-label="Valores de la zona"
          data-testid="tarifas-panel"
          className="min-w-0 flex-[999_1_560px] scroll-mt-4 overflow-hidden rounded-xl border border-border bg-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 px-[18px] pt-4">
            <h2 className="text-lg font-bold">{zona.nombre}</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Label htmlFor="tarifas-nivel" className="font-normal text-muted-foreground">
                {puedeEscribir ? TEXTOS.editando : TEXTOS.viendo}
              </Label>
              <Select
                id="tarifas-nivel"
                value={valorNivel}
                onValueChange={elegirNivel}
                options={opcionesNivel}
                disabled={estado.tipo !== "ok"}
                className="h-auto min-h-10 max-lg:min-h-11 w-auto min-w-[150px] font-medium focus-visible:ring-3 focus-visible:ring-ring"
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-10 max-lg:min-h-11 px-3"
                onClick={() => gruposRef.current?.scrollIntoView?.({ behavior: "smooth", block: "start" })}
              >
                {`Grupos de ${distritoPlural}`}
              </Button>
            </div>
          </div>

          {nivelVigente.tipo === "tienda" ? (
            <div className="flex flex-wrap items-center gap-2 px-[18px] pt-3 text-sm">
              {tiendas.length === 0 ? (
                <p className="text-muted-foreground">{TEXTOS.tiendaSinCuentas}</p>
              ) : (
                <>
                  <Label htmlFor="tarifas-tienda" className="font-normal text-muted-foreground">
                    {TEXTOS.tienda}
                  </Label>
                  <Select
                    id="tarifas-tienda"
                    value={nivelVigente.tiendaId ?? ""}
                    placeholder={TEXTOS.elegirTienda}
                    onValueChange={(t) =>
                      protegido(() => irANivel({ tipo: "tienda", tiendaId: t === "" ? null : t, alcance: nivelVigente.alcance }))
                    }
                    options={tiendas.map((t) => ({ value: t.id, label: t.nombre }))}
                    className="h-auto min-h-10 max-lg:min-h-11 w-auto min-w-[180px] focus-visible:ring-3 focus-visible:ring-ring"
                  />
                  <Label htmlFor="tarifas-alcance" className="font-normal text-muted-foreground">
                    {TEXTOS.aplicaEn}
                  </Label>
                  <Select
                    id="tarifas-alcance"
                    value={alcanceComoTexto(nivelVigente.alcance)}
                    onValueChange={(a) =>
                      protegido(() => irANivel({ tipo: "tienda", tiendaId: nivelVigente.tiendaId, alcance: alcanceDeTexto(a) }))
                    }
                    options={[
                      { value: "todas", label: TEXTOS.todasSusZonas },
                      { value: "zona", label: zona.nombre },
                      ...grupos.map((g) => ({ value: `grupo:${g.id}`, label: TEXTOS.grupoDeZona(g.nombre) })),
                    ]}
                    className="h-auto min-h-10 max-lg:min-h-11 w-auto min-w-[150px] focus-visible:ring-3 focus-visible:ring-ring"
                  />
                </>
              )}
            </div>
          ) : null}

          {estado.tipo === "cargando" ? (
            <div data-testid="tarifas-esqueleto" className="flex flex-col gap-3 p-[18px]" aria-busy="true">
              <span className="sr-only">Cargando…</span>
              {[0, 1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : null}

          {estado.tipo === "error" ? (
            <div className="p-[18px]">
              <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
                <AlertDescription className="text-destructive">{TEXTOS.errorZona}</AlertDescription>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 px-4"
                  onClick={() => void cargar(zona.id, tiendaDelNivel, false)}
                >
                  {TEXTOS.reintentar}
                </Button>
              </Alert>
            </div>
          ) : null}

          {datos !== null ? (
            <TarifasValores
              key={claveValores}
              zonaId={zona.id}
              nivel={nivelVigente}
              valores={valoresDelNivel(nivelVigente, zona.id, datos.valores, preciosTienda)}
              referencia={datos.referencia}
              vehiculos={vehiculos}
              activada={activada}
              puedeEscribir={puedeEscribir}
              actor={actor}
              onActor={setActor}
              onGuardado={recargar}
              onSucioChange={alSucio}
            />
          ) : null}
        </section>
      </div>

      {datos !== null ? (
        <TarifasGrupos
          key={zona.id}
          zona={zona}
          grupos={grupos}
          distritos={datos.distritos}
          valores={datos.valores}
          activada={activada}
          puedeEscribir={puedeEscribir}
          onCambio={recargar}
          seccionRef={gruposRef}
        />
      ) : null}

      <TarifasTiendas
        filas={filasTienda}
        puedeEscribir={puedeEscribir}
        onAnadir={anadirPrecio}
        onEditar={editarPrecio}
        onCambio={recargar}
      />

      <TarifasMensajeros
        filas={filasMensajero}
        mensajeros={mensajeros}
        activada={activada}
        puedeEscribir={puedeEscribir}
        onCambio={recargar}
      />

      {seccionTope}

      {dialogoActivar}

      <Modal
        open={pendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPendiente(null);
        }}
        title={TEXTOS.descartarTitulo}
        description={TEXTOS.descartarDetalle}
        confirmLabel={TEXTOS.descartarSi}
        cancelLabel={TEXTOS.descartarNo}
        size="md"
        className="[&_button[data-slot=button]]:min-h-11"
        onConfirm={() => {
          const accion = pendiente;
          setPendiente(null);
          sucio.current = false;
          accion?.();
        }}
      />
    </div>
  );
}

/** R57: la lectura fallo. Un error con salida, y no un vacio que diga que no hay tarifas. */
export function TarifasErrorCarga() {
  const router = useRouter();
  return (
    <Alert variant="destructive" className="flex flex-wrap items-center justify-between gap-3">
      <AlertDescription className="text-destructive">{TEXTOS.errorCarga}</AlertDescription>
      <Button type="button" variant="outline" className="min-h-11 px-4" onClick={() => router.refresh()}>
        {TEXTOS.reintentar}
      </Button>
    </Alert>
  );
}
