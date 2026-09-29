// Topología de RabbitMQ. La API y el consumidor declaran exactamente lo mismo
// (si los argumentos difieren, RabbitMQ rechaza la declaración).
const amqp = require('amqplib');
const { esperar, conReintentos } = require('./util');

const COLA = process.env.RABBITMQ_QUEUE || 'pagos.registrados';
const COLA_FALLIDOS = `${COLA}.fallidos`;
const DLX = `${COLA}.dlx`;

async function declararTopologia(canal) {
  // Mensajes que agotan sus reintentos terminan aquí: no se pierden.
  await canal.assertExchange(DLX, 'fanout', { durable: true });
  await canal.assertQueue(COLA_FALLIDOS, { durable: true });
  await canal.bindQueue(COLA_FALLIDOS, DLX, '');

  // Cola quorum: durable, cuenta las entregas (x-delivery-count) y, tras
  // 3 reintentos fallidos (4 entregas), envía el mensaje a la cola de fallidos.
  await canal.assertQueue(COLA, {
    durable: true,
    arguments: {
      'x-queue-type': 'quorum',
      'x-delivery-limit': 3,
      'x-dead-letter-exchange': DLX,
    },
  });
}

async function conectarRabbit(nombre) {
  const url = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
  return conReintentos(`RabbitMQ (${nombre})`, async () => {
    const conexion = await amqp.connect(url);
    conexion.on('error', (err) => console.error(`[rabbitmq] error de conexión: ${err.message}`));
    return conexion;
  });
}

module.exports = { COLA, COLA_FALLIDOS, declararTopologia, conectarRabbit, esperar };
