"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Combobox } from "@/components/ui/combobox";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/useToast";
import {
  cambiarDisponibilidadPaisAction,
  cargarDivisionAction,
  crearPaisAction,
  type CambiarDisponibilidadPaisActionResult,
  type CargarDivisionActionResult,
  type CrearPaisActionResult,
} from "@/lib/actions/geografia-plataforma";
import { PAISES_ISO_3166_1, type PaisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import { columnaCodigoNivel, columnaNivel } from "@/lib/types/division-csv";
import type { NodoArbolPlataformaDTO, TipoNivelDTO } from "@/lib/types/geografia-nodo";
import {
  crearPaisSchema,
  etiquetasDePais,
  PAIS_NIVELES_MAX,
  PAIS_NIVELES_MIN,
  PAIS_NOMBRE_MAX,
  type CrearPaisInput,
  type EtiquetaDeNivel,
  type PaisDTO,
} from "@/lib/types/pais";
import { normalizeName } from "@/lib/utils/normalize";

import { ConfirmarCambio, type ErrorGenericoDeCambio } from "./ConfirmarCambio";
import { GeografiaAdminModule } from "./GeografiaAdminModule";
import { ListaReordenable } from "./ListaReordenable";

// SL-20 (design §8; R20, R23–R28, R42, R46, R47) — la geografía del superadmin, en cliente:
//   - el selector de país (todos los dados de alta, disponibles o no);
//   - «Nuevo país», con el país ELEGIDO del catálogo ISO 3166-1 y su lista ordenada de niveles;
//   - el interruptor «Disponible» del país elegido;
//   - la carga CSV de su división, con la equivalencia de columnas y los errores por línea;
//   - el árbol editable (`GeografiaAdminModule`).
//
// R20: los niveles se nombran con los nombres DEL PAÍS ELEGIDO, no con los del provider: la sesión
// del superadmin no tiene empresa y ahí solo hay etiquetas neutras.
//
// SLT-46 (design §6; R58, R59, P11): las tres escrituras de este archivo (alta de país, «Disponible»
// y carga CSV) pasan por `ConfirmarCambio`; ninguna action se llama sin el «Sí, …» del modal.

const RUTA = "/plataforma/geografia";

export interface GeografiaPlataformaModuleProps {
  /** Todos los países dados de alta, ordenados por nombre. */
  paises: PaisDTO[];
  /** El país cuya geografía se trabaja, o `null` si aún no hay ninguno. */
  paisElegido: PaisDTO | null;
  /** Los tipos de nivel del país elegido, uno por profundidad. */
  tipos: TipoNivelDTO[];
  /** El árbol del país elegido a cualquier profundidad, sin zonas. */
  raices: NodoArbolPlataformaDTO[];
  /** No se pudo leer la lista de países: `paises` llega vacío, pero NO porque no haya ninguno. */
  paisesError?: boolean;
  /** No se pudo leer la división del país elegido: `raices` llega vacío por el fallo. */
  divisionError?: boolean;
}

export function GeografiaPlataformaModule({
  paises,
  paisElegido,
  tipos,
  raices,
  paisesError = false,
  divisionError = false,
}: Readonly<GeografiaPlataformaModuleProps>) {
  const router = useRouter();
  const [altaAbierta, setAltaAbierta] = useState(false);

  const botonNuevoPais = (
    <Button type="button" variant="outline" className="min-h-11" onClick={() => setAltaAbierta(true)}>
      <Plus aria-hidden="true" />
      Nuevo país
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="geografia-pais-titulo">
        <h2 id="geografia-pais-titulo" className="text-base font-semibold">
          País
        </h2>
        {paises.length > 0 && paisElegido !== null ? (
          <div className="flex flex-wrap items-center gap-3">
            <Select
              className="max-w-xs"
              aria-label="País"
              value={paisElegido.id}
              onValueChange={(id) => {
                if (id !== "") router.push(`${RUTA}?pais=${encodeURIComponent(id)}`);
              }}
              options={paises.map((p) => ({ value: p.id, label: `${p.nombre} (${p.id})` }))}
            />
            {botonNuevoPais}
          </div>
        ) : paisesError ? (
          // Un fallo no se pinta como «aún no hay ninguno»: lo dice, y el alta sigue a mano.
          <>
            <Alert variant="destructive">
              <AlertDescription>No se pudo cargar la lista de países.</AlertDescription>
            </Alert>
            <div>{botonNuevoPais}</div>
          </>
        ) : (
          <div className="rounded-md border border-border">
            <EmptyState
              title="Aún no hay ningún país dado de alta."
              description="Da de alta el primero; después podrás cargar su división."
              action={botonNuevoPais}
            />
          </div>
        )}

        {paisElegido !== null ? <InterruptorDisponible key={paisElegido.id} pais={paisElegido} /> : null}
      </section>

      <NuevoPaisDialog
        idsDadosDeAlta={paises.map((p) => p.id)}
        open={altaAbierta}
        onOpenChange={setAltaAbierta}
        onCreado={(id) => router.push(`${RUTA}?pais=${encodeURIComponent(id)}`)}
      />

      {paisElegido !== null ? (
        <>
          <CargaDivisionCsv
            key={`csv-${paisElegido.id}`}
            paisId={paisElegido.id}
            paisNombre={paisElegido.nombre}
            niveles={nivelesDelPais(paisElegido, tipos)}
          />
          <GeografiaAdminModule
            key={`arbol-${paisElegido.id}`}
            paisId={paisElegido.id}
            paisNombre={paisElegido.nombre}
            tipos={tipos}
            raices={raices}
            cargaErrorInicial={divisionError}
          />
        </>
      ) : null}
    </div>
  );
}

/**
 * Los nombres de cada profundidad, de la 1 a la P. Salen de `tipos` (la fuente desde SLT-46); si la
 * lectura de la división falló y no llegan, de `pais.nivel_N_*`, que cubre las tres primeras (un país
 * de 2 niveles guarda `''` en el nivel 3, design §2.4).
 */
function nivelesDelPais(pais: PaisDTO, tipos: readonly TipoNivelDTO[]): EtiquetaDeNivel[] {
  if (tipos.length > 0) {
    return [...tipos]
      .sort((a, b) => a.profundidad - b.profundidad)
      .map((t) => ({ singular: t.nombreSingular, plural: t.nombrePlural }));
  }
  const e = etiquetasDePais(pais);
  return pais.nivel3Singular === "" ? [e.provincia, e.canton] : [e.provincia, e.canton, e.distrito];
}

// ── Disponibilidad (R47; P11) ────────────────────────────────────────────────────────────────────

/**
 * R47: enciende o apaga la cobertura del país. R46: apagarlo no toca a sus empresas; el aviso lo
 * dice junto al control y es su descripción accesible. P11: el cambio pasa por el modal; el
 * interruptor no se mueve hasta que la action responde `ok`.
 */
function InterruptorDisponible({ pais }: Readonly<{ pais: PaisDTO }>) {
  const toast = useToast();
  const avisoId = useId();
  const [disponible, setDisponible] = useState(pais.disponible);
  const [pedido, setPedido] = useState<boolean | null>(null);

  const estado = (valor: boolean) => (valor ? "Disponible" : "No disponible");

  function alExito(res: CambiarDisponibilidadPaisActionResult) {
    if (res.status !== "ok") return;
    setDisponible(res.disponible);
    toast.success(
      res.disponible
        ? `${pais.nombre} ya se ofrece en el alta de empresas.`
        : `${pais.nombre} ya no se ofrece en el alta de empresas nuevas.`,
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex min-h-11 items-center gap-2">
        <Switch
          checked={disponible}
          disabled={pedido !== null}
          aria-label={`Disponible: ${pais.nombre}`}
          aria-describedby={avisoId}
          onCheckedChange={(siguiente) => setPedido(siguiente)}
        />
        {/* El nombre accesible lo da `aria-label`, con el país: un `<label>` aquí lo pisaría. */}
        <span aria-hidden="true" className="text-sm font-medium">
          Disponible
        </span>
      </div>
      <p id={avisoId} className="max-w-prose text-xs text-muted-foreground">
        Solo decide si el país se ofrece al dar de alta una empresa nueva. Apagarlo no afecta a las
        empresas que ya están en él: siguen igual, con su geografía.
      </p>

      <ConfirmarCambio<CambiarDisponibilidadPaisActionResult>
        open={pedido !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPedido(null);
        }}
        titulo={`Disponibilidad de ${pais.nombre}`}
        descripcion="Solo decide si el país se ofrece al dar de alta una empresa nueva. Apagarlo no afecta a las empresas que ya están en él."
        filas={[{ etiqueta: "Estado", antes: estado(disponible), despues: estado(pedido ?? !disponible) }]}
        confirmLabel="Sí, cambiar"
        accion={() => cambiarDisponibilidadPaisAction({ id: pais.id, disponible: pedido ?? !disponible })}
        onExito={alExito}
        onRechazo={(res) =>
          toast.error(mensajeDeEstado(res.status, "No se pudo cambiar la disponibilidad del país."))
        }
      />
    </div>
  );
}

// ── Alta de país (R23, R41, R42, R53, R54, R58, R59, R62) ────────────────────────────────────────

/** Una fila de la lista de niveles del alta. `id` solo identifica la fila al reordenar. */
interface FilaDeNivel {
  id: string;
  singular: string;
  plural: string;
}

type ErroresDeFila = Partial<Record<"singular" | "plural", string[]>>;

/** Lo validado por `crearPaisSchema`, con el nombre del catálogo para el modal. */
type AltaPendiente = CrearPaisInput & { nombre: string };

/** Maqueta T0.2: el alta arranca con tres filas vacías, la forma más común. */
const FILAS_INICIALES = 3;

/** R42: busca por nombre (sin acentos ni mayúsculas) o por código. */
function casaPais(pais: PaisDelCatalogo, consulta: string): boolean {
  const q = normalizeName(consulta);
  if (q === "") return true;
  return normalizeName(pais.nombre).includes(q) || pais.id.toLowerCase().startsWith(q);
}

function etiquetaDePais(pais: PaisDelCatalogo): string {
  return `${pais.nombre} (${pais.id})`;
}

/**
 * Decisión 11 (tras la review 1): el catálogo sin los países ya dados de alta. Ofrecerlos solo
 * llevaría a un `conflict` del servidor al guardar.
 */
function paisesPorDarDeAlta(idsDadosDeAlta: readonly string[]): PaisDelCatalogo[] {
  const dados = new Set(idsDadosDeAlta);
  return PAISES_ISO_3166_1.filter((p) => !dados.has(p.id));
}

// El id de fila solo da a React y a dnd-kit una clave estable al reordenar; un contador de módulo
// basta (no viaja a la action) y se puede leer en el inicializador de `useState`, cosa que un ref no.
let contadorDeFilas = 0;

function nuevaFila(): FilaDeNivel {
  contadorDeFilas += 1;
  return { id: `fila-${contadorDeFilas}`, singular: "", plural: "" };
}

function filasVacias(): FilaDeNivel[] {
  return Array.from({ length: FILAS_INICIALES }, nuevaFila);
}

/** R54: la equivalencia con el CSV sigue el orden en pantalla, que es el que se envía. */
function equivalenciaEnVivo(filas: readonly FilaDeNivel[]): string {
  return filas.map((f, i) => `${columnaNivel(i + 1)} = ${f.singular.trim() || "—"}`).join(" · ");
}

function NuevoPaisDialog({
  idsDadosDeAlta,
  open,
  onOpenChange,
  onCreado,
}: Readonly<{
  idsDadosDeAlta: readonly string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreado: (id: string) => void;
}>) {
  const toast = useToast();
  const tituloNivelesId = useId();
  const opciones = paisesPorDarDeAlta(idsDadosDeAlta);
  const [pais, setPais] = useState<PaisDelCatalogo | null>(null);
  const [filas, setFilas] = useState<FilaDeNivel[]>(filasVacias);
  const [errores, setErrores] = useState<Record<string, string[]>>({});
  const [erroresDeFila, setErroresDeFila] = useState<Record<string, ErroresDeFila>>({});
  const [pendiente, setPendiente] = useState<AltaPendiente | null>(null);

  function reiniciar() {
    setPais(null);
    setFilas(filasVacias());
    setErrores({});
    setErroresDeFila({});
    setPendiente(null);
  }

  function editar(id: string, campo: "singular" | "plural", valor: string) {
    setFilas((previas) => previas.map((f) => (f.id === id ? { ...f, [campo]: valor } : f)));
    setErroresDeFila((previos) => ({ ...previos, [id]: { ...previos[id], [campo]: undefined } }));
  }

  /** R58, R59: el mismo esquema que el servidor; si falla, el error va a su campo y no hay modal. */
  function pedirConfirmacion() {
    const parsed = crearPaisSchema.safeParse({
      id: pais?.id ?? "",
      tipos: filas.map((f) => ({ singular: f.singular, plural: f.plural })),
    });
    if (parsed.success && pais !== null) {
      setErrores({});
      setErroresDeFila({});
      setPendiente({ ...parsed.data, nombre: pais.nombre });
      return;
    }

    const generales: Record<string, string[]> = {};
    const porFila: Record<string, ErroresDeFila> = {};
    for (const issue of parsed.success ? [] : parsed.error.issues) {
      const [raiz, indice, campo] = issue.path;
      const fila = typeof indice === "number" ? filas[indice] : undefined;
      if (raiz === "tipos" && fila !== undefined && (campo === "singular" || campo === "plural")) {
        porFila[fila.id] = { ...porFila[fila.id], [campo]: [...(porFila[fila.id]?.[campo] ?? []), issue.message] };
      } else {
        const clave = typeof raiz === "string" ? raiz : "entrada";
        generales[clave] = [...(generales[clave] ?? []), issue.message];
      }
    }
    // Sin elegir nada, el mensaje de siempre de esta pantalla en vez del de catálogo del esquema.
    if (pais === null) generales.id = ["Elige un país de la lista."];
    setErrores(generales);
    setErroresDeFila(porFila);
  }

  function alExito(res: CrearPaisActionResult) {
    if (res.status !== "ok") return;
    toast.success(`${res.pais.nombre} dado de alta.`);
    reiniciar();
    onOpenChange(false);
    onCreado(res.pais.id);
  }

  function alRechazar(res: CrearPaisActionResult | ErrorGenericoDeCambio) {
    if (res.status === "validation_error" && "fieldErrors" in res) {
      setErrores(res.fieldErrors);
      return;
    }
    if (res.status === "conflict") {
      setErrores({ id: ["Ese país ya está dado de alta."] });
      return;
    }
    toast.error(mensajeDeEstado(res.status, "No se pudo dar de alta el país."));
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    pedirConfirmacion();
  }

  const titulo = `Niveles ${filas.length} (máximo ${PAIS_NIVELES_MAX})`;
  const erroresDeLista = [...(errores.tipos ?? []), ...(errores.entrada ?? [])];

  return (
    <Modal
      open={open}
      onOpenChange={(abierta) => {
        if (!abierta) reiniciar();
        onOpenChange(abierta);
      }}
      title="Nuevo país"
      description="Elige el país de la lista y escribe cómo llama a cada uno de sus niveles, del primero al último."
      confirmLabel="Dar de alta"
      cancelLabel="Cancelar"
      closeOnConfirm={false}
      onConfirm={pedirConfirmacion}
      size="lg"
      className="[&_[data-slot=button]]:min-h-11"
    >
      <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
        <FormField id="nuevo-pais-id" label="País" error={errores.id ?? errores.nombre} required>
          {(control) => (
            <Combobox<PaisDelCatalogo>
              {...control}
              items={opciones}
              value={pais}
              onValueChange={setPais}
              itemToLabel={etiquetaDePais}
              itemKey={(p) => p.id}
              filter={casaPais}
              placeholder="Busca por nombre o por código"
              emptyText={
                opciones.length === 0
                  ? "Todos los países del catálogo ya están dados de alta."
                  : "Ningún país casa con lo escrito."
              }
            />
          )}
        </FormField>

        <section className="flex flex-col gap-2" aria-labelledby={tituloNivelesId}>
          <h3 id={tituloNivelesId} className="text-sm font-semibold">
            {titulo}
          </h3>
          <ListaReordenable<FilaDeNivel>
            elementos={filas}
            etiqueta={titulo}
            nombreDe={(f) => f.singular.trim() || `Nivel ${filas.indexOf(f) + 1}`}
            onReordenar={setFilas}
            pintarFila={(fila, indice) => (
              <FilaDeNivelAlta
                fila={fila}
                posicion={indice + 1}
                errores={erroresDeFila[fila.id]}
                quitable={indice === filas.length - 1 && filas.length > PAIS_NIVELES_MIN}
                onEditar={editar}
                onQuitar={() => setFilas((previas) => previas.slice(0, -1))}
              />
            )}
          />
          {filas.length < PAIS_NIVELES_MAX ? (
            <div>
              <Button
                type="button"
                variant="outline"
                className="min-h-11"
                onClick={() => setFilas((previas) => [...previas, nuevaFila()])}
              >
                <Plus aria-hidden="true" />
                Agregar nivel
              </Button>
            </div>
          ) : null}
          <p className="text-xs text-muted-foreground">
            <span className="font-medium text-foreground">Columnas del CSV: </span>
            <span className="font-mono">{equivalenciaEnVivo(filas)}</span>
          </p>
        </section>

        {erroresDeLista.length > 0 ? (
          <Alert variant="destructive">
            <AlertDescription>{erroresDeLista[0]}</AlertDescription>
          </Alert>
        ) : null}
      </form>

      <ConfirmarCambio<CrearPaisActionResult>
        open={pendiente !== null}
        onOpenChange={(abierto) => {
          if (!abierto) setPendiente(null);
        }}
        titulo="Dar de alta un país"
        descripcion="Los niveles se crean en este orden: el primero es el de más arriba."
        filas={
          pendiente === null
            ? []
            : [
                { etiqueta: "Código", antes: null, despues: pendiente.id },
                { etiqueta: "Nombre", antes: null, despues: pendiente.nombre },
                ...pendiente.tipos.map((t, i) => ({
                  etiqueta: columnaNivel(i + 1),
                  antes: null,
                  despues: `${t.singular} / ${t.plural}`,
                })),
              ]
        }
        confirmLabel="Sí, crear"
        // R54: `tipos` en el orden en pantalla; el nombre no viaja, lo pone el servidor (R23).
        accion={() =>
          pendiente === null
            ? Promise.resolve<CrearPaisActionResult>({ status: "error" })
            : crearPaisAction({ id: pendiente.id, tipos: pendiente.tipos })
        }
        onExito={alExito}
        onRechazo={alRechazar}
      />
    </Modal>
  );
}

function FilaDeNivelAlta({
  fila,
  posicion,
  errores,
  quitable,
  onEditar,
  onQuitar,
}: Readonly<{
  fila: FilaDeNivel;
  posicion: number;
  errores: ErroresDeFila | undefined;
  quitable: boolean;
  onEditar: (id: string, campo: "singular" | "plural", valor: string) => void;
  onQuitar: () => void;
}>) {
  return (
    <div className="flex items-start gap-2 py-1 pr-1">
      <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
        <FormField id={`${fila.id}-singular`} label={`Nivel ${posicion}, en singular`} error={errores?.singular} required>
          <Input
            value={fila.singular}
            maxLength={PAIS_NOMBRE_MAX}
            onChange={(e) => onEditar(fila.id, "singular", e.target.value)}
          />
        </FormField>
        <FormField id={`${fila.id}-plural`} label={`Nivel ${posicion}, en plural`} error={errores?.plural} required>
          <Input
            value={fila.plural}
            maxLength={PAIS_NOMBRE_MAX}
            onChange={(e) => onEditar(fila.id, "plural", e.target.value)}
          />
        </FormField>
      </div>
      {/* R62: solo la última fila se quita, y nunca por debajo de 2; quitar otra cambiaría la clave
          de las de debajo sin que se vea. Sin botón (no deshabilitado) para no ofrecer lo imposible. */}
      {quitable ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="mt-6 size-11 shrink-0"
          aria-label={`Quitar nivel ${posicion}`}
          onClick={onQuitar}
        >
          <X aria-hidden="true" />
        </Button>
      ) : null}
    </div>
  );
}

// ── Carga CSV (R24–R28, R30, R33, R48; P11) ──────────────────────────────────────────────────────

/** R30: la equivalencia de columnas del país elegido, `nivel_k`/`codigo_nivel_k` para k = 1..P. */
function equivalencias(niveles: readonly EtiquetaDeNivel[]): { columna: string; significa: string }[] {
  return niveles.flatMap(({ singular }, i) => [
    { columna: columnaNivel(i + 1), significa: singular },
    { columna: columnaCodigoNivel(i + 1), significa: `Código de ${singular.toLocaleLowerCase("es")} (opcional)` },
  ]);
}

function CargaDivisionCsv({
  paisId,
  paisNombre,
  niveles,
}: Readonly<{ paisId: string; paisNombre: string; niveles: readonly EtiquetaDeNivel[] }>) {
  const inputId = useId();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [resultado, setResultado] = useState<CargarDivisionActionResult | "fallo" | null>(null);

  function cargar(): Promise<CargarDivisionActionResult> {
    const datos = new FormData();
    datos.set("paisId", paisId);
    if (archivo !== null) datos.set("archivo", archivo);
    return cargarDivisionAction(datos);
  }

  function pedirConfirmacion(e: FormEvent) {
    e.preventDefault();
    if (archivo !== null) setConfirmando(true);
  }

  return (
    <section className="flex flex-col gap-3" aria-labelledby={`${inputId}-titulo`}>
      <h2 id={`${inputId}-titulo`} className="text-base font-semibold">
        Cargar CSV
      </h2>
      <p className="max-w-prose text-sm text-muted-foreground">
        Un archivo CSV en UTF-8, separado por comas, con estas columnas en la primera línea. Lo que ya
        existe no cambia; si una sola fila está mal, no se carga nada.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Columna</TableHead>
            <TableHead>Qué lleva</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {equivalencias(niveles).map(({ columna, significa }) => (
            <TableRow key={columna}>
              <TableCell className="font-mono text-xs">{columna}</TableCell>
              <TableCell>{significa}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <form className="flex flex-wrap items-end gap-3" onSubmit={pedirConfirmacion}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={inputId} className="text-sm font-medium">
            Archivo CSV
          </label>
          <Input
            id={inputId}
            type="file"
            accept=".csv"
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setResultado(null);
            }}
          />
        </div>
        <Button type="submit" className="min-h-11" disabled={archivo === null}>
          Cargar
        </Button>
      </form>

      {/* P11: antes, «—»; después, el archivo y el país. El resumen solo se sabe al cargar. */}
      <ConfirmarCambio<CargarDivisionActionResult>
        open={confirmando}
        onOpenChange={setConfirmando}
        titulo="Cargar la división"
        descripcion="Lo que ya existe no cambia; si una sola fila está mal, no se carga nada."
        filas={[
          { etiqueta: "Archivo", antes: null, despues: archivo?.name ?? "" },
          { etiqueta: "País", antes: null, despues: paisNombre },
        ]}
        confirmLabel="Sí, cargar"
        accion={cargar}
        onExito={setResultado}
        // `ErrorGenericoDeCambio` (la action lanzó) y `error` de la action se pintan igual: no se escribió nada.
        onRechazo={(res) => setResultado(res.status === "error" ? "fallo" : res)}
      />

      {resultado === null ? null : <ResultadoCarga resultado={resultado} niveles={niveles} />}
    </section>
  );
}

function ResultadoCarga({
  resultado,
  niveles,
}: Readonly<{ resultado: CargarDivisionActionResult | "fallo"; niveles: readonly EtiquetaDeNivel[] }>) {
  if (resultado === "fallo") {
    return <Avisar destructivo>No se pudo cargar el archivo. No se escribió nada.</Avisar>;
  }
  switch (resultado.status) {
    case "ok":
      return (
        <div role="status" className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Carga hecha. Altas:</p>
          <ul className="list-disc pl-5">
            {/* R33: `creados` llega por profundidad; cada una con el plural de su tipo. */}
            {niveles.map(({ plural }, i) => (
              <li key={`creados-${i + 1}`}>{`${plural}: ${resultado.creados[i + 1] ?? 0}`}</li>
            ))}
            <li>{`Ya existían: ${resultado.existentes}`}</li>
            <li>{`Códigos completados: ${resultado.codigosCompletados}`}</li>
          </ul>
          <ListaAvisos avisos={resultado.avisos} />
        </div>
      );
    case "invalido":
      return (
        <div role="alert" className="flex flex-col gap-1 rounded-md border border-destructive p-3 text-sm">
          <p className="font-medium">
            {`El archivo tiene ${resultado.total} ${resultado.total === 1 ? "error" : "errores"}. No se cargó nada.`}
          </p>
          <ul className="list-disc pl-5">
            {resultado.errores.map((error, i) => (
              <li key={`${i}-${error.linea}`}>{`Línea ${error.linea}: ${error.mensaje}`}</li>
            ))}
          </ul>
          {resultado.total > resultado.errores.length ? (
            <p className="text-muted-foreground">
              {`Se muestran los primeros ${resultado.errores.length}.`}
            </p>
          ) : null}
          <ListaAvisos avisos={resultado.avisos} />
        </div>
      );
    case "archivo_rechazado":
      return <Avisar destructivo>{`Archivo rechazado: ${resultado.motivo}`}</Avisar>;
    case "validation_error":
      return <Avisar destructivo>Falta el archivo o el país no es válido.</Avisar>;
    case "not_found":
      return <Avisar destructivo>El país ya no existe.</Avisar>;
    default:
      return <Avisar destructivo>{mensajeDeEstado(resultado.status, "No se pudo cargar el archivo. No se escribió nada.")}</Avisar>;
  }
}

function ListaAvisos({ avisos }: Readonly<{ avisos: string[] }>) {
  if (avisos.length === 0) return null;
  return (
    <ul className="list-disc pl-5 text-muted-foreground" aria-label="Avisos">
      {avisos.map((aviso) => (
        <li key={aviso}>{aviso}</li>
      ))}
    </ul>
  );
}

function Avisar({ destructivo = false, children }: Readonly<{ destructivo?: boolean; children: string }>) {
  return (
    <Alert variant={destructivo ? "destructive" : "default"}>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

/** Sesión y permiso tienen su mensaje; el resto, el de la operación. */
function mensajeDeEstado(status: string, porDefecto: string): string {
  if (status === "unauthenticated") return "Tu sesión expiró.";
  if (status === "forbidden") return "No tienes permiso para esta acción.";
  if (status === "not_found") return "El país ya no existe.";
  return porDefecto;
}
