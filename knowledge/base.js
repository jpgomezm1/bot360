// knowledge/base.js
const knowledgeBase = {
    tipos_propiedad: {
      apartamento: "Un apartamento es una unidad habitacional en un edificio con múltiples unidades.",
      casa: "Una casa es una vivienda independiente, generalmente con patio o jardín.",
      local: "Un local comercial es un espacio destinado para actividades comerciales o de servicios.",
      oficina: "Una oficina es un espacio destinado para actividades administrativas o profesionales.",
      lote: "Un lote es un terreno sin construcción, listo para edificar.",
      finca: "Una finca es una propiedad rural, generalmente con construcciones y terreno amplio.",
      bodega: "Una bodega es un espacio destinado para almacenamiento o actividades industriales.",
      consultorio: "Un consultorio es un espacio destinado para actividades médicas o profesionales."
    },
    
    documentos_requeridos: {
      predial: {
        descripcion: "El recibo de predial es un documento que certifica el pago del impuesto predial del inmueble.",
        contenido: "Debe incluir número predial, dirección, propietario, valor del impuesto y año gravable.",
        validez: "Debe estar actualizado, preferiblemente del año en curso."
      },
      certificado_libertad: {
        descripcion: "El certificado de libertad y tradición es un documento oficial que certifica el estado jurídico del inmueble.",
        contenido: "Debe incluir matrícula inmobiliaria, titular registral, descripción del inmueble y estado de gravámenes.",
        validez: "No debe tener más de 3 meses de expedición.",
        expedicion: "Se obtiene en la Superintendencia de Notariado y Registro."
      }
    },
    
    banos_tipos: {
      completo: "Un baño completo tiene inodoro, lavamanos y ducha/bañera.",
      medio: "Un medio baño solo tiene inodoro y lavamanos, sin ducha.",
      social: "Un baño social es de uso común para visitas."
    },
    
    caracteristicas_especiales: [
      "balcón", "terraza", "jardín", "patio", "chimenea", "aire_acondicionado", 
      "calentador", "closets", "vestier", "cuarto_servicio", "zona_lavandería",
      "piscina", "gimnasio", "salón_social", "parqueadero_visitantes"
    ],
    
    precios_referencia: {
      apartamento_medellin: { min: 150000000, max: 2000000000 },
      casa_medellin: { min: 300000000, max: 5000000000 },
      local_medellin: { min: 100000000, max: 1000000000 }
    },
  
    proceso_venta: {
      pasos: [
        "Recopilación de información básica",
        "Validación de documentos legales",
        "Sesión de fotos profesionales",
        "Creación de publicación optimizada",
        "Promoción en portales inmobiliarios",
        "Gestión de visitas y negociación"
      ]
    }
  };
  
  // Función para buscar en la base de conocimiento
  function searchKnowledge(query) {
    const lowerQuery = query.toLowerCase();
    
    // Buscar información sobre documentos
    if (lowerQuery.includes('predial')) {
      return `El predial es ${knowledgeBase.documentos_requeridos.predial.descripcion} ${knowledgeBase.documentos_requeridos.predial.contenido}`;
    }
    
    if (lowerQuery.includes('certificado') || lowerQuery.includes('libertad')) {
      return `El certificado de libertad y tradición es ${knowledgeBase.documentos_requeridos.certificado_libertad.descripcion} ${knowledgeBase.documentos_requeridos.certificado_libertad.validez}`;
    }
    
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
      
      // Información sobre el proceso
      if (lowerQuery.includes('proceso') || lowerQuery.includes('pasos') || lowerQuery.includes('siguiente')) {
        return `Nuestro proceso incluye: ${knowledgeBase.proceso_venta.pasos.join(', ')}. Ahora estamos en la etapa de recopilación de información.`;
      }
      
      // Información sobre documentos en general
      if (lowerQuery.includes('documento') || lowerQuery.includes('papel')) {
        return "Necesitamos dos documentos principales: el recibo de predial (para verificar el pago de impuestos) y el certificado de libertad y tradición (para verificar el estado jurídico del inmueble).";
      }
      
      return null;
     }
     
     module.exports = { knowledgeBase, searchKnowledge };