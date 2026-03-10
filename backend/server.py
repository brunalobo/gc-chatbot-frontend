from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict, Optional
from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.storage.blob import BlobServiceClient, BlobSasPermissions, generate_blob_sas
import os
import re
import io
import httpx
from urllib.parse import quote
from dotenv import load_dotenv
from pathlib import Path
from datetime import datetime, timedelta

# Load environment variables
load_dotenv()

app = FastAPI(title="GC Chatbot API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Azure AI Project configuration
ENDPOINT = os.getenv("AZURE_AIPROJECT_ENDPOINT")
AGENT_NAME = os.getenv("AZURE_AGENT_NAME", "ocp-gestaoconhecimento")
PORT = int(os.getenv("PORT", 3000))

# Azure Blob Storage configuration
STORAGE_ACCOUNT_NAME = os.getenv("AZURE_STORAGE_ACCOUNT_NAME")
STORAGE_CONTAINER_NAME = os.getenv("AZURE_STORAGE_CONTAINER_NAME", "knowledge-base")

# Initialize Azure AI Project Client
project_client = None
agent = None
blob_service_client = None

try:
    project_client = AIProjectClient(
        endpoint=ENDPOINT,
        credential=DefaultAzureCredential(),
    )
    # Get the agent
    agent = project_client.agents.get(agent_name=AGENT_NAME)
    print(f"✓ Retrieved agent: {agent.name}")
except Exception as e:
    print(f"✗ Failed to initialize Azure AI client: {e}")

# Initialize Blob Storage Client
SAS_TOKEN = os.getenv("AZURE_STORAGE_SAS_TOKEN")
ACCESS_KEY = os.getenv("AZURE_STORAGE_ACCESS_KEY")

if STORAGE_ACCOUNT_NAME:
    try:
        base_account_url = f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net"

        if SAS_TOKEN:
            # Accept SAS with or without leading '?'
            sas = SAS_TOKEN.lstrip("?")
            account_url_with_sas = f"{base_account_url}?{sas}"
            blob_service_client = BlobServiceClient(account_url=account_url_with_sas)
            print(f"✓ Blob Storage client initialized (SAS): {STORAGE_ACCOUNT_NAME}")

        elif ACCESS_KEY:
            blob_service_client = BlobServiceClient(
                account_url=base_account_url, credential=ACCESS_KEY
            )
            print(
                f"✓ Blob Storage client initialized (access key): {STORAGE_ACCOUNT_NAME}"
            )

        else:
            # Fall back to DefaultAzureCredential (Managed Identity / CLI / Visual Studio credentials)
            blob_service_client = BlobServiceClient(
                account_url=base_account_url, credential=DefaultAzureCredential()
            )
            print(
                f"✓ Blob Storage client initialized (DefaultAzureCredential): {STORAGE_ACCOUNT_NAME}"
            )

    except Exception as e:
        print(f"✗ Failed to initialize Blob Storage client: {e}")
else:
    print("⚠ Blob Storage not configured (AZURE_STORAGE_ACCOUNT_NAME not set)")


# Pydantic models
class Message(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    messages: List[Message]
    sessionId: str = None


class ChatResponse(BaseModel):
    message: Message


class BlobSasRequest(BaseModel):
    blob_name: str
    expiry_hours: Optional[int] = 1


class BlobSasResponse(BaseModel):
    sas_url: str
    expires_at: str


# Função para gerar SAS token para um blob específico
def generate_blob_sas_token(blob_name: str, expiry_hours: int = 1) -> str:
    """
    Gera um SAS token temporário para um blob específico

    Args:
        blob_name: Nome do blob (caminho completo dentro do container)
        expiry_hours: Duração em horas do SAS token (padrão: 1 hora)

    Returns:
        URL completa com SAS token
    """
    if not STORAGE_ACCOUNT_NAME or not STORAGE_CONTAINER_NAME:
        raise ValueError("Configuração do Blob Storage não encontrada")

    # Verificar se temos access key (necessário para gerar SAS)
    if not ACCESS_KEY:
        raise ValueError(
            "AZURE_STORAGE_ACCESS_KEY é necessário para gerar SAS tokens. "
            "Configure no arquivo .env"
        )

    # Definir permissões (apenas leitura)
    permissions = BlobSasPermissions(read=True)

    # Definir tempo de expiração
    expiry_time = datetime.utcnow() + timedelta(hours=expiry_hours)

    # Gerar o SAS token
    sas_token = generate_blob_sas(
        account_name=STORAGE_ACCOUNT_NAME,
        container_name=STORAGE_CONTAINER_NAME,
        blob_name=blob_name,
        account_key=ACCESS_KEY,
        permission=permissions,
        expiry=expiry_time,
    )

    # Construir URL completa
    blob_url = (
        f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net/"
        f"{STORAGE_CONTAINER_NAME}/{blob_name}?{sas_token}"
    )

    return blob_url


# Função para formatar a resposta do agente
def format_agent_response(text: str) -> str:
    """
    Limpa a resposta do agente removendo apenas as citações do Azure AI Search
    O resto da formatação é feita pelo marked.js no frontend
    """
    if not text:
        return text

    # Apenas substituir citações do Azure AI Search por referências simples
    # Ex: 【5:1†source】 vira [ref-1]
    citation_counter = 1

    def replace_citation(match):
        nonlocal citation_counter
        result = f"^{citation_counter}^"
        citation_counter += 1
        return result

    formatted_text = re.sub(r"【[^】]+†source[^】]*】", replace_citation, text)

    return formatted_text.strip()


# Função para processar menções a arquivos PDF e adicionar links de download
def add_download_links(text: str) -> str:
    """
    Detecta menções a arquivos .pdf no texto e adiciona links de download
    Substitui links genéricos do agente por links de download funcionais
    """
    if not text or not STORAGE_ACCOUNT_NAME:
        return text

    # Padrão 1: Detectar "Arquivo: nome_do_arquivo.pdf" (formato que o agente usa)
    # Suporta nomes com espaços, underscores, hífens e acentos


    arquivo_pattern = r"(Arquivo:\s*)([A-Za-zÀ-ÿ0-9_\-\s]+\.pdf)"

    def replace_arquivo(match):
        prefix = match.group(1)
        filename = match.group(2).strip()
        download_url = f"/api/download/{quote(filename)}"
        return f"{prefix}[📄 {filename}]({download_url})"

    # Só gera link para a linha 'Arquivo: Nome_do_arquivo.pdf'
    text = re.sub(arquivo_pattern, replace_arquivo, text, flags=re.IGNORECASE)

    return text


# Endpoints
@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    try:
        if not project_client or not agent:
            raise HTTPException(
                status_code=500, detail="Azure AI client not initialized"
            )

        if not request.messages:
            raise HTTPException(status_code=400, detail="Messages array is required")

        # Get the last user message
        user_messages = [m for m in request.messages if m.role == "user"]
        if not user_messages:
            raise HTTPException(status_code=400, detail="No user message found")

        last_user_message = user_messages[-1].content

        print(f"\n📨 PERGUNTA DO USUÁRIO: {last_user_message}")

        # Get OpenAI client
        openai_client = project_client.get_openai_client()

        # Preparar histórico de mensagens (apenas mensagens do usuário e assistente, sem system)
        conversation_input = [
            {"role": msg.role, "content": msg.content}
            for msg in request.messages
            if msg.role in ["user", "assistant"]
        ]

        print(f"📋 Enviando {len(conversation_input)} mensagens no histórico")

        # Reference the agent to get a response (passando histórico completo)
        print(f"🤖 Chamando agente: {agent.name}")
        response = openai_client.responses.create(
            input=conversation_input,
            extra_body={"agent": {"name": agent.name, "type": "agent_reference"}},
        )

        response_text = (
            response.output_text or "Desculpe, não consegui gerar uma resposta."
        )

        # Filtrar mensagens de status indesejadas
        # Se a resposta for apenas aviso de busca, rejeitar
        status_messages = [
            "i'll search",
            "vou buscar",
            "irei buscar",
            "aguarde",
            "please wait",
            "searching",
            "procurando",
            "buscando",
            "let me find",
            "wait while i",
            "retrieving",
            "recuperando",
        ]

        response_lower = response_text.lower().strip()

        # Se a resposta é curta e contém apenas mensagem de status, é inválida
        if len(response_text) < 150 and any(
            msg in response_lower for msg in status_messages
        ):
            print(f"⚠️ RESPOSTA INVÁLIDA (mensagem de status): {response_text}")
            # Tentar novamente ou retornar erro
            response_text = "O assistente não retornou resultados. Por favor, reformule sua pergunta."

        # DEBUG: Ver o objeto completo da resposta
        print(f"\n=== OBJETO RESPONSE ===")
        print(f"Type: {type(response)}")
        print(f"Dir: {[attr for attr in dir(response) if not attr.startswith('_')]}")

        # Verificar se há citações ou documentos referenciados
        if hasattr(response, "citations"):
            print(f"📚 Citações encontradas: {response.citations}")
        if hasattr(response, "context"):
            print(f"📝 Contexto: {response.context}")
        if hasattr(response, "model_dump"):
            print(f"📦 Response dump: {response.model_dump()}")

        # DEBUG: Ver o texto original
        print(f"\n=== RESPOSTA ORIGINAL ===")
        print(response_text[:1000] if len(response_text) > 1000 else response_text)
        print(f"\n=== FIM ===\n")

        # Formatar a resposta para melhor legibilidade
        formatted_response = format_agent_response(response_text)

        # Adicionar links de download para PDFs mencionados
        formatted_response = add_download_links(formatted_response)

        print(f"\n=== RESPOSTA FORMATADA (COM LINKS) ===")
        print(
            formatted_response[:1000]
            if len(formatted_response) > 1000
            else formatted_response
        )
        print(f"\n=== FIM ===\n")

        return ChatResponse(
            message=Message(role="assistant", content=formatted_response)
        )

    except HTTPException:
        raise
    except Exception as e:
        print(f"Error calling Azure AI Agent: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Failed to get response from AI: {str(e)}"
        )


@app.post("/api/blob/generate-sas", response_model=BlobSasResponse)
async def generate_sas_url(request: BlobSasRequest):
    """
    Gera uma URL com SAS token temporário para um blob específico

    O SAS token permite download direto do blob por um período limitado (padrão: 1 hora)
    """
    try:
        # Validar configuração
        if not STORAGE_ACCOUNT_NAME or not STORAGE_CONTAINER_NAME:
            raise HTTPException(status_code=503, detail="Blob Storage não configurado")

        if not ACCESS_KEY:
            raise HTTPException(
                status_code=503,
                detail="AZURE_STORAGE_ACCESS_KEY não configurada. SAS tokens requerem access key.",
            )

        # Limpar o nome do blob
        safe_blob_name = request.blob_name.replace("..", "").strip("/")

        # Validar duração (máximo 24 horas)
        expiry_hours = min(request.expiry_hours, 24)

        # Gerar SAS URL
        sas_url = generate_blob_sas_token(safe_blob_name, expiry_hours)

        # Calcular tempo de expiração
        expires_at = (
            datetime.utcnow() + timedelta(hours=expiry_hours)
        ).isoformat() + "Z"

        print(f"🔑 SAS gerado para: {safe_blob_name} (expira em {expiry_hours}h)")

        return BlobSasResponse(sas_url=sas_url, expires_at=expires_at)

    except HTTPException:
        raise
    except Exception as e:
        print(f"Erro ao gerar SAS: {str(e)}")
        raise HTTPException(
            status_code=500, detail=f"Erro ao gerar SAS token: {str(e)}"
        )


@app.get("/api/download/{filename:path}")
async def download_file(filename: str):
    """
    Download de arquivo do Azure Blob Storage usando SAS dinâmico
    Tenta variações do nome (com espaços e underscores) para encontrar o arquivo
    """
    try:
        if not STORAGE_ACCOUNT_NAME:
            raise HTTPException(status_code=503, detail="Blob Storage não configurado")

        safe_filename = filename.replace("..", "").strip("/")

        # Listar blobs do container
        blob_list = []
        if blob_service_client:
            container_client = blob_service_client.get_container_client(
                STORAGE_CONTAINER_NAME
            )
            blob_list = [blob.name for blob in container_client.list_blobs()]

        # Normalizar nomes para busca fuzzy
        import unicodedata

        found_blob = None
        print(f"Download solicitado: '{safe_filename}'")
        for blob_name in blob_list:
            # Busca pelo nome do arquivo em qualquer subpasta
            if blob_name.split("/")[-1] == safe_filename:
                found_blob = blob_name
                print(f"Blob encontrado: '{found_blob}'")
                break

        if not found_blob:
            print(f"Blob não encontrado para: '{safe_filename}'")
            raise HTTPException(
                status_code=404, detail=f"Arquivo não encontrado: {safe_filename}"
            )

        sas_url = generate_blob_sas_token(found_blob, expiry_hours=1)
        print(f"SAS gerado para: '{found_blob}' -> {sas_url}")
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(sas_url)
            print(f"Status download: {response.status_code} ({found_blob})")
            if response.status_code == 200:
                print(f"Download OK: '{found_blob}'")
                return StreamingResponse(
                    io.BytesIO(response.content),
                    media_type=response.headers.get("content-type", "application/pdf"),
                    headers={
                        "Content-Disposition": f'attachment; filename="{found_blob.split("/")[-1]}"'
                    },
                )
            else:
                print(f"Erro no download: '{found_blob}'")
                raise HTTPException(
                    status_code=404,
                    detail=f"Arquivo não encontrado ou erro no download: {found_blob}",
                )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro: {str(e)}")


@app.get("/api/health")
async def health():
    return {
        "status": "ok",
        "timestamp": __import__("datetime").datetime.now().isoformat(),
        "agentName": AGENT_NAME,
        "endpoint": "Configured" if ENDPOINT else "NOT SET",
        "agentStatus": "Connected" if agent else "NOT CONNECTED",
        "blobStorage": "Configured" if blob_service_client else "NOT CONFIGURED",
    }


# Serve static files
frontend_path = Path(__file__).parent.parent / "frontend"
root_path = Path(__file__).parent.parent

# Mount static directories
if frontend_path.exists():
    app.mount("/frontend", StaticFiles(directory=str(frontend_path)), name="frontend")


@app.get("/")
async def root():
    index_path = root_path / "index.html"
    if index_path.exists():
        return FileResponse(str(index_path))
    return {"message": "GC Chatbot API", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn

    print(f"\n Starting server on http://localhost:{PORT}")
    print(f" API docs available at http://localhost:{PORT}/docs")
    print(f"Azure AI Endpoint: {ENDPOINT if ENDPOINT else 'NOT SET'}")
    print(f"Agent Name: {AGENT_NAME}\n")

    uvicorn.run(app, host="0.0.0.0", port=PORT)

# Endpoint de streaming SSE para chat
from fastapi.responses import StreamingResponse
import json
import asyncio

@app.post("/api/chat/stream")
async def chat_stream(request: ChatRequest):
    if not project_client or not agent:
        raise HTTPException(status_code=500, detail="Azure AI client not initialized")
    if not request.messages:
        raise HTTPException(status_code=400, detail="Messages array is required")
    user_messages = [m for m in request.messages if m.role == "user"]
    if not user_messages:
        raise HTTPException(status_code=400, detail="No user message found")
    conversation_input = [
        {"role": msg.role, "content": msg.content}
        for msg in request.messages
        if msg.role in ["user", "assistant"]
    ]
    def sse_event(data):
        return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"
    async def event_generator():
        try:
            openai_client = project_client.get_openai_client()
            stream = openai_client.responses.create(
                input=conversation_input,
                stream=True,
                extra_body={
                    "agent": {
                        "name": agent.name,
                        "type": "agent_reference"
                    }
                },
                timeout=180,
            )
            full_text = ""
            for event in stream:
                if hasattr(event, 'type') and event.type == "response.output_text.delta":
                    delta = event.delta
                    if delta:
                        full_text += delta
                        yield sse_event({"type": "delta", "content": delta})
                elif hasattr(event, 'type') and event.type == "response.completed":
                    break
            if not full_text:
                full_text = "Desculpe, não consegui gerar uma resposta."
            status_messages = [
                "i'll search", "vou buscar", "irei buscar", "aguarde",
                "please wait", "searching", "procurando", "buscando",
                "let me find", "wait while i", "retrieving", "recuperando"
            ]
            response_lower = full_text.lower().strip()
            if len(full_text) < 150 and any(msg in response_lower for msg in status_messages):
                full_text = "O assistente não retornou resultados. Por favor, reformule sua pergunta."
            formatted_response = format_agent_response(full_text)
            formatted_response = add_download_links(formatted_response)
            yield sse_event({"type": "done", "content": formatted_response})
        except Exception as e:
            yield sse_event({"type": "error", "content": f"Erro: {str(e)}"})
    return StreamingResponse(event_generator(), media_type="text/event-stream")