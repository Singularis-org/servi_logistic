"use client";

import { useMemo, useState } from "react";
import { Pencil, Power, PowerOff } from "lucide-react";

import { FormField } from "@/components/shared/FormField";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  cambiarActivacionVehiculoAction,
  crearVehiculoAction,
  listarVehiculosPlataformaAction,
  renombrarVehiculoAction,
} from "@/lib/actions/vehiculos-plataforma";
import {
  VEHICULO_NOMBRE_MAX,
  normalizarNombreVehiculo,
  type VehiculoDTO,
} from "@/lib/types/vehiculos";

import {
  MENSAJE_ERROR,
  MENSAJE_EXITO,
  TEXTOS_VEHICULOS as T,
  etiquetaAccion,
  mensajeDeError,
  type OperacionVehiculo,
} from "./vehiculos-plataforma-textos";

type FieldErrors = Record<string, string[]>;

/**
 * SL-42 (design §5; R2, R4–R6, R8, R13) — el catálogo de vehículos del superadmin.
 *
 * Parte del `VehiculosModule` que tenía el `maestro` en `/configuracion/vehiculos`, sin borrar (R8):
 * desactivar sustituye al borrado. Por fila, «Renombrar» y «Desactivar»/«Activar».
 *
 * R13: cada desenlace tiene su mensaje (`vehiculos-plataforma-textos.ts`); el inválido y el repetido
 * van además junto al campo. Ningún fallo que no sea `conflict` dice «ya existe».
 */
export function VehiculosPlataformaModule({
  initialVehiculos,
  cargaError: cargaErrorInicial,
}: {
  initialVehiculos: VehiculoDTO[];
  cargaError: boolean;
}) {
  const toast = useToast();

  const [vehiculos, setVehiculos] = useState<VehiculoDTO[]>(initialVehiculos);
  const [cargaError, setCargaError] = useState(cargaErrorInicial);

  const [formAbierto, setFormAbierto] = useState(false);
  const [editando, setEditando] = useState<VehiculoDTO | null>(null);
  const [nombre, setNombre] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [guardando, setGuardando] = useState(false);
  const [cambiando, setCambiando] = useState<string | null>(null);

  const ordenados = useMemo(
    () => [...vehiculos].sort((a, b) => a.name.localeCompare(b.name, "es")),
    [vehiculos],
  );

  async function refetch() {
    const res = await listarVehiculosPlataformaAction();
    if (res.status === "ok") {
      setVehiculos(res.items);
      setCargaError(false);
    } else {
      setCargaError(true);
    }
  }

  function abrirCrear() {
    setEditando(null);
    setNombre("");
    setErrors({});
    setFormAbierto(true);
  }

  function abrirRenombrar(v: VehiculoDTO) {
    setEditando(v);
    setNombre(v.name);
    setErrors({});
    setFormAbierto(true);
  }

  async function guardar() {
    // Misma normalización que el servidor: un nombre de solo espacios es vacío también aquí.
    const limpio = normalizarNombreVehiculo(nombre);
    if (limpio === "") {
      setErrors({ name: [T.nombreObligatorio] });
      return;
    }

    const operacion: OperacionVehiculo = editando ? "renombre" : "alta";
    setGuardando(true);
    try {
      const res = editando
        ? await renombrarVehiculoAction({ id: editando.id, name: limpio })
        : await crearVehiculoAction({ name: limpio });

      if (res.status === "ok") {
        toast.success(MENSAJE_EXITO[operacion]);
        setFormAbierto(false);
        await refetch();
        return;
      }
      if (res.status === "validation_error") {
        setErrors({ name: res.fieldErrors.name ?? [MENSAJE_ERROR.validation_error] });
        toast.error(MENSAJE_ERROR.validation_error);
        return;
      }
      if (res.status === "conflict") {
        setErrors({ name: [MENSAJE_ERROR.conflict] });
        toast.error(MENSAJE_ERROR.conflict);
        return;
      }
      toast.error(mensajeDeError(res.status));
    } catch {
      toast.error(MENSAJE_ERROR.error);
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarActivacion(v: VehiculoDTO) {
    const activo = !v.activo;
    const operacion: OperacionVehiculo = activo ? "activacion" : "desactivacion";
    setCambiando(v.id);
    try {
      const res = await cambiarActivacionVehiculoAction({ id: v.id, activo });
      if (res.status === "ok") {
        toast.success(MENSAJE_EXITO[operacion]);
        await refetch();
        return;
      }
      toast.error(mensajeDeError(res.status));
    } catch {
      toast.error(MENSAJE_ERROR.error);
    } finally {
      setCambiando(null);
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="vehiculos-plataforma-encabezado">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id="vehiculos-plataforma-encabezado" className="text-base font-semibold">
            {T.encabezado}
          </h2>
          <p className="max-w-prose text-sm text-muted-foreground">{T.descripcion}</p>
        </div>
        {!formAbierto && !cargaError ? (
          <Button type="button" onClick={abrirCrear}>
            {T.crear}
          </Button>
        ) : null}
      </div>

      {cargaError ? (
        <Alert variant="destructive">
          <AlertDescription>{T.cargaError}</AlertDescription>
        </Alert>
      ) : null}

      {formAbierto ? (
        <div className="flex flex-col gap-6 rounded-md border border-border p-4">
          <h3 className="text-sm font-semibold">{editando ? T.tituloRenombre : T.tituloAlta}</h3>

          <FormField id="vehiculo-nombre" label={T.campoNombre} error={errors.name} required>
            <Input
              value={nombre}
              maxLength={VEHICULO_NOMBRE_MAX}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={T.placeholderNombre}
            />
          </FormField>

          <div className="flex items-center gap-2">
            <Button type="button" onClick={guardar} loading={guardando}>
              {guardando ? T.guardando : T.guardar}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFormAbierto(false)}
              disabled={guardando}
            >
              {T.cancelar}
            </Button>
          </div>
        </div>
      ) : null}

      {/* R2: con la carga fallida no se pinta el estado vacío; el aviso de arriba ya lo dice. */}
      {cargaError ? null : ordenados.length === 0 ? (
        <p className="rounded-md border border-border p-4 text-sm text-muted-foreground">{T.vacio}</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{T.columnaNombre}</TableHead>
              <TableHead>{T.columnaEstado}</TableHead>
              <TableHead className="text-right">{T.columnaAcciones}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {ordenados.map((v) => (
              <TableRow key={v.id}>
                <TableCell className="font-medium">{v.name}</TableCell>
                <TableCell>
                  <Badge variant={v.activo ? "success" : "secondary"}>
                    {v.activo ? T.estadoActivo : T.estadoInactivo}
                  </Badge>
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={etiquetaAccion(T.renombrar, v.name)}
                      onClick={() => abrirRenombrar(v)}
                    >
                      <Pencil aria-hidden="true" />
                      {T.renombrar}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={etiquetaAccion(v.activo ? T.desactivar : T.activar, v.name)}
                      loading={cambiando === v.id}
                      disabled={cambiando !== null}
                      onClick={() => cambiarActivacion(v)}
                    >
                      {v.activo ? <PowerOff aria-hidden="true" /> : <Power aria-hidden="true" />}
                      {v.activo ? T.desactivar : T.activar}
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </section>
  );
}
