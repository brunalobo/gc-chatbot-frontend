# Como fazer Build e Deploy

## Desenvolvimento Local

Para executar o projeto em modo de desenvolvimento:
```bash
npm run dev
```

Isso abrirá o projeto em `http://localhost:5173`

## Build para Produção

Para criar o build otimizado para deploy:
```bash
npm run build
```

Isso criará uma pasta `dist/` com todos os arquivos otimizados e prontos para deploy.

## Preview do Build

Para testar o build localmente antes do deploy:
```bash
npm run preview
```

## Deploy

Após executar `npm run build`, você pode fazer deploy da pasta `dist/` em qualquer serviço de hospedagem estática:

### Opções de Deploy:

1. **Vercel** (Recomendado)
   - Instale: `npm install -g vercel`
   - Execute: `vercel --prod`

2. **Netlify**
   - Instale: `npm install -g netlify-cli`
   - Execute: `netlify deploy --prod --dir=dist`

3. **GitHub Pages**
   - Faça commit da pasta `dist/`
   - Configure o GitHub Pages para usar a pasta `dist/`

4. **Servidor próprio**
   - Faça upload do conteúdo da pasta `dist/` para seu servidor
   - Configure o servidor web (Apache, Nginx, etc.) para servir os arquivos

## Backend

Lembre-se que o backend Python (FastAPI) precisa ser hospedado separadamente. Você precisará:

1. Atualizar a URL da API em `frontend/assets/js/chat.js` para apontar para o servidor de produção
2. Fazer deploy do backend em um serviço como:
   - Azure App Service
   - Heroku
   - Railway
   - Render
   - DigitalOcean

## Variáveis de Ambiente

Configure as variáveis de ambiente no servidor de produção:
- Crie um arquivo `.env` no backend com as credenciais do Azure
- Atualize a URL da API no frontend para o endpoint de produção
