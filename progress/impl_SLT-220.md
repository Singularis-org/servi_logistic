# impl SLT-220 «Tomar foto abre la galería en vez de la cámara (evidencias)»

Ruta directa (sin spec). frontend_dev, 2026-11-19.

## Archivos
- `components/shared/EvidenciasField.tsx`: input de cámara sin `multiple` y con `accept="image/*"`;
  galería sin cambios. Cabecera: nueva sección «POR QUE EL INPUT DE CAMARA NO LLEVA `multiple`…»
  y retirada la frase «comparten `accept`, `multiple`…».
- `tests/components/EvidenciasField.test.tsx`:
  - el caso «las dos vías comparten `accept` y `multiple`» afirmaba el contrato viejo; se sustituye
    por «⭑ SLT-220: el input de cámara NO lleva `multiple` y acepta `image/*`; la galería conserva
    los dos» (cámara: `capture=environment`, sin `multiple`, `accept=image/*`; galería: `multiple`,
    `accept=GESTION_ALLOWED_MIME.join(",")`);
  - «el tope se respeta venga la foto de donde venga» subía 3 fotos de golpe por la cámara; ahora
    3 por la galería y 1 por la cámara (mismo contrato: tope compartido).

## Mapa contrato → test
- Cámara abre la cámara (sin `multiple`, `image/*`, `capture`) → `EvidenciasField.test.tsx` «⭑ SLT-220: …».
- Galería intacta → mismo caso + «⭑ `capture` está SOLO en el input de cámara».
- Formato no se relaja (HEIC convertido o rechazado con nombre) → casos ya existentes de
  `prepararEvidencias` («un HEIC pequeño convertido…», «⭑ un HEIC que NO se pudo convertir…»).

## Validación del formato
No dependía del `accept`: los 4 `onSelect` (GestionarOrdenPanel, GestionarDesdeAyudaModal,
ConfirmarEntregaTiendaModal, ReportarIncidenteModal) pasan por `prepararEvidencias`, que convierte
con `comprimirImagen` (HEIC → JPEG) y valida con `validarEvidencia`; lo que no sea JPEG/PNG/WEBP
se rechaza al elegirlo, nombrando el archivo («No se adjuntó «X»: debe ser JPEG, PNG o WEBP.»).
El servidor revalida con `GESTION_ALLOWED_MIME`.

## Rojo → verde
Antes del arreglo (`npx vitest run tests/components/EvidenciasField.test.tsx`):
```
× ⭑ SLT-220: el input de cámara NO lleva `multiple` y acepta `image/*`; la galería conserva los dos
Error: expect(element).not.toHaveAttribute("multiple")
Tests  1 failed | 16 passed (17)
```
Después (EvidenciasField + ReportarIncidenteModal + ConfirmarEntregaTiendaModal +
GestionarDesdeAyudaModal* + GestionarOrdenPanel*):
```
Test Files  11 passed (11)
     Tests  165 passed (165)
EXIT=0
```

## ./init.sh
Tercera corrida: VERDE, `INIT_EXIT=0`, 0 lineas `✗`, `== init OK ==`; tamano del PR 2/40 archivos,
21/1000 lineas de produccion, 30/3000 de tests; ruta directa confirmada por el gate.

Las dos primeras corridas salieron rojas por la maquina, no por el cambio:
1. sin `NODE_OPTIONS`: `tsc --noEmit` muere por heap (OOM a ~4 GB, exit 134). Con
   `NODE_OPTIONS=--max-old-space-size=8192` el typecheck pasa.
2. `tests/unit/guards/otp-debug-solo-en-pruebas.guardia.test.ts` timeout a 20 s bajo carga; sola
   pasa 11/11 en ~10 s. La tercera corrida la pasa.

## Veredicto
Arreglo mínimo en el input de cámara; queda la prueba real en Preview desde el teléfono de Carlos.
