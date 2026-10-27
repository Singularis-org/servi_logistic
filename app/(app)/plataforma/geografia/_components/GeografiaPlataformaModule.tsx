"use client";

import { useId, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";

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
  type CargarDivisionActionResult,
} from "@/lib/actions/geografia-plataforma";
import { PAISES_ISO_3166_1, type PaisDelCatalogo } from "@/lib/constants/paises-iso-3166-1";
import { COLUMNAS_DIVISION } from "@/lib/types/division-csv";
import type { ProvinciaPlataformaDTO } from "@/lib/types/geografia-nodo";
import {
  etiquetasDePais,
  PAIS_NOMBRE_MAX,
  type EtiquetasGeograficas,
  type NombresDeNivelesDePais,
  type PaisDTO,
} from "@/lib/types/pais";
import { normalizeName } from "@/lib/utils/normalize";

import { GeografiaAdminModule } from "./GeografiaAdminModule";

// SL-20 (design §8; R20, R23–R28, R42, R46, R47) — la geografía del superadmin, en cliente:
//   - el selector de país (todos los dados de alta, disponibles o no);
//   - «Nuevo país», con el país ELEGIDO del catálogo ISO 3166-1 y los seis nombres de nivel a mano;
//   - el interruptor «Disponible» del país elegido;
//   - la carga CSV de su división, con la equivalencia de columnas y los errores por línea;
//   - el árbol editable (`GeografiaAdminModule`).
//
// R20: los niveles se nombran con los nombres DEL PAÍS ELEGIDO (`etiquetasDePais`), no con los del
// provider: la sesión del superadmin no tiene empresa y ahí solo hay etiquetas neutras.

const RUTA = "/plataforma/geografia";

export interface GeografiaPlataformaModuleProps {
  /** Todos los países dados de alta, ordenados por nombre. */
  paises: PaisDTO[];
  /** El país cuya geografía se trabaja, o `null` si aún no hay ninguno. */
  paisElegido: PaisDTO | null;
  /** El árbol del país elegido, sin zonas. */
  provincias: ProvinciaPlataformaDTO[];
}

export function GeografiaPlataformaModule({
  paises,
  paisElegido,
  provincias,
}: Readonly<GeografiaPlataformaModuleProps>) {
  const router = useRouter();
  const [altaAbierta, setAltaAbierta] = useState(false);
  const etiquetas = paisElegido === null ? null : etiquetasDePais(paisElegido);

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3" aria-labelledby="geografia-pais-titulo">
        <h2 id="geografia-pais-titulo" className="text-base font-semibold">
          País
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {paises.length > 0 && paisElegido !== null ? (
            <Select
              className="max-w-xs"
              aria-label="País"
              value={paisElegido.id}
              onValueChange={(id) => {
                if (id !== "") router.push(`${RUTA}?pais=${encodeURIComponent(id)}`);
              }}
              options={paises.map((p) => ({ value: p.id, label: `${p.nombre} (${p.id})` }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Aún no hay ningún país dado de alta.</p>
          )}
          <Button type="button" variant="outline" onClick={() => setAltaAbierta(true)}>
            <Plus aria-hidden="true" />
            Nuevo país
          </Button>
        </div>

        {paisElegido !== null ? (
          <InterruptorDisponible key={paisElegido.id} pais={paisElegido} onCambio={() => router.refresh()} />
        ) : null}
      </section>

      <NuevoPaisDialog
        open={altaAbierta}
        onOpenChange={setAltaAbierta}
        onCreado={(id) => router.push(`${RUTA}?pais=${encodeURIComponent(id)}`)}
      />

      {paisElegido !== null && etiquetas !== null ? (
        <>
          <CargaDivisionCsv
            key={`csv-${paisElegido.id}`}
            paisId={paisElegido.id}
            etiquetas={etiquetas}
            onCargada={() => router.refresh()}
          />
          <GeografiaAdminModule
            key={`arbol-${paisElegido.id}`}
            paisId={paisElegido.id}
            paisNombre={paisElegido.nombre}
            etiquetas={etiquetas}
            initialProvincias={provincias}
          />
        </>
      ) : null}
    </div>
  );
}

// ── Disponibilidad (R47) ─────────────────────────────────────────────────────────────────────────

/**
 * R47: enciende o apaga la cobertura del país. R46: apagarlo no toca a sus empresas; el aviso lo
 * dice junto al control y es su descripción accesible.
 */
function InterruptorDisponible({
  pais,
  onCambio,
}: Readonly<{ pais: PaisDTO; onCambio: () => void }>) {
  const toast = useToast();
  const avisoId = useId();
  const [disponible, setDisponible] = useState(pais.disponible);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(siguiente: boolean) {
    setGuardando(true);
    try {
      const res = await cambiarDisponibilidadPaisAction({ id: pais.id, disponible: siguiente });
      if (res.status === "ok") {
        setDisponible(res.disponible);
        toast.success(
          res.disponible
            ? `${pais.nombre} ya se ofrece en el alta de empresas.`
            : `${pais.nombre} ya no se ofrece en el alta de empresas nuevas.`,
        );
        onCambio();
        return;
      }
      toast.error(mensajeDeEstado(res.status, "No se pudo cambiar la disponibilidad del país."));
    } catch {
      toast.error("No se pudo cambiar la disponibilidad del país.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <Switch
          checked={disponible}
          disabled={guardando}
          aria-label={`Disponible: ${pais.nombre}`}
          aria-describedby={avisoId}
          onCheckedChange={(siguiente) => void cambiar(siguiente)}
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
    </div>
  );
}

// ── Alta de país (R23, R41, R42) ─────────────────────────────────────────────────────────────────

const CAMPOS_DE_NIVEL: readonly { campo: keyof NombresDeNivelesDePais; etiqueta: string; pista: string }[] = [
  { campo: "nivel1Singular", etiqueta: "Nivel 1, en singular", pista: "Cómo se llama una unidad del primer nivel." },
  { campo: "nivel1Plural", etiqueta: "Nivel 1, en plural", pista: "El mismo nombre, en plural." },
  { campo: "nivel2Singular", etiqueta: "Nivel 2, en singular", pista: "Cómo se llama una unidad del segundo nivel." },
  { campo: "nivel2Plural", etiqueta: "Nivel 2, en plural", pista: "El mismo nombre, en plural." },
  { campo: "nivel3Singular", etiqueta: "Nivel 3, en singular", pista: "Cómo se llama una unidad del tercer nivel." },
  { campo: "nivel3Plural", etiqueta: "Nivel 3, en plural", pista: "El mismo nombre, en plural." },
];

const NIVELES_VACIOS: NombresDeNivelesDePais = {
  nivel1Singular: "",
  nivel1Plural: "",
  nivel2Singular: "",
  nivel2Plural: "",
  nivel3Singular: "",
  nivel3Plural: "",
};

/** R42: busca por nombre (sin acentos ni mayúsculas) o por código. */
function casaPais(pais: PaisDelCatalogo, consulta: string): boolean {
  const q = normalizeName(consulta);
  if (q === "") return true;
  return normalizeName(pais.nombre).includes(q) || pais.id.toLowerCase().startsWith(q);
}

function etiquetaDePais(pais: PaisDelCatalogo): string {
  return `${pais.nombre} (${pais.id})`;
}

function NuevoPaisDialog({
  open,
  onOpenChange,
  onCreado,
}: Readonly<{ open: boolean; onOpenChange: (open: boolean) => void; onCreado: (id: string) => void }>) {
  const toast = useToast();
  const [pais, setPais] = useState<PaisDelCatalogo | null>(null);
  const [niveles, setNiveles] = useState<NombresDeNivelesDePais>(NIVELES_VACIOS);
  const [errores, setErrores] = useState<Record<string, string[]>>({});

  function reiniciar() {
    setPais(null);
    setNiveles(NIVELES_VACIOS);
    setErrores({});
  }

  async function guardar() {
    const faltan: Record<string, string[]> = {};
    if (pais === null) faltan.id = ["Elige un país de la lista."];
    for (const { campo } of CAMPOS_DE_NIVEL) {
      if (niveles[campo].trim() === "") faltan[campo] = ["Este campo es obligatorio."];
    }
    if (pais === null || Object.keys(faltan).length > 0) {
      setErrores(faltan);
      return;
    }

    try {
      // El nombre NO viaja: lo pone el servidor desde el catálogo (R23). Solo el código elegido.
      const res = await crearPaisAction({ id: pais.id, ...niveles });
      if (res.status === "ok") {
        toast.success(`${res.pais.nombre} dado de alta.`);
        reiniciar();
        onOpenChange(false);
        onCreado(res.pais.id);
        return;
      }
      if (res.status === "validation_error") {
        setErrores(res.fieldErrors);
        return;
      }
      if (res.status === "conflict") {
        setErrores({ id: ["Ese país ya está dado de alta."] });
        return;
      }
      toast.error(mensajeDeEstado(res.status, "No se pudo dar de alta el país."));
    } catch {
      toast.error("No se pudo dar de alta el país.");
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    void guardar();
  }

  return (
    <Modal
      open={open}
      onOpenChange={(abierta) => {
        if (!abierta) reiniciar();
        onOpenChange(abierta);
      }}
      title="Nuevo país"
      description="Elige el país de la lista y escribe cómo llama a cada uno de sus tres niveles."
      confirmLabel="Dar de alta"
      cancelLabel="Cancelar"
      closeOnConfirm={false}
      onConfirm={guardar}
      size="lg"
    >
      <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
        <FormField id="nuevo-pais-id" label="País" error={errores.id ?? errores.nombre} required>
          {(control) => (
            <Combobox<PaisDelCatalogo>
              {...control}
              items={PAISES_ISO_3166_1}
              value={pais}
              onValueChange={setPais}
              itemToLabel={etiquetaDePais}
              itemKey={(p) => p.id}
              filter={casaPais}
              placeholder="Busca por nombre o por código"
              emptyText="Ningún país casa con lo escrito."
            />
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          {CAMPOS_DE_NIVEL.map(({ campo, etiqueta, pista }) => (
            <FormField
              key={campo}
              id={`nuevo-pais-${campo}`}
              label={etiqueta}
              hint={pista}
              error={errores[campo]}
              required
            >
              <Input
                value={niveles[campo]}
                maxLength={PAIS_NOMBRE_MAX}
                onChange={(e) => setNiveles((previos) => ({ ...previos, [campo]: e.target.value }))}
              />
            </FormField>
          ))}
        </div>
        {errores.entrada?.length ? (
          <Alert variant="destructive">
            <AlertDescription>{errores.entrada[0]}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </Modal>
  );
}

// ── Carga CSV (R24–R28, R48) ─────────────────────────────────────────────────────────────────────

/** La equivalencia de columnas del país elegido (design §6). */
function equivalencias(etiquetas: EtiquetasGeograficas): { columna: string; significa: string }[] {
  const niveles = [etiquetas.provincia.singular, etiquetas.canton.singular, etiquetas.distrito.singular];
  return COLUMNAS_DIVISION.map((columna, i) => {
    const nivel = niveles[Math.floor(i / 2)];
    return { columna, significa: i % 2 === 0 ? nivel : `Código de ${nivel.toLocaleLowerCase("es")} (opcional)` };
  });
}

function CargaDivisionCsv({
  paisId,
  etiquetas,
  onCargada,
}: Readonly<{ paisId: string; etiquetas: EtiquetasGeograficas; onCargada: () => void }>) {
  const inputId = useId();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [cargando, setCargando] = useState(false);
  const [resultado, setResultado] = useState<CargarDivisionActionResult | "fallo" | null>(null);

  async function cargar(e: FormEvent) {
    e.preventDefault();
    if (archivo === null) return;
    const datos = new FormData();
    datos.set("paisId", paisId);
    datos.set("archivo", archivo);
    setCargando(true);
    try {
      const res = await cargarDivisionAction(datos);
      setResultado(res);
      if (res.status === "ok") onCargada();
    } catch {
      setResultado("fallo");
    } finally {
      setCargando(false);
    }
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
          {equivalencias(etiquetas).map(({ columna, significa }) => (
            <TableRow key={columna}>
              <TableCell className="font-mono text-xs">{columna}</TableCell>
              <TableCell>{significa}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => void cargar(e)}>
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
        <Button type="submit" disabled={archivo === null} loading={cargando}>
          {cargando ? "Cargando…" : "Cargar"}
        </Button>
      </form>

      {resultado === null ? null : <ResultadoCarga resultado={resultado} etiquetas={etiquetas} />}
    </section>
  );
}

function ResultadoCarga({
  resultado,
  etiquetas,
}: Readonly<{ resultado: CargarDivisionActionResult | "fallo"; etiquetas: EtiquetasGeograficas }>) {
  if (resultado === "fallo") {
    return <Avisar destructivo>No se pudo cargar el archivo. No se escribió nada.</Avisar>;
  }
  switch (resultado.status) {
    case "ok":
      return (
        <div role="status" className="flex flex-col gap-1 rounded-md border border-border p-3 text-sm">
          <p className="font-medium">Carga hecha. Altas:</p>
          <ul className="list-disc pl-5">
            <li>{`${etiquetas.provincia.plural}: ${resultado.creados.provincia}`}</li>
            <li>{`${etiquetas.canton.plural}: ${resultado.creados.canton}`}</li>
            <li>{`${etiquetas.distrito.plural}: ${resultado.creados.distrito}`}</li>
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
