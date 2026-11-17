import os
import tempfile
from git import Repo

class GitFetcher:
    @staticmethod
    def clone_repository(repo_url: str) -> str:
        """
        Kullanıcıdan gelen GitHub URL'sini alır, işletim sisteminin 
        geçici (temp) dizinine klonlar ve indirilen klasörün yolunu döndürür.
        """
        try:
            # Her analiz için benzersiz, geçici bir klasör oluşturuyoruz
            temp_dir = tempfile.mkdtemp(prefix="codemap_repo_")
            print(f"[*] İndiriliyor: {repo_url}")
            print(f"[*] Hedef Klasör: {temp_dir}")
            
            # Projeyi bu geçici klasöre klonluyoruz
            Repo.clone_from(repo_url, temp_dir)
            print("[+] Klonlama başarılı!")
            
            return temp_dir
        except Exception as e:
            raise Exception(f"GitHub Reposu klonlanırken hata oluştu: {str(e)}")