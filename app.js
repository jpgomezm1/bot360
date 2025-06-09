const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config();

// Importar módulos locales
const { ConversationEngine } = require('./conversation/engine');
const { PropertyDatabase } = require('./database/schema');
const { formatPhoneNumber, generatePropertyId, logConversation } = require('./utils/helpers');

const app = express();
app.use(express.json());

// Configuración de Claude
const anthropic = new Anthropic({
  apiKey: process.env.CLAUDE_API_KEY,
});

// Configuración de UltraMSG
const ULTRAMSG_TOKEN = process.env.ULTRAMSG_TOKEN;
const INSTANCE_ID = process.env.ULTRAMSG_INSTANCE_ID;
const ULTRAMSG_BASE_URL = `https://api.ultramsg.com/${INSTANCE_ID}`;

// Número autorizado para usar el bot
const AUTHORIZED_NUMBER = '573183351733';

// Inicializar sistemas
const conversationEngine = new ConversationEngine();
const propertyDB = new PropertyDatabase();

// Store para conversaciones activas (luego será Redis)
const activeConversations = new Map();

// Verificación de Redis al iniciar
(async () => {
  console.log('🔍 Verificando conexión a Redis...');
  const healthCheck = await propertyDB.healthCheck();
  console.log('📊 Estado de la base de datos:', healthCheck);
  
  if (healthCheck.redis) {
    console.log('✅ Redis conectado y funcionando');
  } else {
    console.log('⚠️ Redis no disponible - usando memoria como fallback');
  }
})();

// Función para enviar mensaje por WhatsApp
async function sendWhatsAppMessage(to, message) {
  try {
    const response = await axios.post(`${ULTRAMSG_BASE_URL}/messages/chat`, {
      token: ULTRAMSG_TOKEN,
      to: to,
      body: message
    });
    
    logConversation(to, message, 'bot');
    return response.data;
  } catch (error) {
    console.error('Error enviando mensaje:', error.response?.data || error.message);
    throw error;
  }
}

// Función para procesar múltiples mensajes del usuario
async function processUserMessage(phoneNumber, message) {
  try {
    logConversation(phoneNumber, message, 'user');
    
    // Obtener datos de la propiedad desde Redis/DB
    let propertyData = await propertyDB.findByPhone(phoneNumber);
    
    if (!propertyData) {
      return {
        success: false,
        message: "No encontré tu información. ¿Completaste el formulario en nuestra página web?"
      };
    }
    
    // Procesar con el motor conversacional
    const response = conversationEngine.processResponse(message, propertyData);
    
    // Actualizar base de datos
    const updateData = {
      proceso: {
        ...propertyData.proceso,
        step_actual: response.waitingFor || 'completed',
        ultima_actividad: new Date()
      }
    };
    
    // Manejar diferentes tipos de respuesta
    if (response.type === 'final_confirmation') {
      updateData.proceso.status = 'completado';
      updateData.proceso.fecha_completado = new Date();
      console.log(`🎉 Propiedad completada exitosamente: ${phoneNumber}`);
    } else if (response.type === 'edit_request') {
      updateData.proceso.status = 'editando';
      console.log(`📝 Propiedad en modo edición: ${phoneNumber}`);
    } else if (response.type === 'completion') {
      updateData.proceso.status = 'esperando_confirmacion';
      console.log(`⏳ Esperando confirmación: ${phoneNumber}`);
    } else if (response.type === 'progress' && response.waitingFor !== propertyData.proceso.step_actual) {
      // Determinar qué campo se actualizó
      const currentStep = propertyData.proceso.step_actual;
      if (currentStep && conversationEngine.conversationSteps[currentStep]) {
        const validation = conversationEngine.conversationSteps[currentStep].validation(message);
        if (validation !== null) {
          updateData.propiedad = {
            ...propertyData.propiedad,
            [currentStep]: validation
          };
          
          // Actualizar campos completados si no está ya incluido
          if (!propertyData.proceso.campos_completados.includes(currentStep)) {
            updateData.proceso.campos_completados = [
              ...propertyData.proceso.campos_completados,
              currentStep
            ];
          }
          
          console.log(`📊 Campo actualizado: ${currentStep} = ${validation}`);
        }
      }
    }
    
    await propertyDB.update(phoneNumber, updateData);
    
    return {
      success: true,
      response: response,
      progress: response.progress || 0
    };
    
  } catch (error) {
    console.error('Error procesando mensaje:', error);
    return {
      success: false,
      message: "Disculpa, hubo un error técnico. ¿Podrías repetir tu mensaje?"
    };
  }
}

// Webhook para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
  try {
    console.log('Webhook recibido:', JSON.stringify(req.body, null, 2));
    
    const { data } = req.body;
    
    // 🔥 FILTROS IMPORTANTES:
    if (data && data.body && data.from) {
      
      // ❌ Ignorar mensajes que vienen del bot (fromMe: true)
      if (data.fromMe === true || data.self === true) {
        console.log('📤 Ignorando mensaje del bot mismo');
        res.status(200).json({ success: true });
        return;
      }
      
      // ❌ Ignorar acknowledgments (confirmaciones de entrega)
      if (req.body.event_type === 'message_ack') {
        console.log('📬 Ignorando ACK');
        res.status(200).json({ success: true });
        return;
      }
      
      // ✅ Solo procesar mensajes RECIBIDOS de usuarios
      if (req.body.event_type !== 'message_received') {
        console.log('📝 Ignorando evento:', req.body.event_type);
        res.status(200).json({ success: true });
        return;
      }
      
      const userMessage = data.body.trim();
      const phoneNumber = formatPhoneNumber(data.from);
      
      // 🚫 FILTRO DE NÚMERO AUTORIZADO
      if (phoneNumber !== AUTHORIZED_NUMBER) {
        console.log(`🚫 NÚMERO NO AUTORIZADO: ${phoneNumber} - Solo ${AUTHORIZED_NUMBER} puede usar el bot`);
        res.status(200).json({ success: true, message: 'Número no autorizado' });
        return;
      }
      
      console.log(`📱 MENSAJE DE USUARIO AUTORIZADO ${phoneNumber}: ${userMessage}`);
      
      // Verificar si hay una conversación activa
      let conversation = activeConversations.get(phoneNumber) || {
        messages: [],
        lastActivity: new Date(),
        isProcessing: false
      };
      
      // Agregar mensaje a la cola
      conversation.messages.push({
        text: userMessage,
        timestamp: new Date()
      });
      
      conversation.lastActivity = new Date();
      activeConversations.set(phoneNumber, conversation);
      
      // Si no se está procesando, procesar inmediatamente
      if (!conversation.isProcessing) {
        conversation.isProcessing = true;
        
        // Esperar un poco por si llegan más mensajes
        setTimeout(async () => {
          try {
            const conv = activeConversations.get(phoneNumber);
            if (conv && conv.messages.length > 0) {
              // Combinar todos los mensajes pendientes
              const combinedMessage = conv.messages.map(m => m.text).join(' ');
              conv.messages = []; // Limpiar mensajes procesados
              
              // Procesar mensaje combinado
              const result = await processUserMessage(phoneNumber, combinedMessage);
              
              if (result.success) {
                await sendWhatsAppMessage(phoneNumber, result.response.message);
                
                // Mostrar progreso si está disponible y no está completado
                if (result.progress && result.progress < 100 && result.response.type !== 'final_confirmation') {
                  const progressMessage = `📊 Progreso: ${result.progress}% completado`;
                  setTimeout(() => sendWhatsAppMessage(phoneNumber, progressMessage), 1000);
                }
                
                // Log especial para finalización
                if (result.response.type === 'final_confirmation') {
                  console.log(`🎊 ¡PROCESO COMPLETADO! ${phoneNumber} - Propiedad registrada exitosamente`);
                }
              } else {
                await sendWhatsAppMessage(phoneNumber, result.message);
              }
              
              conv.isProcessing = false;
              activeConversations.set(phoneNumber, conv);
            }
          } catch (error) {
            console.error('Error procesando conversación:', error);
            const conv = activeConversations.get(phoneNumber);
            if (conv) {
              conv.isProcessing = false;
              activeConversations.set(phoneNumber, conv);
            }
          }
        }, 2000); // Esperar 2 segundos por mensajes adicionales
      }
    }
    
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error en webhook:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
});

// Endpoint para manejar confirmación final
app.post('/confirm-property', async (req, res) => {
  try {
    const { phoneNumber, confirmed } = req.body;
    const propertyData = await propertyDB.findByPhone(phoneNumber);
    
    if (!propertyData) {
      return res.status(404).json({ error: 'Propiedad no encontrada' });
    }
    
    if (confirmed) {
      const updateData = {
        proceso: {
          ...propertyData.proceso,
          status: 'completado',
          fecha_completado: new Date()
        }
      };
      
      await propertyDB.update(phoneNumber, updateData);
      
      const finalMessage = `✅ ¡Perfecto! Tu propiedad ha sido registrada exitosamente.\n\n` +
        `📋 **ID de registro:** ${propertyData.id}\n\n` +
        `Nuestro equipo revisará la información y se contactará contigo en las próximas 24 horas para:\n` +
        `• Programar sesión de fotos profesionales\n` +
        `• Crear la publicación optimizada\n` +
        `• Activar la promoción en nuestro portal\n\n` +
        `¡Gracias por confiar en nosotros! 🏠✨`;
      
      await sendWhatsAppMessage(phoneNumber, finalMessage);
      
      res.json({ success: true, message: 'Propiedad confirmada y completada' });
    } else {
      const editMessage = `📝 Entendido, ¿qué información te gustaría modificar?\n\n` +
        `Puedes decirme específicamente qué cambiar, por ejemplo:\n` +
        `• "El precio es 350 millones"\n` +
        `• "Son 3 habitaciones, no 2"\n` +
        `• "Tiene 2 parqueaderos"\n\n` +
        `¿Qué necesitas corregir?`;
      
      await sendWhatsAppMessage(phoneNumber, editMessage);
      
      const updateData = {
        proceso: {
          ...propertyData.proceso,
          status: 'editando'
        }
      };
      
      await propertyDB.update(phoneNumber, updateData);
      
      res.json({ success: true, message: 'Modo edición activado' });
    }
  } catch (error) {
    console.error('Error en confirmación:', error);
    res.status(500).json({ error: 'Error procesando confirmación' });
  }
});

// Endpoint que simula el webhook del formulario web
app.post('/form-webhook', async (req, res) => {
  try {
    const formData = req.body;
    console.log('📝 Formulario recibido:', formData);
    
    const phoneNumber = formatPhoneNumber(formData.celular);
    
    // Verificar que sea el número autorizado
    if (phoneNumber !== AUTHORIZED_NUMBER) {
      console.log(`🚫 FORMULARIO RECHAZADO: Número ${phoneNumber} no autorizado`);
      return res.status(403).json({ 
        error: 'Número no autorizado', 
        authorizedNumber: AUTHORIZED_NUMBER 
      });
    }
    
    // Crear registro en base de datos
    const propertyData = await propertyDB.create({
      cliente: formData,
      propiedad: {},
      proceso: {
        step_actual: 'tipo_propiedad',
        campos_completados: [],
        mensajes_pendientes: []
      }
    });
    
    console.log(`💾 Propiedad creada con ID: ${propertyData.id} para número: ${phoneNumber}`);
    
    // Mensaje inicial personalizado
    const initialMessage = `¡Hola ${formData.nombre}! 👋\n\n` +
      `Te contacto desde el portal inmobiliario porque acabas de completar el formulario para vender tu propiedad en:\n` +
      `📍 ${formData.direccion_inmueble}, ${formData.ciudad_inmueble}\n\n` +
      `Me encantaría ayudarte a crear una publicación atractiva que conecte rápidamente con compradores interesados. 🏠✨\n\n` +
      `Te haré algunas preguntas para conocer mejor tu propiedad. Puedes responder con naturalidad, yo entenderé.\n\n` +
      `Para empezar: ¿Qué tipo de propiedad quieres vender? Por ejemplo: apartamento, casa, local comercial, oficina, lote, etc.`;

    await sendWhatsAppMessage(phoneNumber, initialMessage);
    
    res.json({ 
      success: true, 
      message: 'Conversación iniciada exitosamente',
      propertyId: propertyData.id,
      phoneNumber: phoneNumber,
      authorized: true
    });
    
  } catch (error) {
    console.error('Error procesando formulario:', error);
    res.status(500).json({ error: 'Error procesando formulario' });
  }
});

// Endpoint para cambiar el número autorizado (solo para desarrollo)
app.post('/admin/set-authorized-number', (req, res) => {
  const { phoneNumber, adminKey } = req.body;
  
  // Validación básica de seguridad
  if (adminKey !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Clave de administrador incorrecta' });
  }
  
  if (!phoneNumber) {
    return res.status(400).json({ error: 'Número de teléfono requerido' });
  }
  
  const formattedNumber = formatPhoneNumber(phoneNumber);
  
  // Cambiar la constante global (en producción esto sería una variable de entorno)
  global.AUTHORIZED_NUMBER = formattedNumber;
  
  console.log(`🔐 Número autorizado cambiado a: ${formattedNumber}`);
  
  res.json({ 
    success: true, 
    message: 'Número autorizado actualizado',
    newAuthorizedNumber: formattedNumber
  });
});

// Endpoint para obtener información de autorización
app.get('/admin/authorization-info', async (req, res) => {
  try {
    const healthCheck = await propertyDB.healthCheck();
    const allProperties = await propertyDB.getAll();
    
    res.json({
      authorizedNumber: AUTHORIZED_NUMBER,
      totalProperties: allProperties.length,
      activeConversations: activeConversations.size,
      propertiesForAuthorizedNumber: allProperties.filter(p => (p.cliente?.celular || p.phoneNumber) === AUTHORIZED_NUMBER).length,
      database: healthCheck
    });
  } catch (error) {
    console.error('Error en authorization-info:', error);
    res.status(500).json({ error: 'Error obteniendo información de autorización' });
  }
});

// Endpoint para limpiar datos de un número específico
app.delete('/admin/clear-data/:phone', async (req, res) => {
  try {
    const phoneNumber = formatPhoneNumber(req.params.phone);
    
    // Limpiar de base de datos
    const deleted = await propertyDB.delete(phoneNumber);
    
    // Limpiar conversaciones activas
    activeConversations.delete(phoneNumber);
    
    res.json({
      success: true,
      message: 'Datos limpiados exitosamente',
      phoneNumber: phoneNumber,
      deleted: deleted
    });
  } catch (error) {
    console.error('Error limpiando datos:', error);
    res.status(500).json({ error: 'Error limpiando datos' });
  }
});

// Endpoint para forzar finalización de una propiedad (para testing)
app.post('/admin/complete-property/:phone', async (req, res) => {
  try {
    const phoneNumber = formatPhoneNumber(req.params.phone);
    const propertyData = await propertyDB.findByPhone(phoneNumber);
    
    if (!propertyData) {
      return res.status(404).json({ error: 'Propiedad no encontrada' });
    }
    
    const updateData = {
      proceso: {
        ...propertyData.proceso,
        status: 'completado',
        fecha_completado: new Date()
      }
    };
    
    await propertyDB.update(phoneNumber, updateData);
    
    const finalMessage = `🧪 [MODO TESTING] Propiedad marcada como completada.\n\n` +
      `📋 ID: ${propertyData.id}\n` +
      `🏠 Tipo: ${propertyData.propiedad.tipo_propiedad || 'No especificado'}\n` +
      `📊 Status: Completado exitosamente`;
    
    await sendWhatsAppMessage(phoneNumber, finalMessage);
    
    res.json({
      success: true,
      message: 'Propiedad marcada como completada',
      propertyId: propertyData.id
    });
  } catch (error) {
    console.error('Error completando propiedad:', error);
    res.status(500).json({ error: 'Error completando propiedad' });
  }
});

// Endpoints de monitoreo y administración
app.get('/properties', async (req, res) => {
  try {
    const allProperties = await propertyDB.getAll();
    const properties = allProperties.map(prop => ({
      id: prop.id,
      cliente: `${prop.cliente?.nombre || 'N/A'} ${prop.cliente?.apellido || ''}`.trim(),
      telefono: prop.cliente?.celular || prop.phoneNumber,
      direccion: prop.cliente?.direccion_inmueble || 'N/A',
      ciudad: prop.cliente?.ciudad_inmueble || 'N/A',
      tipo: prop.propiedad?.tipo_propiedad || 'No especificado',
      status: prop.proceso?.status || 'indefinido',
      progreso: conversationEngine.calculateProgress(prop),
      ultima_actividad: prop.proceso?.ultima_actividad,
      fecha_inicio: prop.proceso?.fecha_inicio,
      fecha_completado: prop.proceso?.fecha_completado,
      autorizado: (prop.cliente?.celular || prop.phoneNumber) === AUTHORIZED_NUMBER
    }));
    
    res.json({ 
      properties, 
      total: properties.length,
      authorizedNumber: AUTHORIZED_NUMBER,
      authorizedProperties: properties.filter(p => p.autorizado).length,
      completedProperties: properties.filter(p => p.status === 'completado').length,
      inProgressProperties: properties.filter(p => p.status === 'en_progreso').length
    });
  } catch (error) {
    console.error('Error obteniendo propiedades:', error);
    res.status(500).json({ error: 'Error obteniendo propiedades' });
  }
});

app.get('/conversations', (req, res) => {
  const conversations = [];
  activeConversations.forEach((conv, phone) => {
    conversations.push({
      phoneNumber: phone,
      messagesInQueue: conv.messages.length,
      isProcessing: conv.isProcessing,
      lastActivity: conv.lastActivity,
      authorized: phone === AUTHORIZED_NUMBER
    });
  });
  
  res.json({ 
    conversations, 
    total: conversations.length,
    authorizedNumber: AUTHORIZED_NUMBER
  });
});

app.get('/property/:phone', async (req, res) => {
  try {
    const phoneNumber = formatPhoneNumber(req.params.phone);
    const property = await propertyDB.findByPhone(phoneNumber);
    
    if (property) {
      res.json({
        ...property,
        authorized: phoneNumber === AUTHORIZED_NUMBER,
        currentStep: conversationEngine.getCurrentStep(property),
        progress: conversationEngine.calculateProgress(property)
      });
    } else {
      res.status(404).json({ error: 'Propiedad no encontrada' });
    }
  } catch (error) {
    console.error('Error obteniendo propiedad:', error);
    res.status(500).json({ error: 'Error obteniendo propiedad' });
  }
});

// Endpoint de salud
app.get('/health', async (req, res) => {
  try {
    const dbHealth = await propertyDB.healthCheck();
    
    res.json({ 
      status: 'OK',
      timestamp: new Date().toISOString(),
      activeConversations: activeConversations.size,
      totalProperties: dbHealth.total,
      uptime: process.uptime(),
      authorizedNumber: AUTHORIZED_NUMBER,
      environment: process.env.NODE_ENV || 'development',
      database: {
        redis: dbHealth.redis,
        memoryFallback: dbHealth.memory,
        totalRecords: dbHealth.total
      }
    });
  } catch (error) {
    console.error('Error en health check:', error);
    res.status(500).json({ error: 'Error en health check' });
  }
});

// Endpoint de prueba específico para número autorizado
app.post('/test-authorized', (req, res) => {
  const testMessage = `🔐 SISTEMA DE AUTORIZACIÓN ACTIVO\n\n` +
    `📱 Número autorizado: ${AUTHORIZED_NUMBER}\n` +
    `🚫 Otros números serán ignorados\n` +
    `⏰ Timestamp: ${new Date().toISOString()}\n\n` +
    `¿Todo listo para las pruebas?`;
    
  res.json({
    authorizedNumber: AUTHORIZED_NUMBER,
    message: testMessage,
    ready: true
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Bot de WhatsApp corriendo en puerto ${PORT}`);
  console.log(`🔐 Número autorizado: ${AUTHORIZED_NUMBER}`);
  console.log(`📝 Formulario: http://localhost:${PORT}/form-webhook`);
  console.log(`💬 Webhook: http://localhost:${PORT}/webhook`);
  console.log(`📊 Propiedades: http://localhost:${PORT}/properties`);
  console.log(`🔍 Conversaciones: http://localhost:${PORT}/conversations`);
  console.log(`🔐 Info autorización: http://localhost:${PORT}/admin/authorization-info`);
  console.log(`🗑️ Limpiar datos: DELETE http://localhost:${PORT}/admin/clear-data/{phone}`);
  console.log(`✅ Completar propiedad: POST http://localhost:${PORT}/admin/complete-property/{phone}`);
});