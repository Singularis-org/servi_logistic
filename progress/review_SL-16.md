# Review SL-16 «Nombre «Ordenex» en docs, API y diseños»

Reviewer, 2026-10-22.
- Worktree `.worktrees/SL-16-nombre-ordenex-docs`, rama `feature/SL-16-nombre-ordenex-docs`.
- HEAD revisado: `4cb9812`. Diff `dev...HEAD`, con base `da40c12`: 64 rutas.
- No tenía el MCP del grafo: trabajé con Grep, Read y corridas.
- No leí `scratchpad/recursos-origen.ref`. En este informe no se imprime ningún email, dominio ni nombre del integrador.

## Corridas propias

| Corrida | Resultado |
|---|---|
| `vitest run` sobre `docs-marca-heredada`, `sin-nombre-heredado`, `dominio-…-fuera`, `recursos-origen-fuera`, `openapi-canal-rutas-reales`, `no-embalaje`, `nombres-wallet-461`, `ayuda-pantalla-ruta-existe`, `nombres-estado-retirados`, `tests/unit/api` y `tests/unit/asistente` | 53 archivos; 768 passed, 1 skipped; EXIT=0 |
| `pnpm run typecheck` | TC_EXIT=0 |
| `eslint` sobre los `.ts` del diff | LINT_EXIT=0 |
| EOL de los archivos añadidos o modificados | todos `w/lf` |
| `git diff --word-diff` de todo lo modificado, sin `specs/`, `progress/` ni guardias, mirando las palabras **quitadas** | solo la palabra heredada (con su puntuación y sus marcas), el prefijo de llave viejo, las cabeceras viejas, las URLs con el dominio heredado, las fechas `actualizado:` del frontmatter y el email de ejemplo de `docs/jira.md` |
| El mismo, mirando las palabras **añadidas** que no son «empresa», «Servi Logistic», `svl_`, `example.com`, fechas o «plataforma» | 4 tokens: la regex de `openapi-406`, su comentario y las dos líneas de nota de `DESIGN.md` |

### Mis mutaciones (una a una, revertidas con `git checkout`, árbol limpio después)

| # | Mutación | Resultado |
|---|---|---|
| M1 | el primer `svl_` de la colección de Postman pasa al prefijo viejo | rojo «R8, R13»: archivo, línea 5 y contexto |
| M2 | comentario con la palabra en MAYÚSCULAS y pegada a otra letra, en la línea 1 de `design-whatsapp/Main.dc.html` | rojo «R8, R13»: `Main.dc.html:1` |
| M3 | «tu plata con la empresa» → «…con Servi Logistic» en `docs/ayuda/tienda/mi-wallet.md` (operador → plataforma) | rojo «cada archivo contiene su forma final de cada frase de operador» (R7) |
| M4 | archivo nuevo **sin versionar** `docs/ayuda/tienda/zz-nuevo.md` con la palabra | rojo «R8, R13»: la guardia también ve lo no versionado |
| M5 | «Servi Logistic envía» → «la empresa envía» en `guia-integracion.html` (plataforma → operador) | **sobrevive**: `docs-marca-heredada` + `tests/unit/api`, 440 passed (ver H1) |

## Los puntos que pidió el leader

1. **El contrato de la API dice lo mismo en todos los sitios y coincide con el código.**
   - Código: `X-Servi-Logistic-Signature` y `X-Servi-Logistic-Timestamp` (`lib/crypto/webhook-firma.ts:11,13`), `svl_` (`api-key-generator.ts:8`) y `svl_whsec_` (`webhook-secret-generator.ts:9`).
   - En `docs/api/` y `lib/api/openapi-spec.ts` solo aparecen esas dos cabeceras (6 y 5 veces) y `svl_`. Fuera de `specs/` y `progress/`, `git grep` del prefijo viejo y de la cabecera vieja da 0.
   - El `Bearer svl_...` de `evidenciasUrl` es igual en el TS (l. 1131), el YAML (l. 926) y el test (`openapi-webhook-contrato.test.ts:233`). El de `info.description`, en el TS (l. 124), el YAML (l. 11) y la colección (l. 5).
   - La guía describe la firma igual que el código: la tabla de cabeceras de l. 854–855, `sha256=<hex>` y `${timestamp}.${cuerpo}` (`webhook-firma.ts:23,36`).
   - `svl_whsec_` no lo cita ningún doc: ni antes citaban el prefijo viejo del secreto ni lo citan ahora.
   - Hay un hueco heredado de SL-15: el YAML no nombra las cabeceras de firma (H3).
2. **Costa Rica.** 34 líneas `+/-` mencionan SINPE, colones, ₡, provincia, cantón o distrito. El word-diff confirma que en ellas solo cambia el nombre. No se quitó ni añadió ningún dato de Costa Rica (ver la tabla de corridas).
3. **La permanente de `pnpm-lock.yaml`.**
   - `problemaDeExcepcion()` solo admite `SL-<n>` sin `origen`, o `"permanente"` con `origen` no vacío. Las 7 contrapruebas sintéticas cubren cada combinación inválida.
   - Las excepciones de término siguen exigiendo `^SL-\d+$`, y `EXCEPCIONES_DOMINIO` lo exige en la guardia de SL-14. Por ahí no entra ninguna permanente.
   - Una permanente nueva obliga a editar el literal `["pnpm-lock.yaml"]` del caso «las permanentes son solo las registradas a mano», y eso queda en el diff.
   - Sigue sujeta a «ninguna excepción propia sobra».
   - El hueco que queda es otro: la excepción cubre **toda la clase email del archivo**, no el valor concreto (H2).
4. **`docs-marca-heredada` muerde:** M1–M4 en rojo, cada una con archivo y línea.
5. **Ninguna excepción real con `retira`/`ficha` SL-15 o SL-16.**
   - Listas reales: `docs-marca-heredada.EXCEPCIONES` (2 de historia, SL-27); `sin-nombre-heredado.EXCEPCIONES_DE_OTRAS_FICHAS` (solo SL-27); `recursos-origen-fuera.EXCEPCIONES` (solo la permanente); `EXCEPCIONES_TERMINO` (SL-27); `EXCEPCIONES_DOMINIO` (vacía).
   - Las SL-14, SL-15 y SL-16 que aparecen en el código están todas dentro de contrapruebas sintéticas.
6. **Desviaciones declaradas en la bitácora.**
   - **R22 nuevo:** cumplido. `docs/api/` y `openapi-406` quedan sin el dominio heredado y `EXCEPCIONES_DOMINIO` queda vacía; tiene caso propio en la guardia. También se reescribió con `example.com` la entrada histórica del CHANGELOG del 2026-08-22, que R22 lo pide.
   - **R20 corregido** (`docs/jira.md` autorizado): del manifiesto solo cambia `docs/jira.md`, y solo sus 2 líneas de ejemplo de email. En `specs/` solo cambia `specs/SL-16-…/`, y ninguna línea `+/-` nombra al integrador. Que tocar una línea con SINPE no viole R20 depende de cómo se lea (H5).
   - **Frases que cambian de clase.** «puede retirar una provincia» pasa a operador y «Mensajes de WhatsApp que … manda solo» a plataforma. Las dos siguen lo que dejó SL-15 en el código (`openapi-spec.ts:2006` con `EMPRESA.alInicio`, y `envios-whatsapp/page.tsx:36` con `MARCA.nombre`), así que cumplen R16. La primera abre una duda de producto (H4).
   - **`EMPRESA.enFrase`/`alInicio`:** la guardia compara `TERMINO_EMPRESA` y `TERMINO_EMPRESA_INICIO`, escritos a mano, con `lib/config/marca.ts`. La mutación 6c de T8 lo prueba.

## Checklist

### Trazabilidad
- [x] R1–R5: casos de destino y rutas de la guardia (`existsSync`, R5 con contraprueba).
- [ ] **R6: sin un test que lo verifique** fuera de los títulos (H1).
- [x] R7: `FRASES_OPERADOR` (156) y el término contra `EMPRESA`. M3 lo mata.
- [x] R8 y R13: barrido. M1, M2 y M4 lo matan.
- [x] R9–R12: casos sobre la lista real, más contrapruebas (mutaciones 2–6b de T8).
- [x] R14: raíces, suelo de 84 y contrapruebas del detector.
- [x] R15, R16, R18 y R19: casos propios (mutaciones 9 y 10 de T8).
- [x] R17: `openapi-266` y `openapi-320` leen la ruta nueva. El diff solo cambia ese literal.
- [x] R20: revisión del diff (arriba).
- [x] R21: el implementer registra `INIT_EXIT=0` en `_trabajo/gate-T9.log`. No lo repetí, por consigna; lo que corrí está arriba.
- [x] R22–R25: casos de `docs-marca-heredada`, `recursos-origen-fuera`, `sin-nombre-heredado` y `openapi-webhook-contrato`.
- [x] Mapa `R<n> → test` en `progress/impl_SL-16.md`.

### Tasks
- [x] T0–T9 y T7b marcadas `[x]`.

### CHECKPOINTS.md
- [x] `requirements.md` con EARS R1–R25. `design.md` con 8 alternativas descartadas.
- [x] `design.md` abre con `## Lo que ya existe`. El diff no re-crea nada: reutiliza `EMPRESA`/`MARCA`, `quitarComentarios`, `partirFrontmatter` y `NOMBRE_HEREDADO`.
- [ ] Assignee en Jira y `wt.sh new`: no lo puedo verificar desde aquí. Es del leader.
- [x] Typecheck y lint sin errores.
- [ ] `gate-completo` del CI: pendiente del PR.
- [x] Flujo crítico con E2E: no aplica; son docs y texto del contrato.
- [x] Dependencias: ninguna. `package.json` y el lockfile sin cambios.
- [x] Secretos y configuración: nada hardcodeado. Los ejemplos usan `example.com`.
- [ ] `./init.sh`, cierre de `progress/features/SL-16.md` y desmontar el worktree: del leader, tras el OK.
- [ ] `docs/jira.md` sin subir a la plantilla (`arnes-sync --subir`): el gate lo avisa. Lo hace el leader (R25).

### docs/checkpoints-proyecto.md y docs/perfil-agentes.md > reviewer
- [x] Sin tablas, queries, RLS ni migraciones.
- [x] Ningún recurso de Ordenex en el diff. Al contrario, el diff los saca: dominio, emails, prefijo y cabeceras.
- [x] Sin literales nuevos de país o moneda (word-diff).
- [x] Comentarios con el porqué: la permanente explica de dónde sale el valor y por qué no se edita, y `_dominio-heredado.ts` por qué la lista queda vacía.

## Hallazgos

- **H1 — BLOQUEANTE (trazabilidad de R6).** R6 exige «Servi Logistic» donde el texto habla de la plataforma, y el mapa lo atribuye a la guardia «más la clasificación de T1». La guardia solo lo comprueba en los títulos (R2, R15, R18, R19). Para las demás frases de plataforma no hay ninguna aserción.
  - M5 lo demuestra: «Servi Logistic envía» → «la empresa envía» sobrevive con todo en verde. Ese error de clasificación es el contrario del que vigila R7, y la decisión P1 del humano los trata como igual de graves.
  - Para cerrarlo, el implementer añade `FRASES_PLATAFORMA`, escrita a mano con la forma final de las frases de plataforma que midió T1: al menos las de `docs/api/`, `docs/ayuda/` y las maquetas que no son títulos, incluidas las dudosas resueltas como plataforma. Por cada frase se afirma:
    - que el archivo la contiene;
    - que lleva «Servi Logistic»;
    - que no lleva `TERMINO_EMPRESA` ni `TERMINO_EMPRESA_INICIO`.

    Es el mismo patrón que R7. Después, M5 tiene que salir en rojo.
- **H2 — menor (la permanente de `pnpm-lock.yaml`).** La excepción se casa por `ruta` + `clase` (`recursos-origen-fuera`, l. 696), así que deja pasar **cualquier** email presente o futuro de `pnpm-lock.yaml`, no solo el del aviso `deprecated` de `glob@7.2.3`. Hoy el archivo tiene uno solo.
  - Mientras era temporal, este alcance tenía fecha de caducidad. Como permanente, un email que llegue con otra dependencia pasa en silencio, y «sobra» solo salta si desaparecen todos.
  - Sugerencia: atar la permanente al valor, como `ExcepcionTermino` (`{largo, sha256}`) o con un conteo exacto, para que un segundo email la ponga en rojo.
  - El control de permanentes nuevas, en cambio, está bien cerrado (punto 3).
- **H3 — menor (contrato, heredado de SL-15).** `openApiSpec.info.description` lleva desde SL-15 el párrafo «Webhooks: cada entrega va firmada…» con las dos cabeceras (`openapi-spec.ts:134-139`), y el `info.description` del YAML no lo tiene. Así que el YAML no nombra las cabeceras de firma en ningún sitio. No contradice al código ni lo pide R16, que solo cubre lo que cambia esta ficha. Aun así, es la única divergencia TS↔YAML del contrato que encontré. Conviene llevarla al YAML aquí, o abrir una ficha para eso.
- **H4 — menor (decisión de producto).** «… puede retirar una provincia» pasa a ser del operador, «La empresa», siguiendo `EMPRESA.alInicio` del código de SL-15. El design lo había clasificado como plataforma por `docs/plan-saas.md`, decisión 5: «lo único que se dispone de serie es la geografía del país». Docs y código son coherentes entre sí, pero conviene que el humano confirme quién retira la geografía. Si es la plataforma, cambian juntos el TS, el YAML y el CHANGELOG.
- **H5 — menor (redacción de R20).** R20 dice «ninguna línea que nombre… SINPE o colones», y el diff toca 13 de esas líneas, aunque solo para cambiar el nombre (verificado con el word-diff). La lectura de la bitácora, «no tocar ese contenido», es la razonable. Conviene corregir R20 con esas palabras para que el spec no se contradiga con lo entregado.

## Veredicto

**RECHAZADO**: 1 bloqueante (H1, R6 sin un test que lo verifique). Basta con añadir `FRASES_PLATAFORMA` a `docs-marca-heredada.guardia.test.ts` y comprobar que M5 sale en rojo. H2–H5 son menores. En la vuelta 2 revisaré solo ese diff.

## Vuelta 2 (acotada a 0cc3760..a365758)

Son 5 commits y 6 archivos: las dos guardias, `requirements.md`, `tasks.md`, `progress/deudas.md` y la bitácora. No leí `scratchpad/recursos-origen.ref`, y este informe no lleva ningún email.

### Corridas propias

| Corrida | Resultado |
|---|---|
| `vitest run` de `docs-marca-heredada`, `recursos-origen-fuera`, `sin-nombre-heredado` y `dominio-…-fuera` | 4 archivos; 100 passed, 1 skipped |
| `pnpm run typecheck` | TC=0 |
| `eslint` de las dos guardias tocadas | LINT=0 |
| EOL de las guardias y de `deudas.md` | `w/lf` |
| **M6** (H1): en `docs/ayuda/publico/rastreo-de-paquete.md`, «cuenta en Servi Logistic» → «cuenta en la empresa» | rojo: «cada archivo contiene su forma final de cada frase de plataforma», con la frase y «(0 de 1)» |
| **M7** (H1): en `design-whatsapp/Historial.dc.html`, la cabecera «Servi Logistic» → «la plataforma» | rojo, el mismo caso: «…600;">Servi Logistic</span>» (0 de 1) |
| **M8** (H2): una segunda copia del **mismo** email en `pnpm-lock.yaml`. El implementer había probado con uno distinto | rojo: «SL-16 H2: … aparece 2 vez/veces; se registró 1» |
| Huella de H2 recalculada en local, sin imprimir el valor (minúsculas, sha256) | largo 8, y el prefijo de la huella coincide con el `sha256` registrado |

Las tres mutaciones se revirtieron con `git checkout`, y el árbol quedó limpio después de cada una.

### Hallazgos de la vuelta 1

- **H1 (BLOQUEANTE): cerrado.**
  - `FRASES_PLATAFORMA` tiene 50 frases escritas a mano, cada una con su archivo. Por cada frase, la guardia comprueba que el archivo la contiene las veces registradas y que no lleva el término de la empresa.
  - Anti-vacuidad: hay un mínimo de 50, al menos una frase por raíz y todas dentro del alcance.
  - Mis dos mutaciones (M6, M7) y la M5 de la vuelta 1 salen en rojo. El mapa de R6 en `tasks.md` apunta ya a `FRASES_PLATAFORMA`.
- **«la plataforma» como forma válida: legítimo, con un matiz.**
  - `MARCAS_PLATAFORMA` solo interviene al validar la lista escrita a mano. La detección compara la frase literal con el archivo, así que cambiar «Servi Logistic» por «la plataforma» en un doc lo detecta igual (M7).
  - La única frase que la usa es el comentario de webhooks del YAML («lo que la plataforma ENVÍA…»). Es espejo del comentario de `openapi-spec.ts:907` que dejó SL-15. Nombra a la plataforma, no a la empresa, y R6 busca distinguir las dos.
  - Menor (m1): la marca es global. Quien añada a mano una frase nueva con «la plataforma» en vez de «Servi Logistic» pasa la validación de la lista. Se puede ceñir esa forma a esa única frase, con un campo de la entrada en vez de la lista global. No bloquea.
- **H2: cerrado.**
  - La permanente lleva `valor: { largo, sha256, veces }` y no escribe el email en claro. Comprobé que el diff no añade ninguna cadena con forma de email.
  - `permanenteFueraDeValor()` usa la misma extracción que `detectar()` (`emailsVisibles`, en minúsculas). Los mensajes no imprimen el valor.
  - Cubre tres casos: un email distinto, que lo probó el implementer; el mismo repetido, M8; y el registrado ausente, en la contraprueba.
  - `problemaDeExcepcion()` exige la huella en las permanentes y la prohíbe en las temporales.
  - Efecto esperado: si se regenera el lockfile y entra un email nuevo, o desaparece el de glob, la guardia sale en rojo y hay que medir otra vez a mano. Es justo el control que faltaba.
- **H3: cerrado, como deuda.** Va a `progress/deudas.md` D6 con origen (SL-15), qué falta (llevar el párrafo de firma al YAML con test de paridad) y dueño (Carlos). Está bien fuera de esta ficha, porque R16 no lo cubre.
- **H4: abierto, lo decide Carlos.** No bloquea, como indicó el leader.
- **H5: cerrado.** R20 dice ahora que no se toca el contenido del integrador ni los literales de Costa Rica, SINPE o colones, y que una línea que los contiene solo puede cambiar para sustituir el nombre. Coincide con lo entregado y con el word-diff de la vuelta 1.

### Regresiones

No encontré ninguna. El gate rápido del implementer (`_trabajo/gate-v2.log`) da `INIT_EXIT=0`; no lo repetí, por consigna.

**Veredicto vuelta 2: OK**, sin bloqueantes. Queda un menor nuevo (m1) y H4 sigue pendiente de Carlos. Quedan para el leader:
- el `gate-completo` del CI;
- subir `docs/jira.md` a la plantilla (R25);
- el cierre de `progress/features/SL-16.md` y desmontar el worktree.
