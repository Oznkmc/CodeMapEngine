import unittest
from backend.app.graph.builder import GraphBuilder


class GraphBuilderTests(unittest.TestCase):
    def test_adds_nodes_from_parsed_data(self):
        builder = GraphBuilder()
        dummy_data = {
            "classes": ["UserService", "OrderModel"],
            "functions": ["create_user", "delete_order"]
        }
        builder.add_parsed_data(dummy_data)

        # İlişkileri kuralım (API -> Veritabanı Modeli / Sınıf)
        builder.add_relationship("create_user", "UserService", relation_type="calls")
        builder.add_relationship("delete_order", "OrderModel", relation_type="modifies")

        summary = builder.get_graph_summary()

        # 4 düğüm ve 2 ilişki (edge) olmalı
        self.assertEqual(summary["nodes"], 4)
        self.assertEqual(summary["edges"], 2)

        print("\n--- Graf Özeti ---")
        print("Düğümler:", summary["node_list"])
        print("İlişkiler (Kenarlar):", summary["edge_list"])

    def test_blast_radius_calculation(self):
        builder = GraphBuilder()

        # 1. Düğümleri Sisteme Yükle
        dummy_data = {
            "classes": ["UserModel", "UserService"],
            "functions": ["create_user", "get_user"]
        }
        builder.add_parsed_data(dummy_data)

        # 2. Üç Katmanlı Mimari İlişkisini Kur (API -> Servis -> Veritabanı)
        builder.add_relationship("create_user", "UserService", relation_type="calls")
        builder.add_relationship("get_user", "UserService", relation_type="calls")
        builder.add_relationship("UserService", "UserModel", relation_type="uses")

        # 3. Zafiyet Yayılımı (Contagion) Simülasyonunu Başlat
        # "UserModel tablosunda bir kolon silinirse kimler etkilenir?"
        affected_by_model = builder.get_affected_nodes("UserModel")

        # "UserService iş mantığında bir hata çıkarsa kimler etkilenir?"
        affected_by_service = builder.get_affected_nodes("UserService")

        print("\n--- API ImpactGuard (Blast-Radius) Simülasyonu ---")
        print(f"UserModel değişirse etkilenecek (çökecek) yapılar: {affected_by_model}")
        print(f"UserService değişirse etkilenecek (çökecek) yapılar: {affected_by_service}")

        # 4. Doğrulamalar
        self.assertIn("UserService", affected_by_model)
        self.assertIn("create_user", affected_by_model)
        self.assertIn("get_user", affected_by_model)

        self.assertIn("get_user", affected_by_service)
        self.assertNotIn("UserModel", affected_by_service)

    def test_cognitive_overload_pruning(self):
        builder = GraphBuilder()

        # 1. Sisteme karmaşık bir yapı yüklüyoruz (İlgili ve İlgisiz düğümler bir arada)
        dummy_data = {
            "classes": ["UserModel", "UserService", "PaymentModel", "PaymentService"],
            "functions": ["create_user", "process_payment"]
        }
        builder.add_parsed_data(dummy_data)

        # 2. İlişkileri kuralım
        # Kullanıcı Modülü Zinciri (Blast-Radius içinde kalacaklar)
        builder.add_relationship("create_user", "UserService", relation_type="calls")
        builder.add_relationship("UserService", "UserModel", relation_type="uses")

        # Ödeme Modülü Zinciri (İlgisiz kısım, budanması gerekiyor)
        builder.add_relationship("process_payment", "PaymentService", relation_type="calls")
        builder.add_relationship("PaymentService", "PaymentModel", relation_type="uses")

        # Budamadan önceki düğüm sayısını kontrol edelim (Toplam 6 düğüm olmalı)
        self.assertEqual(builder.get_graph_summary()["nodes"], 6)

        # 3. Akıllı Budama (Pruning) İşlemini Başlat
        builder.prune_unaffected_nodes("UserModel")

        summary_after_pruning = builder.get_graph_summary()
        remaining_nodes = [node[0] for node in summary_after_pruning["node_list"]]

        print("\n--- Bilişsel Yük Yönetimi (Pruning) Simülasyonu ---")
        print(f"Budamadan sonra kalan düğümler (Sadece odaklanılması gerekenler): {remaining_nodes}")

        # 4. Doğrulamalar
        self.assertEqual(summary_after_pruning["nodes"], 3)
        self.assertIn("UserModel", remaining_nodes)
        self.assertIn("UserService", remaining_nodes)
        self.assertIn("create_user", remaining_nodes)

        # İlgisiz ödeme (Payment) modülü grafikten tamamen silinmiş olmalı
        self.assertNotIn("PaymentModel", remaining_nodes)
        self.assertNotIn("PaymentService", remaining_nodes)
        self.assertNotIn("process_payment", remaining_nodes)


# Çalıştırma bloğu en altta, girintisiz:
if __name__ == "__main__":
    unittest.main()