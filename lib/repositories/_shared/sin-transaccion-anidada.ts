// SLT-65 — EL CLIENTE DE UNA TRANSACCION YA ABIERTA, SIN `$transaction`.
//
// En Prisma 7 el `tx` de una transaccion interactiva (tambien el del cliente extendido de
// `extension-empresa`) SI expone `$transaction`, y llamarlo abre una transaccion ANIDADA. Un
// repositorio que decide por `typeof prisma.$transaction` si abre la suya o lee en la que ya hay
// (`CatalogoGeograficoRepository.enUnaFoto`) abre entonces una anidada. Y Prisma, al anidar, escribe
// el id de la transaccion de fuera (`newTxId`) en el objeto de opciones que recibe: si es una
// constante del modulo, la SIGUIENTE transaccion que se abra con ella fuera de otra reusa ese id, ya
// confirmado, y cae con «Transaction already closed: A start cannot be executed on a committed
// transaction». Medido en `zona-especial-dos-empresas.test.ts` (R20/R21 y SLT-65 R17).
//
// Ocultar `$transaction` deja al repositorio leyendo en ESTA transaccion, en serie, sin anidar.

/** `tx` tal cual, salvo que `$transaction` es `undefined`. */
export function sinTransaccionAnidada<T extends object>(tx: T): Omit<T, "$transaction"> {
  return new Proxy(tx, {
    get: (objetivo, prop) => (prop === "$transaction" ? undefined : Reflect.get(objetivo, prop)),
  });
}
