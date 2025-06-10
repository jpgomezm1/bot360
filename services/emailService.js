// services/emailService.js
const { Resend } = require('resend');

class EmailService {
  constructor() {
    this.resend = new Resend(process.env.RESEND_API_KEY);
    this.fromEmail = `Bot Inmobiliario <noreply@${process.env.DOMAIN}>`;
  }

  async sendPropertyCompletionNotification(propertyData) {
    try {
      const emailHtml = this.generateCompletionEmailHtml(propertyData);
      const emailText = this.generateCompletionEmailText(propertyData);
      
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: ['jpgomez@stayirrelevant.com'],
        subject: `🏠 Nueva propiedad registrada - ${propertyData.cliente.nombre} ${propertyData.cliente.apellido}`,
        html: emailHtml,
        text: emailText,
      });

      console.log('✅ Email enviado exitosamente:', response.id);
      return { success: true, id: response.id };
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return { success: false, error: error.message };
    }
  }

  generateCompletionEmailText(data) {
    const { cliente, propiedad } = data;
    
    return `
Nueva Propiedad Registrada
ID: ${data.id}

=== INFORMACIÓN DEL CLIENTE ===
Nombre: ${cliente.nombre} ${cliente.apellido}
Documento: ${cliente.tipo_documento} ${cliente.numero_documento}
Teléfono: ${cliente.celular}
Email: ${cliente.email}
País: ${cliente.pais}

=== INFORMACIÓN DE LA PROPIEDAD ===
Dirección: ${cliente.direccion_inmueble}
Ciudad: ${cliente.ciudad_inmueble}
Tipo: ${propiedad.tipo_propiedad}
Área: ${propiedad.area_m2} m²
${propiedad.habitaciones ? `Habitaciones: ${propiedad.habitaciones}` : ''}
${propiedad.banos ? `Baños: ${propiedad.banos}` : ''}
Precio: $${propiedad.precio_venta?.toLocaleString('es-CO')}
Estado: ${propiedad.estado_propiedad?.replace('_', ' ')}
Parqueadero: ${propiedad.parqueadero ? 'Sí' : 'No'}
Disponibilidad visitas: ${propiedad.disponibilidad_visita}

=== DOCUMENTOS ===
Predial: ${propiedad.predial?.validated ? '✅ Validado' : '❌ Pendiente'}
${propiedad.predial?.extractedInfo?.numeroPredial ? `Número Predial: ${propiedad.predial.extractedInfo.numeroPredial}` : ''}
${propiedad.predial?.confidence ? `Confianza: ${propiedad.predial.confidence}%` : ''}

Certificado de Libertad: ${propiedad.certificado_libertad?.validated ? '✅ Validado' : '❌ Pendiente'}
${propiedad.certificado_libertad?.extractedInfo?.matricula ? `Matrícula: ${propiedad.certificado_libertad.extractedInfo.matricula}` : ''}
${propiedad.certificado_libertad?.confidence ? `Confianza: ${propiedad.certificado_libertad.confidence}%` : ''}

=== INFORMACIÓN DEL PROCESO ===
Fecha de inicio: ${new Date(data.proceso.fecha_inicio).toLocaleString('es-CO')}
Fecha de completado: ${data.proceso.fecha_completado ? new Date(data.proceso.fecha_completado).toLocaleString('es-CO') : new Date().toLocaleString('es-CO')}
Estado: ${data.proceso.status}

---
Bot Inmobiliario - Sistema Automático de Registro de Propiedades
Este email fue generado automáticamente
    `.trim();
  }

  generateCompletionEmailHtml(data) {
    const { cliente, propiedad } = data;
    
    return `
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nueva Propiedad Registrada</title>
        <style>
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
            }
            body { 
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
                line-height: 1.6; 
                color: #333;
                background-color: #f5f5f5;
            }
            .container { 
                max-width: 600px; 
                margin: 20px auto; 
                background: white;
                border-radius: 8px;
                overflow: hidden;
                box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            }
            .header { 
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white; 
                padding: 30px 20px; 
                text-align: center; 
            }
            .header h1 {
                font-size: 24px;
                margin-bottom: 10px;
                font-weight: 600;
            }
            .header .id {
                font-size: 14px;
                opacity: 0.9;
                background: rgba(255,255,255,0.2);
                padding: 5px 15px;
                border-radius: 20px;
                display: inline-block;
            }
            .content { 
                padding: 0;
            }
            .section { 
                padding: 25px 30px;
                border-bottom: 1px solid #eee;
           }
           .section:last-child {
               border-bottom: none;
           }
           .section h2 {
               font-size: 18px;
               margin-bottom: 15px;
               color: #667eea;
               font-weight: 600;
           }
           .info-row { 
               display: flex;
               padding: 8px 0;
               border-bottom: 1px solid #f8f9fa;
           }
           .info-row:last-child {
               border-bottom: none;
           }
           .label { 
               font-weight: 600; 
               color: #555;
               min-width: 140px;
               flex-shrink: 0;
           }
           .value { 
               color: #333;
               flex: 1;
           }
           .status-badge {
               display: inline-block;
               padding: 4px 8px;
               border-radius: 12px;
               font-size: 12px;
               font-weight: 600;
           }
           .status-validated {
               background: #d4edda;
               color: #155724;
           }
           .status-pending {
               background: #f8d7da;
               color: #721c24;
           }
           .footer { 
               background: #2c3e50; 
               color: #bdc3c7; 
               padding: 20px 30px; 
               text-align: center; 
               font-size: 12px; 
           }
           .footer p {
               margin: 5px 0;
           }
           .highlight {
               background: #f8f9fa;
               padding: 15px;
               border-radius: 6px;
               margin: 10px 0;
           }
           .price {
               font-size: 18px;
               font-weight: 700;
               color: #27ae60;
           }
           @media (max-width: 600px) {
               .container {
                   margin: 10px;
                   border-radius: 0;
               }
               .section {
                   padding: 20px;
               }
               .info-row {
                   flex-direction: column;
               }
               .label {
                   min-width: auto;
                   margin-bottom: 5px;
               }
           }
       </style>
   </head>
   <body>
       <div class="container">
           <div class="header">
               <h1>🏠 Nueva Propiedad Registrada</h1>
               <div class="id">ID: ${data.id}</div>
           </div>
           
           <div class="content">
               <div class="section">
                   <h2>👤 Información del Cliente</h2>
                   <div class="info-row">
                       <div class="label">Nombre:</div>
                       <div class="value">${cliente.nombre} ${cliente.apellido}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Documento:</div>
                       <div class="value">${cliente.tipo_documento} ${cliente.numero_documento}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Teléfono:</div>
                       <div class="value">${cliente.celular}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Email:</div>
                       <div class="value">${cliente.email}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">País:</div>
                       <div class="value">${cliente.pais}</div>
                   </div>
               </div>
               
               <div class="section">
                   <h2>🏠 Información de la Propiedad</h2>
                   <div class="info-row">
                       <div class="label">Dirección:</div>
                       <div class="value">${cliente.direccion_inmueble}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Ciudad:</div>
                       <div class="value">${cliente.ciudad_inmueble}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Tipo:</div>
                       <div class="value">${propiedad.tipo_propiedad}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Área:</div>
                       <div class="value">${propiedad.area_m2} m²</div>
                   </div>
                   ${propiedad.habitaciones ? `
                   <div class="info-row">
                       <div class="label">Habitaciones:</div>
                       <div class="value">${propiedad.habitaciones}</div>
                   </div>` : ''}
                   ${propiedad.banos ? `
                   <div class="info-row">
                       <div class="label">Baños:</div>
                       <div class="value">${propiedad.banos}</div>
                   </div>` : ''}
                   <div class="info-row">
                       <div class="label">Precio:</div>
                       <div class="value price">$${propiedad.precio_venta?.toLocaleString('es-CO')}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Estado:</div>
                       <div class="value">${propiedad.estado_propiedad?.replace('_', ' ')}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Parqueadero:</div>
                       <div class="value">${propiedad.parqueadero ? '✅ Sí' : '❌ No'}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Disponibilidad visitas:</div>
                       <div class="value">${propiedad.disponibilidad_visita}</div>
                   </div>
               </div>
               
               <div class="section">
                   <h2>📄 Documentos Validados</h2>
                   
                   <div class="highlight">
                       <h3 style="margin-bottom: 10px; color: #555;">📋 Predial</h3>
                       <div class="info-row">
                           <div class="label">Estado:</div>
                           <div class="value">
                               <span class="status-badge ${propiedad.predial?.validated ? 'status-validated' : 'status-pending'}">
                                   ${propiedad.predial?.validated ? '✅ Validado' : '❌ Pendiente'}
                               </span>
                           </div>
                       </div>
                       ${propiedad.predial?.confidence ? `
                       <div class="info-row">
                           <div class="label">Confianza:</div>
                           <div class="value">${propiedad.predial.confidence}%</div>
                       </div>` : ''}
                       ${propiedad.predial?.extractedInfo?.numeroPredial ? `
                       <div class="info-row">
                           <div class="label">Número Predial:</div>
                           <div class="value">${propiedad.predial.extractedInfo.numeroPredial}</div>
                       </div>` : ''}
                       ${propiedad.predial?.extractedInfo?.entidadRecaudadora ? `
                       <div class="info-row">
                           <div class="label">Entidad:</div>
                           <div class="value">${propiedad.predial.extractedInfo.entidadRecaudadora}</div>
                       </div>` : ''}
                   </div>
                   
                   <div class="highlight">
                       <h3 style="margin-bottom: 10px; color: #555;">📜 Certificado de Libertad y Tradición</h3>
                       <div class="info-row">
                           <div class="label">Estado:</div>
                           <div class="value">
                               <span class="status-badge ${propiedad.certificado_libertad?.validated ? 'status-validated' : 'status-pending'}">
                                   ${propiedad.certificado_libertad?.validated ? '✅ Validado' : '❌ Pendiente'}
                               </span>
                           </div>
                       </div>
                       ${propiedad.certificado_libertad?.confidence ? `
                       <div class="info-row">
                           <div class="label">Confianza:</div>
                           <div class="value">${propiedad.certificado_libertad.confidence}%</div>
                       </div>` : ''}
                       ${propiedad.certificado_libertad?.extractedInfo?.matricula ? `
                       <div class="info-row">
                           <div class="label">Matrícula:</div>
                           <div class="value">${propiedad.certificado_libertad.extractedInfo.matricula}</div>
                       </div>` : ''}
                       ${propiedad.certificado_libertad?.extractedInfo?.fechaExpedicion ? `
                       <div class="info-row">
                           <div class="label">Fecha Expedición:</div>
                           <div class="value">${propiedad.certificado_libertad.extractedInfo.fechaExpedicion}</div>
                       </div>` : ''}
                       ${propiedad.certificado_libertad?.extractedInfo?.oficiaRegistro ? `
                       <div class="info-row">
                           <div class="label">Oficina Registro:</div>
                           <div class="value">${propiedad.certificado_libertad.extractedInfo.oficiaRegistro}</div>
                       </div>` : ''}
                   </div>
               </div>
               
               <div class="section">
                   <h2>⏰ Información del Proceso</h2>
                   <div class="info-row">
                       <div class="label">Fecha de inicio:</div>
                       <div class="value">${new Date(data.proceso.fecha_inicio).toLocaleString('es-CO')}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Fecha de completado:</div>
                       <div class="value">${data.proceso.fecha_completado ? new Date(data.proceso.fecha_completado).toLocaleString('es-CO') : new Date().toLocaleString('es-CO')}</div>
                   </div>
                   <div class="info-row">
                       <div class="label">Estado:</div>
                       <div class="value">
                           <span class="status-badge status-validated">
                               ${data.proceso.status}
                           </span>
                       </div>
                   </div>
                   ${cliente.matricula_inmobiliaria ? `
                   <div class="info-row">
                       <div class="label">Matrícula Form:</div>
                       <div class="value">${cliente.matricula_inmobiliaria}</div>
                   </div>` : ''}
               </div>
           </div>
           
           <div class="footer">
               <p><strong>Bot Inmobiliario</strong> - Sistema Automático de Registro de Propiedades</p>
               <p>Este email fue generado automáticamente el ${new Date().toLocaleString('es-CO')}</p>
               <p>Para consultas técnicas, contactar al administrador del sistema</p>
           </div>
       </div>
   </body>
   </html>`;
 }
}

module.exports = { EmailService };