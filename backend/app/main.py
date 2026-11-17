from fastapi import FastAPI
from pydantic import BaseModel
from typing import List, Dict
from fastapi.middleware.cors import CORSMiddleware
from backend.app.git_fetcher import GitFetcher
# Yazdığımız asıl motoru (GraphBuilder) API'ye dahil ediyoruz
from backend.app.graph.builder import GraphBuilder
from backend.app.code_parser import CodeParser # 1. YENİ EKLENEN SATIR
app = FastAPI(
    title="CodeMap Engine API",
    description="API ImpactGuard & Statik Kod Analiz Motoru",
    version="1.0.0"
)

# ==========================================
# CORS GÜVENLİK AYARLARI
# ==========================================
# React uygulamamızın (Frontend) adreslerine özel izin veriyoruz
origins=[
     "http://localhost:5173",  # React geliştirme sunucusu
     "http://127.0.0.1:5173"   # React geliştirme sunucusu (alternatif)

]
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ==========================================
# PYDANTIC ŞEMALARI (Gelen Veri Kalıpları)
# ==========================================
class RelationshipParams(BaseModel):
    source: str
    target: str
    relation_type: str = "uses"

class AnalyzeRequest(BaseModel):
    repo_url: str
    target_node: str = "" # Kullanıcı boş bırakabilir

# ==========================================
# API UÇ NOKTALARI (Endpoints)
# ==========================================
@app.get("/api/health")
def health_check():
    """Sunucu durumunu kontrol eder."""
    return {"status": "ok", "message": "CodeMap Engine API başarıyla çalışıyor!"}

@app.post("/api/analyze")
def analyze_impact(request: AnalyzeRequest):
    try:
        # 1. Projeyi İndir
        repo_path = GitFetcher.clone_repository(request.repo_url)
        
        # 2. Gerçek Kodları Tree-sitter ile Oku
        parser = CodeParser()
        parsed_data, relationships = parser.parse_directory(repo_path)
        
        # 3. Grafiği Oluştur (Boru Hattına Besle)
        builder = GraphBuilder()
        builder.add_parsed_data(parsed_data)
        for rel in relationships:
            builder.add_relationship(rel["source"], rel["target"], rel["relation_type"])
            
        # KULLANICI BİR DÜĞÜM HEDEFLEDİYSE BUDAMA YAP!
        if request.target_node:
            builder.prune_unaffected_nodes(request.target_node)
        
        return {
            "message": f"Repo başarıyla analiz edildi!",
            "graph_data": builder.get_graph_summary()
        }
    except Exception as e:
        import traceback
        traceback.print_exc()  # YENİ EKLENDİ: Hatayı tüm detaylarıyla terminale kırmızı yazar
        return {"message": f"Hata Oluştu: {str(e)}", "graph_data": None}