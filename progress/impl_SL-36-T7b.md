# SL-36 · T7.2 (pantalla `/configuracion/integraciones` y menú) — bitácora de frontend_dev

> Parcial de T7. El implementer la funde en `impl_SL-36.md`. Sin commit (lo hace el leader).
> T7.0 (/design) dispensada por el humano: patrones de `configuracion/api` (revelado único,
> `AppPage`, `Modal`, `FormField`, `PasswordInput`) y `components/ui/`. Sin dependencias nuevas.
> MCP del grafo no consultado: todo se leyó con Read/Grep (código de esta feature y patrones puntuales).

## Archivos

Creados:
- `app/(app)/configuracion/integraciones/page.tsx` — Server Component; solo `maestro` (patrón de
  `/configuracion/api`: otro rol, superadmin incluido, ve «No tienes permiso…» sin leer nada).
- `app/(app)/configuracion/integraciones/_components/IntegracionesModule.tsx` — cliente; llama a las
  cinco actions de escritura; el token del webhook vive solo en su `useState` (R18).
- `.../_components/TarjetaIntegracion.tsx` — R34, R35.
- `.../_components/FormularioIntegracion.tsx` — R35, R36 (secretos sin controlar + `key` por intento).
- `.../_components/DesconectarDialogo.tsx` — R31.
- `.../_components/RevelarTokenWebhookModal.tsx` — R18, espejo de `RevelarWebhookSecretoModal`.
- `.../_components/integraciones-textos.ts` — etiquetas de estado/marca/datos públicos y
  `mensajeDeResultado` (resultado → texto del catálogo; nunca pinta un código).
- `tests/components/integraciones/{TarjetaIntegracion,FormularioIntegracion,DesconectarDialogo,IntegracionesModule}.test.tsx`
  y `vistas.ts` (factoría de vistas).

Modificados:
- `lib/actions/integraciones.ts` — quitadas las seis anotaciones `@sin-superficie` (nada más).
- `lib/auth/menu-visibility.ts` — subítem «Integraciones» justo después de «API» (design §14).
- `tests/unit/auth/menu-visibility.test.ts` — lista de hijos de Configuración + caso SL-36 (maestro sí;
  admin, mensajero, superadmin no; el aterrizaje del maestro no cambia).
- `tests/unit/guards/pwa-manifiesto-atajos.guardia.test.ts` — `maestro` 22 → 23 (solo el maestro se
  mueve, comentado como en las fichas anteriores; la conclusión, cero atajos, no cambia).

## Mapa R<n> → test

| R | Test | Estado |
|---|---|---|
| R34 | `TarjetaIntegracion.test.tsx` › «SL-36/R34: estado, marca, error solo en error, hora de prueba y del webhook» | verde |
| R35 | `TarjetaIntegracion.test.tsx` › «SL-36/R35: enlace a la guía» (las 4 rutas del design §8 a mano) + `FormularioIntegracion.test.tsx` › «SL-36/R35: el formulario enlaza la guía de su servicio» | verde |
| R36 | `FormularioIntegracion.test.tsx` › «SL-36/R36: secretos password sin valor; tras rechazo solo lo no secreto» + «el JSON de la cuenta de servicio también es una contraseña sin valor» + «R14, R36: en edición…» | verde |
| R31 | `DesconectarDialogo.test.tsx` › «SL-36/R31: muestra marca y qué deja de funcionar antes de confirmar» (×4, literales del design §7 escritos en el test) + «cancelar no desconecta» | verde |
| R18 | `IntegracionesModule.test.tsx` › «SL-36/R18: el token del alta se muestra una vez y desaparece al cerrar o al remontar» + «remontar sin cerrar el diálogo tampoco conserva el token» (regenerar) | verde (recarga real en HTML: E2E T9) |
| R6 (menú) | `menu-visibility.test.ts` › «SL-36 (R6): solo el maestro ve «Integraciones»; admin, mensajero y superadmin no» | verde |
| R13/R31/R32 (cableado) | `IntegracionesModule.test.tsx` › alta rechazada muestra el texto y no revela token; desconectar solo tras confirmar | verde |

## Mutaciones (script en el scratchpad; cada una aplicada, medida y revertida por bytes)

| Mutación | Resultado |
|---|---|
| `defaultValue="secreto-precargado"` en el `PasswordInput` | ROJO R36 (3 de 5) |
| el error se pinta también en «conectada» (sin `vista.estado === "error"`) | ROJO R34 (1 de 2) |
| quitar la marca del diálogo (`{""}`) | ROJO R31 (4 de 5) |
| cerrar el revelado no borra el token | ROJO R18 (1 de 4) |

Tras revertir: `pnpm exec vitest run tests/components/integraciones tests/unit/auth/menu-visibility.test.ts`
→ `Test Files 5 passed (5) · Tests 71 passed (71)`.

## Salida de verificación

- `pnpm exec vitest run tests/components/integraciones`: `Test Files 4 passed (4) · Tests 16 passed (16)`.
- `pnpm run typecheck`: exit 0, 0 errores.
- `pnpm run lint`: exit 0 (`0 errors, 232 warnings`, ninguno en mis archivos).
- `pnpm run test:guardias`: `Test Files 2 failed | 303 passed | 2 skipped (307) · Tests 6 failed | 4179 passed`.
  - `dependencias-declaradas-presentes` (4): baseline.
  - `catalogo-postgres-acota-esquema` (2): `ENOENT lib/auth/google-adc-token.ts`, archivo borrado por
    el T6 en curso del backend_dev; no es mío.
  - `ayuda-pantalla-ruta-existe` y `superficie-de-uso`: VERDES.
  - En una primera corrida salieron también `cache-config.guardia` y `censo-order-status-rename`; en
    aislado pasan y en la repetición ya no estaban (carga). `pwa-manifiesto-atajos` era mío y se
    actualizó (arriba).
- `pnpm exec vitest related --run <los 9 archivos de app/ y lib/ tocados>`:
  `Test Files 220 passed | 3 skipped (223) · Tests 3109 passed | 40 skipped`.
- LF: 0 `\r` en todos los archivos tocados. No se levantó dev server.

## Desviaciones y decisiones

1. **El JSON de la cuenta de servicio va en un `PasswordInput`, no en `textarea`** (el catálogo dice
   `multilinea: true`). Un `textarea` lo mostraría en claro y R36 manda. Pegarlo en una sola línea
   solo quita saltos entre claves (espacio en blanco en JSON); los de la clave privada van escapados.
   Si el humano prefiere un `textarea`, haría falta enmascararlo y R36 diría otra cosa.
2. **Confirmación antes de regenerar el token** (Modal sencillo): regenerar invalida el token que
   Meta tiene pegado. No está en el spec; es conservador y no cambia contratos.
3. **Página sin permiso = mensaje, no `notFound()`**, como `/configuracion/api` (lo que pidió T7.1).
4. **Fechas con `formatFechaHoraLegible` de `configuracion/api/_components/fecha-legible.ts`**,
   reutilizado para no crear otro formato (ese helper ya fija su locale; aquí no se añade ninguno).
5. **El enlace a la guía está en la tarjeta y en el formulario** (R35 dice «desde el formulario»; la
   tabla de trazabilidad lo prueba en la tarjeta).
6. **Texto de `unexpected` en la lectura**: el catálogo dice «Algo falló al guardar…», y la página lo
   usa también si falla `listarIntegraciones`. No toqué `lib/types` (fuera de mi alcance); aviso por si
   se quiere un texto de lectura.
7. Edición: un secreto vacío no se envía (R14); lo no secreto se precarga de `datosPublicos`.

## Veredicto

T7.2 hecho: pantalla, menú y 20 tests nuevos/ajustados en verde, 4 mutaciones en rojo; typecheck y
lint limpios; guardias rojas solo por baseline y por el T6 en curso.
