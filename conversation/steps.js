// conversation/steps.js
const conversationSteps = {
  tipo_propiedad: {
    question: "¿Qué tipo de propiedad quieres vender? Por ejemplo: apartamento, casa, local comercial, oficina, lote, finca, etc.",
    validation: (response) => {
      const tipos = ['apartamento', 'casa', 'local', 'oficina', 'lote', 'finca', 'bodega', 'consultorio'];
      const found = tipos.find(tipo => response.toLowerCase().includes(tipo));
      return found || null;
    },
    followUp: (value) => `Perfecto, un ${value}. `
  },
  
  area_m2: {
    question: "¿Cuál es el área total en metros cuadrados?",
    validation: (response) => {
      const numbers = response.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const area = parseInt(numbers[0]);
        return area > 0 && area < 10000 ? area : null;
      }
      return null;
    },
    followUp: (value) => `Entendido, ${value} m². `
  },
  
  habitaciones: {
    question: "¿Cuántas habitaciones tiene?",
    condition: (data) => ['apartamento', 'casa', 'finca'].includes(data.tipo_propiedad),
    validation: (response) => {
      const numbers = response.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const rooms = parseInt(numbers[0]);
        return rooms >= 0 && rooms <= 20 ? rooms : null;
      }
      return null;
    },
    followUp: (value) => `${value} habitaciones, perfecto. `
  },
  
  banos: {
    question: "¿Cuántos baños tiene? (Incluye baños completos y medios baños)",
    condition: (data) => ['apartamento', 'casa', 'oficina', 'finca'].includes(data.tipo_propiedad),
    validation: (response) => {
      const numbers = response.match(/\d+/g);
      if (numbers && numbers.length > 0) {
        const bathrooms = parseInt(numbers[0]);
        return bathrooms >= 0 && bathrooms <= 10 ? bathrooms : null;
      }
      return null;
    },
    followUp: (value) => `${value} baños, excelente. `
  },
  
  precio_venta: {
    question: "¿En cuánto esperas vender la propiedad? (en pesos colombianos)",
    validation: (response) => {
      // Buscar números y convertir
      const cleanNumber = response.replace(/[^\d]/g, '');
      if (cleanNumber.length >= 6) { // mínimo 100,000
        return parseInt(cleanNumber);
      }
      return null;
    },
    followUp: (value) => `Precio objetivo: $${value.toLocaleString('es-CO')}. `
  },
  
  estado_propiedad: {
    question: "¿Cuál es el estado actual de la propiedad? (nueva, usada pero en buen estado, necesita remodelación)",
    validation: (response) => {
      if (response.toLowerCase().includes('nueva') || response.toLowerCase().includes('estrenar')) return 'nueva';
      if (response.toLowerCase().includes('remodelación') || response.toLowerCase().includes('arreglos')) return 'para_remodelar';
      if (response.toLowerCase().includes('usada') || response.toLowerCase().includes('buen estado')) return 'usada_buen_estado';
      return null;
    },
    followUp: (value) => `Estado: ${value.replace('_', ' ')}. `
  },
  
  parqueadero: {
    question: "¿Tiene parqueadero?",
    validation: (response) => {
      if (response.toLowerCase().includes('sí') || response.toLowerCase().includes('si') || response.toLowerCase().includes('tiene')) return true;
      if (response.toLowerCase().includes('no')) return false;
      return null;
    },
    followUp: (value) => value ? "Con parqueadero incluido. " : "Sin parqueadero. "
  },
  
  disponibilidad_visita: {
    question: "¿Cuándo podrían los interesados visitar la propiedad? (entre semana, fines de semana, cualquier día, etc.)",
    validation: (response) => response.length > 3 ? response : null,
    followUp: (value) => `Disponibilidad para visitas: ${value}. `
  }
};

module.exports = { conversationSteps };