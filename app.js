const express = require('express');
const axios = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const multer = require('multer');
require('dotenv').config();

// Importar módulos locales
const { ConversationEngine } = require('./conversation/engine');
const { PropertyDatabase } = require('./database/schema');
const { formatPhoneNumber, generatePropertyId, logConversation } = require('./utils/helpers');
const { DocumentValidator } = require('./utils/documentValidator');
const { EmailService } = require('./services/emailService');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configurar multer para archivos
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

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
const documentValidator = new DocumentValidator();
const emailService = new EmailService();

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
async function processUserMessage(phoneNumber, message, mediaData = null) {
    try {
      logConversation(phoneNumber, message, 'user');
      
      let propertyData = await propertyDB.findByPhone(phoneNumber);
      
      if (!propertyData) {
        return {
          success: false,
          message: "No encontré tu información. ¿Completaste el formulario en nuestra página web?"
        };
      }
      
      // Si hay archivo adjunto (imagen o PDF), procesar documento
      if (mediaData && mediaData.data) {
        const currentStep = conversationEngine.getCurrentStep(propertyData);
        
        console.log(`📋 Estado actual: ${currentStep}`);
        console.log(`📋 Campos faltantes:`, conversationEngine.getMissingFields(propertyData.propiedad));
        
        if (currentStep === 'predial' || currentStep === 'certificado_libertad') {
          console.log(`📎 Procesando documento ${currentStep} de ${phoneNumber}`);
          console.log(`📄 Tipo de archivo: ${mediaData.mimetype}`);
          console.log(`📄 Tamaño: ${Math.round(mediaData.data.length/1024)}KB`);
          
          try {
            // Intentar validación con Claude, si falla usar validación simple
            let validation;
            try {
              validation = await documentValidator.validateDocument(
                mediaData.data, 
                currentStep, 
                mediaData.mimetype
              );
            } catch (claudeError) {
              console.log('⚠️ Error con Claude, usando validación simple:', claudeError.message);
              validation = await documentValidator.validateDocumentSimple(currentStep);
            }
            
            console.log(`🔍 Resultado validación ${currentStep}:`, {
              isValid: validation.isValid,
              confidence: validation.confidence,
              reason: validation.reason
            });
            
            if (validation.isValid && validation.confidence > 50) {
              // Documento válido
              propertyData.propiedad[currentStep] = {
                validated: true,
                confidence: validation.confidence,
                extractedInfo: validation.extractedInfo,
                uploadDate: new Date(),
                fileType: mediaData.mimetype,
                filename: mediaData.filename
              };
              
              const successMessage = currentStep === 'predial' 
                ? `✅ ¡Perfecto! He recibido y validado tu recibo de predial "${mediaData.filename}". ${validation.extractedInfo?.numeroPredial ? `\n📋 Número predial identificado: ${validation.extractedInfo.numeroPredial}` : ''}`
                : `✅ ¡Excelente! He recibido y validado tu certificado de libertad y tradición "${mediaData.filename}". ${validation.extractedInfo?.matricula ? `\n📋 Matrícula identificada: ${validation.extractedInfo.matricula}` : ''}`;
              
              // Actualizar base de datos con documento validado
              await propertyDB.update(phoneNumber, {
                propiedad: propertyData.propiedad,
                proceso: {
                  ...propertyData.proceso,
                  ultima_actividad: new Date()
                }
              });
              
              // Verificar si el proceso está completo
              const updatedPropertyData = await propertyDB.findByPhone(phoneNumber);
              const nextStep = conversationEngine.getCurrentStep(updatedPropertyData);
              
              console.log(`📋 Siguiente paso después de ${currentStep}: ${nextStep}`);
              
              if (nextStep === 'completed') {
                // Proceso completado, generar resumen
                const completionResponse = await conversationEngine.generateCompletionMessage(updatedPropertyData);
                
                await propertyDB.update(phoneNumber, {
                  proceso: {
                    ...updatedPropertyData.proceso,
                    status: 'esperando_confirmacion',
                    ultima_actividad: new Date()
                  }
                });
                
                return {
                  success: true,
                  response: {
                    type: 'completion',
                    message: successMessage + '\n\n' + completionResponse.message,
                    waitingFor: 'confirmation',
                    progress: 100
                  }
                };
              } else {
                // Solicitar siguiente documento o información
                const nextMessage = await getNextStepMessage(nextStep);
                
                await propertyDB.update(phoneNumber, {
                  proceso: {
                    ...updatedPropertyData.proceso,
                    step_actual: nextStep,
                    ultima_actividad: new Date()
                  }
                });
                
                return {
                  success: true,
                  response: {
                    type: 'document_validated',
                    message: successMessage + '\n\n' + nextMessage,
                    waitingFor: nextStep,
                    progress: conversationEngine.calculateProgress(updatedPropertyData)
                  }
                };
              }
            } else {
              // Documento no válido
              const errorMessage = `❌ No pude validar el documento "${mediaData.filename}". ${validation.reason}\n\n` +
                `Por favor, envía ${mediaData.mimetype.includes('pdf') ? 'un PDF' : 'una foto'} más clara del ${currentStep === 'predial' ? 'recibo de predial' : 'certificado de libertad y tradición'}.\n\n` +
                `💡 Asegúrate de que:\n` +
                `• El documento sea legible y de buena calidad\n` +
                `• Esté completo (todas las secciones visibles)\n` +
                `• Sea el documento correcto\n` +
                `• Esté actualizado`;
              
              return {
                success: true,
                response: {
                  type: 'document_invalid',
                  message: errorMessage,
                  waitingFor: currentStep,
                  progress: conversationEngine.calculateProgress(propertyData)
                }
              };
            }
          } catch (error) {
            console.error('Error validando documento:', error);
            return {
              success: true,
              response: {
                type: 'document_error',
                message: `❌ Hubo un problema técnico al procesar tu documento "${mediaData.filename}". Por favor, intenta enviarlo nuevamente.`,
                waitingFor: currentStep,
                progress: conversationEngine.calculateProgress(propertyData)
              }
            };
          }
        } else {
          // No esperamos documentos en este paso
          return {
            success: true,
            response: {
              type: 'unexpected_document',
              message: `📎 Recibí el archivo "${mediaData.filename}", pero en este momento necesito información sobre ${currentStep}. Continuemos con eso.`,
              waitingFor: currentStep,
              progress: conversationEngine.calculateProgress(propertyData)
            }
          };
        }
      }
      
      // Procesar mensaje de texto con el motor conversacional
      const response = await conversationEngine.processResponse(message, propertyData);
      
      // Actualizar base de datos
      const updateData = {
        propiedad: {
          ...propertyData.propiedad,
          ...response.extractedData
        },
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
        
        // Enviar email de notificación de forma asíncrona
        setTimeout(async () => {
          try {
            const finalPropertyData = await propertyDB.findByPhone(phoneNumber);
            const emailResult = await emailService.sendPropertyCompletionNotification(finalPropertyData);
            if (emailResult.success) {
              console.log(`📧 Email de notificación enviado exitosamente: ${emailResult.id}`);
            } else {
              console.error(`❌ Error enviando email: ${emailResult.error}`);
            }
          } catch (error) {
            console.error('❌ Error enviando email de notificación:', error);
          }
        }, 2000);
        
        console.log(`🎉 Propiedad completada exitosamente: ${phoneNumber}`);
      } else if (response.type === 'edit_request') {
        updateData.proceso.status = 'editando';
        console.log(`📝 Propiedad en modo edición: ${phoneNumber}`);
      } else if (response.type === 'completion') {
        updateData.proceso.status = 'esperando_confirmacion';
        console.log(`⏳ Esperando confirmación: ${phoneNumber}`);
      } else if (response.type === 'edit_progress') {
        updateData.proceso.status = 'editando';
        console.log(`📝 Editando información: ${phoneNumber}`);
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

// Función auxiliar para obtener mensaje del siguiente paso
async function getNextStepMessage(nextStep) {
  const stepMessages = {
    'predial': 'Ahora necesito que me envíes una foto o PDF del recibo de predial de la propiedad. 📋',
    'certificado_libertad': 'Perfecto, ahora necesito que me envíes una foto o PDF del certificado de libertad y tradición (máximo 3 meses de expedición). 📜',
    'tipo_propiedad': '¿Qué tipo de propiedad quieres vender? (apartamento, casa, local, oficina, lote, etc.)',
    'area_m2': '¿Cuál es el área total en metros cuadrados?',
    'habitaciones': '¿Cuántas habitaciones tiene?',
    'banos': '¿Cuántos baños tiene?',
    'precio_venta': '¿En cuánto esperas vender la propiedad?',
    'estado_propiedad': '¿Cuál es el estado de la propiedad? (nueva, usada en buen estado, necesita remodelación)',
    'parqueadero': '¿Tiene parqueadero?',
    'disponibilidad_visita': '¿Cuándo podrían visitar la propiedad los interesados?'
  };
  
  return stepMessages[nextStep] || 'Continuemos con la información de tu propiedad.';
}

// Webhook para recibir mensajes de WhatsApp
app.post('/webhook', async (req, res) => {
    try {
      console.log('Webhook recibido:', JSON.stringify(req.body, null, 2));
      
      const { data } = req.body;
      
      if (data && data.from) {
        
        if (data.fromMe === true || data.self === true) {
          console.log('📤 Ignorando mensaje del bot mismo');
          res.status(200).json({ success: true });
          return;
        }
        
        if (req.body.event_type === 'message_ack') {
          console.log('📬 Ignorando ACK');
          res.status(200).json({ success: true });
          return;
        }
        
        if (req.body.event_type !== 'message_received') {
          console.log('📝 Ignorando evento:', req.body.event_type);
          res.status(200).json({ success: true });
          return;
        }
        
        const userMessage = data.body ? data.body.trim() : '';
        const phoneNumber = formatPhoneNumber(data.from);
        
        if (phoneNumber !== AUTHORIZED_NUMBER) {
          console.log(`🚫 NÚMERO NO AUTORIZADO: ${phoneNumber} - Solo ${AUTHORIZED_NUMBER} puede usar el bot`);
          res.status(200).json({ success: true, message: 'Número no autorizado' });
          return;
        }
        
        console.log(`📱 MENSAJE DE USUARIO AUTORIZADO ${phoneNumber}: ${userMessage}`);
        console.log(`📎 Tipo de mensaje: ${data.type}`);
        
        // Extraer información de archivos adjuntos si existen
        let mediaData = null;
        
        if (data.type === 'document' || data.type === 'image') {
          console.log(`📎 Archivo detectado: ${data.type}`);
          console.log(`📎 Filename: ${data.filename || 'Sin nombre'}`);
          console.log(`📎 Media URL: ${data.media}`);
          
          if (data.media) {
            try {
              // Descargar el archivo desde UltraMSG
              console.log(`📥 Descargando archivo desde: ${data.media}`);
              const mediaResponse = await axios.get(data.media, { 
                responseType: 'arraybuffer',
                timeout: 30000 // 30 segundos timeout
              });
              
              // Convertir a base64
              const base64Data = Buffer.from(mediaResponse.data).toString('base64');
              
              // Determinar mimetype
              let mimetype = 'application/pdf';
              if (data.type === 'image') {
                mimetype = 'image/jpeg';
              } else if (data.filename) {
                if (data.filename.toLowerCase().endsWith('.pdf')) {
                  mimetype = 'application/pdf';
                } else if (data.filename.toLowerCase().endsWith('.png')) {
                  mimetype = 'image/png';
                } else if (data.filename.toLowerCase().endsWith('.jpg') || data.filename.toLowerCase().endsWith('.jpeg')) {
                  mimetype = 'image/jpeg';
                }
              }
              
              mediaData = {
                data: base64Data,
                mimetype: mimetype,
                filename: data.filename || `documento.${data.type === 'image' ? 'jpg' : 'pdf'}`
              };
              
              console.log(`✅ Archivo procesado: ${mediaData.filename} (${mimetype}) - ${Math.round(base64Data.length/1024)}KB`);
              
            } catch (downloadError) {
              console.error('❌ Error descargando archivo:', downloadError.message);
              // Enviar mensaje de error al usuario
              await sendWhatsAppMessage(phoneNumber, "❌ Hubo un problema descargando tu archivo. ¿Podrías enviarlo nuevamente?");
              res.status(200).json({ success: true });
              return;
            }
          }
        }
        
        // Verificar si hay una conversación activa
        let conversation = activeConversations.get(phoneNumber) || {
          messages: [],
          lastActivity: new Date(),
          isProcessing: false
        };
        
        // Agregar mensaje a la cola
        conversation.messages.push({
          text: userMessage,
          media: mediaData,
          timestamp: new Date(),
          type: data.type
        });
        
        conversation.lastActivity = new Date();
        activeConversations.set(phoneNumber, conversation);
        
        // Si no se está procesando, procesar inmediatamente
        if (!conversation.isProcessing) {
          conversation.isProcessing = true;
          
          // Si hay archivo adjunto, procesar más rápido
          const delay = mediaData ? 1000 : 2000;
          
          setTimeout(async () => {
            try {
              const conv = activeConversations.get(phoneNumber);
              if (conv && conv.messages.length > 0) {
                // Tomar el último mensaje (que puede incluir archivo)
                const lastMessage = conv.messages[conv.messages.length - 1];
                
                // Combinar todos los mensajes de texto
                const combinedText = conv.messages
                  .filter(m => m.text && m.text.trim())
                  .map(m => m.text.trim())
                  .join(' ');
                
                conv.messages = []; // Limpiar mensajes procesados
                
                // Procesar mensaje con posible archivo adjunto
                const result = await processUserMessage(
                  phoneNumber, 
                  combinedText || (lastMessage.media ? 'archivo adjunto' : 'mensaje vacío'), 
                  lastMessage.media
                );
                
                if (result.success) {
                  await sendWhatsAppMessage(phoneNumber, result.response.message);
                  
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
              
              try {
                await sendWhatsAppMessage(phoneNumber, "Disculpa, hubo un error técnico. ¿Podrías intentar nuevamente?");
              } catch (sendError) {
                console.error('Error enviando mensaje de error:', sendError);
              }
            }
          }, delay);
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
     
        // Enviar email de notificación
        setTimeout(async () => {
          try {
            const updatedData = await propertyDB.findByPhone(phoneNumber);
            const emailResult = await emailService.sendPropertyCompletionNotification(updatedData);
            if (emailResult.success) {
              console.log(`📧 Email de confirmación enviado: ${emailResult.id}`);
            }
          } catch (error) {
            console.error('Error enviando email de confirmación:', error);
          }
        }, 1000);
        
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
        database: healthCheck,
        services: {
          email: {
            configured: !!(process.env.RESEND_API_KEY && process.env.DOMAIN),
            domain: process.env.DOMAIN
          },
          claude: {
            configured: !!process.env.CLAUDE_API_KEY
          },
          ultramsg: {
            configured: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID)
          }
        }
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
      
      // Enviar email de notificación
      setTimeout(async () => {
        try {
          const finalData = await propertyDB.findByPhone(phoneNumber);
          const emailResult = await emailService.sendPropertyCompletionNotification(finalData);
          if (emailResult.success) {
            console.log(`📧 Email de testing enviado: ${emailResult.id}`);
          }
        } catch (error) {
          console.error('Error enviando email de testing:', error);
        }
      }, 1000);
      
      const finalMessage = `🧪 [MODO TESTING] Propiedad marcada como completada.\n\n` +
        `📋 ID: ${propertyData.id}\n` +
        `🏠 Tipo: ${propertyData.propiedad.tipo_propiedad || 'No especificado'}\n` +
        `📊 Status: Completado exitosamente\n` +
        `📧 Email de notificación enviado`;
      
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
   
   // Endpoint para probar validación de documentos
   app.post('/admin/test-document-validation', upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No se proporcionó archivo' });
      }
      
      const { documentType } = req.body; // 'predial' o 'certificado_libertad'
      
      if (!documentType || !['predial', 'certificado_libertad'].includes(documentType)) {
        return res.status(400).json({ error: 'Tipo de documento inválido' });
      }
      
      console.log(`🧪 Probando validación de ${documentType}`);
      console.log(`📄 Archivo: ${req.file.originalname} (${req.file.mimetype})`);
      
      const base64Data = req.file.buffer.toString('base64');
      const validation = await documentValidator.validateDocument(
        base64Data, 
        documentType, 
        req.file.mimetype
      );
      
      res.json({
        success: true,
        filename: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size,
        documentType: documentType,
        validation: validation
      });
      
    } catch (error) {
      console.error('Error en test de validación:', error);
      res.status(500).json({ error: 'Error probando validación de documento' });
    }
   });
   
   // Endpoint para probar envío de email
   app.post('/admin/test-email', async (req, res) => {
    try {
      const { phoneNumber } = req.body;
      
      if (!phoneNumber) {
        return res.status(400).json({ error: 'Número de teléfono requerido' });
      }
      
      const propertyData = await propertyDB.findByPhone(formatPhoneNumber(phoneNumber));
      
      if (!propertyData) {
        return res.status(404).json({ error: 'Propiedad no encontrada' });
      }
      
      console.log(`📧 Probando envío de email para ${phoneNumber}`);
      
      const emailResult = await emailService.sendPropertyCompletionNotification(propertyData);
      
      res.json({
        success: true,
        message: 'Email de prueba enviado',
        emailResult: emailResult,
        propertyId: propertyData.id
      });
      
    } catch (error) {
      console.error('Error en test de email:', error);
      res.status(500).json({ error: 'Error probando envío de email' });
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
        autorizado: (prop.cliente?.celular || prop.phoneNumber) === AUTHORIZED_NUMBER,
        documentos: {
          predial: prop.propiedad?.predial?.validated || false,
          certificado_libertad: prop.propiedad?.certificado_libertad?.validated || false
        }
      }));
      
      res.json({ 
        properties, 
        total: properties.length,
        authorizedNumber: AUTHORIZED_NUMBER,
        authorizedProperties: properties.filter(p => p.autorizado).length,
        completedProperties: properties.filter(p => p.status === 'completado').length,
        inProgressProperties: properties.filter(p => p.status === 'en_progreso').length,
        awaitingConfirmation: properties.filter(p => p.status === 'esperando_confirmacion').length
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
          progress: conversationEngine.calculateProgress(property),
          missingFields: conversationEngine.getMissingFields(property.propiedad),
          documentsStatus: {
            predial: {
              required: true,
              validated: property.propiedad.predial?.validated || false,
              confidence: property.propiedad.predial?.confidence || 0
            },
            certificado_libertad: {
              required: true,
              validated: property.propiedad.certificado_libertad?.validated || false,
              confidence: property.propiedad.certificado_libertad?.confidence || 0
            }
          }
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
      
      // Verificar servicios
      const services = {
        database: {
          redis: dbHealth.redis,
          memory: dbHealth.memory > 0,
          total: dbHealth.total
        },
        email: {
          configured: !!(process.env.RESEND_API_KEY && process.env.DOMAIN),
          ready: !!(process.env.RESEND_API_KEY && process.env.DOMAIN)
        },
        claude: {
          configured: !!process.env.CLAUDE_API_KEY,
          ready: !!process.env.CLAUDE_API_KEY
        },
        ultramsg: {
          configured: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID),
          ready: !!(process.env.ULTRAMSG_TOKEN && process.env.INSTANCE_ID)
        }
      };
      
      const allServicesReady = Object.values(services).every(service => service.ready);
      
      res.json({ 
        status: allServicesReady ? 'OK' : 'PARTIAL',
        timestamp: new Date().toISOString(),
        activeConversations: activeConversations.size,
        totalProperties: dbHealth.total,
        uptime: process.uptime(),
        authorizedNumber: AUTHORIZED_NUMBER,
        environment: process.env.NODE_ENV || 'development',
        services: services,
        versions: {
          node: process.version,
          platform: process.platform
        }
      });
    } catch (error) {
      console.error('Error en health check:', error);
      res.status(500).json({ 
        status: 'ERROR',
        error: 'Error en health check',
        timestamp: new Date().toISOString()
      });
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
      ready: true,
      services: {
        conversationEngine: !!conversationEngine,
        documentValidator: !!documentValidator,
        emailService: !!emailService,
        database: !!propertyDB
      }
    });
   });
   
   // Middleware de manejo de errores
   app.use((error, req, res, next) => {
    console.error('Error no manejado:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      timestamp: new Date().toISOString()
    });
   });
   
   // Middleware para rutas no encontradas
   app.use((req, res) => {
    res.status(404).json({ 
      error: 'Ruta no encontrada',
      path: req.originalUrl,
      method: req.method
    });
  });
   
   const PORT = process.env.PORT || 3000;
   app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 BOT INMOBILIARIO INICIADO EXITOSAMENTE');
    console.log('='.repeat(60));
    console.log(`🌐 Servidor: http://localhost:${PORT}`);
    console.log(`🔐 Número autorizado: ${AUTHORIZED_NUMBER}`);
    console.log('');
    console.log('📋 ENDPOINTS PRINCIPALES:');
    console.log(`📝 Formulario: POST ${PORT}/form-webhook`);
    console.log(`💬 Webhook WhatsApp: POST ${PORT}/webhook`);
    console.log(`📊 Propiedades: GET ${PORT}/properties`);
    console.log(`🔍 Conversaciones: GET ${PORT}/conversations`);
    console.log(`🏥 Health Check: GET ${PORT}/health`);
    console.log('');
    console.log('🔧 ENDPOINTS ADMINISTRATIVOS:');
    console.log(`🔐 Info autorización: GET ${PORT}/admin/authorization-info`);
    console.log(`🗑️ Limpiar datos: DELETE ${PORT}/admin/clear-data/{phone}`);
    console.log(`✅ Completar propiedad: POST ${PORT}/admin/complete-property/{phone}`);
    console.log(`📄 Test documentos: POST ${PORT}/admin/test-document-validation`);
    console.log(`📧 Test email: POST ${PORT}/admin/test-email`);
    console.log('');
    console.log('🎯 SERVICIOS CONFIGURADOS:');
    console.log(`📧 Email (Resend): ${process.env.RESEND_API_KEY ? '✅' : '❌'} ${process.env.DOMAIN || 'No configurado'}`);
    console.log(`🤖 Claude AI: ${process.env.CLAUDE_API_KEY ? '✅' : '❌'}`);
    console.log(`💬 UltraMSG: ${process.env.ULTRAMSG_TOKEN ? '✅' : '❌'}`);
    console.log(`🗄️ Redis: Verificando...`);
    console.log('='.repeat(60));
    console.log('🎉 ¡Listo para recibir mensajes!');
    console.log('='.repeat(60) + '\n');
   });