// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { render, screen, cleanup, act } from "@testing-library/react";
import type { CarouselApi } from "@/components/ui/carousel";

import { BASIS_1_2_3, CarruselCards } from "@/components/shared/CarruselCards";

// SLT-166 (R542): para emitir `select` hace falta la instancia de embla que monta la primitiva.
// Se envuelve el hook REAL (no se sustituye): el carrusel sigue siendo el de verdad y el resto de
// los casos de este archivo no cambian; solo se guarda la última instancia creada.
const embla = vi.hoisted(() => ({ api: undefined as NonNullable<CarouselApi> | undefined }));
vi.mock("embla-carousel-react", async (importOriginal) => {
  const real = await importOriginal<typeof import("embla-carousel-react")>();
  const envuelto = ((...args: Parameters<typeof real.default>) => {
    const r = real.default(...args);
    if (r[1]) embla.api = r[1];
    return r;
  }) as typeof real.default;
  return { ...real, default: envuelto };
});

// Compuesto shared del carrusel. jsdom no mide anchos, así que embla no reporta
// visibilidad: lo que se verifica aquí es el CABLEADO (todas las tarjetas montadas, región
// accesible, controles, etiqueta presente y anunciada). El cálculo del rango se verifica en
// `tests/unit/components/carrusel-rango.test.ts`, donde no hace falta layout.

interface Item {
  id: string;
  texto: string;
}

const ITEMS: Item[] = [
  { id: "a", texto: "Orden A" },
  { id: "b", texto: "Orden B" },
  { id: "c", texto: "Orden C" },
  { id: "d", texto: "Orden D" },
  { id: "e", texto: "Orden E" },
];

function renderCarrusel(items: Item[] = ITEMS) {
  return render(
    <CarruselCards
      items={items}
      getKey={(item) => item.id}
      ariaLabel="Órdenes en reparto"
      renderItem={(item) => <article>{item.texto}</article>}
    />,
  );
}

afterEach(cleanup);

describe("CarruselCards", () => {
  it("monta TODAS las tarjetas, no solo las visibles: el desplazamiento no las remonta", () => {
    renderCarrusel();

    for (const item of ITEMS) {
      expect(screen.getByText(item.texto)).toBeInTheDocument();
    }
  });

  it("expone una región accesible con el nombre recibido", () => {
    renderCarrusel();

    const region = screen.getByRole("region", { name: "Órdenes en reparto" });
    expect(region).toHaveAttribute("aria-roledescription", "carousel");
  });

  it("cada tarjeta es una diapositiva con el ancho por breakpoint (1 / 2 / 3)", () => {
    renderCarrusel();

    const slides = screen.getAllByRole("group");
    expect(slides).toHaveLength(ITEMS.length);
    for (const slide of slides) {
      expect(slide).toHaveAttribute("aria-roledescription", "slide");
      // Los mismos cortes que la grilla que sustituye: 1 en móvil, 2 desde sm, 3 desde lg.
      expect(slide.className).toContain("basis-full");
      expect(slide.className).toContain("sm:basis-1/2");
      expect(slide.className).toContain("lg:basis-1/3");
    }
  });

  it("ofrece los controles de anterior y siguiente", () => {
    renderCarrusel();

    expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Siguiente" }),
    ).toBeInTheDocument();
  });

  it("en la primera posición no se puede retroceder", () => {
    renderCarrusel();

    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("muestra la etiqueta de posición con el TOTAL real y la anuncia sin mover el foco", () => {
    renderCarrusel();

    // jsdom no reporta visibilidad, así que el rango cae a la primera posición (documentado
    // en `carrusel-rango.ts`); lo que importa aquí es que la etiqueta existe y lleva el total.
    const etiqueta = screen.getByText(/de 5$/);
    expect(etiqueta).toHaveAttribute("aria-live", "polite");
    expect(etiqueta.textContent).toMatch(/^(Orden|Órdenes) .* de 5$/);
  });

  it("sin elementos no renderiza nada: el vacío lo decide quien lo consume", () => {
    const { container } = renderCarrusel([]);

    expect(container).toBeEmptyDOMElement();
  });

  it("los controles quedan DENTRO del ancho del contenedor, alcanzables en móvil", () => {
    renderCarrusel();

    // El carousel de shadcn los posiciona por defecto fuera del contenedor (`-left-12` /
    // `-right-12`), donde se salen del viewport en pantallas angostas. Aquí van estáticos,
    // debajo, flanqueando la etiqueta.
    for (const nombre of ["Anterior", "Siguiente"]) {
      const control = screen.getByRole("button", { name: nombre });
      expect(control.className).toContain("static");
      expect(control.className).not.toContain("-left-12");
      expect(control.className).not.toContain("-right-12");
    }
  });

  it("sirve a elementos ajenos al dominio de órdenes: no sabe de órdenes", () => {
    render(
      <CarruselCards
        items={[
          { id: "z1", texto: "Zona norte" },
          { id: "z2", texto: "Zona sur" },
        ]}
        getKey={(item) => item.id}
        ariaLabel="Zonas"
        singular="Zona"
        plural="Zonas"
        renderItem={(item) => <p>{item.texto}</p>}
      />,
    );

    expect(screen.getByRole("region", { name: "Zonas" })).toBeInTheDocument();
    expect(screen.getByText("Zona norte")).toBeInTheDocument();
    // La etiqueta usa el nombre recibido, no "Orden".
    expect(screen.getByText(/de 2$/).textContent).toMatch(/^Zonas? /);
  });

  it("permite sustituir el ancho por breakpoint sin tocar el componente", () => {
    render(
      <CarruselCards
        items={ITEMS}
        getKey={(item) => item.id}
        ariaLabel="Otro carrusel"
        itemClassName="basis-1/4"
        renderItem={(item) => <article>{item.texto}</article>}
      />,
    );

    expect(screen.getAllByRole("group")[0].className).toContain("basis-1/4");
    expect(BASIS_1_2_3).toBe("basis-full sm:basis-1/2 lg:basis-1/3");
  });
});

// ---------------------------------------------------------------------------
// Guardia de configuración (R6). El avance por PÁGINA no es observable en jsdom —sin anchos
// embla no puede paginar—, así que se fija sobre la fuente, como hacen ya otras guardias del
// repo (p. ej. `NotificationsBell.test.tsx`). No sustituye a verlo en pantalla: la task T6.4
// de la spec deja esa verificación explícitamente pendiente.
// ---------------------------------------------------------------------------
describe("CarruselCards — configuración del desplazamiento (R6)", () => {
  const FUENTE = readFileSync(
    path.join(process.cwd(), "components/shared/CarruselCards.tsx"),
    "utf8",
  );

  it("avanza una página entera, no de una en una", () => {
    expect(FUENTE).toContain('slidesToScroll: "auto"');
  });

  it("alinea al inicio, para que la página empiece donde el usuario la ve empezar", () => {
    expect(FUENTE).toContain('align: "start"');
  });

  // Regresión (reporte humano), en dos tiempos:
  //  1. Con el `inViewThreshold` por defecto (0) embla cuenta como visible la tarjeta que
  //     apenas asoma en el borde: la etiqueta decía "1-4" con 3 tarjetas en pantalla.
  //  2. Con 0.99 se perdía la PRIMERA (el `-ml-4`/`pl-4` del carril deja su caja 16px fuera
  //     del área visible, así que no alcanza el 99%): decía "2-3 de 5" con 3 en pantalla.
  // El umbral debe quedar ENTRE ambos extremos: alto para no contar la que solo asoma, y con
  // holgura para que una tarjeta entera cuente pese al padding del carril.
  it("cuenta la tarjeta que se ve entera, sin colar la que solo asoma", () => {
    const umbral = Number(
      /inViewThreshold:\s*([\d.]+)/.exec(FUENTE)?.[1] ?? NaN,
    );
    expect(umbral).toBeGreaterThanOrEqual(0.5);
    expect(umbral).toBeLessThanOrEqual(0.9);
  });
});

describe("SLT-166 R542 — avisa de la tarjeta a la vista al cambiar de página", () => {
  function montarConAviso() {
    const onIndiceChange = vi.fn();
    render(
      <CarruselCards
        items={ITEMS}
        getKey={(item) => item.id}
        ariaLabel="Órdenes en reparto"
        renderItem={(item) => <article>{item.texto}</article>}
        onIndiceChange={onIndiceChange}
      />,
    );
    expect(embla.api, "embla tiene que haberse montado").toBeDefined();
    return { api: embla.api!, onIndiceChange };
  }

  it("en `select` emite el índice de la tarjeta seleccionada (una por página, el móvil)", () => {
    const { api, onIndiceChange } = montarConAviso();
    vi.spyOn(api, "selectedScrollSnap").mockReturnValue(3);
    const motor = api.internalEngine();
    vi.spyOn(api, "internalEngine").mockReturnValue({ ...motor, slideRegistry: [[0], [1], [2], [3], [4]] });

    act(() => {
      api.emit("select");
    });

    expect(onIndiceChange).toHaveBeenLastCalledWith(3);
  });

  it("con varias tarjetas por página emite la PRIMERA de la página, no el número de página", () => {
    const { api, onIndiceChange } = montarConAviso();
    vi.spyOn(api, "selectedScrollSnap").mockReturnValue(1);
    const motor = api.internalEngine();
    vi.spyOn(api, "internalEngine").mockReturnValue({ ...motor, slideRegistry: [[0, 1, 2], [3, 4]] });

    act(() => {
      api.emit("select");
    });

    expect(onIndiceChange).toHaveBeenLastCalledWith(3);
  });

  it("sin `onIndiceChange` no se suscribe a nada extra: el carrusel de las otras pantallas no cambia", () => {
    render(
      <CarruselCards
        items={ITEMS}
        getKey={(item) => item.id}
        ariaLabel="Órdenes en reparto"
        renderItem={(item) => <article>{item.texto}</article>}
      />,
    );
    expect(() => act(() => embla.api!.emit("select"))).not.toThrow();
  });
});
