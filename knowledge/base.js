// knowledge/base.js
const knowledgeBase = {
    tipos_propiedad: {
      apartamento: "Un apartamento es una unidad habitacional en un edificio con múltiples unidades.",
      casa: "Una casa es una vivienda independiente, generalmente con patio o jardín.",
      local: "Un local comercial es un espacio destinado para actividades comerciales o de servicios.",
      oficina: "Una oficina es un espacio destinado para actividades administrativas o profesionales.",
      lote: "Un lote es un terreno sin construcción, listo para edificar.",
      finca: "Una finca es una propiedad rural, generalmente con construcciones y terreno amplio."
    },
    
    banos_tipos: {
      completo: "Un baño completo tiene inodoro, lavamanos y ducha/bañera.",
      medio: "Un medio baño solo tiene inodoro y lavamanos, sin ducha.",
      social: "Un baño social es de uso común para visitas."
    },
    
    caracteristicas_especiales: [
      "balcón", "terraza", "jardín", "patio", "chimenea", "aire_acondicionado", 
      "calentador", "closets", "vestier", "cuarto_servicio", "zona_lavandería"
    ],
    
    precios_referencia: {
      apartamento_bogota: { min: 150000000, max: 2000000000 },
      casa_bogota: { min: 300000000, max: 5000000000 },
      local_bogota: { min: 100000000, max: 1000000000 }
    }
  };
  
  // Función para buscar en la base de conocimiento
  function searchKnowledge(query) {
    const lowerQuery = query.toLowerCase();
    
    // Buscar información sobre tipos de propiedad
    for (const [tipo, descripcion] of Object.entries(knowledgeBase.tipos_propiedad)) {
      if (lowerQuery.includes(tipo)) {
        return `${descripcion}`;
      }
    }
    
    // Buscar información sobre baños
    if (lowerQuery.includes('baño') || lowerQuery.includes('bathroom')) {
      if (lowerQuery.includes('ducha') || lowerQuery.includes('shower')) {
        return "Un baño sin ducha se considera medio baño. Para nuestro registro, cuenta como 0.5 baños. Si solo tiene inodoro y lavamanos, es un medio baño.";
      }
      return "Contamos baños completos (con ducha/bañera) y medios baños (solo inodoro y lavamanos). Ambos son importantes para la descripción de la propiedad.";
    }
    
    // Buscar información sobre precios
    if (lowerQuery.includes('precio') || lowerQuery.includes('valor') || lowerQuery.includes('cuesta')) {
      return "El precio depende de muchos factores: ubicación, área, estado, características especiales. Te ayudo a establecer un precio competitivo basado en la información que me proporciones.";
    }
    
    return null;
  }
  
  module.exports = { knowledgeBase, searchKnowledge };