const express = require('express');
const { conectarDB } = require('../comun/db');
const { COLA, declararTopologia, conectarRabbit } = require('../comun/cola');
const { esperar, hora } = require('../comun/util');

const PUERTO = Number(process.env.PORT || 3000);
const MEDIOS_VALIDOS = ['transferencia', 'tarjeta', 'efectivo', 'pse', 'nequi', 'daviplata'];

let pool;
let canal = null; // canal con confirmaciones del broker (confirm channel)

// ---------------------------------------------------------------------------
// RabbitMQ: conexión con reintentos y reconexión automática
// ---------------------------------------------------------------------------
async function iniciarRabbit() {
  const conexion = await conectarRabbit('api');
  const nuevoCanal = await conexion.createConfirmChannel();
  await declararTopologia(nuevoCanal);
  canal = nuevoCanal;
  conexion.on('close', async () => {
    console.error('[rabbitmq] conexión cerrada; reconectando...');
    canal = null;
    await esperar(3000);
    iniciarRabbit();
  });
}

function publicar(mensaje) {
  return new Promise((resolve, reject) => {
    canal.sendToQueue(
      COLA,
      Buffer.from(JSON.stringify(mensaje)),
      { persistent: true, contentType: 'application/json' },
      (err) => (err ? reject(err) : resolve()), // se resuelve cuando el broker confirma que lo guardó
    );
  });
}

// ---------------------------------------------------------------------------
// Validación
// ---------------------------------------------------------------------------
function validarPago(body) {
  if (!body || typeof body !== 'object') return false;
  const { referencia, valor, medio } = body;
  if (typeof referencia !== 'string' || !/^[A-Za-z0-9_-]{1,50}$/.test(referencia.trim())) return false;
  if (typeof valor !== 'number' || !Number.isFinite(valor) || valor <= 0 || valor > 999999999999) return false;
  if (typeof medio !== 'string' || !MEDIOS_VALIDOS.includes(medio.trim().toLowerCase())) return false;
  return true;
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------
const app = express();

app.use(express.json());
// JSON mal formado => mismo formato de error que una validación fallida
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ status: false, message: 'Datos del pago inválidos' });
  }
  next(err);
});

// Tiempo de respuesta visible en cada respuesta (cabecera X-Response-Time)
app.use((req, res, next) => {
  const inicio = process.hrtime.bigint();
  const writeHead = res.writeHead;
  res.writeHead = function (...args) {
    const ms = Number(process.hrtime.bigint() - inicio) / 1e6;
    res.setHeader('X-Response-Time', `${ms.toFixed(2)} ms`);
    return writeHead.apply(this, args);
  };
  next();
});

app.post('/pagos', async (req, res) => {
  const t0 = process.hrtime.bigint();

  // Paso 2: validar. Si falla, no se inserta ni se publica nada.
  if (!validarPago(req.body)) {
    return res.status(400).json({ status: false, message: 'Datos del pago inválidos' });
  }
  if (!canal) {
    return res.status(503).json({ status: false, message: 'Servicio de mensajería no disponible, intente de nuevo' });
  }

  const referencia = req.body.referencia.trim();
  const medio = req.body.medio.trim().toLowerCase();
  const { valor } = req.body;

  // Paso 3: insertar con estado REGISTRADO.
  let id;
  try {
    const [resultado] = await pool.execute(
      "INSERT INTO pagos (referencia, valor, medio, estado) VALUES (?, ?, ?, 'REGISTRADO')",
      [referencia, valor, medio],
    );
    id = resultado.insertId;
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ status: false, message: 'Ya existe un pago con esa referencia' });
    }
    console.error('[api] error al insertar:', err.message);
    return res.status(500).json({ status: false, message: 'Error interno al registrar el pago' });
  }

  // Paso 4: publicar el identificador DESPUÉS de que el pago quedó guardado.
  try {
    await publicar({ pagoId: id });
  } catch (err) {
    // El pago quedó guardado pero sin mensaje: se informa para que pueda reenviarse.
    console.error(`[api] pago ${id} guardado pero NO publicado: ${err.message}`);
    return res.status(500).json({ status: false, message: 'Pago guardado pero no encolado', data: { id, estado: 'REGISTRADO' } });
  }

  // Paso 5: responder de inmediato. No se espera al consumidor.
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  console.log(`[api] ${hora()} pago ${id} (${referencia}) registrado y encolado en ${ms.toFixed(2)} ms`);
  return res.status(201).json({ status: true, message: 'Pago registrado', data: { id, estado: 'REGISTRADO' } });
});

const SELECT_PAGO = `
  SELECT p.id, p.referencia, p.valor, p.medio, p.fecha_registro, p.estado,
         pr.fecha_toma, pr.fecha_procesamiento, pr.resultado
  FROM pagos p
  LEFT JOIN procesamientos pr ON pr.pago_id = p.id`;

function formatear(fila) {
  const { fecha_toma, fecha_procesamiento, resultado, ...pago } = fila;
  pago.procesamiento = fecha_procesamiento ? { fecha_toma, fecha_procesamiento, resultado } : null;
  return pago;
}

app.get('/pagos/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ status: false, message: 'Identificador inválido' });
  }
  try {
    const [filas] = await pool.execute(`${SELECT_PAGO} WHERE p.id = ?`, [id]);
    if (filas.length === 0) {
      return res.status(404).json({ status: false, message: 'Pago no encontrado' });
    }
    return res.json({ status: true, message: 'Pago encontrado', data: formatear(filas[0]) });
  } catch (err) {
    console.error('[api] error al consultar:', err.message);
    return res.status(500).json({ status: false, message: 'Error interno al consultar el pago' });
  }
});

// Listado (apoyo para evidencias): GET /pagos?estado=REGISTRADO&limite=50
app.get('/pagos', async (req, res) => {
  const limite = Math.min(Math.max(Number(req.query.limite) || 50, 1), 500);
  const estado = ['REGISTRADO', 'PROCESADO'].includes(req.query.estado) ? req.query.estado : null;
  try {
    const [filas] = await pool.query(
      `${SELECT_PAGO} ${estado ? 'WHERE p.estado = ?' : ''} ORDER BY p.id DESC LIMIT ${limite}`,
      estado ? [estado] : [],
    );
    return res.json({ status: true, message: `${filas.length} pago(s)`, data: filas.map(formatear) });
  } catch (err) {
    console.error('[api] error al listar:', err.message);
    return res.status(500).json({ status: false, message: 'Error interno al listar los pagos' });
  }
});

app.get('/salud', (req, res) => {
  res.json({ status: true, message: 'ok', data: { rabbitmq: Boolean(canal) } });
});

app.use((req, res) => res.status(404).json({ status: false, message: 'Ruta no encontrada' }));

// ---------------------------------------------------------------------------
async function main() {
  pool = await conectarDB('api');
  await iniciarRabbit();
  app.listen(PUERTO, () => console.log(`[api] escuchando en el puerto ${PUERTO}`));
}

main().catch((err) => {
  console.error('[api] error fatal:', err);
  process.exit(1);
});
