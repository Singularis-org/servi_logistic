import { describe, expect, it } from "vitest";

import {
  fechaHora,
  formDelBorrador,
  pasoInicial,
  valoresDelPaso,
} from "@/app/(app)/plataforma/planes/_components/plan-form/borrador";
import {
  inicial,
  PASOS_QUE_SE_GUARDAN,
  type CamposVisibles,
  type Formulario,
  type IdPasoGuardable,
  type ModoDelPlanForm,
} from "@/app/(app)/plataforma/planes/_components/plan-form/estado";
import { ESQUEMAS_DE_CREAR, ESQUEMAS_DE_EDITAR } from "@/lib/types/plan-borrador";
import type { PlanDTO } from "@/lib/types/planes";

// SLT-144 (design §4.2; R2, R15) — del formulario al borrador y de vuelta, puro.

const EMPRESA = "6f1c1e0a-3b5d-4c6e-8f7a-9b0c1d2e3f4a";

const PLAN: PlanDTO = {
  id: "8a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d",
  nombre: "Básico",
  visibilidad: "publico",
  organizacionId: null,
  topes: { porRol: { admin: 1, mensajero: 5 }, apiKeys: 2 },
  modulos: ["ranking", "analitica"],
  precio: { tipo: "sin_precio" },
  costoPorOrden: "300.00",
  costoPorOrdenPorcentual: null,
  periodicidadOrdenes: "quincenal",
  archivado: false,
};

const SIN_EXTRAS: CamposVisibles = { pideInicioCiclo: false, pideFechaDeEfecto: false, cambiaPrecio: false };

const baseDe = (modo: ModoDelPlanForm): Formulario =>
  modo === "crear" ? inicial(null, "2026-12-01", "") : inicial(PLAN, "", "2026-11-18");

/**
 * Ida y vuelta de un paso: los valores que salen del formulario, cargados sobre la base, vuelven a dar los
 * mismos valores. Además pasan el esquema del paso que usa el servidor, así que es lo que se guardaría.
 */
function idaYVuelta(modo: ModoDelPlanForm, paso: IdPasoGuardable, escrito: Formulario, visibles = SIN_EXTRAS) {
  const ida = valoresDelPaso(modo, paso, escrito, visibles);
  const esquemas: Record<string, { safeParse: (v: unknown) => { success: boolean } }> =
    modo === "crear" ? ESQUEMAS_DE_CREAR : ESQUEMAS_DE_EDITAR;
  expect(esquemas[paso]?.safeParse(ida).success).toBe(true);
  const cargado = formDelBorrador(baseDe(modo), { [paso]: ida });
  expect(valoresDelPaso(modo, paso, cargado, visibles)).toEqual(ida);
  return { ida, cargado };
}

describe("SLT-144 — valoresDelPaso y formDelBorrador", () => {
  it("R2: cada paso, ida y vuelta, al crear y al editar", () => {
    for (const modo of ["crear", "editar"] as const) {
      const f: Formulario = {
        ...baseDe(modo),
        nombre: "Pro",
        precio: "monto",
        mensual: "1500",
        descuentos: [
          { periodo: "anual", forma: "porcentaje", valor: "10" },
          { periodo: "quincenal", forma: "monto", valor: "12.50" },
        ],
        modoCosto: "fijo",
        costoPorOrden: "250",
        periodicidadOrdenes: "mensual",
        porRol: { admin: "3", mensajero: "", adminTienda: "0", adminSatelite: "7" },
        apiKeys: "",
        modulos: ["ranking", "analitica"],
      };

      expect(idaYVuelta(modo, "general", f).cargado.nombre).toBe("Pro");

      // La lista de descuentos va en el orden de pantalla, con su período, tipo y valor.
      const precio = idaYVuelta(modo, "precio", f);
      expect(precio.ida).toEqual({
        precio: {
          tipo: "monto",
          mensual: "1500",
          descuentos: [
            { periodo: "anual", tipo: "porcentaje", valor: "10" },
            { periodo: "quincenal", tipo: "monto", valor: "12.50" },
          ],
        },
      });
      expect(precio.cargado.descuentos).toEqual(f.descuentos);
      expect(idaYVuelta(modo, "precio", { ...f, precio: "sin_precio" }).ida).toEqual({
        precio: { tipo: "sin_precio" },
      });

      // Los dos modos de cobro por orden.
      const fijo = idaYVuelta(modo, "orden", f);
      expect(fijo.ida).toEqual({ costoPorOrden: "250", costoPorOrdenPorcentual: null, periodicidadOrdenes: "mensual" });
      expect(fijo.cargado.modoCosto).toBe("fijo");
      const porcentual = idaYVuelta(modo, "orden", {
        ...f,
        modoCosto: "porcentual",
        porcentajePorOrden: "2.5",
        minimoPorOrden: "100",
      });
      expect(porcentual.ida).toEqual({
        costoPorOrden: null,
        costoPorOrdenPorcentual: { porcentaje: "2.5", minimo: "100" },
        periodicidadOrdenes: "mensual",
      });
      expect(porcentual.cargado.modoCosto).toBe("porcentual");
      expect(
        idaYVuelta(modo, "orden", { ...f, modoCosto: "porcentual", porcentajePorOrden: "3", minimoPorOrden: "" }).ida,
      ).toMatchObject({ costoPorOrdenPorcentual: { porcentaje: "3", minimo: null } });

      const topes = idaYVuelta(modo, "topes", f);
      expect(topes.ida).toEqual({ topes: { porRol: { admin: 3, adminTienda: 0, adminSatelite: 7 }, apiKeys: null } });
      expect(topes.cargado.porRol).toEqual(f.porRol);

      // En el orden del catálogo, sea cual sea el orden en que se marcaron.
      expect(idaYVuelta(modo, "modulos", f).ida).toEqual({ modulos: ["analitica", "ranking"] });
    }
  });

  it("R2: General al crear, público y custom con empresa sin plan y con plan", () => {
    const publico = idaYVuelta("crear", "general", { ...baseDe("crear"), nombre: "Pro" });
    expect(publico.ida).toEqual({ nombre: "Pro", visibilidad: "publico", organizacionId: null });

    const custom: Formulario = {
      ...baseDe("crear"),
      nombre: "Acme a medida",
      visibilidad: "custom",
      organizacionId: EMPRESA,
      tipoCobro: "bimestral",
      inicioCiclo: "2026-12-05",
      vigenteDesde: "2027-01-01",
    };
    const sinPlan = idaYVuelta("crear", "general", custom, { ...SIN_EXTRAS, pideInicioCiclo: true });
    expect(sinPlan.ida).toEqual({
      nombre: "Acme a medida",
      visibilidad: "custom",
      organizacionId: EMPRESA,
      tipoCobro: "bimestral",
      inicioCiclo: "2026-12-05",
    });
    expect(sinPlan.cargado).toMatchObject({ visibilidad: "custom", organizacionId: EMPRESA, tipoCobro: "bimestral" });

    const conPlan = idaYVuelta("crear", "general", custom, { ...SIN_EXTRAS, pideFechaDeEfecto: true });
    expect(conPlan.ida).toEqual({
      nombre: "Acme a medida",
      visibilidad: "custom",
      organizacionId: EMPRESA,
      tipoCobro: "bimestral",
      vigenteDesde: "2027-01-01",
    });
    expect(conPlan.cargado.vigenteDesde).toBe("2027-01-01");
  });

  it("R2: General al editar es solo el nombre", () => {
    expect(idaYVuelta("editar", "general", { ...baseDe("editar"), nombre: "Básico 2" }).ida).toEqual({
      nombre: "Básico 2",
    });
  });

  // SLT-135 (R15): sin «De inmediato», la vigencia siempre es una fecha; al editar abre con mañana.
  it("R15: vigencia ida y vuelta con fecha, cambie o no el precio", () => {
    const base = baseDe("editar");
    expect(base).toMatchObject({ precioDesde: "2026-11-18", vigenteDesde: "2026-11-18" });
    expect(inicial(null, "2026-12-01", "2026-11-18").vigenteDesde).toBe("");

    const conPrecio = idaYVuelta(
      "editar",
      "vigencia",
      { ...base, precioDesde: "2026-12-01" },
      { ...SIN_EXTRAS, cambiaPrecio: true },
    );
    expect(conPrecio.ida).toEqual({ vigenteDesde: "2026-12-01" });

    expect(conPrecio.cargado).toMatchObject({ precioDesde: "2026-12-01", vigenteDesde: "2026-12-01" });

    const sinPrecio = idaYVuelta("editar", "vigencia", { ...base, vigenteDesde: "2026-12-15" });
    expect(sinPrecio.ida).toEqual({ vigenteDesde: "2026-12-15" });
    expect(sinPrecio.cargado).toMatchObject({ precioDesde: "2026-12-15", vigenteDesde: "2026-12-15" });

    // Sin tocar la fecha viaja la de por defecto, mañana.
    expect(valoresDelPaso("editar", "vigencia", base, SIN_EXTRAS)).toEqual({ vigenteDesde: "2026-11-18" });
  });

  it("R2: un paso sin guardar deja la base y los guardados van encima", () => {
    const base = baseDe("editar");
    const cargado = formDelBorrador(base, { general: { nombre: "Otro" }, modulos: { modulos: ["monitoreo"] } });
    expect(cargado).toEqual({ ...base, nombre: "Otro", modulos: ["monitoreo"] });
  });
});

// SLT-214 «Planes: beneficios de texto con ícono» (design §4.3; R8, R11, R13).
describe("SLT-214 — el paso «Beneficios»", () => {
  const CUATRO: Formulario["beneficios"] = [
    { clave: "a", icono: "soporte", texto: "  Soporte 24 h " },
    { clave: "b", icono: "rayo", texto: "Acceso anticipado" },
    { clave: "c", icono: "check", texto: "Features nuevas" },
    { clave: "d", icono: "corazon", texto: "Equipo dedicado" },
  ];

  it("R11: ida y vuelta en los dos modos, en su orden, con texto e ícono y sin la clave local", () => {
    for (const modo of ["crear", "editar"] as const) {
      const { ida, cargado } = idaYVuelta(modo, "beneficios", { ...baseDe(modo), beneficios: CUATRO });
      // R8: el orden de pantalla es el que se guarda; el texto viaja sin los espacios de los extremos (R2).
      expect(ida).toEqual({
        beneficios: [
          { icono: "soporte", texto: "Soporte 24 h" },
          { icono: "rayo", texto: "Acceso anticipado" },
          { icono: "check", texto: "Features nuevas" },
          { icono: "corazon", texto: "Equipo dedicado" },
        ],
      });
      expect(cargado.beneficios.map(({ icono, texto }) => [icono, texto])).toEqual([
        ["soporte", "Soporte 24 h"],
        ["rayo", "Acceso anticipado"],
        ["check", "Features nuevas"],
        ["corazon", "Equipo dedicado"],
      ]);
      // Las claves locales son nuevas y distintas: el `key` de cada fila.
      expect(new Set(cargado.beneficios.map((b) => b.clave)).size).toBe(4);
    }
  });

  it("R9, R11: la lista vacía también va y vuelve", () => {
    for (const modo of ["crear", "editar"] as const) {
      const vacia = idaYVuelta(modo, "beneficios", { ...baseDe(modo), beneficios: [] });
      expect(vacia.ida).toEqual({ beneficios: [] });
      expect(vacia.cargado.beneficios).toEqual([]);
    }
  });

  it("R11: un borrador guardado con beneficios pisa los del plan; sin el paso, quedan los del plan (R13)", () => {
    const plan: PlanDTO = { ...PLAN, beneficios: [{ icono: "estrella", texto: "Novedades" }] };
    const base = inicial(plan, "", "2026-11-18");
    expect(base.beneficios.map(({ icono, texto }) => ({ icono, texto }))).toEqual(plan.beneficios);
    expect(formDelBorrador(base, { general: { nombre: "Otro" } }).beneficios).toBe(base.beneficios);
    const cargado = formDelBorrador(base, { beneficios: { beneficios: [{ icono: "camion", texto: "Envíos" }] } });
    expect(cargado.beneficios.map(({ icono, texto }) => ({ icono, texto }))).toEqual([{ icono: "camion", texto: "Envíos" }]);
  });

  it("R13: al crear, sin beneficios; un plan sin la clave `beneficios` es un plan sin beneficios", () => {
    expect(inicial(null, "2026-12-01", "").beneficios).toEqual([]);
    expect(inicial(PLAN, "", "2026-11-18").beneficios).toEqual([]);
  });
});

// SLT-215 «Planes: niveles de beneficio por volumen de órdenes» (design §4.2; R8, R11, R13).
describe("SLT-215 — el paso «Niveles»", () => {
  const TRES: Formulario["niveles"] = [
    { clave: "a", meta: " 100 ", tipo: "porcentaje", valor: "10" },
    { clave: "b", meta: "500", tipo: "monto", valor: "1500" },
    { clave: "c", meta: "15000", tipo: "porcentaje", valor: "12.5" },
  ];

  it("R11: ida y vuelta en los dos modos, en su orden, con meta y descuento y sin la clave local", () => {
    for (const modo of ["crear", "editar"] as const) {
      const { ida, cargado } = idaYVuelta(modo, "niveles", { ...baseDe(modo), niveles: TRES });
      // R8: el orden de pantalla es el que se guarda; la meta viaja como número.
      expect(ida).toEqual({
        niveles: [
          { meta: 100, descuento: { tipo: "porcentaje", porcentaje: "10" } },
          { meta: 500, descuento: { tipo: "monto", monto: "1500" } },
          { meta: 15000, descuento: { tipo: "porcentaje", porcentaje: "12.5" } },
        ],
      });
      expect(cargado.niveles.map(({ meta, tipo, valor }) => [meta, tipo, valor])).toEqual([
        ["100", "porcentaje", "10"],
        ["500", "monto", "1500"],
        ["15000", "porcentaje", "12.5"],
      ]);
      expect(new Set(cargado.niveles.map((n) => n.clave)).size).toBe(3);
    }
  });

  it("R9, R11: la lista vacía también va y vuelve", () => {
    for (const modo of ["crear", "editar"] as const) {
      const vacia = idaYVuelta(modo, "niveles", { ...baseDe(modo), niveles: [] });
      expect(vacia.ida).toEqual({ niveles: [] });
      expect(vacia.cargado.niveles).toEqual([]);
    }
  });

  it("R3: una meta que no es un entero viaja como NaN y el esquema la marca en su campo", () => {
    const ida = valoresDelPaso("crear", "niveles", {
      ...baseDe("crear"),
      niveles: [{ clave: "a", meta: "1.5", tipo: "porcentaje", valor: "10" }],
    }, SIN_EXTRAS) as { niveles: { meta: number }[] };
    expect(ida.niveles[0]!.meta).toBeNaN();
    const r = ESQUEMAS_DE_CREAR.niveles.safeParse(ida);
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path.join("."))).toEqual(["niveles.0.meta"]);
  });

  it("R11: un borrador con niveles pisa los del plan; sin el paso, quedan los del plan (R13)", () => {
    const plan: PlanDTO = {
      ...PLAN,
      niveles: [
        { meta: 10, descuento: { tipo: "monto", monto: "250.00" } },
        { meta: 20, descuento: { tipo: "porcentaje", porcentaje: "5.00" } },
      ],
    };
    const base = inicial(plan, "", "2026-11-18");
    // R13: los vigentes del plan, con el monto como se escribe en el campo.
    expect(base.niveles.map(({ meta, tipo, valor }) => [meta, tipo, valor])).toEqual([
      ["10", "monto", "250"],
      ["20", "porcentaje", "5.00"],
    ]);
    expect(formDelBorrador(base, { general: { nombre: "Otro" } }).niveles).toBe(base.niveles);
    const cargado = formDelBorrador(base, {
      niveles: { niveles: [{ meta: 7, descuento: { tipo: "porcentaje", porcentaje: "3" } }] },
    });
    expect(cargado.niveles.map(({ meta, tipo, valor }) => [meta, tipo, valor])).toEqual([["7", "porcentaje", "3"]]);
  });

  it("R13: al crear, sin niveles; un plan sin la clave `niveles` es un plan sin niveles", () => {
    expect(inicial(null, "2026-12-01", "").niveles).toEqual([]);
    expect(inicial(PLAN, "", "2026-11-18").niveles).toEqual([]);
  });
});

describe("SLT-144 — pasoInicial", () => {
  it("R15: el primer paso sin guardar, o Revisar con todos guardados", () => {
    expect(pasoInicial("crear", new Set())).toBe("general");
    expect(pasoInicial("crear", new Set<IdPasoGuardable>(["general", "precio", "orden"]))).toBe("topes");
    expect(pasoInicial("editar", new Set<IdPasoGuardable>(["general", "orden"]))).toBe("precio");
    expect(pasoInicial("crear", new Set(PASOS_QUE_SE_GUARDAN("crear")))).toBe("revisar");
    expect(pasoInicial("editar", new Set<IdPasoGuardable>(PASOS_QUE_SE_GUARDAN("crear")))).toBe("vigencia");
    expect(pasoInicial("editar", new Set(PASOS_QUE_SE_GUARDAN("editar")))).toBe("revisar");
  });

  it("R7: los pasos que se guardan son todos menos Revisar, con Cuándo rige solo al editar", () => {
    // SLT-214 (R7): «Beneficios» justo después de «Módulos». SLT-215 (R7): «Niveles» justo después de «Beneficios».
    expect(PASOS_QUE_SE_GUARDAN("crear")).toEqual([
      "general",
      "precio",
      "orden",
      "topes",
      "modulos",
      "beneficios",
      "niveles",
    ]);
    expect(PASOS_QUE_SE_GUARDAN("editar")).toEqual([
      "general",
      "precio",
      "orden",
      "topes",
      "modulos",
      "beneficios",
      "niveles",
      "vigencia",
    ]);
  });
});

describe("SLT-144 — fechaHora", () => {
  it("escribe AAAA-MM-DD HH:mm en la hora de la plataforma y deja igual un texto que no es fecha", () => {
    expect(fechaHora("2026-11-08T01:55:00Z")).toBe("2026-11-07 19:55");
    expect(fechaHora("no es fecha")).toBe("no es fecha");
  });
});
