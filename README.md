# Chatbot Frontend - Gestão do Conhecimento

Frontend da aplicação de chatbot OceanPact usando Azure AI.

## 📁 Estrutura do Projeto

```
gc-chatbot-frontend/
├── index.html              # Página principal
├── assets/
│   ├── css/                # Estilos
│   ├── js/                 # Scripts JavaScript
│   │   ├── config.js       # Configurações da API
│   │   └── chat.js         # Lógica do chatbot
│   └── img/                # Imagens
├── .env.example            # Exemplo de configuração
├── package.json            # Dependências npm
├── vite.config.js          # Configuração do Vite
└── README.md
```

## 🚀 Configuração

### 1. Backend
O backend deve estar rodando separadamente em: `C:\Codes\gc-chatbot-backend`

Certifique-se de que o servidor está ativo e acessível em `http://localhost:3000`

### 2. Configuração da API

O arquivo `frontend/assets/js/config.js` controla a URL da API:

- **Desenvolvimento Local**: Automaticamente usa `http://localhost:3000/api`
- **Produção**: Configure conforme necessário

Para personalizar, edite o arquivo `config.js`:

```javascript
const CONFIG = {
  API_URL: 'http://localhost:3000/api',  // URL do backend
  REQUEST_TIMEOUT: 30000,                 // Timeout em ms
  ENABLE_DEBUG: true,                     // Modo debug
};
```

## 🖥️ Como Executar

### Desenvolvimento

```bash
# Instalar dependências (primeira vez)
npm install

# Iniciar servidor de desenvolvimento (Hot Reload)
npm run dev
```

O Vite abrirá automaticamente em `http://localhost:5173`

### Build para Produção

```bash
# Gerar build otimizado
npm run build

# Preview do build de produção
npm run preview
```

Os arquivos otimizados serão gerados na pasta `dist/`

### Outras opções (sem Vite)

#### Servidor HTTP Simples (Python)
```bash
python -m http.server 8000
```
Acesse: `http://localhost:8000`

#### Live Server (VS Code)
1. Instale a extensão "Live Server"
2. Clique direito no `index.html`
3. Selecione "Open with Live Server"

## 🔗 Repositórios Relacionados

- **Backend**: `C:\Codes\gc-chatbot-backend`
  - Servidor Flask com Azure AI
  - Porta: 3000
  - API: `/api/*`

## 🛠️ Tecnologias

- **Vite** - Build tool e dev server
- HTML5, CSS3, JavaScript (ES6 Modules)
- Marked.js (renderização de Markdown)
- Azure AD (autenticação)

## 📝 Notas

- O frontend faz chamadas REST para o backend
- Suporta autenticação via Microsoft/Azure AD
- Interface responsiva e moderna
- Renderiza respostas em Markdown

## 🔧 Troubleshooting

### Erro de CORS
Se encontrar erros de CORS, verifique se:
1. O backend está rodando
2. A configuração de CORS está habilitada no backend
3. A URL da API está correta no `config.js`

### Backend não responde
- Verifique se o backend está rodando: `http://localhost:3000`
- Confira os logs do servidor backend
- Verifique as variáveis de ambiente do backend (.env)
