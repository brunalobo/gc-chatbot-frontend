from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Dict
from azure.identity import DefaultAzureCredential
from azure.ai.projects import AIProjectClient
from azure.storage.blob import BlobServiceClient
import os
import re
import io
import httpx
from urllib.parse import quote
from dotenv import load_dotenv
from pathlib import Path

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
            sas = SAS_TOKEN.lstrip('?')
            account_url_with_sas = f"{base_account_url}?{sas}"
            blob_service_client = BlobServiceClient(account_url=account_url_with_sas)
            print(f"✓ Blob Storage client initialized (SAS): {STORAGE_ACCOUNT_NAME}")

        elif ACCESS_KEY:
            blob_service_client = BlobServiceClient(account_url=base_account_url, credential=ACCESS_KEY)
            print(f"✓ Blob Storage client initialized (access key): {STORAGE_ACCOUNT_NAME}")

        else:
            # Fall back to DefaultAzureCredential (Managed Identity / CLI / Visual Studio credentials)
            blob_service_client = BlobServiceClient(account_url=base_account_url, credential=DefaultAzureCredential())
            print(f"✓ Blob Storage client initialized (DefaultAzureCredential): {STORAGE_ACCOUNT_NAME}")

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

    formatted_text = re.sub(
        r"【[^】]+†source[^】]*】", replace_citation, text
    )

    return formatted_text.strip()


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

        # Get OpenAI client
        openai_client = project_client.get_openai_client()

        # Reference the agent to get a response
        response = openai_client.responses.create(
            input=[{"role": "user", "content": last_user_message}],
            extra_body={"agent": {"name": agent.name, "type": "agent_reference"}},
        )

        response_text = (
            response.output_text or "Desculpe, não consegui gerar uma resposta."
        )

        # DEBUG: Ver o texto original
        print(f"\n=== RESPOSTA ORIGINAL ===")
        print(response_text[:500])
        print(f"\n=== FIM (primeiros 500 chars) ===\n")

        # Formatar a resposta para melhor legibilidade
        formatted_response = format_agent_response(response_text)
        
        print(f"\n=== RESPOSTA FORMATADA ===")
        print(formatted_response[:500])
        print(f"\n=== FIM (primeiros 500 chars) ===\n")

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


@app.get("/api/download/{filename:path}")
async def download_file(filename: str):
    """
    Download de arquivo do Azure Blob Storage usando SAS
    """
    try:
        if not STORAGE_ACCOUNT_NAME:
            raise HTTPException(
                status_code=503, 
                detail="Blob Storage não configurado. Configure AZURE_STORAGE_ACCOUNT_NAME no .env"
            )
        
        # Remover caracteres perigosos do filename
        safe_filename = filename.replace("..", "").strip("/")
        
        # Construir URL do blob
        base_url = f"https://{STORAGE_ACCOUNT_NAME}.blob.core.windows.net/{STORAGE_CONTAINER_NAME}/{safe_filename}"
        
        # Se temos SAS token, adicionar à URL
        SAS_TOKEN = os.getenv("AZURE_STORAGE_SAS_TOKEN", "")
        if SAS_TOKEN:
            sas = SAS_TOKEN.lstrip('?')
            blob_url = f"{base_url}?{sas}"
            print(f"📥 Downloading with SAS: {safe_filename}")
        else:
            # Sem SAS, tentar usar o blob_service_client (Managed Identity / Access Key)
            if not blob_service_client:
                raise HTTPException(
                    status_code=503,
                    detail="Nenhuma credencial configurada (SAS, Access Key ou DefaultAzureCredential)"
                )
            
            blob_client = blob_service_client.get_blob_client(
                container=STORAGE_CONTAINER_NAME,
                blob=safe_filename
            )
            
            if not blob_client.exists():
                raise HTTPException(
                    status_code=404,
                    detail=f"Arquivo '{safe_filename}' não encontrado"
                )
            
            blob_data = blob_client.download_blob()
            content = blob_data.readall()
            properties = blob_client.get_blob_properties()
            content_type = properties.content_settings.content_type or "application/octet-stream"
            
            return StreamingResponse(
                io.BytesIO(content),
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_filename.split("/")[-1]}"'
                }
            )
        
        # Download via HTTP usando SAS
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(blob_url)
            
            if response.status_code == 404:
                raise HTTPException(
                    status_code=404,
                    detail=f"Arquivo '{safe_filename}' não encontrado no storage"
                )
            elif response.status_code != 200:
                raise HTTPException(
                    status_code=response.status_code,
                    detail=f"Erro ao acessar blob (status {response.status_code}): {response.text[:200]}"
                )
            
            content_type = response.headers.get("content-type", "application/octet-stream")
            
            return StreamingResponse(
                io.BytesIO(response.content),
                media_type=content_type,
                headers={
                    "Content-Disposition": f'attachment; filename="{safe_filename.split("/")[-1]}"'
                }
            )
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error downloading file: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Erro ao baixar arquivo: {str(e)}"
        )


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

    print(f"\n🚀 Starting server on http://localhost:{PORT}")
    print(f"📝 API docs available at http://localhost:{PORT}/docs")
    print(f"🔗 Azure AI Endpoint: {ENDPOINT if ENDPOINT else 'NOT SET'}")
    print(f"🤖 Agent Name: {AGENT_NAME}\n")

    uvicorn.run(app, host="0.0.0.0", port=PORT)
