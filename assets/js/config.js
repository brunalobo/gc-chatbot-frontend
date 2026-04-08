// API Configuration
// Para desenvolvimento local, use: http://localhost:3000/api
// Para produção, atualize com a URL do servidor em produção

export const CONFIG = {
  API_URL: window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'
    : '/api', // Em produção, use um proxy reverso ou URL completa
  
  // Configuração de timeouts
  REQUEST_TIMEOUT: 30000, // 30 segundos
  
  // Azure AI Agent Reference (atualizar com seu ID real)
  AGENT_REFERENCE: 'default-agent-id',
  
  // Outras configurações podem ser adicionadas aqui
  ENABLE_DEBUG: true,
};

export default CONFIG;
