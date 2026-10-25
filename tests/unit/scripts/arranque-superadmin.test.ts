import { describe, it, expect, vi } from "vitest";

import { ejecutarArranque, type SalidaDelComando } from "@/scripts/arranque-superadmin";
import type {
  CrearSuperadminResultado,
  IArranqueSuperadminRepository,
} from "@/lib/interfaces/repositories/IArranqueSuperadminRepository";
import type { IArranqueSuperadminService } from "@/lib/interfaces/services/IArranqueSuperadminService";
import { ArranqueSuperadminService } from "@/lib/services/ArranqueSuperadminService";
import {
  mensajeArranqueSuperadmin,
  type ArranqueSuperadminResultado,
  type VariableArranqueSuperadmin,
} from "@/lib/types/arranque-superadmin";

// SL-32 T8 (R13, R14, R16, R17) — el punto de entrada del comando: el codigo de salida de cada
// desenlace y lo que escribe en stdout y stderr. Sin base: el servicio o su repositorio son dobles.
// Valores ficticios (`example.test`).

const PASSWORD = "Ficticia#2026x";
const EMAIL = "superadmin-ficticio@example.test";
const DOCUMENTO = "FICTICIO-000-222";

const ENTORNO: Record<VariableArranqueSuperadmin, string> = {
  SUPERADMIN_EMAIL: EMAIL,
  SUPERADMIN_PASSWORD: PASSWORD,
  SUPERADMIN_NOMBRE: "Nombre Ficticio",
  SUPERADMIN_TELEFONO: "0000000000",
  SUPERADMIN_DOCUMENTO: DOCUMENTO,
  SUPERADMIN_TIPO_DOCUMENTO: "cedula",
};

/** Una salida que guarda por separado lo que iria a stdout y a stderr. */
function salidaDoble() {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const salida: SalidaDelComando = {
    log: (t) => stdout.push(t),
    error: (t) => stderr.push(t),
  };
  return { salida, stdout, stderr };
}

function servicioQueDevuelve(resultado: ArranqueSuperadminResultado): IArranqueSuperadminService {
  return { arrancar: vi.fn(async () => resultado) };
}

function expectSinValores(texto: string) {
  for (const valor of [PASSWORD, EMAIL, DOCUMENTO]) expect(texto).not.toContain(valor);
}

const CASOS: { resultado: ArranqueSuperadminResultado; codigo: 0 | 1; stream: "stdout" | "stderr" }[] = [
  { resultado: { status: "creado" }, codigo: 0, stream: "stdout" },
  { resultado: { status: "ya_existe" }, codigo: 0, stream: "stdout" },
  {
    resultado: { status: "entrada_invalida", variables: [{ nombre: "SUPERADMIN_EMAIL", regla: "Debe ser un email valido" }] },
    codigo: 1,
    stream: "stderr",
  },
  { resultado: { status: "conflicto", campo: "email" }, codigo: 1, stream: "stderr" },
  { resultado: { status: "conflicto", campo: "documento" }, codigo: 1, stream: "stderr" },
  { resultado: { status: "catalogo_incompleto", falta: "rol" }, codigo: 1, stream: "stderr" },
  { resultado: { status: "catalogo_incompleto", falta: "tipo_identificacion" }, codigo: 1, stream: "stderr" },
];

describe("arranque-superadmin — codigo de salida y canal de cada desenlace (R13, R14, R17)", () => {
  it.each(CASOS)("$resultado.status ($resultado) sale con $codigo por $stream", async ({ resultado, codigo, stream }) => {
    const { salida, stdout, stderr } = salidaDoble();

    const obtenido = await ejecutarArranque(servicioQueDevuelve(resultado), ENTORNO, salida);

    expect(obtenido).toBe(codigo);
    const esperado = [mensajeArranqueSuperadmin(resultado)];
    expect(stream === "stdout" ? stdout : stderr).toEqual(esperado);
    expect(stream === "stdout" ? stderr : stdout).toEqual([]);
  });

  it("pasa al servicio el entorno tal cual", async () => {
    const servicio = servicioQueDevuelve({ status: "creado" });
    await ejecutarArranque(servicio, ENTORNO, salidaDoble().salida);
    expect(servicio.arrancar).toHaveBeenCalledWith(ENTORNO);
  });

  it("una excepcion sale con 1 por stderr", async () => {
    const { salida, stdout, stderr } = salidaDoble();
    const servicio: IArranqueSuperadminService = {
      arrancar: async () => {
        throw new Error("conexion rechazada");
      },
    };

    expect(await ejecutarArranque(servicio, ENTORNO, salida)).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("Fallo el arranque del superadmin (Error)");
  });
});

describe("arranque-superadmin — ni stdout ni stderr llevan la contrasena, el email ni el documento (R16)", () => {
  /** El servicio real con un repositorio doble: lo que imprime sale de los desenlaces de verdad. */
  function conRepositorio(crearSiNoExiste: IArranqueSuperadminRepository["crearSiNoExiste"]) {
    return new ArranqueSuperadminService({ crearSiNoExiste });
  }

  const DESENLACES_DEL_REPOSITORIO: CrearSuperadminResultado[] = [
    { status: "creado" },
    { status: "ya_existe" },
    { status: "conflicto", campo: "email" },
    { status: "conflicto", campo: "documento" },
    { status: "catalogo_incompleto", falta: "rol" },
    { status: "catalogo_incompleto", falta: "tipo_identificacion" },
  ];

  it.each(DESENLACES_DEL_REPOSITORIO)("desenlace $status", async (desenlace) => {
    const { salida, stdout, stderr } = salidaDoble();
    await ejecutarArranque(conRepositorio(async () => desenlace), ENTORNO, salida);
    expect(stdout.length + stderr.length).toBe(1);
    expectSinValores([...stdout, ...stderr].join("\n"));
  });

  it("entrada invalida: el email mal escrito y la contrasena debil no aparecen", async () => {
    const { salida, stdout, stderr } = salidaDoble();
    const entorno = { ...ENTORNO, SUPERADMIN_EMAIL: "no-es-email-ficticio", SUPERADMIN_PASSWORD: "debilficticia" };

    const codigo = await ejecutarArranque(conRepositorio(vi.fn()), entorno, salida);

    expect(codigo).toBe(1);
    const todo = [...stdout, ...stderr].join("\n");
    expect(todo).toContain("SUPERADMIN_EMAIL");
    expect(todo).toContain("SUPERADMIN_PASSWORD");
    expect(todo).not.toContain("no-es-email-ficticio");
    expect(todo).not.toContain("debilficticia");
    expectSinValores(todo);
  });

  it("un error de la base que lleva los datos en su mensaje no los imprime", async () => {
    const { salida, stdout, stderr } = salidaDoble();
    const fallo = Object.assign(new Error(`Key (email)=(${EMAIL}) cedula ${DOCUMENTO} pass ${PASSWORD}`), {
      code: "P2010",
    });

    const codigo = await ejecutarArranque(
      conRepositorio(async () => {
        throw fallo;
      }),
      ENTORNO,
      salida,
    );

    expect(codigo).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr).toHaveLength(1);
    expect(stderr[0]).toContain("(Error P2010)");
    expectSinValores(stderr[0]);
  });
});
