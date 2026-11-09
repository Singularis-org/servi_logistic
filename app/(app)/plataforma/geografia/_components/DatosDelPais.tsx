"use client";

import { useId, useState, type FormEvent } from "react";
import { Pencil, Plus } from "lucide-react";

import { EmptyState } from "@/components/shared/EmptyState";
import { FormField, type FormFieldControlProps } from "@/components/shared/FormField";
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
  actualizarDatosPaisAction,
  cambiarActivoTipoDocumentoAction,
  crearTipoDocumentoAction,
  editarTipoDocumentoAction,
} from "@/lib/actions/geografia-plataforma";
import {
  CARACTERES_DOCUMENTO,
  DIGITOS_NACIONALES_MAX,
  DIGITOS_NACIONALES_MIN,
  DOCUMENTO_LARGO_MAX,
  PAIS_NOMBRE_MAX,
  type PaisDTO,
  type TipoDocumentoDTO,
} from "@/lib/types/pais";
import { normalizeName } from "@/lib/utils/normalize";

// SLT-81 (design §5, §6; R2, R3, R8, R10, R11, R13, R15, R26) — la sección «Datos del país» de
// Plataforma › Geografía: prefijo, dígitos nacionales, zona horaria y los tipos de documento del
// país elegido, con su edición.
//
// La lista de zonas y el prefijo oficial llegan por props desde el servidor (`page.tsx`): así lo que
// ofrece la pantalla y lo que acepta `PaisService` salen del mismo runtime y de la misma
// libphonenumber, aunque el navegador tenga otra tzdata.

type Caracteres = (typeof CARACTERES_DOCUMENTO)[number];

const OBLIGATORIO = "Este campo es obligatorio.";
const ZONA_OBLIGATORIA = "Elige una zona horaria de la lista.";

export const ETIQUETA_CARACTERES: Record<Caracteres, string> = {
  digitos: "Solo dígitos",
  alfanumerico: "Letras y dígitos",
};

const OPCIONES_CARACTERES = CARACTERES_DOCUMENTO.map((c) => ({ value: c, label: ETIQUETA_CARACTERES[c] }));

export interface DatosDelPaisProps {
  pais: PaisDTO;
  /** Todos los tipos del país, activos e inactivos, por `orden` (R2). */
  tipos: TipoDocumentoDTO[];
  /** No se pudieron leer los tipos: `tipos` llega vacío por el fallo, no porque no haya ninguno. */
  tiposError?: boolean;
  /** Las zonas IANA que acepta el servidor (R8). */
  zonas: readonly string[];
  /** El prefijo oficial del país según libphonenumber, o `null` si no lo conoce (R26). */
  prefijoOficial: string | null;
  /** Tras un cambio guardado: la página vuelve a leer del servidor. */
  onCambio: () => void;
}

/** R3: lo que le falta al país para estar completo, en el orden de la pantalla. */
function datosQueFaltan(pais: PaisDTO, tipos: TipoDocumentoDTO[], tiposError: boolean): string[] {
  const faltan: string[] = [];
  if (pais.prefijoTelefonico === null) faltan.push("prefijo telefónico");
  if (pais.telefonoDigitosNacionales === null) faltan.push("dígitos nacionales");
  if (pais.zonaHoraria === null) faltan.push("zona horaria");
  // Sin la lista no se sabe si falta: decirlo sería un fallo disfrazado de dato.
  if (!tiposError && !tipos.some((t) => t.activo)) faltan.push("tipo de documento activo");
  return faltan;
}

function largoDe(tipo: Pick<TipoDocumentoDTO, "largoMin" | "largoMax">): string {
  return tipo.largoMin === tipo.largoMax ? `${tipo.largoMin}` : `${tipo.largoMin} a ${tipo.largoMax}`;
}

/** Sesión y permiso tienen su mensaje; el resto, el de la operación. */
function mensajeDeEstado(status: string, porDefecto: string): string {
  if (status === "unauthenticated") return "Tu sesión expiró.";
  if (status === "forbidden") return "No tienes permiso para esta acción.";
  if (status === "not_found") return "Ya no existe: recarga la página.";
  return porDefecto;
}

export function DatosDelPais({
  pais,
  tipos,
  tiposError = false,
  zonas,
  prefijoOficial,
  onCambio,
}: Readonly<DatosDelPaisProps>) {
  const tituloId = useId();
  const [editandoDatos, setEditandoDatos] = useState(false);
  /** `null` = cerrado; `"nuevo"` = alta; un tipo = su edición. */
  const [tipoAbierto, setTipoAbierto] = useState<TipoDocumentoDTO | "nuevo" | null>(null);
  const [avisoTipos, setAvisoTipos] = useState<string | null>(null);
  const faltan = datosQueFaltan(pais, tipos, tiposError);

  return (
    <section className="flex flex-col gap-3" aria-labelledby={tituloId}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={tituloId} className="text-base font-semibold">
          Datos del país
        </h2>
        <Button type="button" variant="outline" onClick={() => setEditandoDatos(true)}>
          <Pencil aria-hidden="true" />
          Editar teléfono y hora
        </Button>
      </div>

      {faltan.length > 0 ? (
        // Estado de la carga, no un aviso que interrumpe: `note`, no `alert`.
        <Alert role="note">
          <AlertDescription>{`Datos incompletos: falta ${faltan.join(", ")}.`}</AlertDescription>
        </Alert>
      ) : null}

      <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="font-medium">Prefijo telefónico</dt>
        <dd>{pais.prefijoTelefonico === null ? "Sin cargar" : `+${pais.prefijoTelefonico}`}</dd>
        <dt className="font-medium">Dígitos nacionales</dt>
        <dd>{pais.telefonoDigitosNacionales === null ? "Sin cargar" : `${pais.telefonoDigitosNacionales}`}</dd>
        <dt className="font-medium">Zona horaria</dt>
        <dd>{pais.zonaHoraria ?? "Sin cargar"}</dd>
      </dl>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Tipos de documento</h3>
        <Button type="button" variant="outline" onClick={() => setTipoAbierto("nuevo")}>
          <Plus aria-hidden="true" />
          Nuevo tipo
        </Button>
      </div>

      {tiposError ? (
        <Alert variant="destructive">
          <AlertDescription>No se pudieron cargar los tipos de documento del país.</AlertDescription>
        </Alert>
      ) : tipos.length === 0 ? (
        <div className="rounded-md border border-border">
          <EmptyState
            title="Este país aún no tiene tipos de documento."
            description="Agrega al menos uno activo: sin él, el país no está completo."
          />
        </div>
      ) : (
        // R13: cada fila se edita y se activa o desactiva; no hay acción de borrar.
        <Table aria-label={`Tipos de documento de ${pais.nombre}`}>
          <TableHeader>
            <TableRow>
              <TableHead>Documento</TableHead>
              <TableHead>Caracteres</TableHead>
              <TableHead>Largo</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>
                <span className="sr-only">Acciones</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {tipos.map((tipo) => (
              <TableRow key={tipo.id}>
                <TableCell>{tipo.nombre}</TableCell>
                <TableCell>{ETIQUETA_CARACTERES[tipo.caracteres]}</TableCell>
                <TableCell>{largoDe(tipo)}</TableCell>
                <TableCell>
                  <InterruptorActivo
                    // Tras `router.refresh` el estado vuelve a salir del servidor.
                    key={`${tipo.id}-${tipo.activo}`}
                    tipo={tipo}
                    onAviso={setAvisoTipos}
                    onCambio={onCambio}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={`Editar ${tipo.nombre}`}
                    onClick={() => setTipoAbierto(tipo)}
                  >
                    <Pencil aria-hidden="true" />
                    Editar
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {avisoTipos === null ? null : (
        <Alert variant="destructive">
          <AlertDescription>{avisoTipos}</AlertDescription>
        </Alert>
      )}

      {editandoDatos ? (
        <EditarTelefonoYHora
          pais={pais}
          zonas={zonas}
          prefijoOficial={prefijoOficial}
          onCerrar={() => setEditandoDatos(false)}
          onCambio={onCambio}
        />
      ) : null}

      {tipoAbierto === null ? null : (
        <TipoDocumentoDialog
          paisId={pais.id}
          tipo={tipoAbierto === "nuevo" ? null : tipoAbierto}
          onCerrar={() => setTipoAbierto(null)}
          onCambio={onCambio}
        />
      )}
    </section>
  );
}

// ── Zona horaria (R8) ────────────────────────────────────────────────────────────────────────────

/** «costa rica» casa con `America/Costa_Rica`: sin mayúsculas, acentos, `_` ni `/`. */
function textoDeZona(texto: string): string {
  return normalizeName(texto.replace(/[_/]/g, " "));
}

function casaZona(zona: string, consulta: string): boolean {
  const q = textoDeZona(consulta);
  return q === "" || textoDeZona(zona).includes(q);
}

/** R8: solo ofrece las zonas de la lista del servidor y las busca por texto. */
export function ZonaHorariaCombobox({
  zonas,
  value,
  onValueChange,
  control,
}: Readonly<{
  zonas: readonly string[];
  value: string | null;
  onValueChange: (zona: string | null) => void;
  control: FormFieldControlProps;
}>) {
  return (
    <Combobox<string>
      {...control}
      items={zonas}
      value={value}
      onValueChange={onValueChange}
      itemToLabel={(z) => z}
      itemKey={(z) => z}
      filter={casaZona}
      placeholder="Busca por ciudad o región"
      emptyText="Ninguna zona casa con lo escrito."
    />
  );
}

// ── Teléfono y hora (R7, R8, R10, R11, R26) ──────────────────────────────────────────────────────

type Paso = { tipo: "datos" } | { tipo: "confirmar"; empresas: number };

function EditarTelefonoYHora({
  pais,
  zonas,
  prefijoOficial,
  onCerrar,
  onCambio,
}: Readonly<{
  pais: PaisDTO;
  zonas: readonly string[];
  prefijoOficial: string | null;
  onCerrar: () => void;
  onCambio: () => void;
}>) {
  const toast = useToast();
  // R26: el formulario propone el oficial, aunque el guardado sea otro (el aviso lo explica).
  const [prefijo, setPrefijo] = useState(prefijoOficial ?? pais.prefijoTelefonico ?? "");
  const [digitos, setDigitos] = useState(
    pais.telefonoDigitosNacionales === null ? "" : `${pais.telefonoDigitosNacionales}`,
  );
  const [zona, setZona] = useState<string | null>(pais.zonaHoraria);
  const [errores, setErrores] = useState<Record<string, string[]>>({});
  const [paso, setPaso] = useState<Paso>({ tipo: "datos" });

  const prefijoDistinto =
    prefijoOficial !== null && pais.prefijoTelefonico !== null && pais.prefijoTelefonico !== prefijoOficial;

  async function guardar() {
    const faltan: Record<string, string[]> = {};
    if (prefijo.trim() === "") faltan.prefijoTelefonico = [OBLIGATORIO];
    if (digitos.trim() === "") faltan.telefonoDigitosNacionales = [OBLIGATORIO];
    if (zona === null) faltan.zonaHoraria = [ZONA_OBLIGATORIA];
    if (zona === null || Object.keys(faltan).length > 0) {
      setErrores(faltan);
      setPaso({ tipo: "datos" });
      return;
    }

    try {
      const res = await actualizarDatosPaisAction({
        id: pais.id,
        prefijoTelefonico: prefijo.trim(),
        telefonoDigitosNacionales: Number(digitos),
        zonaHoraria: zona,
        // R10: el número que el superadmin vio y confirmó; si cambió, el servidor vuelve a preguntar.
        ...(paso.tipo === "confirmar" ? { empresasConfirmadas: paso.empresas } : {}),
      });
      switch (res.status) {
        case "ok":
          toast.success(res.cambiado ? `Datos de ${pais.nombre} guardados.` : "No había nada que cambiar.");
          onCerrar();
          if (res.cambiado) onCambio();
          return;
        case "requiere_confirmacion":
          setPaso({ tipo: "confirmar", empresas: res.empresas });
          return;
        case "validation_error":
          setErrores(res.fieldErrors);
          setPaso({ tipo: "datos" });
          return;
        default:
          toast.error(mensajeDeEstado(res.status, "No se pudieron guardar los datos del país."));
      }
    } catch {
      toast.error("No se pudieron guardar los datos del país.");
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    void guardar();
  }

  return (
    <Modal
      open
      onOpenChange={(abierta) => {
        if (!abierta) onCerrar();
      }}
      title={`Teléfono y hora de ${pais.nombre}`}
      description={
        paso.tipo === "datos"
          ? "Rigen desde que se guardan para todas las empresas del país; lo ya guardado no cambia."
          : undefined
      }
      confirmLabel={paso.tipo === "datos" ? "Guardar" : "Confirmar cambio"}
      cancelLabel="Cancelar"
      closeOnConfirm={false}
      onConfirm={guardar}
      size="md"
    >
      {paso.tipo === "confirmar" ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">
            {`Este cambio afecta a ${paso.empresas} ${paso.empresas === 1 ? "empresa" : "empresas"} de ${pais.nombre}. Rige desde ahora; lo ya guardado no cambia.`}
          </p>
          <div>
            <Button type="button" variant="outline" onClick={() => setPaso({ tipo: "datos" })}>
              Volver a editar
            </Button>
          </div>
        </div>
      ) : (
        <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
          <FormField
            id="datos-pais-prefijo"
            label="Prefijo telefónico"
            hint={
              prefijoOficial === null
                ? "No hay prefijo oficial conocido para este país."
                : `Sin «+». El oficial de ${pais.nombre} es +${prefijoOficial}.`
            }
            error={errores.prefijoTelefonico}
            required
          >
            <Input inputMode="numeric" value={prefijo} maxLength={3} onChange={(e) => setPrefijo(e.target.value)} />
          </FormField>
          {prefijoDistinto ? (
            <Alert role="note">
              <AlertDescription>
                {`El prefijo guardado (+${pais.prefijoTelefonico}) no es el oficial (+${prefijoOficial}).`}
              </AlertDescription>
            </Alert>
          ) : null}
          <FormField
            id="datos-pais-digitos"
            label="Dígitos nacionales"
            hint={`Cuántos dígitos tiene un número sin el prefijo (de ${DIGITOS_NACIONALES_MIN} a ${DIGITOS_NACIONALES_MAX}).`}
            error={errores.telefonoDigitosNacionales}
            required
          >
            <Input
              type="number"
              inputMode="numeric"
              min={DIGITOS_NACIONALES_MIN}
              max={DIGITOS_NACIONALES_MAX}
              value={digitos}
              onChange={(e) => setDigitos(e.target.value)}
            />
          </FormField>
          <FormField id="datos-pais-zona" label="Zona horaria" error={errores.zonaHoraria} required>
            {(control) => <ZonaHorariaCombobox zonas={zonas} value={zona} onValueChange={setZona} control={control} />}
          </FormField>
          {errores.entrada?.length ? (
            <Alert variant="destructive">
              <AlertDescription>{errores.entrada[0]}</AlertDescription>
            </Alert>
          ) : null}
        </form>
      )}
    </Modal>
  );
}

// ── Tipos de documento (R9, R13, R15) ────────────────────────────────────────────────────────────

/**
 * R13, R15: activar o desactivar un tipo. El interruptor solo cambia cuando el servidor lo acepta:
 * si rechaza (p. ej. el único activo del país), se queda donde estaba y la sección dice por qué.
 */
function InterruptorActivo({
  tipo,
  onAviso,
  onCambio,
}: Readonly<{ tipo: TipoDocumentoDTO; onAviso: (aviso: string | null) => void; onCambio: () => void }>) {
  const [activo, setActivo] = useState(tipo.activo);
  const [guardando, setGuardando] = useState(false);

  async function cambiar(siguiente: boolean) {
    setGuardando(true);
    onAviso(null);
    try {
      const res = await cambiarActivoTipoDocumentoAction({ id: tipo.id, activo: siguiente });
      if (res.status === "ok") {
        setActivo(res.tipo.activo);
        onCambio();
        return;
      }
      if (res.status === "validation_error") {
        const primero = Object.values(res.fieldErrors).find((m) => m.length > 0)?.[0];
        onAviso(res.fieldErrors.activo?.[0] ?? primero ?? "No se pudo cambiar el estado del tipo.");
        return;
      }
      onAviso(mensajeDeEstado(res.status, "No se pudo cambiar el estado del tipo."));
    } catch {
      onAviso("No se pudo cambiar el estado del tipo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <Switch
        checked={activo}
        disabled={guardando}
        aria-label={`Activo: ${tipo.nombre}`}
        onCheckedChange={(siguiente) => void cambiar(siguiente)}
      />
      <span aria-hidden="true" className="text-sm">
        {activo ? "Activo" : "Inactivo"}
      </span>
    </div>
  );
}

/** Los campos de un tipo tal como se escriben (los largos, texto del input). */
export interface BorradorTipo {
  nombre: string;
  caracteres: Caracteres;
  largoMin: string;
  largoMax: string;
}

export const BORRADOR_TIPO_VACIO: BorradorTipo = { nombre: "", caracteres: "digitos", largoMin: "", largoMax: "" };

/** Lo que falta en el borrador, con las claves de zod (`<prefijo>nombre`, …). */
export function faltanEnTipo(t: BorradorTipo, prefijo: string): Record<string, string[]> {
  const faltan: Record<string, string[]> = {};
  if (t.nombre.trim() === "") faltan[`${prefijo}nombre`] = [OBLIGATORIO];
  if (t.largoMin.trim() === "") faltan[`${prefijo}largoMin`] = [OBLIGATORIO];
  if (t.largoMax.trim() === "") faltan[`${prefijo}largoMax`] = [OBLIGATORIO];
  return faltan;
}

export function tipoDesdeBorrador(t: BorradorTipo) {
  return {
    nombre: t.nombre.trim(),
    caracteres: t.caracteres,
    largoMin: Number(t.largoMin),
    largoMax: Number(t.largoMax),
  };
}

/**
 * Los cuatro campos de un tipo. Lo usan el diálogo de un tipo y cada fila de «Nuevo país»; `id`
 * distingue los controles y `prefijoError` casa con las claves de zod del servidor.
 */
export function CamposDeTipo({
  id,
  valor,
  onCambio,
  errores,
  prefijoError = "",
}: Readonly<{
  id: string;
  valor: BorradorTipo;
  onCambio: (valor: BorradorTipo) => void;
  errores: Record<string, string[]>;
  prefijoError?: string;
}>) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <FormField
        id={`${id}-nombre`}
        label="Documento"
        hint="Cómo lo llama la gente: «Cédula», «Pasaporte»…"
        error={errores[`${prefijoError}nombre`]}
        required
      >
        <Input
          value={valor.nombre}
          maxLength={PAIS_NOMBRE_MAX}
          onChange={(e) => onCambio({ ...valor, nombre: e.target.value })}
        />
      </FormField>
      <FormField id={`${id}-caracteres`} label="Caracteres" error={errores[`${prefijoError}caracteres`]} required>
        {(control) => (
          <Select
            id={control.id}
            aria-invalid={control["aria-invalid"]}
            aria-describedby={control["aria-describedby"]}
            value={valor.caracteres}
            onValueChange={(c) => {
              if (c === "digitos" || c === "alfanumerico") onCambio({ ...valor, caracteres: c });
            }}
            options={OPCIONES_CARACTERES}
          />
        )}
      </FormField>
      <FormField id={`${id}-largo-min`} label="Largo mínimo" error={errores[`${prefijoError}largoMin`]} required>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={DOCUMENTO_LARGO_MAX}
          value={valor.largoMin}
          onChange={(e) => onCambio({ ...valor, largoMin: e.target.value })}
        />
      </FormField>
      <FormField id={`${id}-largo-max`} label="Largo máximo" error={errores[`${prefijoError}largoMax`]} required>
        <Input
          type="number"
          inputMode="numeric"
          min={1}
          max={DOCUMENTO_LARGO_MAX}
          value={valor.largoMax}
          onChange={(e) => onCambio({ ...valor, largoMax: e.target.value })}
        />
      </FormField>
    </div>
  );
}

/** R13: «Nuevo tipo» y «Editar» abren el mismo diálogo. */
function TipoDocumentoDialog({
  paisId,
  tipo,
  onCerrar,
  onCambio,
}: Readonly<{ paisId: string; tipo: TipoDocumentoDTO | null; onCerrar: () => void; onCambio: () => void }>) {
  const toast = useToast();
  const [valor, setValor] = useState<BorradorTipo>(
    tipo === null
      ? BORRADOR_TIPO_VACIO
      : { nombre: tipo.nombre, caracteres: tipo.caracteres, largoMin: `${tipo.largoMin}`, largoMax: `${tipo.largoMax}` },
  );
  const [errores, setErrores] = useState<Record<string, string[]>>({});

  async function guardar() {
    const faltan = faltanEnTipo(valor, "");
    if (Object.keys(faltan).length > 0) {
      setErrores(faltan);
      return;
    }
    const datos = tipoDesdeBorrador(valor);
    try {
      const res =
        tipo === null
          ? await crearTipoDocumentoAction({ paisId, ...datos })
          : await editarTipoDocumentoAction({ id: tipo.id, ...datos });
      if (res.status === "ok") {
        toast.success(`«${res.tipo.nombre}» guardado.`);
        onCerrar();
        onCambio();
        return;
      }
      if (res.status === "validation_error") {
        setErrores(res.fieldErrors);
        return;
      }
      if (res.status === "conflict") {
        setErrores({ nombre: ["Ya hay un tipo con ese nombre en este país."] });
        return;
      }
      toast.error(mensajeDeEstado(res.status, "No se pudo guardar el tipo de documento."));
    } catch {
      toast.error("No se pudo guardar el tipo de documento.");
    }
  }

  function enviar(e: FormEvent) {
    e.preventDefault();
    void guardar();
  }

  return (
    <Modal
      open
      onOpenChange={(abierta) => {
        if (!abierta) onCerrar();
      }}
      title={tipo === null ? "Nuevo tipo de documento" : `Editar ${tipo.nombre}`}
      description="La regla nueva se exige desde ahora; los documentos ya guardados no se revalidan."
      confirmLabel="Guardar"
      cancelLabel="Cancelar"
      closeOnConfirm={false}
      onConfirm={guardar}
      size="lg"
    >
      <form className="flex flex-col gap-4" onSubmit={enviar} noValidate>
        <CamposDeTipo id="tipo-documento" valor={valor} onCambio={setValor} errores={errores} />
        {errores.entrada?.length ? (
          <Alert variant="destructive">
            <AlertDescription>{errores.entrada[0]}</AlertDescription>
          </Alert>
        ) : null}
      </form>
    </Modal>
  );
}
