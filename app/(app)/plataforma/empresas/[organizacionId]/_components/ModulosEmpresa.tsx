"use client";

import { useId, useState } from "react";
import type { ModuloApagable } from "@prisma/client";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/useToast";
import { MODULOS_APAGABLES } from "@/lib/modulos/catalogo";
import type { FijarModuloEmpresaResult, ModuloDeEmpresa } from "@/lib/types/modulos-empresa";

export interface ModulosEmpresaProps {
  organizacionId: string;
  /** Los 3 módulos apagables en el orden de pantalla, con su estado leído en el servidor. */
  modulos: ModuloDeEmpresa[];
  /** `fijarModuloEmpresaAction`, inyectada desde la página para poder probarla. */
  fijarModulo: (input: {
    organizacionId: string;
    modulo: ModuloApagable;
    activo: boolean;
  }) => Promise<FijarModuloEmpresaResult>;
}

/** Textos del bloque, en un solo sitio para cuando llegue la i18n. */
const TEXTOS = {
  titulo: "Módulos",
  encendido: "Encendido",
  apagado: "Apagado",
  noSeCambio: (nombre: string) => `No se pudo cambiar «${nombre}». Inténtalo de nuevo.`,
  encenderTodos: "Encender todos",
  apagarTodos: "Apagar todos",
  todosEncendidos: "Todos los módulos quedaron encendidos.",
  todosApagados: "Todos los módulos quedaron apagados.",
  noSeCambiaron: (nombres: readonly string[]) =>
    `No se pudo cambiar ${nombres.map((n) => `«${n}»`).join(", ")}. Inténtalo de nuevo.`,
} as const;

/**
 * SL-23 (design §7; R8, R9) — los interruptores de los módulos apagables de una empresa. Sin modal
 * de confirmación: el cambio es reversible y no borra datos. El estado local es optimista y vuelve
 * atrás si la action no responde `ok`, para que la pantalla nunca diga algo que la base no tiene.
 */
export function ModulosEmpresa({ organizacionId, modulos, fijarModulo }: ModulosEmpresaProps) {
  const tituloId = useId();
  const toast = useToast();
  const [activos, setActivos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(modulos.map((m) => [m.clave, m.activo])),
  );
  const [pendientes, setPendientes] = useState<ReadonlySet<ModuloApagable>>(new Set());
  const [enLote, setEnLote] = useState(false);
  const todosEncendidos = modulos.every((m) => activos[m.clave] ?? m.activo);

  function marcarPendiente(clave: ModuloApagable, pendiente: boolean) {
    setPendientes((prev) => {
      const siguiente = new Set(prev);
      if (pendiente) siguiente.add(clave);
      else siguiente.delete(clave);
      return siguiente;
    });
  }

  /** Llama a la action y dice si respondió `ok`; un throw cuenta como rechazo. */
  async function fijar(clave: ModuloApagable, activo: boolean): Promise<boolean> {
    try {
      const resultado = await fijarModulo({ organizacionId, modulo: clave, activo });
      return resultado.estado === "ok";
    } catch (error) {
      // Un fallo de red o del servidor se trata como un rechazo: quien llama revierte y avisa.
      console.error("[ModulosEmpresa] fijarModulo lanzó", error);
      return false;
    }
  }

  async function alternar(modulo: ModuloDeEmpresa, activo: boolean) {
    if (enLote || pendientes.has(modulo.clave)) return;
    const anterior = activos[modulo.clave];
    setActivos((prev) => ({ ...prev, [modulo.clave]: activo }));
    marcarPendiente(modulo.clave, true);
    const ok = await fijar(modulo.clave, activo);
    marcarPendiente(modulo.clave, false);
    if (!ok) {
      setActivos((prev) => ({ ...prev, [modulo.clave]: anterior }));
      toast.error(TEXTOS.noSeCambio(modulo.nombre));
    }
  }

  /**
   * Lleva todos los módulos al mismo estado. Solo llama por los que difieren del objetivo, y cada
   * llamada deja su propio historial, igual que el interruptor. Las llamadas van EN SECUENCIA y no
   * con `Promise.allSettled`: son pocas, no se satura el servidor y el historial queda en el orden de
   * pantalla. Optimista como `alternar`: solo vuelven atrás los que no respondieron `ok`.
   */
  async function fijarTodos() {
    if (enLote || pendientes.size > 0) return;
    const objetivo = !todosEncendidos;
    const aCambiar = modulos.filter((m) => (activos[m.clave] ?? m.activo) !== objetivo);
    if (aCambiar.length === 0) return;
    setEnLote(true);
    setActivos((prev) => ({
      ...prev,
      ...Object.fromEntries(aCambiar.map((m) => [m.clave, objetivo])),
    }));
    const fallidos: ModuloDeEmpresa[] = [];
    for (const modulo of aCambiar) {
      if (!(await fijar(modulo.clave, objetivo))) fallidos.push(modulo);
    }
    if (fallidos.length > 0) {
      setActivos((prev) => ({
        ...prev,
        ...Object.fromEntries(fallidos.map((m) => [m.clave, !objetivo])),
      }));
      toast.error(TEXTOS.noSeCambiaron(fallidos.map((m) => m.nombre)));
    } else {
      toast.success(objetivo ? TEXTOS.todosEncendidos : TEXTOS.todosApagados);
    }
    setEnLote(false);
  }

  return (
    <section aria-labelledby={tituloId} className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id={tituloId} className="text-base font-semibold">
          {TEXTOS.titulo}
        </h2>
        <Button
          type="button"
          variant="outline"
          disabled={enLote || pendientes.size > 0}
          aria-busy={enLote || undefined}
          onClick={() => void fijarTodos()}
        >
          {todosEncendidos ? TEXTOS.apagarTodos : TEXTOS.encenderTodos}
        </Button>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {modulos.map((modulo) => (
          <FilaModulo
            key={modulo.clave}
            modulo={modulo}
            activo={activos[modulo.clave] ?? modulo.activo}
            pendiente={enLote || pendientes.has(modulo.clave)}
            onCambio={(activo) => void alternar(modulo, activo)}
          />
        ))}
      </ul>
    </section>
  );
}

function FilaModulo({
  modulo,
  activo,
  pendiente,
  onCambio,
}: {
  modulo: ModuloDeEmpresa;
  activo: boolean;
  pendiente: boolean;
  onCambio: (activo: boolean) => void;
}) {
  const descripcionId = useId();
  return (
    <li className="flex items-center justify-between gap-4 px-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-sm font-medium">{modulo.nombre}</span>
        <span id={descripcionId} className="text-sm text-muted-foreground">
          {MODULOS_APAGABLES[modulo.clave].descripcion}
        </span>
      </div>
      {/* El estado en texto va oculto al lector: el `switch` ya anuncia `aria-checked`, y un nombre
          que cambia al pulsarlo («Encendido»/«Apagado») confundiría. */}
      <div className="flex min-h-11 shrink-0 items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true">{activo ? TEXTOS.encendido : TEXTOS.apagado}</span>
        <Switch
          aria-label={modulo.nombre}
          aria-describedby={descripcionId}
          checked={activo}
          disabled={pendiente}
          onCheckedChange={onCambio}
        />
      </div>
    </li>
  );
}
