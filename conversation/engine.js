// conversation/engine.js
const { conversationSteps } = require('./steps');
const { searchKnowledge } = require('../knowledge/base');

class ConversationEngine {
  constructor() {
    this.stepOrder = [
      'tipo_propiedad', 'area_m2', 'habitaciones', 'banos', 
      'precio_venta', 'estado_propiedad', 'parqueadero', 'disponibilidad_visita'
    ];
    this.conversationSteps = conversationSteps;
  }
  
  getCurrentStep(data) {
    // Si está esperando confirmación
    if (data.proceso.status === 'esperando_confirmacion') {
      return 'confirmation';
    }
    
    for (const step of this.stepOrder) {
      const stepConfig = conversationSteps[step];
      
      // Verificar si el paso aplica (algunos son condicionales)
      if (stepConfig.condition && !stepConfig.condition(data.propiedad)) {
        continue;
      }
      
      // Si no tenemos este dato, es el paso actual
      if (!data.propiedad[step]) {
        return step;
      }
    }
    return 'completed';
  }
  
  processResponse(userMessage, conversationData) {
    const currentStep = this.getCurrentStep(conversationData);
    
    // Manejar confirmación final
    if (currentStep === 'confirmation') {
      return this.handleConfirmation(userMessage, conversationData);
    }
    
    if (currentStep === 'completed') {
      return this.generateCompletionMessage(conversationData);
    }
    
    // Verificar si es una pregunta del usuario
    if (this.isQuestion(userMessage)) {
      const knowledgeResponse = searchKnowledge(userMessage);
      if (knowledgeResponse) {
        return {
          type: 'knowledge_response',
          message: `${knowledgeResponse}\n\nAhora, retomando: ${conversationSteps[currentStep].question}`,
          waitingFor: currentStep
        };
      } else {
        return {
          type: 'clarification',
          message: "Entiendo tu pregunta, pero no tengo esa información específica en este momento. ¿Podríamos continuar con la información de tu propiedad? " + conversationSteps[currentStep].question,
          waitingFor: currentStep
        };
      }
    }
    
    // Procesar respuesta al paso actual
    const stepConfig = conversationSteps[currentStep];
    const validatedValue = stepConfig.validation(userMessage);
    
    if (validatedValue !== null) {
      // Actualizar datos
      conversationData.propiedad[currentStep] = validatedValue;
      conversationData.proceso.campos_completados.push(currentStep);
      
      // Generar respuesta de confirmación y siguiente pregunta
      const followUp = stepConfig.followUp(validatedValue);
      const nextStep = this.getCurrentStep(conversationData);
      
      if (nextStep === 'completed') {
        return this.generateCompletionMessage(conversationData);
      } else {
        const nextStepConfig = conversationSteps[nextStep];
        return {
          type: 'progress',
          message: `${followUp}${nextStepConfig.question}`,
          waitingFor: nextStep,
          progress: this.calculateProgress(conversationData)
        };
      }
    } else {
      // Valor no válido, pedir clarificación
      return {
        type: 'validation_error',
        message: `No pude entender esa respuesta. ${stepConfig.question}`,
        waitingFor: currentStep
      };
    }
  }
  
  handleConfirmation(userMessage, conversationData) {
    const lowerMessage = userMessage.toLowerCase().trim();
    
    // Respuestas afirmativas
    if (lowerMessage.includes('sí') || lowerMessage.includes('si') || 
        lowerMessage === 'yes' || lowerMessage === 'ok' || 
        lowerMessage === 'correcto' || lowerMessage === 'confirmo') {
      
      return {
        type: 'final_confirmation',
        message: this.generateFinalMessage(conversationData),
        waitingFor: 'completed',
        progress: 100
      };
    }
    
    // Respuestas para modificar
    if (lowerMessage.includes('modificar') || lowerMessage.includes('cambiar') || 
        lowerMessage.includes('no') || lowerMessage.includes('editar')) {
      
      return {
        type: 'edit_request',
        message: `📝 Entendido, ¿qué información te gustaría modificar?\n\n` +
                `Puedes decirme específicamente qué cambiar, por ejemplo:\n` +
                `• "El precio es 350 millones"\n` +
                `• "Son 3 habitaciones, no 2"\n` +
                `• "Tiene 2 parqueaderos"\n\n` +
                `¿Qué necesitas corregir?`,
        waitingFor: 'editing',
        progress: 95
      };
    }
    
    // Si no entendemos la respuesta
    return {
      type: 'confirmation_error',
      message: `No entendí tu respuesta. ¿Confirmas que toda la información es correcta?\n\n` +
              `Responde "SÍ" para proceder con la publicación o "MODIFICAR" si necesitas cambiar algo.`,
      waitingFor: 'confirmation',
      progress: 100
    };
  }
  
  generateFinalMessage(conversationData) {
    const { cliente, propiedad } = conversationData;
    
    let finalMessage = `✅ ¡Perfecto! Tu propiedad ha sido registrada exitosamente.\n\n`;
    finalMessage += `📋 **ID de registro:** ${conversationData.id}\n\n`;
    finalMessage += `🏠 **Resumen de tu propiedad:**\n`;
    finalMessage += `📍 ${cliente.direccion_inmueble}, ${cliente.ciudad_inmueble}\n`;
    finalMessage += `🏗️ ${propiedad.tipo_propiedad} de ${propiedad.area_m2} m²\n`;
    
    if (propiedad.habitaciones) finalMessage += `🛏️ ${propiedad.habitaciones} habitaciones\n`;
    if (propiedad.banos) finalMessage += `🚿 ${propiedad.banos} baños\n`;
    
    finalMessage += `💰 $${propiedad.precio_venta.toLocaleString('es-CO')}\n\n`;
    
    finalMessage += `🎯 **Próximos pasos:**\n`;
    finalMessage += `• Nuestro equipo revisará la información en las próximas 2 horas\n`;
    finalMessage += `• Te contactaremos para programar fotos profesionales\n`;
    finalMessage += `• Crearemos la publicación optimizada\n`;
    finalMessage += `• Activaremos la promoción en nuestro portal\n\n`;
    
    finalMessage += `📱 Mantén tu WhatsApp activo - te escribiremos pronto.\n\n`;
    finalMessage += `¡Gracias por confiar en nosotros para vender tu propiedad! 🏠✨`;
    
    return finalMessage;
  }
  
  isQuestion(message) {
    const questionIndicators = ['?', 'qué', 'cuál', 'cómo', 'cuándo', 'dónde', 'por qué', 'cuenta como', 'se considera'];
    return questionIndicators.some(indicator => message.toLowerCase().includes(indicator));
  }
  
  calculateProgress(data) {
    const totalSteps = this.stepOrder.filter(step => {
      const stepConfig = conversationSteps[step];
      return !stepConfig.condition || stepConfig.condition(data.propiedad);
    }).length;
    
    const completedSteps = data.proceso.campos_completados.length;
    return Math.round((completedSteps / totalSteps) * 100);
  }
  
  generateCompletionMessage(data) {
    const { cliente, propiedad } = data;
    
    let summary = `🎉 ¡Excelente! He recopilado toda la información de tu propiedad:\n\n`;
    summary += `📍 **Ubicación:** ${cliente.direccion_inmueble}, ${cliente.ciudad_inmueble}\n`;
    summary += `🏠 **Tipo:** ${propiedad.tipo_propiedad}\n`;
    summary += `📐 **Área:** ${propiedad.area_m2} m²\n`;
    
    if (propiedad.habitaciones) summary += `🛏️ **Habitaciones:** ${propiedad.habitaciones}\n`;
    if (propiedad.banos) summary += `🚿 **Baños:** ${propiedad.banos}\n`;
    
    summary += `💰 **Precio:** $${propiedad.precio_venta.toLocaleString('es-CO')}\n`;
    summary += `🔧 **Estado:** ${propiedad.estado_propiedad.replace('_', ' ')}\n`;
    summary += `🚗 **Parqueadero:** ${propiedad.parqueadero ? 'Sí' : 'No'}\n`;
    summary += `📅 **Disponibilidad visitas:** ${propiedad.disponibilidad_visita}\n\n`;
    
    summary += `¿Confirmas que toda esta información es correcta?\n\n`;
    summary += `Responde "SÍ" para proceder con la publicación o "MODIFICAR" si necesitas cambiar algo.`;
    
    return {
      type: 'completion',
      message: summary,
      waitingFor: 'confirmation',
      progress: 100
    };
  }
}

module.exports = { ConversationEngine };