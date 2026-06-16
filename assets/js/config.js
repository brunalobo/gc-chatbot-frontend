// API Configuration
// Para desenvolvimento local, use: http://localhost:3000/api
// Para produção, atualize com a URL do servidor em produção

const CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api', // Em produção, use um proxy reverso ou URL completa
  
  // Configuração de timeouts
  REQUEST_TIMEOUT: 30000, // 30 segundos
  
  // Azure AI Agent Reference (atualizar com seu ID real)
  AGENT_REFERENCE: 'default-agent-id',
  
  // ========== AUTENTICAÇÃO MICROSOFT/AZURE AD ==========
  // Chaves públicas de identificação fornecidas pelo TI
  MICROSOFT_CLIENT_ID: '2bafacb4-5e31-4f69-84c1-930bd6e67053', 
  MICROSOFT_TENANT_ID: '0642f02d-fac6-4b75-a65c-110a5c024f78',
  
  // Outras configurações podem ser adicionadas aqui
  ENABLE_DEBUG: true,
};

export default CONFIG;