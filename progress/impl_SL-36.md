# impl SL-36 «integraciones-por-empresa» — bitácora consolidada

Rama `feature/SL-36-integraciones-por-empresa`, worktree `.worktrees/SL-36-integraciones-por-empresa/`.
Spec: `specs/SL-36-integraciones-por-empresa/`. Detalle por tanda (archivos, mutaciones, desviaciones):

| Tanda | Bitácora |
|---|---|
| T1 datos, T2 bóveda | `progress/impl_SL-36-T1-T2.md` |
| T3 repositorios, T5.5 catálogo | `progress/impl_SL-36-T3.md` |
| T4 probadores | `progress/impl_SL-36-T4.md` |
| T5.1-T5.2 services | `progress/impl_SL-36-T5a.md` |
| T5.3-T5.4 webhook y recifrado | `progress/impl_SL-36-T5b.md` |
| T6.1-T6.2 WhatsApp y webhook | `progress/impl_SL-36-T6a.md` |
| T6.3-T6.5 Maps, rutas, asistente | `progress/impl_SL-36-T6b.md` |
| T6.6-T6.7 builders, docs, guardia R41 | `progress/impl_SL-36-T6c.md` |
| T7.1 actions | `progress/impl_SL-36-T7a.md` |
| T7.2 pantalla | `progress/impl_SL-36-T7b.md` |
| T8.1 guías | `progress/impl_SL-36-T8.md` |
| T9.1 E2E | `progress/impl_SL-36-T9.md` |

## Archivos

Diff contra `d461727` (spec): 203 archivos, 101 nuevos, 98 modificados, 4 borrados
(`lib/auth/google-wif-token.ts`, `lib/auth/google-adc-token.ts` y sus tests, design §9.2).

- Datos: `db/schema.prisma`; migraciones `20261025120000_integracion` y
  `20261025120100_historial_accion_integraciones`, cada una con `down.sql`; `lib/db/modelos-de-negocio.ts`;
  `lib/db/excepciones-aislamiento.ts`; `lib/types/historial-accion*.ts`.
- Bóveda y config: `lib/crypto/boveda-integraciones.ts`, `lib/config/integraciones.ts` y
  `lib/types/integraciones.ts` (catálogo, con las marcas como constante PROVISIONAL).
- Interfaces: `lib/interfaces/external/{ICifradorSecretos,IResumenSecreto,IFuenteAleatoria,IProbadorIntegracion}.ts`,
  `lib/interfaces/repositories/IIntegracion{,Enrutado,PruebaMinuto,Recifrado}Repository.ts` y
  `lib/interfaces/services/{IIntegracionesService,ICredencialesIntegracion,IWebhookWhatsappService,IRecifradoIntegracionesService}.ts`.
- Repositorios: `lib/repositories/Integracion{,Enrutado,PruebaMinuto,Recifrado}Repository.ts` y
  `EmpresasPlataformaRepository.ts`.
- Services: `lib/services/{Integraciones,CredencialesIntegracion,WebhookWhatsapp,RecifradoIntegraciones,EmpresasPlataforma}Service.ts`;
  `lib/services/integraciones/{credencial-de-la-empresa,rutas-de-la-empresa,asistente-de-la-empresa}.ts`;
  `lib/services/whatsapp/whatsapp-de-la-empresa.ts`.
- Probadores: `lib/clients/probadores/*`. R30 de WhatsApp en `lib/clients/whatsapp-rechazo-credencial.ts`.
- Consumidores: todos los de design §9.1 (WhatsApp, Maps, rutas, asistente), más `procesar-jobs`, el cron de
  plantillas, `chat/media` y el webhook. La tabla de composition root está en T6a, T6b y T6c.
- Comando: `scripts/recifrar-integraciones.ts`, `package.json` (`integraciones:recifrar`).
- Pantalla: `lib/actions/integraciones.ts`, `lib/actions/_shared/integraciones.ts`,
  `app/(app)/configuracion/integraciones/` y `lib/auth/menu-visibility.ts`.
- Guías: `docs/ayuda/oficina/{configuracion-integraciones,integracion-whatsapp,integracion-google-maps,integracion-optimizacion-rutas,integracion-asistente}.md`.
- E2E: `e2e/integraciones-por-empresa.spec.ts` y `playwright.config.ts` (proyecto `aislamiento`; probador doble y anillo de prueba en `webServer.env`).
- Configuración y documentación: `.env.example`, `README.md`, `docs/architecture.md`, `progress/deudas.md` (D10 resuelta).

## Mapa R<n> → test

Los nombres de caso son los de la tabla de `tasks.md > Trazabilidad`. Todos los archivos se corrieron juntos
(salida abajo). Las pruebas de base real corrieron contra Postgres local (`servi_logistic_sl36`), con 0 skipped.

| R | Test | Tipo |
|---|---|---|
| R1, R2, R3, R38 | `tests/unit/crypto/boveda-integraciones.test.ts` | unit |
| R4 | `tests/unit/config/integraciones-config.test.ts` (+ caso R4 en la bóveda) | unit |
| R5 | `tests/integration/db/integracion-dos-empresas.test.ts` › «R5 …» + `integracion-migracion.test.ts` (CHECK) + `tests/unit/services/integraciones-service.test.ts` (vista sin secretos) | base real + unit |
| R6, R7 | `tests/unit/services/integraciones-autorizacion.test.ts` (6 operaciones × 9 actores) | unit |
| R8 | `integracion-dos-empresas.test.ts` › «R8 …» (repo y SQL a mano con `comoApp(B)`) + `integracion-migracion.test.ts` (RLS) | base real |
| R9 | `integraciones-service.test.ts` + `integracion-dos-empresas.test.ts` › «R9 …» | unit + base real |
| R10, R11, R32, R33 | `integracion-dos-empresas.test.ts` | base real |
| R12-R15 | `integraciones-service.test.ts` | unit |
| R16 | `tests/integration/db/integracion-prueba-minuto.test.ts` + `integraciones-service.test.ts` (`reintentarEnS`) | base real + unit |
| R17 | `tests/unit/clients/probadores/*.test.ts` | unit |
| R18 | `integraciones-service.test.ts` + `tests/components/integraciones/IntegracionesModule.test.tsx` + E2E «al recargar no está en el HTML» | unit + componente + E2E |
| R19, R21 | `tests/unit/services/webhook-whatsapp-service.test.ts` (+ casos en la ruta de integración) | unit |
| R20 | `webhook-whatsapp-service.test.ts` + `tests/integration/api/webhook-whatsapp.route.test.ts` › «⭑ R20: dos empresas …» | unit + base real |
| R22 | `tests/unit/guards/plataforma-solo-en-lista.guardia.test.ts` + `tests/integration/db/integracion-enrutado.test.ts` | guardia + base real |
| R23 | `tests/unit/services/credenciales-integracion-service.test.ts` + `whatsapp-composition-root.test.ts` + `integraciones-consumidores-composition-root.test.ts` | unit |
| R24 | `tests/unit/services/whatsapp-sin-integracion.test.ts` | unit |
| R25 | `tests/unit/services/geocodificacion-service.test.ts` + `asignabilidad-coordenadas.test.ts` | unit |
| R26 | `tests/unit/services/optimizacion-ruta-degradacion.test.ts` | unit |
| R27 | `tests/integration/asistente-route.test.ts` › «sin integración: texto de R27 …» | integración |
| R28 | `tests/unit/clients/whatsapp-app-id.test.ts` › «la caché de A no responde a B» + `tests/unit/services/optimizacion-ruta-token-por-empresa.test.ts` | unit |
| R29 | `credenciales-integracion-service.test.ts` + casos «ilegible» en los consumidores | unit |
| R30 | `credenciales-integracion-service.test.ts` › «marcarRechazo» + `whatsapp-rechazo-credencial.test.ts` (Meta 401/190) + REQUEST_DENIED (`geocodificacion-service.test.ts`), invalid_grant/401 y 403 → permiso (`optimizacion-ruta-token-por-empresa.test.ts`), Anthropic 401 (`asistente-route.test.ts`), y los cuatro de extremo a extremo en `integraciones-consumidores-composition-root.test.ts` | unit + integración |
| R31 | `tests/components/integraciones/DesconectarDialogo.test.tsx` (literales del design §7 escritos en el test) + E2E | componente + E2E |
| R34 | `tests/components/integraciones/TarjetaIntegracion.test.tsx` | componente |
| R35 | `TarjetaIntegracion.test.tsx` › «enlace a la guía» + `tests/unit/ayuda/guias-integraciones.test.ts` | componente + unit |
| R36 | `tests/components/integraciones/FormularioIntegracion.test.tsx` + E2E | componente + E2E |
| R37 | `tests/integration/db/empresas-plataforma-integraciones.test.ts` | base real |
| R39, R40 | `tests/integration/db/recifrado-integraciones.test.ts` | base real |
| R41 | `tests/unit/guards/sin-credenciales-de-entorno.guardia.test.ts` | guardia |

Cada test clave se mató con una mutación antes de darlo por bueno. La lista y el resultado de cada una están en
la bitácora de su tanda. Hubo dos supervivientes, y en los dos se arregló el test:
- la dirección fija de Maps: el test comparaba contra su propia constante;
- `metaReal` sin `fetchImpl`: faltaba un test de composition root.

## Salida real

Tests de la trazabilidad, juntos, con `DATABASE_URL` de la base de la feature (2026-10-25):

```
 Test Files  38 passed (38)
      Tests  559 passed (559)
EXIT=0
```

E2E (`progress/impl_SL-36-T9.md`), base desechable `servi_logistic_sl36_e2e` recreada solo antes de la primera
corrida, después de `next build`:

```
E2E_PUERTO=3044 pnpm exec playwright test e2e/integraciones-por-empresa.spec.ts --project=aislamiento --no-deps --reporter=list
corrida 1: 4 passed (13.4s)   exit 0
corrida 2: 4 passed (13.3s)   exit 0
```

Gate local: ver `progress/features/SL-36.md > Tandas`.

## Abierto

- T8.2: falta la revisión humana de los pasos en las consolas de terceros. La lista de pasos marcados
  «(verificar en la consola)» está en `progress/impl_SL-36-T8.md`.
- T9.1, segundo navegador: `playwright.config.ts` solo define Chromium. Añadir otro es una decisión de CI.
