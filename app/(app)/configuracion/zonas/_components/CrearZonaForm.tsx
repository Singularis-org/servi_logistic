"use client";

import { useMemo, useRef, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { FieldError } from "@/components/shared/FieldError";
import { FormField } from "@/components/shared/FormField";
import { Modal } from "@/components/shared/Modal";
import { useToast } from "@/hooks/useToast";
import {
  actualizarZonaSchema,
  crearZonaSchema,
  type ImpactoAsignacionDTO,
  type ZonaActionError,
  type ZonaDTO,
} from "@/lib/types/zona";
import {
  crearZona,
  actualizarZona,
  impactoAsignacionZona,
  impactoZonaCentral,
} from "@/lib/actions/zonas";
import type { ArbolDeZonasDTO } from "@/lib/types/geografia-nodo";

import { GeografiaSelector } from "./GeografiaSelector";
import {
  diferencia,
  distritosBajo,
  indexarArbol,
  PROFUNDIDAD_DE_DISTRITO,
  repartirPorProfundidad,
  type NodoIndexado,
  type NodosRepartidos,
} from "./seleccion-de-zona";

type FieldErrors = Record<string, string[]>;

/**
 * ⭑ FICHA 376 (R20/R21) — LA CONFIRMACIÓN PENDIENTE DE MOVER LA MARCA DE ZONA CENTRAL.
 *
 * Dos direcciones. `marcar` es la que ya existía: esta zona GANA la marca y otra la pierde sin
 * aparecer en ningún payload (R21). `desmarcar` es la que faltaba: la zona que HOY es la central se
 * queda sin ella y el sistema se quedaría sin ninguna (R20).
 *
 * SLT-89 (design §8.2): ya no es un modal propio sino un BLOQUE del modal único de guardado, con su
 * texto y su impacto sin cambios.
 *
 * ⚠️ El formulario NO decide: AVISA. Confirmar en `desmarcar` ENVÍA el guardado y el servidor lo
 * rechaza (R5), y ese rechazo se pinta junto a la casilla (R23). La regla vive en UN solo sitio
 * —el servidor—; duplicarla aquí como un `if` que impida enviar sería una segunda copia que un
 * día divergiría (design.md §8 y Q2).
 */
type ConfirmacionCentral =
  | { tipo: "marcar"; pierde: ZonaDTO }
  | { tipo: "desmarcar"; nombreZona: string };

/**
 * ⭑ FICHA 376 (Q4) — el impacto en órdenes de mover la marca, tal como lo ve el modal.
 *
 * `cargando` y `sin_dato` NO son lo mismo que cero: «no afecta a ninguna» y «no lo pude contar»
 * tienen que verse distintos en una confirmación que decide una tarifa.
 */
type ImpactoCentral =
  | { fase: "cargando" }
  | { fase: "listo"; ordenes: number }
  | { fase: "sin_dato" };

/**
 * SLT-89 (R13) — el aviso de impacto de cambiar los lugares. A diferencia del de la marca, un fallo
 * NO desbloquea «Confirmar»: R13 pide no confirmar sin las cifras. Se ofrece reintentar.
 */
type ImpactoNodos =
  | { fase: "sin_cambio" }
  | { fase: "cargando" }
  | { fase: "listo"; impacto: ImpactoAsignacionDTO }
  | { fase: "error" };

/** Lo que el modal único muestra y lo que viaja al confirmar (design §8.2). */
interface Confirmacion {
  central: ConfirmacionCentral | null;
  entran: string[];
  salen: string[];
}

/** El aviso de R16 (texto de SLT-46 §4.7). */
export const AVISO_CAMBIO_CONCURRENTE = "Este dato cambió mientras tanto; revisa el valor actual";

/** Valores pre-cargados para editar (o vacíos al crear). */
export interface ZonaFormInitial {
  /** Presente sólo en edición. */
  zonaId?: string;
  nombre: string;
  /** Distritos (profundidad de distrito) asignados a la zona. */
  distritoIds: string[];
  /** SLT-89: los demás nodos asignados (provincia, cantón, profundidad ≥ 4). */
  nodoIds?: string[];
  /** Marca de zona de bodega principal (a lo sumo una en true). */
  esCentral?: boolean;
}

/**
 * Formulario de crear/editar zona (SLT-89, maqueta aprobada el 2026-11-10). Compone nombre + lugares
 * de cualquier nivel (`GeografiaSelector`) + marca de bodega principal (+ SINPE al crear).
 *
 * Guardar valida con el MISMO esquema que la action y, si es válido, abre UN modal con el antes →
 * después (nombre, marca y lugares que entran y salen, con su nivel y su padre), el bloque de la marca
 * central de la ficha 376 si aplica y el aviso de impacto en órdenes (R12, R13). Nada se envía hasta
 * «Sí, guardar»; «Volver» no escribe nada. Al guardar una zona existente viaja el «antes»: los lugares
 * que el modal mostró (R16).
 *
 * SLT-51: sin costos. El payload no lleva `cobroVehiculo` ni `tarifas`, y en el backend «ausente»
 * significa «no se toca» (design §5): un guardado de geografía no puede pisar los pagos que se
 * configuran desde Tarifas.
 */
export function CrearZonaForm({
  mode,
  arbol,
  zonas,
  initial,
  onSaved,
  onCancel,
  onCambioConcurrente,
}: {
  mode: "crear" | "editar";
  /** El árbol de zonas de N niveles de la empresa (design §4.2). */
  arbol: ArbolDeZonasDTO;
  /** Zonas existentes, para verificar si ya hay una marcada como central. */
  zonas: ZonaDTO[];
  initial?: ZonaFormInitial;
  /** Se invoca tras crear/actualizar con éxito (el padre refresca y cierra). */
  onSaved: () => void;
  onCancel: () => void;
  /** R16: el servidor dijo que los lugares cambiaron mientras tanto; el padre recarga la zona. */
  onCambioConcurrente?: () => void;
}) {
  const toast = useToast();
  const esEditar = mode === "editar";
  const indice = useMemo(() => indexarArbol(arbol), [arbol]);

  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const iniciales = useMemo(
    () => [...(initial?.distritoIds ?? []), ...(initial?.nodoIds ?? [])],
    // Se lee al montar: el padre remonta el formulario para editar otra zona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [seleccion, setSeleccion] = useState<NodosRepartidos>(() =>
    repartirPorProfundidad(iniciales, indice),
  );
  // R16: el «antes» es lo que la base tenía al abrir (lo que el modal pinta a la izquierda). Al crear
  // no hay estado previo: todo lo elegido «entra». Tras un guardado con éxito pasa a ser lo guardado.
  const antesRef = useRef<NodosRepartidos>(
    initial?.zonaId
      ? { distritoIds: [...initial.distritoIds], nodoIds: [...(initial.nodoIds ?? [])] }
      : { distritoIds: [], nodoIds: [] },
  );
  const [esCentral, setEsCentral] = useState<boolean>(initial?.esCentral ?? false);
  /**
   * ⭑ FICHA 429 (R11) — EL SINPE DE LA BODEGA NUEVA, TECLEADO.
   *
   * Arrancan VACÍOS y solo se piden AL CREAR. En edición no se pintan ni se envían, porque
   * `actualizarZonaSchema` no los lleva: el SINPE se edita por su propia acción, con otro
   * modelo de permisos. Y no se precargan con «el de la central» ni con nada: un campo que ya
   * viene relleno se acepta sin leerlo, y aceptar sin leer un número de cobro es exactamente el
   * fallo mudo que esta ficha persigue. «Obligatorio» significa teclearlo.
   */
  const [sinpeNumero, setSinpeNumero] = useState("");
  const [sinpeNombre, setSinpeNombre] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  // Id de la zona ya persistida en ESTA sesión del formulario: a partir del
  // primer éxito, un reintento es actualización y no crea una zona duplicada.
  const [zonaIdGuardada, setZonaIdGuardada] = useState<string | undefined>(
    initial?.zonaId,
  );
  // SLT-89 (R12): el modal único. Si !== null, está abierto y NADA se ha enviado todavía.
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(null);
  // FICHA 376 (Q4): cuántas órdenes re-tarifaría mover la marca. Se pide al abrir el modal.
  const [impacto, setImpacto] = useState<ImpactoCentral>({ fase: "cargando" });
  const [impactoNodos, setImpactoNodos] = useState<ImpactoNodos>({ fase: "sin_cambio" });
  // R16: el aviso del cambio concurrente, fuera del modal (que se cierra).
  const [aviso, setAviso] = useState<string | null>(null);
  // Una respuesta del aviso que llega tarde (el modal ya se cerró o se reabrió) no pisa la vigente.
  const peticionNodos = useRef(0);

  const seleccionadas = [...seleccion.distritoIds, ...seleccion.nodoIds];

  /**
   * Arma el candidato y lo valida contra el MISMO schema que la acción que se va a llamar.
   *
   * ⭑ FICHA 429 — POR QUÉ AQUÍ HAY DOS ESQUEMAS Y ANTES HABÍA UNO. `crearZonaSchema` ganó
   * `sinpeNumero`/`sinpeNombre` como OBLIGATORIOS (R11) y `actualizarZonaSchema` NO los lleva: el
   * SINPE se edita por su propia acción, y meterlo en el reemplazo completo de `actualizarZona`
   * —que arrastra distritos y tarifas— dejaría que un guardado de geografía pisara en silencio
   * la corrección que un `adminSatelite` acaba de hacer sobre su bodega.
   *
   * Se elige por `zonaIdGuardada` y NO por `mode`: tras crear con éxito, un reintento pasa a ser
   * una actualización aunque el modo siga siendo «crear», y es la misma condición que ya decide
   * a qué acción se llama en `enviar()`.
   */
  function validar() {
    const candidate = payload();
    if (zonaIdGuardada) return actualizarZonaSchema.safeParse(candidate);
    return crearZonaSchema.safeParse(candidate);
  }

  /**
   * SLT-51 (R5) — lo que viaja es ESTO y no `parsed.data`. `crearZonaSchema` materializa
   * `cobroVehiculo: false` y `tarifas: []` por default, y reenviar la salida del parse haría que
   * el formulario mandase costos que nunca pidió.
   *
   * SLT-89: `nodoIds` solo viaja si hay alguno (ausente se lee como `[]`, design §6), así una zona de
   * solo distritos manda lo de siempre (R38). `antes` viaja SIEMPRE al actualizar (R16).
   */
  function payload() {
    const base = {
      nombre,
      esCentral,
      distritoIds: seleccion.distritoIds,
      ...(seleccion.nodoIds.length > 0 ? { nodoIds: seleccion.nodoIds } : {}),
    };
    if (zonaIdGuardada) {
      const antes = antesRef.current;
      return { ...base, antes: { distritoIds: antes.distritoIds, nodoIds: antes.nodoIds } };
    }
    return { ...base, sinpeNumero, sinpeNombre };
  }

  /** Envía el payload (crear/actualizar) y maneja resultado/errores. */
  async function enviar() {
    const parsed = validar();
    if (!parsed.success) {
      setConfirmacion(null);
      setErrors(parsed.error.flatten().fieldErrors as FieldErrors);
      return;
    }
    setErrors({});
    const enviado = payload();
    try {
      // Ramas separadas: `ActualizarZonaResult["ok"]` trae `ordenesReconciliadas` y
      // `CrearZonaResult["ok"]` no (T6/R13); sin anotar el tipo, `tsc` distingue las ramas.
      let ordenesReconciliadas = 0;
      // FICHA 377 (R8): las que NO se movieron porque su paquete ya está recibido en una bodega.
      let ordenesRetenidas = 0;
      let res;
      if (zonaIdGuardada) {
        res = await actualizarZona(zonaIdGuardada, enviado);
        if (res.status === "ok") {
          ordenesReconciliadas = res.ordenesReconciliadas;
          ordenesRetenidas = res.ordenesRetenidasEnBodegaSatelite;
        }
      } else {
        res = await crearZona(enviado);
      }

      if (res.status === "ok") {
        setZonaIdGuardada(res.zona.id);
        antesRef.current = { distritoIds: enviado.distritoIds, nodoIds: enviado.nodoIds ?? [] };
        setConfirmacion(null);
        toast.success(
          mensajeGuardado(esEditar, ordenesReconciliadas, ordenesRetenidas),
        );
        onSaved();
        return;
      }

      setConfirmacion(null);
      // R16: los lugares de la zona cambiaron entre abrir el modal y confirmar. No se escribió nada:
      // se avisa (fuera del modal, `aria-live`) y el padre recarga la zona.
      if (res.status === "conflict" && "motivo" in res && res.motivo === "cambio_concurrente") {
        setAviso(AVISO_CAMBIO_CONCURRENTE);
        onCambioConcurrente?.();
        return;
      }
      // Error: validación por campo inline; el resto como toast.
      if (res.status === "validation_error") {
        setErrors(res.fieldErrors);
      }
      toast.error(mensajeDeError(res));
    } catch {
      setConfirmacion(null);
      toast.error("Ocurrió un error inesperado.");
    }
  }

  /**
   * ⭑ FICHA 376 (Q4) — va a buscar el impacto EN ÓRDENES de mover la marca. El modal se abre YA y el
   * número aparece cuando llega; mientras tanto «Sí, guardar» está bloqueado. Si la consulta falla,
   * se desbloquea diciendo que no se pudo contar: un fallo de lectura no puede dejar el guardado
   * atrapado. Se pregunta por LAS DOS zonas del traslado.
   */
  async function pedirImpactoCentral(pendiente: ConfirmacionCentral) {
    setImpacto({ fase: "cargando" });
    const ids = [
      ...(pendiente.tipo === "marcar" ? [pendiente.pierde.id] : []),
      ...(zonaIdGuardada ? [zonaIdGuardada] : []),
    ];
    if (ids.length === 0) {
      // Zona todavía sin id (creación): no tiene ni una orden que re-tarifar.
      setImpacto({ fase: "listo", ordenes: 0 });
      return;
    }
    try {
      const res = await impactoZonaCentral(ids);
      if (res.status !== "ok") {
        setImpacto({ fase: "sin_dato" });
        return;
      }
      setImpacto({
        fase: "listo",
        ordenes: res.impacto.reduce((total, i) => total + i.ordenesVivas, 0),
      });
    } catch {
      setImpacto({ fase: "sin_dato" });
    }
  }

  /** SLT-89 (R13): las cifras del servidor con los lugares PEDIDOS (sin escribir nada). */
  async function pedirImpactoNodos() {
    const peticion = ++peticionNodos.current;
    setImpactoNodos({ fase: "cargando" });
    try {
      const res = await impactoAsignacionZona({
        ...(zonaIdGuardada ? { zonaId: zonaIdGuardada } : {}),
        distritoIds: seleccion.distritoIds,
        nodoIds: seleccion.nodoIds,
      });
      if (peticion !== peticionNodos.current) return;
      setImpactoNodos(res.status === "ok" ? { fase: "listo", impacto: res.impacto } : { fase: "error" });
    } catch {
      if (peticion === peticionNodos.current) setImpactoNodos({ fase: "error" });
    }
  }

  async function guardar() {
    setAviso(null);
    const parsed = validar();
    if (!parsed.success) {
      // R12: inválido → error en su campo, sin modal y sin llamar a nada.
      setErrors(parsed.error.flatten().fieldErrors as FieldErrors);
      return;
    }
    setErrors({});

    // FICHA 376 (R20/R21): ¿el guardado mueve la marca de zona central?
    let central: ConfirmacionCentral | null = null;
    if (esCentral) {
      const conflicto = zonas.find((z) => z.esCentral && z.id !== zonaIdGuardada);
      if (conflicto) central = { tipo: "marcar", pierde: conflicto };
    } else if (initial?.esCentral === true) {
      central = { tipo: "desmarcar", nombreZona: initial.nombre };
    }

    const antes = antesRef.current;
    const { entran, salen } = diferencia([...antes.distritoIds, ...antes.nodoIds], seleccionadas);
    setConfirmacion({ central, entran, salen });

    const pendientes: Promise<void>[] = [];
    if (central) pendientes.push(pedirImpactoCentral(central));
    if (entran.length > 0 || salen.length > 0) pendientes.push(pedirImpactoNodos());
    else {
      peticionNodos.current++;
      setImpactoNodos({ fase: "sin_cambio" });
    }
    await Promise.all(pendientes);
  }

  // R13: «Sí, guardar» no se habilita hasta tener las cifras; la marca central (Q4) tampoco mientras
  // se cuenta.
  const confirmarBloqueado =
    (confirmacion?.central != null && impacto.fase === "cargando") ||
    impactoNodos.fase === "cargando" ||
    impactoNodos.fase === "error";

  const nombreAntes = initial?.nombre ?? "";
  const centralAntes = initial?.esCentral === true;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <h3 className="text-xl font-bold">{esEditar ? "Editar zona" : "Nueva zona"}</h3>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="min-h-10" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="button" className="min-h-10 font-semibold" onClick={guardar}>
            Guardar zona…
          </Button>
        </div>
      </header>

      {/* R16: el aviso vive fuera del modal, que se cierra; `aria-live` lo anuncia. */}
      <p role="status" aria-live="polite" className="text-sm font-medium text-warning-strong empty:hidden">
        {aviso ?? ""}
      </p>

      <div className="flex flex-wrap items-start gap-5">
        <section
          aria-labelledby="zona-datos-titulo"
          className="flex min-w-0 flex-[1_1_280px] flex-col gap-4 rounded-xl border border-border bg-card p-4 lg:max-w-sm"
        >
          <h4 id="zona-datos-titulo" className="text-base font-semibold">
            Datos de la zona
          </h4>

          <FormField id="nombre-zona" label="Nombre de la zona" error={errors.nombre}>
            <Input
              value={nombre}
              placeholder="Ej: San José centro"
              onChange={(e) => setNombre(e.target.value)}
            />
          </FormField>

          {/* ⭑ FICHA 429 (R11) — EL SINPE DE LA BODEGA, EN EL MISMO ACTO DE CREARLA. Solo al CREAR.
              Los dos errores se pintan JUNTO A SU CAMPO —`FormField` cablea `aria-invalid` y
              `aria-describedby`— y no como un toast genérico. */}
          {!zonaIdGuardada ? (
            <fieldset className="flex flex-col gap-4 rounded-md border border-border p-4">
              <legend className="px-1 text-sm font-semibold">
                SINPE de la bodega
              </legend>
              <p className="max-w-prose text-xs text-muted-foreground">
                Es el número al que los clientes de esta bodega transfieren cuando
                pagan por SINPE. Lo usan todos los mensajeros de la bodega.
              </p>

              <FormField
                id="sinpe-numero-zona"
                label="Número SINPE"
                required
                hint="8 dígitos, empieza por 6, 7 u 8."
                error={errors.sinpeNumero}
              >
                <Input
                  inputMode="numeric"
                  autoComplete="off"
                  value={sinpeNumero}
                  placeholder="Ej: 88881111"
                  onChange={(e) => setSinpeNumero(e.target.value)}
                />
              </FormField>

              <FormField
                id="sinpe-nombre-zona"
                label="A nombre de"
                required
                hint="Tal como aparece en SINPE Móvil al teclear el número."
                error={errors.sinpeNombre}
              >
                <Input
                  autoComplete="off"
                  value={sinpeNombre}
                  placeholder="Ej: Mensajería Ejemplo CR S.A."
                  onChange={(e) => setSinpeNombre(e.target.value)}
                />
              </FormField>
            </fieldset>
          ) : null}

          {/* FICHA 376 (R23): el rechazo del servidor por «tiene que haber una zona central» va JUNTO
              a la casilla, enlazado por `aria-describedby`. */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="es-central-zona"
                checked={esCentral}
                aria-invalid={errors.esCentral ? true : undefined}
                aria-describedby={
                  errors.esCentral ? "es-central-zona-error" : undefined
                }
                onCheckedChange={(checked) => setEsCentral(checked === true)}
              />
              <Label htmlFor="es-central-zona" className="cursor-pointer">
                Zona de bodega principal
              </Label>
            </div>
            <FieldError id="es-central-zona-error" messages={errors.esCentral} />
          </div>

          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Cómo leer el árbol</p>
            <p>Casilla marcada: elegido para esta zona.</p>
            <p>«hereda de…»: lo cubre un lugar de arriba.</p>
            <p>«Excepción»: va a otra zona aunque su padre esté aquí.</p>
          </div>
        </section>

        <section
          aria-labelledby="zona-lugares-titulo"
          className="flex min-w-0 flex-[999_1_320px] flex-col gap-3 rounded-xl border border-border bg-card p-4"
        >
          <h4 id="zona-lugares-titulo" className="text-base font-semibold">
            Lugares de la zona
          </h4>
          <GeografiaSelector
            arbol={arbol}
            initialSelected={iniciales}
            zonaEnEdicionId={zonaIdGuardada}
            nombreZona={nombre}
            onSelectedChange={setSeleccion}
          />
          {/* Error del GRUPO de lugares: FieldError suelto (distritos y demás nodos, SLT-75 R21). */}
          <FieldError messages={[...(errors.distritoIds ?? []), ...(errors.nodoIds ?? [])]} />
        </section>
      </div>

      <Modal
        open={confirmacion !== null}
        onOpenChange={(o) => {
          // R12: «Volver» (o cerrar) NO envía nada y ninguna zona cambia.
          if (!o) {
            peticionNodos.current++;
            setConfirmacion(null);
          }
        }}
        title={zonaIdGuardada ? `¿Guardar los cambios de ${nombre}?` : `¿Crear la zona ${nombre}?`}
        description="Revisa qué lugares entran y salen, y qué pasa con las órdenes pendientes."
        confirmLabel="Sí, guardar"
        cancelLabel="Volver"
        size="760px"
        closeOnConfirm={false}
        confirmDisabled={confirmarBloqueado}
        onConfirm={enviar}
      >
        {confirmacion ? (
          <div className="flex flex-col gap-4">
            <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Nombre</dt>
                <dd className="text-muted-foreground">
                  {zonaIdGuardada && nombreAntes !== nombre ? `${nombreAntes} → ${nombre}` : nombre}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Zona de bodega principal</dt>
                <dd className="text-muted-foreground">
                  {zonaIdGuardada && centralAntes !== esCentral
                    ? `${centralAntes ? "Sí" : "No"} → ${esCentral ? "Sí" : "No"}`
                    : esCentral
                      ? "Sí"
                      : "No"}
                </dd>
              </div>
            </dl>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <ListaDeLugares
                titulo="Entran"
                ids={confirmacion.entran}
                indice={indice}
                arbol={arbol}
                pie="Incluye"
                zonaEnEdicionId={zonaIdGuardada}
              />
              <ListaDeLugares
                titulo="Salen"
                ids={confirmacion.salen}
                indice={indice}
                arbol={arbol}
                pie="Queda sin zona si nadie más lo cubre."
                zonaEnEdicionId={zonaIdGuardada}
              />
            </div>

            {confirmacion.central ? (
              <div className="flex flex-col gap-1 rounded-lg border border-border p-3">
                <p className="text-sm font-semibold">
                  {confirmacion.central.tipo === "desmarcar"
                    ? "Quitar la marca de zona de bodega principal"
                    : "Zona de bodega principal ya asignada"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {descripcionConfirmacion(confirmacion.central)}
                </p>
                {/* Q4: `aria-live` lo anuncia cuando llega, porque el modal se abre antes. */}
                <p
                  aria-live="polite"
                  data-testid="impacto-zona-central"
                  className="text-sm text-muted-foreground"
                >
                  {textoImpacto(impacto)}
                </p>
              </div>
            ) : null}

            <ImpactoEnOrdenes estado={impactoNodos} onReintentar={pedirImpactoNodos} />
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

/** «Santa Ana · cantón de San José» (R12: cada lugar con su nivel y el nombre de su padre). */
function lineaDeLugar(
  id: string,
  indice: ReadonlyMap<string, NodoIndexado>,
  arbol: ArbolDeZonasDTO,
): { nombre: string; detalle: string } {
  const entrada = indice.get(id);
  if (entrada === undefined) return { nombre: id, detalle: "" };
  const tipo =
    arbol.tipos.find((t) => t.profundidad === entrada.nodo.profundidad)?.nombreSingular.toLowerCase() ?? "";
  const padre = entrada.ancestros.at(-1);
  return { nombre: entrada.nodo.nombre, detalle: padre ? `${tipo} de ${padre.nombre}` : tipo };
}

function ListaDeLugares({
  titulo,
  ids,
  indice,
  arbol,
  pie,
  zonaEnEdicionId,
}: Readonly<{
  titulo: string;
  ids: readonly string[];
  indice: ReadonlyMap<string, NodoIndexado>;
  arbol: ArbolDeZonasDTO;
  pie: string;
  zonaEnEdicionId: string | undefined;
}>) {
  const distrito = arbol.tipos.find((t) => t.profundidad === PROFUNDIDAD_DE_DISTRITO);
  return (
    <section aria-label={titulo} className="flex flex-col gap-1.5 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">{titulo}</p>
      {ids.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguno</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {ids.map((id) => {
            const { nombre, detalle } = lineaDeLugar(id, indice, arbol);
            const nodo = indice.get(id)?.nodo;
            const k = nodo ? distritosBajo(nodo, { zonaEnEdicionId }) : 0;
            const excepciones = titulo === "Entran" && nodo ? excepcionesBajo(nodo, zonaEnEdicionId) : [];
            return (
              <li key={id} className="flex flex-col text-sm">
                <span>
                  {nombre}
                  {detalle ? <span className="text-muted-foreground">{` · ${detalle}`}</span> : null}
                </span>
                {pie === "Incluye" ? (
                  k > 0 && distrito ? (
                    <span className="text-xs text-muted-foreground">
                      {`Incluye ${k === 1 ? "su" : "sus"} ${k} ${(k === 1 ? distrito.nombreSingular : distrito.nombrePlural).toLowerCase()}.`}
                    </span>
                  ) : null
                ) : (
                  <span className="text-xs text-muted-foreground">{pie}</span>
                )}
                {excepciones.map((e) => (
                  <span key={e.id} className="text-xs text-muted-foreground">
                    {`${e.nombre} sigue en ${e.zona} (excepción).`}
                  </span>
                ))}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Los descendientes asignados a otra zona: siguen allí (R11). */
function excepcionesBajo(
  nodo: ArbolDeZonasDTO["raices"][number],
  zonaEnEdicionId: string | undefined,
): { id: string; nombre: string; zona: string }[] {
  const salida: { id: string; nombre: string; zona: string }[] = [];
  const recorrer = (hijos: typeof nodo.hijos) => {
    for (const h of hijos) {
      if (h.asignadaA !== null && h.asignadaA.id !== zonaEnEdicionId) {
        salida.push({ id: h.id, nombre: h.nombre, zona: h.asignadaA.nombre });
        continue;
      }
      recorrer(h.hijos);
    }
  };
  recorrer(nodo.hijos);
  return salida;
}

/** SLT-89 (R13) — las cifras del aviso, tal como las devuelve el servidor. */
function ImpactoEnOrdenes({
  estado,
  onReintentar,
}: Readonly<{ estado: ImpactoNodos; onReintentar: () => void }>) {
  if (estado.fase === "sin_cambio") return null;
  return (
    <section aria-label="Órdenes pendientes" aria-live="polite" className="flex flex-col gap-2">
      <p className="text-sm font-semibold">Órdenes pendientes</p>
      {estado.fase === "cargando" ? (
        <p className="text-sm text-muted-foreground">Calculando qué pasa con las órdenes pendientes…</p>
      ) : estado.fase === "error" ? (
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm text-danger-strong">
            No se pudo calcular el impacto en las órdenes. Sin esas cifras no se puede guardar.
          </p>
          <Button type="button" variant="outline" size="sm" onClick={onReintentar}>
            Reintentar
          </Button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-xl font-bold">{estado.impacto.cambianDeZona}</p>
              <p className="text-sm text-muted-foreground">cambian de zona</p>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2">
              <p className="text-xl font-bold">{estado.impacto.cambianDeTarifa}</p>
              <p className="text-sm text-muted-foreground">cambian de tarifa</p>
            </div>
          </div>
          <NoSeMueven noSeMueven={estado.impacto.noSeMueven} />
        </>
      )}
    </section>
  );
}

function NoSeMueven({ noSeMueven }: Readonly<{ noSeMueven: ImpactoAsignacionDTO["noSeMueven"] }>) {
  const total = noSeMueven.enBodegaSatelite + noSeMueven.conGestionFinal + noSeMueven.enCierre;
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-warning/40 bg-warning-soft px-3 py-2">
      <p className="text-sm font-semibold">{`${total} no se mueven aunque su zona cambiaría`}</p>
      <ul className="list-disc pl-5 text-sm text-muted-foreground">
        <li>{`${noSeMueven.enBodegaSatelite} en el estante de una bodega satélite`}</li>
        <li>{`${noSeMueven.conGestionFinal} con gestión final`}</li>
        <li>{`${noSeMueven.enCierre} ya en un cierre`}</li>
      </ul>
    </div>
  );
}

/**
 * ⭑ FICHA 376 (R20/R21) — el texto de la confirmación, en las dos direcciones.
 *
 * `marcar` conserva LITERALMENTE el texto que ya existía (nombra la zona que pierde la marca).
 * `desmarcar` es el nuevo: nombra la zona y advierte que tiene que existir una zona central —sin
 * prometer que el guardado va a pasar, porque no va a pasar: lo rechaza el servidor (R5)—.
 */
function descripcionConfirmacion(confirmacion: ConfirmacionCentral): string {
  if (confirmacion.tipo === "marcar") {
    return `La zona ${confirmacion.pierde.nombre} ya está marcada como zona de bodega principal. Esta acción reestablecerá la zona de bodega principal. ¿Desea continuar?`;
  }
  return `La zona ${confirmacion.nombreZona} es hoy la zona de bodega principal. Siempre tiene que haber una zona de bodega principal: si le quitas la marca sin marcar otra zona, el guardado se rechaza. ¿Desea continuar?`;
}

/**
 * ⭑ FICHA 376 (Q4) — el impacto, en palabras.
 *
 * `impactoZonaCentral` devuelve NÚMEROS y no redacta nada: el texto se compone aquí. Se cuentan
 * las órdenes que todavía no están congeladas en un cierre, que son exactamente las que cambiarían
 * de columna de flete al mover la marca.
 */
function textoImpacto(impacto: ImpactoCentral): string {
  if (impacto.fase === "cargando") {
    return "Calculando cuántas órdenes cambiarían de tarifa…";
  }
  if (impacto.fase === "sin_dato") {
    return "No se pudo calcular cuántas órdenes cambiarían de tarifa.";
  }
  if (impacto.ordenes <= 0) {
    return "Ninguna orden sin cerrar cambia de tarifa de flete.";
  }
  if (impacto.ordenes === 1) {
    return "1 orden sin cerrar pasaría a cobrarse con otra tarifa de flete.";
  }
  return `${impacto.ordenes} órdenes sin cerrar pasarían a cobrarse con otra tarifa de flete.`;
}

/**
 * Mensaje de éxito del guardado. Al crear, siempre "Zona creada": crear nunca
 * reconcilia órdenes ni retiene ninguna (R13). Al editar, si el guardado
 * reubicó órdenes de otra bodega (su distrito ya resolvía otra zona), lo dice
 * con el conteo exacto; con 0 el mensaje queda igual que antes de la 366.
 *
 * ⭑ FICHA 377 (R8/R10) — LA SEGUNDA FRASE, Y POR QUE SOLO APARECE A VECES.
 *
 * `ordenesRetenidas` son las que el servidor dejó a propósito con su zona
 * anterior porque su paquete ya está recibido en una bodega (R2): moverlas de
 * zona las sacaría del listado de quien las tiene y las dejaría sin transición
 * de salida. Decir «se reubicaron 12» y callar que otras 39 no se movieron es
 * el fallo mudo que R8 cierra, así que la frase se añade a la de arriba en vez
 * de sustituirla: los dos conjuntos son DISJUNTOS y los dos números importan.
 *
 * Con `0` retenidas NO se dice nada (R10): un «0 órdenes» en el caso normal
 * —que es la enorme mayoría de los guardados— sería ruido que enseña a ignorar
 * el mensaje justo cuando el número deja de ser 0. Por eso la guarda es
 * `> 0` y no `<= 0`: el texto de antes de esta ficha se conserva LITERAL.
 *
 * Y la causa se nombra en términos de lo que pasa en la bodega, no del modelo:
 * ni «retenidas», ni «custodia», ni «sin dueño» —eso último describe un defecto
 * que este cambio precisamente impide—.
 */
function mensajeGuardado(
  esEditar: boolean,
  ordenesReconciliadas: number,
  ordenesRetenidas: number,
): string {
  if (!esEditar) return "Zona creada";

  const base =
    ordenesReconciliadas > 0
      ? `Zona actualizada (${ordenesReconciliadas} ${
          ordenesReconciliadas === 1 ? "orden reubicada" : "órdenes reubicadas"
        })`
      : "Zona actualizada";

  if (!(ordenesRetenidas > 0)) return base;

  const retenidas =
    ordenesRetenidas === 1
      ? "1 orden no cambió de zona porque su paquete ya está en una bodega."
      : `${ordenesRetenidas} órdenes no cambiaron de zona porque su paquete ya está en una bodega.`;

  return `${base}. ${retenidas}`;
}

/** El primer mensaje y, si hay más, « y <N> más.». `undefined` si no hay ninguno. */
function primeroYCuantosMas(mensajes: string[] | undefined): string | undefined {
  if (!mensajes || mensajes.length === 0) return undefined;
  if (mensajes.length === 1) return mensajes[0];
  return `${mensajes[0]} y ${mensajes.length - 1} más.`;
}

/** Mensaje legible para los estados de error de crear/actualizar zona. */
function mensajeDeError(err: ZonaActionError): string {
  switch (err.status) {
    case "validation_error":
      // FICHA 376 (R23): el rechazo de la marca de zona central NO es «el formulario está
      // incompleto» —el formulario estaba completo, la regla lo rechazó—. El motivo lo redacta el
      // servidor y se reenvía TAL CUAL: la casilla lo pinta (FieldError) y el toast lo repite,
      // porque la casilla puede haber quedado fuera de la pantalla al hacer scroll.
      //
      // ⭑ FICHA 392 — el nombre de la zona entra por la MISMA puerta y por el mismo motivo. La
      // zona se imprime en la etiqueta (es la primera parte de `ubicacion`), así que el servidor
      // rechaza el nombre que la fuente no puede imprimir y redacta él el motivo: qué carácter
      // es, su `U+XXXX` y cómo escribirlo bien. Mandar a «revisar los campos» a quien tiene el
      // formulario COMPLETO lo pone a buscar un hueco que no existe.
      //
      // El motivo se reenvía ENTERO, sin recortar: el caso de la letra descompuesta —la que se
      // pinta igual que la de siempre pero está escrita de otra forma— es largo porque explica
      // algo que no se ve en pantalla, y resumirlo lo deja sin la única instrucción que sirve.
      //
      // `nombre` va antes que `esCentral` porque el servidor nunca los devuelve juntos: el corte
      // del nombre vive en `prepararDatos` y la marca de zona central se decide después.
      //
      // SLT-75 (R21): el rechazo por un distrito que ya está en otra zona trae un mensaje por
      // distrito. El selector los pinta todos (FieldError); el toast dice el primero y cuántos
      // más quedan, para no convertirse en una lista que tapa la pantalla.
      return (
        err.fieldErrors.nombre?.[0] ??
        err.fieldErrors.esCentral?.[0] ??
        primeroYCuantosMas(err.fieldErrors.distritoIds) ??
        // SLT-89 (R2, R4): el mismo trato para los lugares que no son distritos.
        primeroYCuantosMas(err.fieldErrors.nodoIds) ??
        "Revisa los campos: el formulario está incompleto."
      );
    case "conflict":
      // SLT-75 (R22): un distrito en otra zona ya no llega como `conflict` sino como
      // `validation_error` con el detalle; nombrarlo aquí mandaría a buscar un distrito que no es.
      return "Ya existe una zona con ese nombre.";
    case "unauthenticated":
      return "Tu sesión expiró.";
    case "forbidden":
      return "No tienes permiso para esta acción.";
    case "not_found":
      return "La zona no existe.";
    default:
      return "No se pudo guardar la zona.";
  }
}
