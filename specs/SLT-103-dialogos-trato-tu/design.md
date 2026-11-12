# SLT-103 «Diálogos del módulo de cierres y trato tú» — design (rebanada 1)

> Solo la rebanada 1 (R53, R54, R55, R57, R137-R141). La rebanada 2 es SLT-133 «Mensajes del servidor
> de cierres en tú y con tildes» y la 3 es SLT-134 «Textos de pantalla de cierres en tú, con guardia».
> Base: `specs/SLT-95-detalle-cierre-rediseno/design.md > 4. Diálogos (S5)`.

## Lo que ya existe

**Términos buscados:**
- board (`feature_list.json`, todos los estados): «trato», «voseo», «diálogo», «evidencia», «sin
  saldo»;
- `specs/`: «voseo», «VisorEvidencia», «mensajeSinSaldo», «Ver evidencia»;
- código (Grep/Read; el índice del grafo de este worktree no existe): `Modal`, `VisorEvidencia`,
  `BotonesEvidencia`, `onVerEvidencia`, `mensajeSinSaldo`, `sin_saldo`, `ui/dialog`.

**Resultado:**
- **Board:** ninguna otra ficha hace los diálogos. SLT-133 y SLT-134 son las otras dos rebanadas de esta
  misma S5 (PA1). SLT-115 «Retirar los componentes de cierre sustituidos» borrará después
  `BotonesEvidencia` y `cierre-factura.tsx`; aquí solo se adaptan.
- **Specs:** 486 «evidencias varias fotos en cierres» creó `BotonesEvidencia` (un botón por foto: R54
  lo sustituye por uno con contador); 478 «detalle guía y evidencias en cierre de bodega» y SLT-101
  «Fila de gestión única» montan el botón en sus filas. Ninguna tiene visor con navegación.
- **Código que se reutiliza tal cual:** `components/shared/Modal.tsx` (D17; sin cambios por PA4);
  `Button` de `components/ui`; `money()`; la prop `mensajeSinSaldo` de
  `components/shared/liquidacion/RegistrarPagoDialog.tsx` (l.141, default `REGISTRAR_PAGO_RESPUESTA.sinSaldo`,
  que habla de «Esta tienda…»).
- **Código que se sustituye:** los tres visores iguales (`VisorEvidencia` de
  `cierre-detalle-shared.tsx` l.1307, que monta `CierresBodegaAdminModule` l.560; el `Modal` en línea de
  `CierresAdminModule.tsx` l.1692 y el de `CierreDiaModule.tsx` l.1088) por uno nuevo en
  `components/private/cierres/dialogos/`.
- **R53 ya se cumple hoy:** los 18 diálogos montan `Modal` (`CierresAdminModule`,
  `AjustarPagoMensajeroDialog`, `CorregirPagosDialog`, `CorregirResultadoDialog`,
  `DescargarGestionesDialog`, `ConsolidacionBodegaModule`, `CierreDiaModule`, `RegistrarPagoDialog`,
  `AnularPagoDialog`, `ConciliacionAcciones`, `MarcarRecibidoDialog`). El único `ui/dialog` del módulo
  es `components/private/cierres/detalle/DetalleCierre.tsx`, el marco modal del detalle (D1), que no
  es un diálogo de R53. Esta rebanada lo deja vigilado con una guardia.

## Zona y capas

Fichada **fullstack**; esta rebanada **solo toca pantalla y tests** (`frontend_dev`). No toca `lib/`,
`db/` ni Server Actions.

## Modelo de datos, RLS y migraciones

Ninguno. Sin tablas, columnas, índices, RLS ni migraciones; por tanto sin `down.sql`.

## Autorización

No cambia. Quién ve la evidencia sigue decidido por quién pasa `onVerEvidencia` (el servidor firma las
URL y el Server Component decide la audiencia, como hoy). El visor no decide nada: recibe URL ya
firmadas por props (`docs/architecture.md > Componentes`, `components/private/`). El pago al mensajero
sigue gobernado por `puedeRegistrarPago` en `/cierres-admin/page.tsx`; R57 solo cambia un texto.
Módulo: `nucleo` (`lib/modulos/reparto.ts`), sin cambios.

## Datos que dependen del país

- **Moneda:** el resumen de R140 formatea con `money()`, igual que la página. Ningún símbolo escrito.
- Sin fechas, impuestos, geografía ni métodos de pago nuevos.

## Contratos

### `components/private/cierres/dialogos/dialogos-labels.ts` (nuevo)

Textos de la rebanada, en «tú», separados de la lógica (patrón `*-labels.ts` del módulo):

```ts
export const VISOR_EVIDENCIA_TEXTO = {
  titulo: "Evidencia de la gestión",
  alt: "Evidencia fotográfica de la gestión",
  cerrar: "Cerrar",
  anterior: "Anterior",
  siguiente: "Siguiente",
  navegacion: "Fotos de la evidencia", // aria-label del grupo Anterior/Siguiente
} as const;

/** «Orden REM-011 · Andrés Mora» (canvas Dialogos l.183). */
export function contextoEvidencia(numRemision: string, destinatario: string): string;
/** n = 1 → contexto (o undefined); n > 1 → «<contexto> · foto i de n» o «Foto i de n». i es 1-based. */
export function descripcionVisor(i: number, n: number, contexto?: string): string | undefined;
/** n ≤ 1 → base; n > 1 → «<base> (n)». base por defecto «Ver evidencia». */
export function etiquetaVerEvidencia(n: number, base?: string): string;

export const RESUMEN_SOLICITUD_TEXTO = {
  region: "Resumen del cierre a solicitar",
  gestiones: "Gestiones",
  recaudado: "Recaudado",
  tuGanancia: "Tu ganancia",
} as const;
```

### `components/private/cierres/dialogos/VisorEvidencia.tsx` (nuevo)

```ts
/** Lo que abre el visor: las URL FIRMADAS de UNA gestión, en el orden del servidor. */
export interface EvidenciaAbierta {
  urls: readonly string[];
  /** «Orden X · Y». Ausente en superficies que no lo tienen a mano. */
  contexto?: string;
}

export function VisorEvidencia(props: {
  evidencia: EvidenciaAbierta | null; // null = cerrado
  onClose: () => void;
}): JSX.Element;
```

- Un `Modal`: `open={evidencia !== null}`, `title` = `VISOR_EVIDENCIA_TEXTO.titulo`,
  `description` = `descripcionVisor(i + 1, n, contexto)`, `confirmLabel` = «Cerrar», `hideCancel`,
  `onConfirm` = `onClose`, `onOpenChange(false)` = `onClose` (R137). Ancho: el de hoy (sin `size`).
- Cuerpo: `<img src={urls[i]} alt={VISOR_EVIDENCIA_TEXTO.alt}>` con las clases de hoy
  (`max-h-[60vh] w-full rounded-md object-contain`); **solo si n > 1**, debajo, un
  `<div role="group" aria-label="Fotos de la evidencia">` con dos `Button` `variant="outline"`
  `size="sm"`: «Anterior» (`disabled` en i = 0) y «Siguiente» (`disabled` en i = n − 1) (R139, PA4).
- Índice: `useState(0)`, y un `useEffect` que lo vuelve a 0 cuando cambia `evidencia` (cada apertura
  es un objeto nuevo) (R139: «al volver a abrir, foto 1»).
- Sin navegación circular y sin teclas propias (Escape la da `Modal`).

### `app/(app)/cierres-admin/_components/botones-evidencia.tsx` (se reduce a un botón)

```ts
export interface BotonesEvidenciaProps {
  urls: readonly string[];
  onVer: (urls: readonly string[]) => void; // antes: (url: string) => void, una llamada por foto
  etiqueta?: string;   // base, «Ver evidencia»
  ariaSufijo?: string; // «de la orden X · Y»
  className?: string;
}
```

- 0 URL → `null`. ≥ 1 → **un** `Button` con texto `etiquetaVerEvidencia(n, etiqueta)` y
  `aria-label` = `${texto} ${ariaSufijo}` si hay sufijo (sin sufijo, el nombre es el texto, como hoy).
  Con n = 1 el texto y el nombre accesible son idénticos a los de hoy (R138), así que los E2E
  `cierres-admin.spec.ts` l.108 y `cierre-bodega-satelite.spec.ts` l.188 no cambian.
- Se quitan `conectorTotal`, el `role="group"` y el botón por foto. El nombre del componente se
  conserva (lo retira SLT-115).

### Quién abre el visor

`onVerEvidencia` pasa de `(url: string) => void` a `(e: EvidenciaAbierta) => void` en:

| Archivo | Cambio |
|---|---|
| `components/private/cierres/fila/FilaGestion.tsx` (l.55, l.252) | prop nueva; `onVer={(urls) => onVerEvidencia({ urls, contexto: contextoEvidencia(g.numRemision, g.destinatario) })}` |
| `components/private/cierres/fila/GestionesCierre.tsx` | solo el tipo de la prop que reenvía |
| `app/(app)/cierres-admin/_components/cierre-factura.tsx` (l.1351, l.1715, l.1975, l.2053) | ídem en su `FilaGestion` y los tipos que la reenvían |
| `app/(app)/cierres-admin/_components/CierresAdminModule.tsx` (l.506, l.1692-1710) | estado `EvidenciaAbierta \| null`; el `Modal` en línea se sustituye por `<VisorEvidencia>` |
| `app/(app)/cierres-admin/_components/CierresBodegaAdminModule.tsx` (l.228, l.560) | estado `EvidenciaAbierta \| null`; importa el visor nuevo |
| `app/(app)/cierres-admin/_components/cierre-detalle-shared.tsx` (l.1303-1335) | se borra `VisorEvidencia` (su único consumidor pasa al nuevo); `Modal` sigue importado si otro bloque lo usa |
| `app/(app)/cierre-dia/_components/CierreDiaModule.tsx` (l.1088-1100, l.1492) | estado `EvidenciaAbierta \| null`; `columnaEvidencia(verEvidencia: (e: EvidenciaAbierta) => void)` con `contexto` de la fila; el `Modal` en línea se sustituye |

### Resumen de «Solicitar cierre del día» (R55, R140)

En `CierreDiaModule.tsx`, el `Modal` de l.965 pasa a tener cuerpo (hoy no tiene). Las tres cifras salen
de props que la página ya recibe del servidor; no se suma dinero en el cliente:

| Línea | Valor |
|---|---|
| Gestiones | `ORDEN_RESULTADOS.reduce((n, r) => n + (grupos[r]?.length ?? 0), 0)`: las mismas filas que pintan las secciones por resultado de la página (l.815-818). Es un conteo de filas, no dinero. |
| Recaudado | `money(totales.general)`: el «Total general» de «Totales del día» (l.794). |
| Tu ganancia | `money(totalPagoMensajero)`: el «Total de ganancia» (l.808). |

Marcado: `<dl aria-label="Resumen del cierre a solicitar">` con tres pares `<dt>`/`<dd>`, en el orden
de la tabla. Título, descripción y botón del `Modal` no cambian.

### Sin saldo del mensajero (R57, R141)

- `pago-mensajero-labels.ts`: clave nueva
  `sinSaldo: "Este mensajero no tiene ganancia pendiente de pago en este cierre, así que no hay nada que pagar."`
  (PA2).
- `RegistrarPagoMensajeroDialog.tsx`: pasa `mensajeSinSaldo={PAGO_MENSAJERO_TEXTO.sinSaldo}` a
  `RegistrarPagoDialog`. El componente compartido no cambia; `/wallet/tiendas` sigue con su texto.

### Guardia estructural de R53 y R137

`tests/unit/guards/cierres-dialogos-modal.guardia.test.ts` (nueva), con `quitarComentarios`
(`tests/fixtures/sin-comentarios.ts`), como `pais-sin-literales.guardia.test.ts`. Recorre los `.ts`/`.tsx`
de pantalla del censo (`app/(app)/cierres-admin/**`, `app/(app)/cierre-dia/**`,
`app/(app)/wallet/satelites/**`, `components/private/cierres/**`, `components/shared/conciliacion/**`,
`components/shared/liquidacion/**`) y exige:

1. **R53:** ningún archivo importa `@/components/ui/dialog` ni `@/components/ui/alert-dialog`, salvo
   `components/private/cierres/detalle/DetalleCierre.tsx` (marco del detalle, D1; lista de una fila con
   su motivo).
2. **R137:** el literal `"Evidencia de la gestión"` aparece solo en
   `components/private/cierres/dialogos/dialogos-labels.ts`, y `function VisorEvidencia` solo en
   `components/private/cierres/dialogos/VisorEvidencia.tsx`: no puede volver a nacer un cuarto visor.
3. **Control positivo:** el censo pasa de 40 archivos e incluye `CierresAdminModule.tsx`,
   `CierreDiaModule.tsx` y `ConciliacionAcciones.tsx`.
4. **Contraprueba:** las dos funciones de detección, aplicadas a un texto de muestra con un
   `import { Dialog } from "@/components/ui/dialog"` y con `title="Evidencia de la gestión"`, devuelven
   un hallazgo; aplicadas a la misma muestra con esas líneas comentadas, ninguno.

No es la guardia de trato (`cierres-trato-tu.guardia.test.ts`, SLT-134): mira otra cosa y entra antes.

## Alternativas descartadas

1. **Prop nueva en `Modal` para poner «Anterior» y «Siguiente» al pie** (lo que proponía el canvas).
   Descartada por Carlos (PA4): `Modal` lo usan decenas de pantallas y la rebanada no debe tocar la
   primitiva. Van en el cuerpo, bajo la foto.
2. **Unificar los tres visores sin tocar los botones (uno por foto).** Contradice R54 y deja tres filas
   de botones en gestiones con 3 fotos.
3. **Visor en `app/(app)/cierres-admin/_components/`.** Lo usan `/cierres-admin` y `/cierre-dia`;
   `components/private/cierres/dialogos/` es el sitio del madre (design §Arquitectura) y del resto de
   piezas únicas (`detalle/`, `fila/`, `cola/`).
4. **Contar «Gestiones» en el servidor** (campo nuevo en `listarCierreDia`). Haría la rebanada
   fullstack por un número que la página ya tiene en sus filas; R140 pide «las cifras de la página».
5. **Navegación circular** (de la última a la primera). Con 2-3 fotos, deshabilitar en los extremos
   dice dónde estás; el canvas no dibuja vuelta.
6. **Arreglar el texto de sin saldo en `liquidacion-labels.ts`.** Cambiaría lo que ve `/wallet/tiendas`,
   donde «Esta tienda…» es correcto. La prop `mensajeSinSaldo` existe para esto.

## Verificación de lo que ve el usuario

- **Literales a mano** en todos los tests de texto (memoria «aserción contra su propia fuente»): «Ver
  evidencia (3)», «Orden REM-011 · Andrés Mora · foto 2 de 3», «Este mensajero no tiene ganancia
  pendiente…», «19», «₡285.275,00» (o la forma de `money()` para el fixture). Nunca
  `etiquetaVerEvidencia(3)` ni `PAGO_MENSAJERO_TEXTO.sinSaldo` en la aserción.
- **Negativos con valores imposibles por casualidad** (memoria «test negativo contra una fecha»): «no
  contiene la palabra tienda» y «no aparece "foto 1 de 1"».
- **E2E en local antes del PR** (`docs/perfil-agentes.md`): el diff toca pantallas de `app/`. Se corren
  `e2e/cierres-admin.spec.ts`, `e2e/cierre-bodega-satelite.spec.ts` y `e2e/cierre-dia.spec.ts`, con base
  desechable y `NEXT_PUBLIC_APP_URL` como en el CI. No toca dinero: no hace falta el grupo `dinero`.
- **Preview:** Carlos valida el texto de sin saldo (PA2) y los botones bajo la foto (R139) antes de
  promover (memoria «aprobar en Preview antes de prod»).
