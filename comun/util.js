const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// MySQL y RabbitMQ tardan varios segundos en quedar listos: en lugar de
// terminar con error al arrancar, se reintenta la conexión indefinidamente.
async function conReintentos(nombre, fn, intervaloMs = 3000) {
  for (let intento = 1; ; intento++) {
    try {
      const resultado = await fn();
      console.log(`[arranque] ${nombre}: conectado (intento ${intento})`);
      return resultado;
    } catch (err) {
      console.log(`[arranque] ${nombre}: no disponible (${err.code || err.message}); reintento ${intento} en ${intervaloMs / 1000} s`);
      await esperar(intervaloMs);
    }
  }
}

const hora = (fecha = new Date()) =>
  fecha.toLocaleTimeString('es-CO', { hour12: false, timeZone: process.env.TZ || 'America/Bogota' }) +
  '.' + String(fecha.getMilliseconds()).padStart(3, '0');

module.exports = { esperar, conReintentos, hora };
