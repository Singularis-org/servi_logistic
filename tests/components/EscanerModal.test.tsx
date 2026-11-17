// @vitest-environment jsdom
import { useEffect } from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { ESCANER_LABEL_GUIA, EscanerModal } from "@/components/shared/EscanerModal";
import { EscanerGuiaCard } from "@/components/shared/EscanerGuiaCard";

// La tarjeta REAL (R571 con la tarjeta de verdad) monta `QrScanner`, que pide un toast.
vi.mock("@/hooks/useToast", () => ({
  useToast: () => ({
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    show: vi.fn(),
    dismiss: vi.fn(),
  }),
}));

// El disparador de la tarjeta de escaneo: la abre en un MODAL y la cierra. Lo que se fija
// aquí es el CONTRATO (texto del disparador, montaje/desmontaje del contenido y las acciones
// que lo acompañan).
//
// Este archivo viene de `EscanerDesplegable.test.tsx` (y antes de `ReceptorDesplegable`): el
// 2026-08-10 el envoltorio pasó de plegarse en línea a abrirse en modal, y el texto del
// disparador ganó un valor por defecto ("Recibir paquete"). Lo que NO cambió es lo único que
// de verdad importa aquí: cerrar DESMONTA, que es lo que apaga la cámara.

afterEach(() => cleanup());

describe("EscanerModal", () => {
  // SLT-156 «PWA de los mensajeros: tablas usables en el móvil» (A6; R500): el disparador único de
  // las pantallas del mensajero. El texto es el contrato (aprobado por Carlos): va tecleado.
  it("R500: con la etiqueta «Escanear o escribir guía» arranca cerrado y abre al pulsar", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal label={ESCANER_LABEL_GUIA} titulo="Abrir orden por guía">
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    const disparador = screen.getByRole("button", { name: "Escanear o escribir guía" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("tarjeta de escaneo")).toBeNull();

    await user.click(disparador);
    expect(screen.getByRole("dialog", { name: "Abrir orden por guía" })).toBeInTheDocument();
    expect(screen.getByText("tarjeta de escaneo")).toBeInTheDocument();
  });

  it("arranca cerrado: el contenido no está montado", () => {
    render(
      <EscanerModal titulo="Recibir paquete">
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    expect(
      screen.getByRole("button", { name: "Recibir paquete" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("tarjeta de escaneo")).toBeNull();
  });

  it("SLT-160 (R604): con `soloIcono` el disparador es un icono con `label` de nombre; abre igual", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal label="Escanear con cámara" titulo="Escanear con cámara" soloIcono>
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    const boton = screen.getByRole("button", { name: "Escanear con cámara" });
    expect(boton).toHaveTextContent("");
    expect(screen.queryByText("tarjeta de escaneo")).toBeNull();

    await user.click(boton);
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Escanear con cámara");
    expect(screen.getByText("tarjeta de escaneo")).toBeInTheDocument();
  });

  it("al pulsar abre el modal con el contenido dentro", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal titulo="Recibir paquete">
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

    const modal = await screen.findByRole("dialog");
    expect(modal).toHaveAccessibleName("Recibir paquete");
    expect(screen.getByText("tarjeta de escaneo")).toBeInTheDocument();
  });

  it("cada superficie puede nombrar su propio acto en el disparador", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal label="Recolectar en tienda" titulo="Recolectar en tienda">
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    // El valor por defecto es "Recibir paquete", el acto de las superficies de recepción.
    // `/recoleccion` no recibe: pasa el suyo y no hereda el vocabulario ajeno.
    expect(screen.queryByRole("button", { name: /Recibir paquete/ })).toBeNull();
    await user.click(
      screen.getByRole("button", { name: /Recolectar en tienda/ }),
    );

    expect(await screen.findByRole("dialog")).toHaveAccessibleName(
      "Recolectar en tienda",
    );
  });

  it("las acciones acompañan al disparador y no dependen de que esté abierto", () => {
    render(
      <EscanerModal titulo="Recibir paquete" acciones={<button type="button">Carga masiva</button>}>
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    expect(
      screen.getByRole("button", { name: "Carga masiva" }),
    ).toBeInTheDocument();
  });

  it("al cerrar, el contenido se DESMONTA (no queda oculto con la cámara viva)", async () => {
    const user = userEvent.setup();
    render(
      <EscanerModal titulo="Recibir paquete">
        <p>tarjeta de escaneo</p>
      </EscanerModal>,
    );

    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
    expect(await screen.findByText("tarjeta de escaneo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Cerrar/ }));

    await vi.waitFor(() =>
      expect(screen.queryByText("tarjeta de escaneo")).toBeNull(),
    );
  });

  it("cerrar corre el CLEANUP del hijo: es lo que apaga la cámara", async () => {
    const user = userEvent.setup();
    const apagarCamara = vi.fn();
    // Doble mínimo de `QrScanner`: lo que apaga la cámara de verdad es el cleanup de su
    // efecto, y ese solo corre si el contenido se DESMONTA. Si algún día el modal pasara a
    // quedarse montado (`keepMounted`), el contenido seguiría vivo y este caso lo delataría
    // — que es exactamente el defecto que este envoltorio vino a cerrar.
    function CamaraFalsa() {
      useEffect(() => apagarCamara, []);
      return <span>cámara</span>;
    }

    render(
      <EscanerModal titulo="Recibir paquete">
        <CamaraFalsa />
      </EscanerModal>,
    );

    // Cerrado de entrada: la cámara ni siquiera llegó a montarse.
    expect(screen.queryByText("cámara")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));
    expect(await screen.findByText("cámara")).toBeInTheDocument();
    expect(apagarCamara).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /Cerrar/ }));

    await vi.waitFor(() => expect(apagarCamara).toHaveBeenCalled());
    expect(screen.queryByText("cámara")).toBeNull();
  });
});

// SLT-158 «Entrada de escaneo para pistola» (R571, D1): con puntero fino (escritorio, pistola)
// el foco inicial cae en el campo de la guía, para que la pistola escriba ahí sin un clic
// previo; con puntero táctil no, porque en el teléfono abriría el teclado sobre el visor.
describe("EscanerModal — foco inicial según el puntero (SLT-158)", () => {
  const matchMediaOriginal = window.matchMedia;

  function conPuntero(fino: boolean) {
    window.matchMedia = ((consulta: string) => ({
      matches: fino && consulta === "(pointer: fine)",
      media: consulta,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;
  }

  afterEach(() => {
    window.matchMedia = matchMediaOriginal;
  });

  // Un botón ANTES del campo: así el foco en el campo no es el "primer tabulable" por defecto
  // del Dialog, sino la elección del modal.
  const tarjeta = (
    <div>
      <button type="button">Escanear con cámara</button>
      <input aria-label="Número de guía" data-escaner-campo="" />
    </div>
  );

  it("R571: con puntero fino, al abrir el foco queda en el campo «Número de guía»", async () => {
    conPuntero(true);
    const user = userEvent.setup();
    render(<EscanerModal titulo="Recibir paquete">{tarjeta}</EscanerModal>);

    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

    const campo = await screen.findByLabelText("Número de guía");
    await vi.waitFor(() => expect(document.activeElement).toBe(campo));
  });

  // Review de SLT-158, M7: con la tarjeta REAL. Si `EscanerGuiaCard` perdiera la marca
  // `data-escaner-campo` de su campo, el modal no lo encontraría y este caso se pondría rojo.
  it("R571: con la EscanerGuiaCard real y puntero fino, el foco queda en su campo", async () => {
    conPuntero(true);
    const user = userEvent.setup();
    render(
      <EscanerModal titulo="Recibir paquete">
        {/* Un tabulable ANTES de la tarjeta: sin él, el campo sería el primero y el foco por
            defecto del Dialog ya caería ahí, con o sin la marca. */}
        <button type="button">Antes de la tarjeta</button>
        <EscanerGuiaCard
          titulo="Recibir paquete"
          descripcion="Escanea o ingresa el número de guía"
          onDecoded={() => ({ tipo: "acierto" })}
          manual={{ onSubmit: () => ({ tipo: "acierto" }), submitLabel: "Recibir" }}
        />
      </EscanerModal>,
    );

    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

    const campo = await screen.findByLabelText("Número de guía");
    await vi.waitFor(() => expect(document.activeElement).toBe(campo));
  });

  it("R571: con puntero táctil, al abrir el foco NO va al campo", async () => {
    conPuntero(false);
    const user = userEvent.setup();
    render(<EscanerModal titulo="Recibir paquete">{tarjeta}</EscanerModal>);

    await user.click(screen.getByRole("button", { name: "Recibir paquete" }));

    const campo = await screen.findByLabelText("Número de guía");
    // Se espera a que el Dialog asiente su foco inicial antes de afirmar dónde NO está.
    await vi.waitFor(() =>
      expect(screen.getByRole("dialog").contains(document.activeElement)).toBe(true),
    );
    expect(document.activeElement).not.toBe(campo);
  });
});

// SLT-193 «Botones de 44 px pendientes en la PWA del mensajero» (R925, R926, R929; sustituye el R871
// de SLT-190 «Recoger y Recolección según el canvas»): el escáner es UN solo componente. Sea cual sea
// el disparador, el diálogo pinta arriba la barra con el título VISIBLE y un único «Cerrar» de 44 × 44
// px; la X pequeña del `Dialog` no aparece. jsdom no aplica Tailwind: se afirman las clases.
const DISPARADORES = [
  { caso: "tactil", props: { tactil: true }, nombre: ESCANER_LABEL_GUIA },
  { caso: "soloIcono", props: { soloIcono: true }, nombre: ESCANER_LABEL_GUIA },
  { caso: "por defecto", props: {}, nombre: ESCANER_LABEL_GUIA },
] as const;

describe("SLT-193 — la barra con título y «Cerrar» de 44 px es de EscanerModal, para todos", () => {
  it.each(DISPARADORES)(
    "R925/R926: con el disparador $caso, un solo «Cerrar» de 44 px (`size-11`) en la barra con el título visible; cierra y desmonta",
    async ({ props, nombre }) => {
      const user = userEvent.setup();
      render(
        <EscanerModal label={nombre} titulo="Recoger paquete" {...props}>
          <p>tarjeta de escaneo</p>
        </EscanerModal>,
      );
      await user.click(screen.getByRole("button", { name: nombre }));

      const dialogo = screen.getByRole("dialog", { name: "Recoger paquete" });
      const titulo = within(dialogo).getByText("Recoger paquete");
      expect(titulo).not.toHaveClass("sr-only");
      const cerrar = within(dialogo).getAllByRole("button", { name: "Cerrar" });
      expect(cerrar).toHaveLength(1);
      expect(cerrar[0].className.split(/\s+/)).toContain("size-11");
      // Ninguna X del `Dialog` (la de `showCloseButton`, `icon-sm`): la única es la de la barra.
      const xDelDialog = [...dialogo.querySelectorAll('[data-slot="dialog-close"]')].filter(
        (el) => el !== cerrar[0],
      );
      expect(xDelDialog).toHaveLength(0);
      // Título y «Cerrar» en la misma barra, encima del contenido.
      expect(titulo.parentElement).toBe(cerrar[0].parentElement);
      const contenido = within(dialogo).getByText("tarjeta de escaneo");
      expect(titulo.compareDocumentPosition(contenido) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);

      await user.click(cerrar[0]);
      await vi.waitFor(() => expect(screen.queryByText("tarjeta de escaneo")).toBeNull());
      expect(screen.queryByRole("dialog")).toBeNull();
    },
  );

  // R929: los disparadores no cambian (`tactil` 44 px a todo el ancho; `soloIcono` icono de
  // cámara; por defecto, el `h-8` de `size="default"`).
  it("R929: `tactil` es de 44 px a todo el ancho", () => {
    render(
      <EscanerModal label={ESCANER_LABEL_GUIA} titulo="Recoger paquete" tactil>
        <p>x</p>
      </EscanerModal>,
    );
    const clases = screen.getByRole("button", { name: ESCANER_LABEL_GUIA }).className.split(/\s+/);
    expect(clases).toContain("h-11");
    expect(clases).toContain("w-full");
  });

  it("R929: `soloIcono` es un icono sin texto, con `label` de nombre", () => {
    render(
      <EscanerModal label="Escanear con cámara" titulo="Escanear con cámara" soloIcono className="size-11">
        <p>x</p>
      </EscanerModal>,
    );
    const boton = screen.getByRole("button", { name: "Escanear con cámara" });
    expect(boton).toHaveTextContent("");
    expect(boton.querySelector("svg")).not.toBeNull();
  });

  it("R929: el disparador por defecto sigue en `h-8`, sin el ancho completo", () => {
    render(
      <EscanerModal titulo="Recibir paquete">
        <p>x</p>
      </EscanerModal>,
    );
    const clases = screen.getByRole("button", { name: "Recibir paquete" }).className.split(/\s+/);
    expect(clases).toContain("h-8");
    expect(clases).not.toContain("h-11");
    expect(clases).not.toContain("w-full");
  });
});
