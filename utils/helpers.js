// utils/helpers.js

function formatPhoneNumber(phone) {
    // Limpiar el número y asegurar formato correcto
    let cleanPhone = phone.replace(/[^\d]/g, '');
    
    // Remover el @c.us si está presente
    if (phone.includes('@c.us')) {
      cleanPhone = phone.split('@')[0].replace(/[^\d]/g, '');
    }
    
    // Si ya tiene 57 al inicio, mantenerlo
    if (cleanPhone.startsWith('57')) {
      return cleanPhone;
    }
    
    // Si empieza con 3 (número colombiano), agregar 57
    if (cleanPhone.startsWith('3')) {
      return '57' + cleanPhone;
    }
    
    // Para otros casos, agregar 57
    return '57' + cleanPhone;
  }
  
  function generatePropertyId() {
    return `PROP_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  function isWithinBusinessHours() {
    const now = new Date();
    const hour = now.getHours();
    const day = now.getDay(); // 0 = Sunday, 6 = Saturday
    
    // Lunes a Viernes 8AM - 8PM, Sábados 9AM - 5PM
    if (day >= 1 && day <= 5) {
      return hour >= 8 && hour < 20;
    } else if (day === 6) {
      return hour >= 9 && hour < 17;
    }
    return false;
  }
  
  function logConversation(phoneNumber, message, type = 'user') {
    const timestamp = new Date().toISOString();
    const emoji = type === 'user' ? '📱' : '🤖';
    const typeLabel = type.toUpperCase();
    
    console.log(`[${timestamp}] ${emoji} ${typeLabel} ${phoneNumber}: ${message}`);
  }
  
  function sanitizeMessage(message) {
    // Limpiar mensaje de caracteres especiales que pueden causar problemas
    return message
      .replace(/[\u200B-\u200D\uFEFF]/g, '') // Remover caracteres de espacio cero
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '') // Remover caracteres de control
      .trim();
  }
  
  function validatePhoneNumber(phone) {
    const cleanPhone = formatPhoneNumber(phone);
    
    // Validar que sea un número colombiano válido
    if (cleanPhone.startsWith('57') && cleanPhone.length >= 12 && cleanPhone.length <= 13) {
      return true;
    }
    
    return false;
  }
  
  function formatCurrency(amount) {
    // Formatear números como moneda colombiana
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  }
  
  function extractNumbers(text) {
    // Extraer todos los números de un texto
    const numbers = text.match(/\d+/g);
    return numbers ? numbers.map(n => parseInt(n)) : [];
  }
  
  function isQuestion(message) {
    // Detectar si un mensaje es una pregunta
    const questionIndicators = [
      '?', 'qué', 'cuál', 'cómo', 'cuándo', 'dónde', 'por qué', 
      'cuenta como', 'se considera', 'puedo', 'debo', 'tengo que'
    ];
    
    const lowerMessage = message.toLowerCase();
    return questionIndicators.some(indicator => lowerMessage.includes(indicator));
  }
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function calculateProgressPercentage(completed, total) {
    if (total === 0) return 0;
    return Math.round((completed / total) * 100);
  }
  
  function formatTimestamp(date) {
    return new Intl.DateTimeFormat('es-CO', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZone: 'America/Bogota'
    }).format(date);
  }
  
  function generateRandomId(prefix = '', length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix;
    
    for (let i = 0; i < length; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    
    return result;
  }
  
  function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  function normalizeText(text) {
    // Normalizar texto para comparaciones
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remover acentos
      .trim();
  }
  
  function retryOperation(operation, maxRetries = 3, delay = 1000) {
    return new Promise((resolve, reject) => {
      let attempts = 0;
      
      function attempt() {
        attempts++;
        
        operation()
          .then(resolve)
          .catch(error => {
            if (attempts >= maxRetries) {
              reject(error);
            } else {
              console.log(`Reintentando operación (${attempts}/${maxRetries})...`);
              setTimeout(attempt, delay);
            }
          });
      }
      
      attempt();
    });
  }
  
  module.exports = {
    formatPhoneNumber,
    generatePropertyId,
    isWithinBusinessHours,
    logConversation,
    sanitizeMessage,
    validatePhoneNumber,
    formatCurrency,
    extractNumbers,
    isQuestion,
    sleep,
    calculateProgressPercentage,
    formatTimestamp,
    generateRandomId,
    validateEmail,
    normalizeText,
    retryOperation
  };