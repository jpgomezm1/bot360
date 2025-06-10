// test-final-flow.js
const axios = require('axios');

const NGROK_URL = 'https://b4e9a0f75726.ngrok.app'; // Actualiza con tu URL
const AUTHORIZED_NUMBER = '3183351733'; // SIN 57

async function testCompleteFlow() {
  console.log('🚀 PRUEBA FINAL DEL SISTEMA COMPLETO V2.0');
  console.log('=' .repeat(60));
  
  try {
    // 1. Verificar sistema
    console.log('🏥 1. Verificando sistema...');
    const health = await axios.get(`${NGROK_URL}/health`);
    console.log('✅ Sistema OK:', {
      status: health.data.status,
      redis: health.data.services.database.redis,
      email: health.data.services.email.ready,
      claude: health.data.services.claude.ready,
      ultramsg: health.data.services.ultramsg.ready,
      propiedades: health.data.totalProperties,
      numeroAutorizado: health.data.authorizedNumber
    });
    
    if (health.data.status !== 'OK') {
      console.log('⚠️ Algunos servicios no están completamente configurados');
    }
    
    // 2. Limpiar datos anteriores
    console.log('\n🧹 2. Limpiando datos anteriores...');
    try {
      await axios.delete(`${NGROK_URL}/admin/clear-data/57${AUTHORIZED_NUMBER}`);
      console.log('✅ Datos anteriores limpiados');
    } catch (e) {
      console.log('ℹ️ No había datos anteriores');
    }
    
    // 3. Verificar que está limpio
    console.log('\n🔍 3. Verificando limpieza...');
    const propertiesBefore = await axios.get(`${NGROK_URL}/properties`);
    console.log(`📊 Propiedades antes: ${propertiesBefore.data.total}`);
    
    // 4. Crear formulario
    console.log('\n📝 4. Creando formulario...');
    const formData = {
      nombre: "Juan Carlos",
      apellido: "Pérez Gómez",
      tipo_documento: "CC",
      numero_documento: "12345678",
      pais: "Colombia",
      celular: AUTHORIZED_NUMBER, // Número SIN 57
      email: "juan.perez@test.com",
      ciudad_inmueble: "Medellín",
      direccion_inmueble: "Carrera 43A # 18-95, El Poblado",
      matricula_inmobiliaria: `TEST_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📞 Número original: ${formData.celular}`);
    console.log(`📞 Debería normalizarse a: 57${formData.celular}`);
    
    const formResponse = await axios.post(`${NGROK_URL}/form-webhook`, formData);
    console.log('✅ Formulario creado:', {
      success: formResponse.data.success,
      propertyId: formResponse.data.propertyId,
      phoneNumber: formResponse.data.phoneNumber,
      authorized: formResponse.data.authorized
    });
    
    // 5. Verificar inmediatamente
    console.log('\n⚡ 5. Verificación inmediata...');
    const quickCheck = await axios.get(`${NGROK_URL}/properties`);
    console.log(`📊 Propiedades después: ${quickCheck.data.total}`);
    
    if (quickCheck.data.total > 0) {
      const myProperty = quickCheck.data.properties[0];
      console.log('✅ Propiedad encontrada:', {
        id: myProperty.id,
        cliente: myProperty.cliente,
        telefono: myProperty.telefono,
        status: myProperty.status,
        progreso: myProperty.progreso
      });
    }
    
    // 6. Esperar y verificar persistencia
    console.log('\n⏳ 6. Esperando 5 segundos para verificar persistencia...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // 7. Verificar con número completo
    console.log('\n🔍 7. Verificando con número completo...');
    const fullNumber = `57${AUTHORIZED_NUMBER}`;
    
    try {
      const propertyCheck = await axios.get(`${NGROK_URL}/property/${fullNumber}`);
      console.log('✅ ¡ÉXITO! Propiedad encontrada con número completo:', {
        id: propertyCheck.data.id,
        cliente: `${propertyCheck.data.cliente.nombre} ${propertyCheck.data.cliente.apellido}`,
        telefono: propertyCheck.data.cliente.celular,
        direccion: propertyCheck.data.cliente.direccion_inmueble,
        status: propertyCheck.data.proceso.status,
        stepActual: propertyCheck.data.currentStep,
        progreso: propertyCheck.data.progress,
        autorizado: propertyCheck.data.authorized,
        camposFaltantes: propertyCheck.data.missingFields
      });
    } catch (error) {
      console.log('❌ ERROR: No se encontró la propiedad');
      console.log('Respuesta del error:', error.response?.data || error.message);
      
      // Debug adicional
      console.log('\n🔍 Debug adicional...');
      const allProps = await axios.get(`${NGROK_URL}/properties`);
      console.log('Todas las propiedades:', allProps.data);
      
      return;
    }
    
    // 8. Probar endpoints administrativos
    console.log('\n🔧 8. Probando endpoints administrativos...');
    
    try {
      const authInfo = await axios.get(`${NGROK_URL}/admin/authorization-info`);
      console.log('📋 Info de autorización:', {
        numeroAutorizado: authInfo.data.authorizedNumber,
        propiedadesTotales: authInfo.data.totalProperties,
        propiedadesAutorizadas: authInfo.data.propertiesForAuthorizedNumber,
        servicios: authInfo.data.services
      });
    } catch (error) {
      console.log('⚠️ Error obteniendo info administrativa:', error.message);
    }
    
    // 9. Instrucciones para WhatsApp
    console.log('\n📱 9. ¡PRUEBA EN WHATSAPP! (NUEVA VERSIÓN)');
    console.log('=' .repeat(60));
    console.log(`📞 Tu número: ${fullNumber}`);
    console.log('🎯 Ya recibiste el mensaje inicial del bot');
    console.log('✅ Los datos están guardados correctamente');
    console.log('💬 El bot ahora usa Claude para conversaciones naturales');
    console.log('🚫 NO debería decir "no encontré tu información"');
    
    console.log('\n🔄 10. SECUENCIA COMPLETA (CONVERSACIONAL):');
    console.log('1️⃣  "Quiero vender un apartamento"');
    console.log('2️⃣  "Tiene 85 metros cuadrados"');
    console.log('3️⃣  "3 habitaciones y 2 baños"');
    console.log('4️⃣  "Lo quiero vender en 450 millones"');
    console.log('5️⃣  "Está usada pero en muy buen estado"');
    console.log('6️⃣  "Sí, tiene un parqueadero"');
    console.log('7️⃣  "Pueden visitarla los fines de semana"');
    console.log('8️⃣  📋 Envía FOTO/PDF del recibo de predial');
    console.log('9️⃣  📜 Envía FOTO/PDF del certificado de libertad');
    console.log('🔟 "SÍ" (confirmar toda la información)');
    
    console.log('\n💡 CARACTERÍSTICAS NUEVAS:');
    console.log('🤖 Conversaciones naturales con Claude');
    console.log('📄 Validación inteligente de documentos (PDF e imágenes)');
    console.log('📧 Email automático al administrador al completar');
    console.log('🚫 Sin mensajes de progreso molestos');
    console.log('✨ Respuestas más humanas y profesionales');
    
    // 10. Monitoreo automático mejorado
    console.log('\n📊 11. MONITOREO AUTOMÁTICO INICIADO...');
    console.log('Presiona Ctrl+C para detener');
    
    let checkCount = 0;
    const monitor = setInterval(async () => {
      checkCount++;
      try {
        const currentProperty = await axios.get(`${NGROK_URL}/property/${fullNumber}`);
        const conversations = await axios.get(`${NGROK_URL}/conversations`);
        
        console.log(`\n📈 Monitor #${checkCount} - ${new Date().toLocaleTimeString()}`);
        console.log(`🏠 Status: ${currentProperty.data.proceso.status}`);
        console.log(`🎯 Paso actual: ${currentProperty.data.currentStep}`);
        console.log(`✅ Progreso: ${currentProperty.data.progress}%`);
        console.log(`📋 Campos faltantes: ${currentProperty.data.missingFields?.join(', ') || 'Ninguno'}`);
        console.log(`💬 Conversaciones activas: ${conversations.data.total}`);
        
        // Mostrar estado de documentos
        if (currentProperty.data.documentsStatus) {
          const docs = currentProperty.data.documentsStatus;
          console.log(`📄 Predial: ${docs.predial.validated ? '✅ Validado' : '❌ Pendiente'} (${docs.predial.confidence}%)`);
          console.log(`📜 Cert. Libertad: ${docs.certificado_libertad.validated ? '✅ Validado' : '❌ Pendiente'} (${docs.certificado_libertad.confidence}%)`);
        }
        
        // Mostrar datos de propiedad si hay progreso
        if (Object.keys(currentProperty.data.propiedad).length > 0) {
          console.log('📋 Datos recolectados:');
          Object.entries(currentProperty.data.propiedad).forEach(([key, value]) => {
            if (typeof value === 'object' && value.validated) {
              console.log(`   ${key}: ✅ Validado`);
            } else if (value && typeof value !== 'object') {
              console.log(`   ${key}: ${value}`);
            }
          });
        }
        
        if (currentProperty.data.proceso.status === 'completado') {
          console.log('\n🎉 ¡PROCESO COMPLETADO EXITOSAMENTE!');
          console.log('🏆 El bot funcionó perfectamente');
          console.log('📧 Email de notificación enviado');
          clearInterval(monitor);
        }
        
        if (checkCount >= 36) { // 6 minutos
          clearInterval(monitor);
          console.log('\n⏰ Monitoreo finalizado - continúa probando manualmente');
          console.log('\n🔗 URLs útiles para monitoreo:');
          console.log(`📊 Propiedades: ${NGROK_URL}/properties`);
          console.log(`💬 Conversaciones: ${NGROK_URL}/conversations`);
          console.log(`🏥 Health: ${NGROK_URL}/health`);
          console.log(`📋 Propiedad específica: ${NGROK_URL}/property/${fullNumber}`);
        }
      } catch (error) {
        console.log(`❌ Error en monitor: ${error.message}`);
      }
    }, 10000); // Cada 10 segundos
    
  } catch (error) {
    console.error('\n❌ ERROR CRÍTICO:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('🔌 Verifica que el servidor esté corriendo en puerto 3000');
    }
    
    if (error.response?.status === 403) {
      console.log('🚫 Número no autorizado - verifica la configuración');
    }
    
    if (error.response?.status === 500) {
      console.log('🔥 Error interno del servidor - revisa los logs');
    }
  }
}

console.log('🚀 INICIANDO PRUEBA FINAL V2.0...');
console.log(`🌐 URL: ${NGROK_URL}`);
console.log(`📱 Número: 57${AUTHORIZED_NUMBER}`);
console.log('✨ Nuevas características: Claude AI + Validación de documentos + Email automático');
console.log('');

testCompleteFlow();