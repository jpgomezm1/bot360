// test-final-flow.js
const axios = require('axios');

const NGROK_URL = 'https://c7f1dad0fba6.ngrok.app';
const AUTHORIZED_NUMBER = '3183351733'; // SIN 57

async function testCompleteFlow() {
  console.log('🚀 PRUEBA FINAL DEL SISTEMA COMPLETO');
  console.log('=' .repeat(60));
  
  try {
    // 1. Verificar sistema
    console.log('🏥 1. Verificando sistema...');
    const health = await axios.get(`${NGROK_URL}/health`);
    console.log('✅ Sistema OK:', {
      redis: health.data.database.redis,
      propiedades: health.data.totalProperties,
      numeroAutorizado: health.data.authorizedNumber
    });
    
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
      nombre: "Juan",
      apellido: "Pérez",
      tipo_documento: "CC",
      numero_documento: "12345678",
      pais: "Colombia",
      celular: AUTHORIZED_NUMBER, // Número SIN 57
      email: "juan.perez@test.com",
      ciudad_inmueble: "Medellín",
      direccion_inmueble: "Carrera 43A # 18-95",
      matricula_inmobiliaria: `FINAL_${Date.now()}`,
      timestamp: new Date().toISOString()
    };
    
    console.log(`📞 Número original: ${formData.celular}`);
    console.log(`📞 Debería normalizarse a: 57${formData.celular}`);
    
    const formResponse = await axios.post(`${NGROK_URL}/form-webhook`, formData);
    console.log('✅ Formulario creado:', {
      success: formResponse.data.success,
      propertyId: formResponse.data.propertyId,
      phoneNumber: formResponse.data.phoneNumber
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
        status: myProperty.status
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
        stepActual: propertyCheck.data.proceso.step_actual,
        autorizado: propertyCheck.data.authorized
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
    
    // 8. Instrucciones para WhatsApp
    console.log('\n📱 8. ¡PRUEBA EN WHATSAPP!');
    console.log('=' .repeat(60));
    console.log(`📞 Tu número: ${fullNumber}`);
    console.log('🎯 Ya recibiste el mensaje inicial del bot');
    console.log('✅ Los datos están guardados correctamente en Redis');
    console.log('💬 Ahora responde "apartamento" en WhatsApp');
    console.log('🚫 NO debería decir "no encontré tu información"');
    
    console.log('\n🔄 9. SECUENCIA COMPLETA:');
    console.log('1️⃣  "apartamento"');
    console.log('2️⃣  "80 metros cuadrados"');
    console.log('3️⃣  "3 habitaciones"');
    console.log('4️⃣  "2 baños"');
    console.log('5️⃣  "450 millones"');
    console.log('6️⃣  "usada pero en buen estado"');
    console.log('7️⃣  "sí tiene parqueadero"');
    console.log('8️⃣  "fines de semana"');
    console.log('9️⃣  "SÍ" (confirmar)');
    
    // 9. Monitoreo automático
    console.log('\n📊 10. MONITOREO AUTOMÁTICO INICIADO...');
    console.log('Presiona Ctrl+C para detener');
    
    let checkCount = 0;
    const monitor = setInterval(async () => {
      checkCount++;
      try {
        const currentProperty = await axios.get(`${NGROK_URL}/property/${fullNumber}`);
        const conversations = await axios.get(`${NGROK_URL}/conversations`);
        
        console.log(`\n📈 Monitor #${checkCount} - ${new Date().toLocaleTimeString()}`);
        console.log(`🏠 Status: ${currentProperty.data.proceso.status}`);
        console.log(`🎯 Paso: ${currentProperty.data.proceso.step_actual}`);
        console.log(`✅ Completados: ${currentProperty.data.proceso.campos_completados?.length || 0}`);
        console.log(`💬 Conversaciones: ${conversations.data.total}`);
        
        // Mostrar datos de propiedad si hay progreso
        if (currentProperty.data.proceso.campos_completados?.length > 0) {
          console.log('📋 Datos recolectados:', currentProperty.data.propiedad);
        }
        
        if (currentProperty.data.proceso.status === 'completado') {
          console.log('\n🎉 ¡PROCESO COMPLETADO EXITOSAMENTE!');
          console.log('🏆 El bot funcionó perfectamente');
          clearInterval(monitor);
        }
        
        if (checkCount >= 24) { // 4 minutos
          clearInterval(monitor);
          console.log('\n⏰ Monitoreo finalizado - continúa probando manualmente');
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
  }
}

console.log('🚀 INICIANDO PRUEBA FINAL...');
console.log(`🌐 URL: ${NGROK_URL}`);
console.log(`📱 Número: 57${AUTHORIZED_NUMBER}`);
console.log('');

testCompleteFlow();