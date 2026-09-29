const fs = require('fs/promises');
const path = require('path');
const { conectarDB } = require('../comun/db');
const { COLA, declararTopologia, conectarRabbit } = require('../comun/cola');
const { esperar, hora } = require('../comun/util');

// Duración deliberada de la acción (por defecto entre 3 y 5 segundos).
// Para el caso 2 del taller se sube a 15 s con PROCESO_MIN_MS=PROCESO_MAX_MS=15000.
const PROCESO_MIN_MS = Number(process.env.PROCESO_MIN_MS || 3000);
const PROCESO_MAX_MS = Number(process.env.PROCESO_MAX_MS || 5000);
// Caso 3: los pagos cuya referencia empiece por este prefijo provocan un error al procesarse.
const PREFIJO_FALLO = process.env.PREFIJO_FALLO || 'FALLA';
const DIR_COMPROBANTES = process.env.DIR_COMPROBANTES || '/app/comprobantes';

let pool;

const duracionAccion = () =>
  PROCESO_MIN_MS + Math.floor(Math.random() * (Math.max(PROCESO_MAX_MS, PROCESO_MIN_MS) - PROCESO_MIN_MS + 1));

// Acción de procesamiento: generar un comprobante de pago en un archivo de texto.
async function generarComprobante(pago, tomado) {
  const duracion = duracionAccion();

  if (pago.referencia.toUpperCase().startsWith(PREFIJO_FALLO)) {
    await esperar(Math.floor(duracion / 2));
    throw new Error(`fallo simulado al generar el comprobante de ${pago.referencia}`);
  }

  await esperar(duracion);

  const archivo = path.join(DIR_COMPROBANTES, `comprobante-${String(pago.id).padStart(6, '0')}.txt`);
  const contenido = [
    '=========== COMPROBANTE DE PAGO ===========',
    `Pago N.º:          ${pago.id}`,
    `Referencia:        ${pago.referencia}`,
    `Valor:             $ ${Number(pago.valor).toLocaleString('es-CO', { minimumFractionDigits: 2 })}`,
    `Medio de pago:     ${pago.medio}`,
    `Fecha de registro: ${pago.fecha_registro}`,
    `Tomado de la cola: ${tomado.toISOString()}`,
    `Emitido:           ${new Date().toISOString()}`,
    '===========================================',
    '',
  ].join('\n');
  await fs.writeFile(archivo, contenido, 'utf8');

  return `Comprobante ${path.basename(archivo)} generado en ${(duracion / 1000).toFixed(1)} s`;
}

async function procesar(canal, msg) {
  const tomado = new Date();
  const intento = Number(msg.properties.headers?.['x-delivery-count'] || 0) + 1;
  let pagoId = '?';

  try {
    ({ pagoId } = JSON.parse(msg.content.toString()));
    console.log(`[consumidor] pago ${pagoId} | TOMADO de la cola a las ${hora(tomado)} (intento ${intento})`);

    const [filas] = await pool.execute('SELECT * FROM pagos WHERE id = ?', [pagoId]);
    if (filas.length === 0) throw new Error(`el pago ${pagoId} no existe en la base de datos`);
    const pago = filas[0];

    if (pago.estado === 'PROCESADO') {
      // Mensaje repetido (p. ej. se cayó justo antes de confirmar): no se procesa dos veces.
      canal.ack(msg);
      console.log(`[consumidor] pago ${pagoId} | ya estaba PROCESADO; mensaje descartado`);
      return;
    }

    const resultado = await generarComprobante(pago, tomado);

    // Estado y registro de la acción en una sola transacción.
    const cx = await pool.getConnection();
    try {
      await cx.beginTransaction();
      await cx.execute("UPDATE pagos SET estado = 'PROCESADO' WHERE id = ? AND estado = 'REGISTRADO'", [pagoId]);
      await cx.execute(
        'INSERT INTO procesamientos (pago_id, fecha_toma, fecha_procesamiento, resultado) VALUES (?, ?, NOW(3), ?)',
        [pagoId, tomado, resultado],
      );
      await cx.commit();
    } catch (err) {
      await cx.rollback();
      throw err;
    } finally {
      cx.release();
    }

    // La confirmación se envía AL FINAL: solo ahora el mensaje sale de la cola.
    canal.ack(msg);
    const fin = new Date();
    console.log(
      `[consumidor] pago ${pagoId} | TERMINADO a las ${hora(fin)} ` +
      `(duración ${((fin - tomado) / 1000).toFixed(2)} s) -> PROCESADO. ${resultado}`,
    );
  } catch (err) {
    console.error(`[consumidor] pago ${pagoId} | ERROR a las ${hora()} (intento ${intento}): ${err.message}`);
    console.error(`[consumidor] pago ${pagoId} | el mensaje se devuelve a la cola; el pago sigue REGISTRADO`);
    await esperar(1000);
    // requeue = true: vuelve a la cola. Al superar x-delivery-limit, RabbitMQ lo
    // mueve a la cola de fallidos (dead letter). En ningún caso se pierde.
    canal.nack(msg, false, true);
  }
}

async function main() {
  await fs.mkdir(DIR_COMPROBANTES, { recursive: true });
  pool = await conectarDB('consumidor');

  const conexion = await conectarRabbit('consumidor');
  conexion.on('close', () => {
    console.error('[consumidor] conexión con RabbitMQ cerrada; reiniciando');
    process.exit(1); // Docker lo reinicia (restart: unless-stopped)
  });

  const canal = await conexion.createChannel();
  await declararTopologia(canal);
  await canal.prefetch(1); // un mensaje a la vez

  await canal.consume(COLA, (msg) => msg && procesar(canal, msg), { noAck: false });
  console.log(
    `[consumidor] esperando mensajes en "${COLA}" (acción de ${PROCESO_MIN_MS / 1000}-${PROCESO_MAX_MS / 1000} s, ` +
    `fallo simulado para referencias "${PREFIJO_FALLO}*")`,
  );
}

main().catch((err) => {
  console.error('[consumidor] error fatal:', err);
  process.exit(1);
});
