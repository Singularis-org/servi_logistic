import { useId, type ReactNode } from "react";

/** R23: el texto por defecto cuando el país no tiene prefijo o dígitos cargados. */
export const AVISO_SIN_PREFIJO = "El país de la empresa no tiene prefijo telefónico cargado.";

export interface PrefijoTelefonicoProps {
  /** Prefijo internacional sin `+`, del país de la empresa. `null` = el país no lo tiene (R23). */
  prefijo: string | null;
  /** El `Input` del teléfono. */
  children: ReactNode;
  /** Texto del aviso de R23; se puede reemplazar (i18n). */
  avisoSinPrefijo?: ReactNode;
  /**
   * `false` cuando todavía no hay país del que hablar (el alta de empresa antes de elegirlo): sin
   * prefijo y sin aviso. Por defecto `true`.
   */
  mostrarAviso?: boolean;
  /** Id del aviso, para enlazarlo desde el `aria-describedby` del control si se quiere. */
  avisoId?: string;
}

/**
 * SLT-81 (design §7.1; R18, R20, R21, R23) — el adorno `+<prefijo>` delante del teléfono.
 *
 * Es solo presentación: el prefijo llega de quien conoce el país (el proveedor del portal o la lista
 * de países del alta de empresa). Sin prefijo no se pinta el de ningún otro país: se pinta el
 * teléfono solo y un aviso con `role="note"`, porque describe el dato cargado, no interrumpe.
 *
 * La forma del árbol no cambia con el prefijo (huecos condicionales en posiciones fijas): así el
 * `Input` no se remonta al elegir o cambiar de país y no pierde el foco.
 */
export function PrefijoTelefonico({
  prefijo,
  children,
  avisoSinPrefijo,
  mostrarAviso = true,
  avisoId,
}: PrefijoTelefonicoProps) {
  const idPropio = useId();
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {prefijo ? (
          <span
            data-testid="prefijo-telefonico"
            className="shrink-0 rounded-lg border border-input bg-muted px-2 py-1 text-sm text-muted-foreground"
          >
            {`+${prefijo}`}
          </span>
        ) : null}
        {children}
      </div>
      {!prefijo && mostrarAviso ? (
        <p id={avisoId ?? idPropio} role="note" className="text-xs text-muted-foreground">
          {avisoSinPrefijo ?? AVISO_SIN_PREFIJO}
        </p>
      ) : null}
    </div>
  );
}
