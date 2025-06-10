// conversation/engine.js
const Anthropic = require('@anthropic-ai/sdk');
const { searchKnowledge } = require('../knowledge/base');

class ConversationEngine {
  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY,
    });
    
    this.requiredFields = [
      'tipo_propiedad', 'area_m2', 'habitaciones', 'banos', 
      'precio_venta', 'estado_propiedad', 'parqueadero', 
      'disponibilidad_visita', 'predial', 'certificado_libertad'
    ];
  }
  
  async processResponse(userMessage, conversationData) {
    try {
      // Si está esperando confirmación
      if (conversationData.proceso.status === 'esperando_confirmacion') {
        return await this.handleConfirmation(userMessage, conversationData);
      }
      
      // Si está en modo edición
      if (conversationData.proceso.status === 'editando') {
        return await this.handleEdit(userMessage, conversationData);
      }
      
      // Construir contexto de la conversación
      const context = this.buildConversationContext(conversationData);
      
      // Usar Claude para procesar la respuesta de manera natural
      const claudeResponse = await this.getClaudeResponse(userMessage, context, conversationData);
      
      return claudeResponse;
    } catch (error) {
      console.error('Error procesando con Claude:', error);
      return {
        type: 'error',
        message: "Disculpa, tuve un pequeño problema técnico. ¿Podrías repetir lo que me dijiste?",
        waitingFor: this.getCurrentStep(conversationData)
      };
    }
  }
  
  buildConversationContext(data) {
    const { cliente, propiedad, proceso } = data;
    const missingFields = this.getMissingFields(propiedad);
    
    return {
      clienteInfo: {
        nombre: cliente.nombre,
        direccion: cliente.direccion_inmueble,
        ciudad: cliente.ciudad_inmueble
      },
      propiedadActual: propiedad,
      camposFaltantes: missingFields,
      siguienteCampo: missingFields[0] || null,
      progreso: this.calculateProgress(data),
      estaCompleto: missingFields.length === 0
    };
  }
  
  async getClaudeResponse(userMessage, context, conversationData) {
    const systemPrompt = `Eres un agente inmobiliario profesional y amigable que ayuda a recopilar información de propiedades para venta en Colombia. 

INFORMACIÓN DEL CLIENTE:
- Nombre: ${context.clienteInfo.nombre}
- Propiedad en: ${context.clienteInfo.direccion}, ${context.clienteInfo.ciudad}

INFORMACIÓN YA RECOPILADA:
${JSON.stringify(context.propiedadActual, null, 2)}

CAMPOS QUE FALTAN POR RECOPILAR:
${context.camposFaltantes.join(', ')}

SIGUIENTE CAMPO A RECOPILAR: ${context.siguienteCampo || 'COMPLETADO'}

INSTRUCCIONES:
1. Sé natural, conversacional y profesional como un agente inmobiliario real colombiano
2. Si el usuario responde con información válida para el siguiente campo, extráela y confírmala de manera natural
3. Si el usuario hace preguntas, respóndelas amablemente y luego retoma el proceso
4. Si el usuario da información sobre múltiples campos, extrae toda la que puedas
5. Mantén un tono amigable pero profesional, usa emojis ocasionalmente
6. Si el campo faltante es 'predial', solicita que envíen la foto o PDF del recibo de predial
7. Si el campo faltante es 'certificado_libertad', solicita que envíen la foto o PDF del certificado de libertad y tradición
8. Usa expresiones colombianas naturales y un lenguaje cercano

CAMPOS Y SUS DESCRIPCIONES:
- tipo_propiedad: apartamento, casa, local, oficina, lote, finca, bodega, consultorio
- area_m2: área en metros cuadrados (número entero)
- habitaciones: número de habitaciones (solo para apartamentos, casas, fincas)
- banos: número de baños incluyendo medios baños (solo para apartamentos, casas, oficinas, fincas)
- precio_venta: precio esperado en pesos colombianos (número)
- estado_propiedad: nueva, usada_buen_estado, para_remodelar
- parqueadero: true si tiene, false si no tiene
- disponibilidad_visita: texto libre sobre cuándo pueden visitar los interesados
- predial: solicitar envío de foto o PDF del recibo de predial
- certificado_libertad: solicitar envío de foto o PDF del certificado de libertad y tradición

IMPORTANTE PARA DOCUMENTOS:
- Si necesitas predial o certificado_libertad, di específicamente que pueden enviar foto o PDF
- Menciona que los documentos deben estar legibles y actualizados

RESPONDE SIEMPRE EN FORMATO JSON:
{
  "message": "tu respuesta natural y conversacional",
  "extracted_data": {}, // datos extraídos del mensaje del usuario
  "next_action": "continue|complete|request_document",
  "waiting_for": "nombre_del_campo_siguiente_o_null"
}`;

    const userPrompt = `Mensaje del usuario: "${userMessage}"

Procesa este mensaje de manera natural y conversacional como un agente inmobiliario colombiano profesional. Si contiene información relevante para los campos faltantes, extráela. Mantén el tono amigable y profesional.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });

      const claudeResponse = JSON.parse(response.content[0].text);
      
      // Procesar la respuesta de Claude
      return this.processClaudeResponse(claudeResponse, conversationData);
      
    } catch (error) {
      console.error('Error con Claude:', error);
      throw error;
    }
  }
  
  processClaudeResponse(claudeResponse, conversationData) {
    const { message, extracted_data, next_action, waiting_for } = claudeResponse;
    
    // Si hay datos extraídos, actualizar
    let hasNewData = false;
    if (extracted_data && Object.keys(extracted_data).length > 0) {
      Object.assign(conversationData.propiedad, extracted_data);
      hasNewData = true;
    }
    
    // Determinar el tipo de respuesta
    let responseType = 'progress';
    
    if (next_action === 'complete') {
      const missingFields = this.getMissingFields(conversationData.propiedad);
      if (missingFields.length === 0) {
        responseType = 'completion';
      }
    } else if (next_action === 'request_document') {
      responseType = 'document_request';
    }
    
    const missingFields = this.getMissingFields(conversationData.propiedad);
    
    return {
      type: responseType,
      message: message,
      waitingFor: waiting_for || (missingFields.length > 0 ? missingFields[0] : 'completed'),
      extractedData: hasNewData ? extracted_data : {},
      progress: this.calculateProgress(conversationData)
    };
  }
  
  async handleEdit(userMessage, conversationData) {
    const systemPrompt = `Eres un agente inmobiliario que está ayudando a editar información de una propiedad. El cliente quiere modificar algo específico.

DATOS ACTUALES:
${JSON.stringify(conversationData.propiedad, null, 2)}

Tu trabajo es entender qué quiere cambiar el cliente y actualizar solo esos campos específicos.

RESPONDE EN JSON:
{
  "message": "confirmación natural del cambio",
  "updated_data": {}, // solo los campos que se modificaron
  "action": "continue_editing|finish_editing"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: `El cliente dice: "${userMessage}"` }]
      });

      const editResponse = JSON.parse(response.content[0].text);
      
      // Aplicar cambios
      if (editResponse.updated_data && Object.keys(editResponse.updated_data).length > 0) {
        Object.assign(conversationData.propiedad, editResponse.updated_data);
      }
      
      if (editResponse.action === 'finish_editing') {
        // Volver a mostrar resumen para confirmación
        return await this.generateCompletionMessage(conversationData);
      } else {
        return {
          type: 'edit_progress',
          message: editResponse.message + '\n\n¿Hay algo más que quieras modificar?',
          waitingFor: 'editing',
          extractedData: editResponse.updated_data || {}
        };
      }
    } catch (error) {
      console.error('Error en modo edición:', error);
      return {
        type: 'edit_error',
        message: 'No pude entender qué quieres cambiar. ¿Podrías ser más específico? Por ejemplo: "El precio es 350 millones"',
        waitingFor: 'editing'
      };
    }
  }
  
  getMissingFields(propiedad) {
    return this.requiredFields.filter(field => {
      // Campos condicionales
      if (field === 'habitaciones' && !['apartamento', 'casa', 'finca'].includes(propiedad.tipo_propiedad)) {
        return false;
      }
      if (field === 'banos' && !['apartamento', 'casa', 'oficina', 'finca'].includes(propiedad.tipo_propiedad)) {
        return false;
      }
      
      // Para documentos, verificar si están validados
      if (field === 'predial' || field === 'certificado_libertad') {
        return !propiedad[field] || !propiedad[field].validated;
      }
      
      return !propiedad[field];
    });
  }
  
  getCurrentStep(data) {
    const missing = this.getMissingFields(data.propiedad);
    return missing.length > 0 ? missing[0] : 'completed';
  }
  
  calculateProgress(data) {
    const totalFields = this.requiredFields.filter(field => {
      // Aplicar condiciones
      if (field === 'habitaciones' && !['apartamento', 'casa', 'finca'].includes(data.propiedad.tipo_propiedad)) {
        return false;
      }
      if (field === 'banos' && !['apartamento', 'casa', 'oficina', 'finca'].includes(data.propiedad.tipo_propiedad)) {
        return false;
      }
      return true;
    });
    
    const completedFields = totalFields.filter(field => {
      if (field === 'predial' || field === 'certificado_libertad') {
        return data.propiedad[field] && data.propiedad[field].validated;
      }
      return data.propiedad[field];
    });
    
    return Math.round((completedFields.length / totalFields.length) * 100);
  }
  
  async generateCompletionMessage(data) {
    const systemPrompt = `Eres un agente inmobiliario profesional colombiano. Genera un mensaje de resumen final para confirmar todos los datos de una propiedad antes de proceder con el registro.

Debe ser natural, profesional, organizado y usar un tono amigable. Incluye todos los datos recopilados de manera clara y solicita confirmación final.

Usa emojis apropiados y un formato fácil de leer. Al final pregunta si todo está correcto.`;

    const userPrompt = `Datos del cliente: ${JSON.stringify(data.cliente, null, 2)}
Datos de la propiedad: ${JSON.stringify(data.propiedad, null, 2)}

Genera un mensaje de confirmación final profesional y amigable.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 1000,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });

      const message = response.content[0].text + '\n\n¿Confirmas que toda esta información es correcta? Responde "SÍ" para proceder o "MODIFICAR" si necesitas cambiar algo.';

      return {
        type: 'completion',
        message: message,
        waitingFor: 'confirmation',
        progress: 100
      };
    } catch (error) {
      console.error('Error generando mensaje de confirmación:', error);
      
      // Fallback manual
      const { cliente, propiedad } = data;
      
      let summary = `🎉 ¡Excelente ${cliente.nombre}! He recopilado toda la información de tu propiedad:\n\n`;
      summary += `📍 **Ubicación:** ${cliente.direccion_inmueble}, ${cliente.ciudad_inmueble}\n`;
      summary += `🏠 **Tipo:** ${propiedad.tipo_propiedad}\n`;
      summary += `📐 **Área:** ${propiedad.area_m2} m²\n`;
      
      if (propiedad.habitaciones) summary += `🛏️ **Habitaciones:** ${propiedad.habitaciones}\n`;
      if (propiedad.banos) summary += `🚿 **Baños:** ${propiedad.banos}\n`;
      
      summary += `💰 **Precio:** $${propiedad.precio_venta?.toLocaleString('es-CO')}\n`;
      summary += `🔧 **Estado:** ${propiedad.estado_propiedad?.replace('_', ' ')}\n`;
      summary += `🚗 **Parqueadero:** ${propiedad.parqueadero ? 'Sí' : 'No'}\n`;
      summary += `📅 **Disponibilidad visitas:** ${propiedad.disponibilidad_visita}\n`;
      summary += `📄 **Documentos:** Predial y Certificado de Libertad validados ✅\n\n`;
      
      summary += `¿Confirmas que toda esta información es correcta? Responde "SÍ" para proceder o "MODIFICAR" si necesitas cambiar algo.`;
      
      return {
        type: 'completion',
        message: summary,
        waitingFor: 'confirmation',
        progress: 100
      };
    }
  }
  
  async handleConfirmation(userMessage, conversationData) {
    const lowerMessage = userMessage.toLowerCase().trim();
    
    if (lowerMessage.includes('sí') || lowerMessage.includes('si') || 
        lowerMessage === 'yes' || lowerMessage === 'ok' || 
        lowerMessage === 'correcto' || lowerMessage === 'confirmo' ||
        lowerMessage === 'confirmado' || lowerMessage === 'perfecto') {
      
      return {
        type: 'final_confirmation',
        message: await this.generateFinalMessage(conversationData),
        waitingFor: 'completed',
        progress: 100
      };
    }
    
    if (lowerMessage.includes('modificar') || lowerMessage.includes('cambiar') || 
        lowerMessage.includes('no') || lowerMessage.includes('editar') ||
        lowerMessage.includes('corregir')) {
      
      return {
        type: 'edit_request',
        message: `Perfecto ${conversationData.cliente.nombre}, ¿qué información necesitas modificar? 📝\n\n` +
                `Puedes decirme específicamente qué cambiar, por ejemplo:\n` +
                `• "El precio es 350 millones"\n` +
                `• "Son 3 habitaciones, no 2"\n` +
                `• "Tiene 2 parqueaderos"\n\n` +
                `¿Qué necesitas corregir?`,
        waitingFor: 'editing',
        progress: 95
      };
    }
    
    return {
      type: 'confirmation_error',
      message: `No entendí tu respuesta. ¿Confirmas que toda la información es correcta? 🤔\n\n` +
              `Responde "SÍ" para proceder con la publicación o "MODIFICAR" si necesitas cambiar algo.`,
      waitingFor: 'confirmation',
      progress: 100
    };
  }
  
  async generateFinalMessage(conversationData) {
    const systemPrompt = `Eres un agente inmobiliario profesional colombiano. Genera un mensaje final de éxito cuando se ha completado el registro de una propiedad.

Debe ser celebratorio, profesional, usar emojis apropiados y explicar los próximos pasos claramente. Mantén un tono cercano y profesional.`;

    const userPrompt = `Cliente: ${conversationData.cliente.nombre}
Propiedad en: ${conversationData.cliente.direccion_inmueble}, ${conversationData.cliente.ciudad_inmueble}
Propiedad registrada exitosamente. Genera un mensaje final apropiado.`;

    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-5-sonnet-20241022",
        max_tokens: 800,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }]
      });

      return response.content[0].text;
    } catch (error) {
      console.error('Error generando mensaje final:', error);
      return `¡Excelente ${conversationData.cliente.nombre}! 🎉\n\n` +
             `Tu propiedad en ${conversationData.cliente.direccion_inmueble} ha sido registrada exitosamente en nuestro sistema.\n\n` +
             `📋 **ID de registro:** ${conversationData.id}\n\n` +
             `🎯 **Próximos pasos:**\n` +
             `• Nuestro equipo revisará la información en las próximas 2 horas\n` +
             `• Te contactaremos para programar fotos profesionales\n` +
             `• Crearemos la publicación optimizada\n` +
             `• Activaremos la promoción en nuestro portal\n\n` +
             `📱 Mantén tu WhatsApp activo - te escribiremos pronto.\n\n` +
             `¡Gracias por confiar en nosotros para vender tu propiedad! 🏠✨`;
    }
  }
}

module.exports = { ConversationEngine };