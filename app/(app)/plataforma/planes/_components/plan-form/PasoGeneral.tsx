"use client";

import { FormField } from "@/components/shared/FormField";
import { TipoCobroCampo } from "@/components/shared/TipoCobroCampo";
import { TEXTOS_TIPO_COBRO } from "@/components/shared/tipo-cobro";
import { Input } from "@/components/ui/input";
import { RadioGroup } from "@/components/ui/radio-group";
import { Select, type SelectOption } from "@/components/ui/select";
import type { RangoDelInicioDelCiclo } from "@/lib/planes/ciclo";

import type { EmpresaParaCustom, PropsDelPaso } from "./estado";
import { TEXTOS_PLAN_FORM } from "./textos";

export type PasoGeneralProps = PropsDelPaso & {
  /** Al crear: las empresas del custom; `null` si no se pudieron leer. Al editar no se usan. */
  empresas: EmpresaParaCustom[] | null;
  /** Al crear: los `min`/`max` de «Inicio del período» y de «Rige desde» (SLT-58 R30, SLT-86 R16). */
  rangos: { inicioCiclo: RangoDelInicioDelCiclo; fechaDeEfecto: RangoDelInicioDelCiclo } | null;
  pideInicioCiclo: boolean;
  pideFechaDeEfecto: boolean;
  /** SLT-86 (R25): las dos líneas del primer período o tramo del custom; vacío si aún no se pueden calcular. */
  lineasDelPrimerPeriodo: readonly string[];
};

/**
 * SLT-130 (R8, R9) — paso General: Nombre y Visibilidad. Al crear un custom, además Empresa, Tipo de
 * cobro y la fecha que pide la empresa (planes-custom D4, SLT-86 R16/R25). Al editar, la visibilidad se
 * ve pero no se cambia (SL-24 R2) y no viaja a la action.
 */
export function PasoGeneral({
  modo,
  form,
  cambiar,
  setForm,
  idDe,
  errorDe,
  plan,
  empresas,
  rangos,
  pideInicioCiclo,
  pideFechaDeEfecto,
  lineasDelPrimerPeriodo,
}: PasoGeneralProps) {
  const opcionesEmpresa: SelectOption[] = (empresas ?? []).map((e) => ({ value: e.id, label: e.nombre }));
  const idSinEmpresas = idDe("sin-empresas");
  const editando = modo === "editar";
  const custom = modo === "crear" && form.visibilidad === "custom";

  return (
    <div className="flex flex-col gap-6">
      <FormField id={idDe("nombre")} label={TEXTOS_PLAN_FORM.nombre} error={errorDe("nombre")} required>
        <Input value={form.nombre} onChange={(ev) => cambiar("nombre", ev.target.value)} maxLength={80} />
      </FormField>

      <div className="flex flex-col gap-4">
        <FormField
          id={idDe("visibilidad")}
          label={TEXTOS_PLAN_FORM.visibilidad}
          hint={editando ? TEXTOS_PLAN_FORM.visibilidadFija : undefined}
          error={errorDe("visibilidad")}
        >
          {(control) => (
            // El `id` va en el contenedor para poder llevar el foco al grupo si tiene error.
            <div id={control.id}>
              <RadioGroup
                aria-label={TEXTOS_PLAN_FORM.visibilidad}
                aria-invalid={control["aria-invalid"]}
                aria-describedby={control["aria-describedby"]}
                value={editando && plan !== null ? plan.visibilidad : form.visibilidad}
                disabled={editando}
                onValueChange={(v) => cambiar("visibilidad", v === "custom" ? "custom" : "publico")}
                options={[
                  { value: "publico", label: TEXTOS_PLAN_FORM.publico },
                  { value: "custom", label: TEXTOS_PLAN_FORM.custom },
                ]}
              />
            </div>
          )}
        </FormField>
        {custom ? (
          <FormField id={idDe("organizacionId")} label={TEXTOS_PLAN_FORM.empresa} error={errorDe("organizacionId")}>
            {(control) => (
              <>
                <Select
                  id={control.id}
                  aria-label={TEXTOS_PLAN_FORM.empresa}
                  aria-invalid={control["aria-invalid"]}
                  aria-describedby={
                    [control["aria-describedby"], empresas === null ? idSinEmpresas : undefined]
                      .filter(Boolean)
                      .join(" ") || undefined
                  }
                  value={form.organizacionId}
                  options={opcionesEmpresa}
                  placeholder={TEXTOS_PLAN_FORM.empresaPlaceholder}
                  onValueChange={(v) =>
                    // SLT-86 (R25): «Rige desde» propone el siguiente período de la empresa elegida.
                    setForm((f) => ({
                      ...f,
                      organizacionId: v,
                      vigenteDesde: (empresas ?? []).find((e) => e.id === v)?.fechaDeEfectoPorDefecto ?? "",
                    }))
                  }
                />
                {empresas === null ? (
                  <p id={idSinEmpresas} className="text-sm text-danger-strong">
                    {TEXTOS_PLAN_FORM.sinEmpresas}
                  </p>
                ) : null}
              </>
            )}
          </FormField>
        ) : null}
      </div>

      {/* Ajuste planes-custom (D2, D4–D6): el custom se asigna a su empresa al crearlo. */}
      {custom ? (
        <div className="flex flex-col gap-4">
          <TipoCobroCampo
            id={idDe("tipoCobro")}
            value={form.tipoCobro}
            onValueChange={(t) => cambiar("tipoCobro", t)}
            error={errorDe("tipoCobro")}
          />
          {pideInicioCiclo ? (
            <FormField
              id={idDe("inicioCiclo")}
              label={TEXTOS_PLAN_FORM.inicioCiclo}
              hint={TEXTOS_PLAN_FORM.inicioCicloAyuda}
              error={errorDe("inicioCiclo")}
            >
              <Input
                type="date"
                value={form.inicioCiclo}
                min={rangos?.inicioCiclo.min}
                max={rangos?.inicioCiclo.max}
                onChange={(ev) => cambiar("inicioCiclo", ev.target.value)}
              />
            </FormField>
          ) : null}
          {pideFechaDeEfecto ? (
            <FormField
              id={idDe("vigenteDesde")}
              label={TEXTOS_TIPO_COBRO.rigeDesde}
              hint={TEXTOS_TIPO_COBRO.ayudaCambioDeEmpresa}
              error={errorDe("vigenteDesde")}
            >
              <Input
                type="date"
                value={form.vigenteDesde}
                min={rangos?.fechaDeEfecto.min}
                max={rangos?.fechaDeEfecto.max}
                onChange={(ev) => cambiar("vigenteDesde", ev.target.value)}
              />
            </FormField>
          ) : null}
          {/* SLT-86 (R25): el costo base del primer período o tramo que abrirá la asignación. */}
          {lineasDelPrimerPeriodo.length > 0 ? <ListaDelPrimerPeriodo lineas={lineasDelPrimerPeriodo} /> : null}
        </div>
      ) : null}
    </div>
  );
}

/** SLT-86 (R25): la lista del primer período del custom; la repite «Revisar y crear» (R22). */
export function ListaDelPrimerPeriodo({ lineas }: { lineas: readonly string[] }) {
  return (
    <ul className="flex flex-col gap-1 text-sm">
      {lineas.map((l) => (
        <li key={l}>{l}</li>
      ))}
    </ul>
  );
}
