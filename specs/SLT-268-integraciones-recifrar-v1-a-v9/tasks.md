# SLT-268 «Integraciones: pasar las credenciales de v1 a v9 desde servi» — tasks

Una sola tanda de `backend_dev`. TDD: el test de cada task va antes que el código.

**D12:** esta feature NO toca `scripts/recifrar-integraciones.ts`,
`tests/integration/db/recifrado-integraciones.test.ts` ni `.env.example`, porque chocan con SLT-227
y SLT-257, en vuelo y de otra persona. Si alguna task parece pedirlo, PARA y avisa al leader.

## T0. Paridad con prod (antes de tocar nada)
- [x] Correr `git fetch origin prod` y después `git diff --stat origin/prod -- lib/config/integraciones.ts lib/config/cron.ts lib/crypto/boveda-integraciones.ts lib/db/para-cada-empresa.ts lib/db/prisma-client.ts lib/db/contexto-empresa.ts lib/repositories/IntegracionRecifradoRepository.ts lib/services/RecifradoIntegracionesService.ts lib/interfaces/services/IRecifradoIntegracionesService.ts lib/interfaces/repositories/IIntegracionRecifradoRepository.ts middleware.ts tests/unit/config/integraciones-config.test.ts tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts tests/integration/db/_postgres-real.ts tests/fabricas/organizaciones.ts`.
- **Hecho:** la salida está anotada en `progress/impl_SLT-268.md`. Si sale vacía, se sigue. Si algún
  archivo difiere, se PARA y se avisa al leader con la lista (D4): no se importa nada que solo exista
  en `dev`.

## T1. Anillo con la variable extra (R1-R5)
- [x] T1.1 Casos nuevos en `tests/unit/config/integraciones-config.test.ts` (ver `design.md > 5`), en
  rojo. Los mensajes de error se comparan con literales.
- [x] T1.2 `lib/config/integraciones.ts`:
  - añadir `VARIABLE_CLAVES_CIFRADO_EXTRA`;
  - pasar el nombre de la variable a `leerEntrada`;
  - fusionar las dos variables (`design.md > 1`);
  - documentar la variable en el comentario de cabecera (D12).
- **Hecho:** T1.1 en verde; los casos ya existentes de ese archivo siguen en verde sin editarlos (R2);
  `pnpm run typecheck` verde.

## T2. Ruta `POST /api/cron/recifrar-integraciones` (R6-R8, R13-R16) — depende de T1
- [x] T2.1 `tests/unit/api/cron-recifrar-integraciones.test.ts` con un servicio doble, en rojo.
- [x] T2.2 `app/api/cron/recifrar-integraciones/route.ts`: `construirServicioRecifrado`,
  `handleRecifrarIntegraciones` y `POST`, sin `GET` (`design.md > 2`).
- **Hecho:** T2.1 en verde; `vercel.json` sin cambios; las mutaciones de R6, R8 y R13 de
  `design.md > 5` ponen el test en rojo, y el implementer las anota.

## T3. Recifrado real de v1 a v9 con la composición de la ruta (R9-R12, R17) — depende de T2
- [x] T3.1 Archivo NUEVO `tests/integration/db/recifrado-integraciones-extra.test.ts` (D12).
  - Reutiliza sin modificarlos `tests/integration/db/_postgres-real.ts` y
    `tests/fabricas/organizaciones.ts`.
  - Los helpers locales de `recifrado-integraciones.test.ts` (`revertida`, `Revertir`) se copian:
    no están exportados.
  - Usa `construirServicioRecifrado({ prisma: tx, env, recorrerEmpresas })` con claves generadas en
    el test.
  - Cubre: solo-contar no escribe; recifrar cambia solo `secretos` (y `updated_at`, D8); los valores
    se leen con un anillo solo `v9`; la segunda corrida no hace nada.
- **Hecho:**
  - en verde con `HAY_BASE_DE_DATOS`, contra una base desechable y nunca la de desarrollo (exportar
    su URL antes de vitest);
  - la mutación «solo-contar que escribe» lo pone en rojo, y queda anotada;
  - si el test sale `skipped`, NO cuenta como hecho.

## T4. Guardia [P] (con T2 o T3) — depende de T1
- [x] `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`: añadir
  `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` a la lista de permitidas, junto a las otras `INTEGRACIONES_*`.
- **Hecho:** `pnpm run test:guardias` verde.

## T5. Cierre — depende de T1-T4
- [x] `progress/impl_SLT-268.md` con: el mapa R -> test (R1-R17), la salida de T0 y las mutaciones
  medidas.
- [x] `./init.sh` en verde, con `.env` copiado al worktree antes del primer gate.
- **Hecho:**
  - gate local verde;
  - el mapa cubre los 17 requisitos;
  - el diff no toca `RecifradoIntegracionesService.ts`, `IntegracionRecifradoRepository.ts`,
    `vercel.json`, `db/` ni `middleware.ts`;
  - por D12, tampoco toca `scripts/recifrar-integraciones.ts`,
    `tests/integration/db/recifrado-integraciones.test.ts` ni `.env.example`.

Los pasos operativos en prod NO son tasks del implementer: variables en Vercel, redeploy,
solo-contar, ejecutar, prueba en Ordenex y volver a pegar optimizacion_rutas en servi. Están en
`requirements.md > Pasos operativos` y los hace Carlos después de la release.

## Tamaño

- **Producción:** 2 archivos, unas 150-180 líneas.
  - la ruta: unas 110;
  - `lib/config/integraciones.ts`: +40 a 50, con el comentario.
- **Tests:** 4 archivos, unas 400-480 líneas.
  - el unit de la ruta: unas 200;
  - el de config: +70;
  - el de integración nuevo: unas 150, con los helpers copiados;
  - la guardia: +1.
- **Total:** 7 archivos con `progress/impl_SLT-268.md`. Queda muy por debajo del 80% de
  `gate.tamano_pr` (40 archivos).

## Archivos esperados

- `lib/config/integraciones.ts`
- `app/api/cron/recifrar-integraciones/route.ts`
- `tests/unit/config/integraciones-config.test.ts`
- `tests/unit/api/cron-recifrar-integraciones.test.ts`
- `tests/integration/db/recifrado-integraciones-extra.test.ts`
- `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`
- `progress/impl_SLT-268.md`
