"use client";

import { useState } from "react";

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
  type ZonaActionError,
  type ZonaDTO,
} from "@/lib/types/zona";
import {
  crearZona,
  actualizarZona,
  impactoZonaCentral,
} from "@/lib/actions/zonas";
import type { ProvinciaArbolDTO } from "@/lib/actions/geografia";

import { GeografiaSelector } from "./GeografiaSelector";

type FieldErrors = Record<string, string[]>;

/**
 * ⭑ FICHA 376 (R20/R21) — LA CONFIRMACIÓN PENDIENTE DE MOVER LA MARCA DE ZONA CENTRAL.
 *
 * Dos direcciones, un solo modal. `marcar` es la que ya existía: esta zona GANA la marca y otra
 * la pierde sin aparecer en ningún payload (R21). `desmarcar` es la que faltaba: la zona que HOY
 * es la central se queda sin ella y el sistema se quedaría sin ninguna (R20).
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

/** Valores pre-cargados para editar (o vacíos al crear). */
export interface ZonaFormInitial {
  /** Presente sólo en edición. */
  zonaId?: string;
  nombre: string;
  distritoIds: string[];
  /** Marca de zona de bodega principal (a lo sumo una en true). */
  esCentral?: boolean;
}

/**
 * Formulario de crear/editar zona. Compone nombre + selección de distritos
 * (GeografiaSelector) + marca de bodega principal (+ SINPE al crear). Al guardar
 * arma el payload, lo valida contra el schema de la action y llama a `crearZona`
 * o `actualizarZona` según el modo. Notifica con toast el éxito/error y avisa al
 * padre con `onSaved` para refrescar la lista.
 *
 * SLT-51: sin costos. El payload no lleva `cobroVehiculo` ni `tarifas`, y en el
 * backend «ausente» significa «no se toca» (design §5): un guardado de geografía
 * no puede pisar los pagos que se configuran desde Tarifas.
 */
export function CrearZonaForm({
  mode,
  provincias,
  zonas,
  initial,
  onSaved,
  onCancel,
}: {
  mode: "crear" | "editar";
  provincias: ProvinciaArbolDTO[];
  /** Zonas existentes, para verificar si ya hay una marcada como central. */
  zonas: ZonaDTO[];
  initial?: ZonaFormInitial;
  /** Se invoca tras crear/actualizar con éxito (el padre refresca y cierra). */
  onSaved: () => void;
  onCancel: () => void;
}) {
  const toast = useToast();
  const esEditar = mode === "editar";

  const [nombre, setNombre] = useState(initial?.nombre ?? "");
  const [distritoIds, setDistritoIds] = useState<string[]>(
    initial?.distritoIds ?? [],
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
  const [guardando, setGuardando] = useState(false);
  // Id de la zona ya persistida en ESTA sesión del formulario: a partir del
  // primer éxito, un reintento es actualización y no crea una zona duplicada.
  const [zonaIdGuardada, setZonaIdGuardada] = useState<string | undefined>(
    initial?.zonaId,
  );
  // FICHA 376 (R20/R21): confirmación pendiente de mover la marca de zona central. Si !== null,
  // el modal está abierto y NADA se ha enviado todavía (R22: cancelar cierra y no envía).
  const [confirmacion, setConfirmacion] = useState<ConfirmacionCentral | null>(
    null,
  );
  // FICHA 376 (Q4): cuántas órdenes re-tarifaría ese movimiento. Se pide al abrir el modal.
  const [impacto, setImpacto] = useState<ImpactoCentral>({ fase: "cargando" });

  /**
   * Arma el candidato y lo valida contra el MISMO schema que la acción que se va a llamar.
   *
   * ⭑ FICHA 429 — POR QUÉ AQUÍ HAY DOS ESQUEMAS Y ANTES HABÍA UNO. `crearZonaSchema` ganó
   * `sinpeNumero`/`sinpeNombre` como OBLIGATORIOS (R11) y `actualizarZonaSchema` NO los lleva: el
   * SINPE se edita por su propia acción, y meterlo en el reemplazo completo de `actualizarZona`
   * —que arrastra distritos y tarifas— dejaría que un guardado de geografía pisara en silencio
   * la corrección que un `adminSatelite` acaba de hacer sobre su bodega.
   *
   * Los dos esquemas son `.strict()`, así que seguir validando SIEMPRE contra el de crear rompía
   * las dos ramas a la vez: al crear no se recogían los campos —y el formulario no llegaba ni a
   * llamar a la acción, que es el rojo medido de 32 casos—, y al editar los habría mandado a un
   * esquema que los rechaza.
   *
   * Se elige por `zonaIdGuardada` y NO por `mode`: tras crear con éxito, un reintento pasa a ser
   * una actualización aunque el modo siga siendo «crear», y es la misma condición que ya decide
   * a qué acción se llama en `enviar()`. Dos condiciones distintas para la misma bifurcación
   * divergirían sin que nada se pusiera rojo.
   */
  function validar() {
    const candidate = payload();
    if (zonaIdGuardada) return actualizarZonaSchema.safeParse(candidate);
    return crearZonaSchema.safeParse(candidate);
  }

  /**
   * SLT-51 (R5) — lo que viaja es ESTO y no `parsed.data`. `crearZonaSchema` materializa
   * `cobroVehiculo: false` y `tarifas: []` por default, y reenviar la salida del parse haría que
   * el formulario mandase costos que nunca pidió: si un default cambiara, Zonas escribiría pagos
   * sin que nadie lo viera. La acción vuelve a validar con el mismo esquema en el servidor.
   */
  function payload() {
    const base = { nombre, esCentral, distritoIds };
    return zonaIdGuardada ? base : { ...base, sinpeNumero, sinpeNombre };
  }

  /** Envía el payload (crear/actualizar) y maneja resultado/errores. */
  async function enviar() {
    const parsed = validar();
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as FieldErrors);
      return;
    }
    setErrors({});
    setGuardando(true);
    try {
      // Ramas separadas (en vez de un `zonaIdGuardada ? A : B` con `res` único):
      // `ActualizarZonaResult["ok"]` trae `ordenesReconciliadas` y
      // `CrearZonaResult["ok"]` no (T6/R13); estructuralmente uno es asignable
      // al otro (tener una propiedad de más no rompe la asignación), así que
      // anotar `res` con la unión explícita le impide a `tsc` angostarlo por
      // asignación: `res.status === "ok"` cae en la unión de LOS DOS "ok",
      // no en el de la rama que de verdad corrió. Sin anotar el tipo, `tsc`
      // sigue el tipo "evolutivo" de cada asignación y sí distingue las ramas.
      let ordenesReconciliadas = 0;
      // FICHA 377 (R8): el segundo conteo. Las que NO se movieron porque su
      // paquete ya está recibido en una bodega; el servidor las deja con su zona
      // anterior a propósito (R2) y la pantalla tiene que decirlo — informar y no
      // pintarlo sería el mismo fallo mudo que el conteo de arriba vino a cerrar.
      let ordenesRetenidas = 0;
      let res;
      if (zonaIdGuardada) {
        res = await actualizarZona(zonaIdGuardada, payload());
        if (res.status === "ok") {
          ordenesReconciliadas = res.ordenesReconciliadas;
          ordenesRetenidas = res.ordenesRetenidasEnBodegaSatelite;
        }
      } else {
        res = await crearZona(payload());
      }

      if (res.status === "ok") {
        setZonaIdGuardada(res.zona.id);
        toast.success(
          mensajeGuardado(esEditar, ordenesReconciliadas, ordenesRetenidas),
        );
        onSaved();
        return;
      }

      // Error: validación por campo inline; el resto como toast.
      if (res.status === "validation_error") {
        setErrors(res.fieldErrors);
      }
      toast.error(mensajeDeError(res));
    } catch {
      toast.error("Ocurrió un error inesperado.");
    } finally {
      setGuardando(false);
    }
  }

  /**
   * ⭑ FICHA 376 (Q4) — abre la confirmación y va a buscar el impacto EN ÓRDENES.
   *
   * El modal se abre YA (no se espera a la consulta) y el número aparece cuando llega: la
   * confirmación es el sitio donde se dice qué cuesta el movimiento, no una pantalla de carga.
   * Mientras tanto el botón de confirmar está bloqueado, para que nadie confirme un impacto que
   * todavía no ha visto. Si la consulta falla, se desbloquea diciendo que no se pudo contar: un
   * fallo de lectura no puede dejar el guardado atrapado.
   *
   * Se pregunta por LAS DOS zonas del traslado —la que pierde la marca y la que la gana—: las dos
   * cambian de columna de flete (`resolverFlete`), y el borde devuelve una entrada por zona
   * pedida, con cero si no tiene ninguna.
   */
  async function pedirConfirmacion(pendiente: ConfirmacionCentral) {
    setConfirmacion(pendiente);
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

  async function guardar() {
    const parsed = validar();
    if (!parsed.success) {
      setErrors(parsed.error.flatten().fieldErrors as FieldErrors);
      return;
    }
    setErrors({});

    // Si se marca como central, verifica que ninguna otra zona ya lo esté. Si la hay,
    // se pide confirmación (reestablecerá la marca a esta zona).
    if (esCentral) {
      const conflicto = zonas.find(
        (z) => z.esCentral && z.id !== zonaIdGuardada,
      );
      if (conflicto) {
        await pedirConfirmacion({ tipo: "marcar", pierde: conflicto });
        return;
      }
    } else if (initial?.esCentral === true) {
      // FICHA 376 (R20): la rama SIMÉTRICA que faltaba. La zona que se edita es hoy la central y
      // la casilla queda apagada: se pregunta antes de enviar nada, nombrando la zona.
      await pedirConfirmacion({
        tipo: "desmarcar",
        nombreZona: initial.nombre,
      });
      return;
    }

    await enviar();
  }

  return (
    <div className="flex flex-col gap-6 rounded-md border border-border p-4">
      <h3 className="text-sm font-semibold">
        {esEditar ? "Editar zona" : "Nueva zona"}
      </h3>

      <FormField id="nombre-zona" label="Nombre de la zona" error={errors.nombre}>
        <Input
          value={nombre}
          placeholder="Ej: San José centro"
          onChange={(e) => setNombre(e.target.value)}
        />
      </FormField>

      {/* ⭑ FICHA 429 (R11) — EL SINPE DE LA BODEGA, EN EL MISMO ACTO DE CREARLA.
          Solo al CREAR: en edición el par se cambia desde «SINPE por bodega», que es la
          superficie que lleva el rastro de quién lo tocó. Los dos errores se pintan JUNTO A SU
          CAMPO —`FormField` cablea `aria-invalid` y `aria-describedby`— y no como un toast
          genérico: un «revisá los datos» no dice cuál de los dos números está mal. */}
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

      {/* FICHA 376 (R23): el rechazo del servidor por «tiene que haber una zona central» llega
          como `fieldErrors.esCentral` y hasta hoy no se pintaba en ningún sitio. Va JUNTO a la
          casilla, y enlazado por `aria-describedby` para que un lector de pantalla lo anuncie
          como el error de ESTE control y no como un texto suelto. */}
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

      <GeografiaSelector
        provincias={provincias}
        initialSelected={initial?.distritoIds}
        onSelectedChange={setDistritoIds}
      />
      {/* Error del GRUPO de distritos (selector geográfico): FieldError suelto. */}
      <FieldError messages={errors.distritoIds} />

      <div className="flex items-center gap-2">
        <Button type="button" onClick={guardar} loading={guardando}>
          {guardando ? "Guardando…" : "Guardar"}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={guardando}
        >
          Cancelar
        </Button>
      </div>

      <Modal
        open={confirmacion !== null}
        onOpenChange={(o) => {
          // R22: cancelar (o cerrar) NO envía nada y ninguna zona cambia.
          if (!o) setConfirmacion(null);
        }}
        title={
          confirmacion?.tipo === "desmarcar"
            ? "Quitar la marca de zona de bodega principal"
            : "Zona de bodega principal ya asignada"
        }
        description={confirmacion ? descripcionConfirmacion(confirmacion) : ""}
        confirmLabel="Continuar"
        cancelLabel="Cancelar"
        // Q4: no se confirma un impacto que todavía no se ha visto.
        confirmDisabled={impacto.fase === "cargando"}
        onConfirm={async () => {
          setConfirmacion(null);
          await enviar();
        }}
      >
        {/* Q4: el número vive en el modal, no en el borde. `aria-live` lo anuncia cuando llega,
            porque el modal se abre antes de que la consulta termine. */}
        <p
          aria-live="polite"
          data-testid="impacto-zona-central"
          className="text-sm text-muted-foreground"
        >
          {textoImpacto(impacto)}
        </p>
      </Modal>
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
      return (
        err.fieldErrors.nombre?.[0] ??
        err.fieldErrors.esCentral?.[0] ??
        "Revisa los campos: el formulario está incompleto."
      );
    case "conflict":
      return "Ya existe una zona con ese nombre o un distrito ya está asignado.";
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
