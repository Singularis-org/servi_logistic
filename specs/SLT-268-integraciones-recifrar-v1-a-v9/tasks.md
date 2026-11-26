# SLT-268 «Integraciones: pasar las credenciales de v1 a v9 desde servi» — tasks

Una sola tanda de `backend_dev`. TDD: el test de cada task va antes que el código.

## T0. Paridad con prod (antes de tocar nada)
- [ ] Correr `git fetch origin prod` y después `git diff --stat origin/prod -- lib/config/integraciones.ts lib/config/cron.ts lib/crypto/boveda-integraciones.ts lib/db/para-cada-empresa.ts lib/db/prisma-client.ts lib/db/contexto-empresa.ts lib/repositories/IntegracionRecifradoRepository.ts lib/services/RecifradoIntegracionesService.ts lib/interfaces/services/IRecifradoIntegracionesService.ts lib/interfaces/repositories/IIntegracionRecifradoRepository.ts scripts/recifrar-integraciones.ts middleware.ts tests/unit/config/integraciones-config.test.ts tests/integration/db/recifrado-integraciones.test.ts tests/integration/db/_postgres-real.ts`.
- **Hecho:** la salida está anotada en `progress/impl_SLT-268.md`. Si sale vacía, se sigue. Si algún
  archivo difiere, se PARA y se avisa al leader con la lista (D4): no se importa nada que solo exista
  en `dev`.

## T1. Anillo con la variable extra (R1-R5)
- [ ] T1.1 Casos nuevos en `tests/unit/config/integraciones-config.test.ts` (ver `design.md > 5`), en
  rojo. Los mensajes de error se comparan con literales.
- [ ] T1.2 `lib/config/integraciones.ts`: añadir `VARIABLE_CLAVES_CIFRADO_EXTRA`, pasar el nombre de
  la variable a `leerEntrada` y fusionar (`design.md > 1`).
- **Hecho:** T1.1 en verde; los casos ya existentes de ese archivo siguen en verde sin editarlos (R2);
  `pnpm run typecheck` verde.

## T2. Ruta `POST /api/cron/recifrar-integraciones` (R6-R8, R13-R16) — depende de T1
- [ ] T2.1 `tests/unit/api/cron-recifrar-integraciones.test.ts` con un servicio doble, en rojo.
- [ ] T2.2 `app/api/cron/recifrar-integraciones/route.ts`: `construirServicioRecifrado`,
  `handleRecifrarIntegraciones` y `POST`, sin `GET` (`design.md > 2`).
- **Hecho:** T2.1 en verde; `vercel.json` sin cambios; las mutaciones de R6, R8 y R13 de
  `design.md > 5` ponen el test en rojo, y el implementer las anota.

## T3. Recifrado real de v1 a v9 con la composición de la ruta (R9-R12, R17) — depende de T2
- [ ] T3.1 Casos nuevos en `tests/integration/db/recifrado-integraciones.test.ts`. Usan
  `construirServicioRecifrado({ prisma: tx, env, recorrerEmpresas })` con claves generadas en el
  test. Cubren: solo-contar no escribe; recifrar cambia solo `secretos` (y `updated_at`); los valores
  se leen con un anillo solo `v9`; la segunda corrida no hace nada.
- **Hecho:** en verde con `HAY_BASE_DE_DATOS`, contra una base desechable, nunca la de desarrollo
  (exportar su URL antes de vitest). La mutación «solo-contar que escribe» lo pone en rojo y queda
  anotada. Si el test sale `skipped`, NO cuenta como hecho.

## T4. Textos y entorno [P] (con T2 o T3) — depende de T1
- [ ] `.env.example`: declarar `INTEGRACIONES_CLAVES_CIFRADO_EXTRA=` con su comentario (opcional; mismo
  formato; versiones que no se repitan; para qué sirve).
- [ ] `scripts/recifrar-integraciones.ts`: nombrar la variable nueva en la cabecera del procedimiento y
  en el mensaje «Revisa …». No cambia ninguna lógica.
- [ ] `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`: añadir
  `INTEGRACIONES_CLAVES_CIFRADO_EXTRA` a la lista de permitidas, junto a las otras `INTEGRACIONES_*`.
- **Hecho:** `pnpm run test:guardias` verde.

## T5. Cierre — depende de T1-T4
- [ ] `progress/impl_SLT-268.md` con: el mapa R -> test (R1-R17), la salida de T0 y las mutaciones
  medidas.
- [ ] `./init.sh` en verde, con `.env` copiado al worktree antes del primer gate.
- **Hecho:** gate local verde; el mapa cubre los 17 requisitos; el diff no toca
  `RecifradoIntegracionesService.ts`, `IntegracionRecifradoRepository.ts`, `vercel.json`, `db/` ni
  `middleware.ts`.

Los pasos operativos en prod (variables en Vercel, redeploy, solo-contar, ejecutar, prueba en
Ordenex) NO son tasks del implementer: están en `requirements.md > Pasos operativos` y los hace Carlos
después de la release.

## Tamaño

- **Producción:** 4 archivos, unas 150-190 líneas.
  - la ruta: unas 110;
  - `lib/config/integraciones.ts`: +30 a 40;
  - `.env.example`: +6;
  - `scripts/recifrar-integraciones.ts`: unas 5.
- **Tests:** 4 archivos, unas 330-420 líneas.
  - el unit de la ruta: unas 200;
  - el de config: +70;
  - el de integración: +90;
  - la guardia: +1.
- **Total:** 9 archivos con `progress/impl_SLT-268.md`. Queda muy por debajo del 80% de
  `gate.tamano_pr` (40 archivos).

## Archivos esperados

- `lib/config/integraciones.ts`
- `app/api/cron/recifrar-integraciones/route.ts`
- `.env.example`
- `scripts/recifrar-integraciones.ts`
- `tests/unit/config/integraciones-config.test.ts`
- `tests/unit/api/cron-recifrar-integraciones.test.ts`
- `tests/integration/db/recifrado-integraciones.test.ts`
- `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts`
- `progress/impl_SLT-268.md`
